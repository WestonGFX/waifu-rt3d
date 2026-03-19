"""Gift system for the Bond Progression System.

Handles the gift catalogue (per-character items), gift-giving transactions
(recording in ``gift_history``), and gift history queries.  All functions
accept an open ``sqlite3.Cursor`` so callers control transaction boundaries.

Database tables used (added in schema v56):
    character_gifts: id, char_id, gift_name, gift_category,
                     affinity_boost, is_favorite, description.
    gift_history:    id, char_id, gift_id, given_at, xp_earned, reaction.

The reaction strings returned by :func:`give_gift` are intentionally
short — they are meant to be shown in a toast or used as seed context
for an LLM to elaborate on.
"""

from __future__ import annotations

import logging
import sqlite3
from datetime import datetime, timezone
from typing import Any

from backend.bond.progression import add_bond_xp, get_xp_for_action

logger = logging.getLogger(__name__)

# Reaction copy keyed by affinity bucket
_REACTIONS: dict[str, list[str]] = {
    "favorite": [
        "Oh! This is exactly what I wanted — thank you so much!",
        "You remembered my favourite! This means a lot to me.",
        "I love this! How did you know?",
    ],
    "normal": [
        "That's really thoughtful, thank you.",
        "Oh, a gift for me? You're sweet.",
        "Thanks! I'll put this to good use.",
    ],
    "disliked": [
        "Oh… thank you. That was kind of you to think of me.",
        "Ah, I appreciate the gesture.",
    ],
}


def _pick_reaction(is_favorite: bool, gift_category: str, gift_id: int) -> str:
    """Return a deterministic reaction string for a gift.

    Uses ``gift_id % pool_size`` so the same gift always gets the same
    reaction, avoiding the need for random state.

    Args:
        is_favorite: Whether the gift is flagged as a character favourite.
        gift_category: Category string from the DB row (e.g. ``"disliked"``).
        gift_id: Row id used for deterministic pool selection.

    Returns:
        A short reaction string.
    """
    if is_favorite:
        pool = _REACTIONS["favorite"]
    elif gift_category and gift_category.lower() == "disliked":
        pool = _REACTIONS["disliked"]
    else:
        pool = _REACTIONS["normal"]
    return pool[gift_id % len(pool)]


# ── Public API ────────────────────────────────────────────────────────────────


def get_available_gifts(char_id: int, cur: sqlite3.Cursor) -> list[dict[str, Any]]:
    """Return all gifts defined for a character.

    Queries the ``character_gifts`` table.  If the table does not yet
    exist (pre-v56 schema) an empty list is returned rather than raising.

    Args:
        char_id: Primary key of the character.
        cur: Active SQLite cursor.

    Returns:
        List of dicts, one per gift row:
            - ``id`` (int): Gift row id.
            - ``gift_name`` (str): Display name.
            - ``gift_category`` (str): Category tag (e.g. ``"accessory"``).
            - ``affinity_boost`` (float): Affinity modifier stored in DB.
            - ``is_favorite`` (bool): True if flagged as character's
              favourite gift.
            - ``description`` (str): Flavour text for the gift.

    Example:
        >>> gifts = get_available_gifts(char_id=1, cur=cur)
        >>> all("gift_name" in g for g in gifts)
        True
    """
    try:
        cur.execute(
            """
            SELECT id, gift_name, gift_category, affinity_boost,
                   is_favorite, description
              FROM character_gifts
             WHERE char_id = ?
             ORDER BY is_favorite DESC, gift_name ASC
            """,
            (char_id,),
        )
        rows = cur.fetchall()
    except sqlite3.OperationalError as exc:
        logger.warning(
            "get_available_gifts: character_gifts table missing (schema < v56?): %s",
            exc,
        )
        return []

    return [
        {
            "id": int(row[0]),
            "gift_name": row[1] or "",
            "gift_category": row[2] or "",
            "affinity_boost": float(row[3] or 0.0),
            "is_favorite": bool(row[4]),
            "description": row[5] or "",
        }
        for row in rows
    ]


