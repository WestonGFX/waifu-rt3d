"""Tests for backend.adaptive.param_tuner — dynamic LLM sampling parameter tuning.

Covers:
    - get_tuned_params() returns all 4 required keys for every context
    - Each context preset produces distinct parameter sets
    - apply_engagement_drift() increases temperature on positive trend, decreases on negative
    - All returned params stay within PARAM_RANGES bounds even after drift
    - char_temperature blending works (50/50 by default, only affects temperature)
    - user_overrides take highest priority; unknown override keys are silently ignored
    - blend_with_character() only modifies temperature, leaves other params unchanged
    - Unknown context falls back to casual_chat preset
    - blend_weight=0.0 → pure context temperature, blend_weight=1.0 → pure char temperature
    - blend_with_character() raises ValueError for out-of-range blend_weight

All tests are pure function calls — no I/O, no mutable global state.
"""

from __future__ import annotations

import pytest

from backend.adaptive.param_tuner import (
    CONTEXT_PARAM_PRESETS,
    PARAM_RANGES,
    apply_engagement_drift,
    blend_with_character,
    get_tuned_params,
)

# The four required keys every result must contain.
_REQUIRED_KEYS = {"temperature", "min_p", "top_p", "repetition_penalty"}

# All defined context strings.
_ALL_CONTEXTS = list(CONTEXT_PARAM_PRESETS.keys())


# ---------------------------------------------------------------------------
# Tests: get_tuned_params — result structure
# ---------------------------------------------------------------------------


class TestGetTunedParamsStructure:
    """Tests that get_tuned_params() returns the correct shape."""

    def test_returns_all_four_keys_for_factual_qa(self):
        """Result dict contains temperature, min_p, top_p, and repetition_penalty."""
        result = get_tuned_params("factual_qa")
        assert set(result.keys()) == _REQUIRED_KEYS

    @pytest.mark.parametrize("ctx", _ALL_CONTEXTS)
    def test_returns_all_four_keys_for_every_context(self, ctx: str):
        """All four required keys are present for every defined context type.

        Args:
            ctx: One of the seven context type strings.
        """
        result = get_tuned_params(ctx)
        assert set(result.keys()) == _REQUIRED_KEYS

    @pytest.mark.parametrize("ctx", _ALL_CONTEXTS)
    def test_all_values_within_param_ranges(self, ctx: str):
        """Every returned value is clamped within its safe range.

        Args:
            ctx: One of the seven context type strings.
        """
        result = get_tuned_params(ctx)
        for key, (lo, hi) in PARAM_RANGES.items():
            assert lo <= result[key] <= hi, (
                f"Context {ctx!r}: {key}={result[key]} out of range [{lo}, {hi}]"
            )


# ---------------------------------------------------------------------------
# Tests: get_tuned_params — presets are distinct
# ---------------------------------------------------------------------------


class TestContextPresetsDistinct:
    """Tests that different contexts produce meaningfully different parameters."""

    def test_factual_qa_has_lowest_temperature(self):
        """factual_qa preset has the lowest temperature (precision-focused)."""
        temps = {ctx: get_tuned_params(ctx)["temperature"] for ctx in _ALL_CONTEXTS}
        assert temps["factual_qa"] == min(temps.values())

    def test_creative_roleplay_has_high_temperature(self):
        """creative_roleplay preset temperature is >= all other presets."""
        temps = {ctx: get_tuned_params(ctx)["temperature"] for ctx in _ALL_CONTEXTS}
        assert temps["creative_roleplay"] >= max(
            v for k, v in temps.items() if k != "creative_roleplay"
        )

    def test_each_context_differs_from_casual_chat(self):
        """Every non-casual_chat context produces at least one different parameter value."""
        casual = get_tuned_params("casual_chat")
        for ctx in _ALL_CONTEXTS:
            if ctx == "casual_chat":
                continue
            params = get_tuned_params(ctx)
            assert params != casual, f"Context {ctx!r} is identical to casual_chat"

    def test_comfort_reassurance_vs_creative_roleplay_temperature(self):
        """comfort_reassurance temperature is lower than creative_roleplay (calming vs creative)."""
        comfort_t = get_tuned_params("comfort_reassurance")["temperature"]
        roleplay_t = get_tuned_params("creative_roleplay")["temperature"]
        assert comfort_t < roleplay_t


