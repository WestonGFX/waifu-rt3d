"""Comprehensive tests for Sprint 4 immersion modules.

Covers:
- MoonshineAdapter (ASR) — import, config, inheritance, graceful failure
- ScenarioTemplates — full CRUD, constraints, prompt building, random selection
- StructuredDirector — command parsing, state mutation, prompt rendering, DB round-trip
"""

import io
import json
import sqlite3
import struct
import wave
from dataclasses import asdict
from unittest.mock import MagicMock, patch

import pytest

# ---------------------------------------------------------------------------
# Shared DB helpers
# ---------------------------------------------------------------------------


def _make_mem_db() -> sqlite3.Connection:
    """Create an isolated in-memory SQLite DB with sessions + scenario tables.

    Returns:
        sqlite3.Connection: Connection with sessions table containing the
        columns expected by both scenario and director modules.
    """
    conn = sqlite3.connect(":memory:")
    conn.execute(
        """
        CREATE TABLE sessions (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            char_id       INTEGER,
            scene_context TEXT,
            scene_enabled INTEGER DEFAULT 0,
            director_state TEXT DEFAULT ''
        )
        """
    )
    conn.commit()
    return conn


def _insert_session(conn: sqlite3.Connection, char_id: int = 1) -> int:
    """Insert a session row and return its ID.

    Args:
        conn: Active SQLite connection.
        char_id: Character ID to associate with the session.

    Returns:
        int: The newly inserted session ID.
    """
    cur = conn.execute(
        "INSERT INTO sessions (char_id) VALUES (?)", (char_id,)
    )
    conn.commit()
    return cur.lastrowid


def _make_minimal_wav(sample_rate: int = 16000, num_frames: int = 1600) -> bytes:
    """Build a minimal 16-bit mono WAV bytes object for audio tests.

    Args:
        sample_rate: Sampling rate in Hz. Defaults to 16 kHz.
        num_frames: Number of PCM frames. Defaults to 1600 (100 ms at 16 kHz).

    Returns:
        bytes: Well-formed WAV file content.
    """
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(b"\x00\x00" * num_frames)
    return buf.getvalue()


# ===========================================================================
# 1. MoonshineAdapter
# ===========================================================================


class TestMoonshineAdapterImport:
    """Verify module import and class presence."""

    def test_module_importable(self):
        """MoonshineAdapter module imports without error."""
        from backend.asr.adapters import moonshine  # noqa: F401

    def test_class_exists(self):
        """MoonshineAdapter class is accessible."""
        from backend.asr.adapters.moonshine import MoonshineAdapter

        assert MoonshineAdapter is not None

    def test_inherits_from_asr_adapter(self):
        """MoonshineAdapter must extend ASRAdapter."""
        from backend.asr.adapters.base import ASRAdapter
        from backend.asr.adapters.moonshine import MoonshineAdapter

        assert issubclass(MoonshineAdapter, ASRAdapter)


class TestMoonshineAdapterConfig:
    """Configuration parsing and attribute initialisation."""

    def test_default_model_name(self):
        """Omitting model key defaults to moonshine/tiny."""
        from backend.asr.adapters.moonshine import MoonshineAdapter

        adapter = MoonshineAdapter({})
        assert adapter._model_name == "moonshine/tiny"

    def test_custom_model_name(self):
        """Explicit model key is stored verbatim."""
        from backend.asr.adapters.moonshine import MoonshineAdapter

        adapter = MoonshineAdapter({"model": "moonshine/base"})
        assert adapter._model_name == "moonshine/base"

    def test_language_stored_from_config(self):
        """Language key populates self.language via base class."""
        from backend.asr.adapters.moonshine import MoonshineAdapter

        adapter = MoonshineAdapter({"language": "fr"})
        assert adapter.language == "fr"

    def test_lazy_model_is_none_initially(self):
        """Model object is None before first transcribe call."""
        from backend.asr.adapters.moonshine import MoonshineAdapter

        adapter = MoonshineAdapter({})
        assert adapter._moon_model is None

    def test_moonshine_available_is_none_initially(self):
        """Availability flag starts as None (not yet checked)."""
        from backend.asr.adapters.moonshine import MoonshineAdapter

        adapter = MoonshineAdapter({})
        assert adapter._moonshine_available is None


class TestMoonshineAdapterValidateConfig:
    """validate_config returns bool based on package availability."""

    def test_validate_config_returns_bool(self):
        """validate_config always returns a bool."""
        from backend.asr.adapters.moonshine import MoonshineAdapter

        adapter = MoonshineAdapter({})
        result = adapter.validate_config()
        assert isinstance(result, bool)

    def test_validate_config_false_when_not_installed(self):
        """Returns False when neither moonshine package is importable."""
        from backend.asr.adapters.moonshine import MoonshineAdapter

        adapter = MoonshineAdapter({})
        # Patch both import paths to simulate missing packages
        with patch.dict("sys.modules", {"moonshine": None, "moonshine_onnx": None}):
            result = adapter.validate_config()
        assert result is False


