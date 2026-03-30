"""Sensory-anchored intimate memory recall system (F2).

Stores and retrieves structured memories of intimate encounters, keyed on
concrete sensory details extracted from message text (location, weather,
lighting, sound, texture, scent).  When the current conversation context
shares sensory overlap with a stored memory, that memory is surfaced for
optional LLM injection — allowing the character to naturally reference a
past moment without being forced to.

The system is deliberately conservative:

- Memories are only stored when ``intimacy_level > 60`` AND
  ``arousal_peak > 3.0`` to prevent noise from casual mentions.
- At most ``MAX_RECALLS_PER_SESSION`` (2) memories are injected per session.
- At least ``MIN_MESSAGES_BETWEEN_RECALLS`` (8) messages must separate
  consecutive recalls to avoid the character sounding repetitive.
- Recall scoring weights sensory anchor overlap and applies a 2× recency
  bonus for memories created in the last 7 days.

Example::

    >>> import sqlite3
    >>> con = sqlite3.connect(":memory:")
    >>> # (run v62 migration in real usage — table must exist)
    >>> con.execute(
    ...     "CREATE TABLE intimate_memories ("
    ...     "id INTEGER PRIMARY KEY AUTOINCREMENT, char_id INTEGER NOT NULL,"
    ...     "message_id INTEGER, session_id INTEGER,"
    ...     "sensory_data TEXT NOT NULL DEFAULT '{}',"
    ...     "emotion TEXT NOT NULL DEFAULT '',"
    ...     "ending_emotion TEXT NOT NULL DEFAULT '',"
    ...     "intimacy_level INTEGER NOT NULL DEFAULT 0,"
    ...     "arousal_peak REAL NOT NULL DEFAULT 0.0,"
    ...     "character_summary TEXT NOT NULL DEFAULT '',"
    ...     "scene_type TEXT NOT NULL DEFAULT '',"
    ...     "recall_count INTEGER NOT NULL DEFAULT 0,"
    ...     "last_recalled TEXT,"
    ...     "milestone_id INTEGER,"
    ...     "created_at TEXT NOT NULL DEFAULT (datetime('now')))"
    ... )
    <sqlite3.Cursor object at ...>
    >>> store = IntimateMemoryStore()
    >>> mem_id = store.store(
    ...     char_id=1,
    ...     conn=con,
    ...     emotion="tender",
    ...     ending_emotion="happy",
    ...     intimacy_level=80,
    ...     arousal_peak=5.5,
    ...     character_summary="We stayed up talking until the candles burned out.",
    ...     scene_type="tender",
    ...     sensory_data={"sensory_anchors": ["candlelight", "silence", "blanket"]},
    ... )
    >>> memories = store.recall(
    ...     char_id=1,
    ...     current_context="The candles are low and everything is quiet.",
    ...     conn=con,
    ... )
    >>> len(memories)
    1
    >>> prompt = store.build_prompt(memories)
    >>> "candlelight" in prompt or "silence" in prompt or "blanket" in prompt
    True
"""

from __future__ import annotations

import json
import logging
import re
import sqlite3
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Optional

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Vocabulary constants
# ---------------------------------------------------------------------------

#: Sensory anchor vocabulary organised by category.
#: Every word here is checked (case-insensitive, word-boundary match) against
#: incoming message text during both storage and recall phases.
SENSORY_ANCHORS: dict[str, list[str]] = {
    "location": [
        "bedroom", "couch", "sofa", "bed", "floor", "shower", "bath",
        "kitchen", "balcony", "outside", "car", "park", "beach",
    ],
    "weather": [
        "rain", "raining", "storm", "thunder", "snow", "snowing",
        "warm", "cold", "breeze", "wind", "sunny", "moonlight",
    ],
    "lighting": [
        "candlelight", "candles", "dark", "darkness", "dim", "firelight",
        "fire", "lamp", "moonlit", "starlight", "sunset", "dawn",
    ],
    "sound": [
        "music", "song", "silence", "quiet", "thunder",
        "heartbeat", "breathing", "whisper", "humming",
    ],
    "texture": [
        "soft", "silk", "velvet", "blanket", "sheets",
        "skin", "hair", "smooth",
    ],
    "scent": [
        "perfume", "flowers", "coffee", "tea", "incense",
        "candle", "fresh", "soap", "shampoo",
    ],
}