# ---------------------------------------------------------------------------
# Tests: apply_engagement_drift
# ---------------------------------------------------------------------------


class TestApplyEngagementDrift:
    """Tests for apply_engagement_drift()."""

    _BASE = {"temperature": 0.8, "min_p": 0.08, "top_p": 0.92, "repetition_penalty": 1.10}

    def test_positive_trend_increases_temperature(self):
        """Positive engagement trend nudges temperature upward."""
        drifted = apply_engagement_drift(self._BASE, engagement_trend=0.2)
        assert drifted["temperature"] > self._BASE["temperature"]

    def test_negative_trend_decreases_temperature(self):
        """Negative engagement trend nudges temperature downward."""
        drifted = apply_engagement_drift(self._BASE, engagement_trend=-0.4)
        assert drifted["temperature"] < self._BASE["temperature"]

    def test_zero_trend_leaves_temperature_unchanged(self):
        """engagement_trend=0.0 produces the same temperature as the base."""
        drifted = apply_engagement_drift(self._BASE, engagement_trend=0.0)
        assert drifted["temperature"] == pytest.approx(self._BASE["temperature"])

    def test_non_temperature_params_are_unchanged(self):
        """apply_engagement_drift does not modify min_p, top_p, or repetition_penalty."""
        drifted = apply_engagement_drift(self._BASE, engagement_trend=0.5)
        assert drifted["min_p"] == pytest.approx(self._BASE["min_p"])
        assert drifted["top_p"] == pytest.approx(self._BASE["top_p"])
        assert drifted["repetition_penalty"] == pytest.approx(self._BASE["repetition_penalty"])

    def test_large_positive_trend_clamped_to_max(self):
        """Extreme positive trend still produces a temperature within PARAM_RANGES."""
        drifted = apply_engagement_drift(self._BASE, engagement_trend=10.0)
        lo, hi = PARAM_RANGES["temperature"]
        assert lo <= drifted["temperature"] <= hi

    def test_large_negative_trend_clamped_to_min(self):
        """Extreme negative trend still produces a temperature within PARAM_RANGES."""
        drifted = apply_engagement_drift(self._BASE, engagement_trend=-10.0)
        lo, hi = PARAM_RANGES["temperature"]
        assert lo <= drifted["temperature"] <= hi

    def test_drift_magnitude_matches_expected(self):
        """Trend of +0.2 adds exactly 0.1 to temperature (0.2/0.1 * 0.05 = 0.1)."""
        base = {"temperature": 0.8, "min_p": 0.08, "top_p": 0.92, "repetition_penalty": 1.10}
        drifted = apply_engagement_drift(base, engagement_trend=0.2)
        assert drifted["temperature"] == pytest.approx(0.9, abs=1e-6)

    def test_input_dict_not_mutated(self):
        """apply_engagement_drift does not modify the input dict."""
        base = {"temperature": 0.8, "min_p": 0.08, "top_p": 0.92, "repetition_penalty": 1.10}
        original_temp = base["temperature"]
        apply_engagement_drift(base, engagement_trend=0.5)
        assert base["temperature"] == original_temp


# ---------------------------------------------------------------------------
# Tests: blend_with_character
# ---------------------------------------------------------------------------


