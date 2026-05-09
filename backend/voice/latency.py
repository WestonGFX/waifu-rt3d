"""Rolling latency ring buffer for voice pipeline telemetry.

Stores recent timing samples from ASR, LLM, and TTS phases so the frontend
can display p50/p95 stats in the VoiceConversationPanel without any DB writes.

Usage::

    from backend.voice.latency import record_latency, get_stats

    t0 = time.perf_counter()
    # ... work ...
    record_latency("asr", int((time.perf_counter() - t0) * 1000))

    stats = get_stats()  # {"asr": {"p50": 380, "p95": 920, "n": 14}, ...}
"""

import collections
import statistics
import time
from typing import TypedDict


class _Sample(TypedDict):
    ts: float
    phase: str
    ms: int


class PhaseStats(TypedDict):
    p50: int
    p95: int
    n: int


# Shared ring buffer — maxlen=200 retains ~50 voice exchanges before oldest drop.
_RING: collections.deque[_Sample] = collections.deque(maxlen=200)

# Valid phase labels
PHASES = ("asr", "llm_first_token", "tts_first_chunk", "tts_total")


def record_latency(phase: str, ms: int) -> None:
    """Record a latency sample for the given voice pipeline phase.

    Args:
        phase: One of ``PHASES`` — ``"asr"``, ``"llm_first_token"``,
               ``"tts_first_chunk"``, or ``"tts_total"``.
        ms: Wall-clock elapsed time in milliseconds.
    """
    _RING.append({"ts": time.time(), "phase": phase, "ms": ms})


def get_stats() -> dict[str, PhaseStats]:
    """Compute p50 and p95 per phase from the ring buffer.

    Returns:
        Dict keyed by phase name with ``{"p50": int, "p95": int, "n": int}``.
        Empty dict if no samples have been recorded yet.

    Example:
        >>> get_stats()
        {"asr": {"p50": 380, "p95": 920, "n": 14}, "tts_total": {"p50": 540, "p95": 1200, "n": 14}}
    """
    by_phase: dict[str, list[int]] = {p: [] for p in PHASES}
    for sample in list(_RING):
        phase = sample["phase"]
        if phase in by_phase:
            by_phase[phase].append(sample["ms"])

    result: dict[str, PhaseStats] = {}
    for phase, samples in by_phase.items():
        if not samples:
            continue
        n = len(samples)
        p50 = int(statistics.median(samples))
        # statistics.quantiles needs n >= 2; fall back to max for single sample
        p95 = int(statistics.quantiles(samples, n=20)[18]) if n >= 2 else samples[0]
        result[phase] = {"p50": p50, "p95": p95, "n": n}
    return result
