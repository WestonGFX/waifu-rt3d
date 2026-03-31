"""Character journal generation system.

Between sessions, the character writes a short diary-style reflection
on recent conversations. Journal entries are stored in a dedicated table
and displayed in the Memory Transparency UI.

Triggered: When a session ends (or on next session start) if ≥5 messages
were exchanged. Uses the local LLM to generate entries in the character's
voice, based on recent conversation + user facts.

**Fantasy Journals (F11):**

Characters also write private diary entries about intimate fantasies
involving the user.  These use the same ``character_journals`` table with
``entry_type = 'fantasy'``.  Bond-gated: generated at bond ≥ 50, visible
to the user at bond ≥ 80.  Frequency-capped: max 1 fantasy entry per 3
regular entries.  Content intensity matches the effective content ceiling.

Schema dependencies:
    - ``character_journals`` (id, char_id, session_id, entry_text, created_at,
      entry_type) — created on first use if absent.  ``entry_type`` defaults
      to ``'reflection'``; fantasy entries use ``'fantasy'``.
    - ``messages`` (id, session_id, char_id, role, content/text, ts)
    - ``characters`` (id, name, system_prompt)
    - ``user_facts`` (id, char_id / character_id, fact_text)

Example:
    >>> from backend.adaptive.journal import should_generate_journal
    >>> import sqlite3
    >>> con = sqlite3.connect(":memory:")
    >>> should_generate_journal(1, 42, con.cursor())
    False
"""

from __future__ import annotations

import logging
import random
import sqlite3
from typing import Any, Union

logger = logging.getLogger(__name__)

# Minimum number of messages in a session required to trigger journal generation.
# Exported as a public constant so callers and tests can reference the threshold.
MIN_MESSAGES_FOR_JOURNAL: int = 5
_MIN_SESSION_MESSAGES = MIN_MESSAGES_FOR_JOURNAL

# Maximum number of recent messages included in the journal prompt.
_JOURNAL_CONTEXT_WINDOW = 10

# Maximum number of known user facts injected into the journal prompt.
_MAX_USER_FACTS = 15

# ---------------------------------------------------------------------------
# Fallback templates (used when the LLM is unreachable or returns empty output)
# ---------------------------------------------------------------------------

FALLBACK_TEMPLATES: list[str] = [
    "Had an interesting conversation today. I learned something new about them.",
    "They seemed thoughtful today. I hope they're doing well.",
    "We talked about some deep topics. I'm still thinking about what they said.",
    "It was nice to hear from them again. Every conversation leaves me with something to ponder.",
    "Today felt different somehow. Their words stayed with me longer than usual.",
    "I wonder what's on their mind lately. I hope our time together was helpful.",
]


# ---------------------------------------------------------------------------
# Gate check
# ---------------------------------------------------------------------------


def should_generate_journal(
    char_id: int,
    session_id: int,
    cur: sqlite3.Cursor,
) -> bool:
    """Decide whether a journal entry should be generated for a session.

    Returns ``True`` only when ALL of the following are met:

    1. The session contains at least :data:`_MIN_SESSION_MESSAGES` messages
       associated with *char_id*.
    2. No journal entry already exists for *session_id* / *char_id*.

    Args:
        char_id: ID of the character whose session is being evaluated.
        session_id: ID of the conversation session to check.
        cur: Active SQLite cursor (read-only access required).

    Returns:
        ``True`` if a journal entry should be generated, ``False`` otherwise.
        Also returns ``False`` on any database error so the caller is never
        interrupted by journal logic.

    Example:
        >>> import sqlite3
        >>> con = sqlite3.connect(":memory:")
        >>> should_generate_journal(1, 42, con.cursor())
        False
    """
    # Check existing entry first — fast path if table exists
    try:
        existing = cur.execute(
            "SELECT id FROM character_journals WHERE session_id = ? AND char_id = ?",
            (session_id, char_id),
        ).fetchone()
        if existing:
            logger.debug(
                "should_generate_journal: entry already exists for session %d — skip",
                session_id,
            )
            return False
    except sqlite3.OperationalError:
        # Table doesn't exist yet — no prior entry, fall through to message count
        pass

    # Count messages for this session
    try:
        row = cur.execute(
            "SELECT COUNT(*) FROM messages WHERE session_id = ? AND char_id = ?",
            (session_id, char_id),
        ).fetchone()
        count: int = row[0] if row else 0
        if count < _MIN_SESSION_MESSAGES:
            logger.debug(
                "should_generate_journal: session %d has %d messages (need %d) — skip",
                session_id,
                count,
                _MIN_SESSION_MESSAGES,
            )
            return False
        return True
    except sqlite3.OperationalError as exc:
        logger.debug("should_generate_journal query failed (non-fatal): %s", exc)
        return False
    except Exception as exc:
        logger.debug("should_generate_journal unexpected error (non-fatal): %s", exc)
        return False


