"""Tiered Episodic Memory Manager — Feature A3.

Architecture:
    Three-tier memory system backed by SQLite + sqlite-vec for vector similarity.
    Replaces the ChromaDB VectorStore for new conversation memory while keeping
    the ChromaDB ``docs_collection`` for character knowledge base documents
    (unchanged — the VectorStore class still handles those).

    Embedding is performed via an :class:`~backend.embeddings.provider.EmbeddingProvider`
    instance, which is injected at construction time.  The default provider is
    :class:`~backend.embeddings.provider.MiniLMProvider` (all-MiniLM-L6-v2, 384-dim),
    preserving identical behaviour to the original implementation when no provider
    is supplied.  Pass a different provider (e.g. ``GemmaEmbeddingProvider``) to
    swap models without changing any other code.

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

    # Custom provider:
    from backend.embeddings.provider import GemmaEmbeddingProvider
    provider = GemmaEmbeddingProvider()
    mgr = TieredMemoryManager(db_path, storage_path, embedding_provider=provider)
"""

from __future__ import annotations

import hashlib
import logging
import sqlite3
import struct
import time
from pathlib import Path
from typing import Any

from backend.embeddings.provider import EmbeddingProvider, MiniLMProvider

logger = logging.getLogger(__name__)

# Tier constants
TIER_FLEETING = 1
TIER_RECENT = 2
TIER_PERMANENT = 3

# Top-K per tier during search
_TOP_K_T1 = 3
_TOP_K_T2 = 4
_TOP_K_T3 = 2


def _text_hash(text: str) -> str:
    """Stable content hash for memory suppression (schema v88).

    Normalises whitespace and case so trivially-different re-extractions of the
    same fact collapse to one suppression entry — the mechanism that stops a
    forgotten memory from resurrecting via re-extraction or summary.

    Args:
        text: The memory text.

    Returns:
        A hex SHA-256 digest of the normalised text.
    """
    normalised = " ".join((text or "").lower().split())
    return hashlib.sha256(normalised.encode("utf-8")).hexdigest()


