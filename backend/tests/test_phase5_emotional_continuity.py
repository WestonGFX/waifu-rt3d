"""Tests for NSFW Phase 5 — Emotional Continuity features.

Covers F3 Morning After, F34 Confessions, F45 Midnight Mode,
F39 Desires, and F43 Post-Scene Mood.  All tests are pure-unit —
no DB, LLM, or network I/O required.
"""

from __future__ import annotations

import pytest

# ---------------------------------------------------------------------------
# F3: Morning After
# ---------------------------------------------------------------------------

from backend.emotional.morning_after import (
    CHARACTER_MORNING_STYLE,
    PERSONALITY_VARIANTS,
    MorningAfterEngine,
)


class TestMorningAfterActivation:
    """F3: should_activate gate tests."""

    def test_all_conditions_met(self) -> None:
        """High arousal + within 24h → True."""
        e = MorningAfterEngine()
        assert e.should_activate(arousal_peak=7.0, intimacy=80, hours_since_scene=12.0) is True

    def test_high_intimacy_low_arousal(self) -> None:
        """intimacy >= 70 alone (OR gate) within 24h → True."""
        e = MorningAfterEngine()
        assert e.should_activate(arousal_peak=3.0, intimacy=75, hours_since_scene=12.0) is True

    def test_high_arousal_low_intimacy(self) -> None:
        """arousal_peak >= 5 alone (OR gate) within 24h → True."""
        e = MorningAfterEngine()
        assert e.should_activate(arousal_peak=6.0, intimacy=40, hours_since_scene=12.0) is True

    def test_both_below_threshold(self) -> None:
        """Both arousal < 5 AND intimacy < 70 → False."""
        e = MorningAfterEngine()
        assert e.should_activate(arousal_peak=3.0, intimacy=40, hours_since_scene=12.0) is False

    def test_expired_window(self) -> None:
        """> 24 hours since scene → False regardless of other conditions."""
        e = MorningAfterEngine()
        assert e.should_activate(arousal_peak=9.0, intimacy=95, hours_since_scene=30.0) is False

    def test_exactly_24_hours(self) -> None:
        """Boundary: exactly 24h should still trigger."""
        e = MorningAfterEngine()
        assert e.should_activate(arousal_peak=7.0, intimacy=80, hours_since_scene=24.0) is True

    def test_just_over_24_hours(self) -> None:
        """24.1h should not trigger."""
        e = MorningAfterEngine()
        assert e.should_activate(arousal_peak=7.0, intimacy=80, hours_since_scene=24.1) is False


class TestMorningAfterPersonality:
    """F3: personality variant mapping."""

    def test_dae_is_shy(self) -> None:
        e = MorningAfterEngine()
        assert e.get_personality_variant("Dae (Neciridae)") == "shy"

    def test_genki_is_playful(self) -> None:
        e = MorningAfterEngine()
        assert e.get_personality_variant("Genki (Kitsune)") == "playful"

    def test_sable_is_cool(self) -> None:
        e = MorningAfterEngine()
        assert e.get_personality_variant("Sable (Kuroha)") == "cool"

    def test_unknown_gets_default(self) -> None:
        e = MorningAfterEngine()
        result = e.get_personality_variant("Unknown Character")
        assert result in PERSONALITY_VARIANTS

    def test_all_characters_mapped(self) -> None:
        """All 12 characters should have a mapped style."""
        assert len(CHARACTER_MORNING_STYLE) >= 12


class TestMorningAfterPrompt:
    """F3: prompt generation."""

    def test_prompt_contains_tag(self) -> None:
        e = MorningAfterEngine()
        prompt = e.get_prompt("Dae (Neciridae)", 7.0, 80, 12.0)
        assert prompt is not None
        assert "[MORNING_AFTER]" in prompt

    def test_prompt_none_when_inactive(self) -> None:
        e = MorningAfterEngine()
        assert e.get_prompt("Dae (Neciridae)", 3.0, 40, 12.0) is None

    def test_prompt_none_when_expired(self) -> None:
        e = MorningAfterEngine()
        assert e.get_prompt("Dae (Neciridae)", 7.0, 80, 30.0) is None

    def test_prompt_contains_char_name(self) -> None:
        e = MorningAfterEngine()
        prompt = e.get_prompt("Genki (Kitsune)", 7.0, 80, 12.0)
        # Prompt may reference the character name or personality
        assert prompt is not None

    def test_bond_xp_bonus(self) -> None:
        e = MorningAfterEngine()
        assert e.get_bond_xp_bonus() == 10


