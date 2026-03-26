"""Tests for backend/llm/interaction_modes.py.

Covers all three modes, template substitution, default argument behaviour,
error handling for unknown mode strings, and the structural guarantee that
CHAT mode leaves prompts unmodified (empty prefix/hint).
"""

from __future__ import annotations

import pytest

from backend.llm.interaction_modes import (
    InteractionMode,
    ModeConfig,
    get_mode_config,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _chat(char: str = "Dae", user: str = "User") -> ModeConfig:
    """Shorthand for building a CHAT config in tests."""
    return get_mode_config("chat", character_name=char, user_name=user)


def _story(char: str = "Dae", user: str = "User") -> ModeConfig:
    """Shorthand for building a STORY config in tests."""
    return get_mode_config("story", character_name=char, user_name=user)


def _adventure(char: str = "Dae", user: str = "User") -> ModeConfig:
    """Shorthand for building an ADVENTURE config in tests."""
    return get_mode_config("adventure", character_name=char, user_name=user)


# ---------------------------------------------------------------------------
# Return-type validation — all modes produce a valid ModeConfig
# ---------------------------------------------------------------------------

class TestReturnTypes:
    """All three modes must return a properly typed ModeConfig instance."""

    def test_chat_returns_mode_config(self) -> None:
        cfg = _chat()
        assert isinstance(cfg, ModeConfig)

    def test_story_returns_mode_config(self) -> None:
        cfg = _story()
        assert isinstance(cfg, ModeConfig)

    def test_adventure_returns_mode_config(self) -> None:
        cfg = _adventure()
        assert isinstance(cfg, ModeConfig)

    def test_chat_mode_field(self) -> None:
        assert _chat().mode is InteractionMode.CHAT

    def test_story_mode_field(self) -> None:
        assert _story().mode is InteractionMode.STORY

    def test_adventure_mode_field(self) -> None:
        assert _adventure().mode is InteractionMode.ADVENTURE


# ---------------------------------------------------------------------------
# Default mode is CHAT
# ---------------------------------------------------------------------------

class TestDefaultMode:
    """Passing 'chat' (the default value) yields InteractionMode.CHAT."""

    def test_explicit_chat_string(self) -> None:
        cfg = get_mode_config("chat", character_name="Luna")
        assert cfg.mode is InteractionMode.CHAT

    def test_chat_mode_enum_value(self) -> None:
        assert InteractionMode.CHAT.value == "chat"


# ---------------------------------------------------------------------------
# CHAT mode must not alter prompt behaviour
# ---------------------------------------------------------------------------

class TestChatModeEmptyTemplates:
    """Chat mode must have empty system_prefix and response_hint so the
    character's system prompt is used exactly as stored."""

    def test_system_prefix_is_empty(self) -> None:
        assert _chat().system_prefix == ""

    def test_response_hint_is_empty(self) -> None:
        assert _chat().response_hint == ""

    def test_user_role_label_is_user_name(self) -> None:
        cfg = get_mode_config("chat", character_name="Luna", user_name="Chris")
        assert cfg.user_role_label == "Chris"

    def test_ai_role_label_is_character_name(self) -> None:
        cfg = get_mode_config("chat", character_name="Luna")
        assert cfg.ai_role_label == "Luna"


# ---------------------------------------------------------------------------
# STORY mode — content checks
# ---------------------------------------------------------------------------

class TestStoryMode:
    """Story mode must contain third-person narration instructions."""

    def test_prefix_contains_third_person(self) -> None:
        assert "third-person" in _story().system_prefix

    def test_prefix_contains_past_tense(self) -> None:
        assert "past tense" in _story().system_prefix

    def test_prefix_does_not_break_fourth_wall(self) -> None:
        assert "fourth wall" in _story().system_prefix

    def test_response_hint_is_non_empty(self) -> None:
        assert _story().response_hint != ""

    def test_ai_role_label_is_narrator(self) -> None:
        assert _story().ai_role_label == "Narrator"


# ---------------------------------------------------------------------------
# ADVENTURE mode — content checks
# ---------------------------------------------------------------------------

class TestAdventureMode:
    """Adventure mode must address the user in second person."""

    def test_prefix_contains_second_person(self) -> None:
        assert "second person" in _adventure().system_prefix

    def test_prefix_contains_interactive_adventure(self) -> None:
        assert "interactive adventure" in _adventure().system_prefix

    def test_response_hint_is_non_empty(self) -> None:
        assert _adventure().response_hint != ""

    def test_user_role_label_is_you(self) -> None:
        assert _adventure().user_role_label == "You"

    def test_ai_role_label_is_character_name(self) -> None:
        cfg = get_mode_config("adventure", character_name="Alana")
        assert cfg.ai_role_label == "Alana"


# ---------------------------------------------------------------------------
# character_name substitution
# ---------------------------------------------------------------------------

class TestCharacterNameSubstitution:
    """character_name must be substituted into both prefix and hint."""

    def test_story_prefix_contains_character_name(self) -> None:
        cfg = get_mode_config("story", character_name="Alana")
        assert "Alana" in cfg.system_prefix

    def test_story_hint_contains_character_name(self) -> None:
        cfg = get_mode_config("story", character_name="Alana")
        assert "Alana" in cfg.response_hint

    def test_adventure_prefix_contains_character_name(self) -> None:
        cfg = get_mode_config("adventure", character_name="Sakura")
        assert "Sakura" in cfg.system_prefix

    def test_adventure_hint_contains_character_name(self) -> None:
        cfg = get_mode_config("adventure", character_name="Sakura")
        assert "Sakura" in cfg.response_hint

    def test_different_characters_produce_different_prefixes(self) -> None:
        cfg_a = get_mode_config("story", character_name="Dae")
        cfg_b = get_mode_config("story", character_name="Luna")
        assert cfg_a.system_prefix != cfg_b.system_prefix

    def test_no_unreplaced_placeholders_in_story(self) -> None:
        cfg = get_mode_config("story", character_name="Genki")
        assert "{" not in cfg.system_prefix
        assert "{" not in cfg.response_hint

    def test_no_unreplaced_placeholders_in_adventure(self) -> None:
        cfg = get_mode_config("adventure", character_name="Genki")
        assert "{" not in cfg.system_prefix
        assert "{" not in cfg.response_hint


# ---------------------------------------------------------------------------
# user_name default behaviour
# ---------------------------------------------------------------------------

class TestUserNameDefault:
    """user_name defaults to 'User' when not supplied."""

    def test_default_user_name_in_chat(self) -> None:
        cfg = get_mode_config("chat", character_name="Dae")
        assert cfg.user_role_label == "User"

    def test_custom_user_name_in_chat(self) -> None:
        cfg = get_mode_config("chat", character_name="Dae", user_name="Chris")
        assert cfg.user_role_label == "Chris"

    def test_custom_user_name_in_story(self) -> None:
        cfg = get_mode_config("story", character_name="Dae", user_name="Chris")
        # story mode keeps user_name for user_role_label
        assert cfg.user_role_label == "Chris"


# ---------------------------------------------------------------------------
# Invalid mode raises ValueError
# ---------------------------------------------------------------------------

class TestInvalidMode:
    """Unknown mode strings must raise ValueError with a helpful message."""

    def test_invalid_mode_raises_value_error(self) -> None:
        with pytest.raises(ValueError):
            get_mode_config("roleplay", character_name="Dae")

    def test_error_message_contains_mode_name(self) -> None:
        with pytest.raises(ValueError, match="roleplay"):
            get_mode_config("roleplay", character_name="Dae")

    def test_error_message_lists_valid_modes(self) -> None:
        with pytest.raises(ValueError, match="chat"):
            get_mode_config("unknown_mode", character_name="Dae")

    def test_empty_string_raises_value_error(self) -> None:
        with pytest.raises(ValueError):
            get_mode_config("", character_name="Dae")

    def test_none_like_string_raises_value_error(self) -> None:
        with pytest.raises(ValueError):
            get_mode_config("none", character_name="Dae")

    def test_uppercase_mode_is_normalised(self) -> None:
        """Mode matching must be case-insensitive."""
        cfg = get_mode_config("STORY", character_name="Dae")
        assert cfg.mode is InteractionMode.STORY

    def test_mixed_case_mode_is_normalised(self) -> None:
        cfg = get_mode_config("Adventure", character_name="Dae")
        assert cfg.mode is InteractionMode.ADVENTURE


# ---------------------------------------------------------------------------
# ModeConfig is a dataclass (structural sanity)
# ---------------------------------------------------------------------------

class TestModeConfigStructure:
    """ModeConfig must expose all five expected fields."""

    def test_has_mode_field(self) -> None:
        cfg = _chat()
        assert hasattr(cfg, "mode")

    def test_has_system_prefix_field(self) -> None:
        cfg = _chat()
        assert hasattr(cfg, "system_prefix")

    def test_has_response_hint_field(self) -> None:
        cfg = _chat()
        assert hasattr(cfg, "response_hint")

    def test_has_user_role_label_field(self) -> None:
        cfg = _chat()
        assert hasattr(cfg, "user_role_label")

    def test_has_ai_role_label_field(self) -> None:
        cfg = _chat()
        assert hasattr(cfg, "ai_role_label")

    def test_all_string_fields_are_str(self) -> None:
        for mode_str in ("chat", "story", "adventure"):
            cfg = get_mode_config(mode_str, character_name="Dae")
            assert isinstance(cfg.system_prefix, str)
            assert isinstance(cfg.response_hint, str)
            assert isinstance(cfg.user_role_label, str)
            assert isinstance(cfg.ai_role_label, str)
