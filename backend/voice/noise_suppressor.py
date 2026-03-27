"""Noise suppression for user microphone audio using DeepFilterNet 3.

Removes background noise (fans, keyboards, room echo, ambient music) from
PCM audio before it reaches the ASR model.  Dramatically improves Whisper
transcription accuracy in typical desktop environments.

Model: DeepFilterNet 3 (~2 M params, Apache 2.0)
  - RTF 0.19 on an Intel i5 — ~40 ms latency at 16 kHz
  - Runs entirely on CPU via the Rust ``tract`` inference engine
  - Install: ``pip install deepfilternet``

Falls back gracefully when the library is not installed — audio is returned
unchanged so the rest of the voice pipeline continues working.

Schema dependencies:
    None — this module is stateless.

Example:
    >>> suppressor = NoiseSuppressor()
    >>> result = suppressor.process(pcm_bytes, sample_rate=16000)
    >>> print(f"Reduced noise by {result.noise_reduction_db:.1f} dB")
    Reduced noise by 12.3 dB
"""

from __future__ import annotations

import io
import logging
import struct
import threading
from dataclasses import dataclass
from typing import Optional

logger = logging.getLogger(__name__)

# ── Optional DeepFilterNet import ─────────────────────────────────────────────

_HAS_DEEPFILTER = False
_df_enhance = None
_df_init = None
_df_load_audio = None
_df_save_audio = None

try:
    from df.enhance import enhance, init_df, load_audio, save_audio  # type: ignore

    _df_enhance = enhance
    _df_init = init_df
    _df_load_audio = load_audio
    _df_save_audio = save_audio
    _HAS_DEEPFILTER = True
    logger.debug("DeepFilterNet 3 loaded — noise suppression available")
except ImportError:
    logger.info(
        "deepfilternet not installed — noise suppression disabled. "
        "Run: pip install deepfilternet"
    )

# ── Supported sample rates ────────────────────────────────────────────────────

_SUPPORTED_RATES = {16000, 48000}

# ── Data classes ──────────────────────────────────────────────────────────────


@dataclass
class DenoiseResult:
    """Result of noise suppression on a single audio chunk.

    Attributes:
        audio_bytes: Cleaned PCM audio in the same format as the input
            (16-bit signed little-endian, mono).
        noise_reduction_db: Estimated noise reduction in dB. 0.0 when the
            fallback passthrough is used (library not installed).
    """

    audio_bytes: bytes
    noise_reduction_db: float


# ── Helpers ───────────────────────────────────────────────────────────────────


def _passthrough_fallback(pcm_bytes: bytes) -> DenoiseResult:
    """Return PCM audio unchanged when DeepFilterNet is unavailable.

    Args:
        pcm_bytes: Raw PCM audio bytes (any length).

    Returns:
        DenoiseResult with the original audio and 0 dB reduction.
    """
    return DenoiseResult(audio_bytes=pcm_bytes, noise_reduction_db=0.0)


def _pcm_bytes_to_numpy(pcm_bytes: bytes) -> "np.ndarray":  # type: ignore[name-defined]
    """Convert 16-bit signed PCM bytes to a float32 numpy array.

    DeepFilterNet expects float32 audio normalised to [-1.0, 1.0].

    Args:
        pcm_bytes: Raw 16-bit signed little-endian mono PCM data.

    Returns:
        Float32 numpy array with values in [-1.0, 1.0].
    """
    import numpy as np  # imported here to keep the top-level import optional

    n_samples = len(pcm_bytes) // 2
    samples = struct.unpack(f"<{n_samples}h", pcm_bytes[: n_samples * 2])
    return np.array(samples, dtype=np.float32) / 32767.0


def _numpy_to_pcm_bytes(arr: "np.ndarray") -> bytes:  # type: ignore[name-defined]
    """Convert a float32 numpy array back to 16-bit signed PCM bytes.

    Args:
        arr: Float32 numpy array (values nominally in [-1.0, 1.0], will be
            clipped to that range before conversion).

    Returns:
        Raw 16-bit signed little-endian mono PCM bytes.
    """
    import numpy as np  # imported here to keep the top-level import optional

    clipped = np.clip(arr, -1.0, 1.0)
    as_int16 = (clipped * 32767.0).astype(np.int16)
    return as_int16.tobytes()


