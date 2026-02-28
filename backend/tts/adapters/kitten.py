"""
KittenTTS adapter for waifu-rt3d.

KittenTTS is an ultra-lightweight ONNX-based TTS engine (15M–80M params,
<25 MB on disk).  It runs entirely on CPU with near-instant latency,
making it ideal for low-power setups or as a snappy fallback voice.

Four built-in female voices are available out of the box.

Setup:
    pip install kittentts
    kittentts-server --port 8891

Config example (app.json):
    "tts": {
        "provider": "kitten",
        "endpoint": "http://localhost:8891",
        "voice_id": "af_claire"
    }

Available voices:
    af_claire   — Clear, confident female
    af_luna     — Soft, dreamy female
    af_violet   — Warm, expressive female
    af_rose     — Bright, cheerful female
"""
import requests
from pathlib import Path
from .base import TTSAdapter


class KittenTTSAdapter(TTSAdapter):
    """TTS adapter for KittenTTS ONNX server.

    Ultra-lightweight CPU-only engine with four built-in female voices.
    Produces WAV audio via a simple REST API.

    Args:
        audio_dir: Path to the directory where audio files are saved.
    """

    def speak(self, text: str, tts_cfg: dict) -> dict:
        """Generate speech using KittenTTS server.

        Args:
            text: Text to synthesize.
            tts_cfg: TTS configuration dict. Relevant keys:
                - endpoint (str): Base URL, e.g. "http://localhost:8891".
                - voice_id (str): Voice name, e.g. "af_claire".

        Returns:
            dict: {
                "ok": bool,
                "filename": str,   -- audio filename within audio_dir (on success)
                "meta": dict,      -- provider/voice metadata (on success)
                "error": str       -- error message (on failure)
            }

        Example:
            >>> adapter = KittenTTSAdapter(Path("/tmp/audio"))
            >>> result = adapter.speak("Hello!", {"endpoint": "http://localhost:8891", "voice_id": "af_claire"})
            >>> print(result["ok"])  # True
        """
        endpoint = (tts_cfg.get("endpoint") or "http://localhost:8891").rstrip("/")
        voice = tts_cfg.get("voice_id") or "af_claire"

        key = f"kitten|{voice}|{text}"
        name = self._mk_name(key, "wav")
        out_path = self.audio_dir / name

        payload = {
            "text": text,
            "voice": voice,
            "format": "wav",
        }

        try:
            r = requests.post(
                f"{endpoint}/v1/audio/speech",
                headers={"Content-Type": "application/json"},
                json=payload,
                timeout=(5, 30),
            )

            if r.status_code != 200:
                return {
                    "ok": False,
                    "error": f"KittenTTS server error {r.status_code}: {r.text[:200]}",
                }

            out_path.write_bytes(r.content)
            return {
                "ok": True,
                "filename": name,
                "meta": {"provider": "kitten", "voice_id": voice, "endpoint": endpoint},
            }

        except requests.exceptions.ConnectionError:
            return {
                "ok": False,
                "error": (
                    "Cannot connect to KittenTTS server. "
                    "Start it with: kittentts-server --port 8891"
                ),
            }
        except Exception as e:
            return {"ok": False, "error": f"KittenTTS adapter error: {e}"}
