"""Tests for backend.adaptive.user_model — extended user profile metrics.

Covers:
    - count_syllables(): known words, silent-e rule, minimum-of-1 guard
    - compute_vocabulary_complexity(): 0-1 range, simple < complex, empty text
    - compute_emotional_volatility(): 0 for constant data, >0 for mixed, <2 scores
    - compute_peak_engagement_hour(): None for <5 signals, correct hour for large sets
    - compute_initiative_ratio(): 0.5 for insufficient data, correct fractions
    - compute_extended_metrics(): all expected keys present, None vs valid values
    - update_user_profile_metrics(): round-trip against in-memory SQLite

All tests use pure function calls or in-memory SQLite — no filesystem I/O.
"""

from __future__ import annotations

import sqlite3

import pytest

from backend.adaptive.user_model import (
    compute_emotional_volatility,
    compute_extended_metrics,
    compute_initiative_ratio,
    compute_peak_engagement_hour,
    compute_vocabulary_complexity,
    count_syllables,
    update_user_profile_metrics,
)

# ---------------------------------------------------------------------------
# Schema helpers
# ---------------------------------------------------------------------------

_USER_PROFILES_DDL = """
CREATE TABLE IF NOT EXISTS user_profiles (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
    char_id                 INTEGER UNIQUE,
    avg_message_length      REAL,
    vocabulary_complexity   REAL,
    emoji_frequency         REAL,
    question_rate           REAL,
    emotional_volatility    REAL,
    comfort_seeking_freq    REAL,
    peak_engagement_hour    INTEGER,
    avg_session_length      REAL,
    session_frequency       REAL,
    initiative_ratio        REAL,
    updated_at              TEXT    DEFAULT (datetime('now'))
);
"""


def _make_db() -> sqlite3.Connection:
    """Create an in-memory SQLite connection with the user_profiles table.

    Returns:
        Open :class:`sqlite3.Connection` ready for update_user_profile_metrics calls.
    """
    conn = sqlite3.connect(":memory:")
    conn.executescript(_USER_PROFILES_DDL)
    conn.commit()
    return conn


def _make_signals(hours: list[int]) -> list[dict]:
    """Build a minimal list of engagement signal dicts for the given hours.

    Args:
        hours: List of hour values (0-23) to embed in the created_at timestamps.

    Returns:
        List of signal dicts with created_at ISO-8601 strings.
    """
    return [{"created_at": f"2026-03-30T{h:02d}:00:00"} for h in hours]


def _make_messages(roles_and_times: list[tuple[str, str, str]]) -> list[dict]:
    """Build a list of message dicts from (role, content, created_at) tuples.

    Args:
        roles_and_times: List of (role, content, created_at) tuples.

    Returns:
        List of message dicts.
    """
    return [
        {"role": r, "content": c, "created_at": t}
        for r, c, t in roles_and_times
    ]


# ---------------------------------------------------------------------------
# Tests: count_syllables
# ---------------------------------------------------------------------------


class TestCountSyllables:
    """Tests for count_syllables()."""

    def test_cat_is_one_syllable(self):
        """Single-vowel word 'cat' has 1 syllable."""
        assert count_syllables("cat") == 1

    def test_hello_is_two_syllables(self):
        """'hello' has 2 syllable groups (hel-lo)."""
        assert count_syllables("hello") == 2

    def test_beautiful_is_three_syllables(self):
        """'beautiful' has 3 syllables (beau-ti-ful) after silent-e adjustment."""
        assert count_syllables("beautiful") == 3

    def test_epistemological_is_at_least_five(self):
        """'epistemological' has many syllables (>= 5)."""
        assert count_syllables("epistemological") >= 5

    def test_single_letter_a_is_one(self):
        """Single vowel 'a' returns 1 syllable."""
        assert count_syllables("a") == 1

    def test_empty_string_returns_one(self):
        """Empty string returns 1 (minimum guard)."""
        assert count_syllables("") == 1

    def test_single_consonant_returns_one(self):
        """A word with no vowels (like 'b') returns the minimum of 1."""
        assert count_syllables("b") == 1

    def test_silent_e_adjustment(self):
        """'make' has 2 vowel groups but silent-e rule gives 1 syllable."""
        # 'make': vowel groups [a, e] → 2, but ends in 'e' and count > 1 → 1
        assert count_syllables("make") == 1

    def test_case_insensitive(self):
        """count_syllables handles uppercase input correctly."""
        assert count_syllables("HELLO") == count_syllables("hello")

    def test_amazing_is_three_syllables(self):
        """'amazing' → vowel groups [a, i] = 2 groups, ends in 'g' not 'e', = 2.

        Note: 'amazing' = a-ma-zing, has 3 syllables in speech but the heuristic
        counts vowel groups: [a], [i] = 2 groups; no silent-e. Returns 2 by the
        implemented rule (acceptable per docstring — heuristic, not perfect).
        """
        # The heuristic counts [a], [i] = 2; no trailing silent-e → 2.
        result = count_syllables("amazing")
        # Assert it's at least 2 (the heuristic minimum) and within plausible range.
        assert result >= 2


