"""Tests for Kokoro parse-ok logging (schema v86 + _log_parse_result).

Covers:
- migrate_to_v86 creates kokoro_parse_log and is idempotent
- _log_parse_result stores correct column values
- _log_parse_result silently swallows OperationalError (missing table)
- finalize_turn calls _log_parse_result on both success and fallback paths
"""
from __future__ import annotations

import sqlite3

import pytest

from backend.kokoro.service import _log_parse_result, finalize_turn, prepare_turn
from backend.preflight import migrate_to_v83, migrate_to_v84, migrate_to_v85, migrate_to_v86


# ---------------------------------------------------------------------------
# Shared fixtures
# ---------------------------------------------------------------------------

@pytest.fixture()
def con():
    """In-memory SQLite DB migrated through v83-v86 with minimal seed data.

    Mirrors the fixture in test_kokoro_service.py but extends it through v86
    so kokoro_parse_log exists.
    """
    c = sqlite3.connect(":memory:")
    c.execute("PRAGMA foreign_keys = ON")
    c.execute("CREATE TABLE schema_version (version INTEGER, applied_ts REAL)")
    c.execute("INSERT INTO schema_version VALUES (82, 0)")
    c.execute("CREATE TABLE characters (id INTEGER PRIMARY KEY, name TEXT)")
    c.execute("CREATE TABLE sessions (id INTEGER PRIMARY KEY)")
    c.execute("INSERT INTO characters (id, name) VALUES (1, 'Sakura')")
    c.execute("INSERT INTO sessions (id) VALUES (100)")
    assert migrate_to_v83(c)
    assert migrate_to_v84(c)
    assert migrate_to_v85(c)
    assert migrate_to_v86(c)
    yield c
    c.close()


@pytest.fixture()
def con_no_log_table():
    """In-memory SQLite DB that is intentionally stopped BEFORE v86.

    Used to assert that _log_parse_result does not raise when the table is absent.
    """
    c = sqlite3.connect(":memory:")
    c.execute("CREATE TABLE schema_version (version INTEGER, applied_ts REAL)")
    c.execute("INSERT INTO schema_version VALUES (82, 0)")
    c.execute("CREATE TABLE characters (id INTEGER PRIMARY KEY, name TEXT)")
    c.execute("CREATE TABLE sessions (id INTEGER PRIMARY KEY)")
    c.execute("INSERT INTO characters (id, name) VALUES (1, 'Sakura')")
    c.execute("INSERT INTO sessions (id) VALUES (100)")
    assert migrate_to_v83(c)
    assert migrate_to_v84(c)
    assert migrate_to_v85(c)
    # Deliberately NOT running migrate_to_v86 — kokoro_parse_log absent.
    yield c
    c.close()


@pytest.fixture()
def stub_bond(monkeypatch):
    """Stub backend.bond.progression so kokoro service tests don't need that subsystem.

    Returns a callable that sets the mocked bond level.

    Args:
        monkeypatch: pytest monkeypatch fixture.

    Returns:
        Callable[int] — call with the desired bond level before prepare_turn.
    """
    def _set(level: int):
        import sys
        import types

        def fake_get_bond_level(char_id, cur):
            return {"bond_level": level}

        mod = types.ModuleType("backend.bond.progression")
        mod.get_bond_level = fake_get_bond_level
        monkeypatch.setitem(sys.modules, "backend.bond.progression", mod)

    return _set


# ---------------------------------------------------------------------------
# Migration tests
# ---------------------------------------------------------------------------

