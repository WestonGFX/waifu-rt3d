"""
LoreMatcher -- keyword-triggered and semantic lore entry lookup.

Given a block of recent conversation text, returns all enabled lore entries
whose keywords appear (case-insensitive substring match) in that text, or
whose pre-embedded content is semantically similar to the text.  A hybrid
mode combines both strategies for best recall.

Functions:
    match_lore            -- keyword-only matching (original)
    match_lore_semantic   -- embedding cosine-similarity matching
    match_lore_hybrid     -- keyword + semantic, merged and deduplicated
    embed_lore_entries    -- pre-embed all entries for a character
"""
import json
import logging
import sqlite3
import struct
from dataclasses import dataclass

from backend.embeddings.provider import EmbeddingProvider

logger = logging.getLogger(__name__)


@dataclass
class LoreEntry:
    """A single lore entry as loaded from the database.

    Attributes:
        id: Primary key in the lore_entries table.
        character_id: FK to the owning character.
        title: Short descriptive title for the entry.
        content: The lore text injected into the LLM context.
        keywords: List of trigger keywords (case-insensitive substring match).
        injection_position: Where in the message list to inject this entry.
        priority: Higher priority entries are injected first.
        enabled: Whether this entry is active.
    """
    id: int
    character_id: int
    title: str
    content: str
    keywords: list[str]
    injection_position: str
    priority: int
    enabled: bool


def _load_entries(conn: sqlite3.Connection, char_id: int) -> list[LoreEntry]:
    """Load all enabled lore entries for a character, ordered by priority.

    Args:
        conn: Active SQLite connection.
        char_id: Character whose lore entries to load.

    Returns:
        List of LoreEntry objects for enabled entries, sorted by priority DESC.
    """
    rows = conn.execute(
        "SELECT id, character_id, title, content, keywords, injection_position, priority, enabled "
        "FROM lore_entries WHERE character_id = ? AND enabled = 1 ORDER BY priority DESC",
        (char_id,)
    ).fetchall()
    entries = []
    for row in rows:
        try:
            kws = json.loads(row[4]) if row[4] else []
        except (json.JSONDecodeError, TypeError):
            kws = []
        entries.append(LoreEntry(
            id=row[0], character_id=row[1], title=row[2], content=row[3],
            keywords=kws, injection_position=row[5], priority=row[6], enabled=bool(row[7])
        ))
    return entries


def match_lore(
    conn: sqlite3.Connection,
    char_id: int,
    text: str,
    max_entries: int = 8,
) -> list[LoreEntry]:
    """Return enabled lore entries whose keywords appear in ``text``.

    Scans all enabled lore entries for the given character and checks whether
    any of their keywords appear as case-insensitive substrings in the
    provided text.  Results are pre-sorted by priority (from the DB query)
    and deduplicated.

    Args:
        conn: Active SQLite connection.
        char_id: Character whose lore entries to search.
        text: Recent conversation text to scan for keyword matches.
        max_entries: Maximum number of matching entries to return.

    Returns:
        List of matching LoreEntry objects sorted by priority descending,
        deduplicated, capped at max_entries.

    Example:
        >>> matches = match_lore(conn, char_id=3, text="Akira said hello")
        >>> [e.title for e in matches]
        ['Akira (childhood friend)']
    """
    entries = _load_entries(conn, char_id)
    lower_text = text.lower()
    seen_ids: set[int] = set()
    matched: list[LoreEntry] = []
    for entry in entries:
        if entry.id in seen_ids:
            continue
        for kw in entry.keywords:
            if kw and kw.lower() in lower_text:
                matched.append(entry)
                seen_ids.add(entry.id)
                break
    return matched[:max_entries]


# ---------------------------------------------------------------------------
# Vector packing helpers
# ---------------------------------------------------------------------------


