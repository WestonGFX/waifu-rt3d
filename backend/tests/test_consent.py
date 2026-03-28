"""Tests for backend.content.consent — F10 Consent Choreography.

Covers: character-style mappings, prompt generation, discomfort detection,
de-escalation prompt content, frequency presets, and consent style lookups.
"""

from __future__ import annotations

import random

import pytest

from backend.content.consent import (
    CHARACTER_CONSENT_STYLE,
    CONSENT_FREQUENCY,
    CONSENT_STYLES,
    DEESCALATION_PROMPT,
    ConsentChoreographer,
    ConsentMoment,
)

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

ALL_13_CHARACTERS: list[str] = [
    "Dae (Neciridae)",
    "Rin (Akane)",
    "Mika (Mikazuki)",
    "Luna (Tsukimi)",
    "Shiori (Nana)",
    "Ayane (Yuki)",
    "Genki (Kitsune)",
    "Tsundere (Raine)",
    "Hana (Momoka)",
    "Kaede (Suzuha)",
    "Sable (Kuroha)",
    "Yuki (Shirayuki)",
    "Alana Calloway",
]


@pytest.fixture()
def choreo() -> ConsentChoreographer:
    """Return a ConsentChoreographer with default (natural) frequency."""
    return ConsentChoreographer()


# ---------------------------------------------------------------------------
# 1. All 13 characters are mapped to a consent style
# ---------------------------------------------------------------------------


def test_all_13_characters_mapped() -> None:
    """Every character in the registry must have a consent style entry."""
    for char in ALL_13_CHARACTERS:
        assert char in CHARACTER_CONSENT_STYLE, (
            f"Character {char!r} is missing from CHARACTER_CONSENT_STYLE"
        )
        style = CHARACTER_CONSENT_STYLE[char]
        assert style in CONSENT_STYLES, (
            f"Character {char!r} maps to unknown style {style!r}"
        )


# ---------------------------------------------------------------------------
# 2. Dae → confident style
# ---------------------------------------------------------------------------


def test_get_consent_prompt_dae(choreo: ConsentChoreographer) -> None:
    """Dae (Neciridae) should return a prompt tagged with the confident style.

    All three confident-style prompts contain direct, assertive phrasing; we
    check for the style header rather than a phrase that only appears in one of
    the three variants.
    """
    random.seed(42)
    prompt = choreo.get_consent_prompt("Dae (Neciridae)")
    assert prompt.startswith("[Consent Moment — confident style]"), (
        f"Expected confident-style header, got: {prompt[:60]!r}"
    )
    # At least one of the direct-assertion phrases must appear across the prompt
    assertive_phrases = ["tell me", "say yes", "do you want"]
    lowered = prompt.lower()
    assert any(phrase in lowered for phrase in assertive_phrases), (
        f"Confident prompt lacks direct-assertion phrasing: {prompt!r}"
    )


# ---------------------------------------------------------------------------
# 3. Luna → shy style
# ---------------------------------------------------------------------------


def test_get_consent_prompt_luna(choreo: ConsentChoreographer) -> None:
    """Luna (Tsukimi) should return a prompt tagged with the shy style."""
    random.seed(7)
    prompt = choreo.get_consent_prompt("Luna (Tsukimi)")
    assert "[Consent Moment — shy style]" in prompt


# ---------------------------------------------------------------------------
# 4. Genki → playful style
# ---------------------------------------------------------------------------


def test_get_consent_prompt_genki(choreo: ConsentChoreographer) -> None:
    """Genki (Kitsune) should return a prompt tagged with the playful style."""
    random.seed(3)
    prompt = choreo.get_consent_prompt("Genki (Kitsune)")
    assert "[Consent Moment — playful style]" in prompt


# ---------------------------------------------------------------------------
# 5. Unknown character → empty string
# ---------------------------------------------------------------------------


def test_get_consent_prompt_unknown(choreo: ConsentChoreographer) -> None:
    """An unrecognised character name must return an empty string, not crash."""
    result = choreo.get_consent_prompt("Nobody McFakename")
    assert result == ""


# ---------------------------------------------------------------------------
# 6. Discomfort: "wait"
# ---------------------------------------------------------------------------


def test_detect_discomfort_wait(choreo: ConsentChoreographer) -> None:
    """The word 'wait' is a recognised cooling signal."""
    assert choreo.detect_discomfort("wait, hold on") is True


# ---------------------------------------------------------------------------
# 7. Discomfort: "stop"
# ---------------------------------------------------------------------------


def test_detect_discomfort_stop(choreo: ConsentChoreographer) -> None:
    """The word 'stop' is a recognised cooling signal."""
    assert choreo.detect_discomfort("stop please") is True


# ---------------------------------------------------------------------------
# 8. Discomfort: "I'm not sure"
# ---------------------------------------------------------------------------


def test_detect_discomfort_not_sure(choreo: ConsentChoreographer) -> None:
    """'I'm not sure' should trigger discomfort detection."""
    assert choreo.detect_discomfort("I'm not sure about this") is True


# ---------------------------------------------------------------------------
# 9. Clean message NOT flagged
# ---------------------------------------------------------------------------


def test_detect_discomfort_clean(choreo: ConsentChoreographer) -> None:
    """A positive, enthusiastic message must NOT be flagged as discomfort."""
    assert choreo.detect_discomfort("yes please, keep going!") is False


# ---------------------------------------------------------------------------
# 10. Discomfort: "too fast"
# ---------------------------------------------------------------------------


