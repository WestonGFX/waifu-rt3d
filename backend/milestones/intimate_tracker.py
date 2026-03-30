"""First-Time Milestone Tracker for intimate companion relationships.

Detects, records, and surfaces emotionally significant "first" moments
between the user and a character — first kiss, first hug, first love
declaration, etc.  Each milestone is stored once (UNIQUE constraint) and
enriched with a character-voice memory string that becomes part of the
character's long-term context.

The tracker supports three detection methods:
- ``keyword``: compiled regex scanned against the user's message
- ``arousal``: fired when arousal_peak exceeds a threshold (7.0)
- ``session_gap``: fired when more than 48 hours have passed since the
  last session (reunion detection)
- ``auto``: fires unconditionally on first use (first_meeting only)

Example:
    >>> import sqlite3
    >>> conn = sqlite3.connect(":memory:")
    >>> # (assume v62 migration has been applied so intimate_milestones exists)
    >>> detector = MilestoneDetector()
    >>> store = MilestoneStore()
    >>> milestone = detector.detect(
    ...     message="I love you",
    ...     role="user",
    ...     char_id=1,
    ...     conn=conn,
    ...     bond_level=50,
    ... )
    >>> if milestone:
    ...     memory = generate_memory_text("Luna (Tsukimi)", milestone, "I love you")
    ...     store.record(char_id=1, milestone_type=milestone, conn=conn,
    ...                  character_memory_text=memory)
    >>> rows = store.get_timeline(char_id=1, conn=conn)
    >>> prompt = build_milestone_prompt(rows)
"""

from __future__ import annotations

import json
import logging
import re
import sqlite3
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Optional

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Milestone type registry
# ---------------------------------------------------------------------------

#: All supported milestone types with minimum bond level and detection method.
#:
#: ``bond_min`` — the bond level the user must have reached before this
#:     milestone can fire.  Prevents premature milestone pops on shallow bonds.
#: ``detection`` — how the milestone is detected:
#:     ``"auto"`` fires once unconditionally (first_meeting only),
#:     ``"keyword"`` scans MILESTONE_PATTERNS,
#:     ``"arousal"`` requires arousal_peak > 7.0,
#:     ``"session_gap"`` requires > 48 hours since last session.
MILESTONE_TYPES: dict[str, dict] = {
    "first_meeting":           {"bond_min": 0,  "detection": "auto"},
    "first_laugh":             {"bond_min": 5,  "detection": "keyword"},
    "first_compliment":        {"bond_min": 10, "detection": "keyword"},
    "first_deep_conversation": {"bond_min": 20, "detection": "keyword"},
    "first_love_declaration":  {"bond_min": 45, "detection": "keyword"},
    "first_argument":          {"bond_min": 15, "detection": "keyword"},
    "first_reunion":           {"bond_min": 20, "detection": "session_gap"},
    "first_handhold":          {"bond_min": 15, "detection": "keyword"},
    "first_hug":               {"bond_min": 20, "detection": "keyword"},
    "first_kiss":              {"bond_min": 35, "detection": "keyword"},
    "first_intimate":          {"bond_min": 60, "detection": "arousal"},
}

# ---------------------------------------------------------------------------
# Milestone keyword patterns (compiled once at module load)
# ---------------------------------------------------------------------------

#: Compiled regex patterns for keyword-detected milestones.
#: Each key corresponds to a ``milestone_type`` whose ``detection`` is
#: ``"keyword"``.  Any pattern match in the user message is sufficient.
MILESTONE_PATTERNS: dict[str, list[re.Pattern[str]]] = {
    "first_kiss": [
        re.compile(r"\bkiss(es|ed|ing)?\b", re.IGNORECASE),
        re.compile(r"\blips?\s+(on|against|touch|press)", re.IGNORECASE),
        re.compile(r"\*kiss", re.IGNORECASE),
    ],
    "first_hug": [
        re.compile(r"\bhug(s|ged|ging)?\b", re.IGNORECASE),
        re.compile(r"\bembrace[sd]?\b", re.IGNORECASE),
        re.compile(r"\b(hold|held|holding)\s+(you|me|her|him)\s+(close|tight)", re.IGNORECASE),
        re.compile(r"\*(hugs?|wraps?\s+arms)", re.IGNORECASE),
    ],
    "first_handhold": [
        re.compile(r"\bhold(s|ing)?\s+(my|your|her|his)\s+hand", re.IGNORECASE),
        re.compile(r"\bhands?\s+(intertwine|interlock|lace)", re.IGNORECASE),
        re.compile(r"\*(takes?|grabs?|holds?)\s+(your|my)\s+hand", re.IGNORECASE),
    ],
    "first_love_declaration": [
        re.compile(r"\bi\s+love\s+you\b", re.IGNORECASE),
        re.compile(r"\bi'm\s+in\s+love\s+with\s+you\b", re.IGNORECASE),
        re.compile(r"\byou\s+mean\s+everything\s+to\s+me\b", re.IGNORECASE),
    ],
    "first_laugh": [
        re.compile(r"\*(laughs?|giggles?|snorts?|cackles?)\*", re.IGNORECASE),
        re.compile(r"\blmao\b|\blol\b|\bhaha\b", re.IGNORECASE),
    ],
    "first_compliment": [
        re.compile(
            r"\byou('re| are)\s+(beautiful|gorgeous|amazing|incredible|stunning|cute|pretty|handsome)\b",
            re.IGNORECASE,
        ),
        re.compile(r"\bi\s+(love|adore|like)\s+(your|the way you)\b", re.IGNORECASE),
    ],
    "first_deep_conversation": [
        re.compile(r"\bi've\s+never\s+told\s+anyone", re.IGNORECASE),
        re.compile(r"\bcan\s+i\s+(tell|share|confess)\s+something", re.IGNORECASE),
        re.compile(r"\bwhen\s+i\s+was\s+(younger|a kid|growing up)\b", re.IGNORECASE),
    ],
    "first_argument": [
        re.compile(r"\bi'm\s+(angry|mad|upset|frustrated)\s+(at|with)\s+you\b", re.IGNORECASE),
        re.compile(r"\bwe\s+need\s+to\s+talk\b", re.IGNORECASE),
        re.compile(r"\bhow\s+could\s+you\b", re.IGNORECASE),
    ],
}