class TestMoonshineAdapterTranscribe:
    """transcribe() behaviour — graceful degradation when model absent."""

    @pytest.mark.asyncio
    async def test_transcribe_returns_dict_when_model_missing(self):
        """Returns a dict (not raises) when moonshine is not installed."""
        from backend.asr.adapters.moonshine import MoonshineAdapter

        adapter = MoonshineAdapter({})
        # Force _load_model to return False
        adapter._moonshine_available = False

        result = await adapter.transcribe(b"fake audio")
        assert isinstance(result, dict)

    @pytest.mark.asyncio
    async def test_transcribe_error_key_when_model_missing(self):
        """Returns 'error' key in dict when moonshine not installed."""
        from backend.asr.adapters.moonshine import MoonshineAdapter

        adapter = MoonshineAdapter({})
        adapter._moonshine_available = False

        result = await adapter.transcribe(b"fake audio")
        assert "error" in result
        assert len(result["error"]) > 0

    @pytest.mark.asyncio
    async def test_transcribe_empty_text_when_model_missing(self):
        """text field is empty string on load failure."""
        from backend.asr.adapters.moonshine import MoonshineAdapter

        adapter = MoonshineAdapter({})
        adapter._moonshine_available = False

        result = await adapter.transcribe(b"fake audio")
        assert result["text"] == ""

    @pytest.mark.asyncio
    async def test_transcribe_zero_confidence_when_model_missing(self):
        """confidence is 0.0 when model could not load."""
        from backend.asr.adapters.moonshine import MoonshineAdapter

        adapter = MoonshineAdapter({})
        adapter._moonshine_available = False

        result = await adapter.transcribe(b"fake audio")
        assert result["confidence"] == 0.0

    @pytest.mark.asyncio
    async def test_transcribe_language_passthrough(self):
        """Explicit language parameter appears in returned dict."""
        from backend.asr.adapters.moonshine import MoonshineAdapter

        adapter = MoonshineAdapter({})
        adapter._moonshine_available = False

        result = await adapter.transcribe(b"audio", language="ja")
        assert result["language"] == "ja"

    @pytest.mark.asyncio
    async def test_transcribe_default_language_from_config(self):
        """Falls back to config language when no explicit language given."""
        from backend.asr.adapters.moonshine import MoonshineAdapter

        adapter = MoonshineAdapter({"language": "de"})
        adapter._moonshine_available = False

        result = await adapter.transcribe(b"audio")
        assert result["language"] == "de"

    @pytest.mark.asyncio
    async def test_transcribe_returns_dict_on_exception(self):
        """If transcription raises internally, result is a dict with error."""
        from backend.asr.adapters.moonshine import MoonshineAdapter

        adapter = MoonshineAdapter({})
        # Pretend model loaded but transcribe method throws
        mock_model = MagicMock()
        mock_model.transcribe.side_effect = RuntimeError("GPU OOM")
        adapter._moon_model = mock_model
        adapter._moonshine_available = True

        # We also need numpy for _wav_bytes_to_float32
        try:
            import numpy  # noqa: F401
            wav = _make_minimal_wav()
            result = await adapter.transcribe(wav)
            assert isinstance(result, dict)
            assert "error" in result
        except ImportError:
            pytest.skip("numpy not available")


class TestMoonshineWavConversion:
    """_wav_bytes_to_float32 static method edge cases."""

    def test_converts_valid_wav(self):
        """Converts a minimal WAV to float32 array."""
        from backend.asr.adapters.moonshine import MoonshineAdapter

        try:
            import numpy as np
        except ImportError:
            pytest.skip("numpy not available")

        wav = _make_minimal_wav()
        arr = MoonshineAdapter._wav_bytes_to_float32(wav)
        assert arr.dtype == np.float32
        assert len(arr) == 1600

    def test_handles_raw_pcm_fallback(self):
        """Falls back gracefully on non-WAV raw PCM bytes."""
        from backend.asr.adapters.moonshine import MoonshineAdapter

        try:
            import numpy as np
        except ImportError:
            pytest.skip("numpy not available")

        # 10 int16 samples as raw bytes
        raw = struct.pack("<10h", *range(10))
        arr = MoonshineAdapter._wav_bytes_to_float32(raw)
        assert arr.dtype == np.float32
        assert len(arr) == 10

    def test_normalises_to_minus_one_to_one(self):
        """Samples are normalised to [-1, 1] range."""
        from backend.asr.adapters.moonshine import MoonshineAdapter

        try:
            import numpy as np
        except ImportError:
            pytest.skip("numpy not available")

        # max int16 value should map to exactly 1.0 after normalisation (approx)
        raw = struct.pack("<1h", 32767)
        arr = MoonshineAdapter._wav_bytes_to_float32(raw)
        assert arr[0] == pytest.approx(32767 / 32768.0)


# ===========================================================================
# 2. Scenario Templates
# ===========================================================================


class TestScenarioTemplateEnsureTable:
    """_ensure_table creates the scenario_templates table."""

    def test_ensure_table_creates_table(self):
        """Table is created on first call and visible via sqlite_master."""
        from backend.scenario.templates import _ensure_table

        conn = sqlite3.connect(":memory:")
        _ensure_table(conn)
        tables = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='scenario_templates'"
        ).fetchone()
        assert tables is not None

    def test_ensure_table_idempotent(self):
        """Calling _ensure_table twice does not raise."""
        from backend.scenario.templates import _ensure_table

        conn = sqlite3.connect(":memory:")
        _ensure_table(conn)
        _ensure_table(conn)  # must not raise


