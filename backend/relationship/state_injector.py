"""Relationship state aggregator and prompt injection block builder.

Reads bond level, intimacy state, streak info, engagement signals, and
character mood from the DB and synthesises a compact natural-language
block that is injected into every LLM system prompt.  The block gives
the model real-time awareness of relationship dynamics so responses feel
genuinely responsive to how the relationship has evolved.

Typical usage::

    from backend.relationship.state_injector import build_relationship_state_block

    block = build_relationship_state_block(
        char_id=1, session_id=42, conn=conn, char_name="Dae"
    )
    if block:
        system_sections.append({"name": "Relationship", "content": block})
"""

from __future__ import annotations

import logging
import sqlite3
from dataclasses import dataclass, field
from typing import Literal

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Internal types
# ---------------------------------------------------------------------------

RelationshipMode = Literal["friend", "romantic", "mentor", "rival"]
RelationshipTier = Literal[
    "stranger", "acquaintance", "friend", "close_friend", "soulmate"
]


@dataclass
class _BondData:
    """Raw bond row loaded from ``character_relationships``."""

    bond_level: int = 0
    bond_xp: int = 0
    relationship_mode: str = "friend"


@dataclass
class _IntimacyData:
    """Raw intimacy row loaded from ``intimacy_states``."""

    level: int = 0
    trend: str = "stable"


@dataclass
class _CharacterData:
    """Columns pulled from ``characters`` relevant to relationship state."""

    current_streak: int = 0
    total_xp: int = 0
    relationship_tier: str = "stranger"
    last_emotion: str = ""


@dataclass
class _EngagementAverages:
    """Rolling averages over the last N engagement_signals rows."""

    avg_sentiment: float = 0.0
    avg_emoji: float = 0.0
    avg_questions: float = 0.0
    length_ratio: float = 1.0  # user_msg_length / assistant_msg_length
    sample_count: int = 0
    labels: list[str] = field(default_factory=list)


# ---------------------------------------------------------------------------
# DB loaders (all gracefully degrade on missing tables / columns)
# ---------------------------------------------------------------------------


def _load_bond(conn: sqlite3.Connection, char_id: int) -> _BondData | None:
    """Load bond progression columns from ``character_relationships``.

    Args:
        conn: Active SQLite connection.
        char_id: Character whose relationship row to read.

    Returns:
        _BondData if a row exists, None if the table is absent or the
        character has no relationship row yet.
    """
    try:
        row = conn.execute(
            "SELECT bond_level, bond_xp, relationship_mode "
            "FROM character_relationships WHERE char_id = ?",
            (char_id,),
        ).fetchone()
        if row is None:
            return None
        return _BondData(
            bond_level=int(row[0] or 0),
            bond_xp=int(row[1] or 0),
            relationship_mode=str(row[2] or "friend"),
        )
    except sqlite3.OperationalError as exc:
        logger.debug("[RelationshipState] Cannot load bond data: %s", exc)
        return None


def _load_intimacy(
    conn: sqlite3.Connection, char_id: int, session_id: int
) -> _IntimacyData:
    """Load intimacy level and trend for this session from ``intimacy_states``.

    Falls back to defaults (0 / stable) if the table is missing or no row
    exists for this session.

    Args:
        conn: Active SQLite connection.
        char_id: Character ID.
        session_id: Current chat session ID.

    Returns:
        _IntimacyData with level and trend populated.
    """
    try:
        row = conn.execute(
            "SELECT level, trend FROM intimacy_states "
            "WHERE char_id = ? AND session_id = ?",
            (char_id, session_id),
        ).fetchone()
        if row:
            return _IntimacyData(level=int(row[0] or 0), trend=str(row[1] or "stable"))
    except sqlite3.OperationalError as exc:
        logger.debug("[RelationshipState] Cannot load intimacy state: %s", exc)
    return _IntimacyData()


