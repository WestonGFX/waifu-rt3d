"""Kokoro Engine v1 — embodied companion mind layer.

A thin opt-in turn pipeline that sits alongside the existing chat flow.
Loads multi-tier dial state (Tier A fast / Tier B slow / Tier C identity /
Tier E per-thread, plus optional Tier F NSFW), renders a compact prompt
fragment, asks the LLM for a structured JSON response that fuses spoken
reply with embodiment metadata, and applies bounded state deltas.

Gated by the ``kokoro_enabled`` config flag.  When disabled, none of these
modules are imported by the chat path — the existing pipeline is byte-
identical to pre-Kokoro behavior.

See ``~/.claude/plans/done-i-made-you-wondrous-conway.md`` for the full
design.
"""
from .mind_state import (
    MindState,
    TraitVector,
    ThreadState,
    load_mind_state,
    load_traits,
    load_thread_state,
    save_mind_state,
    save_thread_state,
    apply_state_delta,
    clamp01,
)
from .response_parser import (
    CompanionResponse,
    StateDelta,
    MemoryWrite,
    parse_companion_response,
)
from .prompt_fragment import build_kokoro_fragment

__all__ = [
    "MindState",
    "TraitVector",
    "ThreadState",
    "CompanionResponse",
    "StateDelta",
    "MemoryWrite",
    "load_mind_state",
    "load_traits",
    "load_thread_state",
    "save_mind_state",
    "save_thread_state",
    "apply_state_delta",
    "clamp01",
    "parse_companion_response",
    "build_kokoro_fragment",
]
