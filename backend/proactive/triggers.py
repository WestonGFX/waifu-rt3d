"""Trigger evaluation for proactive AI messages.

Pure functions that decide whether a proactive message should fire based on
time-of-day schedules, user idle detection, milestone thresholds, active-hours
windows, and daily rate limits.
"""

import datetime as _dt
import sqlite3
from typing import Optional


def is_within_active_hours(hours_str: str, now: Optional[_dt.datetime] = None) -> bool:
    """Check whether the current time falls within the character's active hours.

    Args:
        hours_str: Hyphen-separated hour range, e.g. "9-22" meaning 09:00–22:00.
            Supports wrap-around ranges like "22-6" for overnight windows.
        now: Override for current time (used in tests). Defaults to datetime.now().

    Returns:
        True if current hour is within the active window (inclusive start, exclusive end).

    Example:
        >>> is_within_active_hours("9-22", datetime(2026, 1, 1, 10, 0))
        True
        >>> is_within_active_hours("9-22", datetime(2026, 1, 1, 23, 0))
        False
        >>> is_within_active_hours("22-6", datetime(2026, 1, 1, 2, 0))
        True
    """
    now = now or _dt.datetime.now()
    try:
        parts = hours_str.split("-")
        start_h = int(parts[0])
        end_h = int(parts[1])
    except (ValueError, IndexError):
        return True  # Malformed → default to always active

    current_h = now.hour
    if start_h <= end_h:
        # Normal range: 9-22 means 9 <= h < 22
        return start_h <= current_h < end_h
    else:
        # Wrap-around: 22-6 means h >= 22 OR h < 6
        return current_h >= start_h or current_h < end_h


def evaluate_time_trigger(
    time_of_day: str,
    last_triggered: Optional[str],
    now: Optional[_dt.datetime] = None,
) -> bool:
    """Decide whether a time-of-day schedule should fire right now.

    Fires when the current time is within ±5 minutes of the target and the
    schedule hasn't already fired today.

    Args:
        time_of_day: Target time as "HH:MM" (24-hour format).
        last_triggered: ISO-8601 timestamp of last trigger, or None if never fired.
        now: Override for current time (tests). Defaults to datetime.now().

    Returns:
        True if the schedule should fire.

    Example:
        >>> evaluate_time_trigger("08:00", None, datetime(2026, 1, 1, 8, 3))
        True
    """
    now = now or _dt.datetime.now()
    today_str = now.strftime("%Y-%m-%d")

    try:
        t_h, t_m = int(time_of_day[:2]), int(time_of_day[3:])
    except (ValueError, IndexError):
        return False

    target_minutes = t_h * 60 + t_m
    now_minutes = now.hour * 60 + now.minute
    diff = abs(now_minutes - target_minutes)
    diff = min(diff, 1440 - diff)  # midnight wrap-around

    in_window = diff <= 5
    already_fired_today = (
        last_triggered is not None and last_triggered.startswith(today_str)
    )
    return in_window and not already_fired_today


def evaluate_idle_trigger(
    hours_away: int,
    last_user_msg_ts: Optional[int],
    last_triggered: Optional[str],
    now: Optional[_dt.datetime] = None,
) -> bool:
    """Decide whether an idle/hours-away trigger should fire.

    Fires when the user has been away for at least ``hours_away`` hours and
    the schedule hasn't fired within the same cooldown window.

    Args:
        hours_away: Required idle hours before triggering.
        last_user_msg_ts: Unix timestamp of the user's most recent message,
            or None if the user has never sent a message to this character.
        last_triggered: ISO-8601 timestamp of last trigger, or None.
        now: Override for current time (tests). Defaults to datetime.now().

    Returns:
        True if the idle threshold is met and cooldown has elapsed.

    Example:
        >>> evaluate_idle_trigger(2, 1700000000, None, datetime.fromtimestamp(1700010000))
        True
    """
    now = now or _dt.datetime.now()
    now_ts = int(now.timestamp())
    away_secs = hours_away * 3600

    # User has been away long enough?
    if last_user_msg_ts is not None:
        if (now_ts - int(last_user_msg_ts)) < away_secs:
            return False
    # else: no messages at all → treat as "away forever"

    # Cooldown: don't re-fire within the same window
    if last_triggered is not None:
        try:
            lt_ts = int(_dt.datetime.fromisoformat(last_triggered).timestamp())
            if (now_ts - lt_ts) < away_secs:
                return False
        except ValueError:
            pass

    return True


