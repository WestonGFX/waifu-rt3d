"""Kokoro turn-pipeline orchestration helpers.

This module deliberately does NOT call the LLM itself.  The existing chat
endpoint owns the streaming LLM call; this module provides three discrete
helpers it can invoke in order:

    1. :func:`prepare_turn` — load dial state, decide gate, return a context
       bundle that includes the prompt fragment to inject.
    2. :func:`finalize_turn` — parse the raw LLM text into a structured
       ``CompanionResponse``, apply the state delta, persist, and return the
       payload the frontend needs (embodiment + diagnostics).

Gate logic:

    kokoro_active = kokoro_enabled
    nsfw_active   = kokoro_active AND nsfw_enabled AND bond_level >= M6_TIER_F_MIN

We never bypass the existing M6 bond-affinity content ceilings — Tier F
dials only become visible to the LLM once the user has earned them.
"""
from __future__ import annotations

import logging
import sqlite3
from dataclasses import dataclass
from typing import Optional

from .mind_state import (
    MindState,
    ThreadState,
    TraitVector,
    apply_state_delta,
    load_mind_state,
    load_thread_state,
    load_traits,
    save_mind_state,
    save_thread_state,
)
from .prompt_fragment import build_kokoro_fragment
from .response_parser import CompanionResponse, parse_companion_response

logger = logging.getLogger(__name__)

# Bond level at which Tier F dials become visible to the LLM.  This matches
# the lowest M6 NSFW gate (``edgy`` tier) so we never expose Tier F to a
# user who hasn't crossed any NSFW threshold.  See backend/server.py
# ``_NSFW_BOND_GATES`` for the canonical mapping.
M6_TIER_F_MIN = 20


@dataclass
class KokoroTurnContext:
    """Bundle returned by :func:`prepare_turn`.

    The caller (server.py chat endpoint) is expected to inject ``fragment``
    into the system/persona prompt before calling the LLM, then pass the
    rest of the context to :func:`finalize_turn` together with the raw
    LLM output.
    """
    enabled: bool
    nsfw_active: bool
    mind: MindState
    traits: TraitVector
    thread: ThreadState
    fragment: str
    bond_level: int


def _bond_level_for(con: sqlite3.Connection, character_id: int) -> int:
    """Read bond level from the existing progression system; 0 on failure."""
    try:
        from backend.bond.progression import get_bond_level  # local import, optional
        bond = get_bond_level(character_id, con.cursor())
        return int(bond.get("bond_level", 0) or 0)
    except Exception as e:
        logger.warning("kokoro: bond lookup failed for char %s: %s", character_id, e)
        return 0


def prepare_turn(
    con: sqlite3.Connection,
    *,
    character_id: int,
    session_id: int,
    kokoro_enabled: bool,
    nsfw_enabled: bool,
) -> KokoroTurnContext:
    """Load state and build the prompt fragment for a turn.

    When ``kokoro_enabled`` is False this still returns a context object so the
    caller has a single uniform code path, but ``fragment`` is empty and the
    caller should NOT inject anything.

    Args:
        con: Open SQLite connection (the existing chat-endpoint connection).
        character_id: Character whose mind we're loading.
        session_id: Conversation/session id (for thread state).
        kokoro_enabled: Master flag from ``backend/config/app.json``.
        nsfw_enabled: Existing NSFW master toggle from app config.

    Returns:
        A populated ``KokoroTurnContext``.
    """
    mind = load_mind_state(con, character_id)
    traits = load_traits(con, character_id)
    thread = load_thread_state(con, session_id)

    if not kokoro_enabled:
        return KokoroTurnContext(
            enabled=False,
            nsfw_active=False,
            mind=mind, traits=traits, thread=thread,
            fragment="",
            bond_level=0,
        )

    bond_level = _bond_level_for(con, character_id)
    nsfw_active = bool(nsfw_enabled) and bond_level >= M6_TIER_F_MIN
    fragment = build_kokoro_fragment(
        mind=mind, traits=traits, thread=thread, nsfw_active=nsfw_active,
    )
    return KokoroTurnContext(
        enabled=True,
        nsfw_active=nsfw_active,
        mind=mind, traits=traits, thread=thread,
        fragment=fragment,
        bond_level=bond_level,
    )


def finalize_turn(
    con: sqlite3.Connection,
    ctx: KokoroTurnContext,
    raw_llm_text: str,
) -> CompanionResponse:
    """Parse the LLM output, apply the state delta, and persist.

    Args:
        con: Open SQLite connection.
        ctx: The context returned by :func:`prepare_turn`.
        raw_llm_text: Full text returned by the LLM for this turn.

    Returns:
        The parsed ``CompanionResponse``.  Even when ``ctx.enabled`` is False
        we still parse so the caller has a uniform return type, but no state
        is persisted in that case.
    """
    resp = parse_companion_response(raw_llm_text, nsfw_active=ctx.nsfw_active)

    if not ctx.enabled:
        return resp

    # Apply + persist mind state.
    new_mind = apply_state_delta(ctx.mind, resp.state_delta.values)
    try:
        save_mind_state(con, new_mind)
    except sqlite3.Error as e:
        logger.warning("kokoro: failed to save mind state for char %s: %s",
                       ctx.mind.character_id, e)

    # Tier F-scene side effects on thread state.
    if ctx.nsfw_active and (resp.self_consent_check or resp.boundary_reinforcement):
        new_thread = ThreadState(
            session_id=ctx.thread.session_id,
            tension=ctx.thread.tension,
            intimacy_level=ctx.thread.intimacy_level,
            comedic_energy=ctx.thread.comedic_energy,
            last_callback_memory_id=ctx.thread.last_callback_memory_id,
            consent_check_pending=1 if resp.self_consent_check else ctx.thread.consent_check_pending,
            kink_alignment_vector=ctx.thread.kink_alignment_vector,
        )
        try:
            save_thread_state(con, new_thread)
        except sqlite3.Error as e:
            logger.warning("kokoro: failed to save thread state for session %s: %s",
                           ctx.thread.session_id, e)

    return resp


def response_to_frontend_payload(
    resp: CompanionResponse, ctx: KokoroTurnContext
) -> dict:
    """Shape a parsed response for ``api.ts`` consumption.

    The frontend expects camelCase keys to match the existing API style.
    Diagnostic fields (``parse_ok``, mind snapshot) ride along for the
    debug HUD.
    """
    return {
        "reply": resp.reply,
        "innerThought": resp.inner_thought,
        "emotion": resp.emotion,
        "facialExpression": resp.facial_expression,
        "gesture": resp.gesture,
        "gaze": resp.gaze,
        "voiceStyle": resp.voice_style,
        "memoryWrite": {
            "shouldSave": resp.memory_write.should_save,
            "summary": resp.memory_write.summary,
            "importance": resp.memory_write.importance,
            "emotionalSalience": resp.memory_write.emotional_salience,
        },
        "stateDelta": resp.state_delta.values,
        "nsfw": {
            "active": ctx.nsfw_active,
            "innerArousalShift": resp.inner_arousal_shift,
            "suggestiveBid": resp.suggestive_bid,
            "selfConsentCheck": resp.self_consent_check,
            "boundaryReinforcement": resp.boundary_reinforcement,
        },
        "diagnostics": {
            "parseOk": resp.parse_ok,
            "bondLevel": ctx.bond_level,
            "kokoroEnabled": ctx.enabled,
        },
    }
