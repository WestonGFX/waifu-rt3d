"""Twenty Questions game engine for the In-App Mini Games feature (A2).

Architecture:
    - Game state is deterministic Python: the secret thing, questions asked,
      remaining guesses, and win/loss result.
    - LLM is called only for: choosing the secret thing, answering yes/no
      questions in-character, and generating final reveal dialogue.
    - Stored in ``game_sessions.game_state`` as JSON.

State schema::

    {
        "thing":         str,   # what the AI is thinking of (hidden from client)
        "category":      str,   # broad category hint ("person", "place", "thing")
        "questions":     [{"q": str, "a": str}],  # asked so far
        "remaining":     int,   # questions left (starts at LIMIT)
        "won":           bool | None,  # None = still playing
        "finished":      bool,
        "reveal":        str | None,  # farewell/reveal dialogue from AI
    }
"""

from __future__ import annotations

import json
import logging
import random
from typing import Any

logger = logging.getLogger(__name__)

LIMIT = 20  # maximum yes/no questions allowed

# Default pool of secret things used as a fallback if LLM fails to choose
_FALLBACK_THINGS = [
    ("Mount Fuji", "place"),
    ("Ramen", "thing"),
    ("Totoro", "person"),
    ("Cherry blossom", "thing"),
    ("Tokyo Tower", "place"),
    ("Samurai", "person"),
    ("Origami crane", "thing"),
    ("Shinkansen", "thing"),
    ("Anime", "thing"),
    ("Kitsune", "person"),
]


def choose_thing(topic: str, adapter, cfg: dict) -> tuple[str, str]:
    """Ask the LLM to secretly think of something for the player to guess.

    Args:
        topic: Broad category hint to guide the LLM (e.g. "anime characters").
        adapter: Active LLM adapter.
        cfg: App config dict.

    Returns:
        ``(thing, category)`` tuple where ``category`` is one of
        "person", "place", or "thing".

    Example:
        >>> thing, cat = choose_thing("Japanese culture", adapter, cfg)
        >>> cat in ("person", "place", "thing")
        True
    """
    prompt = (
        f"You are playing 20 Questions. Think of ONE specific {topic} to be guessed.\n"
        "Return ONLY a JSON object: "
        '{"thing": "exact name", "category": "person|place|thing"}\n'
        "Pick something well-known but not too obvious. No explanations."
    )
    try:
        text = adapter.complete(
            prompt,
            system="You are a 20 Questions game host. Respond only with valid JSON.",
            **cfg.get("llm_kwargs", {}),
        )
        text = text.strip()
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        data = json.loads(text)
        thing = str(data.get("thing", "")).strip()
        category = str(data.get("category", "thing")).strip().lower()
        if category not in ("person", "place", "thing"):
            category = "thing"
        if thing and len(thing) >= 3:
            return thing, category
    except Exception as e:
        logger.warning("[20Q] LLM thing selection failed: %s", e)

    # Fallback: pick a random preset
    thing, category = random.choice(_FALLBACK_THINGS)
    return thing, category


def answer_question(state: dict, question: str, adapter, cfg: dict) -> str:
    """Generate a yes/no answer for the player's question.

    The LLM answers based on the secret ``thing`` stored in state.  The
    answer is appended to ``state["questions"]`` and ``state["remaining"]``
    is decremented.  If the limit is reached, ``state["finished"]`` is set
    True with ``state["won"] = False``.

    Args:
        state: Current game state (mutated in place).
        question: The yes/no question asked by the player.
        adapter: Active LLM adapter.
        cfg: App config dict.

    Returns:
        The yes/no (or "sort of") answer string spoken by the AI character.

    Example:
        >>> answer = answer_question(state, "Is it a place?", adapter, cfg)
        >>> isinstance(answer, str)
        True
    """
    thing = state["thing"]
    history_lines = "\n".join(
        f"Q: {q['q']}\nA: {q['a']}" for q in state["questions"]
    )

    prompt = (
        f"You are playing 20 Questions. You are thinking of: **{thing}**\n\n"
        f"Questions asked so far:\n{history_lines or '(none yet)'}\n\n"
        f"New question: {question}\n\n"
        "Answer with ONLY 'Yes', 'No', or 'Sort of' followed by at most one"
        " short sentence of elaboration (max 12 words). Stay in character as"
        " a playful companion."
    )
    answer = "I'm not sure…"
    try:
        answer = adapter.complete(
            prompt,
            system="You are playing 20 Questions. Answer truthfully and briefly.",
            **cfg.get("llm_kwargs", {}),
        )
        answer = answer.strip()
    except Exception as e:
        logger.warning("[20Q] LLM answer failed: %s", e)
        # Deterministic fallback based on simple keyword matching
        q_lower = question.lower()
        if any(kw in q_lower for kw in ("place", "location", "country", "city")):
            answer = "Yes!" if state["category"] == "place" else "No!"
        elif any(kw in q_lower for kw in ("person", "human", "character", "fictional")):
            answer = "Yes!" if state["category"] == "person" else "No!"
        else:
            answer = "Hmm, I'll say no…"

    state["questions"].append({"q": question, "a": answer})
    state["remaining"] -= 1
    if state["remaining"] <= 0:
        state["finished"] = True
        state["won"] = False
        state["reveal"] = f"You ran out of questions! I was thinking of **{thing}**."

    return answer


