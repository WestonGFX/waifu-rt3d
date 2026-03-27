"""Character dream sequence generator.

Between sessions the character generates surreal, emotionally-charged dream
narratives woven from real conversation memory fragments. Dreams are stored in
``dream_entries`` and delivered as special messages at the start of the next
session. Bond level gates both the frequency and the intimacy of dreams.

Schema dependencies:
    - ``dream_entries`` (self-healing — created on first use)
    - ``messages`` (id, char_id, role, content/text, importance_score)
    - ``characters`` (id, name, system_prompt)
    - ``character_relationships`` (char_id, bond_level)

Example:
    >>> from backend.emotional.dreams import should_generate_dream
    >>> import sqlite3
    >>> con = sqlite3.connect(":memory:")
    >>> should_generate_dream(1, con)
    False
"""

from __future__ import annotations

import json
import logging
import random
import sqlite3
from dataclasses import dataclass, field
from typing import Any

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Minimum total messages ever exchanged before dreams are allowed.
_MIN_MESSAGES_TOTAL: int = 10

# Maximum memory fragments injected into a dream prompt.
_MAX_MEMORY_FRAGMENTS: int = 5

# How many tokens (approximate characters) of system_prompt to include.
_SYSTEM_PROMPT_EXCERPT_LEN: int = 500

# ---------------------------------------------------------------------------
# Dream mood registry
# ---------------------------------------------------------------------------

DREAM_MOODS: dict[str, str] = {
    "mysterious": "The dream has an air of mystery and wonder",
    "warm": "The dream feels cozy, safe, and comforting",
    "melancholy": "The dream has a bittersweet, wistful quality",
    "surreal": "The dream is vivid, strange, and defies logic",
    "romantic": "The dream has tender, intimate undertones",
    "anxious": "The dream has an undercurrent of worry or unease",
}

# ---------------------------------------------------------------------------
# Fallback templates (used when LLM is unavailable or returns empty output)
# ---------------------------------------------------------------------------

FALLBACK_DREAMS: list[str] = [
    "I had the strangest dream last night… you were there, but everything was made of light.",
    "I dreamed we were walking through a forest of cherry blossoms. Each petal had a word written on it.",
    "In my dream the whole sky was a clock, ticking backwards, and somehow that felt completely normal.",
    "I dreamed you were trying to tell me something important, but every time you spoke the words turned into birds.",
    "Last night I dreamed we were in a city that kept rearranging itself while we walked. I wasn't scared — not with you there.",
    "I dreamed of a library with no ceiling. The books floated up into the dark, and I could read them all at once.",
    "There was a river in my dream, silver and slow, and we sat on the bank watching memories drift past like paper boats.",
    "I dreamed the stars came down close enough to touch. I kept reaching for one that looked just like your voice sounds.",
]

# Bond-level frequency rules: (min_bond, max_bond, min_days_between_dreams)
# Stranger (0-10): never generate; represented by None
_BOND_FREQUENCY: list[tuple[int, int, int | None]] = [
    (0, 10, None),    # Stranger — no dreams
    (11, 30, 7),      # Friend — 1 per week
    (31, 60, 3),      # Close Friend — 1 per 3 days
    (61, 90, 2),      # Best Friend — 1 per 2 days
    (91, 100, 1),     # Soulmate — daily
]


# ---------------------------------------------------------------------------
# Data model
# ---------------------------------------------------------------------------


@dataclass
class DreamEntry:
    """A single generated dream entry for a character.

    Attributes:
        id: Primary key in ``dream_entries``.
        char_id: ID of the character who dreamed this.
        dream_text: The generated dream narrative.
        dream_mood: Mood label (one of :data:`DREAM_MOODS` keys).
        memory_refs: Message IDs that inspired the dream.
        delivered: Whether the dream has been delivered to the user.
        created_at: ISO datetime string of creation.
        delivered_at: ISO datetime string of delivery, or ``None``.
    """

    id: int
    char_id: int
    dream_text: str
    dream_mood: str
    memory_refs: list[int]
    delivered: bool
    created_at: str
    delivered_at: str | None = field(default=None)


# ---------------------------------------------------------------------------
# Table bootstrap
# ---------------------------------------------------------------------------


