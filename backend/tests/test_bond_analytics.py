"""Tests for Bond Phase 6 analytics endpoint and preflight v70 migration.

Uses the shared conftest ``server_module`` + ``client`` fixtures so the DB is
monkeypatched to a fresh tmp_path database for every test that needs one.

Covers:
- GET /api/characters/{char_id}/bond/analytics returns correct structure
- total_xp_earned aggregates correctly from bond_xp_events
- days_active counts distinct calendar days
- avg_xp_per_day computes from last 14 days of activity
- est_days_to_soulmate is None at level >= 65
- est_days_to_soulmate is a positive integer below level 65
- source_breakdown percentages sum to ~100%
- source_breakdown is empty dict when no events in last 7 days
- Analytics endpoint returns ok=True on character with no XP history
- preflight migrate_to_v70 creates bond_scenes_seen table and is idempotent
"""

from __future__ import annotations

import sqlite3
from pathlib import Path

import pytest
from fastapi.testclient import TestClient


# ── DB helpers ────────────────────────────────────────────────────────────────


def _add_bond_tables(db_path: Path) -> None:
    """Add bond Phase 1+5 tables to the test DB if not already present."""
    con = sqlite3.connect(db_path)
    try:
        con.executescript(
            """
            CREATE TABLE IF NOT EXISTS bond_xp_events (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                char_id      INTEGER NOT NULL,
                xp_amount    INTEGER NOT NULL,
                action       TEXT    NOT NULL,
                multiplier   REAL    DEFAULT 1.0,
                source_detail TEXT,
                created_at   TEXT    DEFAULT (datetime('now'))
            );
            CREATE TABLE IF NOT EXISTS bond_scenes_seen (
                char_id      INTEGER NOT NULL,
                scene_id     TEXT    NOT NULL,
                completed_at REAL    NOT NULL DEFAULT (unixepoch()),
                PRIMARY KEY  (char_id, scene_id)
            );
            """
        )
        con.commit()
    finally:
        con.close()


def _seed_xp(
    db_path: Path,
    char_id: int,
    rows: list[tuple[int, str, float, str | None, str | None]],
) -> None:
    """Insert bond_xp_events rows into the test DB.

    Args:
        db_path: Path to the SQLite file.
        char_id: Character ID.
        rows: (xp_amount, action, multiplier, source_detail, created_at).
              ``created_at`` may be None to use the SQLite default (now).
    """
    con = sqlite3.connect(db_path)
    try:
        for xp, action, mult, detail, created_at in rows:
            if created_at:
                con.execute(
                    """
                    INSERT INTO bond_xp_events
                        (char_id, xp_amount, action, multiplier, source_detail, created_at)
                    VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    (char_id, xp, action, mult, detail, created_at),
                )
            else:
                con.execute(
                    """
                    INSERT INTO bond_xp_events
                        (char_id, xp_amount, action, multiplier, source_detail)
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    (char_id, xp, action, mult, detail),
                )
        con.commit()
    finally:
        con.close()


def _set_bond_level(db_path: Path, char_id: int, level: int, xp: int = 0) -> None:
    """Upsert bond_level + bond_xp on character_relationships."""
    con = sqlite3.connect(db_path)
    try:
        con.execute(
            """
            INSERT INTO character_relationships (char_id, bond_level, bond_xp)
            VALUES (?, ?, ?)
            ON CONFLICT(char_id) DO UPDATE SET bond_level=excluded.bond_level, bond_xp=excluded.bond_xp
            """,
            (char_id, level, xp),
        )
        con.commit()
    finally:
        con.close()


# ── Analytics: structure ──────────────────────────────────────────────────────


def test_analytics_returns_ok_and_structure(client: TestClient, db_path: Path):
    """GET /bond/analytics returns {ok, analytics:{...}} for a character with no events."""
    _add_bond_tables(db_path)
    resp = client.get("/api/characters/1/bond/analytics")
    assert resp.status_code == 200
    data = resp.json()
    assert data["ok"] is True
    analytics = data["analytics"]
    for key in ("total_xp_earned", "days_active", "avg_xp_per_day",
                "est_days_to_soulmate", "source_breakdown"):
        assert key in analytics, f"Missing key: {key}"


def test_analytics_no_xp_history_returns_zeroes(client: TestClient, db_path: Path):
    """Character with no XP events returns zeroed analytics."""
    _add_bond_tables(db_path)
    resp = client.get("/api/characters/1/bond/analytics")
    assert resp.status_code == 200
    a = resp.json()["analytics"]
    assert a["total_xp_earned"] == 0
    assert a["days_active"] == 0
    assert a["avg_xp_per_day"] == 0.0
    assert a["source_breakdown"] == {}


# ── Analytics: total_xp_earned ───────────────────────────────────────────────


def test_analytics_total_xp_earned(client: TestClient, db_path: Path):
    """total_xp_earned sums all xp_amount rows for the character."""
    _add_bond_tables(db_path)
    _seed_xp(db_path, 1, [
        (10, "message", 1.0, None, None),
        (20, "daily_first", 1.0, None, None),
        (50, "session_bonus", 1.0, None, None),
    ])
    resp = client.get("/api/characters/1/bond/analytics")
    assert resp.status_code == 200
    a = resp.json()["analytics"]
    assert a["total_xp_earned"] == 80