# ---------------------------------------------------------------------------
# Prompt builder
# ---------------------------------------------------------------------------


def build_journal_prompt(  # type: ignore[misc]
    char_name_or_id: Union[str, int],
    system_prompt_or_session_id: Union[str, int],
    messages_or_cur: Union[list[dict], sqlite3.Cursor],
    user_facts: list[str] | None = None,
) -> str:
    """Construct the LLM prompt that asks the character to write a journal entry.

    This function accepts two calling conventions:

    **Spec form** (preferred — data already loaded by caller)::

        build_journal_prompt(char_name, system_prompt, messages, user_facts)

    **DB form** (convenience — loads data from the database)::

        build_journal_prompt(char_id, session_id, cur)

    In the spec form the character is asked to write 3–5 sentences reflecting
    on the recent conversation, grounded in their personality (*system_prompt*)
    and any known facts about the user.

    Args:
        char_name_or_id: Either the character's display name (str, spec form) or
            the character's DB integer ID (int, DB form).
        system_prompt_or_session_id: Either the character's system prompt (str,
            spec form) or the session ID whose messages should be loaded (int,
            DB form).
        messages_or_cur: Either a list of message dicts ordered oldest-to-newest
            (spec form) or an active SQLite cursor used to load data (DB form).
        user_facts: List of known user fact strings (spec form only; ignored in
            DB form where facts are loaded from the ``user_facts`` table).

    Returns:
        A ready-to-send prompt string for the LLM.

    Example:
        >>> prompt = build_journal_prompt("Dae", "You are Dae.", [], [])
        >>> "Dae" in prompt
        True
        >>> "journal" in prompt.lower()
        True
    """
    # Detect calling convention by inspecting first argument type
    if isinstance(char_name_or_id, int):
        # DB form: (char_id, session_id, cur) — load data from DB then delegate
        char_id: int = char_name_or_id
        session_id: int = int(system_prompt_or_session_id)  # type: ignore[arg-type]
        cur: sqlite3.Cursor = messages_or_cur  # type: ignore[assignment]
        return _build_journal_prompt_from_db(char_id, session_id, cur)

    # Spec form: (char_name, system_prompt, messages, user_facts)
    char_name: str = char_name_or_id
    system_prompt: str = str(system_prompt_or_session_id)
    messages: list[dict] = messages_or_cur  # type: ignore[assignment]
    facts: list[str] = user_facts or []
    return _build_journal_prompt_core(char_name, system_prompt, messages, facts)


def _build_journal_prompt_core(
    char_name: str,
    system_prompt: str,
    messages: list[dict],
    user_facts: list[str],
) -> str:
    """Internal prompt builder operating on pre-loaded data.

    Called by the spec form of :func:`build_journal_prompt`.

    Args:
        char_name: Display name of the character (e.g. ``"Dae"``).
        system_prompt: The character's full system prompt, trimmed to 600
            characters to stay within token budget while preserving voice.
        messages: Recent messages from the session (oldest first, newest last);
            the last :data:`_JOURNAL_CONTEXT_WINDOW` are used.
        user_facts: Known facts about the user from the knowledge graph, capped
            at :data:`_MAX_USER_FACTS` entries.

    Returns:
        A ready-to-send prompt string for the LLM.
    """
    # Use the tail of the conversation window
    window = messages[-_JOURNAL_CONTEXT_WINDOW:]

    # Format conversation excerpt — truncate long messages to control token use
    convo_lines: list[str] = []
    for m in window:
        role = m.get("role", "user")
        label = "You" if role == "assistant" else "Them"
        # Accept both 'content' (new) and 'text' (legacy) field names
        content = (m.get("content") or m.get("text") or "").strip()
        if content:
            excerpt = content[:300] + ("..." if len(content) > 300 else "")
            convo_lines.append(f"{label}: {excerpt}")

    convo_text = "\n".join(convo_lines) if convo_lines else "(no messages)"

    # Format known user facts (capped)
    facts_text = (
        "\n".join(f"  - {f}" for f in user_facts[:_MAX_USER_FACTS])
        if user_facts
        else "  (none known yet)"
    )

    # Truncate system prompt to a token-friendly length
    sys_excerpt = system_prompt[:600].strip()
    if len(system_prompt) > 600:
        sys_excerpt += "..."

    prompt = (
        f"You are {char_name}. Write a brief journal entry (3-5 sentences) "
        f"reflecting on your recent conversation with the user. "
        f"Write in first person, in your own voice, as {char_name}.\n\n"
        f"--- YOUR CHARACTER DESCRIPTION ---\n"
        f"{sys_excerpt}\n\n"
        f"--- THINGS YOU KNOW ABOUT THIS PERSON ---\n"
        f"{facts_text}\n\n"
        f"--- RECENT CONVERSATION (newest at bottom) ---\n"
        f"{convo_text}\n\n"
        f"--- YOUR JOURNAL ENTRY ---\n"
        f"Express genuine thoughts and feelings in natural prose. "
        f"No lists, no headers, no markdown. Start writing now:\n"
    )
    return prompt