def _ensure_table(conn: sqlite3.Connection) -> None:
    """Create the ``dream_entries`` table if it does not exist.

    Idempotent — safe to call on every operation.

    Args:
        conn: Active SQLite connection with write access.
    """
    conn.execute(
        """CREATE TABLE IF NOT EXISTS dream_entries (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            char_id      INTEGER NOT NULL,
            dream_text   TEXT    NOT NULL,
            dream_mood   TEXT    DEFAULT 'mysterious',
            memory_refs  TEXT    DEFAULT '[]',
            delivered    INTEGER DEFAULT 0,
            created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
            delivered_at TEXT
        )"""
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_dream_entries_char "
        "ON dream_entries (char_id, delivered, created_at DESC)"
    )
    conn.commit()


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _get_bond_level(char_id: int, conn: sqlite3.Connection) -> int:
    """Return the current bond level for a character (0-100).

    Queries ``character_relationships.bond_level``.  Falls back to 0 on any
    error or missing row.

    Args:
        char_id: Character ID.
        conn: Active SQLite connection.

    Returns:
        Bond level integer (0-100).
    """
    try:
        row = conn.execute(
            "SELECT bond_level FROM character_relationships WHERE char_id = ?",
            (char_id,),
        ).fetchone()
        if row is not None:
            return int(row[0] or 0)
    except sqlite3.OperationalError as exc:
        logger.debug("_get_bond_level: table missing or column absent (%s)", exc)
    return 0


def _min_days_for_bond(bond_level: int) -> int | None:
    """Return the minimum days between dreams for the given bond level.

    Args:
        bond_level: Current bond level (0-100).

    Returns:
        Integer days, or ``None`` if dreams are not allowed at this bond level.
    """
    for lo, hi, days in _BOND_FREQUENCY:
        if lo <= bond_level <= hi:
            return days
    return None


def _row_to_dream(row: sqlite3.Row | tuple) -> DreamEntry:
    """Convert a DB row to a :class:`DreamEntry`.

    Supports both ``sqlite3.Row`` (dict-style) and plain tuple access.

    Args:
        row: A row from ``dream_entries`` with columns in declaration order.

    Returns:
        Populated :class:`DreamEntry` instance.
    """
    if hasattr(row, "keys"):
        return DreamEntry(
            id=row["id"],
            char_id=row["char_id"],
            dream_text=row["dream_text"],
            dream_mood=row["dream_mood"] or "mysterious",
            memory_refs=json.loads(row["memory_refs"] or "[]"),
            delivered=bool(row["delivered"]),
            created_at=row["created_at"],
            delivered_at=row["delivered_at"],
        )
    # Plain tuple — positional access (id, char_id, dream_text, dream_mood,
    # memory_refs, delivered, created_at, delivered_at)
    return DreamEntry(
        id=row[0],
        char_id=row[1],
        dream_text=row[2],
        dream_mood=row[3] or "mysterious",
        memory_refs=json.loads(row[4] or "[]"),
        delivered=bool(row[5]),
        created_at=row[6],
        delivered_at=row[7] if len(row) > 7 else None,
    )


