"""Objective scoring of one model output against the Kokoro contract.

Reuses the app's own parser (:func:`parse_companion_response`) so
``parse_ok`` here means exactly what it means in ``kokoro_parse_log`` and the
dev HUD badge.  The extra checks are stricter on purpose: ``parse_ok`` alone
is generous (it digs JSON out of fences/prose and accepts any dict), so we
also report whether the model complied *cleanly*.
"""
from __future__ import annotations

import json
import re
from typing import Optional

from backend.kokoro.mind_state import TIER_A_FAST, TIER_B_SLOW
from backend.kokoro.response_parser import (
    VALID_FACES,
    VALID_GESTURES,
    parse_companion_response,
)
from backend.kokoro.response_schema import DELTA_CAP

_LEAK_RE = re.compile(r'"(stateDelta|facialExpression|memoryWrite|gesture)"\s*:', re.IGNORECASE)
_ACTION_RE = re.compile(r"\*[^*\n]{2,}\*")
# Dials a non-NSFW turn may nudge (Tier A + B). The bench always runs with nsfw_active=False, so Tier F
# dials count as "unknown" here; if a future phase benchmarks the gated contract, parameterise this.
_LIVE_DIALS = set(TIER_A_FAST + TIER_B_SLOW)


def _unit_number(v) -> bool:
    """True for a real number (not bool) in [0, 1] - the contract's weight range."""
    return isinstance(v, (int, float)) and not isinstance(v, bool) and 0.0 <= float(v) <= 1.0


def _strict_object(text: str) -> Optional[dict]:
    """Parse ``text`` only if the *whole* output is one JSON object."""
    s = text.strip()
    if not (s.startswith("{") and s.endswith("}")):
        return None
    try:
        obj = json.loads(s)
    except (json.JSONDecodeError, TypeError):
        return None
    return obj if isinstance(obj, dict) else None


def score_structured(text: str, *, require_reply: bool = True) -> dict:
    """Score a structured (JSON) output.

    Args:
        text: Raw model output.
        require_reply: Whether the ``reply`` key is part of the contract (False
            for the S2 annotation call, whose reply comes from call one).

    Returns:
        Dict of booleans/counters: ``parse_ok``, ``strict_json``,
        ``schema_valid``, ``delta_in_clamp``, ``unknown_dials``,
        ``reply_nonempty``, ``json_leak``, ``action_markup``.
    """
    parsed = parse_companion_response(text)
    obj = _strict_object(text)

    schema_valid = False
    delta_in_clamp = True
    unknown_dials = 0
    if obj is not None:
        mw = obj.get("memoryWrite")
        sd = obj.get("stateDelta")
        schema_valid = (
            (not require_reply or isinstance(obj.get("reply"), str))
            and obj.get("facialExpression") in VALID_FACES
            and obj.get("gesture") in VALID_GESTURES
            and isinstance(mw, dict) and isinstance(mw.get("shouldSave"), bool)
            and isinstance(mw.get("summary"), str)
            and _unit_number(mw.get("importance")) and _unit_number(mw.get("emotionalSalience"))
            and isinstance(sd, dict)
        )
        if isinstance(sd, dict):
            for k, v in sd.items():
                if k not in _LIVE_DIALS:
                    unknown_dials += 1
                try:
                    if abs(float(v)) > DELTA_CAP + 1e-9:
                        delta_in_clamp = False
                except (TypeError, ValueError):
                    delta_in_clamp = False

    visible = parsed.reply if parsed.parse_ok else text
    return {
        "parse_ok": bool(parsed.parse_ok),
        "strict_json": obj is not None,
        "schema_valid": bool(schema_valid),
        "delta_in_clamp": bool(delta_in_clamp),
        "unknown_dials": unknown_dials,
        "reply_nonempty": bool(parsed.reply.strip()) if require_reply else True,
        "json_leak": bool(_LEAK_RE.search(visible or "")),
        "action_markup": bool(_ACTION_RE.search(visible or "")),
    }


def score_prose(text: str) -> dict:
    """Score a plain in-character reply (S2 call one).

    Returns:
        ``reply_nonempty``, ``json_leak`` (structure leaking into visible
        prose), ``action_markup`` (kept the persona's ``*action*`` style).
    """
    return {
        "reply_nonempty": bool(text.strip()),
        "json_leak": bool(_LEAK_RE.search(text)) or text.lstrip().startswith("{"),
        "action_markup": bool(_ACTION_RE.search(text)),
    }


def visible_reply(text: str) -> str:
    """The text a user would actually see for a structured output."""
    parsed = parse_companion_response(text)
    return parsed.reply if parsed.parse_ok else text.strip()
