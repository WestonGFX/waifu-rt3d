"""Relationship milestone detection for the Adaptive Intelligence Engine.

.. deprecated::
    ``backend.adaptive.milestones`` is superseded by ``backend.bond.milestones``
    which owns the canonical milestone domain.  This module is kept only so
    existing REST endpoints (``/api/aie/milestones/…``) do not break.
    Do NOT add new milestone types here — add them to
    ``backend/bond/milestones.py`` instead.

Tracks and records meaningful moments in the user–character relationship —
first conversations, loyalty session counts, emotional trust, and topic
expertise.  Each milestone is recorded once and never duplicated.

All detection is heuristic (no LLM call required) so it can run cheaply on
every chat turn without adding latency.

Schema dependency:
    - ``relationship_milestones`` table (created by v66 migration):
        id, char_id, milestone (UNIQUE per char_id), description, detected_at
    - ``messages`` table: id, session_id, char_id, role, content, created_at, ts
    - ``engagement_signals`` table: char_id, sentiment_score, detected_context
    - ``topic_tracking`` table (optional): char_id, topic, mention_count

Example:
    >>> import sqlite3
    >>> from backend.adaptive.milestones import MILESTONES, get_milestones
    >>> con = sqlite3.connect(":memory:")
    >>> get_milestones(1, con)
    []
    >>> len(MILESTONES)
    10
"""

from __future__ import annotations

import logging
import sqlite3
from typing import Any

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Milestone catalogue
# ---------------------------------------------------------------------------

MILESTONES: dict[str, str] = {
    "first_conversation": "Had their first real conversation",
    "first_deep_talk": "First conversation longer than 20 messages",
    "first_vulnerability": "User shared something personal for the first time",
    "first_inside_joke": "Created their first inside joke or callback reference",
    "first_comfort": "User came to the character for emotional support",
    "loyalty_10": "10 conversation sessions together",
    "loyalty_50": "50 conversation sessions together",
    "loyalty_100": "100 conversation sessions together",
    "topic_expert": "User frequently discusses a specialized topic",
    "emotional_trust": "User consistently shows high emotional vulnerability",
}

# Thresholds — extracted as constants for easy tuning.
_FIRST_DEEP_TALK_THRESHOLD = 20      # messages in a single session
_VULNERABILITY_SIGNAL_COUNT = 3      # negative-sentiment signals required
_VULNERABILITY_SENTIMENT_FLOOR = -0.3  # sentiment_score must be <= this
_COMFORT_CONTEXT_COUNT = 2           # matching detected_context rows required
_COMFORT_CONTEXTS = ("emotional_support", "comfort_reassurance")
_TOPIC_EXPERT_MENTION_THRESHOLD = 15  # mentions of a single topic
_EMOTIONAL_TRUST_SIGNAL_WINDOW = 20   # last N signals to average
_EMOTIONAL_TRUST_AVG_THRESHOLD = 0.4  # abs(sentiment) avg must exceed this


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _already_achieved(milestone: str, char_id: int, cur: sqlite3.Cursor) -> bool:
    """Return True if the milestone is already recorded for this character.

    Args:
        milestone: Milestone key from :data:`MILESTONES`.
        char_id: Character ID to check.
        cur: Active SQLite cursor.

    Returns:
        ``True`` when a row exists; ``False`` when the table is missing or
        the milestone has not been recorded yet.
    """
    try:
        row = cur.execute(
            "SELECT 1 FROM relationship_milestones WHERE char_id = ? AND milestone = ?",
            (char_id, milestone),
        ).fetchone()
        return row is not None
    except sqlite3.OperationalError:
        # Table doesn't exist yet — treat as not achieved so we can detect it.
        return False


def _record_milestone(
    milestone: str,
    char_id: int,
    description: str,
    cur: sqlite3.Cursor,
) -> dict[str, Any] | None:
    """Insert a milestone row and return its data dict, or None on conflict.

    Uses INSERT OR IGNORE so concurrent calls are safe.  Returns None when
    the row was already present (i.e. the INSERT was ignored).

    Args:
        milestone: Milestone key from :data:`MILESTONES`.
        char_id: Character ID to record the milestone for.
        description: Human-readable description to store.
        cur: Active SQLite cursor with write access.

    Returns:
        Dict with ``milestone``, ``description``, and ``detected_at`` keys,
        or ``None`` if the row was already present.
    """
    try:
        cur.execute(
            """INSERT OR IGNORE INTO relationship_milestones
               (char_id, milestone, description)
               VALUES (?, ?, ?)""",
            (char_id, milestone, description),
        )
        if cur.rowcount == 0:
            # Conflict — already existed
            return None
        row = cur.execute(
            """SELECT milestone, description, detected_at
               FROM relationship_milestones
               WHERE char_id = ? AND milestone = ?""",
            (char_id, milestone),
        ).fetchone()
        if row:
            return {"milestone": row[0], "description": row[1], "detected_at": row[2]}
        return None
    except sqlite3.OperationalError as exc:
        logger.debug("_record_milestone: table missing (%s) — skipping insert", exc)
        return None