class TestScenarioTemplateCreate:
    """create_template CRUD and validation."""

    def test_create_template_returns_scenario_template(self):
        """Returns a ScenarioTemplate instance."""
        from backend.scenario.templates import ScenarioTemplate, create_template

        conn = sqlite3.connect(":memory:")
        t = create_template(1, "My Scene", "A cozy room.", conn)
        assert isinstance(t, ScenarioTemplate)

    def test_create_template_assigns_id(self):
        """Returned template has a positive integer ID."""
        from backend.scenario.templates import create_template

        conn = sqlite3.connect(":memory:")
        t = create_template(1, "My Scene", "A cozy room.", conn)
        assert t.id > 0

    def test_create_template_stores_fields(self):
        """title, description, char_id are persisted correctly."""
        from backend.scenario.templates import create_template

        conn = sqlite3.connect(":memory:")
        t = create_template(2, "Rainy Cafe", "Rain patters on the windows.", conn)
        assert t.char_id == 2
        assert t.title == "Rainy Cafe"
        assert t.description == "Rain patters on the windows."

    def test_create_template_with_kwargs(self):
        """Optional kwargs (setting, time_of_day, mood) are stored."""
        from backend.scenario.templates import create_template

        conn = sqlite3.connect(":memory:")
        t = create_template(
            1, "Night Studio", "Lamp glow.",
            conn,
            setting="indoor",
            time_of_day="night",
            mood="cozy",
        )
        assert t.setting == "indoor"
        assert t.time_of_day == "night"
        assert t.mood == "cozy"

    def test_create_template_raises_on_invalid_char_id(self):
        """char_id <= 0 raises ValueError."""
        from backend.scenario.templates import create_template

        conn = sqlite3.connect(":memory:")
        with pytest.raises(ValueError, match="char_id must be positive"):
            create_template(0, "Title", "Description.", conn)

    def test_create_template_raises_on_empty_title(self):
        """Empty title raises ValueError."""
        from backend.scenario.templates import create_template

        conn = sqlite3.connect(":memory:")
        with pytest.raises(ValueError, match="title must not be empty"):
            create_template(1, "   ", "Description.", conn)

    def test_create_template_raises_on_empty_description(self):
        """Empty description raises ValueError."""
        from backend.scenario.templates import create_template

        conn = sqlite3.connect(":memory:")
        with pytest.raises(ValueError, match="description must not be empty"):
            create_template(1, "Title", "   ", conn)

    def test_create_template_strips_whitespace(self):
        """Leading/trailing whitespace is stripped from title and description."""
        from backend.scenario.templates import create_template

        conn = sqlite3.connect(":memory:")
        t = create_template(1, "  My Title  ", "  My Desc.  ", conn)
        assert t.title == "My Title"
        assert t.description == "My Desc."


class TestScenarioTemplateGet:
    """get_templates and get_template queries."""

    def test_get_templates_empty(self):
        """No templates → empty list."""
        from backend.scenario.templates import get_templates

        conn = sqlite3.connect(":memory:")
        result = get_templates(1, conn)
        assert result == []

    def test_get_templates_returns_all_for_char(self):
        """Returns all templates belonging to the given char_id."""
        from backend.scenario.templates import create_template, get_templates

        conn = sqlite3.connect(":memory:")
        create_template(1, "Scene A", "Desc A.", conn)
        create_template(1, "Scene B", "Desc B.", conn)
        result = get_templates(1, conn)
        assert len(result) == 2

    def test_get_templates_filters_by_char_id(self):
        """Templates for a different char_id are excluded."""
        from backend.scenario.templates import create_template, get_templates

        conn = sqlite3.connect(":memory:")
        create_template(1, "Scene for char 1", "Desc.", conn)
        create_template(2, "Scene for char 2", "Desc.", conn)
        result = get_templates(1, conn)
        assert len(result) == 1
        assert result[0].char_id == 1

    def test_get_templates_default_first_ordering(self):
        """Default template is first in the returned list."""
        from backend.scenario.templates import create_template, get_templates

        conn = sqlite3.connect(":memory:")
        create_template(1, "Normal Scene", "Desc.", conn)
        create_template(1, "Default Scene", "Desc.", conn, is_default=True)
        result = get_templates(1, conn)
        assert result[0].is_default is True


class TestScenarioTemplateUpdate:
    """update_template modifies existing records."""

    def test_update_template_returns_true(self):
        """Successful update returns True."""
        from backend.scenario.templates import create_template, update_template

        conn = sqlite3.connect(":memory:")
        t = create_template(1, "Old Title", "Old desc.", conn)
        result = update_template(t.id, conn, title="New Title")
        assert result is True

    def test_update_template_persists_change(self):
        """Updated field is readable back from DB."""
        from backend.scenario.templates import create_template, get_template, update_template

        conn = sqlite3.connect(":memory:")
        t = create_template(1, "Old Title", "Old desc.", conn)
        update_template(t.id, conn, title="New Title")
        refreshed = get_template(t.id, conn)
        assert refreshed.title == "New Title"

    def test_update_nonexistent_returns_false(self):
        """Returns False when template ID does not exist."""
        from backend.scenario.templates import update_template

        conn = sqlite3.connect(":memory:")
        result = update_template(9999, conn, title="Ghost")
        assert result is False

    def test_update_no_kwargs_returns_true(self):
        """Calling update with no fields is a no-op that returns True."""
        from backend.scenario.templates import create_template, update_template

        conn = sqlite3.connect(":memory:")
        t = create_template(1, "Title", "Desc.", conn)
        result = update_template(t.id, conn)
        assert result is True


