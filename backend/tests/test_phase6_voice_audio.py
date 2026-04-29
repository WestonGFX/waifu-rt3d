"""Tests for NSFW Phase 6 — Voice & Audio features.

Covers F4 Voice Intimacy Mode, F33 Audio Stories, F36 Quickfire Mode,
and F46 Love Letters.  All tests are pure-unit — no TTS, LLM, or network I/O.
"""

from __future__ import annotations

from datetime import date, timedelta

import pytest

# ---------------------------------------------------------------------------
# F4: Voice Intimacy Mode
# ---------------------------------------------------------------------------

from backend.voice.intimacy_mode import (
    CHARACTER_VOICE_PROFILES,
    INTIMATE_VOICE_PARAMS,
    INTENSITY_PRESETS,
    TRANSITION_RAMP,
    VoiceIntimacyMode,
)


class TestVoiceIntimacyActivation:
    """F4: activation gate tests."""

    def test_activates_high_intimacy_and_arousal(self) -> None:
        e = VoiceIntimacyMode()
        assert e.should_activate(intimacy=80, arousal=5.0) is True

    def test_no_activate_low_intimacy(self) -> None:
        e = VoiceIntimacyMode()
        assert e.should_activate(intimacy=50, arousal=5.0) is False

    def test_no_activate_low_arousal(self) -> None:
        e = VoiceIntimacyMode()
        assert e.should_activate(intimacy=80, arousal=2.0) is False

    def test_boundary_intimacy(self) -> None:
        """intimacy=70 (boundary) → should NOT activate (> not >=)."""
        e = VoiceIntimacyMode()
        assert e.should_activate(intimacy=70, arousal=5.0) is False

    def test_boundary_arousal(self) -> None:
        """arousal=3.0 (boundary) → should NOT activate (> not >=)."""
        e = VoiceIntimacyMode()
        assert e.should_activate(intimacy=80, arousal=3.0) is False


class TestVoiceIntimacyTransition:
    """F4: gradual transition ramp."""

    def test_message_1_half_intensity(self) -> None:
        e = VoiceIntimacyMode()
        assert e.get_transition_intensity(1) == 0.50

    def test_message_2_mostly_there(self) -> None:
        e = VoiceIntimacyMode()
        assert e.get_transition_intensity(2) == 0.80

    def test_message_3_full(self) -> None:
        e = VoiceIntimacyMode()
        assert e.get_transition_intensity(3) == 1.00

    def test_message_10_still_full(self) -> None:
        e = VoiceIntimacyMode()
        assert e.get_transition_intensity(10) == 1.00

    def test_message_0_returns_value(self) -> None:
        """Message 0 (before any intimate message) should return a value."""
        e = VoiceIntimacyMode()
        result = e.get_transition_intensity(0)
        assert isinstance(result, float)


class TestVoiceIntimacyProfiles:
    """F4: character voice profiles."""

    def test_dae_has_profile(self) -> None:
        e = VoiceIntimacyMode()
        profile = e.get_character_profile("Dae (Neciridae)")
        assert "description" in profile

    def test_unknown_gets_default(self) -> None:
        e = VoiceIntimacyMode()
        profile = e.get_character_profile("Unknown Character")
        assert isinstance(profile, dict)

    def test_all_characters_mapped(self) -> None:
        assert len(CHARACTER_VOICE_PROFILES) >= 6  # At minimum the spec chars


class TestVoiceIntimacyOverrides:
    """F4: TTS parameter overrides."""

    def test_overrides_return_dict(self) -> None:
        e = VoiceIntimacyMode()
        result = e.get_tts_overrides({}, "Dae (Neciridae)", 3)
        assert isinstance(result, dict)

    def test_overrides_contain_speed(self) -> None:
        e = VoiceIntimacyMode()
        result = e.get_tts_overrides({}, "Dae (Neciridae)", 3)
        assert "speed" in result

    def test_overrides_scale_with_transition(self) -> None:
        """Different message counts should produce different overrides."""
        e = VoiceIntimacyMode()
        msg1 = e.get_tts_overrides({}, "Dae (Neciridae)", 1)
        msg3 = e.get_tts_overrides({}, "Dae (Neciridae)", 3)
        # Gradual ramp means msg1 and msg3 have different intensities
        assert msg1["speed"] != msg3["speed"]

    def test_does_not_mutate_base(self) -> None:
        """Base params dict should not be modified."""
        e = VoiceIntimacyMode()
        base = {"speed": 1.0, "pitch": 0.0}
        _ = e.get_tts_overrides(base, "Dae (Neciridae)", 3)
        assert base == {"speed": 1.0, "pitch": 0.0}


