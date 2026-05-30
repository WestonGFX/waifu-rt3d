"""Trust-spine tests for memory forget / privacy (schema v88).

Proves the guarantees that make "she forgot it" real:
  - soft delete suppresses the row AND records a content hash;
  - a suppressed memory never returns from search;
  - re-adding the same text after a forget is silently skipped (no resurrection
    via re-extraction);
  - hard delete purges the row;
  - per-memory privacy keeps ``private``/``local_only`` content out of
    cloud-bound search.

Uses a real ``TieredMemoryManager`` over a temp-file DB with a deterministic
fake embedding provider (no model download) and the real sqlite-vec extension.
"""
from __future__ import annotations

import hashlib
import sqlite3
import struct

import pytest

from backend.memory.tiered_memory import TieredMemoryManager, _text_hash


class _FakeProvider:
    """Deterministic embedding provider — identical text → identical vector."""

    dimension = 8

    def embed(self, text: str) -> list[float]:
        norm = " ".join((text or "").lower().split())
        digest = hashlib.sha256(norm.encode()).digest()
        # 8 floats in [0,1) derived from the digest bytes; identical text →
        # identical vector → distance 0 on exact-match queries.
        return [b / 255.0 for b in digest[: self.dimension]]

    def embed_batch(self, texts: list[str]) -> list[list[float]]:
        return [self.embed(t) for t in texts]


_MEMORIES_DDL = """
CREATE TABLE memories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    character_id INTEGER NOT NULL,
    session_id INTEGER,
    role TEXT NOT NULL DEFAULT 'user',
    text TEXT NOT NULL,
    tier INTEGER NOT NULL DEFAULT 1,
    salience REAL NOT NULL DEFAULT 0.5,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    promoted_at TEXT,
    embedding_model TEXT DEFAULT 'fake',
    importance REAL DEFAULT 0.5,
    recall_count INTEGER DEFAULT 0,
    last_recalled_at TEXT DEFAULT NULL,
    decay_score REAL DEFAULT 1.0,
    status TEXT DEFAULT 'active',
    privacy_level TEXT DEFAULT 'normal'
)
"""

_SUPPRESSIONS_DDL = """
CREATE TABLE memory_suppressions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    char_id INTEGER NOT NULL,
    text_hash TEXT NOT NULL,
    reason TEXT NOT NULL DEFAULT 'user_forget',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(char_id, text_hash)
)
"""


@pytest.fixture()
def mgr(tmp_path):
    db_path = tmp_path / "mem.db"
    con = sqlite3.connect(str(db_path))
    con.execute(_MEMORIES_DDL)
    con.execute(_SUPPRESSIONS_DDL)
    con.commit()
    con.close()
    m = TieredMemoryManager(str(db_path), str(tmp_path), embedding_provider=_FakeProvider())
    m.init()  # creates memories_vec via the real sqlite-vec extension
    # Skip the whole module if sqlite-vec is unavailable in this environment.
    probe = sqlite3.connect(str(db_path))
    try:
        has_vec = probe.execute(
            "SELECT name FROM sqlite_master WHERE name='memories_vec'"
        ).fetchone()
    finally:
        probe.close()
    if not has_vec:
        pytest.skip("sqlite-vec extension unavailable")
    return m


def _status_of(mgr, mem_id):
    con = sqlite3.connect(mgr.db_path)
    try:
        row = con.execute("SELECT status FROM memories WHERE id=?", (int(mem_id),)).fetchone()
        return row[0] if row else None
    finally:
        con.close()


# --- pure helper -----------------------------------------------------------


def test_text_hash_normalises_case_and_whitespace():
    assert _text_hash("I  LOVE   Ramen") == _text_hash("i love ramen")
    assert _text_hash("a") != _text_hash("b")


# --- soft delete + no resurrection -----------------------------------------


def test_soft_delete_suppresses_and_hides_from_search(mgr):
    mid = mgr.add(1, 1, "user", "I love ramen")
    assert mid is not None
    assert mgr.search("I love ramen", char_id=1)  # found while active

    assert mgr.delete_memory(str(mid)) is True
    assert _status_of(mgr, mid) == "suppressed"
    # No longer returned by search.
    assert mgr.search("I love ramen", char_id=1) == []
    # Suppression hash recorded.
    con = sqlite3.connect(mgr.db_path)
    try:
        n = con.execute("SELECT COUNT(*) FROM memory_suppressions WHERE char_id=1").fetchone()[0]
    finally:
        con.close()
    assert n == 1


def test_forgotten_text_cannot_be_readded(mgr):
    mid = mgr.add(1, 1, "user", "my dog is named Pixel")
    mgr.delete_memory(str(mid))
    # Re-extraction tries to store the same fact — must be skipped.
    again = mgr.add(1, 1, "user", "my dog is named Pixel")
    assert again is None
    assert mgr.search("my dog is named Pixel", char_id=1) == []


def test_suppression_is_per_character(mgr):
    mid = mgr.add(1, 1, "user", "shared phrase")
    mgr.delete_memory(str(mid))
    # A different character may still store the same text.
    other = mgr.add(1, 2, "user", "shared phrase")
    assert other is not None


def test_hard_delete_purges_row(mgr):
    mid = mgr.add(1, 1, "user", "purge me")
    assert mgr.delete_memory(str(mid), hard=True) is True
    con = sqlite3.connect(mgr.db_path)
    try:
        row = con.execute("SELECT 1 FROM memories WHERE id=?", (int(mid),)).fetchone()
    finally:
        con.close()
    assert row is None


# --- privacy ----------------------------------------------------------------


def test_set_privacy_rejects_invalid_level(mgr):
    mid = mgr.add(1, 1, "user", "secret")
    assert mgr.set_privacy(str(mid), "bogus") is False


def test_private_memory_excluded_from_cloud_search(mgr):
    mid = mgr.add(1, 1, "user", "my bank PIN ritual")
    assert mgr.set_privacy(str(mid), "local_only") is True
    # Local search still sees it.
    assert mgr.search("my bank PIN ritual", char_id=1)
    # Cloud-bound search must not.
    assert mgr.search("my bank PIN ritual", char_id=1, cloud_eligible=True) == []


def test_normal_memory_allowed_in_cloud_search(mgr):
    mgr.add(1, 1, "user", "I like hiking on weekends")
    assert mgr.search("I like hiking on weekends", char_id=1, cloud_eligible=True)
