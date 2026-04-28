"""Regression tests for `/api/characters/{id}/relationship` endpoint.

Locks in the session-18 fix for the `database is locked` 500-flood that
hit hot-polling clients. The fix:

1. `db()` sets `PRAGMA busy_timeout = 30000` so contended writers wait
   instead of immediately raising `OperationalError`.
2. `get_relationship` does a SELECT first and only INSERT-on-miss so the
   GET hot path no longer takes a write lock per call.
3. `reset_relationship` wraps its UPDATE/INSERT pair in `with conn:`.

These tests intentionally hammer the endpoint to surface any return of
the original failure mode.
"""

from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient


def test_get_relationship_returns_defaults_for_unseeded_character(
    client: TestClient, db_path: Path
):
    """GET on a fresh character returns 200 + default scores."""
    resp = client.get("/api/characters/99/relationship")
    assert resp.status_code == 200
    data = resp.json()
    assert data["ok"] is True
    rel = data["relationship"]
    # After SELECT-miss → lazy seed, the row exists with schema defaults.
    # Schema defaults: affinity=0.5, mood=0.5, trust=0.5, interactions=0.
    assert rel["affinity"] == 0.5
    assert rel["mood"] == 0.5
    assert rel["trust"] == 0.5
    assert rel["interactions"] == 0


def test_get_relationship_lazy_seeds_only_on_miss(
    client: TestClient, db_path: Path
):
    """First GET seeds; subsequent GETs do not produce a second row."""
    import sqlite3

    # Hit endpoint twice
    assert client.get("/api/characters/7/relationship").status_code == 200
    assert client.get("/api/characters/7/relationship").status_code == 200

    con = sqlite3.connect(db_path)
    try:
        count = con.execute(
            "SELECT COUNT(*) FROM character_relationships WHERE char_id = 7"
        ).fetchone()[0]
    finally:
        con.close()
    assert count == 1, "Lazy seed should produce exactly one row"


def test_get_relationship_50_rapid_calls_all_succeed(
    client: TestClient, db_path: Path
):
    """50 back-to-back GETs all return 200 — guards against db-locked 500s.

    Pre-fix: this loop would intermittently 500 with
    `OperationalError: database is locked` because every GET took a
    write lock and the WAL writer fell behind under concurrent writes.
    Post-fix: SELECT-first hot path + 30s busy_timeout → no contention.
    """
    statuses = [
        client.get("/api/characters/1/relationship").status_code
        for _ in range(50)
    ]
    assert all(s == 200 for s in statuses), (
        f"Expected all 200, got non-200s: "
        f"{[s for s in statuses if s != 200][:5]}"
    )


def test_reset_relationship_seeds_and_resets(
    client: TestClient, db_path: Path
):
    """POST /relationship/reset seeds-on-miss, then resets to neutral defaults."""
    # Reset on un-seeded char must succeed (INSERT branch).
    resp = client.post("/api/characters/42/relationship/reset")
    assert resp.status_code == 200
    assert resp.json() == {"ok": True}

    # Verify defaults landed.
    rel = client.get("/api/characters/42/relationship").json()["relationship"]
    assert rel["affinity"] == 0.5
    assert rel["mood"] == 0.5
    assert rel["trust"] == 0.5
    assert rel["interactions"] == 0

    # Reset again on existing row (UPDATE branch). Should still succeed.
    resp = client.post("/api/characters/42/relationship/reset")
    assert resp.status_code == 200
    assert resp.json() == {"ok": True}


def test_db_helper_sets_busy_timeout():
    """`db()` must set busy_timeout=30000 — guards against the helper change being reverted."""
    from backend.server import db

    conn = db()
    try:
        timeout = conn.execute("PRAGMA busy_timeout").fetchone()[0]
    finally:
        conn.close()
    assert timeout == 30000, (
        f"db() must set PRAGMA busy_timeout=30000 to prevent "
        f"`database is locked` 500s under contention; got {timeout}"
    )
