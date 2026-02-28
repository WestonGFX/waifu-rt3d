"""
F5-TTS adapter for waifu-rt3d.

F5-TTS is a diffusion-based TTS model (~330M params) that produces
studio-quality speech.  Its key feature is zero-shot voice cloning
from just 15 seconds of reference audio.

Requires GPU with 4 GB+ VRAM.

Setup:
    pip install f5-tts
    f5-tts-server --port 8894

  -- or via Docker --
    docker run --gpus all -p 8894:8894 swivid/f5-tts:latest

Config example (app.json):
    "tts": {
        "provider": "f5tts",
        "endpoint": "http://localhost:8894",
        "voice_id": "f5_default"
    }

Voice cloning:
    Set characters.voice_sample_path to a 15-second WAV of the target
    speaker.  F5-TTS will clone that voice for all synthesis.
"""
import base64
import requests
from pathlib import Path
from .base import TTSAdapter


class F5TTSAdapter(TTSAdapter):
    """TTS adapter for F5-TTS server.

    Diffusion-based TTS with studio-quality output and zero-shot
    voice cloning from 15 seconds of reference audio.

    Args:
        audio_dir: Path to the directory where audio files are saved.
    """

    def speak(self, text: str, tts_cfg: dict) -> dict:
        """Generate speech using F5-TTS server.

        Optionally clones a voice from a 15-second reference WAV when
        voice_sample_path is set in tts_cfg.

        Args:
            text: Text to synthesize.
            tts_cfg: TTS configuration dict. Relevant keys:
                - endpoint (str): Base URL, e.g. "http://localhost:8894".
                - voice_id (str): Voice preset, e.g. "f5_default".
                - voice_sample_path (str|None): Path to reference WAV for cloning.

        Returns:
            dict: {
                "ok": bool,
                "filename": str,   -- audio filename within audio_dir (on success)
                "meta": dict,      -- provider/voice metadata (on success)
                "error": str       -- error message (on failure)
            }

        Example:
            >>> adapter = F5TTSAdapter(Path("/tmp/audio"))
            >>> result = adapter.speak("Hello!", {"endpoint": "http://localhost:8894"})
            >>> print(result["ok"])  # True
        """
        endpoint = (tts_cfg.get("endpoint") or "http://localhost:8894").rstrip("/")
        voice = tts_cfg.get("voice_id") or "f5_default"
        voice_sample_path = tts_cfg.get("voice_sample_path")

        key = f"f5tts|{voice}|{voice_sample_path}|{text}"
        name = self._mk_name(key, "wav")
        out_path = self.audio_dir / name

        payload = {
            "text": text,
            "voice": voice,
        }

        # Attach voice reference for zero-shot cloning
        if voice_sample_path:
            sample_path = Path(voice_sample_path)
            if sample_path.exists():
                try:
                    audio_b64 = base64.b64encode(sample_path.read_bytes()).decode("utf-8")
                    payload["reference_audio"] = audio_b64
                except Exception:
                    pass  # Non-fatal: fall back to default voice

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
                    "error": f"F5-TTS server error {r.status_code}: {r.text[:200]}",
                }

            out_path.write_bytes(r.content)
            return {
                "ok": True,
                "filename": name,
                "meta": {
                    "provider": "f5tts",
                    "voice_id": voice,
                    "voice_cloned": bool(voice_sample_path),
                    "endpoint": endpoint,
                },
            }

        except requests.exceptions.ConnectionError:
            return {
                "ok": False,
                "error": (
                    "Cannot connect to F5-TTS server. "
                    "Start it with: f5-tts-server --port 8894"
                ),
            }
        except Exception as e:
            return {"ok": False, "error": f"F5-TTS adapter error: {e}"}