class TestMigrateV86:
    """Tests for the v86 migration that creates kokoro_parse_log."""

    def test_migrate_v86_creates_kokoro_parse_log_table(self, con):
        """After running v86, kokoro_parse_log must be present in the schema.

        Args:
            con: Fully-migrated in-memory connection (v83-v86).
        """
        row = con.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='kokoro_parse_log'"
        ).fetchone()
        assert row is not None, "kokoro_parse_log table was not created by migrate_to_v86"

    def test_migrate_v86_creates_index_on_char_created(self, con):
        """An index on (character_id, created_at) must be created for QA queries.

        Args:
            con: Fully-migrated in-memory connection (v83-v86).
        """
        row = con.execute(
            "SELECT name FROM sqlite_master WHERE type='index' "
            "AND name='idx_kpl_char_created'"
        ).fetchone()
        assert row is not None, "idx_kpl_char_created index was not created"

    def test_migrate_v86_idempotent(self, con):
        """Running migrate_to_v86 a second time must not raise or duplicate the table.

        Args:
            con: Fully-migrated in-memory connection (already at v86).
        """
        result = migrate_to_v86(con)
        assert result is True
        # Table still exists and there is still only one table with that name.
        rows = con.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='kokoro_parse_log'"
        ).fetchall()
        assert len(rows) == 1

    def test_migrate_v86_bumps_schema_version(self, con):
        """schema_version must reflect v86 after the migration runs.

        Args:
            con: Fully-migrated in-memory connection (v83-v86).
        """
        version = con.execute(
            "SELECT version FROM schema_version ORDER BY version DESC LIMIT 1"
        ).fetchone()[0]
        assert version == 86


# ---------------------------------------------------------------------------
# _log_parse_result unit tests
# ---------------------------------------------------------------------------

class TestLogParseResult:
    """Unit tests for _log_parse_result in isolation."""

    def test_log_parse_result_inserts_row(self, con):
        """Calling _log_parse_result once must produce exactly one row in the table.

        Args:
            con: Fully-migrated in-memory connection.
        """
        _log_parse_result(con, character_id=1, session_id=100,
                          parse_ok=True, raw_text_len=128)
        count = con.execute("SELECT COUNT(*) FROM kokoro_parse_log").fetchone()[0]
        assert count == 1

    def test_log_parse_result_ok_true(self, con):
        """parse_ok=True must store the integer 1 in the parse_ok column.

        Args:
            con: Fully-migrated in-memory connection.
        """
        _log_parse_result(con, character_id=1, session_id=100,
                          parse_ok=True, raw_text_len=0)
        val = con.execute("SELECT parse_ok FROM kokoro_parse_log").fetchone()[0]
        assert val == 1

    def test_log_parse_result_ok_false(self, con):
        """parse_ok=False must store the integer 0 in the parse_ok column.

        Args:
            con: Fully-migrated in-memory connection.
        """
        _log_parse_result(con, character_id=1, session_id=100,
                          parse_ok=False, raw_text_len=0)
        val = con.execute("SELECT parse_ok FROM kokoro_parse_log").fetchone()[0]
        assert val == 0

    def test_log_parse_result_records_text_len(self, con):
        """raw_text_len must be stored exactly as passed.

        Args:
            con: Fully-migrated in-memory connection.
        """
        _log_parse_result(con, character_id=1, session_id=100,
                          parse_ok=True, raw_text_len=512)
        val = con.execute("SELECT raw_text_len FROM kokoro_parse_log").fetchone()[0]
        assert val == 512

    def test_log_parse_result_zero_text_len(self, con):
        """raw_text_len=0 (empty LLM output boundary) must be stored as 0.

        Args:
            con: Fully-migrated in-memory connection.
        """
        _log_parse_result(con, character_id=1, session_id=100,
                          parse_ok=False, raw_text_len=0)
        val = con.execute("SELECT raw_text_len FROM kokoro_parse_log").fetchone()[0]
        assert val == 0

    def test_log_parse_result_stores_character_id_and_session_id(self, con):
        """character_id and session_id must be stored in the row.

        Args:
            con: Fully-migrated in-memory connection.
        """
        _log_parse_result(con, character_id=1, session_id=100,
                          parse_ok=True, raw_text_len=64)
        row = con.execute(
            "SELECT character_id, session_id FROM kokoro_parse_log"
        ).fetchone()
        assert row[0] == 1
        assert row[1] == 100

    def test_log_parse_result_missing_table_no_error(self, con_no_log_table):
        """OperationalError raised by a missing kokoro_parse_log must be silently swallowed.

        The chat pipeline must never crash because of logging failures.

        Args:
            con_no_log_table: In-memory connection stopped at v85 (no log table).
        """
        # Must not raise any exception.
        _log_parse_result(con_no_log_table, character_id=1, session_id=100,
                          parse_ok=True, raw_text_len=100)


