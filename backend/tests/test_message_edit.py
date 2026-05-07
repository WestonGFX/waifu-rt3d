"""Tests for the upgraded PUT /api/messages/{id} endpoint (schema v73).

Covers: happy path, multi-edit history ordering, 20-entry cap, 400 on
empty/whitespace, 404 on missing id, corrupt-history recovery, newline
preservation, GET projection of edited_at, and no cross-message mutation.
"""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path

import pytest


# --------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------

def _add_v73_cols_to_test_db(db_path: Path) -> None:
    """Idempotently add v73 columns (edited_at, edit_history) + pinned to the
    shared test DB created by conftest.py.

    The conftest schema predates v73. The full SELECT in edit_message and
    get_session_messages references these columns, so they must exist before
    any endpoint call.

    Args:
        db_path: Filesystem path to the SQLite DB used by the TestClient.
    """
    con = sqlite3.connect(db_path)
    try:
        cols = {r[1] for r in con.execute("PRAGMA table_info(messages)").fetchall()}
        for col_name, col_type in [
            ("pinned",           "INTEGER DEFAULT 0"),
            ("image_url",        "TEXT"),
            ("image_prompt",     "TEXT"),
            ("edited_at",        "INTEGER"),
            ("edit_history",     "TEXT"),
            ("sibling_group_id", "TEXT"),
            ("sibling_index",    "INTEGER"),
        ]:
            if col_name not in cols:
                con.execute(f"ALTER TABLE messages ADD COLUMN {col_name} {col_type}")
        con.commit()
    finally:
        con.close()


def _seed_session_and_message(
    db_path: Path,
    session_id: int,
    text: str,
    role: str = "user",
) -> int:
    """Insert a session row and one message row; return the message id.

    The ``ts`` column is stored as an ISO-8601 string so that the endpoint's
    ``MessageOut.ts: Optional[str]`` Pydantic field can accept it without a
    validation error. (The conftest schema default uses ``strftime('%s','now')``
    which produces an integer — this helper overrides that with a string value
    to satisfy the model declaration.)

    Args:
        db_path: Path to the test SQLite DB.
        session_id: Unique integer to use as the session id.
        text: Initial text content for the message.
        role: Message role (``"user"`` or ``"assistant"``).

    Returns:
        The ``rowid`` of the newly inserted message.
    """
    con = sqlite3.connect(db_path)
    try:
        con.execute(
            "INSERT OR IGNORE INTO sessions(id, title) VALUES (?, ?)",
            (session_id, f"edit-test-session-{session_id}"),
        )
        # Use datetime('now') so ts is stored as an ISO-8601 string, which
        # matches MessageOut.ts: Optional[str] without a Pydantic validation error.
        con.execute(
            "INSERT INTO messages(session_id, role, text, ts, is_active) "
            "VALUES (?, ?, ?, datetime('now'), 1)",
            (session_id, role, text),
        )
        con.commit()
        msg_id = con.execute("SELECT last_insert_rowid()").fetchone()[0]
    finally:
        con.close()
    return msg_id


# --------------------------------------------------------------------------
# Test class
# --------------------------------------------------------------------------