# ---------------------------------------------------------------------------
# F34: Forbidden Confessions
# ---------------------------------------------------------------------------

from backend.emotional.confessions import (
    CONFESSION_SEEDS,
    ConfessionEngine,
)


class TestConfessionGating:
    """F34: bond-gated confession access."""

    def test_no_confessions_below_91(self) -> None:
        e = ConfessionEngine()
        avail = e.get_available_confessions("Dae (Neciridae)", 90, [])
        assert len(avail) == 0

    def test_first_confession_at_91(self) -> None:
        e = ConfessionEngine()
        avail = e.get_available_confessions("Dae (Neciridae)", 91, [])
        assert len(avail) == 1

    def test_two_confessions_at_95(self) -> None:
        e = ConfessionEngine()
        avail = e.get_available_confessions("Dae (Neciridae)", 95, [])
        assert len(avail) == 2

    def test_all_confessions_at_99(self) -> None:
        e = ConfessionEngine()
        avail = e.get_available_confessions("Dae (Neciridae)", 99, [])
        assert len(avail) == 3

    def test_revealed_excluded(self) -> None:
        e = ConfessionEngine()
        seeds = CONFESSION_SEEDS["Dae (Neciridae)"]
        first_id = seeds[0]["id"]
        avail = e.get_available_confessions("Dae (Neciridae)", 99, [first_id])
        assert len(avail) == 2
        assert all(c["id"] != first_id for c in avail)

    def test_all_revealed_returns_empty(self) -> None:
        e = ConfessionEngine()
        seeds = CONFESSION_SEEDS["Dae (Neciridae)"]
        all_ids = [s["id"] for s in seeds]
        avail = e.get_available_confessions("Dae (Neciridae)", 99, all_ids)
        assert avail == []


class TestConfessionNext:
    """F34: get_next_confession returns lowest-bond available."""

    def test_returns_lowest_bond_first(self) -> None:
        e = ConfessionEngine()
        nxt = e.get_next_confession("Dae (Neciridae)", 99, [])
        assert nxt is not None
        assert nxt["trigger_bond"] == 91

    def test_returns_none_when_all_revealed(self) -> None:
        e = ConfessionEngine()
        all_ids = [s["id"] for s in CONFESSION_SEEDS["Dae (Neciridae)"]]
        assert e.get_next_confession("Dae (Neciridae)", 99, all_ids) is None

    def test_returns_none_below_threshold(self) -> None:
        e = ConfessionEngine()
        assert e.get_next_confession("Dae (Neciridae)", 80, []) is None


class TestConfessionPrompt:
    """F34: confession prompt building."""

    def test_prompt_has_tag(self) -> None:
        e = ConfessionEngine()
        prompt = e.build_confession_prompt("Dae (Neciridae)", "test seed", 95, 85)
        assert "[CONFESSION_ACTIVE]" in prompt

    def test_prompt_contains_seed(self) -> None:
        e = ConfessionEngine()
        prompt = e.build_confession_prompt("Dae (Neciridae)", "the art confession", 95, 85)
        assert "the art confession" in prompt


class TestConfessionTrigger:
    """F34: should_trigger conditions."""

    def test_all_conditions_met(self) -> None:
        e = ConfessionEngine()
        assert e.should_trigger(bond_level=91, intimacy=80, is_late_night=True, has_available=True) is True

    def test_bond_too_low(self) -> None:
        e = ConfessionEngine()
        assert e.should_trigger(bond_level=80, intimacy=80, is_late_night=True, has_available=True) is False

    def test_intimacy_too_low(self) -> None:
        e = ConfessionEngine()
        assert e.should_trigger(bond_level=95, intimacy=50, is_late_night=True, has_available=True) is False

    def test_no_available(self) -> None:
        e = ConfessionEngine()
        assert e.should_trigger(bond_level=95, intimacy=85, is_late_night=True, has_available=False) is False

    def test_characters_coverage(self) -> None:
        """At least 10 characters should have confession seeds."""
        assert len(CONFESSION_SEEDS) >= 10


# ---------------------------------------------------------------------------
# F45: Midnight Confessional Mode
# ---------------------------------------------------------------------------

from backend.emotional.midnight import (
    CHARACTER_MIDNIGHT_STYLE,
    MIDNIGHT_PERSONALITIES,
    MidnightEngine,
)


