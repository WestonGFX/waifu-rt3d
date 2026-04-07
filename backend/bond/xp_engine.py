"""XP depth multiplier and bonus calculations for the Bond Progression System.

This module provides pure, stateless functions for determining how much XP a
conversation exchange should award, and for detecting one-time bonus conditions
(daily login bonus, session-length bonus).  No database access is performed
here — callers are responsible for reading any required state from the DB and
passing it in as plain Python values.

The core insight is that *what* the user says matters as much as *how often*
they say it.  A heartfelt personal disclosure should earn more bond XP than a
one-word reply, which is expressed here as a depth multiplier on top of the
base XP value defined in ``backend/bond/progression.py``.

Typical call flow (inside a message handler):
    1. Compute ``base_xp = get_xp_for_action("message", bond_level)``
       from ``progression.py``.
    2. Call ``calculate_message_xp(user_msg, assistant_msg, char_interests,
       base_xp)`` from this module to get the adjusted XP.
    3. Call ``add_bond_xp(char_id, cur, final_xp, source="message")``
       from ``progression.py`` to persist the change.
"""

from __future__ import annotations

from datetime import datetime, timezone

# ── Sentiment / disclosure vocabulary ────────────────────────────────────────

_EMOTIONAL_KEYWORDS: frozenset[str] = frozenset(
    {
        "feel",
        "feeling",
        "felt",
        "love",
        "hate",
        "scared",
        "afraid",
        "worried",
        "happy",
        "sad",
        "angry",
        "miss",
        "remember",
        "dream",
        "hope",
        "wish",
        "trust",
        "hurt",
        "lonely",
        "grateful",
        "proud",
    }
)

_DISCLOSURE_PATTERNS: list[str] = [
    "i feel",
    "i think",
    "i remember",
    "i miss",
    "i love",
    "i'm afraid",
    "i'm worried",
    "i'm scared",
    "i've been",
    "when i was",
    "my family",
    "my dad",
    "my mom",
    "my friend",
]

# ── Constants ─────────────────────────────────────────────────────────────────

_DEPTH_MULT_MIN: float = 1.0
_DEPTH_MULT_MAX: float = 2.5
_FINAL_XP_CAP: int = 12
_SESSION_BONUS_THRESHOLD: int = 10


# ── Public functions ──────────────────────────────────────────────────────────


def calculate_depth_multiplier(user_msg: str, assistant_msg: str) -> float:
    """Score conversation depth and return an XP multiplier.

    Examines the combined text of a single message exchange for signals
    that indicate genuine emotional engagement: length, questioning,
    emotional vocabulary, and personal disclosure.  These signals stack
    additively on top of a base of 1.0, then the result is clamped to
    ``[1.0, 2.5]``.

    Scoring rules:
        - Combined message length > 600 chars: +0.5
        - Combined message length > 200 chars (and ≤ 600): +0.2
        - User message contains "?": +0.2
        - 3 or more emotional keywords detected in user message: +0.3
        - 1–2 emotional keywords detected: +0.15
        - Any personal disclosure pattern detected: +0.3

    Args:
        user_msg: The raw text sent by the user in this exchange.
        assistant_msg: The raw text of the character's reply.

    Returns:
        Float multiplier in the range ``[1.0, 2.5]``.

    Example:
        >>> m = calculate_depth_multiplier("I feel lonely sometimes.", "")
        >>> 1.0 <= m <= 2.5
        True
        >>> calculate_depth_multiplier("ok", "ok")
        1.0
    """
    multiplier: float = 1.0
    combined_len = len(user_msg) + len(assistant_msg)
    user_lower = user_msg.lower()

    # Length bonus (mutually exclusive tiers)
    if combined_len > 600:
        multiplier += 0.5
    elif combined_len > 200:
        multiplier += 0.2

    # Question bonus
    if "?" in user_msg:
        multiplier += 0.2

    # Emotional keyword bonus
    words = set(user_lower.split())
    keyword_hits = len(words & _EMOTIONAL_KEYWORDS)
    if keyword_hits >= 3:
        multiplier += 0.3
    elif keyword_hits >= 1:
        multiplier += 0.15

    # Personal disclosure bonus
    if any(pattern in user_lower for pattern in _DISCLOSURE_PATTERNS):
        multiplier += 0.3

    return max(_DEPTH_MULT_MIN, min(_DEPTH_MULT_MAX, multiplier))


