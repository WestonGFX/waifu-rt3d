"""
CosyVoice 3 adapter for waifu-rt3d.

CosyVoice 3 (by FunAudioLLM / Alibaba) is a 0.5B-parameter TTS model
with zero-shot voice cloning, multilingual support, and streaming output.
It produces excellent quality speech with natural prosody.

Requires GPU with 8 GB+ VRAM.

Setup:
    pip install cosyvoice
    cosyvoice-server --port 8899

  -- or via Docker --
    docker run --gpus all -p 8899:8899 funaudiollm/cosyvoice:latest

Config example (app.json):
    "tts": {
        "provider": "cosyvoice",
        "endpoint": "http://localhost:8899",
        "voice_id": "cosyvoice_en_f1"
    }

Available voices:
    cosyvoice_en_f1  — Natural, warm English female
    cosyvoice_en_f2  — Clear, professional English female

Voice cloning:
    Set characters.voice_sample_path to a short WAV of the target speaker.
    CosyVoice performs zero-shot cross-lingual cloning.
"""
import base64
import requests
from pathlib import Path
from .base import TTSAdapter


class CosyVoiceAdapter(TTSAdapter):
    """TTS adapter for CosyVoice 3 server.

    High-quality TTS with zero-shot cross-lingual voice cloning.
    Requires GPU (8 GB+ VRAM).

    Args:
        audio_dir: Path to the directory where audio files are saved.
    """

    def speak(self, text: str, tts_cfg: dict) -> dict:
        """Generate speech using CosyVoice server.

        Args:
            text: Text to synthesize.
            tts_cfg: TTS configuration dict. Relevant keys:
                - endpoint (str): Base URL, e.g. "http://localhost:8899".
                - voice_id (str): Voice name, e.g. "cosyvoice_en_f1".
                - voice_sample_path (str|None): Path to reference WAV for cloning.
                - speech_rate (float): Speed multiplier (default 1.0).

        Returns:
            dict: {
                "ok": bool,
                "filename": str,   -- audio filename within audio_dir (on success)
                "meta": dict,      -- provider/voice metadata (on success)
                "error": str       -- error message (on failure)
            }

        Example:
            >>> adapter = CosyVoiceAdapter(Path("/tmp/audio"))
            >>> result = adapter.speak("Hello!", {"endpoint": "http://localhost:8899"})
            >>> print(result["ok"])  # True
        """
        endpoint = (tts_cfg.get("endpoint") or "http://localhost:8899").rstrip("/")
        voice = tts_cfg.get("voice_id") or "cosyvoice_en_f1"
        voice_sample_path = tts_cfg.get("voice_sample_path")
        speed = float(tts_cfg.get("speech_rate", 1.0))

        key = f"cosyvoice|{voice}|{voice_sample_path}|{speed}|{text}"
        name = self._mk_name(key, "wav")
        out_path = self.audio_dir / name

        payload = {
            "text": text,
            "speaker": voice,
            "speed": speed,
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
                    "error": f"CosyVoice server error {r.status_code}: {r.text[:200]}",
                }

            out_path.write_bytes(r.content)
            return {
                "ok": True,
                "filename": name,
                "meta": {
                    "provider": "cosyvoice",
                    "voice_id": voice,
                    "voice_cloned": bool(voice_sample_path),
                    "speed": speed,
                    "endpoint": endpoint,
                },
            }

        except requests.exceptions.ConnectionError:
            return {
                "ok": False,
                "error": (
                    "Cannot connect to CosyVoice server. "
                    "Start it with: cosyvoice-server --port 8899"
                ),
            }
        except Exception as e:
            return {"ok": False, "error": f"CosyVoice adapter error: {e}"}