class TestVoiceIntimacyPrompt:
    """F4: prompt generation."""

    def test_prompt_has_tag(self) -> None:
        e = VoiceIntimacyMode()
        prompt = e.get_prompt("Dae (Neciridae)", 80, 5.0, 2)
        assert prompt is not None
        assert "[VOICE_INTIMACY]" in prompt

    def test_prompt_none_when_inactive(self) -> None:
        e = VoiceIntimacyMode()
        assert e.get_prompt("Dae (Neciridae)", 50, 2.0, 1) is None

    def test_paralinguistic_mentions_sounds(self) -> None:
        e = VoiceIntimacyMode()
        para = e.get_paralinguistic_prompt()
        assert "sigh" in para.lower() or "[sigh]" in para

    def test_intensity_presets_exist(self) -> None:
        assert "subtle" in INTENSITY_PRESETS
        assert "moderate" in INTENSITY_PRESETS
        assert "expressive" in INTENSITY_PRESETS


# ---------------------------------------------------------------------------
# F33: Erotic Audio Narration
# ---------------------------------------------------------------------------

from backend.voice.audio_stories import (
    BOND_GATE,
    STORY_TTS_PARAMS,
    STORY_TYPES,
    AudioStoryEngine,
)


class TestAudioStoryGating:
    """F33: bond gate tests."""

    def test_allow_at_gate(self) -> None:
        e = AudioStoryEngine()
        assert e.should_allow(50) is True

    def test_deny_below_gate(self) -> None:
        e = AudioStoryEngine()
        assert e.should_allow(49) is False

    def test_bond_gate_value(self) -> None:
        assert BOND_GATE == 50


class TestAudioStoryTypes:
    """F33: story type catalog."""

    def test_three_story_types(self) -> None:
        assert len(STORY_TYPES) == 3

    def test_memory_retelling_exists(self) -> None:
        assert "memory_retelling" in STORY_TYPES

    def test_fantasy_narration_exists(self) -> None:
        assert "fantasy_narration" in STORY_TYPES

    def test_guided_relaxation_exists(self) -> None:
        assert "guided_relaxation" in STORY_TYPES

    def test_get_story_types_list(self) -> None:
        e = AudioStoryEngine()
        types = e.get_story_types()
        assert len(types) == 3
        assert all("id" in t for t in types)


class TestAudioStoryPrompt:
    """F33: prompt building."""

    def test_prompt_contains_char_name(self) -> None:
        e = AudioStoryEngine()
        prompt = e.build_story_prompt("Luna", "memory_retelling", "suggestive", "Loves stars")
        assert "Luna" in prompt

    def test_prompt_contains_context(self) -> None:
        e = AudioStoryEngine()
        prompt = e.build_story_prompt("Luna", "memory_retelling", "suggestive", "Loves stargazing")
        assert "stargazing" in prompt

    def test_invalid_type_defaults(self) -> None:
        e = AudioStoryEngine()
        prompt = e.build_story_prompt("Dae", "nonexistent_type", "mild", "Context")
        assert isinstance(prompt, str)
        assert len(prompt) > 0

    def test_prompt_tag(self) -> None:
        e = AudioStoryEngine()
        p = e.get_prompt("Dae", 60)
        assert p is not None
        assert "[AUDIO_STORY]" in p

    def test_prompt_none_low_bond(self) -> None:
        e = AudioStoryEngine()
        assert e.get_prompt("Dae", 30) is None


class TestAudioStoryTTS:
    """F33: TTS parameter overrides."""

    def test_tts_params_slower(self) -> None:
        assert STORY_TTS_PARAMS["speed"] < 1.0

    def test_tts_params_softer(self) -> None:
        assert STORY_TTS_PARAMS["energy"] < 0

    def test_get_tts_returns_copy(self) -> None:
        e = AudioStoryEngine()
        params = e.get_tts_params()
        params["speed"] = 999
        assert e.get_tts_params()["speed"] != 999


# ---------------------------------------------------------------------------
# F36: Quickfire Mode
# ---------------------------------------------------------------------------

from backend.content.quickfire import (
    CHARACTER_QUICKFIRE_STYLE,
    MAX_TOKENS,
    QuickfireEngine,
)


class TestQuickfireActivation:
    """F36: mode toggle tests."""

    def test_active_in_quickfire(self) -> None:
        e = QuickfireEngine()
        assert e.is_active("quickfire") is True

    def test_inactive_in_normal(self) -> None:
        e = QuickfireEngine()
        assert e.is_active("normal") is False

    def test_inactive_empty_string(self) -> None:
        e = QuickfireEngine()
        assert e.is_active("") is False


class TestQuickfireSettings:
    """F36: quickfire mode settings."""

    def test_max_tokens_80(self) -> None:
        e = QuickfireEngine()
        assert e.get_max_tokens() == 80
        assert MAX_TOKENS == 80

    def test_tts_disabled(self) -> None:
        e = QuickfireEngine()
        assert e.should_disable_tts() is True

    def test_typing_speed_fast(self) -> None:
        e = QuickfireEngine()
        assert e.get_typing_speed() == "fast"


