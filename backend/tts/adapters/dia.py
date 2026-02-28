"""
Dia TTS adapter for waifu-rt3d.

Dia (by Nari Labs) is a 1.6B-parameter dialogue-focused TTS model.
It excels at conversational speech with natural turn-taking, emotion,
and nonverbal sounds.  Supports zero-shot voice cloning.

Requires GPU with 10 GB+ VRAM.

Setup:
    pip install dia-tts
    dia-server --port 8898

  -- or via Docker --
    docker run --gpus all -p 8898:8898 narilabs/dia:latest

Config example (app.json):
    "tts": {
        "provider": "dia",
        "endpoint": "http://localhost:8898",
        "voice_id": "dia_default"
    }

Dialogue tags (inserted in text):
    [S1]  [S2]  — speaker markers for multi-speaker dialogue
    (laughs)  (sighs)  — paralinguistic expressions

Voice cloning:
    Set characters.voice_sample_path to a short WAV of the target speaker.
    Dia performs zero-shot cloning without fine-tuning.
"""
import base64
import requests
from pathlib import Path
from .base import TTSAdapter


class DiaAdapter(TTSAdapter):
    """TTS adapter for Dia inference server.

    Dialogue-focused TTS with natural conversation flow and zero-shot
    voice cloning.  Requires GPU (10 GB+ VRAM).

    Args:
        audio_dir: Path to the directory where audio files are saved.
    """

    def speak(self, text: str, tts_cfg: dict) -> dict:
        """Generate speech using Dia server.

        Args:
            text: Text to synthesize. May contain dialogue tags like
                  [S1], [S2] and paralinguistic markers like (laughs).
            tts_cfg: TTS configuration dict. Relevant keys:
                - endpoint (str): Base URL, e.g. "http://localhost:8898".
                - voice_id (str): Voice preset, e.g. "dia_default".
                - voice_sample_path (str|None): Path to reference WAV for cloning.
                - temperature (float): Generation temperature (default 0.7).

        Returns:
            dict: {
                "ok": bool,
                "filename": str,   -- audio filename within audio_dir (on success)
                "meta": dict,      -- provider/voice metadata (on success)
                "error": str       -- error message (on failure)
            }

        Example:
            >>> adapter = DiaAdapter(Path("/tmp/audio"))
            >>> result = adapter.speak(
            ...     "[S1] Hello! (laughs)",
            ...     {"endpoint": "http://localhost:8898"}
            ... )
            >>> print(result["ok"])  # True
        """
        endpoint = (tts_cfg.get("endpoint") or "http://localhost:8898").rstrip("/")
        voice = tts_cfg.get("voice_id") or "dia_default"
        voice_sample_path = tts_cfg.get("voice_sample_path")
        temperature = float(tts_cfg.get("temperature", 0.7))

        key = f"dia|{voice}|{voice_sample_path}|{temperature}|{text}"
        name = self._mk_name(key, "wav")
        out_path = self.audio_dir / name

        payload = {
            "text": text,
            "voice": voice,
            "temperature": temperature,
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
                timeout=(5, 180),
            )

            if r.status_code != 200:
                return {
                    "ok": False,
                    "error": f"Dia server error {r.status_code}: {r.text[:200]}",
                }

            out_path.write_bytes(r.content)
            return {
                "ok": True,
                "filename": name,
                "meta": {
                    "provider": "dia",
                    "voice_id": voice,
                    "voice_cloned": bool(voice_sample_path),
                    "temperature": temperature,
                    "endpoint": endpoint,
                },
            }

        except requests.exceptions.ConnectionError:
            return {
                "ok": False,
                "error": (
                    "Cannot connect to Dia server. "
                    "Start it with: dia-server --port 8898"
                ),
            }
        except Exception as e:
            return {"ok": False, "error": f"Dia adapter error: {e}"}
