"""Tests for backend.content.intimate_director.

Covers all 8 commands, combination behaviour, category replacement,
state clearing, prompt building, list_commands(), the three property
accessors, and has_active_commands().

No database or external I/O is required — all tests are pure unit tests.
"""

from __future__ import annotations

import pytest

from backend.content.intimate_director import (
    INTIMATE_DIRECTOR_COMMANDS,
    DirectorCommand,
    IntimateDirector,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture()
def director() -> IntimateDirector:
    """Return a fresh IntimateDirector with no active commands."""
    return IntimateDirector()


# ---------------------------------------------------------------------------
# 1. parse_command — valid input
# ---------------------------------------------------------------------------


def test_parse_valid_command(director: IntimateDirector) -> None:
    """A recognised slash-command string returns a populated DirectorCommand."""
    cmd = director.parse_command("/focus emotion")

    assert cmd is not None
    assert isinstance(cmd, DirectorCommand)
    assert cmd.category == "focus"
    assert cmd.value == "emotion"
    assert len(cmd.prompt) > 0


# ---------------------------------------------------------------------------
# 2. parse_command — invalid / unknown text
# ---------------------------------------------------------------------------


def test_parse_invalid_returns_none(director: IntimateDirector) -> None:
    """Arbitrary prose that is not a director command returns None."""
    assert director.parse_command("hello") is None
    assert director.parse_command("") is None
    assert director.parse_command("/nonexistent") is None


# ---------------------------------------------------------------------------
# 3. parse_command — case-insensitive
# ---------------------------------------------------------------------------


def test_parse_case_insensitive(director: IntimateDirector) -> None:
    """Command lookup ignores case in both category and value tokens."""
    upper = director.parse_command("/FOCUS EMOTION")
    mixed = director.parse_command("/Focus Emotion")
    lower = director.parse_command("/focus emotion")

    assert upper is not None
    assert mixed is not None
    assert lower is not None
    # All three resolve to the same canonical command.
    assert upper.category == lower.category
    assert upper.value == lower.value
    assert upper.prompt == lower.prompt


# ---------------------------------------------------------------------------
# 4. parse_command — whitespace trimming
# ---------------------------------------------------------------------------


def test_parse_trims_whitespace(director: IntimateDirector) -> None:
    """Leading and trailing whitespace does not prevent recognition."""
    cmd = director.parse_command("  /tempo faster  ")
    assert cmd is not None
    assert cmd.value == "faster"


# ---------------------------------------------------------------------------
# 5. Commands are combinable across categories
# ---------------------------------------------------------------------------


def test_commands_combinable(director: IntimateDirector) -> None:
    """Commands from different categories can all be active simultaneously."""
    focus_cmd = director.parse_command("/focus emotion")
    tempo_cmd = director.parse_command("/tempo slower")
    camera_cmd = director.parse_command("/closeup")

    assert focus_cmd is not None
    assert tempo_cmd is not None
    assert camera_cmd is not None

    director.apply_command(focus_cmd)
    director.apply_command(tempo_cmd)
    director.apply_command(camera_cmd)

    assert director.active_focus == "emotion"
    assert director.active_tempo == "slower"
    assert director.active_camera == "closeup"


# ---------------------------------------------------------------------------
# 6. Same category replaces previous command
# ---------------------------------------------------------------------------


def test_same_category_replaces(director: IntimateDirector) -> None:
    """Applying a second command in the same category overwrites the first."""
    faster = director.parse_command("/tempo faster")
    slower = director.parse_command("/tempo slower")

    assert faster is not None
    assert slower is not None

    director.apply_command(faster)
    assert director.active_tempo == "faster"

    director.apply_command(slower)
    assert director.active_tempo == "slower"


# ---------------------------------------------------------------------------
# 7. clear_category
# ---------------------------------------------------------------------------


def test_clear_category(director: IntimateDirector) -> None:
    """clear_category removes exactly one category without affecting others."""
    director.apply_command(director.parse_command("/focus dialogue"))  # type: ignore[arg-type]
    director.apply_command(director.parse_command("/tempo faster"))    # type: ignore[arg-type]

    director.clear_category("focus")

    assert director.active_focus is None
    assert director.active_tempo == "faster"  # unaffected


def test_clear_category_noop_when_empty(director: IntimateDirector) -> None:
    """clear_category on a category with no active command is a no-op."""
    director.clear_category("camera")  # should not raise
    assert director.active_camera is None


# ---------------------------------------------------------------------------
# 8. clear_all
# ---------------------------------------------------------------------------


def test_clear_all(director: IntimateDirector) -> None:
    """clear_all removes every active command across all categories."""
    director.apply_command(director.parse_command("/focus physical"))   # type: ignore[arg-type]
    director.apply_command(director.parse_command("/tempo pause"))      # type: ignore[arg-type]
    director.apply_command(director.parse_command("/wideshot"))         # type: ignore[arg-type]

    assert director.has_active_commands()

    director.clear_all()

    assert not director.has_active_commands()
    assert director.active_focus is None
    assert director.active_tempo is None
    assert director.active_camera is None


# ---------------------------------------------------------------------------
# 9. build_director_prompt — empty when no commands active
# ---------------------------------------------------------------------------


def test_build_prompt_empty(director: IntimateDirector) -> None:
    """build_director_prompt returns an empty string when nothing is active."""
    assert director.build_director_prompt() == ""


# ---------------------------------------------------------------------------
# 10. build_director_prompt — contains active command prompts
# ---------------------------------------------------------------------------


def test_build_prompt_contains_active_prompts(director: IntimateDirector) -> None:
    """build_director_prompt includes the prompt text for every active command."""
    director.apply_command(director.parse_command("/focus emotion"))    # type: ignore[arg-type]
    director.apply_command(director.parse_command("/tempo slower"))     # type: ignore[arg-type]

    block = director.build_director_prompt()

    assert block.startswith("[INTIMATE DIRECTOR")
    # Emotion prompt contains the word FEELING.
    assert "FEELING" in block
    # Tempo slower prompt mentions anticipation.
    assert "anticipation" in block


def test_build_prompt_header_always_present(director: IntimateDirector) -> None:
    """The header line is always included when at least one command is active."""
    director.apply_command(director.parse_command("/closeup"))  # type: ignore[arg-type]

    block = director.build_director_prompt()
    lines = block.splitlines()
    assert lines[0] == "[INTIMATE DIRECTOR — Active Commands]"


def test_build_prompt_clears_after_clear_all(director: IntimateDirector) -> None:
    """After clear_all the prompt reverts to an empty string."""
    director.apply_command(director.parse_command("/wideshot"))  # type: ignore[arg-type]
    assert director.build_director_prompt() != ""

    director.clear_all()
    assert director.build_director_prompt() == ""


# ---------------------------------------------------------------------------
# 11. list_commands
# ---------------------------------------------------------------------------


def test_list_commands_returns_all_eight(director: IntimateDirector) -> None:
    """list_commands always returns exactly 8 entries."""
    cmds = director.list_commands()
    assert len(cmds) == 8


def test_list_commands_structure(director: IntimateDirector) -> None:
    """Each entry from list_commands contains the required keys."""
    required_keys = {"command", "category", "value", "description"}
    for entry in director.list_commands():
        assert required_keys <= entry.keys(), f"Missing keys in entry: {entry}"


def test_list_commands_matches_catalogue(director: IntimateDirector) -> None:
    """list_commands command strings match the INTIMATE_DIRECTOR_COMMANDS keys."""
    listed = {e["command"] for e in director.list_commands()}
    expected = set(INTIMATE_DIRECTOR_COMMANDS.keys())
    assert listed == expected


# ---------------------------------------------------------------------------
# 12. active_focus / active_tempo / active_camera properties
# ---------------------------------------------------------------------------


def test_active_properties_initially_none(director: IntimateDirector) -> None:
    """All three category properties are None on a fresh director."""
    assert director.active_focus is None
    assert director.active_tempo is None
    assert director.active_camera is None


def test_active_properties_reflect_applied_commands(director: IntimateDirector) -> None:
    """Properties return the correct value string once a command is applied."""
    director.apply_command(director.parse_command("/focus physical"))   # type: ignore[arg-type]
    director.apply_command(director.parse_command("/tempo pause"))      # type: ignore[arg-type]
    director.apply_command(director.parse_command("/wideshot"))         # type: ignore[arg-type]

    assert director.active_focus == "physical"
    assert director.active_tempo == "pause"
    assert director.active_camera == "wideshot"


def test_active_camera_closeup(director: IntimateDirector) -> None:
    """active_camera reports 'closeup' for the /closeup command."""
    director.apply_command(director.parse_command("/closeup"))  # type: ignore[arg-type]
    assert director.active_camera == "closeup"


# ---------------------------------------------------------------------------
# 13. has_active_commands
# ---------------------------------------------------------------------------


def test_has_active_commands_false_when_empty(director: IntimateDirector) -> None:
    """has_active_commands is False on a fresh instance."""
    assert director.has_active_commands() is False


def test_has_active_commands_true_after_apply(director: IntimateDirector) -> None:
    """has_active_commands is True once any command is applied."""
    director.apply_command(director.parse_command("/focus dialogue"))  # type: ignore[arg-type]
    assert director.has_active_commands() is True


def test_has_active_commands_false_after_clear_all(director: IntimateDirector) -> None:
    """has_active_commands returns False after clear_all."""
    director.apply_command(director.parse_command("/tempo faster"))  # type: ignore[arg-type]
    director.clear_all()
    assert director.has_active_commands() is False


# ---------------------------------------------------------------------------
# 14. All 8 commands parse without error
# ---------------------------------------------------------------------------


def test_all_eight_commands_parseable(director: IntimateDirector) -> None:
    """Every key in INTIMATE_DIRECTOR_COMMANDS resolves to a DirectorCommand."""
    for slash_cmd in INTIMATE_DIRECTOR_COMMANDS:
        cmd = director.parse_command(slash_cmd)
        assert cmd is not None, f"parse_command failed for: {slash_cmd!r}"
        assert cmd.category in ("focus", "tempo", "camera")
        assert cmd.value != ""
        assert cmd.prompt != ""
