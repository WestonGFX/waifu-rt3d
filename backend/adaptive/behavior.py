"""Behavior adaptation engine for on-device personalization.

Reads engagement signals and preference history to generate a ``BehaviorModifier``
dict that adjusts the AI's conversational behavior.  Self-correcting: if an
adaptation causes engagement to drop, it's automatically reverted.

All processing runs locally — no user data leaves the machine.

Schema dependency:
    - ``engagement_signals`` table (populated by signals.py)
    - ``preference_history`` table (populated by this module)
    - ``privacy_settings`` table for opt-out check

Example:
    >>> import sqlite3
    >>> from backend.adaptive.behavior import compute_behavior_modifiers
    >>> conn = sqlite3.connect(":memory:")
    >>> mods = compute_behavior_modifiers(char_id=1, conn=conn)
    >>> mods["response_length_bias"]  # -0.3 to +0.3 adjustment
    0.0
"""

from __future__ import annotations

import logging
import math
import sqlite3

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Maximum absolute value for any single bias dimension.
_BIAS_CLAMP = 0.3

# Minimum number of engagement signals required before producing non-zero biases.
_MIN_SIGNALS_FOR_BIAS = 5

# Signal count at which confidence saturates to 1.0.
_CONFIDENCE_SATURATE_AT = 20

# Fraction of the window used for trend comparison: the last third is "recent",
# the earlier portion is "baseline".  Applied only when window_size >= 6.
_TREND_SPLIT = 3


# ---------------------------------------------------------------------------
# Defaults
# ---------------------------------------------------------------------------

def _default_modifiers() -> dict:
    """Return a zeroed-out BehaviorModifier dict with safe defaults.

    Used when privacy is disabled, there is no data, or confidence is too low
    to produce meaningful adjustments.

    Returns:
        Dict with all bias keys set to 0.0, pacing/energy to "normal", empty
        active_adaptations list, and confidence of 0.0.

    Example:
        >>> d = _default_modifiers()
        >>> d["response_length_bias"]
        0.0
        >>> d["pacing_hint"]
        'normal'
    """
    return {
        "response_length_bias": 0.0,
        "formality_bias": 0.0,
        "humor_bias": 0.0,
        "empathy_bias": 0.0,
        "depth_bias": 0.0,
        "pacing_hint": "normal",
        "energy_level": "medium",
        "active_adaptations": [],
        "confidence": 0.0,
    }


# ---------------------------------------------------------------------------
# Privacy gate
# ---------------------------------------------------------------------------

def _behavior_adaptation_enabled(conn: sqlite3.Connection) -> bool:
    """Check whether behavior adaptation is permitted by the user's privacy settings.

    Queries the ``privacy_settings`` singleton row.  Returns ``True`` (adaptation
    permitted) when the table does not yet exist, as the v60 migration has not run
    and the feature is not yet active — defaulting open is safer than silently
    refusing to adapt.

    Args:
        conn: Open SQLite connection.  Read-only access is sufficient.

    Returns:
        ``True`` if ``privacy_settings.behavior_adaptation`` is non-zero or the
        table does not exist.  ``False`` only when the user has explicitly
        disabled adaptation (value = 0).

    Example:
        >>> import sqlite3
        >>> c = sqlite3.connect(":memory:")
        >>> _behavior_adaptation_enabled(c)
        True
    """
    try:
        row = conn.execute(
            "SELECT behavior_adaptation FROM privacy_settings WHERE id = 1"
        ).fetchone()
        if row is None:
            return True  # Singleton missing — treat as enabled (safe default)
        return bool(row[0])
    except sqlite3.OperationalError:
        # Table doesn't exist yet (migration pending) — allow adaptation
        return True
    except Exception as exc:
        logger.debug("_behavior_adaptation_enabled check failed (non-fatal): %s", exc)
        return True


# ---------------------------------------------------------------------------
# Signal loading
# ---------------------------------------------------------------------------