def _estimate_noise_reduction(original: bytes, denoised: bytes) -> float:
    """Estimate noise reduction in dB by comparing RMS energy of both buffers.

    This is a simple proxy metric, not a true SNR measurement.  It computes
    the ratio of the RMS energies of the difference signal (the suppressed
    noise) vs. the original signal, expressed in dB.

    Args:
        original: Raw PCM bytes before denoising (16-bit signed LE mono).
        denoised: Raw PCM bytes after denoising (same format).

    Returns:
        Estimated noise reduction in dB (0.0 if calculation is not possible).
    """
    import math
    import struct

    try:
        n_orig = len(original) // 2
        n_denoise = len(denoised) // 2
        n = min(n_orig, n_denoise)
        if n == 0:
            return 0.0

        orig_samples = struct.unpack(f"<{n}h", original[: n * 2])
        den_samples = struct.unpack(f"<{n}h", denoised[: n * 2])

        rms_orig = (sum(s * s for s in orig_samples) / n) ** 0.5
        diff = [o - d for o, d in zip(orig_samples, den_samples)]
        rms_diff = (sum(s * s for s in diff) / n) ** 0.5

        if rms_orig < 1e-6 or rms_diff < 1e-6:
            return 0.0

        return 20.0 * math.log10(rms_orig / rms_diff)
    except Exception:
        return 0.0


# ── Main class ────────────────────────────────────────────────────────────────