class TestQuickfireStyles:
    """F36: character quickfire styles."""

    def test_dae_is_flirty(self) -> None:
        e = QuickfireEngine()
        assert e.get_style("Dae (Neciridae)") == "flirty"

    def test_sable_is_bold(self) -> None:
        e = QuickfireEngine()
        assert e.get_style("Sable (Kuroha)") == "bold"

    def test_genki_is_giggly(self) -> None:
        e = QuickfireEngine()
        assert e.get_style("Genki (Kitsune)") == "giggly"

    def test_unknown_gets_default(self) -> None:
        e = QuickfireEngine()
        style = e.get_style("Unknown")
        assert style in ("flirty", "shy", "bold", "giggly", "teasing")

    def test_all_characters_mapped(self) -> None:
        assert len(CHARACTER_QUICKFIRE_STYLE) >= 12


class TestQuickfirePrompt:
    """F36: prompt generation."""

    def test_prompt_has_tag(self) -> None:
        e = QuickfireEngine()
        prompt = e.get_prompt("Dae (Neciridae)")
        assert "[QUICKFIRE_MODE]" in prompt

    def test_prompt_mentions_short(self) -> None:
        e = QuickfireEngine()
        prompt = e.get_prompt("Dae (Neciridae)")
        assert "short" in prompt.lower() or "SHORT" in prompt

    def test_different_chars_different_prompts(self) -> None:
        e = QuickfireEngine()
        dae = e.get_prompt("Dae (Neciridae)")
        sable = e.get_prompt("Sable (Kuroha)")
        assert dae != sable


# ---------------------------------------------------------------------------
# F46: Love Letter Generator
# ---------------------------------------------------------------------------

from backend.emotional.love_letters import (
    DEPTH_LEVELS,
    LoveLetterEngine,
    MIN_BOND_LEVEL,
    MAX_FREQUENCY_DAYS,
)


class TestLoveLetterGating:
    """F46: bond gate tests."""

    def test_allow_at_40(self) -> None:
        e = LoveLetterEngine()
        assert e.should_allow(40) is True

    def test_deny_below_40(self) -> None:
        e = LoveLetterEngine()
        assert e.should_allow(39) is False

    def test_bond_level_constant(self) -> None:
        assert MIN_BOND_LEVEL == 40


class TestLoveLetterDepth:
    """F46: bond-gated depth levels."""

    def test_warm_at_45(self) -> None:
        e = LoveLetterEngine()
        assert e.get_depth_level(45) == "warm"

    def test_open_at_65(self) -> None:
        e = LoveLetterEngine()
        assert e.get_depth_level(65) == "open"

    def test_raw_at_85(self) -> None:
        e = LoveLetterEngine()
        assert e.get_depth_level(85) == "raw"

    def test_raw_at_100(self) -> None:
        e = LoveLetterEngine()
        assert e.get_depth_level(100) == "raw"

    def test_warm_at_boundary_59(self) -> None:
        e = LoveLetterEngine()
        assert e.get_depth_level(59) == "warm"

    def test_open_at_boundary_60(self) -> None:
        e = LoveLetterEngine()
        assert e.get_depth_level(60) == "open"

    def test_three_depth_levels(self) -> None:
        assert len(DEPTH_LEVELS) == 3


class TestLoveLetterFrequency:
    """F46: monthly frequency cap."""

    def test_can_generate_first_time(self) -> None:
        e = LoveLetterEngine()
        assert e.can_generate(1, 50, None) is True

    def test_blocked_by_recent_letter(self) -> None:
        e = LoveLetterEngine()
        yesterday = (date.today() - timedelta(days=1)).isoformat()
        assert e.can_generate(1, 50, yesterday) is False

    def test_allowed_after_30_days(self) -> None:
        e = LoveLetterEngine()
        long_ago = (date.today() - timedelta(days=31)).isoformat()
        assert e.can_generate(1, 50, long_ago) is True

    def test_blocked_low_bond(self) -> None:
        e = LoveLetterEngine()
        assert e.can_generate(1, 30, None) is False

    def test_frequency_constant(self) -> None:
        assert MAX_FREQUENCY_DAYS == 30


class TestLoveLetterPrompt:
    """F46: prompt generation."""

    def test_prompt_has_tag(self) -> None:
        e = LoveLetterEngine()
        p = e.get_prompt("Dae", 50)
        assert p is not None
        assert "[LOVE_LETTER]" in p

    def test_prompt_none_low_bond(self) -> None:
        e = LoveLetterEngine()
        assert e.get_prompt("Dae", 30) is None

    def test_build_letter_prompt_contains_char(self) -> None:
        e = LoveLetterEngine()
        prompt = e.build_letter_prompt("Dae", 50, "First kiss", "darling", "Painted together")
        assert "Dae" in prompt

    def test_build_letter_prompt_contains_milestones(self) -> None:
        e = LoveLetterEngine()
        prompt = e.build_letter_prompt("Luna", 70, "First stargazing", "moonbeam", "Watched meteor shower")
        assert "stargazing" in prompt or "First stargazing" in prompt
