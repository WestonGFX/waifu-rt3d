"""Tiered Episodic Memory Manager — Feature A3.

Architecture:
    Three-tier memory system backed by SQLite + sqlite-vec for vector similarity.
    Replaces the ChromaDB VectorStore for new conversation memory while keeping
    the ChromaDB ``docs_collection`` for character knowledge base documents
    (unchanged — the VectorStore class still handles those).

Tiers:
    Tier 1 — Fleeting: Recent messages from the current session. High recall weight.
    Tier 2 — Recent: Emotionally/factually significant from the last N weeks.
    Tier 3 — Permanent: Core memories — never pruned regardless of decay setting.

Decay modes (config key ``memory.decay_mode``):
    "off"   — nothing ever changes tier; all memories stay at their initial tier.
    "keep"  — old T2 memories demote to T3 (lower weight) but are never deleted.
    "prune" — old T2 memories are eventually removed (default).

Usage::

    mgr = TieredMemoryManager(db_path, storage_path)
    mgr.init()               # creates vec table if needed
    mgr.add(session_id, char_id, "user", "I love ramen")
    results = mgr.search("favourite food", char_id=1, top_k=5)
"""

from __future__ import annotations

import logging
import sqlite3
import struct
import time
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

# Embedding dimension for all-MiniLM-L6-v2
EMBEDDING_DIM = 384

# Tier constants
TIER_FLEETING = 1
TIER_RECENT = 2
TIER_PERMANENT = 3

# Top-K per tier during search
_TOP_K_T1 = 3
_TOP_K_T2 = 4
_TOP_K_T3 = 2


def _pack_vec(floats: list[float]) -> bytes:
    """Serialise a float list to little-endian IEEE-754 bytes for sqlite-vec.

    Args:
        floats: Embedding vector as a list of floats.

    Returns:
        Bytes object suitable for insertion into a vec0 virtual table.
    """
    return struct.pack(f"{len(floats)}f", *floats)