# ---------------------------------------------------------------------------
# Per-milestone detection logic
# ---------------------------------------------------------------------------


def _check_first_conversation(char_id: int, cur: sqlite3.Cursor) -> bool:
    """Return True when at least 2 messages exist for this character."""
    try:
        count = cur.execute(
            "SELECT COUNT(*) FROM messages WHERE char_id = ?",
            (char_id,),
        ).fetchone()[0]
        return int(count) >= 2
    except sqlite3.OperationalError:
        return False


def _check_first_deep_talk(char_id: int, cur: sqlite3.Cursor) -> bool:
    """Return True when any session contains more than 20 messages."""
    try:
        row = cur.execute(
            """SELECT session_id
               FROM messages
               WHERE char_id = ?
               GROUP BY session_id
               HAVING COUNT(*) > ?
               LIMIT 1""",
            (char_id, _FIRST_DEEP_TALK_THRESHOLD),
        ).fetchone()
        return row is not None
    except sqlite3.OperationalError:
        return False


def _check_first_vulnerability(char_id: int, cur: sqlite3.Cursor) -> bool:
    """Return True when at least 3 signals show low sentiment (<= -0.3)."""
    try:
        count = cur.execute(
            """SELECT COUNT(*)
               FROM engagement_signals
               WHERE char_id = ? AND sentiment_score <= ?""",
            (char_id, _VULNERABILITY_SENTIMENT_FLOOR),
        ).fetchone()[0]
        return int(count) >= _VULNERABILITY_SIGNAL_COUNT
    except sqlite3.OperationalError:
        return False


def _check_first_comfort(char_id: int, cur: sqlite3.Cursor) -> bool:
    """Return True when emotional-support or comfort-reassurance context appears >= 2 times."""
    try:
        placeholders = ",".join("?" for _ in _COMFORT_CONTEXTS)
        count = cur.execute(
            f"""SELECT COUNT(*)
                FROM engagement_signals
                WHERE char_id = ?
                  AND detected_context IN ({placeholders})""",
            (char_id, *_COMFORT_CONTEXTS),
        ).fetchone()[0]
        return int(count) >= _COMFORT_CONTEXT_COUNT
    except sqlite3.OperationalError:
        return False


def _check_loyalty(char_id: int, cur: sqlite3.Cursor, threshold: int) -> bool:
    """Return True when the distinct session count for this character meets threshold.

    Args:
        char_id: Character ID to check.
        cur: Active SQLite cursor.
        threshold: Minimum number of distinct sessions required.

    Returns:
        ``True`` when session count >= threshold.
    """
    try:
        count = cur.execute(
            "SELECT COUNT(DISTINCT session_id) FROM messages WHERE char_id = ?",
            (char_id,),
        ).fetchone()[0]
        return int(count) >= threshold
    except sqlite3.OperationalError:
        return False


def _check_topic_expert(char_id: int, cur: sqlite3.Cursor) -> bool:
    """Return True when any topic has mention_count > 15 in topic_tracking.

    Gracefully returns False if the ``topic_tracking`` table does not exist.
    """
    try:
        row = cur.execute(
            """SELECT 1
               FROM topic_tracking
               WHERE char_id = ? AND mention_count > ?
               LIMIT 1""",
            (char_id, _TOPIC_EXPERT_MENTION_THRESHOLD),
        ).fetchone()
        return row is not None
    except sqlite3.OperationalError:
        # topic_tracking table may not exist — not a hard requirement
        return False


