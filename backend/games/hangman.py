"""Hangman game engine for the In-App Mini Games feature (A2 expansion).

Architecture:
    - AI picks a secret word/phrase from a chosen category.
    - Player guesses one letter at a time; wrong guesses build the gallows.
    - LLM is called only for word selection (with fallback pool) and for
      end-of-game reaction dialogue.
    - State stored in ``game_sessions.game_state`` as JSON.

State schema::

    {
        "word":     str,          # the hidden word (never sent to client)
        "display":  str,          # e.g. "_ _ _ _" with correctly-guessed letters
        "guessed":  [str],        # all letters guessed so far (correct + wrong)
        "wrong":    [str],        # only the wrong guesses (drives gallows drawing)
        "max_wrong":int,          # typically 6
        "category": str,          # category hint shown to player
        "won":      bool|None,    # None while in progress
        "finished": bool,
        "reveal":   str|None,     # LLM reaction line at game end
    }
"""

from __future__ import annotations

import json
import logging
import random
import re
from typing import Any

logger = logging.getLogger(__name__)

MAX_WRONG = 6  # standard hangman: head, body, left arm, right arm, left leg, right leg

# Fallback word pool by category used when the LLM fails to respond
_WORD_POOL: dict[str, list[str]] = {
    "general": ["elephant", "umbrella", "fountain", "keyboard", "telescope"],
    "anime": ["naruto", "totoro", "sakura", "spirited away", "fullmetal alchemist"],
    "food": ["sushi", "ramen", "tempura", "dumplings", "mango"],
    "animals": ["penguin", "flamingo", "crocodile", "platypus", "cheetah"],
    "movies": ["interstellar", "inception", "avatar", "parasite", "gladiator"],
}


def choose_word(category: str, adapter, cfg: dict) -> tuple[str, str]:
    """Ask the LLM to choose a secret word or short phrase for the player to guess.

    Args:
        category: Broad category hint (e.g. "anime", "food", "animals").
        adapter: Active LLM adapter.
        cfg: App config dict.

    Returns:
        ``(word, category)`` where ``word`` is lowercase and may contain spaces.

    Example:
        >>> word, cat = choose_word("anime", adapter, cfg)
        >>> isinstance(word, str) and len(word) > 0
        True
    """
    prompt = (
        f"Pick ONE secret word or short phrase (max 3 words) for a Hangman game.\n"
        f"Category: {category}\n"
        "Return ONLY a JSON object: "
        '{"word": "your choice", "category": "brief category label"}\n'
        "Choose something fun but guessable. No proper nouns harder than a country name."
    )
    try:
        text = adapter.complete(
            prompt,
            system="You are a Hangman game host. Respond only with valid JSON.",
            **cfg.get("llm_kwargs", {}),
        )
        text = text.strip()
        if text.startswith("```"):
            text = text.split("```")[1].lstrip("json").strip()
        data = json.loads(text)
        word = str(data.get("word", "")).strip().lower()
        cat_label = str(data.get("category", category)).strip()
        if word and len(word) >= 3:
            return word, cat_label
    except Exception as exc:
        logger.warning("[Hangman] LLM word selection failed: %s", exc)

    # Fallback: pick from static pool
    pool = _WORD_POOL.get(category.lower(), _WORD_POOL["general"])
    word = random.choice(pool)
    return word, category


def _make_display(word: str, guessed: set[str]) -> str:
    """Build the display string showing guessed letters and blanks.

    Args:
        word: The secret word (may contain spaces).
        guessed: Set of correctly-guessed letters.

    Returns:
        Display string like ``"_ _ _  _ _ _ _"`` (space-separated,
        with double-space between original word spaces).

    Example:
        >>> _make_display("ramen", {"r", "a"})
        'r a _ _ _'
    """
    parts = []
    for ch in word:
        if ch == " ":
            parts.append(" ")  # preserve word boundaries
        elif ch in guessed:
            parts.append(ch)
        else:
            parts.append("_")
    return " ".join(parts)