def _is_suppressed(con: sqlite3.Connection, char_id: int, text: str) -> bool:
    """Return True if this memory text has been forgotten for this character."""
    try:
        row = con.execute(
            "SELECT 1 FROM memory_suppressions WHERE char_id = ? AND text_hash = ?",
            (char_id, _text_hash(text)),
        ).fetchone()
        return row is not None
    except sqlite3.OperationalError:
        # Table absent (pre-v88 DB) — nothing is suppressed.
        return False


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

    Embedding is handled by the injected ``embedding_provider``.  When no
    provider is supplied, a :class:`~backend.embeddings.provider.MiniLMProvider`
    is created automatically, preserving full backward compatibility.

    Args:
        db_path: Path to the SQLite database file (the main app.db).
        storage_path: Base path for optional cache files (unused currently).
        decay_mode: "off" | "keep" | "prune" — controls memory lifecycle.
        top_k: Default number of results to return from ``search``.
        salience_threshold: Minimum salience to retain on decay pass.
        embedding_provider: Provider used to embed memory text.  Defaults to
            ``MiniLMProvider()`` (all-MiniLM-L6-v2, 384-dim).

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
        *,
        embedding_provider: EmbeddingProvider | None = None,
    ):
        self.db_path = str(db_path)
        self.decay_mode = decay_mode
        self.top_k = top_k
        self.salience_threshold = salience_threshold
        self._provider: EmbeddingProvider = (
            embedding_provider if embedding_provider is not None else MiniLMProvider()
        )

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
            dim = self._provider.dimension
            con.execute(f"""
                CREATE VIRTUAL TABLE IF NOT EXISTS memories_vec
                USING vec0(
                    memory_id INTEGER PRIMARY KEY,
                    embedding FLOAT[{dim}]
                )
            """)
            con.commit()
            logger.info("[TieredMemory] sqlite-vec table ready (dim=%d)", dim)
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
            con = self._conn()
            self._load_vec_ext(con)
            try:
                # v88: a forgotten memory must not resurrect via re-extraction.
                if _is_suppressed(con, char_id, text):
                    logger.debug("[TieredMemory] add skipped — text is suppressed")
                    return None
                embedding = self._embed(text)
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
        cloud_eligible: bool = False,
    ) -> list[dict[str, Any]]:
        """Semantic similarity search over stored memories.

        Queries memories_vec for nearest neighbours then joins with the
        memories table for full row data. Applies per-tier K limits so
        permanent memories don't crowd out recent ones.

        Only ``status='active'`` memories are returned — soft-deleted /
        suppressed / corrected rows (schema v88) are excluded so a forgotten
        memory never resurfaces.

        Args:
            query: Natural-language query to embed and search against.
            char_id: Optional character filter.
            top_k: Override default top-k. Uses ``self.top_k`` if None.
            tier_filter: Only return memories from this tier.
            cloud_eligible: When True, also exclude privacy-restricted memories
                (``private`` / ``local_only`` / ``do_not_store``) so private
                content never enters a prompt bound for a cloud provider.

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
                        m.created_at,
                        COALESCE(m.status, 'active'),
                        COALESCE(m.privacy_level, 'normal')
                    FROM memories_vec v
                    JOIN memories m ON m.id = v.memory_id
                    WHERE v.embedding MATCH ?
                      AND k = ?
                    """,
                    (packed, knn_limit),
                ).fetchall()

                results = []
                for row in rows:
                    (mem_id, dist, text, role, tier, salience, sess_id, cid,
                     created_at, status, privacy_level) = row
                    if char_id is not None and cid != char_id:
                        continue
                    if tier_filter is not None and tier != tier_filter:
                        continue
                    # v88: never surface soft-deleted / suppressed / corrected memories.
                    if status != "active":
                        continue
                    # v88: keep private memories out of cloud-bound prompts.
                    if cloud_eligible and privacy_level in (
                        "private", "local_only", "do_not_store"
                    ):
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
                        "status": status,
                        "privacy_level": privacy_level,
                        # legacy compat fields
                        "timestamp": None,
                    })

                # AIE B2: Apply Ebbinghaus decay re-ranking
                results = _apply_decay_reranking(results, con)

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

    def delete_memory(
        self,
        memory_id: str,
        *,
        hard: bool = False,
        reason: str = "user_forget",
    ) -> bool:
        """Forget a memory by ID.

        Default (``hard=False``) is a *soft* delete — the trust-spine behaviour
        (schema v88): the row's ``status`` is set to ``'suppressed'`` and a
        content hash is recorded in ``memory_suppressions`` so the same memory
        can never resurface via re-extraction or summary.  The vector row is
        removed so it stops matching KNN queries.

        ``hard=True`` permanently deletes the row (admin / GDPR-style purge).

        Args:
            memory_id: String or int primary key.
            hard: When True, permanently delete instead of suppressing.
            reason: Audit reason recorded on the suppression row.

        Returns:
            True on success, False on error.

        Example:
            >>> mgr.delete_memory("42")              # soft — she forgets it
            True
            >>> mgr.delete_memory("42", hard=True)   # purge the row entirely
            True
        """
        try:
            mid = int(memory_id)
            con = self._conn()
            self._load_vec_ext(con)
            try:
                row = con.execute(
                    "SELECT character_id, text FROM memories WHERE id = ?", (mid,)
                ).fetchone()
                if row is None:
                    return False
                cid, text = int(row[0]), str(row[1])

                if hard:
                    # Even a hard purge records the suppression hash, so a later
                    # re-extraction/summary cannot resurrect the forgotten text.
                    con.execute(
                        "INSERT OR IGNORE INTO memory_suppressions "
                        "(char_id, text_hash, reason) VALUES (?, ?, ?)",
                        (cid, _text_hash(text), reason),
                    )
                    con.execute("DELETE FROM memories WHERE id = ?", (mid,))
                    con.execute("DELETE FROM memories_vec WHERE memory_id = ?", (mid,))
                    con.commit()
                    return True
                con.execute(
                    "UPDATE memories SET status = 'suppressed' WHERE id = ?", (mid,)
                )
                # Drop the vector so it stops matching KNN immediately.
                con.execute("DELETE FROM memories_vec WHERE memory_id = ?", (mid,))
                con.execute(
                    "INSERT OR IGNORE INTO memory_suppressions "
                    "(char_id, text_hash, reason) VALUES (?, ?, ?)",
                    (cid, _text_hash(text), reason),
                )
                con.commit()
                return True
            finally:
                con.close()
        except Exception as e:
            logger.warning("[TieredMemory] delete_memory failed: %s", e)
            return False

    _PRIVACY_LEVELS = ("normal", "private", "local_only", "do_not_store")

    def set_privacy(self, memory_id: str, level: str) -> bool:
        """Set a memory's privacy level (schema v88).

        ``private`` / ``local_only`` / ``do_not_store`` memories are excluded
        from cloud-bound prompts (see :meth:`search` ``cloud_eligible``).

        Args:
            memory_id: String or int primary key.
            level: One of ``normal | private | local_only | do_not_store``.

        Returns:
            True on success, False on invalid level or error.
        """
        if level not in self._PRIVACY_LEVELS:
            logger.warning("[TieredMemory] invalid privacy level: %s", level)
            return False
        try:
            mid = int(memory_id)
            con = self._conn()
            try:
                con.execute(
                    "UPDATE memories SET privacy_level = ? WHERE id = ?", (level, mid)
                )
                con.commit()
                return True
            finally:
                con.close()
        except Exception as e:
            logger.warning("[TieredMemory] set_privacy failed: %s", e)
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
        """Embed text using the configured provider.

        Delegates entirely to :attr:`_provider`, which handles lazy model
        loading and any fallback logic internally.

        Args:
            text: Text to embed.

        Returns:
            Float list with length equal to ``self._provider.dimension``.
        """
        return self._provider.embed(text)

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

