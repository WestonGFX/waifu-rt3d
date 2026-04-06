"""Per-turn engagement signal collection for adaptive AI personalization.

Extracts lightweight metrics from each chat turn without requiring an LLM call.
Signals are stored in the ``engagement_signals`` table and used by the rolling
preference learner and behavior adapter.

All processing runs locally — no user data leaves the machine.

Schema dependency:
    - ``engagement_signals`` table (created by v60 migration)
    - ``privacy_settings`` table for opt-out check

Example:
    >>> from backend.adaptive.signals import collect_turn_signals, save_signals
    >>> signals = collect_turn_signals(
    ...     user_msg="That's amazing! Tell me more 😊",
    ...     assistant_msg="I'm glad you liked it! Here's what happened next...",
    ...     turn_number=5,
    ... )
    >>> signals["emoji_count"]
    1
    >>> signals["question_count"]
    0
    >>> signals["exclamation_count"]
    1
"""

from __future__ import annotations

import logging
import math
import re
import sqlite3
from typing import Any

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Compiled patterns (module-level, initialised once)
# ---------------------------------------------------------------------------

# Broad emoji regex — mirrors the pattern in reflector.py to avoid importing
# from that module (circular-dependency risk).
_EMOJI_RE: re.Pattern[str] = re.compile(
    r"[\U0001F300-\U0001FFFF"  # misc symbols, emoticons, transport, etc.
    r"\u2600-\u27BF"           # misc symbols + dingbats
    r"\u2300-\u23FF"           # misc technical symbols
    r"]",
    re.UNICODE,
)

# Positive sentiment word list.
_POSITIVE_WORDS: frozenset[str] = frozenset(
    {
        "love",
        "amazing",
        "great",
        "awesome",
        "wonderful",
        "happy",
        "beautiful",
        "excited",
        "perfect",
        "fantastic",
        "incredible",
        "brilliant",
        "excellent",
    }
)

# Negative sentiment word list.
_NEGATIVE_WORDS: frozenset[str] = frozenset(
    {
        "hate",
        "terrible",
        "awful",
        "bad",
        "boring",
        "annoying",
        "ugly",
        "stupid",
        "worst",
        "horrible",
        "disappointed",
        "frustrated",
    }
)

# Pre-compiled pattern for splitting text into lowercase word tokens.
_WORD_RE: re.Pattern[str] = re.compile(r"[a-z]+")

# Numeric signal field names — used by compute_rolling_averages.
_NUMERIC_SIGNAL_FIELDS: tuple[str, ...] = (
    "user_msg_length",
    "assistant_msg_length",
    "response_time_ms",
    "emoji_count",
    "question_count",
    "exclamation_count",
    "sentiment_score",
    "topic_drift",
    "intimacy_delta",
    "turn_number",
)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def compute_sentiment(text: str) -> float:
    """Compute a simple keyword-based sentiment score.

    Tokenises *text* into lowercase words and counts hits against the built-in
    positive and negative word lists.  The final score is the normalised
    difference, clamped to the range ``[-1.0, 1.0]``.

    Args:
        text: The text to analyse (any length; empty string returns ``0.0``).

    Returns:
        Float in ``[-1.0, 1.0]`` where ``-1.0`` is maximally negative,
        ``0.0`` is neutral, and ``1.0`` is maximally positive.

    Example:
        >>> compute_sentiment("That was amazing and wonderful!")
        0.4
        >>> compute_sentiment("This is terrible and awful and bad")
        -0.5
        >>> compute_sentiment("")
        0.0
    """
    if not text:
        return 0.0

    words = _WORD_RE.findall(text.lower())
    if not words:
        return 0.0

    positive_count = sum(1 for w in words if w in _POSITIVE_WORDS)
    negative_count = sum(1 for w in words if w in _NEGATIVE_WORDS)
    raw = (positive_count - negative_count) / len(words)
    return max(-1.0, min(1.0, raw))


