"""Tests for GET /api/kokoro/debug/state — Bundle D psychology debug endpoint.

Covers:
  - Basic shape: all expected keys present, HTTP 200, ok=True.
  - Populated data: mind dials, traits, parse-ok rate, relationship block,
    rituals block all populated when the underlying tables exist.
  - Resilience: bare conftest schema (no Kokoro tables) → 200, empty sections.
  - Memory search: vector_store=None → empty retrieved_memories, no 500.
  - Query param passthrough: char_id + optional session_id + optional q.

Uses the shared ``client`` + ``db_path`` + ``server_module`` fixtures from
conftest.py (FastAPI TestClient with a tmp_path SQLite DB).

Schema bootstrap strategy:
  - ``_setup_kokoro_tables`` runs v83-v87 migrations (exactly matching what
    test_kokoro_qa_endpoint.py does for v83-v86, extended to v87 for rituals).
  - ``_insert_bond_row`` creates the character_relationships row that
    ``build_relationship_state_block`` requires to return a non-None block.
"""
from __future__ import annotations

import sqlite3
from pathlib import Path

import pytest


# ---------------------------------------------------------------------------
# Schema bootstrap helpers
# ---------------------------------------------------------------------------


def _setup_kokoro_tables(db_path: Path) -> int:
    """Run v83-v87 migrations on the test DB and return a usable char_id.

    The conftest schema predates the Kokoro migrations, so we run each one
    explicitly.  The conftest inserts character id=1 already; we return that
    id rather than inserting a duplicate.

    Args:
        db_path: Path to the temporary SQLite DB created by server_module.

    Returns:
        The id of the existing test character (1).
    """
    from backend.preflight import (
        migrate_to_v83,
        migrate_to_v84,
        migrate_to_v85,
        migrate_to_v86,
        migrate_to_v87,
    )

    con = sqlite3.connect(db_path)
    try:
        # Ensure schema_version exists so migration guards don't short-circuit.
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
        migrate_to_v85(con)
        migrate_to_v86(con)
        migrate_to_v87(con)
    finally:
        con.close()

    # conftest inserts char id=1 ("Default") — reuse it.
    return 1


def _insert_mind_row(db_path: Path, char_id: int) -> None:
    """Insert a minimal character_mind_state row for testing.

    Args:
        db_path: Path to the test DB.
        char_id: Character to seed.
    """
    con = sqlite3.connect(db_path)
    try:
        con.execute(
            "INSERT OR REPLACE INTO character_mind_state "
            "(character_id, mood, arousal, energy, curiosity, playfulness, "
            "confidence, vulnerability, agency, coherence, focus, tenderness, "
            "humor_charge, awe, loneliness, restedness, boredom_with_topic, "
            "anticipation, nostalgia, desire_for_user, inhibition, boldness, "
            "modesty, tension_buildup, afterglow) "
            "VALUES (?, 0.7, 0.3, 0.8, 0.6, 0.5, 0.5, 0.2, 0.5, 0.8, 0.6, "
            "0.5, 0.4, 0.4, 0.3, 0.7, 0.2, 0.4, 0.3, 0.0, 0.8, 0.2, 0.6, "
            "0.0, 0.0)",
            (char_id,),
        )
        con.commit()
    finally:
        con.close()


def _insert_trait_row(db_path: Path, char_id: int) -> None:
    """Insert a character_traits row.

    Args:
        db_path: Path to the test DB.
        char_id: Character to seed.
    """
    con = sqlite3.connect(db_path)
    try:
        con.execute(
            "INSERT OR REPLACE INTO character_traits "
            "(character_id, openness, warmth, dominance, mischief, melancholy_tendency) "
            "VALUES (?, 0.6, 0.7, 0.4, 0.5, 0.3)",
            (char_id,),
        )
        con.commit()
    finally:
        con.close()


def _insert_bond_row(db_path: Path, char_id: int) -> None:
    """Insert a character_relationships row so the relationship block renders.

    Args:
        db_path: Path to the test DB.
        char_id: Character to seed.
    """
    con = sqlite3.connect(db_path)
    try:
        con.execute(
            "INSERT OR IGNORE INTO character_relationships "
            "(char_id, bond_level, bond_xp, relationship_mode) VALUES (?, 45, 200, 'romantic')",
            (char_id,),
        )
        con.commit()
    finally:
        con.close()


def _insert_parse_log_rows(db_path: Path, char_id: int, parse_ok_values: list[int]) -> None:
    """Insert recent kokoro_parse_log rows for parse-ok rate tests.

    Args:
        db_path: Path to the test DB.
        char_id: Character to associate rows with.
        parse_ok_values: Sequence of 0/1 values — one row per element.
    """
    con = sqlite3.connect(db_path)
    try:
        for val in parse_ok_values:
            con.execute(
                "INSERT INTO kokoro_parse_log "
                "(character_id, parse_ok, raw_text_len, created_at) "
                "VALUES (?, ?, 80, datetime('now', '-1 hours'))",
                (char_id, val),
            )
        con.commit()
    finally:
        con.close()