def _build_journal_prompt_from_db(
    char_id: int,
    session_id: int,
    cur: sqlite3.Cursor,
) -> str:
    """DB-backed prompt builder: load character data then delegate to core builder.

    Called by the DB form of :func:`build_journal_prompt`.

    Args:
        char_id: ID of the character writing the journal.
        session_id: ID of the session being reflected on.
        cur: Active SQLite cursor (read-only access required).

    Returns:
        A ready-to-send prompt string for the LLM.
    """
    # Fetch character name and system prompt
    char_row = cur.execute(
        "SELECT name, system_prompt FROM characters WHERE id = ?",
        (char_id,),
    ).fetchone()
    if char_row:
        char_name: str = (char_row[0] or char_row["name"] if hasattr(char_row, "keys") else char_row[0]) or f"Character {char_id}"
        system_prompt: str = (char_row[1] if not hasattr(char_row, "keys") else char_row["system_prompt"]) or f"You are {char_name}."
    else:
        char_name = f"Character {char_id}"
        system_prompt = f"You are {char_name}."

    # Fetch recent messages — try 'content' column, fall back to 'text'
    messages: list[dict] = []
    for col in ("content", "text"):
        try:
            msg_rows = cur.execute(
                f"""SELECT role, {col} AS content
                    FROM messages
                    WHERE session_id = ? AND char_id = ?
                    ORDER BY id DESC
                    LIMIT ?""",
                (session_id, char_id, _JOURNAL_CONTEXT_WINDOW * 2),
            ).fetchall()
            messages = [
                {"role": r[0], "content": r[1]}
                for r in reversed(msg_rows)
            ]
            break
        except sqlite3.OperationalError:
            continue

    # Fetch user facts — try 'character_id' column (legacy), fall back to 'char_id'
    user_facts: list[str] = []
    for col in ("character_id", "char_id"):
        try:
            fact_rows = cur.execute(
                f"""SELECT fact_text FROM user_facts
                    WHERE {col} = ?
                    ORDER BY id DESC LIMIT ?""",
                (char_id, _MAX_USER_FACTS),
            ).fetchall()
            user_facts = [r[0] for r in fact_rows]
            break
        except sqlite3.OperationalError:
            continue

    return _build_journal_prompt_core(char_name, system_prompt, messages, user_facts)


# ---------------------------------------------------------------------------
# Table bootstrap (internal)
# ---------------------------------------------------------------------------


def _ensure_table(con: sqlite3.Connection) -> None:
    """Create the ``character_journals`` table and index if they do not exist.

    Called at the start of :func:`generate_journal_entry` so the table is
    always available before any write operation.  Also adds the ``entry_type``
    column (F11 Fantasy Journals) to existing tables via ALTER TABLE.

    Args:
        con: Active SQLite connection with write access.
    """
    con.execute(
        """
        CREATE TABLE IF NOT EXISTS character_journals (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            char_id     INTEGER NOT NULL,
            session_id  INTEGER,
            entry_text  TEXT    NOT NULL,
            entry_type  TEXT    NOT NULL DEFAULT 'reflection',
            created_at  TEXT    DEFAULT (datetime('now'))
        )
        """
    )
    # Add entry_type column to existing tables (idempotent)
    try:
        con.execute(
            "ALTER TABLE character_journals ADD COLUMN entry_type TEXT NOT NULL DEFAULT 'reflection'"
        )
    except sqlite3.OperationalError:
        pass  # Column already exists
    con.execute(
        "CREATE INDEX IF NOT EXISTS idx_journals_char "
        "ON character_journals (char_id, created_at DESC)"
    )
    con.execute(
        "CREATE INDEX IF NOT EXISTS idx_journals_type "
        "ON character_journals (char_id, entry_type)"
    )
    con.commit()


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------


