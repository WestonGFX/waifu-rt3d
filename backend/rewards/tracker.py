"""Daily interaction tracking, streaks, XP, and relationship milestones.

Tracks per-character daily interaction stats (message count, XP earned,
streak day) and fires milestone events when thresholds are crossed.
Designed to be called after each successful chat response.

Relationship tiers (XP thresholds):
    stranger     →  0 XP
    acquaintance → 100 XP
    friend       → 500 XP
    close_friend → 2000 XP
    soulmate     → 10000 XP

Milestones fire on: Day 7, 30, 100, 365, tier-up, 1000 total messages.
"""

import logging
import sqlite3
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)

# ── Tier thresholds ──────────────────────────────────────────────────────────

TIER_THRESHOLDS: list[tuple[int, str]] = [
    (10000, "soulmate"),
    (2000, "close_friend"),
    (500, "friend"),
    (100, "acquaintance"),
    (0, "stranger"),
]

STREAK_MILESTONES = {7, 30, 100, 365}
MESSAGE_MILESTONES = {1000, 5000, 10000}

# XP per interaction type
XP_PER_MESSAGE = 2
XP_STREAK_BONUS = 5  # bonus per streak day (capped at 50)


def xp_for_tier(xp: int) -> str:
    """Convert total XP to relationship tier name.

    Args:
        xp: Cumulative XP for the character.

    Returns:
        Tier label string.

    Example:
        >>> xp_for_tier(750)
        'friend'
    """
    for threshold, tier in TIER_THRESHOLDS:
        if xp >= threshold:
            return tier
    return "stranger"


def record_interaction(
    con: sqlite3.Connection,
    character_id: int,
    message_count_delta: int = 1,
) -> dict:
    """Record a daily interaction and update streaks/XP.

    Call this after each successful chat response. Handles:
    - Creating or updating today's interaction_rewards row
    - Calculating streak (consecutive days with interactions)
    - Awarding XP (base + streak bonus)
    - Detecting milestones (streak days, tier-ups, message counts)
    - Updating character's current_streak, total_xp, relationship_tier

    Args:
        con: Active SQLite connection (caller manages commit).
        character_id: Character to record interaction for.
        message_count_delta: Number of messages to add (usually 1).

    Returns:
        Dict with keys: ``streak``, ``xp_earned``, ``total_xp``,
        ``tier``, ``milestones`` (list of milestone strings),
        ``tier_changed`` (bool).

    Example:
        >>> result = record_interaction(con, char_id=3)
        >>> result["streak"]
        7
        >>> result["milestones"]
        ["streak_7"]
    """
    today = datetime.now().strftime("%Y-%m-%d")
    yesterday = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
    cur = con.cursor()
    milestones: list[str] = []

    # Get current character stats
    try:
        row = cur.execute(
            "SELECT current_streak, total_xp, relationship_tier FROM characters WHERE id=?",
            (character_id,)
        ).fetchone()
    except sqlite3.OperationalError:
        # Columns don't exist yet (pre-v49)
        return {"streak": 0, "xp_earned": 0, "total_xp": 0, "tier": "stranger",
                "milestones": [], "tier_changed": False}

    if not row:
        return {"streak": 0, "xp_earned": 0, "total_xp": 0, "tier": "stranger",
                "milestones": [], "tier_changed": False}

    current_streak = row[0] or 0
    total_xp = row[1] or 0
    old_tier = row[2] or "stranger"

    # Check if already interacted today
    existing = cur.execute(
        "SELECT id, message_count, streak_day FROM interaction_rewards "
        "WHERE character_id=? AND interaction_date=?",
        (character_id, today)
    ).fetchone()

    if existing:
        # Update today's record
        new_msg_count = existing[1] + message_count_delta
        streak = existing[2]
        xp_earned = XP_PER_MESSAGE * message_count_delta
        cur.execute(
            "UPDATE interaction_rewards SET message_count=?, xp_earned=xp_earned+? WHERE id=?",
            (new_msg_count, xp_earned, existing[0])
        )
    else:
        # New day — calculate streak
        had_yesterday = cur.execute(
            "SELECT 1 FROM interaction_rewards WHERE character_id=? AND interaction_date=?",
            (character_id, yesterday)
        ).fetchone()

        streak = (current_streak + 1) if had_yesterday else 1
        streak_bonus = min(streak * XP_STREAK_BONUS, 50)
        xp_earned = XP_PER_MESSAGE * message_count_delta + streak_bonus

        cur.execute(
            "INSERT INTO interaction_rewards (character_id, interaction_date, message_count, xp_earned, streak_day) "
            "VALUES (?, ?, ?, ?, ?)",
            (character_id, today, message_count_delta, xp_earned, streak)
        )

        # Check streak milestones
        if streak in STREAK_MILESTONES:
            milestones.append(f"streak_{streak}")
            cur.execute(
                "UPDATE interaction_rewards SET milestone_hit=? "
                "WHERE character_id=? AND interaction_date=?",
                (f"streak_{streak}", character_id, today)
            )

    # Update character totals
    new_total_xp = total_xp + xp_earned
    new_tier = xp_for_tier(new_total_xp)
    tier_changed = new_tier != old_tier

    if tier_changed:
        milestones.append(f"tier_up_{new_tier}")

    cur.execute(
        "UPDATE characters SET current_streak=?, total_xp=?, relationship_tier=? WHERE id=?",
        (streak if not existing else current_streak, new_total_xp, new_tier, character_id)
    )

    # Check total message milestones
    total_msgs = cur.execute(
        "SELECT SUM(message_count) FROM interaction_rewards WHERE character_id=?",
        (character_id,)
    ).fetchone()[0] or 0
    if total_msgs in MESSAGE_MILESTONES:
        milestones.append(f"messages_{total_msgs}")

    con.commit()

    return {
        "streak": streak if not existing else current_streak,
        "xp_earned": xp_earned,
        "total_xp": new_total_xp,
        "tier": new_tier,
        "milestones": milestones,
        "tier_changed": tier_changed,
    }


def get_streak_info(con: sqlite3.Connection, character_id: int) -> dict:
    """Get current streak and XP info for a character.

    Args:
        con: Active SQLite connection.
        character_id: Character to query.

    Returns:
        Dict with ``streak``, ``total_xp``, ``tier``, ``next_tier``,
        ``xp_to_next``.
    """
    try:
        row = con.execute(
            "SELECT current_streak, total_xp, relationship_tier FROM characters WHERE id=?",
            (character_id,)
        ).fetchone()
    except sqlite3.OperationalError:
        return {"streak": 0, "total_xp": 0, "tier": "stranger",
                "next_tier": "acquaintance", "xp_to_next": 100}

    if not row:
        return {"streak": 0, "total_xp": 0, "tier": "stranger",
                "next_tier": "acquaintance", "xp_to_next": 100}

    streak = row[0] or 0
    total_xp = row[1] or 0
    tier = row[2] or "stranger"

    # Find next tier (scan from lowest threshold up, find first one above current XP)
    next_tier = None
    xp_to_next = 0
    for threshold, t in sorted(TIER_THRESHOLDS):
        if total_xp < threshold:
            next_tier = t
            xp_to_next = threshold - total_xp
            break

    if not next_tier:
        next_tier = "soulmate"
        xp_to_next = 0

    return {
        "streak": streak,
        "total_xp": total_xp,
        "tier": tier,
        "next_tier": next_tier,
        "xp_to_next": xp_to_next,
    }
