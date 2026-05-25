"""Tests for GET /api/kokoro/qa/{char_id} — parse_ok rate + boundary_count signals.

Covers the v86 extension that adds parse_ok_total / parse_ok_count / parse_ok_rate
fields to the existing boundary-reinforcement QA endpoint.

Uses the shared ``client`` + ``db_path`` fixtures from conftest.py (FastAPI
TestClient with a tmp_path SQLite DB).  The conftest schema predates v83-v86 so
each helper bootstraps only the tables it needs via the migration functions.
"""
from __future__ import annotations

import sqlite3
from pathlib import Path

import pytest


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _setup_kokoro_tables(db_path: Path) -> int:
    """Bootstrap Kokoro v83-v86 tables and return a usable char_id.

    The conftest schema predates the Kokoro migrations.  We run the four
    relevant migrations on top so the endpoint can hit the real tables.

    Args:
        db_path: Path to the temporary SQLite database created by the
            ``server_module`` fixture.

    Returns:
        The ``char_id`` of a freshly inserted test character.
    """
    from backend.preflight import (
        migrate_to_v83,
        migrate_to_v84,
        migrate_to_v85,
        migrate_to_v86,
    )

    con = sqlite3.connect(db_path)
    try:
        # Ensure schema_version table exists and is at v82 so the migration
        # guards don't short-circuit.
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

        con.execute("INSERT INTO characters (name) VALUES (?)", ("QAChan",))
        char_id = con.execute("SELECT last_insert_rowid()").fetchone()[0]
        con.commit()
    finally:
        con.close()

    return int(char_id)


def _insert_parse_log_rows(
    db_path: Path,
    char_id: int,
    parse_ok_values: list[int],
    hours_ago: float = 1.0,
) -> None:
    """Insert rows into kokoro_parse_log at a controlled timestamp.

    Args:
        db_path: Path to the test database.
        char_id: Character to associate rows with.
        parse_ok_values: Sequence of 0/1 values — one row per element.
        hours_ago: How many hours in the past to timestamp the rows.
            Defaults to 1.0 (well within the 48 h default window).
    """
    con = sqlite3.connect(db_path)
    try:
        ts_expr = f"datetime('now', '-{hours_ago} hours')"
        for val in parse_ok_values:
            con.execute(
                f"INSERT INTO kokoro_parse_log "
                f"(character_id, parse_ok, raw_text_len, created_at) "
                f"VALUES (?, ?, 100, {ts_expr})",
                (char_id, val),
            )
        con.commit()
    finally:
        con.close()


def _insert_safety_event(
    db_path: Path,
    char_id: int,
    bond_level: int = 5,
    hours_ago: float = 1.0,
) -> None:
    """Insert a kokoro_safety_events row for boundary-count tests.

    Args:
        db_path: Path to the test database.
        char_id: Character to associate the event with.
        bond_level: Bond level to record on the event row.
        hours_ago: How many hours in the past to timestamp the row.
    """
    con = sqlite3.connect(db_path)
    try:
        con.execute(
            f"INSERT INTO kokoro_safety_events "
            f"(character_id, bond_level, created_at) "
            f"VALUES (?, ?, datetime('now', '-{hours_ago} hours'))",
            (char_id, bond_level),
        )
        con.commit()
    finally:
        con.close()


# ---------------------------------------------------------------------------
# Test class
# ---------------------------------------------------------------------------

