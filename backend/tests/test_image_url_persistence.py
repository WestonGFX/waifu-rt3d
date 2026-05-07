"""Tests for image_url / image_prompt persistence in the messages table (M1-5, schema v73).

Verifies:
- migrate_to_v73 adds the six new columns to an existing messages table.
- get_session_messages returns image_url / image_prompt when present.
- loadHistory round-trip: inserting image fields and reading them back via
  the endpoint reflects the stored values.
"""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path

import pytest

from backend.preflight import migrate_to_v72, migrate_to_v73


# --------------------------------------------------------------------------
# migrate_to_v73 unit tests
# --------------------------------------------------------------------------

def _make_v72_db() -> sqlite3.Connection:
    """Return an in-memory DB with the messages table at schema v72."""
    con = sqlite3.connect(":memory:")
    con.executescript(
        """
        CREATE TABLE schema_version (version INTEGER, applied_ts REAL);
        INSERT INTO schema_version VALUES (72, 0);
        CREATE TABLE messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id INTEGER,
            role TEXT,
            text TEXT,
            ts INTEGER DEFAULT (strftime('%s','now')),
            parent_id INTEGER,
            is_active INTEGER DEFAULT 1,
            char_id INTEGER,
            pinned INTEGER DEFAULT 0
        );
        """
    )
    return con


def test_v73_adds_six_columns():
    """migrate_to_v73 adds all six expected columns to the messages table."""
    con = _make_v72_db()
    result = migrate_to_v73(con)
    assert result is True
    cols = {r[1] for r in con.execute("PRAGMA table_info(messages)").fetchall()}
    for expected in ("image_url", "image_prompt", "edited_at", "edit_history",
                     "sibling_group_id", "sibling_index"):
        assert expected in cols, f"Column {expected!r} missing after v73 migration"


def test_v73_idempotent():
    """Running migrate_to_v73 twice is safe (returns True, no error)."""
    con = _make_v72_db()
    migrate_to_v73(con)
    result = migrate_to_v73(con)
    assert result is True


def test_v73_image_fields_nullable():
    """image_url and image_prompt accept NULL (most messages have no image)."""
    con = _make_v72_db()
    migrate_to_v73(con)
    con.execute(
        "INSERT INTO messages(session_id, role, text, image_url, image_prompt) "
        "VALUES (1, 'assistant', 'hello', NULL, NULL)"
    )
    con.commit()
    row = con.execute(
        "SELECT image_url, image_prompt FROM messages WHERE session_id=1"
    ).fetchone()
    assert row == (None, None)


def test_v73_image_fields_round_trip():
    """image_url and image_prompt survive a write-then-read cycle."""
    con = _make_v72_db()
    migrate_to_v73(con)
    url = "http://localhost:8080/storage/images/portrait_1234.png"
    prompt = "Rin, smiling, cherry blossoms, masterpiece"
    con.execute(
        "INSERT INTO messages(session_id, role, text) VALUES (1, 'assistant', 'here!')"
    )
    msg_id = con.execute("SELECT last_insert_rowid()").fetchone()[0]
    con.execute(
        "UPDATE messages SET image_url=?, image_prompt=? WHERE id=?",
        (url, prompt, msg_id),
    )
    con.commit()
    row = con.execute(
        "SELECT image_url, image_prompt FROM messages WHERE id=?", (msg_id,)
    ).fetchone()
    assert row[0] == url
    assert row[1] == prompt


# --------------------------------------------------------------------------
# Endpoint integration: get_session_messages returns image fields
# --------------------------------------------------------------------------

def _add_v73_cols_to_test_db(db_path: Path) -> None:
    """Lazily add v73 columns (+ pinned) to the shared test DB if not present.

    The conftest schema predates v20 (pinned) and v73 (image_url etc.).
    Add them idempotently so the full cols SELECT in get_session_messages
    succeeds without triggering the minimal-fallback branch.
    """
    con = sqlite3.connect(db_path)
    try:
        cols = {r[1] for r in con.execute("PRAGMA table_info(messages)").fetchall()}
        for col_name, col_type in [
            ("pinned",           "INTEGER DEFAULT 0"),
            ("image_url",        "TEXT"),
            ("image_prompt",     "TEXT"),
            ("edited_at",        "REAL"),
            ("edit_history",     "TEXT"),
            ("sibling_group_id", "TEXT"),
            ("sibling_index",    "INTEGER"),
        ]:
            if col_name not in cols:
                con.execute(
                    f"ALTER TABLE messages ADD COLUMN {col_name} {col_type}"
                )
        con.commit()
    finally:
        con.close()


def test_get_session_messages_returns_image_fields(client, db_path):
    """GET /api/sessions/{id}/messages includes image_url and image_prompt."""
    _add_v73_cols_to_test_db(db_path)

    # Seed: create a session and an assistant message with image fields
    con = sqlite3.connect(db_path)
    try:
        con.execute(
            "INSERT INTO sessions(id, title) VALUES (9001, 'img-test')"
        )
        url = "http://localhost:8080/storage/images/test_portrait.png"
        prompt = "test prompt, anime, masterpiece"
        con.execute(
            "INSERT INTO messages(session_id, role, text, image_url, image_prompt, is_active) "
            "VALUES (9001, 'assistant', 'here is a pic!', ?, ?, 1)",
            (url, prompt),
        )
        con.commit()
    finally:
        con.close()

    resp = client.get("/api/sessions/9001/messages")
    assert resp.status_code == 200
    msgs = resp.json()["messages"]
    assert len(msgs) == 1
    assert msgs[0]["image_url"] == url
    assert msgs[0]["image_prompt"] == prompt


def test_get_session_messages_no_image_fields_absent(client, db_path):
    """GET messages for a message without an image omits image_url/image_prompt keys."""
    _add_v73_cols_to_test_db(db_path)

    con = sqlite3.connect(db_path)
    try:
        con.execute(
            "INSERT INTO sessions(id, title) VALUES (9002, 'no-img-test')"
        )
        con.execute(
            "INSERT INTO messages(session_id, role, text, is_active) "
            "VALUES (9002, 'assistant', 'just text, no image', 1)"
        )
        con.commit()
    finally:
        con.close()

    resp = client.get("/api/sessions/9002/messages")
    assert resp.status_code == 200
    msgs = resp.json()["messages"]
    assert len(msgs) == 1
    assert "image_url" not in msgs[0]
    assert "image_prompt" not in msgs[0]
