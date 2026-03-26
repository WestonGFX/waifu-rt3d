"""Tests for speech emotion detection module."""

import struct
from unittest.mock import MagicMock, patch

import pytest

from backend.voice.emotion_detector import (
    CONFIDENCE_THRESHOLD,
    EMOTION_CLASSES,
    EMOTION_HINTS,
    EMOTION_TO_MOOD,
    SpeechEmotionDetector,
    SpeechEmotionResult,
)


# ── Result dataclass ──────────────────────────────────────────────────────────


class TestSpeechEmotionResult:
    """Tests for the SpeechEmotionResult dataclass."""

    def test_default_values(self) -> None:
        result = SpeechEmotionResult()
        assert result.emotion == "neutral"
        assert result.confidence == 0.0
        assert result.mood_mapping == "neutral"
        assert result.mood_hint == ""
        assert result.all_scores == {}

    def test_custom_values(self) -> None:
        result = SpeechEmotionResult(
            emotion="happy",
            confidence=0.92,
            mood_mapping="joy",
            mood_hint="The user sounds happy and upbeat.",
            all_scores={"happy": 0.92, "neutral": 0.05},
        )
        assert result.emotion == "happy"
        assert result.confidence == 0.92
        assert result.mood_mapping == "joy"
        assert "happy" in result.mood_hint


# ── Emotion mapping tables ────────────────────────────────────────────────────


class TestEmotionMappings:
    """Tests for the static mapping tables."""

    def test_all_emotions_have_mood_mapping(self) -> None:
        for emotion in EMOTION_CLASSES:
            assert emotion in EMOTION_TO_MOOD, f"Missing mood mapping for {emotion}"

    def test_all_emotions_have_hint(self) -> None:
        for emotion in EMOTION_CLASSES:
            assert emotion in EMOTION_HINTS, f"Missing hint for {emotion}"

    def test_neutral_hint_is_empty(self) -> None:
        assert EMOTION_HINTS["neutral"] == ""

    def test_angry_maps_to_anger(self) -> None:
        assert EMOTION_TO_MOOD["angry"] == "anger"

    def test_happy_maps_to_joy(self) -> None:
        assert EMOTION_TO_MOOD["happy"] == "joy"

    def test_sad_maps_to_sadness(self) -> None:
        assert EMOTION_TO_MOOD["sad"] == "sadness"

    def test_nine_emotion_classes(self) -> None:
        assert len(EMOTION_CLASSES) == 9


# ── Detector with mocked model ───────────────────────────────────────────────


