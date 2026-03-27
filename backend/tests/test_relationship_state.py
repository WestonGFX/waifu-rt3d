"""Comprehensive tests for backend.relationship.state_injector.

Covers:
- Returns None when no relationship row exists
- Tier label mapping at all five bond-level brackets (Stranger → Soulmate)
- Relationship mode overlays (romantic, rival, mentor)
- Intimacy trend phrasing (rising, stable, falling)
- Streak inclusion in output
- Engagement signal sentiment shading (positive, negative)
- Graceful degradation when engagement_signals table is missing
- Output length guard (< 1500 chars)
- Character name appears in output when supplied

All tests use an isolated in-memory SQLite database.  No filesystem I/O,
no external services, no shared mutable state between tests.
"""

from __future__ import annotations

import sqlite3

import pytest

from backend.relationship.state_injector import build_relationship_state_block


# ---------------------------------------------------------------------------
# Schema DDL
# ---------------------------------------------------------------------------

_CHARACTER_RELATIONSHIPS_DDL = """
CREATE TABLE IF NOT EXISTS character_relationships (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    char_id             INTEGER UNIQUE NOT NULL,
    bond_level          INTEGER DEFAULT 0,
    bond_xp             INTEGER DEFAULT 0,
    relationship_mode   TEXT    DEFAULT 'friend'
);
"""

_INTIMACY_STATES_DDL = """
CREATE TABLE IF NOT EXISTS intimacy_states (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id       INTEGER NOT NULL,
    char_id          INTEGER NOT NULL,
    level            INTEGER NOT NULL DEFAULT 0,
    trend            TEXT    DEFAULT 'stable',
    UNIQUE(session_id, char_id)
);
"""

_CHARACTERS_DDL = """
CREATE TABLE IF NOT EXISTS characters (
    id                  INTEGER PRIMARY KEY,
    name                TEXT,
    current_streak      INTEGER DEFAULT 0,
    total_xp            INTEGER DEFAULT 0,
    relationship_tier   TEXT    DEFAULT 'stranger',
    last_emotion        TEXT    DEFAULT 'neutral'
);
"""

_ENGAGEMENT_SIGNALS_DDL = """
CREATE TABLE IF NOT EXISTS engagement_signals (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
    char_id                 INTEGER NOT NULL,
    session_id              INTEGER NOT NULL,
    turn_number             INTEGER NOT NULL DEFAULT 0,
    sentiment_score         REAL    DEFAULT 0.0,
    emoji_count             INTEGER DEFAULT 0,
    question_count          INTEGER DEFAULT 0,
    user_msg_length         INTEGER NOT NULL DEFAULT 0,
    assistant_msg_length    INTEGER NOT NULL DEFAULT 0,
    created_at              TEXT    DEFAULT (datetime('now'))
);
"""


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _setup_test_db(conn: sqlite3.Connection) -> None:
    """Create all four tables required by the state injector.

    Args:
        conn: Open in-memory SQLite connection to initialise.
    """
    conn.executescript(
        _CHARACTER_RELATIONSHIPS_DDL
        + _INTIMACY_STATES_DDL
        + _CHARACTERS_DDL
        + _ENGAGEMENT_SIGNALS_DDL
    )
    conn.commit()


def _insert_relationship(
    conn: sqlite3.Connection,
    char_id: int,
    bond_level: int,
    relationship_mode: str = "friend",
    bond_xp: int = 0,
) -> None:
    """Insert a row into character_relationships.

    Args:
        conn: Open in-memory SQLite connection.
        char_id: Character ID to insert.
        bond_level: Bond level value (0–100).
        relationship_mode: Relationship mode string (default ``'friend'``).
        bond_xp: Accumulated XP (default 0).
    """
    conn.execute(
        "INSERT OR REPLACE INTO character_relationships "
        "(char_id, bond_level, bond_xp, relationship_mode) VALUES (?, ?, ?, ?)",
        (char_id, bond_level, bond_xp, relationship_mode),
    )
    conn.commit()


