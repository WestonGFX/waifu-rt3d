"""Multi-session preference trend analysis for the Adaptive Intelligence Engine.

Detects cross-session preference drift by applying a sliding window over
``preference_history`` snapshots stored in the DB.  Provides natural-language
summaries suitable for system-prompt injection and engagement regression alerts
used by the B4 self-critique module.

All computation is local and synchronous — no user data leaves the machine.

Schema dependencies:
    - ``preference_history`` table with columns: id, char_id, snapshot_at,
      pref_response_length, pref_formality, pref_humor, pref_empathy, pref_depth
      (created by a preflight.py schema migration).
    - ``engagement_signals`` table with columns: id, char_id, created_at,
      sentiment_score, user_msg_length, question_count, exclamation_count
      (created by the v60 migration).

Example:
    >>> import sqlite3
    >>> from backend.adaptive.trend_analyzer import compute_preference_trends
    >>> conn = sqlite3.connect(":memory:")
    >>> trends = compute_preference_trends(1, conn, window_days=14)
    >>> isinstance(trends, dict)
    True
"""

from __future__ import annotations

import logging
import sqlite3
from typing import Any

logger = logging.getLogger(__name__)

# Preference dimension column names shared across all functions.
_PREF_DIMENSIONS: tuple[str, ...] = (
    "pref_response_length",
    "pref_formality",
    "pref_humor",
    "pref_empathy",
    "pref_depth",
)

# Velocity threshold (per day) that separates "rising"/"falling" from "stable".
_VELOCITY_THRESHOLD = 0.01

# EMA smoothing factor — lower values produce more heavily smoothed series.
_EMA_ALPHA = 0.3

# Human-readable labels for use inside the trend summary.
_PREF_LABELS: dict[str, str] = {
    "pref_response_length": "response length",
    "pref_formality": "formality",
    "pref_humor": "humor",
    "pref_empathy": "emotional depth",
    "pref_depth": "intellectual depth",
}


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _linear_regression_slope(xs: list[float], ys: list[float]) -> float:
    """Compute the slope of the least-squares regression line for (xs, ys).

    Uses the standard closed-form formula:
    ``slope = (n * sum(xy) - sum(x) * sum(y)) / (n * sum(x^2) - sum(x)^2)``.

    Args:
        xs: Independent variable values (e.g. elapsed days since first snapshot).
        ys: Dependent variable values (e.g. preference scores).

    Returns:
        Slope as a float, representing the rate of change per unit of *xs*.
        Returns ``0.0`` when fewer than two data points are provided or when
        the denominator is zero (all x-values identical).

    Example:
        >>> _linear_regression_slope([0.0, 1.0, 2.0], [0.2, 0.4, 0.6])
        0.2
        >>> _linear_regression_slope([1.0], [0.5])
        0.0
    """
    n = len(xs)
    if n < 2:
        return 0.0

    sum_x = sum(xs)
    sum_y = sum(ys)
    sum_xy = sum(x * y for x, y in zip(xs, ys))
    sum_xx = sum(x * x for x in xs)

    denom = n * sum_xx - sum_x * sum_x
    if abs(denom) < 1e-12:
        return 0.0

    return (n * sum_xy - sum_x * sum_y) / denom


