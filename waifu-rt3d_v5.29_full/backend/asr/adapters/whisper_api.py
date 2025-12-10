import requests
import io
from typing import Dict, Optional
from .base import ASRAdapter

class WhisperAPIAdapter(ASRAdapter):
    """OpenAI Whisper API adapter for cloud-based transcription."""

    def __init__(self, config: Dict):
        super().__init__(config)
        # Ensure endpoint has correct format
        self.endpoint = self.endpoint.rstrip("/")
        if not self.endpoint.endswith("/audio/transcriptions"):
            self.endpoint = f"{self.endpoint}/audio/transcriptions"

    async def transcribe(self, audio_bytes: bytes, language: Optional[str] = None) -> Dict:
        """
        Transcribe audio using OpenAI Whisper API.

        API Endpoint: POST /v1/audio/transcriptions
        Documentation: https://platform.openai.com/docs/api-reference/audio
        """
        try:
            lang = language or self.language

            # Prepare multipart form data
            files = {
                'file': ('audio.webm', io.BytesIO(audio_bytes), 'audio/webm')
            }
            data = {
                'model': self.model,
                'language': lang,
                'response_format': 'json'  # Options: json, text, srt, vtt
            }
            headers = {
                'Authorization': f'Bearer {self.api_key}'
            }

            # Make API request
            response = requests.post(
                self.endpoint,
                files=files,
                data=data,
                headers=headers,
                timeout=30
            )
            response.raise_for_status()

            # Parse response
            result = response.json()
            return {
                "text": result.get("text", ""),
                "language": result.get("language", lang),
                "confidence": 1.0,  # Whisper API doesn't provide confidence
                "duration": result.get("duration", 0.0)
            }

        except requests.exceptions.RequestException as e:
            raise Exception(f"Whisper API request failed: {str(e)}")
        except Exception as e:
            raise Exception(f"Whisper API transcription failed: {str(e)}")

    def validate_config(self) -> bool:
        """Validate API key and endpoint."""
        if not self.api_key:
            raise ValueError("Whisper API requires 'api_key' in config")
        if not self.endpoint:
            raise ValueError("Whisper API requires 'endpoint' in config")
        return True
