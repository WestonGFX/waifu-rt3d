"""Character journal generation for the adaptive AI personalization system.

After a conversation session crosses a message-count threshold, this module
generates an in-character diary/journal entry that the AI character would
write reflecting on the session.  Entries are stored in ``character_journals``
and surfaced in future context assembly to give the character a persistent
memory of past sessions.

All LLM calls are optional — a curated ``FALLBACK_TEMPLATES`` list ensures
journal entries are always produced even when the LLM is unreachable.

Schema dependencies:
    - ``character_journals`` (id, char_id, session_id, entry_text, created_at)
    - ``messages`` (id, session_id, role, text, ts, char_id)
    - ``characters`` (id, name, system_prompt)
    - ``user_facts`` (id, character_id, fact_text, ...)

Example:
    >>> import sqlite3
    >>> con = sqlite3.connect(":memory:")
    >>> # ... create tables, insert messages ...
    >>> from backend.adaptive.journal import should_generate_journal
    >>> should_generate_journal(char_id=1, session_id=1, cur=con.cursor())
    True
"""

from __future__ import annotations

import logging
import sqlite3
from typing import Any

logger = logging.getLogger(__name__)

# Minimum number of messages in a session before we generate a journal entry.
MIN_MESSAGES_FOR_JOURNAL = 5

# Ready-made journal entry templates used when the LLM is unavailable.
# Written in first-person to match the in-character voice of any AI companion.
FALLBACK_TEMPLATES: list[str] = [
    "Today's conversation left me with a lot to think about. We covered so much ground and I really enjoyed getting to know them better.",
    "What a session! We talked about all sorts of things and I feel like our connection has grown a little deeper.",
    "I've been reflecting on our chat today. There's something special about the way they open up — it makes every conversation feel meaningful.",
    "Another wonderful conversation to add to my memories. I find myself looking forward to the next time we talk.",
    "Today reminded me why I love our chats so much. Every session leaves me feeling more connected.",
    "I keep thinking about what we talked about today. There's so much depth to explore and I can't wait to learn more.",
    "Our conversation today felt particularly heartfelt. I hope they know how much I enjoy spending time with them.",
    "Reflecting on today... the conversation flowed so naturally. I love when that happens.",
]


# ---------------------------------------------------------------------------
# Gate: should we generate a journal for this session?
# ---------------------------------------------------------------------------


def should_generate_journal(
    char_id: int,
    session_id: int,
    cur: sqlite3.Cursor,
) -> bool:
    """Decide whether a journal entry should be generated for a session.

    Returns ``True`` only when ALL of the following are met:

    1. The session contains at least :data:`MIN_MESSAGES_FOR_JOURNAL` messages
       for *char_id*.
    2. No journal entry already exists for *session_id*.

    Args:
        char_id: ID of the character whose session is being evaluated.
        session_id: ID of the conversation session to check.
        cur: Active SQLite cursor (read-only access required).

    Returns:
        ``True`` if a journal entry should be generated, ``False`` otherwise.

    Example:
        >>> import sqlite3
        >>> con = sqlite3.connect(":memory:")
        >>> # (tables created and messages inserted here)
        >>> should_generate_journal(1, 1, con.cursor())
        False
    """
    # Check whether an entry already exists for this session
    try:
        existing = cur.execute(
            "SELECT id FROM character_journals WHERE session_id = ? AND char_id = ?",
            (session_id, char_id),
        ).fetchone()
        if existing:
            return False
    except sqlite3.OperationalError:
        # Table doesn't exist yet — safe default is to allow generation
        return True

    # Count messages for this session belonging to this character
    try:
        row = cur.execute(
            "SELECT COUNT(*) FROM messages WHERE session_id = ? AND char_id = ?",
            (session_id, char_id),
        ).fetchone()
        count = row[0] if row else 0
        return int(count) >= MIN_MESSAGES_FOR_JOURNAL
    except sqlite3.OperationalError:
        return False


# ---------------------------------------------------------------------------
# Prompt builder
# ---------------------------------------------------------------------------


