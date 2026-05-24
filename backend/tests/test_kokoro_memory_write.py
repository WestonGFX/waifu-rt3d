"""Tests for Kokoro → tiered_memory write integration."""
from __future__ import annotations

import sqlite3

import pytest

from backend.kokoro.service import finalize_turn, prepare_turn
from backend.preflight import migrate_to_v83, migrate_to_v84


class _StubVectorStore:
    """Minimal duck-typed stand-in for TieredMemoryManager.

    Records every ``add()`` call so tests can verify counts + arguments.
    Real embedding + sqlite-vec are out of scope here; the contract we test
    is just "did the service call .add with the right params?".
    """

    def __init__(self) -> None:
        self.calls: list[dict] = []

    def add(self, session_id, char_id, role, text, salience=0.5):  # noqa: D401
        self.calls.append({
            "session_id": session_id,
            "char_id": char_id,
            "role": role,
            "text": text,
            "salience": salience,
        })
        return len(self.calls)  # fake row id


@pytest.fixture()
def con():
    c = sqlite3.connect(":memory:")
    c.execute("PRAGMA foreign_keys = ON")
    c.execute("CREATE TABLE schema_version (version INTEGER, applied_ts REAL)")
    c.execute("INSERT INTO schema_version VALUES (82, 0)")
    c.execute("CREATE TABLE characters (id INTEGER PRIMARY KEY, name TEXT)")
    c.execute("CREATE TABLE sessions (id INTEGER PRIMARY KEY)")
    # Minimal memories table mirroring v40+ schema for the dedup query.
    c.execute(
        "CREATE TABLE memories ("
        " id INTEGER PRIMARY KEY AUTOINCREMENT,"
        " character_id INTEGER,"
        " session_id INTEGER,"
        " role TEXT,"
        " text TEXT,"
        " tier INTEGER,"
        " salience REAL,"
        " created_at TEXT DEFAULT (datetime('now'))"
        ")"
    )
    c.execute("INSERT INTO characters (id, name) VALUES (1, 'Sakura')")
    c.execute("INSERT INTO sessions (id) VALUES (100)")
    assert migrate_to_v83(c)
    assert migrate_to_v84(c)
    yield c
    c.close()


@pytest.fixture()
def stub_bond(monkeypatch):
    import sys, types
    mod = types.ModuleType("backend.bond.progression")
    mod.get_bond_level = lambda char_id, cur: {"bond_level": 5}
    monkeypatch.setitem(sys.modules, "backend.bond.progression", mod)


def test_memory_write_calls_vector_store(con, stub_bond):
    ctx = prepare_turn(
        con, character_id=1, session_id=100,
        kokoro_enabled=True, nsfw_enabled=False,
    )
    store = _StubVectorStore()
    raw = (
        '{"reply": "noted!", '
        '"memoryWrite": {"shouldSave": true, "summary": "User loves ramen",'
        ' "importance": 0.7, "emotionalSalience": 0.6}}'
    )
    finalize_turn(con, ctx, raw, vector_store=store)
    assert len(store.calls) == 1
    call = store.calls[0]
    assert call["char_id"] == 1
    assert call["session_id"] == 100
    assert call["role"] == "knowledge"
    assert call["text"] == "User loves ramen"
    assert call["salience"] == pytest.approx(0.7)  # max of 0.7/0.6


def test_no_write_when_should_save_false(con, stub_bond):
    ctx = prepare_turn(
        con, character_id=1, session_id=100,
        kokoro_enabled=True, nsfw_enabled=False,
    )
    store = _StubVectorStore()
    raw = '{"reply": "ok", "memoryWrite": {"shouldSave": false, "summary": "x"}}'
    finalize_turn(con, ctx, raw, vector_store=store)
    assert store.calls == []


def test_no_write_when_summary_empty(con, stub_bond):
    ctx = prepare_turn(
        con, character_id=1, session_id=100,
        kokoro_enabled=True, nsfw_enabled=False,
    )
    store = _StubVectorStore()
    raw = '{"reply": "ok", "memoryWrite": {"shouldSave": true, "summary": "   "}}'
    finalize_turn(con, ctx, raw, vector_store=store)
    assert store.calls == []


def test_dedup_blocks_duplicate_within_24h(con, stub_bond):
    # Pre-seed identical memory row.
    con.execute(
        "INSERT INTO memories (character_id, role, text, created_at)"
        " VALUES (1, 'knowledge', 'User loves ramen', datetime('now'))"
    )
    ctx = prepare_turn(
        con, character_id=1, session_id=100,
        kokoro_enabled=True, nsfw_enabled=False,
    )
    store = _StubVectorStore()
    raw = (
        '{"reply": "noted!", "memoryWrite": '
        '{"shouldSave": true, "summary": "User loves ramen", "importance": 0.6}}'
    )
    finalize_turn(con, ctx, raw, vector_store=store)
    assert store.calls == []


def test_dedup_allows_different_text(con, stub_bond):
    con.execute(
        "INSERT INTO memories (character_id, role, text, created_at)"
        " VALUES (1, 'knowledge', 'User loves ramen', datetime('now'))"
    )
    ctx = prepare_turn(
        con, character_id=1, session_id=100,
        kokoro_enabled=True, nsfw_enabled=False,
    )
    store = _StubVectorStore()
    raw = (
        '{"reply": "noted!", "memoryWrite": '
        '{"shouldSave": true, "summary": "User loves Dracula themes", "importance": 0.6}}'
    )
    finalize_turn(con, ctx, raw, vector_store=store)
    assert len(store.calls) == 1
    assert store.calls[0]["text"] == "User loves Dracula themes"


def test_no_write_when_vector_store_is_none(con, stub_bond):
    ctx = prepare_turn(
        con, character_id=1, session_id=100,
        kokoro_enabled=True, nsfw_enabled=False,
    )
    raw = (
        '{"reply": "noted!", "memoryWrite": '
        '{"shouldSave": true, "summary": "User loves ramen", "importance": 0.6}}'
    )
    # No vector_store passed → should not raise, no error.
    resp = finalize_turn(con, ctx, raw)
    assert resp.memory_write.should_save is True
    # Mind state still updated normally.
    assert resp.reply == "noted!"


def test_salience_clamped(con, stub_bond):
    ctx = prepare_turn(
        con, character_id=1, session_id=100,
        kokoro_enabled=True, nsfw_enabled=False,
    )
    store = _StubVectorStore()
    raw = (
        '{"reply": "x", "memoryWrite": '
        '{"shouldSave": true, "summary": "spike", "importance": 9.5, "emotionalSalience": -3}}'
    )
    finalize_turn(con, ctx, raw, vector_store=store)
    assert store.calls[0]["salience"] == 1.0  # clamped
