import requests
import io
from typing import Dict, Optional
from .base import ASRAdapter

class WhisperLocalAdapter(ASRAdapter):
    """Local Whisper.cpp adapter for offline transcription."""

    def __init__(self, config: Dict):
        super().__init__(config)
        # Default to localhost whisper.cpp server
        if not self.endpoint:
            self.endpoint = "http://127.0.0.1:8080"
        self.endpoint = self.endpoint.rstrip("/")

        # Whisper.cpp model name (e.g., "base.en", "small", "medium")
        self.model = config.get("model", "base.en")

    async def transcribe(self, audio_bytes: bytes, language: Optional[str] = None) -> Dict:
        """
        Transcribe audio using local Whisper.cpp server.

        Whisper.cpp Server: https://github.com/ggerganov/whisper.cpp
        Start server: ./server -m models/ggml-base.en.bin
        """
        try:
            lang = language or self.language

            # Whisper.cpp server expects multipart form
            files = {
                'file': ('audio.webm', io.BytesIO(audio_bytes), 'audio/webm')
            }
            data = {
                'language': lang,
                'response_format': 'json'
            }

            # Make request to local server
            response = requests.post(
                f"{self.endpoint}/inference",
                files=files,
                data=data,
                timeout=60  # Longer timeout for local processing
            )
            response.raise_for_status()

            # Parse response
            result = response.json()

            # Whisper.cpp returns different format
            if "text" in result:
                text = result["text"]
            elif "transcription" in result:
                text = result["transcription"]
            else:
                text = str(result)

            return {
                "text": text.strip(),
                "language": lang,
                "confidence": result.get("confidence", 0.95),
                "duration": 0.0
            }

        except requests.exceptions.ConnectionError:
            raise Exception(
                "Cannot connect to Whisper.cpp server. "
                "Is it running on {}?".format(self.endpoint)
            )
        except requests.exceptions.RequestException as e:
            raise Exception(f"Whisper.cpp request failed: {str(e)}")
        except Exception as e:
            raise Exception(f"Whisper.cpp transcription failed: {str(e)}")

    def validate_config(self) -> bool:
        """Check if Whisper.cpp server is accessible."""
        try:
            response = requests.get(self.endpoint, timeout=2)
            return response.status_code in [200, 404]  # 404 is ok for root
        except:
            return False