def _apply_ema(values: list[float], alpha: float = _EMA_ALPHA) -> list[float]:
    """Apply an exponential moving average to a time-ordered list of values.

    Uses the standard EMA recurrence:
    ``ema[0] = values[0]; ema[i] = alpha * values[i] + (1 - alpha) * ema[i-1]``

    Args:
        values: Time-ordered list of floats (oldest first).  Must be non-empty.
        alpha: Smoothing factor in ``(0.0, 1.0]``.  Higher values give more
            weight to recent observations.  Defaults to ``0.3``.

    Returns:
        Smoothed list of the same length as *values*.  Returns an empty list
        when *values* is empty.

    Example:
        >>> result = _apply_ema([0.0, 1.0], alpha=0.5)
        >>> round(result[1], 4)
        0.5
    """
    if not values:
        return []

    smoothed: list[float] = [values[0]]
    for v in values[1:]:
        smoothed.append(alpha * v + (1.0 - alpha) * smoothed[-1])
    return smoothed


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def compute_preference_trends(
    char_id: int,
    conn: sqlite3.Connection,
    window_days: int = 14,
) -> dict[str, dict[str, Any]]:
    """Compute per-dimension preference drift over a sliding time window.

    Fetches ``preference_history`` snapshots for *char_id* from the past
    *window_days* days, smooths each preference dimension with an EMA, and
    fits a linear regression to derive the velocity (rate of change per day).
    The confidence score reflects data density: ``n_snapshots / window_days``
    capped at ``1.0``.

    Args:
        char_id: ID of the character whose preference history is analysed.
        conn: An open :class:`sqlite3.Connection`.  The caller owns the
            connection lifecycle.
        window_days: Number of days back from now to include in the analysis
            window.  Defaults to ``14``.

    Returns:
        Dict keyed by preference dimension name (e.g. ``"pref_humor"``).
        Each value is a dict with:

        - ``direction`` (str): ``"rising"``, ``"falling"``, or ``"stable"``.
        - ``velocity`` (float): Rate of change per day from linear regression.
          Positive = preference increasing; negative = decreasing.
        - ``confidence`` (float): Data density in ``[0.0, 1.0]``.  Values
          below ``0.3`` indicate insufficient data for reliable inference.

        Returns an empty dict when the ``preference_history`` table does not
        exist or no snapshots fall within the window.

    Example:
        >>> import sqlite3
        >>> conn = sqlite3.connect(":memory:")
        >>> trends = compute_preference_trends(1, conn, window_days=14)
        >>> trends  # empty — table does not exist in :memory:
        {}
    """
    try:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            """SELECT * FROM preference_history
               WHERE char_id = ?
                 AND snapshot_at > datetime('now', ? || ' days')
               ORDER BY snapshot_at ASC""",
            (char_id, f"-{window_days}"),
        ).fetchall()
    except sqlite3.OperationalError as exc:
        logger.debug(
            "compute_preference_trends: preference_history table not available "
            "for char_id=%d: %s",
            char_id,
            exc,
        )
        return {}
    except Exception as exc:
        logger.warning(
            "compute_preference_trends: unexpected error for char_id=%d: %s",
            char_id,
            exc,
        )
        return {}

    if not rows:
        return {}

    # Build a time axis in fractional days relative to the first snapshot.
    # sqlite3.Row values are strings for datetime columns — parse them.
    from datetime import datetime, timezone  # noqa: PLC0415

    def _parse_ts(ts_str: str) -> datetime:
        """Parse an ISO-8601 datetime string to a timezone-aware datetime."""
        # SQLite stores as 'YYYY-MM-DD HH:MM:SS', no timezone suffix.
        for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S"):
            try:
                return datetime.strptime(ts_str, fmt).replace(tzinfo=timezone.utc)
            except ValueError:
                continue
        # Fallback — fromisoformat handles most edge cases in Python 3.7+.
        return datetime.fromisoformat(ts_str.replace("Z", "+00:00"))

    dicts = [dict(r) for r in rows]
    base_ts = _parse_ts(str(dicts[0]["snapshot_at"]))
    xs = [
        (_parse_ts(str(r["snapshot_at"])) - base_ts).total_seconds() / 86_400.0
        for r in dicts
    ]

    n_snapshots = len(dicts)
    confidence = min(1.0, n_snapshots / window_days)

    result: dict[str, dict[str, Any]] = {}
    for dim in _PREF_DIMENSIONS:
        raw_values: list[float] = []
        raw_xs: list[float] = []
        for i, row_dict in enumerate(dicts):
            val = row_dict.get(dim)
            if val is None:
                continue
            try:
                raw_values.append(float(val))
                raw_xs.append(xs[i])
            except (TypeError, ValueError):
                continue

        if len(raw_values) < 2:
            # Not enough data for a meaningful trend.
            result[dim] = {
                "direction": "stable",
                "velocity": 0.0,
                "confidence": confidence if raw_values else 0.0,
            }
            continue

        # Smooth the series before regression to reduce snapshot noise.
        smoothed = _apply_ema(raw_values)
        velocity = _linear_regression_slope(raw_xs, smoothed)

        if velocity > _VELOCITY_THRESHOLD:
            direction = "rising"
        elif velocity < -_VELOCITY_THRESHOLD:
            direction = "falling"
        else:
            direction = "stable"

        result[dim] = {
            "direction": direction,
            "velocity": velocity,
            "confidence": confidence,
        }

    return result


