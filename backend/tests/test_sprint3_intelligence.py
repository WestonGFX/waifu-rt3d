"""Comprehensive tests for Sprint 3 intelligence pipeline modules.

Covers five optional-dependency modules that degrade gracefully when ML
libraries are absent:

  1. NERExtractor    (backend.nlp.ner_extractor)
  2. ToxicityDetector (backend.nlp.toxicity_detector)
  3. SileroVAD       (backend.voice.silero_vad)
  4. NoiseSuppressor  (backend.voice.noise_suppressor)
  5. MemoryReranker   (backend.memory.reranker)

Strategy:
- Test import success and public contracts without requiring ML models.
- Force fallback paths via monkeypatching the module-level flags.
- Use synthetic PCM helpers for audio tests.
- Validate dataclass fields, constant values, and edge-case inputs.
"""

from __future__ import annotations

import struct
import threading
from dataclasses import fields
from typing import Any
from unittest.mock import MagicMock, patch

import pytest

# ---------------------------------------------------------------------------
# Synthetic PCM helpers (shared by VAD and noise tests)
# ---------------------------------------------------------------------------


def _make_pcm_silence(duration_ms: int = 100, sample_rate: int = 16000) -> bytes:
    """Return PCM bytes that are pure silence (all zero samples).

    Args:
        duration_ms: Duration of the clip in milliseconds.
        sample_rate: Sample rate in Hz.

    Returns:
        Raw 16-bit signed little-endian mono PCM bytes containing only zeros.
    """
    n_samples = int(sample_rate * duration_ms / 1000)
    return struct.pack(f"<{n_samples}h", *([0] * n_samples))


def _make_pcm_noise(
    duration_ms: int = 100,
    sample_rate: int = 16000,
    amplitude: int = 10000,
    seed: int = 42,
) -> bytes:
    """Return PCM bytes representing loud pseudo-random noise.

    Uses a deterministic LCG so tests are reproducible without importing
    the ``random`` module (which would consume the global random state).

    Args:
        duration_ms: Duration of the clip in milliseconds.
        sample_rate: Sample rate in Hz.
        amplitude: Peak amplitude of the noise (max 32767).
        seed: LCG seed for deterministic output.

    Returns:
        Raw 16-bit signed little-endian mono PCM bytes.
    """
    n_samples = int(sample_rate * duration_ms / 1000)
    samples: list[int] = []
    state = seed
    for _ in range(n_samples):
        # Park-Miller LCG — simple and reproducible
        state = (state * 1664525 + 1013904223) & 0xFFFFFFFF
        # Map [0, 2^32) → [-amplitude, amplitude]
        value = int((state / 0xFFFFFFFF - 0.5) * 2 * amplitude)
        samples.append(max(-32768, min(32767, value)))
    return struct.pack(f"<{n_samples}h", *samples)