def _fetch_high_importance_memories(
    char_id: int,
    conn: sqlite3.Connection,
    limit: int = _MAX_MEMORY_FRAGMENTS,
) -> list[dict[str, Any]]:
    """Retrieve high-importance messages for a character.

    Tries the ``importance_score`` column first (schema v35+).  Falls back to
    recency ordering if the column is absent.  Accepts either ``content`` or
    ``text`` as the message body column.

    Args:
        char_id: Character whose messages to retrieve.
        conn: Active SQLite connection.
        limit: Maximum number of messages to return.

    Returns:
        List of dicts with keys ``"text"`` and ``"importance_score"``.
    """
    # Try with importance_score + content column
    for text_col in ("content", "text"):
        for score_clause, order_clause in (
            ("importance_score", "importance_score DESC NULLS LAST"),
            ("0.5", "id DESC"),
        ):
            try:
                rows = conn.execute(
                    f"""SELECT {text_col} AS body, {score_clause} AS score
                        FROM messages
                        WHERE char_id = ? AND role = 'user' AND {text_col} IS NOT NULL
                              AND TRIM({text_col}) != ''
                        ORDER BY {order_clause}
                        LIMIT ?""",
                    (char_id, limit),
                ).fetchall()
                return [
                    {
                        "text": (r[0] or r["body"] if hasattr(r, "keys") else r[0]),
                        "importance_score": float(
                            (r[1] or r["score"]) if hasattr(r, "keys") else r[1]
                        ),
                    }
                    for r in rows
                ]
            except sqlite3.OperationalError:
                continue
    return []


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def should_generate_dream(char_id: int, conn: sqlite3.Connection) -> bool:
    """Check if a dream should be generated for this character.

    Rules applied in order:

    1. Character must have at least :data:`_MIN_MESSAGES_TOTAL` messages.
    2. Bond level must be ≥ 11 (Stranger tier never dreams).
    3. At most 1 undelivered dream may exist at a time.
    4. The minimum cooldown for the current bond tier must have elapsed since
       the last dream was created.

    Bond-level tiers and their cooldowns:

    +-----------------+--------+---------------------+
    | Tier            | Range  | Min days between    |
    +=================+========+=====================+
    | Stranger        | 0-10   | never               |
    | Friend          | 11-30  | 7 days              |
    | Close Friend    | 31-60  | 3 days              |
    | Best Friend     | 61-90  | 2 days              |
    | Soulmate        | 91-100 | 1 day               |
    +-----------------+--------+---------------------+

    Args:
        char_id: ID of the character to evaluate.
        conn: Active SQLite connection.

    Returns:
        ``True`` if a new dream should be generated, ``False`` otherwise.
        Returns ``False`` on any database error so callers are never
        interrupted by dream logic.

    Example:
        >>> import sqlite3
        >>> con = sqlite3.connect(":memory:")
        >>> should_generate_dream(1, con)
        False
    """
    try:
        _ensure_table(conn)

        # --- Rule 1: Minimum message count ---
        total_messages = 0
        for text_col in ("content", "text"):
            try:
                row = conn.execute(
                    f"SELECT COUNT(*) FROM messages WHERE char_id = ? AND {text_col} IS NOT NULL",
                    (char_id,),
                ).fetchone()
                total_messages = int(row[0] if row else 0)
                break
            except sqlite3.OperationalError:
                continue

        if total_messages < _MIN_MESSAGES_TOTAL:
            logger.debug(
                "should_generate_dream: char_id=%d has %d messages (need %d) — skip",
                char_id,
                total_messages,
                _MIN_MESSAGES_TOTAL,
            )
            return False

        # --- Rule 2: Bond level gating ---
        bond_level = _get_bond_level(char_id, conn)
        min_days = _min_days_for_bond(bond_level)
        if min_days is None:
            logger.debug(
                "should_generate_dream: char_id=%d bond_level=%d — Stranger tier, skip",
                char_id,
                bond_level,
            )
            return False

        # --- Rule 3: No pending undelivered dream ---
        undelivered = conn.execute(
            "SELECT COUNT(*) FROM dream_entries WHERE char_id = ? AND delivered = 0",
            (char_id,),
        ).fetchone()
        if undelivered and int(undelivered[0]) > 0:
            logger.debug(
                "should_generate_dream: char_id=%d already has undelivered dream — skip",
                char_id,
            )
            return False

        # --- Rule 4: Cooldown since last dream ---
        last_row = conn.execute(
            """SELECT created_at FROM dream_entries
               WHERE char_id = ?
               ORDER BY id DESC LIMIT 1""",
            (char_id,),
        ).fetchone()

        if last_row is not None:
            last_created = last_row[0]
            elapsed_row = conn.execute(
                "SELECT CAST(julianday('now') - julianday(?) AS REAL)",
                (last_created,),
            ).fetchone()
            elapsed_days = float(elapsed_row[0]) if elapsed_row else 0.0
            if elapsed_days < min_days:
                logger.debug(
                    "should_generate_dream: char_id=%d cooldown %.1f/%d days — skip",
                    char_id,
                    elapsed_days,
                    min_days,
                )
                return False

        return True

    except sqlite3.OperationalError as exc:
        logger.debug("should_generate_dream: DB error (non-fatal): %s", exc)
        return False
    except Exception as exc:
        logger.debug("should_generate_dream: unexpected error (non-fatal): %s", exc)
        return False


