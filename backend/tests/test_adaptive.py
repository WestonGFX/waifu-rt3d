"""Tests for the Adaptive Intelligence Engine (backend/adaptive/).

Tests cover:
- compute_engagement_heuristics: metric computation from message lists
- compute_engagement_score: per-exchange 0-1 score, boundary values
- should_reflect: DB-driven threshold logic (no profile, below, above)
- build_reflection_prompt: prompt content verification
- profile_to_prompt_instructions: preference → instruction text mapping

All DB tests use in-memory SQLite with the minimal schema required by the
adaptive module (user_profiles + messages tables from schema v55).
"""

from __future__ import annotations

import sqlite3

import pytest

from backend.adaptive.reflector import (
    build_reflection_prompt,
    compute_engagement_heuristics,
    compute_engagement_score,
    should_reflect,
)
from backend.adaptive.tuner import profile_to_prompt_instructions


# ── Fixtures ──────────────────────────────────────────────────────────────


def _make_adaptive_db() -> sqlite3.Connection:
    """Create an in-memory SQLite DB with the v55 adaptive tables.

    Mirrors the schema described in preflight.py v54→v55 migration docs:
    - ``user_profiles``: per-character preference profile
    - ``messages``: conversation history with a ``ts`` (epoch int) column

    Returns:
        Open in-memory connection with both tables created.
    """
    con = sqlite3.connect(":memory:")
    con.executescript("""
        CREATE TABLE IF NOT EXISTS user_profiles (
            id                  INTEGER PRIMARY KEY AUTOINCREMENT,
            char_id             INTEGER NOT NULL UNIQUE,
            pref_response_length REAL DEFAULT 0.5,
            pref_formality      REAL DEFAULT 0.5,
            pref_humor          REAL DEFAULT 0.5,
            pref_empathy        REAL DEFAULT 0.5,
            pref_depth          REAL DEFAULT 0.5,
            topic_affinities    TEXT DEFAULT '{}',
            last_reflection_at  TEXT DEFAULT NULL,
            created_at          TEXT DEFAULT (datetime('now')),
            updated_at          TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS messages (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id  INTEGER NOT NULL DEFAULT 1,
            role        TEXT NOT NULL,
            text        TEXT NOT NULL,
            ts          INTEGER DEFAULT (strftime('%s','now')),
            char_id     INTEGER DEFAULT 1,
            engagement_score REAL DEFAULT NULL
        );
    """)
    con.commit()
    return con


@pytest.fixture
def tmp_db() -> sqlite3.Connection:
    """Provide an isolated in-memory adaptive DB for each test."""
    con = _make_adaptive_db()
    yield con
    con.close()


# ── Helper builders ────────────────────────────────────────────────────────


def _build_messages(
    n_user: int = 10,
    n_assistant: int = 10,
    user_text: str = "Hello there, how are you doing?",
    assistant_text: str = "I am doing great, thank you for asking!",
) -> list[dict]:
    """Interleave user and assistant messages for fixture convenience.

    Args:
        n_user: Number of user messages to generate.
        n_assistant: Number of assistant messages to generate.
        user_text: Text for user messages.
        assistant_text: Text for assistant messages.

    Returns:
        List of message dicts with role, text, ts keys.
    """
    msgs = []
    for i in range(max(n_user, n_assistant)):
        ts = 1000 + i * 2
        if i < n_user:
            msgs.append({"role": "user", "text": user_text, "ts": ts})
        if i < n_assistant:
            msgs.append({"role": "assistant", "text": assistant_text, "ts": ts + 1})
    return msgs


def _default_profile(
    length: float = 0.5,
    formality: float = 0.5,
    humor: float = 0.5,
    empathy: float = 0.5,
    depth: float = 0.5,
    topics: dict | None = None,
) -> dict:
    """Build a minimal preference profile dict for tuner tests.

    Args:
        length: pref_response_length value (default 0.5).
        formality: pref_formality value (default 0.5).
        humor: pref_humor value (default 0.5).
        empathy: pref_empathy value (default 0.5).
        depth: pref_depth value (default 0.5).
        topics: topic_affinities dict (default empty).

    Returns:
        Complete profile dict suitable for profile_to_prompt_instructions.
    """
    return {
        "pref_response_length": length,
        "pref_formality": formality,
        "pref_humor": humor,
        "pref_empathy": empathy,
        "pref_depth": depth,
        "topic_affinities": topics or {},
    }