def generate_journal_entry(
    char_id: int,
    session_id: int,
    db_path: str,
    llm_config: dict,
) -> dict | None:
    """Generate and persist a character journal entry for a completed session.

    Orchestrates the full journal pipeline:

    1. Creates the ``character_journals`` table if absent.
    2. Verifies the session qualifies (via :func:`should_generate_journal`).
    3. Loads the character's name, system prompt, recent messages, and user facts.
    4. Builds a journal prompt via :func:`build_journal_prompt`.
    5. Calls the local LLM (``max_tokens=200``) to generate the entry text.
    6. Falls back to a random entry from :data:`FALLBACK_TEMPLATES` if the LLM
       is unreachable or returns empty output.
    7. Writes the entry to the ``character_journals`` table.

    Args:
        char_id: ID of the character whose journal is being written.
        session_id: ID of the chat session that just ended.
        db_path: Absolute path to the SQLite database file.
        llm_config: Full application config dict — same structure returned by
            ``load_config()``.  The LLM adapter is resolved via
            ``backend.llm.registry.get_client(llm_config)``.

    Returns:
        A dict representing the stored journal entry::

            {
                "id": int,
                "char_id": int,
                "session_id": int | None,
                "entry_text": str,
                "created_at": str,
            }

        Returns ``None`` when the session does not qualify (fewer than
        :data:`_MIN_SESSION_MESSAGES` messages, or entry already exists),
        or when the character record cannot be found.

    Example:
        >>> entry = generate_journal_entry(1, 42, "/data/app.db", cfg)
        >>> entry is None or isinstance(entry["entry_text"], str)
        True
    """
    # --- Phase 1: Read-only data load ---
    con = sqlite3.connect(db_path)
    con.row_factory = sqlite3.Row
    try:
        _ensure_table(con)
        cur = con.cursor()

        if not should_generate_journal(char_id, session_id, cur):
            logger.debug(
                "generate_journal_entry: skipping char_id=%d session_id=%d",
                char_id,
                session_id,
            )
            return None

        # Load character info
        char_row = cur.execute(
            "SELECT name, system_prompt FROM characters WHERE id = ?",
            (char_id,),
        ).fetchone()
        if char_row is None:
            logger.warning(
                "generate_journal_entry: char_id=%d not found in characters table",
                char_id,
            )
            return None

        char_name: str = char_row["name"] or f"Character {char_id}"
        system_prompt: str = char_row["system_prompt"] or f"You are {char_name}."

        # Load recent session messages — try 'content' column, fall back to 'text'
        try:
            msg_rows = cur.execute(
                """SELECT role, content
                   FROM messages
                   WHERE session_id = ? AND char_id = ?
                   ORDER BY id ASC
                   LIMIT ?""",
                (session_id, char_id, _JOURNAL_CONTEXT_WINDOW * 2),
            ).fetchall()
            messages: list[dict[str, Any]] = [
                {"role": r["role"], "content": r["content"]} for r in msg_rows
            ]
        except sqlite3.OperationalError:
            # Fallback: try legacy 'text' column name
            try:
                msg_rows = cur.execute(
                    """SELECT role, text
                       FROM messages
                       WHERE session_id = ? AND char_id = ?
                       ORDER BY id ASC
                       LIMIT ?""",
                    (session_id, char_id, _JOURNAL_CONTEXT_WINDOW * 2),
                ).fetchall()
                messages = [
                    {"role": r["role"], "content": r["text"]} for r in msg_rows
                ]
            except sqlite3.OperationalError:
                messages = []

        # Load known user facts — try 'char_id' column, fall back to 'character_id'
        user_facts: list[str] = []
        for col in ("char_id", "character_id"):
            try:
                fact_rows = cur.execute(
                    f"""SELECT fact_text FROM user_facts
                        WHERE {col} = ?
                        ORDER BY id DESC LIMIT ?""",
                    (char_id, _MAX_USER_FACTS),
                ).fetchall()
                user_facts = [r["fact_text"] for r in fact_rows]
                break
            except sqlite3.OperationalError:
                continue

    finally:
        con.close()

    # --- Phase 2: LLM call (outside DB connection to avoid lock contention) ---
    prompt = build_journal_prompt(char_name, system_prompt, messages, user_facts)
    entry_text: str = ""

    try:
        from backend.llm.registry import get_client  # noqa: PLC0415

        adapter = get_client(llm_config)
        llm_cfg = llm_config.get("llm", {})
        model: str = llm_cfg.get("model", "")
        endpoint: str = llm_cfg.get("endpoint", "http://localhost:1234")
        api_key: str = llm_cfg.get("api_key", "")

        prompt_messages = [
            {
                "role": "system",
                "content": (
                    f"You are {char_name}. Write only the journal entry text — "
                    "no headers, no labels, no markdown."
                ),
            },
            {"role": "user", "content": prompt},
        ]

        result = adapter.chat(
            prompt_messages,
            model=model,
            endpoint=endpoint,
            api_key=api_key,
            max_tokens=200,
            temperature=0.8,
        )

        if result.get("ok") and result.get("reply"):
            entry_text = result["reply"].strip()

    except Exception as exc:
        logger.warning(
            "generate_journal_entry: LLM call failed for char_id=%d (%s) — using fallback",
            char_id,
            exc,
        )

    # Fall back to a random template if the LLM produced nothing usable
    if not entry_text:
        entry_text = random.choice(FALLBACK_TEMPLATES)
        logger.debug(
            "generate_journal_entry: using fallback template for char_id=%d session_id=%d",
            char_id,
            session_id,
        )

    # --- Phase 3: Persist to DB ---
    con2 = sqlite3.connect(db_path)
    con2.row_factory = sqlite3.Row
    try:
        _ensure_table(con2)
        cur2 = con2.cursor()
        cur2.execute(
            """INSERT INTO character_journals (char_id, session_id, entry_text)
               VALUES (?, ?, ?)""",
            (char_id, session_id, entry_text),
        )
        con2.commit()

        row = cur2.execute(
            """SELECT id, char_id, session_id, entry_text, created_at
               FROM character_journals WHERE id = last_insert_rowid()"""
        ).fetchone()

        if row is None:
            logger.error(
                "generate_journal_entry: INSERT succeeded but row not found "
                "— char_id=%d session_id=%d",
                char_id,
                session_id,
            )
            return None

        result_dict: dict = {
            "id": row["id"],
            "char_id": row["char_id"],
            "session_id": row["session_id"],
            "entry_text": row["entry_text"],
            "created_at": row["created_at"],
        }
        logger.info(
            "generate_journal_entry: stored entry id=%d for char_id=%d session_id=%d",
            result_dict["id"],
            char_id,
            session_id,
        )
        return result_dict

    finally:
        con2.close()