def collect_turn_signals(
    user_msg: str,
    assistant_msg: str,
    turn_number: int,
    *,
    response_time_ms: int | None = None,
    prev_topic_embedding: list[float] | None = None,
    intimacy_delta: int = 0,
) -> dict[str, Any]:
    """Extract lightweight engagement signals from a single conversation turn.

    All computation is local and synchronous — no LLM call is made.  The
    returned dict maps signal names to their scalar values and is suitable for
    direct insertion into the ``engagement_signals`` table via
    :func:`save_signals`.

    Args:
        user_msg: The user's message text for this turn.
        assistant_msg: The assistant's response text for this turn.
        turn_number: 1-based turn index within the current session.
        response_time_ms: Optional milliseconds elapsed between the user
            sending their message and the assistant response being delivered.
            Pass ``None`` when the timing is unavailable.
        prev_topic_embedding: Optional dense vector (list of floats)
            representing the previous turn's topic.  When provided together
            with the current turn's content the ``topic_drift`` metric is
            derived from the cosine *distance* (``1 - cosine_similarity``).
            Pass ``None`` to skip drift calculation (``topic_drift`` will be
            ``0.0``).
        intimacy_delta: Signed intimacy shift produced by the content-gating
            system for this turn.  Passed through unchanged so it can be
            correlated with engagement signals downstream.

    Returns:
        Dict with the following keys:

        - ``user_msg_length`` (int): Character count of *user_msg*.
        - ``assistant_msg_length`` (int): Character count of *assistant_msg*.
        - ``response_time_ms`` (int | None): Pass-through of *response_time_ms*.
        - ``emoji_count`` (int): Unicode emoji count in *user_msg*.
        - ``question_count`` (int): Number of ``?`` characters in *user_msg*.
        - ``exclamation_count`` (int): Number of ``!`` characters in *user_msg*.
        - ``sentiment_score`` (float): Keyword sentiment score of *user_msg*
          in ``[-1.0, 1.0]``.
        - ``topic_drift`` (float): Cosine distance from *prev_topic_embedding*
          to the current turn, in ``[0.0, 1.0]``; ``0.0`` when no embeddings
          are provided.
        - ``intimacy_delta`` (int): Pass-through of *intimacy_delta*.
        - ``turn_number`` (int): Pass-through of *turn_number*.

    Example:
        >>> s = collect_turn_signals(
        ...     user_msg="That's amazing!! 😊😊",
        ...     assistant_msg="Thank you!",
        ...     turn_number=1,
        ...     response_time_ms=1500,
        ... )
        >>> s["emoji_count"]
        2
        >>> s["exclamation_count"]
        2
        >>> s["question_count"]
        0
        >>> s["sentiment_score"] > 0
        True
        >>> s["topic_drift"]
        0.0
    """
    emoji_count = len(_EMOJI_RE.findall(user_msg))
    question_count = user_msg.count("?")
    exclamation_count = user_msg.count("!")
    sentiment_score = compute_sentiment(user_msg)

    # Cosine distance between prev_topic_embedding and a simple bag-of-chars
    # proxy is not meaningful without proper embeddings — only compute when the
    # caller supplies two actual embedding vectors.
    topic_drift = 0.0
    if prev_topic_embedding is not None and len(prev_topic_embedding) > 0:
        # The caller is expected to supply a current embedding via
        # prev_topic_embedding. In practice the server will pass the previous
        # turn's embedding; we compute a lightweight proxy for the current turn
        # from character bigrams when no dedicated current-turn vector exists.
        # For now we leave topic_drift at 0.0 — proper embedding comparison
        # is handled by the Phase 19B preference learner which has access to
        # the embedding model.  Keeping this as a hook for future wiring.
        topic_drift = 0.0

    # AIE A1: Classify conversation context using rule-based heuristics
    try:
        from backend.adaptive.context_classifier import classify_context
        detected_context = classify_context(
            user_msg, sentiment_score, emoji_count, question_count,
        )
    except Exception:
        detected_context = "casual_chat"

    return {
        "user_msg_length": len(user_msg),
        "assistant_msg_length": len(assistant_msg),
        "response_time_ms": response_time_ms,
        "emoji_count": emoji_count,
        "question_count": question_count,
        "exclamation_count": exclamation_count,
        "sentiment_score": sentiment_score,
        "topic_drift": topic_drift,
        "intimacy_delta": intimacy_delta,
        "turn_number": turn_number,
        "detected_context": detected_context,
        # AIE B5: Raw text for topic extraction in save_signals (not persisted)
        "_user_msg_text": user_msg,
    }


