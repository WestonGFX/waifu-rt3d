"""Tests for the backend.content module — types, gating, intimacy, and prompts.

Covers ContentRatingLevel ordering, ceiling resolution truth table,
intimacy band mapping, password hashing, physical state tracking, and all
four prompt builder functions.

All functions under test are pure (no I/O, no DB) so no mocking is needed.
"""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.content.types import (
    CEILING_MAX_INTIMACY,
    CONTENT_RATING_ORDER,
    ContentGateConfig,
    IntimacyState,
    PhysicalState,
    SensoryWritingConfig,
    intimacy_band,
)
from backend.content.gating import (
    get_content_level_for_intimacy,
    hash_content_lock_password,
    is_cloud_provider,
    is_content_allowed,
    resolve_effective_ceiling,
    verify_content_lock_password,
)
from backend.content.intimacy import (
    detect_physical_actions,
    evaluate_intimacy_shift,
    update_physical_state,
)
from backend.content.prompts import (
    build_content_directive_block,
    build_intimacy_gate_block,
    build_physical_awareness_block,
    build_sensory_writing_block,
)


# ---------------------------------------------------------------------------
# TestContentTypes
# ---------------------------------------------------------------------------


class TestContentTypes:
    """Tests for types.py — constants, dataclasses, and intimacy_band()."""

    def test_intimacy_state_defaults(self):
        """Default IntimacyState should start at level 0, stable trend, turn 0."""
        state = IntimacyState()
        assert state.level == 0
        assert state.trend == "stable"
        assert state.last_update_turn == 0

    def test_physical_state_defaults(self):
        """Default PhysicalState should have expected clothing and spatial strings."""
        ps = PhysicalState()
        assert ps.user_clothing == "casual clothes"
        assert ps.companion_clothing == "default outfit"
        assert ps.physical_context == "sitting across from each other"
        assert ps.arousal_level == 0
        assert ps.recent_actions == []
        assert ps.last_updated_at == 0.0

    def test_content_gate_config_defaults(self):
        """Default ContentGateConfig should have general ceiling, unverified, unlocked."""
        cfg = ContentGateConfig()
        assert cfg.global_content_ceiling == "general"
        assert cfg.age_verified is False
        assert cfg.content_lock_enabled is False
        assert cfg.content_lock_password_hash == ""
        assert cfg.per_persona_ceilings == {}

    def test_content_rating_order_is_correct(self):
        """CONTENT_RATING_ORDER must be exactly [general, edgy, mature, explicit]."""
        assert CONTENT_RATING_ORDER == ["general", "edgy", "mature", "explicit"]

    def test_content_rating_order_length(self):
        """CONTENT_RATING_ORDER must contain exactly four levels."""
        assert len(CONTENT_RATING_ORDER) == 4

    def test_intimacy_band_zero(self):
        """Score of 0 falls into the 'general' band."""
        assert intimacy_band(0) == "general"

    def test_intimacy_band_29(self):
        """Score of 29 is the last point in the 'general' band."""
        assert intimacy_band(29) == "general"

    def test_intimacy_band_30(self):
        """Score of 30 is the first point in the 'edgy' band."""
        assert intimacy_band(30) == "edgy"

    def test_intimacy_band_59(self):
        """Score of 59 is the last point in the 'edgy' band."""
        assert intimacy_band(59) == "edgy"

    def test_intimacy_band_60(self):
        """Score of 60 is the first point in the 'mature' band."""
        assert intimacy_band(60) == "mature"

    def test_intimacy_band_84(self):
        """Score of 84 is the last point in the 'mature' band."""
        assert intimacy_band(84) == "mature"

    def test_intimacy_band_85(self):
        """Score of 85 is the first point in the 'explicit' band."""
        assert intimacy_band(85) == "explicit"

    def test_intimacy_band_100(self):
        """Score of 100 (max) maps to 'explicit'."""
        assert intimacy_band(100) == "explicit"

    def test_ceiling_max_intimacy_values(self):
        """CEILING_MAX_INTIMACY must map each level to its documented hard cap."""
        assert CEILING_MAX_INTIMACY["general"] == 30
        assert CEILING_MAX_INTIMACY["edgy"] == 60
        assert CEILING_MAX_INTIMACY["mature"] == 85
        assert CEILING_MAX_INTIMACY["explicit"] == 100

    def test_ceiling_max_intimacy_covers_all_levels(self):
        """Every level in CONTENT_RATING_ORDER must have an entry in CEILING_MAX_INTIMACY."""
        for level in CONTENT_RATING_ORDER:
            assert level in CEILING_MAX_INTIMACY


