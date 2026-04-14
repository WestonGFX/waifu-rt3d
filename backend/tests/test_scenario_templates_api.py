"""Tests for per-character scenario template API and migration v69.

Covers:
- GET  /api/scenarios/templates?char_id=N  — list returns seeded builtins
- POST /api/scenarios/templates             — create roundtrip
- PUT  /api/scenarios/templates/{id}        — update roundtrip
- DELETE /api/scenarios/templates/{id}      — delete blocks builtins, removes custom
- POST /api/scenarios/templates/activate    — sets sessions.scene_context
- POST /api/scenarios/templates/activate    — template_id=0 deactivates
- migrate_to_v69 seeds 65 built-in templates (13 × 5)
"""

from __future__ import annotations

import sqlite3

import pytest

from backend.scenario.templates import (
    _ensure_table,
    create_template,
    get_template,
    get_templates,
)


# ---------------------------------------------------------------------------
# In-memory DB helpers
# ---------------------------------------------------------------------------


def _make_scenario_db() -> sqlite3.Connection:
    """Create an in-memory SQLite DB with the scenario_templates + sessions tables.

    The sessions table includes ``scene_context`` and ``scene_enabled`` as
    they exist after schema v50.

    Returns:
        Open :class:`sqlite3.Connection` ready for scenario CRUD.
    """
    conn = sqlite3.connect(":memory:")
    _ensure_table(conn)
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS sessions (
            id          INTEGER PRIMARY KEY,
            title       TEXT,
            scene_context  TEXT,
            scene_enabled  INTEGER DEFAULT 0
        )
        """
    )
    conn.commit()
    return conn


def _seed_sessions(conn: sqlite3.Connection, *session_ids: int) -> None:
    """Insert bare session rows so activate_template can find them.

    Args:
        conn: Open connection.
        *session_ids: One or more session IDs to create.
    """
    for sid in session_ids:
        conn.execute(
            "INSERT OR IGNORE INTO sessions (id, title) VALUES (?, ?)",
            (sid, f"test-session-{sid}"),
        )
    conn.commit()


def _seed_builtins(conn: sqlite3.Connection, char_id: int = 1) -> list[int]:
    """Insert 5 built-in templates for *char_id* and return their IDs.

    Args:
        conn: Open connection.
        char_id: Character to seed templates for.

    Returns:
        List of 5 integer template IDs in insertion order.
    """
    ids: list[int] = []
    for i in range(5):
        t = create_template(
            char_id=char_id,
            title=f"Builtin Scenario {i + 1}",
            description=f"Builtin description {i + 1}.",
            conn=conn,
            setting="indoor",
            time_of_day="any",
            mood="cozy",
            is_default=(i == 0),
            is_builtin=True,
        )
        ids.append(t.id)
    return ids


# ---------------------------------------------------------------------------
# Unit tests — module-level (no FastAPI/HTTP)
# ---------------------------------------------------------------------------


class TestMigrationV69:
    """Verify migrate_to_v69 seeds exactly 65 built-in templates."""

    def test_seeds_65_templates(self) -> None:
        """migrate_to_v69 on a fresh schema_version table inserts 65 rows."""
        conn = sqlite3.connect(":memory:")
        # Minimal schema required by migrate_to_v69
        conn.execute("CREATE TABLE schema_version (version INTEGER)")
        conn.execute("INSERT INTO schema_version VALUES (68)")
        conn.commit()

        from backend.preflight import migrate_to_v69

        result = migrate_to_v69(conn)
        assert result is True

        count = conn.execute(
            "SELECT COUNT(*) FROM scenario_templates WHERE is_builtin = 1"
        ).fetchone()[0]
        assert count == 65, f"Expected 65 built-in templates, got {count}"

    def test_idempotent_on_rerun(self) -> None:
        """Running migrate_to_v69 twice does not duplicate templates."""
        conn = sqlite3.connect(":memory:")
        conn.execute("CREATE TABLE schema_version (version INTEGER)")
        conn.execute("INSERT INTO schema_version VALUES (68)")
        conn.commit()

        from backend.preflight import migrate_to_v69

        migrate_to_v69(conn)
        # Reset version so migration runs again
        conn.execute("UPDATE schema_version SET version = 68")
        conn.commit()
        migrate_to_v69(conn)

        count = conn.execute(
            "SELECT COUNT(*) FROM scenario_templates WHERE is_builtin = 1"
        ).fetchone()[0]
        assert count == 65, (
            f"Idempotency broken: expected 65 templates after 2 runs, got {count}"
        )

    def test_each_character_gets_five(self) -> None:
        """Each of the 13 seeded characters has exactly 5 built-in templates."""
        conn = sqlite3.connect(":memory:")
        conn.execute("CREATE TABLE schema_version (version INTEGER)")
        conn.execute("INSERT INTO schema_version VALUES (68)")
        conn.commit()

        from backend.preflight import migrate_to_v69

        migrate_to_v69(conn)

        # Expected char_ids (Brittney/15 excluded)
        char_ids = [1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13, 14]
        for cid in char_ids:
            count = conn.execute(
                "SELECT COUNT(*) FROM scenario_templates "
                "WHERE char_id = ? AND is_builtin = 1",
                (cid,),
            ).fetchone()[0]
            assert count == 5, (
                f"char_id={cid}: expected 5 built-in templates, got {count}"
            )

    def test_each_character_has_exactly_one_default(self) -> None:
        """Each character's built-in set contains exactly one is_default=1 template."""
        conn = sqlite3.connect(":memory:")
        conn.execute("CREATE TABLE schema_version (version INTEGER)")
        conn.execute("INSERT INTO schema_version VALUES (68)")
        conn.commit()

        from backend.preflight import migrate_to_v69

        migrate_to_v69(conn)

        char_ids = [1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13, 14]
        for cid in char_ids:
            count = conn.execute(
                "SELECT COUNT(*) FROM scenario_templates "
                "WHERE char_id = ? AND is_builtin = 1 AND is_default = 1",
                (cid,),
            ).fetchone()[0]
            assert count == 1, (
                f"char_id={cid}: expected 1 default built-in, got {count}"
            )

    def test_skips_when_already_v69(self) -> None:
        """migrate_to_v69 is a no-op when the schema is already at v69."""
        conn = sqlite3.connect(":memory:")
        conn.execute("CREATE TABLE schema_version (version INTEGER)")
        conn.execute("INSERT INTO schema_version VALUES (69)")
        conn.commit()
        _ensure_table(conn)

        from backend.preflight import migrate_to_v69

        result = migrate_to_v69(conn)
        assert result is True

        count = conn.execute(
            "SELECT COUNT(*) FROM scenario_templates"
        ).fetchone()[0]
        assert count == 0, "Should not insert rows when already at v69"