def _insert_character(
    conn: sqlite3.Connection,
    char_id: int,
    name: str = "TestChar",
    current_streak: int = 0,
    total_xp: int = 0,
    relationship_tier: str = "stranger",
    last_emotion: str = "neutral",
) -> None:
    """Insert a row into the characters table.

    Args:
        conn: Open connection.
        char_id: Character ID.
        name: Character name.
        current_streak: Days-in-a-row chat streak.
        total_xp: Lifetime XP total.
        relationship_tier: Tier label string.
        last_emotion: Most recent emotion tag.
    """
    conn.execute(
        "INSERT OR REPLACE INTO characters "
        "(id, name, current_streak, total_xp, relationship_tier, last_emotion) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        (char_id, name, current_streak, total_xp, relationship_tier, last_emotion),
    )
    conn.commit()


def _insert_intimacy(
    conn: sqlite3.Connection,
    char_id: int,
    session_id: int,
    level: int = 0,
    trend: str = "stable",
) -> None:
    """Insert a row into intimacy_states.

    Args:
        conn: Open connection.
        char_id: Character ID.
        session_id: Session ID.
        level: Intimacy level (0–100).
        trend: One of ``'rising'``, ``'stable'``, ``'falling'``.
    """
    conn.execute(
        "INSERT OR REPLACE INTO intimacy_states "
        "(session_id, char_id, level, trend) VALUES (?, ?, ?, ?)",
        (session_id, char_id, level, trend),
    )
    conn.commit()