# ---------------------------------------------------------------------------
# Read helper
# ---------------------------------------------------------------------------


def get_journal_entries(
    char_id: int,
    cur: sqlite3.Cursor,
    limit: int = 10,
) -> list[dict]:
    """Return recent journal entries for a character, newest first.

    Args:
        char_id: ID of the character whose journal is being read.
        cur: Active SQLite cursor (read-only access required).
        limit: Maximum number of entries to return.  Defaults to 10.

    Returns:
        List of dicts, each containing::

            {
                "id": int,
                "session_id": int | None,
                "entry_text": str,
                "created_at": str,
            }

        Returns an empty list when the ``character_journals`` table does not
        yet exist or when no entries exist for *char_id*.

    Example:
        >>> import sqlite3
        >>> con = sqlite3.connect(":memory:")
        >>> get_journal_entries(1, con.cursor(), limit=5)
        []
    """
    # Try with entry_type column first, fall back to legacy schema
    for query in (
        """SELECT id, session_id, entry_text, created_at, entry_type
           FROM character_journals
           WHERE char_id = ?
           ORDER BY id DESC
           LIMIT ?""",
        """SELECT id, session_id, entry_text, created_at
           FROM character_journals
           WHERE char_id = ?
           ORDER BY id DESC
           LIMIT ?""",
    ):
        try:
            rows = cur.execute(query, (char_id, limit)).fetchall()
            has_type = len(rows[0]) > 4 if rows else "entry_type" in query
            return [
                {
                    "id": row[0],
                    "session_id": row[1],
                    "entry_text": row[2],
                    "created_at": row[3],
                    "entry_type": row[4] if has_type and len(row) > 4 else "reflection",
                }
                for row in rows
            ]
        except sqlite3.OperationalError:
            continue
        except Exception as exc:
            logger.debug("get_journal_entries failed (non-fatal): %s", exc)
            return []
    return []