class TestScenarioTemplateDelete:
    """delete_template removes records."""

    def test_delete_template_returns_true(self):
        """Deleting an existing template returns True."""
        from backend.scenario.templates import create_template, delete_template

        conn = sqlite3.connect(":memory:")
        t = create_template(1, "To Delete", "Desc.", conn)
        assert delete_template(t.id, conn) is True

    def test_delete_template_removes_row(self):
        """Row is gone after delete."""
        from backend.scenario.templates import create_template, delete_template, get_template

        conn = sqlite3.connect(":memory:")
        t = create_template(1, "Goodbye", "Desc.", conn)
        delete_template(t.id, conn)
        assert get_template(t.id, conn) is None

    def test_delete_nonexistent_returns_false(self):
        """Deleting a non-existent ID returns False."""
        from backend.scenario.templates import delete_template

        conn = sqlite3.connect(":memory:")
        assert delete_template(9999, conn) is False


class TestScenarioTemplateDefault:
    """Default template constraint — only one default per character."""

    def test_default_template_is_marked(self):
        """Creating with is_default=True sets is_default on returned object."""
        from backend.scenario.templates import create_template

        conn = sqlite3.connect(":memory:")
        t = create_template(1, "Default", "Desc.", conn, is_default=True)
        assert t.is_default is True

    def test_only_one_default_per_char(self):
        """Creating a second default clears the first."""
        from backend.scenario.templates import create_template, get_template

        conn = sqlite3.connect(":memory:")
        first = create_template(1, "First", "Desc.", conn, is_default=True)
        _second = create_template(1, "Second", "Desc.", conn, is_default=True)
        # First should no longer be default
        refreshed_first = get_template(first.id, conn)
        assert refreshed_first.is_default is False

    def test_get_active_template_returns_default(self):
        """get_active_template returns the default when no session override."""
        from backend.scenario.templates import create_template, get_active_template

        conn = _make_mem_db()
        session_id = _insert_session(conn, char_id=1)
        t = create_template(1, "Default Scene", "Desc.", conn, is_default=True)
        active = get_active_template(1, session_id, conn)
        assert active is not None
        assert active.id == t.id


class TestScenarioTemplateActivate:
    """activate_template writes to sessions table."""

    def test_activate_template_returns_true(self):
        """Activating an existing template for an existing session returns True."""
        from backend.scenario.templates import activate_template, create_template

        conn = _make_mem_db()
        session_id = _insert_session(conn)
        t = create_template(1, "Active Scene", "Desc.", conn)
        result = activate_template(t.id, session_id, conn)
        assert result is True

    def test_activate_template_writes_scene_context(self):
        """scene_context column holds the template ID as string after activation."""
        from backend.scenario.templates import activate_template, create_template

        conn = _make_mem_db()
        session_id = _insert_session(conn)
        t = create_template(1, "Active Scene", "Desc.", conn)
        activate_template(t.id, session_id, conn)
        row = conn.execute(
            "SELECT scene_context, scene_enabled FROM sessions WHERE id = ?",
            (session_id,),
        ).fetchone()
        assert row[0] == str(t.id)
        assert row[1] == 1

    def test_activate_nonexistent_template_returns_false(self):
        """Activating a template that does not exist returns False."""
        from backend.scenario.templates import activate_template

        conn = _make_mem_db()
        session_id = _insert_session(conn)
        result = activate_template(9999, session_id, conn)
        assert result is False

    def test_activate_nonexistent_session_returns_false(self):
        """Activating for a session that does not exist returns False."""
        from backend.scenario.templates import activate_template, create_template

        conn = _make_mem_db()
        t = create_template(1, "Scene", "Desc.", conn)
        result = activate_template(t.id, 99999, conn)
        assert result is False

    def test_get_active_template_session_override(self):
        """Session-level activation overrides character default."""
        from backend.scenario.templates import (
            activate_template,
            create_template,
            get_active_template,
        )

        conn = _make_mem_db()
        session_id = _insert_session(conn, char_id=1)
        default_t = create_template(1, "Default", "Desc.", conn, is_default=True)
        override_t = create_template(1, "Override", "Different scene.", conn)
        activate_template(override_t.id, session_id, conn)
        active = get_active_template(1, session_id, conn)
        assert active is not None
        assert active.id == override_t.id
        assert active.id != default_t.id

    def test_deactivate_with_zero_clears_scene(self):
        """activate_template(0, ...) sets scene_enabled=0 and clears scene_context."""
        from backend.scenario.templates import activate_template, create_template

        conn = _make_mem_db()
        session_id = _insert_session(conn)
        t = create_template(1, "Scene", "Desc.", conn)
        activate_template(t.id, session_id, conn)
        activate_template(0, session_id, conn)
        row = conn.execute(
            "SELECT scene_context, scene_enabled FROM sessions WHERE id = ?",
            (session_id,),
        ).fetchone()
        assert row[1] == 0