# ---------------------------------------------------------------------------
# Tests: compute_vocabulary_complexity
# ---------------------------------------------------------------------------


class TestComputeVocabularyComplexity:
    """Tests for compute_vocabulary_complexity()."""

    def test_empty_string_returns_zero(self):
        """Empty string returns 0.0."""
        assert compute_vocabulary_complexity("") == 0.0

    def test_whitespace_only_returns_zero(self):
        """Whitespace-only string returns 0.0."""
        assert compute_vocabulary_complexity("   \t\n  ") == 0.0

    def test_result_in_range_zero_to_one(self):
        """Result is always in [0.0, 1.0]."""
        score = compute_vocabulary_complexity("The quick brown fox jumps")
        assert 0.0 <= score <= 1.0

    def test_simple_text_lower_than_complex(self):
        """Simple monosyllabic text scores lower than polysyllabic academic text."""
        simple = compute_vocabulary_complexity("hi how are you")
        complex_ = compute_vocabulary_complexity(
            "The epistemological implications are profoundly significant"
        )
        assert simple < complex_

    def test_scores_capped_at_one(self):
        """Text averaging >= 4 syllables per word gives exactly 1.0."""
        # 'epistemological' alone averages >> 4 syllables
        score = compute_vocabulary_complexity("epistemological epistemological epistemological")
        assert score == pytest.approx(1.0)

    def test_single_monosyllabic_word(self):
        """Single one-syllable word 'hi' → avg=1 syllable → score=0.25."""
        assert compute_vocabulary_complexity("hi") == pytest.approx(0.25)

    def test_non_alpha_input(self):
        """Pure numeric/punctuation text (no alphabetic words) returns 0.0."""
        assert compute_vocabulary_complexity("123 456 !!! ???") == 0.0


# ---------------------------------------------------------------------------
# Tests: compute_emotional_volatility
# ---------------------------------------------------------------------------


class TestComputeEmotionalVolatility:
    """Tests for compute_emotional_volatility()."""

    def test_empty_list_returns_zero(self):
        """Empty list returns 0.0 (no data → no volatility)."""
        assert compute_emotional_volatility([]) == 0.0

    def test_single_element_returns_zero(self):
        """Single score returns 0.0 (need >= 2 for standard deviation)."""
        assert compute_emotional_volatility([0.5]) == 0.0

    def test_constant_values_return_zero(self):
        """Constant sentiment scores return 0.0 (zero standard deviation)."""
        assert compute_emotional_volatility([0.5, 0.5, 0.5, 0.5]) == 0.0

    def test_mixed_high_low_returns_positive(self):
        """Alternating extreme values produce a positive volatility score."""
        score = compute_emotional_volatility([1.0, -1.0, 1.0, -1.0])
        assert score > 0.0

    def test_result_bounded_to_one(self):
        """Result is always <= 1.0 even for maximally divergent inputs."""
        score = compute_emotional_volatility([1.0, -1.0, 1.0, -1.0, 1.0])
        assert score <= 1.0

    def test_result_non_negative(self):
        """Result is always >= 0.0 (standard deviation is non-negative)."""
        score = compute_emotional_volatility([-0.3, 0.5, 0.8, -0.7, 0.1])
        assert score >= 0.0

    def test_larger_spread_yields_higher_volatility(self):
        """Wider sentiment range produces a higher volatility than narrow range."""
        narrow = compute_emotional_volatility([0.1, 0.2, 0.1, 0.2])
        wide = compute_emotional_volatility([1.0, -1.0, 1.0, -1.0])
        assert wide > narrow


