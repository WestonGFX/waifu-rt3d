"""Integration tests for the Phase 19D Privacy API endpoints.

Tests cover all five privacy endpoints added to server.py:
    - GET  /api/privacy
    - PUT  /api/privacy
    - GET  /api/privacy/export
    - POST /api/privacy/purge
    - GET  /api/privacy/behavior-modifiers/{char_id}

Each test uses the shared ``server_module`` fixture from conftest.py, extended
by a local ``privacy_client`` fixture that seeds the v60 adaptive tables into
the test database before each test.

Test isolation: ``server_module`` creates a fresh tmp_path DB for every test
and ``privacy_client`` extends it with the v60 tables on top.
"""

from __future__ import annotations

import sqlite3
from contextlib import asynccontextmanager
from pathlib import Path

import pytest
from fastapi.testclient import TestClient


# ---------------------------------------------------------------------------
# Schema constants
# ---------------------------------------------------------------------------

_ENGAGEMENT_SIGNALS_DDL = """
CREATE TABLE IF NOT EXISTS engagement_signals (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
    char_id                 INTEGER NOT NULL,
    session_id              TEXT    NOT NULL,
    turn_number             INTEGER NOT NULL DEFAULT 0,
    user_msg_length         INTEGER NOT NULL DEFAULT 0,
    assistant_msg_length    INTEGER NOT NULL DEFAULT 0,
    response_time_ms        INTEGER,
    emoji_count             INTEGER DEFAULT 0,
    question_count          INTEGER DEFAULT 0,
    exclamation_count       INTEGER DEFAULT 0,
    sentiment_score         REAL    DEFAULT 0.0,
    topic_drift             REAL    DEFAULT 0.0,
    intimacy_delta          INTEGER DEFAULT 0,
    created_at              TEXT    DEFAULT (datetime('now'))
);
"""

_PREFERENCE_HISTORY_DDL = """
CREATE TABLE IF NOT EXISTS preference_history (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    char_id               INTEGER NOT NULL,
    pref_response_length  REAL    DEFAULT 0.5,
    pref_formality        REAL    DEFAULT 0.5,
    pref_humor            REAL    DEFAULT 0.5,
    pref_empathy          REAL    DEFAULT 0.5,
    pref_depth            REAL    DEFAULT 0.5,
    window_size           INTEGER DEFAULT 20,
    decay_factor          REAL    DEFAULT 0.95,
    confidence            REAL    DEFAULT 0.0,
    computed_at           TEXT    DEFAULT (datetime('now'))
);
"""

_PRIVACY_SETTINGS_DDL = """
CREATE TABLE IF NOT EXISTS privacy_settings (
    id                   INTEGER PRIMARY KEY DEFAULT 1
                             CHECK (id = 1),
    signal_collection    INTEGER DEFAULT 1,
    preference_learning  INTEGER DEFAULT 1,
    behavior_adaptation  INTEGER DEFAULT 1,
    topic_tracking       INTEGER DEFAULT 1,
    intimacy_tracking    INTEGER DEFAULT 1,
    updated_at           TEXT    DEFAULT (datetime('now'))
);
INSERT OR IGNORE INTO privacy_settings (id) VALUES (1);
"""

_V60_SCHEMA = (
    _ENGAGEMENT_SIGNALS_DDL + _PREFERENCE_HISTORY_DDL + _PRIVACY_SETTINGS_DDL
)

