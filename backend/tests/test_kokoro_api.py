"""Integration tests for the two Kokoro API endpoints.

Covers:
  - POST /api/kokoro/finalize   (parse + delta + payload)
  - GET  /api/kokoro/state/{id} (dial snapshot for debug HUD)

Uses the shared ``client`` fixture from conftest.py (FastAPI TestClient +
stub LLM + tmp_path DB at the current schema version, which includes
Kokoro tables v83/v84).
"""
from __future__ import annotations

import sqlite3
from pathlib import Path

import pytest


def _insert_minimal_char_session(db_path: Path) -> tuple[int, int]:
    """Insert a stub character + session and ensure Kokoro tables exist.

    The shared conftest schema predates v83/v84 and uses the legacy
    sessions schema (no ``character_id`` column), so we run the Kokoro
    migrations on top here and insert with a minimal column set.
    """
    from backend.preflight import migrate_to_v83, migrate_to_v84

    con = sqlite3.connect(db_path)
    try:
        # Ensure schema_version row exists at >= v82 so the migration helpers
        # see a clean starting point.  These tests don't care about the
        # intervening migrations (v3..v82) since Kokoro touches only its
        # own tables + characters/sessions FK parents.
        if not con.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='schema_version'"
        ).fetchone():
            con.execute(
                "CREATE TABLE schema_version (version INTEGER, applied_ts REAL)"
            )
            con.execute("INSERT INTO schema_version VALUES (82, 0)")
            con.commit()
        migrate_to_v83(con)
        migrate_to_v84(con)

        con.execute("INSERT INTO characters (name) VALUES (?)", ("TestChan",))
        char_id = con.execute("SELECT last_insert_rowid()").fetchone()[0]
        con.execute("INSERT INTO sessions DEFAULT VALUES")
        session_id = con.execute("SELECT last_insert_rowid()").fetchone()[0]
        con.commit()
    finally:
        con.close()
    return int(char_id), int(session_id)


def test_kokoro_state_returns_defaults_for_fresh_character(client, db_path):
    char_id, session_id = _insert_minimal_char_session(db_path)

    r = client.get(f"/api/kokoro/state/{char_id}?session_id={session_id}")
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True
    # Defaults from v83 migration.
    assert body["mind"]["mood"] == pytest.approx(0.55)
    assert body["mind"]["desire_for_user"] == pytest.approx(0.0)
    assert body["mind"]["inhibition"] == pytest.approx(0.85)
    assert body["traits"]["openness"] == pytest.approx(0.50)
    assert body["thread"] is not None
    assert body["thread"]["tension"] == pytest.approx(0.20)


def test_kokoro_state_without_session_omits_thread(client, db_path):
    char_id, _ = _insert_minimal_char_session(db_path)
    r = client.get(f"/api/kokoro/state/{char_id}")
    assert r.status_code == 200
    assert r.json()["thread"] is None


def test_kokoro_finalize_skips_persistence_when_flag_off(client, db_path, server_module, monkeypatch):
    char_id, session_id = _insert_minimal_char_session(db_path)
    # Default config has kokoro_enabled absent/False; verify by leaving as-is.

    r = client.post(
        "/api/kokoro/finalize",
        json={
            "char_id": char_id,
            "session_id": session_id,
            "raw_text": '{"reply": "hi", "stateDelta": {"mood": 0.05}}',
        },
    )
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True
    assert body["payload"]["reply"] == "hi"
    assert body["payload"]["diagnostics"]["kokoroEnabled"] is False

    # No row should have been written.
    con = sqlite3.connect(db_path)
    try:
        row = con.execute(
            "SELECT character_id FROM character_mind_state WHERE character_id = ?",
            (char_id,),
        ).fetchone()
    finally:
        con.close()
    assert row is None


def test_kokoro_finalize_applies_delta_when_enabled(client, db_path, server_module, monkeypatch):
    char_id, session_id = _insert_minimal_char_session(db_path)

    # Flip the kokoro flag on for this test by patching load_config.
    original_cfg = server_module.load_config()
    patched = dict(original_cfg)
    patched["kokoro_enabled"] = True
    patched["content_filter_level"] = 0  # NSFW master off → Tier F stays closed
    monkeypatch.setattr(server_module, "load_config", lambda: dict(patched))

    r = client.post(
        "/api/kokoro/finalize",
        json={
            "char_id": char_id,
            "session_id": session_id,
            "raw_text": '{"reply": "ok", "emotion": "happy", "stateDelta": {"mood": 0.04}}',
        },
    )
    assert r.status_code == 200
    body = r.json()
    payload = body["payload"]
    assert payload["diagnostics"]["kokoroEnabled"] is True
    assert payload["diagnostics"]["parseOk"] is True
    assert payload["emotion"] == "happy"
    assert payload["nsfw"]["active"] is False  # gate closed by content_filter_level=0

    # Row should now exist with mood bumped by 0.04 from default 0.55.
    con = sqlite3.connect(db_path)
    try:
        row = con.execute(
            "SELECT mood FROM character_mind_state WHERE character_id = ?",
            (char_id,),
        ).fetchone()
    finally:
        con.close()
    assert row is not None
    assert row[0] == pytest.approx(0.55 + 0.04, abs=1e-6)


def test_kokoro_finalize_plain_text_fallback_does_not_break(client, db_path, server_module, monkeypatch):
    char_id, session_id = _insert_minimal_char_session(db_path)

    patched = dict(server_module.load_config())
    patched["kokoro_enabled"] = True
    monkeypatch.setattr(server_module, "load_config", lambda: dict(patched))

    r = client.post(
        "/api/kokoro/finalize",
        json={
            "char_id": char_id,
            "session_id": session_id,
            "raw_text": "just a plain-text reply, no json",
        },
    )
    assert r.status_code == 200
    payload = r.json()["payload"]
    assert payload["diagnostics"]["parseOk"] is False
    assert payload["reply"] == "just a plain-text reply, no json"
    # Embodiment fields fall back to neutral defaults.
    assert payload["emotion"] == "neutral"
    assert payload["facialExpression"] == "neutral"
    assert payload["gesture"] == "idle"
