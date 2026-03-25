"""Tests for backend.adaptive.behavior — behavior adaptation engine.

Covers:
    - compute_behavior_modifiers: empty DB defaults, expected keys, bias clamping.
    - build_behavior_prompt_block: zero modifiers produce empty string; non-zero
      biases produce descriptive natural-language text.
    - check_engagement_regression: no data returns None; stable engagement
      returns None; regression criteria produce a result dict.
    - save_preference_snapshot: inserts a row into preference_history.
    - revert_adaptations: deletes the most recent preference_history row.

All tests use an in-memory SQLite database seeded with the v60 tables — no
filesystem I/O, no shared mutable state between test methods.
"""

from __future__ import annotations

import sqlite3

import pytest

from backend.adaptive.behavior import (
    build_behavior_prompt_block,
    check_engagement_regression,
    compute_behavior_modifiers,
    revert_adaptations,
    save_preference_snapshot,
)

# ---------------------------------------------------------------------------
# Schema helpers
# ---------------------------------------------------------------------------

_ENGAGEMENT_SIGNALS_DDL = """
CREATE TABLE IF NOT EXISTS engagement_signals (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
    char_id                 INTEGER NOT NULL,
    session_id              TEXT    NOT NULL,
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

_PREFERENCE_HISTORY_DDL = """
CREATE TABLE IF NOT EXISTS preference_history (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    char_id               INTEGER NOT NULL,
    pref_response_length  REAL    DEFAULT 0.5,
    pref_formality        REAL    DEFAULT 0.5,
    pref_humor            REAL    DEFAULT 0.5,
    pref_empathy          REAL    DEFAULT 0.5,
    pref_depth            REAL    DEFAULT 0.5,
    window_size           INTEGER DEFAULT 20,
    decay_factor          REAL    DEFAULT 0.95,
    confidence            REAL    DEFAULT 0.0,
    computed_at           TEXT    DEFAULT (datetime('now'))
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

_FULL_SCHEMA = (
    _ENGAGEMENT_SIGNALS_DDL + _PREFERENCE_HISTORY_DDL + _PRIVACY_SETTINGS_DDL
)


def _make_db() -> sqlite3.Connection:
    """Create a fully-initialised in-memory DB with all v60 adaptive tables.

    Returns:
        Open :class:`sqlite3.Connection`.
    """
    conn = sqlite3.connect(":memory:")
    conn.executescript(_FULL_SCHEMA)
    conn.commit()
    return conn


def _insert_signals(
    conn: sqlite3.Connection,
    char_id: int,
    rows: list[dict],
    *,
    base_ts: str = "2026-01-01T00:00:00",
) -> None:
    """Bulk-insert synthetic engagement signal rows for testing.

    Each row receives a unique, monotonically-increasing ``created_at``
    timestamp so that ``ORDER BY created_at DESC`` is deterministic —
    without this, rows with identical timestamps sort arbitrarily and
    baseline/current window splits become non-reproducible.

    Args:
        conn: Open SQLite connection.
        char_id: Target character ID.
        rows: List of dicts; each dict may contain any subset of the signal
            columns.  Missing columns default to 0 / None.
        base_ts: ISO-8601 datetime string for the *first* inserted row.
            Subsequent rows have one second added per row.
    """
    from datetime import datetime, timedelta

    base = datetime.fromisoformat(base_ts)
    for i, row in enumerate(rows):
        ts = (base + timedelta(seconds=i)).strftime("%Y-%m-%d %H:%M:%S")
        conn.execute(
            """INSERT INTO engagement_signals (
                char_id, session_id, turn_number,
                user_msg_length, assistant_msg_length,
                response_time_ms, emoji_count, question_count,
                exclamation_count, sentiment_score,
                topic_drift, intimacy_delta, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                char_id,
                "test-session",
                i + 1,
                row.get("user_msg_length", 50),
                row.get("assistant_msg_length", 100),
                row.get("response_time_ms", None),
                row.get("emoji_count", 0),
                row.get("question_count", 0),
                row.get("exclamation_count", 0),
                row.get("sentiment_score", 0.0),
                row.get("topic_drift", 0.0),
                row.get("intimacy_delta", 0),
                ts,
            ),
        )
    conn.commit()


def _default_modifiers_dict() -> dict:
    """Return a zeroed-out modifier dict matching _default_modifiers() output."""
    return {
        "response_length_bias": 0.0,
        "formality_bias": 0.0,
        "humor_bias": 0.0,
        "empathy_bias": 0.0,
        "depth_bias": 0.0,
        "pacing_hint": "normal",
        "energy_level": "medium",
        "active_adaptations": [],
        "confidence": 0.0,
    }


# ---------------------------------------------------------------------------
# Tests: compute_behavior_modifiers
# ---------------------------------------------------------------------------

# Minimum number of signals required before non-zero biases are produced.
_MIN_SIGNALS = 5


class TestComputeBehaviorModifiers:
    """Tests for compute_behavior_modifiers()."""

    def test_compute_modifiers_empty_db(self):
        """Returns defaults with confidence=0.0 when no signals exist."""
        conn = _make_db()
        mods = compute_behavior_modifiers(char_id=1, conn=conn)
        assert mods["confidence"] == 0.0
        assert mods["response_length_bias"] == 0.0

    def test_compute_modifiers_keys(self):
        """Returns all expected top-level keys."""
        conn = _make_db()
        mods = compute_behavior_modifiers(char_id=1, conn=conn)
        expected_keys = {
            "response_length_bias",
            "formality_bias",
            "humor_bias",
            "empathy_bias",
            "depth_bias",
            "pacing_hint",
            "energy_level",
            "active_adaptations",
            "confidence",
        }
        assert set(mods.keys()) == expected_keys

    def test_compute_modifiers_insufficient_signals_returns_defaults(self):
        """With fewer than _MIN_SIGNALS_FOR_BIAS rows, defaults are returned."""
        conn = _make_db()
        _insert_signals(conn, char_id=1, rows=[{}] * (_MIN_SIGNALS - 1))
        mods = compute_behavior_modifiers(char_id=1, conn=conn)
        assert mods["confidence"] == 0.0
        assert mods["response_length_bias"] == 0.0

    def test_compute_modifiers_bias_clamped_positive(self):
        """All positive biases are within [0, +0.3]."""
        conn = _make_db()
        # Inject signals designed to push all biases high:
        # lots of emoji, lots of questions, very long messages, positive intimacy
        rows = [
            {
                "user_msg_length": 500,
                "emoji_count": 10,
                "question_count": 5,
                "sentiment_score": 0.9,
                "intimacy_delta": 10,
            }
        ] * 20
        _insert_signals(conn, char_id=1, rows=rows)
        mods = compute_behavior_modifiers(char_id=1, conn=conn)
        for key in ("response_length_bias", "humor_bias", "depth_bias", "empathy_bias"):
            assert mods[key] <= 0.3, f"{key} exceeds +0.3: {mods[key]}"
            assert mods[key] >= -0.3, f"{key} below -0.3: {mods[key]}"

    def test_compute_modifiers_bias_clamped_negative(self):
        """All negative biases are within [-0.3, 0]."""
        conn = _make_db()
        # Short messages, no emoji, no questions, negative intimacy
        rows = [
            {
                "user_msg_length": 5,
                "emoji_count": 0,
                "question_count": 0,
                "sentiment_score": -0.9,
                "intimacy_delta": -10,
            }
        ] * 20
        _insert_signals(conn, char_id=1, rows=rows)
        mods = compute_behavior_modifiers(char_id=1, conn=conn)
        for key in ("response_length_bias", "humor_bias", "depth_bias", "empathy_bias"):
            assert mods[key] >= -0.3, f"{key} below -0.3: {mods[key]}"
            assert mods[key] <= 0.3, f"{key} exceeds +0.3: {mods[key]}"

    def test_compute_modifiers_confidence_grows_with_signals(self):
        """Confidence increases as more signals accumulate (up to 1.0)."""
        conn = _make_db()
        _insert_signals(conn, char_id=1, rows=[{}] * 10)
        mods = compute_behavior_modifiers(char_id=1, conn=conn)
        assert 0.0 < mods["confidence"] <= 1.0

    def test_compute_modifiers_confidence_saturates_at_one(self):
        """Confidence reaches 1.0 after _CONFIDENCE_SATURATE_AT signals."""
        conn = _make_db()
        _insert_signals(conn, char_id=1, rows=[{}] * 25)
        mods = compute_behavior_modifiers(char_id=1, conn=conn)
        assert mods["confidence"] == pytest.approx(1.0)

    def test_compute_modifiers_pacing_hint_values(self):
        """pacing_hint is always one of the three allowed strings."""
        conn = _make_db()
        mods = compute_behavior_modifiers(char_id=1, conn=conn)
        assert mods["pacing_hint"] in {"faster", "normal", "slower"}

    def test_compute_modifiers_energy_level_values(self):
        """energy_level is always one of the three allowed strings."""
        conn = _make_db()
        mods = compute_behavior_modifiers(char_id=1, conn=conn)
        assert mods["energy_level"] in {"low", "medium", "high"}

    def test_compute_modifiers_active_adaptations_is_list(self):
        """active_adaptations is always a list."""
        conn = _make_db()
        mods = compute_behavior_modifiers(char_id=1, conn=conn)
        assert isinstance(mods["active_adaptations"], list)

    def test_compute_modifiers_behavior_adaptation_disabled(self):
        """Returns defaults when behavior_adaptation privacy toggle is off."""
        conn = _make_db()
        # Use the row-based privacy_settings table (behavior_adaptation column)
        conn.execute(
            "UPDATE privacy_settings SET behavior_adaptation = 0 WHERE id = 1"
        )
        conn.commit()
        _insert_signals(conn, char_id=1, rows=[{}] * 20)
        mods = compute_behavior_modifiers(char_id=1, conn=conn)
        # Disabled → defaults returned immediately
        assert mods["confidence"] == 0.0

    def test_compute_modifiers_humor_bias_positive_with_emoji(self):
        """humor_bias is positive when avg emoji/message is high."""
        conn = _make_db()
        rows = [{"emoji_count": 5}] * 20
        _insert_signals(conn, char_id=1, rows=rows)
        mods = compute_behavior_modifiers(char_id=1, conn=conn)
        assert mods["humor_bias"] > 0.0

    def test_compute_modifiers_formality_inverse_of_humor(self):
        """formality_bias is the negative of humor_bias."""
        conn = _make_db()
        rows = [{"emoji_count": 3}] * 20
        _insert_signals(conn, char_id=1, rows=rows)
        mods = compute_behavior_modifiers(char_id=1, conn=conn)
        assert mods["formality_bias"] == pytest.approx(-mods["humor_bias"])


# ---------------------------------------------------------------------------
# Tests: build_behavior_prompt_block
# ---------------------------------------------------------------------------


class TestBuildBehaviorPromptBlock:
    """Tests for build_behavior_prompt_block()."""

    def test_build_prompt_block_empty(self):
        """All-zero modifiers produce an empty string."""
        mods = _default_modifiers_dict()
        result = build_behavior_prompt_block(mods)
        assert result == ""

    def test_build_prompt_block_below_threshold(self):
        """Biases below the 0.05 threshold produce an empty string."""
        mods = _default_modifiers_dict()
        mods["response_length_bias"] = 0.04
        mods["humor_bias"] = 0.04
        result = build_behavior_prompt_block(mods)
        assert result == ""

    def test_build_prompt_block_with_length_bias(self):
        """Positive response_length_bias produces text containing 'length'."""
        mods = _default_modifiers_dict()
        mods["response_length_bias"] = 0.15
        mods["confidence"] = 0.72
        result = build_behavior_prompt_block(mods)
        assert result != ""
        assert "length" in result.lower()

    def test_build_prompt_block_with_humor_bias(self):
        """Positive humor_bias produces text mentioning humor."""
        mods = _default_modifiers_dict()
        mods["humor_bias"] = 0.20
        mods["formality_bias"] = -0.20  # inverse expected
        mods["confidence"] = 0.5
        result = build_behavior_prompt_block(mods)
        assert "humor" in result.lower()

    def test_build_prompt_block_includes_confidence(self):
        """The confidence value appears in the prompt block header."""
        mods = _default_modifiers_dict()
        mods["response_length_bias"] = 0.10
        mods["confidence"] = 0.72
        result = build_behavior_prompt_block(mods)
        assert "0.72" in result

    def test_build_prompt_block_includes_pacing(self):
        """Non-default pacing_hint appears in the footer of the block."""
        mods = _default_modifiers_dict()
        mods["response_length_bias"] = 0.10
        mods["pacing_hint"] = "faster"
        mods["confidence"] = 0.5
        result = build_behavior_prompt_block(mods)
        assert "faster" in result

    def test_build_prompt_block_includes_energy(self):
        """Non-medium energy_level appears in the footer of the block."""
        mods = _default_modifiers_dict()
        mods["response_length_bias"] = 0.10
        mods["energy_level"] = "high"
        mods["confidence"] = 0.5
        result = build_behavior_prompt_block(mods)
        assert "high" in result

    def test_build_prompt_block_negative_length_bias(self):
        """Negative response_length_bias produces text suggesting brevity."""
        mods = _default_modifiers_dict()
        mods["response_length_bias"] = -0.15
        mods["confidence"] = 0.5
        result = build_behavior_prompt_block(mods)
        assert "concise" in result.lower() or "shorter" in result.lower()


# ---------------------------------------------------------------------------
# Tests: check_engagement_regression
# ---------------------------------------------------------------------------


class TestCheckEngagementRegression:
    """Tests for check_engagement_regression()."""

    def test_check_regression_no_data(self):
        """Returns None when there are no signals (empty table)."""
        conn = _make_db()
        result = check_engagement_regression(char_id=1, conn=conn, lookback=5)
        assert result is None

    def test_check_regression_insufficient_data(self):
        """Returns None when there are fewer rows than lookback*2."""
        conn = _make_db()
        # Insert only 4 rows; need 10 for lookback=5
        _insert_signals(conn, char_id=1, rows=[{}] * 4)
        result = check_engagement_regression(char_id=1, conn=conn, lookback=5)
        assert result is None

    def test_check_regression_no_drop(self):
        """Returns None when engagement is stable across both windows."""
        conn = _make_db()
        # Identical signals in both windows → no regression
        stable = {"sentiment_score": 0.5, "user_msg_length": 100}
        _insert_signals(conn, char_id=1, rows=[stable] * 10)
        result = check_engagement_regression(char_id=1, conn=conn, lookback=5)
        assert result is None

    def test_check_regression_sentiment_drop_only(self):
        """Returns None when only sentiment drops but message length is stable."""
        conn = _make_db()
        baseline = [{"sentiment_score": 0.8, "user_msg_length": 100}] * 5
        current = [{"sentiment_score": 0.4, "user_msg_length": 100}] * 5
        _insert_signals(conn, char_id=1, rows=baseline + current)
        result = check_engagement_regression(char_id=1, conn=conn, lookback=5)
        # Drop = 0.4, but length did NOT drop → single-condition is insufficient
        assert result is None

    def test_check_regression_length_drop_only(self):
        """Returns None when only message length drops but sentiment is stable."""
        conn = _make_db()
        baseline = [{"sentiment_score": 0.5, "user_msg_length": 200}] * 5
        current = [{"sentiment_score": 0.5, "user_msg_length": 100}] * 5
        _insert_signals(conn, char_id=1, rows=baseline + current)
        result = check_engagement_regression(char_id=1, conn=conn, lookback=5)
        assert result is None

    def test_check_regression_both_conditions_triggers(self):
        """Returns a regression dict when both sentiment and length drop together."""
        conn = _make_db()
        # Baseline: high sentiment, long messages
        baseline = [{"sentiment_score": 0.8, "user_msg_length": 200}] * 5
        # Current: very low sentiment (drop > 0.2) + short messages (drop > 30%)
        current = [{"sentiment_score": 0.4, "user_msg_length": 50}] * 5
        _insert_signals(conn, char_id=1, rows=baseline + current)
        result = check_engagement_regression(char_id=1, conn=conn, lookback=5)
        assert result is not None
        assert result["regressed"] is True
        assert "reason" in result

    def test_check_regression_missing_table_returns_none(self):
        """Returns None gracefully when engagement_signals table does not exist."""
        conn = sqlite3.connect(":memory:")
        result = check_engagement_regression(char_id=1, conn=conn, lookback=5)
        assert result is None


# ---------------------------------------------------------------------------
# Tests: save_preference_snapshot
# ---------------------------------------------------------------------------


class TestSavePreferenceSnapshot:
    """Tests for save_preference_snapshot()."""

    def test_save_preference_snapshot(self):
        """Inserts exactly one row into preference_history."""
        conn = _make_db()
        mods = {
            "response_length_bias": 0.15,
            "formality_bias": -0.10,
            "humor_bias": 0.20,
            "empathy_bias": 0.0,
            "depth_bias": 0.05,
            "confidence": 0.70,
        }
        save_preference_snapshot(char_id=1, modifiers=mods, conn=conn)

        row_count = conn.execute(
            "SELECT COUNT(*) FROM preference_history WHERE char_id = 1"
        ).fetchone()[0]
        assert row_count == 1

    def test_save_preference_snapshot_maps_bias_to_pref_range(self):
        """Bias values in [-0.3, +0.3] are mapped to preference in [0.0, 1.0]."""
        conn = _make_db()
        mods = {
            "response_length_bias": 0.3,   # max positive → should be ~1.0
            "formality_bias": -0.3,         # max negative → should be ~0.0
            "humor_bias": 0.0,              # neutral → should be ~0.5
            "empathy_bias": 0.0,
            "depth_bias": 0.0,
            "confidence": 1.0,
        }
        save_preference_snapshot(char_id=2, modifiers=mods, conn=conn)

        row = conn.execute(
            "SELECT pref_response_length, pref_formality, pref_humor "
            "FROM preference_history WHERE char_id = 2"
        ).fetchone()
        assert row[0] == pytest.approx(1.0)
        assert row[1] == pytest.approx(0.0)
        assert row[2] == pytest.approx(0.5)

    def test_save_preference_snapshot_no_op_when_table_absent(self):
        """No exception raised when preference_history table does not exist."""
        conn = sqlite3.connect(":memory:")
        mods = {"response_length_bias": 0.0, "confidence": 0.0}
        # Should silently no-op
        save_preference_snapshot(char_id=1, modifiers=mods, conn=conn)

    def test_save_preference_snapshot_confidence_stored(self):
        """The confidence value is persisted verbatim."""
        conn = _make_db()
        mods = {
            "response_length_bias": 0.0,
            "formality_bias": 0.0,
            "humor_bias": 0.0,
            "empathy_bias": 0.0,
            "depth_bias": 0.0,
            "confidence": 0.88,
        }
        save_preference_snapshot(char_id=3, modifiers=mods, conn=conn)

        row = conn.execute(
            "SELECT confidence FROM preference_history WHERE char_id = 3"
        ).fetchone()
        assert row[0] == pytest.approx(0.88)


# ---------------------------------------------------------------------------
# Tests: revert_adaptations
# ---------------------------------------------------------------------------


class TestRevertAdaptations:
    """Tests for revert_adaptations()."""

    def test_revert_adaptations(self):
        """Deletes the most recent preference_history row for char_id."""
        conn = _make_db()
        mods = {"response_length_bias": 0.1, "confidence": 0.5}
        save_preference_snapshot(char_id=1, modifiers=mods, conn=conn)
        save_preference_snapshot(char_id=1, modifiers=mods, conn=conn)

        before_count = conn.execute(
            "SELECT COUNT(*) FROM preference_history WHERE char_id = 1"
        ).fetchone()[0]
        assert before_count == 2

        revert_adaptations(char_id=1, conn=conn)

        after_count = conn.execute(
            "SELECT COUNT(*) FROM preference_history WHERE char_id = 1"
        ).fetchone()[0]
        assert after_count == 1

    def test_revert_adaptations_no_rows_is_no_op(self):
        """revert_adaptations is silent when no rows exist for char_id."""
        conn = _make_db()
        revert_adaptations(char_id=99, conn=conn)  # no-op, must not raise

    def test_revert_adaptations_missing_table_is_no_op(self):
        """revert_adaptations is silent when preference_history table is absent."""
        conn = sqlite3.connect(":memory:")
        revert_adaptations(char_id=1, conn=conn)  # no-op, must not raise

    def test_revert_adaptations_only_affects_target_char(self):
        """revert_adaptations does not delete rows for other char_ids."""
        conn = _make_db()
        mods = {"response_length_bias": 0.1, "confidence": 0.5}
        save_preference_snapshot(char_id=1, modifiers=mods, conn=conn)
        save_preference_snapshot(char_id=2, modifiers=mods, conn=conn)

        revert_adaptations(char_id=1, conn=conn)

        count_char1 = conn.execute(
            "SELECT COUNT(*) FROM preference_history WHERE char_id = 1"
        ).fetchone()[0]
        count_char2 = conn.execute(
            "SELECT COUNT(*) FROM preference_history WHERE char_id = 2"
        ).fetchone()[0]
        assert count_char1 == 0
        assert count_char2 == 1
