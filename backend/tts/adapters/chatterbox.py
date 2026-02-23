"""
Chatterbox TTS adapter for waifu-rt3d.

Chatterbox Turbo is an MIT-licensed TTS with two key features:
  1. Zero-shot voice cloning from a 5-second reference WAV
  2. Emotional expressiveness via the `exaggeration` parameter

Setup (Chatterbox-TTS-Server):
    git clone https://github.com/devnen/Chatterbox-TTS-Server
    cd Chatterbox-TTS-Server
    pip install -r requirements.txt
    python server.py  # listens on port 8004 by default

Config example (app.json):
    "tts": {
        "provider": "chatterbox",
        "endpoint": "http://localhost:8004",
        "exaggeration": 0.8
    }

Per-character voice cloning:
    Set characters.voice_sample_path to a path to a short WAV file
    (5–30 seconds of clean speech from the desired speaker). Chatterbox
    will clone that voice when generating TTS for that character.

Exaggeration guide:
    0.3–0.5  Calm, neutral delivery
    0.7–0.9  Natural expressiveness (recommended default)
    1.2–1.5  Dramatic / theatrical
    1.8+     Highly exaggerated (may clip or sound unnatural)

Paralinguistic tags (inserted in text):
    [laugh]  [cough]  [sigh]  [gasp]  — adds natural vocalizations
"""
import base64
import requests
from pathlib import Path
from .base import TTSAdapter


class ChatterboxAdapter(TTSAdapter):
    """TTS adapter for Chatterbox TTS / Chatterbox Turbo server.

    Supports zero-shot voice cloning when voice_sample_path is provided.
    Emotion intensity is controlled via the exaggeration parameter.

    Args:
        audio_dir: Path to the directory where audio files are saved.
    """

    def speak(self, text: str, tts_cfg: dict) -> dict:
        """Generate speech using Chatterbox TTS server.

        Optionally clones a voice from a reference WAV file when
        voice_sample_path is set in tts_cfg.

        Args:
            text: Text to synthesize. May contain paralinguistic tags
                  like [laugh], [cough], [sigh].
            tts_cfg: TTS configuration dict. Relevant keys:
                - endpoint (str): Base URL, e.g. "http://localhost:8004".
                - voice_sample_path (str|None): Path to reference WAV for cloning.
                - exaggeration (float): Emotion intensity (0.3–2.0, default 0.8).

        Returns:
            dict: {
                "ok": bool,
                "filename": str,   -- audio filename within audio_dir (on success)
                "meta": dict,      -- provider/exaggeration metadata (on success)
                "error": str       -- error message (on failure)
            }

        Example:
            >>> adapter = ChatterboxAdapter(Path("/tmp/audio"))
            >>> result = adapter.speak(
            ...     "Hello! [laugh]",
            ...     {"endpoint": "http://localhost:8004", "exaggeration": 1.2,
            ...      "voice_sample_path": "/path/to/character_voice.wav"}
            ... )
            >>> print(result["ok"])  # True
        """
        endpoint = (tts_cfg.get("endpoint") or "http://localhost:8004").rstrip("/")
        exaggeration = float(tts_cfg.get("exaggeration", 0.8))
        voice_sample_path = tts_cfg.get("voice_sample_path")

        key = f"chatterbox|{exaggeration}|{voice_sample_path}|{text}"
        name = self._mk_name(key, "wav")
        out_path = self.audio_dir / name

        payload = {
            "text": text,
            "exaggeration": exaggeration,
        }

        # Attach voice reference for zero-shot cloning when available
        if voice_sample_path:
            sample_path = Path(voice_sample_path)
            if sample_path.exists():
                try:
                    audio_b64 = base64.b64encode(sample_path.read_bytes()).decode("utf-8")
                    payload["voice_file"] = audio_b64
                except Exception as e:
                    # Non-fatal: fall back to default voice
                    pass

        headers = {"Content-Type": "application/json"}
        url = f"{endpoint}/v1/audio/speech"

        try:
            r = requests.post(url, headers=headers, json=payload, timeout=(5, 120))

            if r.status_code != 200:
                return {
                    "ok": False,
                    "error": f"Chatterbox server error {r.status_code}: {r.text[:200]}"
                }

            out_path.write_bytes(r.content)
            return {
                "ok": True,
                "filename": name,
                "meta": {
                    "provider": "chatterbox",
                    "exaggeration": exaggeration,
                    "voice_cloned": bool(voice_sample_path),
                    "endpoint": endpoint
                }
            }

        except requests.exceptions.ConnectionError:
            return {
                "ok": False,
                "error": (
                    "Cannot connect to Chatterbox server. "
                    "Start it with: cd Chatterbox-TTS-Server && python server.py"
                )
            }
        except Exception as e:
            return {"ok": False, "error": f"Chatterbox adapter error: {e}"}
