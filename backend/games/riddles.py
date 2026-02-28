"""Riddles game engine for the In-App Mini Games feature (A2 expansion).

Architecture:
    - AI generates a riddle (with up to 3 progressive hints available).
    - Player has up to ``max_guesses`` attempts to guess the answer.
    - Taking a hint costs 1 point from the bonus; fewer hints = higher score.
    - LLM is used for riddle generation and end-of-game reaction.

State schema::

    {
        "riddle":       str,          # the riddle text shown to player
        "answer":       str,          # correct answer (never sent to client)
        "hints":        [str],        # up to 3 progressive hints
        "hints_used":   int,          # how many hints the player has taken
        "guesses":      [str],        # player's guesses so far
        "max_guesses":  int,          # default 3
        "won":          bool|None,
        "finished":     bool,
        "reveal":       str|None,     # LLM reaction at game end
        "category":     str,          # difficulty label ("easy"|"medium"|"hard")
    }
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any

logger = logging.getLogger(__name__)

MAX_GUESSES = 3

# Fallback riddles if LLM fails
_FALLBACK_RIDDLES = [
    {
        "riddle": "I have hands but cannot clap. I have a face but no expression. What am I?",
        "answer": "clock",
        "hints": ["I help you track time.", "You can find me on a wall.", "My hands point to numbers."],
    },
    {
        "riddle": "The more you take, the more you leave behind. What am I?",
        "answer": "footsteps",
        "hints": ["You make me when you walk.", "I'm invisible on hard floors.", "I'm in the sand on a beach."],
    },
    {
        "riddle": "I speak without a mouth and hear without ears. I have no body, but I come alive with wind. What am I?",
        "answer": "echo",
        "hints": ["I repeat things.", "Mountains are my favourite home.", "I am your own voice, returned."],
    },
]


def generate_riddle(difficulty: str, adapter, cfg: dict) -> dict:
    """Generate a riddle via LLM with progressive hints.

    Args:
        difficulty: "easy", "medium", or "hard".
        adapter: Active LLM adapter.
        cfg: App config dict.

    Returns:
        Dict with ``riddle``, ``answer``, and ``hints`` (list of 3 strings).

    Example:
        >>> r = generate_riddle("easy", adapter, cfg)
        >>> len(r["hints"]) == 3
        True
    """
    prompt = (
        f"Create a {difficulty} riddle for a fun guessing game.\n"
        "Return ONLY a JSON object:\n"
        "{\n"
        '  "riddle": "the full riddle text",\n'
        '  "answer": "the one-word or short-phrase answer",\n'
        '  "hints": ["hint 1 (vague)", "hint 2 (more specific)", "hint 3 (nearly gives it away)"]\n'
        "}\n"
        "The riddle should be clever but fair. The answer must be a common noun or concept.\n"
        "Hints should progressively narrow down the answer without revealing it directly."
    )
    try:
        text = adapter.complete(
            prompt,
            system="You are a riddle master. Respond with valid JSON only.",
            **cfg.get("llm_kwargs", {}),
        )
        text = text.strip()
        if text.startswith("```"):
            text = text.split("```")[1].lstrip("json").strip()
        data = json.loads(text)
        riddle = str(data.get("riddle", "")).strip()
        answer = str(data.get("answer", "")).strip().lower()
        hints = data.get("hints", [])
        if riddle and answer and isinstance(hints, list) and len(hints) >= 3:
            return {"riddle": riddle, "answer": answer, "hints": hints[:3]}
    except Exception as exc:
        logger.warning("[Riddles] LLM riddle generation failed: %s", exc)

    import random
    return random.choice(_FALLBACK_RIDDLES)


def new_state(riddle_data: dict, category: str = "medium") -> dict[str, Any]:
    """Create a fresh Riddles game state.

    Args:
        riddle_data: Dict with ``riddle``, ``answer``, and ``hints`` keys.
        category: Difficulty label ("easy", "medium", or "hard").

    Returns:
        Initial game state dict.

    Example:
        >>> state = new_state(riddle_data, "hard")
        >>> state["finished"]
        False
    """
    return {
        "riddle": riddle_data["riddle"],
        "answer": riddle_data["answer"],
        "hints": riddle_data["hints"],
        "hints_used": 0,
        "guesses": [],
        "max_guesses": MAX_GUESSES,
        "won": None,
        "finished": False,
        "reveal": None,
        "category": category,
    }


def take_hint(state: dict) -> str | None:
    """Reveal the next progressive hint.

    Args:
        state: Current game state (``hints_used`` incremented in place).

    Returns:
        The hint string, or None if no more hints are available.

    Example:
        >>> hint = take_hint(state)
        >>> hint is not None
        True
    """
    idx = state["hints_used"]
    if idx >= len(state["hints"]):
        return None
    state["hints_used"] += 1
    return state["hints"][idx]


def submit_guess(state: dict, guess: str, adapter, cfg: dict) -> dict:
    """Evaluate the player's guess against the riddle answer.

    Fuzzy matching is used: case-insensitive, strips articles ("the", "a", "an"),
    and accepts partial matches for multi-word answers.

    Args:
        state: Current game state (mutated in place).
        guess: Player's guess string.
        adapter: Active LLM adapter (used only for end-of-game reaction).
        cfg: App config dict.

    Returns:
        Updated state dict with ``correct`` bool indicating if the guess matched.

    Example:
        >>> state = submit_guess(state, "clock", adapter, cfg)
        >>> state["correct"]
        True
    """
    guess_clean = _normalize(guess)
    answer_clean = _normalize(state["answer"])

    correct = guess_clean == answer_clean or guess_clean in answer_clean or answer_clean in guess_clean
    state["guesses"].append(guess.strip())
    state["correct"] = correct

    if correct:
        state["won"] = True
        state["finished"] = True
        _generate_reaction(state, True, adapter, cfg)
    elif len(state["guesses"]) >= state["max_guesses"]:
        state["won"] = False
        state["finished"] = True
        _generate_reaction(state, False, adapter, cfg)

    return state


def _normalize(text: str) -> str:
    """Strip articles and punctuation, lowercase for fuzzy matching.

    Args:
        text: Input string.

    Returns:
        Normalised string.
    """
    t = text.strip().lower()
    for article in ("the ", "a ", "an "):
        t = t.removeprefix(article)
    t = re.sub(r"[^a-z0-9 ]", "", t).strip()
    return t


def _generate_reaction(state: dict, won: bool, adapter, cfg: dict) -> None:
    """Generate a short LLM end-of-game reaction.

    Args:
        state: Game state (``reveal`` field populated in place).
        won: True if player guessed correctly.
        adapter: Active LLM adapter.
        cfg: App config dict.
    """
    answer = state["answer"]
    hints_used = state["hints_used"]
    prompt = (
        f"The player just {'correctly guessed' if won else 'failed to guess'} a riddle!"
        f" The answer was '{answer}'. They used {hints_used} hint(s)."
        " Write a warm, playful 1-2 sentence reaction as an AI companion."
        " If they won with no hints, be very impressed. If they lost, be gently comforting."
    )
    try:
        state["reveal"] = adapter.complete(
            prompt,
            system="You are a playful AI companion. React briefly.",
            **cfg.get("llm_kwargs", {}),
        ).strip()
    except Exception as exc:
        logger.warning("[Riddles] LLM reaction failed: %s", exc)
        if won:
            state["reveal"] = f"You got it! ✨ The answer was **{answer}** — impressive!"
        else:
            state["reveal"] = f"The answer was **{answer}**! A tricky one~"


def public_state(state: dict) -> dict:
    """Return a client-safe copy of the state with the answer masked.

    Args:
        state: Full game state.

    Returns:
        State with ``answer`` replaced by ``"???"`` if not yet finished, and
        ``hints`` trimmed to only the hints already revealed.

    Example:
        >>> pub = public_state(state)
        >>> pub["answer"] == "???" if not state["finished"] else state["answer"]
        True
    """
    pub = dict(state)
    if not state.get("finished"):
        pub["answer"] = "???"
        # Only send hints the player has already unlocked
        pub["hints"] = state["hints"][: state["hints_used"]]
    return pub