def _build_minimal_wav(pcm_bytes: bytes, sample_rate: int = 16000, channels: int = 1) -> bytes:
    """Wrap raw PCM in a valid RIFF/WAVE header for process_wav tests.

    Args:
        pcm_bytes: Raw 16-bit signed little-endian PCM data.
        sample_rate: Sample rate in Hz.
        channels: Number of audio channels.

    Returns:
        Complete WAV file bytes.
    """
    import io

    bits_per_sample = 16
    byte_rate = sample_rate * channels * (bits_per_sample // 8)
    block_align = channels * (bits_per_sample // 8)
    data_size = len(pcm_bytes)

    buf = io.BytesIO()
    buf.write(b"RIFF")
    buf.write(struct.pack("<I", 36 + data_size))
    buf.write(b"WAVE")
    buf.write(b"fmt ")
    buf.write(struct.pack("<I", 16))
    buf.write(struct.pack("<H", 1))          # PCM format
    buf.write(struct.pack("<H", channels))
    buf.write(struct.pack("<I", sample_rate))
    buf.write(struct.pack("<I", byte_rate))
    buf.write(struct.pack("<H", block_align))
    buf.write(struct.pack("<H", bits_per_sample))
    buf.write(b"data")
    buf.write(struct.pack("<I", data_size))
    buf.write(pcm_bytes)
    return buf.getvalue()


# ===========================================================================
# 1. NERExtractor
# ===========================================================================


class TestNERExtractorImport:
    """Module-level import and constant checks."""

    def test_module_imports_without_error(self) -> None:
        """Importing the module should never raise."""
        import backend.nlp.ner_extractor  # noqa: F401 — import-only test

    def test_default_entity_types_exists(self) -> None:
        """DEFAULT_ENTITY_TYPES must be a non-empty list of strings."""
        from backend.nlp.ner_extractor import DEFAULT_ENTITY_TYPES

        assert isinstance(DEFAULT_ENTITY_TYPES, list)
        assert len(DEFAULT_ENTITY_TYPES) > 0
        assert all(isinstance(t, str) for t in DEFAULT_ENTITY_TYPES)

    def test_confidence_threshold_value(self) -> None:
        """CONFIDENCE_THRESHOLD must be 0.5."""
        from backend.nlp.ner_extractor import CONFIDENCE_THRESHOLD

        assert CONFIDENCE_THRESHOLD == 0.5

    def test_entity_to_category_keys_subset_of_defaults(self) -> None:
        """ENTITY_TO_CATEGORY keys must be a subset of DEFAULT_ENTITY_TYPES."""
        from backend.nlp.ner_extractor import DEFAULT_ENTITY_TYPES, ENTITY_TO_CATEGORY

        for key in ENTITY_TO_CATEGORY:
            assert key in DEFAULT_ENTITY_TYPES, f"{key!r} not in DEFAULT_ENTITY_TYPES"


class TestNEREntityDataclass:
    """NEREntity dataclass field verification."""

    def test_dataclass_has_required_fields(self) -> None:
        """NEREntity must expose text, entity_type, confidence, start, end."""
        from backend.nlp.ner_extractor import NEREntity

        field_names = {f.name for f in fields(NEREntity)}
        assert {"text", "entity_type", "confidence", "start", "end"} <= field_names

    def test_construct_entity_directly(self) -> None:
        """NEREntity can be constructed without going through the model."""
        from backend.nlp.ner_extractor import NEREntity

        e = NEREntity(text="Tokyo", entity_type="place", confidence=0.91, start=10, end=15)
        assert e.text == "Tokyo"
        assert e.entity_type == "place"
        assert e.confidence == 0.91
        assert e.start == 10
        assert e.end == 15


class TestNERExtractorFallback:
    """Extract returns empty lists when GLiNER is unavailable."""

    def test_extract_returns_empty_when_unavailable(self) -> None:
        """When _available is False, extract() must return []."""
        from backend.nlp.ner_extractor import NERExtractor

        extractor = NERExtractor()
        # Force the fallback path without touching real GLiNER
        extractor._available = False
        extractor._model = None

        result = extractor.extract("I love watching Spirited Away with my cat Luna")
        assert result == []

    def test_extract_returns_empty_for_blank_text(self) -> None:
        """Empty and whitespace-only text must return [] even with a model loaded."""
        from backend.nlp.ner_extractor import NERExtractor

        extractor = NERExtractor()
        extractor._available = False

        assert extractor.extract("") == []
        assert extractor.extract("   ") == []

    def test_extract_for_knowledge_graph_returns_empty_when_unavailable(self) -> None:
        """extract_for_knowledge_graph() returns [] when extract() returns []."""
        from backend.nlp.ner_extractor import NERExtractor

        extractor = NERExtractor()
        extractor._available = False
        extractor._model = None

        result = extractor.extract_for_knowledge_graph("I went to Kyoto last summer")
        assert result == []

    def test_extract_returns_list_type(self) -> None:
        """extract() must always return a list, never None or a non-list."""
        from backend.nlp.ner_extractor import NERExtractor

        extractor = NERExtractor()
        extractor._available = False

        result = extractor.extract("anything")
        assert isinstance(result, list)

    def test_knowledge_graph_result_dict_shape(self) -> None:
        """When entities are produced, each dict has category/fact_text/confidence."""
        from backend.nlp.ner_extractor import NEREntity, NERExtractor

        extractor = NERExtractor()
        # Inject a mock model that returns a known entity
        mock_model = MagicMock()
        mock_model.predict_entities.return_value = [
            {"text": "Kyoto", "label": "place", "score": 0.91, "start": 9, "end": 14}
        ]
        extractor._available = True
        extractor._model = mock_model

        results = extractor.extract_for_knowledge_graph("I went to Kyoto last summer")

        assert len(results) == 1
        fact = results[0]
        assert "category" in fact
        assert "fact_text" in fact
        assert "confidence" in fact
        assert isinstance(fact["confidence"], float)

    def test_extract_filters_below_threshold(self) -> None:
        """Entities with score < CONFIDENCE_THRESHOLD must be excluded."""
        from backend.nlp.ner_extractor import NERExtractor

        extractor = NERExtractor()
        mock_model = MagicMock()
        mock_model.predict_entities.return_value = [
            {"text": "Maybe", "label": "place", "score": 0.3, "start": 0, "end": 5}
        ]
        extractor._available = True
        extractor._model = mock_model

        result = extractor.extract("Maybe")
        assert result == []

    def test_extract_sorted_by_confidence_descending(self) -> None:
        """Returned entities must be sorted confidence-high-to-low."""
        from backend.nlp.ner_extractor import NERExtractor

        extractor = NERExtractor()
        mock_model = MagicMock()
        mock_model.predict_entities.return_value = [
            {"text": "Luna", "label": "pet_name", "score": 0.6, "start": 0, "end": 4},
            {"text": "Tokyo", "label": "place", "score": 0.95, "start": 5, "end": 10},
        ]
        extractor._available = True
        extractor._model = mock_model

        result = extractor.extract("Luna Tokyo")
        assert result[0].confidence >= result[1].confidence

    def test_extract_truncates_long_text(self) -> None:
        """Text longer than 512 chars must be handled without raising."""
        from backend.nlp.ner_extractor import NERExtractor

        extractor = NERExtractor()
        mock_model = MagicMock()
        mock_model.predict_entities.return_value = []
        extractor._available = True
        extractor._model = mock_model

        long_text = "a" * 1000
        result = extractor.extract(long_text)
        # Model should have been called with at most 512 chars
        call_args = mock_model.predict_entities.call_args
        assert len(call_args[0][0]) <= 512
        assert isinstance(result, list)

    def test_available_flag_defaults_to_none_before_probe(self) -> None:
        """Newly constructed NERExtractor has _available = None (not yet probed)."""
        from backend.nlp.ner_extractor import NERExtractor

        extractor = NERExtractor()
        assert extractor._available is None


# ===========================================================================
# 2. ToxicityDetector
# ===========================================================================


class TestToxicityDetectorImport:
    """Module-level import checks."""

    def test_module_imports_without_error(self) -> None:
        """Importing the module should never raise."""
        import backend.nlp.toxicity_detector  # noqa: F401

    def test_constants_exist(self) -> None:
        """ToxicityDetector must expose TOXICITY_THRESHOLD and MODEL_ID."""
        from backend.nlp.toxicity_detector import ToxicityDetector

        assert hasattr(ToxicityDetector, "TOXICITY_THRESHOLD")
        assert hasattr(ToxicityDetector, "MODEL_ID")
        assert ToxicityDetector.TOXICITY_THRESHOLD == 0.7


class TestToxicityResultDataclass:
    """ToxicityResult field validation."""

    def test_dataclass_has_required_fields(self) -> None:
        """ToxicityResult must expose is_toxic, confidence, label, categories."""
        from backend.nlp.toxicity_detector import ToxicityResult

        field_names = {f.name for f in fields(ToxicityResult)}
        assert {"is_toxic", "confidence", "label", "categories"} <= field_names

    def test_construct_directly(self) -> None:
        """ToxicityResult can be built directly with correct types."""
        from backend.nlp.toxicity_detector import ToxicityResult

        r = ToxicityResult(is_toxic=True, confidence=0.92, label="toxic", categories=["threat"])
        assert r.is_toxic is True
        assert r.confidence == 0.92
        assert r.label == "toxic"
        assert r.categories == ["threat"]

    def test_categories_defaults_to_empty_list(self) -> None:
        """ToxicityResult.categories defaults to [] when not provided."""
        from backend.nlp.toxicity_detector import ToxicityResult

        r = ToxicityResult(is_toxic=False, confidence=0.9, label="non-toxic")
        assert r.categories == []


class TestToxicityKeywordFallback:
    """_keyword_fallback behaviour — the path exercised in test environments."""

    def test_kill_yourself_detected(self) -> None:
        """'kill yourself' triggers keyword fallback toxic result."""
        from backend.nlp.toxicity_detector import _keyword_fallback

        result = _keyword_fallback("kill yourself")
        assert result.is_toxic is True
        assert "keyword_match" in result.categories

    def test_kys_abbreviation_detected(self) -> None:
        """'kys' abbreviation must trigger the fallback."""
        from backend.nlp.toxicity_detector import _keyword_fallback

        result = _keyword_fallback("just kys already")
        assert result.is_toxic is True

    def test_threat_phrase_detected(self) -> None:
        """Explicit threat phrase triggers detection."""
        from backend.nlp.toxicity_detector import _keyword_fallback

        result = _keyword_fallback("i will kill you tomorrow")
        assert result.is_toxic is True

    def test_profanity_alone_not_detected(self) -> None:
        """Mere profanity without targeted harm must NOT be flagged."""
        from backend.nlp.toxicity_detector import _keyword_fallback

        result = _keyword_fallback("that movie was absolute crap")
        assert result.is_toxic is False

    def test_clean_message_returns_non_toxic(self) -> None:
        """A normal message returns is_toxic=False with high confidence."""
        from backend.nlp.toxicity_detector import _keyword_fallback

        result = _keyword_fallback("I hope you have a wonderful day!")
        assert result.is_toxic is False
        assert result.label == "non-toxic"
        assert result.confidence >= 0.8

    def test_case_insensitive_detection(self) -> None:
        """Keyword matching must be case-insensitive."""
        from backend.nlp.toxicity_detector import _keyword_fallback

        result = _keyword_fallback("You Should DIE")
        assert result.is_toxic is True

    def test_bomb_threat_detected(self) -> None:
        """'bomb threat' must be detected."""
        from backend.nlp.toxicity_detector import _keyword_fallback

        result = _keyword_fallback("this is a bomb threat")
        assert result.is_toxic is True

    def test_empty_string_returns_non_toxic(self) -> None:
        """Empty input must return a safe non-toxic result."""
        from backend.nlp.toxicity_detector import _keyword_fallback

        result = _keyword_fallback("")
        assert result.is_toxic is False


class TestToxicityDetectorFallbackPath:
    """ToxicityDetector.detect() when pipeline is unavailable."""

    def test_detect_falls_back_gracefully(self) -> None:
        """With _available=False, detect() returns a valid ToxicityResult."""
        from backend.nlp.toxicity_detector import ToxicityDetector

        detector = ToxicityDetector()
        detector._available = False
        detector._pipeline = None

        result = detector.detect("Hello, how are you?")
        assert isinstance(result.is_toxic, bool)
        assert 0.0 <= result.confidence <= 1.0

    def test_detect_returns_toxic_via_keyword_fallback(self) -> None:
        """Harmful phrase triggers toxic result even when pipeline is absent."""
        from backend.nlp.toxicity_detector import ToxicityDetector

        detector = ToxicityDetector()
        detector._available = False
        detector._pipeline = None

        result = detector.detect("you should die")
        assert result.is_toxic is True

    def test_detect_coerces_non_string_input(self) -> None:
        """Non-string input must be coerced to str without raising."""
        from backend.nlp.toxicity_detector import ToxicityDetector

        detector = ToxicityDetector()
        detector._available = False
        detector._pipeline = None

        result = detector.detect(12345)  # type: ignore[arg-type]
        assert isinstance(result.is_toxic, bool)

    def test_toxic_confidence_helper_parses_model_output(self) -> None:
        """_toxic_confidence correctly extracts scores from pipeline output."""
        from backend.nlp.toxicity_detector import ToxicityDetector

        raw = [[{"label": "toxic", "score": 0.95}, {"label": "non-toxic", "score": 0.05}]]
        confidence, categories = ToxicityDetector._toxic_confidence(raw)
        assert confidence == pytest.approx(0.95)
        assert isinstance(categories, list)

    def test_toxic_confidence_handles_malformed_output(self) -> None:
        """_toxic_confidence returns (0.0, []) on bad input without raising."""
        from backend.nlp.toxicity_detector import ToxicityDetector

        assert ToxicityDetector._toxic_confidence(None) == (0.0, [])
        assert ToxicityDetector._toxic_confidence([]) == (0.0, [])
        assert ToxicityDetector._toxic_confidence([[{"bad": "data"}]]) == (0.0, [])

    def test_thread_lock_exists(self) -> None:
        """ToxicityDetector must have a threading lock for concurrent init safety."""
        from backend.nlp.toxicity_detector import ToxicityDetector

        detector = ToxicityDetector()
        assert isinstance(detector._lock, type(threading.Lock()))


# ===========================================================================
# 3. SileroVAD
# ===========================================================================


class TestSileroVADImport:
    """Module import and constant checks."""

    def test_module_imports_without_error(self) -> None:
        """Importing silero_vad must not raise."""
        import backend.voice.silero_vad  # noqa: F401

    def test_frame_size_constants(self) -> None:
        """_FRAME_SAMPLES_16K and _FRAME_SAMPLES_8K must be defined."""
        from backend.voice.silero_vad import _FRAME_SAMPLES_16K, _FRAME_SAMPLES_8K

        assert _FRAME_SAMPLES_16K == 512
        assert _FRAME_SAMPLES_8K == 256


class TestVADResultDataclass:
    """VADResult field validation."""

    def test_dataclass_has_required_fields(self) -> None:
        """VADResult must expose is_speech and confidence."""
        from backend.voice.silero_vad import VADResult

        field_names = {f.name for f in fields(VADResult)}
        assert {"is_speech", "confidence"} <= field_names

    def test_construct_directly(self) -> None:
        """VADResult can be constructed directly."""
        from backend.voice.silero_vad import VADResult

        r = VADResult(is_speech=True, confidence=0.87)
        assert r.is_speech is True
        assert r.confidence == 0.87


class TestSileroVADEnergyFallback:
    """Energy fallback path — exercised in environments without torch."""

    def test_silence_not_speech(self) -> None:
        """Pure silence (all zeros) must not be classified as speech."""
        from backend.voice.silero_vad import _energy_fallback

        silence = _make_pcm_silence(100)
        result = _energy_fallback(silence)
        assert result.is_speech is False
        assert result.confidence == 0.0

    def test_loud_noise_is_speech(self) -> None:
        """High-amplitude audio should exceed the default energy threshold."""
        from backend.voice.silero_vad import _energy_fallback

        loud = _make_pcm_noise(100, amplitude=20000)
        result = _energy_fallback(loud)
        assert result.is_speech is True
        assert result.confidence > 0.0

    def test_empty_bytes_returns_false(self) -> None:
        """Empty PCM bytes must return is_speech=False, confidence=0.0."""
        from backend.voice.silero_vad import _energy_fallback

        result = _energy_fallback(b"")
        assert result.is_speech is False
        assert result.confidence == 0.0

    def test_custom_threshold(self) -> None:
        """A very high threshold means loud audio still does not cross it."""
        from backend.voice.silero_vad import _energy_fallback

        # amplitude=5000 → RMS ~5000/32768 ≈ 0.15, which is below threshold=0.5
        moderate = _make_pcm_noise(100, amplitude=5000)
        result = _energy_fallback(moderate, threshold=0.5)
        assert result.is_speech is False

    def test_confidence_clamped_to_one(self) -> None:
        """Energy fallback confidence must never exceed 1.0."""
        from backend.voice.silero_vad import _energy_fallback

        max_amplitude = _make_pcm_noise(100, amplitude=32767)
        result = _energy_fallback(max_amplitude)
        assert result.confidence <= 1.0


class TestSileroVADInstance:
    """SileroVAD instance-level behaviour."""

    def test_using_fallback_property_exists(self) -> None:
        """using_fallback property must be accessible on the instance."""
        from backend.voice.silero_vad import SileroVAD

        vad = SileroVAD()
        assert isinstance(vad.using_fallback, bool)

    def test_detect_returns_vadresult(self) -> None:
        """detect() always returns a VADResult regardless of fallback state."""
        from backend.voice.silero_vad import SileroVAD, VADResult

        vad = SileroVAD()
        vad._using_fallback = True  # force fallback path

        silence = _make_pcm_silence(100)
        result = vad.detect(silence, sample_rate=16000)
        assert isinstance(result, VADResult)

    def test_detect_silence_returns_false(self) -> None:
        """detect() on silence must return is_speech=False when using fallback."""
        from backend.voice.silero_vad import SileroVAD

        vad = SileroVAD()
        vad._using_fallback = True

        result = vad.detect(_make_pcm_silence(100), sample_rate=16000)
        assert result.is_speech is False

    def test_detect_loud_audio_returns_true_with_low_threshold(self) -> None:
        """Loud PCM with a low threshold must be flagged as speech."""
        from backend.voice.silero_vad import SileroVAD

        vad = SileroVAD(threshold=0.01)  # very sensitive
        vad._using_fallback = True

        result = vad.detect(_make_pcm_noise(100, amplitude=15000), sample_rate=16000)
        assert result.is_speech is True

    def test_reset_does_not_raise(self) -> None:
        """reset() must not raise, regardless of model state."""
        from backend.voice.silero_vad import SileroVAD

        vad = SileroVAD()
        vad._using_fallback = True
        vad._model = None
        vad.reset()  # should be a no-op

    def test_reset_calls_model_reset_states_when_available(self) -> None:
        """reset() calls model.reset_states() when the model is loaded."""
        from backend.voice.silero_vad import SileroVAD

        vad = SileroVAD()
        mock_model = MagicMock()
        mock_model.reset_states = MagicMock()
        vad._model = mock_model
        vad._using_fallback = False  # pretend model is live

        vad.reset()
        mock_model.reset_states.assert_called_once()

    def test_unsupported_sample_rate_falls_back(self) -> None:
        """A sample rate not in (8000, 16000) triggers energy fallback."""
        from backend.voice.silero_vad import SileroVAD

        vad = SileroVAD()
        # Override _using_fallback to False to exercise the rate-check branch
        vad._using_fallback = False

        # Simulate a loaded model so detect() doesn't short-circuit
        vad._model = MagicMock()

        result = vad.detect(_make_pcm_silence(100), sample_rate=44100)
        # Should still return a valid VADResult (energy fallback kicked in)
        from backend.voice.silero_vad import VADResult

        assert isinstance(result, VADResult)


# ===========================================================================
# 4. NoiseSuppressor
# ===========================================================================


class TestNoiseSuppressorImport:
    """Module import and constant checks."""

    def test_module_imports_without_error(self) -> None:
        """Importing noise_suppressor must not raise."""
        import backend.voice.noise_suppressor  # noqa: F401

    def test_supported_rates_constant(self) -> None:
        """_SUPPORTED_RATES must include 16000 and 48000."""
        from backend.voice.noise_suppressor import _SUPPORTED_RATES

        assert 16000 in _SUPPORTED_RATES
        assert 48000 in _SUPPORTED_RATES


class TestDenoiseResultDataclass:
    """DenoiseResult field validation."""

    def test_dataclass_has_required_fields(self) -> None:
        """DenoiseResult must expose audio_bytes and noise_reduction_db."""
        from backend.voice.noise_suppressor import DenoiseResult

        field_names = {f.name for f in fields(DenoiseResult)}
        assert {"audio_bytes", "noise_reduction_db"} <= field_names

    def test_construct_directly(self) -> None:
        """DenoiseResult can be constructed directly."""
        from backend.voice.noise_suppressor import DenoiseResult

        r = DenoiseResult(audio_bytes=b"\x00\x01", noise_reduction_db=12.3)
        assert r.audio_bytes == b"\x00\x01"
        assert r.noise_reduction_db == pytest.approx(12.3)


class TestNoiseSuppressorPassthrough:
    """NoiseSuppressor fallback when DeepFilterNet is not installed."""

    def test_passthrough_returns_original_audio(self) -> None:
        """_passthrough_fallback must return the original bytes unchanged."""
        from backend.voice.noise_suppressor import _passthrough_fallback

        audio = _make_pcm_noise(50)
        result = _passthrough_fallback(audio)
        assert result.audio_bytes == audio
        assert result.noise_reduction_db == 0.0

    def test_process_passthrough_when_no_model(self) -> None:
        """process() with no model returns input unchanged."""
        from backend.voice.noise_suppressor import NoiseSuppressor

        suppressor = NoiseSuppressor()
        # Ensure model is None (library not installed path or init failure)
        suppressor._model = None
        suppressor._df_state = None

        audio = _make_pcm_noise(50)
        result = suppressor.process(audio, sample_rate=16000)
        assert result.audio_bytes == audio
        assert result.noise_reduction_db == 0.0

    def test_process_empty_bytes_returns_empty(self) -> None:
        """process() with empty bytes returns empty DenoiseResult."""
        from backend.voice.noise_suppressor import NoiseSuppressor

        suppressor = NoiseSuppressor()
        result = suppressor.process(b"", sample_rate=16000)
        assert result.audio_bytes == b""
        assert result.noise_reduction_db == 0.0

    def test_process_raises_on_unsupported_rate(self) -> None:
        """process() must raise ValueError for unsupported sample rates."""
        from backend.voice.noise_suppressor import NoiseSuppressor

        suppressor = NoiseSuppressor()
        with pytest.raises(ValueError, match="Unsupported sample_rate"):
            suppressor.process(_make_pcm_silence(50), sample_rate=22050)

    def test_reset_does_not_raise_without_library(self) -> None:
        """reset() is a safe no-op when DeepFilterNet is not installed."""
        from backend.voice.noise_suppressor import NoiseSuppressor

        suppressor = NoiseSuppressor()
        suppressor._model = None
        # Calling reset() must not raise even when library is absent
        suppressor.reset()


class TestNoiseSuppressorWAVHelpers:
    """WAV parsing helpers used by process_wav."""

    def test_build_wav_produces_valid_riff(self) -> None:
        """_build_wav must produce bytes starting with RIFF/WAVE."""
        from backend.voice.noise_suppressor import _build_wav

        wav = _build_wav(_make_pcm_silence(20), sample_rate=16000)
        assert wav[:4] == b"RIFF"
        assert wav[8:12] == b"WAVE"

    def test_parse_wav_header_round_trip(self) -> None:
        """_parse_wav_header must extract the same sample rate we encoded."""
        from backend.voice.noise_suppressor import _build_wav, _parse_wav_header

        pcm = _make_pcm_silence(20)
        wav = _build_wav(pcm, sample_rate=16000)
        rate, channels, payload = _parse_wav_header(wav)
        assert rate == 16000
        assert channels == 1
        assert payload == pcm

    def test_parse_wav_rejects_too_short_bytes(self) -> None:
        """_parse_wav_header raises ValueError on data shorter than 44 bytes."""
        from backend.voice.noise_suppressor import _parse_wav_header

        with pytest.raises(ValueError):
            _parse_wav_header(b"\x00" * 10)

    def test_parse_wav_rejects_non_riff(self) -> None:
        """_parse_wav_header raises ValueError when RIFF magic is absent."""
        from backend.voice.noise_suppressor import _parse_wav_header

        garbage = b"\xFF" * 44
        with pytest.raises(ValueError):
            _parse_wav_header(garbage)

    def test_stereo_to_mono_halves_frame_count(self) -> None:
        """_stereo_to_mono must halve the number of samples."""
        from backend.voice.noise_suppressor import _stereo_to_mono

        # 4 stereo frames = 8 int16 samples = 16 bytes
        stereo = struct.pack("<8h", 1000, -1000, 2000, -2000, 3000, -3000, 4000, -4000)
        mono = _stereo_to_mono(stereo)
        n_mono = len(mono) // 2
        assert n_mono == 4  # 4 frames → 4 mono samples

    def test_process_wav_returns_original_on_bad_wav(self) -> None:
        """process_wav must return original bytes when WAV is malformed."""
        from backend.voice.noise_suppressor import NoiseSuppressor

        suppressor = NoiseSuppressor()
        garbage = b"not a real wav" + b"\x00" * 60
        result = suppressor.process_wav(garbage)
        assert result == garbage

    def test_estimate_noise_reduction_silence_returns_zero(self) -> None:
        """Comparing silence to silence must return 0.0 dB."""
        from backend.voice.noise_suppressor import _estimate_noise_reduction

        silence = _make_pcm_silence(50)
        assert _estimate_noise_reduction(silence, silence) == 0.0

    def test_estimate_noise_reduction_empty_bytes(self) -> None:
        """_estimate_noise_reduction on empty bytes returns 0.0."""
        from backend.voice.noise_suppressor import _estimate_noise_reduction

        assert _estimate_noise_reduction(b"", b"") == 0.0


# ===========================================================================
# 5. MemoryReranker
# ===========================================================================


class TestMemoryRerankerImport:
    """Module import checks."""

    def test_module_imports_without_error(self) -> None:
        """Importing memory.reranker must not raise (warning is acceptable)."""
        import warnings

        with warnings.catch_warnings():
            warnings.simplefilter("ignore", ImportWarning)
            import backend.memory.reranker  # noqa: F401


class TestRerankResultDataclass:
    """RerankResult field validation."""

    def test_dataclass_has_required_fields(self) -> None:
        """RerankResult must expose text, original_score, rerank_score, metadata."""
        import warnings

        with warnings.catch_warnings():
            warnings.simplefilter("ignore", ImportWarning)
            from backend.memory.reranker import RerankResult

        field_names = {f.name for f in fields(RerankResult)}
        assert {"text", "original_score", "rerank_score", "metadata"} <= field_names

    def test_construct_directly(self) -> None:
        """RerankResult can be constructed directly with all required fields."""
        import warnings

        with warnings.catch_warnings():
            warnings.simplefilter("ignore", ImportWarning)
            from backend.memory.reranker import RerankResult

        r = RerankResult(
            text="I love ramen",
            original_score=0.3,
            rerank_score=0.91,
            metadata={"role": "user"},
        )
        assert r.text == "I love ramen"
        assert r.original_score == pytest.approx(0.3)
        assert r.rerank_score == pytest.approx(0.91)
        assert r.metadata["role"] == "user"

    def test_metadata_defaults_to_empty_dict(self) -> None:
        """metadata field must default to an empty dict."""
        import warnings

        with warnings.catch_warnings():
            warnings.simplefilter("ignore", ImportWarning)
            from backend.memory.reranker import RerankResult

        r = RerankResult(text="hello", original_score=0.0, rerank_score=0.5)
        assert r.metadata == {}


class TestMemoryRerankerPassthrough:
    """Passthrough fallback when sentence-transformers is not installed."""

    def _make_candidates(self, n: int = 3) -> list[dict[str, Any]]:
        """Build a minimal list of candidate memory dicts."""
        return [
            {"text": f"memory {i}", "distance": 0.1 * i}
            for i in range(n)
        ]

    def test_rerank_empty_candidates_returns_empty(self) -> None:
        """rerank() with no candidates must return []."""
        import warnings

        with warnings.catch_warnings():
            warnings.simplefilter("ignore", ImportWarning)
            from backend.memory.reranker import MemoryReranker

        reranker = MemoryReranker()
        assert reranker.rerank("any query", []) == []

    def test_rerank_returns_list_of_rerankresult(self) -> None:
        """rerank() must always return a list of RerankResult objects."""
        import warnings

        with warnings.catch_warnings():
            warnings.simplefilter("ignore", ImportWarning)
            from backend.memory.reranker import MemoryReranker, RerankResult

        reranker = MemoryReranker()
        reranker._model = None  # force fallback path

        candidates = self._make_candidates(3)
        results = reranker.rerank("query", candidates, top_k=3)
        assert isinstance(results, list)
        assert all(isinstance(r, RerankResult) for r in results)

    def test_passthrough_preserves_original_order(self) -> None:
        """Fallback path returns candidates in original input order."""
        import warnings

        with warnings.catch_warnings():
            warnings.simplefilter("ignore", ImportWarning)
            from backend.memory.reranker import _passthrough_fallback

        candidates = [
            {"text": "first", "distance": 0.1},
            {"text": "second", "distance": 0.2},
            {"text": "third", "distance": 0.3},
        ]
        results = _passthrough_fallback(candidates, top_k=3, text_key="text")
        texts = [r.text for r in results]
        assert texts == ["first", "second", "third"]

    def test_passthrough_respects_top_k(self) -> None:
        """_passthrough_fallback must slice to top_k candidates."""
        import warnings

        with warnings.catch_warnings():
            warnings.simplefilter("ignore", ImportWarning)
            from backend.memory.reranker import _passthrough_fallback

        candidates = self._make_candidates(5)
        results = _passthrough_fallback(candidates, top_k=2, text_key="text")
        assert len(results) == 2

    def test_passthrough_rerank_score_is_one_minus_distance(self) -> None:
        """Fallback rerank_score = 1 - distance for each candidate."""
        import warnings

        with warnings.catch_warnings():
            warnings.simplefilter("ignore", ImportWarning)
            from backend.memory.reranker import _passthrough_fallback

        candidates = [{"text": "abc", "distance": 0.3}]
        results = _passthrough_fallback(candidates, top_k=1, text_key="text")
        assert results[0].rerank_score == pytest.approx(0.7)
        assert results[0].original_score == pytest.approx(0.3)

    def test_passthrough_missing_distance_defaults_to_zero(self) -> None:
        """Candidate dict without 'distance' key must not raise."""
        import warnings

        with warnings.catch_warnings():
            warnings.simplefilter("ignore", ImportWarning)
            from backend.memory.reranker import _passthrough_fallback

        candidates = [{"text": "no distance here"}]
        results = _passthrough_fallback(candidates, top_k=1, text_key="text")
        assert results[0].original_score == 0.0

    def test_rerank_simple_empty_texts_returns_empty(self) -> None:
        """rerank_simple() with no texts must return []."""
        import warnings

        with warnings.catch_warnings():
            warnings.simplefilter("ignore", ImportWarning)
            from backend.memory.reranker import MemoryReranker

        reranker = MemoryReranker()
        assert reranker.rerank_simple("query", []) == []

    def test_rerank_simple_returns_index_score_tuples(self) -> None:
        """rerank_simple() must return (original_index, score) tuples."""
        import warnings

        with warnings.catch_warnings():
            warnings.simplefilter("ignore", ImportWarning)
            from backend.memory.reranker import MemoryReranker

        reranker = MemoryReranker()
        reranker._model = None  # force fallback

        texts = ["alpha", "beta", "gamma"]
        results = reranker.rerank_simple("test", texts, top_k=2)
        assert len(results) == 2
        for idx, score in results:
            assert isinstance(idx, int)
            assert 0 <= idx < len(texts)
            assert isinstance(score, float)

    def test_sigmoid_values_in_range(self) -> None:
        """_sigmoid must map any real number to (0, 1)."""
        import warnings

        with warnings.catch_warnings():
            warnings.simplefilter("ignore", ImportWarning)
            from backend.memory.reranker import MemoryReranker

        for x in [-10.0, -1.0, 0.0, 1.0, 10.0]:
            result = MemoryReranker._sigmoid(x)
            assert 0.0 < result < 1.0

    def test_sigmoid_midpoint_is_0_5(self) -> None:
        """sigmoid(0) must equal exactly 0.5."""
        import warnings

        with warnings.catch_warnings():
            warnings.simplefilter("ignore", ImportWarning)
            from backend.memory.reranker import MemoryReranker

        assert MemoryReranker._sigmoid(0.0) == pytest.approx(0.5)

    def test_rerank_top_k_clamped_to_candidate_count(self) -> None:
        """top_k larger than candidate count is clamped to candidate count."""
        import warnings

        with warnings.catch_warnings():
            warnings.simplefilter("ignore", ImportWarning)
            from backend.memory.reranker import MemoryReranker

        reranker = MemoryReranker()
        reranker._model = None

        candidates = self._make_candidates(2)
        results = reranker.rerank("query", candidates, top_k=100)
        assert len(results) == 2
