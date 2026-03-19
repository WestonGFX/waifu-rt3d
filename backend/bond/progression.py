"""Core bond progression logic for the Bond Progression System.

Manages XP accumulation, level-up detection, tier labelling, and
bond-story unlock gating.  All functions accept an open
``sqlite3.Cursor`` so callers control transaction boundaries.

Bond level formula:
    XP required for level N → (N+1):  ``N * 10 + 50``
    - Level 0 → 1:  50 XP
    - Level 10 → 11: 150 XP
    - Level 50 → 51: 550 XP
    - Level 99 → 100: 1 040 XP

Tiers:
    0–10   stranger
    11–30  friend
    31–60  close_friend
    61–90  best_friend
    91–100 soulmate

Database tables used (added in schema v56):
    character_relationships: bond_level, bond_xp, relationship_mode,
                             covenant_date columns (pre-existing table).
    bond_stories:            id, char_id, story_key, bond_level_required,
                             unlocked, unlocked_at columns.
"""

from __future__ import annotations

import logging
import sqlite3
from datetime import datetime, timezone
from typing import Any

logger = logging.getLogger(__name__)

# ── Tier boundaries (inclusive lower bound) ──────────────────────────────────

_TIERS: list[tuple[int, str]] = [
    (91, "soulmate"),
    (61, "best_friend"),
    (31, "close_friend"),
    (11, "friend"),
    (0, "stranger"),
]

# Maximum bond level
_MAX_LEVEL: int = 100

# XP per action: each value is (base_xp, bonus_per_10_levels)
# Final XP = base + (bond_level // 10) * bonus
_ACTION_TABLE: dict[str, tuple[int, int]] = {
    "message":       (2, 1),   # 2–6 XP over levels 0–100 (cap at 6)
    "gift_favorite": (15, 2),  # 15–25 XP over levels 0–100 (cap at 25)
    "gift_normal":   (5, 1),   # 5–10 XP over levels 0–100 (cap at 10)
    "gift_disliked": (1, 0),   # always 1 XP
    "daily_login":   (3, 0),   # always 3 XP
    "voice_chat":    (4, 1),   # 4–8 XP over levels 0–100 (cap at 8)
}

# Hard upper caps per action to stay in the declared ranges
_ACTION_CAPS: dict[str, int] = {
    "message":       6,
    "gift_favorite": 25,
    "gift_normal":   10,
    "gift_disliked": 1,
    "daily_login":   3,
    "voice_chat":    8,
}


# ── Internal helpers ──────────────────────────────────────────────────────────


def _xp_required_for_level(level: int) -> int:
    """Return XP needed to advance *from* ``level`` *to* ``level + 1``.

    The cost grows linearly so early levels feel fast and the final stretch
    requires sustained engagement.

    Args:
        level: Current bond level (0–99).  Returns 0 for level 100 (max).

    Returns:
        Integer XP cost for the next level transition.

    Example:
        >>> _xp_required_for_level(0)
        50
        >>> _xp_required_for_level(10)
        150
        >>> _xp_required_for_level(50)
        550
    """
    if level >= _MAX_LEVEL:
        return 0
    return level * 10 + 50


def _ensure_relationship_row(char_id: int, cur: sqlite3.Cursor) -> None:
    """Insert a default relationship row for *char_id* if none exists.

    The bond columns (bond_level, bond_xp, relationship_mode) default to 0,
    0, and 'stranger' respectively at the DB level via the v56 migration.
    This helper is a safety net for environments where the migration has not
    yet run but the table exists in its pre-v56 form.

    Args:
        char_id: Primary key of the character to ensure a row for.
        cur: Active cursor for the current transaction.
    """
    cur.execute(
        "INSERT OR IGNORE INTO character_relationships (char_id) VALUES (?)",
        (char_id,),
    )


# ── Public API ────────────────────────────────────────────────────────────────


def get_tier_name(bond_level: int) -> str:
    """Return the tier label for a given bond level.

    Tiers group bond levels into named relationship stages used in UI
    copy, prompt injection, and story gating.

    Args:
        bond_level: Integer bond level (0–100).

    Returns:
        One of ``"stranger"``, ``"friend"``, ``"close_friend"``,
        ``"best_friend"``, or ``"soulmate"``.

    Example:
        >>> get_tier_name(0)
        'stranger'
        >>> get_tier_name(50)
        'close_friend'
        >>> get_tier_name(100)
        'soulmate'
    """
    for threshold, name in _TIERS:
        if bond_level >= threshold:
            return name
    return "stranger"  # unreachable, but satisfies type checker