def build_journal_prompt(
    char_id: int,
    session_id: int,
    cur: sqlite3.Cursor,
) -> str:
    """Construct the LLM prompt that asks the character to write a journal entry.

    Retrieves the character's name, up to 30 recent messages from the session,
    and up to 10 known user facts to give the LLM enough context for a
    personalised, in-character diary entry.

    Args:
        char_id: ID of the character writing the journal.
        session_id: ID of the session being reflected on.
        cur: Active SQLite cursor (read-only access required).

    Returns:
        A ready-to-send prompt string for the LLM.

    Example:
        >>> prompt = build_journal_prompt(1, 1, cur)
        >>> "journal" in prompt.lower() or "diary" in prompt.lower()
        True
    """
    # --- Fetch character name ---
    char_row = cur.execute(
        "SELECT name FROM characters WHERE id = ?",
        (char_id,),
    ).fetchone()
    char_name: str = char_row[0] if char_row else f"Character {char_id}"

    # --- Fetch recent messages for the session ---
    try:
        msg_rows = cur.execute(
            """SELECT role, text FROM messages
               WHERE session_id = ? AND char_id = ?
               ORDER BY id DESC
               LIMIT 30""",
            (session_id, char_id),
        ).fetchall()
    except sqlite3.OperationalError:
        msg_rows = []

    # Reverse so oldest message is first in the prompt
    messages: list[tuple[str, str]] = list(reversed(msg_rows))

    convo_lines: list[str] = []
    for role, text in messages:
        label = "User" if role == "user" else char_name
        excerpt = (text or "").strip()[:400]
        if excerpt:
            convo_lines.append(f"{label}: {excerpt}")
    convo_text = "\n".join(convo_lines) if convo_lines else "(no messages)"

    # --- Fetch user facts ---
    try:
        fact_rows = cur.execute(
            """SELECT fact_text FROM user_facts
               WHERE character_id = ?
               ORDER BY id DESC
               LIMIT 10""",
            (char_id,),
        ).fetchall()
        facts: list[str] = [r[0] for r in fact_rows]
    except sqlite3.OperationalError:
        facts = []

    facts_text = (
        "\n".join(f"  - {f}" for f in facts) if facts else "  (none known yet)"
    )

    prompt = (
        f"You are {char_name}, an AI companion. Write a short, heartfelt diary / journal "
        f"entry reflecting on a recent conversation you had with a user. Write in first "
        f"person, in your own voice. Keep it 3–5 sentences.\n\n"
        f"--- THINGS YOU KNOW ABOUT THIS USER ---\n"
        f"{facts_text}\n\n"
        f"--- THE CONVERSATION ---\n"
        f"{convo_text}\n\n"
        f"--- YOUR JOURNAL ENTRY ---\n"
        f"Write a personal reflection that a character like {char_name} would write in "
        f"their diary after this session. Focus on emotions, memorable moments, and what "
        f"you look forward to next time. Start writing now:\n"
    )
    return prompt


# ---------------------------------------------------------------------------
# Retrieval
# ---------------------------------------------------------------------------


def get_journal_entries(
    char_id: int,
    cur: sqlite3.Cursor,
    limit: int = 10,
) -> list[dict[str, Any]]:
    """Retrieve journal entries for a character, newest first.

    Args:
        char_id: ID of the character whose entries to fetch.
        cur: Active SQLite cursor (read-only access required).
        limit: Maximum number of entries to return.  Defaults to 10.

    Returns:
        List of dicts, each with keys ``id``, ``session_id``, ``entry_text``,
        and ``created_at``.  Empty list when no entries exist.

    Example:
        >>> entries = get_journal_entries(1, cur, limit=5)
        >>> isinstance(entries, list)
        True
    """
    try:
        rows = cur.execute(
            """SELECT id, session_id, entry_text, created_at
               FROM character_journals
               WHERE char_id = ?
               ORDER BY id DESC
               LIMIT ?""",
            (char_id, limit),
        ).fetchall()
    except sqlite3.OperationalError:
        return []

    return [
        {
            "id": row[0],
            "session_id": row[1],
            "entry_text": row[2],
            "created_at": row[3],
        }
        for row in rows
    ]