class TestMessageEdit:
    """End-to-end tests for PUT /api/messages/{id} (message edit endpoint)."""

    def test_edit_message_happy_path(self, client, db_path):
        """Editing a message returns correct shape and captures original text in history.

        Asserts:
        - Response status 200.
        - All expected fields present in the response body.
        - ``edited_at`` is a non-zero integer.
        - ``edit_history`` contains exactly one entry with the original text.
        - ``text`` in the response equals the new text.
        """
        _add_v73_cols_to_test_db(db_path)
        original_text = "Hello, original message."
        msg_id = _seed_session_and_message(db_path, session_id=1001, text=original_text)

        resp = client.put(f"/api/messages/{msg_id}", json={"text": "Hello, edited!"})

        assert resp.status_code == 200
        body = resp.json()
        # Shape checks
        for field in ("id", "role", "text", "edited_at", "edit_history"):
            assert field in body, f"Field {field!r} missing from response"
        # Content checks
        assert body["text"] == "Hello, edited!"
        assert isinstance(body["edited_at"], int)
        assert body["edited_at"] > 0
        history = body["edit_history"]
        assert len(history) == 1
        assert history[0]["prev_content"] == original_text

    def test_edit_message_preserves_history(self, client, db_path):
        """Two sequential edits produce two history entries in chronological order.

        Asserts:
        - After the second edit, ``edit_history`` has exactly 2 entries.
        - ``ts`` values are in ascending order (oldest first).
        - Each ``prev_content`` matches the text that was in place before that edit.
        """
        _add_v73_cols_to_test_db(db_path)
        original = "first version"
        msg_id = _seed_session_and_message(db_path, session_id=1002, text=original)

        r1 = client.put(f"/api/messages/{msg_id}", json={"text": "second version"})
        assert r1.status_code == 200

        r2 = client.put(f"/api/messages/{msg_id}", json={"text": "third version"})
        assert r2.status_code == 200

        body = r2.json()
        history = body["edit_history"]
        assert len(history) == 2
        # Chronological order — ts of entry 0 must be <= ts of entry 1
        assert history[0]["ts"] <= history[1]["ts"]
        # Prev-content chain
        assert history[0]["prev_content"] == "first version"
        assert history[1]["prev_content"] == "second version"

    def test_edit_message_history_cap(self, client, db_path):
        """Editing a message 22 times caps edit_history at 20 entries (oldest dropped).

        Asserts:
        - After 22 edits, ``edit_history`` length is exactly 20.
        - The most-recent (newest) entries are retained, oldest are dropped.
        """
        _add_v73_cols_to_test_db(db_path)
        msg_id = _seed_session_and_message(db_path, session_id=1003, text="v0")

        resp = None
        for i in range(1, 23):  # 22 edits
            resp = client.put(f"/api/messages/{msg_id}", json={"text": f"v{i}"})
            assert resp.status_code == 200, f"Edit {i} failed: {resp.text}"

        history = resp.json()["edit_history"]
        assert len(history) == 20, f"Expected 20, got {len(history)}"
        # The oldest dropped entry was "v0"; the earliest surviving entry is "v2"
        surviving_contents = [h["prev_content"] for h in history]
        assert "v0" not in surviving_contents, "Oldest entry should have been dropped"
        assert "v2" in surviving_contents, "Entry v2 should be among retained entries"

    def test_edit_message_empty_400(self, client, db_path):
        """PUT with an empty text string returns HTTP 400.

        Asserts:
        - Response status 400.
        """
        _add_v73_cols_to_test_db(db_path)
        msg_id = _seed_session_and_message(db_path, session_id=1004, text="some text")

        resp = client.put(f"/api/messages/{msg_id}", json={"text": ""})

        assert resp.status_code == 400

    def test_edit_message_whitespace_only_400(self, client, db_path):
        """PUT with whitespace-only text returns HTTP 400 (strip makes it empty).

        Asserts:
        - Response status 400 for ``"   "`` input.
        """
        _add_v73_cols_to_test_db(db_path)
        msg_id = _seed_session_and_message(db_path, session_id=1005, text="some text")

        resp = client.put(f"/api/messages/{msg_id}", json={"text": "   "})

        assert resp.status_code == 400

    def test_edit_message_missing_404(self, client, db_path):
        """PUT to a non-existent message_id returns HTTP 404.

        Asserts:
        - Response status 404 for message_id=999999.
        """
        _add_v73_cols_to_test_db(db_path)

        resp = client.put("/api/messages/999999", json={"text": "irrelevant"})

        assert resp.status_code == 404

    def test_edit_message_corrupt_history_recovers(self, client, db_path):
        """A corrupt edit_history JSON value is silently reset on the next edit.

        The endpoint catches ``(TypeError, ValueError)`` from ``json.loads``
        and starts a fresh history list. This verifies the recovery path.

        Asserts:
        - Response status 200.
        - ``edit_history`` has exactly 1 entry (the corrupt value was discarded).
        """
        _add_v73_cols_to_test_db(db_path)
        msg_id = _seed_session_and_message(
            db_path, session_id=1006, text="original text"
        )

        # Corrupt the edit_history field directly in the DB
        con = sqlite3.connect(db_path)
        try:
            con.execute(
                "UPDATE messages SET edit_history=? WHERE id=?",
                ("[not-json", msg_id),
            )
            con.commit()
        finally:
            con.close()

        resp = client.put(f"/api/messages/{msg_id}", json={"text": "recovered text"})

        assert resp.status_code == 200
        body = resp.json()
        history = body["edit_history"]
        assert len(history) == 1, (
            f"Expected 1 history entry after corrupt recovery, got {len(history)}"
        )
        assert history[0]["prev_content"] == "original text"

    def test_edit_message_preserves_newlines(self, client, db_path):
        """PUT text containing embedded newlines round-trips exactly.

        Asserts:
        - Response ``text`` equals the input with newlines intact.
        - No stripping beyond leading/trailing whitespace (interior newlines preserved).
        """
        _add_v73_cols_to_test_db(db_path)
        msg_id = _seed_session_and_message(db_path, session_id=1007, text="original")
        multiline = "line1\nline2\n\nline3"

        resp = client.put(f"/api/messages/{msg_id}", json={"text": multiline})

        assert resp.status_code == 200
        assert resp.json()["text"] == multiline

    def test_get_session_messages_projects_edited_at(self, client, db_path):
        """GET /api/sessions/{id}/messages returns edited_at for an edited message.

        After a successful edit, the list endpoint must surface the updated
        ``edited_at`` field on the matching message row.

        Asserts:
        - Response status 200.
        - The edited message row contains ``edited_at`` that is non-null.
        """
        _add_v73_cols_to_test_db(db_path)
        msg_id = _seed_session_and_message(
            db_path, session_id=1008, text="to be edited"
        )

        put_resp = client.put(f"/api/messages/{msg_id}", json={"text": "was edited"})
        assert put_resp.status_code == 200
        expected_edited_at = put_resp.json()["edited_at"]

        get_resp = client.get("/api/sessions/1008/messages")
        assert get_resp.status_code == 200
        msgs = get_resp.json()["messages"]
        target = next((m for m in msgs if m["id"] == msg_id), None)
        assert target is not None, f"Message {msg_id} not found in session messages"
        assert target.get("edited_at") is not None, (
            "edited_at should be present and non-null on an edited message"
        )
        assert target["edited_at"] == expected_edited_at

    def test_edit_message_does_not_mutate_other_messages(self, client, db_path):
        """Editing one message leaves a sibling message in the same session untouched.

        Asserts:
        - The unedited message still has its original text after the other is edited.
        - The unedited message has no ``edited_at`` value (or it is null/absent).
        """
        _add_v73_cols_to_test_db(db_path)
        session_id = 1009
        # Insert session explicitly so both messages share it
        con = sqlite3.connect(db_path)
        try:
            con.execute(
                "INSERT OR IGNORE INTO sessions(id, title) VALUES (?, ?)",
                (session_id, "sibling-test"),
            )
            con.execute(
                "INSERT INTO messages(session_id, role, text, ts, is_active) "
                "VALUES (?, 'user', ?, datetime('now'), 1)",
                (session_id, "message A — will be edited"),
            )
            msg_a_id = con.execute("SELECT last_insert_rowid()").fetchone()[0]
            con.execute(
                "INSERT INTO messages(session_id, role, text, ts, is_active) "
                "VALUES (?, 'user', ?, datetime('now'), 1)",
                (session_id, "message B — untouched"),
            )
            msg_b_id = con.execute("SELECT last_insert_rowid()").fetchone()[0]
            con.commit()
        finally:
            con.close()

        # Edit only message A
        put_resp = client.put(
            f"/api/messages/{msg_a_id}", json={"text": "message A — edited"}
        )
        assert put_resp.status_code == 200

        # Retrieve all session messages and inspect message B
        get_resp = client.get(f"/api/sessions/{session_id}/messages")
        assert get_resp.status_code == 200
        msgs = get_resp.json()["messages"]

        msg_b = next((m for m in msgs if m["id"] == msg_b_id), None)
        assert msg_b is not None, f"Message B (id={msg_b_id}) missing from response"
        assert msg_b["text"] == "message B — untouched"
        # edited_at should be absent or null for the unedited message
        assert msg_b.get("edited_at") is None, (
            "Unedited message should not have edited_at set"
        )