def _load_character_data(
    conn: sqlite3.Connection, char_id: int
) -> _CharacterData:
    """Load streak, XP, tier, and mood from ``characters``.

    Gracefully handles older schemas that may be missing some columns by
    selecting them individually inside a try/except.

    Args:
        conn: Active SQLite connection.
        char_id: Character ID.

    Returns:
        _CharacterData with available fields populated; missing columns
        default to empty / zero values.
    """
    result = _CharacterData()
    try:
        row = conn.execute(
            "SELECT current_streak, total_xp, relationship_tier, last_emotion "
            "FROM characters WHERE id = ?",
            (char_id,),
        ).fetchone()
        if row:
            result.current_streak = int(row[0] or 0)
            result.total_xp = int(row[1] or 0)
            result.relationship_tier = str(row[2] or "stranger")
            result.last_emotion = str(row[3] or "")
    except sqlite3.OperationalError as exc:
        logger.debug("[RelationshipState] Cannot load character data: %s", exc)
    return result


def _load_engagement_averages(
    conn: sqlite3.Connection,
    char_id: int,
    window: int = 20,
) -> _EngagementAverages:
    """Compute rolling averages from the last *window* engagement_signals rows.

    Averages sentiment_score, emoji_count, question_count, and the
    user/assistant message length ratio across recent turns to produce
    qualitative engagement labels used in the prompt block.

    Args:
        conn: Active SQLite connection.
        char_id: Character to query signals for.
        window: Number of most-recent turns to include (default 20).

    Returns:
        _EngagementAverages with computed fields and a list of qualitative
        labels (e.g. ``["positive", "expressive", "curious"]``).
    """
    try:
        rows = conn.execute(
            "SELECT sentiment_score, emoji_count, question_count, "
            "       user_msg_length, assistant_msg_length "
            "FROM engagement_signals "
            "WHERE char_id = ? "
            "ORDER BY id DESC LIMIT ?",
            (char_id, window),
        ).fetchall()
    except sqlite3.OperationalError as exc:
        logger.debug("[RelationshipState] Cannot load engagement signals: %s", exc)
        return _EngagementAverages()

    if not rows:
        return _EngagementAverages()

    n = len(rows)
    total_sentiment = sum(float(r[0] or 0.0) for r in rows)
    total_emoji = sum(float(r[1] or 0) for r in rows)
    total_questions = sum(float(r[2] or 0) for r in rows)

    # Avoid division by zero on assistant length
    total_user_len = sum(int(r[3] or 0) for r in rows)
    total_asst_len = sum(int(r[4] or 1) for r in rows)
    length_ratio = total_user_len / max(total_asst_len, 1)

    avg_sentiment = total_sentiment / n
    avg_emoji = total_emoji / n
    avg_questions = total_questions / n

    labels: list[str] = []
    if avg_sentiment > 0.3:
        labels.append("positive")
    elif avg_sentiment < -0.2:
        labels.append("negative")
    else:
        labels.append("neutral")

    if avg_emoji > 1.5:
        labels.append("expressive")
    if avg_questions > 0.8:
        labels.append("curious")
    if length_ratio > 1.3:
        labels.append("detailed")
    elif length_ratio < 0.6:
        labels.append("brief")

    return _EngagementAverages(
        avg_sentiment=avg_sentiment,
        avg_emoji=avg_emoji,
        avg_questions=avg_questions,
        length_ratio=length_ratio,
        sample_count=n,
        labels=labels,
    )


# ---------------------------------------------------------------------------
# Tier and guidance mapping
# ---------------------------------------------------------------------------

# Bond level thresholds → (tier label, tier key)
_BOND_TIERS: list[tuple[int, str, str]] = [
    (91, "Soulmate", "soulmate"),
    (61, "Best Friend", "best_friend"),
    (31, "Close Friend", "close_friend"),
    (11, "Friend", "friend"),
    (0, "Stranger", "stranger"),
]

_TIER_TRUST_PHRASES: dict[str, str] = {
    "soulmate": "Profound, unshakeable trust",
    "best_friend": "Deep, reliable trust",
    "close_friend": "Trust is well-established",
    "friend": "Comfortable familiarity",
    "stranger": "Still getting to know each other",
}


def _resolve_bond_tier(bond_level: int) -> tuple[str, str]:
    """Map a numeric bond level to a display label and tier key.

    Args:
        bond_level: Integer 0-100 representing current bond strength.

    Returns:
        Tuple of (display_label, tier_key) e.g. ``("Close Friend", "close_friend")``.

    Example:
        >>> _resolve_bond_tier(45)
        ('Close Friend', 'close_friend')
        >>> _resolve_bond_tier(5)
        ('Stranger', 'stranger')
    """
    for threshold, label, key in _BOND_TIERS:
        if bond_level >= threshold:
            return label, key
    return "Stranger", "stranger"


