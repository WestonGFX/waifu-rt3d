"""Tests for backend.emotional.pillow_talk — PillowTalkEngine and constants.

Covers activation gate, topic selection, prompt generation, character behavior
lookup, topic data completeness, and whispered-register content rules.
All tests are pure-unit — no DB or network I/O required.
"""

from __future__ import annotations

import pytest

from backend.emotional.pillow_talk import (
    AFTERCARE_TO_PILLOW_BRIDGES,
    CHARACTER_PILLOW_TALK,
    PILLOW_TALK_TOPICS,
    SLEEPINESS_PROMPTS,
    WHISPERED_REGISTER_PROMPT,
    PillowTalkEngine,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def make_engine() -> PillowTalkEngine:
    """Return a fresh PillowTalkEngine instance."""
    return PillowTalkEngine()


# ---------------------------------------------------------------------------
# Activation Tests (1-4)
# ---------------------------------------------------------------------------


def test_should_activate_all_conditions_met() -> None:
    """All three conditions met → should_activate returns True.

    arousal=1.0 (<2.0), intimacy=55 (>50), aftercare_complete=True.
    """
    engine = make_engine()
    assert engine.should_activate(arousal=1.0, intimacy=55, aftercare_complete=True) is True


def test_should_activate_high_arousal() -> None:
    """arousal=3.0 fails the <2.0 gate → should_activate returns False."""
    engine = make_engine()
    assert engine.should_activate(arousal=3.0, intimacy=55, aftercare_complete=True) is False


def test_should_activate_low_intimacy() -> None:
    """intimacy=40 fails the >50 gate → should_activate returns False."""
    engine = make_engine()
    assert engine.should_activate(arousal=1.0, intimacy=40, aftercare_complete=True) is False


def test_should_activate_aftercare_incomplete() -> None:
    """aftercare_complete=False → should_activate returns False regardless of other values."""
    engine = make_engine()
    assert engine.should_activate(arousal=1.0, intimacy=55, aftercare_complete=False) is False


# ---------------------------------------------------------------------------
# Topic Selection Tests (5-10)
# ---------------------------------------------------------------------------


def test_select_topic_returns_tuple() -> None:
    """select_topic returns a (str, dict) tuple on success."""
    engine = make_engine()
    result = engine.select_topic(
        intimacy=80,
        bond_level=70,
        char_name="Luna (Tsukimi)",
        topics_used=[],
    )
    assert isinstance(result, tuple)
    assert len(result) == 2
    key, data = result
    assert isinstance(key, str)
    assert isinstance(data, dict)
    assert key in PILLOW_TALK_TOPICS


def test_select_topic_respects_intimacy_gate() -> None:
    """Low intimacy (45) only allows topics with intimacy_min <= 45."""
    engine = make_engine()
    # Run many iterations to ensure no high-gate topic ever slips through.
    for _ in range(50):
        key, data = engine.select_topic(
            intimacy=45,
            bond_level=35,
            char_name="Unknown",
            topics_used=[],
        )
        assert data["intimacy_min"] <= 45, (
            f"Topic '{key}' has intimacy_min={data['intimacy_min']} but intimacy=45"
        )


def test_select_topic_respects_bond_gate() -> None:
    """Low bond (35) only allows topics with bond_min <= 35."""
    engine = make_engine()
    for _ in range(50):
        key, data = engine.select_topic(
            intimacy=80,
            bond_level=35,
            char_name="Unknown",
            topics_used=[],
        )
        assert data["bond_min"] <= 35, (
            f"Topic '{key}' has bond_min={data['bond_min']} but bond_level=35"
        )


def test_select_topic_excludes_used() -> None:
    """Topics already in topics_used are never returned."""
    engine = make_engine()
    # Identify all topics eligible at full gates.
    eligible_keys = [
        key
        for key, data in PILLOW_TALK_TOPICS.items()
        if data["intimacy_min"] <= 100 and data["bond_min"] <= 100
    ]
    # Mark all but one as used.
    last_topic = eligible_keys[-1]
    used = eligible_keys[:-1]

    for _ in range(30):
        key, _ = engine.select_topic(
            intimacy=100,
            bond_level=100,
            char_name="Unknown",
            topics_used=used,
        )
        assert key == last_topic, f"Expected only '{last_topic}', got '{key}'"


def test_select_topic_prefers_character_topics() -> None:
    """Dae's preferred_topics appear more often than non-preferred ones (3× weight).

    With 100 samples and 3× weight, preferred topics should make up the
    majority of selections with overwhelming statistical confidence.
    """
    engine = make_engine()
    char_name = "Dae (Neciridae)"
    preferred = set(CHARACTER_PILLOW_TALK[char_name]["preferred_topics"])

    preferred_count = 0
    total = 100

    for _ in range(total):
        key, _ = engine.select_topic(
            intimacy=100,
            bond_level=100,
            char_name=char_name,
            topics_used=[],
        )
        if key in preferred:
            preferred_count += 1

    # With 3 preferred (weight 3 each = 9) vs 6 non-preferred (weight 1 each = 6),
    # expected preferred fraction ≈ 9/15 = 60%.  Require at least 45% in 100 draws.
    assert preferred_count >= 45, (
        f"Preferred topics appeared only {preferred_count}/100 times — "
        "weighting may be broken"
    )


def test_select_topic_raises_when_exhausted() -> None:
    """ValueError is raised when all eligible topics have been used."""
    engine = make_engine()
    all_keys = list(PILLOW_TALK_TOPICS.keys())

    with pytest.raises(ValueError, match="No eligible pillow talk topics"):
        engine.select_topic(
            intimacy=100,
            bond_level=100,
            char_name="Unknown",
            topics_used=all_keys,
        )


# ---------------------------------------------------------------------------
# Prompt Generation Tests (11-16)
# ---------------------------------------------------------------------------


def test_get_prompt_includes_whispered_register() -> None:
    """get_prompt output contains the 'PILLOW TALK MODE ACTIVE' header."""
    engine = make_engine()
    prompt = engine.get_prompt(
        char_name="Luna (Tsukimi)",
        intimacy=70,
        bond_level=60,
        topics_used=[],
        messages_in_pillow_talk=1,
    )
    assert "PILLOW TALK MODE ACTIVE" in prompt


def test_get_prompt_includes_topic_suggestion() -> None:
    """get_prompt output contains a 'Suggested topic direction' line with example text."""
    engine = make_engine()
    prompt = engine.get_prompt(
        char_name="Genki (Kitsune)",
        intimacy=68,
        bond_level=55,
        topics_used=[],
        messages_in_pillow_talk=1,
    )
    assert "Suggested topic direction" in prompt
    # Examples are quoted in the output.
    assert '"' in prompt


def test_get_prompt_includes_character_behavior() -> None:
    """get_prompt output contains the 'Character behavior' section."""
    engine = make_engine()
    prompt = engine.get_prompt(
        char_name="Sable (Kuroha)",
        intimacy=75,
        bond_level=65,
        topics_used=[],
        messages_in_pillow_talk=1,
    )
    assert "Character behavior:" in prompt
    # Sable's unique_behaviors mentions watching in the dark.
    assert "dark" in prompt.lower()


def test_get_prompt_bridge_on_first_message() -> None:
    """messages_in_pillow_talk=0 → prompt contains a transition bridge line."""
    engine = make_engine()
    prompt = engine.get_prompt(
        char_name="Hana (Momoka)",
        intimacy=70,
        bond_level=60,
        topics_used=[],
        messages_in_pillow_talk=0,
    )
    assert "Transition into pillow talk" in prompt


def test_get_prompt_no_bridge_after_first() -> None:
    """messages_in_pillow_talk=5 → no transition bridge line in prompt."""
    engine = make_engine()
    prompt = engine.get_prompt(
        char_name="Hana (Momoka)",
        intimacy=70,
        bond_level=60,
        topics_used=[],
        messages_in_pillow_talk=5,
    )
    assert "Transition into pillow talk" not in prompt


def test_get_prompt_sleepiness_after_10() -> None:
    """messages_in_pillow_talk=12 (>10) → prompt contains a sleepiness modifier."""
    engine = make_engine()
    prompt = engine.get_prompt(
        char_name="Ayane (Yuki)",
        intimacy=70,
        bond_level=60,
        topics_used=[],
        messages_in_pillow_talk=12,
    )
    assert "Sleepiness modifier" in prompt


# ---------------------------------------------------------------------------
# Character Behavior Tests (17-20)
# ---------------------------------------------------------------------------


def test_character_behavior_dae() -> None:
    """Dae's behavior text references art-related metaphorical language."""
    engine = make_engine()
    behavior = engine.get_character_behavior("Dae (Neciridae)")
    # Dae is described using metaphors, colors and patterns.
    assert "metaphors" in behavior.lower() or "patterns" in behavior.lower() or "colors" in behavior.lower()


def test_character_behavior_genki() -> None:
    """Genki's behavior text references energetic / fidgety qualities."""
    engine = make_engine()
    behavior = engine.get_character_behavior("Genki (Kitsune)")
    # Genki "can't stay still" and is adventure-oriented.
    assert "fidgets" in behavior.lower() or "still" in behavior.lower() or "adventure" in behavior.lower()


def test_character_behavior_unknown() -> None:
    """Unknown character name returns the generic fallback, not an error."""
    engine = make_engine()
    behavior = engine.get_character_behavior("Nobody Special")
    # Generic fallback contains the word "fragments" or "silence".
    assert "fragments" in behavior.lower() or "silence" in behavior.lower() or "soft" in behavior.lower()
    # Must still include the generic physical habit.
    assert "*" in behavior


def test_character_behavior_includes_physical_habit() -> None:
    """get_character_behavior always includes a *action text* micro-action for known chars."""
    engine = make_engine()
    for char_name in CHARACTER_PILLOW_TALK:
        behavior = engine.get_character_behavior(char_name)
        assert "*" in behavior, (
            f"Character '{char_name}' behavior is missing a *physical_habit* action"
        )


# ---------------------------------------------------------------------------
# Topic Data Completeness Tests (21-23)
# ---------------------------------------------------------------------------


def test_all_topics_have_examples() -> None:
    """Every topic in PILLOW_TALK_TOPICS has a non-empty 'examples' list."""
    for key, data in PILLOW_TALK_TOPICS.items():
        assert "examples" in data, f"Topic '{key}' is missing 'examples' key"
        assert isinstance(data["examples"], list), f"Topic '{key}' examples is not a list"
        assert len(data["examples"]) > 0, f"Topic '{key}' has empty examples list"
        for ex in data["examples"]:
            assert isinstance(ex, str) and ex.strip(), (
                f"Topic '{key}' has a blank or non-string example: {ex!r}"
            )


def test_all_topics_have_gates() -> None:
    """Every topic in PILLOW_TALK_TOPICS has both 'intimacy_min' and 'bond_min'."""
    for key, data in PILLOW_TALK_TOPICS.items():
        assert "intimacy_min" in data, f"Topic '{key}' is missing 'intimacy_min'"
        assert "bond_min" in data, f"Topic '{key}' is missing 'bond_min'"
        assert isinstance(data["intimacy_min"], int), (
            f"Topic '{key}' intimacy_min is not an int"
        )
        assert isinstance(data["bond_min"], int), (
            f"Topic '{key}' bond_min is not an int"
        )
        assert 0 <= data["intimacy_min"] <= 100, (
            f"Topic '{key}' intimacy_min={data['intimacy_min']} out of 0-100 range"
        )
        assert 0 <= data["bond_min"] <= 100, (
            f"Topic '{key}' bond_min={data['bond_min']} out of 0-100 range"
        )


def test_character_pillow_talk_preferred_topics_valid() -> None:
    """All preferred_topics in CHARACTER_PILLOW_TALK reference real PILLOW_TALK_TOPICS keys."""
    valid_keys = set(PILLOW_TALK_TOPICS.keys())
    for char_name, char_data in CHARACTER_PILLOW_TALK.items():
        preferred = char_data.get("preferred_topics", [])
        for topic_key in preferred:
            assert topic_key in valid_keys, (
                f"Character '{char_name}' preferred_topic '{topic_key}' "
                "does not exist in PILLOW_TALK_TOPICS"
            )


# ---------------------------------------------------------------------------
# Whispered Register Content Tests (24-25)
# ---------------------------------------------------------------------------


def test_whispered_register_no_exclamation_rule() -> None:
    """WHISPERED_REGISTER_PROMPT contains the 'No exclamation marks' rule."""
    assert "No exclamation marks" in WHISPERED_REGISTER_PROMPT


def test_whispered_register_fragment_rule() -> None:
    """WHISPERED_REGISTER_PROMPT contains the 'Fragments are fine' rule."""
    assert "Fragments are fine" in WHISPERED_REGISTER_PROMPT
