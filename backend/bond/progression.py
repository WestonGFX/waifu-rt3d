"""Core bond progression logic for the Bond Progression System.

Manages XP accumulation, level-up detection, tier labelling, and
bond-story unlock gating.  All functions accept an open
``sqlite3.Cursor`` so callers control transaction boundaries.

Bond level formula (quadratic, revised in v67):
    XP required for level N → (N+1):  ``150 + N²×0.3 + 50*N``
    - Level 0 → 1:   150 XP  (first conversation)
    - Level 4 → 5:   354 XP  (day 4-5)
    - Level 14 → 15: 908 XP  (week 2)
    - Level 34 → 35: 2,196 XP (week 4)
    - Level 64 → 65: 4,578 XP (month 2)
    - Level 99 → 100: 8,040 XP
    - Total 0 → 100: ~361,000 XP (~6-8 weeks daily use)

Tiers (5-tier model, revised in v67):
    0–4    stranger
    5–14   acquaintance
    15–34  friend
    35–64  close_friend
    65–100 soulmate

Database tables used (added in schema v56, extended in v67):
    character_relationships: bond_level, bond_xp, relationship_mode,
                             covenant_date, last_daily_bonus_date,
                             current_session_msgs, session_bonus_awarded.
    bond_stories:            id, char_id, story_key, bond_level_required,
                             unlocked, unlocked_at columns.
    bond_xp_events:          XP event log (v67).
    bond_milestones:         Milestone tracking (v67).
"""

from __future__ import annotations

import logging
import sqlite3
from datetime import datetime, timezone
from typing import Any

logger = logging.getLogger(__name__)

# ── Tier boundaries (inclusive lower bound) ──────────────────────────────────

_TIERS: list[tuple[int, str]] = [
    (65, "soulmate"),
    (35, "close_friend"),
    (15, "friend"),
    (5, "acquaintance"),
    (0, "stranger"),
]

# Maximum bond level
_MAX_LEVEL: int = 100

# XP per action: flat base values (multipliers applied externally by xp_engine)
_ACTION_TABLE: dict[str, int] = {
    "message":        5,   # Base per exchange; depth multiplier (1.0-2.5x) applied externally
    "session_bonus":  50,  # Once per session after 10+ messages
    "daily_first":    25,  # First interaction of the day
    "voice_chat":     8,   # Each voice exchange in duplex mode
    "memory_callback": 15, # Shared past referenced (detected by knowledge extractor)
    "gift_favorite":  20,  # Gift of a favorite item
    "gift_normal":    8,   # Normal gift
    "gift_disliked":  2,   # Disliked gift
}

# Hard upper caps per action to prevent exploits
_ACTION_CAPS: dict[str, int] = {
    "message":        12,  # After max depth multiplier
    "session_bonus":  50,
    "daily_first":    25,
    "voice_chat":     8,
    "memory_callback": 15,
    "gift_favorite":  20,
    "gift_normal":    8,
    "gift_disliked":  2,
}


# ── Internal helpers ──────────────────────────────────────────────────────────


def _xp_required_for_level(level: int) -> int:
    """Return XP needed to advance *from* ``level`` *to* ``level + 1``.

    Uses a quadratic curve: ``base + level² * growth + level * linear_growth``.
    Early levels are achievable in a single session while the final stretch
    requires weeks of sustained engagement (~6-8 weeks for daily users).
    Total XP 0→100: ~361,000.

    Args:
        level: Current bond level (0–99).  Returns 0 for level 100 (max).

    Returns:
        Integer XP cost for the next level transition.

    Example:
        >>> _xp_required_for_level(0)
        150
        >>> _xp_required_for_level(14)
        908
        >>> _xp_required_for_level(64)
        4578
    """
    if level >= _MAX_LEVEL:
        return 0
    base = 150
    growth = 0.3
    linear = 50
    return int(base + (level ** 2) * growth + level * linear)


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
        One of ``"stranger"``, ``"acquaintance"``, ``"friend"``,
        ``"close_friend"``, or ``"soulmate"``.

    Example:
        >>> get_tier_name(0)
        'stranger'
        >>> get_tier_name(10)
        'acquaintance'
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


def get_xp_for_action(action: str, bond_level: int = 0) -> int:
    """Return the base XP reward for a user action.

    Returns the flat base value from the action table, capped at the
    per-action maximum.  The ``bond_level`` parameter is accepted for
    backwards compatibility but no longer affects the result — multipliers
    are applied externally by the XP engine module.

    Args:
        action: One of ``"message"``, ``"session_bonus"``, ``"daily_first"``,
                ``"voice_chat"``, ``"memory_callback"``, ``"gift_favorite"``,
                ``"gift_normal"``, or ``"gift_disliked"``.
                Unknown actions return 0.
        bond_level: Accepted for API compatibility but unused.

    Returns:
        Integer base XP to award.  Returns 0 for unrecognised actions.

    Example:
        >>> get_xp_for_action("message")
        5
        >>> get_xp_for_action("session_bonus")
        50
        >>> get_xp_for_action("gift_favorite")
        20
    """
    if action not in _ACTION_TABLE:
        logger.debug("get_xp_for_action: unknown action %r — returning 0", action)
        return 0

    base = _ACTION_TABLE[action]
    cap = _ACTION_CAPS.get(action, base)
    return min(base, cap)


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