def evaluate_milestone_triggers(char_id: int, cur: sqlite3.Cursor) -> list[str]:
    """Check for untriggered milestone conditions and return fired milestone types.

    Currently tracks:
        - ``affinity_50``: Character affinity reaches 50
        - ``affinity_80``: Character affinity reaches 80
        - ``streak_7``: 7 consecutive days of chatting
        - ``streak_30``: 30 consecutive days of chatting

    Args:
        char_id: The character's database ID.
        cur: Active SQLite cursor for queries.

    Returns:
        List of milestone type strings that should fire (empty if none).

    Example:
        >>> milestones = evaluate_milestone_triggers(5, cursor)
        >>> milestones
        ['affinity_50']
    """
    fired: list[str] = []

    # Already-triggered milestones for this character
    cur.execute(
        "SELECT milestone_type FROM proactive_milestones WHERE char_id = ? AND triggered_at IS NOT NULL",
        (char_id,),
    )
    already_done = {row[0] for row in cur.fetchall()}

    # --- Affinity milestones ---
    cur.execute("SELECT affinity FROM characters WHERE id = ?", (char_id,))
    row = cur.fetchone()
    affinity = row[0] if row and row[0] else 0.0

    if affinity >= 50 and "affinity_50" not in already_done:
        fired.append("affinity_50")
    if affinity >= 80 and "affinity_80" not in already_done:
        fired.append("affinity_80")

    # --- Streak milestones ---
    # Count distinct recent chat days (descending) to find consecutive streak
    cur.execute(
        """
        SELECT DISTINCT date(m.ts, 'unixepoch') as chat_day
        FROM messages m
        JOIN sessions s ON s.id = m.session_id
        WHERE s.character_id = ? AND m.role = 'user'
        ORDER BY chat_day DESC
        LIMIT 31
        """,
        (char_id,),
    )
    days = [row[0] for row in cur.fetchall()]

    streak = 0
    if days:
        today = _dt.date.today()
        expected = today
        for day_str in days:
            day = _dt.date.fromisoformat(day_str)
            if day == expected:
                streak += 1
                expected -= _dt.timedelta(days=1)
            elif day < expected:
                break  # Gap found

    if streak >= 7 and "streak_7" not in already_done:
        fired.append("streak_7")
    if streak >= 30 and "streak_30" not in already_done:
        fired.append("streak_30")

    return fired


def get_daily_message_count(char_id: int, cur: sqlite3.Cursor, today: Optional[str] = None) -> int:
    """Count proactive messages already sent to a character today.

    Args:
        char_id: The character's database ID.
        cur: Active SQLite cursor.
        today: Date string "YYYY-MM-DD" override for tests. Defaults to today.

    Returns:
        Number of scheduled messages triggered today for the character.

    Example:
        >>> get_daily_message_count(5, cursor)
        2
    """
    today = today or _dt.date.today().isoformat()
    cur.execute(
        """
        SELECT COUNT(*) FROM scheduled_messages
        WHERE char_id = ?
          AND date(triggered_at, 'unixepoch') = ?
        """,
        (char_id, today),
    )
    row = cur.fetchone()
    return row[0] if row else 0


def get_daily_cap(frequency: str) -> int:
    """Return the maximum daily proactive messages for a frequency tier.

    Args:
        frequency: One of "quiet", "normal", "chatty".

    Returns:
        Daily message cap: quiet=1, normal=3, chatty=5.

    Example:
        >>> get_daily_cap("chatty")
        5
    """
    caps = {"quiet": 1, "normal": 3, "chatty": 5}
    return caps.get(frequency, 3)