class TestSpeechEmotionDetector:
    """Tests for the SpeechEmotionDetector class."""

    def test_graceful_fallback_when_funasr_missing(self) -> None:
        """If funasr is not installed, detector returns neutral."""
        with patch.dict("sys.modules", {"funasr": None}):
            detector = SpeechEmotionDetector()
            detector._available = None  # Force re-check
            # Simulate ImportError on load
            detector._available = False
            result = detector.detect_from_wav(b"RIFF" + b"\x00" * 100)
            assert result.emotion == "neutral"
            assert result.confidence == 0.0

    def test_detect_returns_neutral_when_unavailable(self) -> None:
        detector = SpeechEmotionDetector()
        detector._available = False
        result = detector.detect_from_pcm(b"\x00" * 100)
        assert result.emotion == "neutral"
        assert result.confidence == 0.0

    def test_detect_from_file_when_unavailable(self) -> None:
        detector = SpeechEmotionDetector()
        detector._available = False
        result = detector.detect_from_file("/nonexistent.wav")
        assert result.emotion == "neutral"

    def test_parse_result_happy(self) -> None:
        """Test parsing a mock model output for 'happy'."""
        detector = SpeechEmotionDetector()
        detector._available = True
        detector._model = MagicMock()

        mock_result = [
            {
                "labels": [0, 1, 2, 3, 4, 5, 6, 7, 8],
                "scores": [0.02, 0.01, 0.01, 0.88, 0.03, 0.01, 0.02, 0.01, 0.01],
            }
        ]

        result = detector._parse_result(mock_result)
        assert result.emotion == "happy"
        assert result.confidence == pytest.approx(0.88, abs=0.01)
        assert result.mood_mapping == "joy"
        assert "happy" in result.mood_hint

    def test_parse_result_angry(self) -> None:
        detector = SpeechEmotionDetector()
        mock_result = [
            {
                "labels": [0, 1, 2, 3, 4, 5, 6, 7, 8],
                "scores": [0.85, 0.02, 0.01, 0.01, 0.05, 0.01, 0.03, 0.01, 0.01],
            }
        ]
        result = detector._parse_result(mock_result)
        assert result.emotion == "angry"
        assert result.mood_mapping == "anger"
        assert "frustrated" in result.mood_hint or "angry" in result.mood_hint

    def test_parse_result_sad(self) -> None:
        detector = SpeechEmotionDetector()
        mock_result = [
            {
                "labels": [0, 1, 2, 3, 4, 5, 6, 7, 8],
                "scores": [0.01, 0.01, 0.05, 0.02, 0.03, 0.01, 0.82, 0.03, 0.02],
            }
        ]
        result = detector._parse_result(mock_result)
        assert result.emotion == "sad"
        assert result.mood_mapping == "sadness"

    def test_parse_result_below_threshold(self) -> None:
        """When top confidence is below threshold, return neutral."""
        detector = SpeechEmotionDetector()
        mock_result = [
            {
                "labels": [0, 1, 2, 3, 4, 5, 6, 7, 8],
                "scores": [0.15, 0.10, 0.10, 0.12, 0.13, 0.10, 0.10, 0.10, 0.10],
            }
        ]
        result = detector._parse_result(mock_result)
        assert result.emotion == "neutral"
        assert result.mood_hint == ""

    def test_parse_result_string_labels(self) -> None:
        """Support string labels from model output."""
        detector = SpeechEmotionDetector()
        mock_result = [
            {
                "labels": ["Happy", "Sad", "Neutral"],
                "scores": [0.75, 0.15, 0.10],
            }
        ]
        result = detector._parse_result(mock_result)
        assert result.emotion == "happy"
        assert result.confidence == pytest.approx(0.75, abs=0.01)

    def test_parse_result_empty(self) -> None:
        detector = SpeechEmotionDetector()
        result = detector._parse_result([{}])
        assert result.emotion == "neutral"
        assert result.confidence == 0.0

    def test_parse_result_none(self) -> None:
        detector = SpeechEmotionDetector()
        result = detector._parse_result(None)
        assert result.emotion == "neutral"

    def test_all_scores_populated(self) -> None:
        """Verify all_scores dict is populated with per-class probabilities."""
        detector = SpeechEmotionDetector()
        mock_result = [
            {
                "labels": [0, 1, 2, 3, 4, 5, 6, 7, 8],
                "scores": [0.02, 0.01, 0.01, 0.88, 0.03, 0.01, 0.02, 0.01, 0.01],
            }
        ]
        result = detector._parse_result(mock_result)
        assert len(result.all_scores) == 9
        assert "happy" in result.all_scores
        assert result.all_scores["happy"] == pytest.approx(0.88, abs=0.01)

    def test_confidence_threshold_constant(self) -> None:
        assert 0.0 < CONFIDENCE_THRESHOLD < 1.0

    def test_detect_from_pcm_with_mock(self) -> None:
        """Test PCM detection flow with mocked model."""
        detector = SpeechEmotionDetector()
        detector._available = True
        mock_model = MagicMock()
        mock_model.generate.return_value = [
            {
                "labels": [0, 1, 2, 3, 4, 5, 6, 7, 8],
                "scores": [0.01, 0.01, 0.01, 0.90, 0.02, 0.01, 0.02, 0.01, 0.01],
            }
        ]
        detector._model = mock_model

        # Generate 0.5s of silence as 16-bit PCM at 16kHz
        n_samples = 8000
        pcm = struct.pack(f"<{n_samples}h", *([0] * n_samples))

        result = detector.detect_from_pcm(pcm, sample_rate=16000)
        assert result.emotion == "happy"
        assert mock_model.generate.called