# ── TestEngagementHeuristics ───────────────────────────────────────────────


class TestEngagementHeuristics:
    """Tests for compute_engagement_heuristics — metrics derived from message lists."""

    def test_basic_metrics(self):
        """Messages produce expected length/ratio metrics."""
        messages = [
            {"role": "user", "text": "Hello there!", "ts": 1000},
            {
                "role": "assistant",
                "text": "Hi! How are you doing today? I've been thinking about you.",
                "ts": 1002,
            },
            {"role": "user", "text": "Good thanks", "ts": 1010},
        ]
        result = compute_engagement_heuristics(messages)

        assert result["avg_user_msg_length"] > 0
        # User messages average shorter than the assistant reply
        assert result["length_ratio"] < 1.0
        # Neither user message contains "?"
        assert result["question_frequency"] == 0.0

    def test_question_detection(self):
        """Messages with ? are counted in question_frequency."""
        messages = [
            {"role": "user", "text": "What do you think?", "ts": 1000},
            {"role": "assistant", "text": "I think it's great!", "ts": 1002},
            {"role": "user", "text": "Really? Tell me more?", "ts": 1005},
        ]
        result = compute_engagement_heuristics(messages)

        # Both user messages contain ? → frequency should be 1.0
        assert result["question_frequency"] == 1.0

    def test_empty_messages(self):
        """Empty message list returns zeroed metrics."""
        result = compute_engagement_heuristics([])

        assert result["avg_user_msg_length"] == 0
        assert result["avg_assistant_msg_length"] == 0
        assert result["length_ratio"] == 0.0
        assert result["question_frequency"] == 0.0

    def test_only_user_messages(self):
        """Only user messages — assistant length 0, length_ratio 0."""
        messages = [
            {"role": "user", "text": "Just me talking", "ts": 1000},
            {"role": "user", "text": "Still talking", "ts": 1001},
        ]
        result = compute_engagement_heuristics(messages)

        assert result["avg_user_msg_length"] > 0
        assert result["avg_assistant_msg_length"] == 0.0
        assert result["length_ratio"] == 0.0

    def test_only_assistant_messages(self):
        """Only assistant messages — user metrics are all 0."""
        messages = [
            {"role": "assistant", "text": "Hello user!", "ts": 1000},
        ]
        result = compute_engagement_heuristics(messages)

        assert result["avg_user_msg_length"] == 0.0
        assert result["avg_assistant_msg_length"] > 0
        assert result["question_frequency"] == 0.0

    def test_partial_question_frequency(self):
        """Only some user messages have ? → fractional frequency."""
        messages = [
            {"role": "user", "text": "I love anime.", "ts": 1000},
            {"role": "user", "text": "What's your favorite show?", "ts": 1001},
            {"role": "user", "text": "Mine is Steins;Gate.", "ts": 1002},
            {"role": "user", "text": "Do you like it?", "ts": 1003},
        ]
        result = compute_engagement_heuristics(messages)

        # 2 out of 4 user messages have ?
        assert result["question_frequency"] == pytest.approx(0.5)

    def test_total_counts(self):
        """total_messages and total_user_messages are counted correctly."""
        messages = _build_messages(n_user=3, n_assistant=4)
        result = compute_engagement_heuristics(messages)

        assert result["total_user_messages"] == 3.0
        assert result["total_messages"] == 7.0

    def test_length_ratio_user_writes_more(self):
        """When user writes more than assistant, length_ratio > 1.0."""
        messages = [
            {"role": "user", "text": "A" * 200, "ts": 1000},
            {"role": "assistant", "text": "ok", "ts": 1001},
        ]
        result = compute_engagement_heuristics(messages)

        assert result["length_ratio"] > 1.0

    def test_empty_text_fields(self):
        """Messages with empty text are handled without division errors."""
        messages = [
            {"role": "user", "text": "", "ts": 1000},
            {"role": "assistant", "text": "", "ts": 1001},
        ]
        result = compute_engagement_heuristics(messages)

        assert result["avg_user_msg_length"] == 0.0
        assert result["avg_assistant_msg_length"] == 0.0
        assert result["question_frequency"] == 0.0

    def test_missing_text_key(self):
        """Messages missing the text key default to empty string."""
        messages = [
            {"role": "user", "ts": 1000},  # No "text" key
            {"role": "assistant", "text": "hello", "ts": 1001},
        ]
        # Should not raise
        result = compute_engagement_heuristics(messages)
        assert result["avg_user_msg_length"] == 0.0