class TestScenarioCRUD:
    """Low-level CRUD tests via the backend.scenario.templates module."""

    def test_create_and_retrieve(self) -> None:
        """create_template persists a row retrievable by get_template."""
        conn = _make_scenario_db()
        t = create_template(
            char_id=1,
            title="Quiet Café",
            description="A cosy corner table by the window.",
            conn=conn,
            setting="indoor",
            time_of_day="afternoon",
            mood="cozy",
        )
        assert t.id > 0
        fetched = get_template(t.id, conn)
        assert fetched is not None
        assert fetched.title == "Quiet Café"
        assert fetched.is_builtin is False

    def test_get_templates_order(self) -> None:
        """get_templates returns default template first."""
        conn = _make_scenario_db()
        create_template(
            char_id=1, title="Non-default", description="desc.", conn=conn
        )
        create_template(
            char_id=1, title="Default", description="desc.", conn=conn, is_default=True
        )
        templates = get_templates(1, conn)
        assert templates[0].is_default is True

    def test_builtin_flag_preserved(self) -> None:
        """create_template with is_builtin=True stores the flag correctly."""
        conn = _make_scenario_db()
        t = create_template(
            char_id=1,
            title="Shipped Scene",
            description="Built-in description.",
            conn=conn,
            is_builtin=True,
        )
        fetched = get_template(t.id, conn)
        assert fetched is not None
        assert fetched.is_builtin is True

    def test_update_title(self) -> None:
        """update_template changes only the specified field."""
        from backend.scenario.templates import update_template

        conn = _make_scenario_db()
        t = create_template(
            char_id=1, title="Old Title", description="desc.", conn=conn
        )
        result = update_template(t.id, conn, title="New Title")
        assert result is True
        updated = get_template(t.id, conn)
        assert updated is not None
        assert updated.title == "New Title"
        assert updated.description == "desc."

    def test_update_returns_false_for_missing(self) -> None:
        """update_template returns False when the ID does not exist."""
        from backend.scenario.templates import update_template

        conn = _make_scenario_db()
        result = update_template(9999, conn, title="Ghost")
        assert result is False

    def test_delete_custom_template(self) -> None:
        """delete_template removes a user-created row."""
        from backend.scenario.templates import delete_template

        conn = _make_scenario_db()
        t = create_template(
            char_id=1, title="Custom", description="desc.", conn=conn
        )
        result = delete_template(t.id, conn)
        assert result is True
        assert get_template(t.id, conn) is None

    def test_delete_returns_false_for_missing(self) -> None:
        """delete_template returns False for a non-existent ID."""
        from backend.scenario.templates import delete_template

        conn = _make_scenario_db()
        assert delete_template(9999, conn) is False

    def test_activate_sets_scene_context(self) -> None:
        """activate_template writes the template ID to sessions.scene_context."""
        from backend.scenario.templates import activate_template

        conn = _make_scenario_db()
        _seed_sessions(conn, 5)
        t = create_template(
            char_id=1, title="Active Scene", description="desc.", conn=conn
        )
        result = activate_template(t.id, 5, conn)
        assert result is True
        row = conn.execute(
            "SELECT scene_context, scene_enabled FROM sessions WHERE id = 5"
        ).fetchone()
        assert row[0] == str(t.id)
        assert row[1] == 1

    def test_deactivate_clears_scene_context(self) -> None:
        """activate_template(0, session_id) clears scene_context and sets enabled=0."""
        from backend.scenario.templates import activate_template

        conn = _make_scenario_db()
        _seed_sessions(conn, 7)
        t = create_template(
            char_id=1, title="Temp Scene", description="desc.", conn=conn
        )
        activate_template(t.id, 7, conn)
        result = activate_template(0, 7, conn)
        assert result is True
        row = conn.execute(
            "SELECT scene_context, scene_enabled FROM sessions WHERE id = 7"
        ).fetchone()
        assert row[0] is None
        assert row[1] == 0


