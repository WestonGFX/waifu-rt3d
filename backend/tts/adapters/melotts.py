"""
MeloTTS adapter for waifu-rt3d.

MeloTTS is a CPU-optimised TTS engine (~100M params, ~200 MB) from
MyShell AI.  It delivers real-time synthesis without a GPU and offers
four English accent variants: US, UK, Australian, and Indian.

Setup:
    pip install melotts
    melo-server --port 8892

  -- or via Docker --
    docker run -p 8892:8892 myshell-ai/melotts:latest

Config example (app.json):
    "tts": {
        "provider": "melotts",
        "endpoint": "http://localhost:8892",
        "voice_id": "en_US_female"
    }

Available voices:
    en_US_female  — American English female
    en_GB_female  — British English female
    en_AU_female  — Australian English female
    en_IN_female  — Indian English female
"""
import requests
from pathlib import Path
from .base import TTSAdapter


class MeloTTSAdapter(TTSAdapter):
    """TTS adapter for MeloTTS server.

    CPU-optimised engine with four English accent variants.
    Produces WAV audio at real-time speed on modern CPUs.

    Args:
        audio_dir: Path to the directory where audio files are saved.
    """

    def speak(self, text: str, tts_cfg: dict) -> dict:
        """Generate speech using MeloTTS server.

        Args:
            text: Text to synthesize.
            tts_cfg: TTS configuration dict. Relevant keys:
                - endpoint (str): Base URL, e.g. "http://localhost:8892".
                - voice_id (str): Voice name, e.g. "en_US_female".
                - speech_rate (float): Speed multiplier (default 1.0).

        Returns:
            dict: {
                "ok": bool,
                "filename": str,   -- audio filename within audio_dir (on success)
                "meta": dict,      -- provider/voice metadata (on success)
                "error": str       -- error message (on failure)
            }

        Example:
            >>> adapter = MeloTTSAdapter(Path("/tmp/audio"))
            >>> result = adapter.speak("Hello!", {"endpoint": "http://localhost:8892", "voice_id": "en_US_female"})
            >>> print(result["ok"])  # True
        """
        endpoint = (tts_cfg.get("endpoint") or "http://localhost:8892").rstrip("/")
        voice = tts_cfg.get("voice_id") or "en_US_female"
        speed = float(tts_cfg.get("speech_rate", 1.0))

        key = f"melotts|{voice}|{speed}|{text}"
        name = self._mk_name(key, "wav")
        out_path = self.audio_dir / name

        payload = {
            "text": text,
            "speaker": voice,
            "speed": speed,
            "format": "wav",
        }

        try:
            r = requests.post(
                f"{endpoint}/v1/audio/speech",
                headers={"Content-Type": "application/json"},
                json=payload,
                timeout=(5, 60),
            )

            if r.status_code != 200:
                return {
                    "ok": False,
                    "error": f"MeloTTS server error {r.status_code}: {r.text[:200]}",
                }

            out_path.write_bytes(r.content)
            return {
                "ok": True,
                "filename": name,
                "meta": {
                    "provider": "melotts",
                    "voice_id": voice,
                    "speed": speed,
                    "endpoint": endpoint,
                },
            }

        except requests.exceptions.ConnectionError:
            return {
                "ok": False,
                "error": (
                    "Cannot connect to MeloTTS server. "
                    "Start it with: melo-server --port 8892"
                ),
            }
        except Exception as e:
            return {"ok": False, "error": f"MeloTTS adapter error: {e}"}