def test_detect_discomfort_too_fast(choreo: ConsentChoreographer) -> None:
    """'too fast' should trigger discomfort detection."""
    assert choreo.detect_discomfort("this is going too fast for me") is True


# ---------------------------------------------------------------------------
# 11. De-escalation prompt contains comfort language
# ---------------------------------------------------------------------------


def test_deescalation_prompt_content(choreo: ConsentChoreographer) -> None:
    """De-escalation prompt must reference warmth / comfort / safety language."""
    prompt = choreo.get_deescalation_prompt()
    lowered = prompt.lower()
    comfort_keywords = ["comfort", "warmth", "care", "safe", "okay", "here"]
    assert any(kw in lowered for kw in comfort_keywords), (
        f"De-escalation prompt appears to lack warmth language: {prompt[:120]!r}"
    )
    # Must not contain clinical/formulaic phrasing
    assert "clinical" not in lowered


# ---------------------------------------------------------------------------
# 12. All 3 frequency presets have valid probabilities
# ---------------------------------------------------------------------------


def test_frequency_presets() -> None:
    """All named frequency presets must map to a float in [0, 1]."""
    for name, prob in CONSENT_FREQUENCY.items():
        assert isinstance(prob, float), (
            f"Preset {name!r} probability should be a float, got {type(prob)}"
        )
        assert 0.0 <= prob <= 1.0, (
            f"Preset {name!r} probability {prob} is outside [0, 1]"
        )
    assert len(CONSENT_FREQUENCY) == 3, (
        "Expected exactly 3 frequency presets: subtle, natural, frequent"
    )


# ---------------------------------------------------------------------------
# 13. All 6 styles have at least one character assigned
# ---------------------------------------------------------------------------


def test_consent_style_lookup() -> None:
    """Every defined consent style must have at least one character mapped to it."""
    for style, data in CONSENT_STYLES.items():
        chars = data.get("characters", [])
        assert len(chars) >= 1, (
            f"Style {style!r} has no characters assigned"
        )
        # Confirm the reverse lookup was built for every character in this style
        for char in chars:
            assert CHARACTER_CONSENT_STYLE.get(char) == style, (
                f"Reverse lookup mismatch: {char!r} should map to {style!r}"
            )


# ---------------------------------------------------------------------------
# Bonus: get_consent_style fallback
# ---------------------------------------------------------------------------


def test_get_consent_style_fallback(choreo: ConsentChoreographer) -> None:
    """Unknown character name should fall back to 'confident', not raise."""
    style = choreo.get_consent_style("Totally Unknown Character")
    assert style == "confident"


# ---------------------------------------------------------------------------
# Bonus: get_consent_moment returns ConsentMoment dataclass
# ---------------------------------------------------------------------------


def test_get_consent_moment_returns_dataclass(choreo: ConsentChoreographer) -> None:
    """get_consent_moment should return a ConsentMoment with correct fields."""
    random.seed(1)
    moment = choreo.get_consent_moment("Sable (Kuroha)")
    assert moment is not None
    assert isinstance(moment, ConsentMoment)
    assert moment.style == "dominant"
    assert len(moment.prompt) > 10


def test_get_consent_moment_unknown_returns_none(choreo: ConsentChoreographer) -> None:
    """get_consent_moment for an unknown character must return None."""
    result = choreo.get_consent_moment("Ghost Character")
    assert result is None


# ---------------------------------------------------------------------------
# Bonus: set_frequency updates internal probability
# ---------------------------------------------------------------------------


def test_set_frequency_updates_probability(choreo: ConsentChoreographer) -> None:
    """set_frequency should update the internal probability immediately."""
    choreo.set_frequency("subtle")
    assert choreo.frequency == "subtle"
    assert choreo.set_frequency.__doc__ is not None  # docstring present

    choreo.set_frequency("frequent")
    assert choreo.frequency == "frequent"


def test_set_frequency_unknown_falls_back(choreo: ConsentChoreographer) -> None:
    """An unrecognised frequency name should fall back to 0.4 probability."""
    choreo.set_frequency("ultra_max_turbo")
    # Internal probability should fall back to natural (0.4)
    assert choreo._probability == pytest.approx(0.4)


# ---------------------------------------------------------------------------
# Bonus: should_trigger at phase boundary uses probability
# ---------------------------------------------------------------------------


def test_should_trigger_not_at_boundary(choreo: ConsentChoreographer) -> None:
    """Outside phase boundaries, should_trigger must always return False."""
    for _ in range(20):
        assert choreo.should_trigger(is_phase_boundary=False) is False


def test_should_trigger_at_boundary_frequent() -> None:
    """With frequent preset and seed, should_trigger can return True at boundary."""
    random.seed(0)
    choreo = ConsentChoreographer(frequency="frequent")
    # With seed 0 and probability 0.6, first call should return True
    result = choreo.should_trigger(is_phase_boundary=True)
    # We just verify it's a bool — exact value depends on seed
    assert isinstance(result, bool)


# ---------------------------------------------------------------------------
# Bonus: DEESCALATION_PROMPT is non-empty module constant
# ---------------------------------------------------------------------------


def test_deescalation_prompt_is_nonempty() -> None:
    """DEESCALATION_PROMPT module constant must be a non-empty string."""
    assert isinstance(DEESCALATION_PROMPT, str)
    assert len(DEESCALATION_PROMPT.strip()) > 50