class NoiseSuppressor:
    """Real-time noise suppression using DeepFilterNet 3.

    Removes background noise, keyboard clicks, fan hum, and room echo from
    microphone audio before ASR processing.  Runs on CPU with low latency,
    suitable for real-time voice conversation.

    The model has internal recurrent state that persists across calls within
    the same audio session, allowing it to track noise statistics over time.
    Call :meth:`reset` between independent recording sessions.

    Thread safety:
        All public methods acquire an internal lock before touching model
        state, so this class is safe to call from async contexts via a
        threadpool (``asyncio.to_thread`` / ``loop.run_in_executor``).

    Example:
        >>> suppressor = NoiseSuppressor(atten_lim_db=100.0)
        >>> result = suppressor.process(pcm_bytes, sample_rate=16000)
        >>> clean_pcm = result.audio_bytes
        >>> print(f"Noise reduced by {result.noise_reduction_db:.1f} dB")
    """

    def __init__(self, atten_lim_db: float = 100.0) -> None:
        """Initialize the noise suppression model.

        Args:
            atten_lim_db: Maximum noise attenuation in dB.  Higher values
                allow more aggressive noise removal but may distort speech at
                very low SNR.  Default 100.0 (effectively unconstrained).
        """
        self._atten_lim_db = atten_lim_db
        self._lock = threading.Lock()
        self._model: Optional[object] = None
        self._df_state: Optional[object] = None

        if _HAS_DEEPFILTER:
            self._load_model()

    # ── Private helpers ───────────────────────────────────────────────────────

    def _load_model(self) -> None:
        """Load (or reload) the DeepFilterNet model and internal df state.

        Called once during ``__init__`` and again by ``reset()``.  Safe to
        call under ``self._lock``.

        Raises:
            RuntimeError: If model initialisation fails unexpectedly.
        """
        assert _df_init is not None, "DeepFilterNet not imported"
        try:
            # init_df returns (model, df_state, suffix)
            model, df_state, _ = _df_init(config_allow_defaults=True)
            # Apply attenuation limit if the API supports it
            try:
                df_state.set_atten_lim(self._atten_lim_db)  # type: ignore[attr-defined]
            except AttributeError:
                # Older builds may not expose set_atten_lim; ignore silently
                pass
            self._model = model
            self._df_state = df_state
            logger.debug(
                "DeepFilterNet model initialised (atten_lim_db=%.1f)",
                self._atten_lim_db,
            )
        except Exception as exc:
            logger.warning("DeepFilterNet model load failed: %s", exc, exc_info=True)
            self._model = None
            self._df_state = None

    # ── Public API ────────────────────────────────────────────────────────────

    def process(self, pcm_bytes: bytes, sample_rate: int = 16000) -> DenoiseResult:
        """Process raw PCM audio and return denoised output.

        If DeepFilterNet is not installed or model loading failed, the audio
        is returned unchanged via the passthrough fallback.

        Args:
            pcm_bytes: Raw PCM audio bytes (16-bit signed little-endian,
                mono).  Length must be a multiple of 2 bytes.
            sample_rate: Audio sample rate in Hz.  Must be 16 000 or 48 000
                (the two rates supported by DeepFilterNet).

        Returns:
            :class:`DenoiseResult` with cleaned audio and an estimated noise
            reduction figure in dB.

        Raises:
            ValueError: If ``sample_rate`` is not 16 000 or 48 000.

        Example:
            >>> result = suppressor.process(pcm_bytes, sample_rate=16000)
            >>> len(result.audio_bytes) == len(pcm_bytes)
            True
        """
        if not pcm_bytes:
            return DenoiseResult(audio_bytes=b"", noise_reduction_db=0.0)

        if sample_rate not in _SUPPORTED_RATES:
            raise ValueError(
                f"Unsupported sample_rate {sample_rate}. "
                f"DeepFilterNet supports: {sorted(_SUPPORTED_RATES)}"
            )

        if not _HAS_DEEPFILTER or self._model is None or self._df_state is None:
            return _passthrough_fallback(pcm_bytes)

        with self._lock:
            try:
                import numpy as np  # noqa: F401 — ensure numpy available

                assert _df_enhance is not None

                audio_f32 = _pcm_bytes_to_numpy(pcm_bytes)
                # DeepFilterNet expects shape (1, samples) — add batch dim
                audio_batch = audio_f32[None, :]

                enhanced = _df_enhance(
                    self._model,
                    self._df_state,
                    audio_batch,
                    pad=True,
                    atten_lim_db=self._atten_lim_db,
                )

                # enhanced shape: (1, samples) — squeeze batch dim
                denoised_f32 = enhanced.squeeze(0)
                denoised_bytes = _numpy_to_pcm_bytes(denoised_f32)
                reduction_db = _estimate_noise_reduction(pcm_bytes, denoised_bytes)
                return DenoiseResult(
                    audio_bytes=denoised_bytes,
                    noise_reduction_db=max(0.0, reduction_db),
                )
            except Exception as exc:
                logger.warning(
                    "DeepFilterNet inference failed, using passthrough: %s",
                    exc,
                    exc_info=True,
                )
                return _passthrough_fallback(pcm_bytes)

    def process_wav(self, wav_bytes: bytes) -> bytes:
        """Process WAV-format audio and return a denoised WAV.

        Convenience wrapper that parses the WAV header, denoises the PCM
        payload, then re-wraps it in a valid WAV container.  Useful when the
        caller already has a complete WAV file (e.g. from :func:`pcm_to_wav`
        in :mod:`backend.voice.audio_utils`).

        Args:
            wav_bytes: Complete WAV file as bytes (must be 16-bit PCM, mono
                or stereo — stereo will be converted to mono by averaging
                channels before denoising).

        Returns:
            Denoised WAV file as bytes.  If denoising is unavailable or the
            WAV cannot be parsed, the original bytes are returned unchanged.

        Example:
            >>> from backend.voice.audio_utils import pcm_to_wav
            >>> wav = pcm_to_wav(raw_pcm)
            >>> clean_wav = suppressor.process_wav(wav)
            >>> clean_wav[:4]
            b'RIFF'
        """
        try:
            sample_rate, channels, pcm_payload = _parse_wav_header(wav_bytes)
        except Exception as exc:
            logger.warning("WAV parse failed, returning original: %s", exc)
            return wav_bytes

        # Downmix stereo → mono if needed
        if channels == 2:
            pcm_payload = _stereo_to_mono(pcm_payload)

        result = self.process(pcm_payload, sample_rate=sample_rate)
        return _build_wav(result.audio_bytes, sample_rate=sample_rate)

    def reset(self) -> None:
        """Reset internal state between audio sessions.

        DeepFilterNet maintains a recurrent noise-estimate buffer.  This
        method reinitialises the model so that noise statistics from a
        previous recording session do not bleed into a new one.

        Safe to call even if the library is not installed (no-op).

        Example:
            >>> suppressor.reset()  # Call before starting a new recording
        """
        if not _HAS_DEEPFILTER:
            return
        with self._lock:
            self._load_model()
            logger.debug("NoiseSuppressor state reset")