# ---------------------------------------------------------------------------
# finalize_turn integration tests
# ---------------------------------------------------------------------------

class TestFinalizeTurnLogging:
    """Integration tests verifying finalize_turn writes to kokoro_parse_log."""

    def test_finalize_turn_logs_successful_parse(self, con, stub_bond):
        """Valid JSON input → finalize_turn inserts a parse_ok=1 row.

        Args:
            con: Fully-migrated in-memory connection.
            stub_bond: Bond-level stub fixture.
        """
        stub_bond(5)
        ctx = prepare_turn(
            con, character_id=1, session_id=100,
            kokoro_enabled=True, nsfw_enabled=False,
        )
        raw = '{"reply": "Hello!", "stateDelta": {}}'
        finalize_turn(con, ctx, raw)

        row = con.execute(
            "SELECT parse_ok FROM kokoro_parse_log"
        ).fetchone()
        assert row is not None, "No row was inserted into kokoro_parse_log"
        assert row[0] == 1

    def test_finalize_turn_logs_failed_parse(self, con, stub_bond):
        """Plain-text (non-JSON) input → finalize_turn inserts a parse_ok=0 row.

        The response parser falls back to plain-text extraction when JSON is absent,
        which sets parse_ok=False on the response.

        Args:
            con: Fully-migrated in-memory connection.
            stub_bond: Bond-level stub fixture.
        """
        stub_bond(5)
        ctx = prepare_turn(
            con, character_id=1, session_id=100,
            kokoro_enabled=True, nsfw_enabled=False,
        )
        raw = "This is just plain text with no JSON structure at all."
        finalize_turn(con, ctx, raw)

        row = con.execute(
            "SELECT parse_ok FROM kokoro_parse_log"
        ).fetchone()
        assert row is not None, "No row was inserted into kokoro_parse_log"
        assert row[0] == 0

    def test_finalize_turn_logs_raw_text_len(self, con, stub_bond):
        """The logged raw_text_len must equal len(raw_llm_text) passed in.

        Args:
            con: Fully-migrated in-memory connection.
            stub_bond: Bond-level stub fixture.
        """
        stub_bond(5)
        ctx = prepare_turn(
            con, character_id=1, session_id=100,
            kokoro_enabled=True, nsfw_enabled=False,
        )
        raw = '{"reply": "hi", "stateDelta": {}}'
        finalize_turn(con, ctx, raw)

        logged_len = con.execute(
            "SELECT raw_text_len FROM kokoro_parse_log"
        ).fetchone()[0]
        assert logged_len == len(raw)

    def test_finalize_turn_logs_when_kokoro_disabled(self, con, stub_bond):
        """Log row must be written even when kokoro is disabled (logging is pre-gate).

        _log_parse_result is called before the `if not ctx.enabled` guard so
        every turn is counted regardless of gate state.

        Args:
            con: Fully-migrated in-memory connection.
            stub_bond: Bond-level stub fixture.
        """
        stub_bond(0)
        ctx = prepare_turn(
            con, character_id=1, session_id=100,
            kokoro_enabled=False, nsfw_enabled=False,
        )
        raw = '{"reply": "hello"}'
        finalize_turn(con, ctx, raw)

        count = con.execute("SELECT COUNT(*) FROM kokoro_parse_log").fetchone()[0]
        assert count == 1

    def test_finalize_turn_multiple_turns_accumulate_rows(self, con, stub_bond):
        """Each finalize_turn call appends an independent row (no dedup / upsert).

        Args:
            con: Fully-migrated in-memory connection.
            stub_bond: Bond-level stub fixture.
        """
        stub_bond(5)
        for _ in range(3):
            ctx = prepare_turn(
                con, character_id=1, session_id=100,
                kokoro_enabled=True, nsfw_enabled=False,
            )
            finalize_turn(con, ctx, '{"reply": "turn"}')

        count = con.execute("SELECT COUNT(*) FROM kokoro_parse_log").fetchone()[0]
        assert count == 3