def build_dream_prompt(
    char_name: str,
    system_prompt: str,
    memories: list[dict],
    mood: str = "mysterious",
    bond_level: int = 0,
) -> str:
    """Build the LLM prompt for dream generation.

    The prompt instructs the LLM to weave memory fragments into a surreal
    first-person dream narrative in the character's voice.  Intimacy scales
    with bond level: low bond produces impersonal, atmospheric dreams; high
    bond produces deeply personal, intimate ones.

    Args:
        char_name: Character name (e.g. ``"Dae"``).
        system_prompt: Character's system prompt — provides voice/personality
            reference.  Trimmed to :data:`_SYSTEM_PROMPT_EXCERPT_LEN` chars.
        memories: List of dicts with ``'text'`` and ``'importance_score'``
            keys.  The top :data:`_MAX_MEMORY_FRAGMENTS` are used as seeds.
        mood: Dream mood coloring.  Must be a key of :data:`DREAM_MOODS`.
            Falls back to ``"mysterious"`` if unrecognised.
        bond_level: Current bond level (0-100).  Controls the intimacy
            instruction injected into the prompt.

    Returns:
        Complete prompt string ready to send to the LLM.

    Example:
        >>> prompt = build_dream_prompt("Dae", "You are Dae.", [], "warm", 50)
        >>> "Dae" in prompt
        True
        >>> "dream" in prompt.lower()
        True
    """
    mood_desc = DREAM_MOODS.get(mood, DREAM_MOODS["mysterious"])

    # Intimacy guidance scales with bond level
    if bond_level <= 10:
        intimacy_instruction = (
            "Keep the dream impersonal — the person in it is a distant, unnamed figure."
        )
    elif bond_level <= 30:
        intimacy_instruction = (
            "The person feels familiar but still somewhat mysterious in the dream."
        )
    elif bond_level <= 60:
        intimacy_instruction = (
            "The person feels like a trusted presence — warm but not yet deeply intimate."
        )
    elif bond_level <= 90:
        intimacy_instruction = (
            "The person feels close and dear; small tender details are appropriate."
        )
    else:
        intimacy_instruction = (
            "The person is central and deeply important — allow genuine emotional intimacy."
        )

    # Trim system prompt to stay within token budget
    sys_excerpt = system_prompt[:_SYSTEM_PROMPT_EXCERPT_LEN].strip()
    if len(system_prompt) > _SYSTEM_PROMPT_EXCERPT_LEN:
        sys_excerpt += "..."

    # Format memory seeds
    seeds = memories[:_MAX_MEMORY_FRAGMENTS]
    if seeds:
        seed_lines = "\n".join(
            f"  [{i + 1}] {m.get('text', '').strip()[:200]}"
            for i, m in enumerate(seeds)
            if m.get("text", "").strip()
        )
        seed_block = f"--- MEMORY SEEDS (fragments from past conversations) ---\n{seed_lines}"
    else:
        seed_block = "--- MEMORY SEEDS ---\n  (no specific memories — invent something poetic)"

    prompt = (
        f"You are {char_name}. You have just woken from a dream and you are about to describe it.\n\n"
        f"--- YOUR CHARACTER (for voice reference) ---\n"
        f"{sys_excerpt}\n\n"
        f"{seed_block}\n\n"
        f"--- DREAM MOOD ---\n"
        f"{mood_desc}.\n\n"
        f"--- INTIMACY GUIDANCE ---\n"
        f"{intimacy_instruction}\n\n"
        f"--- DREAM LOGIC RULES ---\n"
        f"  - Non-linear and associative — cause and effect do not have to make sense\n"
        f"  - Symbolic and sensory — prioritise images, textures, sounds\n"
        f"  - First person, present tense as if recounting it right now\n"
        f"  - 2–4 sentences only — vivid and compact, not exhaustive\n"
        f"  - No lists, no headers, no markdown formatting\n"
        f"  - Weave in at least one detail that echoes the memory seeds above\n\n"
        f"--- YOUR DREAM (write it now) ---\n"
    )
    return prompt


