"""
MoodEngine -- computes the current mood context for a character.

Mood is a function of: time-of-day slot, session gap, affinity tier, and day_off flag.
The result is a short prefix string injected into the system prompt before each
inference call.  The prefix is invisible to the user -- it acts as "director" context
similar to an Author's Note.

Time-of-Day Slots:
    morning    (06:00--10:00)  groggy/warm, slower, mentions coffee
    afternoon  (10:00--17:00)  energetic, curious, playful
    evening    (17:00--21:00)  relaxed, reflective, more intimate
    night      (21:00--01:00)  introspective, slightly tired
    late_night (01:00--06:00)  surprised you're up, protective

Example:
    >>> from backend.mood.engine import get_mood_prefix
    >>> prefix = get_mood_prefix(char_name="Sakura", affinity=60.0)
    >>> prefix.startswith("[Mood context:")
    True
"""

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional


MOOD_PROFILES_PATH = Path(__file__).parent.parent / "config" / "mood_profiles.json"

_profiles: Optional[dict] = None


def _load_profiles() -> dict:
    """Load mood profiles from the JSON config, caching after first read.

    Returns:
        Dict mapping time-slot names to profile objects containing
        ``descriptor``, ``tone_hints``, and ``expression_hint``.

    Raises:
        FileNotFoundError: If ``mood_profiles.json`` is missing.
        json.JSONDecodeError: If the file contains invalid JSON.
    """
    global _profiles
    if _profiles is None:
        with open(MOOD_PROFILES_PATH, "r", encoding="utf-8") as f:
            _profiles = json.load(f)
    return _profiles


def _get_time_slot(hour: int) -> str:
    """Map hour (0--23) to a named time slot.

    Args:
        hour: Current hour in 24-hour format (0--23).

    Returns:
        One of ``"morning"``, ``"afternoon"``, ``"evening"``,
        ``"night"``, or ``"late_night"``.

    Example:
        >>> _get_time_slot(7)
        'morning'
        >>> _get_time_slot(23)
        'night'
        >>> _get_time_slot(3)
        'late_night'
    """
    if 6 <= hour < 10:
        return "morning"
    elif 10 <= hour < 17:
        return "afternoon"
    elif 17 <= hour < 21:
        return "evening"
    elif 21 <= hour < 24:
        return "night"
    else:  # 0--5
        return "late_night"


def get_mood_prefix(
    *,
    char_name: str,
    affinity: float = 0.0,
    last_session_ts: Optional[float] = None,
    day_off: bool = False,
    mood_enabled: bool = True,
    mood_intensity: float = 1.0,
    now: Optional[datetime] = None,
) -> str:
    """Build a short mood-context prefix for injection into the character system prompt.

    The prefix is a bracketed directive that instructs the LLM to adopt a
    time-appropriate tone without the user seeing it in the conversation.

    Args:
        char_name: Display name of the character (used in the prefix text).
        affinity: Current affinity score (0--100). Higher values produce
            warmer tone directives.
        last_session_ts: Unix timestamp of the earliest message in the
            current session, or None if unknown.  Used to detect multi-day
            gaps between conversations.
        day_off: Whether the character has the ``day_off`` flag set.
            When True an extra relaxation directive is appended.
        mood_enabled: If False, returns empty string (feature disabled).
        mood_intensity: 0.0--1.0 scale factor for how strongly mood is
            expressed.  At 0.0 returns empty; at < 0.5 skips tone hints.
        now: Override current time (for testing). Defaults to UTC now.

    Returns:
        A 1--3 sentence mood prefix string wrapped in square brackets,
        or empty string if disabled or intensity is zero.

    Example:
        >>> prefix = get_mood_prefix(char_name="Sakura", affinity=60.0)
        >>> prefix.startswith("[Mood context:")
        True
        >>> get_mood_prefix(char_name="Sakura", mood_enabled=False)
        ''
    """
    if not mood_enabled or mood_intensity <= 0.0:
        return ""

    profiles = _load_profiles()
    now = now or datetime.now(timezone.utc)
    slot = _get_time_slot(now.hour)
    profile = profiles[slot]

    parts: list[str] = [
        f"[Mood context: It is {slot.replace('_', ' ')} and {char_name} is {profile['descriptor']}."
    ]

    # Add a deterministic-per-hour tone hint (rotates daily via day offset)
    hints = profile["tone_hints"]
    hint_idx = (now.hour + now.day) % len(hints)
    if mood_intensity >= 0.5:
        parts.append(f"Right now {hints[hint_idx]}.")

    # Session gap modifier
    if last_session_ts is not None:
        gap_days = (now.timestamp() - last_session_ts) / 86400
        if gap_days > 7:
            parts.append(
                f"{char_name} has not seen you in over a week and is particularly glad you're here."
            )
        elif gap_days > 3:
            parts.append("It has been a few days since you last spoke.")

    # Day off modifier
    if day_off:
        parts.append(
            f"Today is {char_name}'s day off, so the mood is more relaxed and unhurried."
        )

    # Affinity modifier (only at high intensity to avoid clutter)
    if mood_intensity >= 0.8:
        if affinity >= 80:
            parts.append(f"{char_name} feels very close and at ease with you.")
        elif affinity <= 10:
            parts.append(f"{char_name} is still getting to know you.")

    return " ".join(parts) + "]"
