"""JSON Schema for the Kokoro structured response.

Used to ask an OpenAI-compatible server (LM Studio, Ollama, llama.cpp) to
*constrain* decoding to the response contract instead of merely requesting it
in prose.  The May-2026 live validation (``docs/research/2026-05-29-kokoro-
parse-ok-validation.md``) showed prose-only requests score ~0% parse_ok on
persona-heavy prompts, so forcing the shape server-side is the first fix
candidate benchmarked by ``tools/bench``.

The enums are imported from :mod:`backend.kokoro.response_parser` so the
schema and the parser can never drift apart.  This module is pure data — it
changes no runtime behaviour until a caller opts in.
"""
from __future__ import annotations

from .mind_state import ALL_MIND_DIALS, TIER_A_FAST, TIER_B_SLOW
from .response_parser import VALID_FACES, VALID_GESTURES

# Per-turn delta cap — mirrors ``PER_TURN_CAP`` in ``mind_state.apply_state_delta``.
DELTA_CAP = 0.05


def companion_response_json_schema(*, nsfw_active: bool = False) -> dict:
    """Return the JSON Schema for a Kokoro turn.

    Args:
        nsfw_active: When True, also allow the NSFW-gated ``boundaryReinforcement``
            boolean (matches the contract in ``prompt_fragment``).

    Returns:
        A JSON-Schema dict (draft-07 style) suitable for the ``schema`` member
        of an OpenAI ``response_format={"type": "json_schema", ...}`` request.

    Example:
        >>> s = companion_response_json_schema()
        >>> sorted(s["required"])
        ['facialExpression', 'gesture', 'memoryWrite', 'reply', 'stateDelta']
    """
    # Tier F (intimate) dials are only addressable when the NSFW gate is open —
    # same defense-in-depth rule as ``parse_companion_response(nsfw_active=...)``.
    dials = ALL_MIND_DIALS if nsfw_active else TIER_A_FAST + TIER_B_SLOW
    properties: dict = {
        "reply": {"type": "string"},
        "facialExpression": {"type": "string", "enum": sorted(VALID_FACES)},
        "gesture": {"type": "string", "enum": sorted(VALID_GESTURES)},
        "memoryWrite": {
            "type": "object",
            "properties": {
                "shouldSave": {"type": "boolean"},
                "summary": {"type": "string"},
                "importance": {"type": "number"},
                "emotionalSalience": {"type": "number"},
            },
            "required": ["shouldSave", "summary", "importance", "emotionalSalience"],
            "additionalProperties": False,
        },
        "stateDelta": {
            "type": "object",
            "properties": {
                dial: {"type": "number", "minimum": -DELTA_CAP, "maximum": DELTA_CAP}
                for dial in dials
            },
            "additionalProperties": False,
        },
    }
    required = ["reply", "facialExpression", "gesture", "memoryWrite", "stateDelta"]
    if nsfw_active:
        properties["boundaryReinforcement"] = {"type": "boolean"}
        required.append("boundaryReinforcement")
    return {
        "type": "object",
        "properties": properties,
        "required": required,
        "additionalProperties": False,
    }


def response_format_for(*, nsfw_active: bool = False, name: str = "companion_response") -> dict:
    """Wrap the schema in the OpenAI-style ``response_format`` envelope.

    LM Studio and Ollama (OpenAI-compat ``/v1``) both accept this shape, but
    they honour ``strict`` and numeric ``minimum``/``maximum`` to different
    degrees (some builds ignore or reject them).  Do not assume a schema-forced
    reply is in range — ``tools/bench`` measures this as ``delta_in_clamp`` and
    ``apply_state_delta`` still hard-caps every delta server-side.
    """
    return {
        "type": "json_schema",
        "json_schema": {
            "name": name,
            "strict": True,
            "schema": companion_response_json_schema(nsfw_active=nsfw_active),
        },
    }