def detect_engagement_pattern(
    char_id: int,
    conn: sqlite3.Connection,
) -> dict[str, Any]:
    """Detect hourly and daily engagement patterns from 30-day signal history.

    Queries ``engagement_signals`` for *char_id* and summarises when the user
    is most active (by message count), and the average gap between sessions.

    Args:
        char_id: ID of the character whose engagement signals are analysed.
        conn: An open :class:`sqlite3.Connection`.  The caller owns the
            connection lifecycle.

    Returns:
        Dict with the following keys:

        - ``peak_hours`` (list[int]): Top 3 hours of the day (0–23) by signal
          count, sorted descending.  Empty list when no data is available.
        - ``peak_days`` (list[int]): Top 3 ISO weekday numbers (1=Mon … 7=Sun)
          by signal count, sorted descending.
        - ``avg_session_gap_hours`` (float | None): Mean hours between
          consecutive signals.  ``None`` when fewer than two timestamps exist.

        Returns a dict with empty/None values when the ``engagement_signals``
        table does not exist or no rows fall within the 30-day window.

    Example:
        >>> import sqlite3
        >>> conn = sqlite3.connect(":memory:")
        >>> pattern = detect_engagement_pattern(1, conn)
        >>> pattern["peak_hours"]
        []
    """
    empty: dict[str, Any] = {
        "peak_hours": [],
        "peak_days": [],
        "avg_session_gap_hours": None,
    }

    try:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            """SELECT created_at FROM engagement_signals
               WHERE char_id = ?
                 AND created_at > datetime('now', '-30 days')
               ORDER BY created_at ASC""",
            (char_id,),
        ).fetchall()
    except sqlite3.OperationalError as exc:
        logger.debug(
            "detect_engagement_pattern: engagement_signals not available "
            "for char_id=%d: %s",
            char_id,
            exc,
        )
        return empty
    except Exception as exc:
        logger.warning(
            "detect_engagement_pattern: unexpected error for char_id=%d: %s",
            char_id,
            exc,
        )
        return empty

    if not rows:
        return empty

    from datetime import datetime, timezone  # noqa: PLC0415

    timestamps: list[datetime] = []
    for r in rows:
        raw_ts = r["created_at"]
        if not raw_ts:
            continue
        try:
            for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S"):
                try:
                    timestamps.append(
                        datetime.strptime(str(raw_ts), fmt).replace(tzinfo=timezone.utc)
                    )
                    break
                except ValueError:
                    continue
            else:
                timestamps.append(
                    datetime.fromisoformat(str(raw_ts).replace("Z", "+00:00"))
                )
        except Exception:
            continue

    if not timestamps:
        return empty

    # Tally signal counts by hour and by ISO weekday.
    hour_counts: dict[int, int] = {}
    day_counts: dict[int, int] = {}
    for ts in timestamps:
        h = ts.hour
        d = ts.isoweekday()  # 1=Monday … 7=Sunday
        hour_counts[h] = hour_counts.get(h, 0) + 1
        day_counts[d] = day_counts.get(d, 0) + 1

    # Top-3 hours and days by count.
    peak_hours = sorted(hour_counts, key=lambda h: hour_counts[h], reverse=True)[:3]
    peak_days = sorted(day_counts, key=lambda d: day_counts[d], reverse=True)[:3]

    # Average gap between consecutive timestamps, in hours.
    avg_gap_hours: float | None = None
    if len(timestamps) >= 2:
        gaps_hours = [
            (timestamps[i + 1] - timestamps[i]).total_seconds() / 3600.0
            for i in range(len(timestamps) - 1)
            if timestamps[i + 1] > timestamps[i]
        ]
        avg_gap_hours = sum(gaps_hours) / len(gaps_hours) if gaps_hours else None

    return {
        "peak_hours": peak_hours,
        "peak_days": peak_days,
        "avg_session_gap_hours": avg_gap_hours,
    }