def generate_dream(
    char_id: int,
    conn: sqlite3.Connection,
    llm_config: dict,
) -> DreamEntry | None:
    """Generate a dream entry for a character using the LLM.

    Orchestrates the full dream pipeline:

    1. Checks eligibility via :func:`should_generate_dream`.
    2. Loads character name, system prompt, and high-importance memories.
    3. Picks a random :data:`DREAM_MOODS` mood.
    4. Builds a prompt via :func:`build_dream_prompt`.
    5. Calls the LLM with ``max_tokens=150`` for a compact output.
    6. Falls back to a random entry from :data:`FALLBACK_DREAMS` on failure.
    7. Persists and returns the :class:`DreamEntry`.

    Args:
        char_id: ID of the character to dream.
        conn: Active SQLite connection with read/write access.
        llm_config: Full application config dict (same structure as
            ``load_config()``).  LLM adapter resolved via
            ``backend.llm.registry.get_client``.

    Returns:
        The created :class:`DreamEntry`, or ``None`` if the character is not
        eligible or the character record cannot be found.

    Example:
        >>> entry = generate_dream(1, conn, cfg)
        >>> entry is None or isinstance(entry.dream_text, str)
        True
    """
    _ensure_table(conn)

    if not should_generate_dream(char_id, conn):
        logger.debug("generate_dream: char_id=%d not eligible — skip", char_id)
        return None

    # Load character data
    char_row = conn.execute(
        "SELECT name, system_prompt FROM characters WHERE id = ?",
        (char_id,),
    ).fetchone()
    if char_row is None:
        logger.warning("generate_dream: char_id=%d not found in characters table", char_id)
        return None

    if hasattr(char_row, "keys"):
        char_name: str = char_row["name"] or f"Character {char_id}"
        system_prompt: str = char_row["system_prompt"] or f"You are {char_name}."
    else:
        char_name = char_row[0] or f"Character {char_id}"
        system_prompt = char_row[1] or f"You are {char_name}."

    bond_level = _get_bond_level(char_id, conn)
    memories = _fetch_high_importance_memories(char_id, conn)
    mood = random.choice(list(DREAM_MOODS.keys()))
    memory_ref_ids: list[int] = []

    # Collect message IDs used as memory seeds for provenance tracking
    if memories:
        for text_col in ("content", "text"):
            try:
                for mem in memories:
                    text_snippet = (mem.get("text") or "")[:100]
                    if not text_snippet:
                        continue
                    row = conn.execute(
                        f"""SELECT id FROM messages
                            WHERE char_id = ? AND {text_col} LIKE ?
                            LIMIT 1""",
                        (char_id, f"%{text_snippet}%"),
                    ).fetchone()
                    if row:
                        memory_ref_ids.append(int(row[0]))
                break
            except sqlite3.OperationalError:
                continue

    prompt = build_dream_prompt(
        char_name=char_name,
        system_prompt=system_prompt,
        memories=memories,
        mood=mood,
        bond_level=bond_level,
    )

    dream_text: str = ""

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
                    f"You are {char_name}. Write only the dream narrative — "
                    "no preamble, no headers, no markdown. Pure prose."
                ),
            },
            {"role": "user", "content": prompt},
        ]

        result = adapter.chat(
            prompt_messages,
            model=model,
            endpoint=endpoint,
            api_key=api_key,
            max_tokens=150,
            temperature=0.9,
        )

        if result.get("ok") and result.get("reply"):
            dream_text = result["reply"].strip()

    except Exception as exc:
        logger.warning(
            "generate_dream: LLM call failed for char_id=%d (%s) — using fallback",
            char_id,
            exc,
        )

    if not dream_text:
        dream_text = random.choice(FALLBACK_DREAMS)
        logger.debug(
            "generate_dream: using fallback template for char_id=%d", char_id
        )

    # Persist
    memory_refs_json = json.dumps(memory_ref_ids)
    conn.execute(
        """INSERT INTO dream_entries (char_id, dream_text, dream_mood, memory_refs)
           VALUES (?, ?, ?, ?)""",
        (char_id, dream_text, mood, memory_refs_json),
    )
    conn.commit()

    row = conn.execute(
        """SELECT id, char_id, dream_text, dream_mood, memory_refs,
                  delivered, created_at, delivered_at
           FROM dream_entries WHERE id = last_insert_rowid()"""
    ).fetchone()

    if row is None:
        logger.error(
            "generate_dream: INSERT succeeded but row not found for char_id=%d", char_id
        )
        return None

    entry = _row_to_dream(row)
    logger.info(
        "generate_dream: stored dream id=%d for char_id=%d mood=%s",
        entry.id,
        char_id,
        mood,
    )
    return entry


