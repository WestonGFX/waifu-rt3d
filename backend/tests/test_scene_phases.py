"""Tests for backend.content.scene_phases — multi-phase scene arc engine.

All tests are pure unit tests with no I/O, DB, or network dependencies.
The engine is instantiated fresh for each test so state never leaks.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.content.scene_phases import (
    SCENE_PHASES,
    PhaseTransition,
    ScenePhase,
    ScenePhaseEngine,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _engine_at(phase: ScenePhase, message_count: int = 0) -> ScenePhaseEngine:
    """Return an engine artificially positioned at *phase* with *message_count*.

    Args:
        phase: The phase to place the engine in.
        message_count: The number of messages already counted for that phase.

    Returns:
        A :class:`ScenePhaseEngine` with char_id=99 ready for testing.
    """
    engine = ScenePhaseEngine(char_id=99)
    engine.current_phase = phase
    engine.phase_message_count = message_count
    return engine


# ---------------------------------------------------------------------------
# 1. Initial state
# ---------------------------------------------------------------------------


class TestInitialState:
    """Engine construction and default values."""

    def test_initial_phase_approach(self):
        """A freshly constructed engine must start in APPROACH."""
        engine = ScenePhaseEngine(char_id=1)
        assert engine.current_phase == ScenePhase.APPROACH

    def test_initial_message_count_zero(self):
        """Phase message counter must be zero on construction."""
        engine = ScenePhaseEngine(char_id=1)
        assert engine.phase_message_count == 0

    def test_initial_scene_inactive(self):
        """is_scene_active must be False before any advancement."""
        engine = ScenePhaseEngine(char_id=1)
        assert engine.is_scene_active() is False


# ---------------------------------------------------------------------------
# 2. advance() — manual phase progression
# ---------------------------------------------------------------------------


class TestAdvance:
    """Tests for ScenePhaseEngine.advance()."""

    def test_advance_approach_to_tension(self):
        """advance() with min_messages met moves APPROACH → TENSION."""
        engine = _engine_at(ScenePhase.APPROACH, message_count=2)
        transition = engine.advance()
        assert transition is not None
        assert transition.from_phase == ScenePhase.APPROACH
        assert transition.to_phase == ScenePhase.TENSION
        assert engine.current_phase == ScenePhase.TENSION

    def test_min_messages_enforced(self):
        """advance() returns None when min_messages has not been reached."""
        engine = _engine_at(ScenePhase.APPROACH, message_count=1)
        # APPROACH requires min_messages=2; only 1 seen so far.
        result = engine.advance()
        assert result is None
        assert engine.current_phase == ScenePhase.APPROACH

    def test_advance_after_min_messages(self):
        """advance() succeeds exactly when min_messages is reached."""
        engine = _engine_at(ScenePhase.TENSION, message_count=2)
        # TENSION requires min_messages=2.
        transition = engine.advance()
        assert transition is not None
        assert transition.to_phase == ScenePhase.ESCALATION

    def test_no_advance_from_aftercare(self):
        """advance() on AFTERCARE returns None — it fades via tick()."""
        engine = _engine_at(ScenePhase.AFTERCARE, message_count=10)
        result = engine.advance()
        assert result is None
        assert engine.current_phase == ScenePhase.AFTERCARE

    def test_advance_resets_message_count(self):
        """Message counter is reset to 0 after a successful advance()."""
        engine = _engine_at(ScenePhase.APPROACH, message_count=3)
        engine.advance()
        assert engine.phase_message_count == 0

    def test_advance_user_signals_reason(self):
        """user_signals > 0 sets reason='user_escalation'."""
        engine = _engine_at(ScenePhase.APPROACH, message_count=2)
        transition = engine.advance(user_signals=1)
        assert transition is not None
        assert transition.reason == "user_escalation"

    def test_advance_no_user_signals_reason(self):
        """user_signals == 0 sets reason='natural_arc'."""
        engine = _engine_at(ScenePhase.APPROACH, message_count=2)
        transition = engine.advance(user_signals=0)
        assert transition is not None
        assert transition.reason == "natural_arc"


# ---------------------------------------------------------------------------
# 3. Consent checkpoint
# ---------------------------------------------------------------------------


class TestConsentCheckpoint:
    """Consent checkpoint fires once on entering ESCALATION."""

    def test_consent_checkpoint_at_escalation(self):
        """PhaseTransition.consent_checkpoint is True when entering ESCALATION."""
        engine = _engine_at(ScenePhase.TENSION, message_count=2)
        transition = engine.advance()
        assert transition is not None
        assert transition.to_phase == ScenePhase.ESCALATION
        assert transition.consent_checkpoint is True

    def test_is_consent_checkpoint_fires_once(self):
        """is_consent_checkpoint() returns True once then False afterwards."""
        engine = _engine_at(ScenePhase.TENSION, message_count=2)
        engine.advance()  # enters ESCALATION → _consent_pending = True
        assert engine.is_consent_checkpoint() is True
        assert engine.is_consent_checkpoint() is False

    def test_consent_checkpoint_not_set_for_other_phases(self):
        """PhaseTransition.consent_checkpoint is False for non-ESCALATION entries."""
        engine = _engine_at(ScenePhase.APPROACH, message_count=2)
        transition = engine.advance()
        assert transition is not None
        assert transition.consent_checkpoint is False


# ---------------------------------------------------------------------------
# 4. Auto-transitions via tick()
# ---------------------------------------------------------------------------


class TestTick:
    """Tests for ScenePhaseEngine.tick() auto-transitions."""

    def test_tick_increments_count(self):
        """tick() increments phase_message_count by 1."""
        engine = ScenePhaseEngine(char_id=1)
        engine.tick()
        assert engine.phase_message_count == 1

    def test_tick_no_auto_advance_for_approach(self):
        """APPROACH is not an auto-advance phase — tick() returns None."""
        engine = _engine_at(ScenePhase.APPROACH, message_count=1)
        result = engine.tick()  # count becomes 2
        assert result is None
        assert engine.current_phase == ScenePhase.APPROACH

    def test_peak_auto_resolution(self):
        """PEAK auto-transitions to RESOLUTION after min_messages via tick()."""
        # PEAK min_messages=2; start at 1 so the next tick() brings count to 2.
        engine = _engine_at(ScenePhase.PEAK, message_count=1)
        transition = engine.tick()
        assert transition is not None
        assert transition.from_phase == ScenePhase.PEAK
        assert transition.to_phase == ScenePhase.RESOLUTION
        assert transition.reason == "natural_arc"

    def test_resolution_auto_aftercare(self):
        """RESOLUTION auto-transitions to AFTERCARE after min_messages via tick()."""
        # RESOLUTION min_messages=1; starting at 0, the first tick() triggers.
        engine = _engine_at(ScenePhase.RESOLUTION, message_count=0)
        transition = engine.tick()
        assert transition is not None
        assert transition.to_phase == ScenePhase.AFTERCARE

    def test_aftercare_auto_approach(self):
        """AFTERCARE auto-transitions to APPROACH after min_messages via tick()."""
        # AFTERCARE min_messages=3; start at 2 so the next tick() triggers.
        engine = _engine_at(ScenePhase.AFTERCARE, message_count=2)
        transition = engine.tick()
        assert transition is not None
        assert transition.to_phase == ScenePhase.APPROACH
        assert transition.reason == "natural_arc"

    def test_tick_no_transition_before_min(self):
        """tick() on PEAK with count still below min_messages returns None."""
        engine = _engine_at(ScenePhase.PEAK, message_count=0)
        # PEAK min_messages=2; after one tick count is 1, not yet met.
        result = engine.tick()
        assert result is None
        assert engine.current_phase == ScenePhase.PEAK


# ---------------------------------------------------------------------------
# 5. cool_down()
# ---------------------------------------------------------------------------


class TestCoolDown:
    """Tests for ScenePhaseEngine.cool_down()."""

    def test_cool_drops_phase(self):
        """cool_down() moves TENSION back to APPROACH."""
        engine = _engine_at(ScenePhase.TENSION)
        transition = engine.cool_down()
        assert transition is not None
        assert transition.from_phase == ScenePhase.TENSION
        assert transition.to_phase == ScenePhase.APPROACH
        assert transition.reason == "cool_signal"

    def test_cool_from_approach_returns_none(self):
        """cool_down() at APPROACH cannot go lower — returns None."""
        engine = _engine_at(ScenePhase.APPROACH)
        result = engine.cool_down()
        assert result is None

    def test_cool_from_peak_goes_aftercare(self):
        """cool_down() from PEAK redirects to AFTERCARE, not ESCALATION."""
        engine = _engine_at(ScenePhase.PEAK)
        transition = engine.cool_down()
        assert transition is not None
        assert transition.to_phase == ScenePhase.AFTERCARE

    def test_cool_from_resolution_goes_aftercare(self):
        """cool_down() from RESOLUTION redirects to AFTERCARE."""
        engine = _engine_at(ScenePhase.RESOLUTION)
        transition = engine.cool_down()
        assert transition is not None
        assert transition.to_phase == ScenePhase.AFTERCARE

    def test_cool_from_escalation_goes_tension(self):
        """cool_down() from ESCALATION steps back to TENSION."""
        engine = _engine_at(ScenePhase.ESCALATION)
        transition = engine.cool_down()
        assert transition is not None
        assert transition.to_phase == ScenePhase.TENSION


# ---------------------------------------------------------------------------
# 6. force_aftercare() — safe word
# ---------------------------------------------------------------------------


class TestForceAftercare:
    """Tests for ScenePhaseEngine.force_aftercare()."""

    def test_safe_word_forces_aftercare(self):
        """force_aftercare() from any phase jumps to AFTERCARE."""
        for phase in ScenePhase:
            engine = _engine_at(phase)
            transition = engine.force_aftercare()
            assert transition.to_phase == ScenePhase.AFTERCARE
            assert transition.reason == "safe_word"
            assert engine.current_phase == ScenePhase.AFTERCARE

    def test_safe_word_reason_string(self):
        """force_aftercare() always uses reason='safe_word'."""
        engine = _engine_at(ScenePhase.PEAK)
        transition = engine.force_aftercare()
        assert transition.reason == "safe_word"


# ---------------------------------------------------------------------------
# 7. Full lifecycle
# ---------------------------------------------------------------------------


class TestFullLifecycle:
    """End-to-end lifecycle from APPROACH through AFTERCARE and back."""

    def test_full_lifecycle(self):
        """Engine can traverse all 6 phases and return to APPROACH."""
        engine = ScenePhaseEngine(char_id=42)

        # --- APPROACH → TENSION ---
        engine.tick()
        engine.tick()
        t = engine.advance(user_signals=1)
        assert t is not None and t.to_phase == ScenePhase.TENSION

        # --- TENSION → ESCALATION (consent checkpoint) ---
        engine.tick()
        engine.tick()
        t = engine.advance(user_signals=1)
        assert t is not None and t.to_phase == ScenePhase.ESCALATION
        assert t.consent_checkpoint is True
        assert engine.is_consent_checkpoint() is True

        # --- ESCALATION → PEAK ---
        engine.tick()
        engine.tick()
        engine.tick()
        t = engine.advance(user_signals=1)
        assert t is not None and t.to_phase == ScenePhase.PEAK

        # --- PEAK → RESOLUTION (auto via tick) ---
        engine.tick()
        t = engine.tick()  # second tick hits min_messages=2
        assert t is not None and t.to_phase == ScenePhase.RESOLUTION

        # --- RESOLUTION → AFTERCARE (auto via tick) ---
        t = engine.tick()  # first tick hits min_messages=1
        assert t is not None and t.to_phase == ScenePhase.AFTERCARE

        # --- AFTERCARE → APPROACH (auto via tick) ---
        engine.tick()
        engine.tick()
        t = engine.tick()  # third tick hits min_messages=3
        assert t is not None and t.to_phase == ScenePhase.APPROACH

        assert engine.current_phase == ScenePhase.APPROACH
        assert engine.is_scene_active() is False


# ---------------------------------------------------------------------------
# 8. Prompt and metadata
# ---------------------------------------------------------------------------


class TestPhaseMetadata:
    """Tests for get_phase_prompt(), phase_name, and SCENE_PHASES completeness."""

    def test_phase_prompt_content(self):
        """All 6 phases have non-empty prompt strings with phase header."""
        for phase in ScenePhase:
            engine = _engine_at(phase)
            prompt = engine.get_phase_prompt()
            assert f"[Scene Phase: {phase.name}]" in prompt
            assert len(prompt) > 20

    def test_phase_name_property(self):
        """phase_name returns the string enum member name."""
        for phase in ScenePhase:
            engine = _engine_at(phase)
            assert engine.phase_name == phase.name

    def test_scene_phases_has_all_entries(self):
        """SCENE_PHASES dict covers every member of ScenePhase."""
        for phase in ScenePhase:
            assert phase in SCENE_PHASES

    def test_all_phase_configs_have_required_keys(self):
        """Every phase config has the mandatory keys."""
        required_keys = {
            "description",
            "vocabulary",
            "physical_limit",
            "emotional_register",
            "min_messages",
            "advance_signal",
            "prompt",
        }
        for phase, config in SCENE_PHASES.items():
            missing = required_keys - config.keys()
            assert not missing, f"{phase.name} config missing keys: {missing}"


# ---------------------------------------------------------------------------
# 9. is_scene_active
# ---------------------------------------------------------------------------


class TestSceneActive:
    """Tests for is_scene_active()."""

    def test_scene_active_false_at_approach(self):
        """is_scene_active() is False when phase is APPROACH."""
        engine = ScenePhaseEngine(char_id=1)
        assert engine.is_scene_active() is False

    def test_scene_active_true_after_advance(self):
        """is_scene_active() becomes True once past APPROACH."""
        engine = _engine_at(ScenePhase.TENSION)
        assert engine.is_scene_active() is True

    def test_scene_active_true_in_all_non_approach_phases(self):
        """is_scene_active() is True for every phase except APPROACH."""
        for phase in ScenePhase:
            engine = _engine_at(phase)
            expected = phase != ScenePhase.APPROACH
            assert engine.is_scene_active() is expected, f"Failed for {phase.name}"