# ---------------------------------------------------------------------------
# HTTP API tests (FastAPI TestClient + conftest fixtures)
# ---------------------------------------------------------------------------


class TestScenariosTemplatesAPI:
    """Integration tests using the FastAPI TestClient from conftest.py."""

    # The conftest `client` fixture patches DB_PATH to a tmp db seeded with
    # a single 'Default' character (id=1) but WITHOUT scene_context columns.
    # We patch those columns in where needed.

    def _add_scene_columns(self, db_path) -> None:
        """Add scene_context / scene_enabled to the test sessions table.

        Args:
            db_path: Filesystem path to the test SQLite database.
        """
        conn = sqlite3.connect(db_path)
        try:
            try:
                conn.execute(
                    "ALTER TABLE sessions ADD COLUMN scene_context TEXT"
                )
            except sqlite3.OperationalError:
                pass
            try:
                conn.execute(
                    "ALTER TABLE sessions ADD COLUMN scene_enabled INTEGER DEFAULT 0"
                )
            except sqlite3.OperationalError:
                pass
            conn.commit()
        finally:
            conn.close()

    def _insert_session(self, db_path, session_id: int = 1) -> None:
        """Insert a bare session row into the test DB.

        Args:
            db_path: Filesystem path to the test SQLite database.
            session_id: Session ID to create.
        """
        conn = sqlite3.connect(db_path)
        try:
            conn.execute(
                "INSERT OR IGNORE INTO sessions (id, title) VALUES (?, ?)",
                (session_id, "test"),
            )
            conn.commit()
        finally:
            conn.close()

    # -- List --

    def test_list_returns_ok(self, client, db_path) -> None:
        """GET /api/scenarios/templates?char_id=1 returns ok=True."""
        resp = client.get("/api/scenarios/templates?char_id=1")
        assert resp.status_code == 200
        data = resp.json()
        assert data["ok"] is True
        assert "templates" in data

    def test_list_invalid_char_id(self, client) -> None:
        """GET with char_id=0 returns 400."""
        resp = client.get("/api/scenarios/templates?char_id=0")
        assert resp.status_code == 400

    def test_list_empty_for_unknown_char(self, client) -> None:
        """GET for a character with no templates returns an empty list."""
        resp = client.get("/api/scenarios/templates?char_id=9999")
        assert resp.status_code == 200
        assert resp.json()["templates"] == []

    # -- Create --

    def test_create_returns_template(self, client) -> None:
        """POST /api/scenarios/templates creates a template and returns it."""
        resp = client.post(
            "/api/scenarios/templates",
            json={
                "char_id": 1,
                "title": "Midnight Library",
                "description": "Stacks of books, a single lamp, total silence.",
                "setting": "indoor",
                "time_of_day": "night",
                "mood": "cozy",
                "is_default": False,
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["ok"] is True
        assert data["template"]["title"] == "Midnight Library"
        assert data["template"]["is_builtin"] is False
        assert data["template"]["id"] > 0

    def test_create_empty_title_rejected(self, client) -> None:
        """POST with an empty title returns 400."""
        resp = client.post(
            "/api/scenarios/templates",
            json={"char_id": 1, "title": "   ", "description": "desc"},
        )
        assert resp.status_code == 400

    # -- Update --

    def test_update_changes_title(self, client) -> None:
        """PUT /api/scenarios/templates/{id} updates the title field."""
        # First create a template to update
        create_resp = client.post(
            "/api/scenarios/templates",
            json={
                "char_id": 1,
                "title": "Original Title",
                "description": "Some description.",
            },
        )
        template_id = create_resp.json()["template"]["id"]

        update_resp = client.put(
            f"/api/scenarios/templates/{template_id}",
            json={"title": "Updated Title"},
        )
        assert update_resp.status_code == 200
        assert update_resp.json()["ok"] is True

        # Confirm the change persisted
        list_resp = client.get("/api/scenarios/templates?char_id=1")
        titles = [t["title"] for t in list_resp.json()["templates"]]
        assert "Updated Title" in titles
        assert "Original Title" not in titles

    def test_update_missing_template(self, client) -> None:
        """PUT for a non-existent template_id returns 404."""
        resp = client.put(
            "/api/scenarios/templates/9999",
            json={"title": "Ghost"},
        )
        assert resp.status_code == 404

    # -- Delete --

    def test_delete_custom_template(self, client) -> None:
        """DELETE removes a user-created template successfully."""
        create_resp = client.post(
            "/api/scenarios/templates",
            json={"char_id": 1, "title": "To Delete", "description": "bye."},
        )
        template_id = create_resp.json()["template"]["id"]

        del_resp = client.delete(f"/api/scenarios/templates/{template_id}")
        assert del_resp.status_code == 200
        assert del_resp.json()["ok"] is True

        # Confirm it's gone
        list_resp = client.get("/api/scenarios/templates?char_id=1")
        ids = [t["id"] for t in list_resp.json()["templates"]]
        assert template_id not in ids

    def test_delete_builtin_blocked(self, client, db_path) -> None:
        """DELETE on a built-in template returns 403."""
        # Directly insert a built-in template
        conn = sqlite3.connect(db_path)
        try:
            _ensure_table(conn)
            t = create_template(
                char_id=1,
                title="Built-in Scene",
                description="shipped.",
                conn=conn,
                is_builtin=True,
            )
            template_id = t.id
        finally:
            conn.close()

        resp = client.delete(f"/api/scenarios/templates/{template_id}")
        assert resp.status_code == 403

    def test_delete_missing_template(self, client) -> None:
        """DELETE for a non-existent template_id returns 404."""
        resp = client.delete("/api/scenarios/templates/9999")
        assert resp.status_code == 404

    # -- Activate / Deactivate --

    def test_activate_sets_scene_context(self, client, db_path) -> None:
        """POST /activate writes template ID to sessions.scene_context."""
        self._add_scene_columns(db_path)
        self._insert_session(db_path, session_id=42)

        create_resp = client.post(
            "/api/scenarios/templates",
            json={"char_id": 1, "title": "Scene X", "description": "desc."},
        )
        template_id = create_resp.json()["template"]["id"]

        resp = client.post(
            "/api/scenarios/templates/activate",
            json={"template_id": template_id, "session_id": 42},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["ok"] is True
        assert data["activated"] is True

        conn = sqlite3.connect(db_path)
        row = conn.execute(
            "SELECT scene_context, scene_enabled FROM sessions WHERE id = 42"
        ).fetchone()
        conn.close()
        assert row[0] == str(template_id)
        assert row[1] == 1

    def test_deactivate_clears_scene_context(self, client, db_path) -> None:
        """POST /activate with template_id=0 clears the session scenario."""
        self._add_scene_columns(db_path)
        self._insert_session(db_path, session_id=43)

        create_resp = client.post(
            "/api/scenarios/templates",
            json={"char_id": 1, "title": "Scene Y", "description": "desc."},
        )
        template_id = create_resp.json()["template"]["id"]

        # Activate first
        client.post(
            "/api/scenarios/templates/activate",
            json={"template_id": template_id, "session_id": 43},
        )

        # Deactivate
        resp = client.post(
            "/api/scenarios/templates/activate",
            json={"template_id": 0, "session_id": 43},
        )
        assert resp.status_code == 200

        conn = sqlite3.connect(db_path)
        row = conn.execute(
            "SELECT scene_context, scene_enabled FROM sessions WHERE id = 43"
        ).fetchone()
        conn.close()
        assert row[0] is None
        assert row[1] == 0

    def test_activate_missing_template(self, client, db_path) -> None:
        """POST /activate with a non-existent template_id returns 404."""
        self._add_scene_columns(db_path)
        self._insert_session(db_path, session_id=44)

        resp = client.post(
            "/api/scenarios/templates/activate",
            json={"template_id": 9999, "session_id": 44},
        )
        assert resp.status_code == 404

    # -- Active template resolution --

    def test_get_active_no_session_returns_null(self, client) -> None:
        """GET /active for a session with no scenario returns template=null."""
        resp = client.get(
            "/api/scenarios/templates/active?char_id=1&session_id=9999"
        )
        assert resp.status_code == 200
        assert resp.json()["template"] is None

    def test_get_active_after_activate(self, client, db_path) -> None:
        """GET /active reflects the activated template."""
        self._add_scene_columns(db_path)
        self._insert_session(db_path, session_id=50)

        create_resp = client.post(
            "/api/scenarios/templates",
            json={"char_id": 1, "title": "Active Scene Z", "description": "desc."},
        )
        template_id = create_resp.json()["template"]["id"]

        client.post(
            "/api/scenarios/templates/activate",
            json={"template_id": template_id, "session_id": 50},
        )

        resp = client.get(
            "/api/scenarios/templates/active?char_id=1&session_id=50"
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["template"] is not None
        assert data["template"]["id"] == template_id