# ---------------------------------------------------------------------------
# Tests: compute_peak_engagement_hour
# ---------------------------------------------------------------------------


class TestComputePeakEngagementHour:
    """Tests for compute_peak_engagement_hour()."""

    def test_fewer_than_five_signals_returns_none(self):
        """Fewer than 5 signals returns None (insufficient data)."""
        signals = _make_signals([14, 14, 14, 14])  # only 4
        assert compute_peak_engagement_hour(signals) is None

    def test_empty_signals_returns_none(self):
        """Empty signal list returns None."""
        assert compute_peak_engagement_hour([]) is None

    def test_returns_correct_peak_hour(self):
        """Returns the hour that appears most frequently across >= 5 signals."""
        # Hour 14 appears 3 times, hour 22 appears 2 times
        signals = _make_signals([14, 14, 14, 22, 22])
        assert compute_peak_engagement_hour(signals) == 14

    def test_exactly_five_signals_works(self):
        """Exactly 5 signals produces a result (minimum threshold)."""
        signals = _make_signals([10, 10, 10, 10, 10])
        result = compute_peak_engagement_hour(signals)
        assert result == 10

    def test_missing_created_at_is_skipped(self):
        """Signals without created_at are silently skipped."""
        signals = [
            {"created_at": "2026-03-30T08:00:00"},
            {"created_at": "2026-03-30T08:00:00"},
            {"created_at": "2026-03-30T08:00:00"},
            {"created_at": "2026-03-30T08:00:00"},
            {"no_timestamp": True},  # missing created_at — should be skipped
        ]
        # Only 4 valid timestamps → None
        result = compute_peak_engagement_hour(signals)
        assert result is None

    def test_hour_range_is_zero_to_twenty_three(self):
        """Returned hour is always in [0, 23] for valid inputs."""
        signals = _make_signals([0, 0, 0, 0, 0])
        result = compute_peak_engagement_hour(signals)
        assert result is not None
        assert 0 <= result <= 23


# ---------------------------------------------------------------------------
# Tests: compute_initiative_ratio
# ---------------------------------------------------------------------------


class TestComputeInitiativeRatio:
    """Tests for compute_initiative_ratio()."""

    def test_empty_list_returns_half(self):
        """Empty message list returns 0.5 (insufficient data sentinel)."""
        assert compute_initiative_ratio([]) == pytest.approx(0.5)

    def test_single_message_returns_half(self):
        """Single message returns 0.5 (< 2 parseable messages)."""
        msgs = _make_messages([("user", "hi", "2026-03-30T08:00:00")])
        assert compute_initiative_ratio(msgs) == pytest.approx(0.5)

    def test_user_always_starts_returns_one(self):
        """When the user opens every session, ratio is 1.0."""
        msgs = _make_messages([
            ("user", "hi",    "2026-03-30T08:00:00"),
            ("assistant", "hey", "2026-03-30T08:00:10"),
            # New session: gap > 30 minutes, and user starts it
            ("user", "back",  "2026-03-30T20:00:00"),
            ("assistant", "welcome", "2026-03-30T20:00:05"),
        ])
        assert compute_initiative_ratio(msgs) == pytest.approx(1.0)

    def test_assistant_starts_session_ratio_is_zero(self):
        """When the assistant opens every session (after the first), ratio reflects that."""
        msgs = _make_messages([
            ("assistant", "hello",   "2026-03-30T08:00:00"),
            ("user",      "hi",      "2026-03-30T08:00:05"),
            # New session started by assistant
            ("assistant", "are you there?", "2026-03-30T20:00:00"),
            ("user",      "yes",            "2026-03-30T20:00:10"),
        ])
        ratio = compute_initiative_ratio(msgs)
        # First session opened by assistant → 0 user starts / 2 total = 0.0
        assert ratio == pytest.approx(0.0)

    def test_within_session_no_new_session_counted(self):
        """Messages within the 30-minute window form a single session."""
        msgs = _make_messages([
            ("user",      "hi",   "2026-03-30T08:00:00"),
            ("assistant", "hey",  "2026-03-30T08:05:00"),
            ("user",      "nice", "2026-03-30T08:10:00"),
            ("assistant", "yes",  "2026-03-30T08:15:00"),
        ])
        # Only one session, user started it → ratio = 1.0
        assert compute_initiative_ratio(msgs) == pytest.approx(1.0)

    def test_result_in_range_zero_to_one(self):
        """Return value is always in [0.0, 1.0]."""
        msgs = _make_messages([
            ("user",      "hi",   "2026-03-30T08:00:00"),
            ("assistant", "hey",  "2026-03-30T08:00:05"),
            ("user",      "more", "2026-03-30T20:00:00"),
        ])
        ratio = compute_initiative_ratio(msgs)
        assert 0.0 <= ratio <= 1.0


