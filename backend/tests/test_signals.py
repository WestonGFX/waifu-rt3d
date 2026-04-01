"""Tests for backend.adaptive.signals — per-turn engagement signal collection.

Covers:
    - collect_turn_signals: key presence, emoji/question/exclamation counts,
      message lengths, sentiment pass-through.
    - compute_sentiment: positive, negative, neutral, mixed inputs.
    - compute_rolling_averages: decay math, empty list, single-element list.
    - save_signals + get_recent_signals: round-trip against an in-memory SQLite
      database with the v60 schema tables created manually.

All tests use an isolated in-memory database or pure function calls — no
filesystem I/O, no module-level state mutation.
"""

from __future__ import annotations

import sqlite3

import pytest

from backend.adaptive.signals import (
    collect_turn_signals,
    compute_rolling_averages,
    compute_sentiment,
    get_recent_signals,
    save_signals,
)

# ---------------------------------------------------------------------------
# Schema helpers
# ---------------------------------------------------------------------------

_ENGAGEMENT_SIGNALS_DDL = """
CREATE TABLE IF NOT EXISTS engagement_signals (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
    char_id                 INTEGER NOT NULL,
    session_id              TEXT NOT NULL,
    turn_number             INTEGER NOT NULL DEFAULT 0,
    user_msg_length         INTEGER NOT NULL DEFAULT 0,
    assistant_msg_length    INTEGER NOT NULL DEFAULT 0,
    response_time_ms        INTEGER,
    emoji_count             INTEGER DEFAULT 0,
    question_count          INTEGER DEFAULT 0,
    exclamation_count       INTEGER DEFAULT 0,
    sentiment_score         REAL    DEFAULT 0.0,
    topic_drift             REAL    DEFAULT 0.0,
    intimacy_delta          INTEGER DEFAULT 0,
    created_at              TEXT    DEFAULT (datetime('now'))
);
"""

_PRIVACY_SETTINGS_DDL = """
CREATE TABLE IF NOT EXISTS privacy_settings (
    id                   INTEGER PRIMARY KEY DEFAULT 1
                             CHECK (id = 1),
    signal_collection    INTEGER DEFAULT 1,
    preference_learning  INTEGER DEFAULT 1,
    behavior_adaptation  INTEGER DEFAULT 1,
    topic_tracking       INTEGER DEFAULT 1,
    intimacy_tracking    INTEGER DEFAULT 1,
    updated_at           TEXT    DEFAULT (datetime('now'))
);
INSERT OR IGNORE INTO privacy_settings (id) VALUES (1);
"""


def _make_db(*, signal_collection: int = 1) -> sqlite3.Connection:
    """Create an in-memory SQLite DB with the v60 adaptive tables.

    Args:
        signal_collection: Value to seed the privacy_settings row with.
            1 = enabled (default), 0 = disabled (opt-out).

    Returns:
        Open :class:`sqlite3.Connection` with both required tables populated.
    """
    conn = sqlite3.connect(":memory:")
    conn.executescript(_ENGAGEMENT_SIGNALS_DDL + _PRIVACY_SETTINGS_DDL)
    conn.execute(
        "UPDATE privacy_settings SET signal_collection = ? WHERE id = 1",
        (signal_collection,),
    )
    conn.commit()
    return conn


# ---------------------------------------------------------------------------
# Tests: collect_turn_signals
# ---------------------------------------------------------------------------


