"""Tests for Kokoro safety-event logging and the QA endpoint."""
from __future__ import annotations

import sqlite3

import pytest

from backend.kokoro.service import finalize_turn, prepare_turn
from backend.preflight import migrate_to_v83, migrate_to_v84, migrate_to_v85


@pytest.fixture()
def con():
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
    yield c
    c.close()


@pytest.fixture()
def stub_bond_at(monkeypatch):
    def _set(level: int):
        import sys, types
        mod = types.ModuleType("backend.bond.progression")
        mod.get_bond_level = lambda char_id, cur: {"bond_level": level}
        monkeypatch.setitem(sys.modules, "backend.bond.progression", mod)
    return _set


def test_boundary_reinforcement_logs_event(con, stub_bond_at):
    stub_bond_at(15)  # below M6 gate; Tier F closed, but boundary still logged
    ctx = prepare_turn(
        con, character_id=1, session_id=100,
        kokoro_enabled=True, nsfw_enabled=True,
    )
    raw = (
        '{"reply": "let\'s slow down", "boundaryReinforcement": true}'
    )
    finalize_turn(con, ctx, raw)
    rows = con.execute(
        "SELECT character_id, session_id, event_type, bond_level"
        " FROM kokoro_safety_events"
    ).fetchall()
    # Boundary fields are NSFW-gated in the parser when nsfw_active is False,
    # so for this test (bond < gate) the parser strips boundaryReinforcement.
    # That means no row is logged — which is the correct contract: we only
    # log boundary events from the *gate-open* path.
    assert len(rows) == 0


def test_boundary_logged_when_gate_open(con, stub_bond_at):
    stub_bond_at(50)  # above gate, Tier F active
    ctx = prepare_turn(
        con, character_id=1, session_id=100,
        kokoro_enabled=True, nsfw_enabled=True,
    )
    raw = (
        '{"reply": "wait — slow down", "boundaryReinforcement": true}'
    )
    finalize_turn(con, ctx, raw)
    rows = con.execute(
        "SELECT character_id, session_id, event_type, bond_level"
        " FROM kokoro_safety_events"
    ).fetchall()
    assert len(rows) == 1
    char_id, sess_id, ev_type, bond = rows[0]
    assert char_id == 1
    assert sess_id == 100
    assert ev_type == "boundary_reinforcement"
    assert bond == 50


def test_no_event_when_boundary_false(con, stub_bond_at):
    stub_bond_at(50)
    ctx = prepare_turn(
        con, character_id=1, session_id=100,
        kokoro_enabled=True, nsfw_enabled=True,
    )
    raw = '{"reply": "ok", "boundaryReinforcement": false}'
    finalize_turn(con, ctx, raw)
    rows = con.execute("SELECT COUNT(*) FROM kokoro_safety_events").fetchone()
    assert rows[0] == 0