class TestKokoroQAEndpoint:
    """Regression tests for GET /api/kokoro/qa/{char_id}."""

    # ------------------------------------------------------------------
    # 1. Basic happy path
    # ------------------------------------------------------------------

    def test_qa_endpoint_returns_ok(self, client, db_path):
        """GET /api/kokoro/qa/1 returns HTTP 200 with ok=True.

        Verifies the endpoint is routed and the minimal success envelope
        is present even when all underlying tables are empty.
        """
        char_id = _setup_kokoro_tables(db_path)
        r = client.get(f"/api/kokoro/qa/{char_id}")
        assert r.status_code == 200
        assert r.json()["ok"] is True

    # ------------------------------------------------------------------
    # 2. Field presence
    # ------------------------------------------------------------------

    def test_qa_endpoint_has_parse_ok_fields(self, client, db_path):
        """Response contains all three parse_ok_* keys introduced by v86.

        Ensures the endpoint schema contract is stable and all downstream
        consumers can safely key on these fields.
        """
        char_id = _setup_kokoro_tables(db_path)
        body = client.get(f"/api/kokoro/qa/{char_id}").json()
        assert "parse_ok_total" in body
        assert "parse_ok_count" in body
        assert "parse_ok_rate" in body

    # ------------------------------------------------------------------
    # 3. Empty parse log → zeros
    # ------------------------------------------------------------------

    def test_qa_endpoint_empty_parse_log_returns_zeros(self, client, db_path):
        """No rows in kokoro_parse_log → total=0, count=0, rate=0.0.

        Confirms the zero-division guard: parse_ok_rate must be 0.0 rather
        than a NaN or division-by-zero error when total == 0.
        """
        char_id = _setup_kokoro_tables(db_path)
        body = client.get(f"/api/kokoro/qa/{char_id}").json()
        assert body["parse_ok_total"] == 0
        assert body["parse_ok_count"] == 0
        assert body["parse_ok_rate"] == pytest.approx(0.0)

    # ------------------------------------------------------------------
    # 4. All parse_ok=1 → rate 1.0
    # ------------------------------------------------------------------

    def test_qa_endpoint_all_parse_ok_true_rate_1(self, client, db_path):
        """Ten rows all with parse_ok=1 → parse_ok_rate == 1.0.

        Perfect-success path: every turn had a clean JSON response from
        the model.
        """
        char_id = _setup_kokoro_tables(db_path)
        _insert_parse_log_rows(db_path, char_id, [1] * 10)
        body = client.get(f"/api/kokoro/qa/{char_id}").json()
        assert body["parse_ok_total"] == 10
        assert body["parse_ok_count"] == 10
        assert body["parse_ok_rate"] == pytest.approx(1.0)

    # ------------------------------------------------------------------
    # 5. Mixed success → rate 0.8
    # ------------------------------------------------------------------

    def test_qa_endpoint_mixed_parse_ok_rate(self, client, db_path):
        """8 ok + 2 fail → parse_ok_rate ≈ 0.8.

        Exercises the fractional-rate calculation and the rounding to 4
        decimal places that the endpoint applies.
        """
        char_id = _setup_kokoro_tables(db_path)
        _insert_parse_log_rows(db_path, char_id, [1] * 8 + [0, 0])
        body = client.get(f"/api/kokoro/qa/{char_id}").json()
        assert body["parse_ok_total"] == 10
        assert body["parse_ok_count"] == 8
        assert body["parse_ok_rate"] == pytest.approx(0.8, abs=1e-4)

    # ------------------------------------------------------------------
    # 6. Window filtering — old rows excluded
    # ------------------------------------------------------------------

    def test_qa_endpoint_respects_hours_window(self, client, db_path):
        """Rows older than the window are excluded from parse_ok counts.

        Inserts 3 rows inside the 2 h window and 2 rows 100 h in the past,
        then requests ?hours=2 and expects only the 3 recent rows counted.
        """
        char_id = _setup_kokoro_tables(db_path)
        # 3 recent rows — inside any reasonable window
        _insert_parse_log_rows(db_path, char_id, [1, 1, 0], hours_ago=1.0)
        # 2 old rows — 100 h ago, well outside a 2 h window
        _insert_parse_log_rows(db_path, char_id, [1, 1], hours_ago=100.0)

        body = client.get(f"/api/kokoro/qa/{char_id}?hours=2").json()
        assert body["parse_ok_total"] == 3
        assert body["parse_ok_count"] == 2

    # ------------------------------------------------------------------
    # 7. Boundary count still present
    # ------------------------------------------------------------------

    def test_qa_endpoint_boundary_count_still_works(self, client, db_path):
        """Pre-existing boundary_count field remains correct after v86 additions.

        Adding parse_ok fields must not break the safety-events aggregate
        that was in place since v85.
        """
        char_id = _setup_kokoro_tables(db_path)
        _insert_safety_event(db_path, char_id, bond_level=10)
        _insert_safety_event(db_path, char_id, bond_level=10)
        _insert_safety_event(db_path, char_id, bond_level=20)

        body = client.get(f"/api/kokoro/qa/{char_id}").json()
        assert body["boundary_count"] == 3
        assert isinstance(body["by_bond_band"], list)
        assert len(body["by_bond_band"]) == 2  # two distinct bond_level values

    # ------------------------------------------------------------------
    # 8. Missing parse_log table — graceful degradation
    # ------------------------------------------------------------------

    def test_qa_endpoint_missing_parse_log_table_graceful(self, client, db_path):
        """DB without kokoro_parse_log (pre-v86) returns zeros, not HTTP 500.

        Simulates an older schema by only running v83-v85 migrations (no
        v86), confirming the OperationalError fallback path is exercised.
        """
        from backend.preflight import migrate_to_v83, migrate_to_v84, migrate_to_v85

        con = sqlite3.connect(db_path)
        try:
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

            con.execute("INSERT INTO characters (name) VALUES (?)", ("OldChan",))
            char_id = con.execute("SELECT last_insert_rowid()").fetchone()[0]
            con.commit()
        finally:
            con.close()

        # kokoro_parse_log does NOT exist — endpoint must still return 200.
        r = client.get(f"/api/kokoro/qa/{char_id}")
        assert r.status_code == 200
        body = r.json()
        assert body["ok"] is True
        assert body["parse_ok_total"] == 0
        assert body["parse_ok_count"] == 0
        assert body["parse_ok_rate"] == pytest.approx(0.0)

    # ------------------------------------------------------------------
    # 9. Default window is 48 h
    # ------------------------------------------------------------------

    def test_qa_endpoint_default_window_is_48h(self, client, db_path):
        """Omitting ?hours uses a 48 h window.

        Inserts one row 47 h ago (inside window) and one row 49 h ago
        (outside window) and confirms only the recent row is counted.
        """
        char_id = _setup_kokoro_tables(db_path)
        _insert_parse_log_rows(db_path, char_id, [1], hours_ago=47.0)   # inside
        _insert_parse_log_rows(db_path, char_id, [1], hours_ago=49.0)   # outside

        body = client.get(f"/api/kokoro/qa/{char_id}").json()
        assert body["window_hours"] == 48
        assert body["parse_ok_total"] == 1

    # ------------------------------------------------------------------
    # 10. Custom ?hours=24 narrows window
    # ------------------------------------------------------------------

    def test_qa_endpoint_custom_hours_param(self, client, db_path):
        """?hours=24 limits the lookback to 24 h.

        Inserts rows at 12 h and 36 h ago; only the 12 h row should appear
        in parse_ok_total when hours=24 is requested.
        """
        char_id = _setup_kokoro_tables(db_path)
        _insert_parse_log_rows(db_path, char_id, [1], hours_ago=12.0)   # inside 24 h
        _insert_parse_log_rows(db_path, char_id, [1], hours_ago=36.0)   # outside 24 h

        body = client.get(f"/api/kokoro/qa/{char_id}?hours=24").json()
        assert body["window_hours"] == 24
        assert body["parse_ok_total"] == 1
        assert body["parse_ok_count"] == 1
        assert body["parse_ok_rate"] == pytest.approx(1.0)

    # ------------------------------------------------------------------
    # 11. char_id echoed back in response
    # ------------------------------------------------------------------

    def test_qa_endpoint_echoes_char_id(self, client, db_path):
        """The response body includes char_id matching the path parameter.

        Confirms no accidental hard-coding in the endpoint response.
        """
        char_id = _setup_kokoro_tables(db_path)
        body = client.get(f"/api/kokoro/qa/{char_id}").json()
        assert body["char_id"] == char_id

    # ------------------------------------------------------------------
    # 12. Hours cap — 720 h maximum
    # ------------------------------------------------------------------

    def test_qa_endpoint_caps_hours_at_720(self, client, db_path):
        """?hours=9999 is capped at 720 (30 days) by the endpoint.

        The cap prevents runaway scans on production databases that may
        contain years of parse logs.
        """
        char_id = _setup_kokoro_tables(db_path)
        body = client.get(f"/api/kokoro/qa/{char_id}?hours=9999").json()
        assert body["window_hours"] == 720

    # ------------------------------------------------------------------
    # 13. Only counts rows for the requested char_id
    # ------------------------------------------------------------------

    def test_qa_endpoint_isolates_by_char_id(self, client, db_path):
        """parse_ok rows for other characters are not counted.

        Inserts rows for two characters and verifies each character's QA
        response only reflects its own rows.
        """
        char_id_a = _setup_kokoro_tables(db_path)

        # Insert a second character directly (tables already exist)
        con = sqlite3.connect(db_path)
        try:
            con.execute("INSERT INTO characters (name) VALUES (?)", ("OtherChan",))
            char_id_b = int(con.execute("SELECT last_insert_rowid()").fetchone()[0])
            con.commit()
        finally:
            con.close()

        _insert_parse_log_rows(db_path, char_id_a, [1, 1, 1])   # 3 rows for A
        _insert_parse_log_rows(db_path, char_id_b, [0, 0])       # 2 rows for B

        body_a = client.get(f"/api/kokoro/qa/{char_id_a}").json()
        body_b = client.get(f"/api/kokoro/qa/{char_id_b}").json()

        assert body_a["parse_ok_total"] == 3
        assert body_b["parse_ok_total"] == 2
        assert body_a["parse_ok_rate"] == pytest.approx(1.0)
        assert body_b["parse_ok_rate"] == pytest.approx(0.0)
