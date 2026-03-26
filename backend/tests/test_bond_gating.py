"""Tests for bond-gated content level resolution.

Covers:
- bond_allowed_ceiling() threshold boundaries
- get_bond_gated_level() with a real in-memory SQLite DB
- Missing relationship row defaults to "general"
- User's chosen level is capped to the bond-permitted ceiling
"""

from __future__ import annotations

import sqlite3

import pytest

from backend.content.gating import (
    BOND_CONTENT_THRESHOLDS,
    bond_allowed_ceiling,
    get_bond_gated_level,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture()
def db_conn() -> sqlite3.Connection:
    """Return an in-memory SQLite connection with the minimum schema needed.

    Creates the ``character_relationships`` table with the ``bond_level``
    column as it exists after schema v56.

    Yields:
        An open :class:`sqlite3.Connection` that is closed after the test.
    """
    conn = sqlite3.connect(":memory:")
    conn.execute(
        """
        CREATE TABLE character_relationships (
            char_id          INTEGER PRIMARY KEY,
            bond_level       INTEGER NOT NULL DEFAULT 0,
            bond_xp          INTEGER NOT NULL DEFAULT 0,
            relationship_mode TEXT NOT NULL DEFAULT 'stranger'
        )
        """
    )
    conn.commit()
    return conn


def _insert_bond(conn: sqlite3.Connection, char_id: int, bond_level: int) -> None:
    """Insert a relationship row with the given bond level.

    Args:
        conn: Open SQLite connection.
        char_id: Character primary key.
        bond_level: Bond level to store (0–100).
    """
    conn.execute(
        "INSERT INTO character_relationships (char_id, bond_level) VALUES (?, ?)",
        (char_id, bond_level),
    )
    conn.commit()


# ---------------------------------------------------------------------------
# bond_allowed_ceiling() — pure function, no DB needed
# ---------------------------------------------------------------------------


class TestBondAllowedCeiling:
    """Tests for the pure bond_allowed_ceiling() helper."""

    def test_bond_zero_returns_general(self) -> None:
        """Bond level 0 should only allow 'general' content."""
        assert bond_allowed_ceiling(0) == "general"

    def test_bond_below_edgy_threshold_returns_general(self) -> None:
        """Bond level 19 is one below the 'edgy' threshold of 20."""
        assert bond_allowed_ceiling(19) == "general"

    def test_bond_at_edgy_threshold_returns_edgy(self) -> None:
        """Bond level 20 exactly meets the 'edgy' threshold."""
        assert bond_allowed_ceiling(20) == "edgy"

    def test_bond_30_returns_edgy(self) -> None:
        """Bond 30 is above edgy (20) but below mature (50)."""
        assert bond_allowed_ceiling(30) == "edgy"

    def test_bond_at_mature_threshold_returns_mature(self) -> None:
        """Bond level 50 exactly meets the 'mature' threshold."""
        assert bond_allowed_ceiling(50) == "mature"

    def test_bond_60_returns_mature(self) -> None:
        """Bond 60 is above mature (50) but below explicit (80)."""
        assert bond_allowed_ceiling(60) == "mature"

    def test_bond_at_explicit_threshold_returns_explicit(self) -> None:
        """Bond level 80 exactly meets the 'explicit' threshold."""
        assert bond_allowed_ceiling(80) == "explicit"

    def test_bond_90_returns_explicit(self) -> None:
        """Bond 90 is above the explicit threshold — all levels available."""
        assert bond_allowed_ceiling(90) == "explicit"

    def test_bond_100_returns_explicit(self) -> None:
        """Maximum bond level 100 should return 'explicit'."""
        assert bond_allowed_ceiling(100) == "explicit"

    def test_threshold_constants_match_logic(self) -> None:
        """The thresholds in BOND_CONTENT_THRESHOLDS are used consistently."""
        for rating, threshold in BOND_CONTENT_THRESHOLDS.items():
            result = bond_allowed_ceiling(threshold)
            assert result == rating, (
                f"bond_allowed_ceiling({threshold}) should return {rating!r} "
                f"(the threshold's own level), got {result!r}"
            )


# ---------------------------------------------------------------------------
# get_bond_gated_level() — requires DB fixture
# ---------------------------------------------------------------------------


class TestGetBondGatedLevel:
    """Integration tests for get_bond_gated_level() using an in-memory DB."""

    # --- Task spec cases ---------------------------------------------------

    def test_bond_0_only_general_available(self, db_conn: sqlite3.Connection) -> None:
        """Bond level 0 → only 'general' regardless of user's chosen level."""
        _insert_bond(db_conn, char_id=1, bond_level=0)
        assert get_bond_gated_level(1, "explicit", db_conn) == "general"

    def test_bond_30_user_wants_explicit_clamped_to_edgy(
        self, db_conn: sqlite3.Connection
    ) -> None:
        """Bond 30 allows up to 'edgy'; user's Level 4 is clamped to 'edgy'."""
        _insert_bond(db_conn, char_id=2, bond_level=30)
        assert get_bond_gated_level(2, "explicit", db_conn) == "edgy"

    def test_bond_30_user_wants_general_stays_general(
        self, db_conn: sqlite3.Connection
    ) -> None:
        """When bond allows 'edgy' but user picks 'general', respect the user."""
        _insert_bond(db_conn, char_id=3, bond_level=30)
        assert get_bond_gated_level(3, "general", db_conn) == "general"

    def test_bond_60_user_wants_explicit_clamped_to_mature(
        self, db_conn: sqlite3.Connection
    ) -> None:
        """Bond 60 allows up to 'mature'; user's Level 4 is clamped to 'mature'."""
        _insert_bond(db_conn, char_id=4, bond_level=60)
        assert get_bond_gated_level(4, "explicit", db_conn) == "mature"

    def test_bond_90_all_levels_available(self, db_conn: sqlite3.Connection) -> None:
        """Bond 90 >= 80 threshold → 'explicit' is fully accessible."""
        _insert_bond(db_conn, char_id=5, bond_level=90)
        assert get_bond_gated_level(5, "explicit", db_conn) == "explicit"

    def test_no_bond_record_defaults_to_general(
        self, db_conn: sqlite3.Connection
    ) -> None:
        """A character with no relationship row defaults to 'general'."""
        # char_id=99 has no row in the DB.
        assert get_bond_gated_level(99, "explicit", db_conn) == "general"

    # --- Additional boundary / edge cases ----------------------------------

    def test_bond_exactly_at_edgy_threshold(
        self, db_conn: sqlite3.Connection
    ) -> None:
        """Bond level 20 (exact edgy threshold) should unlock 'edgy'."""
        _insert_bond(db_conn, char_id=6, bond_level=20)
        assert get_bond_gated_level(6, "explicit", db_conn) == "edgy"

    def test_bond_exactly_at_mature_threshold(
        self, db_conn: sqlite3.Connection
    ) -> None:
        """Bond level 50 (exact mature threshold) should unlock 'mature'."""
        _insert_bond(db_conn, char_id=7, bond_level=50)
        assert get_bond_gated_level(7, "explicit", db_conn) == "mature"

    def test_bond_exactly_at_explicit_threshold(
        self, db_conn: sqlite3.Connection
    ) -> None:
        """Bond level 80 (exact explicit threshold) should unlock 'explicit'."""
        _insert_bond(db_conn, char_id=8, bond_level=80)
        assert get_bond_gated_level(8, "explicit", db_conn) == "explicit"

    def test_user_level_lower_than_bond_ceiling_is_respected(
        self, db_conn: sqlite3.Connection
    ) -> None:
        """User choosing a lower ceiling than bond allows is always respected."""
        _insert_bond(db_conn, char_id=9, bond_level=90)
        # bond allows 'explicit', but user only wants 'edgy'
        assert get_bond_gated_level(9, "edgy", db_conn) == "edgy"

    def test_bond_zero_row_returns_general(
        self, db_conn: sqlite3.Connection
    ) -> None:
        """A relationship row with bond_level=0 should return 'general'."""
        # The real schema enforces NOT NULL DEFAULT 0, so zero is the floor.
        _insert_bond(db_conn, char_id=10, bond_level=0)
        assert get_bond_gated_level(10, "explicit", db_conn) == "general"

    def test_missing_table_returns_general(self) -> None:
        """OperationalError (missing table) must not raise — returns 'general'."""
        bare_conn = sqlite3.connect(":memory:")
        # No table created → OperationalError on SELECT.
        result = get_bond_gated_level(1, "explicit", bare_conn)
        assert result == "general"
        bare_conn.close()

    def test_bond_100_explicit_is_available(
        self, db_conn: sqlite3.Connection
    ) -> None:
        """Maximum bond level should make all content tiers available."""
        _insert_bond(db_conn, char_id=11, bond_level=100)
        for level in ("general", "edgy", "mature", "explicit"):
            assert get_bond_gated_level(11, level, db_conn) == level  # type: ignore[arg-type]