class TestBuildScenarioPrompt:
    """build_scenario_prompt formats output correctly."""

    def _make_template(self):
        """Return a fixture ScenarioTemplate for prompt tests."""
        from backend.scenario.templates import ScenarioTemplate

        return ScenarioTemplate(
            id=1,
            char_id=1,
            title="Late Night Studio",
            description="Painting at her easel by lamplight.",
            setting="indoor",
            time_of_day="night",
            mood="cozy",
        )

    def test_prompt_contains_title(self):
        """Returned string includes the template title."""
        from backend.scenario.templates import build_scenario_prompt

        t = self._make_template()
        prompt = build_scenario_prompt(t)
        assert "Late Night Studio" in prompt

    def test_prompt_contains_description(self):
        """Returned string includes the description text."""
        from backend.scenario.templates import build_scenario_prompt

        t = self._make_template()
        prompt = build_scenario_prompt(t)
        assert "Painting at her easel by lamplight." in prompt

    def test_prompt_contains_setting(self):
        """Setting label appears in the output."""
        from backend.scenario.templates import build_scenario_prompt

        t = self._make_template()
        prompt = build_scenario_prompt(t)
        assert "Indoor" in prompt

    def test_prompt_contains_time_of_day(self):
        """Time-of-day label appears in the output."""
        from backend.scenario.templates import build_scenario_prompt

        t = self._make_template()
        prompt = build_scenario_prompt(t)
        assert "Night" in prompt

    def test_prompt_contains_mood(self):
        """Mood label appears in the output."""
        from backend.scenario.templates import build_scenario_prompt

        t = self._make_template()
        prompt = build_scenario_prompt(t)
        assert "Cozy" in prompt

    def test_prompt_with_char_name_prepended(self):
        """char_name is prepended to description when provided."""
        from backend.scenario.templates import build_scenario_prompt

        t = self._make_template()
        prompt = build_scenario_prompt(t, char_name="Dae")
        assert "Dae" in prompt

    def test_prompt_no_double_prefix_when_description_starts_with_name(self):
        """char_name is NOT prepended when description already starts with it."""
        from backend.scenario.templates import ScenarioTemplate, build_scenario_prompt

        t = ScenarioTemplate(
            id=1,
            char_id=1,
            title="Morning Run",
            description="Dae runs along the riverside trail.",
            setting="outdoor",
            time_of_day="morning",
            mood="energetic",
        )
        prompt = build_scenario_prompt(t, char_name="Dae")
        # Should NOT double-prefix as "Dae — Dae runs..."
        assert "Dae — Dae" not in prompt

    def test_prompt_includes_stay_consistent_line(self):
        """Closing instruction line is always present."""
        from backend.scenario.templates import build_scenario_prompt

        t = self._make_template()
        prompt = build_scenario_prompt(t)
        assert "Stay consistent with this scene" in prompt


class TestGenerateRandomScenario:
    """generate_random_scenario picks templates randomly."""

    def test_returns_none_when_empty(self):
        """Returns None when no templates exist for the character."""
        from backend.scenario.templates import generate_random_scenario

        conn = sqlite3.connect(":memory:")
        result = generate_random_scenario(1, conn)
        assert result is None

    def test_returns_template_when_present(self):
        """Returns a ScenarioTemplate when at least one exists."""
        from backend.scenario.templates import (
            ScenarioTemplate,
            create_template,
            generate_random_scenario,
        )

        conn = sqlite3.connect(":memory:")
        create_template(1, "Random Scene", "Desc.", conn)
        result = generate_random_scenario(1, conn)
        assert isinstance(result, ScenarioTemplate)

    def test_mood_filter_returns_matching(self):
        """Templates matching the mood are returned when filter is active."""
        from backend.scenario.templates import create_template, generate_random_scenario

        conn = sqlite3.connect(":memory:")
        create_template(1, "Cozy Scene", "Desc.", conn, mood="cozy")
        create_template(1, "Tense Scene", "Desc.", conn, mood="tense")
        result = generate_random_scenario(1, conn, mood="cozy")
        assert result is not None
        assert result.mood == "cozy"

    def test_mood_filter_returns_none_when_no_match(self):
        """Returns None when mood filter matches no templates."""
        from backend.scenario.templates import create_template, generate_random_scenario

        conn = sqlite3.connect(":memory:")
        create_template(1, "Cozy Scene", "Desc.", conn, mood="cozy")
        result = generate_random_scenario(1, conn, mood="romantic")
        assert result is None

    def test_any_mood_returns_any_template(self):
        """mood='any' returns from the full pool regardless of template mood."""
        from backend.scenario.templates import create_template, generate_random_scenario

        conn = sqlite3.connect(":memory:")
        create_template(1, "Cozy Scene", "Desc.", conn, mood="cozy")
        create_template(1, "Tense Scene", "Desc.", conn, mood="tense")
        result = generate_random_scenario(1, conn, mood="any")
        assert result is not None


# ===========================================================================
# 3. Structured Director
# ===========================================================================


class TestDirectorStateDefaults:
    """DirectorState default values and is_default helper."""

    def test_dataclass_default_pacing(self):
        """Default pacing is 'normal'."""
        from backend.director.structured import DirectorState

        s = DirectorState()
        assert s.pacing == "normal"

    def test_dataclass_default_style(self):
        """Default style is 'balanced'."""
        from backend.director.structured import DirectorState

        s = DirectorState()
        assert s.style == "balanced"

    def test_dataclass_default_pacing_messages(self):
        """pacing_messages defaults to 0."""
        from backend.director.structured import DirectorState

        s = DirectorState()
        assert s.pacing_messages == 0

    def test_dataclass_default_pacing_counter(self):
        """pacing_counter defaults to 0."""
        from backend.director.structured import DirectorState

        s = DirectorState()
        assert s.pacing_counter == 0

    def test_dataclass_default_scene_transition(self):
        """scene_transition defaults to empty string."""
        from backend.director.structured import DirectorState

        s = DirectorState()
        assert s.scene_transition == ""

    def test_dataclass_default_involvement_is_empty_dict(self):
        """involvement defaults to an empty dict (not shared between instances)."""
        from backend.director.structured import DirectorState

        s1 = DirectorState()
        s2 = DirectorState()
        assert s1.involvement == {}
        # Mutable defaults must be independent
        s1.involvement["x"] = "active"
        assert "x" not in s2.involvement

    def test_dataclass_default_custom_notes_is_empty_list(self):
        """custom_notes defaults to empty list (not shared between instances)."""
        from backend.director.structured import DirectorState

        s1 = DirectorState()
        s2 = DirectorState()
        assert s1.custom_notes == []
        s1.custom_notes.append("note")
        assert s2.custom_notes == []

    def test_is_default_true_for_fresh_state(self):
        """is_default() returns True when no directives have been applied."""
        from backend.director.structured import DirectorState

        assert DirectorState().is_default() is True

    def test_is_default_false_after_pacing_change(self):
        """is_default() returns False when pacing is non-normal."""
        from backend.director.structured import DirectorState

        s = DirectorState(pacing="slow")
        assert s.is_default() is False

    def test_is_default_false_with_note(self):
        """is_default() returns False when custom_notes is non-empty."""
        from backend.director.structured import DirectorState

        s = DirectorState(custom_notes=["she seems tired"])
        assert s.is_default() is False


