"""ShareGPT-format training corpus builder for per-character LoRA fine-tuning.

Reads conversation history from the app SQLite database, filters messages by
quality signals (length, feedback score), and writes a JSONL file where each
line is a ShareGPT conversation object ready for Unsloth training.

All processing runs locally — no data leaves the machine.

Schema dependency:
    - ``messages`` table: id, session_id, character_id, role, content columns
      (present from v3 initial schema)
    - ``message_feedback`` table: message_id, final_score columns
      (added by v76 migration — LEFT JOIN used so pre-v76 DBs still work)
    - ``characters`` table: id, name, system_prompt columns
      (present from v4 migration)

Example:
    >>> from pathlib import Path
    >>> from backend.adaptive.finetune.corpus_builder import build_corpus, CorpusConfig
    >>> cfg = CorpusConfig(
    ...     char_name="Sakura",
    ...     db_path=Path("backend/storage/app.db"),
    ...     output_path=Path("/tmp/sakura_corpus.jsonl"),
    ... )
    >>> stats = build_corpus(cfg)
    >>> print(f"Included {stats.included_messages} messages")
"""

from __future__ import annotations

import json
import logging
import sqlite3
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------


@dataclass
class CorpusConfig:
    """Configuration for a corpus build run.

    Attributes:
        char_name: Display name of the character to build a corpus for
            (e.g. ``"Sakura"``).  Must match the ``characters.name`` column.
        db_path: Filesystem path to the SQLite database file.
        output_path: Destination path for the generated ``.jsonl`` file.
            Parent directory must exist.
        min_final_score: Minimum ``message_feedback.final_score`` required to
            include an assistant message.  A value of ``0.0`` (the default)
            means all scored messages pass; messages with *no* feedback row are
            always included regardless of this threshold.
        min_assistant_length: Minimum character count for assistant message
            content.  Replies shorter than this are skipped.  Defaults to
            ``20``.
        max_session_messages: Maximum messages fetched per session to prevent
            repetitive fine-tuning data when a session is abnormally long.
            Defaults to ``100``.
        system_prompt_override: When set, this string is used as the system
            turn in every ShareGPT conversation instead of the value stored in
            ``characters.system_prompt``.  Pass ``None`` to use the DB value.
    """

    char_name: str
    db_path: Path
    output_path: Path
    min_final_score: float = 0.0
    min_assistant_length: int = 20
    max_session_messages: int = 100
    system_prompt_override: str | None = None


@dataclass
class CorpusStats:
    """Statistics produced by a single :func:`build_corpus` call.

    Attributes:
        total_sessions: Number of distinct sessions examined.
        total_messages: Total message rows fetched across all sessions.
        included_messages: Messages that passed all filters and were written
            to the output file.
        excluded_low_score: Messages skipped because their ``final_score`` was
            below ``CorpusConfig.min_final_score``.
        excluded_too_short: Messages skipped because the assistant reply was
            shorter than ``CorpusConfig.min_assistant_length`` characters.
        output_path: Resolved path of the file that was written.
    """

    total_sessions: int = 0
    total_messages: int = 0
    included_messages: int = 0
    excluded_low_score: int = 0
    excluded_too_short: int = 0
    output_path: Path = field(default_factory=lambda: Path("."))


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def build_corpus(config: CorpusConfig) -> CorpusStats:
    """Build a ShareGPT-format JSONL corpus for LoRA fine-tuning.

    Connects to the SQLite database at ``config.db_path``, fetches all
    sessions for the named character, filters messages by quality, and writes
    one ShareGPT conversation object per session to ``config.output_path``.

    Each output line has the shape::

        {
            "conversations": [
                {"from": "system", "value": "<system prompt>"},
                {"from": "human",  "value": "<user message>"},
                {"from": "gpt",    "value": "<assistant reply>"},
                ...
            ]
        }

    The system turn is omitted when neither ``config.system_prompt_override``
    nor the DB ``system_prompt`` column provides a non-empty string.

    Args:
        config: :class:`CorpusConfig` describing the character, paths, and
            quality filters to apply.

    Returns:
        :class:`CorpusStats` with counts of included and excluded messages.

    Raises:
        ValueError: If the character name is not found in the ``characters``
            table of the database.
        sqlite3.Error: If the database file cannot be opened or queried.

    Example:
        >>> from pathlib import Path
        >>> from backend.adaptive.finetune.corpus_builder import build_corpus, CorpusConfig
        >>> cfg = CorpusConfig(
        ...     char_name="Sakura",
        ...     db_path=Path("backend/storage/app.db"),
        ...     output_path=Path("/tmp/sakura_corpus.jsonl"),
        ... )
        >>> stats = build_corpus(cfg)
        >>> print(f"Included {stats.included_messages} messages")
    """
    stats = CorpusStats(output_path=config.output_path.resolve())

    con = sqlite3.connect(str(config.db_path))
    try:
        con.row_factory = sqlite3.Row

        # Step 1 — resolve character id and system prompt.
        char_id, db_system_prompt = _get_character(con, config.char_name)
        system_prompt = config.system_prompt_override or db_system_prompt or ""

        logger.info(
            "build_corpus: character '%s' found (id=%d), system_prompt=%s",
            config.char_name,
            char_id,
            "override" if config.system_prompt_override else ("db" if system_prompt else "none"),
        )

        # Step 2 — fetch distinct session ids for this character.
        session_rows = con.execute(
            "SELECT DISTINCT session_id FROM messages"
            " WHERE character_id = ?"
            " ORDER BY session_id",
            (char_id,),
        ).fetchall()

        stats.total_sessions = len(session_rows)
        logger.info(
            "build_corpus: found %d sessions for '%s'",
            stats.total_sessions,
            config.char_name,
        )

        # Step 3 — build and write conversations.
        config.output_path.parent.mkdir(parents=True, exist_ok=True)
        with config.output_path.open("w", encoding="utf-8") as out_fh:
            for session_row in session_rows:
                session_id: str = session_row["session_id"]
                conversation = _build_conversation(
                    con=con,
                    char_id=char_id,
                    session_id=session_id,
                    system_prompt=system_prompt,
                    config=config,
                    stats=stats,
                )
                if conversation:
                    out_fh.write(json.dumps({"conversations": conversation}, ensure_ascii=False))
                    out_fh.write("\n")
    finally:
        con.close()

    logger.info(
        "build_corpus: done — %d included, %d low-score, %d too-short → %s",
        stats.included_messages,
        stats.excluded_low_score,
        stats.excluded_too_short,
        config.output_path,
    )
    return stats


# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------


def _get_character(con: sqlite3.Connection, name: str) -> tuple[int, str | None]:
    """Return ``(char_id, system_prompt)`` for the named character.

    Args:
        con: An open :class:`sqlite3.Connection` with ``row_factory`` set.
        name: Display name to look up in the ``characters`` table.

    Returns:
        A 2-tuple of the integer primary key and the raw ``system_prompt``
        string (which may be ``None`` when the column is empty).

    Raises:
        ValueError: If no row matches *name* in the ``characters`` table.

    Example:
        >>> import sqlite3
        >>> con = sqlite3.connect(":memory:")
        >>> con.row_factory = sqlite3.Row
        >>> _ = con.execute(
        ...     "CREATE TABLE characters (id INTEGER PRIMARY KEY, name TEXT, system_prompt TEXT)"
        ... )
        >>> _ = con.execute("INSERT INTO characters VALUES (1, 'Sakura', 'You are Sakura.')")
        >>> _get_character(con, "Sakura")
        (1, 'You are Sakura.')
    """
    row = con.execute(
        "SELECT id, system_prompt FROM characters WHERE name = ?",
        (name,),
    ).fetchone()

    if row is None:
        raise ValueError(
            f"Character '{name}' not found in the database. "
            "Check the spelling or ensure the character has been created."
        )

    return int(row["id"]), row["system_prompt"]


def _build_conversation(
    con: sqlite3.Connection,
    char_id: int,
    session_id: str,
    system_prompt: str,
    config: CorpusConfig,
    stats: CorpusStats,
) -> list[dict[str, Any]]:
    """Fetch and filter messages for one session, returning ShareGPT turns.

    Queries messages for *session_id*, applies length and score filters, and
    assembles a list of ``{"from": ..., "value": ...}`` dicts.  The optional
    system turn is prepended when *system_prompt* is non-empty.

    Args:
        con: Open :class:`sqlite3.Connection`.
        char_id: Integer character primary key.
        session_id: Session identifier string.
        system_prompt: System turn text (may be empty string to omit the turn).
        config: :class:`CorpusConfig` providing filter thresholds.
        stats: :class:`CorpusStats` accumulator mutated in place.

    Returns:
        List of ShareGPT turn dicts.  Returns an empty list when the session
        yields no usable human/gpt pairs after filtering.
    """
    # Fetch messages with optional feedback join — LEFT JOIN ensures rows from
    # pre-v76 databases (without message_feedback) are still returned.
    rows = con.execute(
        """
        SELECT m.id, m.role, m.content, mf.final_score
          FROM messages m
          LEFT JOIN message_feedback mf ON mf.message_id = m.id
         WHERE m.session_id = ?
           AND m.character_id = ?
         ORDER BY m.id ASC
         LIMIT ?
        """,
        (session_id, char_id, config.max_session_messages),
    ).fetchall()

    stats.total_messages += len(rows)
    logger.debug(
        "build_corpus: session '%s' — fetched %d messages", session_id, len(rows)
    )

    turns: list[dict[str, Any]] = []

    for row in rows:
        role: str = row["role"]  # "user" or "assistant"
        content: str = row["content"] or ""
        final_score: float | None = row["final_score"]

        if role == "assistant":
            # Filter 1: minimum reply length.
            if len(content) < config.min_assistant_length:
                stats.excluded_too_short += 1
                logger.debug(
                    "build_corpus: skipping message id=%d (too short: %d chars)",
                    row["id"],
                    len(content),
                )
                continue

            # Filter 2: quality score — only applied when a score exists.
            # Messages with no feedback row (final_score IS NULL) are always
            # included so that we don't discard data from sessions predating
            # the v76 feedback subsystem.
            if final_score is not None and final_score < config.min_final_score:
                stats.excluded_low_score += 1
                logger.debug(
                    "build_corpus: skipping message id=%d (score %.3f < %.3f)",
                    row["id"],
                    final_score,
                    config.min_final_score,
                )
                continue

            turns.append({"from": "gpt", "value": content})
            stats.included_messages += 1

        elif role == "user":
            turns.append({"from": "human", "value": content})

        # Roles other than "user"/"assistant" (e.g. "system" inline) are
        # intentionally skipped — the system prompt is handled separately.

    if not turns:
        return []

    # Prepend the system turn when a system prompt is available.
    if system_prompt:
        turns = [{"from": "system", "value": system_prompt}] + turns

    return turns
