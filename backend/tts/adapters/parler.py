"""
Parler-TTS adapter for waifu-rt3d.

Parler-TTS (by Hugging Face) is an 880M-parameter TTS model that uses
natural-language descriptions to control voice characteristics.  Instead
of selecting a fixed voice preset, you describe the desired voice:
"A young woman with a warm, expressive tone speaking at moderate pace."

Requires GPU with 4 GB+ VRAM.

Setup:
    pip install parler-tts
    parler-tts-server --port 8897

  -- or via Docker --
    docker run --gpus all -p 8897:8897 huggingface/parler-tts:latest

Config example (app.json):
    "tts": {
        "provider": "parler",
        "endpoint": "http://localhost:8897",
        "voice_id": "parler_expressive",
        "voice_description": "A young woman with a warm, expressive tone"
    }

Voice control:
    The voice_description field is the key differentiator.  Describe
    age, gender, emotion, pace, and style in natural language.
    The model generates a matching voice on the fly.
"""
import requests
from pathlib import Path
from .base import TTSAdapter


class ParlerTTSAdapter(TTSAdapter):
    """TTS adapter for Parler-TTS server.

    Text-described voice generation — control voice characteristics
    through natural language descriptions.  Requires GPU (4 GB+ VRAM).

    Args:
        audio_dir: Path to the directory where audio files are saved.
    """

    DEFAULT_DESCRIPTION = (
        "A young woman with a warm, expressive tone speaking clearly "
        "at a moderate pace in a quiet studio."
    )

    def speak(self, text: str, tts_cfg: dict) -> dict:
        """Generate speech using Parler-TTS server.

        Args:
            text: Text to synthesize.
            tts_cfg: TTS configuration dict. Relevant keys:
                - endpoint (str): Base URL, e.g. "http://localhost:8897".
                - voice_id (str): Voice preset, e.g. "parler_expressive".
                - voice_description (str): Natural-language voice description.

        Returns:
            dict: {
                "ok": bool,
                "filename": str,   -- audio filename within audio_dir (on success)
                "meta": dict,      -- provider/voice metadata (on success)
                "error": str       -- error message (on failure)
            }

        Example:
            >>> adapter = ParlerTTSAdapter(Path("/tmp/audio"))
            >>> result = adapter.speak(
            ...     "Hello!",
            ...     {"endpoint": "http://localhost:8897",
            ...      "voice_description": "A cheerful young woman speaking quickly"}
            ... )
            >>> print(result["ok"])  # True
        """
        endpoint = (tts_cfg.get("endpoint") or "http://localhost:8897").rstrip("/")
        voice = tts_cfg.get("voice_id") or "parler_expressive"
        description = tts_cfg.get("voice_description") or self.DEFAULT_DESCRIPTION

        key = f"parler|{voice}|{description}|{text}"
        name = self._mk_name(key, "wav")
        out_path = self.audio_dir / name

        payload = {
            "text": text,
            "description": description,
            "voice": voice,
        }

        try:
            r = requests.post(
                f"{endpoint}/v1/audio/speech",
                headers={"Content-Type": "application/json"},
                json=payload,
                timeout=(5, 120),
            )

            if r.status_code != 200:
                return {
                    "ok": False,
                    "error": f"Parler-TTS server error {r.status_code}: {r.text[:200]}",
                }

            out_path.write_bytes(r.content)
            return {
                "ok": True,
                "filename": name,
                "meta": {
                    "provider": "parler",
                    "voice_id": voice,
                    "description": description[:100],
                    "endpoint": endpoint,
                },
            }

        except requests.exceptions.ConnectionError:
            return {
                "ok": False,
                "error": (
                    "Cannot connect to Parler-TTS server. "
                    "Start it with: parler-tts-server --port 8897"
                ),
            }
        except Exception as e:
            return {"ok": False, "error": f"Parler-TTS adapter error: {e}"}