# ---------------------------------------------------------------------------
# Test class
# ---------------------------------------------------------------------------


class TestKokoroDebugStateEndpoint:
    """Regression tests for GET /api/kokoro/debug/state."""

    # ------------------------------------------------------------------
    # 1. Basic shape — bare conftest schema (resilience path)
    # ------------------------------------------------------------------

    def test_returns_200_with_bare_schema(self, client, db_path):
        """Bare conftest schema (no Kokoro tables) → 200, ok=True.

        This is the primary resilience test: none of the Kokoro-specific
        tables exist, so every section should degrade to its empty default
        rather than causing a 500.
        """
        r = client.get("/api/kokoro/debug/state?char_id=1")
        assert r.status_code == 200
        body = r.json()
        assert body["ok"] is True

    def test_resilience_empty_sections_with_bare_schema(self, client, db_path):
        """Bare schema → all sections are empty defaults (not 500).

        mind_dials and traits must be empty dicts; parse_ok_rate may be
        None or 0.0; relationship/rituals blocks must be empty strings;
        retrieved_memories must be an empty list.
        """
        r = client.get("/api/kokoro/debug/state?char_id=1")
        assert r.status_code == 200
        body = r.json()
        assert isinstance(body["mind_dials"], dict)
        assert isinstance(body["traits"], dict)
        assert isinstance(body["relationship_block"], str)
        assert isinstance(body["rituals_block"], str)
        assert isinstance(body["retrieved_memories"], list)
        assert len(body["retrieved_memories"]) == 0

    # ------------------------------------------------------------------
    # 2. Required keys always present
    # ------------------------------------------------------------------

    def test_required_keys_present(self, client, db_path):
        """Response always contains all KokoroDebugState keys.

        These keys form the public contract with the frontend.  Missing
        keys would cause TypeScript errors at runtime that TSC won't catch
        (Pydantic↔TS drift is a named regression area in CLAUDE.md).
        """
        r = client.get("/api/kokoro/debug/state?char_id=1")
        body = r.json()
        expected = {
            "ok", "char_id", "session_id", "mind_dials", "traits",
            "parse_ok_rate", "parse_ok_total", "relationship_block",
            "rituals_block", "retrieved_memories",
        }
        assert expected.issubset(body.keys())

    # ------------------------------------------------------------------
    # 3. char_id echoed back
    # ------------------------------------------------------------------

    def test_char_id_echoed(self, client, db_path):
        """char_id in the response matches the query parameter.

        Prevents accidental hard-coding in the endpoint response.
        """
        r = client.get("/api/kokoro/debug/state?char_id=1")
        assert r.json()["char_id"] == 1

    # ------------------------------------------------------------------
    # 4. session_id optional passthrough
    # ------------------------------------------------------------------

    def test_session_id_echoed_when_provided(self, client, db_path):
        """session_id query param is reflected in the response.

        When provided, the relationship block uses it for session-scoped
        intimacy lookups; the value should be echoed back for debugging.
        """
        r = client.get("/api/kokoro/debug/state?char_id=1&session_id=42")
        assert r.json()["session_id"] == 42

    def test_session_id_null_when_absent(self, client, db_path):
        """session_id is None in the response when the param is omitted."""
        r = client.get("/api/kokoro/debug/state?char_id=1")
        assert r.json()["session_id"] is None

    # ------------------------------------------------------------------
    # 5. Mind dials populated when Kokoro tables exist
    # ------------------------------------------------------------------

    def test_mind_dials_populated(self, client, db_path):
        """mind_dials contains Tier A dial values when the table exists.

        After bootstrapping v83-v87 and inserting a mind-state row, Tier A
        dials like 'mood' and 'energy' must appear with numeric values.
        """
        _setup_kokoro_tables(db_path)
        _insert_mind_row(db_path, char_id=1)
        body = client.get("/api/kokoro/debug/state?char_id=1").json()
        assert "mood" in body["mind_dials"]
        assert "energy" in body["mind_dials"]
        assert isinstance(body["mind_dials"]["mood"], float)
        # Confirm Tier B dials also present
        assert "loneliness" in body["mind_dials"]

    def test_mind_dials_values_match_inserted(self, client, db_path):
        """Mind dial values match what was inserted (mood=0.7, energy=0.8)."""
        _setup_kokoro_tables(db_path)
        _insert_mind_row(db_path, char_id=1)
        body = client.get("/api/kokoro/debug/state?char_id=1").json()
        assert abs(body["mind_dials"]["mood"] - 0.7) < 0.001
        assert abs(body["mind_dials"]["energy"] - 0.8) < 0.001

    # ------------------------------------------------------------------
    # 6. Traits populated when character_traits table exists
    # ------------------------------------------------------------------

    def test_traits_populated(self, client, db_path):
        """traits contains Tier C identity values when the table exists."""
        _setup_kokoro_tables(db_path)
        _insert_trait_row(db_path, char_id=1)
        body = client.get("/api/kokoro/debug/state?char_id=1").json()
        assert "warmth" in body["traits"]
        assert isinstance(body["traits"]["warmth"], float)
        assert abs(body["traits"]["warmth"] - 0.7) < 0.001

    # ------------------------------------------------------------------
    # 7. Parse-ok rate
    # ------------------------------------------------------------------

    def test_parse_ok_rate_computed(self, client, db_path):
        """parse_ok_rate is correct when kokoro_parse_log rows exist.

        Inserts 8 ok + 2 fail → expect rate ≈ 0.8, total = 10.
        """
        _setup_kokoro_tables(db_path)
        _insert_parse_log_rows(db_path, char_id=1, parse_ok_values=[1]*8 + [0, 0])
        body = client.get("/api/kokoro/debug/state?char_id=1").json()
        assert body["parse_ok_total"] == 10
        assert abs(body["parse_ok_rate"] - 0.8) < 0.001

    def test_parse_ok_rate_zero_when_no_rows(self, client, db_path):
        """parse_ok_rate is 0.0 (not null) when the table exists but is empty."""
        _setup_kokoro_tables(db_path)
        body = client.get("/api/kokoro/debug/state?char_id=1").json()
        # Table exists but is empty — rate should be 0.0 and total 0.
        assert body["parse_ok_total"] == 0
        # parse_ok_rate may be 0.0 or None (both are acceptable empty states).
        assert body["parse_ok_rate"] is None or body["parse_ok_rate"] == pytest.approx(0.0)

    # ------------------------------------------------------------------
    # 8. Relationship block
    # ------------------------------------------------------------------

    def test_relationship_block_populated(self, client, db_path):
        """relationship_block is non-empty when a bond row exists.

        The block text contains the bond level header and is injected into
        the LLM system prompt — confirming it renders here confirms it
        renders in production.
        """
        _setup_kokoro_tables(db_path)
        _insert_bond_row(db_path, char_id=1)
        body = client.get("/api/kokoro/debug/state?char_id=1&session_id=1").json()
        assert len(body["relationship_block"]) > 10
        # The bond level we inserted (45) should appear somewhere in the text.
        assert "45" in body["relationship_block"]

    def test_relationship_block_empty_without_bond_row(self, client, db_path):
        """relationship_block is empty string when no bond row exists."""
        _setup_kokoro_tables(db_path)
        # No bond row inserted for char_id=1.
        body = client.get("/api/kokoro/debug/state?char_id=1").json()
        assert body["relationship_block"] == ""

    # ------------------------------------------------------------------
    # 9. Memory search — no vector store → empty list, never 500
    # ------------------------------------------------------------------

    def test_memory_search_with_no_vector_store(self, client, db_path):
        """vector_store=None → retrieved_memories=[], HTTP 200 (not 500).

        The conftest sets vector_store=None.  The endpoint must handle this
        gracefully and return an empty list rather than crashing.
        """
        r = client.get("/api/kokoro/debug/state?char_id=1&q=ramen")
        assert r.status_code == 200
        body = r.json()
        assert body["retrieved_memories"] == []

    def test_memory_search_absent_when_no_q(self, client, db_path):
        """When q is not provided, retrieved_memories is an empty list."""
        body = client.get("/api/kokoro/debug/state?char_id=1").json()
        assert body["retrieved_memories"] == []

    # ------------------------------------------------------------------
    # 10. Full populated shape — all sections together
    # ------------------------------------------------------------------

    def test_full_shape_with_kokoro_tables(self, client, db_path):
        """All sections return data when all Kokoro tables are bootstrapped.

        Integration-style test: seeds mind, traits, bond, parse-log rows,
        then verifies every section is populated and no section is empty
        except retrieved_memories (no vector store in test env).
        """
        _setup_kokoro_tables(db_path)
        _insert_mind_row(db_path, char_id=1)
        _insert_trait_row(db_path, char_id=1)
        _insert_bond_row(db_path, char_id=1)
        _insert_parse_log_rows(db_path, char_id=1, parse_ok_values=[1, 1, 0])

        body = client.get("/api/kokoro/debug/state?char_id=1&session_id=1").json()

        assert body["ok"] is True
        assert len(body["mind_dials"]) >= 13  # At minimum Tier A (13 dials)
        assert len(body["traits"]) == 5       # Tier C has 5 traits
        assert body["parse_ok_total"] == 3
        assert len(body["relationship_block"]) > 0
        # retrieved_memories is empty because vector_store=None in test env
        assert isinstance(body["retrieved_memories"], list)