# ---------------------------------------------------------------------------
# Recall trigger weights
# ---------------------------------------------------------------------------

#: Multipliers applied to each recall trigger type when computing a score.
#: ``sensory_match`` is the primary driver; the others are reserved for
#: future cross-engine integrations (mood engine, calendar).
RECALL_TRIGGERS: dict[str, float] = {
    "sensory_match": 1.0,
    "touch_match": 0.8,
    "mood_match": 0.6,
    "anniversary": 0.9,
    "contrast": 0.5,
    "growth": 0.7,
}

# ---------------------------------------------------------------------------
# Frequency limiting
# ---------------------------------------------------------------------------

#: Maximum number of intimate memory recalls allowed within one session.
MAX_RECALLS_PER_SESSION: int = 2

#: Minimum messages that must pass between two consecutive recalls.
MIN_MESSAGES_BETWEEN_RECALLS: int = 8

#: Base probability of recall when ``should_recall`` conditions are met.
#: Callers may sample against this value for additional stochasticity.
RECALL_PROBABILITY_BASE: float = 0.3

# ---------------------------------------------------------------------------
# Scene type labels
# ---------------------------------------------------------------------------

#: Valid ``scene_type`` values accepted by ``IntimateMemoryStore.store()``.
SCENE_TYPES: list[str] = [
    "gentle",
    "passionate",
    "first_time",
    "playful",
    "intense",
    "tender",
    "emotional",
    "spontaneous",
]

# ---------------------------------------------------------------------------
# Recency threshold for scoring bonus
# ---------------------------------------------------------------------------

#: Memories created within this many days receive a 2× recall score bonus.
_RECENCY_DAYS: int = 7


# ---------------------------------------------------------------------------
# Compiled anchor patterns (built once at module load)
# ---------------------------------------------------------------------------

# Flat list of (word, compiled_pattern) for fast scanning.
_ANCHOR_PATTERNS: list[tuple[str, re.Pattern[str]]] = []

for _category, _words in SENSORY_ANCHORS.items():
    for _word in _words:
        _ANCHOR_PATTERNS.append(
            (_word, re.compile(r"\b" + re.escape(_word) + r"\b", re.IGNORECASE))
        )


# ---------------------------------------------------------------------------
# Dataclass
# ---------------------------------------------------------------------------


@dataclass
class IntimateMemory:
    """An immutable record of one intimate encounter pulled from the database.

    Attributes:
        id: Primary key from the ``intimate_memories`` table.
        char_id: Owning character's database ID.
        sensory_data: Arbitrary JSON structure; the ``"sensory_anchors"`` key
            should be a ``list[str]`` of matched anchor words extracted at
            storage time.
        emotion: Dominant emotion at the start of the scene.
        ending_emotion: Dominant emotion when the scene concluded.
        intimacy_level: Integer 0-100 representing depth of intimacy.
        arousal_peak: Peak arousal value (0.0-10.0) reached during scene.
        character_summary: Short character-voice summary of the memory.
        scene_type: One of the labels from ``SCENE_TYPES``.
        recall_count: Number of times this memory has been surfaced so far.
        last_recalled: ISO datetime string of the most recent recall, or
            ``None`` if the memory has never been recalled.
        milestone_id: FK to ``intimate_milestones``, or ``None``.
        created_at: ISO datetime string of when the memory was recorded.
    """

    id: int
    char_id: int
    sensory_data: dict
    emotion: str
    ending_emotion: str
    intimacy_level: int
    arousal_peak: float
    character_summary: str
    scene_type: str
    recall_count: int
    last_recalled: Optional[str]
    milestone_id: Optional[int]
    created_at: str


# ---------------------------------------------------------------------------
# Store class
# ---------------------------------------------------------------------------


