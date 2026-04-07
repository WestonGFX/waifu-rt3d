"""Milestone tracking and XP event logging for the Bond Progression System.

This module handles two complementary concerns:

1. **Milestone recording** — persisting and querying named bond events such as
   level-ups, tier ceremonies, story unlocks, and expression unlocks into the
   ``bond_milestones`` table (created by schema migration v67).  Milestones are
   idempotent: the same ``(char_id, milestone_key)`` pair is only ever recorded
   once, preventing duplicates across restarts or repeated XP grants.

2. **XP event logging** — appending raw XP grant records to the
   ``bond_xp_events`` table so callers can surface a history feed ("earned +5 XP
   for voice chat") and analytics downstream.

All public functions accept an open ``sqlite3.Cursor`` and leave transaction
control entirely to the caller.  ``OperationalError`` raised by a missing table
(e.g. schema not yet migrated to v67) is handled gracefully: inserts return
``False``/``None`` and queries return empty collections, so the rest of the
application continues working on older schemas.

Typical call sequence from the bond XP pipeline::

    result = add_bond_xp(char_id, cur, xp=5, source="message")
    if result["leveled_up"]:
        newly = check_and_record_unlocks(
            char_id,
            old_level=result["new_level"] - 1,
            new_level=result["new_level"],
            cur=cur,
        )
    record_xp_event(char_id, xp=5, action="message",
                    multiplier=1.0, source_detail=None, cur=cur)
"""

from __future__ import annotations

import logging
import sqlite3
from typing import Any

# Import the unlock table from the sibling module.  ``UNLOCK_TABLE`` is keyed
# by integer bond level and maps to a list of unlock entry dicts.  Each entry
# has at minimum: "type" (str), "key" (str), "label" (str).
try:
    from backend.bond.unlocks import UNLOCK_TABLE  # type: ignore[import]
except ImportError:  # unlocks.py may not exist yet during early development
    UNLOCK_TABLE: dict[int, list[dict[str, Any]]] = {}

logger = logging.getLogger(__name__)


# ── Public API ────────────────────────────────────────────────────────────────


def record_milestone(
    char_id: int,
    milestone_type: str,
    milestone_key: str,
    bond_level: int,
    cur: sqlite3.Cursor,
) -> bool:
    """Insert a bond milestone record, ignoring duplicates.

    Uses ``INSERT OR IGNORE`` so the same ``(char_id, milestone_key)`` pair is
    silently skipped if it already exists — milestones are one-time events per
    character.

    Args:
        char_id: Primary key of the character that achieved the milestone.
        milestone_type: Category of milestone.  One of ``"level_up"``,
            ``"tier_up"``, ``"story_unlock"``, or ``"expression_unlock"``.
        milestone_key: Unique slug for the milestone, e.g. ``"level_5"`` or
            ``"tier_acquaintance"``.  Combined with ``char_id`` forms the
            uniqueness constraint.
        bond_level: Bond level at which the milestone was achieved.  Stored for
            display purposes and ordering.
        cur: Active ``sqlite3.Cursor``.  The caller is responsible for
            committing or rolling back the transaction.

    Returns:
        ``True`` if a new row was inserted, ``False`` if the milestone already
        existed for this character or if the table is missing.

    Example:
        >>> inserted = record_milestone(
        ...     char_id=1,
        ...     milestone_type="level_up",
        ...     milestone_key="level_5",
        ...     bond_level=5,
        ...     cur=cur,
        ... )
        >>> inserted
        True
        >>> # Second call for the same char/key is a no-op
        >>> record_milestone(1, "level_up", "level_5", 5, cur)
        False
    """
    try:
        cur.execute(
            """
            INSERT OR IGNORE INTO bond_milestones
                (char_id, milestone_type, milestone_key, bond_level)
            VALUES (?, ?, ?, ?)
            """,
            (char_id, milestone_type, milestone_key, bond_level),
        )
        inserted = cur.rowcount == 1
        if inserted:
            logger.info(
                "Milestone recorded: char_id=%d type=%r key=%r level=%d",
                char_id,
                milestone_type,
                milestone_key,
                bond_level,
            )
        return inserted
    except sqlite3.OperationalError as exc:
        logger.warning(
            "record_milestone: bond_milestones table missing (schema < v67?): %s",
            exc,
        )
        return False