# ── WAV helpers ───────────────────────────────────────────────────────────────


def _parse_wav_header(wav_bytes: bytes) -> tuple[int, int, bytes]:
    """Extract sample rate, channel count, and raw PCM payload from a WAV file.

    Handles the standard RIFF/WAVE PCM format produced by
    :func:`backend.voice.audio_utils.pcm_to_wav`.

    Args:
        wav_bytes: Complete WAV file as bytes.

    Returns:
        Tuple of (sample_rate, channels, pcm_payload).

    Raises:
        ValueError: If the bytes do not form a valid RIFF WAVE PCM file.
    """
    if len(wav_bytes) < 44:
        raise ValueError("WAV data too short (< 44 bytes)")
    if wav_bytes[:4] != b"RIFF" or wav_bytes[8:12] != b"WAVE":
        raise ValueError("Not a valid RIFF WAVE file")

    buf = io.BytesIO(wav_bytes)
    buf.seek(12)  # Skip RIFF header; start scanning sub-chunks

    audio_format: Optional[int] = None
    channels: Optional[int] = None
    sample_rate: Optional[int] = None
    pcm_payload: Optional[bytes] = None

    while True:
        chunk_id = buf.read(4)
        if len(chunk_id) < 4:
            break
        (chunk_size,) = struct.unpack("<I", buf.read(4))

        if chunk_id == b"fmt ":
            fmt_data = buf.read(chunk_size)
            audio_format, n_channels, sr = struct.unpack_from("<HHI", fmt_data, 0)
            audio_format = audio_format
            channels = n_channels
            sample_rate = sr
        elif chunk_id == b"data":
            pcm_payload = buf.read(chunk_size)
            break
        else:
            buf.seek(chunk_size, io.SEEK_CUR)

    if audio_format != 1:
        raise ValueError(f"Only PCM WAV (format 1) is supported, got {audio_format}")
    if channels is None or sample_rate is None or pcm_payload is None:
        raise ValueError("WAV file missing required fmt or data chunks")

    return sample_rate, channels, pcm_payload


def _stereo_to_mono(pcm_bytes: bytes) -> bytes:
    """Average two interleaved stereo channels into a single mono channel.

    Args:
        pcm_bytes: Stereo 16-bit signed PCM (L, R, L, R … interleaved).

    Returns:
        Mono 16-bit signed PCM with averaged L+R samples.
    """
    n_frames = len(pcm_bytes) // 4  # 4 bytes per stereo frame (2 × int16)
    mono: list[int] = []
    for i in range(n_frames):
        left, right = struct.unpack_from("<hh", pcm_bytes, i * 4)
        mono.append((left + right) // 2)
    return struct.pack(f"<{len(mono)}h", *mono)


def _build_wav(pcm_bytes: bytes, sample_rate: int = 16000, channels: int = 1) -> bytes:
    """Wrap raw 16-bit PCM in a minimal RIFF/WAVE header.

    Mirrors :func:`backend.voice.audio_utils.pcm_to_wav` so this module has
    no cross-module dependency at the low level.

    Args:
        pcm_bytes: Raw 16-bit signed little-endian PCM data.
        sample_rate: Sample rate in Hz.
        channels: Number of audio channels (1 = mono).

    Returns:
        Complete WAV file bytes with a valid RIFF header.
    """
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
    buf.write(struct.pack("<H", 1))               # PCM
    buf.write(struct.pack("<H", channels))
    buf.write(struct.pack("<I", sample_rate))
    buf.write(struct.pack("<I", byte_rate))
    buf.write(struct.pack("<H", block_align))
    buf.write(struct.pack("<H", bits_per_sample))
    buf.write(b"data")
    buf.write(struct.pack("<I", data_size))
    buf.write(pcm_bytes)
    return buf.getvalue()