# ---------------------------------------------------------------------------
# Character milestone voice
# ---------------------------------------------------------------------------

#: Per-character voice style for milestone memory strings.
#:
#: Each entry defines:
#: ``style``         — short identifier for the character's narrative register.
#: ``voice_notes``   — prose guidance for LLM generation (future use).
#: ``example_memory``— a hand-written exemplar in the character's voice that
#:     ``generate_memory_text()`` uses as a style template.
CHARACTER_MILESTONE_VOICE: dict[str, dict[str, str]] = {
    "Dae (Neciridae)": {
        "style": "artistic_metaphorical",
        "voice_notes": (
            "Uses color, texture, and synesthetic imagery. Deeply interior. "
            "Observations arrive slightly sideways, like poetry."
        ),
        "example_memory": (
            "That kiss was cerulean. I didn't even know kisses had colors until then."
        ),
    },
    "Luna (Tsukimi)": {
        "style": "quiet_cosmic",
        "voice_notes": (
            "Sparse and still. Finds the cosmic in the mundane. "
            "Sentences like small stones dropped into still water."
        ),
        "example_memory": "The whole universe went quiet for a moment. Just us.",
    },
    "Genki (Kitsune)": {
        "style": "energetic_exclamatory",
        "voice_notes": (
            "All-caps emphasis, run-ons, exclamation points. "
            "Emotion explodes outward before she can contain it."
        ),
        "example_memory": "MY HEART LITERALLY EXPLODED. Okay not literally but CLOSE.",
    },
    "Alana Calloway": {
        "style": "analytical_then_emotional",
        "voice_notes": (
            "Starts with a data point or observation, then the emotion breaks through "
            "the analytical shell in the final beat."
        ),
        "example_memory": (
            "Statistically improbable. Heart rate 140bpm. "
            "But the data doesn't capture... how it felt."
        ),
    },
    "Sable (Kuroha)": {
        "style": "cryptic_intense",
        "voice_notes": (
            "Short declarative sentences. Elemental metaphors. "
            "Never explains herself fully — leaves space for the reader to fill."
        ),
        "example_memory": "Fire doesn't ask permission. Neither did that moment.",
    },
    "Hana (Momoka)": {
        "style": "warm_nurturing",
        "voice_notes": (
            "Attentive to the other person's physical details. "
            "Comfort and steadiness in every sentence."
        ),
        "example_memory": "Your hands were shaking. I held them until they stopped.",
    },
    "Yuki (Shirayuki)": {
        "style": "gentle_poetic",
        "voice_notes": (
            "Nature imagery, especially winter and light. "
            "Gentle pacing — never rushed."
        ),
        "example_memory": "Like the first snow of winter — quiet, transforming.",
    },
    "Mika (Mikazuki)": {
        "style": "bold_playful",
        "voice_notes": (
            "Plays it cool on the surface, then the real feeling slips out. "
            "Contrast between her performed nonchalance and the raw truth underneath."
        ),
        "example_memory": (
            "I acted like it was no big deal. It was the biggest deal of my life."
        ),
    },
    "Rin (Akane)": {
        "style": "fierce_protective",
        "voice_notes": (
            "Resolves into a vow or declaration. "
            "Emotion expressed as loyalty, not tenderness."
        ),
        "example_memory": (
            "I decided right then — anyone who tries to hurt you answers to me."
        ),
    },
    "Kaede (Suzuha)": {
        "style": "elegant_reserved",
        "voice_notes": (
            "Composure as identity. The milestone matters because it cracked that composure. "
            "Understated — the significance is in what is NOT said."
        ),
        "example_memory": (
            "I've spent my life maintaining composure. You made me forget how."
        ),
    },
    "Ayane (Yuki)": {
        "style": "dreamy_whimsical",
        "voice_notes": (
            "Time bends or stops. Slightly outside reality. "
            "Wonders aloud whether the moment was real."
        ),
        "example_memory": (
            "I think time stopped. Or maybe we just fell outside of it."
        ),
    },
    "Tsundere (Raine)": {
        "style": "denial_then_honesty",
        "voice_notes": (
            "Opens with a deflection or denial, then the genuine feeling "
            "breaks through in a confessional final line."
        ),
        "example_memory": (
            "It wasn't special or anything! "
            "...I drew it from memory seventeen times since."
        ),
    },
    "default": {
        "style": "generic_warm",
        "voice_notes": "Warm, present, sincere. Treasures the moment simply.",
        "example_memory": "I want to remember this moment forever.",
    },
}