# ── TestShouldReflect ──────────────────────────────────────────────────────


class TestShouldReflect:
    """Tests for should_reflect — DB-driven threshold gate."""

    def test_no_profile_exists(self, tmp_db):
        """Returns True when no user_profiles row exists (first reflection)."""
        # Insert some messages but no profile row
        for i in range(55):
            tmp_db.execute(
                "INSERT INTO messages (role, text, ts) VALUES (?, ?, ?)",
                ("user", f"message {i}", 1000 + i),
            )
        tmp_db.commit()

        result = should_reflect(1, tmp_db.cursor(), threshold=50)
        assert result is True

    def test_below_threshold(self, tmp_db):
        """Returns False when messages since last reflection < threshold."""
        # Insert a profile row with last_reflection_at = now (epoch ~1 trillion)
        # Then insert only 10 messages (below threshold of 50)
        tmp_db.execute(
            """
            INSERT INTO user_profiles (char_id, last_reflection_at)
            VALUES (1, datetime('now'))
            """
        )
        tmp_db.commit()

        # Messages inserted BEFORE the profile timestamp will not count
        # We don't insert any new messages after the reflection — count = 0
        result = should_reflect(1, tmp_db.cursor(), threshold=50)
        assert result is False

    def test_above_threshold(self, tmp_db):
        """Returns True when messages since last reflection >= threshold."""
        # Insert profile with a very old last_reflection_at
        tmp_db.execute(
            """
            INSERT INTO user_profiles (char_id, last_reflection_at)
            VALUES (1, '2000-01-01 00:00:00')
            """
        )
        # Insert 60 messages with timestamps well after the old reflection date
        for i in range(60):
            tmp_db.execute(
                "INSERT INTO messages (role, text, ts) VALUES (?, ?, ?)",
                ("user", f"msg {i}", 978_307_200 + i),  # 2001-01-01 epoch
            )
        tmp_db.commit()

        result = should_reflect(1, tmp_db.cursor(), threshold=50)
        assert result is True

    def test_exactly_at_threshold(self, tmp_db):
        """Returns True when message count equals threshold exactly."""
        tmp_db.execute(
            """
            INSERT INTO user_profiles (char_id, last_reflection_at)
            VALUES (1, '2000-01-01 00:00:00')
            """
        )
        # Insert exactly 50 messages after 2000
        for i in range(50):
            tmp_db.execute(
                "INSERT INTO messages (role, text, ts) VALUES (?, ?, ?)",
                ("user", f"msg {i}", 978_307_200 + i),
            )
        tmp_db.commit()

        result = should_reflect(1, tmp_db.cursor(), threshold=50)
        assert result is True

    def test_null_last_reflection_at(self, tmp_db):
        """Profile row with last_reflection_at=NULL counts all messages."""
        tmp_db.execute(
            "INSERT INTO user_profiles (char_id, last_reflection_at) VALUES (1, NULL)"
        )
        # Insert enough messages to exceed threshold
        for i in range(55):
            tmp_db.execute(
                "INSERT INTO messages (role, text, ts, char_id) VALUES (?, ?, ?, ?)",
                ("user", f"msg {i}", 1000 + i, 1),
            )
        tmp_db.commit()

        result = should_reflect(1, tmp_db.cursor(), threshold=50)
        assert result is True

    def test_different_character_ids_isolated(self, tmp_db):
        """Profile for char 2 does not affect should_reflect for char 1."""
        tmp_db.execute(
            """
            INSERT INTO user_profiles (char_id, last_reflection_at)
            VALUES (2, datetime('now'))
            """
        )
        # Insert messages for char 1 (no profile → counts all)
        for i in range(55):
            tmp_db.execute(
                "INSERT INTO messages (role, text, ts, char_id) VALUES (?, ?, ?, ?)",
                ("user", f"msg {i}", 1000 + i, 1),
            )
        tmp_db.commit()

        result = should_reflect(1, tmp_db.cursor(), threshold=50)
        assert result is True

    def test_missing_table_returns_true(self):
        """DB with no user_profiles table returns True (safe default)."""
        con = sqlite3.connect(":memory:")
        # No tables at all — create minimal messages table
        con.execute("CREATE TABLE messages (id INTEGER PRIMARY KEY, role TEXT, text TEXT, ts INTEGER, char_id INTEGER)")
        result = should_reflect(1, con.cursor(), threshold=50)
        assert result is True
        con.close()


