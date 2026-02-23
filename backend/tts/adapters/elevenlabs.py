import requests
from .base import TTSAdapter


class ElevenLabsAdapter(TTSAdapter):
    """TTS adapter for the ElevenLabs cloud API.

    Reads ``voice_stability`` (0–1) from ``tts_cfg`` and passes it through
    to the ElevenLabs ``voice_settings.stability`` parameter so that the
    global Settings slider is honoured at generation time.

    Example:
        >>> adapter = ElevenLabsAdapter(audio_dir)
        >>> result = adapter.speak("Hello!", {"voice_id": "abc123", "api_key": "sk-..."})
        >>> result["ok"]
        True
    """

    def speak(self, text: str, tts_cfg: dict) -> dict:
        """Generate speech via the ElevenLabs text-to-speech API.

        Args:
            text: The text to synthesise.
            tts_cfg: Configuration dict with keys:
                - ``endpoint`` (str, optional): Base URL (default: api.elevenlabs.io).
                - ``voice_id`` (str, required): ElevenLabs voice UUID.
                - ``api_key`` (str, required): xi-api-key header value.
                - ``model`` (str, optional): Model ID (default: eleven_multilingual_v2).
                - ``voice_stability`` (float, optional): Stability 0–1 (default: 0.5).
                - ``similarity_boost`` (float, optional): Similarity 0–1 (default: 0.8).

        Returns:
            dict: ``{"ok": True, "filename": str, "meta": dict}`` on success, or
                  ``{"ok": False, "error": str}`` on failure.
        """
        base = (tts_cfg.get('endpoint') or 'https://api.elevenlabs.io').rstrip('/')
        voice_id = tts_cfg.get('voice_id')
        if not voice_id:
            return {'ok': False, 'error': 'voice_id required for ElevenLabs'}

        url = f"{base}/v1/text-to-speech/{voice_id}"
        headers = {
            'Accept': 'audio/mpeg',
            'Content-Type': 'application/json',
            'xi-api-key': tts_cfg.get('api_key', ''),
        }

        # Honour voice_stability from global Settings slider (0–1 range)
        stability = float(tts_cfg.get('voice_stability', 0.5))
        similarity_boost = float(tts_cfg.get('similarity_boost', 0.8))

        payload = {
            'text': text,
            'model_id': tts_cfg.get('model', 'eleven_multilingual_v2'),
            'voice_settings': {
                'stability': stability,
                'similarity_boost': similarity_boost,
            },
        }

        try:
            r = requests.post(url, headers=headers, json=payload, timeout=120)
        except Exception as e:
            return {'ok': False, 'error': f'ElevenLabs request failed: {e}'}

        if r.status_code != 200:
            return {'ok': False, 'error': f'ElevenLabs status {r.status_code}: {r.text[:200]}'}

        name = self._mk_name(f"eleven|{voice_id}|{text}", 'mp3')
        (self.audio_dir / name).write_bytes(r.content)
        return {
            'ok': True,
            'filename': name,
            'meta': {'provider': 'elevenlabs', 'voice_id': voice_id, 'format': 'mp3'},
        }
