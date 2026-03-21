"""Integration tests for the Content Gate API (Phase 18C).

Tests cover all 6 endpoints introduced in Phase 18C:
  - GET  /api/content-gate
  - PUT  /api/content-gate
  - POST /api/content-gate/verify-age
  - POST /api/content-gate/lock
  - POST /api/content-gate/unlock
  - PUT  /api/content-gate/character/{char_id}

Each test uses the shared ``client`` fixture from conftest.py (FastAPI
TestClient + stub LLM + monkeypatched DB) augmented by a local
``cg_client`` fixture that adds the v58 content gate tables to the
test database before running.

Test isolation is guaranteed because ``server_module`` creates a fresh
tmp_path DB per test and ``cg_client`` adds its tables before each call.
"""

from __future__ import annotations

import sqlite3
from contextlib import asynccontextmanager
from pathlib import Path

import pytest
from fastapi.testclient import TestClient


# ── Helpers ─────────────────────────────────────────────────────────────────

_CONTENT_GATE_SCHEMA = """
CREATE TABLE IF NOT EXISTS content_gate_config (
    id                         INTEGER PRIMARY KEY DEFAULT 1
                                   CHECK (id = 1),
    global_content_ceiling     TEXT    NOT NULL DEFAULT 'general',
    age_verified               INTEGER DEFAULT 0,
    content_lock_enabled       INTEGER DEFAULT 0,
    content_lock_password_hash TEXT    DEFAULT '',
    updated_at                 TEXT    DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO content_gate_config (id) VALUES (1);

CREATE TABLE IF NOT EXISTS persona_content_ceilings (
    char_id    INTEGER PRIMARY KEY,
    ceiling    TEXT    NOT NULL DEFAULT 'general',
    updated_at TEXT    DEFAULT (datetime('now'))
);
"""


def _add_content_gate_tables(db_path: Path) -> None:
    """Extend an existing test DB with the v58 content gate tables.

    Args:
        db_path: Path to the SQLite database file used by the test server.
    """
    con = sqlite3.connect(db_path)
    try:
        con.executescript(_CONTENT_GATE_SCHEMA)
        con.commit()
    finally:
        con.close()


# ── Fixtures ─────────────────────────────────────────────────────────────────


@asynccontextmanager
async def _noop_lifespan(app):
    """No-op lifespan context that skips server startup for tests.

    Yields:
        Nothing — simply enters and exits without side effects.
    """
    yield


@pytest.fixture()
def cg_client(server_module, tmp_path):
    """TestClient with the content gate tables added to the test DB.

    Builds on the shared ``server_module`` fixture which has already
    monkeypatched DB_PATH to a fresh tmp_path database. This fixture
    extends that database with the content_gate_config and
    persona_content_ceilings tables required by the Phase 18C endpoints.

    Args:
        server_module: Pytest fixture (from conftest) providing the
            monkeypatched FastAPI app module.
        tmp_path: Pytest built-in temporary directory (unused directly
            here — server_module already uses it internally, but keeping
            it in the signature makes the dependency explicit).

    Yields:
        FastAPI TestClient connected to the extended test database.
    """
    _add_content_gate_tables(server_module.DB_PATH)
    original_lifespan = server_module.app.router.lifespan_context
    server_module.app.router.lifespan_context = _noop_lifespan
    try:
        with TestClient(server_module.app) as test_client:
            yield test_client
    finally:
        server_module.app.router.lifespan_context = original_lifespan


# ── TestGetContentGate ────────────────────────────────────────────────────────


class TestGetContentGate:
    """Tests for GET /api/content-gate — retrieve the current content gate state."""

    def test_get_default_content_gate(self, cg_client):
        """GET returns the initial defaults: general ceiling, not verified, not locked.

        The content_gate_config row is seeded with all defaults by the
        fixture, so the response should reflect the out-of-box state.
        """
        resp = cg_client.get("/api/content-gate")
        assert resp.status_code == 200
        data = resp.json()
        assert data["global_content_ceiling"] == "general"
        assert data["age_verified"] is False
        assert data["content_lock_enabled"] is False
        assert data["per_character_ceilings"] == {}

    def test_get_returns_per_character_ceilings(self, cg_client, server_module):
        """GET reflects any per-character ceiling overrides stored in the DB.

        Seeds a ceiling override directly and verifies the endpoint
        returns it in the per_character_ceilings map.
        """
        con = sqlite3.connect(server_module.DB_PATH)
        try:
            con.execute(
                "INSERT INTO persona_content_ceilings (char_id, ceiling) VALUES (1, 'edgy')"
            )
            con.commit()
        finally:
            con.close()

        resp = cg_client.get("/api/content-gate")
        assert resp.status_code == 200
        data = resp.json()
        # JSON serialises integer keys as strings, so char_id 1 becomes "1"
        assert data["per_character_ceilings"].get("1") == "edgy"