class TestCollectTurnSignals:
    """Tests for the collect_turn_signals() function."""

    def test_collect_turn_signals_basic(self):
        """Returns a dict containing all expected keys."""
        expected_keys = {
            "user_msg_length",
            "assistant_msg_length",
            "response_time_ms",
            "emoji_count",
            "question_count",
            "exclamation_count",
            "sentiment_score",
            "topic_drift",
            "intimacy_delta",
            "turn_number",
            "detected_context",
        }
        result = collect_turn_signals(
            user_msg="Hello there",
            assistant_msg="Hi!",
            turn_number=1,
        )
        assert set(result.keys()) == expected_keys

    def test_collect_turn_signals_emoji_count(self):
        """Counts Unicode emoji characters in the user message."""
        result = collect_turn_signals(
            user_msg="I love this \U0001F600\U0001F62D so much",
            assistant_msg="Thanks!",
            turn_number=1,
        )
        assert result["emoji_count"] == 2

    def test_collect_turn_signals_emoji_count_none(self):
        """Returns 0 when no emoji are present."""
        result = collect_turn_signals(
            user_msg="No emoji here at all",
            assistant_msg="Noted.",
            turn_number=1,
        )
        assert result["emoji_count"] == 0

    def test_collect_turn_signals_question_count(self):
        """Counts '?' characters in the user message."""
        result = collect_turn_signals(
            user_msg="Why? How? When?",
            assistant_msg="Good questions.",
            turn_number=2,
        )
        assert result["question_count"] == 3

    def test_collect_turn_signals_exclamation_count(self):
        """Counts '!' characters in the user message."""
        result = collect_turn_signals(
            user_msg="Wow! That's amazing!! Really!!!",
            assistant_msg="I'm glad!",
            turn_number=3,
        )
        assert result["exclamation_count"] == 6

    def test_collect_turn_signals_msg_lengths(self):
        """Captures both user and assistant message character lengths."""
        user_msg = "Short"
        assistant_msg = "A much longer assistant response here."
        result = collect_turn_signals(
            user_msg=user_msg,
            assistant_msg=assistant_msg,
            turn_number=1,
        )
        assert result["user_msg_length"] == len(user_msg)
        assert result["assistant_msg_length"] == len(assistant_msg)

    def test_collect_turn_signals_empty_messages(self):
        """Empty strings produce zero lengths and zero emoji/question/exclamation counts."""
        result = collect_turn_signals(
            user_msg="",
            assistant_msg="",
            turn_number=1,
        )
        assert result["user_msg_length"] == 0
        assert result["assistant_msg_length"] == 0
        assert result["emoji_count"] == 0
        assert result["question_count"] == 0
        assert result["exclamation_count"] == 0
        assert result["sentiment_score"] == 0.0

    def test_collect_turn_signals_response_time_passthrough(self):
        """response_time_ms is passed through unchanged."""
        result = collect_turn_signals(
            user_msg="Hey",
            assistant_msg="Hey back",
            turn_number=1,
            response_time_ms=2500,
        )
        assert result["response_time_ms"] == 2500

    def test_collect_turn_signals_response_time_none(self):
        """response_time_ms is None when not provided."""
        result = collect_turn_signals(
            user_msg="Hey",
            assistant_msg="Hey back",
            turn_number=1,
        )
        assert result["response_time_ms"] is None

    def test_collect_turn_signals_intimacy_delta_passthrough(self):
        """intimacy_delta is passed through unchanged."""
        result = collect_turn_signals(
            user_msg="I like you",
            assistant_msg="I like you too",
            turn_number=1,
            intimacy_delta=5,
        )
        assert result["intimacy_delta"] == 5

    def test_collect_turn_signals_turn_number_passthrough(self):
        """turn_number is stored in the result dict."""
        result = collect_turn_signals(
            user_msg="Hello",
            assistant_msg="Hi",
            turn_number=42,
        )
        assert result["turn_number"] == 42

    def test_collect_turn_signals_topic_drift_zero_without_embedding(self):
        """topic_drift is 0.0 when no prev_topic_embedding is supplied."""
        result = collect_turn_signals(
            user_msg="Tell me about cats",
            assistant_msg="Cats are great!",
            turn_number=1,
        )
        assert result["topic_drift"] == 0.0


# ---------------------------------------------------------------------------
# Tests: compute_sentiment
# ---------------------------------------------------------------------------


class TestComputeSentiment:
    """Tests for the compute_sentiment() function."""

    def test_compute_sentiment_positive(self):
        """Strongly positive words return a score > 0."""
        score = compute_sentiment("I love this amazing wonderful experience")
        assert score > 0.0

    def test_compute_sentiment_negative(self):
        """Strongly negative words return a score < 0."""
        score = compute_sentiment("This is terrible awful and I hate it")
        assert score < 0.0

    def test_compute_sentiment_neutral(self):
        """Plain neutral text returns 0.0 (no sentiment words match)."""
        score = compute_sentiment("the cat sat on the mat by the window")
        assert score == 0.0

    def test_compute_sentiment_mixed(self):
        """Mixed positive and negative words return a moderate (non-extreme) score."""
        score = compute_sentiment("love amazing terrible awful bad wonderful")
        # 3 positive, 3 negative — should cancel out to 0.0
        assert score == pytest.approx(0.0)

    def test_compute_sentiment_empty_string(self):
        """Empty string returns exactly 0.0."""
        assert compute_sentiment("") == 0.0

    def test_compute_sentiment_only_punctuation(self):
        """Text with only punctuation (no alphabetic words) returns 0.0."""
        assert compute_sentiment("!!! ??? ...") == 0.0

    def test_compute_sentiment_clamped_at_positive_one(self):
        """Score never exceeds +1.0 even with all positive words."""
        # Build a string of 100% positive sentiment words
        text = " ".join(["amazing"] * 20)
        score = compute_sentiment(text)
        assert score <= 1.0

    def test_compute_sentiment_clamped_at_negative_one(self):
        """Score never falls below -1.0 even with all negative words."""
        text = " ".join(["terrible"] * 20)
        score = compute_sentiment(text)
        assert score >= -1.0

    def test_compute_sentiment_case_insensitive(self):
        """Uppercase words are matched against the lowercase word list."""
        score_lower = compute_sentiment("love amazing")
        score_upper = compute_sentiment("LOVE AMAZING")
        assert score_lower == score_upper


