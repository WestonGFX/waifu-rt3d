"""Tier B dial drift — lazy time-based update of slow-moving needs.

Tier B dials live on a different timescale from Tier A.  ``loneliness``
should rise across days of silence; ``restedness`` follows a daily curve
peaking near midnight and bottoming late evening; ``boredom_with_topic``
drains when the user isn't engaging; ``anticipation`` decays toward zero
once events pass; ``nostalgia`` slowly relaxes back to baseline.

Computing these via a background cron would add an extra process to
manage.  Instead we do **lazy drift**: on every ``prepare_turn`` we
compute the elapsed time since ``mind.updated_at`` and step the dials
forward.  Cheap, no extra process, naturally throttled by chat frequency.

All drift functions are pure (no I/O, no mutation).  Caller persists the
returned ``MindState`` via :func:`backend.kokoro.mind_state.save_mind_state`.
"""
from __future__ import annotations

import logging
from dataclasses import replace
from datetime import datetime, timezone
from typing import Optional

from .mind_state import MindState, clamp01

logger = logging.getLogger(__name__)


# Cap drift to at most this many hours per turn.  Catches edge cases like
# multi-day idle gaps where you don't want one chat turn to swing dials
# from one extreme to the other.  6h is the longest realistic "session
# resumed after a few hours" gap; multi-day comes back over several turns.
MAX_DRIFT_HOURS = 6.0

# Tier B drift rates per HOUR.  All small — dials should creep, not lurch.
# Loneliness builds during silence; the next user message will drain it
# via the LLM stateDelta, not via drift.
LONELINESS_RISE_PER_HOUR = 0.010       # ~24h silence → +0.24
BOREDOM_DECAY_PER_HOUR = -0.008        # idle drains topic-fatigue toward 0
ANTICIPATION_DECAY_PER_HOUR = -0.012   # built-up anticipation fades
NOSTALGIA_DECAY_PER_HOUR = -0.005      # nostalgia drifts back to baseline (0.30)
NOSTALGIA_BASELINE = 0.30

# Restedness follows a sinusoidal day curve.  Peak rest at ~04:00 local
# time, lowest rest at ~22:00 (just before bed).  We don't have a true
# circadian rhythm; this is a coarse approximation that gives characters
# "tired in the evening, fresh in the morning" texture.
def _restedness_for_hour(hour_of_day: float) -> float:
    """Map 0..24h to restedness in [0.4, 0.95].

    Phase chosen so 04:00 = max (0.95), 22:00 = min (0.40).  Used as a
    soft target the actual restedness drifts toward — never snapped.
    """
    import math
    # 18h period offset: peak at 4, trough at 22 (18h apart in the wrong
    # direction → use 0.5*cos((h - 4) * 2π/24)).
    centered = (hour_of_day - 4.0) * (2 * math.pi / 24.0)
    val = 0.5 * math.cos(centered) + 0.5
    # Compress range to [0.40, 0.95] so a character never reads as 100% rested
    # or fully exhausted from time-of-day alone.
    return 0.40 + 0.55 * val

RESTEDNESS_PULL_PER_HOUR = 0.04  # how quickly actual drifts toward target


def _parse_updated_at(s: Optional[str]) -> Optional[datetime]:
    """Parse an ISO-ish timestamp string from SQLite (``datetime('now')``).

    Returns None on any failure — callers fall back to "no drift this turn".
    """
    if not s:
        return None
    try:
        # SQLite ``datetime('now')`` returns 'YYYY-MM-DD HH:MM:SS' (UTC, no TZ).
        # ``datetime.fromisoformat`` accepts both space and 'T' separators in 3.11+.
        dt = datetime.fromisoformat(s.replace(" ", "T"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except (ValueError, TypeError):
        return None


def compute_drift(
    mind: MindState,
    *,
    now: Optional[datetime] = None,
) -> MindState:
    """Return a new ``MindState`` with Tier B dials drifted forward.

    Tier A and Tier F dials are passed through untouched — they're meant
    to be the LLM's domain, not the drift engine's.  We *do* touch Tier B
    columns (loneliness, restedness, boredom_with_topic, anticipation,
    nostalgia) and ``afterglow`` (Tier F-slow, decays naturally).

    Args:
        mind: Current state (untouched).
        now: Override for "current time" (test injection).  Defaults to
            ``datetime.now(timezone.utc)``.

    Returns:
        A new ``MindState``.  When ``mind.updated_at`` is missing or
        unparseable, the input is returned unchanged.  When ``now`` is
        before ``updated_at`` (clock skew or time-travel test), no drift
        is applied.

    Example:
        >>> from datetime import timedelta
        >>> m = MindState(character_id=1, loneliness=0.30,
        ...               updated_at='2026-05-24T00:00:00+00:00')
        >>> later = datetime(2026, 5, 25, 0, 0, 0, tzinfo=timezone.utc)
        >>> drifted = compute_drift(m, now=later)
        >>> drifted.loneliness > m.loneliness
        True
    """
    now = now or datetime.now(timezone.utc)
    prev = _parse_updated_at(mind.updated_at)
    if prev is None:
        return mind

    elapsed_h = (now - prev).total_seconds() / 3600.0
    if elapsed_h <= 0:
        return mind  # no drift on clock skew / time-travel
    if elapsed_h > MAX_DRIFT_HOURS:
        elapsed_h = MAX_DRIFT_HOURS

    # Loneliness rises during silence.
    loneliness = clamp01(mind.loneliness + LONELINESS_RISE_PER_HOUR * elapsed_h)

    # Boredom + anticipation decay toward zero.
    boredom = clamp01(mind.boredom_with_topic + BOREDOM_DECAY_PER_HOUR * elapsed_h)
    anticipation = clamp01(mind.anticipation + ANTICIPATION_DECAY_PER_HOUR * elapsed_h)

    # Nostalgia decays toward its baseline rather than zero.
    if mind.nostalgia > NOSTALGIA_BASELINE:
        nostalgia = clamp01(
            mind.nostalgia + NOSTALGIA_DECAY_PER_HOUR * elapsed_h
        )
        if nostalgia < NOSTALGIA_BASELINE:
            nostalgia = NOSTALGIA_BASELINE
    elif mind.nostalgia < NOSTALGIA_BASELINE:
        nostalgia = clamp01(
            mind.nostalgia - NOSTALGIA_DECAY_PER_HOUR * elapsed_h
        )
        if nostalgia > NOSTALGIA_BASELINE:
            nostalgia = NOSTALGIA_BASELINE
    else:
        nostalgia = mind.nostalgia

    # Restedness drifts toward the time-of-day target.
    target = _restedness_for_hour(now.hour + now.minute / 60.0)
    diff = target - mind.restedness
    restedness = clamp01(mind.restedness + diff * RESTEDNESS_PULL_PER_HOUR * elapsed_h)

    # Afterglow (Tier F-slow): decays naturally back to 0.
    afterglow = clamp01(mind.afterglow + (-0.04) * elapsed_h) if mind.afterglow > 0 else mind.afterglow

    return replace(
        mind,
        loneliness=loneliness,
        boredom_with_topic=boredom,
        anticipation=anticipation,
        nostalgia=nostalgia,
        restedness=restedness,
        afterglow=afterglow,
    )
