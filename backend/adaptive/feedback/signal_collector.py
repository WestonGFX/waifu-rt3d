"""Implicit feedback signal collection for the AIE Phase C feedback subsystem.

Analyses completed sessions to extract behavioural signals that reflect user
satisfaction without requiring explicit input.  All signals are computed from
data already present in the database — no LLM call is made.

Signals produced (all floats):
    - ``regenerate``: Fraction of assistant messages that were regenerated.
      Higher values indicate the user was unsatisfied with initial responses.
    - ``reply_length``: Normalised assistant reply length relative to the
      character's historical average.  Positive = longer than usual.
    - ``session_continuation``: ``1.0`` when the session has ≥ 5 turns,
      indicating sustained engagement.  ``0.0`` otherwise.
    - ``abrupt_close``: ``1.0`` when the last message is from the assistant
      and the session has fewer than 3 turns, suggesting the user left early
      without responding.

Schema dependencies:
    - ``messages`` table — ``id``, ``session_id``, ``role``, ``content``, ``ts``
    - ``messages.prev_gen_count`` column (optional — added by session 31 M1)

All DB access is read-only; the module never writes to the database.

Example:
    >>> from backend.adaptive.feedback.signal_collector import collect_session_signals
    >>> signals = collect_session_signals(1, 1, ":memory:")
    >>> isinstance(signals, dict)
    True
"""

from __future__ import annotations

import logging
import sqlite3

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def collect_session_signals(
    session_id: int,
    char_id: int,
    db_path: str,
) -> dict[str, float]:
    """Collect implicit feedback signals for all messages in a session.

    Signals computed:

    - ``regenerate``: Fraction of assistant messages that were regenerated
      (``prev_gen_count > 0``).  Range ``[0.0, 1.0]``.  Higher = more
      dissatisfaction.
    - ``reply_length``: Normalised assistant reply length relative to the
      character's historical per-session average across all sessions.  Formula::

          (session_avg_chars - char_avg_chars) / max(char_avg_chars, 1)

      Clamped to ``[-1.0, 1.0]``.  Positive = longer than usual (engaged).
    - ``session_continuation``: ``1.0`` if the session has ≥ 5 turns, ``0.0``
      otherwise.  Proxy for sustained user engagement.
    - ``abrupt_close``: ``1.0`` if the last message role is ``'assistant'``
      AND the turn count is < 3.  Proxy for the user leaving abruptly without
      a reply.

    The function opens a **read-only** connection and fails-soft — any error
    (missing table, locked DB, bad path) returns an empty ``dict`` with a
    ``WARNING`` log entry rather than raising.

    Args:
        session_id: Row ID of the session to analyse.
        char_id: Character ID used to look up the historical reply-length
            baseline across all sessions for that character.
        db_path: Filesystem path to the SQLite database file.  Pass
            ``":memory:"`` in tests (will produce an empty dict since the
            tables won't exist, which is the correct fail-soft behaviour).

    Returns:
        Dict mapping signal name → raw float value (before weight application).
        Returns an empty dict on any database error.

    Example:
        >>> signals = collect_session_signals(1, 1, ":memory:")
        >>> isinstance(signals, dict)
        True
        >>> signals  # empty because :memory: has no tables
        {}
    """
    try:
        uri = f"file:{db_path}?mode=ro"
        con = sqlite3.connect(uri, uri=True)
    except sqlite3.OperationalError as exc:
        logger.warning(
            "collect_session_signals: cannot open DB at %r (%s) — returning {}",
            db_path,
            exc,
        )
        return {}

    try:
        return _compute_signals(con, session_id, char_id)
    except Exception as exc:
        logger.warning(
            "collect_session_signals: session_id=%d char_id=%d — unexpected error: %s",
            session_id,
            char_id,
            exc,
        )
        return {}
    finally:
        con.close()


# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------


def _has_column(con: sqlite3.Connection, table: str, column: str) -> bool:
    """Return True if *column* exists in *table*.

    Args:
        con: Open SQLite connection.
        table: Table name to inspect.
        column: Column name to look for.

    Returns:
        ``True`` when the column is present; ``False`` otherwise.
    """
    rows = con.execute(f"PRAGMA table_info({table})").fetchall()
    # PRAGMA table_info returns: (cid, name, type, notnull, dflt_value, pk)
    return any(row[1] == column for row in rows)