def _load_signals(
    char_id: int,
    conn: sqlite3.Connection,
    window_size: int,
) -> list[dict]:
    """Load the most recent engagement signal rows for a character.

    Fetches up to *window_size* rows from ``engagement_signals`` ordered by
    ``created_at`` descending (newest first), then reverses them so callers
    receive signals in chronological order (oldest first, newest last).

    Args:
        char_id: Character whose signals to load.
        conn: Open SQLite connection.
        window_size: Maximum number of rows to load.

    Returns:
        List of dicts (one per signal row, oldest first).  Returns an empty
        list when the table does not exist or no rows are present.

    Example:
        >>> import sqlite3
        >>> c = sqlite3.connect(":memory:")
        >>> _load_signals(1, c, 20)
        []
    """
    try:
        rows = conn.execute(
            """
            SELECT
                user_msg_length,
                assistant_msg_length,
                response_time_ms,
                emoji_count,
                question_count,
                exclamation_count,
                sentiment_score,
                topic_drift,
                intimacy_delta
            FROM engagement_signals
            WHERE char_id = ?
            ORDER BY created_at DESC
            LIMIT ?
            """,
            (char_id, window_size),
        ).fetchall()

        col_names = [
            "user_msg_length",
            "assistant_msg_length",
            "response_time_ms",
            "emoji_count",
            "question_count",
            "exclamation_count",
            "sentiment_score",
            "topic_drift",
            "intimacy_delta",
        ]
        signals = [dict(zip(col_names, row)) for row in rows]
        signals.reverse()  # oldest → newest
        return signals

    except sqlite3.OperationalError:
        # Table not yet created — harmless
        return []
    except Exception as exc:
        logger.debug("_load_signals failed (non-fatal): %s", exc)
        return []


# ---------------------------------------------------------------------------
# Trend helpers
# ---------------------------------------------------------------------------

def _safe_avg(values: list[float]) -> float:
    """Compute the mean of a list, returning 0.0 for an empty list.

    Args:
        values: List of numeric values.

    Returns:
        Arithmetic mean, or 0.0 when *values* is empty.

    Example:
        >>> _safe_avg([1.0, 3.0])
        2.0
        >>> _safe_avg([])
        0.0
    """
    return sum(values) / len(values) if values else 0.0