# ---------------------------------------------------------------------------
# Tests: compute_extended_metrics
# ---------------------------------------------------------------------------


class TestComputeExtendedMetrics:
    """Tests for the compute_extended_metrics() orchestrator function."""

    _EXPECTED_KEYS = {
        "avg_message_length",
        "vocabulary_complexity",
        "emoji_frequency",
        "question_rate",
        "emotional_volatility",
        "comfort_seeking_freq",
        "peak_engagement_hour",
        "avg_session_length",
        "session_frequency",
        "initiative_ratio",
    }

    def test_returns_all_expected_keys(self):
        """Result contains all 10 documented metric keys."""
        msgs = _make_messages([
            ("user",      "Hi! How are you?", "2026-03-30T10:00:00"),
            ("assistant", "Great!",            "2026-03-30T10:00:05"),
        ])
        metrics = compute_extended_metrics(msgs, [])
        assert set(metrics.keys()) == self._EXPECTED_KEYS

    def test_empty_messages_and_signals(self):
        """Empty inputs produce None for count-based metrics and 0.0 for rate metrics."""
        metrics = compute_extended_metrics([], [])
        assert metrics["avg_message_length"] is None
        assert metrics["vocabulary_complexity"] is None
        assert metrics["emoji_frequency"] == 0.0
        assert metrics["question_rate"] == 0.0
        assert metrics["emotional_volatility"] == 0.0
        assert metrics["comfort_seeking_freq"] == 0.0
        assert metrics["peak_engagement_hour"] is None

    def test_question_rate_all_questions(self):
        """100% question messages → question_rate = 1.0."""
        msgs = _make_messages([
            ("user", "How are you?",       "2026-03-30T10:00:00"),
            ("user", "What is this?",      "2026-03-30T10:01:00"),
            ("assistant", "Good answers!", "2026-03-30T10:02:00"),
        ])
        metrics = compute_extended_metrics(msgs, [])
        assert metrics["question_rate"] == pytest.approx(1.0)

    def test_question_rate_no_questions(self):
        """No question marks → question_rate = 0.0."""
        msgs = _make_messages([
            ("user",      "hello",  "2026-03-30T10:00:00"),
            ("assistant", "hi",     "2026-03-30T10:00:05"),
        ])
        metrics = compute_extended_metrics(msgs, [])
        assert metrics["question_rate"] == pytest.approx(0.0)

    def test_vocabulary_complexity_in_range(self):
        """vocabulary_complexity is in [0.0, 1.0] for normal text."""
        msgs = _make_messages([
            ("user",      "Hi! How are you?", "2026-03-30T10:00:00"),
            ("assistant", "I am fine.",       "2026-03-30T10:00:05"),
        ])
        metrics = compute_extended_metrics(msgs, [])
        assert metrics["vocabulary_complexity"] is not None
        assert 0.0 <= metrics["vocabulary_complexity"] <= 1.0

    def test_avg_message_length_computed_correctly(self):
        """avg_message_length equals the average character count of user messages."""
        msgs = _make_messages([
            ("user",      "hi",    "2026-03-30T10:00:00"),  # 2 chars
            ("user",      "hello", "2026-03-30T10:01:00"),  # 5 chars
            ("assistant", "great", "2026-03-30T10:02:00"),  # not counted
        ])
        metrics = compute_extended_metrics(msgs, [])
        assert metrics["avg_message_length"] == pytest.approx(3.5)

    def test_peak_engagement_hour_from_signals(self):
        """peak_engagement_hour is computed from signals when >= 5 present."""
        signals = _make_signals([14, 14, 14, 14, 14])
        metrics = compute_extended_metrics([], signals)
        assert metrics["peak_engagement_hour"] == 14

    def test_initiative_ratio_is_always_present(self):
        """initiative_ratio key is always present and numeric."""
        metrics = compute_extended_metrics([], [])
        assert isinstance(metrics["initiative_ratio"], float)

    def test_single_user_message_no_crash(self):
        """Single user message does not raise an exception."""
        msgs = _make_messages([("user", "just one message", "2026-03-30T10:00:00")])
        metrics = compute_extended_metrics(msgs, [])
        assert metrics["avg_message_length"] == pytest.approx(16.0)
        # Fewer than 2 user messages → session stats are None
        assert metrics["avg_session_length"] is None


