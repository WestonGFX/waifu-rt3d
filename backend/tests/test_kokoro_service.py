"""Tests for backend.kokoro.service.

Focus: gate logic.  Tier F dials must remain invisible until BOTH the global
NSFW toggle is on AND the bond level is at or above ``M6_TIER_F_MIN``.
"""
from __future__ import annotations

import sqlite3

import pytest

from backend.kokoro import service as svc
from backend.kokoro.mind_state import save_mind_state, MindState
from backend.preflight import migrate_to_v83, migrate_to_v84


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
    yield c
    c.close()


@pytest.fixture()
def stub_bond(monkeypatch):
    """Stub the bond.progression import so tests don't need that subsystem."""
    def _set(level: int):
        def fake_get_bond_level(char_id, cur):
            return {"bond_level": level}
        import sys, types
        mod = types.ModuleType("backend.bond.progression")
        mod.get_bond_level = fake_get_bond_level
        monkeypatch.setitem(sys.modules, "backend.bond.progression", mod)
    return _set


def test_disabled_returns_empty_fragment(con, stub_bond):
    stub_bond(50)
    ctx = svc.prepare_turn(
        con, character_id=1, session_id=100,
        kokoro_enabled=False, nsfw_enabled=True,
    )
    assert ctx.enabled is False
    assert ctx.nsfw_active is False
    assert ctx.fragment == ""


def test_enabled_without_nsfw_master_omits_tier_f(con, stub_bond):
    stub_bond(99)  # high bond, but NSFW master off
    ctx = svc.prepare_turn(
        con, character_id=1, session_id=100,
        kokoro_enabled=True, nsfw_enabled=False,
    )
    assert ctx.enabled is True
    assert ctx.nsfw_active is False
    assert "Intimate-mode dials" not in ctx.fragment
    assert "innerArousalShift" not in ctx.fragment


def test_low_bond_blocks_tier_f_even_with_nsfw_master_on(con, stub_bond):
    stub_bond(svc.M6_TIER_F_MIN - 1)
    ctx = svc.prepare_turn(
        con, character_id=1, session_id=100,
        kokoro_enabled=True, nsfw_enabled=True,
    )
    assert ctx.nsfw_active is False
    assert "Intimate-mode dials" not in ctx.fragment


def test_high_bond_plus_nsfw_master_opens_tier_f(con, stub_bond):
    stub_bond(svc.M6_TIER_F_MIN)
    ctx = svc.prepare_turn(
        con, character_id=1, session_id=100,
        kokoro_enabled=True, nsfw_enabled=True,
    )
    assert ctx.nsfw_active is True
    assert "Intimate-mode dials" in ctx.fragment
    # Session-46 MVP prune dropped `innerArousalShift` / `suggestiveBid` /
    # `selfConsentCheck` (debug-only, zero consumers). Verify the NSFW
    # additions still land in the fragment via `boundaryReinforcement` —
    # the only Tier-F field that has a real side effect (safety event log).
    assert "boundaryReinforcement" in ctx.fragment


def test_finalize_persists_state_delta_when_enabled(con, stub_bond):
    stub_bond(5)
    ctx = svc.prepare_turn(
        con, character_id=1, session_id=100,
        kokoro_enabled=True, nsfw_enabled=False,
    )
    raw = '{"reply": "ok", "stateDelta": {"mood": 0.04}}'
    resp = svc.finalize_turn(con, ctx, raw)
    assert resp.parse_ok is True

    from backend.kokoro.mind_state import load_mind_state
    reloaded = load_mind_state(con, 1)
    # Default mood is 0.55; delta capped at 0.05, so 0.04 applies fully.
    assert reloaded.mood == pytest.approx(0.55 + 0.04)


def test_finalize_skips_persistence_when_disabled(con, stub_bond):
    stub_bond(5)
    ctx = svc.prepare_turn(
        con, character_id=1, session_id=100,
        kokoro_enabled=False, nsfw_enabled=False,
    )
    raw = '{"reply": "ok", "stateDelta": {"mood": 0.04}}'
    svc.finalize_turn(con, ctx, raw)
    # No row should have been inserted.
    row = con.execute(
        "SELECT character_id FROM character_mind_state WHERE character_id = 1"
    ).fetchone()
    assert row is None


def test_finalize_consent_check_marks_thread_pending(con, stub_bond):
    stub_bond(svc.M6_TIER_F_MIN + 5)
    ctx = svc.prepare_turn(
        con, character_id=1, session_id=100,
        kokoro_enabled=True, nsfw_enabled=True,
    )
    raw = '{"reply": "wait — are you okay?", "selfConsentCheck": true}'
    svc.finalize_turn(con, ctx, raw)

    row = con.execute(
        "SELECT consent_check_pending FROM thread_state WHERE session_id = 100"
    ).fetchone()
    assert row is not None
    assert row[0] == 1


def test_frontend_payload_shape(con, stub_bond):
    stub_bond(10)
    ctx = svc.prepare_turn(
        con, character_id=1, session_id=100,
        kokoro_enabled=True, nsfw_enabled=False,
    )
    raw = '{"reply": "hi", "emotion": "happy", "facialExpression": "smile"}'
    resp = svc.finalize_turn(con, ctx, raw)
    payload = svc.response_to_frontend_payload(resp, ctx)

    assert payload["reply"] == "hi"
    assert payload["emotion"] == "happy"
    assert payload["facialExpression"] == "smile"
    assert payload["nsfw"]["active"] is False
    assert payload["diagnostics"]["kokoroEnabled"] is True
    assert payload["diagnostics"]["bondLevel"] == 10
    assert payload["diagnostics"]["parseOk"] is True
