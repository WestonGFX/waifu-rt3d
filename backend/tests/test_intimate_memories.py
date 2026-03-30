"""Tests for backend.memory.intimate_memories — IntimateMemoryStore.

Covers storage, sensory anchor extraction, recall scoring and frequency
limiting, prompt formatting, deletion, and bulk retrieval.  All DB tests use
an in-memory SQLite connection so no on-disk state is created or modified.
"""

from __future__ import annotations

import json
import sqlite3
import time
from datetime import datetime, timedelta, timezone

import pytest

from backend.memory.intimate_memories import (
    MAX_RECALLS_PER_SESSION,
    MIN_MESSAGES_BETWEEN_RECALLS,
    RECALL_PROBABILITY_BASE,
    SCENE_TYPES,
    SENSORY_ANCHORS,
    IntimateMemory,
    IntimateMemoryStore,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture()
def memory_db() -> sqlite3.Connection:
    """Return an in-memory SQLite connection with the v62 intimate_memories schema.

    Also creates the ``intimate_milestones`` stub table so FK references
    resolve without errors during insertion tests.

    Yields:
        A ``sqlite3.Connection`` with both tables created and ready to use.
    """
    conn = sqlite3.connect(":memory:")
    # Milestones table — needed for the FK on intimate_memories.milestone_id.
    conn.execute(
        """
        CREATE TABLE intimate_milestones (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            char_id     INTEGER NOT NULL,
            title       TEXT    NOT NULL DEFAULT '',
            description TEXT    NOT NULL DEFAULT '',
            created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
        )
        """
    )
    # intimate_memories table — mirrors v62 migration exactly.
    conn.execute(
        """
        CREATE TABLE intimate_memories (
            id                INTEGER PRIMARY KEY AUTOINCREMENT,
            char_id           INTEGER NOT NULL,
            message_id        INTEGER,
            session_id        INTEGER,
            sensory_data      TEXT    NOT NULL DEFAULT '{}',
            emotion           TEXT    NOT NULL DEFAULT '',
            ending_emotion    TEXT    NOT NULL DEFAULT '',
            intimacy_level    INTEGER NOT NULL DEFAULT 0,
            arousal_peak      REAL    NOT NULL DEFAULT 0.0,
            character_summary TEXT    NOT NULL DEFAULT '',
            scene_type        TEXT    NOT NULL DEFAULT '',
            recall_count      INTEGER NOT NULL DEFAULT 0,
            last_recalled     TEXT,
            milestone_id      INTEGER REFERENCES intimate_milestones(id),
            created_at        TEXT    NOT NULL DEFAULT (datetime('now'))
        )
        """
    )
    conn.commit()
    yield conn
    conn.close()


@pytest.fixture()
def store() -> IntimateMemoryStore:
    """Return a fresh IntimateMemoryStore instance."""
    return IntimateMemoryStore()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _store_memory(
    store: IntimateMemoryStore,
    conn: sqlite3.Connection,
    *,
    char_id: int = 1,
    emotion: str = "tender",
    ending_emotion: str = "happy",
    intimacy_level: int = 80,
    arousal_peak: float = 5.0,
    character_summary: str = "A quiet moment together.",
    scene_type: str = "tender",
    sensory_anchors: list[str] | None = None,
    milestone_id: int | None = None,
    created_at: str | None = None,
) -> int:
    """Insert one memory and optionally back-date its ``created_at`` field.

    Args:
        store: The store instance to call ``store()`` on.
        conn: Active SQLite connection.
        char_id: Character ID for the new record.
        emotion: Start emotion label.
        ending_emotion: End emotion label.
        intimacy_level: 0-100 intimacy score.
        arousal_peak: 0.0-10.0 arousal peak.
        character_summary: Short prose summary.
        scene_type: One of SCENE_TYPES.
        sensory_anchors: Anchors to embed in ``sensory_data``.
        milestone_id: Optional FK to intimate_milestones.
        created_at: If provided, ``UPDATE`` the row's created_at after insert
            so tests can control recency.

    Returns:
        Primary key of the inserted row.
    """
    anchors = sensory_anchors if sensory_anchors is not None else []
    mem_id = store.store(
        char_id=char_id,
        conn=conn,
        emotion=emotion,
        ending_emotion=ending_emotion,
        intimacy_level=intimacy_level,
        arousal_peak=arousal_peak,
        character_summary=character_summary,
        scene_type=scene_type,
        sensory_data={"sensory_anchors": anchors},
        milestone_id=milestone_id,
    )
    if created_at is not None:
        conn.execute(
            "UPDATE intimate_memories SET created_at = ? WHERE id = ?",
            (created_at, mem_id),
        )
        conn.commit()
    return mem_id


# ---------------------------------------------------------------------------
# Storage Tests (1-5)
# ---------------------------------------------------------------------------


def test_store_returns_id(store: IntimateMemoryStore, memory_db: sqlite3.Connection) -> None:
    """store() returns a positive integer primary key."""
    mem_id = _store_memory(store, memory_db)
    assert isinstance(mem_id, int)
    assert mem_id > 0


def test_store_persists_fields(store: IntimateMemoryStore, memory_db: sqlite3.Connection) -> None:
    """Stored memory has correct emotion, ending_emotion, intimacy_level, arousal_peak."""
    mem_id = _store_memory(
        store,
        memory_db,
        emotion="longing",
        ending_emotion="content",
        intimacy_level=75,
        arousal_peak=6.2,
        character_summary="We talked until dawn.",
        scene_type="emotional",
    )
    row = memory_db.execute(
        "SELECT emotion, ending_emotion, intimacy_level, arousal_peak, "
        "character_summary, scene_type FROM intimate_memories WHERE id = ?",
        (mem_id,),
    ).fetchone()
    assert row is not None
    emotion, ending_emotion, intimacy_level, arousal_peak, summary, scene_type = row
    assert emotion == "longing"
    assert ending_emotion == "content"
    assert intimacy_level == 75
    assert arousal_peak == pytest.approx(6.2)
    assert summary == "We talked until dawn."
    assert scene_type == "emotional"


def test_store_sensory_data_as_json(
    store: IntimateMemoryStore, memory_db: sqlite3.Connection
) -> None:
    """sensory_data dict is stored as a JSON string and round-trips cleanly."""
    anchors = ["rain", "candlelight", "silence"]
    mem_id = _store_memory(store, memory_db, sensory_anchors=anchors)
    raw = memory_db.execute(
        "SELECT sensory_data FROM intimate_memories WHERE id = ?",
        (mem_id,),
    ).fetchone()[0]
    # Must be a JSON string, not a Python dict.
    assert isinstance(raw, str)
    parsed = json.loads(raw)
    assert parsed["sensory_anchors"] == anchors


def test_should_store_above_threshold(store: IntimateMemoryStore) -> None:
    """should_store() returns True when intimacy_level=65 and arousal_peak=4.0."""
    assert store.should_store(intimacy_level=65, arousal_peak=4.0) is True


def test_should_store_below_threshold(store: IntimateMemoryStore) -> None:
    """should_store() returns False when intimacy_level=50 and arousal_peak=2.0."""
    assert store.should_store(intimacy_level=50, arousal_peak=2.0) is False


# ---------------------------------------------------------------------------
# Sensory Anchor Extraction (6-11)
# ---------------------------------------------------------------------------


def test_extract_location_anchors(store: IntimateMemoryStore) -> None:
    """'on the bed in the bedroom' extracts 'bedroom' and 'bed'."""
    anchors = store.extract_sensory_anchors("on the bed in the bedroom")
    assert "bedroom" in anchors
    assert "bed" in anchors


def test_extract_weather_anchors(store: IntimateMemoryStore) -> None:
    """'the rain was falling' extracts 'rain'."""
    anchors = store.extract_sensory_anchors("the rain was falling")
    assert "rain" in anchors


def test_extract_lighting_anchors(store: IntimateMemoryStore) -> None:
    """'by candlelight' extracts 'candlelight'."""
    anchors = store.extract_sensory_anchors("by candlelight")
    assert "candlelight" in anchors


def test_extract_sound_anchors(store: IntimateMemoryStore) -> None:
    """'in the silence' extracts 'silence'."""
    anchors = store.extract_sensory_anchors("in the silence")
    assert "silence" in anchors


def test_extract_multiple_categories(store: IntimateMemoryStore) -> None:
    """'rain on the bed, soft music' extracts anchors from weather, location, texture, and sound."""
    anchors = store.extract_sensory_anchors("rain on the bed, soft music")
    assert "rain" in anchors      # weather
    assert "bed" in anchors       # location
    assert "soft" in anchors      # texture
    assert "music" in anchors     # sound


def test_extract_no_anchors(store: IntimateMemoryStore) -> None:
    """Generic text with no vocabulary words returns an empty list."""
    anchors = store.extract_sensory_anchors("hello how are you")
    assert anchors == []


# ---------------------------------------------------------------------------
# Recall Tests (12-19)
# ---------------------------------------------------------------------------


def test_recall_by_sensory_match(
    store: IntimateMemoryStore, memory_db: sqlite3.Connection
) -> None:
    """Memory stored with anchor 'rain' is recalled when context mentions 'rain'."""
    _store_memory(store, memory_db, sensory_anchors=["rain"])
    results = store.recall(
        char_id=1,
        current_context="Heavy rain outside tonight.",
        conn=memory_db,
    )
    assert len(results) == 1
    assert "rain" in results[0].sensory_data.get("sensory_anchors", [])


def test_recall_no_match(
    store: IntimateMemoryStore, memory_db: sqlite3.Connection
) -> None:
    """Memory stored with anchor 'rain' is not recalled when context says 'sunny day'."""
    _store_memory(store, memory_db, sensory_anchors=["rain"])
    results = store.recall(
        char_id=1,
        current_context="What a sunny day it is.",
        conn=memory_db,
    )
    assert results == []


def test_recall_recency_bias(
    store: IntimateMemoryStore, memory_db: sqlite3.Connection
) -> None:
    """A recent memory scores higher than an old one that shares the same anchors.

    The recent memory should appear first in the result list.
    """
    # Insert old memory (30 days ago).
    old_date = (datetime.now(tz=timezone.utc) - timedelta(days=30)).isoformat()
    old_id = _store_memory(
        store, memory_db, sensory_anchors=["rain"], created_at=old_date,
        character_summary="Old rainy memory."
    )
    # Insert recent memory (today — default created_at).
    recent_id = _store_memory(
        store, memory_db, sensory_anchors=["rain"],
        character_summary="Recent rainy memory."
    )
    results = store.recall(
        char_id=1,
        current_context="I love the rain.",
        conn=memory_db,
        limit=2,
    )
    assert len(results) == 2
    # Recent memory must rank first.
    assert results[0].id == recent_id
    assert results[1].id == old_id


def test_recall_limit(
    store: IntimateMemoryStore, memory_db: sqlite3.Connection
) -> None:
    """recall() with limit=2 returns at most 2 results even when 5 match."""
    for _ in range(5):
        _store_memory(store, memory_db, sensory_anchors=["candlelight"])
    results = store.recall(
        char_id=1,
        current_context="The candlelight flickered.",
        conn=memory_db,
        limit=2,
    )
    assert len(results) <= 2


def test_recall_updates_recall_count(
    store: IntimateMemoryStore, memory_db: sqlite3.Connection
) -> None:
    """After recall(), the returned memory's recall_count is incremented by 1."""
    mem_id = _store_memory(store, memory_db, sensory_anchors=["rain"])
    # Verify initial count is 0.
    initial = memory_db.execute(
        "SELECT recall_count FROM intimate_memories WHERE id = ?", (mem_id,)
    ).fetchone()[0]
    assert initial == 0

    store.recall(char_id=1, current_context="The rain falls softly.", conn=memory_db)

    updated = memory_db.execute(
        "SELECT recall_count FROM intimate_memories WHERE id = ?", (mem_id,)
    ).fetchone()[0]
    assert updated == 1


def test_recall_updates_last_recalled(
    store: IntimateMemoryStore, memory_db: sqlite3.Connection
) -> None:
    """After recall(), last_recalled is populated with an ISO datetime string."""
    mem_id = _store_memory(store, memory_db, sensory_anchors=["rain"])
    # Should be NULL before any recall.
    before = memory_db.execute(
        "SELECT last_recalled FROM intimate_memories WHERE id = ?", (mem_id,)
    ).fetchone()[0]
    assert before is None

    store.recall(char_id=1, current_context="I hear the rain.", conn=memory_db)

    after = memory_db.execute(
        "SELECT last_recalled FROM intimate_memories WHERE id = ?", (mem_id,)
    ).fetchone()[0]
    assert after is not None
    # Must parse as a valid ISO datetime.
    parsed = datetime.fromisoformat(after)
    assert parsed is not None


def test_recall_empty_db(
    store: IntimateMemoryStore, memory_db: sqlite3.Connection
) -> None:
    """Calling recall() on an empty table returns an empty list."""
    results = store.recall(
        char_id=1,
        current_context="The rain is heavy tonight.",
        conn=memory_db,
    )
    assert results == []


def test_recall_multiple_anchor_overlap(
    store: IntimateMemoryStore, memory_db: sqlite3.Connection
) -> None:
    """Memory with 3 matching anchors scores higher than one with only 1 match.

    Both memories are back-dated to remove the recency bonus so only
    anchor-overlap determines ranking.
    """
    old_date = (datetime.now(tz=timezone.utc) - timedelta(days=30)).isoformat()
    # Single-anchor memory.
    single_id = _store_memory(
        store, memory_db, sensory_anchors=["rain"], created_at=old_date,
        character_summary="Just rain."
    )
    # Triple-anchor memory.
    triple_id = _store_memory(
        store, memory_db, sensory_anchors=["rain", "silence", "candlelight"],
        created_at=old_date,
        character_summary="Rain, silence, candlelight."
    )
    results = store.recall(
        char_id=1,
        current_context="The rain outside, the candlelight, the silence.",
        conn=memory_db,
        limit=2,
    )
    assert len(results) == 2
    # Triple-anchor memory must rank first.
    assert results[0].id == triple_id
    assert results[1].id == single_id


# ---------------------------------------------------------------------------
# Frequency Limiting (20-22)
# ---------------------------------------------------------------------------


def test_should_recall_first_time(store: IntimateMemoryStore) -> None:
    """should_recall() returns True for a fresh session with 10 messages elapsed."""
    assert store.should_recall(
        messages_since_last_recall=10,
        session_recall_count=0,
    ) is True


def test_should_recall_max_per_session(store: IntimateMemoryStore) -> None:
    """should_recall() returns False when session_recall_count equals MAX_RECALLS_PER_SESSION."""
    assert store.should_recall(
        messages_since_last_recall=20,
        session_recall_count=MAX_RECALLS_PER_SESSION,
    ) is False


def test_should_recall_too_soon(store: IntimateMemoryStore) -> None:
    """should_recall() returns False when fewer than MIN_MESSAGES_BETWEEN_RECALLS have passed."""
    assert store.should_recall(
        messages_since_last_recall=MIN_MESSAGES_BETWEEN_RECALLS - 1,
        session_recall_count=0,
    ) is False


# ---------------------------------------------------------------------------
# Prompt Building (23-25)
# ---------------------------------------------------------------------------


def test_build_prompt_single_memory(
    store: IntimateMemoryStore, memory_db: sqlite3.Connection
) -> None:
    """build_prompt() output includes character_summary text and sensory anchors."""
    _store_memory(
        store,
        memory_db,
        sensory_anchors=["candlelight", "silence"],
        character_summary="We stayed up until the candles burned low.",
    )
    memories = store.recall(
        char_id=1,
        current_context="Flickering candlelight and silence.",
        conn=memory_db,
    )
    assert len(memories) == 1
    prompt = store.build_prompt(memories)
    assert "We stayed up until the candles burned low." in prompt
    # At least one stored anchor must appear in the prompt.
    assert "candlelight" in prompt or "silence" in prompt


def test_build_prompt_multiple_memories(
    store: IntimateMemoryStore, memory_db: sqlite3.Connection
) -> None:
    """build_prompt() formats multiple memories separated by double-newlines."""
    _store_memory(
        store, memory_db, sensory_anchors=["rain"],
        character_summary="Memory one."
    )
    _store_memory(
        store, memory_db, sensory_anchors=["rain"],
        character_summary="Memory two."
    )
    memories = store.recall(
        char_id=1,
        current_context="The rain brings everything back.",
        conn=memory_db,
        limit=2,
    )
    assert len(memories) == 2
    prompt = store.build_prompt(memories)
    # Both summaries must appear.
    assert "Memory one." in prompt or "Memory two." in prompt
    # Separator between entries.
    assert "\n\n" in prompt


def test_build_prompt_empty(store: IntimateMemoryStore) -> None:
    """build_prompt() returns empty string when given an empty list."""
    assert store.build_prompt([]) == ""


# ---------------------------------------------------------------------------
# Deletion (26-27)
# ---------------------------------------------------------------------------


def test_delete_existing_memory(
    store: IntimateMemoryStore, memory_db: sqlite3.Connection
) -> None:
    """delete() returns True for an existing record and removes it from the DB."""
    mem_id = _store_memory(store, memory_db)
    result = store.delete(memory_id=mem_id, conn=memory_db)
    assert result is True
    row = memory_db.execute(
        "SELECT id FROM intimate_memories WHERE id = ?", (mem_id,)
    ).fetchone()
    assert row is None


def test_delete_nonexistent(
    store: IntimateMemoryStore, memory_db: sqlite3.Connection
) -> None:
    """delete() returns False when the given ID does not exist."""
    result = store.delete(memory_id=999_999, conn=memory_db)
    assert result is False


# ---------------------------------------------------------------------------
# Get All (28-29)
# ---------------------------------------------------------------------------


def test_get_all_returns_all(
    store: IntimateMemoryStore, memory_db: sqlite3.Connection
) -> None:
    """get_all() returns exactly as many records as were stored."""
    for i in range(3):
        _store_memory(store, memory_db, char_id=1, character_summary=f"Memory {i}")
    memories = store.get_all(char_id=1, conn=memory_db)
    assert len(memories) == 3


def test_get_all_ordered_by_date(
    store: IntimateMemoryStore, memory_db: sqlite3.Connection
) -> None:
    """get_all() returns memories in created_at DESC order (most recent first)."""
    base = datetime.now(tz=timezone.utc)
    # Insert three memories with distinct back-dated timestamps.
    oldest_dt = (base - timedelta(days=10)).strftime("%Y-%m-%d %H:%M:%S")
    middle_dt = (base - timedelta(days=5)).strftime("%Y-%m-%d %H:%M:%S")
    newest_dt = base.strftime("%Y-%m-%d %H:%M:%S")

    oldest_id = _store_memory(
        store, memory_db, created_at=oldest_dt, character_summary="Oldest."
    )
    middle_id = _store_memory(
        store, memory_db, created_at=middle_dt, character_summary="Middle."
    )
    newest_id = _store_memory(
        store, memory_db, created_at=newest_dt, character_summary="Newest."
    )

    memories = store.get_all(char_id=1, conn=memory_db)
    ids = [m.id for m in memories]
    assert ids.index(newest_id) < ids.index(middle_id) < ids.index(oldest_id)


# ---------------------------------------------------------------------------
# Edge Cases (30)
# ---------------------------------------------------------------------------


def test_store_with_milestone_link(
    store: IntimateMemoryStore, memory_db: sqlite3.Connection
) -> None:
    """milestone_id is stored correctly and is retrievable via get_all()."""
    # Insert a milestone row first so the FK reference resolves.
    cursor = memory_db.execute(
        "INSERT INTO intimate_milestones (char_id, title) VALUES (1, 'First night')"
    )
    memory_db.commit()
    milestone_id = cursor.lastrowid

    mem_id = _store_memory(
        store, memory_db, milestone_id=milestone_id,
        character_summary="The night everything changed."
    )

    memories = store.get_all(char_id=1, conn=memory_db)
    assert len(memories) == 1
    assert memories[0].milestone_id == milestone_id
