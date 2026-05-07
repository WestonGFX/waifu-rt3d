"""AIE Phase C feedback subsystem.

Provides three entry points for collecting and scoring user feedback on
assistant messages.  All signals remain local — nothing leaves the device.

Public API::

    from backend.adaptive.feedback import (
        collect_implicit_signals,
        score_message,
        record_explicit_signal,
    )

Functions:
    collect_implicit_signals: Alias for
        :func:`~backend.adaptive.feedback.signal_collector.collect_session_signals`.
        Derives implicit behavioural signals from a completed session.

    score_message: Alias for
        :func:`~backend.adaptive.feedback.scorer.score_and_save`.
        Computes the final blended score and persists it to ``message_feedback``.

    record_explicit_signal: Convenience wrapper that saves a 👍/👎 rating for
        a message and updates its score immediately (with no implicit signals
        unless the caller also passes them).

Example:
    >>> from backend.adaptive.feedback import collect_implicit_signals
    >>> signals = collect_implicit_signals(session_id=1, char_id=1, db_path=":memory:")
    >>> isinstance(signals, dict)
    True
"""

from __future__ import annotations

import logging
import sqlite3

from backend.adaptive.feedback.signal_collector import collect_session_signals
from backend.adaptive.feedback.scorer import score_and_save

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Public re-exports with stable, caller-friendly names
# ---------------------------------------------------------------------------

#: Collect implicit feedback signals for a completed session.
#:
#: Args:
#:     session_id: Row ID of the session to analyse.
#:     char_id: Character ID used for the reply-length baseline.
#:     db_path: Path to the SQLite database.
#:
#: Returns:
#:     Dict mapping signal name → float.  Empty dict on any DB error.
collect_implicit_signals = collect_session_signals

#: Compute the blended feedback score and upsert it into ``message_feedback``.
#:
#: Args:
#:     message_id: Primary key of the message.
#:     explicit_signal: ``+1``, ``-1``, or ``None``.
#:     implicit_signals: Dict from :func:`collect_implicit_signals`.
#:     db_path: Path to the SQLite database.
#:
#: Returns:
#:     Final score float in ``[-1.0, 1.0]``.
score_message = score_and_save


def record_explicit_signal(
    message_id: int,
    signal: int,
    db_path: str,
    implicit_signals: dict[str, float] | None = None,
) -> float:
    """Record an explicit 👍 / 👎 rating for a message and compute its score.

    Convenience wrapper around :func:`score_message` that treats the explicit
    rating as the primary input.  Implicit signals are optional — pass them
    when available for a more accurate final score; omit them to score from
    the explicit rating alone (implicit contribution collapses to ``0.0``).

    Args:
        message_id: Primary key of the message being rated.
        signal: Explicit user feedback: ``+1`` for positive (👍) or ``-1``
            for negative (👎).  Values outside ``{-1, +1}`` are passed through
            unchanged and are treated as "no explicit signal" by the scorer.
        db_path: Filesystem path to the SQLite database.
        implicit_signals: Optional dict of signal_name → float from
            :func:`collect_implicit_signals`.  Defaults to an empty dict
            (no implicit contribution beyond the explicit rating).

    Returns:
        Final score in ``[-1.0, 1.0]`` as returned by :func:`score_message`.
        Returns ``float(signal)`` clamped to ``[-1.0, 1.0]`` on any unexpected
        error, so the caller always gets a usable value.

    Example:
        >>> import sqlite3, tempfile, os
        >>> tmp = tempfile.mktemp(suffix=".db")
        >>> con = sqlite3.connect(tmp)
        >>> _ = con.execute(
        ...     "CREATE TABLE message_feedback ("
        ...     "  message_id INTEGER PRIMARY KEY,"
        ...     "  explicit_signal INTEGER,"
        ...     "  implicit_score REAL,"
        ...     "  final_score REAL,"
        ...     "  updated_at TEXT DEFAULT (datetime('now')))"
        ... )
        >>> con.commit(); con.close()
        >>> from backend.adaptive.feedback import record_explicit_signal
        >>> score = record_explicit_signal(99, 1, tmp)
        >>> round(score, 2)
        0.7
        >>> os.unlink(tmp)
    """
    sigs: dict[str, float] = implicit_signals or {}
    try:
        return score_message(
            message_id=message_id,
            explicit_signal=signal,
            implicit_signals=sigs,
            db_path=db_path,
        )
    except sqlite3.OperationalError:
        # Table not yet migrated — fall back to a simple clamped value so the
        # caller can at least use the score in-memory without a DB round-trip.
        logger.warning(
            "record_explicit_signal: message_feedback table not ready for "
            "message_id=%d — returning clamped explicit value",
            message_id,
        )
        return max(-1.0, min(1.0, float(signal)))
    except Exception as exc:
        logger.warning(
            "record_explicit_signal: message_id=%d unexpected error: %s — "
            "returning clamped explicit value",
            message_id,
            exc,
        )
        return max(-1.0, min(1.0, float(signal)))


__all__ = [
    "collect_implicit_signals",
    "score_message",
    "record_explicit_signal",
]