class TestDirectorStateSerialisation:
    """to_json / from_json round-trip."""

    def test_to_json_is_valid_json(self):
        """to_json() always returns valid JSON."""
        from backend.director.structured import DirectorState

        raw = DirectorState(pacing="slow", pacing_messages=3).to_json()
        data = json.loads(raw)
        assert data["pacing"] == "slow"
        assert data["pacing_messages"] == 3

    def test_from_json_round_trips(self):
        """from_json(to_json(s)).pacing == s.pacing."""
        from backend.director.structured import DirectorState

        s = DirectorState(pacing="fast", style="action", custom_notes=["test note"])
        s2 = DirectorState.from_json(s.to_json())
        assert s2.pacing == "fast"
        assert s2.style == "action"
        assert s2.custom_notes == ["test note"]

    def test_from_json_empty_string_gives_default(self):
        """from_json('') returns a default DirectorState."""
        from backend.director.structured import DirectorState

        assert DirectorState.from_json("").is_default() is True

    def test_from_json_malformed_gives_default(self):
        """from_json with invalid JSON returns a default DirectorState."""
        from backend.director.structured import DirectorState

        assert DirectorState.from_json("{not valid json}").is_default() is True


class TestParseDirectorCommand:
    """parse_director_command pattern matching."""

    def test_parse_pace_keyword(self):
        """'pace: slow over 3 messages' → type=pacing, value='slow|3'."""
        from backend.director.structured import parse_director_command

        cmd = parse_director_command("pace: slow over 3 messages")
        assert cmd is not None
        assert cmd.type == "pacing"
        assert cmd.value == "slow|3"

    def test_parse_pace_keyword_without_count(self):
        """'pace: fast' → type=pacing, value='fast|0'."""
        from backend.director.structured import parse_director_command

        cmd = parse_director_command("pace: fast")
        assert cmd is not None
        assert cmd.type == "pacing"
        assert "fast" in cmd.value

    def test_parse_style_keyword(self):
        """'style: narration' → type=style, value='narration'."""
        from backend.director.structured import parse_director_command

        cmd = parse_director_command("style: narration")
        assert cmd is not None
        assert cmd.type == "style"
        assert cmd.value == "narration"

    def test_parse_style_alias(self):
        """'style: narrate' resolves to narration via alias map."""
        from backend.director.structured import parse_director_command

        cmd = parse_director_command("style: narrate")
        assert cmd is not None
        assert cmd.value == "narration"

    def test_parse_transition_keyword(self):
        """'transition: fade' → type=transition, value='fade-to-black'."""
        from backend.director.structured import parse_director_command

        cmd = parse_director_command("transition: fade")
        assert cmd is not None
        assert cmd.type == "transition"
        assert cmd.value == "fade-to-black"

    def test_parse_involvement_keyword(self):
        """'involve: Dae active, Luna observing' → type=involvement."""
        from backend.director.structured import parse_director_command

        cmd = parse_director_command("involve: Dae active, Luna observing")
        assert cmd is not None
        assert cmd.type == "involvement"
        assert "Dae" in cmd.value

    def test_parse_note_keyword(self):
        """'note: she looks tired' → type=note, value='she looks tired'."""
        from backend.director.structured import parse_director_command

        cmd = parse_director_command("note: she looks tired")
        assert cmd is not None
        assert cmd.type == "note"
        assert cmd.value == "she looks tired"

    def test_parse_shorthand_slow(self):
        """'/slow 3' → type=pacing, value='slow|3'."""
        from backend.director.structured import parse_director_command

        cmd = parse_director_command("/slow 3")
        assert cmd is not None
        assert cmd.type == "pacing"
        assert cmd.value == "slow|3"

    def test_parse_shorthand_slow_no_count(self):
        """'/slow' without count → type=pacing, value='slow|0'."""
        from backend.director.structured import parse_director_command

        cmd = parse_director_command("/slow")
        assert cmd is not None
        assert cmd.type == "pacing"
        assert cmd.value == "slow|0"

    def test_parse_shorthand_narrate(self):
        """'/narrate' → type=style, value='narration'."""
        from backend.director.structured import parse_director_command

        cmd = parse_director_command("/narrate")
        assert cmd is not None
        assert cmd.type == "style"
        assert cmd.value == "narration"

    def test_parse_shorthand_skip(self):
        """'/skip' → type=pacing."""
        from backend.director.structured import parse_director_command

        cmd = parse_director_command("/skip")
        assert cmd is not None
        assert cmd.type == "pacing"

    def test_parse_shorthand_fade(self):
        """'/fade' → type=transition, value='fade-to-black'."""
        from backend.director.structured import parse_director_command

        cmd = parse_director_command("/fade")
        assert cmd is not None
        assert cmd.type == "transition"
        assert cmd.value == "fade-to-black"

    def test_parse_shorthand_cut(self):
        """'/cut' → type=transition, value='hard-cut'."""
        from backend.director.structured import parse_director_command

        cmd = parse_director_command("/cut")
        assert cmd is not None
        assert cmd.type == "transition"
        assert cmd.value == "hard-cut"

    def test_parse_unrecognised_returns_none(self):
        """Plain conversational text returns None."""
        from backend.director.structured import parse_director_command

        assert parse_director_command("hello there") is None
        assert parse_director_command("What are you doing?") is None
        assert parse_director_command("") is None

    def test_raw_field_preserved(self):
        """raw field on returned command equals the original input string."""
        from backend.director.structured import parse_director_command

        original = "pace: slow over 2 messages"
        cmd = parse_director_command(original)
        assert cmd.raw == original