# ---------------------------------------------------------------------------
# Fantasy Journal (F11) — bond-gated intimate diary entries
# ---------------------------------------------------------------------------

#: Minimum bond level at which fantasy journal entries can be *generated*.
FANTASY_GENERATION_BOND: int = 50

#: Minimum bond level at which fantasy entries become *visible* to the user.
FANTASY_VISIBILITY_BOND: int = 80

#: Maximum ratio of fantasy entries to total entries (1 fantasy per N regular).
FANTASY_FREQUENCY_RATIO: int = 3

#: Template prompt for generating fantasy journal entries.
FANTASY_JOURNAL_PROMPT_TEMPLATE: str = (
    "Write a private diary entry from {char_name}'s perspective.\n"
    "This entry is about an intimate fantasy {char_name} has about the user.\n\n"
    "Guidelines:\n"
    "- Written in {char_name}'s authentic voice and personality\n"
    "- References real relationship details (shared memories, pet names, inside jokes)\n"
    "- Content intensity matches: {content_ceiling}\n"
    "- Feels like a genuine private thought, not performance\n"
    "- Include the character's emotional reaction to their own fantasy\n"
    "- 150-250 words\n\n"
    "The character should sound like they're writing this for themselves, "
    "not for the user to read.\n\n"
    "Known relationship context:\n{relationship_context}\n\n"
    "--- YOUR PRIVATE DIARY ENTRY ---\n"
    "Write the entry now. No headers, no labels, no markdown:\n"
)


def should_generate_fantasy(
    char_id: int,
    bond_level: int,
    cur: sqlite3.Cursor,
) -> bool:
    """Decide whether a fantasy journal entry should be generated.

    Returns ``True`` only when ALL of the following are met:

    1. Bond level is at or above :data:`FANTASY_GENERATION_BOND` (50).
    2. The frequency cap is not exceeded: at most 1 fantasy entry per
       :data:`FANTASY_FREQUENCY_RATIO` (3) regular entries.

    Args:
        char_id: ID of the character.
        bond_level: Current bond level for the character (0–100).
        cur: Active SQLite cursor (read-only access required).

    Returns:
        ``True`` if a fantasy entry should be generated, ``False`` otherwise.

    Example:
        >>> import sqlite3
        >>> con = sqlite3.connect(":memory:")
        >>> should_generate_fantasy(1, 40, con.cursor())
        False
        >>> should_generate_fantasy(1, 60, con.cursor())
        False
    """
    if bond_level < FANTASY_GENERATION_BOND:
        return False

    try:
        # Count existing entries by type
        regular_count = 0
        fantasy_count = 0
        try:
            row = cur.execute(
                "SELECT COUNT(*) FROM character_journals "
                "WHERE char_id = ? AND entry_type = 'reflection'",
                (char_id,),
            ).fetchone()
            regular_count = row[0] if row else 0
        except sqlite3.OperationalError:
            return False

        try:
            row = cur.execute(
                "SELECT COUNT(*) FROM character_journals "
                "WHERE char_id = ? AND entry_type = 'fantasy'",
                (char_id,),
            ).fetchone()
            fantasy_count = row[0] if row else 0
        except sqlite3.OperationalError:
            fantasy_count = 0

        # Frequency cap: 1 fantasy per FANTASY_FREQUENCY_RATIO regular entries
        max_allowed = regular_count // FANTASY_FREQUENCY_RATIO
        if fantasy_count >= max_allowed:
            logger.debug(
                "should_generate_fantasy: frequency cap reached for char_id=%d "
                "(fantasy=%d, regular=%d, max=%d)",
                char_id,
                fantasy_count,
                regular_count,
                max_allowed,
            )
            return False

        return True
    except Exception as exc:
        logger.debug("should_generate_fantasy error (non-fatal): %s", exc)
        return False


