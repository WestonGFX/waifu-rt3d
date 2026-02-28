"""
Kokoro-FastAPI TTS adapter for waifu-rt3d.

Kokoro-FastAPI exposes an OpenAI-compatible /v1/audio/speech endpoint.
It supports 20+ high-quality voices across English, Japanese, French,
Spanish, and other languages — all running locally via ONNX (CPU-only).

Setup:
    docker run -p 8880:8880 ghcr.io/remsky/kokoro-fastapi-cpu:v0.2.2

Config example (app.json):
    "tts": {
        "provider": "kokoro",
        "endpoint": "http://localhost:8880",
        "voice_id": "af_sky"
    }

Popular voices:
    American English female: af_sky, af_bella, af_sarah, af_nova
    American English male:   am_adam, am_michael
    British English:         bf_emma, bf_isabella, bm_george
    Japanese female:         jf_alpha, jf_nezumi
    Japanese male:           jm_kumo
    Spanish female:          ef_dora
    French female:           ff_siwis
"""
import requests
from pathlib import Path
from typing import Any
from .base import TTSAdapter


class KokoroAdapter(TTSAdapter):
    """TTS adapter for Kokoro-FastAPI local server.

    Sends text to the Kokoro-FastAPI /v1/audio/speech endpoint and saves
    the returned MP3 audio to the audio directory.

    Args:
        audio_dir: Path to the directory where audio files are saved.
    """

    def speak(self, text: str, tts_cfg: dict) -> dict:
        """Generate speech using Kokoro-FastAPI.

        Args:
            text: Text to synthesize.
            tts_cfg: TTS configuration dict. Relevant keys:
                - endpoint (str): Base URL of the Kokoro server, e.g. "http://localhost:8880".
                - voice_id (str): Kokoro voice name, e.g. "af_bella".

        Returns:
            dict: {
                "ok": bool,
                "filename": str,   -- audio filename within audio_dir (on success)
                "meta": dict,      -- provider/voice metadata (on success)
                "error": str       -- error message (on failure)
            }

        Example:
            >>> adapter = KokoroAdapter(Path("/tmp/audio"))
            >>> result = adapter.speak("Hello!", {"endpoint": "http://localhost:8880", "voice_id": "af_sky"})
            >>> print(result["ok"])  # True
        """
        endpoint = (tts_cfg.get("endpoint") or "http://localhost:8880").rstrip("/")
        voice = tts_cfg.get("voice_id") or "af_sky"

        # Resolve speed from tts_cfg — supports numeric speed, speech_rate, or
        # Edge-TTS-style tts_rate strings like "+10%"
        speed = float(tts_cfg.get("speed", tts_cfg.get("speech_rate", 1.0)))
        tts_rate = tts_cfg.get("tts_rate")
        if tts_rate and speed == 1.0:
            import re as _re
            m = _re.match(r'([+-]?\d+)%', str(tts_rate))
            if m:
                speed = 1.0 + int(m.group(1)) / 100.0
        speed = round(max(0.5, min(2.0, speed)), 2)

        url = f"{endpoint}/v1/audio/speech"
        headers = {"Content-Type": "application/json"}
        payload: dict[str, Any] = {
            "model": "kokoro",
            "input": text,
            "voice": voice,
            "response_format": "mp3",
            "speed": speed,
        }

        key = f"kokoro|{voice}|{text}"
        name = self._mk_name(key, "mp3")
        out_path = self.audio_dir / name

        try:
            r = requests.post(url, headers=headers, json=payload, timeout=(5, 60))

            if r.status_code != 200:
                return {
                    "ok": False,
                    "error": f"Kokoro server error {r.status_code}: {r.text[:200]}"
                }

            out_path.write_bytes(r.content)
            return {
                "ok": True,
                "filename": name,
                "meta": {"provider": "kokoro", "voice_id": voice, "endpoint": endpoint}
            }

        except requests.exceptions.ConnectionError:
            return {
                "ok": False,
                "error": (
                    "Cannot connect to Kokoro server. "
                    "Start it with: docker run -p 8880:8880 ghcr.io/remsky/kokoro-fastapi-cpu:v0.2.2"
                )
            }
        except Exception as e:
            return {"ok": False, "error": f"Kokoro adapter error: {e}"}
