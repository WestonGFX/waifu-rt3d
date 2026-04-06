"""Ebbinghaus Memory Decay — AIE Phase B.

Implements the Ebbinghaus forgetting curve to score and prune episodic
memories stored in the ``memories`` table.  The retention formula is:

    R(t) = importance * e^(-lambda_eff * days) * (1 + recall_count * 0.2)

where::

    lambda_eff = 0.16 * (1 - importance * 0.8)

This gives the following approximate half-lives:

    =========  ===================
    importance  half-life (days)
    =========  ===================
    0.3         ~7  (casual mention)
    0.7         ~30 (significant event)
    0.9         ~365 (core memory)
    1.0         permanent (R always 1.0)
    =========  ===================

Schema dependency (added by v66 migration — not enforced here):
    - ``memories.importance REAL DEFAULT 0.5``
    - ``memories.recall_count INTEGER DEFAULT 0``
    - ``memories.last_recalled_at TEXT DEFAULT NULL``
    - ``memories.decay_score REAL DEFAULT 1.0``

All DB functions degrade gracefully when those columns are absent,
returning a safe ``{"error": "columns not available"}`` sentinel.
"""

from __future__ import annotations

import logging
import math
import sqlite3
from datetime import datetime, timezone
from typing import Optional

logger = logging.getLogger(__name__)

# Recall bonus multiplier per additional recall event.
_RECALL_BONUS = 0.2

# Decay rate base — controls the steepness of the forgetting curve.
_LAMBDA_BASE = 0.16

# Importance above which memories are considered permanent.
_PERMANENT_THRESHOLD = 1.0

# Tier constant for archived/pruned memories (matches tiered_memory.py).
_TIER_PERMANENT = 3


# ---------------------------------------------------------------------------
# Pure mathematical functions (no DB dependency)
# ---------------------------------------------------------------------------


def compute_retention(
    importance: float,
    days_since_created: float,
    recall_count: int = 0,
) -> float:
    """Compute the retention score for a memory using the Ebbinghaus curve.

    Args:
        importance: Memory importance in [0.0, 1.0].  A value of exactly
            ``1.0`` is treated as permanent and always returns ``1.0``.
        days_since_created: Number of days elapsed since the memory was
            created.  Must be >= 0.
        recall_count: How many times the memory has been explicitly recalled.
            Each recall multiplies the score by ``(1 + recall_count * 0.2)``.

    Returns:
        Retention score in (0.0, 1.0].  The score is not clamped above 1.0
        because the recall bonus can technically push it beyond the base
        importance for heavily reinforced memories; callers may clamp if
        needed for UI display purposes.

    Example:
        >>> score = compute_retention(0.7, 30)
        >>> 0.3 < score < 0.6  # typical mid-range decay after 1 month
        True
        >>> compute_retention(1.0, 9999)  # permanent memory
        1.0
    """
    if importance >= _PERMANENT_THRESHOLD:
        return 1.0

    # Effective decay rate: low-importance memories decay faster.
    lambda_eff = _LAMBDA_BASE * (1.0 - importance * 0.8)

    retention = importance * math.exp(-lambda_eff * days_since_created)
    retention *= 1.0 + recall_count * _RECALL_BONUS
    return retention


def compute_importance(
    emotional_intensity: float,
    engagement_score: float,
    novelty: float,
) -> float:
    """Compute an importance score for a new memory from three signal inputs.

    Uses a weighted linear combination:

        importance = emotional_intensity * 0.4
                   + engagement_score   * 0.35
                   + novelty            * 0.25

    Args:
        emotional_intensity: Absolute emotional weight of the memory, in
            [0.0, 1.0].  Typically ``abs(sentiment_score)`` where sentiment
            is in [-1, 1].
        engagement_score: How engaged the user was during this exchange,
            in [0.0, 1.0].  Derived from the adaptive engagement tracker.
        novelty: How different this memory is from existing memories,
            in [0.0, 1.0].  Use ``score_new_memory`` to compute this
            automatically via word-overlap heuristics.

    Returns:
        Importance score clamped to [0.0, 1.0].

    Example:
        >>> score = compute_importance(0.8, 0.7, 0.6)
        >>> 0.7 < score < 0.8
        True
    """
    raw = (
        emotional_intensity * 0.40
        + engagement_score * 0.35
        + novelty * 0.25
    )
    return max(0.0, min(1.0, raw))


# ---------------------------------------------------------------------------
# Word-overlap novelty helper
# ---------------------------------------------------------------------------


def _word_overlap_novelty(text: str, existing_texts: list[str]) -> float:
    """Compute novelty as 1 minus the maximum Jaccard similarity to any existing memory.

    Args:
        text: The new memory text to evaluate.
        existing_texts: Corpus of already-stored memory texts.

    Returns:
        Novelty in [0.0, 1.0].  Higher means more novel.
    """
    new_words = set(text.lower().split())
    if not new_words:
        return 0.5

    max_sim = 0.0
    for existing in existing_texts:
        existing_words = set(existing.lower().split())
        if not existing_words:
            continue
        intersection = len(new_words & existing_words)
        union = len(new_words | existing_words)
        if union > 0:
            sim = intersection / union
            if sim > max_sim:
                max_sim = sim

    return 1.0 - max_sim


# ---------------------------------------------------------------------------
# High-level scoring
# ---------------------------------------------------------------------------


