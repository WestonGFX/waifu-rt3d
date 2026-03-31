"""Tests for NSFW Phase 8 — Deep Personalization features.

Covers F35 Scene Replay, F37 Fantasy Personas, F47 Shared Fantasy,
F31 Jealousy, F41 Body Language, F44 Erogenous Map, F22 Intimate Quiz.
All pure-unit tests.
"""

from __future__ import annotations

# ---------------------------------------------------------------------------
# F35: Scene Replay
# ---------------------------------------------------------------------------

from backend.emotional.scene_replay import SceneReplayEngine


class TestSceneReplay:
    def test_style_mapping(self) -> None:
        e = SceneReplayEngine()
        assert e.get_style("Dae (Neciridae)") == "sensory"
        assert e.get_style("Luna (Tsukimi)") == "emotional"
        assert e.get_style("Sable (Kuroha)") == "analytical"

    def test_prompt_has_tag(self) -> None:
        e = SceneReplayEngine()
        prompt = e.get_prompt("Dae", "A romantic evening")
        assert "[SCENE_REPLAY]" in prompt

    def test_prompt_contains_context(self) -> None:
        e = SceneReplayEngine()
        prompt = e.build_replay_prompt("Luna", "Stargazing together")
        assert "Stargazing" in prompt

    def test_should_offer(self) -> None:
        e = SceneReplayEngine()
        assert e.should_offer(2, 40) is True
        assert e.should_offer(5, 40) is False
        assert e.should_offer(2, 20) is False


# ---------------------------------------------------------------------------
# F37: Fantasy Personas
# ---------------------------------------------------------------------------

from backend.content.fantasy_personas import FantasyPersonaEngine, PERSONA_TYPES


class TestFantasyPersonas:
    def test_five_persona_types(self) -> None:
        assert len(PERSONA_TYPES) == 5

    def test_bond_gate(self) -> None:
        e = FantasyPersonaEngine()
        assert e.should_allow(40) is True
        assert e.should_allow(39) is False

    def test_get_types(self) -> None:
        e = FantasyPersonaEngine()
        types = e.get_persona_types()
        assert len(types) == 5
        assert all("id" in t for t in types)

    def test_build_prompt(self) -> None:
        e = FantasyPersonaEngine()
        prompt = e.build_persona_prompt("Dae", "stranger_at_bar", "You are Dae.")
        assert prompt is not None
        assert "[PERSONA_ACTIVE:stranger_at_bar]" in prompt

    def test_unknown_persona(self) -> None:
        e = FantasyPersonaEngine()
        assert e.build_persona_prompt("Dae", "nonexistent", "prompt") is None

    def test_exit_commands(self) -> None:
        e = FantasyPersonaEngine()
        assert e.is_exit_command("/end persona") is True
        assert e.is_exit_command("hello") is False

    def test_exit_prompt(self) -> None:
        e = FantasyPersonaEngine()
        prompt = e.get_exit_prompt("Dae")
        assert "Dae" in prompt


# ---------------------------------------------------------------------------
# F47: Shared Fantasy Builder
# ---------------------------------------------------------------------------

from backend.emotional.shared_fantasy import SharedFantasyEngine


class TestSharedFantasy:
    def test_bond_gate(self) -> None:
        e = SharedFantasyEngine()
        assert e.should_allow(30) is True
        assert e.should_allow(29) is False

    def test_auto_complete(self) -> None:
        e = SharedFantasyEngine()
        short = [{"role": "user", "text": "x"}] * 5
        assert e.should_auto_complete(short) is False
        full = [{"role": "user", "text": "x"}] * 20
        assert e.should_auto_complete(full) is True

    def test_format_contributions(self) -> None:
        e = SharedFantasyEngine()
        result = e.format_contributions([
            {"role": "user", "text": "A moonlit garden"},
            {"role": "character", "text": "With fireflies"},
        ])
        assert "User:" in result
        assert "Character:" in result

    def test_contribution_prompt(self) -> None:
        e = SharedFantasyEngine()
        prompt = e.build_contribution_prompt("Dae", "Title", "Desc", [], "mild")
        assert "Dae" in prompt

    def test_play_prompt(self) -> None:
        e = SharedFantasyEngine()
        prompt = e.build_play_prompt("Luna", "Stars", "Under stars", [], "mild")
        assert "[FANTASY_PLAY]" in prompt

    def test_validate_contribution(self) -> None:
        e = SharedFantasyEngine()
        assert e.validate_contribution("A moonlit garden") is True
        assert e.validate_contribution("") is False
        assert e.validate_contribution("x" * 1001) is False


# ---------------------------------------------------------------------------
# F31: Jealousy & Possessiveness
# ---------------------------------------------------------------------------

from backend.emotional.jealousy import JealousyEngine, CHARACTER_JEALOUSY_STYLE


