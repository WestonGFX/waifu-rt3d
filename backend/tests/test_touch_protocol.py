"""Tests for backend.content.touch_protocol — F25 Touch Language Protocol.

Covers region detection, intensity detection, intimacy weights, prompt
building, character reaction styles, multi-touch parsing, and structural
completeness of the configuration dicts.

All tests are pure-unit — no DB or network I/O required.
"""

from __future__ import annotations

import pytest

from backend.content.touch_protocol import (
    CHARACTER_TOUCH_REACTIONS,
    TOUCH_REGIONS,
    TouchEvent,
    TouchParser,
    build_touch_reaction_prompt,
    get_touch_sensitivity,
)


# ---------------------------------------------------------------------------
# Fixture
# ---------------------------------------------------------------------------


@pytest.fixture
def parser() -> TouchParser:
    """Return a shared TouchParser instance for all tests."""
    return TouchParser()


# ---------------------------------------------------------------------------
# 1. Region detection
# ---------------------------------------------------------------------------


def test_parse_hair_touch(parser: TouchParser) -> None:
    """'*strokes her hair*' → region == 'hair'."""
    evt = parser.parse("*strokes her hair*")
    assert evt is not None
    assert evt.region == "hair"


def test_parse_neck_kiss(parser: TouchParser) -> None:
    """'*kisses her neck*' → region == 'neck'."""
    evt = parser.parse("*kisses her neck*")
    assert evt is not None
    assert evt.region == "neck"


def test_parse_hand_hold(parser: TouchParser) -> None:
    """'*holds her hand*' → region == 'hand'."""
    evt = parser.parse("*holds her hand*")
    assert evt is not None
    assert evt.region == "hand"


def test_parse_no_touch(parser: TouchParser) -> None:
    """Plain conversational message returns None."""
    assert parser.parse("How are you?") is None


def test_parse_face_caress(parser: TouchParser) -> None:
    """Cheek mention maps to face region."""
    evt = parser.parse("*gently caresses her cheek*")
    assert evt is not None
    assert evt.region == "face"


def test_parse_lips_brush(parser: TouchParser) -> None:
    """Lips mention maps to lips region."""
    evt = parser.parse("*brushes her lips with a fingertip*")
    assert evt is not None
    assert evt.region == "lips"


def test_parse_ear_whisper(parser: TouchParser) -> None:
    """Ear mention maps to ear region."""
    evt = parser.parse("*whispers softly in her ear*")
    assert evt is not None
    assert evt.region == "ear"


# ---------------------------------------------------------------------------
# 2. Intensity detection
# ---------------------------------------------------------------------------


def test_intensity_gentle(parser: TouchParser) -> None:
    """'gently' modifier → intensity == 'gentle'."""
    evt = parser.parse("*gently strokes her hair*")
    assert evt is not None
    assert evt.intensity == "gentle"


def test_intensity_firm(parser: TouchParser) -> None:
    """'firmly' modifier → intensity == 'firm'."""
    evt = parser.parse("*firmly presses against her shoulder*")
    assert evt is not None
    assert evt.intensity == "firm"


def test_intensity_intense(parser: TouchParser) -> None:
    """'passionately' modifier → intensity == 'intense'."""
    evt = parser.parse("*passionately kisses her neck*")
    assert evt is not None
    assert evt.intensity == "intense"


def test_intensity_default(parser: TouchParser) -> None:
    """No intensity modifier → defaults to 'gentle'."""
    evt = parser.parse("*holds her hand*")
    assert evt is not None
    assert evt.intensity == "gentle"


# ---------------------------------------------------------------------------
# 3. Intimacy weights
# ---------------------------------------------------------------------------


def test_intimacy_weight_hand(parser: TouchParser) -> None:
    """hand region has intimacy_weight == 0.2."""
    evt = parser.parse("*holds her hand*")
    assert evt is not None
    assert evt.intimacy_weight == pytest.approx(0.2)