# ---------------------------------------------------------------------------
# Tests: compute_rolling_averages
# ---------------------------------------------------------------------------


class TestComputeRollingAverages:
    """Tests for the compute_rolling_averages() function."""

    def test_compute_rolling_averages_basic(self):
        """Decayed average is weighted toward the newer (index-0) entry."""
        # index 0 = newest (weight 1.0), index 1 = older (weight 0.5)
        s_new = {"sentiment_score": 1.0, "emoji_count": 4}
        s_old = {"sentiment_score": 0.0, "emoji_count": 0}
        avgs = compute_rolling_averages([s_new, s_old], decay=0.5)

        # sentiment: (1.0*1.0 + 0.0*0.5) / (1.0 + 0.5) = 1.0/1.5 = 0.6667
        assert avgs["sentiment_score"] == pytest.approx(1.0 / 1.5, abs=1e-4)
        # emoji: (4*1.0 + 0*0.5) / 1.5 = 4/1.5 = 2.6667
        assert avgs["emoji_count"] == pytest.approx(4.0 / 1.5, abs=1e-4)

    def test_compute_rolling_averages_empty(self):
        """Empty signal list returns an empty dict."""
        assert compute_rolling_averages([]) == {}

    def test_compute_rolling_averages_single(self):
        """Single-element list returns the exact values (weight = 1.0)."""
        sig = {"sentiment_score": 0.75, "emoji_count": 2, "turn_number": 5}
        avgs = compute_rolling_averages([sig], decay=0.9)
        assert avgs["sentiment_score"] == pytest.approx(0.75)
        assert avgs["emoji_count"] == pytest.approx(2.0)
        assert avgs["turn_number"] == pytest.approx(5.0)

    def test_compute_rolling_averages_skips_none_values(self):
        """None values are skipped; the field average is computed from present values only."""
        s_new = {"sentiment_score": 0.8, "response_time_ms": None}
        s_old = {"sentiment_score": 0.2, "response_time_ms": 1000}
        avgs = compute_rolling_averages([s_new, s_old], decay=1.0)

        # With decay=1.0, both have equal weight (1.0 each)
        # sentiment: (0.8 + 0.2) / 2 = 0.5
        assert avgs["sentiment_score"] == pytest.approx(0.5)
        # response_time_ms: only the old entry contributes → 1000 / 1.0 = 1000
        assert avgs["response_time_ms"] == pytest.approx(1000.0)

    def test_compute_rolling_averages_ignores_non_numeric_fields(self):
        """Fields not in _NUMERIC_SIGNAL_FIELDS are absent from the result."""
        sig = {"sentiment_score": 0.5, "unknown_field": 99, "turn_number": 1}
        avgs = compute_rolling_averages([sig])
        assert "unknown_field" not in avgs
        assert "sentiment_score" in avgs

    def test_compute_rolling_averages_invalid_decay_raises(self):
        """decay <= 0.0 raises ValueError."""
        with pytest.raises(ValueError):
            compute_rolling_averages([{"sentiment_score": 0.5}], decay=0.0)

    def test_compute_rolling_averages_invalid_decay_negative_raises(self):
        """Negative decay raises ValueError."""
        with pytest.raises(ValueError):
            compute_rolling_averages([{"sentiment_score": 0.5}], decay=-0.1)

    def test_compute_rolling_averages_decay_one_is_simple_mean(self):
        """decay=1.0 produces the unweighted arithmetic mean."""
        signals = [
            {"sentiment_score": 0.6},
            {"sentiment_score": 0.2},
            {"sentiment_score": 1.0},
        ]
        avgs = compute_rolling_averages(signals, decay=1.0)
        assert avgs["sentiment_score"] == pytest.approx((0.6 + 0.2 + 1.0) / 3)


# ---------------------------------------------------------------------------
# Tests: save_signals + get_recent_signals (round-trip)
# ---------------------------------------------------------------------------