# ── TestBuildReflectionPrompt ──────────────────────────────────────────────


class TestBuildReflectionPrompt:
    """Tests for build_reflection_prompt — verifies prompt structure and content."""

    def test_prompt_contains_character_name(self):
        """Reflection prompt includes the character name."""
        prompt = build_reflection_prompt("Dae", [], {}, [])
        assert "Dae" in prompt

    def test_prompt_includes_messages(self):
        """Reflection prompt includes message content."""
        messages = [{"role": "user", "text": "I love anime", "ts": 1000}]
        prompt = build_reflection_prompt("Dae", messages, {}, [])
        assert "anime" in prompt

    def test_prompt_includes_user_facts(self):
        """Reflection prompt includes known user facts."""
        facts = ["User's name is Chris", "User likes philosophy"]
        prompt = build_reflection_prompt("Dae", [], {}, facts)
        assert "Chris" in prompt
        assert "philosophy" in prompt

    def test_prompt_without_facts_or_messages(self):
        """Empty facts and messages still produces a non-empty prompt."""
        prompt = build_reflection_prompt("Sakura", [], {}, [])
        assert len(prompt) > 50
        assert "Sakura" in prompt

    def test_prompt_includes_current_profile(self):
        """Prompt includes existing preference values for incremental update."""
        profile = {"pref_humor": 0.8, "pref_depth": 0.3}
        prompt = build_reflection_prompt("Dae", [], profile, [])
        assert "pref_humor" in prompt
        assert "0.8" in prompt

    def test_prompt_caps_messages_at_window(self):
        """Prompt truncates to last N messages when history is long."""
        messages = [
            {"role": "user", "text": f"message number {i}", "ts": i}
            for i in range(100)
        ]
        prompt = build_reflection_prompt("Luna", messages, {}, [])

        # The most recent messages should appear
        assert "message number 99" in prompt
        # Very old messages should NOT appear (window is 50)
        assert "message number 0" not in prompt

    def test_prompt_multiple_facts(self):
        """All provided user facts appear in the prompt."""
        facts = ["Likes cats", "Hates mornings", "Favorite color is blue"]
        prompt = build_reflection_prompt("Genki", [], {}, facts)
        for fact in facts:
            assert fact in prompt

    def test_prompt_is_string(self):
        """Return type is always a str."""
        result = build_reflection_prompt("Alana", [], {}, [])
        assert isinstance(result, str)

    def test_prompt_json_instruction(self):
        """Prompt instructs LLM to return JSON."""
        prompt = build_reflection_prompt("Dae", [], {}, [])
        assert "JSON" in prompt or "json" in prompt.lower()

    def test_prompt_both_roles_in_messages(self):
        """Both user and assistant messages appear in the prompt."""
        messages = [
            {"role": "user", "text": "Do you like stars?", "ts": 1},
            {"role": "assistant", "text": "Yes, I love stargazing!", "ts": 2},
        ]
        prompt = build_reflection_prompt("Luna", messages, {}, [])
        assert "stars" in prompt
        assert "stargazing" in prompt


# ── TestProfileToPrompt ────────────────────────────────────────────────────