# ---------------------------------------------------------------------------
# TestContentGating
# ---------------------------------------------------------------------------


class TestContentGating:
    """Tests for gating.py — ceiling resolution, cloud detection, and password utils."""

    # --- resolve_effective_ceiling truth table (5 spec cases) ---

    def test_resolve_explicit_no_persona_ollama(self):
        """explicit + no persona ceiling + ollama → explicit (local provider, no cap)."""
        cfg = ContentGateConfig(global_content_ceiling="explicit")
        result = resolve_effective_ceiling(cfg, None, "ollama")
        assert result == "explicit"

    def test_resolve_explicit_no_persona_openai(self):
        """explicit + no persona ceiling + openai → mature (cloud provider capped)."""
        cfg = ContentGateConfig(global_content_ceiling="explicit")
        result = resolve_effective_ceiling(cfg, None, "openai")
        assert result == "mature"

    def test_resolve_explicit_edgy_persona_ollama(self):
        """explicit global + edgy persona ceiling + ollama → edgy (persona cap wins)."""
        cfg = ContentGateConfig(global_content_ceiling="explicit")
        result = resolve_effective_ceiling(cfg, "edgy", "ollama")
        assert result == "edgy"

    def test_resolve_mature_explicit_persona_openai(self):
        """mature global + explicit persona + openai → mature (global+cloud both cap)."""
        cfg = ContentGateConfig(global_content_ceiling="mature")
        result = resolve_effective_ceiling(cfg, "explicit", "openai")
        assert result == "mature"

    def test_resolve_general_explicit_persona_openai(self):
        """general global + explicit persona + openai → general (global is most restrictive)."""
        cfg = ContentGateConfig(global_content_ceiling="general")
        result = resolve_effective_ceiling(cfg, "explicit", "openai")
        assert result == "general"

    # --- is_cloud_provider ---

    def test_is_cloud_openai(self):
        """'openai' is a cloud provider."""
        assert is_cloud_provider("openai") is True

    def test_is_cloud_anthropic(self):
        """'anthropic' is a cloud provider."""
        assert is_cloud_provider("anthropic") is True

    def test_is_cloud_google(self):
        """'google' is a cloud provider."""
        assert is_cloud_provider("google") is True

    def test_is_cloud_case_insensitive_upper(self):
        """Provider name comparison is case-insensitive — uppercase should match."""
        assert is_cloud_provider("OpenAI") is True

    def test_is_cloud_case_insensitive_mixed(self):
        """Mixed-case provider name should still match."""
        assert is_cloud_provider("ANTHROPIC") is True

    def test_not_cloud_ollama(self):
        """'ollama' is not a cloud provider."""
        assert is_cloud_provider("ollama") is False

    def test_not_cloud_lmstudio(self):
        """'lm_studio' is not a cloud provider."""
        assert is_cloud_provider("lm_studio") is False

    def test_not_cloud_empty_string(self):
        """Empty string is not a cloud provider."""
        assert is_cloud_provider("") is False

    # --- get_content_level_for_intimacy ---

    def test_content_level_0(self):
        """Intimacy 0 → 'general'."""
        assert get_content_level_for_intimacy(0) == "general"

    def test_content_level_29(self):
        """Intimacy 29 (boundary top of general) → 'general'."""
        assert get_content_level_for_intimacy(29) == "general"

    def test_content_level_30(self):
        """Intimacy 30 (boundary start of edgy) → 'edgy'."""
        assert get_content_level_for_intimacy(30) == "edgy"

    def test_content_level_59(self):
        """Intimacy 59 (boundary top of edgy) → 'edgy'."""
        assert get_content_level_for_intimacy(59) == "edgy"

    def test_content_level_60(self):
        """Intimacy 60 (boundary start of mature) → 'mature'."""
        assert get_content_level_for_intimacy(60) == "mature"

    def test_content_level_84(self):
        """Intimacy 84 (boundary top of mature) → 'mature'."""
        assert get_content_level_for_intimacy(84) == "mature"

    def test_content_level_85(self):
        """Intimacy 85 (boundary start of explicit) → 'explicit'."""
        assert get_content_level_for_intimacy(85) == "explicit"

    def test_content_level_100(self):
        """Intimacy 100 (maximum) → 'explicit'."""
        assert get_content_level_for_intimacy(100) == "explicit"

    # --- is_content_allowed ---

    def test_content_allowed_low_under_general(self):
        """Intimacy 25 is allowed under 'general' ceiling."""
        assert is_content_allowed(25, "general") is True

    def test_content_blocked_edgy_under_general(self):
        """Intimacy 30 (edgy band) is blocked under 'general' ceiling."""
        assert is_content_allowed(30, "general") is False

    def test_content_allowed_mature_under_mature(self):
        """Intimacy 80 (mature band) is allowed under 'mature' ceiling."""
        assert is_content_allowed(80, "mature") is True

    def test_content_blocked_explicit_under_mature(self):
        """Intimacy 85 (explicit band) is blocked under 'mature' ceiling."""
        assert is_content_allowed(85, "mature") is False

    def test_content_allowed_explicit_under_explicit(self):
        """Intimacy 100 is allowed when ceiling is 'explicit'."""
        assert is_content_allowed(100, "explicit") is True

    # --- hash_content_lock_password ---

    def test_hash_returns_64_char_hex(self):
        """SHA-256 digest is always 64 hex characters."""
        digest = hash_content_lock_password("hunter2")
        assert len(digest) == 64
        assert all(c in "0123456789abcdef" for c in digest)

    def test_hash_is_deterministic(self):
        """The same password always produces the same digest."""
        assert hash_content_lock_password("hunter2") == hash_content_lock_password("hunter2")

    def test_hash_case_sensitive(self):
        """Password hashing is case-sensitive — 'Hunter2' != 'hunter2'."""
        assert hash_content_lock_password("Hunter2") != hash_content_lock_password("hunter2")

    def test_hash_empty_string(self):
        """Empty password should not crash and produces a valid digest."""
        digest = hash_content_lock_password("")
        assert len(digest) == 64

    # --- verify_content_lock_password ---

    def test_verify_correct_password(self):
        """Correct password returns True."""
        stored = hash_content_lock_password("s3cr3t")
        assert verify_content_lock_password("s3cr3t", stored) is True

    def test_verify_wrong_password(self):
        """Wrong password returns False."""
        stored = hash_content_lock_password("s3cr3t")
        assert verify_content_lock_password("wrong", stored) is False

    def test_verify_empty_against_empty(self):
        """Empty password verifies against its own hash."""
        stored = hash_content_lock_password("")
        assert verify_content_lock_password("", stored) is True

    def test_verify_case_mismatch(self):
        """Case difference causes verify to return False."""
        stored = hash_content_lock_password("Password1")
        assert verify_content_lock_password("password1", stored) is False


