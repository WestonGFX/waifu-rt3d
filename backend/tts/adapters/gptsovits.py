"""
GPT-SoVITS TTS adapter for waifu-rt3d.

GPT-SoVITS is a high-quality voice-cloning TTS engine optimised for anime-style
voices and multilingual speech (Japanese, Chinese, English).  It runs locally on
a GPU (≥4 GB VRAM) and exposes a REST API on port 9880.

This adapter targets the GPT-SoVITS v2 API (``api_v2.py``) which supports
reference-audio-based voice cloning out of the box.

Setup:
    git clone https://github.com/RVC-Boss/GPT-SoVITS
    cd GPT-SoVITS && pip install -r requirements.txt
    python api_v2.py -a 0.0.0.0 -p 9880   # starts API server

Config example (app.json):
    "tts": {
        "provider": "gptsovits",
        "endpoint": "http://localhost:9880",
        "language": "en"
    }

Per-character (characters DB):
    voice_sample_path   -- absolute path to a reference WAV on the server machine
    voice_sample_prompt -- transcript text of the reference audio (required by GPT-SoVITS
                           for conditioning; leave empty to use the model's default voice)

Notes:
    - The reference audio should be 3–15 seconds of clean, single-speaker speech.
    - Without a reference audio, GPT-SoVITS uses its default voice.
    - The server must have the GPT-SoVITS model weights downloaded before the first call.
"""

import requests
from pathlib import Path
from .base import TTSAdapter


class GPTSoVITSAdapter(TTSAdapter):
    """TTS adapter for the GPT-SoVITS local API server (v2 compatible).

    Sends text to the ``/tts`` endpoint and saves the returned WAV audio to the
    audio directory.  Voice cloning is enabled when ``voice_sample_path`` is set
    in ``tts_cfg``.

    Args:
        audio_dir: Path to the directory where audio files are saved.
    """

    def speak(self, text: str, tts_cfg: dict) -> dict:
        """Generate speech using GPT-SoVITS.

        Args:
            text: Text to synthesize (should be pre-cleaned with ``_clean_for_tts``).
            tts_cfg: TTS configuration dict.  Relevant keys:
                - endpoint (str): Base URL, default ``"http://localhost:9880"``.
                - language (str): Language code — ``"en"``, ``"ja"``, ``"zh"``.
                - voice_sample_path (str): Server-side path to reference WAV.
                - voice_sample_prompt (str): Transcript of the reference audio.
                - speech_rate (float): Speed multiplier (default 1.0).

        Returns:
            dict: ``{"ok": True, "filename": str, "meta": dict}`` on success, or
                  ``{"ok": False, "error": str}`` on failure.

        Example:
            >>> adapter = GPTSoVITSAdapter(Path("/tmp/audio"))
            >>> result = adapter.speak("Hello!", {
            ...     "endpoint": "http://localhost:9880",
            ...     "language": "en",
            ...     "voice_sample_path": "/data/voice/reference.wav",
            ...     "voice_sample_prompt": "Hello, this is my voice sample."
            ... })
            >>> print(result["ok"])  # True
        """
        endpoint = (tts_cfg.get("endpoint") or "http://localhost:9880").rstrip("/")
        language = tts_cfg.get("language") or "en"
        ref_audio = tts_cfg.get("voice_sample_path") or ""
        ref_prompt = tts_cfg.get("voice_sample_prompt") or ""
        speed = float(tts_cfg.get("speech_rate") or 1.0)

        payload = {
            "text": text,
            "text_lang": language,
            "ref_audio_path": ref_audio,
            "prompt_text": ref_prompt,
            "prompt_lang": language,
            "speed_factor": speed,
            # Output format: wav (raw PCM, broadest compatibility)
            "media_type": "wav",
        }

        cache_key = f"gptsovits|{language}|{ref_audio}|{text}"
        name = self._mk_name(cache_key, "wav")
        out_path = self.audio_dir / name

        try:
            r = requests.post(
                f"{endpoint}/tts",
                json=payload,
                timeout=(10, 120),  # 10s connect, 120s read (GPU synthesis can be slow)
            )

            if r.status_code != 200:
                return {
                    "ok": False,
                    "error": f"GPT-SoVITS error {r.status_code}: {r.text[:300]}",
                }

            out_path.write_bytes(r.content)
            return {
                "ok": True,
                "filename": name,
                "meta": {
                    "provider": "gptsovits",
                    "language": language,
                    "ref_audio": ref_audio,
                    "endpoint": endpoint,
                },
            }

        except requests.exceptions.ConnectionError:
            return {
                "ok": False,
                "error": (
                    "Cannot connect to GPT-SoVITS server. "
                    "Start it with: python api_v2.py -a 0.0.0.0 -p 9880"
                ),
            }
        except Exception as e:
            return {"ok": False, "error": f"GPT-SoVITS adapter error: {e}"}