class TestProfileToPrompt:
    """Tests for profile_to_prompt_instructions — preference → instruction text."""

    def test_brief_responses(self):
        """Low response length preference produces a 'brief' instruction."""
        profile = _default_profile(length=0.2)
        result = profile_to_prompt_instructions(profile)
        assert "brief" in result.lower() or "short" in result.lower()

    def test_detailed_responses(self):
        """High response length preference produces a 'detailed' instruction."""
        profile = _default_profile(length=0.8)
        result = profile_to_prompt_instructions(profile)
        assert (
            "detail" in result.lower()
            or "long" in result.lower()
            or "multi" in result.lower()
        )

    def test_humorous_profile(self):
        """High humor preference produces humor/playful instruction."""
        profile = _default_profile(humor=0.9)
        result = profile_to_prompt_instructions(profile)
        assert (
            "humor" in result.lower()
            or "playful" in result.lower()
            or "joke" in result.lower()
            or "fun" in result.lower()
        )

    def test_serious_profile(self):
        """Low humor preference produces a serious-tone instruction."""
        profile = _default_profile(humor=0.1)
        result = profile_to_prompt_instructions(profile)
        assert "serious" in result.lower()

    def test_formal_profile(self):
        """High formality preference produces a formal-tone instruction."""
        profile = _default_profile(formality=0.9)
        result = profile_to_prompt_instructions(profile)
        assert "formal" in result.lower() or "polished" in result.lower()

    def test_casual_profile(self):
        """Low formality preference produces a casual-tone instruction."""
        profile = _default_profile(formality=0.1)
        result = profile_to_prompt_instructions(profile)
        assert "casual" in result.lower() or "conversational" in result.lower()

    def test_high_empathy(self):
        """High empathy preference triggers emotional attunement instruction."""
        profile = _default_profile(empathy=0.9)
        result = profile_to_prompt_instructions(profile)
        assert (
            "empathy" in result.lower()
            or "emotion" in result.lower()
            or "feeling" in result.lower()
        )

    def test_high_depth(self):
        """High depth preference triggers analytical/philosophical instruction."""
        profile = _default_profile(depth=0.9)
        result = profile_to_prompt_instructions(profile)
        assert (
            "analytical" in result.lower()
            or "philosophical" in result.lower()
            or "deep" in result.lower()
            or "technical" in result.lower()
        )

    def test_topic_injection(self):
        """High-affinity topics are included in prompt instructions."""
        profile = _default_profile(topics={"anime": 0.9, "philosophy": 0.8})
        result = profile_to_prompt_instructions(profile)
        assert "anime" in result.lower()

    def test_low_affinity_topic_excluded(self):
        """Topics below threshold (< 0.65) are not injected."""
        profile = _default_profile(topics={"cooking": 0.3, "gardening": 0.2})
        result = profile_to_prompt_instructions(profile)
        assert "cooking" not in result.lower()
        assert "gardening" not in result.lower()

    def test_empty_profile_minimal_output(self):
        """Default (all-0.5) profile produces short output (< 200 chars)."""
        profile = _default_profile()
        result = profile_to_prompt_instructions(profile)
        assert len(result) < 200

    def test_extreme_high_all_dimensions(self):
        """All dimensions at 1.0 produce a non-empty multi-line instruction."""
        profile = _default_profile(
            length=1.0, formality=1.0, humor=1.0, empathy=1.0, depth=1.0
        )
        result = profile_to_prompt_instructions(profile)
        assert len(result) > 0
        # Should have multiple lines
        assert "\n" in result

    def test_extreme_low_all_dimensions(self):
        """All dimensions at 0.0 produce a non-empty multi-line instruction."""
        profile = _default_profile(
            length=0.0, formality=0.0, humor=0.0, empathy=0.0, depth=0.0
        )
        result = profile_to_prompt_instructions(profile)
        assert len(result) > 0

    def test_returns_string(self):
        """Return type is always str."""
        result = profile_to_prompt_instructions(_default_profile())
        assert isinstance(result, str)

    def test_topic_affinities_missing_key(self):
        """Missing topic_affinities key is handled gracefully."""
        profile = {
            "pref_response_length": 0.5,
            "pref_formality": 0.5,
            "pref_humor": 0.5,
            "pref_empathy": 0.5,
            "pref_depth": 0.5,
            # No topic_affinities key
        }
        result = profile_to_prompt_instructions(profile)
        assert isinstance(result, str)

    def test_topic_affinities_none_value(self):
        """topic_affinities=None is handled without error."""
        profile = _default_profile(topics=None)
        profile["topic_affinities"] = None
        result = profile_to_prompt_instructions(profile)
        assert isinstance(result, str)

    def test_neutral_zone_no_instruction(self):
        """Values between 0.3 and 0.7 generate no instruction for that dimension."""
        # Length at 0.5 (exactly neutral) → no length instruction
        profile = _default_profile(length=0.5)
        result = profile_to_prompt_instructions(profile)
        # Neither "brief" nor "detailed" should appear
        assert "brief" not in result.lower()
        assert "detailed" not in result.lower()

    def test_multiple_topics_injected(self):
        """Multiple high-affinity topics all appear in output."""
        profile = _default_profile(
            topics={"anime": 0.95, "philosophy": 0.85, "cats": 0.75}
        )
        result = profile_to_prompt_instructions(profile)
        assert "anime" in result.lower()
        assert "philosophy" in result.lower()
        assert "cats" in result.lower()

    def test_topic_cap_at_five(self):
        """More than 5 high-affinity topics are capped at the top 5."""
        topics = {f"topic_{i}": 0.9 - i * 0.01 for i in range(10)}
        profile = _default_profile(topics=topics)
        result = profile_to_prompt_instructions(profile)
        # The result should not mention all 10 topics
        mentioned = sum(1 for t in topics if t in result.lower())
        assert mentioned <= 5