def check_interest_match(user_msg: str, char_interests: list[str]) -> bool:
    """Check whether the user's message touches any of the character's interests.

    A simple case-insensitive substring match is used so that partial words
    (e.g., "anime" matching "anime" in the interests list) still count.  An
    empty interests list always returns False.

    Args:
        user_msg: The raw text sent by the user.
        char_interests: List of interest strings stored on the character
                        (e.g., ``["anime", "coffee", "hiking"]``).

    Returns:
        ``True`` if at least one interest string appears in the lower-cased
        user message, ``False`` otherwise.

    Example:
        >>> check_interest_match("I love watching anime!", ["anime", "manga"])
        True
        >>> check_interest_match("Hello there!", ["anime", "manga"])
        False
        >>> check_interest_match("Hi", [])
        False
    """
    if not char_interests:
        return False
    user_lower = user_msg.lower()
    return any(interest.lower() in user_lower for interest in char_interests)


def calculate_message_xp(
    user_msg: str,
    assistant_msg: str,
    char_interests: list[str],
    base_xp: int = 5,
) -> tuple[int, float, bool]:
    """Calculate the total XP reward for a single message exchange.

    Combines the depth multiplier with an optional interest-match bonus.
    When the user's message touches one of the character's interests, the
    effective multiplier is boosted by 1.5x (still capped at 2.5).  The
    final XP is rounded and hard-capped at 12 to prevent any single message
    from short-circuiting the progression curve.

    Args:
        user_msg: The raw text sent by the user.
        assistant_msg: The raw text of the character's reply.
        char_interests: List of interest strings stored on the character.
        base_xp: Starting XP before any multiplier is applied.
                 Defaults to 5.  Callers should pass the value returned
                 by ``get_xp_for_action("message", bond_level)`` from
                 ``progression.py``.

    Returns:
        A 3-tuple of:
            - ``final_xp`` (int): XP to award, in the range
              ``[base_xp, 12]``.
            - ``effective_multiplier`` (float): The multiplier that was
              actually applied (after interest boost and capping).
            - ``interest_matched`` (bool): Whether an interest match was
              detected.

    Example:
        >>> xp, mult, matched = calculate_message_xp(
        ...     "I feel lonely.", "I'm here for you.", ["anime"], base_xp=5
        ... )
        >>> 5 <= xp <= 12
        True
        >>> isinstance(matched, bool)
        True
    """
    depth_mult = calculate_depth_multiplier(user_msg, assistant_msg)
    interest_matched = check_interest_match(user_msg, char_interests)

    effective_multiplier = depth_mult
    if interest_matched:
        effective_multiplier = min(_DEPTH_MULT_MAX, depth_mult * 1.5)

    final_xp = min(_FINAL_XP_CAP, round(base_xp * effective_multiplier))
    return final_xp, effective_multiplier, interest_matched


def check_daily_bonus(last_bonus_date: str | None) -> bool:
    """Determine whether the user qualifies for a daily login bonus.

    Compares *last_bonus_date* against today's UTC date.  The bonus is
    awarded once per calendar day; the caller is responsible for recording
    the grant date after awarding it.

    Args:
        last_bonus_date: ISO 8601 date string (``"YYYY-MM-DD"`` or a full
                         datetime string) of the last awarded bonus, or
                         ``None`` if no bonus has ever been awarded.

    Returns:
        ``True`` if the bonus should be granted (no prior grant today),
        ``False`` otherwise.

    Example:
        >>> check_daily_bonus(None)
        True
        >>> import datetime
        >>> today = datetime.date.today().isoformat()
        >>> check_daily_bonus(today)
        False
    """
    if last_bonus_date is None:
        return True

    today = datetime.now(timezone.utc).date()

    try:
        # Accept both "YYYY-MM-DD" and full ISO datetime strings.
        last_date = datetime.fromisoformat(last_bonus_date).date()
    except ValueError:
        # Unparseable date — treat as never awarded so we don't block the user.
        return True

    return last_date < today


def check_session_bonus(session_msg_count: int, already_awarded: bool) -> bool:
    """Determine whether the user qualifies for a session-length bonus.

    A bonus is granted once per session after the 10th message is exchanged.
    The caller tracks both the running message count and whether the bonus
    has already been awarded for the current session.

    Args:
        session_msg_count: Total number of messages sent in the current
                           session (including the message being processed).
        already_awarded: ``True`` if the session bonus was already granted
                         earlier in this session.

    Returns:
        ``True`` if ``session_msg_count >= 10`` and the bonus has not yet
        been awarded, ``False`` otherwise.

    Example:
        >>> check_session_bonus(10, already_awarded=False)
        True
        >>> check_session_bonus(10, already_awarded=True)
        False
        >>> check_session_bonus(9, already_awarded=False)
        False
    """
    return session_msg_count >= _SESSION_BONUS_THRESHOLD and not already_awarded