class TestSaveAndGetSignals:
    """Round-trip tests for save_signals() and get_recent_signals()."""

    def test_save_signals_and_get_recent(self):
        """save_signals inserts a row; get_recent_signals returns it."""
        conn = _make_db()
        signals = collect_turn_signals(
            user_msg="That's amazing!! \U0001F600",
            assistant_msg="I'm glad!",
            turn_number=1,
            response_time_ms=1200,
            intimacy_delta=2,
        )
        save_signals(char_id=1, session_id="sess-001", signals=signals, conn=conn)

        rows = get_recent_signals(char_id=1, conn=conn, limit=5)
        assert len(rows) == 1
        row = rows[0]
        assert row["char_id"] == 1
        assert row["session_id"] == "sess-001"
        assert row["emoji_count"] == 1
        assert row["exclamation_count"] == 2
        assert row["response_time_ms"] == 1200
        assert row["intimacy_delta"] == 2
        assert row["turn_number"] == 1

    def test_save_signals_respects_privacy_opt_out(self):
        """When signal_collection is disabled, save_signals does not insert."""
        conn = sqlite3.connect(":memory:")
        conn.executescript(_ENGAGEMENT_SIGNALS_DDL)
        # Create the v60 singleton-row privacy_settings table with opt-out
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS privacy_settings (
                id                    INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
                signal_collection     INTEGER DEFAULT 1,
                preference_learning   INTEGER DEFAULT 1,
                behavior_adaptation   INTEGER DEFAULT 1,
                topic_tracking        INTEGER DEFAULT 1,
                intimacy_tracking     INTEGER DEFAULT 1,
                updated_at            TEXT DEFAULT (datetime('now'))
            );
            INSERT INTO privacy_settings (id, signal_collection)
            VALUES (1, 0);
        """)
        conn.commit()

        signals = collect_turn_signals("hi", "hey", turn_number=1)
        save_signals(char_id=1, session_id="sess-002", signals=signals, conn=conn)

        rows = get_recent_signals(char_id=1, conn=conn)
        assert rows == []

    def test_save_signals_default_enabled_when_no_privacy_row(self):
        """When privacy_settings table has no row, signals are saved (opt-in by default)."""
        conn = sqlite3.connect(":memory:")
        conn.executescript(_ENGAGEMENT_SIGNALS_DDL + _PRIVACY_SETTINGS_DDL)
        # Delete the seeded row so the table exists but is empty
        conn.execute("DELETE FROM privacy_settings")
        conn.commit()

        signals = collect_turn_signals("hello", "world", turn_number=1)
        save_signals(char_id=5, session_id="sess-003", signals=signals, conn=conn)

        rows = get_recent_signals(char_id=5, conn=conn)
        assert len(rows) == 1

    def test_get_recent_signals_empty_table(self):
        """get_recent_signals returns [] when no rows exist."""
        conn = _make_db()
        rows = get_recent_signals(char_id=99, conn=conn)
        assert rows == []

    def test_get_recent_signals_filters_by_char_id(self):
        """get_recent_signals only returns rows for the requested char_id."""
        conn = _make_db()
        signals = collect_turn_signals("hi", "hello", turn_number=1)
        save_signals(char_id=1, session_id="s1", signals=signals, conn=conn)
        save_signals(char_id=2, session_id="s2", signals=signals, conn=conn)

        rows_1 = get_recent_signals(char_id=1, conn=conn)
        rows_2 = get_recent_signals(char_id=2, conn=conn)

        assert len(rows_1) == 1
        assert len(rows_2) == 1
        assert rows_1[0]["char_id"] == 1
        assert rows_2[0]["char_id"] == 2

    def test_get_recent_signals_limit(self):
        """get_recent_signals respects the limit parameter."""
        conn = _make_db()
        for i in range(5):
            signals = collect_turn_signals("hi", "hello", turn_number=i + 1)
            save_signals(char_id=1, session_id="s1", signals=signals, conn=conn)

        rows = get_recent_signals(char_id=1, conn=conn, limit=3)
        assert len(rows) == 3

    def test_get_recent_signals_missing_table_returns_empty(self):
        """get_recent_signals returns [] gracefully when the table does not exist."""
        conn = sqlite3.connect(":memory:")
        rows = get_recent_signals(char_id=1, conn=conn)
        assert rows == []

    def test_save_signals_missing_table_does_not_raise(self):
        """save_signals logs and skips when the engagement_signals table is absent."""
        conn = sqlite3.connect(":memory:")
        # No table creation — should be a no-op, not an exception
        signals = collect_turn_signals("hi", "hey", turn_number=1)
        save_signals(char_id=1, session_id="s1", signals=signals, conn=conn)
        # If we reach here without exception the test passes