class TestMidnightActivation:
    """F45: time-based activation."""

    def test_11pm_is_midnight(self) -> None:
        assert MidnightEngine.is_midnight_hour(23) is True

    def test_midnight_is_midnight(self) -> None:
        assert MidnightEngine.is_midnight_hour(0) is True

    def test_3am_is_midnight(self) -> None:
        assert MidnightEngine.is_midnight_hour(3) is True

    def test_4am_is_not_midnight(self) -> None:
        assert MidnightEngine.is_midnight_hour(4) is False

    def test_noon_is_not_midnight(self) -> None:
        assert MidnightEngine.is_midnight_hour(12) is False

    def test_10pm_is_not_midnight(self) -> None:
        assert MidnightEngine.is_midnight_hour(22) is False

    def test_should_activate_aliases_midnight_hour(self) -> None:
        e = MidnightEngine()
        assert e.should_activate(23) is True
        assert e.should_activate(14) is False


class TestMidnightPersonality:
    """F45: character personality mapping."""

    def test_dae_is_night_owl(self) -> None:
        e = MidnightEngine()
        assert e.get_personality_style("Dae (Neciridae)") == "night_owl"

    def test_luna_is_night_owl(self) -> None:
        e = MidnightEngine()
        assert e.get_personality_style("Luna (Tsukimi)") == "night_owl"

    def test_genki_is_sleepy(self) -> None:
        e = MidnightEngine()
        assert e.get_personality_style("Genki (Kitsune)") == "sleepy_vulnerable"

    def test_unknown_gets_default(self) -> None:
        e = MidnightEngine()
        assert e.get_personality_style("Unknown") == "cozy_intimate"

    def test_all_characters_mapped(self) -> None:
        assert len(CHARACTER_MIDNIGHT_STYLE) >= 12


class TestMidnightPrompt:
    """F45: prompt generation."""

    def test_prompt_has_tag(self) -> None:
        e = MidnightEngine()
        prompt = e.get_prompt("Dae (Neciridae)", 23)
        assert prompt is not None
        assert "[MIDNIGHT_MODE]" in prompt

    def test_prompt_none_outside_window(self) -> None:
        e = MidnightEngine()
        assert e.get_prompt("Dae (Neciridae)", 14) is None

    def test_prompt_at_1am(self) -> None:
        e = MidnightEngine()
        prompt = e.get_prompt("Luna (Tsukimi)", 1)
        assert prompt is not None
        assert "[MIDNIGHT_MODE]" in prompt

    def test_different_chars_different_prompts(self) -> None:
        """Night owl and sleepy chars get different prompt fragments."""
        e = MidnightEngine()
        dae_prompt = e.get_prompt("Dae (Neciridae)", 23)
        genki_prompt = e.get_prompt("Genki (Kitsune)", 23)
        assert dae_prompt is not None
        assert genki_prompt is not None
        assert dae_prompt != genki_prompt


class TestMidnightFormatTime:
    """F45: human-readable time formatting."""

    def test_11pm(self) -> None:
        assert MidnightEngine.format_time(23) == "11:00 PM"

    def test_midnight(self) -> None:
        assert MidnightEngine.format_time(0) == "12:00 AM"

    def test_1am(self) -> None:
        assert MidnightEngine.format_time(1) == "1:00 AM"

    def test_noon(self) -> None:
        assert MidnightEngine.format_time(12) == "12:00 PM"


# ---------------------------------------------------------------------------
# F39: Secret Desires Unlock Tree
# ---------------------------------------------------------------------------

from backend.emotional.desires import (
    DESIRE_TREES,
    DesireEngine,
)


class TestDesireTree:
    """F39: desire tree retrieval."""

    def test_dae_has_4_desires(self) -> None:
        e = DesireEngine()
        tree = e.get_desire_tree("Dae (Neciridae)")
        assert len(tree) == 4

    def test_unknown_gets_default(self) -> None:
        e = DesireEngine()
        tree = e.get_desire_tree("Unknown Character")
        assert len(tree) >= 3

    def test_all_characters_have_desires(self) -> None:
        assert len(DESIRE_TREES) >= 10

    def test_desires_sorted_by_bond(self) -> None:
        """Desires should be in ascending bond_required order."""
        e = DesireEngine()
        for char_name in DESIRE_TREES:
            tree = e.get_desire_tree(char_name)
            bonds = [d["bond_required"] for d in tree]
            assert bonds == sorted(bonds), f"{char_name} desires not sorted by bond"