class IntimateMemoryStore:
    """CRUD + recall logic for the ``intimate_memories`` table.

    Instances are stateless — pass the SQLite connection on every call so
    that the store works correctly whether the caller uses a per-request
    connection or a long-lived shared one.

    Example:
        >>> store = IntimateMemoryStore()
        >>> should = store.should_store(intimacy_level=75, arousal_peak=4.2)
        >>> should
        True
        >>> no = store.should_store(intimacy_level=50, arousal_peak=4.2)
        >>> no
        False
    """

    # ------------------------------------------------------------------
    # Write
    # ------------------------------------------------------------------

    def store(
        self,
        char_id: int,
        conn: sqlite3.Connection,
        *,
        message_id: Optional[int] = None,
        session_id: Optional[int] = None,
        sensory_data: Optional[dict] = None,
        emotion: str = "",
        ending_emotion: str = "",
        intimacy_level: int = 0,
        arousal_peak: float = 0.0,
        character_summary: str = "",
        scene_type: str = "",
        milestone_id: Optional[int] = None,
    ) -> int:
        """Insert a new intimate memory record and return its primary key.

        The ``sensory_data`` dict is JSON-serialised before storage.  Callers
        should populate ``sensory_data["sensory_anchors"]`` with the result of
        ``extract_sensory_anchors()`` for accurate recall scoring later.

        Args:
            char_id: Database ID of the owning character.
            conn: Active SQLite connection (caller manages lifecycle).
            message_id: Optional FK to the ``messages`` table for the message
                that concluded the scene.
            session_id: Optional FK to the ``sessions`` table.
            sensory_data: Arbitrary dict; must be JSON-serialisable.  Defaults
                to ``{}`` when ``None``.
            emotion: Dominant emotion at scene start (free text).
            ending_emotion: Dominant emotion at scene end (free text).
            intimacy_level: Integer 0-100 depth-of-intimacy score.
            arousal_peak: Highest arousal value (0.0-10.0) reached.
            character_summary: Short character-voice prose summary.
            scene_type: One of the ``SCENE_TYPES`` labels (not validated here
                to keep the layer thin; validate upstream if needed).
            milestone_id: Optional FK to ``intimate_milestones``.

        Returns:
            The ``ROWID`` / primary key of the newly inserted row.

        Raises:
            sqlite3.Error: If the INSERT fails (e.g. table doesn't exist).

        Example:
            >>> store = IntimateMemoryStore()
            >>> # (requires a real or in-memory DB with the v62 schema)
            >>> mem_id = store.store(
            ...     char_id=1,
            ...     conn=con,
            ...     emotion="tender",
            ...     intimacy_level=80,
            ...     arousal_peak=5.0,
            ...     character_summary="Soft rain outside. We didn't need words.",
            ...     scene_type="tender",
            ...     sensory_data={"sensory_anchors": ["rain", "quiet", "dim"]},
            ... )
            >>> isinstance(mem_id, int)
            True
        """
        if sensory_data is None:
            sensory_data = {}

        sensory_json = json.dumps(sensory_data, ensure_ascii=False)

        cursor = conn.execute(
            """
            INSERT INTO intimate_memories
                (char_id, message_id, session_id, sensory_data, emotion,
                 ending_emotion, intimacy_level, arousal_peak,
                 character_summary, scene_type, milestone_id)
            VALUES
                (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                char_id,
                message_id,
                session_id,
                sensory_json,
                emotion,
                ending_emotion,
                intimacy_level,
                arousal_peak,
                character_summary,
                scene_type,
                milestone_id,
            ),
        )
        conn.commit()
        new_id: int = cursor.lastrowid  # type: ignore[assignment]
        logger.debug(
            "intimate_memories: stored id=%d char_id=%d scene_type=%r intimacy=%d",
            new_id,
            char_id,
            scene_type,
            intimacy_level,
        )
        return new_id

    # ------------------------------------------------------------------
    # Read / recall
    # ------------------------------------------------------------------

    def recall(
        self,
        char_id: int,
        current_context: str,
        conn: sqlite3.Connection,
        *,
        limit: int = 2,
    ) -> list[IntimateMemory]:
        """Retrieve the most contextually relevant intimate memories.

        Scoring algorithm:

        1. Extract sensory anchors from ``current_context`` using
           ``extract_sensory_anchors()``.
        2. Load all memories for ``char_id`` ordered by ``created_at DESC``.
        3. For each memory, count the intersection between the current
           context's anchors and the memory's stored ``sensory_anchors``.
        4. Apply a 2× recency bonus to memories created within
           ``_RECENCY_DAYS`` (7) days.
        5. Return the top ``limit`` memories with ``score > 0``.
        6. Increment ``recall_count`` and set ``last_recalled`` for each
           returned memory.

        Args:
            char_id: Database ID of the character whose memories to search.
            current_context: Raw text of the current conversation turn(s) to
                match against stored sensory anchors.
            conn: Active SQLite connection.
            limit: Maximum number of memories to return.  Defaults to 2.

        Returns:
            List of ``IntimateMemory`` objects ranked by relevance score,
            highest first.  Empty list when no anchors overlap.

        Raises:
            sqlite3.Error: On unexpected database failure.

        Example:
            >>> memories = store.recall(
            ...     char_id=1,
            ...     current_context="The rain is so heavy tonight.",
            ...     conn=con,
            ... )
            >>> for m in memories:
            ...     print(m.character_summary)
        """
        context_anchors = set(self.extract_sensory_anchors(current_context))

        if not context_anchors:
            # No anchors in current context — nothing to match against.
            logger.debug("intimate_memories: recall skipped — no anchors in context")
            return []

        rows = conn.execute(
            """
            SELECT id, char_id, sensory_data, emotion, ending_emotion,
                   intimacy_level, arousal_peak, character_summary,
                   scene_type, recall_count, last_recalled, milestone_id,
                   created_at
            FROM   intimate_memories
            WHERE  char_id = ?
            ORDER  BY created_at DESC
            """,
            (char_id,),
        ).fetchall()

        if not rows:
            return []

        cutoff_dt = datetime.now(tz=timezone.utc) - timedelta(days=_RECENCY_DAYS)

        scored: list[tuple[float, IntimateMemory]] = []

        for row in rows:
            (
                mem_id,
                _char_id,
                sensory_json,
                emotion,
                ending_emotion,
                intimacy_level,
                arousal_peak,
                character_summary,
                scene_type,
                recall_count,
                last_recalled,
                milestone_id,
                created_at,
            ) = row

            try:
                sensory_data: dict = json.loads(sensory_json) if sensory_json else {}
            except json.JSONDecodeError:
                sensory_data = {}

            stored_anchors: set[str] = set(
                sensory_data.get("sensory_anchors", [])
            )

            overlap_count = len(context_anchors & stored_anchors)
            if overlap_count == 0:
                continue

            score = float(overlap_count) * RECALL_TRIGGERS["sensory_match"]

            # Recency bonus: 2× for memories from the last _RECENCY_DAYS days.
            try:
                # SQLite stores datetime as text; parse leniently.
                created_dt = datetime.fromisoformat(created_at).replace(
                    tzinfo=timezone.utc
                )
                if created_dt >= cutoff_dt:
                    score *= 2.0
            except (ValueError, TypeError):
                pass  # If parsing fails, no bonus applied.

            memory = IntimateMemory(
                id=mem_id,
                char_id=_char_id,
                sensory_data=sensory_data,
                emotion=emotion,
                ending_emotion=ending_emotion,
                intimacy_level=intimacy_level,
                arousal_peak=arousal_peak,
                character_summary=character_summary,
                scene_type=scene_type,
                recall_count=recall_count,
                last_recalled=last_recalled,
                milestone_id=milestone_id,
                created_at=created_at,
            )
            scored.append((score, memory))

        if not scored:
            return []

        # Sort descending by score, take top `limit`.
        scored.sort(key=lambda t: t[0], reverse=True)
        top = [mem for _, mem in scored[:limit]]

        # Update recall metadata for all returned memories.
        now_iso = datetime.now(tz=timezone.utc).isoformat()
        for mem in top:
            conn.execute(
                """
                UPDATE intimate_memories
                SET    recall_count   = recall_count + 1,
                       last_recalled  = ?
                WHERE  id = ?
                """,
                (now_iso, mem.id),
            )
            logger.debug(
                "intimate_memories: recalled id=%d char_id=%d overlap anchors",
                mem.id,
                char_id,
            )

        conn.commit()
        return top

    # ------------------------------------------------------------------
    # Prompt formatting
    # ------------------------------------------------------------------

    def build_prompt(self, memories: list[IntimateMemory]) -> str:
        """Format recalled memories as an LLM system-prompt injection block.

        Produces one paragraph per memory.  The character is told to reference
        the memory only if it connects naturally to the current moment — never
        to force the callback.

        Args:
            memories: Ordered list of ``IntimateMemory`` objects to format.
                Pass the direct output of ``recall()``.

        Returns:
            A multi-line string ready for insertion into the system prompt,
            or an empty string when ``memories`` is empty.

        Example:
            >>> prompt = store.build_prompt(memories)
            >>> prompt.startswith("You remember")
            True
        """
        if not memories:
            return ""

        parts: list[str] = []
        for mem in memories:
            anchors: list[str] = mem.sensory_data.get("sensory_anchors", [])
            anchor_text = ", ".join(anchors) if anchors else "none noted"

            paragraph = (
                f"You remember a past intimate moment: {mem.character_summary} "
                f"Sensory details that come back: {anchor_text}. "
                "If this connects to the current moment naturally, reference it. "
                "Don't force it."
            )
            parts.append(paragraph)

        return "\n\n".join(parts)

    # ------------------------------------------------------------------
    # Sensory extraction
    # ------------------------------------------------------------------

    def extract_sensory_anchors(self, text: str) -> list[str]:
        """Scan text for words in the SENSORY_ANCHORS vocabulary.

        Matches are case-insensitive and respect word boundaries so that
        "candles" does not spuriously match "scandals".

        Args:
            text: Raw message or context text to scan.

        Returns:
            Deduplicated list of matching anchor words in the order they were
            first encountered in the vocabulary (not the order they appear in
            ``text``).

        Example:
            >>> store = IntimateMemoryStore()
            >>> store.extract_sensory_anchors("We sat by the fire in silence.")
            ['fire', 'silence']
        """
        found: list[str] = []
        seen: set[str] = set()

        for word, pattern in _ANCHOR_PATTERNS:
            if word not in seen and pattern.search(text):
                found.append(word)
                seen.add(word)

        return found

    # ------------------------------------------------------------------
    # Threshold guards
    # ------------------------------------------------------------------

    def should_store(self, intimacy_level: int, arousal_peak: float) -> bool:
        """Return True when a scene meets the minimum bar for memory storage.

        Only scenes with substantial intimacy AND meaningful arousal are worth
        storing.  Noise from casual or low-stakes interactions is filtered out.

        Args:
            intimacy_level: Integer 0-100 intimacy score for the scene.
            arousal_peak: Highest arousal float (0.0-10.0) reached.

        Returns:
            ``True`` when ``intimacy_level > 60`` and ``arousal_peak > 3.0``.

        Example:
            >>> store.should_store(intimacy_level=75, arousal_peak=4.5)
            True
            >>> store.should_store(intimacy_level=40, arousal_peak=7.0)
            False
        """
        return intimacy_level > 60 and arousal_peak > 3.0

    def should_recall(
        self,
        messages_since_last_recall: int,
        session_recall_count: int,
    ) -> bool:
        """Return True when recall is permitted given current session state.

        Enforces two limits simultaneously:

        - At most ``MAX_RECALLS_PER_SESSION`` recalls per session.
        - At least ``MIN_MESSAGES_BETWEEN_RECALLS`` messages between recalls.

        Callers should additionally sample against ``RECALL_PROBABILITY_BASE``
        (0.3) if they want stochastic triggering.

        Args:
            messages_since_last_recall: How many messages have been exchanged
                since the previous recall (or since session start if no recall
                has occurred yet).
            session_recall_count: Total recalls already performed this session.

        Returns:
            ``True`` when both frequency constraints are satisfied.

        Example:
            >>> store.should_recall(messages_since_last_recall=10, session_recall_count=0)
            True
            >>> store.should_recall(messages_since_last_recall=10, session_recall_count=2)
            False
            >>> store.should_recall(messages_since_last_recall=3, session_recall_count=0)
            False
        """
        return (
            session_recall_count < MAX_RECALLS_PER_SESSION
            and messages_since_last_recall >= MIN_MESSAGES_BETWEEN_RECALLS
        )

    # ------------------------------------------------------------------
    # Bulk read
    # ------------------------------------------------------------------

    def get_all(
        self,
        char_id: int,
        conn: sqlite3.Connection,
    ) -> list[IntimateMemory]:
        """Return every intimate memory for a character, newest first.

        Intended for the Memory Browser UI and admin/debug tooling.  For
        in-conversation recall use ``recall()`` instead.

        Args:
            char_id: Database ID of the character.
            conn: Active SQLite connection.

        Returns:
            List of ``IntimateMemory`` objects ordered ``created_at DESC``.
            Empty list when no records exist.

        Example:
            >>> all_mems = store.get_all(char_id=1, conn=con)
            >>> isinstance(all_mems, list)
            True
        """
        rows = conn.execute(
            """
            SELECT id, char_id, sensory_data, emotion, ending_emotion,
                   intimacy_level, arousal_peak, character_summary,
                   scene_type, recall_count, last_recalled, milestone_id,
                   created_at
            FROM   intimate_memories
            WHERE  char_id = ?
            ORDER  BY created_at DESC
            """,
            (char_id,),
        ).fetchall()

        memories: list[IntimateMemory] = []
        for row in rows:
            (
                mem_id,
                _char_id,
                sensory_json,
                emotion,
                ending_emotion,
                intimacy_level,
                arousal_peak,
                character_summary,
                scene_type,
                recall_count,
                last_recalled,
                milestone_id,
                created_at,
            ) = row

            try:
                sensory_data: dict = json.loads(sensory_json) if sensory_json else {}
            except json.JSONDecodeError:
                sensory_data = {}

            memories.append(
                IntimateMemory(
                    id=mem_id,
                    char_id=_char_id,
                    sensory_data=sensory_data,
                    emotion=emotion,
                    ending_emotion=ending_emotion,
                    intimacy_level=intimacy_level,
                    arousal_peak=arousal_peak,
                    character_summary=character_summary,
                    scene_type=scene_type,
                    recall_count=recall_count,
                    last_recalled=last_recalled,
                    milestone_id=milestone_id,
                    created_at=created_at,
                )
            )

        return memories

    # ------------------------------------------------------------------
    # Delete
    # ------------------------------------------------------------------

    def delete(self, memory_id: int, conn: sqlite3.Connection) -> bool:
        """Hard-delete an intimate memory record by primary key.

        No cascading effects — milestone FK is nullable and no child tables
        reference ``intimate_memories``.

        Args:
            memory_id: Primary key of the record to delete.
            conn: Active SQLite connection.

        Returns:
            ``True`` if exactly one row was deleted, ``False`` if no row with
            that ID existed.

        Raises:
            sqlite3.Error: On unexpected database failure.

        Example:
            >>> deleted = store.delete(memory_id=42, conn=con)
            >>> deleted
            False  # row 42 doesn't exist in an empty store
        """
        cursor = conn.execute(
            "DELETE FROM intimate_memories WHERE id = ?",
            (memory_id,),
        )
        conn.commit()
        deleted = cursor.rowcount > 0
        if deleted:
            logger.debug("intimate_memories: deleted id=%d", memory_id)
        else:
            logger.debug("intimate_memories: delete id=%d — not found", memory_id)
        return deleted
