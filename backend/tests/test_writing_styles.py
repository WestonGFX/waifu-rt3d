"""Tests for backend.content.writing_styles — F13 Writing Style Presets.

Covers preset registry completeness, prompt gating on intimacy threshold,
and all three tiers of the resolution priority chain (session override →
character default → global default).

All DB-dependent tests use in-memory SQLite so no fixtures are required.
"""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import sqlite3

import pytest

from backend.content.writing_styles import (
    CHARACTER_STYLE_DEFAULTS,
    STYLE_PRESETS,
    WRITING_STYLE_PROMPTS,
    WritingStylePreset,
    build_style_prompt,
    get_writing_style,
    list_presets,
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_EXPECTED_NAMES = {"romantic", "literary", "direct", "suggestive"}


def _make_conn(writing_style: str | None = None, session_id: int = 1) -> sqlite3.Connection:
    """Return an in-memory connection with a minimal ``sessions`` table.

    Args:
        writing_style: Value to insert into the ``writing_style`` column for
            the row with *session_id*.  ``None`` inserts a SQL NULL.
        session_id: Primary key for the session row.

    Returns:
        Open :class:`sqlite3.Connection` with one session row inserted.
    """
    conn = sqlite3.connect(":memory:")
    conn.execute(
        "CREATE TABLE sessions (id INTEGER PRIMARY KEY, writing_style TEXT)"
    )
    conn.execute(
        "INSERT INTO sessions (id, writing_style) VALUES (?, ?)",
        (session_id, writing_style),
    )
    conn.commit()
    return conn


def _make_conn_no_column(session_id: int = 1) -> sqlite3.Connection:
    """Return an in-memory connection whose ``sessions`` table lacks the style column.

    Simulates a pre-migration schema where ``writing_style`` does not exist yet.

    Args:
        session_id: Primary key for the session row.

    Returns:
        Open :class:`sqlite3.Connection` with a bare sessions table.
    """
    conn = sqlite3.connect(":memory:")
    conn.execute("CREATE TABLE sessions (id INTEGER PRIMARY KEY)")
    conn.execute("INSERT INTO sessions (id) VALUES (?)", (session_id,))
    conn.commit()
    return conn


# ---------------------------------------------------------------------------
# TestAllPresetsExist
# ---------------------------------------------------------------------------


class TestAllPresetsExist:
    """STYLE_PRESETS must contain exactly four well-formed presets."""

    def test_four_presets_registered(self):
        """STYLE_PRESETS must have exactly four entries."""
        assert len(STYLE_PRESETS) == 4

    def test_all_expected_names_present(self):
        """All four canonical style names must be keys in STYLE_PRESETS."""
        assert set(STYLE_PRESETS.keys()) == _EXPECTED_NAMES

    @pytest.mark.parametrize("name", sorted(_EXPECTED_NAMES))
    def test_preset_is_dataclass_instance(self, name: str):
        """Each entry must be a WritingStylePreset instance."""
        assert isinstance(STYLE_PRESETS[name], WritingStylePreset)

    @pytest.mark.parametrize("name", sorted(_EXPECTED_NAMES))
    def test_preset_name_matches_key(self, name: str):
        """Preset.name must equal its dictionary key."""
        assert STYLE_PRESETS[name].name == name

    @pytest.mark.parametrize("name", sorted(_EXPECTED_NAMES))
    def test_preset_display_name_non_empty(self, name: str):
        """display_name must be a non-empty string."""
        assert isinstance(STYLE_PRESETS[name].display_name, str)
        assert len(STYLE_PRESETS[name].display_name) > 0

    @pytest.mark.parametrize("name", sorted(_EXPECTED_NAMES))
    def test_preset_description_non_empty(self, name: str):
        """description must be a non-empty string."""
        assert isinstance(STYLE_PRESETS[name].description, str)
        assert len(STYLE_PRESETS[name].description) > 0

    @pytest.mark.parametrize("name", sorted(_EXPECTED_NAMES))
    def test_preset_sample_line_non_empty(self, name: str):
        """sample_line must be a non-empty string."""
        assert isinstance(STYLE_PRESETS[name].sample_line, str)
        assert len(STYLE_PRESETS[name].sample_line) > 0

    @pytest.mark.parametrize("name", sorted(_EXPECTED_NAMES))
    def test_preset_prompt_template_non_empty(self, name: str):
        """prompt_template must be a non-empty string."""
        assert isinstance(STYLE_PRESETS[name].prompt_template, str)
        assert len(STYLE_PRESETS[name].prompt_template) > 0

    @pytest.mark.parametrize("name", sorted(_EXPECTED_NAMES))
    def test_prompt_template_matches_raw_dict(self, name: str):
        """Each preset's prompt_template must match the corresponding WRITING_STYLE_PROMPTS entry."""
        assert STYLE_PRESETS[name].prompt_template == WRITING_STYLE_PROMPTS[name]

    @pytest.mark.parametrize("name", sorted(_EXPECTED_NAMES))
    def test_prompt_template_contains_style_header(self, name: str):
        """Each template must begin with a 'WRITING STYLE:' header line."""
        assert "WRITING STYLE:" in STYLE_PRESETS[name].prompt_template


# ---------------------------------------------------------------------------
# TestBuildStylePromptBelowThreshold
# ---------------------------------------------------------------------------


class TestBuildStylePromptBelowThreshold:
    """build_style_prompt must return '' when intimacy_level < 30."""

    @pytest.mark.parametrize("level", [0, 1, 15, 28, 29])
    def test_returns_empty_string_below_30(self, level: int):
        """Any intimacy level below 30 must produce an empty string."""
        preset = STYLE_PRESETS["romantic"]
        assert build_style_prompt(preset, intimacy_level=level) == ""

    def test_returns_empty_string_at_zero_default(self):
        """Default intimacy_level=0 must produce an empty string."""
        assert build_style_prompt(STYLE_PRESETS["literary"]) == ""

    @pytest.mark.parametrize("name", sorted(_EXPECTED_NAMES))
    def test_all_styles_gated_at_29(self, name: str):
        """All four styles return '' at intimacy_level=29."""
        assert build_style_prompt(STYLE_PRESETS[name], intimacy_level=29) == ""


# ---------------------------------------------------------------------------
# TestBuildStylePromptAboveThreshold
# ---------------------------------------------------------------------------


class TestBuildStylePromptAboveThreshold:
    """build_style_prompt must return the template when intimacy_level >= 30."""

    @pytest.mark.parametrize("level", [30, 31, 50, 75, 99, 100])
    def test_returns_non_empty_at_or_above_30(self, level: int):
        """Any intimacy level >= 30 must return a non-empty string."""
        preset = STYLE_PRESETS["direct"]
        result = build_style_prompt(preset, intimacy_level=level)
        assert isinstance(result, str) and len(result) > 0

    def test_returns_full_template_at_threshold(self):
        """At exactly intimacy_level=30, the full prompt_template is returned."""
        preset = STYLE_PRESETS["suggestive"]
        assert build_style_prompt(preset, intimacy_level=30) == preset.prompt_template

    @pytest.mark.parametrize("name", sorted(_EXPECTED_NAMES))
    def test_all_styles_active_at_30(self, name: str):
        """All four styles return their template at intimacy_level=30."""
        preset = STYLE_PRESETS[name]
        result = build_style_prompt(preset, intimacy_level=30)
        assert result == preset.prompt_template

    def test_romantic_template_contains_keyword(self):
        """Romantic template output contains the style header keyword."""
        result = build_style_prompt(STYLE_PRESETS["romantic"], intimacy_level=50)
        assert "ROMANTIC" in result

    def test_literary_template_contains_keyword(self):
        """Literary template output contains the style header keyword."""
        result = build_style_prompt(STYLE_PRESETS["literary"], intimacy_level=50)
        assert "LITERARY" in result

    def test_direct_template_contains_keyword(self):
        """Direct template output contains the style header keyword."""
        result = build_style_prompt(STYLE_PRESETS["direct"], intimacy_level=50)
        assert "DIRECT" in result

    def test_suggestive_template_contains_keyword(self):
        """Suggestive template output contains the style header keyword."""
        result = build_style_prompt(STYLE_PRESETS["suggestive"], intimacy_level=50)
        assert "SUGGESTIVE" in result


# ---------------------------------------------------------------------------
# TestGetWritingStyleSessionOverride
# ---------------------------------------------------------------------------


class TestGetWritingStyleSessionOverride:
    """Session column takes precedence over character default and global default."""

    @pytest.mark.parametrize("style_name", sorted(_EXPECTED_NAMES))
    def test_session_override_returns_correct_preset(self, style_name: str):
        """Any valid style name stored in the session row must be returned."""
        conn = _make_conn(writing_style=style_name, session_id=1)
        result = get_writing_style(1, 0, conn, char_name="Luna (Tsukimi)")
        assert result.name == style_name

    def test_session_override_wins_over_character_default(self):
        """Session 'direct' overrides Luna's character default of 'romantic'."""
        conn = _make_conn(writing_style="direct", session_id=1)
        result = get_writing_style(1, 0, conn, char_name="Luna (Tsukimi)")
        assert result.name == "direct"

    def test_session_override_wins_over_global_default(self):
        """Session 'literary' overrides the global fallback of 'romantic'."""
        conn = _make_conn(writing_style="literary", session_id=1)
        result = get_writing_style(1, 0, conn, char_name="")
        assert result.name == "literary"

    def test_null_session_style_falls_through(self):
        """A NULL writing_style column falls through to character or global default."""
        conn = _make_conn(writing_style=None, session_id=1)
        result = get_writing_style(1, 0, conn, char_name="Dae (Neciridae)")
        # Dae's character default is 'literary'
        assert result.name == "literary"

    def test_unknown_session_style_falls_through(self):
        """An unrecognised style name in the DB is ignored and falls through."""
        conn = _make_conn(writing_style="nonexistent_style", session_id=1)
        result = get_writing_style(1, 0, conn, char_name="")
        # Falls through to global default
        assert result.name == "romantic"

    def test_missing_session_row_falls_through(self):
        """When the session row does not exist, falls through gracefully."""
        conn = _make_conn(writing_style="literary", session_id=99)
        # Request session_id=1 which has no row
        result = get_writing_style(1, 0, conn, char_name="Dae (Neciridae)")
        # Falls through to character default: 'literary'
        assert result.name == "literary"


# ---------------------------------------------------------------------------
# TestGetWritingStyleCharacterDefault
# ---------------------------------------------------------------------------


class TestGetWritingStyleCharacterDefault:
    """Character name lookup falls back when no session override is present."""

    @pytest.mark.parametrize("char_name, expected_style", [
        ("Dae (Neciridae)", "literary"),
        ("Luna (Tsukimi)", "romantic"),
        ("Genki (Kitsune)", "direct"),
        ("Alana Calloway", "literary"),
        ("Sable (Kuroha)", "direct"),
        ("Tsundere (Raine)", "suggestive"),
        ("Ayane (Yuki)", "romantic"),
        ("Hana (Momoka)", "romantic"),
        ("Kaede (Suzuha)", "suggestive"),
        ("Mika (Mikazuki)", "direct"),
        ("Rin (Akane)", "direct"),
        ("Shiori (Nana)", "literary"),
        ("Yuki (Shirayuki)", "romantic"),
    ])
    def test_character_default_resolved(self, char_name: str, expected_style: str):
        """Each character in CHARACTER_STYLE_DEFAULTS resolves to its documented style."""
        conn = _make_conn(writing_style=None, session_id=1)
        result = get_writing_style(1, 0, conn, char_name=char_name)
        assert result.name == expected_style

    def test_all_character_defaults_reference_valid_presets(self):
        """Every value in CHARACTER_STYLE_DEFAULTS must be a key in STYLE_PRESETS."""
        for char_name, style_name in CHARACTER_STYLE_DEFAULTS.items():
            assert style_name in STYLE_PRESETS, (
                f"CHARACTER_STYLE_DEFAULTS[{char_name!r}] = {style_name!r} is not "
                "in STYLE_PRESETS"
            )

    def test_unknown_char_name_falls_to_global(self):
        """A character name not in the defaults map falls through to 'romantic'."""
        conn = _make_conn(writing_style=None, session_id=1)
        result = get_writing_style(1, 0, conn, char_name="Unknown Character XYZ")
        assert result.name == "romantic"

    def test_no_column_falls_through_to_character_default(self):
        """When writing_style column is missing entirely, character default is used."""
        conn = _make_conn_no_column(session_id=1)
        result = get_writing_style(1, 0, conn, char_name="Dae (Neciridae)")
        assert result.name == "literary"


# ---------------------------------------------------------------------------
# TestGetWritingStyleGlobalDefault
# ---------------------------------------------------------------------------


class TestGetWritingStyleGlobalDefault:
    """Falls back to 'romantic' when neither session nor character override applies."""

    def test_global_default_is_romantic(self):
        """With no session override and no char_name, result is 'romantic'."""
        conn = _make_conn(writing_style=None, session_id=1)
        result = get_writing_style(1, 0, conn, char_name="")
        assert result.name == "romantic"

    def test_global_default_with_missing_column(self):
        """Missing writing_style column + no char_name → global default 'romantic'."""
        conn = _make_conn_no_column(session_id=1)
        result = get_writing_style(1, 0, conn, char_name="")
        assert result.name == "romantic"

    def test_global_default_returns_writingstylepreset(self):
        """The global default result must be a WritingStylePreset instance."""
        conn = _make_conn(writing_style=None, session_id=1)
        result = get_writing_style(1, 0, conn)
        assert isinstance(result, WritingStylePreset)

    def test_global_default_preset_has_complete_fields(self):
        """The global default 'romantic' preset must have all required fields populated."""
        conn = _make_conn(writing_style=None, session_id=1)
        result = get_writing_style(1, 0, conn)
        assert result.name == "romantic"
        assert result.display_name
        assert result.description
        assert result.sample_line
        assert result.prompt_template


# ---------------------------------------------------------------------------
# TestListPresets
# ---------------------------------------------------------------------------


class TestListPresets:
    """list_presets() must return all four presets in the correct display order."""

    def test_returns_four_presets(self):
        """list_presets must return exactly four items."""
        assert len(list_presets()) == 4

    def test_all_items_are_writingstylepreset(self):
        """Every item must be a WritingStylePreset instance."""
        for preset in list_presets():
            assert isinstance(preset, WritingStylePreset)

    def test_display_order(self):
        """Presets must be ordered: romantic, literary, direct, suggestive."""
        names = [p.name for p in list_presets()]
        assert names == ["romantic", "literary", "direct", "suggestive"]

    def test_covers_all_expected_names(self):
        """list_presets must cover all four canonical style names."""
        names = {p.name for p in list_presets()}
        assert names == _EXPECTED_NAMES

    def test_no_duplicates(self):
        """list_presets must not return duplicate entries."""
        presets = list_presets()
        names = [p.name for p in presets]
        assert len(names) == len(set(names))

    def test_returns_same_objects_as_registry(self):
        """Each returned preset must be identical to the corresponding STYLE_PRESETS entry."""
        for preset in list_presets():
            assert preset is STYLE_PRESETS[preset.name]