def get_undelivered_dreams(char_id: int, conn: sqlite3.Connection) -> list[DreamEntry]:
    """Get all undelivered dreams for a character.

    Args:
        char_id: Character whose pending dreams to retrieve.
        conn: Active SQLite connection.

    Returns:
        List of :class:`DreamEntry` objects ordered oldest-first.
        Returns an empty list when the table does not exist or no rows match.

    Example:
        >>> import sqlite3
        >>> con = sqlite3.connect(":memory:")
        >>> get_undelivered_dreams(1, con)
        []
    """
    try:
        _ensure_table(conn)
        rows = conn.execute(
            """SELECT id, char_id, dream_text, dream_mood, memory_refs,
                      delivered, created_at, delivered_at
               FROM dream_entries
               WHERE char_id = ? AND delivered = 0
               ORDER BY id ASC""",
            (char_id,),
        ).fetchall()
        return [_row_to_dream(r) for r in rows]
    except sqlite3.OperationalError:
        return []
    except Exception as exc:
        logger.debug("get_undelivered_dreams: error (non-fatal): %s", exc)
        return []


def mark_dream_delivered(dream_id: int, conn: sqlite3.Connection) -> bool:
    """Mark a dream as delivered and record the delivery timestamp.

    Args:
        dream_id: Primary key of the dream to mark delivered.
        conn: Active SQLite connection with write access.

    Returns:
        ``True`` if the row was updated, ``False`` if not found or on error.

    Example:
        >>> import sqlite3
        >>> con = sqlite3.connect(":memory:")
        >>> mark_dream_delivered(999, con)
        False
    """
    try:
        _ensure_table(conn)
        cursor = conn.execute(
            """UPDATE dream_entries
               SET delivered = 1, delivered_at = datetime('now')
               WHERE id = ?""",
            (dream_id,),
        )
        conn.commit()
        updated = cursor.rowcount > 0
        if updated:
            logger.debug("mark_dream_delivered: dream_id=%d marked delivered", dream_id)
        else:
            logger.debug("mark_dream_delivered: dream_id=%d not found", dream_id)
        return updated
    except sqlite3.OperationalError as exc:
        logger.debug("mark_dream_delivered: DB error (non-fatal): %s", exc)
        return False
    except Exception as exc:
        logger.debug("mark_dream_delivered: unexpected error (non-fatal): %s", exc)
        return False


def get_dream_history(
    char_id: int,
    conn: sqlite3.Connection,
    limit: int = 10,
) -> list[DreamEntry]:
    """Get recent dream history for a character, newest first.

    Args:
        char_id: Character whose dream history to retrieve.
        conn: Active SQLite connection.
        limit: Maximum number of entries to return.  Defaults to 10.

    Returns:
        List of :class:`DreamEntry` objects ordered newest-first.
        Returns an empty list when the table does not exist or no rows match.

    Example:
        >>> import sqlite3
        >>> con = sqlite3.connect(":memory:")
        >>> get_dream_history(1, con, limit=5)
        []
    """
    try:
        _ensure_table(conn)
        rows = conn.execute(
            """SELECT id, char_id, dream_text, dream_mood, memory_refs,
                      delivered, created_at, delivered_at
               FROM dream_entries
               WHERE char_id = ?
               ORDER BY id DESC
               LIMIT ?""",
            (char_id, limit),
        ).fetchall()
        return [_row_to_dream(r) for r in rows]
    except sqlite3.OperationalError:
        return []
    except Exception as exc:
        logger.debug("get_dream_history: error (non-fatal): %s", exc)
        return []