def get_bond_level(char_id: int, cur: sqlite3.Cursor) -> dict[str, Any]:
    """Fetch the current bond state for a character.

    Queries ``character_relationships`` for the bond columns added in v56.
    If the row is missing it is created with default values.  If the bond
    columns themselves are absent (pre-v56 schema) the function returns
    safe zero-defaults rather than raising.

    Args:
        char_id: Primary key of the character.
        cur: Active SQLite cursor.

    Returns:
        Dict with keys:
            - ``bond_level`` (int): Current level, 0–100.
            - ``bond_xp`` (int): Accumulated XP within the current level.
            - ``xp_to_next`` (int): XP still needed to reach the next
              level (0 when at max level).
            - ``tier`` (str): Relationship tier name.
            - ``relationship_mode`` (str): Free-form mode tag stored on
              the row (e.g. ``"friend"`` or ``"romantic"``).

    Example:
        >>> info = get_bond_level(char_id=1, cur=cur)
        >>> info["tier"] in ("stranger", "friend", "close_friend",
        ...                  "best_friend", "soulmate")
        True
    """
    try:
        _ensure_relationship_row(char_id, cur)
        cur.execute(
            """
            SELECT bond_level, bond_xp, relationship_mode
              FROM character_relationships
             WHERE char_id = ?
            """,
            (char_id,),
        )
        row = cur.fetchone()
    except sqlite3.OperationalError as exc:
        logger.warning(
            "get_bond_level: bond columns missing (schema < v56?): %s", exc
        )
        return {
            "bond_level": 0,
            "bond_xp": 0,
            "xp_to_next": _xp_required_for_level(0),
            "tier": "stranger",
            "relationship_mode": "friend",
        }

    if row is None:
        bond_level, bond_xp, relationship_mode = 0, 0, "friend"
    else:
        bond_level = int(row[0] or 0)
        bond_xp = int(row[1] or 0)
        relationship_mode = row[2] or "friend"

    xp_to_next = _xp_required_for_level(bond_level) - bond_xp
    if bond_level >= _MAX_LEVEL:
        xp_to_next = 0

    return {
        "bond_level": bond_level,
        "bond_xp": bond_xp,
        "xp_to_next": max(0, xp_to_next),
        "tier": get_tier_name(bond_level),
        "relationship_mode": relationship_mode,
    }


def get_xp_for_action(action: str, bond_level: int) -> int:
    """Return the XP reward for a user action, scaled by current bond level.

    Higher bond levels earn slightly more XP per action to reward sustained
    engagement without making early-game grind feel futile.

    Args:
        action: One of ``"message"``, ``"gift_favorite"``, ``"gift_normal"``,
                ``"gift_disliked"``, ``"daily_login"``, or ``"voice_chat"``.
                Unknown actions return 0.
        bond_level: Current bond level used to calculate the bonus tier
                    (increments every 10 levels).

    Returns:
        Integer XP to award.  Returns 0 for unrecognised actions.

    Example:
        >>> get_xp_for_action("message", bond_level=0)
        2
        >>> get_xp_for_action("message", bond_level=50)
        7
        >>> get_xp_for_action("gift_favorite", bond_level=100)
        25
    """
    if action not in _ACTION_TABLE:
        logger.debug("get_xp_for_action: unknown action %r — returning 0", action)
        return 0

    base, bonus_per_tier = _ACTION_TABLE[action]
    tier = bond_level // 10
    xp = base + tier * bonus_per_tier
    cap = _ACTION_CAPS.get(action, xp)
    return min(xp, cap)


