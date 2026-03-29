"""Tests for backend.content.intimate_scenarios — F8 NSFW Scenario Templates.

Covers bond gating, character filtering, ID lookup, prompt building,
and structural invariants across the full scenario catalog.

No database access required — all data is module-level constants.
"""

from __future__ import annotations

import pytest

from backend.content.intimate_scenarios import (
    CHARACTER_SCENARIOS,
    UNIVERSAL_SCENARIOS,
    IntimateScenario,
    build_scenario_prompt,
    get_available_scenarios,
    get_scenario_by_id,
)


# ---------------------------------------------------------------------------
# 1. Catalog size invariants
# ---------------------------------------------------------------------------


def test_universal_count() -> None:
    """Six universal scenarios must exist in UNIVERSAL_SCENARIOS."""
    assert len(UNIVERSAL_SCENARIOS) == 6


def test_character_specific_count() -> None:
    """Thirteen character-specific scenarios must exist in CHARACTER_SCENARIOS."""
    assert len(CHARACTER_SCENARIOS) == 13


# ---------------------------------------------------------------------------
# 2. Bond gating
# ---------------------------------------------------------------------------


def test_bond_gate_low() -> None:
    """Bond level 20 returns only scenarios with bond_requirement <= 20."""
    results = get_available_scenarios(bond_level=20)
    for s in results:
        assert s.bond_requirement <= 20, (
            f"Scenario '{s.id}' has bond_requirement={s.bond_requirement} "
            "but was returned for bond_level=20"
        )


def test_bond_gate_low_no_character() -> None:
    """Bond 20 with no char_name returns zero scenarios (min universal req is 30)."""
    results = get_available_scenarios(bond_level=20)
    assert results == []


def test_bond_gate_threshold_30() -> None:
    """Bond level 30 unlocks exactly the two universal scenarios requiring 30."""
    results = get_available_scenarios(bond_level=30)
    ids = {s.id for s in results}
    assert "late_night_study" in ids
    assert "power_outage" in ids
    # bond_requirement=40 scenarios must NOT appear
    assert "rainy_night_in" not in ids
    assert "snowed_in" not in ids


def test_bond_gate_high() -> None:
    """Bond level 60 returns more scenarios than bond level 30."""
    low = get_available_scenarios(bond_level=30)
    high = get_available_scenarios(bond_level=60)
    assert len(high) > len(low)


def test_bond_gate_high_all_universal() -> None:
    """Bond level 100 returns all 6 universal scenarios."""
    results = get_available_scenarios(bond_level=100)
    assert len(results) == 6


# ---------------------------------------------------------------------------
# 3. Character-specific filtering
# ---------------------------------------------------------------------------


def test_character_specific_included() -> None:
    """Dae's 'Draw Me' scenario appears when querying for Dae at sufficient bond."""
    results = get_available_scenarios(bond_level=60, char_name="Dae (Neciridae)")
    ids = {s.id for s in results}
    assert "draw_me" in ids


def test_character_specific_excluded_wrong_char() -> None:
    """Dae's 'Draw Me' scenario does NOT appear when querying for Luna."""
    results = get_available_scenarios(bond_level=60, char_name="Luna (Tsukimi)")
    ids = {s.id for s in results}
    assert "draw_me" not in ids


def test_character_specific_excluded_no_char() -> None:
    """Character-specific scenarios are excluded when char_name is empty."""
    results = get_available_scenarios(bond_level=100, char_name="")
    for s in results:
        assert s.character_specific is None, (
            f"Scenario '{s.id}' is character-specific but appeared with no char_name"
        )


def test_character_specific_gated_by_bond() -> None:
    """Dae's 'Draw Me' does NOT appear if bond is below its requirement (50)."""
    results = get_available_scenarios(bond_level=49, char_name="Dae (Neciridae)")
    ids = {s.id for s in results}
    assert "draw_me" not in ids


def test_at_most_one_character_scenario_per_query() -> None:
    """Only the matching character's scenario is appended, not all 13."""
    results = get_available_scenarios(bond_level=100, char_name="Luna (Tsukimi)")
    char_specific = [s for s in results if s.character_specific is not None]
    assert len(char_specific) == 1
    assert char_specific[0].id == "stargazing_blanket"


# ---------------------------------------------------------------------------
# 4. ID lookup
# ---------------------------------------------------------------------------


def test_get_by_id_universal() -> None:
    """get_scenario_by_id returns the correct scenario for 'rainy_night_in'."""
    s = get_scenario_by_id("rainy_night_in")
    assert s is not None
    assert s.title == "Rainy Night In"


def test_get_by_id_character_specific() -> None:
    """get_scenario_by_id returns Dae's scenario by its ID."""
    s = get_scenario_by_id("draw_me")
    assert s is not None
    assert s.character_specific == "Dae (Neciridae)"


def test_get_by_id_missing() -> None:
    """get_scenario_by_id returns None for an unknown ID."""
    assert get_scenario_by_id("does_not_exist_xyz") is None


def test_get_by_id_empty_string() -> None:
    """get_scenario_by_id returns None for an empty string."""
    assert get_scenario_by_id("") is None


