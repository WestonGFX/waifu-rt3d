"""Feedback score computation for AIE Phase C.

Computes a per-message score s ∈ [-1.0, +1.0] from explicit (👍/👎) and
implicit signals using configurable weights from the aie_signal_weights table.

Weighting formula::

    s_final = alpha_explicit * s_explicit + alpha_implicit * s_implicit

where::

    alpha_explicit = 0.7 if an explicit signal was recorded, else 0.0
    alpha_implicit = 0.3 (always, normalised up to 1.0 when explicit absent)

The ``alpha_*`` values sum to 1.0 in both cases:
    - Explicit present:  ``0.7 + 0.3 = 1.0``
    - Explicit absent:   ``0.0 + 1.0 = 1.0`` (implicit carries full weight)

All weights are read from the ``aie_signal_weights`` DB table (seeded by the
v76 migration).  Missing rows fall back to the module-level
:data:`DEFAULT_WEIGHTS` dict.

Schema dependencies:
    - ``aie_signal_weights`` table — ``signal_name TEXT PK, weight REAL``
    - ``message_feedback`` table — ``message_id INT PK, explicit_signal INT,
      implicit_score REAL, final_score REAL, computed_at TEXT``

Example:
    >>> from backend.adaptive.feedback.scorer import compute_final_score
    >>> score = compute_final_score(explicit_signal=1, implicit_score=0.4)
    >>> round(score, 4)
    0.82
    >>> score_no_explicit = compute_final_score(explicit_signal=None, implicit_score=-0.3)
    >>> round(score_no_explicit, 4)
    -0.3
"""

from __future__ import annotations

import logging
import sqlite3

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Weight defaults (used when DB table is absent or row is missing)
# ---------------------------------------------------------------------------

#: Default signal weights applied when ``aie_signal_weights`` is not yet
#: seeded in the database.  Keys map 1-to-1 to the signal names produced by
#: :mod:`backend.adaptive.feedback.signal_collector`.
DEFAULT_WEIGHTS: dict[str, float] = {
    "regenerate": -0.5,
    "reply_length": 0.1,
    "voice_toggle": 0.15,
    "session_continuation": 0.1,
    "abrupt_close": -0.05,
    "llm_judge": 0.2,
}

# Alpha blending coefficients (not configurable via DB — kept as constants).
_ALPHA_EXPLICIT: float = 0.7
_ALPHA_IMPLICIT_WITH_EXPLICIT: float = 0.3
_ALPHA_IMPLICIT_ALONE: float = 1.0


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def get_signal_weights(db_path: str) -> dict[str, float]:
    """Read signal weights from the ``aie_signal_weights`` table.

    Opens a **read-only** connection and returns a merged dict: starts from
    :data:`DEFAULT_WEIGHTS` and overlays any rows found in the DB.  This
    means callers always receive a complete weight dict even when some signals
    are missing from the DB (e.g. during initial setup before migration runs).

    Args:
        db_path: Filesystem path to the SQLite database.

    Returns:
        Dict mapping signal_name → weight (float).  Always contains at least
        all keys from :data:`DEFAULT_WEIGHTS`.

    Example:
        >>> weights = get_signal_weights(":memory:")
        >>> "regenerate" in weights
        True
        >>> weights["regenerate"] == DEFAULT_WEIGHTS["regenerate"]
        True
    """
    weights = dict(DEFAULT_WEIGHTS)

    try:
        uri = f"file:{db_path}?mode=ro"
        con = sqlite3.connect(uri, uri=True)
    except sqlite3.OperationalError as exc:
        logger.warning(
            "get_signal_weights: cannot open DB at %r (%s) — using defaults",
            db_path,
            exc,
        )
        return weights

    try:
        rows = con.execute(
            "SELECT signal_name, weight FROM aie_signal_weights"
        ).fetchall()
        for signal_name, weight in rows:
            weights[signal_name] = float(weight)
    except sqlite3.OperationalError:
        # Table doesn't exist yet — fall through with defaults.
        logger.debug(
            "get_signal_weights: aie_signal_weights table not found — using defaults"
        )
    except Exception as exc:
        logger.warning(
            "get_signal_weights: unexpected error reading weights (%s) — using defaults",
            exc,
        )
    finally:
        con.close()

    return weights


def compute_implicit_score(
    signals: dict[str, float],
    weights: dict[str, float],
) -> float:
    """Compute a weighted sum of implicit signals, clamped to ``[-1.0, 1.0]``.

    Only signal keys that appear in *weights* are included in the sum.
    Unknown keys in *signals* are silently ignored so that new signal sources
    can be added without breaking old callers.

    Args:
        signals: Dict of signal_name → raw float value (e.g. from
            :func:`~backend.adaptive.feedback.signal_collector.collect_session_signals`).
        weights: Dict of signal_name → weight (e.g. from
            :func:`get_signal_weights`).  Signals not present in this dict
            contribute ``0.0`` to the sum.

    Returns:
        Weighted sum clamped to ``[-1.0, 1.0]``.  Returns ``0.0`` when
        *signals* is empty or no signal key matches a weight entry.

    Example:
        >>> sigs = {"regenerate": 0.5, "session_continuation": 1.0}
        >>> w = {"regenerate": -0.5, "session_continuation": 0.1}
        >>> compute_implicit_score(sigs, w)  # 0.5*(-0.5) + 1.0*0.1 = -0.15
        -0.15
        >>> compute_implicit_score({}, w)
        0.0
    """
    if not signals:
        return 0.0

    total = sum(
        signals[name] * weight
        for name, weight in weights.items()
        if name in signals
    )
    return max(-1.0, min(1.0, total))