class TieredMemoryManager:
    """sqlite-vec backed tiered memory store.

    Keeps the same ``add_memory`` / ``search_memories`` API surface as the
    legacy ChromaDB ``VectorStore`` so existing call sites can be swapped
    with minimal friction.

    Args:
        db_path: Path to the SQLite database file (the main app.db).
        storage_path: Base path for optional cache files (unused currently).
        decay_mode: "off" | "keep" | "prune" — controls memory lifecycle.
        top_k: Default number of results to return from ``search``.
        salience_threshold: Minimum salience to retain on decay pass.

    Example:
        >>> mgr = TieredMemoryManager("backend/storage/app.db")
        >>> mgr.init()
        >>> mgr.add(1, 1, "user", "My favourite food is ramen")
        42
        >>> results = mgr.search("what do I like to eat?", char_id=1)
        >>> results[0]["text"]
        'My favourite food is ramen'
    """

    def __init__(
        self,
        db_path: str | Path,
        storage_path: str | Path | None = None,
        decay_mode: str = "off",
        top_k: int = 5,
        salience_threshold: float = 0.3,
    ):
        self.db_path = str(db_path)
        self.decay_mode = decay_mode
        self.top_k = top_k
        self.salience_threshold = salience_threshold
        self._model = None  # lazy-loaded SentenceTransformer

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    def init(self) -> None:
        """Load sqlite-vec extension and create ``memories_vec`` if needed.

        Must be called once after construction and before any other method.
        Safe to call multiple times (idempotent).

        Example:
            >>> mgr.init()
        """
        con = self._conn()
        try:
            self._load_vec_ext(con)
            con.execute(f"""
                CREATE VIRTUAL TABLE IF NOT EXISTS memories_vec
                USING vec0(
                    memory_id INTEGER PRIMARY KEY,
                    embedding FLOAT[{EMBEDDING_DIM}]
                )
            """)
            con.commit()
            logger.info("[TieredMemory] sqlite-vec table ready (dim=%d)", EMBEDDING_DIM)
        except Exception as e:
            logger.warning("[TieredMemory] init failed (running without vec support): %s", e)
        finally:
            con.close()

    # ------------------------------------------------------------------
    # Write
    # ------------------------------------------------------------------

    def add(
        self,
        session_id: int | None,
        char_id: int,
        role: str,
        text: str,
        tier: int = TIER_FLEETING,
        salience: float = 0.5,
    ) -> int | None:
        """Embed a message and store it in the memories table + vec index.

        Args:
            session_id: Chat session ID (may be None for manually added facts).
            char_id: Character the memory belongs to.
            role: "user" | "assistant" | "knowledge".
            text: Text to embed and store.
            tier: Initial tier (1=Fleeting, 2=Recent, 3=Permanent).
            salience: Importance weight 0.0–1.0.

        Returns:
            Row ID of the inserted memory, or None on failure.

        Example:
            >>> mgr.add(3, 1, "user", "I love ramen")
            42
        """
        try:
            embedding = self._embed(text)
            con = self._conn()
            self._load_vec_ext(con)
            try:
                cur = con.execute(
                    """
                    INSERT INTO memories
                        (character_id, session_id, role, text, tier, salience)
                    VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    (char_id, session_id, role, text, tier, salience),
                )
                mem_id = cur.lastrowid
                # Store embedding in virtual table
                con.execute(
                    "INSERT OR REPLACE INTO memories_vec (memory_id, embedding) VALUES (?, ?)",
                    (mem_id, _pack_vec(embedding)),
                )
                con.commit()
                return mem_id
            finally:
                con.close()
        except Exception as e:
            logger.warning("[TieredMemory] add failed: %s", e)
            return None

    # Alias matching old VectorStore API
    def add_memory(self, session_id: int, char_id: int, role: str, text: str) -> str | None:
        """Compatibility shim — same signature as the old ChromaDB VectorStore.

        Args:
            session_id: Chat session ID.
            char_id: Character ID.
            role: "user" | "assistant".
            text: Message text.

        Returns:
            String representation of the memory ID, or None.
        """
        mem_id = self.add(session_id, char_id, role, text, tier=TIER_FLEETING)
        return str(mem_id) if mem_id else None

    # ------------------------------------------------------------------
    # Search
    # ------------------------------------------------------------------

    def search(
        self,
        query: str,
        char_id: int | None = None,
        top_k: int | None = None,
        tier_filter: int | None = None,
    ) -> list[dict[str, Any]]:
        """Semantic similarity search over stored memories.

        Queries memories_vec for nearest neighbours then joins with the
        memories table for full row data. Applies per-tier K limits so
        permanent memories don't crowd out recent ones.

        Args:
            query: Natural-language query to embed and search against.
            char_id: Optional character filter.
            top_k: Override default top-k. Uses ``self.top_k`` if None.
            tier_filter: Only return memories from this tier.

        Returns:
            List of memory dicts, sorted by relevance (most relevant first):
            ``{id, text, role, tier, salience, session_id, char_id,
               distance, created_at}``

        Example:
            >>> results = mgr.search("ramen", char_id=1, top_k=3)
            >>> len(results) <= 3
            True
        """
        k = top_k or self.top_k
        try:
            embedding = self._embed(query)
            packed = _pack_vec(embedding)
            con = self._conn()
            self._load_vec_ext(con)
            try:
                # sqlite-vec KNN: top (k*4) candidates, then filter + merge
                knn_limit = k * 4
                rows = con.execute(
                    """
                    SELECT
                        v.memory_id,
                        v.distance,
                        m.text,
                        m.role,
                        m.tier,
                        m.salience,
                        m.session_id,
                        m.character_id,
                        m.created_at
                    FROM memories_vec v
                    JOIN memories m ON m.id = v.memory_id
                    WHERE v.embedding MATCH ?
                      AND k = ?
                    """,
                    (packed, knn_limit),
                ).fetchall()

                results = []
                for row in rows:
                    mem_id, dist, text, role, tier, salience, sess_id, cid, created_at = row
                    if char_id is not None and cid != char_id:
                        continue
                    if tier_filter is not None and tier != tier_filter:
                        continue
                    results.append({
                        "id": str(mem_id),
                        "text": text,
                        "role": role,
                        "tier": tier,
                        "salience": salience,
                        "session_id": sess_id,
                        "char_id": cid,
                        "dist": dist,
                        "distance": dist,
                        "created_at": created_at,
                        # legacy compat fields
                        "timestamp": None,
                    })

                # Apply per-tier limits to prevent old T3 memories dominating
                if not tier_filter:
                    results = _apply_tier_limits(results, k)

                results.sort(key=lambda r: r["dist"])
                return results[:k]
            finally:
                con.close()
        except Exception as e:
            logger.warning("[TieredMemory] search failed: %s", e)
            return []

    # Alias matching old VectorStore API
    def query_memory(
        self,
        text: str,
        n_results: int = 3,
        char_id: int | None = None,
        max_dist: float = 1.0,
    ) -> list[dict]:
        """Compatibility shim — same signature as the old ChromaDB VectorStore.

        Args:
            text: Query text.
            n_results: Maximum results.
            char_id: Optional character filter.
            max_dist: Maximum distance (results with dist > max_dist excluded).

        Returns:
            List of memory dicts compatible with old VectorStore output.
        """
        results = self.search(text, char_id=char_id, top_k=n_results)
        return [r for r in results if r.get("dist", 0) <= max_dist]

    # ------------------------------------------------------------------
    # List / Delete
    # ------------------------------------------------------------------

    def list_memories(
        self,
        char_id: int | None = None,
        page: int = 0,
        size: int = 20,
        tier: int | None = None,
    ) -> dict[str, Any]:
        """List stored memories with pagination and optional tier filter.

        Args:
            char_id: Filter by character.
            page: 0-indexed page number.
            size: Results per page.
            tier: Optional tier filter (1/2/3).

        Returns:
            ``{"memories": [...], "total": int}``

        Example:
            >>> mgr.list_memories(char_id=1, page=0, size=10)
            {'memories': [...], 'total': 5}
        """
        con = self._conn()
        try:
            where_parts = []
            params: list = []
            if char_id is not None:
                where_parts.append("character_id = ?")
                params.append(char_id)
            if tier is not None:
                where_parts.append("tier = ?")
                params.append(tier)
            where = ("WHERE " + " AND ".join(where_parts)) if where_parts else ""

            total = con.execute(
                f"SELECT COUNT(*) FROM memories {where}", params
            ).fetchone()[0]
            rows = con.execute(
                f"""
                SELECT id, text, role, tier, salience, session_id,
                       character_id, created_at, promoted_at
                FROM memories {where}
                ORDER BY created_at DESC
                LIMIT ? OFFSET ?
                """,
                params + [size, page * size],
            ).fetchall()

            memories = [
                {
                    "id": str(r[0]),
                    "text": r[1],
                    "role": r[2],
                    "tier": r[3],
                    "salience": r[4],
                    "session_id": r[5],
                    "char_id": r[6],
                    "created_at": r[7],
                    "promoted_at": r[8],
                    # legacy compat
                    "timestamp": None,
                }
                for r in rows
            ]
            return {"memories": memories, "total": total}
        finally:
            con.close()

    def delete_memory(self, memory_id: str) -> bool:
        """Delete a memory by ID.

        Removes from both ``memories`` and ``memories_vec``.

        Args:
            memory_id: String or int primary key.

        Returns:
            True on success, False on error.

        Example:
            >>> mgr.delete_memory("42")
            True
        """
        try:
            mid = int(memory_id)
            con = self._conn()
            self._load_vec_ext(con)
            try:
                con.execute("DELETE FROM memories WHERE id = ?", (mid,))
                con.execute("DELETE FROM memories_vec WHERE memory_id = ?", (mid,))
                con.commit()
                return True
            finally:
                con.close()
        except Exception as e:
            logger.warning("[TieredMemory] delete_memory failed: %s", e)
            return False

    def promote_to_permanent(self, memory_id: str) -> bool:
        """Promote a memory to Tier 3 (permanent — never pruned).

        Args:
            memory_id: String or int primary key.

        Returns:
            True on success, False on error.

        Example:
            >>> mgr.promote_to_permanent("42")
            True
        """
        try:
            mid = int(memory_id)
            con = self._conn()
            try:
                con.execute(
                    "UPDATE memories SET tier=3, promoted_at=datetime('now') WHERE id=?",
                    (mid,),
                )
                con.commit()
                return True
            finally:
                con.close()
        except Exception as e:
            logger.warning("[TieredMemory] promote_to_permanent failed: %s", e)
            return False

    # ------------------------------------------------------------------
    # Decay pass (call from nightly job or on demand)
    # ------------------------------------------------------------------

    def run_decay(self, weeks_threshold: int = 4) -> int:
        """Demote or prune old Tier-2 memories based on ``decay_mode``.

        In "keep" mode, T2 memories older than ``weeks_threshold`` weeks
        are demoted to T3 (lower retrieval weight). In "prune" mode, they
        are deleted. "off" mode is a no-op.

        Args:
            weeks_threshold: Age in weeks beyond which T2 memories decay.

        Returns:
            Number of memories affected.

        Example:
            >>> mgr.run_decay(weeks_threshold=4)
            17
        """
        if self.decay_mode == "off":
            return 0
        # Use parameterized datetime modifier to avoid SQL injection
        cutoff_modifier = f"-{int(weeks_threshold)} weeks"
        con = self._conn()
        try:
            if self.decay_mode == "prune":
                cur = con.execute(
                    """
                    DELETE FROM memories
                    WHERE tier = 2
                      AND created_at < datetime('now', ?)
                      AND salience < ?
                    """,
                    (cutoff_modifier, self.salience_threshold),
                )
                # Also remove from vec table
                # (CASCADE not available on virtual tables — delete orphans)
                con.execute(
                    """
                    DELETE FROM memories_vec
                    WHERE memory_id NOT IN (SELECT id FROM memories)
                    """
                )
            else:  # keep
                cur = con.execute(
                    """
                    UPDATE memories
                    SET tier = 3, promoted_at = datetime('now')
                    WHERE tier = 2
                      AND created_at < datetime('now', ?)
                      AND salience < ?
                    """,
                    (cutoff_modifier, self.salience_threshold),
                )
            count = cur.rowcount
            con.commit()
            logger.info("[TieredMemory] decay pass: %d memories %s",
                        count, "pruned" if self.decay_mode == "prune" else "demoted to T3")
            return count
        finally:
            con.close()

    # ------------------------------------------------------------------
    # Stub: docs_collection passthrough (still handled by VectorStore)
    # ------------------------------------------------------------------

    def add_doc_chunks(self, *args, **kwargs) -> int:
        """Not implemented — document chunks still use the ChromaDB VectorStore.

        Returns:
            0 (no-op passthrough to avoid AttributeError on call sites).
        """
        logger.debug("[TieredMemory] add_doc_chunks called — delegating to VectorStore")
        return 0

    def query_doc_chunks(self, *args, **kwargs) -> list:
        """Not implemented — document chunks still use the ChromaDB VectorStore.

        Returns:
            Empty list (caller should use VectorStore.query_doc_chunks instead).
        """
        return []

    def delete_doc_chunks(self, *args, **kwargs) -> bool:
        """Not implemented — document chunks still use the ChromaDB VectorStore.

        Returns:
            False.
        """
        return False

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _embed(self, text: str) -> list[float]:
        """Embed ``text`` using all-MiniLM-L6-v2 (lazy-loaded).

        Args:
            text: Text to embed.

        Returns:
            384-dimensional float list.
        """
        if self._model is None:
            from sentence_transformers import SentenceTransformer
            logger.info("[TieredMemory] Loading all-MiniLM-L6-v2...")
            self._model = SentenceTransformer("all-MiniLM-L6-v2")
        return self._model.encode(text).tolist()

    def _conn(self) -> sqlite3.Connection:
        """Open a new SQLite connection to the main app database.

        Returns:
            Open sqlite3.Connection with row_factory set to Row.
        """
        con = sqlite3.connect(self.db_path)
        return con

    @staticmethod
    def _load_vec_ext(con: sqlite3.Connection) -> None:
        """Load the sqlite-vec extension into ``con``.

        Args:
            con: Open SQLite connection.

        Raises:
            Exception: If the sqlite-vec extension cannot be loaded.
        """
        try:
            import sqlite_vec
            con.enable_load_extension(True)
            sqlite_vec.load(con)
            con.enable_load_extension(False)
        except Exception as e:
            raise RuntimeError(f"sqlite-vec load failed: {e}") from e


# ---------------------------------------------------------------------------
# Internal helper
# ---------------------------------------------------------------------------

def _apply_tier_limits(results: list[dict], total_k: int) -> list[dict]:
    """Apply per-tier result quotas to prevent any single tier from dominating.

    Allocates slots as: T1 up to _TOP_K_T1, T2 up to _TOP_K_T2,
    T3 up to _TOP_K_T3. Within each tier, results are already sorted by
    distance (ascending).

    Args:
        results: Unsorted mixed-tier result list.
        total_k: Maximum total results to return.

    Returns:
        Filtered list respecting per-tier limits.
    """
    by_tier: dict[int, list] = {1: [], 2: [], 3: []}
    for r in results:
        tier = r.get("tier", 2)
        by_tier.setdefault(tier, []).append(r)

    # Sort each tier by distance
    for tier_list in by_tier.values():
        tier_list.sort(key=lambda r: r.get("dist", 999))

    limits = {1: _TOP_K_T1, 2: _TOP_K_T2, 3: _TOP_K_T3}
    combined = []
    for tier in (1, 2, 3):
        combined.extend(by_tier.get(tier, [])[:limits[tier]])

    return combined[:total_k]