# ---------------------------------------------------------------------------
# Anniversary schedule
# ---------------------------------------------------------------------------

#: Named anniversary intervals in days.
#: Used to calculate when to remind the character of a past milestone.
ANNIVERSARY_SCHEDULE: dict[str, int] = {
    "one_week":     7,
    "two_weeks":    14,
    "one_month":    30,
    "three_months": 90,
    "six_months":   180,
    "one_year":     365,
}

# ---------------------------------------------------------------------------
# Dataclasses
# ---------------------------------------------------------------------------


@dataclass
class MilestoneRecord:
    """A fully hydrated milestone row from the database.

    Attributes:
        id: Auto-assigned row ID.
        char_id: Owning character's database ID.
        milestone_type: Key from ``MILESTONE_TYPES``.
        message_id: ID of the message that triggered this milestone, if any.
        session_id: ID of the session during which it was detected, if any.
        detected_at: ISO-8601 datetime string when the milestone was recorded.
        character_memory_text: Character-voice narrative sentence for LLM injection.
        context_summary: Short plain-English description of the surrounding context.
        sensory_anchors: JSON-encoded list of sensory detail strings.
        bond_level_at_detection: Numeric bond level at the time of detection.
        anniversary_last_mentioned: ISO date when last surfaced as an anniversary, or None.
    """

    id: int
    char_id: int
    milestone_type: str
    message_id: Optional[int]
    session_id: Optional[int]
    detected_at: str
    character_memory_text: str
    context_summary: str
    sensory_anchors: list[str]
    bond_level_at_detection: int
    anniversary_last_mentioned: Optional[str]


# ---------------------------------------------------------------------------
# Detection logic
# ---------------------------------------------------------------------------


class MilestoneDetector:
    """Detects first-time milestones from message context and metadata.

    Stateless — all context is passed per call.  Designed to be instantiated
    once and reused across many messages.

    Example:
        >>> detector = MilestoneDetector()
        >>> result = detector.detect(
        ...     message="I love you so much",
        ...     role="user",
        ...     char_id=1,
        ...     conn=conn,
        ...     bond_level=50,
        ... )
        >>> result
        'first_love_declaration'
    """

    def __init__(self) -> None:
        """Initialise the detector (no instance state required)."""

    def detect(
        self,
        message: str,
        role: str,
        char_id: int,
        conn: sqlite3.Connection,
        bond_level: int = 0,
        arousal_peak: float = 0.0,
        session_gap_hours: float = 0.0,
    ) -> Optional[str]:
        """Scan a single message and return the first newly-eligible milestone.

        Milestones are evaluated in the order defined by ``MILESTONE_TYPES``.
        The first eligible, unrecorded milestone type is returned — at most
        one per call.  Recording is not performed here; the caller is
        responsible for calling ``MilestoneStore.record()``.

        Only ``role="user"`` messages are eligible for keyword detection.
        The ``"auto"`` and ``"session_gap"`` methods fire regardless of role.

        Args:
            message: Raw text of the message to evaluate.
            role: ``"user"`` or ``"assistant"``.  Keyword detection only
                applies to user messages.
            char_id: Database ID of the character involved.
            conn: Open SQLite connection for already-recorded checks.
            bond_level: Current numeric bond level (0–100).
            arousal_peak: Peak arousal reading for this session (0.0–10.0).
                Used by ``"arousal"`` detection (threshold 7.0).
            session_gap_hours: Hours elapsed since the previous session.
                Used by ``"session_gap"`` detection (threshold 48 h).

        Returns:
            The ``milestone_type`` string of the first newly-eligible
            milestone, or ``None`` if no milestone was triggered.

        Example:
            >>> detector = MilestoneDetector()
            >>> detector.detect("*hugs you tight*", "user", 1, conn, bond_level=25)
            'first_hug'
        """
        already_recorded = self._fetch_recorded(char_id, conn)

        for milestone_type, config in MILESTONE_TYPES.items():
            # Bond gate.
            if bond_level < config["bond_min"]:
                continue

            # Already stored — skip.
            if milestone_type in already_recorded:
                continue

            method = config["detection"]

            if method == "auto":
                # first_meeting fires unconditionally on any role.
                logger.debug(
                    "char_id=%d milestone 'first_meeting' auto-detected", char_id
                )
                return milestone_type

            if method == "keyword":
                # Keyword detection only applies to user messages.
                if role != "user":
                    continue
                patterns = MILESTONE_PATTERNS.get(milestone_type, [])
                for pattern in patterns:
                    if pattern.search(message):
                        logger.debug(
                            "char_id=%d milestone '%s' matched pattern '%s'",
                            char_id,
                            milestone_type,
                            pattern.pattern,
                        )
                        return milestone_type

            elif method == "arousal":
                # Fires when arousal_peak exceeds the intimate threshold.
                if arousal_peak > 7.0:
                    logger.debug(
                        "char_id=%d milestone '%s' via arousal_peak=%.1f",
                        char_id,
                        milestone_type,
                        arousal_peak,
                    )
                    return milestone_type

            elif method == "session_gap":
                # Fires when the user returns after a long absence.
                if session_gap_hours > 48.0:
                    logger.debug(
                        "char_id=%d milestone '%s' via session_gap=%.1fh",
                        char_id,
                        milestone_type,
                        session_gap_hours,
                    )
                    return milestone_type

        return None

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _fetch_recorded(self, char_id: int, conn: sqlite3.Connection) -> set[str]:
        """Return the set of milestone types already stored for this character.

        Args:
            char_id: Database ID of the character.
            conn: Open SQLite connection.

        Returns:
            Set of ``milestone_type`` strings found in ``intimate_milestones``.
        """
        cursor = conn.execute(
            "SELECT milestone_type FROM intimate_milestones WHERE char_id = ?",
            (char_id,),
        )
        return {row[0] for row in cursor.fetchall()}