def test_intimacy_weight_neck(parser: TouchParser) -> None:
    """neck region has intimacy_weight == 0.7."""
    evt = parser.parse("*kisses her neck*")
    assert evt is not None
    assert evt.intimacy_weight == pytest.approx(0.7)


def test_intimacy_weight_lips(parser: TouchParser) -> None:
    """lips region has intimacy_weight == 0.8."""
    evt = parser.parse("*traces her lips*")
    assert evt is not None
    assert evt.intimacy_weight == pytest.approx(0.8)


def test_parse_returns_highest_weight_region(parser: TouchParser) -> None:
    """parse() returns the highest-weight region when multiple match."""
    # Both 'hair' (0.3) and 'neck' (0.7) match — neck should win.
    evt = parser.parse("*strokes her hair and kisses her neck*")
    assert evt is not None
    assert evt.region == "neck"


# ---------------------------------------------------------------------------
# 4. Prompt builder
# ---------------------------------------------------------------------------


def test_build_reaction_prompt_contains_region(parser: TouchParser) -> None:
    """Prompt always contains the detected region name."""
    evt = parser.parse("*strokes her hair gently*")
    assert evt is not None
    prompt = build_touch_reaction_prompt(evt)
    assert "hair" in prompt.lower()


def test_build_reaction_prompt_no_char(parser: TouchParser) -> None:
    """Prompt builds successfully without a character name."""
    evt = parser.parse("*holds her hand*")
    assert evt is not None
    prompt = build_touch_reaction_prompt(evt)
    assert "hand" in prompt.lower()
    assert "[Touch Detected:" in prompt


def test_character_reaction_style_dae(parser: TouchParser) -> None:
    """Dae (Neciridae) prompt contains 'artistic' or 'visual'."""
    evt = parser.parse("*gently strokes her hair*")
    assert evt is not None
    prompt = build_touch_reaction_prompt(evt, char_name="Dae (Neciridae)")
    lower = prompt.lower()
    assert "artistic" in lower or "visual" in lower


def test_character_reaction_style_luna(parser: TouchParser) -> None:
    """Luna (Tsukimi) prompt references her sensory style."""
    evt = parser.parse("*kisses her neck*")
    assert evt is not None
    prompt = build_touch_reaction_prompt(evt, char_name="Luna (Tsukimi)")
    assert "sensory" in prompt.lower()


def test_character_reaction_style_unknown_char(parser: TouchParser) -> None:
    """Unknown character name does not raise — style line is simply omitted."""
    evt = parser.parse("*holds her hand*")
    assert evt is not None
    prompt = build_touch_reaction_prompt(evt, char_name="Nonexistent Character")
    assert "hand" in prompt.lower()
    # Should NOT contain a 'Style:' line for an unknown character.
    assert "Style:" not in prompt


def test_prompt_high_intimacy_label(parser: TouchParser) -> None:
    """Lips (0.8) → 'strong reaction expected' in prompt."""
    evt = parser.parse("*kisses her lips*")
    assert evt is not None
    prompt = build_touch_reaction_prompt(evt)
    assert "strong reaction expected" in prompt


def test_prompt_low_intimacy_label(parser: TouchParser) -> None:
    """Hand (0.2) → 'subtle reaction expected' in prompt."""
    evt = parser.parse("*holds her hand*")
    assert evt is not None
    prompt = build_touch_reaction_prompt(evt)
    assert "subtle reaction expected" in prompt


# ---------------------------------------------------------------------------
# 5. parse_all — multiple touches
# ---------------------------------------------------------------------------


def test_parse_all_multiple(parser: TouchParser) -> None:
    """Message with two regions returns two events."""
    events = parser.parse_all("*strokes her hair and kisses her neck*")
    assert len(events) == 2
    regions = {e.region for e in events}
    assert "hair" in regions
    assert "neck" in regions


