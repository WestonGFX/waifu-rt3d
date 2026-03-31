"""Tests for NSFW Phase 7 — Visual & Image Generation features.

Covers F29 Intimate Image Gen, F42 Gallery, F28 NSFW Portraits,
F19 Arousal Visuals, F27 Whisper Mode.  All pure-unit tests.
"""

from __future__ import annotations

# ---------------------------------------------------------------------------
# F29: Contextual Intimate Image Generation
# ---------------------------------------------------------------------------

from backend.image_gen.intimate_gen import IntimateImageEngine


class TestIntimateImageGating:
    def test_sfw_always_allowed(self) -> None:
        e = IntimateImageEngine()
        assert e.should_allow(0, False, "sfw") is True

    def test_suggestive_needs_nsfw_and_bond(self) -> None:
        e = IntimateImageEngine()
        assert e.should_allow(50, True, "suggestive") is True
        assert e.should_allow(50, False, "suggestive") is False
        assert e.should_allow(40, True, "suggestive") is False

    def test_explicit_needs_high_bond(self) -> None:
        e = IntimateImageEngine()
        assert e.should_allow(80, True, "explicit") is True
        assert e.should_allow(70, True, "explicit") is False

    def test_content_level_nsfw_off(self) -> None:
        e = IntimateImageEngine()
        assert e.get_content_level(90, False) == "sfw"

    def test_content_level_high_bond(self) -> None:
        e = IntimateImageEngine()
        level = e.get_content_level(90, True)
        assert level == "explicit"


class TestIntimateImagePrompt:
    def test_prompt_returns_dict(self) -> None:
        e = IntimateImageEngine()
        result = e.build_intimate_prompt("Dae", "romantic scene", 80, "dressed", "romantic")
        assert "positive" in result
        assert "negative" in result

    def test_prompt_contains_char_hints(self) -> None:
        e = IntimateImageEngine()
        result = e.get_prompt_for_level("Dae (Neciridae)", "sfw", "romantic")
        assert isinstance(result, dict)
        assert "positive" in result


# ---------------------------------------------------------------------------
# F42: Intimate Photo Gallery
# ---------------------------------------------------------------------------

from backend.image_gen.gallery import GalleryManager
import sqlite3


class TestGalleryManager:
    def _make_db(self):
        con = sqlite3.connect(":memory:")
        con.row_factory = sqlite3.Row
        con.execute("""CREATE TABLE intimate_gallery (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            char_id INTEGER NOT NULL,
            image_path TEXT NOT NULL,
            prompt_used TEXT NOT NULL DEFAULT '',
            scene_context TEXT NOT NULL DEFAULT '',
            mood TEXT NOT NULL DEFAULT 'romantic',
            intimacy_level INTEGER NOT NULL DEFAULT 0,
            is_favorite INTEGER NOT NULL DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now'))
        )""")
        con.commit()
        return con

    def test_add_and_get(self) -> None:
        con = self._make_db()
        mgr = GalleryManager()
        entry = mgr.add_image(1, "/path/img.png", "prompt", "context", "romantic", 80, con)
        assert entry is not None
        gallery = mgr.get_gallery(1, con)
        assert len(gallery) >= 1

    def test_toggle_favorite(self) -> None:
        con = self._make_db()
        mgr = GalleryManager()
        mgr.add_image(1, "/img.png", "", "", "romantic", 50, con)
        result = mgr.toggle_favorite(1, con)
        assert isinstance(result, bool)

    def test_stats(self) -> None:
        con = self._make_db()
        mgr = GalleryManager()
        mgr.add_image(1, "/a.png", "", "", "romantic", 50, con)
        mgr.add_image(1, "/b.png", "", "", "passionate", 70, con)
        stats = mgr.get_gallery_stats(1, con)
        assert stats["total"] == 2


# ---------------------------------------------------------------------------
# F28: NSFW Expression Portraits
# ---------------------------------------------------------------------------

from backend.image_gen.nsfw_portraits import NSFWPortraitEngine, INTIMATE_EMOTIONS


