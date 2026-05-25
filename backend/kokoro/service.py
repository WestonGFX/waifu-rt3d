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
import re
import sqlite3
from dataclasses import dataclass
from typing import Optional

from .mind_state import (
    MindState,
    ThreadState,
    TraitVector,
    apply_state_delta,
    clamp01,
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

    # Tier B lazy drift: step slow dials forward by elapsed time since
    # last update.  No-op when Kokoro is disabled OR when there's no
    # persisted timestamp yet (first turn — drift starts from "now").
    if kokoro_enabled and mind.updated_at:
        try:
            from .drift import compute_drift
            drifted = compute_drift(mind)
            if drifted is not mind:
                mind = drifted
                save_mind_state(con, mind)
        except Exception as e:
            logger.warning("kokoro: drift failed for char %s: %s",
                           character_id, e)

    # Auto-seed Tier C traits from the character bible on first encounter.
    # We detect "no row exists" by checking the DB directly — load_traits
    # returns defaults regardless, so it can't tell us.
    if kokoro_enabled:
        try:
            has_row = con.execute(
                "SELECT 1 FROM character_traits WHERE character_id = ?",
                (character_id,),
            ).fetchone()
            if not has_row:
                from .traits_seeder import seed_traits_for_character
                traits = seed_traits_for_character(con, character_id)
        except Exception as e:
            logger.warning("kokoro: trait seeding failed for char %s: %s",
                           character_id, e)

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


_KOKORO_NAME_RE = re.compile(
    r"\bKokoro[-\s]?(chan|kun|san|sama|sensei|senpai)?\b",
    re.IGNORECASE,
)


def _fix_identity_slip(
    con: sqlite3.Connection,
    character_id: int,
    resp: CompanionResponse,
) -> CompanionResponse:
    """Replace stale 'Kokoro-{honorific}' self-references with the character's actual name.

    Small models sometimes misread the Kokoro engine's section headers as their
    own identity.  If the parsed reply contains a Kokoro-{honorific} pattern AND
    the character is not actually named Kokoro, we substitute the character's
    display name so the user never sees the engine bleed through.

    Args:
        con: Open SQLite connection (read-only query).
        character_id: ID of the speaking character.
        resp: Already-parsed ``CompanionResponse`` to sanitize.

    Returns:
        The same ``CompanionResponse`` with ``reply`` patched if needed.
    """
    if not _KOKORO_NAME_RE.search(resp.reply):
        return resp
    try:
        row = con.execute(
            "SELECT name FROM characters WHERE id = ?", (character_id,)
        ).fetchone()
        char_name: str = row[0] if row else "me"
    except sqlite3.Error:
        char_name = "me"

    if char_name.lower().startswith("kokoro"):
        return resp  # Actually named Kokoro — leave it alone.

    first_name = char_name.split()[0]
    patched = _KOKORO_NAME_RE.sub(first_name, resp.reply)
    if patched != resp.reply:
        logger.warning(
            "kokoro: identity slip detected for char %s (%r) — patched reply",
            character_id, char_name,
        )
        resp.reply = patched
    return resp


def finalize_turn(
    con: sqlite3.Connection,
    ctx: KokoroTurnContext,
    raw_llm_text: str,
    *,
    vector_store=None,
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
    resp = _fix_identity_slip(con, ctx.mind.character_id, resp)

    if not ctx.enabled:
        return resp

    # Apply + persist mind state.
    new_mind = apply_state_delta(ctx.mind, resp.state_delta.values)
    try:
        save_mind_state(con, new_mind)
    except sqlite3.Error as e:
        logger.warning("kokoro: failed to save mind state for char %s: %s",
                       ctx.mind.character_id, e)

    # Memory write: when the LLM marked this turn worth saving AND a
    # vector store is wired in, persist into the existing tiered_memory
    # surface so it shares retrieval with AIE + manual memories.
    # Dedup against the most-recent same-character row to absorb the
    # LLM proposing the same memory across consecutive turns.
    if (
        vector_store is not None
        and resp.memory_write.should_save
        and resp.memory_write.summary
        and resp.memory_write.summary.strip()
    ):
        text = resp.memory_write.summary.strip()
        # Salience: take the stronger of importance / emotional_salience,
        # clamped to [0,1].  Both fields are LLM-supplied and may be noisy.
        salience = clamp01(max(
            resp.memory_write.importance or 0.0,
            resp.memory_write.emotional_salience or 0.0,
        ))
        try:
            # Cheap dedup: any identical-text knowledge memory for this
            # character in the last 24 hours blocks the write.
            existing = con.execute(
                "SELECT 1 FROM memories WHERE character_id = ? "
                "AND role = 'knowledge' AND text = ? "
                "AND created_at >= datetime('now', '-1 day') LIMIT 1",
                (ctx.mind.character_id, text),
            ).fetchone()
        except sqlite3.Error:
            existing = None
        if not existing:
            try:
                vector_store.add(
                    ctx.thread.session_id,
                    ctx.mind.character_id,
                    "knowledge",
                    text,
                    salience=salience,
                )
            except Exception as e:
                logger.warning("kokoro: memory write failed for char %s: %s",
                               ctx.mind.character_id, e)

    # Tier F QA: log boundary-reinforcement events so we can detect
    # regressions (e.g. a model update silently slipping past guardrails).
    # Recorded whenever the LLM declines / softens an escalation, regardless
    # of whether the gate was actually open — boundary events from a closed
    # gate are also signal (it means the model felt the need to push back
    # at content_filter_level=0, which is good).
    if resp.boundary_reinforcement:
        try:
            con.execute(
                "INSERT INTO kokoro_safety_events "
                "(character_id, session_id, event_type, bond_level) "
                "VALUES (?, ?, 'boundary_reinforcement', ?)",
                (ctx.mind.character_id, ctx.thread.session_id, ctx.bond_level),
            )
        except sqlite3.Error as e:
            logger.warning("kokoro: failed to log safety event: %s", e)

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


def _voice_params_for(voice_style: str) -> dict:
    """Resolve voice-modulator TTS params for a Kokoro voiceStyle.

    The :class:`backend.tts.voice_modulator.VoiceModulator` already knows how
    to translate emotion-equivalent inputs into provider-agnostic abstract
    ``speed/pitch/energy`` values.  Kokoro's voiceStyle enum is aliased to
    existing emotion profiles at the modulator level (see
    ``_PROFILE_ALIASES`` in voice_modulator.py).

    We deliberately return the *abstract* params here — provider-specific
    formatting (Edge-TTS "+N%" strings, ElevenLabs stability scalars) happens
    in the TTS request path.  This keeps the Kokoro payload provider-neutral.
    """
    try:
        from backend.tts.voice_modulator import VoiceModulator
        mod = VoiceModulator()
        # Use the same intensity bucket the avatar layer uses (see
        # viewerStore.dispatchKokoroEmbodiment) for visual/auditory parity.
        intensity = 1.0 if voice_style in {"bright", "teasing"} else (
            0.6 if voice_style in {"sleepy", "calm"} else 0.85
        )
        # Pass the styled emotion-equivalent through the modulator's lookup
        # so unknown values fall back to neutral instead of crashing.
        params = mod.get_params(voice_style, intensity=intensity, provider="kokoro")
        return dict(params)
    except Exception as e:
        logger.warning("kokoro: voice param resolution failed for style %s: %s",
                       voice_style, e)
        return {}


def response_to_frontend_payload(
    resp: CompanionResponse, ctx: KokoroTurnContext
) -> dict:
    """Shape a parsed response for ``api.ts`` consumption.

    The frontend expects camelCase keys to match the existing API style.
    Diagnostic fields (``parse_ok``, mind snapshot) ride along for the
    debug HUD.  ``voiceParams`` carries provider-neutral TTS hints derived
    from ``voiceStyle``; the frontend forwards them to the next TTS call.
    """
    return {
        "reply": resp.reply,
        "innerThought": resp.inner_thought,
        "emotion": resp.emotion,
        "facialExpression": resp.facial_expression,
        "gesture": resp.gesture,
        "gaze": resp.gaze,
        "voiceStyle": resp.voice_style,
        "voiceParams": _voice_params_for(resp.voice_style),
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
