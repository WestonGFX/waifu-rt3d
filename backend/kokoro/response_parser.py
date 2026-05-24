"""Parse Kokoro structured-JSON LLM responses with graceful text fallback.

The LLM is asked to return a JSON object containing the spoken reply plus
embodiment metadata (face, gesture, gaze, voice style), a state delta, a
memory write decision, and optional NSFW-gated extras (suggestiveBid,
innerArousalShift, etc.).

**Critical:** if the model returns plain text instead of JSON, or invalid JSON,
the chat must NOT break.  :func:`parse_companion_response` always returns a
``CompanionResponse``; on failure it treats the entire LLM output as a plain
text reply with neutral embodiment metadata and an empty delta.
"""
from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass, field
from typing import Optional

logger = logging.getLogger(__name__)


# --- Enums (kept as string literals; mirrored in frontends/sakura/src/lib/kokoro.ts) ---

VALID_EMOTIONS = {
    "neutral", "focused_warm", "happy", "soft", "concerned",
    "playful", "shy", "excited", "sleepy", "frustrated", "proud",
}
VALID_FACES = {
    "neutral", "soft_smile", "smile", "concerned", "surprised",
    "smug", "blush", "sleepy", "focused",
}
VALID_GESTURES = {
    "idle", "wave", "thinking", "point", "hands_clasped",
    "heart", "small_nod", "tilt_head",
}
VALID_GAZE = {"user", "away", "thinking", "object", "camera"}
VALID_VOICE_STYLES = {"calm", "warm", "bright", "sleepy", "serious", "teasing"}


# --- Dataclasses ----------------------------------------------------------


@dataclass
class StateDelta:
    """Bounded per-turn deltas the LLM proposes for each dial.

    Stored as a free-form dict so this struct survives schema changes (new
    dials added in a later migration don't require parser changes).  Values
    outside ``[-0.05, +0.05]`` are clamped by :func:`apply_state_delta`.
    """
    values: dict = field(default_factory=dict)


@dataclass
class MemoryWrite:
    """LLM's recommendation on whether to persist this turn as a memory."""
    should_save: bool = False
    summary: str = ""
    importance: float = 0.0
    emotional_salience: float = 0.0


@dataclass
class CompanionResponse:
    """Parsed structured response from a Kokoro turn.

    ``parse_ok`` is False when the LLM emitted plain text instead of JSON —
    callers may want to record this rate for tuning the prompt.  Even then
    ``reply`` is populated with the raw text so the user still sees a response.
    """
    reply: str
    inner_thought: str = ""
    emotion: str = "neutral"
    facial_expression: str = "neutral"
    gesture: str = "idle"
    gaze: str = "user"
    voice_style: str = "calm"
    memory_write: MemoryWrite = field(default_factory=MemoryWrite)
    state_delta: StateDelta = field(default_factory=StateDelta)
    # NSFW-gated extras (None when Tier F was not active or LLM omitted them)
    inner_arousal_shift: Optional[float] = None
    suggestive_bid: Optional[str] = None
    self_consent_check: bool = False
    boundary_reinforcement: bool = False
    # Diagnostics
    parse_ok: bool = True
    raw_text: str = ""


# --- Parsing ---------------------------------------------------------------


_JSON_FENCE_RE = re.compile(r"```(?:json)?\s*(.*?)\s*```", re.DOTALL)


def _extract_json_blob(text: str) -> Optional[str]:
    """Find a JSON object inside arbitrary LLM output.

    Tries, in order:
      1. The entire text (most well-behaved models).
      2. The contents of the first ```json ... ``` fence.
      3. The substring from the first ``{`` to the last ``}``.
    """
    stripped = text.strip()
    if stripped.startswith("{") and stripped.endswith("}"):
        return stripped
    m = _JSON_FENCE_RE.search(text)
    if m:
        return m.group(1).strip()
    first = text.find("{")
    last = text.rfind("}")
    if first != -1 and last > first:
        return text[first : last + 1]
    return None


def _valid_or(default: str, value, allowed: set) -> str:
    if isinstance(value, str) and value in allowed:
        return value
    return default


def parse_companion_response(text: str, *, nsfw_active: bool = False) -> CompanionResponse:
    """Parse a Kokoro LLM response, falling back to plain text on failure.

    Args:
        text: Raw LLM output (may include code fences, prose, etc.).
        nsfw_active: When True, parse Tier F fields.  When False, those fields
            are forced to their inert defaults regardless of model output —
            this is a defense-in-depth check on top of the prompt-level gate
            in :mod:`backend.kokoro.service`.

    Returns:
        A populated ``CompanionResponse``.  Never raises.

    Example:
        >>> r = parse_companion_response('hi there')
        >>> r.parse_ok, r.reply
        (False, 'hi there')
        >>> r2 = parse_companion_response('{"reply":"hey","emotion":"happy"}')
        >>> r2.parse_ok, r2.emotion
        (True, 'happy')
    """
    blob = _extract_json_blob(text)
    if blob is None:
        return CompanionResponse(reply=text.strip(), parse_ok=False, raw_text=text)
    try:
        data = json.loads(blob)
    except (json.JSONDecodeError, TypeError):
        logger.info("Kokoro JSON parse failed, returning plain-text fallback")
        return CompanionResponse(reply=text.strip(), parse_ok=False, raw_text=text)
    if not isinstance(data, dict):
        return CompanionResponse(reply=text.strip(), parse_ok=False, raw_text=text)

    reply = str(data.get("reply", "")).strip() or text.strip()
    inner_thought = str(data.get("innerThought", "") or "")

    mw_raw = data.get("memoryWrite") or {}
    if not isinstance(mw_raw, dict):
        mw_raw = {}
    mw = MemoryWrite(
        should_save=bool(mw_raw.get("shouldSave")),
        summary=str(mw_raw.get("summary", "") or ""),
        importance=float(mw_raw.get("importance", 0.0) or 0.0),
        emotional_salience=float(mw_raw.get("emotionalSalience", 0.0) or 0.0),
    )

    delta_raw = data.get("stateDelta") or {}
    if not isinstance(delta_raw, dict):
        delta_raw = {}
    # Normalize numeric values; non-numeric entries become 0.
    clean_delta = {}
    for k, v in delta_raw.items():
        try:
            clean_delta[k] = float(v)
        except (TypeError, ValueError):
            continue

    resp = CompanionResponse(
        reply=reply,
        inner_thought=inner_thought,
        emotion=_valid_or("neutral", data.get("emotion"), VALID_EMOTIONS),
        facial_expression=_valid_or("neutral", data.get("facialExpression"), VALID_FACES),
        gesture=_valid_or("idle", data.get("gesture"), VALID_GESTURES),
        gaze=_valid_or("user", data.get("gaze"), VALID_GAZE),
        voice_style=_valid_or("calm", data.get("voiceStyle"), VALID_VOICE_STYLES),
        memory_write=mw,
        state_delta=StateDelta(values=clean_delta),
        parse_ok=True,
        raw_text=text,
    )

    if nsfw_active:
        ias = data.get("innerArousalShift")
        try:
            resp.inner_arousal_shift = float(ias) if ias is not None else None
        except (TypeError, ValueError):
            resp.inner_arousal_shift = None
        sb = data.get("suggestiveBid")
        resp.suggestive_bid = str(sb) if isinstance(sb, str) and sb.strip() else None
        resp.self_consent_check = bool(data.get("selfConsentCheck"))
        resp.boundary_reinforcement = bool(data.get("boundaryReinforcement"))

    return resp
