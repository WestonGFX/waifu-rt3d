import requests, base64
from .base import TTSAdapter
class FishAudioAdapter(TTSAdapter):
    def speak(self, text: str, tts_cfg: dict) -> dict:
        base = (tts_cfg.get('endpoint') or 'https://api.fish.audio/v1').rstrip('/')
        url = f"{base}/tts"
        fmt = (tts_cfg.get('format') or 'mp3').lower()
        sr = int(tts_cfg.get('sample_rate') or 24000)
        voice_id = tts_cfg.get('voice_id')
        headers = {'Content-Type': 'application/json'}
        if tts_cfg.get('api_key'): headers['Authorization'] = f"Bearer {tts_cfg['api_key']}"
        payload = {'text': text, 'reference_id': voice_id, 'format': fmt, 'sample_rate': sr}
        try: r = requests.post(url, headers=headers, json=payload, timeout=120)
        except Exception as e: return {'ok': False, 'error': f'FishAudio request failed: {e}'}
        if r.status_code != 200: return {'ok': False, 'error': f'FishAudio status {r.status_code}: {r.text[:200]}'}
        if r.headers.get('Content-Type','').startswith('audio/'): data = r.content
        else:
            try:
                j = r.json(); b64 = j.get('audio') or j.get('data'); data = base64.b64decode(b64)
            except Exception: data = r.content
        ext = 'mp3' if 'mp3' in fmt else ('wav' if 'wav' in fmt else 'opus')
        name = self._mk_name(f"fish|{voice_id}|{sr}|{text}", ext)
        (self.audio_dir / name).write_bytes(data)
        return {'ok': True, 'filename': name, 'meta': {'provider':'fish_audio','voice_id':voice_id,'format':ext,'sr':sr}}
