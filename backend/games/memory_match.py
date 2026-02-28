"""Memory Card Match game engine for the In-App Mini Games feature (A2 expansion).

Architecture:
    - Pure deterministic state: a shuffled grid of paired cards.
    - Player flips two cards at a time; matched pairs stay revealed.
    - Score = pairs_found, with a time bonus for fast completion.
    - LLM is called only at game end for a character reaction line.
    - The frontend handles the flip animation timing; the backend validates pairs.

State schema::

    {
        "cards": [
            {"id": int, "pair": int, "emoji": str, "matched": bool},
            ...
        ],
        "size":          int,    # number of pairs (default 8 for a 4×4 grid)
        "flipped":       [int],  # indices of currently face-up unmatched cards (max 2)
        "pairs_found":   int,    # number of matched pairs so far
        "moves":         int,    # total flip attempts
        "finished":      bool,
        "won":           bool|None,
        "reaction":      str|None,
    }
"""

from __future__ import annotations

import logging
import random
from typing import Any

logger = logging.getLogger(__name__)

DEFAULT_PAIRS = 8  # 4×4 grid

# Emoji pools — themed card faces
_EMOJI_SETS: dict[str, list[str]] = {
    "nature": ["🌸", "🌺", "🌻", "🍁", "🍀", "🌙", "⭐", "🌊", "🔥", "🌈", "🦋", "🌿"],
    "food":   ["🍣", "🍜", "🍡", "🍰", "🍓", "🍊", "🍕", "🌮", "🍦", "🍩", "🥞", "🎂"],
    "animals":["🐱", "🐶", "🦊", "🐼", "🐰", "🦁", "🐸", "🦉", "🐧", "🦩", "🦋", "🐙"],
    "japan":  ["⛩️", "🗻", "🎋", "🎐", "🎑", "🏯", "🌸", "🍱", "🎎", "🎏", "🐉", "🦊"],
    "space":  ["🌙", "⭐", "🌟", "☀️", "🪐", "🌌", "🚀", "🛸", "☄️", "🌍", "🌠", "🔭"],
}


def new_state(pairs: int = DEFAULT_PAIRS, theme: str = "nature") -> dict[str, Any]:
    """Create a freshly shuffled Memory Card Match game state.

    Args:
        pairs: Number of card pairs to place on the grid (default 8).
        theme: Emoji theme name ("nature", "food", "animals", "japan", "space").

    Returns:
        Initial game state with all cards face-down and matched=False.

    Example:
        >>> state = new_state(6, "japan")
        >>> len(state["cards"]) == 12
        True
    """
    pairs = max(3, min(pairs, 12))
    emoji_pool = _EMOJI_SETS.get(theme, _EMOJI_SETS["nature"])
    emojis = random.sample(emoji_pool, min(pairs, len(emoji_pool)))
    # If more pairs requested than emojis available, cycle through
    while len(emojis) < pairs:
        emojis.extend(random.sample(emoji_pool, min(pairs - len(emojis), len(emoji_pool))))

    # Create two cards per emoji pair
    raw: list[dict] = []
    for pair_id, emoji in enumerate(emojis[:pairs]):
        raw.extend([
            {"id": pair_id * 2,     "pair": pair_id, "emoji": emoji, "matched": False},
            {"id": pair_id * 2 + 1, "pair": pair_id, "emoji": emoji, "matched": False},
        ])
    random.shuffle(raw)
    # Re-assign sequential IDs after shuffle
    for idx, card in enumerate(raw):
        card["id"] = idx

    return {
        "cards": raw,
        "size": pairs,
        "flipped": [],
        "pairs_found": 0,
        "moves": 0,
        "finished": False,
        "won": None,
        "reaction": None,
    }


def flip_card(state: dict, card_index: int, adapter, cfg: dict) -> dict:
    """Flip a card and check for a pair match.

    The backend tracks a ``flipped`` list of at most 2 currently face-up
    unmatched cards.  When the second card is flipped, this function evaluates
    the match and updates state accordingly.

    The frontend is responsible for revealing cards visually and calling this
    endpoint for each flip.

    Args:
        state: Current game state (mutated in place).
        card_index: Index into ``state["cards"]`` to flip.
        adapter: Active LLM adapter (for end-of-game reaction only).
        cfg: App config dict.

    Returns:
        Updated state dict with ``matched`` bool indicating whether the most
        recent pair was a match, and ``match_indices`` with the pair indices.

    Example:
        >>> state = flip_card(state, 3, adapter, cfg)
        >>> state["matched"]  # True if both flipped cards are a pair
        True
    """
    state.pop("matched", None)
    state.pop("match_indices", None)

    cards = state["cards"]
    if card_index < 0 or card_index >= len(cards):
        return state
    card = cards[card_index]
    if card["matched"] or card_index in state["flipped"]:
        return state
    if len(state["flipped"]) >= 2:
        # Clear previous unmatched flip before starting a new turn
        state["flipped"] = []

    state["flipped"].append(card_index)

    if len(state["flipped"]) == 2:
        state["moves"] += 1
        a_idx, b_idx = state["flipped"]
        a, b = cards[a_idx], cards[b_idx]
        if a["pair"] == b["pair"]:
            a["matched"] = True
            b["matched"] = True
            state["pairs_found"] += 1
            state["matched"] = True
            state["match_indices"] = [a_idx, b_idx]
            state["flipped"] = []
            # Check for game completion
            if state["pairs_found"] >= state["size"]:
                state["finished"] = True
                state["won"] = True
                _generate_reaction(state, adapter, cfg)
        else:
            state["matched"] = False
            state["match_indices"] = [a_idx, b_idx]
            # Leave flipped so frontend can show both before hiding
    else:
        state["matched"] = False

    return state


def _generate_reaction(state: dict, adapter, cfg: dict) -> None:
    """Generate a short LLM reaction when the game is won.

    Args:
        state: Game state (``reaction`` field populated in place).
        adapter: Active LLM adapter.
        cfg: App config dict.
    """
    moves = state["moves"]
    pairs = state["size"]
    prompt = (
        f"The player just won Memory Card Match! They found all {pairs} pairs in {moves} moves."
        " React with warm congratulations in 1-2 short sentences as a playful companion."
        " Comment on their efficiency if moves was close to the minimum (= pairs)."
    )
    try:
        state["reaction"] = adapter.complete(
            prompt,
            system="You are a playful AI companion. React briefly.",
            **cfg.get("llm_kwargs", {}),
        ).strip()
    except Exception as exc:
        logger.warning("[MemoryMatch] LLM reaction failed: %s", exc)
        state["reaction"] = f"You found all {pairs} pairs in {moves} moves! Amazing memory~ 🎉"


def public_state(state: dict) -> dict:
    """Return a client-safe copy: emoji values hidden on unmatched, unflipped cards.

    This prevents cheating by inspecting the API response.  Cards that are
    currently flipped (in ``state["flipped"]``) are temporarily visible.

    Args:
        state: Full game state.

    Returns:
        State copy with ``emoji`` set to ``"?"`` for hidden cards.

    Example:
        >>> pub = public_state(state)
        >>> pub["cards"][0]["emoji"]  # "?" if hidden
        '?'
    """
    visible = set(state["flipped"]) | {c["id"] for c in state["cards"] if c["matched"]}
    pub = dict(state)
    pub["cards"] = [
        dict(c) if (c["id"] in visible or c["matched"]) else {**c, "emoji": "?"}
        for c in state["cards"]
    ]
    return pub