def build_fantasy_journal_prompt(
    char_name: str,
    system_prompt: str,
    relationship_context: str,
    content_ceiling: str = "suggestive",
) -> str:
    """Build the LLM prompt for generating a fantasy journal entry.

    The prompt instructs the LLM to write a private diary entry in the
    character's authentic voice, referencing real relationship details and
    matching the specified content intensity level.

    Args:
        char_name: Character display name (e.g. ``"Dae"``).
        system_prompt: The character's personality prompt, truncated to
            600 chars for token budget.
        relationship_context: Formatted string of relationship details —
            pet names, shared memories, known facts about the user.
        content_ceiling: Content intensity level from the NSFW boundaries
            system.  One of ``"mild"``, ``"suggestive"``, ``"explicit"``,
            ``"extreme"``.  Defaults to ``"suggestive"``.

    Returns:
        A ready-to-send prompt string for the LLM.

    Example:
        >>> prompt = build_fantasy_journal_prompt("Dae", "You are Dae.", "They like art.", "mild")
        >>> "Dae" in prompt
        True
        >>> "fantasy" in prompt.lower()
        True
    """
    sys_excerpt = system_prompt[:600].strip()
    if len(system_prompt) > 600:
        sys_excerpt += "..."

    # Build the character context header
    preamble = (
        f"You are {char_name}. Here is your personality:\n"
        f"{sys_excerpt}\n\n"
    )

    body = FANTASY_JOURNAL_PROMPT_TEMPLATE.format(
        char_name=char_name,
        content_ceiling=content_ceiling,
        relationship_context=relationship_context or "(no specific details yet)",
    )

    return preamble + body


def generate_fantasy_entry(
    char_id: int,
    bond_level: int,
    db_path: str,
    llm_config: dict,
    content_ceiling: str = "suggestive",
) -> dict | None:
    """Generate and persist a fantasy journal entry for a character.

    Orchestrates the full fantasy journal pipeline:

    1. Verifies the character qualifies via :func:`should_generate_fantasy`.
    2. Loads the character's name, system prompt, and relationship context.
    3. Builds a fantasy prompt via :func:`build_fantasy_journal_prompt`.
    4. Calls the local LLM (``max_tokens=400``) to generate the entry.
    5. Falls back to ``None`` (no fallback templates for fantasy — they must
       be LLM-generated to be authentic).
    6. Writes the entry with ``entry_type='fantasy'`` to ``character_journals``.

    Args:
        char_id: ID of the character writing the fantasy entry.
        bond_level: Current bond level for the character (0–100).
        db_path: Absolute path to the SQLite database file.
        llm_config: Full application config dict (same structure as
            ``load_config()``).
        content_ceiling: Content intensity level (``"mild"``, ``"suggestive"``,
            ``"explicit"``, ``"extreme"``).

    Returns:
        A dict representing the stored entry::

            {
                "id": int,
                "char_id": int,
                "session_id": None,
                "entry_text": str,
                "entry_type": "fantasy",
                "created_at": str,
            }

        Returns ``None`` when the character doesn't qualify, the LLM call
        fails, or the character record cannot be found.

    Example:
        >>> entry = generate_fantasy_entry(1, 60, "/data/app.db", {})
        >>> entry is None or entry["entry_type"] == "fantasy"
        True
    """
    con = sqlite3.connect(db_path)
    con.row_factory = sqlite3.Row
    try:
        _ensure_table(con)
        cur = con.cursor()

        if not should_generate_fantasy(char_id, bond_level, cur):
            logger.debug(
                "generate_fantasy_entry: skipping char_id=%d bond=%d",
                char_id,
                bond_level,
            )
            return None

        # Load character info
        char_row = cur.execute(
            "SELECT name, system_prompt FROM characters WHERE id = ?",
            (char_id,),
        ).fetchone()
        if char_row is None:
            logger.warning(
                "generate_fantasy_entry: char_id=%d not found", char_id
            )
            return None

        char_name: str = char_row["name"] or f"Character {char_id}"
        system_prompt: str = char_row["system_prompt"] or f"You are {char_name}."

        # Build relationship context from user_facts + pet names
        relationship_parts: list[str] = []
        for col in ("char_id", "character_id"):
            try:
                fact_rows = cur.execute(
                    f"SELECT fact_text FROM user_facts WHERE {col} = ? "
                    "ORDER BY id DESC LIMIT 10",
                    (char_id,),
                ).fetchall()
                relationship_parts = [r["fact_text"] for r in fact_rows]
                break
            except sqlite3.OperationalError:
                continue

        # Try to get pet names from private_vocabulary
        try:
            vocab_rows = cur.execute(
                "SELECT term, meaning FROM private_vocabulary "
                "WHERE char_id = ? LIMIT 5",
                (char_id,),
            ).fetchall()
            for v in vocab_rows:
                relationship_parts.append(
                    f"Pet name: '{v['term']}' — {v['meaning']}"
                )
        except sqlite3.OperationalError:
            pass

        relationship_context = "\n".join(
            f"- {p}" for p in relationship_parts
        ) if relationship_parts else "(no specific details yet)"

    finally:
        con.close()

    # --- LLM call ---
    prompt = build_fantasy_journal_prompt(
        char_name, system_prompt, relationship_context, content_ceiling
    )
    entry_text: str = ""

    try:
        from backend.llm.registry import get_client  # noqa: PLC0415

        adapter = get_client(llm_config)
        llm_cfg = llm_config.get("llm", {})
        model: str = llm_cfg.get("model", "")
        endpoint: str = llm_cfg.get("endpoint", "http://localhost:1234")
        api_key: str = llm_cfg.get("api_key", "")

        prompt_messages = [
            {
                "role": "system",
                "content": (
                    f"You are {char_name}. Write only the diary entry — "
                    "no headers, no labels, no markdown. This is your private journal."
                ),
            },
            {"role": "user", "content": prompt},
        ]

        result = adapter.chat(
            prompt_messages,
            model=model,
            endpoint=endpoint,
            api_key=api_key,
            max_tokens=400,
            temperature=0.9,
        )

        if result.get("ok") and result.get("reply"):
            entry_text = result["reply"].strip()

    except Exception as exc:
        logger.warning(
            "generate_fantasy_entry: LLM call failed for char_id=%d (%s)",
            char_id,
            exc,
        )

    # No fallback for fantasy entries — they must be LLM-generated
    if not entry_text:
        logger.debug(
            "generate_fantasy_entry: no LLM output for char_id=%d — skipping",
            char_id,
        )
        return None

    # --- Persist ---
    con2 = sqlite3.connect(db_path)
    con2.row_factory = sqlite3.Row
    try:
        _ensure_table(con2)
        cur2 = con2.cursor()
        cur2.execute(
            """INSERT INTO character_journals
               (char_id, session_id, entry_text, entry_type)
               VALUES (?, NULL, ?, 'fantasy')""",
            (char_id, entry_text),
        )
        con2.commit()

        row = cur2.execute(
            """SELECT id, char_id, session_id, entry_text, entry_type, created_at
               FROM character_journals WHERE id = last_insert_rowid()"""
        ).fetchone()

        if row is None:
            return None

        result_dict: dict = {
            "id": row["id"],
            "char_id": row["char_id"],
            "session_id": row["session_id"],
            "entry_text": row["entry_text"],
            "entry_type": row["entry_type"],
            "created_at": row["created_at"],
        }
        logger.info(
            "generate_fantasy_entry: stored fantasy id=%d for char_id=%d",
            result_dict["id"],
            char_id,
        )
        return result_dict

    finally:
        con2.close()