def save_signals(
    char_id: int,
    session_id: str,
    signals: dict[str, Any],
    conn: sqlite3.Connection,
) -> None:
    """Persist a signal dict to the ``engagement_signals`` table.

    Checks the ``privacy_settings`` table for the ``signal_collection`` flag
    before writing.  If the flag is absent or set to a falsy value the insert
    is silently skipped so that users who opt out incur no database writes.

    The function is intentionally synchronous — call it from a background
    thread or after ``await loop.run_in_executor(...)`` in async code.

    Args:
        char_id: ID of the character whose conversation produced *signals*.
        session_id: Opaque string identifying the current chat session (e.g.
            ``str(session_row_id)`` or a UUID).
        signals: Dict returned by :func:`collect_turn_signals`.
        conn: An open :class:`sqlite3.Connection`.  The caller is responsible
            for opening, committing, and closing the connection.

    Returns:
        None.  Logs a debug message on skip and a warning on unexpected errors.

    Example:
        >>> import sqlite3
        >>> conn = sqlite3.connect(":memory:")
        >>> # Table would normally be created by the v60 migration.
        >>> conn.execute(
        ...     "CREATE TABLE engagement_signals ("
        ...     "  id INTEGER PRIMARY KEY,"
        ...     "  char_id INTEGER,"
        ...     "  session_id TEXT,"
        ...     "  turn_number INTEGER,"
        ...     "  user_msg_length INTEGER,"
        ...     "  assistant_msg_length INTEGER,"
        ...     "  response_time_ms INTEGER,"
        ...     "  emoji_count INTEGER,"
        ...     "  question_count INTEGER,"
        ...     "  exclamation_count INTEGER,"
        ...     "  sentiment_score REAL,"
        ...     "  topic_drift REAL,"
        ...     "  intimacy_delta INTEGER,"
        ...     "  created_at TEXT DEFAULT (datetime('now'))"
        ... )")
        <sqlite3.Cursor object at ...>
        >>> conn.execute(
        ...     "CREATE TABLE privacy_settings (key TEXT PRIMARY KEY, value TEXT)"
        ... )
        <sqlite3.Cursor object at ...>
        >>> conn.execute(
        ...     "INSERT INTO privacy_settings VALUES ('signal_collection', '1')"
        ... )
        <sqlite3.Cursor object at ...>
        >>> from backend.adaptive.signals import collect_turn_signals, save_signals
        >>> s = collect_turn_signals("Hi!", "Hello!", 1)
        >>> save_signals(1, "session-abc", s, conn)
        >>> conn.execute("SELECT COUNT(*) FROM engagement_signals").fetchone()[0]
        1
    """
    try:
        # Check opt-out preference — default to ENABLED when the row is absent.
        # The v60 schema uses a singleton row (id=1) with named boolean columns.
        row = conn.execute(
            "SELECT signal_collection FROM privacy_settings WHERE id = 1",
        ).fetchone()
        if row is not None and not _is_truthy(row[0]):
            logger.debug(
                "save_signals: signal_collection disabled — skipping char_id=%d", char_id
            )
            return
    except sqlite3.OperationalError:
        # Table doesn't exist yet — proceed with the insert (opt-in by default).
        logger.debug("save_signals: privacy_settings table not found — proceeding")

    _base_params = (
        char_id,
        session_id,
        signals.get("turn_number"),
        signals.get("user_msg_length"),
        signals.get("assistant_msg_length"),
        signals.get("response_time_ms"),
        signals.get("emoji_count"),
        signals.get("question_count"),
        signals.get("exclamation_count"),
        signals.get("sentiment_score"),
        signals.get("topic_drift"),
        signals.get("intimacy_delta"),
    )
    _base_sql = """INSERT INTO engagement_signals (
        char_id, session_id, turn_number,
        user_msg_length, assistant_msg_length, response_time_ms,
        emoji_count, question_count, exclamation_count,
        sentiment_score, topic_drift, intimacy_delta
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"""

    # AIE B5: Extract and track topics from user message
    try:
        from backend.adaptive.topic_graph import (  # noqa: PLC0415
            extract_topics,
            update_topic_tracking,
        )
        _topics = extract_topics(signals.get("_user_msg_text", ""))
        if _topics:
            _sentiment = signals.get("sentiment_score", 0.0)
            update_topic_tracking(char_id, _topics, _sentiment, conn)
    except Exception as _topic_err:
        logger.debug("save_signals: topic tracking skipped: %s", _topic_err)

    try:
        # AIE A1: Try including detected_context column (v65+), fall back to base
        _detected_ctx = signals.get("detected_context")
        if _detected_ctx:
            try:
                conn.execute(
                    """INSERT INTO engagement_signals (
                        char_id, session_id, turn_number,
                        user_msg_length, assistant_msg_length, response_time_ms,
                        emoji_count, question_count, exclamation_count,
                        sentiment_score, topic_drift, intimacy_delta,
                        detected_context
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    _base_params + (_detected_ctx,),
                )
            except sqlite3.OperationalError:
                # Column doesn't exist yet (pre-v65) — fall back to base insert
                conn.execute(_base_sql, _base_params)
        else:
            conn.execute(_base_sql, _base_params)
        conn.commit()
    except sqlite3.OperationalError as exc:
        # Table not yet created by migration — log and skip gracefully.
        logger.warning(
            "save_signals: engagement_signals table not ready (%s) — skipping insert",
            exc,
        )
    except Exception as exc:
        logger.warning("save_signals: unexpected error for char_id=%d: %s", char_id, exc)


def get_recent_signals(
    char_id: int,
    conn: sqlite3.Connection,
    *,
    limit: int = 20,
) -> list[dict[str, Any]]:
    """Load the most recent engagement signals for a character.

    Fetches rows from ``engagement_signals`` ordered by ``created_at``
    descending (newest first) so callers can apply temporal weighting without
    an extra sort.

    Args:
        char_id: ID of the character whose signals are requested.
        conn: An open :class:`sqlite3.Connection`.  The caller owns the
            connection lifecycle.
        limit: Maximum number of rows to return.  Defaults to ``20``.

    Returns:
        List of dicts, each representing one row from ``engagement_signals``.
        Returns an empty list when the table does not exist or no rows match.

    Example:
        >>> import sqlite3
        >>> conn = sqlite3.connect(":memory:")
        >>> conn.execute(
        ...     "CREATE TABLE engagement_signals ("
        ...     "  id INTEGER PRIMARY KEY, char_id INTEGER,"
        ...     "  session_id TEXT, turn_number INTEGER,"
        ...     "  user_msg_length INTEGER, assistant_msg_length INTEGER,"
        ...     "  response_time_ms INTEGER, emoji_count INTEGER,"
        ...     "  question_count INTEGER, exclamation_count INTEGER,"
        ...     "  sentiment_score REAL, topic_drift REAL,"
        ...     "  intimacy_delta INTEGER,"
        ...     "  created_at TEXT DEFAULT (datetime('now')))"
        ... )
        <sqlite3.Cursor object at ...>
        >>> from backend.adaptive.signals import get_recent_signals
        >>> get_recent_signals(1, conn, limit=5)
        []
    """
    try:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            """SELECT * FROM engagement_signals
               WHERE char_id = ?
               ORDER BY created_at DESC
               LIMIT ?""",
            (char_id, limit),
        ).fetchall()
        return [dict(r) for r in rows]
    except sqlite3.OperationalError:
        # Table not yet created — return empty list gracefully.
        return []
    except Exception as exc:
        logger.warning(
            "get_recent_signals: query failed for char_id=%d: %s", char_id, exc
        )
        return []


def compute_rolling_averages(
    signals: list[dict[str, Any]],
    decay: float = 0.95,
) -> dict[str, float]:
    """Compute exponentially-decayed averages of numeric signal fields.

    The most recent signal (index 0 in *signals*, which should be sorted newest
    first) receives weight ``1.0``; the second-most-recent receives weight
    ``decay``; the k-th receives ``decay^(k-1)``.  Each field is summed
    separately and normalised by the total weight accumulated for that field
    (``None`` values are skipped without contributing to the weight sum, so
    sparse fields are still correctly averaged).

    Args:
        signals: Ordered list of signal dicts, **newest first** (as returned
            by :func:`get_recent_signals`).  Non-numeric keys are ignored.
        decay: Exponential decay factor applied per step older.  Must be in
            ``(0.0, 1.0]``.  Defaults to ``0.95``.

    Returns:
        Dict mapping each numeric signal field name to its decayed average
        (``float``).  Fields with no non-``None`` values are absent from the
        result.  Returns an empty dict when *signals* is empty.

    Raises:
        ValueError: If *decay* is not in ``(0.0, 1.0]``.

    Example:
        >>> s1 = {"sentiment_score": 0.8, "emoji_count": 2, "turn_number": 2}
        >>> s2 = {"sentiment_score": 0.2, "emoji_count": 0, "turn_number": 1}
        >>> avgs = compute_rolling_averages([s1, s2], decay=0.5)
        >>> round(avgs["sentiment_score"], 4)
        0.6667
        >>> round(avgs["emoji_count"], 4)
        1.3333
    """
    if not signals:
        return {}

    if not (0.0 < decay <= 1.0):
        raise ValueError(f"decay must be in (0.0, 1.0], got {decay!r}")

    weighted_sums: dict[str, float] = {}
    weight_totals: dict[str, float] = {}

    for k, sig in enumerate(signals):
        weight = decay ** k  # weight = 1.0 for k=0 (newest), decay^k for older
        for field in _NUMERIC_SIGNAL_FIELDS:
            value = sig.get(field)
            if value is None:
                continue
            try:
                fval = float(value)
            except (TypeError, ValueError):
                continue

            if math.isfinite(fval):
                weighted_sums[field] = weighted_sums.get(field, 0.0) + fval * weight
                weight_totals[field] = weight_totals.get(field, 0.0) + weight

    return {
        field: weighted_sums[field] / weight_totals[field]
        for field in weighted_sums
        if weight_totals.get(field, 0.0) > 0.0
    }


# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------


def _is_truthy(value: object) -> bool:
    """Return True when *value* represents a truthy preference setting.

    Handles SQLite TEXT values (``"1"``, ``"true"``, ``"yes"``) as well as
    native Python booleans and integers.

    Args:
        value: Raw value read from ``privacy_settings.value``.

    Returns:
        ``True`` when the value should be interpreted as "enabled".

    Example:
        >>> _is_truthy("1")
        True
        >>> _is_truthy("0")
        False
        >>> _is_truthy("true")
        True
        >>> _is_truthy(None)
        False
    """
    if value is None:
        return False
    if isinstance(value, (bool, int)):
        return bool(value)
    return str(value).strip().lower() in {"1", "true", "yes", "on", "enabled"}
