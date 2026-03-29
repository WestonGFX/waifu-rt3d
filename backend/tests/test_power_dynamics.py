"""Tests for backend.content.power_dynamics — F32 Power Dynamic Modes.

Covers: mode constants, prompt content, intensity scaling, bond gating,
switch-pulse timing, character natural-leaning lookup, and all 13 characters
mapped in CHARACTER_NATURAL_LEANINGS.
"""

from __future__ import annotations

import pytest

from backend.content.power_dynamics import (
    BOND_GATE,
    CHARACTER_NATURAL_LEANINGS,
    POWER_DYNAMIC_PROMPTS,
    PowerDynamicEngine,
    PowerDynamicMode,
    _intensity_description,
)

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

ALL_13_CHARACTERS: list[str] = [
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
]

VALID_MODES: list[str] = [
    PowerDynamicMode.DOMINANT,
    PowerDynamicMode.SUBMISSIVE,
    PowerDynamicMode.SWITCH,
]


@pytest.fixture()
def dominant_engine() -> PowerDynamicEngine:
    """Engine in dominant mode at mid intensity."""
    return PowerDynamicEngine("Dae (Neciridae)", mode=PowerDynamicMode.DOMINANT, intensity=0.5)


@pytest.fixture()
def submissive_engine() -> PowerDynamicEngine:
    """Engine in submissive mode at mid intensity."""
    return PowerDynamicEngine("Luna (Tsukimi)", mode=PowerDynamicMode.SUBMISSIVE, intensity=0.5)


@pytest.fixture()
def switch_engine() -> PowerDynamicEngine:
    """Engine in switch mode for Genki."""
    return PowerDynamicEngine("Genki (Kitsune)", mode=PowerDynamicMode.SWITCH, intensity=0.5)


@pytest.fixture()
def off_engine() -> PowerDynamicEngine:
    """Engine with mode off (default)."""
    return PowerDynamicEngine("Ayane (Yuki)")


# ---------------------------------------------------------------------------
# 1. "off" mode returns empty string
# ---------------------------------------------------------------------------


def test_off_mode_empty_prompt(off_engine: PowerDynamicEngine) -> None:
    """get_prompt_modifier() must return '' when mode is 'off'."""
    result = off_engine.get_prompt_modifier()
    assert result == "", f"Expected empty string for off mode, got: {result!r}"


# ---------------------------------------------------------------------------
# 2. Dominant prompt contains marker
# ---------------------------------------------------------------------------


def test_dominant_prompt_content(dominant_engine: PowerDynamicEngine) -> None:
    """Dominant modifier must contain the 'CHARACTER LEADS' section header."""
    modifier = dominant_engine.get_prompt_modifier()
    assert "CHARACTER LEADS" in modifier, (
        f"Dominant prompt missing 'CHARACTER LEADS': {modifier!r}"
    )


# ---------------------------------------------------------------------------
# 3. Submissive prompt contains marker
# ---------------------------------------------------------------------------


def test_submissive_prompt_content(submissive_engine: PowerDynamicEngine) -> None:
    """Submissive modifier must contain the 'USER LEADS' section header."""
    modifier = submissive_engine.get_prompt_modifier()
    assert "USER LEADS" in modifier, (
        f"Submissive prompt missing 'USER LEADS': {modifier!r}"
    )


# ---------------------------------------------------------------------------
# 4. Switch prompt contains marker
# ---------------------------------------------------------------------------


def test_switch_prompt_content(switch_engine: PowerDynamicEngine) -> None:
    """Switch modifier must contain the 'SWITCHING' section header."""
    modifier = switch_engine.get_prompt_modifier()
    assert "SWITCHING" in modifier, (
        f"Switch prompt missing 'SWITCHING': {modifier!r}"
    )


# ---------------------------------------------------------------------------
# 5. Low intensity → "subtle" in prompt
# ---------------------------------------------------------------------------


def test_intensity_low() -> None:
    """Intensity < 0.3 must produce 'subtle hints of control/deference' in the prompt."""
    engine = PowerDynamicEngine("Dae (Neciridae)", mode=PowerDynamicMode.DOMINANT, intensity=0.1)
    modifier = engine.get_prompt_modifier()
    assert "subtle" in modifier, (
        f"Expected 'subtle' in low-intensity dominant prompt, got: {modifier!r}"
    )


# ---------------------------------------------------------------------------
# 6. High intensity → "explicit" in prompt
# ---------------------------------------------------------------------------


