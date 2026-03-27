"""
ML-based Voice Activity Detection using Silero VAD v5.

Replaces the energy-based threshold in the voice duplex pipeline with a
proper neural VAD model. Silero VAD achieves ~87.7% TPR at 5% FPR and
runs in sub-millisecond per chunk on CPU, making it suitable for real-time
streaming audio at the frame sizes used by this pipeline.

If torch is not installed or the model cannot be downloaded, the module
falls back transparently to the existing RMS energy threshold so the
voice pipeline remains functional in minimal environments.

Typical usage:
    vad = SileroVAD(threshold=0.5)
    result = vad.detect(pcm_chunk)
    if result.is_speech:
        accumulate_speech(pcm_chunk)
    else:
        check_silence_timeout()
    # Reset between utterances:
    vad.reset()
"""

from __future__ import annotations

import logging
import struct
from dataclasses import dataclass
from typing import Optional, Tuple

logger = logging.getLogger(__name__)

# ── Torch availability ────────────────────────────────────────────────────────

try:
    import torch  # type: ignore[import-untyped]
    _HAS_TORCH = True
except ImportError:  # pragma: no cover
    _HAS_TORCH = False
    logger.info(
        "torch not installed — SileroVAD will use energy-based fallback. "
        "Install torch for ML-quality VAD: pip install torch"
    )

# ── Frame size constants ──────────────────────────────────────────────────────

_FRAME_SAMPLES_16K = 512
"""Silero VAD required frame size for 16 kHz audio (32 ms)."""

_FRAME_SAMPLES_8K = 256
"""Silero VAD required frame size for 8 kHz audio (32 ms)."""

_SUPPORTED_RATES: Tuple[int, ...] = (8000, 16000)
"""Sample rates supported by Silero VAD v5."""


# ── Result type ───────────────────────────────────────────────────────────────

@dataclass
class VADResult:
    """Result of voice activity detection on an audio chunk.

    Attributes:
        is_speech: True if the chunk contains speech.
        confidence: Speech probability in [0.0, 1.0]. For the energy fallback
            this is the normalised RMS energy rather than a true probability.
    """

    is_speech: bool
    confidence: float


# ── Energy fallback ───────────────────────────────────────────────────────────

def _energy_fallback(pcm_chunk: bytes, threshold: float = 0.015) -> VADResult:
    """RMS energy-based VAD fallback used when torch is unavailable.

    This mirrors the logic in ``backend.voice.audio_utils.compute_rms_energy``
    but returns a :class:`VADResult` for interface consistency.

    Args:
        pcm_chunk: Raw PCM audio bytes (16-bit signed little-endian, mono).
        threshold: RMS energy threshold above which audio is considered speech.
            The default 0.015 matches ``DEFAULT_VAD_THRESHOLD`` in duplex.py.

    Returns:
        VADResult with energy-derived confidence and speech flag.

    Example:
        >>> result = _energy_fallback(b"\\x00" * 1024)
        >>> result.is_speech
        False
        >>> result.confidence
        0.0
    """
    n = len(pcm_chunk) // 2
    if n == 0:
        return VADResult(is_speech=False, confidence=0.0)

    samples = struct.unpack(f"<{n}h", pcm_chunk[: n * 2])
    rms = (sum(s * s for s in samples) / n) ** 0.5 / 32768.0
    return VADResult(is_speech=rms > threshold, confidence=min(rms, 1.0))


# ── SileroVAD ─────────────────────────────────────────────────────────────────

