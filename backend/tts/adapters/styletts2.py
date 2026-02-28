"""
StyleTTS 2 adapter for waifu-rt3d.

StyleTTS 2 is a style-diffusion TTS model (~300M params) that achieves
near-human naturalness through a style diffusion module.  It produces
exceptionally natural-sounding speech with prosodic variation.

Requires GPU with 2 GB+ VRAM.

Setup:
    pip install styletts2
    styletts2-server --port 8896

  -- or via Docker --
    docker run --gpus all -p 8896:8896 yl4579/styletts2:latest

Config example (app.json):
    "tts": {
        "provider": "styletts2",
        "endpoint": "http://localhost:8896",
        "voice_id": "styletts2_default"
    }

Available voices:
    styletts2_default  — Natural, expressive female (built-in)
"""
import requests
from pathlib import Path
from .base import TTSAdapter


class StyleTTS2Adapter(TTSAdapter):
    """TTS adapter for StyleTTS 2 server.

    Style-diffusion TTS producing near-human naturalness.
    Requires GPU (2 GB+ VRAM).

    Args:
        audio_dir: Path to the directory where audio files are saved.
    """

    def speak(self, text: str, tts_cfg: dict) -> dict:
        """Generate speech using StyleTTS 2 server.

        Args:
            text: Text to synthesize.
            tts_cfg: TTS configuration dict. Relevant keys:
                - endpoint (str): Base URL, e.g. "http://localhost:8896".
                - voice_id (str): Voice name, e.g. "styletts2_default".
                - diffusion_steps (int): Style diffusion steps (default 10).
                - embedding_scale (float): Prosody variation (default 1.0).

        Returns:
            dict: {
                "ok": bool,
                "filename": str,   -- audio filename within audio_dir (on success)
                "meta": dict,      -- provider/voice metadata (on success)
                "error": str       -- error message (on failure)
            }

        Example:
            >>> adapter = StyleTTS2Adapter(Path("/tmp/audio"))
            >>> result = adapter.speak("Hello!", {"endpoint": "http://localhost:8896"})
            >>> print(result["ok"])  # True
        """
        endpoint = (tts_cfg.get("endpoint") or "http://localhost:8896").rstrip("/")
        voice = tts_cfg.get("voice_id") or "styletts2_default"
        diffusion_steps = int(tts_cfg.get("diffusion_steps", 10))
        embedding_scale = float(tts_cfg.get("embedding_scale", 1.0))

        key = f"styletts2|{voice}|{diffusion_steps}|{embedding_scale}|{text}"
        name = self._mk_name(key, "wav")
        out_path = self.audio_dir / name

        payload = {
            "text": text,
            "voice": voice,
            "diffusion_steps": diffusion_steps,
            "embedding_scale": embedding_scale,
        }

        try:
            r = requests.post(
                f"{endpoint}/v1/audio/speech",
                headers={"Content-Type": "application/json"},
                json=payload,
                timeout=(5, 90),
            )

            if r.status_code != 200:
                return {
                    "ok": False,
                    "error": f"StyleTTS 2 server error {r.status_code}: {r.text[:200]}",
                }

            out_path.write_bytes(r.content)
            return {
                "ok": True,
                "filename": name,
                "meta": {
                    "provider": "styletts2",
                    "voice_id": voice,
                    "diffusion_steps": diffusion_steps,
                    "endpoint": endpoint,
                },
            }

        except requests.exceptions.ConnectionError:
            return {
                "ok": False,
                "error": (
                    "Cannot connect to StyleTTS 2 server. "
                    "Start it with: styletts2-server --port 8896"
                ),
            }
        except Exception as e:
            return {"ok": False, "error": f"StyleTTS 2 adapter error: {e}"}
