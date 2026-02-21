import requests
import logging
import uuid
import base64
from pathlib import Path

logger = logging.getLogger("waifu.tts.pinokio")

class PinokioGenericAdapter:
    def __init__(self, output_dir: Path):
        self.output_dir = output_dir

    def speak(self, text: str, opts: dict):
        """
        Generic REST TTS.
        opts: {
            "endpoint": "http://localhost:5050/speak",
            "voice_id": "...",
            "method": "POST" (default)
        }
        """
        endpoint = opts.get("endpoint", "")
        if not endpoint:
            return {"ok": False, "error": "No endpoint provided"}
            
        try:
            # Try to guess standard payloads or use simple text
            payload = {"text": text}
            if "voice_id" in opts: payload["voice"] = opts["voice_id"]
            
            # Support XTTS standard which is common in Pinokio
            if "xtts" in endpoint.lower():
                payload = {
                    "text": text,
                    "language": "en",
                    "speaker_wav": opts.get("voice_id", "default")
                }

            r = requests.post(endpoint, json=payload, timeout=30)
            if r.status_code != 200:
                return {"ok": False, "error": f"TTS Error {r.status_code}: {r.text}"}
                
            # Handle audio response
            # 1. Binary Content
            content_type = r.headers.get("Content-Type", "")
            audio_data = None
            
            if "audio" in content_type or "octet-stream" in content_type:
                audio_data = r.content
            elif "application/json" in content_type:
                # 2. JSON with base64
                data = r.json()
                if "audio" in data:
                    audio_data = base64.b64decode(data["audio"])
                # 3. JSON with URL
                elif "url" in data:
                    # Download it
                    r_audio = requests.get(data["url"])
                    audio_data = r_audio.content
            
            if not audio_data:
                 return {"ok": False, "error": "No audio data in response"}

            filename = f"{uuid.uuid4()}.wav"
            out_file = self.output_dir / filename
            out_file.write_bytes(audio_data)
            
            return {"ok": True, "filename": filename, "path": str(out_file)}

        except Exception as e:
            logger.error(f"Pinokio Adapter Error: {e}")
            return {"ok": False, "error": str(e)}
