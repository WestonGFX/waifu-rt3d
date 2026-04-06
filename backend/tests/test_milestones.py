"""Tests for backend.adaptive.milestones — relationship milestone detection.

Covers:
    - check_milestones: first conversation, first deep talk, loyalty_10,
      deduplication, missing-table tolerance, and emotional_trust detection.
    - get_milestones: returns recorded rows, empty list, missing table tolerance.
    - build_milestone_context: compact block format and empty-milestone handling.

All tests use isolated in-memory SQLite databases — no filesystem I/O, no mocking.
"""

from __future__ import annotations

import sqlite3

import pytest

from backend.adaptive.milestones import (
    MILESTONES,
    build_milestone_context,
    check_milestones,
    get_milestones,
)

# ---------------------------------------------------------------------------
# Schema helpers
# ---------------------------------------------------------------------------

_MESSAGES_DDL = """
CREATE TABLE messages (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER,
    char_id    INTEGER,
    role       TEXT,
    content    TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    ts         INTEGER
)
"""

_RELATIONSHIP_MILESTONES_DDL = """
CREATE TABLE relationship_milestones (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    char_id     INTEGER NOT NULL,
    milestone   TEXT NOT NULL,
    description TEXT,
    detected_at TEXT DEFAULT (datetime('now')),
    UNIQUE(char_id, milestone)
)
"""

_ENGAGEMENT_SIGNALS_DDL = """
CREATE TABLE engagement_signals (
    id                   INTEGER PRIMARY KEY,
    char_id              INTEGER,
    session_id           TEXT,
    turn_number          INTEGER,
    user_msg_length      INTEGER,
    assistant_msg_length INTEGER,
    response_time_ms     INTEGER,
    emoji_count          INTEGER,
    question_count       INTEGER,
    exclamation_count    INTEGER,
    sentiment_score      REAL,
    topic_drift          REAL,
    intimacy_delta       INTEGER,
    detected_context     TEXT,
    created_at           TEXT DEFAULT (datetime('now'))
)
"""

_SESSIONS_DDL = """
CREATE TABLE sessions (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    character_id INTEGER,
    created_at   TEXT DEFAULT (datetime('now'))
)
"""


def _make_full_db() -> sqlite3.Connection:
    """Create an in-memory DB with all milestone-related tables.

    Returns:
        Open :class:`sqlite3.Connection` with messages, relationship_milestones,
        engagement_signals, and sessions tables created.
    """
    conn = sqlite3.connect(":memory:")
    conn.execute(_MESSAGES_DDL)
    conn.execute(_RELATIONSHIP_MILESTONES_DDL)
    conn.execute(_ENGAGEMENT_SIGNALS_DDL)
    conn.execute(_SESSIONS_DDL)
    conn.commit()
    return conn


def _insert_messages(
    conn: sqlite3.Connection,
    char_id: int,
    session_id: int,
    count: int,
) -> None:
    """Insert *count* alternating user/assistant messages for a session.

    Args:
        conn: Open SQLite connection with messages table.
        char_id: Character ID to tag on each row.
        session_id: Session ID integer for the messages.
        count: Total number of message rows to insert.
    """
    for i in range(count):
        role = "user" if i % 2 == 0 else "assistant"
        conn.execute(
            "INSERT INTO messages (session_id, char_id, role, content) VALUES (?, ?, ?, ?)",
            (session_id, char_id, role, f"message {i}"),
        )
    conn.commit()


def _insert_signal(
    conn: sqlite3.Connection,
    char_id: int,
    sentiment_score: float = 0.5,
    detected_context: str | None = None,
) -> None:
    """Insert a single engagement_signals row with the given sentiment.

    Args:
        conn: Open SQLite connection with engagement_signals table.
        char_id: Character ID to tag on the row.
        sentiment_score: Sentiment value in [-1, 1].
        detected_context: Optional context tag string.
    """
    conn.execute(
        """INSERT INTO engagement_signals
           (char_id, session_id, turn_number, user_msg_length,
            assistant_msg_length, response_time_ms, emoji_count,
            question_count, exclamation_count, sentiment_score,
            topic_drift, intimacy_delta, detected_context)
           VALUES (?, 's1', 1, 100, 100, 500, 0, 1, 0, ?, 0.0, 0, ?)""",
        (char_id, sentiment_score, detected_context),
    )
    conn.commit()


