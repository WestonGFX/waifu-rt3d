"""
LoreMatcher -- keyword-triggered lore entry lookup.

Given a block of recent conversation text, returns all enabled lore entries
whose keywords appear (case-insensitive substring match) in that text,
sorted by priority descending.
"""
import json
import sqlite3
from dataclasses import dataclass


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
