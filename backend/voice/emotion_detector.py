"""Speech emotion recognition from user audio.

Uses emotion2vec+ base (90M params) to classify emotions from audio
waveforms. The detected emotion feeds into the MoodEngine and VRM
expression system, allowing the character to react to the user's
emotional state as heard in their voice.

Model: ``emotion2vec/emotion2vec_plus_base`` (MIT license)
  - 9 emotion classes: angry, disgusted, fearful, happy, neutral,
    other, sad, surprised, unknown
  - Runs at 50Hz frame-level, ~20ms per utterance
  - ~1GB VRAM or CPU inference

Falls back gracefully when the model is not installed — returns
``neutral`` with zero confidence.

Schema dependencies:
    None — this module is stateless.

Example:
    >>> detector = SpeechEmotionDetector()
    >>> result = detector.detect_from_wav(wav_bytes)
    >>> print(result.emotion, result.confidence)
    'happy' 0.87
    >>> print(result.mood_hint)
    'The user sounds happy and upbeat.'
"""

from __future__ import annotations

import logging
import struct
from dataclasses import dataclass, field
from typing import Optional

logger = logging.getLogger(__name__)


# ── Emotion classes produced by emotion2vec+ ──────────────────────────────────

EMOTION_CLASSES: list[str] = [
    "angry",
    "disgusted",
    "fearful",
    "happy",
    "neutral",
    "other",
    "sad",
    "surprised",
    "unknown",
]

# Mapping from emotion2vec+ classes to the app's MoodEngine / VoiceModulator
# emotion vocabulary.  The VoiceModulator uses a 16-emotion set; this maps the
# 9-class SER output to the closest match.
EMOTION_TO_MOOD: dict[str, str] = {
    "angry": "anger",
    "disgusted": "disgust",
    "fearful": "fear",
    "happy": "joy",
    "neutral": "neutral",
    "other": "neutral",
    "sad": "sadness",
    "surprised": "surprise",
    "unknown": "neutral",
}

# Human-readable hints injected into the LLM context so the character
# can react to the user's vocal tone.
EMOTION_HINTS: dict[str, str] = {
    "angry": "The user sounds frustrated or angry.",
    "disgusted": "The user sounds put off or disgusted.",
    "fearful": "The user sounds anxious or scared.",
    "happy": "The user sounds happy and upbeat.",
    "neutral": "",  # No hint for neutral — avoid noise.
    "other": "",
    "sad": "The user sounds sad or down.",
    "surprised": "The user sounds surprised or taken aback.",
    "unknown": "",
}

# Confidence threshold — below this we treat the result as ``neutral``.
CONFIDENCE_THRESHOLD: float = 0.45


@dataclass
class SpeechEmotionResult:
    """Result of speech emotion detection on a single utterance.

    Attributes:
        emotion: The detected emotion class (one of :data:`EMOTION_CLASSES`).
        confidence: Model confidence in the prediction (0.0–1.0).
        mood_mapping: Equivalent emotion name for :class:`MoodEngine`.
        mood_hint: Human-readable hint for LLM context injection,
            or empty string if neutral / low confidence.
        all_scores: Per-class probabilities (empty dict if unavailable).
    """

    emotion: str = "neutral"
    confidence: float = 0.0
    mood_mapping: str = "neutral"
    mood_hint: str = ""
    all_scores: dict[str, float] = field(default_factory=dict)


