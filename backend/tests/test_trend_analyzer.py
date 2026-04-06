"""Tests for backend.adaptive.trend_analyzer — multi-session preference drift analysis.

Covers:
    - compute_preference_trends: empty table, single snapshot, rising/falling trends,
      confidence scaling, and missing table tolerance.
    - detect_engagement_pattern: empty signals, peak hour detection, and missing
      table tolerance.
    - generate_trend_summary: empty trends, rising trend output, confidence filter,
      stable-trend filter.
    - check_engagement_regression: no data, stable engagement, and regression detection.

All tests use isolated in-memory SQLite databases — no filesystem I/O, no mocking.
"""

from __future__ import annotations

import sqlite3
from datetime import datetime, timedelta, timezone

import pytest

from backend.adaptive.trend_analyzer import (
    check_engagement_regression,
    compute_preference_trends,
    detect_engagement_pattern,
    generate_trend_summary,
)

# ---------------------------------------------------------------------------
# Schema helpers
# ---------------------------------------------------------------------------

_PREFERENCE_HISTORY_DDL = """
CREATE TABLE preference_history (
    id                   INTEGER PRIMARY KEY,
    char_id              INTEGER,
    snapshot_at          TEXT,
    pref_response_length REAL,
    pref_formality       REAL,
    pref_humor           REAL,
    pref_empathy         REAL,
    pref_depth           REAL
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


def _make_pref_db() -> sqlite3.Connection:
    """Create an in-memory DB with the preference_history table.

    Returns:
        Open :class:`sqlite3.Connection` ready for preference snapshots.
    """
    conn = sqlite3.connect(":memory:")
    conn.execute(_PREFERENCE_HISTORY_DDL)
    conn.commit()
    return conn


def _make_signal_db() -> sqlite3.Connection:
    """Create an in-memory DB with the engagement_signals table.

    Returns:
        Open :class:`sqlite3.Connection` ready for engagement signals.
    """
    conn = sqlite3.connect(":memory:")
    conn.execute(_ENGAGEMENT_SIGNALS_DDL)
    conn.commit()
    return conn


def _make_full_db() -> sqlite3.Connection:
    """Create an in-memory DB with both adaptive tables.

    Returns:
        Open :class:`sqlite3.Connection` with preference_history and
        engagement_signals tables created.
    """
    conn = sqlite3.connect(":memory:")
    conn.execute(_PREFERENCE_HISTORY_DDL)
    conn.execute(_ENGAGEMENT_SIGNALS_DDL)
    conn.commit()
    return conn


def _insert_pref_snapshot(
    conn: sqlite3.Connection,
    char_id: int,
    days_ago: float,
    *,
    pref_response_length: float = 0.5,
    pref_formality: float = 0.5,
    pref_humor: float = 0.5,
    pref_empathy: float = 0.5,
    pref_depth: float = 0.5,
) -> None:
    """Insert a single preference_history snapshot at a fixed offset from now.

    Args:
        conn: Open SQLite connection with preference_history table.
        char_id: Character ID for the snapshot.
        days_ago: Number of days before now (positive = in the past).
        pref_response_length: Preference value in [0, 1].
        pref_formality: Preference value in [0, 1].
        pref_humor: Preference value in [0, 1].
        pref_empathy: Preference value in [0, 1].
        pref_depth: Preference value in [0, 1].
    """
    ts = (datetime.now(timezone.utc) - timedelta(days=days_ago)).strftime(
        "%Y-%m-%d %H:%M:%S"
    )
    conn.execute(
        """INSERT INTO preference_history
           (char_id, snapshot_at,
            pref_response_length, pref_formality, pref_humor,
            pref_empathy, pref_depth)
           VALUES (?, ?, ?, ?, ?, ?, ?)""",
        (
            char_id,
            ts,
            pref_response_length,
            pref_formality,
            pref_humor,
            pref_empathy,
            pref_depth,
        ),
    )
    conn.commit()


def _insert_signal(
    conn: sqlite3.Connection,
    char_id: int,
    *,
    hour: int = 12,
    days_ago: float = 1.0,
    sentiment_score: float = 0.5,
    user_msg_length: int = 100,
    question_count: int = 1,
    session_id: str = "s1",
) -> None:
    """Insert a single engagement_signals row at a fixed time offset.

    Args:
        conn: Open SQLite connection with engagement_signals table.
        char_id: Character ID for the signal.
        hour: Hour of day (0–23) to use in the timestamp.
        days_ago: Number of days before today to place the timestamp.
        sentiment_score: Composite sentiment value in [-1, 1].
        user_msg_length: User message character count.
        question_count: Number of questions in the message.
        session_id: Session identifier string.
    """
    base = datetime.now(timezone.utc) - timedelta(days=days_ago)
    ts = base.replace(hour=hour, minute=0, second=0, microsecond=0).strftime(
        "%Y-%m-%d %H:%M:%S"
    )
    conn.execute(
        """INSERT INTO engagement_signals
           (char_id, session_id, turn_number, user_msg_length,
            assistant_msg_length, response_time_ms, emoji_count,
            question_count, exclamation_count, sentiment_score,
            topic_drift, intimacy_delta, detected_context, created_at)
           VALUES (?, ?, 1, ?, 100, 500, 0, ?, 0, ?, 0.0, 0, NULL, ?)""",
        (char_id, session_id, user_msg_length, question_count, sentiment_score, ts),
    )
    conn.commit()


# ---------------------------------------------------------------------------
# Tests: compute_preference_trends
# ---------------------------------------------------------------------------


class TestComputePreferenceTrends:
    """Tests for compute_preference_trends()."""

    def test_empty_table_returns_empty(self):
        """No preference_history rows for char_id returns an empty dict."""
        conn = _make_pref_db()
        result = compute_preference_trends(1, conn, window_days=14)
        assert result == {}

    def test_single_snapshot_returns_stable(self):
        """One snapshot produces stable direction for all preference dimensions."""
        conn = _make_pref_db()
        _insert_pref_snapshot(conn, char_id=1, days_ago=1.0, pref_humor=0.8)
        result = compute_preference_trends(1, conn, window_days=14)
        # Single point → not enough for velocity — all should be stable
        for dim_data in result.values():
            assert dim_data["direction"] == "stable"

    def test_rising_trend_detected(self):
        """Five snapshots with increasing pref_humor produce direction='rising'."""
        conn = _make_pref_db()
        # Insert 5 snapshots evenly spaced over the last 10 days, humor rising 0.1→0.9
        humor_values = [0.1, 0.3, 0.5, 0.7, 0.9]
        days_offsets = [10.0, 7.5, 5.0, 2.5, 0.5]
        for humor, days in zip(humor_values, days_offsets):
            _insert_pref_snapshot(conn, char_id=1, days_ago=days, pref_humor=humor)
        result = compute_preference_trends(1, conn, window_days=14)
        assert "pref_humor" in result
        assert result["pref_humor"]["direction"] == "rising"

    def test_falling_trend_detected(self):
        """Five snapshots with decreasing pref_formality produce direction='falling'."""
        conn = _make_pref_db()
        formality_values = [0.9, 0.7, 0.5, 0.3, 0.1]
        days_offsets = [10.0, 7.5, 5.0, 2.5, 0.5]
        for formality, days in zip(formality_values, days_offsets):
            _insert_pref_snapshot(
                conn, char_id=1, days_ago=days, pref_formality=formality
            )
        result = compute_preference_trends(1, conn, window_days=14)
        assert "pref_formality" in result
        assert result["pref_formality"]["direction"] == "falling"

    def test_confidence_scales_with_data_density(self):
        """More snapshots within the window produce higher confidence scores."""
        conn_sparse = _make_pref_db()
        conn_dense = _make_pref_db()

        # Sparse: 2 snapshots in 14-day window
        for days in [10.0, 2.0]:
            _insert_pref_snapshot(conn_sparse, char_id=1, days_ago=days)

        # Dense: 10 snapshots in 14-day window
        for i in range(10):
            _insert_pref_snapshot(conn_dense, char_id=1, days_ago=float(i + 1))

        sparse_result = compute_preference_trends(1, conn_sparse, window_days=14)
        dense_result = compute_preference_trends(1, conn_dense, window_days=14)

        # Both should have data; dense window must have higher or equal confidence
        sparse_conf = list(sparse_result.values())[0]["confidence"]
        dense_conf = list(dense_result.values())[0]["confidence"]
        assert dense_conf >= sparse_conf

    def test_missing_table_returns_empty(self):
        """No preference_history table returns empty dict without raising."""
        conn = sqlite3.connect(":memory:")
        result = compute_preference_trends(1, conn, window_days=14)
        assert result == {}


# ---------------------------------------------------------------------------
# Tests: detect_engagement_pattern
# ---------------------------------------------------------------------------


class TestDetectEngagementPattern:
    """Tests for detect_engagement_pattern()."""

    def test_empty_signals_returns_empty_lists(self):
        """No engagement_signals rows returns empty peak_hours and peak_days."""
        conn = _make_signal_db()
        result = detect_engagement_pattern(1, conn)
        assert result["peak_hours"] == []
        assert result["peak_days"] == []
        assert result["avg_session_gap_hours"] is None

    def test_peak_hours_detected(self):
        """Signals clustered at hour 14 return 14 as the top peak hour."""
        conn = _make_signal_db()
        # Insert 5 signals at hour 14 and 1 signal at hour 8
        for i in range(5):
            _insert_signal(conn, char_id=1, hour=14, days_ago=float(i + 1))
        _insert_signal(conn, char_id=1, hour=8, days_ago=6.0)

        result = detect_engagement_pattern(1, conn)
        assert 14 in result["peak_hours"]
        # Hour 14 must be first (highest count)
        assert result["peak_hours"][0] == 14

    def test_missing_table_returns_empty(self):
        """No engagement_signals table returns the empty sentinel without raising."""
        conn = sqlite3.connect(":memory:")
        result = detect_engagement_pattern(1, conn)
        assert result["peak_hours"] == []
        assert result["peak_days"] == []
        assert result["avg_session_gap_hours"] is None


# ---------------------------------------------------------------------------
# Tests: generate_trend_summary
# ---------------------------------------------------------------------------


class TestGenerateTrendSummary:
    """Tests for generate_trend_summary()."""

    def test_empty_trends_returns_empty_string(self):
        """Empty dict input returns an empty string."""
        assert generate_trend_summary({}) == ""

    def test_rising_trend_generates_summary(self):
        """A rising pref_humor trend with sufficient confidence mentions 'humor'."""
        trends = {
            "pref_humor": {"direction": "rising", "velocity": 0.05, "confidence": 0.6},
        }
        summary = generate_trend_summary(trends)
        assert "humor" in summary

    def test_low_confidence_excluded(self):
        """Trends with confidence <= 0.3 are not included in the summary."""
        trends = {
            "pref_humor": {
                "direction": "rising",
                "velocity": 0.05,
                "confidence": 0.2,  # below threshold
            },
        }
        summary = generate_trend_summary(trends)
        assert summary == ""

    def test_stable_trends_excluded(self):
        """All-stable trends with high confidence produce an empty summary string."""
        trends = {
            "pref_humor": {"direction": "stable", "velocity": 0.0, "confidence": 0.9},
            "pref_formality": {
                "direction": "stable",
                "velocity": 0.0,
                "confidence": 0.8,
            },
        }
        assert generate_trend_summary(trends) == ""

    def test_falling_trend_generates_summary(self):
        """A falling pref_formality trend with sufficient confidence mentions 'formality'."""
        trends = {
            "pref_formality": {
                "direction": "falling",
                "velocity": -0.04,
                "confidence": 0.7,
            },
        }
        summary = generate_trend_summary(trends)
        assert "formality" in summary

    def test_multiple_rising_trends_all_mentioned(self):
        """Multiple rising trends with high confidence appear in the summary."""
        trends = {
            "pref_humor": {"direction": "rising", "velocity": 0.05, "confidence": 0.6},
            "pref_empathy": {
                "direction": "rising",
                "velocity": 0.03,
                "confidence": 0.5,
            },
        }
        summary = generate_trend_summary(trends)
        assert "humor" in summary
        assert "emotional depth" in summary


# ---------------------------------------------------------------------------
# Tests: check_engagement_regression
# ---------------------------------------------------------------------------


class TestCheckEngagementRegression:
    """Tests for check_engagement_regression()."""

    def test_no_data_returns_none(self):
        """Empty engagement_signals table returns None."""
        conn = _make_signal_db()
        result = check_engagement_regression(1, conn, lookback_days=7)
        assert result is None

    def test_no_regression_returns_none(self):
        """Stable sentiment across both windows returns None (no regression)."""
        conn = _make_signal_db()
        # Prior window: days 8-14 ago
        for i in range(5):
            _insert_signal(
                conn,
                char_id=1,
                days_ago=float(8 + i),
                sentiment_score=0.8,
                user_msg_length=200,
                question_count=1,
            )
        # Recent window: last 7 days — same high engagement
        for i in range(5):
            _insert_signal(
                conn,
                char_id=1,
                days_ago=float(i + 1),
                sentiment_score=0.8,
                user_msg_length=200,
                question_count=1,
            )
        result = check_engagement_regression(1, conn, lookback_days=7)
        assert result is None

    def test_regression_detected(self):
        """Sharply declining engagement in the recent window returns a regression dict."""
        conn = _make_signal_db()
        # Prior window (days 8-14): high engagement
        for i in range(5):
            _insert_signal(
                conn,
                char_id=1,
                days_ago=float(8 + i),
                sentiment_score=0.9,
                user_msg_length=300,
                question_count=2,
            )
        # Recent window (days 1-7): very low engagement
        for i in range(5):
            _insert_signal(
                conn,
                char_id=1,
                days_ago=float(i + 1),
                sentiment_score=-0.8,
                user_msg_length=5,
                question_count=0,
            )
        result = check_engagement_regression(1, conn, lookback_days=7)
        assert result is not None
        assert result["regressing"] is True
        assert result["metric"] == "composite_engagement"
        assert result["delta"] < -0.15

    def test_missing_table_returns_none(self):
        """No engagement_signals table returns None without raising."""
        conn = sqlite3.connect(":memory:")
        result = check_engagement_regression(1, conn, lookback_days=7)
        assert result is None

    def test_regression_only_recent_data_returns_none(self):
        """Only recent window data (no prior window) returns None — insufficient comparison."""
        conn = _make_signal_db()
        # Only recent window has data — prior window is empty
        for i in range(3):
            _insert_signal(conn, char_id=1, days_ago=float(i + 1), sentiment_score=0.2)
        result = check_engagement_regression(1, conn, lookback_days=7)
        assert result is None