def test_intensity_high() -> None:
    """Intensity > 0.7 must produce 'explicit dominance/submission' in the prompt."""
    engine = PowerDynamicEngine("Luna (Tsukimi)", mode=PowerDynamicMode.SUBMISSIVE, intensity=0.9)
    modifier = engine.get_prompt_modifier()
    assert "explicit" in modifier, (
        f"Expected 'explicit' in high-intensity submissive prompt, got: {modifier!r}"
    )


# ---------------------------------------------------------------------------
# 7. Bond gate: below threshold → unavailable
# ---------------------------------------------------------------------------


def test_bond_gate_below(dominant_engine: PowerDynamicEngine) -> None:
    """is_available() must return False when bond_level is 49 (below gate)."""
    assert dominant_engine.is_available(49) is False


# ---------------------------------------------------------------------------
# 8. Bond gate: at threshold → available
# ---------------------------------------------------------------------------


def test_bond_gate_at(dominant_engine: PowerDynamicEngine) -> None:
    """is_available() must return True when bond_level is exactly 50."""
    assert dominant_engine.is_available(50) is True


# ---------------------------------------------------------------------------
# 9. Switch pulse fires after enough messages
# ---------------------------------------------------------------------------


def test_switch_pulse_fires(switch_engine: PowerDynamicEngine) -> None:
    """switch_pulse() must return a non-None string after _next_threshold calls."""
    # Force the threshold to 3 for deterministic behaviour.
    switch_engine._next_threshold = 3
    switch_engine._message_count = 0

    # First two calls should not fire.
    assert switch_engine.switch_pulse(0) is None
    assert switch_engine.switch_pulse(1) is None
    # Third call hits threshold — must return a suggestion.
    result = switch_engine.switch_pulse(2)
    assert result is not None
    assert len(result) > 10, f"Switch suggestion too short: {result!r}"


# ---------------------------------------------------------------------------
# 10. Switch pulse returns None on early messages
# ---------------------------------------------------------------------------


def test_switch_pulse_none_early(switch_engine: PowerDynamicEngine) -> None:
    """switch_pulse() must return None for the first call (counter = 1 < threshold)."""
    switch_engine._next_threshold = 5
    switch_engine._message_count = 0
    result = switch_engine.switch_pulse(0)
    assert result is None, f"Expected None on first message, got: {result!r}"


# ---------------------------------------------------------------------------
# 11. All 13 characters are mapped
# ---------------------------------------------------------------------------


def test_all_13_characters_mapped() -> None:
    """Every character in the registry must appear in CHARACTER_NATURAL_LEANINGS."""
    for char in ALL_13_CHARACTERS:
        assert char in CHARACTER_NATURAL_LEANINGS, (
            f"Character {char!r} missing from CHARACTER_NATURAL_LEANINGS"
        )
        leaning = CHARACTER_NATURAL_LEANINGS[char]
        assert leaning in VALID_MODES, (
            f"Character {char!r} has invalid leaning {leaning!r}"
        )


# ---------------------------------------------------------------------------
# 12. Dae's natural leaning is dominant
# ---------------------------------------------------------------------------


def test_natural_leaning_dae() -> None:
    """Dae (Neciridae) must have 'dominant' as her natural leaning."""
    leaning = PowerDynamicEngine.natural_leaning("Dae (Neciridae)")
    assert leaning == "dominant", f"Expected 'dominant' for Dae, got {leaning!r}"


# ---------------------------------------------------------------------------
# Bonus: switch_pulse returns None for non-switch modes
# ---------------------------------------------------------------------------


def test_switch_pulse_off_mode_returns_none(off_engine: PowerDynamicEngine) -> None:
    """switch_pulse() must return None when mode is 'off' (not a switch mode)."""
    # Drive message count high enough that it would fire if mode were switch.
    off_engine._next_threshold = 1
    result = off_engine.switch_pulse(0)
    assert result is None


def test_switch_pulse_dominant_mode_returns_none(dominant_engine: PowerDynamicEngine) -> None:
    """switch_pulse() must return None when mode is 'dominant'."""
    dominant_engine._next_threshold = 1
    result = dominant_engine.switch_pulse(0)
    assert result is None


# ---------------------------------------------------------------------------
# Bonus: intensity clamping
# ---------------------------------------------------------------------------