def get_milestones(
    char_id: int,
    cur: sqlite3.Cursor,
    include_unviewed_only: bool = False,
) -> list[dict[str, Any]]:
    """Retrieve bond milestones for a character.

    Returns a list of dicts representing rows from ``bond_milestones``.
    Results are ordered by ``bond_level ASC, achieved_at ASC`` so callers
    receive them in the chronological order they were earned.

    Args:
        char_id: Primary key of the character to query.
        cur: Active ``sqlite3.Cursor``.
        include_unviewed_only: When ``True``, only return milestones where
            ``viewed = 0`` (i.e. milestones the user has not yet acknowledged).
            Defaults to ``False`` (all milestones).

    Returns:
        List of dicts, one per milestone row, each containing:
            - ``id`` (int): Auto-increment row id.
            - ``char_id`` (int): Character primary key.
            - ``milestone_type`` (str): Category slug.
            - ``milestone_key`` (str): Unique slug.
            - ``bond_level`` (int): Level at which this was achieved.
            - ``achieved_at`` (str): ISO-8601 timestamp string.
            - ``viewed`` (int): ``0`` = unviewed, ``1`` = viewed.
        Returns an empty list if the table is missing.

    Example:
        >>> milestones = get_milestones(char_id=1, cur=cur)
        >>> all("milestone_key" in m for m in milestones)
        True
        >>> unread = get_milestones(char_id=1, cur=cur, include_unviewed_only=True)
        >>> all(m["viewed"] == 0 for m in unread)
        True
    """
    try:
        query = """
            SELECT id, char_id, milestone_type, milestone_key,
                   bond_level, achieved_at, viewed
              FROM bond_milestones
             WHERE char_id = ?
        """
        params: list[Any] = [char_id]

        if include_unviewed_only:
            query += " AND viewed = 0"

        query += " ORDER BY bond_level ASC, achieved_at ASC"

        cur.execute(query, params)
        rows = cur.fetchall()
    except sqlite3.OperationalError as exc:
        logger.warning(
            "get_milestones: bond_milestones table missing (schema < v67?): %s",
            exc,
        )
        return []

    return [
        {
            "id": row[0],
            "char_id": row[1],
            "milestone_type": row[2],
            "milestone_key": row[3],
            "bond_level": row[4],
            "achieved_at": row[5],
            "viewed": row[6],
        }
        for row in rows
    ]


def mark_milestone_viewed(milestone_id: int, cur: sqlite3.Cursor) -> bool:
    """Mark a specific milestone as viewed by the user.

    Sets ``viewed = 1`` on the milestone row identified by ``milestone_id``.
    Used by the UI after displaying a milestone notification to the user so
    it is not surfaced again.

    Args:
        milestone_id: Primary key (``id``) of the milestone row to mark.
        cur: Active ``sqlite3.Cursor``.  Caller controls the transaction.

    Returns:
        ``True`` if the row was found and updated, ``False`` if no row with
        that id exists (or if the table is missing).

    Example:
        >>> ok = mark_milestone_viewed(milestone_id=42, cur=cur)
        >>> ok
        True
    """
    try:
        cur.execute(
            "UPDATE bond_milestones SET viewed = 1 WHERE id = ?",
            (milestone_id,),
        )
        updated = cur.rowcount == 1
        if not updated:
            logger.debug(
                "mark_milestone_viewed: no row found for milestone_id=%d",
                milestone_id,
            )
        return updated
    except sqlite3.OperationalError as exc:
        logger.warning(
            "mark_milestone_viewed: bond_milestones table missing (schema < v67?): %s",
            exc,
        )
        return False


def check_and_record_unlocks(
    char_id: int,
    old_level: int,
    new_level: int,
    cur: sqlite3.Cursor,
) -> list[dict[str, Any]]:
    """Record milestones for all unlocks gained in a level range.

    Iterates over each level from ``old_level + 1`` to ``new_level``
    (inclusive) and consults ``UNLOCK_TABLE`` from ``backend.bond.unlocks``
    for any unlock entries defined at that level.  Each entry that results in
    a successful ``record_milestone`` call is included in the returned list.

    Unlock-type to milestone-type mapping:

    - ``"ceremony"`` → ``milestone_type="tier_up"``, key from entry.
    - ``"story"`` → ``milestone_type="story_unlock"``, key from entry.
    - ``"expression"`` → ``milestone_type="expression_unlock"``, key from entry.
    - anything else → ``milestone_type="level_up"``, key = ``"level_{level}"``.

    A generic ``"level_up"`` milestone with key ``"level_{level}"`` is always
    recorded for each traversed level even when no additional unlock entries
    exist for that level, so every level-up is captured in the milestone log.

    Args:
        char_id: Primary key of the character that levelled up.
        old_level: Bond level *before* the XP grant.  Processing begins at
            ``old_level + 1``.
        new_level: Bond level *after* the XP grant (inclusive upper bound).
        cur: Active ``sqlite3.Cursor``.  Caller controls the transaction.

    Returns:
        List of dicts for each milestone that was *newly* recorded (i.e.
        ``record_milestone`` returned ``True``).  Each dict contains:
            - ``type`` (str): Milestone type slug.
            - ``key`` (str): Milestone key slug.
            - ``level`` (int): Bond level at which this was earned.
            - ``label`` (str): Human-readable label from the unlock entry, or
              a generated label for plain level-up milestones.

    Example:
        >>> newly = check_and_record_unlocks(
        ...     char_id=1, old_level=4, new_level=5, cur=cur
        ... )
        >>> len(newly) >= 1  # at minimum a level_up milestone for level 5
        True
    """
    newly_recorded: list[dict[str, Any]] = []

    for level in range(old_level + 1, new_level + 1):
        # Always record a generic level-up milestone for this level.
        level_key = f"level_{level}"
        level_label = f"Reached bond level {level}"
        if record_milestone(char_id, "level_up", level_key, level, cur):
            newly_recorded.append(
                {
                    "type": "level_up",
                    "key": level_key,
                    "level": level,
                    "label": level_label,
                }
            )

        # Process entries from the unlock table for this level.
        for entry in UNLOCK_TABLE.get(level, []):
            entry_type: str = entry.get("type", "")
            entry_key: str = entry.get("key", f"unlock_{level}")
            entry_label: str = entry.get("label", entry_key)

            if entry_type == "ceremony":
                milestone_type = "tier_up"
                milestone_key = entry_key
            elif entry_type == "story":
                milestone_type = "story_unlock"
                milestone_key = entry_key
            elif entry_type == "expression":
                milestone_type = "expression_unlock"
                milestone_key = entry_key
            else:
                # Unknown entry types fall through as level_up variants; use
                # the entry key so they don't collide with the generic one.
                milestone_type = "level_up"
                milestone_key = entry_key

            if record_milestone(char_id, milestone_type, milestone_key, level, cur):
                newly_recorded.append(
                    {
                        "type": milestone_type,
                        "key": milestone_key,
                        "level": level,
                        "label": entry_label,
                    }
                )

    return newly_recorded