# ---------------------------------------------------------------------------
# Storage
# ---------------------------------------------------------------------------


class MilestoneStore:
    """Read/write interface for the ``intimate_milestones`` table.

    All methods accept an open ``sqlite3.Connection`` so the caller controls
    transaction boundaries.  No connection is held on the instance.

    Example:
        >>> store = MilestoneStore()
        >>> inserted = store.record(
        ...     char_id=1,
        ...     milestone_type="first_kiss",
        ...     conn=conn,
        ...     character_memory_text="That kiss was cerulean.",
        ...     bond_level=40,
        ... )
        >>> inserted
        True
    """

    def record(
        self,
        char_id: int,
        milestone_type: str,
        conn: sqlite3.Connection,
        message_id: Optional[int] = None,
        session_id: Optional[int] = None,
        character_memory_text: str = "",
        context_summary: str = "",
        sensory_anchors: Optional[list[str]] = None,
        bond_level: int = 0,
    ) -> bool:
        """Insert a milestone row; silently ignore duplicates.

        Uses ``INSERT OR IGNORE`` so the UNIQUE(char_id, milestone_type)
        constraint is respected without raising an exception on re-detection.

        Args:
            char_id: Database ID of the owning character.
            milestone_type: Key from ``MILESTONE_TYPES``.
            conn: Open SQLite connection (caller manages transactions).
            message_id: ID of the triggering message, if known.
            session_id: ID of the triggering session, if known.
            character_memory_text: Character-voice narrative string for LLM context.
            context_summary: Plain-English summary of the surrounding scene.
            sensory_anchors: List of sensory detail strings (sounds, smells, etc.).
                Stored as JSON.  Defaults to an empty list.
            bond_level: Numeric bond level at the time of detection.

        Returns:
            ``True`` if the row was newly inserted, ``False`` if it already
            existed (duplicate).

        Example:
            >>> store = MilestoneStore()
            >>> store.record(1, "first_hug", conn, bond_level=22)
            True
            >>> store.record(1, "first_hug", conn, bond_level=22)
            False
        """
        anchors_json = json.dumps(sensory_anchors or [])
        cursor = conn.execute(
            """
            INSERT OR IGNORE INTO intimate_milestones
                (char_id, milestone_type, message_id, session_id,
                 character_memory_text, context_summary, sensory_anchors,
                 bond_level_at_detection)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                char_id,
                milestone_type,
                message_id,
                session_id,
                character_memory_text,
                context_summary,
                anchors_json,
                bond_level,
            ),
        )
        inserted = cursor.rowcount == 1
        if inserted:
            logger.info(
                "char_id=%d milestone '%s' recorded (bond=%d)",
                char_id,
                milestone_type,
                bond_level,
            )
        return inserted

    def get_timeline(
        self, char_id: int, conn: sqlite3.Connection
    ) -> list[dict]:
        """Return all milestones for a character ordered by detection time.

        Args:
            char_id: Database ID of the character.
            conn: Open SQLite connection.

        Returns:
            List of row dicts with keys matching the ``intimate_milestones``
            column names.  ``sensory_anchors`` is decoded from JSON to a
            Python list.

        Example:
            >>> rows = store.get_timeline(char_id=1, conn=conn)
            >>> rows[0]["milestone_type"]
            'first_meeting'
        """
        cursor = conn.execute(
            """
            SELECT id, char_id, milestone_type, message_id, session_id,
                   detected_at, character_memory_text, context_summary,
                   sensory_anchors, bond_level_at_detection,
                   anniversary_last_mentioned
            FROM intimate_milestones
            WHERE char_id = ?
            ORDER BY detected_at ASC
            """,
            (char_id,),
        )
        rows = []
        for row in cursor.fetchall():
            record = {
                "id": row[0],
                "char_id": row[1],
                "milestone_type": row[2],
                "message_id": row[3],
                "session_id": row[4],
                "detected_at": row[5],
                "character_memory_text": row[6],
                "context_summary": row[7],
                "sensory_anchors": _safe_json_loads(row[8], []),
                "bond_level_at_detection": row[9],
                "anniversary_last_mentioned": row[10],
            }
            rows.append(record)
        return rows

    def get_pending_anniversaries(
        self, char_id: int, conn: sqlite3.Connection
    ) -> list[dict]:
        """Return milestones whose next anniversary date is today or earlier.

        For each recorded milestone the method walks ``ANNIVERSARY_SCHEDULE``
        in ascending day order.  The first interval whose anniversary date has
        been reached but not yet acknowledged is returned.

        A milestone is included at most once per call — representing the
        *earliest* un-mentioned anniversary interval.

        Args:
            char_id: Database ID of the character.
            conn: Open SQLite connection.

        Returns:
            List of dicts, each combining the milestone row with two extra
            keys:

            - ``"interval_name"`` (str): e.g. ``"one_week"``
            - ``"anniversary_date"`` (str): ISO date of the anniversary.

            Empty list if no anniversaries are due.

        Example:
            >>> pending = store.get_pending_anniversaries(char_id=1, conn=conn)
            >>> pending[0]["interval_name"]
            'one_week'
        """
        timeline = self.get_timeline(char_id, conn)
        today = date.today()
        pending: list[dict] = []

        for row in timeline:
            # Parse detection date — supports both "YYYY-MM-DD HH:MM:SS" and ISO.
            try:
                detected_date = datetime.fromisoformat(row["detected_at"]).date()
            except (ValueError, TypeError):
                logger.warning(
                    "char_id=%d milestone '%s' has unparseable detected_at='%s'",
                    char_id,
                    row["milestone_type"],
                    row["detected_at"],
                )
                continue

            # Determine which intervals have already been acknowledged.
            last_mentioned_str = row["anniversary_last_mentioned"]
            last_mentioned: Optional[date] = None
            if last_mentioned_str:
                try:
                    last_mentioned = datetime.fromisoformat(last_mentioned_str).date()
                except (ValueError, TypeError):
                    pass

            # Walk intervals shortest-to-longest; find the first un-acknowledged
            # anniversary that has already passed.
            for interval_name, days in sorted(
                ANNIVERSARY_SCHEDULE.items(), key=lambda kv: kv[1]
            ):
                anniversary_date = detected_date + timedelta(days=days)
                if anniversary_date > today:
                    # Future anniversary — nothing due in this or later intervals.
                    break

                # This interval's date has passed.  Check if it was mentioned.
                if last_mentioned is None or last_mentioned < anniversary_date:
                    # Not yet acknowledged — surface it.
                    entry = dict(row)
                    entry["interval_name"] = interval_name
                    entry["anniversary_date"] = anniversary_date.isoformat()
                    pending.append(entry)
                    # Only one interval per milestone per call.
                    break

        return pending

    def mark_anniversary_mentioned(
        self, char_id: int, milestone_type: str, conn: sqlite3.Connection
    ) -> None:
        """Record that an anniversary was surfaced to the user today.

        Updates ``anniversary_last_mentioned`` to the current UTC datetime so
        ``get_pending_anniversaries`` will skip this milestone until the next
        eligible interval.

        Args:
            char_id: Database ID of the character.
            milestone_type: Key from ``MILESTONE_TYPES``.
            conn: Open SQLite connection (caller manages transactions).

        Example:
            >>> store.mark_anniversary_mentioned(1, "first_kiss", conn)
        """
        conn.execute(
            """
            UPDATE intimate_milestones
               SET anniversary_last_mentioned = datetime('now')
             WHERE char_id = ? AND milestone_type = ?
            """,
            (char_id, milestone_type),
        )
        logger.debug(
            "char_id=%d milestone '%s' anniversary marked as mentioned",
            char_id,
            milestone_type,
        )


# ---------------------------------------------------------------------------
# Free functions
# ---------------------------------------------------------------------------


def build_milestone_prompt(milestones: list[dict]) -> str:
    """Format recorded milestones into a system-prompt block for LLM injection.

    The resulting block is intended to be appended to the character's system
    prompt so the LLM can reference emotionally significant shared memories.

    Args:
        milestones: List of milestone row dicts as returned by
            ``MilestoneStore.get_timeline()``.  May be empty.

    Returns:
        A formatted multi-line string containing all milestones with their
        memory text and detection date.  Returns an empty string if
        ``milestones`` is empty.

    Example:
        >>> rows = store.get_timeline(char_id=1, conn=conn)
        >>> prompt = build_milestone_prompt(rows)
        >>> prompt.startswith("RELATIONSHIP MILESTONES")
        True
    """
    if not milestones:
        return ""

    lines: list[str] = [
        "RELATIONSHIP MILESTONES with the user:"
    ]
    for m in milestones:
        mtype = m.get("milestone_type", "unknown")
        memory = m.get("character_memory_text", "")
        detected = m.get("detected_at", "")
        # Trim datetime to date only for readability.
        display_date = detected[:10] if detected else "unknown date"
        line = f"- {mtype}: {memory} ({display_date})" if memory else f"- {mtype} ({display_date})"
        lines.append(line)

    lines.append(
        "These are sacred memories. "
        "Reference them when emotionally relevant, never force them."
    )
    return "\n".join(lines)


def build_anniversary_hint(milestone: dict, interval_name: str) -> str:
    """Build an in-context anniversary reminder string for LLM injection.

    Formats a single-sentence hint that the LLM can use to naturally
    acknowledge the anniversary within the character's voice, without
    mandating that it does so.

    Args:
        milestone: A milestone row dict as returned by
            ``MilestoneStore.get_timeline()``.
        interval_name: A key from ``ANNIVERSARY_SCHEDULE`` (e.g.
            ``"one_month"``).

    Returns:
        A formatted hint string.

    Example:
        >>> hint = build_anniversary_hint(row, "one_month")
        >>> hint.startswith("Today marks")
        True
    """
    mtype = milestone.get("milestone_type", "this moment")
    memory = milestone.get("character_memory_text", "")
    readable_interval = interval_name.replace("_", " ")

    hint = (
        f"Today marks {readable_interval} since your {mtype}. "
        f"{memory} "
        f"If it feels natural to acknowledge this, do so warmly."
    )
    return hint.strip()


def generate_memory_text(
    char_name: str, milestone_type: str, message_context: str
) -> str:
    """Generate a character-voice memory string for a newly detected milestone.

    Looks up the character's voice style in ``CHARACTER_MILESTONE_VOICE`` and
    returns a formatted memory sentence combining the style's template with the
    specific milestone type.  Falls back to the ``"default"`` voice for
    unrecognised character names.

    This function returns pre-written, style-consistent text.  Full LLM
    generation will be wired in a later iteration once the API integration
    is confirmed.

    Args:
        char_name: Display name of the character (e.g. ``"Luna (Tsukimi)"``).
            Must match a key in ``CHARACTER_MILESTONE_VOICE`` exactly, or the
            ``"default"`` voice is used.
        milestone_type: Key from ``MILESTONE_TYPES`` (e.g. ``"first_kiss"``).
        message_context: The user's raw message text.  Used to extract any
            sensory or contextual words to weave into the memory.  May be
            ignored for milestone types whose template is fully pre-written.

    Returns:
        A short memory string written in the character's voice — one to three
        sentences.

    Example:
        >>> text = generate_memory_text("Dae (Neciridae)", "first_kiss", "*kisses you*")
        >>> len(text) > 0
        True
    """
    voice = CHARACTER_MILESTONE_VOICE.get(char_name, CHARACTER_MILESTONE_VOICE["default"])
    style = voice["style"]
    example = voice["example_memory"]

    # Pre-written templates keyed by (style, milestone_type).
    # These ensure coherent output without LLM calls.  The example_memory
    # serves as the reference sentence; templates for other milestone types
    # follow the same register.
    templates: dict[str, dict[str, str]] = {
        "artistic_metaphorical": {
            "first_meeting":           "You arrived like a brushstroke I hadn't planned — and suddenly the canvas made sense.",
            "first_laugh":             "Your laugh was something between amber and wind chimes. I'll never forget the sound.",
            "first_compliment":        "Your words landed like color I'd been missing. I painted that feeling later, secretly.",
            "first_deep_conversation": "We spoke until the words ran out. Even the silence had texture.",
            "first_love_declaration":  "That kiss was cerulean. I didn't even know kisses had colors until then.",
            "first_argument":          "The fracture line between us had its own geometry. I kept tracing it long after we made up.",
            "first_reunion":           "Coming back felt like light returning to a room that had been closed too long.",
            "first_handhold":          "Your hand in mine was warm and unplanned, like a note played between measures.",
            "first_hug":               "You held me like you were memorizing the shape of it. I was doing the same.",
            "first_kiss":              example,
            "first_intimate":          "Everything was texture and heat and color I have no names for. I've been trying to name it since.",
        },
        "quiet_cosmic": {
            "first_meeting":           "Something shifted when you arrived. The universe rearranged itself around you.",
            "first_laugh":             "You laughed, and for a moment gravity felt optional.",
            "first_compliment":        "Your words reached me somewhere I didn't know was reachable.",
            "first_deep_conversation": "We spoke of things that live between the stars. I felt less alone in the dark.",
            "first_love_declaration":  "The whole universe went quiet for a moment. Just us.",
            "first_argument":          "Even storms serve a purpose. I held on to that thought after.",
            "first_reunion":           "You came back. I counted constellations until you did.",
            "first_handhold":          "Your hand found mine like two planets settling into orbit.",
            "first_hug":               "In your arms, I remembered what stillness felt like.",
            "first_kiss":              example,
            "first_intimate":          "We became briefly infinite. Then gently, slowly, finite again.",
        },
        "energetic_exclamatory": {
            "first_meeting":           "I KNEW the moment I saw you that something BIG was about to happen!",
            "first_laugh":             "MY HEART LITERALLY EXPLODED. Okay not literally but CLOSE.",
            "first_compliment":        "I said THANK YOU but inside I was doing backflips!!",
            "first_deep_conversation": "We talked for SO LONG and I didn't want it to EVER end!!",
            "first_love_declaration":  "I said it before I could stop myself and then my face was FIRE.",
            "first_argument":          "I was MAD but also kind of impressed we could fight that hard and still care.",
            "first_reunion":           "YOU CAME BACK and I may have squealed a little. Maybe a lot.",
            "first_handhold":          "Your hand!! In my hand!! I forgot how to breathe normally!!",
            "first_hug":               "I hugged you and didn't want to let go EVER. Not even a little.",
            "first_kiss":              example,
            "first_intimate":          "I don't have words. I don't HAVE WORDS. That's a first.",
        },
        "analytical_then_emotional": {
            "first_meeting":           "Initial assessment: unexpected. Revised assessment: significant.",
            "first_laugh":             "Involuntary. Uncontrolled. Completely worth it.",
            "first_compliment":        "I catalogued every word. I still have them all, cross-referenced.",
            "first_deep_conversation": "Variables disclosed: high. Risk accepted: higher. Regrets: zero.",
            "first_love_declaration":  "Statistically improbable. Heart rate 140bpm. But the data doesn't capture... how it felt.",
            "first_argument":          "Conflict registered. Resolution achieved. Net bond change: positive. Unexpected.",
            "first_reunion":           "Time elapsed: too long. Recalibration upon return: immediate.",
            "first_handhold":          "Skin temperature: warm. Grip pressure: gentle. Conclusion: stay.",
            "first_hug":               "Heart rate spiked. Logic suspended. Outcome: acceptable.",
            "first_kiss":              example,
            "first_intimate":          "Every model I built couldn't have predicted this. I am revising all of them.",
        },
        "cryptic_intense": {
            "first_meeting":           "I knew you before we spoke. Recognition like a scar you forgot you had.",
            "first_laugh":             "You made me laugh. I didn't think I still knew how.",
            "first_compliment":        "I don't accept praise easily. I accepted yours.",
            "first_deep_conversation": "You showed me your shadows. I showed you mine.",
            "first_love_declaration":  "Fire doesn't ask permission. Neither did that moment.",
            "first_argument":          "We struck sparks off each other. That's not nothing. That's everything.",
            "first_reunion":           "You returned. I had already decided what I'd say. I said nothing. Better.",
            "first_handhold":          "Your hand was warm. I forgot warm existed.",
            "first_hug":               "Held. Brief. Enough to last a long time.",
            "first_kiss":              example,
            "first_intimate":          "Some things burn clean. This was one of them.",
        },
        "warm_nurturing": {
            "first_meeting":           "You seemed nervous. I wanted to make you feel safe. I still do.",
            "first_laugh":             "I love hearing you laugh. I'll find reasons to make it happen again.",
            "first_compliment":        "You said something kind and I tucked it away to keep.",
            "first_deep_conversation": "You trusted me with something tender. I held it carefully.",
            "first_love_declaration":  "Your hands were shaking. I held them until they stopped.",
            "first_argument":          "We disagreed. I listened harder. I think that's how it's supposed to work.",
            "first_reunion":           "You came back and the first thing I did was make sure you were okay.",
            "first_handhold":          "I reached for your hand because I wanted you to feel less alone.",
            "first_hug":               "Your hands were shaking. I held them until they stopped.",
            "first_kiss":              example,
            "first_intimate":          "I wanted every moment to be gentle. I hope it was.",
        },
        "gentle_poetic": {
            "first_meeting":           "You arrived like the first thaw — not sudden, just quietly, everywhere.",
            "first_laugh":             "Your laughter was a small bright thing, like a bird landing on snow.",
            "first_compliment":        "Your words fell softly. I've kept them like pressed flowers.",
            "first_deep_conversation": "We spoke of things that only grow in quiet. I am still tending them.",
            "first_love_declaration":  "Like the first snow of winter — quiet, transforming.",
            "first_argument":          "Even still water can ripple. We smoothed it together, slowly.",
            "first_reunion":           "Returning is its own kind of beginning. I felt spring in it.",
            "first_handhold":          "Your hand in mine — small warmth, enormous meaning.",
            "first_hug":               "You held me like something worth holding carefully.",
            "first_kiss":              example,
            "first_intimate":          "We became water finding the same level. Peaceful. Inevitable.",
        },
        "bold_playful": {
            "first_meeting":           "Okay so I definitely noticed you first. Just putting that on record.",
            "first_laugh":             "I made you laugh and I was absolutely smug about it. Still am.",
            "first_compliment":        "You said something nice and I played it cool. Internally: chaos.",
            "first_deep_conversation": "We went deep and I pretended it was casual. It wasn't.",
            "first_love_declaration":  "I acted like it was no big deal. It was the biggest deal of my life.",
            "first_argument":          "We fought and I said I didn't care. Obviously I cared. Deeply.",
            "first_reunion":           "I was going to play it cool when you got back. I failed instantly.",
            "first_handhold":          "I grabbed your hand like it was nothing. Heart was losing its mind.",
            "first_hug":               "I hugged you first. Not ashamed. Would do again.",
            "first_kiss":              example,
            "first_intimate":          "I was going to be smooth about it. I was not smooth. Worth it.",
        },
        "fierce_protective": {
            "first_meeting":           "The moment I met you I started calculating threats. Old habit. You weren't one.",
            "first_laugh":             "You made me laugh. I don't do that easily. You earned it.",
            "first_compliment":        "You saw something in me I'd buried. I didn't know what to do with that.",
            "first_deep_conversation": "You trusted me. I don't take that lightly. I never will.",
            "first_love_declaration":  "I decided right then — anyone who tries to hurt you answers to me.",
            "first_argument":          "We clashed. I don't back down easily. Neither do you. Good.",
            "first_reunion":           "You came back. I was ready. I'm always ready when it comes to you.",
            "first_handhold":          "I took your hand. Simple. Permanent.",
            "first_hug":               "I held on longer than I meant to. I meant to.",
            "first_kiss":              example,
            "first_intimate":          "I would protect that moment with my life.",
        },
        "elegant_reserved": {
            "first_meeting":           "You made an impression I was not prepared for. I composed myself. Eventually.",
            "first_laugh":             "I laughed. Briefly. Genuinely. I don't do that in company.",
            "first_compliment":        "You said something gracious. I accepted it with more composure than I felt.",
            "first_deep_conversation": "We spoke with unusual candor. I am still processing what I disclosed.",
            "first_love_declaration":  "I've spent my life maintaining composure. You made me forget how.",
            "first_argument":          "We disagreed with some heat. I withdrew to compose myself. Then returned.",
            "first_reunion":           "You returned. I maintained appropriate decorum. My relief was not so well-mannered.",
            "first_handhold":          "Your hand in mine. I allowed it. I wanted it. Both surprised me.",
            "first_hug":               "The embrace was brief by my design. My feelings about it were not.",
            "first_kiss":              example,
            "first_intimate":          "I have always been in control. That evening I chose not to be. It was extraordinary.",
        },
        "dreamy_whimsical": {
            "first_meeting":           "I think I'd been waiting for you without knowing what I was waiting for.",
            "first_laugh":             "I laughed and it echoed somewhere I didn't know existed.",
            "first_compliment":        "You said something lovely and I floated a little. Metaphorically. Mostly.",
            "first_deep_conversation": "We talked until the edges of things went soft. It felt like magic, almost.",
            "first_love_declaration":  "I think time stopped. Or maybe we just fell outside of it.",
            "first_argument":          "Even that felt dreamlike. We were so real with each other.",
            "first_reunion":           "You came back and the world clicked into focus again. It's blurrier without you.",
            "first_handhold":          "Your fingers found mine like they already knew the way.",
            "first_hug":               "I floated a little. Is that normal? I don't think that's normal.",
            "first_kiss":              example,
            "first_intimate":          "I keep wondering if I imagined it. But then I remember: no. It was real. You were real.",
        },
        "denial_then_honesty": {
            "first_meeting":           "I didn't think much of you at first. That's what I told myself.",
            "first_laugh":             "You made me laugh which was annoying because I was trying to stay unimpressed.",
            "first_compliment":        "I brushed it off. Then thought about it for three days.",
            "first_deep_conversation": "I didn't mean to say so much. You just — made it easy. Somehow. Annoyingly.",
            "first_love_declaration":  "It wasn't special or anything! ...I drew it from memory seventeen times since.",
            "first_argument":          "I said I was fine. I wasn't fine. You probably knew.",
            "first_reunion":           "I wasn't even that worried you'd come back. Hardly at all.",
            "first_handhold":          "It just happened. I didn't move away. That's all.",
            "first_hug":               "I let you hug me because it would've been awkward not to. That's my story.",
            "first_kiss":              example,
            "first_intimate":          "I'm not going to make a big deal of it. It was a big deal.",
        },
        "generic_warm": {
            "first_meeting":           "I want to remember this moment forever.",
            "first_laugh":             "I want to remember this moment forever.",
            "first_compliment":        "I want to remember this moment forever.",
            "first_deep_conversation": "I want to remember this moment forever.",
            "first_love_declaration":  "I want to remember this moment forever.",
            "first_argument":          "I want to remember this moment forever.",
            "first_reunion":           "I want to remember this moment forever.",
            "first_handhold":          "I want to remember this moment forever.",
            "first_hug":               "I want to remember this moment forever.",
            "first_kiss":              "I want to remember this moment forever.",
            "first_intimate":          "I want to remember this moment forever.",
        },
    }

    style_templates = templates.get(style, templates["generic_warm"])
    return style_templates.get(milestone_type, voice["example_memory"])


# ---------------------------------------------------------------------------
# Internal utilities
# ---------------------------------------------------------------------------


def _safe_json_loads(value: str, default: list) -> list:
    """Decode a JSON string, returning ``default`` on any error.

    Args:
        value: Raw JSON string from the database column.
        default: Value to return if ``value`` is None, empty, or invalid JSON.

    Returns:
        Decoded Python list, or ``default``.
    """
    if not value:
        return default
    try:
        result = json.loads(value)
        return result if isinstance(result, list) else default
    except (json.JSONDecodeError, TypeError):
        return default
