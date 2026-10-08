"""Schema v90: messages.thinking + messages.raw_output (append-only, idempotent)."""

import sqlite3

from backend.preflight import get_schema_version, migrate_to_v90


def _db_at_v89() -> sqlite3.Connection:
    con = sqlite3.connect(":memory:")
    con.execute("CREATE TABLE schema_version (version INTEGER PRIMARY KEY, applied_ts INTEGER)")
    con.execute("INSERT INTO schema_version VALUES (89, 0)")
    con.execute("CREATE TABLE messages (id INTEGER PRIMARY KEY, session_id INTEGER, role TEXT, text TEXT)")
    con.execute("INSERT INTO messages (session_id, role, text) VALUES (1, 'assistant', 'hi')")
    con.commit()
    return con


def _columns(con: sqlite3.Connection) -> set[str]:
    return {row[1] for row in con.execute("PRAGMA table_info(messages)")}


def test_v90_adds_columns_and_bumps_version():
    con = _db_at_v89()
    assert migrate_to_v90(con) is True
    assert {"thinking", "raw_output"} <= _columns(con)
    assert get_schema_version(con) == 90


def test_v90_leaves_existing_rows_null():
    con = _db_at_v89()
    migrate_to_v90(con)
    row = con.execute("SELECT text, thinking, raw_output FROM messages").fetchone()
    assert row == ("hi", None, None)


def test_v90_is_idempotent():
    con = _db_at_v89()
    assert migrate_to_v90(con) is True
    assert migrate_to_v90(con) is True  # second run is a no-op, no error
    assert get_schema_version(con) == 90
    assert sum(1 for c in _columns(con) if c in ("thinking", "raw_output")) == 2
