"""Tests for backend.kokoro.drift."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from backend.kokoro.drift import (
    LONELINESS_RISE_PER_HOUR,
    MAX_DRIFT_HOURS,
    NOSTALGIA_BASELINE,
    _restedness_for_hour,
    compute_drift,
)
from backend.kokoro.mind_state import MindState


def _mind_at(iso: str, **overrides) -> MindState:
    return MindState(character_id=1, updated_at=iso, **overrides)


def test_missing_updated_at_is_noop():
    m = MindState(character_id=1)  # updated_at is None
    assert compute_drift(m) is m


def test_zero_elapsed_is_noop():
    now = datetime(2026, 5, 24, 12, 0, 0, tzinfo=timezone.utc)
    m = _mind_at(now.isoformat(), loneliness=0.4)
    out = compute_drift(m, now=now)
    assert out.loneliness == 0.4


def test_time_travel_backwards_is_noop():
    # updated_at in the future relative to now → don't drift.
    future = datetime(2027, 1, 1, tzinfo=timezone.utc)
    m = _mind_at(future.isoformat(), loneliness=0.3)
    now = datetime(2026, 5, 24, tzinfo=timezone.utc)
    out = compute_drift(m, now=now)
    assert out.loneliness == 0.3


def test_24h_silence_raises_loneliness():
    prev = datetime(2026, 5, 24, 0, 0, 0, tzinfo=timezone.utc)
    later = prev + timedelta(hours=24)
    m = _mind_at(prev.isoformat(), loneliness=0.30)
    out = compute_drift(m, now=later)
    # Capped at MAX_DRIFT_HOURS = 6, so rise is bounded.
    expected = min(1.0, 0.30 + LONELINESS_RISE_PER_HOUR * MAX_DRIFT_HOURS)
    assert out.loneliness == pytest.approx(expected, abs=1e-6)


def test_drift_caps_at_max_hours():
    # 100h elapsed → still only MAX_DRIFT_HOURS worth of movement.
    prev = datetime(2026, 5, 1, tzinfo=timezone.utc)
    later = prev + timedelta(hours=100)
    m = _mind_at(prev.isoformat(), loneliness=0.10, boredom_with_topic=0.50)
    out = compute_drift(m, now=later)
    max_loneliness_gain = LONELINESS_RISE_PER_HOUR * MAX_DRIFT_HOURS
    assert out.loneliness <= 0.10 + max_loneliness_gain + 1e-6


def test_boredom_decays_toward_zero():
    prev = datetime(2026, 5, 24, tzinfo=timezone.utc)
    later = prev + timedelta(hours=5)
    m = _mind_at(prev.isoformat(), boredom_with_topic=0.80)
    out = compute_drift(m, now=later)
    assert out.boredom_with_topic < 0.80


def test_anticipation_decays_toward_zero():
    prev = datetime(2026, 5, 24, tzinfo=timezone.utc)
    later = prev + timedelta(hours=4)
    m = _mind_at(prev.isoformat(), anticipation=0.70)
    out = compute_drift(m, now=later)
    assert out.anticipation < 0.70


def test_nostalgia_drifts_toward_baseline_from_above():
    prev = datetime(2026, 5, 24, tzinfo=timezone.utc)
    later = prev + timedelta(hours=6)
    m = _mind_at(prev.isoformat(), nostalgia=0.80)
    out = compute_drift(m, now=later)
    assert NOSTALGIA_BASELINE <= out.nostalgia < 0.80


def test_nostalgia_does_not_overshoot_baseline():
    # Far in the past — should land exactly on baseline, not below.
    prev = datetime(2025, 1, 1, tzinfo=timezone.utc)
    later = datetime(2026, 6, 1, tzinfo=timezone.utc)
    m = _mind_at(prev.isoformat(), nostalgia=0.90)
    out = compute_drift(m, now=later)
    assert out.nostalgia >= NOSTALGIA_BASELINE - 1e-6


def test_restedness_targets_late_night_high_evening_low():
    # Peak around 04:00, trough around 16:00 (afternoon slump in this model).
    # Property: morning > evening; full range stays in [0.40, 0.95].
    assert _restedness_for_hour(4.0) > _restedness_for_hour(22.0)
    assert _restedness_for_hour(4.0) > _restedness_for_hour(16.0)
    assert 0.40 <= _restedness_for_hour(16.0) <= 0.50
    assert 0.90 <= _restedness_for_hour(4.0) <= 0.96


def test_restedness_drifts_toward_target():
    # Start at 0.5; "now" = 04:00 UTC; should pull up toward ~0.95.
    prev = datetime(2026, 5, 24, 0, 0, 0, tzinfo=timezone.utc)
    later = datetime(2026, 5, 24, 4, 0, 0, tzinfo=timezone.utc)
    m = _mind_at(prev.isoformat(), restedness=0.50)
    out = compute_drift(m, now=later)
    assert out.restedness > 0.50


def test_afterglow_decays_when_positive():
    prev = datetime(2026, 5, 24, tzinfo=timezone.utc)
    later = prev + timedelta(hours=3)
    m = _mind_at(prev.isoformat(), afterglow=0.50)
    out = compute_drift(m, now=later)
    assert out.afterglow < 0.50
    assert out.afterglow >= 0.0


def test_afterglow_zero_stays_zero():
    prev = datetime(2026, 5, 24, tzinfo=timezone.utc)
    later = prev + timedelta(hours=3)
    m = _mind_at(prev.isoformat(), afterglow=0.0)
    out = compute_drift(m, now=later)
    assert out.afterglow == 0.0


def test_tier_a_dials_untouched():
    prev = datetime(2026, 5, 24, tzinfo=timezone.utc)
    later = prev + timedelta(hours=5)
    m = _mind_at(prev.isoformat(), mood=0.7, curiosity=0.8, playfulness=0.3)
    out = compute_drift(m, now=later)
    assert out.mood == 0.7
    assert out.curiosity == 0.8
    assert out.playfulness == 0.3


def test_sqlite_timestamp_format_parses():
    # SQLite ``datetime('now')`` returns 'YYYY-MM-DD HH:MM:SS' (space, no TZ).
    m = _mind_at("2026-05-24 12:00:00", loneliness=0.3)
    later = datetime(2026, 5, 24, 18, 0, 0, tzinfo=timezone.utc)
    out = compute_drift(m, now=later)
    assert out.loneliness > 0.3