# All five toggle keys the API accepts
_VALID_PRIVACY_KEYS = {
    "signal_collection",
    "preference_learning",
    "behavior_adaptation",
    "topic_tracking",
    "intimacy_tracking",
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _add_v60_tables(db_path: Path) -> None:
    """Extend an existing test DB with the v60 adaptive tables.

    Args:
        db_path: Path to the SQLite database file used by the test server.
    """
    con = sqlite3.connect(db_path)
    try:
        con.executescript(_V60_SCHEMA)
        con.commit()
    finally:
        con.close()


@asynccontextmanager
async def _noop_lifespan(app):
    """No-op lifespan that bypasses real startup for API tests.

    Yields:
        Nothing — simply enters and exits.
    """
    yield


# ---------------------------------------------------------------------------
# Fixture
# ---------------------------------------------------------------------------


@pytest.fixture()
def privacy_client(server_module, tmp_path):
    """TestClient with the v60 adaptive tables added to the test DB.

    Builds on the shared ``server_module`` fixture which has already
    monkeypatched DB_PATH to a fresh tmp_path database.  This fixture
    extends it with the three v60 tables required by the privacy endpoints.

    Args:
        server_module: Pytest fixture (from conftest) providing the
            monkeypatched FastAPI app module.
        tmp_path: Pytest built-in; kept for explicit dependency documentation.

    Yields:
        FastAPI :class:`TestClient` connected to the extended test database.
    """
    _add_v60_tables(server_module.DB_PATH)
    original_lifespan = server_module.app.router.lifespan_context
    server_module.app.router.lifespan_context = _noop_lifespan
    try:
        with TestClient(server_module.app) as test_client:
            yield test_client
    finally:
        server_module.app.router.lifespan_context = original_lifespan


# ---------------------------------------------------------------------------
# Tests: GET /api/privacy
# ---------------------------------------------------------------------------


class TestGetPrivacy:
    """Tests for GET /api/privacy — retrieve current privacy toggle state."""

    def test_get_privacy_defaults(self, privacy_client):
        """All five toggles default to True (opt-in) after initial setup."""
        resp = privacy_client.get("/api/privacy")
        assert resp.status_code == 200
        data = resp.json()
        for key in _VALID_PRIVACY_KEYS:
            assert data[key] is True, f"Expected {key} to be True, got {data[key]}"

    def test_get_privacy_returns_all_keys(self, privacy_client):
        """Response includes all five expected toggle keys."""
        resp = privacy_client.get("/api/privacy")
        assert resp.status_code == 200
        data = resp.json()
        assert set(data.keys()) == _VALID_PRIVACY_KEYS

    def test_get_privacy_no_table_returns_true_defaults(self, server_module):
        """When the privacy_settings table is absent, GET returns all True (safe default)."""
        # Use the base server fixture without adding v60 tables
        original_lifespan = server_module.app.router.lifespan_context
        server_module.app.router.lifespan_context = _noop_lifespan
        try:
            with TestClient(server_module.app) as client:
                resp = client.get("/api/privacy")
                assert resp.status_code == 200
                data = resp.json()
                for key in _VALID_PRIVACY_KEYS:
                    assert data[key] is True
        finally:
            server_module.app.router.lifespan_context = original_lifespan


# ---------------------------------------------------------------------------
# Tests: PUT /api/privacy
# ---------------------------------------------------------------------------


class TestUpdatePrivacy:
    """Tests for PUT /api/privacy — update privacy toggles."""

    def test_update_privacy_toggle(self, privacy_client):
        """Can disable signal_collection; GET then reflects False."""
        resp = privacy_client.put(
            "/api/privacy", json={"signal_collection": False}
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["ok"] is True
        assert data["settings"]["signal_collection"] is False

    def test_update_privacy_persists_to_get(self, privacy_client):
        """PUT change is reflected by a subsequent GET."""
        privacy_client.put("/api/privacy", json={"preference_learning": False})
        resp = privacy_client.get("/api/privacy")
        assert resp.json()["preference_learning"] is False

    def test_update_privacy_multiple_keys(self, privacy_client):
        """Multiple toggles can be updated in a single PUT."""
        resp = privacy_client.put(
            "/api/privacy",
            json={"signal_collection": False, "topic_tracking": False},
        )
        assert resp.status_code == 200
        settings = resp.json()["settings"]
        assert settings["signal_collection"] is False
        assert settings["topic_tracking"] is False

    def test_update_privacy_invalid_key(self, privacy_client):
        """400 is returned when only unknown keys are sent."""
        resp = privacy_client.put(
            "/api/privacy", json={"unknown_key": True}
        )
        assert resp.status_code == 400

    def test_update_privacy_empty_body(self, privacy_client):
        """400 is returned for an empty JSON body (no valid keys)."""
        resp = privacy_client.put("/api/privacy", json={})
        assert resp.status_code == 400

    def test_update_privacy_mixed_valid_invalid_keys(self, privacy_client):
        """Valid keys are applied even when mixed with unknown keys."""
        resp = privacy_client.put(
            "/api/privacy",
            json={"signal_collection": False, "bogus_key": True},
        )
        # The valid key "signal_collection" should be accepted
        assert resp.status_code == 200
        assert resp.json()["settings"]["signal_collection"] is False

    def test_update_privacy_reenable_toggle(self, privacy_client):
        """A disabled toggle can be re-enabled with True."""
        privacy_client.put("/api/privacy", json={"signal_collection": False})
        privacy_client.put("/api/privacy", json={"signal_collection": True})
        resp = privacy_client.get("/api/privacy")
        assert resp.json()["signal_collection"] is True


# ---------------------------------------------------------------------------
# Tests: GET /api/privacy/export
# ---------------------------------------------------------------------------


class TestExportPersonalizationData:
    """Tests for GET /api/privacy/export — export all personalization data."""

    def test_export_empty(self, privacy_client):
        """Returns empty arrays when no signals or preference rows exist."""
        resp = privacy_client.get("/api/privacy/export")
        assert resp.status_code == 200
        data = resp.json()
        assert data["engagement_signals"] == []
        assert data["preference_history"] == []

    def test_export_returns_all_keys(self, privacy_client):
        """Response always contains the three top-level keys."""
        resp = privacy_client.get("/api/privacy/export")
        assert resp.status_code == 200
        data = resp.json()
        assert "engagement_signals" in data
        assert "preference_history" in data
        assert "privacy_settings" in data

    def test_export_privacy_settings_populated(self, privacy_client):
        """privacy_settings in export reflects the current row."""
        resp = privacy_client.get("/api/privacy/export")
        data = resp.json()
        # The singleton row (id=1) should be present
        ps = data["privacy_settings"]
        assert isinstance(ps, dict)
        # signal_collection should be in the exported settings
        assert "signal_collection" in ps

    def test_export_no_tables_returns_empty(self, server_module):
        """Export returns empty structure when v60 tables do not exist."""
        original_lifespan = server_module.app.router.lifespan_context
        server_module.app.router.lifespan_context = _noop_lifespan
        try:
            with TestClient(server_module.app) as client:
                resp = client.get("/api/privacy/export")
                assert resp.status_code == 200
                data = resp.json()
                assert data["engagement_signals"] == []
                assert data["preference_history"] == []
        finally:
            server_module.app.router.lifespan_context = original_lifespan

    def test_export_includes_seeded_signals(self, privacy_client, server_module):
        """Signals seeded directly into the DB appear in the export."""
        con = sqlite3.connect(server_module.DB_PATH)
        try:
            con.execute(
                """INSERT INTO engagement_signals
                    (char_id, session_id, turn_number,
                     user_msg_length, assistant_msg_length)
                   VALUES (1, 'sess-x', 1, 50, 100)"""
            )
            con.commit()
        finally:
            con.close()

        resp = privacy_client.get("/api/privacy/export")
        data = resp.json()
        assert len(data["engagement_signals"]) == 1
        assert data["engagement_signals"][0]["char_id"] == 1


# ---------------------------------------------------------------------------
# Tests: POST /api/privacy/purge
# ---------------------------------------------------------------------------


class TestPurgePersonalizationData:
    """Tests for POST /api/privacy/purge — delete all personalization data."""

    def test_purge_empty(self, privacy_client):
        """Returns zero counts when no personalization data exists."""
        resp = privacy_client.post("/api/privacy/purge")
        assert resp.status_code == 200
        data = resp.json()
        assert data["ok"] is True
        assert data["deleted"]["engagement_signals"] == 0
        assert data["deleted"]["preference_history"] == 0

    def test_purge_returns_correct_deleted_counts(
        self, privacy_client, server_module
    ):
        """Returns the correct count of deleted rows for each table."""
        con = sqlite3.connect(server_module.DB_PATH)
        try:
            for _ in range(3):
                con.execute(
                    """INSERT INTO engagement_signals
                        (char_id, session_id, turn_number,
                         user_msg_length, assistant_msg_length)
                       VALUES (1, 'sess', 1, 50, 100)"""
                )
            for _ in range(2):
                con.execute(
                    """INSERT INTO preference_history
                        (char_id, confidence)
                       VALUES (1, 0.5)"""
                )
            con.commit()
        finally:
            con.close()

        resp = privacy_client.post("/api/privacy/purge")
        assert resp.status_code == 200
        data = resp.json()
        assert data["ok"] is True
        assert data["deleted"]["engagement_signals"] == 3
        assert data["deleted"]["preference_history"] == 2

    def test_purge_clears_all_data(self, privacy_client, server_module):
        """After purge, export returns empty arrays for both tables."""
        con = sqlite3.connect(server_module.DB_PATH)
        try:
            con.execute(
                """INSERT INTO engagement_signals
                    (char_id, session_id, turn_number,
                     user_msg_length, assistant_msg_length)
                   VALUES (1, 'sess', 1, 50, 100)"""
            )
            con.commit()
        finally:
            con.close()

        privacy_client.post("/api/privacy/purge")

        resp = privacy_client.get("/api/privacy/export")
        data = resp.json()
        assert data["engagement_signals"] == []
        assert data["preference_history"] == []

    def test_purge_no_tables_returns_zero(self, server_module):
        """Purge on a DB without v60 tables returns zeros (not an error)."""
        original_lifespan = server_module.app.router.lifespan_context
        server_module.app.router.lifespan_context = _noop_lifespan
        try:
            with TestClient(server_module.app) as client:
                resp = client.post("/api/privacy/purge")
                assert resp.status_code == 200
                data = resp.json()
                assert data["ok"] is True
                assert data["deleted"]["engagement_signals"] == 0
                assert data["deleted"]["preference_history"] == 0
        finally:
            server_module.app.router.lifespan_context = original_lifespan


# ---------------------------------------------------------------------------
# Tests: GET /api/privacy/behavior-modifiers/{char_id}
# ---------------------------------------------------------------------------


class TestGetBehaviorModifiers:
    """Tests for GET /api/privacy/behavior-modifiers/{char_id}."""

    def test_get_behavior_modifiers(self, privacy_client):
        """Returns a modifier dict for a character (defaults when no signals)."""
        resp = privacy_client.get("/api/privacy/behavior-modifiers/1")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, dict)
        assert "confidence" in data
        assert "response_length_bias" in data

    def test_get_behavior_modifiers_default_confidence_zero(self, privacy_client):
        """confidence is 0.0 when no engagement signals exist."""
        resp = privacy_client.get("/api/privacy/behavior-modifiers/1")
        assert resp.status_code == 200
        assert resp.json()["confidence"] == pytest.approx(0.0)

    def test_get_behavior_modifiers_all_keys_present(self, privacy_client):
        """All expected BehaviorModifier keys are returned."""
        resp = privacy_client.get("/api/privacy/behavior-modifiers/1")
        expected_keys = {
            "response_length_bias",
            "formality_bias",
            "humor_bias",
            "empathy_bias",
            "depth_bias",
            "pacing_hint",
            "energy_level",
            "active_adaptations",
            "confidence",
        }
        assert set(resp.json().keys()) == expected_keys

    def test_get_behavior_modifiers_different_char_ids(self, privacy_client):
        """Endpoint is callable for different char_ids without error."""
        for char_id in (1, 2, 99):
            resp = privacy_client.get(
                f"/api/privacy/behavior-modifiers/{char_id}"
            )
            assert resp.status_code == 200

    def test_get_behavior_modifiers_no_v60_tables(self, server_module):
        """Returns defaults gracefully when v60 tables do not exist."""
        original_lifespan = server_module.app.router.lifespan_context
        server_module.app.router.lifespan_context = _noop_lifespan
        try:
            with TestClient(server_module.app) as client:
                resp = client.get("/api/privacy/behavior-modifiers/1")
                assert resp.status_code == 200
                data = resp.json()
                assert data["confidence"] == pytest.approx(0.0)
        finally:
            server_module.app.router.lifespan_context = original_lifespan