def process_guess(state: dict, guess: str, adapter, cfg: dict) -> dict:
    """Evaluate the player's guess against the secret thing.

    A guess is considered correct if it fuzzy-matches the secret thing
    (case-insensitive substring check). Correct guesses end the game
    immediately (win). Wrong guesses cost one question turn — the game
    only ends on a wrong guess if no questions remain.

    Args:
        state: Current game state (mutated in place).
        guess: The player's guess string.
        adapter: Active LLM adapter.
        cfg: App config dict.

    Returns:
        Updated state dict. On correct guess: ``won=True, finished=True``.
        On wrong guess with questions remaining: game continues.
        On wrong guess with no questions left: ``won=False, finished=True``.

    Example:
        >>> state = process_guess(state, "Mount Fuji", adapter, cfg)
        >>> state["won"] in (True, False, None)
        True
    """
    thing = state["thing"]
    won = _fuzzy_match(guess, thing)

    if won:
        # Correct guess — game over, player wins
        state["won"] = True
        state["finished"] = True

        try:
            reveal = adapter.complete(
                f"The player just correctly guessed '{thing}' in 20 Questions!"
                " React with genuine surprise and delight in 1-2 short sentences."
                " Be playful and warm.",
                system="You are a playful AI companion playing 20 Questions. React briefly.",
                **cfg.get("llm_kwargs", {}),
            )
            state["reveal"] = reveal.strip()
        except Exception as e:
            logger.warning("[20Q] LLM reaction failed: %s", e)
            state["reveal"] = f"Yes! You got it — I was thinking of **{thing}**! Amazing!"

    else:
        # Wrong guess — costs one question turn but game continues
        state["questions"].append({"q": f"Guess: {guess}", "a": "Nope, that's not it!"})
        state["remaining"] -= 1

        if state["remaining"] <= 0:
            # Out of questions — game over, player loses
            state["won"] = False
            state["finished"] = True
            try:
                reveal = adapter.complete(
                    f"The player ran out of guesses in 20 Questions. They last guessed "
                    f"'{guess}' but you were thinking of '{thing}'."
                    " Reveal the answer warmly with playful teasing in 1-2 sentences.",
                    system="You are a playful AI companion playing 20 Questions. React briefly.",
                    **cfg.get("llm_kwargs", {}),
                )
                state["reveal"] = reveal.strip()
            except Exception as e:
                logger.warning("[20Q] LLM reaction failed: %s", e)
                state["reveal"] = f"Not quite! I was thinking of **{thing}**. Better luck next time!"
        else:
            # Generate a hint/tease reaction for the wrong guess
            try:
                reveal = adapter.complete(
                    f"The player guessed '{guess}' but you are thinking of '{thing}'."
                    " Give a brief playful 'nope!' reaction in 1 short sentence."
                    " Do NOT reveal the answer.",
                    system="You are a playful AI companion playing 20 Questions. React briefly without spoilers.",
                    **cfg.get("llm_kwargs", {}),
                )
                state["reveal"] = reveal.strip()
            except Exception:
                state["reveal"] = "Nope! Keep trying~"

    return state


def new_state(topic: str, thing: str, category: str) -> dict[str, Any]:
    """Create a fresh 20 Questions game state.

    Args:
        topic: Category label displayed to the player.
        thing: The secret thing the AI is thinking of.
        category: Broad category ("person", "place", or "thing").

    Returns:
        Initial game state dict.

    Example:
        >>> state = new_state("anime", "Totoro", "person")
        >>> state["remaining"] == LIMIT
        True
    """
    return {
        "thing": thing,
        "category": category,
        "topic": topic,
        "questions": [],
        "remaining": LIMIT,
        "won": None,
        "finished": False,
        "reveal": None,
    }


def public_state(state: dict) -> dict:
    """Return a copy of the state safe to send to the client.

    Strips the ``thing`` field so the player cannot see the answer.

    Args:
        state: Full game state dict.

    Returns:
        State dict with ``thing`` replaced by a masked placeholder.

    Example:
        >>> pub = public_state(state)
        >>> pub["thing"] == "???"
        True
    """
    pub = dict(state)
    pub["thing"] = "???"
    return pub


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _fuzzy_match(guess: str, thing: str) -> bool:
    """Return True if ``guess`` is close enough to ``thing``.

    Args:
        guess: Player's guess string.
        thing: The secret thing.

    Returns:
        True if the guess matches or closely approximates the thing.
    """
    g = guess.strip().lower()
    t = thing.strip().lower()
    # Exact match
    if g == t:
        return True
    # Remove common articles / punctuation before comparison
    for article in ("the ", "a ", "an "):
        g = g.removeprefix(article)
        t = t.removeprefix(article)
    if g == t:
        return True
    # Word-level subset match (e.g. "fuji" matches "mount fuji")
    g_words = set(g.split())
    t_words = set(t.split())
    if g_words and t_words and (g_words.issubset(t_words) or t_words.issubset(g_words)):
        # Only allow subset match if the shorter side has 2+ chars per word
        shorter = g_words if len(g_words) <= len(t_words) else t_words
        if all(len(w) >= 3 for w in shorter):
            return True
    return False
