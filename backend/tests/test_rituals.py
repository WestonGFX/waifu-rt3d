"""Tests for backend/relationship/rituals.py — recurring-ritual memory (v87).

All tests use in-memory SQLite so no disk state is created or leaked.
Covers: the detection heuristic (pure function), record/upsert reinforcement,
the injection gate (>= 2 observations), and ordering.
"""
from __future__ import annotations

import sqlite3

import pytest

from backend.relationship.rituals import (
    MIN_OBSERVE_FOR_INJECTION,
    RitualManager,
    detect_ritual_candidate,
)

_DDL = """
CREATE TABLE IF NOT EXISTS relationship_rituals (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    char_id           INTEGER NOT NULL,
    ritual_type       TEXT    NOT NULL DEFAULT 'recurring',
    label             TEXT    NOT NULL,
    description       TEXT    NOT NULL DEFAULT '',
    observe_count     INTEGER NOT NULL DEFAULT 1,
    importance        REAL    NOT NULL DEFAULT 0.5,
    first_observed_at TEXT    NOT NULL DEFAULT (datetime('now')),
    last_observed_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    is_active         INTEGER NOT NULL DEFAULT 1,
    UNIQUE(char_id, label)
)
"""


@pytest.fixture()
def conn() -> sqlite3.Connection:
    c = sqlite3.connect(":memory:")
    c.execute(_DDL)
    c.commit()
    yield c
    c.close()


@pytest.fixture()
def mgr() -> RitualManager:
    return RitualManager()


# --- Detection heuristic ---------------------------------------------------


class TestDetect:
    def test_detects_recurrence_language(self) -> None:
        cand = detect_ritual_candidate("we always start with coffee before coding")
        assert cand is not None
        assert "coffee" in cand["label"]
        assert cand["ritual_type"] == "recurring"

    def test_greeting_type(self) -> None:
        cand = detect_ritual_candidate("every morning you say good morning to me first")
        assert cand is not None
        assert cand["ritual_type"] == "greeting"

    def test_anniversary_type(self) -> None:
        cand = detect_ritual_candidate("every year we celebrate our anniversary in spring")
        assert cand is not None
        assert cand["ritual_type"] == "anniversary"

    def test_no_recurrence_returns_none(self) -> None:
        assert detect_ritual_candidate("what's the weather today?") is None

    def test_empty_returns_none(self) -> None:
        assert detect_ritual_candidate("") is None
        assert detect_ritual_candidate("   ") is None

    def test_label_is_bounded_and_stable(self) -> None:
        # The same described ritual collapses to the same label on repeat mention.
        a = detect_ritual_candidate("we always do our late-night coding sessions together")
        b = detect_ritual_candidate("we always do our late-night coding sessions together!")
        assert a is not None and b is not None
        assert a["label"] == b["label"]
        assert len(a["label"]) <= 80


# --- Record / upsert -------------------------------------------------------


class TestRecord:
    def test_first_record_creates_with_count_one(self, mgr, conn) -> None:
        rid = mgr.record_ritual(1, "late-night coding", conn)
        row = conn.execute(
            "SELECT observe_count, importance FROM relationship_rituals WHERE id=?",
            (rid,),
        ).fetchone()
        assert row[0] == 1
        assert row[1] == pytest.approx(0.5)

    def test_repeat_reinforces_same_row(self, mgr, conn) -> None:
        r1 = mgr.record_ritual(1, "late-night coding", conn)
        r2 = mgr.record_ritual(1, "late-night coding", conn)
        assert r1 == r2  # same row, upsert not duplicate
        row = conn.execute(
            "SELECT observe_count, importance FROM relationship_rituals WHERE id=?",
            (r1,),
        ).fetchone()
        assert row[0] == 2
        assert row[1] == pytest.approx(0.6)  # 0.5 + 0.1

    def test_importance_capped_at_one(self, mgr, conn) -> None:
        for _ in range(20):
            mgr.record_ritual(1, "coffee ritual", conn)
        row = conn.execute(
            "SELECT importance FROM relationship_rituals WHERE char_id=1 AND label='coffee ritual'"
        ).fetchone()
        assert row[0] <= 1.0

    def test_empty_label_raises(self, mgr, conn) -> None:
        with pytest.raises(ValueError):
            mgr.record_ritual(1, "   ", conn)

    def test_unknown_type_coerced(self, mgr, conn) -> None:
        rid = mgr.record_ritual(1, "thing", conn, ritual_type="bogus")
        row = conn.execute(
            "SELECT ritual_type FROM relationship_rituals WHERE id=?", (rid,)
        ).fetchone()
        assert row[0] == "recurring"

    def test_description_refreshed_only_when_nonempty(self, mgr, conn) -> None:
        rid = mgr.record_ritual(1, "x", conn, description="first desc")
        mgr.record_ritual(1, "x", conn, description="")  # must not wipe
        row = conn.execute(
            "SELECT description FROM relationship_rituals WHERE id=?", (rid,)
        ).fetchone()
        assert row[0] == "first desc"
        mgr.record_ritual(1, "x", conn, description="updated")
        row = conn.execute(
            "SELECT description FROM relationship_rituals WHERE id=?", (rid,)
        ).fetchone()
        assert row[0] == "updated"


# --- Injection gate --------------------------------------------------------


class TestInjection:
    def test_single_observation_not_injected(self, mgr, conn) -> None:
        mgr.record_ritual(1, "late-night coding", conn)  # count = 1
        assert mgr.get_prompt_injection(1, conn) == ""

    def test_injected_after_threshold(self, mgr, conn) -> None:
        for _ in range(MIN_OBSERVE_FOR_INJECTION):
            mgr.record_ritual(1, "late-night coding", conn, description="late-night coding together")
        block = mgr.get_prompt_injection(1, conn)
        assert block.startswith("[SHARED RITUALS")
        assert "late-night coding together" in block

    def test_injection_empty_for_unknown_char(self, mgr, conn) -> None:
        assert mgr.get_prompt_injection(999, conn) == ""

    def test_ordering_by_importance(self, mgr, conn) -> None:
        # 'beta' reinforced more → higher importance → surfaces first.
        # (Use distinctive multi-char descriptions so the assertion doesn't
        # accidentally match letters in the header copy.)
        mgr.record_ritual(1, "ritual alpha", conn, description="ALPHA_RITUAL")
        mgr.record_ritual(1, "ritual alpha", conn, description="ALPHA_RITUAL")
        for _ in range(4):
            mgr.record_ritual(1, "ritual beta", conn, description="BETA_RITUAL")
        block = mgr.get_prompt_injection(1, conn)
        assert block.index("BETA_RITUAL") < block.index("ALPHA_RITUAL")
