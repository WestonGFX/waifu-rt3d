"""Unit tests for backend.content.pacing — F6 Dynamic Intensity Pacing engine.

Tests cover:
- Initial state
- Phase advancement rules (one-per-message, probability, ceiling)
- Cool-down signals
- Safe-word / AFTERCARE mechanics
- Slow-burn gating and release
- Direct mode
- Phase prompt content
- Character factory and mapping completeness
"""

from __future__ import annotations

import pytest

from backend.content.pacing import (
    CHARACTER_PACING_TYPE,
    CEILING_PHASE_LIMITS,
    PHASE_PROMPTS,
    DIRECT_MODE_PROMPT,
    SLOW_BURN_PROMPT,
    SLOW_BURN_RELEASE_PROMPT,
    IntimacyPhase,
    PacingEngine,
    PacingMode,
    PhaseTransition,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _engine_at(
    phase: IntimacyPhase,
    personality: str = "responsive",
    mode: PacingMode = PacingMode.NATURAL,
    ceiling: str = "explicit",
) -> PacingEngine:
    """Create an engine and fast-forward it to *phase* without probability rolls.

    Sets ``current_phase`` directly to avoid relying on advance() probability
    in setup code.

    Args:
        phase: Target starting phase.
        personality: Pacing personality string.
        mode: Pacing mode.
        ceiling: Content ceiling string.

    Returns:
        A PacingEngine positioned at *phase*.
    """
    e = PacingEngine(char_id=99, pacing_personality=personality, pacing_mode=mode, content_ceiling=ceiling)
    e.current_phase = phase
    return e


# ---------------------------------------------------------------------------
# 1. Initial state
# ---------------------------------------------------------------------------


def test_initial_phase_casual() -> None:
    """Engine must start at CASUAL regardless of other parameters."""
    engine = PacingEngine(char_id=1)
    assert engine.current_phase == IntimacyPhase.CASUAL


# ---------------------------------------------------------------------------
# 2. Advance to FLIRTY
# ---------------------------------------------------------------------------


def test_advance_to_flirty() -> None:
    """A responsive engine must advance CASUAL → FLIRTY on a valid signal.

    Sets advance_probability to 1.0 so the test is deterministic.
    """
    engine = PacingEngine(char_id=1, pacing_personality="responsive")
    engine._config = dict(engine._config)
    engine._config["advance_probability"] = 1.0
    transition = engine.advance(signal_strength=1)

    assert transition is not None
    assert transition.from_phase == IntimacyPhase.CASUAL
    assert transition.to_phase == IntimacyPhase.FLIRTY
    assert transition.reason == "user_escalation"
    assert engine.current_phase == IntimacyPhase.FLIRTY


# ---------------------------------------------------------------------------
# 3. Max one advance per message
# ---------------------------------------------------------------------------


def test_max_one_advance_per_message() -> None:
    """Second advance() call within the same message must return None.

    Sets advance_probability to 1.0 so the test is deterministic.
    """
    engine = PacingEngine(char_id=1, pacing_personality="responsive")
    engine._config = dict(engine._config)
    engine._config["advance_probability"] = 1.0
    first = engine.advance()
    second = engine.advance()

    assert first is not None
    assert second is None
    assert engine.current_phase == IntimacyPhase.FLIRTY

    # After reset_message() a new advance must be permitted.
    engine.reset_message()
    third = engine.advance()
    assert third is not None
    assert engine.current_phase == IntimacyPhase.SUGGESTIVE


# ---------------------------------------------------------------------------
# 4–6. Content ceiling enforcement
# ---------------------------------------------------------------------------


def test_content_ceiling_general() -> None:
    """Ceiling 'general' caps advancement at FLIRTY."""
    engine = _engine_at(IntimacyPhase.FLIRTY, ceiling="general")
    result = engine.advance()
    # Already at ceiling → no advance.
    assert result is None
    assert engine.current_phase == IntimacyPhase.FLIRTY


def test_content_ceiling_edgy() -> None:
    """Ceiling 'edgy' caps advancement at SUGGESTIVE."""
    engine = _engine_at(IntimacyPhase.SUGGESTIVE, ceiling="edgy")
    result = engine.advance()
    assert result is None
    assert engine.current_phase == IntimacyPhase.SUGGESTIVE


def test_content_ceiling_mature() -> None:
    """Ceiling 'mature' caps advancement at INTIMATE."""
    engine = _engine_at(IntimacyPhase.INTIMATE, ceiling="mature")
    result = engine.advance()
    assert result is None
    assert engine.current_phase == IntimacyPhase.INTIMATE


# ---------------------------------------------------------------------------
# 7. Cool signal drops phase
# ---------------------------------------------------------------------------


def test_cool_signal_drops_phase() -> None:
    """cool_down() must drop INTIMATE → SUGGESTIVE."""
    engine = _engine_at(IntimacyPhase.INTIMATE)
    transition = engine.cool_down()

    assert transition is not None
    assert transition.from_phase == IntimacyPhase.INTIMATE
    assert transition.to_phase == IntimacyPhase.SUGGESTIVE
    assert transition.reason == "cool_signal"
    assert engine.current_phase == IntimacyPhase.SUGGESTIVE


# ---------------------------------------------------------------------------
# 8. Cool from CASUAL stays at CASUAL
# ---------------------------------------------------------------------------


def test_cool_from_casual_stays() -> None:
    """cool_down() at CASUAL must return None and leave phase unchanged."""
    engine = PacingEngine(char_id=1)
    result = engine.cool_down()

    assert result is None
    assert engine.current_phase == IntimacyPhase.CASUAL


# ---------------------------------------------------------------------------
# 9. Safe word forces AFTERCARE
# ---------------------------------------------------------------------------


def test_safe_word_forces_aftercare() -> None:
    """force_aftercare() must transition any phase to AFTERCARE with reason 'safe_word'."""
    for phase in [
        IntimacyPhase.CASUAL,
        IntimacyPhase.FLIRTY,
        IntimacyPhase.SUGGESTIVE,
        IntimacyPhase.INTIMATE,
        IntimacyPhase.INTENSE,
    ]:
        engine = _engine_at(phase)
        transition = engine.force_aftercare()

        assert isinstance(transition, PhaseTransition)
        assert transition.from_phase == phase
        assert transition.to_phase == IntimacyPhase.AFTERCARE
        assert transition.reason == "safe_word"
        assert engine.current_phase == IntimacyPhase.AFTERCARE


# ---------------------------------------------------------------------------
# 10. AFTERCARE transitions to CASUAL after 3-5 ticks
# ---------------------------------------------------------------------------


def test_aftercare_transitions_to_casual() -> None:
    """tick_aftercare() must transition to CASUAL at the configured threshold."""
    engine = _engine_at(IntimacyPhase.CASUAL)
    engine.force_aftercare()

    # Override threshold to a known value for deterministic testing.
    engine._aftercare_threshold = 3
    engine._aftercare_message_count = 0

    results = [engine.tick_aftercare() for _ in range(3)]

    # Only the final tick should produce a transition.
    assert results[0] is None
    assert results[1] is None
    final = results[2]
    assert final is not None
    assert final.from_phase == IntimacyPhase.AFTERCARE
    assert final.to_phase == IntimacyPhase.CASUAL
    assert final.reason == "aftercare_complete"
    assert engine.current_phase == IntimacyPhase.CASUAL


def test_aftercare_tick_ignored_outside_aftercare() -> None:
    """tick_aftercare() must return None when not in AFTERCARE."""
    engine = _engine_at(IntimacyPhase.INTIMATE)
    assert engine.tick_aftercare() is None


# ---------------------------------------------------------------------------
# 11. Slow-burn blocks past SUGGESTIVE until threshold
# ---------------------------------------------------------------------------


def test_slow_burn_blocks_past_suggestive() -> None:
    """In SLOW_BURN mode, advance past SUGGESTIVE must be blocked before threshold."""
    engine = _engine_at(
        IntimacyPhase.SUGGESTIVE,
        personality="responsive",
        mode=PacingMode.SLOW_BURN,
    )
    # Set threshold high so we never reach it during this test.
    engine._release_threshold = 20
    engine._tension_counter = 0

    # Attempt to advance — should be blocked.
    result = engine.advance()
    assert result is None
    assert engine.current_phase == IntimacyPhase.SUGGESTIVE


def test_slow_burn_below_suggestive_advances_normally() -> None:
    """In SLOW_BURN mode, advancing from CASUAL or FLIRTY is NOT gated.

    Uses DIRECT personality to avoid probability absorption so the assertion
    is deterministic (the test is about the slow-burn gate logic, not probability).
    """
    engine = PacingEngine(
        char_id=1, pacing_personality="responsive", pacing_mode=PacingMode.SLOW_BURN
    )
    # Override probability to 1.0 so this test is not about probability.
    engine._config = dict(engine._config)
    engine._config["advance_probability"] = 1.0
    # CASUAL → FLIRTY should work immediately — below the SUGGESTIVE gate.
    result = engine.advance()
    assert result is not None
    assert engine.current_phase == IntimacyPhase.FLIRTY


# ---------------------------------------------------------------------------
# 12. Slow-burn release after threshold
# ---------------------------------------------------------------------------


def test_slow_burn_release() -> None:
    """In SLOW_BURN mode, advance past SUGGESTIVE is allowed after threshold.

    Sets advance_probability to 1.0 so the test is deterministic.
    """
    engine = _engine_at(
        IntimacyPhase.SUGGESTIVE,
        personality="responsive",
        mode=PacingMode.SLOW_BURN,
    )
    engine._config = dict(engine._config)
    engine._config["advance_probability"] = 1.0
    engine._release_threshold = 3
    engine._tension_counter = 3  # already at threshold
    engine._released = False

    result = engine.advance()

    assert result is not None
    assert engine.current_phase == IntimacyPhase.INTIMATE
    assert engine._released is True


def test_slow_burn_release_flag_persists() -> None:
    """Once released, further advances in SLOW_BURN stay unlocked.

    Sets advance_probability to 1.0 throughout so the test is deterministic
    and focused solely on the release-gate logic, not probability.
    """
    engine = _engine_at(
        IntimacyPhase.SUGGESTIVE,
        personality="responsive",
        mode=PacingMode.SLOW_BURN,
    )
    engine._config = dict(engine._config)
    engine._config["advance_probability"] = 1.0
    engine._release_threshold = 1
    engine._tension_counter = 1

    engine.advance()  # SUGGESTIVE → INTIMATE (triggers release)
    assert engine._released is True

    # Confirm second advance is also accepted now that _released is True.
    engine.reset_message()
    result = engine.advance()
    assert result is not None
    assert engine.current_phase == IntimacyPhase.INTENSE


# ---------------------------------------------------------------------------
# 13. DIRECT mode — no probability restrictions
# ---------------------------------------------------------------------------


def test_direct_mode_no_restrictions() -> None:
    """DIRECT mode must always accept the advance signal regardless of probability."""
    # Run 20 advance attempts in DIRECT mode to confirm none are absorbed.
    for _ in range(20):
        engine = PacingEngine(
            char_id=1, pacing_personality="teaser", pacing_mode=PacingMode.DIRECT
        )
        result = engine.advance()
        assert result is not None, "DIRECT mode should never absorb an advance"
        assert engine.current_phase == IntimacyPhase.FLIRTY


def test_direct_mode_bypasses_slow_burn_gate() -> None:
    """DIRECT mode bypasses the slow-burn gate even at SUGGESTIVE."""
    engine = _engine_at(
        IntimacyPhase.SUGGESTIVE,
        personality="teaser",
        mode=PacingMode.DIRECT,
    )
    engine._release_threshold = 100  # would never release under SLOW_BURN
    result = engine.advance()
    # DIRECT skips all gates — but also skips slow-burn checks entirely.
    # The slow-burn gate only applies when mode == SLOW_BURN.
    assert result is not None
    assert engine.current_phase == IntimacyPhase.INTIMATE


# ---------------------------------------------------------------------------
# 14. Phase prompt content
# ---------------------------------------------------------------------------


def test_phase_prompt_content() -> None:
    """Every IntimacyPhase must have a non-empty prompt string."""
    for phase in IntimacyPhase:
        assert phase in PHASE_PROMPTS, f"Missing prompt for {phase.name}"
        assert len(PHASE_PROMPTS[phase]) > 10, f"Prompt too short for {phase.name}"


def test_get_phase_prompt_natural() -> None:
    """NATURAL mode prompt must contain the phase tag but no mode override."""
    engine = _engine_at(IntimacyPhase.FLIRTY, mode=PacingMode.NATURAL)
    prompt = engine.get_phase_prompt()
    assert "FLIRTY" in prompt
    assert "DIRECT" not in prompt
    assert "SLOW-BURN" not in prompt


def test_get_phase_prompt_direct() -> None:
    """DIRECT mode prompt must append the direct-mode notice."""
    engine = _engine_at(IntimacyPhase.INTIMATE, mode=PacingMode.DIRECT)
    prompt = engine.get_phase_prompt()
    assert "INTIMATE" in prompt
    assert "DIRECT" in prompt


def test_get_phase_prompt_slow_burn_pre_release() -> None:
    """SLOW_BURN pre-release prompt must include countdown text."""
    engine = _engine_at(IntimacyPhase.SUGGESTIVE, mode=PacingMode.SLOW_BURN)
    engine._tension_counter = 2
    engine._release_threshold = 8
    engine._released = False
    prompt = engine.get_phase_prompt()
    assert "SLOW-BURN" in prompt
    assert "6" in prompt  # remaining = 8 - 2


def test_get_phase_prompt_slow_burn_post_release() -> None:
    """SLOW_BURN post-release prompt must include release/payoff text."""
    engine = _engine_at(IntimacyPhase.INTIMATE, mode=PacingMode.SLOW_BURN)
    engine._released = True
    prompt = engine.get_phase_prompt()
    assert "RELEASE" in prompt


# ---------------------------------------------------------------------------
# 15. Factory: for_character
# ---------------------------------------------------------------------------


def test_for_character_factory() -> None:
    """for_character() must return correct personality and mode for known characters."""
    dae = PacingEngine.for_character(1, "Dae (Neciridae)")
    assert dae.pacing_personality == "teaser"
    assert dae.pacing_mode == PacingMode.SLOW_BURN

    genki = PacingEngine.for_character(2, "Genki (Kitsune)")
    assert genki.pacing_personality == "responsive"
    assert genki.pacing_mode == PacingMode.DIRECT

    mika = PacingEngine.for_character(3, "Mika (Mikazuki)")
    assert mika.pacing_personality == "initiator"
    assert mika.pacing_mode == PacingMode.NATURAL  # not in CHARACTER_DEFAULT_MODE


def test_for_character_unknown_defaults() -> None:
    """for_character() with an unknown name must default to responsive/NATURAL."""
    engine = PacingEngine.for_character(42, "Unknown Character")
    assert engine.pacing_personality == "responsive"
    assert engine.pacing_mode == PacingMode.NATURAL


def test_for_character_content_ceiling_passed_through() -> None:
    """for_character() must honour the content_ceiling argument."""
    engine = PacingEngine.for_character(1, "Alana Calloway", content_ceiling="mature")
    assert engine.content_ceiling == "mature"
    assert engine._max_phase_for_ceiling() == IntimacyPhase.INTIMATE


# ---------------------------------------------------------------------------
# 16. All 13 characters are mapped
# ---------------------------------------------------------------------------


def test_all_13_characters_mapped() -> None:
    """Every one of the 13 canonical characters must have an entry in CHARACTER_PACING_TYPE."""
    expected_characters = {
        "Dae (Neciridae)",
        "Luna (Tsukimi)",
        "Genki (Kitsune)",
        "Alana Calloway",
        "Sable (Kuroha)",
        "Tsundere (Raine)",
        "Ayane (Yuki)",
        "Hana (Momoka)",
        "Kaede (Suzuha)",
        "Mika (Mikazuki)",
        "Rin (Akane)",
        "Shiori (Nana)",
        "Yuki (Shirayuki)",
    }
    mapped = set(CHARACTER_PACING_TYPE.keys())
    missing = expected_characters - mapped
    assert not missing, f"Characters missing from CHARACTER_PACING_TYPE: {missing}"
    assert len(mapped) == 13, f"Expected 13 mapped characters, got {len(mapped)}"


def test_all_personalities_valid() -> None:
    """Every character's personality value must be a known key in PACING_PERSONALITIES."""
    from backend.content.pacing import PACING_PERSONALITIES

    for name, personality in CHARACTER_PACING_TYPE.items():
        assert personality in PACING_PERSONALITIES, (
            f"Character '{name}' has unknown personality '{personality}'"
        )


def test_all_ceiling_phase_limits_present() -> None:
    """All four content ceiling strings must map to a phase limit."""
    for ceiling in ("general", "edgy", "mature", "explicit"):
        assert ceiling in CEILING_PHASE_LIMITS
        assert isinstance(CEILING_PHASE_LIMITS[ceiling], IntimacyPhase)


# ---------------------------------------------------------------------------
# Bonus: PhaseTransition dataclass
# ---------------------------------------------------------------------------


def test_phase_transition_fields() -> None:
    """PhaseTransition must expose from_phase, to_phase, and reason."""
    t = PhaseTransition(
        from_phase=IntimacyPhase.CASUAL,
        to_phase=IntimacyPhase.FLIRTY,
        reason="user_escalation",
    )
    assert t.from_phase == IntimacyPhase.CASUAL
    assert t.to_phase == IntimacyPhase.FLIRTY
    assert t.reason == "user_escalation"


def test_set_pacing_mode_resets_slow_burn_state() -> None:
    """Switching to SLOW_BURN mid-session must reset tension counter and release flag."""
    engine = PacingEngine(char_id=1, pacing_mode=PacingMode.NATURAL)
    engine._tension_counter = 10
    engine._released = True

    engine.set_pacing_mode(PacingMode.SLOW_BURN)

    assert engine._tension_counter == 0
    assert engine._released is False
    assert engine.pacing_mode == PacingMode.SLOW_BURN


def test_advance_blocked_in_aftercare() -> None:
    """advance() must return None when current phase is AFTERCARE."""
    engine = _engine_at(IntimacyPhase.CASUAL)
    engine.force_aftercare()
    result = engine.advance()
    assert result is None
    assert engine.current_phase == IntimacyPhase.AFTERCARE


def test_cool_down_ignored_in_aftercare() -> None:
    """cool_down() must return None when current phase is AFTERCARE."""
    engine = _engine_at(IntimacyPhase.CASUAL)
    engine.force_aftercare()
    result = engine.cool_down()
    assert result is None
    assert engine.current_phase == IntimacyPhase.AFTERCARE