def _pack_vec(vec: list[float]) -> bytes:
    """Serialise a float list to packed IEEE-754 bytes for BLOB storage.

    Uses 32-bit (single-precision) floats matching the format written by
    ``tiered_memory.py`` and expected by ``_unpack_vec``.

    Args:
        vec: Embedding vector as a list of Python floats.

    Returns:
        Raw bytes of length ``len(vec) * 4``.

    Example:
        >>> blob = _pack_vec([0.1, 0.2, 0.3])
        >>> len(blob)
        12
    """
    return struct.pack(f"{len(vec)}f", *vec)


def _unpack_vec(blob: bytes) -> list[float]:
    """Deserialise packed IEEE-754 bytes back to a float list.

    Inverse of :func:`_pack_vec`.

    Args:
        blob: Raw bytes produced by ``_pack_vec``.

    Returns:
        List of floats with length ``len(blob) // 4``.

    Example:
        >>> vec = _unpack_vec(_pack_vec([0.5, -0.5]))
        >>> len(vec)
        2
    """
    n = len(blob) // 4
    return list(struct.unpack(f"{n}f", blob))


# ---------------------------------------------------------------------------
# Semantic matching
# ---------------------------------------------------------------------------


def match_lore_semantic(
    conn: sqlite3.Connection,
    char_id: int,
    text: str,
    provider: EmbeddingProvider,
    *,
    threshold: float = 0.65,
    max_entries: int = 8,
) -> list[LoreEntry]:
    """Return lore entries semantically similar to ``text`` using embeddings.

    Embeds ``text`` with ``provider``, then compares against pre-computed
    embeddings stored in the ``lore_embeddings`` table.  Entries are ranked
    by cosine similarity and filtered by ``threshold``.

    The ``lore_embeddings`` table is created by the v57 DB migration in
    ``preflight.py``.  If it does not exist yet this function returns an
    empty list rather than raising an error, allowing the application to
    degrade gracefully before the migration runs.

    Args:
        conn: Active SQLite connection.
        char_id: Character whose lore entries to search.
        text: Conversation text to compare against lore content.
        provider: Embedding provider used to encode ``text``.
        threshold: Minimum cosine similarity for a match (0–1).  Default
            ``0.65`` keeps moderately-related entries while filtering noise.
        max_entries: Maximum number of entries to return.

    Returns:
        List of matching :class:`LoreEntry` objects sorted by cosine
        similarity descending, capped at ``max_entries``.

    Example:
        >>> from backend.embeddings.provider import get_provider
        >>> provider = get_provider("minilm")
        >>> matches = match_lore_semantic(conn, char_id=1, text="What is the Sakura shrine?", provider=provider)
        >>> [e.title for e in matches]
        ['Sakura Shrine']
    """
    # Embed the query text.
    query_vec = provider.embed(text)

    # Load all enabled lore entries for this character (id → entry map).
    entries = _load_entries(conn, char_id)
    entry_map: dict[int, LoreEntry] = {e.id: e for e in entries}
    if not entry_map:
        return []

    # Fetch pre-computed embeddings from the lore_embeddings table.
    try:
        rows = conn.execute(
            "SELECT lore_entry_id, embedding FROM lore_embeddings "
            "WHERE lore_entry_id IN (%s)" % ",".join("?" * len(entry_map)),
            list(entry_map.keys()),
        ).fetchall()
    except sqlite3.OperationalError as exc:
        # Table hasn't been created yet (migration not run).
        logger.debug("[match_lore_semantic] lore_embeddings table unavailable: %s", exc)
        return []

    # Score each entry by cosine similarity.
    scored: list[tuple[float, LoreEntry]] = []
    for lore_entry_id, blob in rows:
        if lore_entry_id not in entry_map:
            continue
        try:
            stored_vec = _unpack_vec(blob)
        except Exception:
            continue
        sim = provider.cosine_similarity(query_vec, stored_vec)
        if sim >= threshold:
            scored.append((sim, entry_map[lore_entry_id]))

    # Sort descending by similarity and return the top results.
    scored.sort(key=lambda t: t[0], reverse=True)
    return [entry for _, entry in scored[:max_entries]]


# ---------------------------------------------------------------------------
# Hybrid matching
# ---------------------------------------------------------------------------