# ---------------------------------------------------------------------------
# Tests: check_milestones
# ---------------------------------------------------------------------------


class TestCheckMilestones:
    """Tests for check_milestones()."""

    def test_first_conversation_detected(self):
        """Two or more messages for a character triggers first_conversation milestone."""
        conn = _make_full_db()
        _insert_messages(conn, char_id=1, session_id=1, count=2)
        newly = check_milestones(1, conn)
        milestone_keys = [m["milestone"] for m in newly]
        assert "first_conversation" in milestone_keys

    def test_first_deep_talk_detected(self):
        """More than 20 messages in a single session triggers first_deep_talk."""
        conn = _make_full_db()
        # 25 messages in session 1 satisfies both first_conversation and first_deep_talk
        _insert_messages(conn, char_id=1, session_id=1, count=25)
        newly = check_milestones(1, conn)
        milestone_keys = [m["milestone"] for m in newly]
        assert "first_deep_talk" in milestone_keys

    def test_loyalty_10_detected(self):
        """Messages spread across 10 distinct session IDs triggers loyalty_10."""
        conn = _make_full_db()
        for session_id in range(1, 11):
            _insert_messages(conn, char_id=1, session_id=session_id, count=2)
        newly = check_milestones(1, conn)
        milestone_keys = [m["milestone"] for m in newly]
        assert "loyalty_10" in milestone_keys

    def test_no_duplicate_milestones(self):
        """Running check_milestones twice does not duplicate already-recorded milestones."""
        conn = _make_full_db()
        _insert_messages(conn, char_id=1, session_id=1, count=2)
        first_run = check_milestones(1, conn)
        second_run = check_milestones(1, conn)
        # The second run must not return milestones already recorded in the first run
        first_keys = {m["milestone"] for m in first_run}
        second_keys = {m["milestone"] for m in second_run}
        # Any milestone in first_keys must NOT appear in second_keys
        overlap = first_keys & second_keys
        assert overlap == set()

    def test_missing_tables_graceful(self):
        """No messages or relationship_milestones tables returns [] without error."""
        conn = sqlite3.connect(":memory:")
        result = check_milestones(1, conn)
        assert result == []

    def test_emotional_trust_detected(self):
        """High absolute-value sentiment signals trigger emotional_trust milestone."""
        conn = _make_full_db()
        # Insert 20 signals with high |sentiment| to satisfy the rolling average threshold
        for _ in range(20):
            _insert_signal(conn, char_id=1, sentiment_score=0.9)
        newly = check_milestones(1, conn)
        milestone_keys = [m["milestone"] for m in newly]
        assert "emotional_trust" in milestone_keys

    def test_newly_achieved_contain_required_keys(self):
        """Each returned milestone dict contains milestone, description, and detected_at."""
        conn = _make_full_db()
        _insert_messages(conn, char_id=1, session_id=1, count=2)
        newly = check_milestones(1, conn)
        assert len(newly) >= 1
        for m in newly:
            assert "milestone" in m
            assert "description" in m
            assert "detected_at" in m

    def test_no_milestones_without_data(self):
        """A character with no messages, signals, or sessions achieves no milestones."""
        conn = _make_full_db()
        newly = check_milestones(1, conn)
        assert newly == []


# ---------------------------------------------------------------------------
# Tests: get_milestones
# ---------------------------------------------------------------------------