def record_xp_event(
    char_id: int,
    xp_amount: int,
    action: str,
    multiplier: float,
    source_detail: str | None,
    cur: sqlite3.Cursor,
) -> None:
    """Append a raw XP grant record to the bond_xp_events log.

    Used to maintain a full audit trail of XP gains for a character.  The log
    powers the history feed shown in the UI ("earned +5 XP for voice chat") and
    can be used for analytics and abuse detection.

    This function is fire-and-forget: it never raises.  A missing table is
    logged as a warning and the call returns silently so callers don't need to
    guard against schema gaps.

    Args:
        char_id: Primary key of the character that received the XP.
        xp_amount: Integer XP awarded in this event.  May be 0 for no-op
            grants that should still be logged.
        action: Action slug that triggered the grant, e.g. ``"message"``,
            ``"gift_favorite"``, ``"daily_login"``.
        multiplier: Multiplier applied to the base XP value before this
            function was called.  Stored for audit purposes.
        source_detail: Optional free-form string providing additional context,
            e.g. ``"first message of the day"`` or a gift item name.  May be
            ``None``.
        cur: Active ``sqlite3.Cursor``.  Caller controls the transaction.

    Returns:
        ``None``.  Failures are logged and swallowed.

    Example:
        >>> record_xp_event(
        ...     char_id=1,
        ...     xp_amount=5,
        ...     action="message",
        ...     multiplier=1.0,
        ...     source_detail="daily first message bonus",
        ...     cur=cur,
        ... )
    """
    try:
        cur.execute(
            """
            INSERT INTO bond_xp_events
                (char_id, xp_amount, action, multiplier, source_detail)
            VALUES (?, ?, ?, ?, ?)
            """,
            (char_id, xp_amount, action, multiplier, source_detail),
        )
        logger.debug(
            "XP event logged: char_id=%d action=%r xp=%d multiplier=%.2f",
            char_id,
            action,
            xp_amount,
            multiplier,
        )
    except sqlite3.OperationalError as exc:
        logger.warning(
            "record_xp_event: bond_xp_events table missing (schema < v67?): %s",
            exc,
        )


def get_xp_history(
    char_id: int,
    cur: sqlite3.Cursor,
    limit: int = 50,
) -> list[dict[str, Any]]:
    """Retrieve recent XP grant events for a character.

    Queries the ``bond_xp_events`` table for the most recent entries for the
    given character, most-recent first.  The result can be used to build an
    activity feed or debug the XP pipeline.

    Args:
        char_id: Primary key of the character to query.
        cur: Active ``sqlite3.Cursor``.
        limit: Maximum number of events to return.  Defaults to ``50``.
            Pass a larger value to page through the full history.

    Returns:
        List of dicts, one per XP event, each containing:
            - ``id`` (int): Auto-increment row id.
            - ``xp_amount`` (int): XP awarded in this event.
            - ``action`` (str): Action slug.
            - ``multiplier`` (float): Multiplier applied before the grant.
            - ``source_detail`` (str | None): Optional context string.
            - ``created_at`` (str): ISO-8601 timestamp string.
        Returns an empty list if the table is missing.

    Example:
        >>> history = get_xp_history(char_id=1, cur=cur, limit=10)
        >>> all("xp_amount" in e for e in history)
        True
    """
    try:
        cur.execute(
            """
            SELECT id, xp_amount, action, multiplier, source_detail, created_at
              FROM bond_xp_events
             WHERE char_id = ?
             ORDER BY created_at DESC
             LIMIT ?
            """,
            (char_id, limit),
        )
        rows = cur.fetchall()
    except sqlite3.OperationalError as exc:
        logger.warning(
            "get_xp_history: bond_xp_events table missing (schema < v67?): %s",
            exc,
        )
        return []

    return [
        {
            "id": row[0],
            "xp_amount": row[1],
            "action": row[2],
            "multiplier": row[3],
            "source_detail": row[4],
            "created_at": row[5],
        }
        for row in rows
    ]