# ── Analytics: days_active ────────────────────────────────────────────────────


def test_analytics_days_active_counts_distinct_days(client: TestClient, db_path: Path):
    """days_active counts distinct calendar days with any XP event."""
    _add_bond_tables(db_path)
    _seed_xp(db_path, 1, [
        # Two events on 2026-01-01.
        (5, "message", 1.0, None, "2026-01-01 10:00:00"),
        (5, "message", 1.0, None, "2026-01-01 12:00:00"),
        # One event on 2026-01-03.
        (5, "message", 1.0, None, "2026-01-03 09:00:00"),
    ])
    resp = client.get("/api/characters/1/bond/analytics")
    assert resp.status_code == 200
    a = resp.json()["analytics"]
    assert a["days_active"] == 2


# ── Analytics: source_breakdown ──────────────────────────────────────────────


def test_analytics_source_breakdown_sums_to_100(client: TestClient, db_path: Path):
    """source_breakdown percentages sum to approximately 100%."""
    _add_bond_tables(db_path)
    _seed_xp(db_path, 1, [
        (60, "message", 1.0, None, None),
        (30, "daily_first", 1.0, None, None),
        (10, "session_bonus", 1.0, None, None),
    ])
    resp = client.get("/api/characters/1/bond/analytics")
    assert resp.status_code == 200
    a = resp.json()["analytics"]
    breakdown = a["source_breakdown"]
    assert "message" in breakdown
    total_pct = sum(breakdown.values())
    assert abs(total_pct - 100.0) < 1.0, f"source_breakdown sums to {total_pct}, expected ~100"


def test_analytics_source_breakdown_empty_no_recent_events(client: TestClient, db_path: Path):
    """source_breakdown is empty dict when no events in the last 7 days."""
    _add_bond_tables(db_path)
    _seed_xp(db_path, 1, [
        (10, "message", 1.0, None, "2020-01-01 12:00:00"),
    ])
    resp = client.get("/api/characters/1/bond/analytics")
    assert resp.status_code == 200
    a = resp.json()["analytics"]
    assert a["source_breakdown"] == {}


# ── Analytics: est_days_to_soulmate ──────────────────────────────────────────


def test_analytics_est_days_none_at_soulmate_level(client: TestClient, db_path: Path):
    """est_days_to_soulmate is None when character is at level >= 65."""
    _add_bond_tables(db_path)
    _set_bond_level(db_path, 1, 65, 0)
    _seed_xp(db_path, 1, [
        (100, "message", 1.0, None, None),
    ])
    resp = client.get("/api/characters/1/bond/analytics")
    assert resp.status_code == 200
    a = resp.json()["analytics"]
    assert a["est_days_to_soulmate"] is None


def test_analytics_est_days_positive_below_soulmate(client: TestClient, db_path: Path):
    """est_days_to_soulmate is a positive integer when below level 65 with activity."""
    _add_bond_tables(db_path)
    _set_bond_level(db_path, 1, 5, 0)
    _seed_xp(db_path, 1, [
        (200, "session_bonus", 1.0, None, None),
    ])
    resp = client.get("/api/characters/1/bond/analytics")
    assert resp.status_code == 200
    a = resp.json()["analytics"]
    est = a["est_days_to_soulmate"]
    assert est is not None
    assert isinstance(est, int)
    assert est > 0


# ── preflight v70 migration ───────────────────────────────────────────────────


def test_migrate_to_v70_creates_table():
    """migrate_to_v70 creates bond_scenes_seen table and advances schema to v70."""
    from backend.preflight import migrate_to_v70

    conn = sqlite3.connect(":memory:")
    conn.execute(
        "CREATE TABLE schema_version (version INTEGER PRIMARY KEY, applied_ts REAL)"
    )
    conn.execute("INSERT INTO schema_version VALUES (69, 0)")
    conn.execute("CREATE TABLE characters (id INTEGER PRIMARY KEY, name TEXT)")

    result = migrate_to_v70(conn)
    assert result is True

    # Table must exist.
    row = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='bond_scenes_seen'"
    ).fetchone()
    assert row is not None

    # Schema version must include 70.
    ver = conn.execute("SELECT MAX(version) FROM schema_version").fetchone()
    assert ver[0] == 70


def test_migrate_to_v70_is_idempotent():
    """Calling migrate_to_v70 twice does not raise or corrupt state."""
    from backend.preflight import migrate_to_v70

    conn = sqlite3.connect(":memory:")
    conn.execute(
        "CREATE TABLE schema_version (version INTEGER PRIMARY KEY, applied_ts REAL)"
    )
    conn.execute("INSERT INTO schema_version VALUES (69, 0)")
    conn.execute("CREATE TABLE characters (id INTEGER PRIMARY KEY, name TEXT)")

    migrate_to_v70(conn)
    result = migrate_to_v70(conn)
    assert result is True
    ver = conn.execute("SELECT MAX(version) FROM schema_version").fetchone()
    assert ver[0] == 70