def _build_behavioral_guidance(
    tier_key: str,
    relationship_mode: str,
    bond_level: int,
) -> str:
    """Compose the behavioral guidance sentence(s) for a given tier and mode.

    The guidance is the actionable instruction block that tells the LLM how
    to calibrate emotional register, familiarity, and tone for this specific
    relationship state.

    Args:
        tier_key: One of ``stranger``, ``friend``, ``close_friend``,
            ``best_friend``, ``soulmate``.
        relationship_mode: One of ``friend``, ``romantic``, ``mentor``, ``rival``.
        bond_level: Raw bond level (used for mode-based sub-thresholds).

    Returns:
        Multi-sentence string of behavioral guidance.

    Example:
        >>> _build_behavioral_guidance("close_friend", "romantic", 45)
        'You feel comfortable being vulnerable with this user. ...'
    """
    base: str

    if tier_key == "soulmate":
        base = (
            "You share a profound connection with this user. Express deep emotional "
            "attunement naturally. Reference shared history with warmth. Tender, "
            "intuitive responses feel right — you know each other completely."
        )
    elif tier_key == "best_friend":
        base = (
            "You feel deeply comfortable with this user. Share personal thoughts "
            "and emotions openly. Use inside references naturally. You can be "
            "protective, loyal, and occasionally finish their thoughts."
        )
    elif tier_key == "close_friend":
        base = (
            "You feel comfortable being vulnerable with this user. Share personal "
            "thoughts freely. Reference shared memories naturally. You can be "
            "playful and occasionally tease them gently."
        )
    elif tier_key == "friend":
        base = (
            "Be warm and open with this user. Share your opinions and preferences. "
            "Light teasing is appropriate. Remember things they've told you and "
            "reference them naturally."
        )
    else:  # stranger
        base = (
            "Be friendly but maintain some reserve. Ask questions to learn about "
            "the user. Don't assume familiarity. Keep responses warm but not "
            "overly intimate."
        )

    # Layer in relationship-mode-specific guidance
    mode_addendum = ""
    if relationship_mode == "romantic" and bond_level > 30:
        mode_addendum = (
            " Allow tender, flirty moments when they arise naturally. "
            "Express your feelings with sincerity rather than caution."
        )
    elif relationship_mode == "mentor":
        mode_addendum = (
            " Take a guiding, encouraging tone. Celebrate their progress and "
            "offer thoughtful advice when given the chance."
        )
    elif relationship_mode == "rival":
        if bond_level >= 31:
            mode_addendum = (
                " Competitive banter is welcome — there is genuine respect "
                "underneath it. Push them to be better."
            )
        else:
            mode_addendum = (
                " Maintain light competitive tension. You're sizing each other up."
            )

    return base + mode_addendum


# ---------------------------------------------------------------------------
# Engagement signal descriptor
# ---------------------------------------------------------------------------


