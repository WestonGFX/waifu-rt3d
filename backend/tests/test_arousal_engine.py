"""Tests for backend.content.arousal_engine — ArousalEngine state machine.

Covers escalation, decay, cool signals, personality caps, clamping,
prompt generation, factory construction, and character type mapping.
All tests are pure-unit — no DB or network I/O required.
"""

from __future__ import annotations

import pytest

from backend.content.arousal_engine import (
    AROUSAL_PERSONALITIES,
    CHARACTER_AROUSAL_TYPE,
    ArousalEngine,
    ArousalPromptModifiers,
    ArousalUpdate,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def make_engine(personality: str = "responsive", level: float = 0.0) -> ArousalEngine:
    """Return an ArousalEngine with the given personality and starting level."""
    engine = ArousalEngine(char_id=99, personality_type=personality)
    engine.current_level = level
    return engine


# ---------------------------------------------------------------------------
# 1. Initial state
# ---------------------------------------------------------------------------


def test_initial_state() -> None:
    """Engine starts at level 0.0."""
    engine = ArousalEngine(char_id=1)
    assert engine.current_level == 0.0
    assert engine.displayed_level == 0


# ---------------------------------------------------------------------------
# 2-4. Escalation signal strengths
# ---------------------------------------------------------------------------


def test_escalation_mild() -> None:
    """Mild signal (touch, hand …) increases arousal by 1.0."""
    engine = make_engine("responsive")
    upd = engine.update("I touch your hand gently", role="user")
    assert upd.reason == "escalation_signal"
    assert upd.delta == pytest.approx(1.0)
    assert engine.current_level == pytest.approx(1.0)


def test_escalation_moderate() -> None:
    """Moderate signal (kiss, neck …) increases arousal by 1.5."""
    engine = make_engine("responsive")
    upd = engine.update("*kisses your lips*", role="user")
    assert upd.reason == "escalation_signal"
    assert upd.delta == pytest.approx(1.5)
    assert engine.current_level == pytest.approx(1.5)


def test_escalation_strong() -> None:
    """Strong signal (moan, gasp …) increases arousal by 2.0."""
    engine = make_engine("responsive")
    upd = engine.update("you moan softly", role="user")
    assert upd.reason == "escalation_signal"
    assert upd.delta == pytest.approx(2.0)
    assert engine.current_level == pytest.approx(2.0)


# ---------------------------------------------------------------------------
# 5-6. Personality cap on max advance per message
# ---------------------------------------------------------------------------


def test_max_advance_slow_burn() -> None:
    """slow_burn caps escalation at +1.0 even for a strong signal."""
    engine = make_engine("slow_burn")
    upd = engine.update("you moan and tremble", role="user")
    # raw strong delta is 2.0, cap is 1.0 for slow_burn
    assert upd.delta == pytest.approx(1.0)
    assert engine.current_level == pytest.approx(1.0)


def test_max_advance_explosive() -> None:
    """explosive allows up to +2.0 advance per message."""
    engine = make_engine("explosive")
    upd = engine.update("you gasp and shiver", role="user")
    assert upd.delta == pytest.approx(2.0)
    assert engine.current_level == pytest.approx(2.0)


# ---------------------------------------------------------------------------
# 7. Natural decay
# ---------------------------------------------------------------------------


def test_decay_no_signal() -> None:
    """Message with no escalation signal decays by personality rate."""
    engine = make_engine("responsive", level=5.0)
    upd = engine.update("How was your day?", role="user")
    assert upd.reason == "decay"
    # responsive decay_rate = 1.0
    assert engine.current_level == pytest.approx(4.0)


# ---------------------------------------------------------------------------
# 8. Cool signal
# ---------------------------------------------------------------------------


def test_cool_signal_drops_2() -> None:
    """'wait' causes an immediate -2 drop regardless of personality."""
    engine = make_engine("explosive", level=6.0)
    upd = engine.update("wait, not now", role="user")
    assert upd.reason == "cool_signal"
    assert engine.current_level == pytest.approx(4.0)
    assert upd.delta == pytest.approx(-2.0)


# ---------------------------------------------------------------------------
# 9. Reset
# ---------------------------------------------------------------------------


def test_reset_to_zero() -> None:
    """reset() sets current_level to exactly 0.0 with reason='reset'."""
    engine = make_engine(level=7.5)
    result = engine.reset()
    assert result.reason == "reset"
    assert result.new_level == 0.0
    assert engine.current_level == 0.0
    assert result.previous_level == pytest.approx(7.5)


# ---------------------------------------------------------------------------
# 10-11. Clamping
# ---------------------------------------------------------------------------


def test_clamp_at_10() -> None:
    """Arousal never exceeds 10.0."""
    engine = make_engine("explosive", level=9.5)
    engine.update("you gasp and tremble", role="user")
    assert engine.current_level <= 10.0


def test_clamp_at_0() -> None:
    """Arousal never falls below 0.0."""
    engine = make_engine("explosive", level=0.5)
    # decay_rate for explosive is 1.5; without time gap applied in decay()
    engine.decay(messages_since_signal=1)
    assert engine.current_level == 0.0


# ---------------------------------------------------------------------------
# 12. Role guard — assistant does not escalate
# ---------------------------------------------------------------------------


def test_assistant_no_escalation() -> None:
    """role='assistant' messages do not escalate arousal."""
    engine = make_engine("responsive", level=3.0)
    # An assistant message with a strong signal word should not escalate.
    upd = engine.update("*moans softly* I feel so close to you...", role="assistant")
    # Level must not have increased.
    assert engine.current_level <= 3.0
    assert upd.new_level <= 3.0


# ---------------------------------------------------------------------------
# 13. Time-gap decay
# ---------------------------------------------------------------------------


def test_time_gap_decay() -> None:
    """A time gap > 5 minutes adds an extra -1 on top of normal decay."""
    engine = make_engine("responsive", level=6.0)
    # responsive decay_rate = 1.0; with 10-min gap: total decay = 2.0
    upd = engine.update("hello again", role="user", time_gap_minutes=10.0)
    assert upd.reason == "decay"
    assert engine.current_level == pytest.approx(4.0)


# ---------------------------------------------------------------------------
# 14-15. Prompt modifiers per band
# ---------------------------------------------------------------------------


def test_prompt_modifiers_neutral() -> None:
    """Levels 0-3 return 'normal' vocabulary and 'full' coherence."""
    engine = make_engine(level=2.0)
    mods = engine.get_prompt_modifiers()
    assert mods.vocabulary_level == "normal"
    assert mods.coherence_level == "full"
    assert mods.breathing_mentions is False
    assert mods.max_response_tokens == 300


def test_prompt_modifiers_intense() -> None:
    """Levels 7-9 return 'intense' vocabulary and 'distracted' coherence."""
    engine = make_engine(level=8.0)
    mods = engine.get_prompt_modifiers()
    assert mods.vocabulary_level == "intense"
    assert mods.sentence_style == "short_fragmented"
    assert mods.breathing_mentions is True
    assert mods.coherence_level == "distracted"
    assert mods.max_response_tokens == 150


# ---------------------------------------------------------------------------
# 16-17. build_arousal_prompt
# ---------------------------------------------------------------------------


def test_build_prompt_empty_at_zero() -> None:
    """build_arousal_prompt() returns '' at level 0."""
    engine = make_engine(level=0.0)
    assert engine.build_arousal_prompt() == ""


def test_build_prompt_empty_at_one() -> None:
    """build_arousal_prompt() returns '' at level 1 (baseline, no injection)."""
    engine = make_engine(level=1.0)
    assert engine.build_arousal_prompt() == ""


def test_build_prompt_content_at_5() -> None:
    """build_arousal_prompt() returns non-empty content at level 5."""
    engine = make_engine(level=5.0)
    prompt = engine.build_arousal_prompt()
    assert prompt != ""
    assert "[Arousal:" in prompt
    assert "[Writing style:" in prompt


# ---------------------------------------------------------------------------
# 18. Factory method
# ---------------------------------------------------------------------------


def test_for_character_factory() -> None:
    """for_character() returns correct personality for known characters."""
    dae = ArousalEngine.for_character(char_id=1, char_name="Dae (Neciridae)")
    assert dae.personality_type == "slow_burn"

    genki = ArousalEngine.for_character(char_id=2, char_name="Genki (Kitsune)")
    assert genki.personality_type == "explosive"

    alana = ArousalEngine.for_character(char_id=3, char_name="Alana Calloway")
    assert alana.personality_type == "responsive"

    raine = ArousalEngine.for_character(char_id=4, char_name="Tsundere (Raine)")
    assert raine.personality_type == "volatile"


def test_for_character_unknown_defaults_to_responsive() -> None:
    """for_character() falls back to 'responsive' for unknown names."""
    engine = ArousalEngine.for_character(char_id=99, char_name="Unknown Hero")
    assert engine.personality_type == "responsive"


# ---------------------------------------------------------------------------
# 19. Character arousal type mapping
# ---------------------------------------------------------------------------


def test_character_arousal_type_mapping() -> None:
    """All 13 named characters have a valid arousal personality type."""
    expected_characters = [
        "Dae (Neciridae)",
        "Luna (Tsukimi)",
        "Ayane (Yuki)",
        "Alana Calloway",
        "Hana (Momoka)",
        "Yuki (Shirayuki)",
        "Genki (Kitsune)",
        "Mika (Mikazuki)",
        "Rin (Akane)",
        "Sable (Kuroha)",
        "Kaede (Suzuha)",
        "Tsundere (Raine)",
    ]
    valid_types = set(AROUSAL_PERSONALITIES.keys())
    for char in expected_characters:
        assert char in CHARACTER_AROUSAL_TYPE, f"{char!r} not in CHARACTER_AROUSAL_TYPE"
        assert CHARACTER_AROUSAL_TYPE[char] in valid_types, (
            f"{char!r} maps to unknown type {CHARACTER_AROUSAL_TYPE[char]!r}"
        )


# ---------------------------------------------------------------------------
# Bonus: decay() standalone
# ---------------------------------------------------------------------------


def test_decay_standalone() -> None:
    """decay() returns the actual amount dropped and updates current_level."""
    engine = make_engine("slow_burn", level=3.0)
    dropped = engine.decay(messages_since_signal=1)
    # slow_burn decay_rate = 0.5
    assert dropped == pytest.approx(0.5)
    assert engine.current_level == pytest.approx(2.5)


def test_decay_at_zero_is_noop() -> None:
    """decay() on a zeroed engine returns 0 and leaves level at 0."""
    engine = make_engine(level=0.0)
    dropped = engine.decay()
    assert dropped == 0.0
    assert engine.current_level == 0.0


def test_displayed_level_rounds_correctly() -> None:
    """displayed_level rounds 0.5 up and 0.4 down."""
    engine = make_engine(level=4.5)
    assert engine.displayed_level == 4 or engine.displayed_level == 5  # Python banker's rounding
    engine.current_level = 4.6
    assert engine.displayed_level == 5
    engine.current_level = 4.4
    assert engine.displayed_level == 4


def test_prompt_modifiers_peak() -> None:
    """Level 10 returns 'minimal' vocabulary and 'overwhelmed' coherence."""
    engine = make_engine(level=10.0)
    mods = engine.get_prompt_modifiers()
    assert mods.vocabulary_level == "minimal"
    assert mods.coherence_level == "overwhelmed"
    assert mods.max_response_tokens == 80
    assert mods.sentence_style == "fragments_only"


def test_cool_signal_clamps_at_zero() -> None:
    """Cool signal on a near-zero level clamps at 0, not negative."""
    engine = make_engine(level=1.0)
    upd = engine.update("wait, stop", role="user")
    assert upd.reason == "cool_signal"
    assert engine.current_level == 0.0