class TestApplyCommand:
    """apply_command mutates state fields correctly."""

    def test_apply_pacing_command(self):
        """Pacing command updates state.pacing."""
        from backend.director.structured import DirectorCommand, DirectorState, apply_command

        s = DirectorState()
        cmd = DirectorCommand(type="pacing", value="slow|3", raw="/slow 3")
        s2 = apply_command(s, cmd)
        assert s2.pacing == "slow"
        assert s2.pacing_messages == 3
        assert s2.pacing_counter == 0

    def test_apply_pacing_resets_counter(self):
        """Applying a new pacing command resets pacing_counter to 0."""
        from backend.director.structured import DirectorCommand, DirectorState, apply_command

        s = DirectorState(pacing="slow", pacing_messages=5, pacing_counter=3)
        cmd = DirectorCommand(type="pacing", value="fast|0", raw="/fast")
        s2 = apply_command(s, cmd)
        assert s2.pacing_counter == 0

    def test_apply_style_command(self):
        """Style command updates state.style."""
        from backend.director.structured import DirectorCommand, DirectorState, apply_command

        s = DirectorState()
        cmd = DirectorCommand(type="style", value="narration", raw="style: narration")
        s2 = apply_command(s, cmd)
        assert s2.style == "narration"

    def test_apply_style_does_not_mutate_original(self):
        """apply_command does not modify the input state."""
        from backend.director.structured import DirectorCommand, DirectorState, apply_command

        s = DirectorState()
        cmd = DirectorCommand(type="style", value="action", raw="/action")
        apply_command(s, cmd)
        assert s.style == "balanced"  # original unchanged

    def test_apply_note_command_appends(self):
        """Note command appends to custom_notes list."""
        from backend.director.structured import DirectorCommand, DirectorState, apply_command

        s = DirectorState(custom_notes=["existing note"])
        cmd = DirectorCommand(type="note", value="new note", raw="note: new note")
        s2 = apply_command(s, cmd)
        assert "existing note" in s2.custom_notes
        assert "new note" in s2.custom_notes
        assert len(s2.custom_notes) == 2

    def test_apply_involvement_command_adds_characters(self):
        """Involvement command populates the involvement dict."""
        from backend.director.structured import DirectorCommand, DirectorState, apply_command

        s = DirectorState()
        cmd = DirectorCommand(
            type="involvement",
            value="Dae active, Luna observing",
            raw="involve: Dae active, Luna observing",
        )
        s2 = apply_command(s, cmd)
        assert s2.involvement.get("Dae") == "active"
        assert s2.involvement.get("Luna") == "observing"

    def test_apply_involvement_absent_removes_character(self):
        """Involvement 'absent' removes character from involvement dict."""
        from backend.director.structured import DirectorCommand, DirectorState, apply_command

        s = DirectorState(involvement={"Dae": "active", "Luna": "observing"})
        cmd = DirectorCommand(type="involvement", value="Luna absent", raw="involve: Luna absent")
        s2 = apply_command(s, cmd)
        assert "Luna" not in s2.involvement
        assert "Dae" in s2.involvement

    def test_apply_transition_command(self):
        """Transition command sets scene_transition field."""
        from backend.director.structured import DirectorCommand, DirectorState, apply_command

        s = DirectorState()
        cmd = DirectorCommand(type="transition", value="fade-to-black", raw="/fade")
        s2 = apply_command(s, cmd)
        assert s2.scene_transition == "fade-to-black"