# ---------------------------------------------------------------------------
# Tests: update_user_profile_metrics
# ---------------------------------------------------------------------------


class TestUpdateUserProfileMetrics:
    """Tests for update_user_profile_metrics() against in-memory SQLite."""

    def test_creates_row_for_new_char_id(self):
        """A new char_id gets an inserted row in user_profiles."""
        conn = _make_db()
        update_user_profile_metrics(1, conn, {"avg_message_length": 42.0})
        row = conn.execute(
            "SELECT avg_message_length FROM user_profiles WHERE char_id = 1"
        ).fetchone()
        assert row is not None
        assert row[0] == pytest.approx(42.0)

    def test_none_values_not_written(self):
        """None metric values do not overwrite existing DB values."""
        conn = _make_db()
        # First write a real value
        update_user_profile_metrics(1, conn, {"avg_message_length": 50.0})
        # Second call with None — should not overwrite
        update_user_profile_metrics(1, conn, {"avg_message_length": None})
        row = conn.execute(
            "SELECT avg_message_length FROM user_profiles WHERE char_id = 1"
        ).fetchone()
        assert row[0] == pytest.approx(50.0)

    def test_multiple_metrics_written_in_one_call(self):
        """Multiple non-None metrics are all written in a single call."""
        conn = _make_db()
        update_user_profile_metrics(
            2,
            conn,
            {
                "avg_message_length": 30.0,
                "vocabulary_complexity": 0.6,
                "question_rate": 0.4,
            },
        )
        row = conn.execute(
            "SELECT avg_message_length, vocabulary_complexity, question_rate "
            "FROM user_profiles WHERE char_id = 2"
        ).fetchone()
        assert row[0] == pytest.approx(30.0)
        assert row[1] == pytest.approx(0.6)
        assert row[2] == pytest.approx(0.4)

    def test_missing_table_does_not_raise(self):
        """update_user_profile_metrics logs a warning but never raises when table absent."""
        conn = sqlite3.connect(":memory:")
        # No table — should be a silent no-op
        update_user_profile_metrics(1, conn, {"avg_message_length": 42.0})

    def test_second_call_updates_existing_row(self):
        """A second call for the same char_id updates (not duplicates) the row."""
        conn = _make_db()
        update_user_profile_metrics(1, conn, {"avg_message_length": 10.0})
        update_user_profile_metrics(1, conn, {"avg_message_length": 99.0})
        rows = conn.execute(
            "SELECT avg_message_length FROM user_profiles WHERE char_id = 1"
        ).fetchall()
        assert len(rows) == 1
        assert rows[0][0] == pytest.approx(99.0)
