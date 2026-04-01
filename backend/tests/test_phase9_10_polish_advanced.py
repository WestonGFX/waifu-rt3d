"""Tests for NSFW Phase 9 (Polish) + Phase 10 (Advanced) features.

Covers F24 Clothing, F26 Scene Scoring, F20 Bookmarks, F48 Playlist,
F49 Dual Track, F50 Negotiation, F51 Recovery, F52 Spontaneity,
F53 Soundscapes, F54 Physical Tells, F55 Desire Arcs, F56 Mini-Games.
"""

from __future__ import annotations

# --- F24: Clothing ---
from backend.content.clothing import ClothingEngine

class TestClothing:
    def test_detect_change(self) -> None:
        e = ClothingEngine()
        result = e.detect_clothing_change("She takes off her jacket slowly")
        assert result is not None

    def test_no_change(self) -> None:
        e = ClothingEngine()
        assert e.detect_clothing_change("Hello, how are you?") is None

    def test_prompt_tag(self) -> None:
        e = ClothingEngine()
        prompt = e.get_clothing_prompt("Dae (Neciridae)", "dressed")
        assert "[CLOTHING_STATE]" in prompt


# --- F26: Scene Scoring ---
from backend.adaptive.scene_scoring import SceneScoringEngine

class TestSceneScoring:
    def test_score_range(self) -> None:
        e = SceneScoringEngine()
        score = e.score_pacing(["FLIRTY", "SUGGESTIVE", "INTIMATE"], 15)
        assert 1 <= score <= 5

    def test_overall(self) -> None:
        e = SceneScoringEngine()
        scores = {"pacing_quality": 4, "emotional_depth": 3, "user_engagement": 5, "variety": 3, "natural_flow": 4}
        overall = e.get_overall_score(scores)
        assert 1.0 <= overall <= 5.0


# --- F20: Bookmarks ---
from backend.content.bookmarks import BookmarkEngine

class TestBookmarks:
    def test_categorize_romantic(self) -> None:
        e = BookmarkEngine()
        assert e.categorize_message("I love you with all my heart") == "romantic"

    def test_categorize_funny(self) -> None:
        e = BookmarkEngine()
        assert e.categorize_message("hahaha that's hilarious") == "funny"

    def test_categorize_general(self) -> None:
        e = BookmarkEngine()
        assert e.categorize_message("hello there") == "general"

    def test_export(self) -> None:
        e = BookmarkEngine()
        text = e.build_export_text([
            {"role": "assistant", "content": "I love you", "created_at": "2026-03-30"},
        ], "Dae")
        assert "I love you" in text


# --- F48: Playlist ---
from backend.emotional.playlist import PlaylistEngine

class TestPlaylist:
    def test_moods(self) -> None:
        e = PlaylistEngine()
        assert len(e.get_available_moods()) >= 5

    def test_tracks(self) -> None:
        e = PlaylistEngine()
        tracks = e.get_mood_tracks("romantic")
        assert len(tracks) >= 3

    def test_genre(self) -> None:
        e = PlaylistEngine()
        assert e.get_character_genre("Dae (Neciridae)") == "indie_art"

    def test_suggestion_prompt(self) -> None:
        e = PlaylistEngine()
        prompt = e.get_suggestion_prompt("Dae (Neciridae)", "romantic")
        assert prompt is not None
        assert "[PLAYLIST_SUGGESTION]" in prompt


# --- F49: Dual Track ---
from backend.content.dual_track import DualTrackEngine

class TestDualTrack:
    def test_classify_emotional(self) -> None:
        e = DualTrackEngine()
        signals = e.classify_signals("I trust you with all my feelings")
        assert signals["emotional"] > 0

    def test_classify_physical(self) -> None:
        e = DualTrackEngine()
        signals = e.classify_signals("I want to touch you and hold you close")
        assert signals["physical"] > 0

    def test_dominant_track(self) -> None:
        e = DualTrackEngine()
        assert e.get_dominant_track(80, 30) == "emotional_dominant"
        assert e.get_dominant_track(30, 80) == "physical_dominant"

    def test_combined(self) -> None:
        e = DualTrackEngine()
        combined = e.calculate_combined("Dae (Neciridae)", 60, 40)
        assert 0 <= combined <= 100

    def test_prompt_tag(self) -> None:
        e = DualTrackEngine()
        prompt = e.get_track_prompt(80, 30)
        assert "[DUAL_TRACK]" in prompt


# --- F50: Negotiation ---
from backend.content.negotiation import SceneNegotiator

class TestNegotiation:
    def test_detect_increase(self) -> None:
        e = SceneNegotiator()
        assert e.detect_adjustment("more, don't hold back") == "increase"

    def test_detect_decrease(self) -> None:
        e = SceneNegotiator()
        assert e.detect_adjustment("softer please") == "decrease"

    def test_detect_lock(self) -> None:
        e = SceneNegotiator()
        assert e.detect_adjustment("just like that") == "lock"

    def test_detect_pause(self) -> None:
        e = SceneNegotiator()
        assert e.detect_adjustment("wait, hold on") == "pause"

    def test_no_adjustment(self) -> None:
        e = SceneNegotiator()
        assert e.detect_adjustment("Tell me about your day") is None

    def test_lock_duration(self) -> None:
        e = SceneNegotiator()
        assert e.get_lock_duration() == 3

    def test_prompt_tag(self) -> None:
        e = SceneNegotiator()
        prompt = e.get_prompt("Dae (Neciridae)", "decrease")
        assert "[NEGOTIATION]" in prompt


