"""Groq cloud Whisper ASR adapter — free tier, ~200ms latency.

Uses Groq's OpenAI-compatible ``/v1/audio/transcriptions`` endpoint
with the ``whisper-large-v3-turbo`` model. Free tier has generous
rate limits (about 200 requests per day) making it an excellent
zero-cost STT fallback.

Supports the ``prompt`` parameter for context hints — passing the
character name improves recognition of proper nouns the user speaks.

Configuration (in services.asr.providers.groq):
    api_key: Groq API key (from console.groq.com)
    model: Model ID (default: whisper-large-v3-turbo)
    language: ISO language code (default: en)
    prompt: Context hint for name accuracy (optional)
"""

import io
import logging
from typing import Dict, Optional

import requests

from .base import ASRAdapter

logger = logging.getLogger(__name__)

GROQ_TRANSCRIPTION_URL = "https://api.groq.com/openai/v1/audio/transcriptions"


class GroqASRAdapter(ASRAdapter):
    """Groq cloud Whisper — free tier, ~200ms latency.

    Uses Groq's OpenAI-compatible transcription endpoint. Model
    ``whisper-large-v3-turbo`` provides state-of-the-art accuracy
    with sub-second latency on Groq's LPU inference hardware.

    Args:
        config: Dict with ``api_key`` (required), ``model`` (optional),
            ``language`` (optional), ``prompt`` (optional context hint).

    Example:
        >>> adapter = GroqASRAdapter({"api_key": "gsk_..."})
        >>> result = await adapter.transcribe(audio_bytes)
        >>> result["text"]
        "Hello Mika, how are you?"
    """

    def __init__(self, config: Dict):
        super().__init__(config)
        self.api_key = config.get("api_key", "")
        self.model = config.get("model", "whisper-large-v3-turbo")
        self.prompt = config.get("prompt", "")

    async def transcribe(self, audio_bytes: bytes, language: Optional[str] = None) -> Dict:
        """Transcribe audio using Groq's free Whisper API.

        Args:
            audio_bytes: Audio file as bytes (wav, webm, mp3, etc.).
            language: Optional ISO language code override.

        Returns:
            Dict with ``text``, ``language``, ``confidence``, ``duration``.

        Raises:
            Exception: If Groq API call fails.
        """
        lang = language or self.language

        files = {
            "file": ("audio.webm", io.BytesIO(audio_bytes), "audio/webm"),
        }
        data: Dict = {
            "model": self.model,
            "language": lang,
            "response_format": "verbose_json",
        }
        if self.prompt:
            data["prompt"] = self.prompt

        headers = {
            "Authorization": f"Bearer {self.api_key}",
        }

        try:
            response = requests.post(
                GROQ_TRANSCRIPTION_URL,
                files=files,
                data=data,
                headers=headers,
                timeout=30,
            )
            response.raise_for_status()
            result = response.json()

            return {
                "text": result.get("text", ""),
                "language": result.get("language", lang),
                "confidence": 1.0,
                "duration": result.get("duration", 0.0),
            }
        except requests.exceptions.HTTPError as e:
            logger.error(f"[GroqASR] HTTP error: {e.response.status_code} — {e.response.text[:200]}")
            raise
        except Exception as e:
            logger.error(f"[GroqASR] Transcription failed: {e}")
            raise

    def validate_config(self) -> bool:
        """Validate that a Groq API key is configured."""
        return bool(self.api_key)