class TestNSFWPortraits:
    def test_five_emotions(self) -> None:
        assert len(INTIMATE_EMOTIONS) == 5

    def test_bond_gate(self) -> None:
        e = NSFWPortraitEngine()
        assert e.should_allow(50, True) is True
        assert e.should_allow(49, True) is False
        assert e.should_allow(50, False) is False

    def test_available_emotions(self) -> None:
        e = NSFWPortraitEngine()
        emotions = e.get_available_emotions()
        assert len(emotions) == 5
        assert all("id" in em for em in emotions)

    def test_build_prompt(self) -> None:
        e = NSFWPortraitEngine()
        result = e.build_portrait_prompt("Dae (Neciridae)", "aroused")
        assert "positive" in result
        assert "negative" in result

    def test_unknown_emotion(self) -> None:
        e = NSFWPortraitEngine()
        info = e.get_emotion_info("nonexistent")
        assert info is None


# ---------------------------------------------------------------------------
# F19: Blush & Arousal Visuals
# ---------------------------------------------------------------------------

from backend.emotion.arousal_visuals import ArousalVisualsEngine


class TestArousalVisuals:
    def test_tier_none(self) -> None:
        e = ArousalVisualsEngine()
        assert e.get_arousal_tier(2.0) == "none"

    def test_tier_light(self) -> None:
        e = ArousalVisualsEngine()
        assert e.get_arousal_tier(4.5) == "light"

    def test_tier_moderate(self) -> None:
        e = ArousalVisualsEngine()
        assert e.get_arousal_tier(6.5) == "moderate"

    def test_tier_intense(self) -> None:
        e = ArousalVisualsEngine()
        assert e.get_arousal_tier(8.5) == "intense"

    def test_tier_peak(self) -> None:
        e = ArousalVisualsEngine()
        assert e.get_arousal_tier(10.0) == "peak"

    def test_visual_params(self) -> None:
        e = ArousalVisualsEngine()
        params = e.get_visual_params(7.0)
        assert "blush_intensity" in params
        assert "eye_openness" in params
        assert "lip_part" in params

    def test_blend_shapes(self) -> None:
        e = ArousalVisualsEngine()
        shapes = e.get_blend_shapes(8.0)
        assert "blushStrength" in shapes or "blush_intensity" in shapes

    def test_should_update(self) -> None:
        e = ArousalVisualsEngine()
        assert e.should_update(3.0, 5.0) is True
        assert e.should_update(5.0, 5.1) is False

    def test_update_message(self) -> None:
        e = ArousalVisualsEngine()
        msg = e.build_update_message(7.0)
        assert msg["type"] == "arousal_visual_update"
        assert "params" in msg


# ---------------------------------------------------------------------------
# F27: Whisper Mode
# ---------------------------------------------------------------------------

from backend.content.whisper_mode import WhisperEngine, CHARACTER_WHISPER_STYLE


class TestWhisperMode:
    def test_auto_trigger(self) -> None:
        e = WhisperEngine()
        assert e.should_auto_trigger(80, 5.0) is True
        assert e.should_auto_trigger(50, 5.0) is False
        assert e.should_auto_trigger(80, 2.0) is False

    def test_is_active(self) -> None:
        e = WhisperEngine()
        assert e.is_active("whisper") is True
        assert e.is_active("normal") is False

    def test_style_mapping(self) -> None:
        e = WhisperEngine()
        assert e.get_style("Luna (Tsukimi)") == "natural_whisperer"
        assert len(CHARACTER_WHISPER_STYLE) >= 12

    def test_prompt_tag(self) -> None:
        e = WhisperEngine()
        prompt = e.get_prompt("Dae (Neciridae)")
        assert "[WHISPER_MODE]" in prompt

    def test_tts_params(self) -> None:
        e = WhisperEngine()
        params = e.get_tts_params()
        assert params["speed"] < 1.0
        assert params["energy"] < 0

    def test_ui_overrides(self) -> None:
        e = WhisperEngine()
        ui = e.get_ui_overrides()
        assert ui["font_style"] == "italic"
        assert ui["background_dim"] > 0