# --- F51: Recovery ---
from backend.emotional.recovery import RecoveryEngine

class TestRecovery:
    def test_detect_conflict(self) -> None:
        e = RecoveryEngine()
        msgs = ["I'm angry", "leave me alone", "I'm upset", "whatever", "fine"]
        assert e.detect_conflict(msgs) is True

    def test_no_conflict(self) -> None:
        e = RecoveryEngine()
        assert e.detect_conflict(["hello", "how are you"]) is False

    def test_stages(self) -> None:
        e = RecoveryEngine()
        assert e.get_recovery_stage(1) == "distance"

    def test_completion(self) -> None:
        e = RecoveryEngine()
        assert e.is_complete("deeper_bond") is True
        assert e.is_complete("distance") is False

    def test_xp(self) -> None:
        e = RecoveryEngine()
        assert e.get_reconciliation_xp() == 20

    def test_prompt_tag(self) -> None:
        e = RecoveryEngine()
        prompt = e.get_prompt("Dae (Neciridae)", "distance")
        assert "[RECOVERY_ACTIVE]" in prompt


# --- F52: Spontaneity ---
from backend.content.spontaneity import SpontaneityEngine

class TestSpontaneity:
    def test_modes(self) -> None:
        e = SpontaneityEngine()
        assert len(e.get_modes()) == 3

    def test_user_only_blocks(self) -> None:
        e = SpontaneityEngine()
        assert e.can_character_initiate("user_only", 90) is False

    def test_character_initiates_with_bond(self) -> None:
        e = SpontaneityEngine()
        assert e.can_character_initiate("character_initiates", 50) is True
        assert e.can_character_initiate("character_initiates", 30) is False

    def test_hints(self) -> None:
        e = SpontaneityEngine()
        assert e.can_character_hint("character_hints") is True
        assert e.can_character_hint("user_only") is False

    def test_prompt_tag(self) -> None:
        e = SpontaneityEngine()
        assert "[SPONTANEITY_MODE]" in e.get_prompt("user_only")


# --- F53: Soundscapes ---
from backend.content.soundscapes import SoundscapeEngine

class TestSoundscapes:
    def test_phase_mapping(self) -> None:
        e = SoundscapeEngine()
        assert e.get_soundscape("INTIMATE") == "fireplace_rain"
        assert e.get_soundscape("INTENSE") == "heartbeat_ambient"

    def test_character_pref(self) -> None:
        e = SoundscapeEngine()
        assert e.get_character_preference("Luna (Tsukimi)") == "rain_wind"
        assert e.get_character_preference("Sable (Kuroha)") == "silence_thunder"

    def test_volume_scaling(self) -> None:
        e = SoundscapeEngine()
        assert e.get_volume(0.0) == 0.1
        assert e.get_volume(1.0) == 0.5

    def test_update_message(self) -> None:
        e = SoundscapeEngine()
        msg = e.build_update_message("INTIMATE", "Luna (Tsukimi)", 0.7)
        assert msg["type"] == "soundscape_update"


# --- F54: Physical Tells ---
from backend.content.physical_tells import PhysicalTellsEngine

class TestPhysicalTells:
    def test_tier_casual(self) -> None:
        e = PhysicalTellsEngine()
        assert e.get_arousal_tier(2.0) == "casual"

    def test_tier_charged(self) -> None:
        e = PhysicalTellsEngine()
        assert e.get_arousal_tier(5.0) == "charged"

    def test_tier_intense(self) -> None:
        e = PhysicalTellsEngine()
        assert e.get_arousal_tier(8.0) == "intense"

    def test_format_tell(self) -> None:
        e = PhysicalTellsEngine()
        formatted = e.format_tell("plays with hair")
        assert "*" in formatted


# --- F55: Desire Arcs ---
from backend.emotional.desire_arcs import DesireArcEngine

class TestDesireArcs:
    def test_bond_gate(self) -> None:
        e = DesireArcEngine()
        assert e.should_allow(40) is True
        assert e.should_allow(39) is False

    def test_available_arcs(self) -> None:
        e = DesireArcEngine()
        arcs = e.get_available_arcs("Dae (Neciridae)")
        assert len(arcs) >= 1

    def test_completion(self) -> None:
        e = DesireArcEngine()
        assert e.is_complete(3, 3) is True
        assert e.is_complete(1, 3) is False


# --- F56: Intimate Mini-Games ---
from backend.games.intimate_games import IntimateGameEngine

class TestIntimateGames:
    def test_available_games(self) -> None:
        e = IntimateGameEngine()
        games = e.get_available_games(50)
        assert len(games) >= 2

    def test_bond_gate(self) -> None:
        e = IntimateGameEngine()
        assert e.should_allow("truth_or_dare", 30) is True
        assert e.should_allow("twenty_questions_intimate", 40) is False

    def test_truth_prompt(self) -> None:
        e = IntimateGameEngine()
        prompt = e.get_truth_prompt("Dae (Neciridae)")
        assert isinstance(prompt, str) and len(prompt) > 0

    def test_game_prompt_tag(self) -> None:
        e = IntimateGameEngine()
        prompt = e.build_game_prompt("Dae (Neciridae)", "truth_or_dare")
        assert "[INTIMATE_GAME]" in prompt