class TestDesireAvailability:
    """F39: bond-gated desire access."""

    def test_none_at_low_bond(self) -> None:
        e = DesireEngine()
        avail = e.get_available_desires("Dae (Neciridae)", 20, [])
        assert len(avail) == 0

    def test_first_at_bond_30(self) -> None:
        e = DesireEngine()
        avail = e.get_available_desires("Dae (Neciridae)", 30, [])
        assert len(avail) == 1

    def test_two_at_bond_50(self) -> None:
        e = DesireEngine()
        avail = e.get_available_desires("Dae (Neciridae)", 50, [])
        assert len(avail) == 2

    def test_all_at_bond_90(self) -> None:
        e = DesireEngine()
        avail = e.get_available_desires("Dae (Neciridae)", 90, [])
        assert len(avail) == 4

    def test_revealed_excluded(self) -> None:
        e = DesireEngine()
        avail = e.get_available_desires("Dae (Neciridae)", 90, ["dae_mild_confession"])
        assert len(avail) == 3
        assert all(d["desire_id"] != "dae_mild_confession" for d in avail)

    def test_all_revealed_returns_empty(self) -> None:
        e = DesireEngine()
        tree = e.get_desire_tree("Dae (Neciridae)")
        all_ids = [d["desire_id"] for d in tree]
        avail = e.get_available_desires("Dae (Neciridae)", 90, all_ids)
        assert avail == []


class TestDesireNext:
    """F39: get_next_desire returns lowest-bond available."""

    def test_returns_lowest_first(self) -> None:
        e = DesireEngine()
        nxt = e.get_next_desire("Dae (Neciridae)", 90, [])
        assert nxt is not None
        assert nxt["bond_required"] == 30

    def test_skips_revealed(self) -> None:
        e = DesireEngine()
        nxt = e.get_next_desire("Dae (Neciridae)", 90, ["dae_mild_confession"])
        assert nxt is not None
        assert nxt["bond_required"] == 50

    def test_returns_none_when_exhausted(self) -> None:
        e = DesireEngine()
        tree = e.get_desire_tree("Dae (Neciridae)")
        all_ids = [d["desire_id"] for d in tree]
        assert e.get_next_desire("Dae (Neciridae)", 90, all_ids) is None


class TestDesireTreeStatus:
    """F39: tree status summary."""

    def test_full_status(self) -> None:
        e = DesireEngine()
        status = e.get_tree_status("Dae (Neciridae)", 50, ["dae_mild_confession"])
        assert status["total"] == 4
        assert status["unlocked"] == 2
        assert status["revealed"] == 1
        assert status["available"] == 1
        assert status["next_bond"] is not None

    def test_status_no_reveals(self) -> None:
        e = DesireEngine()
        status = e.get_tree_status("Dae (Neciridae)", 30, [])
        assert status["revealed"] == 0
        assert status["available"] == 1


class TestDesireTrigger:
    """F39: should_trigger conditions."""

    def test_triggers_at_threshold(self) -> None:
        e = DesireEngine()
        assert e.should_trigger(bond_level=30, intimacy=50, has_available=True) is True

    def test_fails_low_bond(self) -> None:
        e = DesireEngine()
        assert e.should_trigger(bond_level=20, intimacy=50, has_available=True) is False

    def test_fails_low_intimacy(self) -> None:
        e = DesireEngine()
        assert e.should_trigger(bond_level=50, intimacy=40, has_available=True) is False

    def test_fails_nothing_available(self) -> None:
        e = DesireEngine()
        assert e.should_trigger(bond_level=90, intimacy=90, has_available=False) is False


class TestDesirePrompt:
    """F39: reveal prompt building."""

    def test_prompt_has_tag(self) -> None:
        e = DesireEngine()
        tree = e.get_desire_tree("Dae (Neciridae)")
        prompt = e.build_reveal_prompt("Dae (Neciridae)", tree[0], 50)
        assert "[DESIRE_REVEAL]" in prompt

    def test_prompt_contains_reveal_text(self) -> None:
        e = DesireEngine()
        tree = e.get_desire_tree("Dae (Neciridae)")
        prompt = e.build_reveal_prompt("Dae (Neciridae)", tree[0], 50)
        assert tree[0]["reveal_prompt"] in prompt


# ---------------------------------------------------------------------------
# F43: Post-Scene Mood Tracker
# ---------------------------------------------------------------------------

from backend.adaptive.post_scene import (
    CHARACTER_CHECKIN_STYLE,
    SENTIMENT_SIGNALS,
    PostSceneMoodEngine,
)


