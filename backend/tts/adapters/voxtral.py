"""
Voxtral TTS adapter for waifu-rt3d.

Voxtral is Mistral AI's streaming TTS model — high-quality, low-latency
speech synthesis via the Mistral API. No local install required; uses
the cloud API with an API key.

Setup:
    Set MISTRAL_API_KEY environment variable, or configure via app.json:
        "tts": {
            "provider": "voxtral",
            "api_key": "your-mistral-api-key"
        }

API reference: https://docs.mistral.ai/api/#tag/audio/operation/speech_v1_audio_speech_post

Voice options (as of May 2026):
    "alloy", "echo", "fable", "nova", "onyx", "shimmer" (OpenAI-compatible)
"""
import os
import requests
from .base import TTSAdapter


class VoxtralAdapter(TTSAdapter):
    """TTS adapter for Mistral Voxtral cloud TTS.

    Uses the OpenAI-compatible audio/speech endpoint from Mistral.
    Requires a valid MISTRAL_API_KEY in env or tts_cfg["api_key"].

    Args:
        audio_dir: Directory where output audio files are saved.
    """

    BASE_URL = "https://api.mistral.ai/v1/audio/speech"

    def speak(self, text: str, tts_cfg: dict) -> dict:
        """Generate speech via Mistral Voxtral TTS API.

        Args:
            text: Text to synthesize.
            tts_cfg: TTS configuration dict. Relevant keys:
                - api_key (str|None): Mistral API key. Falls back to MISTRAL_API_KEY env var.
                - voice_id (str): Voice name (default "nova").
                - model (str): TTS model ID (default "voxtral-mini-v0.1").
                - format (str): Output format — "mp3" or "wav" (default "mp3").
                - speech_rate (float): Speed multiplier 0.5–2.0 (default 1.0).

        Returns:
            dict: {"ok": bool, "filename": str, "meta": dict} on success,
                  {"ok": False, "error": str} on failure.

        Example:
            >>> adapter = VoxtralAdapter(Path("/tmp/audio"))
            >>> result = adapter.speak("Hello!", {"api_key": "sk-...", "voice_id": "nova"})
            >>> print(result["ok"])  # True
        """
        api_key = tts_cfg.get("api_key") or os.getenv("MISTRAL_API_KEY", "")
        if not api_key:
            return {"ok": False, "error": "Voxtral requires MISTRAL_API_KEY or tts.api_key"}

        voice = tts_cfg.get("voice_id") or "nova"
        model = tts_cfg.get("model") or "voxtral-mini-v0.1"
        fmt = (tts_cfg.get("format") or "mp3").lower()
        speed = float(tts_cfg.get("speech_rate", 1.0))

        cache_key = f"voxtral|{voice}|{speed}|{text}"
        name = self._mk_name(cache_key, fmt)
        out_path = self.audio_dir / name

        if out_path.exists():
            return {"ok": True, "filename": name, "meta": {"provider": "voxtral", "cached": True}}

        payload = {
            "model": model,
            "input": text,
            "voice": voice,
            "response_format": fmt,
            "speed": speed,
        }
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }

        try:
            r = requests.post(self.BASE_URL, headers=headers, json=payload, timeout=(5, 120))
            if r.status_code == 401:
                return {"ok": False, "error": "Voxtral: invalid API key (check MISTRAL_API_KEY)"}
            if r.status_code != 200:
                return {"ok": False, "error": f"Voxtral error {r.status_code}: {r.text[:200]}"}
            out_path.write_bytes(r.content)
            return {
                "ok": True,
                "filename": name,
                "meta": {"provider": "voxtral", "voice": voice, "model": model},
            }
        except requests.exceptions.ConnectionError:
            return {"ok": False, "error": "Cannot reach Mistral API — check internet connection"}
        except Exception as e:
            return {"ok": False, "error": f"Voxtral adapter error: {e}"}
