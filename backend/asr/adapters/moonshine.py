"""
Moonshine v2 ASR adapter for waifu-rt3d.

Uses the ``useful-moonshine`` or ``moonshine-onnx`` package for fully local,
CPU-friendly speech transcription.  Moonshine Tiny (~25M params) runs at
~5x realtime on a modern CPU — significantly faster than Whisper Tiny while
maintaining comparable accuracy, making it well-suited for real-time voice
conversations.

Config example (app.json):
    "asr": {
        "enabled": true,
        "provider": "moonshine",
        "model": "moonshine/tiny",
        "language": "en"
    }

Supported models:
    - ``moonshine/tiny``  — ~25M params, fastest, lowest memory
    - ``moonshine/base``  — ~60M params, slightly higher accuracy

Install:
    pip install useful-moonshine
    # or for pure ONNX runtime (no PyTorch):
    pip install moonshine-onnx
"""

import io
import struct
import time
import wave
import logging
from typing import Dict, Optional

from .base import ASRAdapter

logger = logging.getLogger(__name__)


class MoonshineAdapter(ASRAdapter):
    """ASR adapter using Moonshine v2 for fast local transcription.

    Moonshine is ~5x faster than Whisper Tiny with comparable accuracy,
    making it ideal for real-time voice conversations.  The model is loaded
    lazily on the first ``transcribe()`` call and cached for the lifetime of
    the adapter instance.

    Accepts 16 kHz mono PCM/WAV audio — the same format produced by the
    existing voice pipeline (``backend/voice/duplex.py``).

    Args:
        config: Dict with keys:
            - model (str): Hugging Face model path.  One of
              ``"moonshine/tiny"`` (default) or ``"moonshine/base"``.
            - language (str): Language code for transcription (``"en"`` etc.).

    Example:
        >>> adapter = MoonshineAdapter({"model": "moonshine/tiny", "language": "en"})
        >>> result = await adapter.transcribe(open("audio.wav", "rb").read())
        >>> print(result["text"])  # "Hello, how are you today?"
    """

    # Moonshine requires 16 kHz mono audio.
    _SAMPLE_RATE: int = 16_000

    def __init__(self, config: Dict) -> None:
        """Initialize the Moonshine adapter.

        Args:
            config: Configuration dictionary.  Relevant keys:
                - model (str): ``"moonshine/tiny"`` or ``"moonshine/base"``.
                  Defaults to ``"moonshine/tiny"``.
                - language (str): Language code.  Defaults to ``"en"``.
        """
        super().__init__(config)
        self._model_name: str = config.get("model", "moonshine/tiny")
        # Lazy-loaded; None until first transcribe() call.
        self._moon_model = None
        self._moonshine_available: Optional[bool] = None  # None = not yet checked

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _load_model(self) -> bool:
        """Load the Moonshine model, returning True on success.

        Tries ``useful-moonshine`` first, then ``moonshine-onnx`` as a
        fallback.  Sets ``self._moon_model`` and ``self._moonshine_available``
        as a side-effect.

        Returns:
            True if the model loaded successfully, False otherwise.
        """
        if self._moonshine_available is True and self._moon_model is not None:
            return True
        if self._moonshine_available is False:
            return False

        # --- Try useful-moonshine (PyTorch-based) ---
        try:
            from moonshine import load_model  # type: ignore[import]

            logger.info("Loading Moonshine model via useful-moonshine: %s", self._model_name)
            self._moon_model = load_model(self._model_name)
            self._moonshine_available = True
            logger.info("Moonshine model loaded successfully (useful-moonshine).")
            return True
        except ImportError:
            pass
        except Exception as exc:
            logger.warning("useful-moonshine model load failed: %s", exc)

        # --- Fallback: moonshine-onnx ---
        try:
            from moonshine_onnx import MoonshineOnnxModel  # type: ignore[import]

            logger.info("Loading Moonshine model via moonshine-onnx: %s", self._model_name)
            # moonshine-onnx accepts the short model name without the "moonshine/" prefix.
            short_name = self._model_name.split("/")[-1]  # "tiny" or "base"
            self._moon_model = MoonshineOnnxModel(model_name=short_name)
            self._moonshine_available = True
            logger.info("Moonshine model loaded successfully (moonshine-onnx).")
            return True
        except ImportError:
            pass
        except Exception as exc:
            logger.warning("moonshine-onnx model load failed: %s", exc)

        self._moonshine_available = False
        return False

    @staticmethod
    def _wav_bytes_to_float32(audio_bytes: bytes):  # type: ignore[return]
        """Convert WAV bytes to a 1-D float32 numpy array at 16 kHz.

        Handles both standard WAV containers and raw 16-bit PCM bytes
        (no header).  The output array is normalised to the [-1, 1] range.

        Args:
            audio_bytes: WAV-formatted or raw 16-bit PCM audio bytes.

        Returns:
            numpy.ndarray: 1-D float32 array of audio samples.

        Raises:
            ValueError: If the audio could not be parsed or resampled.
        """
        import numpy as np  # type: ignore[import]

        # --- Attempt WAV parse first ---
        try:
            with wave.open(io.BytesIO(audio_bytes), "rb") as wf:
                n_channels = wf.getnchannels()
                sampwidth = wf.getsampwidth()
                framerate = wf.getframerate()
                n_frames = wf.getnframes()
                raw = wf.readframes(n_frames)

            if sampwidth != 2:
                raise ValueError(f"Unsupported sample width: {sampwidth} bytes (expected 2/int16)")

            samples = np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0

            # Mix down to mono if stereo
            if n_channels == 2:
                samples = samples.reshape(-1, 2).mean(axis=1)

            # Resample to 16 kHz if necessary (simple linear interpolation)
            if framerate != MoonshineAdapter._SAMPLE_RATE:
                target_len = int(len(samples) * MoonshineAdapter._SAMPLE_RATE / framerate)
                samples = np.interp(
                    np.linspace(0, len(samples) - 1, target_len),
                    np.arange(len(samples)),
                    samples,
                ).astype(np.float32)

            return samples

        except (wave.Error, struct.error, EOFError):
            # Not a valid WAV — assume raw 16-bit little-endian PCM at 16 kHz
            pass

        # --- Raw PCM fallback ---
        samples = np.frombuffer(audio_bytes, dtype=np.int16).astype(np.float32) / 32768.0
        return samples

    # ------------------------------------------------------------------
    # ASRAdapter interface
    # ------------------------------------------------------------------

    async def transcribe(self, audio_bytes: bytes, language: Optional[str] = None) -> Dict:
        """Transcribe audio bytes to text using the local Moonshine model.

        Loads the model on the first call (lazy init).  If the ``moonshine``
        or ``moonshine-onnx`` packages are not installed, returns an error
        dict rather than raising, so the caller can surface a friendly
        message to the user.

        Args:
            audio_bytes: Raw audio data — WAV (16-bit PCM, 16 kHz mono
                preferred) or raw PCM bytes as produced by the voice pipeline.
            language: Optional language override.  Currently informational
                only; Moonshine Tiny is English-optimised and does not perform
                language-switching at runtime.

        Returns:
            dict with keys:
                - ``text`` (str): Transcribed text, or empty string on error.
                - ``language`` (str): Language code used.
                - ``confidence`` (float): Always 1.0 (Moonshine does not
                  expose per-token confidence).
                - ``duration`` (float): Estimated audio duration in seconds.
                - ``error`` (str): Present only if transcription failed.

        Example:
            >>> result = await adapter.transcribe(wav_bytes)
            >>> print(result["text"])
            "Hello world"
        """
        effective_lang = language or self.language or "en"

        # --- Graceful degradation if package missing ---
        if not self._load_model():
            return {
                "text": "",
                "language": effective_lang,
                "confidence": 0.0,
                "duration": 0.0,
                "error": (
                    "Moonshine not installed. "
                    "Run: pip install useful-moonshine  "
                    "or: pip install moonshine-onnx"
                ),
            }

        try:
            import numpy as np  # type: ignore[import]

            t_start = time.perf_counter()

            samples = self._wav_bytes_to_float32(audio_bytes)
            duration = len(samples) / self._SAMPLE_RATE

            # --- Transcribe via useful-moonshine ---
            # useful-moonshine: transcribe(audio) → list[str]
            if hasattr(self._moon_model, "transcribe"):
                # useful-moonshine API: model.transcribe(audio_array)
                # audio_array must be shape (1, samples) or (samples,)
                audio_input = samples[np.newaxis, :]  # (1, N)
                tokens = self._moon_model.transcribe(audio_input)
                # Returns a list of strings (one per batch item)
                text = tokens[0] if isinstance(tokens, list) else str(tokens)

            # --- Transcribe via moonshine-onnx ---
            elif hasattr(self._moon_model, "generate"):
                # moonshine-onnx API: model.generate(audio) → list[list[int]]
                # Then decode with the tokenizer
                tokens = self._moon_model.generate(samples[np.newaxis, :])
                text = self._moon_model.tokenizer.decode_batch(tokens)[0]

            else:
                raise RuntimeError(
                    f"Unrecognised Moonshine model interface: {type(self._moon_model)}"
                )

            elapsed = time.perf_counter() - t_start
            rtf = elapsed / duration if duration > 0 else 0.0
            logger.debug(
                "Moonshine transcribed %.2fs audio in %.3fs (RTF=%.2f): %r",
                duration,
                elapsed,
                rtf,
                text[:80],
            )

            return {
                "text": text.strip(),
                "language": effective_lang,
                "confidence": 1.0,
                "duration": duration,
            }

        except Exception as exc:
            logger.exception("Moonshine transcription failed: %s", exc)
            return {
                "text": "",
                "language": effective_lang,
                "confidence": 0.0,
                "duration": 0.0,
                "error": str(exc),
            }

    def validate_config(self) -> bool:
        """Return True if either moonshine package variant is importable.

        Checks for ``useful-moonshine`` first, then ``moonshine-onnx``.
        Does NOT load the model weights — use this for a quick availability
        check at startup.

        Returns:
            True if at least one Moonshine package is installed, False
            otherwise.
        """
        try:
            import moonshine  # type: ignore[import]  # noqa: F401
            return True
        except ImportError:
            pass
        try:
            import moonshine_onnx  # type: ignore[import]  # noqa: F401
            return True
        except ImportError:
            pass
        return False