def check_unlockable_stories(
    char_id: int,
    bond_level: int,
    cur: sqlite3.Cursor,
) -> list[dict[str, Any]]:
    """Find and unlock bond stories that the user has now qualified for.

    Queries ``bond_stories`` for rows where ``bond_level_required <=
    bond_level`` and ``unlocked = 0``, marks them unlocked, and returns
    the newly unlocked story dicts.  Missing table is handled gracefully.

    Args:
        char_id: Primary key of the character.
        bond_level: Current (possibly just-updated) bond level.
        cur: Active SQLite cursor.

    Returns:
        List of dicts, one per newly unlocked story:
            - ``id`` (int): Story row id.
            - ``story_key`` (str): Unique identifier for the story scene.
            - ``bond_level_required`` (int): Level threshold that was met.

    Example:
        >>> newly = check_unlockable_stories(char_id=1, bond_level=10, cur=cur)
        >>> all("story_key" in s for s in newly)
        True
    """
    try:
        cur.execute(
            """
            SELECT id, story_key, bond_level_required
              FROM bond_stories
             WHERE char_id = ?
               AND bond_level_required <= ?
               AND unlocked = 0
            """,
            (char_id, bond_level),
        )
        rows = cur.fetchall()
    except sqlite3.OperationalError as exc:
        logger.warning(
            "check_unlockable_stories: bond_stories table missing (schema < v56?): %s",
            exc,
        )
        return []

    if not rows:
        return []

    now_iso = datetime.now(timezone.utc).isoformat()
    unlocked: list[dict[str, Any]] = []

    for row_id, story_key, level_req in rows:
        cur.execute(
            """
            UPDATE bond_stories
               SET unlocked = 1, unlocked_at = ?
             WHERE id = ?
            """,
            (now_iso, row_id),
        )
        unlocked.append(
            {
                "id": row_id,
                "story_key": story_key,
                "bond_level_required": level_req,
            }
        )
        logger.info(
            "Bond story unlocked: char_id=%d story_key=%r (level %d)",
            char_id,
            story_key,
            level_req,
        )

    return unlocked


def add_bond_xp(
    char_id: int,
    cur: sqlite3.Cursor,
    xp: int,
    source: str = "message",
) -> dict[str, Any]:
    """Add XP to a character's bond level and handle level-ups.

    Accumulates XP, triggers level-up(s) when the threshold is crossed,
    and checks for newly unlocked bond stories after each level-up.  The
    function commits nothing — the caller owns the transaction.

    Args:
        char_id: Primary key of the character receiving bond XP.
        cur: Active SQLite cursor (caller manages the transaction).
        xp: Amount of XP to add.  Must be >= 0.
        source: Human-readable label for the XP source (used in logging).
                Defaults to ``"message"``.

    Returns:
        Dict with keys:
            - ``new_level`` (int): Bond level after XP was applied.
            - ``new_xp`` (int): Accumulated XP within the new level.
            - ``leveled_up`` (bool): True if at least one level was gained.
            - ``unlocked_stories`` (list[str]): ``story_key`` values for
              any bond stories that were newly unlocked.

    Example:
        >>> result = add_bond_xp(char_id=1, cur=cur, xp=50, source="message")
        >>> result["leveled_up"]
        True
        >>> result["new_level"]
        1
    """
    if xp <= 0:
        current = get_bond_level(char_id, cur)
        return {
            "new_level": current["bond_level"],
            "new_xp": current["bond_xp"],
            "leveled_up": False,
            "unlocked_stories": [],
        }

    try:
        _ensure_relationship_row(char_id, cur)
        cur.execute(
            """
            SELECT bond_level, bond_xp
              FROM character_relationships
             WHERE char_id = ?
            """,
            (char_id,),
        )
        row = cur.fetchone()
    except sqlite3.OperationalError as exc:
        logger.warning(
            "add_bond_xp: bond columns missing (schema < v56?): %s", exc
        )
        return {
            "new_level": 0,
            "new_xp": 0,
            "leveled_up": False,
            "unlocked_stories": [],
        }

    bond_level = int(row[0] or 0) if row else 0
    bond_xp = int(row[1] or 0) if row else 0
    leveled_up = False
    all_unlocked: list[str] = []

    bond_xp += xp

    # Process level-ups (may cross multiple thresholds in a single XP grant)
    while bond_level < _MAX_LEVEL:
        threshold = _xp_required_for_level(bond_level)
        if bond_xp < threshold:
            break
        bond_xp -= threshold
        bond_level += 1
        leveled_up = True
        logger.info(
            "Bond level-up: char_id=%d source=%r new_level=%d",
            char_id,
            source,
            bond_level,
        )
        # Check for unlocked stories at each new level
        newly = check_unlockable_stories(char_id, bond_level, cur)
        all_unlocked.extend(s["story_key"] for s in newly)

    # Cap XP at the threshold when at max level
    if bond_level >= _MAX_LEVEL:
        bond_xp = 0

    cur.execute(
        """
        UPDATE character_relationships
           SET bond_level = ?, bond_xp = ?
         WHERE char_id = ?
        """,
        (bond_level, bond_xp, char_id),
    )

    return {
        "new_level": bond_level,
        "new_xp": bond_xp,
        "leveled_up": leveled_up,
        "unlocked_stories": all_unlocked,
    }