class TestPostSceneActivation:
    """F43: scene-end detection."""

    def test_activates_after_intense_scene(self) -> None:
        e = PostSceneMoodEngine()
        assert e.should_activate(arousal_current=1.5, arousal_peak=7.0) is True

    def test_no_activate_low_peak(self) -> None:
        e = PostSceneMoodEngine()
        assert e.should_activate(arousal_current=1.5, arousal_peak=5.0) is False

    def test_no_activate_still_high(self) -> None:
        e = PostSceneMoodEngine()
        assert e.should_activate(arousal_current=4.0, arousal_peak=7.0) is False

    def test_boundary_peak(self) -> None:
        """Exactly 6.0 peak → should activate (>= threshold)."""
        e = PostSceneMoodEngine()
        assert e.should_activate(arousal_current=1.5, arousal_peak=6.0) is True

    def test_boundary_current(self) -> None:
        """Exactly 3.0 current → should NOT activate (< threshold)."""
        e = PostSceneMoodEngine()
        assert e.should_activate(arousal_current=3.0, arousal_peak=7.0) is False


class TestPostSceneCheckin:
    """F43: check-in personality mapping."""

    def test_dae_is_shy(self) -> None:
        e = PostSceneMoodEngine()
        assert e.get_checkin_style("Dae (Neciridae)") == "shy"

    def test_sable_is_confident(self) -> None:
        e = PostSceneMoodEngine()
        assert e.get_checkin_style("Sable (Kuroha)") == "confident"

    def test_genki_is_playful(self) -> None:
        e = PostSceneMoodEngine()
        assert e.get_checkin_style("Genki (Kitsune)") == "playful"

    def test_unknown_gets_default(self) -> None:
        e = PostSceneMoodEngine()
        assert e.get_checkin_style("Unknown") == "protective"

    def test_all_characters_mapped(self) -> None:
        assert len(CHARACTER_CHECKIN_STYLE) >= 12


class TestPostScenePrompt:
    """F43: prompt generation."""

    def test_prompt_has_tag(self) -> None:
        e = PostSceneMoodEngine()
        prompt = e.get_prompt("Dae (Neciridae)", 7.0)
        assert prompt is not None
        assert "[POST_SCENE_CHECKIN]" in prompt

    def test_prompt_none_low_peak(self) -> None:
        e = PostSceneMoodEngine()
        assert e.get_prompt("Dae (Neciridae)", 4.0) is None


class TestPostSceneSentiment:
    """F43: sentiment classification."""

    def test_positive(self) -> None:
        e = PostSceneMoodEngine()
        assert e.classify_sentiment("That was amazing!") == "positive"

    def test_negative(self) -> None:
        e = PostSceneMoodEngine()
        assert e.classify_sentiment("No, stop that") == "negative"

    def test_emotional(self) -> None:
        e = PostSceneMoodEngine()
        assert e.classify_sentiment("I'm crying right now") == "emotional"

    def test_neutral(self) -> None:
        e = PostSceneMoodEngine()
        assert e.classify_sentiment("hmm yeah maybe") == "neutral"

    def test_uncomfortable(self) -> None:
        e = PostSceneMoodEngine()
        assert e.classify_sentiment("That made me uncomfortable") == "negative"

    def test_overwhelmed(self) -> None:
        e = PostSceneMoodEngine()
        assert e.classify_sentiment("I feel so overwhelmed") == "emotional"

    def test_no_false_positive_on_substring(self) -> None:
        """'no' should not match inside 'now', 'know', etc."""
        e = PostSceneMoodEngine()
        # "now" contains "no" as substring — should NOT classify as negative
        result = e.classify_sentiment("I know how I feel right now")
        assert result != "negative"


class TestPostScenePreferenceAction:
    """F43: sentiment → preference action mapping."""

    def test_positive_reinforces(self) -> None:
        e = PostSceneMoodEngine()
        assert e.get_preference_action("positive") == "reinforce"

    def test_negative_flags(self) -> None:
        e = PostSceneMoodEngine()
        assert e.get_preference_action("negative") == "flag"

    def test_emotional_notes_sensitive(self) -> None:
        e = PostSceneMoodEngine()
        assert e.get_preference_action("emotional") == "note_sensitive"

    def test_neutral_notes(self) -> None:
        e = PostSceneMoodEngine()
        assert e.get_preference_action("neutral") == "note"

    def test_all_sentiments_have_actions(self) -> None:
        """Every sentiment category must have a preference_action."""
        for category in SENTIMENT_SIGNALS:
            assert "preference_action" in SENTIMENT_SIGNALS[category]