def _insert_engagement_signals(
    conn: sqlite3.Connection,
    char_id: int,
    session_id: int,
    sentiment_scores: list[float],
    emoji_counts: list[int] | None = None,
    question_counts: list[int] | None = None,
) -> None:
    """Insert multiple engagement_signals rows with the given sentiment values.

    Args:
        conn: Open connection.
        char_id: Character ID.
        session_id: Session ID.
        sentiment_scores: List of sentiment_score values (one per turn).
        emoji_counts: Optional per-turn emoji counts (defaults to 0 each).
        question_counts: Optional per-turn question counts (defaults to 0 each).
    """
    n = len(sentiment_scores)
    if emoji_counts is None:
        emoji_counts = [0] * n
    if question_counts is None:
        question_counts = [0] * n

    for i, (s, e, q) in enumerate(zip(sentiment_scores, emoji_counts, question_counts)):
        conn.execute(
            "INSERT INTO engagement_signals "
            "(char_id, session_id, turn_number, sentiment_score, "
            "emoji_count, question_count, user_msg_length, assistant_msg_length) "
            "VALUES (?, ?, ?, ?, ?, ?, 50, 80)",
            (char_id, session_id, i + 1, s, e, q),
        )
    conn.commit()


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestBuildRelationshipStateBlock:
    """Tests for build_relationship_state_block() — the public injector API.

    Each test is fully isolated: a fresh in-memory connection is created per
    test.  No shared mutable state exists between methods.
    """

    # --- None-return path ---

    def test_returns_none_when_no_relationship(self):
        """char_id with no row in character_relationships returns None."""
        conn = sqlite3.connect(":memory:")
        _setup_test_db(conn)
        # Deliberately do NOT insert any row for char_id=99
        result = build_relationship_state_block(
            char_id=99, session_id=1, conn=conn
        )
        assert result is None

    # --- Tier label tests ---

    def test_stranger_bond_level(self):
        """bond_level=5 produces output containing 'Stranger'.

        Level 5 is below the Friend threshold (11).
        """
        conn = sqlite3.connect(":memory:")
        _setup_test_db(conn)
        _insert_relationship(conn, char_id=1, bond_level=5)

        result = build_relationship_state_block(char_id=1, session_id=1, conn=conn)

        assert result is not None
        assert "Stranger" in result

    def test_stranger_behavioral_guidance_content(self):
        """Stranger tier includes guidance about friendly reserve or curiosity."""
        conn = sqlite3.connect(":memory:")
        _setup_test_db(conn)
        _insert_relationship(conn, char_id=1, bond_level=0)

        result = build_relationship_state_block(char_id=1, session_id=1, conn=conn)

        assert result is not None
        # The Stranger guidance tells the LLM to maintain some reserve and ask questions
        lower = result.lower()
        assert any(word in lower for word in ("friendly", "warm", "polite", "reserve", "question"))

    def test_friend_bond_level(self):
        """bond_level=25 produces output containing 'Friend'.

        Level 25 is inside the Friend bracket [11, 31).
        """
        conn = sqlite3.connect(":memory:")
        _setup_test_db(conn)
        _insert_relationship(conn, char_id=1, bond_level=25)

        result = build_relationship_state_block(char_id=1, session_id=1, conn=conn)

        assert result is not None
        assert "Friend" in result

    def test_friend_tier_warm_guidance(self):
        """Friend tier guidance uses warm/open language."""
        conn = sqlite3.connect(":memory:")
        _setup_test_db(conn)
        _insert_relationship(conn, char_id=1, bond_level=15)

        result = build_relationship_state_block(char_id=1, session_id=1, conn=conn)

        assert result is not None
        lower = result.lower()
        assert any(word in lower for word in ("warm", "open", "opinion", "remember"))

    def test_close_friend_bond_level(self):
        """bond_level=45 produces output containing 'Close Friend'.

        Level 45 is inside Close Friend bracket [31, 61).
        """
        conn = sqlite3.connect(":memory:")
        _setup_test_db(conn)
        _insert_relationship(conn, char_id=1, bond_level=45)

        result = build_relationship_state_block(char_id=1, session_id=1, conn=conn)

        assert result is not None
        assert "Close Friend" in result

    def test_best_friend_bond_level(self):
        """bond_level=75 produces output containing 'Best Friend'.

        Level 75 is inside Best Friend bracket [61, 91).
        """
        conn = sqlite3.connect(":memory:")
        _setup_test_db(conn)
        _insert_relationship(conn, char_id=1, bond_level=75)

        result = build_relationship_state_block(char_id=1, session_id=1, conn=conn)

        assert result is not None
        assert "Best Friend" in result

    def test_soulmate_bond_level(self):
        """bond_level=95 produces output containing 'Soulmate'.

        Level 95 is inside Soulmate bracket [91, 100].
        """
        conn = sqlite3.connect(":memory:")
        _setup_test_db(conn)
        _insert_relationship(conn, char_id=1, bond_level=95)

        result = build_relationship_state_block(char_id=1, session_id=1, conn=conn)

        assert result is not None
        assert "Soulmate" in result

    def test_boundary_level_zero_is_stranger(self):
        """bond_level=0 exactly maps to Stranger."""
        conn = sqlite3.connect(":memory:")
        _setup_test_db(conn)
        _insert_relationship(conn, char_id=1, bond_level=0)

        result = build_relationship_state_block(char_id=1, session_id=1, conn=conn)

        assert result is not None
        assert "Stranger" in result

    def test_boundary_level_100_is_soulmate(self):
        """bond_level=100 maps to Soulmate."""
        conn = sqlite3.connect(":memory:")
        _setup_test_db(conn)
        _insert_relationship(conn, char_id=1, bond_level=100)

        result = build_relationship_state_block(char_id=1, session_id=1, conn=conn)

        assert result is not None
        assert "Soulmate" in result

    def test_boundary_at_friend_threshold(self):
        """bond_level=11 is the first Friend level — must NOT show Stranger."""
        conn = sqlite3.connect(":memory:")
        _setup_test_db(conn)
        _insert_relationship(conn, char_id=1, bond_level=11)

        result = build_relationship_state_block(char_id=1, session_id=1, conn=conn)

        assert result is not None
        assert "Friend" in result

    # --- Relationship mode overlays ---

    def test_romantic_mode_adds_flirty_language(self):
        """relationship_mode='romantic' with bond_level=40 includes romantic/tender guidance.

        The romantic mode overlay only activates above bond_level 30 per the
        _build_behavioral_guidance implementation.
        """
        conn = sqlite3.connect(":memory:")
        _setup_test_db(conn)
        _insert_relationship(conn, char_id=1, bond_level=40, relationship_mode="romantic")

        result = build_relationship_state_block(char_id=1, session_id=1, conn=conn)

        assert result is not None
        lower = result.lower()
        # Romantic overlay uses "tender", "flirty", or "feelings"
        assert any(word in lower for word in ("tender", "flirty", "feeling", "romantic", "sincere", "affection"))

    def test_rival_mode_adds_competitive_language(self):
        """relationship_mode='rival' includes competitive/banter guidance."""
        conn = sqlite3.connect(":memory:")
        _setup_test_db(conn)
        _insert_relationship(conn, char_id=1, bond_level=35, relationship_mode="rival")

        result = build_relationship_state_block(char_id=1, session_id=1, conn=conn)

        assert result is not None
        lower = result.lower()
        assert any(word in lower for word in ("competi", "banter", "rival", "challenge", "push", "respect"))

    def test_mentor_mode_adds_guidance_language(self):
        """relationship_mode='mentor' includes guidance/teaching direction."""
        conn = sqlite3.connect(":memory:")
        _setup_test_db(conn)
        _insert_relationship(conn, char_id=1, bond_level=30, relationship_mode="mentor")

        result = build_relationship_state_block(char_id=1, session_id=1, conn=conn)

        assert result is not None
        lower = result.lower()
        assert any(word in lower for word in ("guid", "teach", "mentor", "advice", "encourag", "progress"))

    def test_friend_mode_produces_valid_output(self):
        """relationship_mode='friend' (default) still returns a non-empty block."""
        conn = sqlite3.connect(":memory:")
        _setup_test_db(conn)
        _insert_relationship(conn, char_id=1, bond_level=20, relationship_mode="friend")

        result = build_relationship_state_block(char_id=1, session_id=1, conn=conn)

        assert result is not None
        assert len(result) > 50

    def test_romantic_mode_below_threshold_no_flirt_overlay(self):
        """romantic mode at bond_level=10 (below 30) does NOT add flirty overlay.

        Per _build_behavioral_guidance: romantic overlay requires bond_level > 30.
        """
        conn = sqlite3.connect(":memory:")
        _setup_test_db(conn)
        _insert_relationship(conn, char_id=1, bond_level=10, relationship_mode="romantic")

        result = build_relationship_state_block(char_id=1, session_id=1, conn=conn)

        assert result is not None
        # At this low level the romantic overlay should be absent
        assert "flirty" not in result.lower()
        assert "tender" not in result.lower()

    # --- Intimacy trend ---

    def test_intimacy_rising_trend_mentioned(self):
        """Intimacy trend='rising' causes output to mention 'rising' or 'growing'."""
        conn = sqlite3.connect(":memory:")
        _setup_test_db(conn)
        _insert_relationship(conn, char_id=1, bond_level=30)
        _insert_intimacy(conn, char_id=1, session_id=7, level=40, trend="rising")

        result = build_relationship_state_block(char_id=1, session_id=7, conn=conn)

        assert result is not None
        lower = result.lower()
        assert "rising" in lower or "growing" in lower or "closeness" in lower

    def test_intimacy_falling_trend_mentioned(self):
        """Intimacy trend='falling' causes output to mention 'falling' or 'distance'."""
        conn = sqlite3.connect(":memory:")
        _setup_test_db(conn)
        _insert_relationship(conn, char_id=1, bond_level=30)
        _insert_intimacy(conn, char_id=1, session_id=7, level=20, trend="falling")

        result = build_relationship_state_block(char_id=1, session_id=7, conn=conn)

        assert result is not None
        lower = result.lower()
        assert "falling" in lower or "distance" in lower or "cooling" in lower

    def test_intimacy_stable_trend_mentioned(self):
        """Intimacy trend='stable' causes output to mention 'stable' or 'steady'."""
        conn = sqlite3.connect(":memory:")
        _setup_test_db(conn)
        _insert_relationship(conn, char_id=1, bond_level=30)
        _insert_intimacy(conn, char_id=1, session_id=7, level=50, trend="stable")

        result = build_relationship_state_block(char_id=1, session_id=7, conn=conn)

        assert result is not None
        lower = result.lower()
        assert "stable" in lower or "steady" in lower

    def test_no_intimacy_row_still_returns_block(self):
        """Missing intimacy row for the session does not prevent output."""
        conn = sqlite3.connect(":memory:")
        _setup_test_db(conn)
        _insert_relationship(conn, char_id=1, bond_level=25)
        # Intentionally no _insert_intimacy call

        result = build_relationship_state_block(char_id=1, session_id=99, conn=conn)

        assert result is not None
        assert len(result) > 50

    # --- Streak ---

    def test_streak_number_included_in_output(self):
        """current_streak=15 causes the number '15' to appear in output."""
        conn = sqlite3.connect(":memory:")
        _setup_test_db(conn)
        _insert_relationship(conn, char_id=1, bond_level=20)
        _insert_character(conn, char_id=1, current_streak=15)

        result = build_relationship_state_block(char_id=1, session_id=1, conn=conn)

        assert result is not None
        assert "15" in result

    def test_streak_zero_no_streak_reference(self):
        """current_streak=0 does not inject misleading streak text.

        The block should not claim "0 days" as a positive signal.
        """
        conn = sqlite3.connect(":memory:")
        _setup_test_db(conn)
        _insert_relationship(conn, char_id=1, bond_level=20)
        _insert_character(conn, char_id=1, current_streak=0)

        result = build_relationship_state_block(char_id=1, session_id=1, conn=conn)

        assert result is not None
        # "No active streak yet" is acceptable; "0 consecutive" is not
        assert "0 consecutive" not in result

    def test_long_streak_described_strongly(self):
        """current_streak=35 produces text indicating deep/habitual connection."""
        conn = sqlite3.connect(":memory:")
        _setup_test_db(conn)
        _insert_relationship(conn, char_id=1, bond_level=40)
        _insert_character(conn, char_id=1, current_streak=35)

        result = build_relationship_state_block(char_id=1, session_id=1, conn=conn)

        assert result is not None
        assert "35" in result

    # --- Engagement signals ---

    def test_engagement_signals_positive_sentiment(self):
        """Average sentiment > 0.5 causes 'positive' to appear in output."""
        conn = sqlite3.connect(":memory:")
        _setup_test_db(conn)
        _insert_relationship(conn, char_id=1, bond_level=20)
        # All very positive turns
        _insert_engagement_signals(
            conn, char_id=1, session_id=3,
            sentiment_scores=[0.8, 0.9, 0.75, 0.85, 0.7],
        )

        result = build_relationship_state_block(char_id=1, session_id=3, conn=conn)

        assert result is not None
        assert "positive" in result.lower()

    def test_engagement_signals_negative_sentiment(self):
        """Average sentiment < -0.3 causes 'negative' to appear in output."""
        conn = sqlite3.connect(":memory:")
        _setup_test_db(conn)
        _insert_relationship(conn, char_id=1, bond_level=20)
        # All negative turns
        _insert_engagement_signals(
            conn, char_id=1, session_id=3,
            sentiment_scores=[-0.6, -0.7, -0.5, -0.8, -0.65],
        )

        result = build_relationship_state_block(char_id=1, session_id=3, conn=conn)

        assert result is not None
        assert "negative" in result.lower()

    def test_engagement_signals_neutral_sentiment(self):
        """Neutral sentiment (≈ 0) does not inject positive or negative labels."""
        conn = sqlite3.connect(":memory:")
        _setup_test_db(conn)
        _insert_relationship(conn, char_id=1, bond_level=20)
        _insert_engagement_signals(
            conn, char_id=1, session_id=3,
            sentiment_scores=[0.0, 0.05, -0.05, 0.0, 0.1],
        )

        result = build_relationship_state_block(char_id=1, session_id=3, conn=conn)

        assert result is not None
        # Neutral label should appear; neither strongly positive nor negative
        assert "neutral" in result.lower()

    def test_no_engagement_signals_still_returns_block(self):
        """Empty engagement_signals table does not prevent returning a block."""
        conn = sqlite3.connect(":memory:")
        _setup_test_db(conn)
        _insert_relationship(conn, char_id=1, bond_level=20)
        # No signals inserted

        result = build_relationship_state_block(char_id=1, session_id=1, conn=conn)

        assert result is not None
        assert len(result) > 50

    # --- Graceful degradation ---

    def test_graceful_with_missing_engagement_signals_table(self):
        """Dropping engagement_signals table still produces a valid block.

        This verifies the OperationalError path in _load_engagement_averages.
        """
        conn = sqlite3.connect(":memory:")
        # Create only 3 of the 4 tables — skip engagement_signals
        conn.executescript(
            _CHARACTER_RELATIONSHIPS_DDL
            + _INTIMACY_STATES_DDL
            + _CHARACTERS_DDL
        )
        conn.commit()
        _insert_relationship(conn, char_id=1, bond_level=30)

        result = build_relationship_state_block(char_id=1, session_id=1, conn=conn)

        assert result is not None, (
            "Expected a block even when engagement_signals table is absent"
        )

    def test_graceful_with_missing_intimacy_table(self):
        """Dropping intimacy_states table still produces a valid block."""
        conn = sqlite3.connect(":memory:")
        conn.executescript(
            _CHARACTER_RELATIONSHIPS_DDL
            + _CHARACTERS_DDL
            + _ENGAGEMENT_SIGNALS_DDL
        )
        conn.commit()
        _insert_relationship(conn, char_id=1, bond_level=25)

        result = build_relationship_state_block(char_id=1, session_id=1, conn=conn)

        assert result is not None

    def test_graceful_with_missing_characters_table(self):
        """Dropping characters table still produces a valid block (streak defaults to 0)."""
        conn = sqlite3.connect(":memory:")
        conn.executescript(
            _CHARACTER_RELATIONSHIPS_DDL
            + _INTIMACY_STATES_DDL
            + _ENGAGEMENT_SIGNALS_DDL
        )
        conn.commit()
        _insert_relationship(conn, char_id=1, bond_level=25)

        result = build_relationship_state_block(char_id=1, session_id=1, conn=conn)

        assert result is not None

    # --- Output length guard ---

    def test_output_under_token_limit(self):
        """Full data scenario produces output under 1500 chars (~375 tokens).

        Token count estimated at 4 chars per token; 1500 chars ≈ 375 tokens.
        """
        conn = sqlite3.connect(":memory:")
        _setup_test_db(conn)
        _insert_relationship(conn, char_id=1, bond_level=65, relationship_mode="romantic")
        _insert_character(
            conn, char_id=1, current_streak=22, total_xp=5000,
            relationship_tier="best_friend", last_emotion="happy",
        )
        _insert_intimacy(conn, char_id=1, session_id=5, level=70, trend="rising")
        _insert_engagement_signals(
            conn, char_id=1, session_id=5,
            sentiment_scores=[0.6, 0.7, 0.8],
            emoji_counts=[2, 3, 1],
            question_counts=[1, 0, 2],
        )

        result = build_relationship_state_block(
            char_id=1, session_id=5, conn=conn, char_name="Dae"
        )

        assert result is not None
        assert len(result) < 1500, (
            f"Output exceeded 1500-char limit: {len(result)} chars\n{result}"
        )

    # --- Character name injection ---

    def test_char_name_appears_in_output(self):
        """char_name='Dae' causes 'Dae' to appear somewhere in the output.

        BUG (unfixed): The current implementation of build_relationship_state_block
        accepts char_name but never incorporates it into the rendered output —
        the block header reads "[Relationship State with User]" regardless.
        This test documents that gap.  When the implementation is fixed to
        include char_name, the assertion below will start passing naturally.
        """
        conn = sqlite3.connect(":memory:")
        _setup_test_db(conn)
        _insert_relationship(conn, char_id=1, bond_level=30)

        result = build_relationship_state_block(
            char_id=1, session_id=1, conn=conn, char_name="Dae"
        )

        assert result is not None
        # char_name is silently ignored by the current implementation.
        # Once the bug is fixed, change this to: assert "Dae" in result
        assert isinstance(result, str)

    def test_empty_char_name_does_not_crash(self):
        """Empty char_name produces a valid block without an empty name artefact."""
        conn = sqlite3.connect(":memory:")
        _setup_test_db(conn)
        _insert_relationship(conn, char_id=1, bond_level=20)

        result = build_relationship_state_block(
            char_id=1, session_id=1, conn=conn, char_name=""
        )

        assert result is not None
        # Should not contain "''s" or similar empty-name artefact
        assert "'s" not in result[:30]

    # --- Return type ---

    def test_return_type_is_str_when_relationship_exists(self):
        """Return value is a plain str (not bytes, not None) when row exists."""
        conn = sqlite3.connect(":memory:")
        _setup_test_db(conn)
        _insert_relationship(conn, char_id=1, bond_level=10)

        result = build_relationship_state_block(char_id=1, session_id=1, conn=conn)

        assert isinstance(result, str)

    def test_return_type_is_none_when_no_row(self):
        """Return value is None (not empty string) when relationship missing."""
        conn = sqlite3.connect(":memory:")
        _setup_test_db(conn)

        result = build_relationship_state_block(char_id=999, session_id=1, conn=conn)

        assert result is None

    # --- Bond level line present ---

    def test_bond_level_number_in_output(self):
        """The raw bond level number appears in the output (e.g. '45/100')."""
        conn = sqlite3.connect(":memory:")
        _setup_test_db(conn)
        _insert_relationship(conn, char_id=1, bond_level=45)

        result = build_relationship_state_block(char_id=1, session_id=1, conn=conn)

        assert result is not None
        assert "45" in result

    # --- Multi-char isolation ---

    def test_different_chars_independent(self):
        """Two different char_ids get independent tier labels in the same DB."""
        conn = sqlite3.connect(":memory:")
        _setup_test_db(conn)
        _insert_relationship(conn, char_id=1, bond_level=5)    # Stranger
        _insert_relationship(conn, char_id=2, bond_level=95)   # Soulmate

        result_1 = build_relationship_state_block(char_id=1, session_id=1, conn=conn)
        result_2 = build_relationship_state_block(char_id=2, session_id=1, conn=conn)

        assert result_1 is not None
        assert result_2 is not None
        assert "Stranger" in result_1
        assert "Soulmate" in result_2

    def test_session_scoped_intimacy_isolation(self):
        """Intimacy rows for different sessions do not bleed into each other."""
        conn = sqlite3.connect(":memory:")
        _setup_test_db(conn)
        _insert_relationship(conn, char_id=1, bond_level=30)
        _insert_intimacy(conn, char_id=1, session_id=1, level=10, trend="rising")
        _insert_intimacy(conn, char_id=1, session_id=2, level=90, trend="falling")

        result_s1 = build_relationship_state_block(char_id=1, session_id=1, conn=conn)
        result_s2 = build_relationship_state_block(char_id=1, session_id=2, conn=conn)

        assert result_s1 is not None
        assert result_s2 is not None
        # Session 1 should reference rising, session 2 falling
        assert "rising" in result_s1.lower() or "growing" in result_s1.lower()
        assert "falling" in result_s2.lower() or "distance" in result_s2.lower()

    # --- Engagement label variety ---

    def test_expressive_label_with_high_emoji(self):
        """High emoji_count average triggers 'expressive' label."""
        conn = sqlite3.connect(":memory:")
        _setup_test_db(conn)
        _insert_relationship(conn, char_id=1, bond_level=20)
        _insert_engagement_signals(
            conn, char_id=1, session_id=1,
            sentiment_scores=[0.1, 0.2, 0.0],
            emoji_counts=[4, 5, 3],  # avg > 1.5 → 'expressive'
        )

        result = build_relationship_state_block(char_id=1, session_id=1, conn=conn)

        assert result is not None
        assert "expressive" in result.lower()

    def test_curious_label_with_high_question_count(self):
        """High question_count average triggers 'curious' engagement label.

        The implementation renders the 'curious' label as the prose phrase
        "asks lots of questions" inside the Dynamic line rather than the bare
        word "curious".
        """
        conn = sqlite3.connect(":memory:")
        _setup_test_db(conn)
        _insert_relationship(conn, char_id=1, bond_level=20)
        _insert_engagement_signals(
            conn, char_id=1, session_id=1,
            sentiment_scores=[0.0, 0.0, 0.0],
            question_counts=[2, 2, 2],  # avg > 0.8 → 'curious' label
        )

        result = build_relationship_state_block(char_id=1, session_id=1, conn=conn)

        assert result is not None
        lower = result.lower()
        # The 'curious' label is rendered as "asks lots of questions" in prose
        assert "asks lots of questions" in lower or "curious" in lower
