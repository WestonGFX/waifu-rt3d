"""
Bark TTS adapter for waifu-rt3d.

Bark (by Suno AI) is a transformer-based TTS model (~1B params) that
generates highly expressive speech with nonverbal sounds — laughter,
sighing, hesitation, etc.  It offers 100+ speaker presets and supports
music/singing generation.

GPU recommended (2–12 GB VRAM depending on model variant).
CPU inference works but is 10–20x slower.

Setup:
    pip install bark
    bark-server --port 8893

  -- or via Docker --
    docker run --gpus all -p 8893:8893 suno/bark:latest

Config example (app.json):
    "tts": {
        "provider": "bark",
        "endpoint": "http://localhost:8893",
        "voice_id": "v2/en_speaker_6"
    }

Popular female presets:
    v2/en_speaker_0  — Neutral female
    v2/en_speaker_2  — Warm female
    v2/en_speaker_4  — Expressive female
    v2/en_speaker_6  — Soft female

Nonverbal tags (inserted in text):
    [laughter]  [sighs]  [music]  [gasps]  — adds natural sounds
"""
import requests
from pathlib import Path
from .base import TTSAdapter


class BarkAdapter(TTSAdapter):
    """TTS adapter for Bark inference server.

    Highly expressive TTS with nonverbal sounds and 100+ speaker presets.
    GPU recommended for real-time performance.

    Args:
        audio_dir: Path to the directory where audio files are saved.
    """

    def speak(self, text: str, tts_cfg: dict) -> dict:
        """Generate speech using Bark server.

        Args:
            text: Text to synthesize. May contain nonverbal tags like
                  [laughter], [sighs], [gasps], [music].
            tts_cfg: TTS configuration dict. Relevant keys:
                - endpoint (str): Base URL, e.g. "http://localhost:8893".
                - voice_id (str): Speaker preset, e.g. "v2/en_speaker_6".
                - temperature (float): Generation temperature (default 0.7).

        Returns:
            dict: {
                "ok": bool,
                "filename": str,   -- audio filename within audio_dir (on success)
                "meta": dict,      -- provider/voice metadata (on success)
                "error": str       -- error message (on failure)
            }

        Example:
            >>> adapter = BarkAdapter(Path("/tmp/audio"))
            >>> result = adapter.speak(
            ...     "Hello! [laughter]",
            ...     {"endpoint": "http://localhost:8893", "voice_id": "v2/en_speaker_6"}
            ... )
            >>> print(result["ok"])  # True
        """
        endpoint = (tts_cfg.get("endpoint") or "http://localhost:8893").rstrip("/")
        voice = tts_cfg.get("voice_id") or "v2/en_speaker_6"
        temperature = float(tts_cfg.get("temperature", 0.7))

        key = f"bark|{voice}|{temperature}|{text}"
        name = self._mk_name(key, "wav")
        out_path = self.audio_dir / name

        payload = {
            "text": text,
            "speaker": voice,
            "temperature": temperature,
            "output_format": "wav",
        }

        try:
            # Bark generation can be slow on CPU — generous timeout
            r = requests.post(
                f"{endpoint}/v1/audio/speech",
                headers={"Content-Type": "application/json"},
                json=payload,
                timeout=(5, 180),
            )

            if r.status_code != 200:
                return {
                    "ok": False,
                    "error": f"Bark server error {r.status_code}: {r.text[:200]}",
                }

            out_path.write_bytes(r.content)
            return {
                "ok": True,
                "filename": name,
                "meta": {
                    "provider": "bark",
                    "voice_id": voice,
                    "temperature": temperature,
                    "endpoint": endpoint,
                },
            }

        except requests.exceptions.ConnectionError:
            return {
                "ok": False,
                "error": (
                    "Cannot connect to Bark server. "
                    "Start it with: bark-server --port 8893"
                ),
            }
        except Exception as e:
            return {"ok": False, "error": f"Bark adapter error: {e}"}