# ── TestEngagementScore ────────────────────────────────────────────────────


class TestEngagementScore:
    """Tests for compute_engagement_score — single-exchange 0-1 proxy score."""

    def test_long_engaged_message(self):
        """Long user message with fast response yields high engagement score."""
        score = compute_engagement_score(
            user_msg=(
                "This is a really interesting topic! I've been thinking about it all day "
                "and I have so many thoughts to share with you about how we could improve "
                "this whole system and make it better for everyone involved."
            ),
            assistant_msg="Thank you for sharing!",
            response_time_ms=2000,
        )
        assert score > 0.6

    def test_short_dismissive_message(self):
        """Short user message with slow response yields low engagement score."""
        score = compute_engagement_score(
            user_msg="ok",
            assistant_msg="Is there anything else you'd like to discuss?",
            response_time_ms=30000,
        )
        assert score < 0.4

    def test_returns_bounded_value(self):
        """Score is always between 0.0 and 1.0 inclusive."""
        score = compute_engagement_score("test", "test")
        assert 0.0 <= score <= 1.0

    def test_empty_user_message(self):
        """Empty user message returns a score >= 0."""
        score = compute_engagement_score("", "Some reply", response_time_ms=1000)
        assert score >= 0.0

    def test_very_fast_response(self):
        """Response time of 0 ms does not crash and contributes positively."""
        score = compute_engagement_score("Hello!", "Hi!", response_time_ms=0)
        assert 0.0 <= score <= 1.0

    def test_extremely_slow_response(self):
        """Very slow response (10 minutes) clamps to >= 0."""
        score = compute_engagement_score("Hi", "Hello", response_time_ms=600_000)
        assert score >= 0.0

    def test_score_increases_with_message_length(self):
        """Longer user messages produce higher scores given equal latency."""
        short_score = compute_engagement_score("ok", "ok", response_time_ms=3000)
        long_score = compute_engagement_score("A" * 200, "ok", response_time_ms=3000)
        assert long_score > short_score

    def test_default_response_time(self):
        """Calling with only two positional args does not raise."""
        score = compute_engagement_score("What do you think?", "I think it's great!")
        assert 0.0 <= score <= 1.0

    def test_score_decreases_with_latency(self):
        """Higher response latency produces lower scores given equal length."""
        fast_score = compute_engagement_score("Hello!", "Hi!", response_time_ms=500)
        slow_score = compute_engagement_score("Hello!", "Hi!", response_time_ms=50_000)
        assert fast_score > slow_score

    def test_maximum_possible_score(self):
        """A 200-char message with near-instant latency achieves a very high score."""
        score = compute_engagement_score("A" * 200, "ok", response_time_ms=1)
        assert score >= 0.95  # Near max: 0.6 * 1.0 + 0.4 * ~1.0
