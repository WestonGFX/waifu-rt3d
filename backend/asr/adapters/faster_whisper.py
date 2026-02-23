"""
Faster-Whisper ASR adapter for waifu-rt3d.

Wraps the ``backend.asr.faster_whisper_asr`` module as a standard
``ASRAdapter`` so it can be used through the existing ``/api/asr`` endpoint
and ``get_asr_adapter()`` registry.

Config example (app.json legacy flat-config):
    "asr": {
        "enabled": true,
        "provider": "faster_whisper",
        "model": "base.en",
        "gpu": false,
        "language": "en"
    }
"""

from typing import Dict, Optional
from .base import ASRAdapter
from backend.asr import faster_whisper_asr


class FasterWhisperAdapter(ASRAdapter):
    """ASR adapter backed by the Faster-Whisper local model.

    Transcribes audio completely offline — no network calls, no cloud API key.
    Model is loaded lazily on first use and cached for subsequent requests.

    Supported model sizes: ``tiny.en``, ``base.en``, ``small``, ``medium``,
    ``large-v3``.  Use ``base.en`` for a fast English-only baseline.

    Args:
        config: Dict with keys:
            - model (str): Faster-Whisper model size, e.g. ``"base.en"``.
            - gpu (bool): Use CUDA GPU acceleration (requires CUDA toolkit).
            - language (str): Language code for transcription (``"en"`` etc.).

    Example:
        >>> adapter = FasterWhisperAdapter({"model": "base.en", "language": "en"})
        >>> result = await adapter.transcribe(open("audio.webm", "rb").read())
        >>> print(result["text"])  # "Hello, how are you today?"
    """

    async def transcribe(self, audio_bytes: bytes, language: Optional[str] = None) -> Dict:
        """Transcribe audio bytes to text using the local Faster-Whisper model.

        Args:
            audio_bytes: Raw audio data (WebM from MediaRecorder, WAV, MP3, etc.).
            language: Optional language override.  If ``None``, uses the value
                      from ``self.config["language"]`` (default ``"en"``).

        Returns:
            dict: ``{"text": str, "language": str, "confidence": float}``

        Raises:
            ImportError: If ``faster-whisper`` package is not installed.
        """
        effective_lang = language or self.language or "en"

        # Build a minimal cfg dict compatible with faster_whisper_asr.get_model()
        cfg = {
            "asr": {
                "model": self.config.get("model", "base.en"),
                "gpu": self.config.get("gpu", False),
                "language": effective_lang,
            }
        }

        text = faster_whisper_asr.transcribe(audio_bytes, cfg)
        return {
            "text": text,
            "language": effective_lang,
            "confidence": 1.0,  # Faster-Whisper doesn't expose per-segment confidence
        }

    def validate_config(self) -> bool:
        """Return True — Faster-Whisper only needs the package to be installed."""
        try:
            import faster_whisper  # type: ignore[import]  # noqa: F401
            return True
        except ImportError:
            return False