def _compute_signals(
    con: sqlite3.Connection,
    session_id: int,
    char_id: int,
) -> dict[str, float]:
    """Core computation — separated so the outer try/except stays clean.

    Args:
        con: Open read-only SQLite connection.
        session_id: Session to analyse.
        char_id: Character whose historical baseline is used.

    Returns:
        Dict of signal_name → float.

    Raises:
        sqlite3.OperationalError: When expected tables are absent.
        Exception: Any other unexpected error from DB queries.
    """
    # ------------------------------------------------------------------
    # 1. Fetch all messages for the session (cheapest query first).
    # ------------------------------------------------------------------
    rows = con.execute(
        "SELECT role, content FROM messages WHERE session_id = ? ORDER BY id ASC",
        (session_id,),
    ).fetchall()

    if not rows:
        # Session has no messages — return zeroed signals rather than empty dict
        # so callers can still use all four keys.
        return {
            "regenerate": 0.0,
            "reply_length": 0.0,
            "session_continuation": 0.0,
            "abrupt_close": 0.0,
        }

    # ------------------------------------------------------------------
    # 2. Count turns and identify message subsets.
    # ------------------------------------------------------------------
    turn_count = len(rows)
    last_role = rows[-1][0]  # 'user' or 'assistant'

    assistant_rows = [(role, content) for role, content in rows if role == "assistant"]
    assistant_count = len(assistant_rows)

    # ------------------------------------------------------------------
    # 3. Regeneration signal.
    # ------------------------------------------------------------------
    regen_fraction = _compute_regen_fraction(con, session_id, assistant_count)

    # ------------------------------------------------------------------
    # 4. Reply-length signal.
    # ------------------------------------------------------------------
    reply_length_signal = _compute_reply_length_signal(
        con, session_id, char_id, assistant_rows
    )

    # ------------------------------------------------------------------
    # 5. Session-continuation signal.
    # ------------------------------------------------------------------
    session_continuation = 1.0 if turn_count >= 5 else 0.0

    # ------------------------------------------------------------------
    # 6. Abrupt-close signal.
    # ------------------------------------------------------------------
    abrupt_close = 1.0 if (last_role == "assistant" and turn_count < 3) else 0.0

    return {
        "regenerate": regen_fraction,
        "reply_length": reply_length_signal,
        "session_continuation": session_continuation,
        "abrupt_close": abrupt_close,
    }


def _compute_regen_fraction(
    con: sqlite3.Connection,
    session_id: int,
    assistant_count: int,
) -> float:
    """Compute the fraction of assistant messages that were regenerated.

    Checks whether the ``prev_gen_count`` column exists on the ``messages``
    table.  Falls back to ``0.0`` when the column is absent (pre-v31 schema).

    Args:
        con: Open SQLite connection.
        session_id: Session to query.
        assistant_count: Total assistant message count (denominator).

    Returns:
        Float in ``[0.0, 1.0]``.  Returns ``0.0`` when *assistant_count* is 0
        or when the column is absent.
    """
    if assistant_count == 0:
        return 0.0

    if not _has_column(con, "messages", "prev_gen_count"):
        logger.debug(
            "_compute_regen_fraction: prev_gen_count column absent — returning 0.0"
        )
        return 0.0

    row = con.execute(
        """SELECT COUNT(*) FROM messages
           WHERE session_id = ? AND role = 'assistant' AND prev_gen_count > 0""",
        (session_id,),
    ).fetchone()
    regen_count = row[0] if row else 0
    return min(1.0, regen_count / assistant_count)


def _compute_reply_length_signal(
    con: sqlite3.Connection,
    session_id: int,
    char_id: int,
    assistant_rows: list[tuple[str, str]],
) -> float:
    """Compute the normalised reply-length signal for this session.

    Compares the average assistant reply length in *session_id* to the
    character's historical average across all sessions.  The result is
    clamped to ``[-1.0, 1.0]``.

    Args:
        con: Open SQLite connection.
        session_id: Current session (used to exclude from baseline when
            the character has only one session).
        char_id: Character whose global average is used as the baseline.
        assistant_rows: List of ``(role, content)`` tuples from this session
            (already filtered to assistant messages).

    Returns:
        Float in ``[-1.0, 1.0]``.  Returns ``0.0`` when there are no assistant
        messages in this session.
    """
    if not assistant_rows:
        return 0.0

    session_avg = sum(len(content) for _, content in assistant_rows) / len(assistant_rows)

    # Character-wide baseline: average reply length across ALL sessions.
    # We deliberately include the current session so that new characters with
    # only one session still get a meaningful comparison point (the result is
    # 0.0, which is neutral — correct behaviour).
    row = con.execute(
        """SELECT AVG(LENGTH(m.content))
           FROM messages m
           JOIN sessions s ON m.session_id = s.id
           WHERE s.char_id = ? AND m.role = 'assistant'""",
        (char_id,),
    ).fetchone()

    char_avg = row[0] if (row and row[0] is not None) else 0.0

    if char_avg <= 0.0:
        return 0.0

    raw = (session_avg - char_avg) / max(char_avg, 1.0)
    return max(-1.0, min(1.0, raw))