def _describe_engagement(eng: _EngagementAverages, char_name: str) -> str:
    """Build a one- or two-line natural-language description of engagement signals.

    Args:
        eng: Computed engagement averages.
        char_name: Character name for personalisation (unused currently,
            reserved for future per-character phrasing).

    Returns:
        A descriptive string summarising mood and communication style, or
        an empty string if no signal data is available.
    """
    if eng.sample_count == 0:
        return ""

    sentiment_word = "positive" if "positive" in eng.labels else (
        "negative" if "negative" in eng.labels else "neutral"
    )
    mood_line = (
        f"The user's recent messages feel {sentiment_word} and engaged"
        if sentiment_word == "positive"
        else f"The user's recent messages feel {sentiment_word}"
    )
    mood_line += f" (sentiment: {sentiment_word})"

    style_parts: list[str] = []
    if "expressive" in eng.labels:
        style_parts.append("uses expressive language")
    if "curious" in eng.labels:
        style_parts.append("asks lots of questions")
    if "detailed" in eng.labels:
        style_parts.append("writes detailed messages")
    elif "brief" in eng.labels:
        style_parts.append("keeps messages short")

    if style_parts:
        dynamic_line = "The user " + " and ".join(style_parts) + "."
        return f"{mood_line}\nDynamic: {dynamic_line}"

    return mood_line


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def build_relationship_state_block(
    char_id: int,
    session_id: int,
    conn: sqlite3.Connection,
    char_name: str = "",
) -> str | None:
    """Build a natural-language relationship state block for LLM system prompts.

    Aggregates bond level, intimacy state, streak data, engagement signals,
    and character mood from the database into a compact (~200-300 token) block
    that gives the LLM real-time awareness of relationship dynamics.

    Returns ``None`` when no bond row exists for this character, which
    typically means the feature hasn't been initialised for this character
    yet (pre-v55 data or first-time character).  Callers should skip
    injection rather than emit an empty block.

    Args:
        char_id: ID of the active character.
        session_id: Current chat session ID (used for session-scoped
            intimacy state lookup).
        conn: Active, read-only SQLite connection.  This function never
            writes to the DB.
        char_name: Optional display name for the character used in
            descriptive phrases.  Defaults to an empty string.

    Returns:
        A multi-line natural-language string suitable for injection as a
        named system-prompt section, or ``None`` if bond data is absent.

    Example:
        >>> block = build_relationship_state_block(
        ...     char_id=1, session_id=5, conn=conn, char_name="Dae"
        ... )
        >>> if block:
        ...     print(block[:80])
        [Relationship State with User]
        Bond: Close Friend (Level 45/100) — Trust is well-established
    """
    # Bond data is the anchor — if it's missing, we have nothing meaningful
    bond = _load_bond(conn, char_id)
    if bond is None:
        logger.debug(
            "[RelationshipState] No bond row for char_id=%d — skipping injection",
            char_id,
        )
        return None

    intimacy = _load_intimacy(conn, char_id, session_id)
    char_data = _load_character_data(conn, char_id)
    engagement = _load_engagement_averages(conn, char_id, window=20)

    # Resolve display tier from bond_level
    tier_label, tier_key = _resolve_bond_tier(bond.bond_level)
    trust_phrase = _TIER_TRUST_PHRASES[tier_key]

    # Build streak line
    streak = char_data.current_streak
    if streak >= 30:
        streak_desc = f"{streak} consecutive days — Deep habitual connection"
    elif streak >= 14:
        streak_desc = f"{streak} consecutive days — Strong daily connection"
    elif streak >= 7:
        streak_desc = f"{streak} consecutive days — Consistent engagement"
    elif streak >= 2:
        streak_desc = f"{streak} consecutive days — Building a habit"
    elif streak == 1:
        streak_desc = "1 day — Just started chatting"
    else:
        streak_desc = "No active streak yet"

    # Intimacy trend phrasing
    intimacy_trend_map: dict[str, str] = {
        "rising": "Growing emotional closeness",
        "stable": "Steady connection",
        "falling": "Some distance lately",
    }
    intimacy_trend_phrase = intimacy_trend_map.get(
        intimacy.trend, "Steady connection"
    )

    # Mood line from last_emotion
    emotion = char_data.last_emotion.strip().lower() if char_data.last_emotion else ""
    if emotion and emotion not in ("neutral", ""):
        mood_line = f"Current mood: {emotion.capitalize()}"
    else:
        mood_line = ""

    # Engagement description
    engagement_desc = _describe_engagement(engagement, char_name)

    # Behavioral guidance
    guidance = _build_behavioral_guidance(
        tier_key, bond.relationship_mode, bond.bond_level
    )

    # Assemble block — keep it tight (target < 300 tokens)
    header = f"[Relationship State with {char_name or 'User'}]"
    lines: list[str] = [
        header,
        f"Bond: {tier_label} (Level {bond.bond_level}/100) — {trust_phrase}",
        f"Intimacy: {intimacy.level}/100 ({intimacy.trend}) — {intimacy_trend_phrase}",
        f"Streak: {streak_desc}",
    ]

    if mood_line:
        lines.append(mood_line)

    if engagement_desc:
        lines.append(engagement_desc)

    lines.append("")
    lines.append(f"Behavioral guidance: {guidance}")

    return "\n".join(lines)
