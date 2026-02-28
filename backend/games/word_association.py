"""Word Association game engine for the In-App Mini Games feature (A2 expansion).

Rules:
    - Player names a word; AI responds with a related word in-character.
    - Chain continues until: a word is repeated, the AI says the chain is broken
      (unrelated), or the max chain length is reached.
    - Score = chain length + creativity bonus (awarded by LLM judge at end).

Architecture:
    - ``next_word()`` makes one LLM call: the AI responds with a single word
      AND a verdict: ``continue`` | ``break`` | ``repeat``.
    - ``end_game()`` makes one final LLM call to award the creativity bonus
      and generate a reaction line.
    - All other logic (repeat detection, chain tracking) is deterministic.

State schema::

    {
        "chain":      [{"word": str, "by": "player"|"ai"}],
        "topic":      str,         # optional starting topic/seed
        "score":      int,         # chain length + creativity bonus
        "bonus":      int,         # bonus points from final LLM judge
        "finished":   bool,
        "won":        bool|None,   # True when chain ≥ min_length, False on break
        "reason":     str|None,    # why the chain ended
        "max_length": int,         # chain length cap (default 30)
        "min_win":    int,         # minimum chain to count as a win (default 10)
        "reaction":   str|None,    # LLM farewell line
    }
"""

from __future__ import annotations

import json
import logging
import random
from typing import Any

logger = logging.getLogger(__name__)

MAX_LENGTH = 30
MIN_WIN = 10


def new_state(topic: str = "") -> dict[str, Any]:
    """Create a fresh Word Association game state.

    Args:
        topic: Optional starting theme (e.g. "Japanese food").

    Returns:
        Initial game state dict with empty chain.

    Example:
        >>> state = new_state("anime")
        >>> state["finished"]
        False
    """
    return {
        "chain": [],
        "topic": topic or "open",
        "score": 0,
        "bonus": 0,
        "finished": False,
        "won": None,
        "reason": None,
        "max_length": MAX_LENGTH,
        "min_win": MIN_WIN,
        "reaction": None,
    }


def player_word(state: dict, word: str) -> dict:
    """Record the player's word and check for repeats.

    Args:
        state: Current game state (mutated in place).
        word: The player's submitted word (lowercase).

    Returns:
        Updated state.  If the word was already used, ``finished`` is set True.

    Example:
        >>> state = player_word(state, "ramen")
        >>> state["finished"]  # False if new word
        False
    """
    word = word.strip().lower()
    existing = {e["word"].lower() for e in state["chain"]}
    if word in existing:
        state["finished"] = True
        state["won"] = False
        state["reason"] = f"You repeated '{word}'! Chain broken."
        state["score"] = len(state["chain"])
        return state

    state["chain"].append({"word": word, "by": "player"})
    if len(state["chain"]) >= state["max_length"]:
        state["finished"] = True
        state["won"] = True
        state["reason"] = "Incredible — you hit the chain limit!"
        state["score"] = len(state["chain"])
    return state


def ai_word(state: dict, adapter, cfg: dict) -> str:
    """Generate the AI's next word in the chain.

    Args:
        state: Current game state (mutated in place).
        adapter: Active LLM adapter.
        cfg: App config dict.

    Returns:
        The word the AI chose, or an error message if the chain broke.

    Example:
        >>> word = ai_word(state, adapter, cfg)
        >>> isinstance(word, str) and len(word) > 0
        True
    """
    if state["finished"]:
        return ""

    last_words = [e["word"] for e in state["chain"][-5:]]
    used_words = {e["word"].lower() for e in state["chain"]}

    prompt = (
        "You are playing Word Association with the player.\n"
        f"Topic/theme: {state['topic']}\n"
        f"Last words in chain: {', '.join(last_words)}\n"
        "Your job: respond with ONE word that is clearly associated with the last word.\n"
        "Rules:\n"
        "- Must NOT repeat any already-used word.\n"
        "- Must be genuinely associated (not random).\n"
        "- Must be a single real word (no phrases).\n"
        "Return ONLY a JSON object:\n"
        '{"word": "your word", "verdict": "continue|break|repeat"}\n'
        "Use 'break' if you think the player's last word was unrelated to the topic/chain.\n"
        "Use 'repeat' if you would have to repeat a used word.\n"
        "Use 'continue' if the chain is healthy.\n"
        f"Already used words: {', '.join(sorted(used_words))}"
    )

    # Fallback: pick a random topic-related word from a small pool
    _fallback_words = ["spring", "blossom", "rain", "moon", "star", "cloud", "dream"]

    try:
        text = adapter.complete(
            prompt,
            system="You are playing Word Association. Respond with JSON only.",
            **cfg.get("llm_kwargs", {}),
        )
        text = text.strip()
        if text.startswith("```"):
            text = text.split("```")[1].lstrip("json").strip()
        data = json.loads(text)
        word = str(data.get("word", "")).strip().lower()
        verdict = str(data.get("verdict", "continue")).strip().lower()

        if verdict == "break":
            state["finished"] = True
            state["won"] = False
            state["reason"] = "The association broke — I couldn't follow that one!"
            state["score"] = len(state["chain"])
            return state["reason"]

        if not word or word in used_words:
            word = next((w for w in _fallback_words if w not in used_words), "dream")

    except Exception as exc:
        logger.warning("[WordAssoc] LLM failed: %s", exc)
        word = next((w for w in _fallback_words if w not in {e["word"].lower() for e in state["chain"]}), "star")
        verdict = "continue"

    state["chain"].append({"word": word, "by": "ai"})
    if len(state["chain"]) >= state["max_length"]:
        state["finished"] = True
        state["won"] = True
        state["reason"] = "We hit the chain limit together — amazing teamwork!"
        state["score"] = len(state["chain"])

    return word


def end_game(state: dict, adapter, cfg: dict) -> dict:
    """Finalise the game: award bonus points and generate a reaction.

    Called when the player chooses to stop (or the game ends naturally).

    Args:
        state: Current game state (mutated in place if not already finished).
        adapter: Active LLM adapter.
        cfg: App config dict.

    Returns:
        Final state dict with ``score``, ``bonus``, and ``reaction`` populated.

    Example:
        >>> state = end_game(state, adapter, cfg)
        >>> state["finished"]
        True
    """
    if not state["finished"]:
        chain_len = len(state["chain"])
        state["won"] = chain_len >= state["min_win"]
        state["reason"] = "You ended the chain." if state["won"] else "Chain too short."
        state["score"] = chain_len
        state["finished"] = True

    # LLM bonus scoring
    chain_words = " → ".join(e["word"] for e in state["chain"][:15])
    prompt = (
        f"Here is a Word Association chain: {chain_words}\n"
        "Rate the creativity and flow of this chain on a scale of 0-5 (integer).\n"
        "Also write a short fun reaction in 1-2 sentences as a playful companion.\n"
        "Return ONLY JSON: "
        '{"bonus": 0, "reaction": "your reaction"}'
    )
    try:
        text = adapter.complete(
            prompt,
            system="You are judging a Word Association game. Respond with JSON only.",
            **cfg.get("llm_kwargs", {}),
        )
        text = text.strip()
        if text.startswith("```"):
            text = text.split("```")[1].lstrip("json").strip()
        data = json.loads(text)
        state["bonus"] = max(0, min(5, int(data.get("bonus", 0))))
        state["score"] += state["bonus"]
        state["reaction"] = str(data.get("reaction", "")).strip()
    except Exception as exc:
        logger.warning("[WordAssoc] Final LLM judge failed: %s", exc)
        state["reaction"] = "That was a fun chain! Well played~"

    return state