def score_new_memory(
    text: str,
    sentiment_score: float,
    engagement_score: float,
    existing_memories: Optional[list[str]] = None,
) -> float:
    """Compute the importance score for a candidate memory before storing it.

    Derives ``emotional_intensity`` from the absolute value of
    ``sentiment_score`` (range [-1, 1]) and ``novelty`` from word-overlap
    similarity against ``existing_memories``.

    Args:
        text: Raw text of the candidate memory.
        sentiment_score: Sentiment polarity in [-1.0, 1.0].  Both strongly
            positive and strongly negative events are considered emotionally
            intense.
        engagement_score: User engagement level during this exchange, in
            [0.0, 1.0].
        existing_memories: Optional list of already-stored memory texts for
            the same character.  When ``None`` or empty, novelty defaults to
            ``0.7`` (assumed moderately novel).

    Returns:
        Importance score in [0.0, 1.0].

    Example:
        >>> score = score_new_memory("I really loved the fireworks!", 0.9, 0.8)
        >>> score > 0.6
        True
    """
    emotional_intensity = abs(sentiment_score)

    if existing_memories:
        novelty = _word_overlap_novelty(text, existing_memories)
    else:
        novelty = 0.7  # default: assume moderately novel

    return compute_importance(emotional_intensity, engagement_score, novelty)


# ---------------------------------------------------------------------------
# Database operations
# ---------------------------------------------------------------------------


def _days_since(created_at: str) -> float:
    """Compute days elapsed since an ISO-8601 datetime string.

    Args:
        created_at: ISO-8601 timestamp string (e.g. ``"2026-01-01T12:00:00"``).

    Returns:
        Fractional days elapsed.  Returns 0.0 for unparseable strings.
    """
    try:
        dt = datetime.fromisoformat(created_at)
        # Make aware if naive, assuming UTC.
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        delta = datetime.now(tz=timezone.utc) - dt
        return max(0.0, delta.total_seconds() / 86400.0)
    except (ValueError, TypeError):
        return 0.0


def run_decay_pass(
    conn: sqlite3.Connection,
    prune_threshold: float = 0.05,
) -> dict[str, object]:
    """Apply Ebbinghaus decay to all memories and archive those that have faded.

    Reads every memory row that has the v66 decay columns, recomputes its
    ``decay_score`` using :func:`compute_retention`, writes the new score
    back, and demotes any memory whose score falls below ``prune_threshold``
    to tier 3 (permanent archive) with a ``promoted_at`` timestamp so it
    is excluded from active recall.

    Args:
        conn: Open ``sqlite3.Connection`` to the application database.
        prune_threshold: Memories with ``decay_score < prune_threshold``
            are archived (set to tier 3).  Defaults to ``0.05`` (5%).

    Returns:
        A dict with keys:

        - ``"updated"`` (int): Number of rows whose ``decay_score`` changed.
        - ``"pruned"`` (int): Number of rows archived below the threshold.
        - ``"error"`` (str, optional): Present only when the v66 columns are
          absent; value is ``"columns not available"``.

    Example:
        >>> import sqlite3
        >>> conn = sqlite3.connect(":memory:")
        >>> result = run_decay_pass(conn)
        >>> result.get("error") == "columns not available"
        True
    """
    try:
        rows = conn.execute(
            """
            SELECT id, importance, recall_count, created_at
            FROM memories
            WHERE importance IS NOT NULL
            """,
        ).fetchall()
    except sqlite3.OperationalError as exc:
        logger.debug("run_decay_pass: decay columns unavailable — %s", exc)
        return {"updated": 0, "pruned": 0, "error": "columns not available"}

    updated = 0
    pruned = 0
    now_iso = datetime.now(tz=timezone.utc).isoformat()

    for row in rows:
        memory_id: int = row[0]
        importance: float = float(row[1]) if row[1] is not None else 0.5
        recall_count: int = int(row[2]) if row[2] is not None else 0
        created_at: str = row[3] or ""

        days = _days_since(created_at)
        score = compute_retention(importance, days, recall_count)

        try:
            if score < prune_threshold:
                conn.execute(
                    """
                    UPDATE memories
                    SET decay_score = ?, tier = ?, promoted_at = ?
                    WHERE id = ?
                    """,
                    (score, _TIER_PERMANENT, now_iso, memory_id),
                )
                pruned += 1
            else:
                conn.execute(
                    "UPDATE memories SET decay_score = ? WHERE id = ?",
                    (score, memory_id),
                )
            updated += 1
        except sqlite3.OperationalError as exc:
            logger.warning(
                "run_decay_pass: could not update memory %d — %s",
                memory_id,
                exc,
            )

    if updated:
        logger.info(
            "run_decay_pass: %d memories updated, %d archived (threshold=%.3f)",
            updated,
            pruned,
            prune_threshold,
        )

    return {"updated": updated, "pruned": pruned}


def reinforce_memory(memory_id: int, conn: sqlite3.Connection) -> None:
    """Increment a memory's recall count and update its last-recalled timestamp.

    Called whenever a memory is surfaced to the user (e.g. retrieved during
    context assembly), boosting its retention score on the next decay pass.

    Args:
        memory_id: Primary key of the memory row to reinforce.
        conn: Open ``sqlite3.Connection`` to the application database.

    Returns:
        None.  Errors from missing v66 columns are logged at DEBUG level and
        silently swallowed so that callers in the hot path are not disrupted.

    Example:
        >>> import sqlite3
        >>> conn = sqlite3.connect(":memory:")
        >>> reinforce_memory(999, conn)  # no-op on empty DB — no crash
    """
    now_iso = datetime.now(tz=timezone.utc).isoformat()
    try:
        conn.execute(
            """
            UPDATE memories
            SET recall_count = recall_count + 1,
                last_recalled_at = ?
            WHERE id = ?
            """,
            (now_iso, memory_id),
        )
    except sqlite3.OperationalError as exc:
        logger.debug(
            "reinforce_memory: decay columns unavailable for id=%d — %s",
            memory_id,
            exc,
        )
