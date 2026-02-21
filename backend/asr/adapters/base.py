from abc import ABC, abstractmethod
from typing import Dict, Optional

class ASRAdapter(ABC):
    """Base class for ASR (speech recognition) adapters."""

    def __init__(self, config: Dict):
        """
        Initialize ASR adapter.

        Args:
            config: Configuration dictionary with provider-specific settings
                   Keys: endpoint, api_key, model, language, etc.
        """
        self.config = config
        self.endpoint = config.get("endpoint", "")
        self.api_key = config.get("api_key", "")
        self.model = config.get("model", "whisper-1")
        self.language = config.get("language", "en")

    @abstractmethod
    async def transcribe(self, audio_bytes: bytes, language: Optional[str] = None) -> Dict:
        """
        Transcribe audio to text.

        Args:
            audio_bytes: Audio file as bytes (mp3, wav, webm, etc.)
            language: Optional language code override (default: self.language)

        Returns:
            {
                "text": str,          # Transcribed text
                "language": str,      # Detected/used language
                "confidence": float,  # 0.0-1.0, if available
                "duration": float,    # Audio duration in seconds, if available
            }

        Raises:
            Exception: If transcription fails
        """
        pass

    def validate_config(self) -> bool:
        """Validate adapter configuration. Override if needed."""
        return True