def generate_trend_summary(trends: dict[str, dict[str, Any]]) -> str:
    """Convert a preference trend dict to a natural-language summary string.

    Only mentions dimensions where ``confidence > 0.3`` and
    ``direction != "stable"``.  The output is intended for injection into the
    system prompt so it should be concise (1–3 sentences).

    Args:
        trends: Dict as returned by :func:`compute_preference_trends`.  Keys
            are preference dimension names; values are dicts with ``direction``,
            ``velocity``, and ``confidence`` keys.

    Returns:
        Human-readable string summarising significant preference shifts.
        Returns an empty string when no dimension meets the confidence and
        direction thresholds — callers should treat an empty return as "nothing
        noteworthy to inject".

    Example:
        >>> trends = {
        ...     "pref_humor": {"direction": "rising", "velocity": 0.05, "confidence": 0.6},
        ...     "pref_formality": {"direction": "stable", "velocity": 0.0, "confidence": 0.8},
        ...     "pref_response_length": {"direction": "rising", "velocity": 0.03, "confidence": 0.2},
        ... }
        >>> summary = generate_trend_summary(trends)
        >>> "humor" in summary
        True
        >>> "formality" in summary  # stable — excluded
        False
        >>> "response length" in summary  # low confidence — excluded
        False
    """
    rising: list[str] = []
    falling: list[str] = []

    for dim, data in trends.items():
        confidence = float(data.get("confidence") or 0.0)
        direction = str(data.get("direction") or "stable")

        if confidence <= 0.3 or direction == "stable":
            continue

        label = _PREF_LABELS.get(dim, dim.replace("pref_", "").replace("_", " "))
        if direction == "rising":
            rising.append(label)
        elif direction == "falling":
            falling.append(label)

    if not rising and not falling:
        return ""

    parts: list[str] = []
    if rising:
        joined = _join_list(rising)
        parts.append(f"The user has been increasingly enjoying {joined}.")
    if falling:
        joined = _join_list(falling)
        parts.append(f"The user has shown less interest in {joined} recently.")

    return " ".join(parts)