def match_lore_hybrid(
    conn: sqlite3.Connection,
    char_id: int,
    text: str,
    provider: EmbeddingProvider | None = None,
    *,
    max_entries: int = 8,
) -> list[LoreEntry]:
    """Combine keyword and semantic lore matching for maximum recall.

    Runs :func:`match_lore` (keyword) first, then :func:`match_lore_semantic`
    (embedding) when a ``provider`` is supplied.  Keyword matches are
    prioritised — semantic-only matches are appended afterwards.  Results are
    deduplicated by entry ID and capped at ``max_entries``.

    When ``provider`` is ``None`` the function degrades gracefully to
    keyword-only matching, making it safe to call unconditionally regardless
    of whether the embedding subsystem is available.

    Args:
        conn: Active SQLite connection.
        char_id: Character whose lore entries to search.
        text: Recent conversation text to scan.
        provider: Embedding provider for semantic matching.  Pass ``None``
            to use keyword-only matching.
        max_entries: Maximum number of entries to return.

    Returns:
        Merged, deduplicated list of matching :class:`LoreEntry` objects,
        keyword matches first, capped at ``max_entries``.

    Example:
        >>> from backend.embeddings.provider import get_provider
        >>> provider = get_provider("minilm")
        >>> results = match_lore_hybrid(conn, char_id=1, text="shrine festival", provider=provider)
        >>> len(results) <= 8
        True
    """
    keyword_matches = match_lore(conn, char_id, text, max_entries=max_entries)

    if provider is None:
        return keyword_matches

    semantic_matches = match_lore_semantic(
        conn, char_id, text, provider, max_entries=max_entries
    )

    # Merge: keyword matches first, then any semantic-only additions.
    seen_ids: set[int] = {e.id for e in keyword_matches}
    merged = list(keyword_matches)
    for entry in semantic_matches:
        if entry.id not in seen_ids:
            merged.append(entry)
            seen_ids.add(entry.id)
        if len(merged) >= max_entries:
            break

    return merged


# ---------------------------------------------------------------------------
# Embedding helper
# ---------------------------------------------------------------------------


def embed_lore_entries(
    conn: sqlite3.Connection,
    char_id: int,
    provider: EmbeddingProvider,
) -> int:
    """Pre-embed all enabled lore entries for a character and persist them.

    Embeds the concatenation of each entry's ``title`` and ``content``
    (``"<title>\\n<content>"``) using ``provider`` and stores the result in
    the ``lore_embeddings`` table.  Uses ``INSERT OR REPLACE`` so calling
    this again after editing entries will refresh stale embeddings.

    The ``lore_embeddings`` table must already exist (created by the v57
    migration in ``preflight.py``).

    Args:
        conn: Active SQLite connection (must be writable).
        char_id: Character whose lore entries to embed.
        provider: Embedding provider to use for encoding.

    Returns:
        Number of entries successfully embedded and stored.

    Raises:
        sqlite3.OperationalError: If the ``lore_embeddings`` table does not
            exist (migration not yet applied).

    Example:
        >>> from backend.embeddings.provider import get_provider
        >>> provider = get_provider("minilm")
        >>> count = embed_lore_entries(conn, char_id=1, provider=provider)
        >>> print(f"Embedded {count} entries")
        Embedded 4 entries
    """
    entries = _load_entries(conn, char_id)
    if not entries:
        return 0

    # Build texts as "title\ncontent" to give the embedding model both the
    # heading and the full body, improving retrieval precision.
    texts = [f"{e.title}\n{e.content}" for e in entries]
    vectors = provider.embed_batch(texts)

    model_name = provider.model_name
    count = 0
    for entry, vec in zip(entries, vectors):
        blob = _pack_vec(vec)
        conn.execute(
            "INSERT OR REPLACE INTO lore_embeddings "
            "(lore_entry_id, embedding, model, updated_at) "
            "VALUES (?, ?, ?, datetime('now'))",
            (entry.id, blob, model_name),
        )
        count += 1

    conn.commit()
    logger.info(
        "[embed_lore_entries] Embedded %d lore entries for char_id=%d using %s",
        count,
        char_id,
        model_name,
    )
    return count