class TestJealousy:
    def test_opt_in_required(self) -> None:
        e = JealousyEngine()
        assert e.is_enabled(False) is False
        assert e.is_enabled(True) is True

    def test_intensity_levels(self) -> None:
        e = JealousyEngine()
        subtle = e.get_intensity_level("subtle")
        assert "reconciliation_xp" in subtle
        assert subtle["reconciliation_xp"] < e.get_intensity_level("dramatic")["reconciliation_xp"]

    def test_detect_trigger(self) -> None:
        e = JealousyEngine()
        assert e.detect_trigger("I hung out with my friend today") is not None
        assert e.detect_trigger("I had breakfast") is None

    def test_style_mapping(self) -> None:
        e = JealousyEngine()
        assert e.get_jealousy_style("Luna (Tsukimi)") == "possessive_cute"
        assert len(CHARACTER_JEALOUSY_STYLE) >= 12

    def test_prompt_tag(self) -> None:
        e = JealousyEngine()
        prompt = e.get_prompt("Luna", "subtle", "mentioning_others")
        assert "[JEALOUSY_ACTIVE]" in prompt

    def test_reconciliation(self) -> None:
        e = JealousyEngine()
        prompt = e.get_reconciliation_prompt("Dae")
        assert "Dae" in prompt or len(prompt) > 0
        assert e.get_reconciliation_xp("dramatic") == 20


# ---------------------------------------------------------------------------
# F41: Body Appreciation Language
# ---------------------------------------------------------------------------

from backend.content.body_language import BodyAppreciationEngine, CHARACTER_BODY_STYLE


class TestBodyAppreciation:
    def test_style_mapping(self) -> None:
        e = BodyAppreciationEngine()
        assert e.get_style("Dae (Neciridae)") == "artistic"
        assert e.get_style("Sable (Kuroha)") == "spare"
        assert len(CHARACTER_BODY_STYLE) >= 12

    def test_vocabulary(self) -> None:
        e = BodyAppreciationEngine()
        vocab = e.get_vocabulary("Genki (Kitsune)", "mild")
        assert len(vocab) > 0

    def test_vocabulary_scales(self) -> None:
        e = BodyAppreciationEngine()
        mild = e.get_vocabulary("Dae (Neciridae)", "mild")
        explicit = e.get_vocabulary("Dae (Neciridae)", "explicit")
        assert mild != explicit

    def test_prompt_tag(self) -> None:
        e = BodyAppreciationEngine()
        prompt = e.get_prompt("Dae (Neciridae)", "suggestive")
        assert "[BODY_APPRECIATION]" in prompt


# ---------------------------------------------------------------------------
# F44: Erogenous Map
# ---------------------------------------------------------------------------

from backend.content.erogenous_map import ErogenousMapEngine, CHARACTER_MAPS


class TestErogenousMap:
    def test_all_chars_mapped(self) -> None:
        assert len(CHARACTER_MAPS) >= 12

    def test_sensitivity_lookup(self) -> None:
        e = ErogenousMapEngine()
        assert e.get_sensitivity("Dae (Neciridae)", "neck") == "high"
        assert e.get_sensitivity("Luna (Tsukimi)", "neck") == "low"

    def test_unknown_zone(self) -> None:
        e = ErogenousMapEngine()
        assert e.get_sensitivity("Dae (Neciridae)", "nonexistent") == "low"

    def test_detect_zone(self) -> None:
        e = ErogenousMapEngine()
        assert "neck" in e.detect_zone_mention("I kiss your neck softly")
        assert e.detect_zone_mention("hello there") == []

    def test_no_false_positive(self) -> None:
        """'ear' should not match inside 'earn' or 'heart'."""
        e = ErogenousMapEngine()
        zones = e.detect_zone_mention("I want to earn your heart")
        assert "ear" not in zones

    def test_prompt_with_zones(self) -> None:
        e = ErogenousMapEngine()
        prompt = e.get_prompt("Dae (Neciridae)", ["neck"])
        assert prompt is not None
        assert "[EROGENOUS_REACTION]" in prompt
        assert "high" in prompt

    def test_prompt_no_zones(self) -> None:
        e = ErogenousMapEngine()
        assert e.get_prompt("Dae (Neciridae)", []) is None


# ---------------------------------------------------------------------------
# F22: Intimate Quiz
# ---------------------------------------------------------------------------

from backend.emotional.intimate_quiz import IntimateQuizEngine


class TestIntimateQuiz:
    def test_bond_gate(self) -> None:
        e = IntimateQuizEngine()
        assert e.should_allow(50) is True
        assert e.should_allow(49) is False

    def test_total_questions(self) -> None:
        e = IntimateQuizEngine()
        assert e.get_total_questions() == 18

    def test_get_next(self) -> None:
        e = IntimateQuizEngine()
        q = e.get_next_question([])
        assert q is not None
        assert "id" in q
        assert "character_framing" in q

    def test_all_answered(self) -> None:
        e = IntimateQuizEngine()
        all_ids = [f"iq_{x}" for x in ["pace", "control", "verbal", "intensity",
            "aftercare", "setting", "words", "surprise", "vulnerability",
            "sound", "eye_contact", "clothing", "morning", "talk_after",
            "fantasy", "touch", "romance", "laughter"]]
        assert e.get_next_question(all_ids) is None

    def test_progress(self) -> None:
        e = IntimateQuizEngine()
        p = e.get_progress(["iq_pace", "iq_control"])
        assert p["answered"] == 2
        assert p["remaining"] == 16

    def test_prompt_tag(self) -> None:
        e = IntimateQuizEngine()
        q = e.get_question_by_id("iq_pace")
        prompt = e.build_question_prompt("Dae", q)
        assert "[INTIMATE_QUIZ]" in prompt

    def test_categories(self) -> None:
        e = IntimateQuizEngine()
        cats = e.get_categories()
        assert "pacing" in cats
        assert "dynamics" in cats