class SileroVAD:
    """ML-based Voice Activity Detection using Silero VAD v5.

    Provides dramatically better speech/non-speech classification than
    energy-based thresholds. Handles keyboard noise, fan noise, and
    background music without false triggers.

    The model runs on CPU with sub-millisecond latency per chunk,
    making it suitable for real-time streaming audio.

    If torch is unavailable or the model cannot be loaded, all calls
    transparently delegate to :func:`_energy_fallback`.

    Attributes:
        threshold: Speech confidence threshold for the ``is_speech`` flag.
        device: Torch device string used for inference.

    Example:
        >>> vad = SileroVAD(threshold=0.5)
        >>> result = vad.detect(pcm_chunk, sample_rate=16000)
        >>> result.is_speech
        True
        >>> vad.reset()  # clear LSTM state between utterances
    """

    def __init__(self, threshold: float = 0.5, device: str = "cpu") -> None:
        """Initialize VAD model.

        Attempts to load the Silero VAD model from torch.hub (downloads ~2 MB
        on first use and caches locally). If loading fails for any reason, the
        instance silently degrades to energy-based detection.

        Args:
            threshold: Speech detection threshold (0.0–1.0). Higher values
                yield fewer false positives but may miss quiet or distant
                speech. Default 0.5 is the value recommended by Silero authors.
            device: Torch device string. Default ``"cpu"`` is recommended —
                the model is tiny and CPU inference is fast enough for
                real-time use without occupying VRAM.
        """
        self.threshold = threshold
        self.device = device

        self._model: Optional[object] = None
        self._get_speech_timestamps = None  # noqa: SIM910  (not used for streaming)
        self._using_fallback: bool = True

        if _HAS_TORCH:
            self._load_model()

    # ── Public API ────────────────────────────────────────────────────────────

    def detect(self, pcm_chunk: bytes, sample_rate: int = 16000) -> VADResult:
        """Classify a PCM audio chunk as speech or non-speech.

        The chunk is zero-padded or truncated to the required Silero frame size
        before inference. For sub-frame chunks (< 512 samples at 16 kHz) the
        method falls back to energy detection to avoid incorrect predictions on
        tiny buffers.

        Args:
            pcm_chunk: Raw PCM audio bytes (16-bit signed little-endian, mono).
            sample_rate: Audio sample rate in Hz. Must be 16000 or 8000 for
                the Silero model path; other rates force the energy fallback.

        Returns:
            VADResult with speech classification and confidence score.

        Example:
            >>> vad = SileroVAD()
            >>> result = vad.detect(silence_bytes)
            >>> result.is_speech
            False
        """
        if self._using_fallback or not _HAS_TORCH:
            return _energy_fallback(pcm_chunk, self.threshold)

        if sample_rate not in _SUPPORTED_RATES:
            logger.debug(
                "SileroVAD: unsupported sample_rate=%d, using energy fallback",
                sample_rate,
            )
            return _energy_fallback(pcm_chunk, self.threshold)

        required_samples = (
            _FRAME_SAMPLES_16K if sample_rate == 16000 else _FRAME_SAMPLES_8K
        )

        n_samples = len(pcm_chunk) // 2
        if n_samples < required_samples // 2:
            # Chunk is less than half a frame — energy fallback is more stable.
            return _energy_fallback(pcm_chunk, self.threshold)

        try:
            tensor = self._pcm_to_tensor(pcm_chunk, required_samples)
            confidence: float = self._model(tensor, sample_rate).item()  # type: ignore[operator]
            return VADResult(is_speech=confidence >= self.threshold, confidence=confidence)
        except Exception as exc:  # pragma: no cover
            logger.warning("SileroVAD.detect failed, using energy fallback: %s", exc)
            return _energy_fallback(pcm_chunk, self.threshold)

    def reset(self) -> None:
        """Reset the internal LSTM state between utterances.

        Silero VAD v5 is a stateful model: its GRU/LSTM layers carry context
        from previous chunks to improve detection at the start of a new word.
        That same state can cause false triggers at the beginning of a new
        independent utterance. Always call this after a complete utterance is
        committed to ASR, and when starting a new voice session.

        Example:
            >>> vad = SileroVAD()
            >>> # ... process utterance chunks ...
            >>> vad.reset()  # prepare for the next utterance
        """
        if self._model is not None and hasattr(self._model, "reset_states"):
            try:
                self._model.reset_states()  # type: ignore[union-attr]
            except Exception as exc:  # pragma: no cover
                logger.debug("SileroVAD.reset_states failed: %s", exc)

    @property
    def using_fallback(self) -> bool:
        """True if the instance is running energy-based fallback detection.

        Useful for logging and health-check endpoints.

        Returns:
            True when torch or the Silero model is unavailable.
        """
        return self._using_fallback

    # ── Private helpers ───────────────────────────────────────────────────────

    def _load_model(self) -> None:
        """Attempt to load the Silero VAD model from torch.hub.

        Sets ``self._using_fallback = False`` on success. Any failure is
        caught and logged so the caller always gets a working VAD instance.
        """
        try:
            # torch.hub.load caches the model in ~/.cache/torch/hub after the
            # first download (~2 MB).  trust_repo=True is required for PyTorch
            # >= 1.13 and silences the security prompt.
            model, _ = torch.hub.load(  # type: ignore[attr-defined]
                repo_or_dir="snakers4/silero-vad",
                model="silero_vad",
                force_reload=False,
                trust_repo=True,
                verbose=False,
            )
            model = model.to(self.device)
            model.eval()
            self._model = model
            self._using_fallback = False
            logger.info("SileroVAD: model loaded successfully (device=%s)", self.device)
        except Exception as exc:
            logger.warning(
                "SileroVAD: could not load model (%s) — using energy fallback. "
                "Ensure network access on first run to cache the model (~2 MB).",
                exc,
            )
            self._using_fallback = True

    def _pcm_to_tensor(self, pcm_chunk: bytes, required_samples: int) -> "torch.Tensor":  # type: ignore[name-defined]
        """Convert raw PCM bytes to a float32 tensor padded to required_samples.

        Silero VAD requires a specific number of samples per forward pass.
        If the chunk is shorter, it is zero-padded on the right; if longer,
        it is truncated to the first ``required_samples`` samples. Truncation
        is intentional — downstream code should send consistently-sized chunks.

        Args:
            pcm_chunk: Raw 16-bit signed little-endian PCM bytes.
            required_samples: Frame size the model expects (512 or 256).

        Returns:
            1-D float32 torch.Tensor of shape ``(required_samples,)`` with
            values in [-1.0, 1.0].
        """
        n_available = len(pcm_chunk) // 2
        n_use = min(n_available, required_samples)

        samples = struct.unpack(f"<{n_use}h", pcm_chunk[: n_use * 2])

        # Normalise int16 → float32 in [-1, 1]
        float_samples = [s / 32768.0 for s in samples]

        # Pad to required_samples if needed
        if len(float_samples) < required_samples:
            float_samples += [0.0] * (required_samples - len(float_samples))

        return torch.tensor(float_samples, dtype=torch.float32)  # type: ignore[attr-defined]
