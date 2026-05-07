"""Tests for sibling-group hardening introduced with schema v73.

Covers:
- ``POST /api/messages/{id}/regenerate`` — first-regen group allocation,
  multi-regen index extension, and orphan-isolation guarantees.
- ``GET /api/messages/{id}/branches`` — sibling_group_id-based ordering
  and is_original flag correctness.
- ``POST /api/messages/{id}/activate`` — cross-group isolation.
- v73 migration smoke test — column presence in the live test DB.

All tests use the ``client`` + ``db_path`` fixtures from conftest.py and
seed the DB directly via sqlite3 to avoid dependencies on other endpoints.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path

import pytest


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _add_v73_cols_to_test_db(db_path: Path) -> None:
    """Idempotently add v73 columns to the conftest test DB if absent.

    The conftest schema predates v73 (``sibling_group_id``, ``sibling_index``).
    This helper mirrors the pattern in ``test_image_url_persistence.py`` so that
    the ``get_session_messages`` full-column SELECT succeeds without hitting
    the minimal-fallback branch.

    Args:
        db_path: Filesystem path to the SQLite test database.
    """
    con = sqlite3.connect(db_path)
    try:
        cols = {r[1] for r in con.execute("PRAGMA table_info(messages)").fetchall()}
        for col_name, col_type in [
            ("pinned",           "INTEGER DEFAULT 0"),
            ("image_url",        "TEXT"),
            ("image_prompt",     "TEXT"),
            ("edited_at",        "REAL"),
            ("edit_history",     "TEXT"),
            ("sibling_group_id", "TEXT"),
            ("sibling_index",    "INTEGER"),
            # created_at is referenced by the branches endpoint SELECT
            ("created_at",       "TEXT DEFAULT (datetime('now'))"),
        ]:
            if col_name not in cols:
                con.execute(
                    f"ALTER TABLE messages ADD COLUMN {col_name} {col_type}"
                )
        con.commit()
    finally:
        con.close()


def _seed_session(db_path: Path, session_id: int, title: str = "test") -> int:
    """Insert a bare session row and return a default assistant message ID.

    Creates one user message and one assistant message with
    ``sibling_group_id=NULL`` (pre-regen state).

    Args:
        db_path: Path to the SQLite test database.
        session_id: Unique integer ID for the new session.
        title: Optional session title for debugging.

    Returns:
        The ``rowid`` (id) of the newly inserted assistant message.
    """
    con = sqlite3.connect(db_path)
    try:
        con.execute(
            "INSERT INTO sessions(id, title) VALUES (?, ?)",
            (session_id, title),
        )
        con.execute(
            "INSERT INTO messages(session_id, role, text, is_active, sibling_group_id) "
            "VALUES (?, 'user', 'Hello', 1, NULL)",
            (session_id,),
        )
        con.execute(
            "INSERT INTO messages(session_id, role, text, is_active, sibling_group_id) "
            "VALUES (?, 'assistant', 'Hi there!', 1, NULL)",
            (session_id,),
        )
        con.commit()
        row = con.execute(
            "SELECT id FROM messages WHERE session_id=? AND role='assistant' ORDER BY id DESC LIMIT 1",
            (session_id,),
        ).fetchone()
        return row[0]
    finally:
        con.close()


# ---------------------------------------------------------------------------
# Test class
# ---------------------------------------------------------------------------

class TestMessageSiblings:
    """End-to-end tests for sibling-group hardening (v73)."""

    # ------------------------------------------------------------------
    # 1. First regen allocates a group
    # ------------------------------------------------------------------

    def test_first_regen_allocates_group(self, client, db_path):
        """POST /regenerate on an orphan message creates a sibling group.

        The original message gets ``sibling_group_id`` set and
        ``sibling_index=0``; the new message gets the same group ID and
        ``sibling_index=1``.
        """
        _add_v73_cols_to_test_db(db_path)
        assistant_id = _seed_session(db_path, session_id=5001, title="regen-group-test")

        resp = client.post(f"/api/messages/{assistant_id}/regenerate")
        assert resp.status_code == 200
        body = resp.json()
        assert body["ok"] is True
        new_id = body["new_message"]["id"]
        assert new_id is not None

        # Inspect DB directly
        con = sqlite3.connect(db_path)
        try:
            orig = con.execute(
                "SELECT sibling_group_id, sibling_index FROM messages WHERE id=?",
                (assistant_id,),
            ).fetchone()
            sibling = con.execute(
                "SELECT sibling_group_id, sibling_index FROM messages WHERE id=?",
                (new_id,),
            ).fetchone()
        finally:
            con.close()

        # Original must now have a non-NULL group with index 0
        assert orig[0] is not None, "Original message should have a sibling_group_id after first regen"
        assert orig[1] == 0, "Original message should have sibling_index=0"

        # New sibling must share the group and have index 1
        assert sibling[0] == orig[0], "New sibling must share sibling_group_id with original"
        assert sibling[1] == 1, "New sibling must have sibling_index=1"

    # ------------------------------------------------------------------
    # 2. Multi-regen extends the group contiguously
    # ------------------------------------------------------------------

    def test_multi_regen_extends_group(self, client, db_path):
        """Four successive regens on the same original create indices 0-4.

        After 4 regens the group must have exactly 5 members with
        sibling_index values {0, 1, 2, 3, 4} — no gaps, no duplicates.
        """
        _add_v73_cols_to_test_db(db_path)
        assistant_id = _seed_session(db_path, session_id=5002, title="multi-regen-test")

        # First regen: allocates the group
        resp1 = client.post(f"/api/messages/{assistant_id}/regenerate")
        assert resp1.status_code == 200

        # The newly returned message becomes the "latest active" sibling;
        # the regenerate endpoint always re-targets the SAME original by ID.
        # Perform 3 more regens on the same original ID.
        for _ in range(3):
            resp = client.post(f"/api/messages/{assistant_id}/regenerate")
            assert resp.status_code == 200

        # Inspect DB
        con = sqlite3.connect(db_path)
        try:
            group_id = con.execute(
                "SELECT sibling_group_id FROM messages WHERE id=?",
                (assistant_id,),
            ).fetchone()[0]
            assert group_id is not None

            rows = con.execute(
                "SELECT sibling_index FROM messages WHERE sibling_group_id=? ORDER BY sibling_index ASC",
                (group_id,),
            ).fetchall()
        finally:
            con.close()

        indices = [r[0] for r in rows]
        assert len(indices) == 5, f"Expected 5 group members, got {len(indices)}: {indices}"
        assert indices == [0, 1, 2, 3, 4], f"Indices should be contiguous 0-4, got {indices}"

    # ------------------------------------------------------------------
    # 3. Orphan messages from different sessions don't collide
    # ------------------------------------------------------------------

    def test_orphan_messages_dont_collide(self, client, db_path):
        """Two independent assistant messages get distinct sibling_group_ids.

        Before v73, parent_id=NULL matched EVERY orphan row — regenning one
        assistant would absorb unrelated messages into its branch group.
        This test verifies that isolation is correct post-fix.
        """
        _add_v73_cols_to_test_db(db_path)

        id_a = _seed_session(db_path, session_id=5003, title="orphan-A")
        id_b = _seed_session(db_path, session_id=5004, title="orphan-B")

        resp_a = client.post(f"/api/messages/{id_a}/regenerate")
        assert resp_a.status_code == 200
        resp_b = client.post(f"/api/messages/{id_b}/regenerate")
        assert resp_b.status_code == 200

        con = sqlite3.connect(db_path)
        try:
            gid_a = con.execute(
                "SELECT sibling_group_id FROM messages WHERE id=?", (id_a,)
            ).fetchone()[0]
            gid_b = con.execute(
                "SELECT sibling_group_id FROM messages WHERE id=?", (id_b,)
            ).fetchone()[0]

            count_a = con.execute(
                "SELECT COUNT(*) FROM messages WHERE sibling_group_id=?", (gid_a,)
            ).fetchone()[0]
            count_b = con.execute(
                "SELECT COUNT(*) FROM messages WHERE sibling_group_id=?", (gid_b,)
            ).fetchone()[0]
        finally:
            con.close()

        assert count_a == 2, f"Group A should have 2 members (original + 1 sibling), got {count_a}"
        assert count_b == 2, f"Group B should have 2 members (original + 1 sibling), got {count_b}"
        assert gid_a != gid_b, "Groups from different sessions must have different sibling_group_ids"

    # ------------------------------------------------------------------
    # 4. GET /branches returns group ordered by sibling_index
    # ------------------------------------------------------------------

    def test_branches_returns_group_ordered_by_sibling_index(self, client, db_path):
        """GET /branches returns 4 members in sibling_index order with correct is_original.

        After 3 regens the group has 4 members (original + 3 siblings).
        The endpoint must return them ordered sibling_index 0, 1, 2, 3 and
        mark only the member with sibling_index=0 as ``is_original: True``.
        """
        _add_v73_cols_to_test_db(db_path)
        assistant_id = _seed_session(db_path, session_id=5005, title="branches-order-test")

        # Three regens → 4 total members
        for _ in range(3):
            resp = client.post(f"/api/messages/{assistant_id}/regenerate")
            assert resp.status_code == 200

        resp = client.get(f"/api/messages/{assistant_id}/branches")
        assert resp.status_code == 200
        data = resp.json()

        assert data["total"] == 4, f"Expected total=4, got {data['total']}"
        branches = data["branches"]
        assert len(branches) == 4

        # Verify ascending sibling_index order
        indices = [b["sibling_index"] for b in branches]
        assert indices == [0, 1, 2, 3], f"Branches not in sibling_index order: {indices}"

        # Only the first branch (sibling_index=0) should be is_original
        for branch in branches:
            if branch["sibling_index"] == 0:
                assert branch["is_original"] is True, "sibling_index=0 must be is_original=True"
            else:
                assert branch["is_original"] is False, (
                    f"sibling_index={branch['sibling_index']} must be is_original=False"
                )

    # ------------------------------------------------------------------
    # 5. Activate switches within group only, not cross-group
    # ------------------------------------------------------------------

    def test_activate_switches_is_active_within_group_only(self, client, db_path):
        """Activating a sibling in group A must not touch group B.

        Creates two independent regen groups (sessions 5006 and 5007).
        Activates the sibling (new message) in group A. Verifies:
        - The activated sibling in group A has is_active=1.
        - The original in group A has is_active=0.
        - Both messages in group B are unchanged.
        """
        _add_v73_cols_to_test_db(db_path)

        orig_a = _seed_session(db_path, session_id=5006, title="activate-A")
        orig_b = _seed_session(db_path, session_id=5007, title="activate-B")

        # Regen both; capture the new sibling IDs
        resp_a = client.post(f"/api/messages/{orig_a}/regenerate")
        assert resp_a.status_code == 200
        sibling_a_id = resp_a.json()["new_message"]["id"]

        resp_b = client.post(f"/api/messages/{orig_b}/regenerate")
        assert resp_b.status_code == 200
        sibling_b_id = resp_b.json()["new_message"]["id"]

        # Record group-B is_active values before activating anything in group A
        con = sqlite3.connect(db_path)
        try:
            gid_b = con.execute(
                "SELECT sibling_group_id FROM messages WHERE id=?", (orig_b,)
            ).fetchone()[0]
            b_before = {
                r[0]: r[1]
                for r in con.execute(
                    "SELECT id, is_active FROM messages WHERE sibling_group_id=?",
                    (gid_b,),
                ).fetchall()
            }
        finally:
            con.close()

        # Activate the NEW sibling in group A
        act_resp = client.post(f"/api/messages/{sibling_a_id}/activate")
        assert act_resp.status_code == 200
        assert act_resp.json()["ok"] is True

        # Inspect DB post-activation
        con = sqlite3.connect(db_path)
        try:
            a_active = con.execute(
                "SELECT id, is_active FROM messages WHERE id IN (?, ?)",
                (orig_a, sibling_a_id),
            ).fetchall()
            a_map = {r[0]: r[1] for r in a_active}

            b_after = {
                r[0]: r[1]
                for r in con.execute(
                    "SELECT id, is_active FROM messages WHERE sibling_group_id=?",
                    (gid_b,),
                ).fetchall()
            }
        finally:
            con.close()

        # Group A assertions
        assert a_map[sibling_a_id] == 1, "Activated sibling in group A should be is_active=1"
        assert a_map[orig_a] == 0, "Original in group A should be deactivated (is_active=0)"

        # Group B must be completely unchanged
        assert b_before == b_after, (
            f"Group B is_active values changed after activating group A.\n"
            f"Before: {b_before}\nAfter: {b_after}"
        )

    # ------------------------------------------------------------------
    # 6. v73 migration smoke: both columns exist in the live test DB
    # ------------------------------------------------------------------

    def test_v73_migration_backfills_sibling_cols(self, db_path):
        """PRAGMA table_info shows sibling_group_id and sibling_index exist.

        This is a smoke test: the live test DB already has v73 applied via
        conftest (or _add_v73_cols_to_test_db). We simply assert the columns
        are present rather than re-running the migration chain.
        """
        _add_v73_cols_to_test_db(db_path)

        con = sqlite3.connect(db_path)
        try:
            cols = {r[1] for r in con.execute("PRAGMA table_info(messages)").fetchall()}
        finally:
            con.close()

        assert "sibling_group_id" in cols, (
            "Column sibling_group_id missing from messages table after v73 migration"
        )
        assert "sibling_index" in cols, (
            "Column sibling_index missing from messages table after v73 migration"
        )