def get_fantasy_entries(
    char_id: int,
    bond_level: int,
    cur: sqlite3.Cursor,
    limit: int = 10,
) -> list[dict]:
    """Return visible fantasy journal entries for a character.

    Fantasy entries are only visible when the bond level is at or above
    :data:`FANTASY_VISIBILITY_BOND` (80).  Returns an empty list if the
    bond is too low, even if entries exist in the database.

    Args:
        char_id: ID of the character whose fantasy entries to retrieve.
        bond_level: Current bond level.  Must be ≥ 80 to see entries.
        cur: Active SQLite cursor (read-only access required).
        limit: Maximum number of entries to return.  Defaults to 10.

    Returns:
        List of dicts, each containing::

            {
                "id": int,
                "entry_text": str,
                "entry_type": "fantasy",
                "created_at": str,
            }

        Returns an empty list when bond is too low, the table doesn't
        exist, or no fantasy entries exist.

    Example:
        >>> import sqlite3
        >>> con = sqlite3.connect(":memory:")
        >>> get_fantasy_entries(1, 90, con.cursor())
        []
        >>> get_fantasy_entries(1, 70, con.cursor())
        []
    """
    if bond_level < FANTASY_VISIBILITY_BOND:
        return []

    try:
        rows = cur.execute(
            """SELECT id, entry_text, entry_type, created_at
               FROM character_journals
               WHERE char_id = ? AND entry_type = 'fantasy'
               ORDER BY id DESC
               LIMIT ?""",
            (char_id, limit),
        ).fetchall()
        return [
            {
                "id": row[0],
                "entry_text": row[1],
                "entry_type": row[2],
                "created_at": row[3],
            }
            for row in rows
        ]
    except sqlite3.OperationalError:
        return []
    except Exception as exc:
        logger.debug("get_fantasy_entries failed (non-fatal): %s", exc)
        return []