class SpeechEmotionDetector:
    """Lazy-loading speech emotion detector using emotion2vec+ base.

    The model is loaded on first call to :meth:`detect_from_wav` or
    :meth:`detect_from_pcm`.  If the required libraries are not installed
    (``funasr``, ``torch``), all methods return a neutral result with zero
    confidence.

    Args:
        model_id: HuggingFace model ID. Defaults to emotion2vec+ base.
        device: Torch device string (``"cpu"``, ``"cuda"``, ``"mps"``).
            Defaults to ``"cpu"`` for broad compatibility.

    Example:
        >>> detector = SpeechEmotionDetector()
        >>> result = detector.detect_from_wav(open("test.wav", "rb").read())
        >>> result.emotion
        'happy'
    """

    def __init__(
        self,
        model_id: str = "iic/emotion2vec_plus_base",
        device: str = "cpu",
    ) -> None:
        self._model_id = model_id
        self._device = device
        self._model: Optional[object] = None
        self._available: Optional[bool] = None

    # ── Lazy model loading ────────────────────────────────────────────────

    def _ensure_model(self) -> bool:
        """Load the model on first use.  Returns True if available.

        Uses FunASR's AutoModel which handles emotion2vec+ natively.
        Falls back gracefully if dependencies are missing.
        """
        if self._available is not None:
            return self._available

        try:
            from funasr import AutoModel  # type: ignore[import-untyped]

            self._model = AutoModel(
                model=self._model_id,
                device=self._device,
            )
            self._available = True
            logger.info(
                "SpeechEmotionDetector: loaded %s on %s",
                self._model_id,
                self._device,
            )
        except ImportError:
            logger.warning(
                "SpeechEmotionDetector: funasr not installed — emotion "
                "detection disabled.  Install with: pip install funasr"
            )
            self._available = False
        except Exception:
            logger.exception("SpeechEmotionDetector: failed to load model")
            self._available = False

        return self._available

    # ── Public API ────────────────────────────────────────────────────────

    def detect_from_pcm(
        self,
        pcm_data: bytes,
        sample_rate: int = 16000,
        sample_width: int = 2,
    ) -> SpeechEmotionResult:
        """Detect emotion from raw PCM audio bytes.

        Args:
            pcm_data: Raw PCM audio bytes (mono, little-endian).
            sample_rate: Sample rate in Hz (default 16000).
            sample_width: Bytes per sample (default 2 = 16-bit).

        Returns:
            :class:`SpeechEmotionResult` with detected emotion and scores.
        """
        if not self._ensure_model():
            return SpeechEmotionResult()

        try:
            # Convert PCM bytes → list of float samples in [-1, 1]
            n_samples = len(pcm_data) // sample_width
            fmt = f"<{n_samples}h" if sample_width == 2 else f"<{n_samples}f"
            samples = struct.unpack(fmt, pcm_data[:n_samples * sample_width])
            max_val = 32768.0 if sample_width == 2 else 1.0
            float_samples = [s / max_val for s in samples]

            return self._classify(float_samples, sample_rate)

        except Exception:
            logger.exception("SpeechEmotionDetector: error during PCM detection")
            return SpeechEmotionResult()

    def detect_from_wav(self, wav_bytes: bytes) -> SpeechEmotionResult:
        """Detect emotion from a WAV file (bytes).

        Extracts PCM data from the WAV header and delegates to
        :meth:`detect_from_pcm`.

        Args:
            wav_bytes: Complete WAV file contents.

        Returns:
            :class:`SpeechEmotionResult` with detected emotion and scores.
        """
        if not self._ensure_model():
            return SpeechEmotionResult()

        try:
            import tempfile
            import os

            # Write to temp file — FunASR expects file paths for wav input
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
                f.write(wav_bytes)
                tmp_path = f.name

            try:
                result = self._model.generate(tmp_path)  # type: ignore[union-attr]
                return self._parse_result(result)
            finally:
                os.unlink(tmp_path)

        except Exception:
            logger.exception("SpeechEmotionDetector: error during WAV detection")
            return SpeechEmotionResult()

    def detect_from_file(self, file_path: str) -> SpeechEmotionResult:
        """Detect emotion from an audio file on disk.

        Args:
            file_path: Path to audio file (WAV, MP3, FLAC, etc.).

        Returns:
            :class:`SpeechEmotionResult` with detected emotion and scores.
        """
        if not self._ensure_model():
            return SpeechEmotionResult()

        try:
            result = self._model.generate(file_path)  # type: ignore[union-attr]
            return self._parse_result(result)
        except Exception:
            logger.exception("SpeechEmotionDetector: error during file detection")
            return SpeechEmotionResult()

    # ── Internal helpers ──────────────────────────────────────────────────

    def _classify(
        self, samples: list[float], sample_rate: int
    ) -> SpeechEmotionResult:
        """Run classification on float audio samples via temp file."""
        import tempfile
        import os
        import wave

        # Write float samples as 16-bit PCM WAV
        pcm_int = [max(-32768, min(32767, int(s * 32768))) for s in samples]
        pcm_bytes = struct.pack(f"<{len(pcm_int)}h", *pcm_int)

        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
            with wave.open(f, "wb") as wf:
                wf.setnchannels(1)
                wf.setsampwidth(2)
                wf.setframerate(sample_rate)
                wf.writeframes(pcm_bytes)
            tmp_path = f.name

        try:
            result = self._model.generate(tmp_path)  # type: ignore[union-attr]
            return self._parse_result(result)
        finally:
            os.unlink(tmp_path)

    def _parse_result(self, result: object) -> SpeechEmotionResult:
        """Parse FunASR model output into SpeechEmotionResult.

        emotion2vec+ returns a list of dicts with 'labels' and 'scores' keys.
        """
        try:
            # FunASR returns list of results — take first utterance
            if isinstance(result, list) and len(result) > 0:
                entry = result[0]
            else:
                entry = result

            labels = entry.get("labels", []) if isinstance(entry, dict) else []
            scores = entry.get("scores", []) if isinstance(entry, dict) else []

            if not labels or not scores:
                return SpeechEmotionResult()

            # Build per-class score dict
            all_scores: dict[str, float] = {}
            for label, score in zip(labels, scores):
                # emotion2vec+ labels may be indices or strings
                if isinstance(label, int) and label < len(EMOTION_CLASSES):
                    all_scores[EMOTION_CLASSES[label]] = float(score)
                elif isinstance(label, str):
                    all_scores[label.lower()] = float(score)

            # Find top emotion
            if all_scores:
                top_emotion = max(all_scores, key=all_scores.get)  # type: ignore[arg-type]
                top_confidence = all_scores[top_emotion]
            else:
                top_emotion = "neutral"
                top_confidence = 0.0

            # Apply confidence threshold
            if top_confidence < CONFIDENCE_THRESHOLD:
                top_emotion = "neutral"
                top_confidence = 0.0

            mood = EMOTION_TO_MOOD.get(top_emotion, "neutral")
            hint = EMOTION_HINTS.get(top_emotion, "")

            return SpeechEmotionResult(
                emotion=top_emotion,
                confidence=top_confidence,
                mood_mapping=mood,
                mood_hint=hint if top_confidence >= CONFIDENCE_THRESHOLD else "",
                all_scores=all_scores,
            )

        except Exception:
            logger.exception("SpeechEmotionDetector: error parsing result")
            return SpeechEmotionResult()