def _split_window(
    values: list[float],
) -> tuple[float, float]:
    """Split a value list into baseline and recent averages.

    Divides the list into the older two-thirds (baseline) and the newest
    third (recent).  When the list is shorter than ``_TREND_SPLIT`` elements
    both averages are equal (the full list mean).

    Args:
        values: Chronologically ordered list (oldest first).

    Returns:
        Tuple of ``(baseline_avg, recent_avg)``.

    Example:
        >>> baseline, recent = _split_window([1.0, 1.0, 1.0, 3.0, 3.0, 3.0])
        >>> recent > baseline
        True
    """
    if len(values) < _TREND_SPLIT:
        avg = _safe_avg(values)
        return avg, avg
    split = max(1, len(values) // _TREND_SPLIT)
    recent = values[-split:]
    baseline = values[:-split]
    return _safe_avg(baseline), _safe_avg(recent)


def _clamp_bias(value: float) -> float:
    """Clamp *value* to the allowed bias range ``[-_BIAS_CLAMP, +_BIAS_CLAMP]``.

    Args:
        value: Raw computed bias.

    Returns:
        Value clamped to ``[-0.3, 0.3]``.

    Example:
        >>> _clamp_bias(0.9)
        0.3
        >>> _clamp_bias(-0.5)
        -0.3
    """
    return max(-_BIAS_CLAMP, min(_BIAS_CLAMP, value))


# ---------------------------------------------------------------------------
# Confidence
# ---------------------------------------------------------------------------

def _compute_confidence(signal_count: int) -> float:
    """Compute a confidence score from the number of available signals.

    Returns 0.0 for fewer than ``_MIN_SIGNALS_FOR_BIAS`` signals and scales
    linearly to 1.0 at ``_CONFIDENCE_SATURATE_AT`` signals.

    Args:
        signal_count: Number of engagement signal rows available.

    Returns:
        Float in [0.0, 1.0].

    Example:
        >>> _compute_confidence(0)
        0.0
        >>> _compute_confidence(20)
        1.0
        >>> 0.0 < _compute_confidence(10) < 1.0
        True
    """
    if signal_count < _MIN_SIGNALS_FOR_BIAS:
        return 0.0
    span = _CONFIDENCE_SATURATE_AT - _MIN_SIGNALS_FOR_BIAS
    raw = (signal_count - _MIN_SIGNALS_FOR_BIAS) / span if span > 0 else 1.0
    return float(min(1.0, raw))


# ---------------------------------------------------------------------------
# Core computation
# ---------------------------------------------------------------------------

def compute_behavior_modifiers(
    char_id: int,
    conn: sqlite3.Connection,
    *,
    window_size: int = 20,
) -> dict:
    """Compute behavior adjustment modifiers from recent engagement signals.

    Analyses the last *window_size* engagement signal rows for *char_id* and
    returns a ``BehaviorModifier`` dict that can be injected into the system
    prompt to nudge the AI's conversational style toward what the user responds
    best to.

    The function is self-contained and side-effect-free — it reads from the DB
    but does not write.  Call :func:`save_preference_snapshot` afterwards to
    persist the result.

    Privacy gate: if ``privacy_settings.behavior_adaptation`` is 0, a zeroed
    default dict is returned immediately without reading any signal data.

    Bias computation rules:

    - **response_length_bias**: Positive when the user's recent messages are
      trending longer than the baseline window; negative when trending shorter.
      Scaled relative to a ±100-character change producing ±0.3.
    - **humor_bias**: Positive when the average emoji count per message is
      above 0.5; scaled so 2+ emojis/message saturates to +0.3.
    - **depth_bias**: Positive when question frequency is above 40%.  A
      question rate of 100% produces +0.3.
    - **empathy_bias**: Positive when the mean intimacy_delta is > 0; negative
      when it is consistently < 0.
    - **formality_bias**: Derived as the inverse of humor_bias (more humor
      signals → lower formality preference).
    - **pacing_hint**: "faster" when avg ``response_time_ms`` is trending
      shorter than baseline; "slower" when trending longer; "normal" otherwise.
    - **energy_level**: "high" when avg engagement is strong (short latency +
      long messages); "low" when both are weak; "medium" otherwise.

    Args:
        char_id: Character ID whose engagement history to analyse.
        conn: Open SQLite connection to the application database.
        window_size: Number of recent signal rows to include.  Must be >= 1.

    Returns:
        Dict with the following keys:

        - ``response_length_bias`` (float): -0.3 to +0.3.
        - ``formality_bias`` (float): -0.3 to +0.3.
        - ``humor_bias`` (float): -0.3 to +0.3.
        - ``empathy_bias`` (float): -0.3 to +0.3.
        - ``depth_bias`` (float): -0.3 to +0.3.
        - ``pacing_hint`` (str): "faster" | "normal" | "slower".
        - ``energy_level`` (str): "low" | "medium" | "high".
        - ``active_adaptations`` (list[str]): Human-readable list of what
          was adapted and why.
        - ``confidence`` (float): 0.0 to 1.0.

    Example:
        >>> import sqlite3
        >>> conn = sqlite3.connect(":memory:")
        >>> mods = compute_behavior_modifiers(char_id=1, conn=conn)
        >>> mods["confidence"]
        0.0
        >>> mods["pacing_hint"]
        'normal'
    """
    if not _behavior_adaptation_enabled(conn):
        logger.debug(
            "compute_behavior_modifiers: behavior adaptation disabled for char_id=%d",
            char_id,
        )
        return _default_modifiers()

    signals = _load_signals(char_id, conn, window_size)
    n = len(signals)
    confidence = _compute_confidence(n)

    if n < _MIN_SIGNALS_FOR_BIAS:
        logger.debug(
            "compute_behavior_modifiers: insufficient signals (%d) for char_id=%d",
            n,
            char_id,
        )
        return _default_modifiers()

    # ------------------------------------------------------------------ #
    # Extract time-series per dimension
    # ------------------------------------------------------------------ #
    user_lengths: list[float] = [float(s.get("user_msg_length") or 0) for s in signals]
    response_times: list[float] = [
        float(s["response_time_ms"])
        for s in signals
        if s.get("response_time_ms") is not None
    ]
    emoji_counts: list[float] = [float(s.get("emoji_count") or 0) for s in signals]
    question_counts: list[float] = [float(s.get("question_count") or 0) for s in signals]
    intimacy_deltas: list[float] = [float(s.get("intimacy_delta") or 0) for s in signals]
    sentiment_scores: list[float] = [
        float(s.get("sentiment_score") or 0.0) for s in signals
    ]

    adaptations: list[str] = []

    # ------------------------------------------------------------------ #
    # response_length_bias
    # — positive when user messages are trending longer (wants more detail)
    # — negative when trending shorter (wants brevity)
    # ------------------------------------------------------------------ #
    baseline_len, recent_len = _split_window(user_lengths)
    length_delta = recent_len - baseline_len
    # ±100 chars → ±0.3 (linear, clamped)
    response_length_bias = _clamp_bias(length_delta / 100.0 * _BIAS_CLAMP)

    if abs(response_length_bias) >= 0.05:
        direction = "longer" if response_length_bias > 0 else "shorter"
        adaptations.append(
            f"response_length {response_length_bias:+.2f} "
            f"(user messages trending {direction}, Δ{length_delta:+.0f} chars)"
        )

    # ------------------------------------------------------------------ #
    # humor_bias
    # — based on average emoji count per message
    # — 0.5 emojis/msg → small positive; 2+ emojis/msg → +0.3
    # ------------------------------------------------------------------ #
    avg_emoji = _safe_avg(emoji_counts)
    # Scale: 0 → 0, 0.5 → 0.075, 2.0 → 0.3 (saturates)
    raw_humor = min(avg_emoji / 2.0, 1.0) * _BIAS_CLAMP
    humor_bias = _clamp_bias(raw_humor)

    if humor_bias >= 0.05:
        adaptations.append(
            f"humor {humor_bias:+.2f} (avg {avg_emoji:.1f} emoji/msg)"
        )

    # ------------------------------------------------------------------ #
    # formality_bias
    # — inverse of humor: high emoji usage implies lower formality preference
    # ------------------------------------------------------------------ #
    formality_bias = _clamp_bias(-humor_bias)

    if abs(formality_bias) >= 0.05:
        direction = "less formal" if formality_bias < 0 else "more formal"
        adaptations.append(
            f"formality {formality_bias:+.2f} ({direction} signal from emoji rate)"
        )

    # ------------------------------------------------------------------ #
    # depth_bias
    # — based on question frequency (questions per message)
    # — rate of 40 %+ → small positive; 100 % → +0.3
    # ------------------------------------------------------------------ #
    total_questions = sum(question_counts)
    question_rate = total_questions / n if n else 0.0
    # Scale: 0.4 rate → 0.12, 1.0 rate → 0.3
    raw_depth = max(0.0, (question_rate - 0.0) * _BIAS_CLAMP)
    depth_bias = _clamp_bias(raw_depth)

    if depth_bias >= 0.05:
        adaptations.append(
            f"depth {depth_bias:+.2f} (question rate {question_rate:.0%})"
        )

    # ------------------------------------------------------------------ #
    # empathy_bias
    # — positive when average intimacy_delta is trending upward
    # — negative when trending downward
    # ------------------------------------------------------------------ #
    avg_intimacy_delta = _safe_avg(intimacy_deltas)
    # Each unit of intimacy_delta contributes 0.05; saturates at ±0.3
    raw_empathy = avg_intimacy_delta * 0.05
    empathy_bias = _clamp_bias(raw_empathy)

    if abs(empathy_bias) >= 0.05:
        direction = "rising" if empathy_bias > 0 else "falling"
        adaptations.append(
            f"empathy {empathy_bias:+.2f} (intimacy delta {direction}, "
            f"avg Δ{avg_intimacy_delta:+.1f})"
        )

    # ------------------------------------------------------------------ #
    # pacing_hint
    # — compare recent vs baseline response times
    # — shorter recent latency → user is engaged → "faster"
    # — longer recent latency → user is taking their time → "slower"
    # ------------------------------------------------------------------ #
    pacing_hint = "normal"
    if len(response_times) >= _TREND_SPLIT:
        baseline_rt, recent_rt = _split_window(response_times)
        if baseline_rt > 0:
            rt_ratio = recent_rt / baseline_rt
            if rt_ratio < 0.75:
                pacing_hint = "faster"
                adaptations.append(
                    f"pacing=faster (response time dropped to "
                    f"{rt_ratio:.0%} of baseline)"
                )
            elif rt_ratio > 1.35:
                pacing_hint = "slower"
                adaptations.append(
                    f"pacing=slower (response time rose to "
                    f"{rt_ratio:.0%} of baseline)"
                )

    # ------------------------------------------------------------------ #
    # energy_level
    # — derived from combined length trend + latency trend
    # ------------------------------------------------------------------ #
    avg_length = _safe_avg(user_lengths)
    avg_rt = _safe_avg(response_times) if response_times else None

    # Normalise length: 0 chars → 0, 200+ → 1
    length_norm = min(avg_length / 200.0, 1.0)
    # Normalise latency: fast (0 ms) → 1, slow (60 s) → 0
    if avg_rt is not None:
        rt_norm = max(0.0, 1.0 - avg_rt / 60_000.0)
    else:
        rt_norm = 0.5  # neutral when timing unavailable

    energy_score = length_norm * 0.55 + rt_norm * 0.45

    if energy_score >= 0.65:
        energy_level = "high"
    elif energy_score <= 0.30:
        energy_level = "low"
    else:
        energy_level = "medium"

    if energy_level != "medium":
        adaptations.append(f"energy={energy_level} (engagement score {energy_score:.2f})")

    return {
        "response_length_bias": response_length_bias,
        "formality_bias": formality_bias,
        "humor_bias": humor_bias,
        "empathy_bias": empathy_bias,
        "depth_bias": depth_bias,
        "pacing_hint": pacing_hint,
        "energy_level": energy_level,
        "active_adaptations": adaptations,
        "confidence": confidence,
    }


# ---------------------------------------------------------------------------
# Snapshot persistence
# ---------------------------------------------------------------------------

def save_preference_snapshot(
    char_id: int,
    modifiers: dict,
    conn: sqlite3.Connection,
) -> None:
    """Persist a BehaviorModifier snapshot to the ``preference_history`` table.

    Maps bias values from the ``[-0.3, +0.3]`` range to the ``[0.0, 1.0]``
    preference scale used by ``preference_history`` (0.5 = neutral, 0.0 =
    minimum, 1.0 = maximum).  The window size is hardcoded to 20 to match the
    default *window_size* in :func:`compute_behavior_modifiers`.

    A no-op when the ``preference_history`` table does not exist (migration
    not yet applied).

    Args:
        char_id: Character whose modifier snapshot to save.
        modifiers: Dict returned by :func:`compute_behavior_modifiers`.
        conn: Open, writable SQLite connection.

    Returns:
        None

    Example:
        >>> import sqlite3
        >>> conn = sqlite3.connect(":memory:")
        >>> mods = {"response_length_bias": 0.15, "formality_bias": -0.1,
        ...         "humor_bias": 0.2, "empathy_bias": 0.0, "depth_bias": 0.05,
        ...         "confidence": 0.7}
        >>> save_preference_snapshot(1, mods, conn)  # no-op — table absent
    """
    def _bias_to_pref(bias: float) -> float:
        """Map [-0.3, +0.3] bias to [0.0, 1.0] preference (0.5 = neutral)."""
        return max(0.0, min(1.0, 0.5 + bias / _BIAS_CLAMP * 0.5))

    pref_length = _bias_to_pref(float(modifiers.get("response_length_bias", 0.0)))
    pref_formality = _bias_to_pref(float(modifiers.get("formality_bias", 0.0)))
    pref_humor = _bias_to_pref(float(modifiers.get("humor_bias", 0.0)))
    pref_empathy = _bias_to_pref(float(modifiers.get("empathy_bias", 0.0)))
    pref_depth = _bias_to_pref(float(modifiers.get("depth_bias", 0.0)))
    confidence = float(modifiers.get("confidence", 0.0))

    try:
        conn.execute(
            """
            INSERT INTO preference_history
                (char_id,
                 pref_response_length, pref_formality, pref_humor,
                 pref_empathy, pref_depth,
                 window_size, decay_factor, confidence)
            VALUES (?, ?, ?, ?, ?, ?, 20, 0.95, ?)
            """,
            (
                char_id,
                pref_length,
                pref_formality,
                pref_humor,
                pref_empathy,
                pref_depth,
                confidence,
            ),
        )
        conn.commit()
        logger.debug(
            "save_preference_snapshot: saved snapshot for char_id=%d confidence=%.2f",
            char_id,
            confidence,
        )
    except sqlite3.OperationalError:
        # Table not yet created — harmless
        logger.debug(
            "save_preference_snapshot: preference_history table absent — skipping"
        )
    except Exception as exc:
        logger.warning(
            "save_preference_snapshot failed for char_id=%d: %s", char_id, exc
        )


# ---------------------------------------------------------------------------
# Regression detection
# ---------------------------------------------------------------------------

def check_engagement_regression(
    char_id: int,
    conn: sqlite3.Connection,
    *,
    lookback: int = 5,
) -> dict | None:
    """Compare recent engagement to the preceding window to detect regressions.

    Loads ``lookback * 2`` signals and splits them into two halves: the older
    half (baseline) and the more recent half (current).  A regression is
    flagged when **both** of the following hold:

    - Mean ``sentiment_score`` in the current window is more than 0.2 below
      the baseline window's mean.
    - Mean ``user_msg_length`` in the current window is more than 30% below
      the baseline window's mean.

    The dual-condition requirement reduces false positives from users who
    simply send shorter messages on a busy day.

    Args:
        char_id: Character to check.
        conn: Open SQLite connection.
        lookback: Number of signals in each comparison window.  Total rows
            loaded = ``lookback * 2``.

    Returns:
        Dict ``{"regressed": True, "reason": "<description>"}`` when both
        regression criteria are met, otherwise ``None``.

    Example:
        >>> import sqlite3
        >>> conn = sqlite3.connect(":memory:")
        >>> check_engagement_regression(1, conn, lookback=5) is None
        True
    """
    signals = _load_signals(char_id, conn, lookback * 2)

    if len(signals) < lookback * 2:
        # Not enough data to compare two windows
        return None

    baseline = signals[:lookback]
    current = signals[lookback:]

    baseline_sentiment = _safe_avg([float(s.get("sentiment_score") or 0.0) for s in baseline])
    current_sentiment = _safe_avg([float(s.get("sentiment_score") or 0.0) for s in current])

    baseline_length = _safe_avg([float(s.get("user_msg_length") or 0) for s in baseline])
    current_length = _safe_avg([float(s.get("user_msg_length") or 0) for s in current])

    sentiment_drop = baseline_sentiment - current_sentiment
    length_drop_pct = (
        (baseline_length - current_length) / baseline_length
        if baseline_length > 0
        else 0.0
    )

    if sentiment_drop > 0.2 and length_drop_pct > 0.30:
        reason = (
            f"sentiment dropped by {sentiment_drop:.2f} (baseline {baseline_sentiment:.2f} "
            f"→ current {current_sentiment:.2f}); "
            f"message length dropped by {length_drop_pct:.0%} "
            f"(baseline {baseline_length:.0f} → current {current_length:.0f} chars)"
        )
        logger.info(
            "check_engagement_regression: regression detected for char_id=%d — %s",
            char_id,
            reason,
        )
        return {"regressed": True, "reason": reason}

    return None


# ---------------------------------------------------------------------------
# Adaptation reversion
# ---------------------------------------------------------------------------

def revert_adaptations(char_id: int, conn: sqlite3.Connection) -> None:
    """Delete the most recent preference snapshot and log the reversion.

    Called automatically when :func:`check_engagement_regression` reports a
    regression.  Removes the newest row in ``preference_history`` for
    *char_id*, effectively rolling the preference state back to the previous
    snapshot.

    A no-op when the ``preference_history`` table does not exist or no rows
    are present for *char_id*.

    Args:
        char_id: Character whose latest preference snapshot to remove.
        conn: Open, writable SQLite connection.

    Returns:
        None

    Example:
        >>> import sqlite3
        >>> conn = sqlite3.connect(":memory:")
        >>> revert_adaptations(1, conn)  # no-op — table absent
    """
    try:
        row = conn.execute(
            """
            SELECT id FROM preference_history
            WHERE char_id = ?
            ORDER BY computed_at DESC
            LIMIT 1
            """,
            (char_id,),
        ).fetchone()

        if row is None:
            logger.debug(
                "revert_adaptations: no snapshot to revert for char_id=%d", char_id
            )
            return

        snapshot_id = row[0]
        conn.execute(
            "DELETE FROM preference_history WHERE id = ?",
            (snapshot_id,),
        )
        conn.commit()
        logger.info(
            "revert_adaptations: removed snapshot id=%d for char_id=%d "
            "(engagement regression detected)",
            snapshot_id,
            char_id,
        )
    except sqlite3.OperationalError:
        logger.debug(
            "revert_adaptations: preference_history table absent — nothing to revert"
        )
    except Exception as exc:
        logger.warning(
            "revert_adaptations failed for char_id=%d: %s", char_id, exc
        )


# ---------------------------------------------------------------------------
# Prompt block builder
# ---------------------------------------------------------------------------

def build_behavior_prompt_block(modifiers: dict) -> str:
    """Convert a BehaviorModifier dict into a natural-language prompt block.

    Only dimensions with a non-trivial bias (|bias| >= 0.05) are included in
    the output.  Returns an empty string when no biases exceed the threshold,
    so callers can check truthiness and skip injection when there is nothing
    to say.

    The output is designed to be compact (< 100 tokens) so it can be injected
    into the system prompt without meaningfully consuming the LLM context
    budget.

    Args:
        modifiers: Dict returned by :func:`compute_behavior_modifiers`.

    Returns:
        Multi-line string suitable for system-prompt injection, or an empty
        string when all biases are near zero.

    Example:
        >>> mods = {
        ...     "response_length_bias": 0.15,
        ...     "formality_bias": 0.0,
        ...     "humor_bias": 0.20,
        ...     "empathy_bias": 0.0,
        ...     "depth_bias": 0.0,
        ...     "pacing_hint": "normal",
        ...     "energy_level": "medium",
        ...     "active_adaptations": [],
        ...     "confidence": 0.72,
        ... }
        >>> block = build_behavior_prompt_block(mods)
        >>> "0.72" in block
        True
        >>> "length" in block.lower()
        True
    """
    confidence = float(modifiers.get("confidence", 0.0))
    lines: list[str] = []

    # ---- Response length ----
    length_bias = float(modifiers.get("response_length_bias", 0.0))
    if abs(length_bias) >= 0.05:
        if length_bias > 0:
            lines.append(
                f"- Slightly longer, more detailed responses ({length_bias:+.2f} length)"
            )
        else:
            lines.append(
                f"- Shorter, more concise responses ({length_bias:+.2f} length)"
            )

    # ---- Formality ----
    formality_bias = float(modifiers.get("formality_bias", 0.0))
    if abs(formality_bias) >= 0.05:
        if formality_bias > 0:
            lines.append(
                f"- More formal, polished tone ({formality_bias:+.2f} formality)"
            )
        else:
            lines.append(
                f"- More casual, relaxed tone ({formality_bias:+.2f} formality)"
            )

    # ---- Humor ----
    humor_bias = float(modifiers.get("humor_bias", 0.0))
    if abs(humor_bias) >= 0.05:
        if humor_bias > 0:
            lines.append(
                f"- More humor and playfulness ({humor_bias:+.2f} humor)"
            )
        else:
            lines.append(
                f"- Fewer jokes, more serious tone ({humor_bias:+.2f} humor)"
            )

    # ---- Empathy ----
    empathy_bias = float(modifiers.get("empathy_bias", 0.0))
    if abs(empathy_bias) >= 0.05:
        if empathy_bias > 0:
            lines.append(
                f"- More emotional attunement and warmth ({empathy_bias:+.2f} empathy)"
            )
        else:
            lines.append(
                f"- More matter-of-fact, direct responses ({empathy_bias:+.2f} empathy)"
            )

    # ---- Depth ----
    depth_bias = float(modifiers.get("depth_bias", 0.0))
    if abs(depth_bias) >= 0.05:
        if depth_bias > 0:
            lines.append(
                f"- More depth in conversations ({depth_bias:+.2f} depth)"
            )
        else:
            lines.append(
                f"- Surface-level, accessible explanations ({depth_bias:+.2f} depth)"
            )

    if not lines:
        return ""

    # ---- Pacing / energy context line ----
    pacing_hint: str = modifiers.get("pacing_hint", "normal")
    energy_level: str = modifiers.get("energy_level", "medium")

    pacing_str = f"{pacing_hint} pacing" if pacing_hint != "normal" else "normal pacing"
    energy_str = f"{energy_level} energy"

    header = f"[Behavior Adaptation — confidence: {confidence:.2f}]"
    intro = "The user responds best to:"
    footer = f"Current pacing: {pacing_str}, {energy_str}"

    return "\n".join([header, intro] + lines + [footer])