class TestBuildDirectorPromptBlock:
    """build_director_prompt_block renders state into prompt text."""

    def test_default_state_returns_empty(self):
        """All-default state returns empty string (no wasted tokens)."""
        from backend.director.structured import DirectorState, build_director_prompt_block

        assert build_director_prompt_block(DirectorState()) == ""

    def test_non_default_pacing_includes_director_header(self):
        """Non-default state begins with '[Director Mode'."""
        from backend.director.structured import DirectorState, build_director_prompt_block

        s = DirectorState(pacing="slow")
        block = build_director_prompt_block(s)
        assert block.startswith("[Director Mode")

    def test_pacing_info_in_prompt(self):
        """Pacing mode name appears in the prompt."""
        from backend.director.structured import DirectorState, build_director_prompt_block

        s = DirectorState(pacing="slow")
        block = build_director_prompt_block(s)
        assert "Slow" in block

    def test_pacing_countdown_in_prompt(self):
        """Remaining messages counter is shown when pacing_messages > 0."""
        from backend.director.structured import DirectorState, build_director_prompt_block

        s = DirectorState(pacing="slow", pacing_messages=3, pacing_counter=1)
        block = build_director_prompt_block(s)
        assert "2/3 messages remaining" in block

    def test_style_info_in_prompt(self):
        """Non-balanced style appears in the prompt."""
        from backend.director.structured import DirectorState, build_director_prompt_block

        s = DirectorState(style="narration")
        block = build_director_prompt_block(s)
        assert "Narration-heavy" in block

    def test_custom_notes_in_prompt(self):
        """Custom notes are rendered in the prompt block."""
        from backend.director.structured import DirectorState, build_director_prompt_block

        s = DirectorState(custom_notes=["she looks distracted"])
        block = build_director_prompt_block(s)
        assert "she looks distracted" in block

    def test_transition_in_prompt(self):
        """Active scene transition label appears in prompt."""
        from backend.director.structured import DirectorState, build_director_prompt_block

        s = DirectorState(scene_transition="fade-to-black")
        block = build_director_prompt_block(s)
        assert "Fade-to-black" in block

    def test_involvement_in_prompt(self):
        """Character involvement appears in prompt."""
        from backend.director.structured import DirectorState, build_director_prompt_block

        s = DirectorState(involvement={"Dae": "active", "Luna": "observing"})
        block = build_director_prompt_block(s)
        assert "Dae" in block
        assert "Luna" in block


class TestAdvancePacing:
    """advance_pacing counter and reset logic."""

    def test_advance_increments_counter(self):
        """Counter increases by 1 each call."""
        from backend.director.structured import DirectorState, advance_pacing

        s = DirectorState(pacing="slow", pacing_messages=5, pacing_counter=0)
        s2 = advance_pacing(s)
        assert s2.pacing_counter == 1

    def test_advance_resets_at_limit(self):
        """Pacing resets to normal when counter reaches pacing_messages."""
        from backend.director.structured import DirectorState, advance_pacing

        s = DirectorState(pacing="slow", pacing_messages=2, pacing_counter=1)
        s2 = advance_pacing(s)
        assert s2.pacing == "normal"
        assert s2.pacing_messages == 0
        assert s2.pacing_counter == 0

    def test_advance_noop_on_normal(self):
        """advance_pacing is a no-op when pacing is already 'normal'."""
        from backend.director.structured import DirectorState, advance_pacing

        s = DirectorState()
        s2 = advance_pacing(s)
        assert s2 is s  # must return same object (unchanged)

    def test_advance_noop_when_indefinite(self):
        """advance_pacing is a no-op when pacing_messages==0 (indefinite)."""
        from backend.director.structured import DirectorState, advance_pacing

        s = DirectorState(pacing="slow", pacing_messages=0)
        s2 = advance_pacing(s)
        assert s2 is s

    def test_advance_two_steps_to_completion(self):
        """Two consecutive advance calls with pacing_messages=2 resets pacing."""
        from backend.director.structured import DirectorState, advance_pacing

        s = DirectorState(pacing="slow", pacing_messages=2, pacing_counter=0)
        s = advance_pacing(s)
        assert s.pacing_counter == 1
        s = advance_pacing(s)
        assert s.pacing == "normal"


class TestDirectorStatePersistence:
    """save_director_state / load_director_state DB round-trip."""

    def test_save_and_load_round_trip(self):
        """State saved to DB can be loaded back with identical fields."""
        from backend.director.structured import (
            DirectorState,
            load_director_state,
            save_director_state,
        )

        conn = _make_mem_db()
        session_id = _insert_session(conn)
        original = DirectorState(pacing="fast", style="action", custom_notes=["keep it tense"])
        save_director_state(session_id, original, conn)
        loaded = load_director_state(session_id, conn)
        assert loaded.pacing == "fast"
        assert loaded.style == "action"
        assert loaded.custom_notes == ["keep it tense"]

    def test_load_missing_session_returns_default(self):
        """Loading a non-existent session returns default DirectorState."""
        from backend.director.structured import DirectorState, load_director_state

        conn = _make_mem_db()
        state = load_director_state(9999, conn)
        assert state.is_default() is True

    def test_load_empty_state_returns_default(self):
        """Loading a session with no saved state returns default DirectorState."""
        from backend.director.structured import DirectorState, load_director_state

        conn = _make_mem_db()
        session_id = _insert_session(conn)
        state = load_director_state(session_id, conn)
        assert state.is_default() is True

    def test_save_overwrites_previous_state(self):
        """Saving a second state for same session replaces the first."""
        from backend.director.structured import (
            DirectorState,
            load_director_state,
            save_director_state,
        )

        conn = _make_mem_db()
        session_id = _insert_session(conn)
        save_director_state(session_id, DirectorState(pacing="slow"), conn)
        save_director_state(session_id, DirectorState(pacing="fast"), conn)
        loaded = load_director_state(session_id, conn)
        assert loaded.pacing == "fast"

    def test_load_state_missing_director_column(self):
        """load_director_state handles sessions table without director_state column."""
        from backend.director.structured import load_director_state

        # Sessions table WITHOUT director_state column
        conn = sqlite3.connect(":memory:")
        conn.execute("CREATE TABLE sessions (id INTEGER PRIMARY KEY)")
        conn.execute("INSERT INTO sessions (id) VALUES (1)")
        conn.commit()
        # Should not raise; column is added on demand
        state = load_director_state(1, conn)
        assert state.is_default() is True