class TestBlendWithCharacter:
    """Tests for blend_with_character()."""

    _CTX = {"temperature": 1.0, "min_p": 0.05, "top_p": 0.95, "repetition_penalty": 1.02}

    def test_default_blend_is_fifty_fifty(self):
        """Default blend_weight=0.5 produces the midpoint of context and char temperatures."""
        blended = blend_with_character(self._CTX, char_temperature=0.6)
        # 1.0 * 0.5 + 0.6 * 0.5 = 0.8
        assert blended["temperature"] == pytest.approx(0.8)

    def test_only_temperature_is_modified(self):
        """min_p, top_p, and repetition_penalty are passed through unchanged."""
        blended = blend_with_character(self._CTX, char_temperature=0.6)
        assert blended["min_p"] == pytest.approx(self._CTX["min_p"])
        assert blended["top_p"] == pytest.approx(self._CTX["top_p"])
        assert blended["repetition_penalty"] == pytest.approx(self._CTX["repetition_penalty"])

    def test_blend_weight_zero_returns_pure_context_temperature(self):
        """blend_weight=0.0 → temperature equals the context preset temperature."""
        blended = blend_with_character(self._CTX, char_temperature=0.2, blend_weight=0.0)
        assert blended["temperature"] == pytest.approx(self._CTX["temperature"])

    def test_blend_weight_one_returns_pure_char_temperature(self):
        """blend_weight=1.0 → temperature equals char_temperature."""
        blended = blend_with_character(self._CTX, char_temperature=0.2, blend_weight=1.0)
        assert blended["temperature"] == pytest.approx(0.2)

    def test_blend_weight_out_of_range_raises_value_error(self):
        """blend_weight outside [0.0, 1.0] raises ValueError."""
        with pytest.raises(ValueError):
            blend_with_character(self._CTX, char_temperature=0.5, blend_weight=1.1)
        with pytest.raises(ValueError):
            blend_with_character(self._CTX, char_temperature=0.5, blend_weight=-0.1)

    def test_input_dict_not_mutated(self):
        """blend_with_character does not modify the input context_params dict."""
        ctx = {"temperature": 1.0, "min_p": 0.05, "top_p": 0.95, "repetition_penalty": 1.02}
        blend_with_character(ctx, char_temperature=0.4)
        assert ctx["temperature"] == 1.0


# ---------------------------------------------------------------------------
# Tests: get_tuned_params — user_overrides and char_temperature
# ---------------------------------------------------------------------------


class TestGetTunedParamsOverrides:
    """Tests for the user_overrides and char_temperature interaction in get_tuned_params()."""

    def test_user_overrides_take_highest_priority(self):
        """user_overrides values override all other tuning for the affected keys."""
        result = get_tuned_params("casual_chat", user_overrides={"temperature": 1.2})
        assert result["temperature"] == pytest.approx(1.2)

    def test_user_overrides_only_affect_specified_keys(self):
        """user_overrides for one key leaves the other keys at their tuned values."""
        base = get_tuned_params("factual_qa")
        overridden = get_tuned_params("factual_qa", user_overrides={"temperature": 0.9})
        assert overridden["temperature"] == pytest.approx(0.9)
        assert overridden["min_p"] == pytest.approx(base["min_p"])
        assert overridden["top_p"] == pytest.approx(base["top_p"])
        assert overridden["repetition_penalty"] == pytest.approx(base["repetition_penalty"])

    def test_unknown_override_keys_are_silently_ignored(self):
        """Keys not in PARAM_RANGES within user_overrides are silently dropped."""
        result = get_tuned_params("casual_chat", user_overrides={"unknown_key": 99.0})
        assert "unknown_key" not in result

    def test_char_temperature_blended_fifty_fifty(self):
        """char_temperature is blended 50/50 with the context preset temperature."""
        preset_temp = CONTEXT_PARAM_PRESETS["casual_chat"]["temperature"]
        char_temp = 0.4
        result = get_tuned_params("casual_chat", char_temperature=char_temp)
        expected = preset_temp * 0.5 + char_temp * 0.5
        assert result["temperature"] == pytest.approx(expected, abs=1e-6)

    def test_unknown_context_falls_back_to_casual_chat(self):
        """Unrecognised context string falls back to the casual_chat preset."""
        result_unknown = get_tuned_params("nonexistent_context_xyz")
        result_casual = get_tuned_params("casual_chat")
        assert result_unknown == result_casual

    def test_user_override_respects_param_ranges_clamping(self):
        """user_overrides values outside PARAM_RANGES are still clamped."""
        lo, hi = PARAM_RANGES["temperature"]
        result = get_tuned_params("casual_chat", user_overrides={"temperature": 999.0})
        assert result["temperature"] <= hi