def test_parse_all_sorted_by_weight(parser: TouchParser) -> None:
    """parse_all results are sorted highest intimacy_weight first."""
    events = parser.parse_all("*strokes her hair and kisses her neck*")
    assert len(events) >= 2
    weights = [e.intimacy_weight for e in events]
    assert weights == sorted(weights, reverse=True)


def test_parse_all_no_touch(parser: TouchParser) -> None:
    """parse_all returns empty list when no touch language is present."""
    assert parser.parse_all("How are you today?") == []


# ---------------------------------------------------------------------------
# 6. Sensitivity helper
# ---------------------------------------------------------------------------


def test_sensitivity_hand_is_low() -> None:
    """hand (0.2) → 'low'."""
    assert get_touch_sensitivity("Sable (Kuroha)", "hand") == "low"


def test_sensitivity_neck_is_high() -> None:
    """neck (0.7) → 'high'."""
    assert get_touch_sensitivity("Sable (Kuroha)", "neck") == "high"


def test_sensitivity_face_is_medium() -> None:
    """face (0.5) → 'medium'."""
    assert get_touch_sensitivity("Luna (Tsukimi)", "face") == "medium"


def test_sensitivity_unknown_region() -> None:
    """Unknown region returns 'unknown' without raising."""
    assert get_touch_sensitivity("Genki (Kitsune)", "elbow") == "unknown"


# ---------------------------------------------------------------------------
# 7. Structural completeness
# ---------------------------------------------------------------------------


def test_all_13_characters_have_reactions() -> None:
    """Every one of the 13 named characters has an entry in CHARACTER_TOUCH_REACTIONS."""
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
    missing = expected_characters - set(CHARACTER_TOUCH_REACTIONS.keys())
    assert not missing, f"Missing character reaction entries: {missing}"


def test_all_regions_have_patterns() -> None:
    """Every region in TOUCH_REGIONS has at least one regex pattern."""
    for region, cfg in TOUCH_REGIONS.items():
        assert "patterns" in cfg, f"Region '{region}' missing 'patterns' key"
        assert len(cfg["patterns"]) > 0, f"Region '{region}' has empty patterns list"


def test_all_regions_have_intimacy_weight() -> None:
    """Every region has an intimacy_weight between 0.0 and 1.0."""
    for region, cfg in TOUCH_REGIONS.items():
        weight = cfg["intimacy_weight"]
        assert 0.0 <= weight <= 1.0, (
            f"Region '{region}' intimacy_weight {weight} out of [0, 1] range"
        )


def test_all_regions_have_types() -> None:
    """Every region has at least one touch type example."""
    for region, cfg in TOUCH_REGIONS.items():
        assert "types" in cfg, f"Region '{region}' missing 'types' key"
        assert len(cfg["types"]) > 0, f"Region '{region}' has empty types list"


def test_character_reaction_entries_have_required_keys() -> None:
    """Every CHARACTER_TOUCH_REACTIONS entry has 'style' and 'description' keys."""
    for char_name, reaction in CHARACTER_TOUCH_REACTIONS.items():
        assert "style" in reaction, f"'{char_name}' missing 'style' key"
        assert "description" in reaction, f"'{char_name}' missing 'description' key"
        assert reaction["style"], f"'{char_name}' has empty 'style'"
        assert reaction["description"], f"'{char_name}' has empty 'description'"


# ---------------------------------------------------------------------------
# 8. TouchEvent dataclass
# ---------------------------------------------------------------------------


def test_touch_event_fields() -> None:
    """TouchEvent stores all five expected fields correctly."""
    evt = TouchEvent(
        region="neck",
        touch_type="kiss",
        intensity="gentle",
        intimacy_weight=0.7,
        raw_text="*kisses her neck*",
    )
    assert evt.region == "neck"
    assert evt.touch_type == "kiss"
    assert evt.intensity == "gentle"
    assert evt.intimacy_weight == pytest.approx(0.7)
    assert evt.raw_text == "*kisses her neck*"
