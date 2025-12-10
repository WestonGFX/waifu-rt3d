import requests
from .base import TTSAdapter
class ElevenLabsAdapter(TTSAdapter):
    def speak(self, text: str, tts_cfg: dict) -> dict:
        base = (tts_cfg.get('endpoint') or 'https://api.elevenlabs.io').rstrip('/')
        voice_id = tts_cfg.get('voice_id')
        if not voice_id: return {'ok': False, 'error': 'voice_id required for ElevenLabs'}
        url = f"{base}/v1/text-to-speech/{voice_id}"
        headers = {'Accept':'audio/mpeg','Content-Type':'application/json','xi-api-key': tts_cfg.get('api_key','')}
        payload = {'text': text, 'model_id': tts_cfg.get('model','eleven_multilingual_v2'), 'voice_settings': {'stability':0.5,'similarity_boost':0.8}}
        try: r = requests.post(url, headers=headers, json=payload, timeout=120)
        except Exception as e: return {'ok': False, 'error': f'ElevenLabs request failed: {e}'}
        if r.status_code != 200: return {'ok': False, 'error': f'ElevenLabs status {r.status_code}: {r.text[:200]}'}
        name = self._mk_name(f"eleven|{voice_id}|{text}", 'mp3')
        (self.audio_dir / name).write_bytes(r.content)
        return {'ok': True, 'filename': name, 'meta': {'provider':'elevenlabs','voice_id':voice_id,'format':'mp3'}}