def test_intensity_clamp_above_one() -> None:
    """Intensity values > 1.0 must be clamped to 1.0."""
    engine = PowerDynamicEngine("Rin (Akane)", mode=PowerDynamicMode.DOMINANT, intensity=5.0)
    assert engine.intensity == pytest.approx(1.0)


def test_intensity_clamp_below_zero() -> None:
    """Intensity values < 0.0 must be clamped to 0.0."""
    engine = PowerDynamicEngine("Rin (Akane)", mode=PowerDynamicMode.SUBMISSIVE, intensity=-2.0)
    assert engine.intensity == pytest.approx(0.0)


# ---------------------------------------------------------------------------
# Bonus: set_intensity clamps at runtime
# ---------------------------------------------------------------------------


def test_set_intensity_runtime_clamp(dominant_engine: PowerDynamicEngine) -> None:
    """set_intensity() must clamp out-of-range values at runtime."""
    dominant_engine.set_intensity(99.0)
    assert dominant_engine.intensity == pytest.approx(1.0)

    dominant_engine.set_intensity(-5.0)
    assert dominant_engine.intensity == pytest.approx(0.0)


# ---------------------------------------------------------------------------
# Bonus: set_mode resets switch counter
# ---------------------------------------------------------------------------


def test_set_mode_resets_counter(switch_engine: PowerDynamicEngine) -> None:
    """set_mode() must reset _message_count to 0."""
    switch_engine._message_count = 99
    switch_engine.set_mode(PowerDynamicMode.DOMINANT)
    assert switch_engine._message_count == 0
    assert switch_engine.mode == "dominant"


# ---------------------------------------------------------------------------
# Bonus: natural_leaning fallback for unknown character
# ---------------------------------------------------------------------------


def test_natural_leaning_unknown_fallback() -> None:
    """natural_leaning() must return 'switch' for unrecognised character names."""
    result = PowerDynamicEngine.natural_leaning("Nobody McFakename")
    assert result == "switch", f"Expected 'switch' fallback, got {result!r}"


# ---------------------------------------------------------------------------
# Bonus: intensity description helper
# ---------------------------------------------------------------------------


def test_intensity_description_mid() -> None:
    """Intensity in [0.3, 0.7] must map to 'clear authority/yielding'."""
    assert _intensity_description(0.5) == "clear authority/yielding"


def test_intensity_description_low() -> None:
    """Intensity < 0.3 must map to 'subtle hints of control/deference'."""
    assert _intensity_description(0.0) == "subtle hints of control/deference"
    assert _intensity_description(0.29) == "subtle hints of control/deference"


def test_intensity_description_high() -> None:
    """Intensity > 0.7 must map to 'explicit dominance/submission'."""
    assert _intensity_description(0.71) == "explicit dominance/submission"
    assert _intensity_description(1.0) == "explicit dominance/submission"


# ---------------------------------------------------------------------------
# Bonus: POWER_DYNAMIC_PROMPTS has all three non-off modes
# ---------------------------------------------------------------------------


def test_power_dynamic_prompts_keys() -> None:
    """POWER_DYNAMIC_PROMPTS must define entries for all three active modes."""
    for mode in VALID_MODES:
        assert mode in POWER_DYNAMIC_PROMPTS, (
            f"POWER_DYNAMIC_PROMPTS missing entry for mode {mode!r}"
        )
        assert len(POWER_DYNAMIC_PROMPTS[mode].strip()) > 20


# ---------------------------------------------------------------------------
# Bonus: bond gate constant value
# ---------------------------------------------------------------------------


def test_bond_gate_constant() -> None:
    """BOND_GATE must be 50."""
    assert BOND_GATE == 50


# ---------------------------------------------------------------------------
# Bonus: switch pulse alternates dominant/submissive suggestions
# ---------------------------------------------------------------------------


def test_switch_pulse_alternates_direction() -> None:
    """Successive switch pulses must alternate between dominant and submissive cues."""
    engine = PowerDynamicEngine("Genki (Kitsune)", mode=PowerDynamicMode.SWITCH)
    engine._next_threshold = 1
    engine._message_count = 0

    first = engine.switch_pulse(0)
    assert first is not None
    # Reset for second fire.
    engine._next_threshold = 1
    engine._message_count = 0
    second = engine.switch_pulse(0)
    assert second is not None

    # The two suggestions must differ (different direction pools).
    assert first != second, (
        "Two consecutive switch pulses returned identical text — direction did not alternate"
    )