class TestGetMilestones:
    """Tests for get_milestones()."""

    def test_returns_achieved_milestones(self):
        """Rows inserted directly into relationship_milestones are returned."""
        conn = _make_full_db()
        conn.execute(
            """INSERT INTO relationship_milestones (char_id, milestone, description)
               VALUES (?, ?, ?)""",
            (1, "first_conversation", MILESTONES["first_conversation"]),
        )
        conn.commit()
        rows = get_milestones(1, conn)
        assert len(rows) == 1
        assert rows[0]["milestone"] == "first_conversation"
        assert rows[0]["description"] == MILESTONES["first_conversation"]

    def test_empty_returns_empty_list(self):
        """No milestones recorded for char_id returns an empty list."""
        conn = _make_full_db()
        rows = get_milestones(1, conn)
        assert rows == []

    def test_missing_table_returns_empty(self):
        """No relationship_milestones table returns [] gracefully."""
        conn = sqlite3.connect(":memory:")
        rows = get_milestones(1, conn)
        assert rows == []

    def test_filters_by_char_id(self):
        """get_milestones only returns rows for the requested character."""
        conn = _make_full_db()
        conn.execute(
            "INSERT INTO relationship_milestones (char_id, milestone, description) VALUES (?, ?, ?)",
            (1, "first_conversation", "desc"),
        )
        conn.execute(
            "INSERT INTO relationship_milestones (char_id, milestone, description) VALUES (?, ?, ?)",
            (2, "loyalty_10", "desc"),
        )
        conn.commit()
        rows_1 = get_milestones(1, conn)
        rows_2 = get_milestones(2, conn)
        assert len(rows_1) == 1
        assert rows_1[0]["milestone"] == "first_conversation"
        assert len(rows_2) == 1
        assert rows_2[0]["milestone"] == "loyalty_10"

    def test_ordered_newest_first(self):
        """Milestones are returned with the most recently detected one first."""
        conn = _make_full_db()
        conn.execute(
            """INSERT INTO relationship_milestones
               (char_id, milestone, description, detected_at)
               VALUES (?, ?, ?, ?)""",
            (1, "first_conversation", "desc", "2026-01-01 10:00:00"),
        )
        conn.execute(
            """INSERT INTO relationship_milestones
               (char_id, milestone, description, detected_at)
               VALUES (?, ?, ?, ?)""",
            (1, "loyalty_10", "desc", "2026-03-01 10:00:00"),
        )
        conn.commit()
        rows = get_milestones(1, conn)
        assert rows[0]["milestone"] == "loyalty_10"
        assert rows[1]["milestone"] == "first_conversation"


# ---------------------------------------------------------------------------
# Tests: build_milestone_context
# ---------------------------------------------------------------------------


class TestBuildMilestoneContext:
    """Tests for build_milestone_context()."""

    def test_builds_compact_block(self):
        """Recorded milestones produce a '[Relationship: ...]' context string."""
        conn = _make_full_db()
        conn.execute(
            "INSERT INTO relationship_milestones (char_id, milestone, description) VALUES (?, ?, ?)",
            (1, "loyalty_10", MILESTONES["loyalty_10"]),
        )
        conn.commit()
        context = build_milestone_context(1, conn)
        assert context.startswith("[Relationship:")
        assert context.endswith("]")
        # Should mention the compact label for loyalty_10
        assert "10 sessions" in context

    def test_empty_milestones_returns_empty(self):
        """No recorded milestones returns an empty string."""
        conn = _make_full_db()
        context = build_milestone_context(1, conn)
        assert context == ""

    def test_missing_table_returns_empty(self):
        """No relationship_milestones table returns empty string without raising."""
        conn = sqlite3.connect(":memory:")
        context = build_milestone_context(1, conn)
        assert context == ""

    def test_multiple_milestones_all_included(self):
        """All recorded milestones appear in the context block."""
        conn = _make_full_db()
        for key in ("first_conversation", "loyalty_10", "emotional_trust"):
            conn.execute(
                "INSERT INTO relationship_milestones (char_id, milestone, description) VALUES (?, ?, ?)",
                (1, key, MILESTONES[key]),
            )
        conn.commit()
        context = build_milestone_context(1, conn)
        assert "10 sessions" in context
        assert "deep emotional trust" in context
