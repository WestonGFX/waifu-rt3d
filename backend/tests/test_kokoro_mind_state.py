"""Tests for backend.kokoro.mind_state.

Covers clamping, load/save round-trip, delta application + cap, and the
v83/v84 migration chain producing the expected columns.
"""
from __future__ import annotations

import sqlite3

import pytest

from backend.kokoro.mind_state import (
    MindState,
    TraitVector,
    ThreadState,
    apply_state_delta,
    clamp01,
    load_mind_state,
    load_thread_state,
    load_traits,
    parse_kink_vector,
    save_mind_state,
    save_thread_state,
)
from backend.preflight import migrate_to_v83, migrate_to_v84


@pytest.fixture()
def con() -> sqlite3.Connection:
    """In-memory DB at schema v84 with the FK parents Kokoro needs."""
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


# --- clamp01 ---------------------------------------------------------------


@pytest.mark.parametrize(
    "raw,want",
    [
        (0.5, 0.5),
        (0.0, 0.0),
        (1.0, 1.0),
        (-0.3, 0.0),
        (1.4, 1.0),
        (float("nan"), 0.0),
        (float("inf"), 0.0),
        (float("-inf"), 0.0),
        ("0.7", 0.7),
        (None, 0.0),
        ("garbage", 0.0),
    ],
)
def test_clamp01(raw, want):
    assert clamp01(raw) == pytest.approx(want)


# --- load defaults when no row ----------------------------------------------


def test_load_returns_defaults_for_missing_row(con):
    m = load_mind_state(con, 1)
    assert m.character_id == 1
    assert m.mood == 0.55  # default from v83 migration
    assert m.desire_for_user == 0.0
    assert m.inhibition == 0.85

    t = load_traits(con, 1)
    assert t.character_id == 1
    assert t.openness == 0.5

    th = load_thread_state(con, 100)
    assert th.session_id == 100
    assert th.tension == 0.20
    assert th.consent_check_pending == 0


# --- save round-trip + clamping --------------------------------------------


def test_save_mind_state_clamps_out_of_range(con):
    m = load_mind_state(con, 1)
    m.mood = 1.6           # over
    m.energy = -0.5        # under
    m.desire_for_user = 0.42
    save_mind_state(con, m)

    reloaded = load_mind_state(con, 1)
    assert reloaded.mood == 1.0
    assert reloaded.energy == 0.0
    assert reloaded.desire_for_user == pytest.approx(0.42)


def test_save_thread_state_normalizes_consent_pending(con):
    th = load_thread_state(con, 100)
    th.consent_check_pending = 7  # truthy but not 0/1
    th.tension = 0.95
    save_thread_state(con, th)
    reloaded = load_thread_state(con, 100)
    assert reloaded.consent_check_pending == 1
    assert reloaded.tension == pytest.approx(0.95)


# --- apply_state_delta -----------------------------------------------------


def test_apply_state_delta_caps_per_turn_movement():
    base = MindState(character_id=1, mood=0.5)
    # LLM tries to swing mood by 0.5 in one turn — must cap at 0.05.
    out = apply_state_delta(base, {"mood": 0.5, "energy": -0.5})
    assert out.mood == pytest.approx(0.55)
    assert out.energy == pytest.approx(0.70)


def test_apply_state_delta_ignores_unknown_dials_and_garbage():
    base = MindState(character_id=1, mood=0.5, curiosity=0.6)
    out = apply_state_delta(base, {
        "mood": 0.04,
        "curiosity": "nope",     # non-numeric ignored
        "garbage_dial": 0.9,     # unknown ignored
        "energy": float("nan"),  # NaN ignored
    })
    assert out.mood == pytest.approx(0.54)
    assert out.curiosity == 0.6   # untouched
    assert out.energy == base.energy


def test_apply_state_delta_does_not_mutate_input():
    base = MindState(character_id=1, mood=0.5)
    out = apply_state_delta(base, {"mood": 0.04})
    assert base.mood == 0.5
    assert out is not base


def test_apply_state_delta_clamps_at_bounds():
    base = MindState(character_id=1, mood=0.98, energy=0.02)
    out = apply_state_delta(base, {"mood": 0.05, "energy": -0.05})
    assert out.mood == 1.0
    assert out.energy == 0.0


# --- kink alignment vector parsing ----------------------------------------


def test_parse_kink_vector_handles_empty_and_invalid():
    th = ThreadState(session_id=1)
    assert parse_kink_vector(th) == {}

    th.kink_alignment_vector = "not json"
    assert parse_kink_vector(th) == {}

    th.kink_alignment_vector = '{"playful": 0.8}'
    assert parse_kink_vector(th) == {"playful": 0.8}

    th.kink_alignment_vector = "[1,2,3]"  # JSON but not a dict
    assert parse_kink_vector(th) == {}


# --- migration column presence --------------------------------------------


def test_v83_creates_all_tier_columns(con):
    cols = {r[1] for r in con.execute("PRAGMA table_info(character_mind_state)").fetchall()}
    # Tier A
    for name in ("mood", "arousal", "energy", "curiosity", "playfulness",
                 "confidence", "vulnerability", "agency", "coherence",
                 "focus", "tenderness", "humor_charge", "awe"):
        assert name in cols, f"missing Tier A column {name}"
    # Tier B
    for name in ("loneliness", "restedness", "boredom_with_topic",
                 "anticipation", "nostalgia"):
        assert name in cols, f"missing Tier B column {name}"
    # Tier F (added by v84)
    for name in ("desire_for_user", "inhibition", "boldness", "modesty",
                 "tension_buildup", "afterglow"):
        assert name in cols, f"missing Tier F column {name}"


def test_v84_thread_state_columns(con):
    cols = {r[1] for r in con.execute("PRAGMA table_info(thread_state)").fetchall()}
    for name in ("tension", "intimacy_level", "comedic_energy",
                 "last_callback_memory_id", "consent_check_pending",
                 "kink_alignment_vector"):
        assert name in cols, f"missing thread_state column {name}"