def _check_emotional_trust(char_id: int, cur: sqlite3.Cursor) -> bool:
    """Return True when the avg abs(sentiment_score) over last 20 signals exceeds 0.4."""
    try:
        rows = cur.execute(
            """SELECT sentiment_score
               FROM engagement_signals
               WHERE char_id = ? AND sentiment_score IS NOT NULL
               ORDER BY id DESC
               LIMIT ?""",
            (char_id, _EMOTIONAL_TRUST_SIGNAL_WINDOW),
        ).fetchall()
        if not rows:
            return False
        avg_abs = sum(abs(r[0]) for r in rows) / len(rows)
        return avg_abs > _EMOTIONAL_TRUST_AVG_THRESHOLD
    except sqlite3.OperationalError:
        return False


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def check_milestones(
    char_id: int,
    conn: sqlite3.Connection,
    session_signals: list[dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    """Check all milestones for a character and record any newly achieved ones.

    Runs every detection heuristic against the current DB state.  Milestones
    that are already recorded are skipped.  ``first_inside_joke`` is not
    auto-detected — it requires an explicit LLM or manual trigger and is
    therefore always skipped here.

    Args:
        char_id: Character ID to evaluate milestones for.
        conn: Active SQLite connection (must have write access to the
            ``relationship_milestones`` table when it exists).
        session_signals: Optional list of engagement signal dicts from the
            current turn (currently reserved for future use; not consumed
            by this implementation).

    Returns:
        List of newly achieved milestone dicts, each containing:
        ``milestone`` (str), ``description`` (str), ``detected_at`` (str).
        Returns an empty list when no new milestones were detected.

    Example:
        >>> import sqlite3
        >>> con = sqlite3.connect(":memory:")
        >>> # Table doesn't exist — should return [] gracefully
        >>> check_milestones(1, con)
        []
    """
    cur = conn.cursor()
    newly_achieved: list[dict[str, Any]] = []

    # Build detection plan: {milestone_key: callable() -> bool}
    # first_inside_joke is intentionally excluded — not auto-detectable.
    detection_map: list[tuple[str, Any]] = [
        ("first_conversation",  lambda: _check_first_conversation(char_id, cur)),
        ("first_deep_talk",     lambda: _check_first_deep_talk(char_id, cur)),
        ("first_vulnerability", lambda: _check_first_vulnerability(char_id, cur)),
        ("first_comfort",       lambda: _check_first_comfort(char_id, cur)),
        ("loyalty_10",          lambda: _check_loyalty(char_id, cur, 10)),
        ("loyalty_50",          lambda: _check_loyalty(char_id, cur, 50)),
        ("loyalty_100",         lambda: _check_loyalty(char_id, cur, 100)),
        ("topic_expert",        lambda: _check_topic_expert(char_id, cur)),
        ("emotional_trust",     lambda: _check_emotional_trust(char_id, cur)),
    ]

    for milestone_key, detect_fn in detection_map:
        try:
            # Fast path: skip if already in the table
            if _already_achieved(milestone_key, char_id, cur):
                continue

            if detect_fn():
                description = MILESTONES[milestone_key]
                recorded = _record_milestone(milestone_key, char_id, description, cur)
                if recorded:
                    newly_achieved.append(recorded)
                    logger.info(
                        "Milestone achieved — char_id=%d milestone=%s",
                        char_id,
                        milestone_key,
                    )
        except Exception as exc:
            # Never let a single milestone crash the whole check
            logger.debug(
                "check_milestones: error evaluating %s for char_id=%d: %s",
                milestone_key,
                char_id,
                exc,
            )

    if newly_achieved:
        try:
            conn.commit()
        except Exception as exc:
            logger.warning("check_milestones: commit failed: %s", exc)

    return newly_achieved


def get_milestones(char_id: int, conn: sqlite3.Connection) -> list[dict[str, Any]]:
    """Fetch all recorded milestones for a character, newest first.

    Args:
        char_id: Character ID to fetch milestones for.
        conn: Active SQLite connection (read-only access sufficient).

    Returns:
        List of dicts with keys ``milestone``, ``description``, ``detected_at``.
        Returns an empty list when no milestones exist or the table is missing.

    Example:
        >>> import sqlite3
        >>> con = sqlite3.connect(":memory:")
        >>> get_milestones(99, con)
        []
    """
    try:
        rows = conn.execute(
            """SELECT milestone, description, detected_at
               FROM relationship_milestones
               WHERE char_id = ?
               ORDER BY detected_at DESC""",
            (char_id,),
        ).fetchall()
        return [
            {"milestone": r[0], "description": r[1], "detected_at": r[2]}
            for r in rows
        ]
    except sqlite3.OperationalError:
        # Table not yet created — return empty list gracefully
        return []
    except Exception as exc:
        logger.warning("get_milestones: unexpected error for char_id=%d: %s", char_id, exc)
        return []


def build_milestone_context(char_id: int, conn: sqlite3.Connection) -> str:
    """Build a compact prompt block describing the character's relationship milestones.

    Intended to be injected into the LLM system prompt so the character is
    aware of the shared history with the user.

    Args:
        char_id: Character ID to build context for.
        conn: Active SQLite connection.

    Returns:
        A single-line string like
        ``"[Relationship: 50 sessions together, deep emotional trust]"``
        or an empty string when no milestones have been recorded.

    Example:
        >>> import sqlite3
        >>> con = sqlite3.connect(":memory:")
        >>> build_milestone_context(1, con)
        ''
    """
    milestones = get_milestones(char_id, conn)
    if not milestones:
        return ""

    # Map milestone keys to compact human-readable phrases for the prompt.
    _LABEL_MAP: dict[str, str] = {
        "first_conversation":  "had their first real conversation",
        "first_deep_talk":     "shared a deep talk early on",
        "first_vulnerability": "user opened up personally",
        "first_inside_joke":   "created an inside joke together",
        "first_comfort":       "user sought emotional comfort",
        "loyalty_10":          "10 sessions together",
        "loyalty_50":          "50 sessions together",
        "loyalty_100":         "100 sessions together",
        "topic_expert":        "user is a topic expert",
        "emotional_trust":     "deep emotional trust",
    }

    labels: list[str] = []
    for m in milestones:
        key = m.get("milestone", "")
        label = _LABEL_MAP.get(key, key)
        labels.append(label)

    joined = ", ".join(labels)
    return f"[Relationship: {joined}]"