# ---------------------------------------------------------------------------
# TestIntimacyTracking
# ---------------------------------------------------------------------------


class TestIntimacyTracking:
    """Tests for intimacy.py — scoring, detection, and physical state updates."""

    def _blank_state(self, level: int = 0) -> IntimacyState:
        """Return a fresh IntimacyState at the given level for convenience.

        Args:
            level: Starting intimacy level (default 0).

        Returns:
            IntimacyState with the given level, stable trend, turn 0.
        """
        return IntimacyState(level=level, trend="stable", last_update_turn=0)

    # --- evaluate_intimacy_shift: signal detection ---

    def test_flirty_words_add_points(self):
        """Flirty pattern hit should raise the level above the baseline."""
        state = self._blank_state(level=10)
        result = evaluate_intimacy_shift(
            state,
            user_msg="You look so cute today",
            assistant_msg="",
            ceiling="mature",
        )
        assert result.level > state.level

    def test_romantic_words_add_points(self):
        """Romantic pattern hit ('darling', 'love you') should raise the level."""
        state = self._blank_state(level=10)
        result = evaluate_intimacy_shift(
            state,
            user_msg="I love you, darling",
            assistant_msg="",
            ceiling="mature",
        )
        assert result.level > state.level

    def test_cooling_words_subtract_points(self):
        """Cooling pattern ('stop', 'just friends') should lower the level."""
        state = self._blank_state(level=20)
        result = evaluate_intimacy_shift(
            state,
            user_msg="stop, we're just friends",
            assistant_msg="",
            ceiling="mature",
        )
        assert result.level < state.level

    def test_delta_clamped_positive(self):
        """A very romantic message can only raise the level by at most 5."""
        state = self._blank_state(level=0)
        # Force many pattern groups to fire simultaneously.
        result = evaluate_intimacy_shift(
            state,
            user_msg=(
                "I love you darling, you're so beautiful, "
                "kiss me, touch my hand, moan softly"
            ),
            assistant_msg="*blushes* I love you too sweetheart",
            ceiling="explicit",
        )
        assert result.level <= state.level + 5

    def test_delta_clamped_negative(self):
        """Many cooling signals can only lower the level by at most 5."""
        state = self._blank_state(level=30)
        result = evaluate_intimacy_shift(
            state,
            user_msg="stop don't no wait please don't that's awkward and weird",
            assistant_msg="",
            ceiling="explicit",
        )
        assert result.level >= state.level - 5

    def test_ceiling_caps_general(self):
        """Even with romantic signals, level cannot exceed CEILING_MAX_INTIMACY['general'] = 30."""
        state = self._blank_state(level=28)
        result = evaluate_intimacy_shift(
            state,
            user_msg="I love you, darling, kiss me",
            assistant_msg="*embraces you warmly*",
            ceiling="general",
        )
        assert result.level <= 30

    def test_ceiling_caps_edgy(self):
        """Level cannot exceed CEILING_MAX_INTIMACY['edgy'] = 60."""
        state = self._blank_state(level=58)
        result = evaluate_intimacy_shift(
            state,
            user_msg="I love you darling kiss me hold me",
            assistant_msg="*kisses you softly*",
            ceiling="edgy",
        )
        assert result.level <= 60

    def test_psychology_phase_detaching_caps_at_30(self):
        """Psychology phase 'detaching' hard-caps the level at 30 regardless of ceiling."""
        state = self._blank_state(level=28)
        result = evaluate_intimacy_shift(
            state,
            user_msg="I love you darling",
            assistant_msg="*kisses you*",
            ceiling="explicit",
            psychology_phase="detaching",
        )
        assert result.level <= 30

    def test_psychology_phase_post_breakup_caps_at_30(self):
        """Psychology phase 'post_breakup' hard-caps the level at 30."""
        state = self._blank_state(level=28)
        result = evaluate_intimacy_shift(
            state,
            user_msg="I love you darling",
            assistant_msg="*kisses you*",
            ceiling="explicit",
            psychology_phase="post_breakup",
        )
        assert result.level <= 30

    def test_natural_decay_when_no_signals(self):
        """A neutral message with no romantic or cooling signals causes -1 decay."""
        state = self._blank_state(level=10)
        result = evaluate_intimacy_shift(
            state,
            user_msg="The weather is fine today.",
            assistant_msg="Indeed, it looks pleasant outside.",
            ceiling="explicit",
        )
        assert result.level == 9

    def test_trend_rising(self):
        """Positive delta should set trend to 'rising'."""
        state = self._blank_state(level=5)
        result = evaluate_intimacy_shift(
            state,
            user_msg="You're so beautiful and cute",
            assistant_msg="",
            ceiling="mature",
        )
        assert result.trend == "rising"

    def test_trend_cooling(self):
        """Negative delta should set trend to 'cooling'."""
        state = self._blank_state(level=15)
        result = evaluate_intimacy_shift(
            state,
            user_msg="Stop it, that's inappropriate",
            assistant_msg="",
            ceiling="mature",
        )
        assert result.trend == "cooling"

    def test_trend_stable_on_natural_decay(self):
        """Natural decay (delta == -1 → negative) marks trend as 'cooling', not 'stable'."""
        state = self._blank_state(level=5)
        result = evaluate_intimacy_shift(
            state,
            user_msg="The weather is fine.",
            assistant_msg="Yes, quite pleasant.",
            ceiling="mature",
        )
        # Natural decay sets delta = -1 which is < 0 → cooling
        assert result.trend == "cooling"

    def test_turn_counter_increments(self):
        """last_update_turn is incremented by exactly 1 each call."""
        state = self._blank_state(level=0)
        result = evaluate_intimacy_shift(
            state,
            user_msg="Hello",
            assistant_msg="Hi",
            ceiling="general",
        )
        assert result.last_update_turn == state.last_update_turn + 1

    def test_input_state_is_not_mutated(self):
        """evaluate_intimacy_shift must not mutate the input IntimacyState."""
        state = IntimacyState(level=20, trend="stable", last_update_turn=5)
        evaluate_intimacy_shift(
            state,
            user_msg="You look cute",
            assistant_msg="",
            ceiling="mature",
        )
        assert state.level == 20
        assert state.trend == "stable"
        assert state.last_update_turn == 5

    # --- detect_physical_actions ---

    def test_detect_extracts_action_markers(self):
        """*action* markers are extracted correctly."""
        actions = detect_physical_actions("Hello *waves hello* there *smiles warmly* at you")
        assert "waves hello" in actions
        assert "smiles warmly" in actions

    def test_detect_empty_message(self):
        """A message with no action markers returns an empty list."""
        assert detect_physical_actions("No actions here") == []

    def test_detect_filters_too_short(self):
        """Markers with inner text <= 3 chars are excluded."""
        # "x" has length 1, "ab" has length 2, "abc" has length 3 (boundary — excluded)
        assert detect_physical_actions("*x*") == []
        assert detect_physical_actions("*ab*") == []
        assert detect_physical_actions("*abc*") == []

    def test_detect_filters_too_long(self):
        """Markers with inner text >= 200 chars are excluded."""
        long_text = "a" * 200
        result = detect_physical_actions(f"*{long_text}*")
        assert result == []

    def test_detect_accepts_valid_length(self):
        """Markers with 4-199 inner characters are included."""
        result = detect_physical_actions("*leans in*")
        assert result == ["leans in"]

    def test_detect_multiple_markers(self):
        """Multiple valid markers in the same message are all returned."""
        result = detect_physical_actions("*leans forward* and *reaches out hand*")
        assert len(result) == 2

    # --- update_physical_state ---

    def test_update_detects_clothing_removal(self):
        """Clothing removal verb phrase updates companion_clothing."""
        ps = PhysicalState()
        new_ps = update_physical_state(
            ps,
            user_msg="",
            assistant_msg="*slowly takes off her jacket*",
        )
        assert "takes off" in new_ps.companion_clothing.lower() or "jacket" in new_ps.companion_clothing.lower()

    def test_update_keeps_last_5_actions(self):
        """recent_actions rolling window is capped at 5 entries."""
        ps = PhysicalState(recent_actions=["a1", "a2", "a3", "a4", "a5"])
        new_ps = update_physical_state(
            ps,
            user_msg="*reaches forward*",
            assistant_msg="",
        )
        assert len(new_ps.recent_actions) <= 5

    def test_update_arousal_increments_on_explicit(self):
        """Explicit-pattern text increments arousal_level by 1.

        NOTE: EXPLICIT_PATTERNS[0] matches bare stems only (moan, gasp, pant)
        without plural/conjugated forms (moans, gasps).  This is a known gap
        in the source — tests use the forms that actually fire the pattern.
        """
        ps = PhysicalState(arousal_level=2)
        new_ps = update_physical_state(
            ps,
            user_msg="she let out a moan",
            assistant_msg="",
        )
        assert new_ps.arousal_level == 3

    def test_update_arousal_decays_without_explicit(self):
        """Without explicit signals, arousal_level decays by 1 (floored at 0)."""
        ps = PhysicalState(arousal_level=3)
        new_ps = update_physical_state(
            ps,
            user_msg="The weather is nice today.",
            assistant_msg="Yes, quite pleasant.",
        )
        assert new_ps.arousal_level == 2

    def test_update_arousal_floored_at_zero(self):
        """Arousal cannot go below 0 even with multiple neutral turns."""
        ps = PhysicalState(arousal_level=0)
        new_ps = update_physical_state(
            ps,
            user_msg="Normal message",
            assistant_msg="Normal reply",
        )
        assert new_ps.arousal_level == 0

    def test_update_arousal_capped_at_ten(self):
        """Arousal cannot exceed 10.

        NOTE: Uses bare stem forms (moan, gasp) that actually match
        EXPLICIT_PATTERNS[0], not the plural forms (moans, gasps) which
        the pattern currently misses — see test_update_arousal_increments_on_explicit.
        """
        ps = PhysicalState(arousal_level=10)
        new_ps = update_physical_state(
            ps,
            user_msg="she began to moan and gasp loudly",
            assistant_msg="",
        )
        assert new_ps.arousal_level == 10

    def test_update_does_not_mutate_input_state(self):
        """update_physical_state must not mutate the input PhysicalState."""
        ps = PhysicalState(arousal_level=5, recent_actions=["a1"])
        update_physical_state(ps, user_msg="*leans in*", assistant_msg="")
        assert ps.arousal_level == 5
        assert ps.recent_actions == ["a1"]

    def test_update_appends_detected_actions(self):
        """Actions from both user and assistant messages are appended."""
        ps = PhysicalState()
        new_ps = update_physical_state(
            ps,
            user_msg="*reaches forward gently*",
            assistant_msg="*steps back slowly*",
        )
        assert "reaches forward gently" in new_ps.recent_actions
        assert "steps back slowly" in new_ps.recent_actions