def give_gift(
    char_id: int,
    gift_id: int,
    cur: sqlite3.Cursor,
) -> dict[str, Any]:
    """Record a gift transaction and award bond XP.

    Looks up the gift in ``character_gifts``, generates a reaction string,
    records a row in ``gift_history``, calculates XP based on whether the
    gift is a favourite, and calls
    :func:`~backend.bond.progression.add_bond_xp`.

    The function commits nothing — the caller owns the transaction.

    Args:
        char_id: Primary key of the character receiving the gift.
        gift_id: Row id from ``character_gifts``.
        cur: Active SQLite cursor (caller manages the transaction).

    Returns:
        Dict with keys:
            - ``reaction`` (str): Short flavour-text reaction string.
            - ``xp_earned`` (int): Bond XP awarded for this gift.
            - ``bond_update`` (dict): Result from
              :func:`~backend.bond.progression.add_bond_xp`.

    Raises:
        ValueError: If ``gift_id`` does not exist or does not belong to
                    ``char_id``.
        sqlite3.OperationalError: If ``character_gifts`` table is missing.

    Example:
        >>> result = give_gift(char_id=1, gift_id=3, cur=cur)
        >>> result["xp_earned"] > 0
        True
        >>> "reaction" in result
        True
    """
    try:
        cur.execute(
            """
            SELECT id, gift_name, gift_category, is_favorite
              FROM character_gifts
             WHERE id = ? AND char_id = ?
            """,
            (gift_id, char_id),
        )
        gift_row = cur.fetchone()
    except sqlite3.OperationalError as exc:
        logger.error("give_gift: character_gifts table missing: %s", exc)
        raise

    if gift_row is None:
        raise ValueError(
            f"Gift id={gift_id} not found for char_id={char_id}"
        )

    row_id, gift_name, gift_category, is_favorite_raw = gift_row
    is_favorite = bool(is_favorite_raw)

    # Map gift type to XP action key
    if is_favorite:
        action_key = "gift_favorite"
    elif gift_category and gift_category.lower() == "disliked":
        action_key = "gift_disliked"
    else:
        action_key = "gift_normal"

    # Fetch current bond level for XP scaling (best-effort; default 0 on error)
    try:
        cur.execute(
            "SELECT bond_level FROM character_relationships WHERE char_id = ?",
            (char_id,),
        )
        lvl_row = cur.fetchone()
        current_level = int(lvl_row[0] or 0) if lvl_row else 0
    except sqlite3.OperationalError:
        current_level = 0

    xp_earned = get_xp_for_action(action_key, current_level)
    reaction = _pick_reaction(is_favorite, gift_category or "", int(row_id))

    # Record in gift_history (best-effort — skip if table is absent)
    now_iso = datetime.now(timezone.utc).isoformat()
    try:
        cur.execute(
            """
            INSERT INTO gift_history (char_id, gift_id, given_at, xp_earned, reaction)
            VALUES (?, ?, ?, ?, ?)
            """,
            (char_id, gift_id, now_iso, xp_earned, reaction),
        )
    except sqlite3.OperationalError as exc:
        logger.warning(
            "give_gift: gift_history table missing — skipping history insert: %s",
            exc,
        )

    bond_update = add_bond_xp(char_id, cur, xp=xp_earned, source=action_key)

    logger.info(
        "Gift given: char_id=%d gift=%r action=%s xp=%d leveled_up=%s",
        char_id,
        gift_name,
        action_key,
        xp_earned,
        bond_update.get("leveled_up"),
    )

    return {
        "reaction": reaction,
        "xp_earned": xp_earned,
        "bond_update": bond_update,
    }


def get_gift_history(
    char_id: int,
    cur: sqlite3.Cursor,
    limit: int = 20,
) -> list[dict[str, Any]]:
    """Return recent gift history for a character.

    Joins ``gift_history`` with ``character_gifts`` to include gift names
    and categories alongside the transaction metadata.  If either table is
    missing (pre-v56 schema) an empty list is returned gracefully.

    Args:
        char_id: Primary key of the character.
        cur: Active SQLite cursor.
        limit: Maximum number of history rows to return, most recent first.
               Defaults to 20.

    Returns:
        List of dicts ordered newest-first:
            - ``id`` (int): History row id.
            - ``gift_id`` (int): FK to ``character_gifts``.
            - ``gift_name`` (str): Display name of the gift.
            - ``gift_category`` (str): Category tag.
            - ``is_favorite`` (bool): Whether the gift is a favourite.
            - ``xp_earned`` (int): XP awarded at the time.
            - ``reaction`` (str): Reaction text stored at time of gift.
            - ``given_at`` (str): ISO 8601 datetime string.

    Example:
        >>> history = get_gift_history(char_id=1, cur=cur, limit=5)
        >>> all("gift_name" in h for h in history)
        True
    """
    try:
        cur.execute(
            """
            SELECT gh.id,
                   gh.gift_id,
                   COALESCE(cg.gift_name, '') AS gift_name,
                   COALESCE(cg.gift_category, '') AS gift_category,
                   COALESCE(cg.is_favorite, 0) AS is_favorite,
                   gh.xp_earned,
                   gh.reaction,
                   gh.given_at
              FROM gift_history gh
              LEFT JOIN character_gifts cg ON cg.id = gh.gift_id
             WHERE gh.char_id = ?
             ORDER BY gh.id DESC
             LIMIT ?
            """,
            (char_id, limit),
        )
        rows = cur.fetchall()
    except sqlite3.OperationalError as exc:
        logger.warning(
            "get_gift_history: gift_history/character_gifts tables missing (schema < v56?): %s",
            exc,
        )
        return []

    return [
        {
            "id": int(row[0]),
            "gift_id": int(row[1]),
            "gift_name": row[2] or "",
            "gift_category": row[3] or "",
            "is_favorite": bool(row[4]),
            "xp_earned": int(row[5] or 0),
            "reaction": row[6] or "",
            "given_at": row[7] or "",
        }
        for row in rows
    ]