def check_engagement_regression(
    char_id: int,
    conn: sqlite3.Connection,
    lookback_days: int = 7,
) -> dict[str, Any] | None:
    """Detect whether engagement has regressed compared to the prior period.

    Compares the average of a composite engagement score (derived from
    ``sentiment_score``, ``user_msg_length``, and ``question_count``) between
    the most recent *lookback_days* and the equal-length period immediately
    before it.  Returns a regression descriptor when the recent period's mean
    is more than 15 % lower than the prior period's mean.

    Args:
        char_id: ID of the character whose engagement is being evaluated.
        conn: An open :class:`sqlite3.Connection`.  The caller owns the
            connection lifecycle.
        lookback_days: Number of days defining the "recent" window.  The prior
            window is the same width immediately preceding the recent one.
            Defaults to ``7``.

    Returns:
        ``None`` when no significant regression is detected (including when
        there is insufficient data).  Otherwise returns a dict with:

        - ``regressing`` (bool): Always ``True`` when the dict is returned.
        - ``metric`` (str): Human-readable name of the primary metric that
          drove the regression detection (``"composite_engagement"``).
        - ``delta`` (float): Fractional drop, e.g. ``-0.20`` for a 20 % fall.
          Always negative when a regression is returned.

    Example:
        >>> import sqlite3
        >>> conn = sqlite3.connect(":memory:")
        >>> result = check_engagement_regression(1, conn)
        >>> result is None
        True
    """
    try:
        conn.row_factory = sqlite3.Row
        # Fetch recent window (last lookback_days days)
        recent_rows = conn.execute(
            """SELECT sentiment_score, user_msg_length, question_count
               FROM engagement_signals
               WHERE char_id = ?
                 AND created_at > datetime('now', ? || ' days')""",
            (char_id, f"-{lookback_days}"),
        ).fetchall()

        # Fetch prior window (the lookback_days period before the recent window)
        prior_rows = conn.execute(
            """SELECT sentiment_score, user_msg_length, question_count
               FROM engagement_signals
               WHERE char_id = ?
                 AND created_at > datetime('now', ? || ' days')
                 AND created_at <= datetime('now', ? || ' days')""",
            (char_id, f"-{lookback_days * 2}", f"-{lookback_days}"),
        ).fetchall()

    except sqlite3.OperationalError as exc:
        logger.debug(
            "check_engagement_regression: engagement_signals not available "
            "for char_id=%d: %s",
            char_id,
            exc,
        )
        return None
    except Exception as exc:
        logger.warning(
            "check_engagement_regression: unexpected error for char_id=%d: %s",
            char_id,
            exc,
        )
        return None

    # Need at least one row in each window to make a comparison.
    if not recent_rows or not prior_rows:
        return None

    def _composite(rows: list[sqlite3.Row]) -> float:
        """Compute mean composite engagement score across a row set."""
        scores: list[float] = []
        for r in rows:
            # Normalise each signal to [0, 1] before combining:
            #   sentiment_score: already in [-1, 1] — shift to [0, 1].
            #   user_msg_length: saturate at 300 chars.
            #   question_count: presence/absence (≥1 = 1.0).
            sentiment = ((r["sentiment_score"] or 0.0) + 1.0) / 2.0
            length = min((r["user_msg_length"] or 0) / 300.0, 1.0)
            questions = 1.0 if (r["question_count"] or 0) >= 1 else 0.0
            scores.append(sentiment * 0.5 + length * 0.3 + questions * 0.2)
        return sum(scores) / len(scores)

    recent_mean = _composite(recent_rows)
    prior_mean = _composite(prior_rows)

    if prior_mean < 1e-6:
        # Avoid division by near-zero — cannot determine regression.
        return None

    delta = (recent_mean - prior_mean) / prior_mean  # negative = regression
    if delta < -0.15:
        logger.debug(
            "check_engagement_regression: regression detected for char_id=%d "
            "(delta=%.3f, recent=%.3f, prior=%.3f)",
            char_id,
            delta,
            recent_mean,
            prior_mean,
        )
        return {
            "regressing": True,
            "metric": "composite_engagement",
            "delta": round(delta, 4),
        }

    return None


# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------


def _join_list(items: list[str]) -> str:
    """Join a list of strings with Oxford comma style.

    Args:
        items: Non-empty list of string fragments.

    Returns:
        Grammatically joined string:
        - 1 item  → ``"humor"``
        - 2 items → ``"humor and formality"``
        - 3+ items → ``"humor, formality, and depth"``

    Example:
        >>> _join_list(["humor"])
        'humor'
        >>> _join_list(["humor", "formality"])
        'humor and formality'
        >>> _join_list(["humor", "formality", "depth"])
        'humor, formality, and depth'
    """
    if len(items) == 1:
        return items[0]
    if len(items) == 2:
        return f"{items[0]} and {items[1]}"
    return ", ".join(items[:-1]) + f", and {items[-1]}"