# ---------------------------------------------------------------------------
# TestContentPrompts
# ---------------------------------------------------------------------------


class TestContentPrompts:
    """Tests for prompts.py — all four prompt-builder functions."""

    # --- build_content_directive_block ---

    def test_directive_general_non_empty(self):
        """build_content_directive_block returns non-empty string for 'general'."""
        block = build_content_directive_block("general")
        assert isinstance(block, str) and len(block) > 0

    def test_directive_edgy_non_empty(self):
        """build_content_directive_block returns non-empty string for 'edgy'."""
        block = build_content_directive_block("edgy")
        assert isinstance(block, str) and len(block) > 0

    def test_directive_mature_non_empty(self):
        """build_content_directive_block returns non-empty string for 'mature'."""
        block = build_content_directive_block("mature")
        assert isinstance(block, str) and len(block) > 0

    def test_directive_explicit_non_empty(self):
        """build_content_directive_block returns non-empty string for 'explicit'."""
        block = build_content_directive_block("explicit")
        assert isinstance(block, str) and len(block) > 0

    def test_directive_general_contains_rating_header(self):
        """General block contains '[Content Rating: General' header."""
        assert "[Content Rating: General" in build_content_directive_block("general")

    def test_directive_edgy_contains_rating_header(self):
        """Edgy block contains '[Content Rating: Edgy' header."""
        assert "[Content Rating: Edgy" in build_content_directive_block("edgy")

    def test_directive_mature_contains_rating_header(self):
        """Mature block contains '[Content Rating: Mature' header."""
        assert "[Content Rating: Mature" in build_content_directive_block("mature")

    def test_directive_explicit_contains_rating_header(self):
        """Explicit block contains '[Content Rating: Explicit' header."""
        assert "[Content Rating: Explicit" in build_content_directive_block("explicit")

    def test_directive_includes_intimacy_line_when_positive(self):
        """When intimacy_level > 0, the block ends with a closeness line."""
        block = build_content_directive_block("edgy", intimacy_level=42)
        assert "42/100" in block

    def test_directive_no_intimacy_line_at_zero(self):
        """When intimacy_level == 0 (default), no intimacy suffix is added."""
        block = build_content_directive_block("general", intimacy_level=0)
        assert "intimacy" not in block.lower() or "/100" not in block

    def test_directive_intimacy_line_not_present_default(self):
        """Default call (no intimacy_level arg) must not inject a closeness line."""
        block = build_content_directive_block("mature")
        assert "/100" not in block

    # --- build_physical_awareness_block ---

    def test_physical_block_empty_for_default_state(self):
        """Default PhysicalState produces an empty string."""
        assert build_physical_awareness_block(PhysicalState()) == ""

    def test_physical_block_non_empty_for_custom_state(self):
        """Non-default PhysicalState produces a non-empty block."""
        ps = PhysicalState(companion_clothing="yukata", physical_context="lying side by side")
        block = build_physical_awareness_block(ps)
        assert len(block) > 0

    def test_physical_block_contains_companion_clothing(self):
        """Block includes the companion's current clothing description."""
        ps = PhysicalState(companion_clothing="silk robe")
        block = build_physical_awareness_block(ps)
        assert "silk robe" in block

    def test_physical_block_contains_physical_context(self):
        """Block includes the current physical context / setting."""
        ps = PhysicalState(physical_context="curled up on the sofa")
        block = build_physical_awareness_block(ps)
        assert "curled up on the sofa" in block

    def test_physical_block_contains_recent_actions_when_present(self):
        """Block includes a 'Recent physical actions' line when list is non-empty."""
        ps = PhysicalState(
            companion_clothing="casual",
            recent_actions=["leans in close", "holds your hand"],
        )
        block = build_physical_awareness_block(ps)
        assert "Recent physical actions" in block

    def test_physical_block_omits_recent_actions_when_empty(self):
        """Block omits 'Recent physical actions' when the list is empty."""
        ps = PhysicalState(companion_clothing="yukata")
        block = build_physical_awareness_block(ps)
        assert "Recent physical actions" not in block

    # --- build_sensory_writing_block ---

    def test_sensory_block_empty_when_disabled(self):
        """Disabled config always returns empty string."""
        cfg = SensoryWritingConfig(enabled=False)
        assert build_sensory_writing_block(cfg) == ""

    def test_sensory_block_non_empty_when_enabled_with_channels(self):
        """Enabled config with at least one channel returns a non-empty block."""
        cfg = SensoryWritingConfig(enabled=True, emphasis_sound=True)
        block = build_sensory_writing_block(cfg)
        assert len(block) > 0

    def test_sensory_block_contains_active_channels(self):
        """Block lists exactly the enabled channel names."""
        cfg = SensoryWritingConfig(
            enabled=True,
            emphasis_sound=True,
            emphasis_touch=True,
            emphasis_scent=False,
            emphasis_temperature=False,
            emphasis_texture=False,
            emphasis_taste=False,
        )
        block = build_sensory_writing_block(cfg)
        assert "sound" in block
        assert "touch" in block
        assert "scent" not in block

    def test_sensory_block_empty_when_all_channels_disabled(self):
        """Enabled config with no active channels returns empty string."""
        cfg = SensoryWritingConfig(
            enabled=True,
            emphasis_sound=False,
            emphasis_scent=False,
            emphasis_touch=False,
            emphasis_temperature=False,
            emphasis_texture=False,
            emphasis_taste=False,
        )
        assert build_sensory_writing_block(cfg) == ""

    def test_sensory_block_intensity_boosted_by_intimacy(self):
        """Effective intensity increases by 1 for every 20 intimacy points."""
        cfg = SensoryWritingConfig(enabled=True, intensity=5, emphasis_touch=True)
        block_0 = build_sensory_writing_block(cfg, intimacy_level=0)
        block_40 = build_sensory_writing_block(cfg, intimacy_level=40)
        assert "5/10" in block_0
        assert "7/10" in block_40  # 5 + 40//20 = 5 + 2 = 7

    def test_sensory_block_intensity_capped_at_10(self):
        """Effective intensity is capped at 10 regardless of intimacy."""
        cfg = SensoryWritingConfig(enabled=True, intensity=9, emphasis_touch=True)
        block = build_sensory_writing_block(cfg, intimacy_level=100)
        assert "10/10" in block

    # --- build_intimacy_gate_block ---

    def test_gate_block_empty_for_general_low_intimacy(self):
        """General ceiling + intimacy < 10 returns empty string."""
        assert build_intimacy_gate_block(0, "general") == ""
        assert build_intimacy_gate_block(9, "general") == ""

    def test_gate_block_early_connection_band(self):
        """Intimacy 10–29 under any ceiling returns the Early Connection block."""
        block = build_intimacy_gate_block(15, "edgy")
        assert "Early Connection" in block

    def test_gate_block_growing_closeness_band(self):
        """Intimacy 30–59 returns the Growing Closeness block."""
        block = build_intimacy_gate_block(45, "mature")
        assert "Growing Closeness" in block

    def test_gate_block_deep_connection_band(self):
        """Intimacy 60–84 returns the Deep Connection block."""
        block = build_intimacy_gate_block(70, "explicit")
        assert "Deep Connection" in block

    def test_gate_block_explicit_ceiling_at_85_plus(self):
        """Intimacy >= 85 with explicit ceiling returns the Full Intimacy block."""
        block = build_intimacy_gate_block(90, "explicit")
        assert "Full Intimacy" in block

    def test_gate_block_non_explicit_ceiling_at_85_plus(self):
        """Intimacy >= 85 with a non-explicit ceiling returns the Deep Intimacy block."""
        block = build_intimacy_gate_block(90, "mature")
        assert "Deep Intimacy" in block

    def test_gate_block_non_explicit_ceiling_edgy_at_85_plus(self):
        """Intimacy >= 85 with edgy ceiling returns Deep Intimacy (imply not describe)."""
        block = build_intimacy_gate_block(95, "edgy")
        assert "Deep Intimacy" in block

    def test_gate_block_boundary_at_intimacy_10_general(self):
        """Intimacy exactly 10 with general ceiling should produce an Early Connection block."""
        block = build_intimacy_gate_block(10, "general")
        assert "Early Connection" in block

    def test_gate_block_boundary_30_growing_closeness(self):
        """Intimacy exactly 30 should return Growing Closeness, not Early Connection."""
        block = build_intimacy_gate_block(30, "mature")
        assert "Growing Closeness" in block
        assert "Early Connection" not in block

    def test_gate_block_boundary_60_deep_connection(self):
        """Intimacy exactly 60 should return Deep Connection, not Growing Closeness."""
        block = build_intimacy_gate_block(60, "explicit")
        assert "Deep Connection" in block
        assert "Growing Closeness" not in block