def _apply_decay_reranking(
    results: list[dict], con: sqlite3.Connection,
) -> list[dict]:
    """Re-rank search results using Ebbinghaus retention scoring.

    Blends vector similarity (60%) with memory retention (40%) to produce
    a composite ranking.  Older, unreinforced memories naturally fade,
    while frequently recalled memories stay prominent.

    Also calls ``reinforce_memory`` for each result so that retrieved
    memories resist future decay.

    Args:
        results: Memory dicts with ``id``, ``dist``, ``created_at`` keys.
        con: Open SQLite connection for decay column reads.

    Returns:
        Same list with ``dist`` values adjusted by retention.
    """
    try:
        from backend.memory.decay import compute_retention, reinforce_memory

        now = time.time()
        for mem in results:
            mid = int(mem["id"])
            # Read decay columns (v66+)
            try:
                row = con.execute(
                    "SELECT importance, recall_count, created_at "
                    "FROM memories WHERE id = ?",
                    (mid,),
                ).fetchone()
                if row:
                    importance = row[0] if row[0] is not None else 0.5
                    recall_count = row[1] if row[1] is not None else 0
                    created_str = row[2]
                    # Parse created_at to compute days elapsed
                    days = 0.0
                    if created_str:
                        try:
                            from datetime import datetime
                            dt = datetime.fromisoformat(created_str)
                            days = (now - dt.timestamp()) / 86400.0
                        except Exception:
                            days = 1.0
                    retention = compute_retention(importance, days, recall_count)
                    # Blend: similarity score (60%) + retention (40%)
                    # Lower dist = better, so we subtract retention bonus
                    similarity = max(0.0, 1.0 - mem["dist"])
                    blended = similarity * 0.6 + retention * 0.4
                    mem["dist"] = max(0.0, 1.0 - blended)
                    mem["distance"] = mem["dist"]
                    mem["retention"] = retention

                    # Reinforce: this memory was retrieved
                    reinforce_memory(mid, con)
            except sqlite3.OperationalError:
                pass  # Decay columns not yet available (pre-v66)
    except ImportError:
        pass  # decay module not available

    return results


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