# ---------------------------------------------------------------------------
# 5. Prompt building
# ---------------------------------------------------------------------------


def test_build_prompt_content() -> None:
    """build_scenario_prompt output contains the scenario's setting text."""
    s = get_scenario_by_id("rainy_night_in")
    assert s is not None
    prompt = build_scenario_prompt(s)
    assert "cozy apartment" in prompt


def test_build_prompt_contains_title() -> None:
    """build_scenario_prompt output contains the scenario title."""
    s = get_scenario_by_id("rainy_night_in")
    assert s is not None
    prompt = build_scenario_prompt(s)
    assert "Rainy Night In" in prompt


def test_build_prompt_character_note_present() -> None:
    """Character-specific tailoring note is added when char_name matches."""
    s = get_scenario_by_id("draw_me")
    assert s is not None
    prompt = build_scenario_prompt(s, char_name="Dae (Neciridae)")
    assert "Dae (Neciridae)" in prompt


def test_build_prompt_character_note_absent_wrong_char() -> None:
    """No tailoring note is added when char_name does not match the scenario."""
    s = get_scenario_by_id("draw_me")
    assert s is not None
    prompt = build_scenario_prompt(s, char_name="Luna (Tsukimi)")
    # The note mentions the character name; it must not appear for a mismatch.
    assert "written specifically for Luna" not in prompt


def test_build_prompt_universal_no_char_name() -> None:
    """build_scenario_prompt works without a char_name for universal scenarios."""
    s = get_scenario_by_id("power_outage")
    assert s is not None
    prompt = build_scenario_prompt(s)
    assert "darkness" in prompt.lower() or "candle" in prompt.lower()


# ---------------------------------------------------------------------------
# 6. Catalog structural invariants
# ---------------------------------------------------------------------------


def test_all_scenarios_have_prompts() -> None:
    """Every scenario (universal + character-specific) has a non-empty scene_context_prompt."""
    all_scenarios = list(UNIVERSAL_SCENARIOS) + list(CHARACTER_SCENARIOS.values())
    for s in all_scenarios:
        assert s.scene_context_prompt.strip(), (
            f"Scenario '{s.id}' has an empty scene_context_prompt"
        )


def test_all_have_required_fields() -> None:
    """Every scenario has non-empty title, emoji, setting, and mood fields."""
    all_scenarios = list(UNIVERSAL_SCENARIOS) + list(CHARACTER_SCENARIOS.values())
    for s in all_scenarios:
        assert s.title.strip(), f"'{s.id}' missing title"
        assert s.emoji.strip(), f"'{s.id}' missing emoji"
        assert s.setting.strip(), f"'{s.id}' missing setting"
        assert s.mood.strip(), f"'{s.id}' missing mood"


def test_scenario_ids_unique() -> None:
    """All scenario IDs across universal and character-specific are globally unique."""
    all_scenarios = list(UNIVERSAL_SCENARIOS) + list(CHARACTER_SCENARIOS.values())
    ids = [s.id for s in all_scenarios]
    assert len(ids) == len(set(ids)), (
        "Duplicate scenario IDs found: "
        + str([i for i in ids if ids.count(i) > 1])
    )


def test_universal_scenarios_have_no_character_specific() -> None:
    """Every entry in UNIVERSAL_SCENARIOS has character_specific set to None."""
    for s in UNIVERSAL_SCENARIOS:
        assert s.character_specific is None, (
            f"Universal scenario '{s.id}' has unexpected character_specific={s.character_specific!r}"
        )


def test_character_scenarios_all_have_character_specific() -> None:
    """Every entry in CHARACTER_SCENARIOS has a non-empty character_specific field."""
    for key, s in CHARACTER_SCENARIOS.items():
        assert s.character_specific is not None, (
            f"CHARACTER_SCENARIOS['{key}'] has character_specific=None"
        )
        assert s.character_specific.strip(), (
            f"CHARACTER_SCENARIOS['{key}'] has empty character_specific"
        )


def test_character_scenarios_key_matches_field() -> None:
    """The dict key in CHARACTER_SCENARIOS matches the character_specific field."""
    for key, s in CHARACTER_SCENARIOS.items():
        assert s.character_specific == key, (
            f"Key '{key}' does not match character_specific='{s.character_specific}'"
        )


def test_bond_requirements_in_valid_range() -> None:
    """All bond_requirement values are in the valid 0–100 range."""
    all_scenarios = list(UNIVERSAL_SCENARIOS) + list(CHARACTER_SCENARIOS.values())
    for s in all_scenarios:
        assert 0 <= s.bond_requirement <= 100, (
            f"Scenario '{s.id}' has out-of-range bond_requirement={s.bond_requirement}"
        )


def test_results_sorted_by_bond_requirement() -> None:
    """get_available_scenarios returns scenarios sorted by bond_requirement ascending."""
    results = get_available_scenarios(bond_level=100, char_name="Luna (Tsukimi)")
    reqs = [s.bond_requirement for s in results]
    assert reqs == sorted(reqs), "Results are not sorted by bond_requirement"