# ── TestUpdateContentGate ─────────────────────────────────────────────────────


class TestUpdateContentGate:
    """Tests for PUT /api/content-gate — update the global content ceiling."""

    def test_update_ceiling_general(self, cg_client):
        """PUT can set the ceiling to 'general' without age verification.

        'general' is the default safe-for-work level and requires no
        additional gate checks.
        """
        resp = cg_client.put(
            "/api/content-gate", json={"global_content_ceiling": "general"}
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["ok"] is True
        assert data["global_content_ceiling"] == "general"

    def test_update_ceiling_edgy(self, cg_client):
        """PUT can set the ceiling to 'edgy' without age verification.

        'edgy' is a content level that does not require the age gate.
        """
        resp = cg_client.put(
            "/api/content-gate", json={"global_content_ceiling": "edgy"}
        )
        assert resp.status_code == 200
        assert resp.json()["global_content_ceiling"] == "edgy"

    def test_update_ceiling_mature_requires_age(self, cg_client):
        """PUT returns 403 when trying to set 'mature' without age verification.

        The age gate must be passed first via POST /api/content-gate/verify-age.
        """
        resp = cg_client.put(
            "/api/content-gate", json={"global_content_ceiling": "mature"}
        )
        assert resp.status_code == 403

    def test_update_ceiling_explicit_requires_age(self, cg_client):
        """PUT returns 403 when trying to set 'explicit' without age verification.

        'explicit' is the highest content level and strictly requires
        prior age verification.
        """
        resp = cg_client.put(
            "/api/content-gate", json={"global_content_ceiling": "explicit"}
        )
        assert resp.status_code == 403

    def test_update_ceiling_mature_with_age(self, cg_client, server_module):
        """PUT accepts 'mature' after age verification is set in the DB.

        Simulates the user having completed the verify-age flow by
        directly setting age_verified = 1 in the database.
        """
        con = sqlite3.connect(server_module.DB_PATH)
        try:
            con.execute(
                "UPDATE content_gate_config SET age_verified = 1 WHERE id = 1"
            )
            con.commit()
        finally:
            con.close()

        resp = cg_client.put(
            "/api/content-gate", json={"global_content_ceiling": "mature"}
        )
        assert resp.status_code == 200
        assert resp.json()["global_content_ceiling"] == "mature"

    def test_update_ceiling_explicit_with_age(self, cg_client, server_module):
        """PUT accepts 'explicit' after age verification is set in the DB.

        Verifies the full happy path for the highest content level.
        """
        con = sqlite3.connect(server_module.DB_PATH)
        try:
            con.execute(
                "UPDATE content_gate_config SET age_verified = 1 WHERE id = 1"
            )
            con.commit()
        finally:
            con.close()

        resp = cg_client.put(
            "/api/content-gate", json={"global_content_ceiling": "explicit"}
        )
        assert resp.status_code == 200
        assert resp.json()["global_content_ceiling"] == "explicit"

    def test_update_ceiling_invalid(self, cg_client):
        """PUT returns 400 for an unrecognized ceiling value.

        Only 'general', 'edgy', 'mature', 'explicit' are valid. Any
        other string should be rejected immediately before DB access.
        """
        resp = cg_client.put(
            "/api/content-gate", json={"global_content_ceiling": "nsfw"}
        )
        assert resp.status_code == 400

    def test_update_ceiling_empty_string_is_invalid(self, cg_client):
        """PUT returns 400 for an empty string ceiling value.

        Empty string is not in CONTENT_RATING_ORDER and must be rejected.
        """
        resp = cg_client.put(
            "/api/content-gate", json={"global_content_ceiling": ""}
        )
        assert resp.status_code == 400

    def test_update_ceiling_locked_requires_password(self, cg_client, server_module):
        """PUT returns 403 when content lock is active and no password is provided.

        When the lock is enabled, the request must include the correct
        unlock_password field — omitting it entirely is rejected.
        """
        from backend.content.gating import hash_content_lock_password

        pw_hash = hash_content_lock_password("secret1234")
        con = sqlite3.connect(server_module.DB_PATH)
        try:
            con.execute(
                "UPDATE content_gate_config "
                "SET content_lock_enabled = 1, content_lock_password_hash = ? "
                "WHERE id = 1",
                (pw_hash,),
            )
            con.commit()
        finally:
            con.close()

        resp = cg_client.put(
            "/api/content-gate", json={"global_content_ceiling": "general"}
        )
        assert resp.status_code == 403

    def test_update_ceiling_locked_wrong_password(self, cg_client, server_module):
        """PUT returns 403 when content lock is active and the wrong password is given.

        Validates that supplying an incorrect password does not bypass
        the content lock.
        """
        from backend.content.gating import hash_content_lock_password

        pw_hash = hash_content_lock_password("secret1234")
        con = sqlite3.connect(server_module.DB_PATH)
        try:
            con.execute(
                "UPDATE content_gate_config "
                "SET content_lock_enabled = 1, content_lock_password_hash = ? "
                "WHERE id = 1",
                (pw_hash,),
            )
            con.commit()
        finally:
            con.close()

        resp = cg_client.put(
            "/api/content-gate",
            json={
                "global_content_ceiling": "general",
                "unlock_password": "wrongpassword",
            },
        )
        assert resp.status_code == 403

    def test_update_ceiling_locked_correct_password(self, cg_client, server_module):
        """PUT succeeds when the content lock is active and the correct password is given.

        The correct unlock_password bypasses the content lock and allows
        the ceiling to be changed.
        """
        from backend.content.gating import hash_content_lock_password

        pw_hash = hash_content_lock_password("secret1234")
        con = sqlite3.connect(server_module.DB_PATH)
        try:
            con.execute(
                "UPDATE content_gate_config "
                "SET content_lock_enabled = 1, content_lock_password_hash = ? "
                "WHERE id = 1",
                (pw_hash,),
            )
            con.commit()
        finally:
            con.close()

        resp = cg_client.put(
            "/api/content-gate",
            json={
                "global_content_ceiling": "edgy",
                "unlock_password": "secret1234",
            },
        )
        assert resp.status_code == 200
        assert resp.json()["global_content_ceiling"] == "edgy"

    def test_update_ceiling_persists_to_db(self, cg_client, server_module):
        """PUT persists the updated ceiling so subsequent GET reflects the change.

        Validates the round-trip: set the ceiling via PUT, then verify
        GET returns the new value.
        """
        resp = cg_client.put(
            "/api/content-gate", json={"global_content_ceiling": "edgy"}
        )
        assert resp.status_code == 200

        get_resp = cg_client.get("/api/content-gate")
        assert get_resp.json()["global_content_ceiling"] == "edgy"


# ── TestVerifyAge ─────────────────────────────────────────────────────────────


class TestVerifyAge:
    """Tests for POST /api/content-gate/verify-age — one-time age confirmation."""

    def test_verify_age(self, cg_client):
        """POST with confirmed=true sets age_verified to true.

        This is the primary happy-path: the user confirms they are of
        legal age, enabling mature/explicit content access.
        """
        resp = cg_client.post(
            "/api/content-gate/verify-age", json={"confirmed": True}
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["ok"] is True
        assert data["age_verified"] is True

    def test_verify_age_persists_to_db(self, cg_client, server_module):
        """POST verify-age is persisted so GET reflects age_verified=true.

        Verifies the full round-trip: after verification, the GET
        endpoint returns age_verified: true.
        """
        cg_client.post("/api/content-gate/verify-age", json={"confirmed": True})

        get_resp = cg_client.get("/api/content-gate")
        assert get_resp.json()["age_verified"] is True

    def test_verify_age_requires_confirmation(self, cg_client):
        """POST without confirmed=true returns 400.

        Omitting the field or sending false must be rejected — the
        endpoint requires an explicit acknowledgment.
        """
        resp = cg_client.post(
            "/api/content-gate/verify-age", json={"confirmed": False}
        )
        assert resp.status_code == 400

    def test_verify_age_missing_confirmed_field(self, cg_client):
        """POST with no body fields at all returns 400.

        An empty JSON object has no 'confirmed' key so body.get('confirmed')
        evaluates to None (falsy), which the endpoint rejects.
        """
        resp = cg_client.post("/api/content-gate/verify-age", json={})
        assert resp.status_code == 400

    def test_verify_age_is_idempotent(self, cg_client):
        """POST verify-age called twice still returns 200 on the second call.

        The UPDATE is unconditional — re-verifying should not raise an
        error even though age_verified is already 1.
        """
        cg_client.post("/api/content-gate/verify-age", json={"confirmed": True})
        resp = cg_client.post(
            "/api/content-gate/verify-age", json={"confirmed": True}
        )
        assert resp.status_code == 200


# ── TestSetLock ───────────────────────────────────────────────────────────────


class TestSetLock:
    """Tests for POST /api/content-gate/lock — enable content lock with password."""

    def test_set_lock(self, cg_client):
        """POST with a valid password enables the content lock.

        A password of 4+ characters is the minimum required to enable
        the content lock.
        """
        resp = cg_client.post(
            "/api/content-gate/lock", json={"password": "safe1234"}
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["ok"] is True
        assert data["content_lock_enabled"] is True

    def test_set_lock_persists_to_db(self, cg_client):
        """POST lock is reflected by a subsequent GET showing content_lock_enabled=true."""
        cg_client.post("/api/content-gate/lock", json={"password": "safe1234"})

        get_resp = cg_client.get("/api/content-gate")
        assert get_resp.json()["content_lock_enabled"] is True

    def test_set_lock_short_password(self, cg_client):
        """POST with a password shorter than 4 characters returns 400.

        The minimum password length is enforced server-side before
        any DB writes occur.
        """
        resp = cg_client.post("/api/content-gate/lock", json={"password": "abc"})
        assert resp.status_code == 400

    def test_set_lock_exactly_3_chars(self, cg_client):
        """POST with exactly 3-char password is below the minimum and returns 400.

        This is the boundary value test: len('abc') == 3 < 4 required.
        """
        resp = cg_client.post("/api/content-gate/lock", json={"password": "abc"})
        assert resp.status_code == 400

    def test_set_lock_exactly_4_chars_succeeds(self, cg_client):
        """POST with exactly 4-char password meets the minimum and returns 200.

        Boundary value: len('abcd') == 4 == minimum allowed.
        """
        resp = cg_client.post("/api/content-gate/lock", json={"password": "abcd"})
        assert resp.status_code == 200

    def test_set_lock_empty_password(self, cg_client):
        """POST with an empty password returns 400.

        An empty string fails both the truthiness check and the length
        guard in the endpoint.
        """
        resp = cg_client.post("/api/content-gate/lock", json={"password": ""})
        assert resp.status_code == 400

    def test_set_lock_missing_password_field(self, cg_client):
        """POST with no password field returns 400.

        body.get('password', '') returns '' which is falsy and fails
        the validation guard.
        """
        resp = cg_client.post("/api/content-gate/lock", json={})
        assert resp.status_code == 400

    def test_set_lock_stores_hash_not_plaintext(self, cg_client, server_module):
        """POST lock stores a hashed password, not the plaintext.

        The stored value must be a 64-character hex string (SHA-256
        digest), never the raw password.
        """
        cg_client.post("/api/content-gate/lock", json={"password": "safe1234"})

        con = sqlite3.connect(server_module.DB_PATH)
        try:
            row = con.execute(
                "SELECT content_lock_password_hash FROM content_gate_config WHERE id = 1"
            ).fetchone()
        finally:
            con.close()

        stored_hash = row[0]
        assert stored_hash != "safe1234"
        assert len(stored_hash) == 64
        assert all(c in "0123456789abcdef" for c in stored_hash)


# ── TestUnlock ────────────────────────────────────────────────────────────────


class TestUnlock:
    """Tests for POST /api/content-gate/unlock — disable content lock."""

    def _lock_db(self, db_path: Path, password: str) -> None:
        """Directly enable the content lock in the DB for test setup.

        Args:
            db_path: Path to the SQLite database file.
            password: Plain-text password to hash and store.
        """
        from backend.content.gating import hash_content_lock_password

        pw_hash = hash_content_lock_password(password)
        con = sqlite3.connect(db_path)
        try:
            con.execute(
                "UPDATE content_gate_config "
                "SET content_lock_enabled = 1, content_lock_password_hash = ? "
                "WHERE id = 1",
                (pw_hash,),
            )
            con.commit()
        finally:
            con.close()

    def test_unlock_correct_password(self, cg_client, server_module):
        """POST with the correct password disables the content lock.

        After unlocking, content_lock_enabled should be false and the
        stored password hash should be cleared.
        """
        self._lock_db(server_module.DB_PATH, "secure99")

        resp = cg_client.post(
            "/api/content-gate/unlock", json={"password": "secure99"}
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["ok"] is True
        assert data["content_lock_enabled"] is False

    def test_unlock_clears_password_hash(self, cg_client, server_module):
        """POST unlock clears the stored password hash from the DB.

        After a successful unlock the hash column must be reset to ''
        so the lock cannot be verified without a new password being set.
        """
        self._lock_db(server_module.DB_PATH, "secure99")
        cg_client.post("/api/content-gate/unlock", json={"password": "secure99"})

        con = sqlite3.connect(server_module.DB_PATH)
        try:
            row = con.execute(
                "SELECT content_lock_password_hash, content_lock_enabled "
                "FROM content_gate_config WHERE id = 1"
            ).fetchone()
        finally:
            con.close()

        assert row[0] == ""
        assert row[1] == 0

    def test_unlock_wrong_password(self, cg_client, server_module):
        """POST with an incorrect password returns 403.

        The lock must remain active when the wrong password is given.
        """
        self._lock_db(server_module.DB_PATH, "secure99")

        resp = cg_client.post(
            "/api/content-gate/unlock", json={"password": "wrongpassword"}
        )
        assert resp.status_code == 403

    def test_unlock_wrong_password_does_not_unlock(self, cg_client, server_module):
        """POST with wrong password leaves the DB lock state unchanged.

        Verifies that a failed unlock attempt does not modify the DB,
        preventing partial state corruption.
        """
        self._lock_db(server_module.DB_PATH, "secure99")
        cg_client.post("/api/content-gate/unlock", json={"password": "wrongpassword"})

        con = sqlite3.connect(server_module.DB_PATH)
        try:
            row = con.execute(
                "SELECT content_lock_enabled FROM content_gate_config WHERE id = 1"
            ).fetchone()
        finally:
            con.close()

        assert row[0] == 1

    def test_unlock_empty_password_returns_403(self, cg_client, server_module):
        """POST with empty password returns 403 when a lock is set.

        An empty string will not match the stored hash, so the endpoint
        rejects it with 403 (incorrect password).
        """
        self._lock_db(server_module.DB_PATH, "secure99")

        resp = cg_client.post("/api/content-gate/unlock", json={"password": ""})
        assert resp.status_code == 403

    def test_unlock_persists_to_get(self, cg_client, server_module):
        """POST unlock causes GET to return content_lock_enabled=false.

        Full round-trip test: lock, unlock, then verify GET response.
        """
        self._lock_db(server_module.DB_PATH, "secure99")
        cg_client.post("/api/content-gate/unlock", json={"password": "secure99"})

        get_resp = cg_client.get("/api/content-gate")
        assert get_resp.json()["content_lock_enabled"] is False


# ── TestSetCharacterCeiling ───────────────────────────────────────────────────


class TestSetCharacterCeiling:
    """Tests for PUT /api/content-gate/character/{char_id} — per-character ceiling."""

    def test_set_character_ceiling_general(self, cg_client):
        """PUT sets a 'general' ceiling override for a character.

        'general' is allowed without age verification and should always
        succeed.
        """
        resp = cg_client.put(
            "/api/content-gate/character/1", json={"ceiling": "general"}
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["ok"] is True
        assert data["char_id"] == 1
        assert data["ceiling"] == "general"

    def test_set_character_ceiling_edgy(self, cg_client):
        """PUT sets an 'edgy' ceiling override without age verification.

        'edgy' does not require the age gate.
        """
        resp = cg_client.put(
            "/api/content-gate/character/1", json={"ceiling": "edgy"}
        )
        assert resp.status_code == 200
        assert resp.json()["ceiling"] == "edgy"

    def test_set_character_ceiling_persists(self, cg_client):
        """PUT persists the ceiling so GET reflects it in per_character_ceilings.

        Round-trip test: after setting the ceiling, the GET endpoint
        must include it in the per_character_ceilings map.
        """
        cg_client.put("/api/content-gate/character/1", json={"ceiling": "edgy"})

        get_resp = cg_client.get("/api/content-gate")
        # JSON serialises integer keys as strings
        assert get_resp.json()["per_character_ceilings"].get("1") == "edgy"

    def test_clear_character_ceiling(self, cg_client, server_module):
        """PUT with ceiling=null removes the per-character override.

        After clearing, the character should inherit the global ceiling
        and no longer appear in per_character_ceilings.
        """
        # First set a ceiling
        cg_client.put("/api/content-gate/character/1", json={"ceiling": "edgy"})

        # Then clear it
        resp = cg_client.put(
            "/api/content-gate/character/1", json={"ceiling": None}
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["ok"] is True
        assert data["ceiling"] is None

    def test_clear_character_ceiling_removes_from_get(self, cg_client):
        """PUT null ceiling removes char_id from GET per_character_ceilings map.

        After clearing the override, the char_id must not appear in
        the per_character_ceilings dictionary at all.
        """
        cg_client.put("/api/content-gate/character/1", json={"ceiling": "edgy"})
        cg_client.put("/api/content-gate/character/1", json={"ceiling": None})

        get_resp = cg_client.get("/api/content-gate")
        # JSON serialises integer keys as strings
        assert "1" not in get_resp.json()["per_character_ceilings"]

    def test_character_ceiling_requires_age_for_mature(self, cg_client):
        """PUT returns 403 when setting 'mature' ceiling without age verification.

        Per-character ceilings apply the same age gate as the global ceiling.
        """
        resp = cg_client.put(
            "/api/content-gate/character/1", json={"ceiling": "mature"}
        )
        assert resp.status_code == 403

    def test_character_ceiling_requires_age_for_explicit(self, cg_client):
        """PUT returns 403 when setting 'explicit' ceiling without age verification.

        'explicit' is the highest level and always requires age verification,
        even for per-character overrides.
        """
        resp = cg_client.put(
            "/api/content-gate/character/1", json={"ceiling": "explicit"}
        )
        assert resp.status_code == 403

    def test_character_ceiling_mature_with_age(self, cg_client, server_module):
        """PUT accepts 'mature' ceiling after age verification is confirmed.

        Mirrors the global ceiling test: once the age gate is passed,
        the mature level is accessible on a per-character basis too.
        """
        con = sqlite3.connect(server_module.DB_PATH)
        try:
            con.execute(
                "UPDATE content_gate_config SET age_verified = 1 WHERE id = 1"
            )
            con.commit()
        finally:
            con.close()

        resp = cg_client.put(
            "/api/content-gate/character/1", json={"ceiling": "mature"}
        )
        assert resp.status_code == 200
        assert resp.json()["ceiling"] == "mature"

    def test_character_ceiling_invalid(self, cg_client):
        """PUT returns 400 for an unrecognized ceiling value.

        Any string not in CONTENT_RATING_ORDER must be rejected with 400.
        """
        resp = cg_client.put(
            "/api/content-gate/character/1", json={"ceiling": "r-rated"}
        )
        assert resp.status_code == 400

    def test_character_ceiling_upserts_existing(self, cg_client, server_module):
        """PUT overwrites an existing ceiling for the same character.

        The endpoint uses an upsert (INSERT OR CONFLICT … DO UPDATE) so
        calling it twice for the same char_id should update, not error.
        """
        cg_client.put("/api/content-gate/character/1", json={"ceiling": "general"})
        resp = cg_client.put(
            "/api/content-gate/character/1", json={"ceiling": "edgy"}
        )
        assert resp.status_code == 200
        assert resp.json()["ceiling"] == "edgy"

        get_resp = cg_client.get("/api/content-gate")
        # JSON serialises integer keys as strings
        assert get_resp.json()["per_character_ceilings"].get("1") == "edgy"

    def test_character_ceiling_different_char_ids(self, cg_client):
        """PUT stores independent ceilings for different character IDs.

        Verifies the multi-character scenario: two characters can have
        different ceiling overrides simultaneously.
        """
        cg_client.put("/api/content-gate/character/1", json={"ceiling": "general"})
        cg_client.put("/api/content-gate/character/2", json={"ceiling": "edgy"})

        get_resp = cg_client.get("/api/content-gate")
        ceilings = get_resp.json()["per_character_ceilings"]
        # JSON serialises integer keys as strings
        assert ceilings.get("1") == "general"
        assert ceilings.get("2") == "edgy"
