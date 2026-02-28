"""
MetaVoice-1B adapter for waifu-rt3d.

MetaVoice-1B is a 1.2B-parameter TTS model with zero-shot voice cloning.
It produces high-quality, natural-sounding speech and supports multiple
built-in English voices plus cloneable custom voices.

Requires GPU with 6 GB+ VRAM.

Setup:
    pip install metavoice
    metavoice-server --port 8895

  -- or via Docker --
    docker run --gpus all -p 8895:8895 metavoiceio/metavoice:latest

Config example (app.json):
    "tts": {
        "provider": "metavoice",
        "endpoint": "http://localhost:8895",
        "voice_id": "metavoice_en_f1"
    }

Available voices:
    metavoice_en_f1  — Warm, natural female
    metavoice_en_f2  — Clear, professional female

Voice cloning:
    Set characters.voice_sample_path to a short WAV of the target speaker.
    MetaVoice performs zero-shot cloning without fine-tuning.
"""
import base64
import requests
from pathlib import Path
from .base import TTSAdapter


class MetaVoiceAdapter(TTSAdapter):
    """TTS adapter for MetaVoice-1B server.

    Large-scale TTS with zero-shot voice cloning and natural prosody.
    Requires GPU (6 GB+ VRAM).

    Args:
        audio_dir: Path to the directory where audio files are saved.
    """

    def speak(self, text: str, tts_cfg: dict) -> dict:
        """Generate speech using MetaVoice server.

        Args:
            text: Text to synthesize.
            tts_cfg: TTS configuration dict. Relevant keys:
                - endpoint (str): Base URL, e.g. "http://localhost:8895".
                - voice_id (str): Voice preset, e.g. "metavoice_en_f1".
                - voice_sample_path (str|None): Path to reference WAV for cloning.

        Returns:
            dict: {
                "ok": bool,
                "filename": str,   -- audio filename within audio_dir (on success)
                "meta": dict,      -- provider/voice metadata (on success)
                "error": str       -- error message (on failure)
            }

        Example:
            >>> adapter = MetaVoiceAdapter(Path("/tmp/audio"))
            >>> result = adapter.speak("Hello!", {"endpoint": "http://localhost:8895"})
            >>> print(result["ok"])  # True
        """
        endpoint = (tts_cfg.get("endpoint") or "http://localhost:8895").rstrip("/")
        voice = tts_cfg.get("voice_id") or "metavoice_en_f1"
        voice_sample_path = tts_cfg.get("voice_sample_path")

        key = f"metavoice|{voice}|{voice_sample_path}|{text}"
        name = self._mk_name(key, "wav")
        out_path = self.audio_dir / name

        payload = {
            "text": text,
            "speaker": voice,
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
                    "error": f"MetaVoice server error {r.status_code}: {r.text[:200]}",
                }

            out_path.write_bytes(r.content)
            return {
                "ok": True,
                "filename": name,
                "meta": {
                    "provider": "metavoice",
                    "voice_id": voice,
                    "voice_cloned": bool(voice_sample_path),
                    "endpoint": endpoint,
                },
            }

        except requests.exceptions.ConnectionError:
            return {
                "ok": False,
                "error": (
                    "Cannot connect to MetaVoice server. "
                    "Start it with: metavoice-server --port 8895"
                ),
            }
        except Exception as e:
            return {"ok": False, "error": f"MetaVoice adapter error: {e}"}