def new_state(word: str, category: str) -> dict[str, Any]:
    """Create a fresh Hangman game state.

    Args:
        word: The secret word (lowercase, may contain spaces).
        category: Category hint shown to the player.

    Returns:
        Initial game state dict with empty guess history.

    Example:
        >>> state = new_state("ramen", "food")
        >>> state["finished"]
        False
    """
    return {
        "word": word,
        "display": _make_display(word, set()),
        "guessed": [],
        "wrong": [],
        "max_wrong": MAX_WRONG,
        "category": category,
        "won": None,
        "finished": False,
        "reveal": None,
    }


def guess_letter(state: dict, letter: str, adapter, cfg: dict) -> dict:
    """Process a single-letter guess and update the game state.

    Accepts only alphabetic single characters (case-insensitive).  Already-
    guessed letters are silently ignored.  Updates the gallows count on wrong
    guesses and checks win/loss conditions.

    Args:
        state: Current game state (mutated in place).
        letter: The letter the player guesses (1 character).
        adapter: Active LLM adapter (used only for end-of-game reaction).
        cfg: App config dict.

    Returns:
        Updated state dict with ``hit`` bool key indicating if the letter
        was in the word.

    Example:
        >>> state = guess_letter(state, "a", adapter, cfg)
        >>> state["hit"]  # True if 'a' is in the word
        True
    """
    letter = re.sub(r"[^a-z]", "", letter.lower())[:1]
    if not letter or letter in state["guessed"]:
        state["hit"] = False
        return state

    word = state["word"]
    state["guessed"].append(letter)

    hit = letter in word
    if hit:
        # Reveal all matching positions
        state["display"] = _make_display(word, set(state["guessed"]) - set(" "))
        state["hit"] = True
    else:
        state["wrong"].append(letter)
        state["hit"] = False

    # Check win: every non-space letter has been guessed
    word_letters = set(word.replace(" ", ""))
    guessed_set = set(state["guessed"])
    if word_letters.issubset(guessed_set):
        state["won"] = True
        state["finished"] = True
        _generate_reaction(state, True, adapter, cfg)
    elif len(state["wrong"]) >= state["max_wrong"]:
        state["won"] = False
        state["finished"] = True
        _generate_reaction(state, False, adapter, cfg)

    return state


def _generate_reaction(state: dict, won: bool, adapter, cfg: dict) -> None:
    """Generate a short LLM reaction line for game end.

    Args:
        state: Current game state (``reveal`` field populated in place).
        won: True if the player won.
        adapter: Active LLM adapter.
        cfg: App config dict.
    """
    word = state["word"]
    wrong_count = len(state["wrong"])
    prompt = (
        f"The player just {'won' if won else 'lost'} Hangman!"
        f" The word was '{word}'."
        f" They made {wrong_count} wrong guess(es)."
        " React in 1-2 short sentences as a warm, playful companion."
        " If they won, celebrate. If they lost, be gently teasing."
    )
    try:
        state["reveal"] = adapter.complete(
            prompt,
            system="You are a playful AI companion. React briefly.",
            **cfg.get("llm_kwargs", {}),
        ).strip()
    except Exception as exc:
        logger.warning("[Hangman] LLM reaction failed: %s", exc)
        if won:
            state["reveal"] = f"You got it! ✨ The word was **{word}** — well done!"
        else:
            state["reveal"] = f"Oh no! The word was **{word}**… better luck next time!"


def public_state(state: dict) -> dict:
    """Return a client-safe copy of the state with the word masked.

    Args:
        state: Full game state.

    Returns:
        State with ``word`` replaced by ``"???"`` if not yet finished.

    Example:
        >>> pub = public_state(state)
        >>> pub["word"] == "???" if not state["finished"] else state["word"]
        True
    """
    pub = dict(state)
    if not state.get("finished"):
        pub["word"] = "???"
    return pub