def compute_final_score(
    explicit_signal: int | None,
    implicit_score: float,
) -> float:
    """Combine explicit and implicit feedback into a final score ∈ ``[-1.0, +1.0]``.

    Resolution logic:

    - **Explicit present** (``-1`` or ``+1``): alpha blending
      ``0.7 * explicit + 0.3 * implicit``.
    - **Explicit absent** (``None``): implicit carries full weight
      ``1.0 * implicit``.

    The explicit signal is mapped directly: ``+1 → 1.0``, ``-1 → -1.0``.
    Values outside ``{-1, 1}`` are treated as if no explicit signal was given.

    Args:
        explicit_signal: User's explicit feedback.  ``+1`` for positive (👍),
            ``-1`` for negative (👎), or ``None`` when not provided.
        implicit_score: Pre-computed implicit score in ``[-1.0, 1.0]`` from
            :func:`compute_implicit_score`.

    Returns:
        Float in ``[-1.0, 1.0]``.

    Example:
        >>> compute_final_score(explicit_signal=1, implicit_score=0.4)
        0.82
        >>> compute_final_score(explicit_signal=-1, implicit_score=0.0)
        -0.7
        >>> compute_final_score(explicit_signal=None, implicit_score=0.6)
        0.6
        >>> compute_final_score(explicit_signal=None, implicit_score=-0.3)
        -0.3
    """
    if explicit_signal in (1, -1):
        s_explicit = float(explicit_signal)
        combined = (
            _ALPHA_EXPLICIT * s_explicit
            + _ALPHA_IMPLICIT_WITH_EXPLICIT * implicit_score
        )
    else:
        combined = _ALPHA_IMPLICIT_ALONE * implicit_score

    return max(-1.0, min(1.0, combined))


def score_and_save(
    message_id: int,
    explicit_signal: int | None,
    implicit_signals: dict[str, float],
    db_path: str,
) -> float:
    """Compute the final feedback score and upsert a row in ``message_feedback``.

    Reads signal weights from the DB (falling back to :data:`DEFAULT_WEIGHTS`),
    computes :func:`compute_implicit_score` and :func:`compute_final_score`,
    then writes the result to ``message_feedback`` using ``INSERT OR REPLACE``
    so repeated calls are idempotent.

    Args:
        message_id: Primary key of the message being scored.
        explicit_signal: User's explicit feedback (``+1``, ``-1``, or ``None``).
        implicit_signals: Dict of signal_name → raw float from session signal
            collection.  May be empty when implicit signals are unavailable.
        db_path: Filesystem path to the SQLite database.

    Returns:
        The computed ``final_score`` float in ``[-1.0, 1.0]``.

    Raises:
        sqlite3.OperationalError: If the ``message_feedback`` table does not
            exist and the migration has not been run.  Callers should catch
            and log this rather than letting it propagate to the user.

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
        ...     "  computed_at TEXT DEFAULT (datetime('now')))"
        ... )
        >>> con.commit(); con.close()
        >>> from backend.adaptive.feedback.scorer import score_and_save
        >>> score = score_and_save(42, 1, {"session_continuation": 1.0}, tmp)
        >>> -1.0 <= score <= 1.0
        True
        >>> os.unlink(tmp)
    """
    weights = get_signal_weights(db_path)
    implicit_score = compute_implicit_score(implicit_signals, weights)
    final_score = compute_final_score(explicit_signal, implicit_score)

    con = sqlite3.connect(db_path)
    try:
        con.execute(
            """INSERT OR REPLACE INTO message_feedback
               (message_id, explicit_signal, implicit_score, final_score, computed_at)
               VALUES (?, ?, ?, ?, datetime('now'))""",
            (message_id, explicit_signal, implicit_score, final_score),
        )
        con.commit()
        logger.debug(
            "score_and_save: message_id=%d explicit=%s implicit=%.4f final=%.4f",
            message_id,
            explicit_signal,
            implicit_score,
            final_score,
        )
    except sqlite3.OperationalError as exc:
        logger.warning(
            "score_and_save: message_feedback table not ready (%s) — score not persisted",
            exc,
        )
        raise
    except Exception as exc:
        logger.warning(
            "score_and_save: unexpected error for message_id=%d: %s", message_id, exc
        )
        raise
    finally:
        con.close()

    return final_score
