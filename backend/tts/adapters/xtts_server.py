import requests, base64
from .base import TTSAdapter
class XTTSAdapter(TTSAdapter):
    def speak(self, text: str, tts_cfg: dict) -> dict:
        base = (tts_cfg.get('endpoint') or 'http://127.0.0.1:8020').rstrip('/')
        url = tts_cfg.get('path') or (base + '/api/tts')
        payload = {'text': text}
        if tts_cfg.get('speaker_wav'): payload['speaker_wav'] = tts_cfg['speaker_wav']
        if tts_cfg.get('speaker_id'): payload['speaker_id'] = tts_cfg['speaker_id']
        headers = {'Content-Type':'application/json'}
        try: r = requests.post(url, headers=headers, json=payload, timeout=180)
        except Exception as e: return {'ok': False, 'error': f'XTTS request failed: {e}'}
        if r.status_code != 200: return {'ok': False, 'error': f'XTTS status {r.status_code}: {r.text[:200]}'}
        ctype = r.headers.get('Content-Type','')
        if ctype.startswith('audio/'): data=r.content; ext='wav' if 'wav' in ctype else 'mp3'
        else:
            try: j=r.json(); b64=j.get('audio') or j.get('data'); data=base64.b64decode(b64); ext='wav'
            except Exception: data=r.content; ext='wav'
        name = self._mk_name(f"xtts|{payload.get('speaker_id','')}{payload.get('speaker_wav','')}|{text}", ext)
        (self.audio_dir / name).write_bytes(data)
        return {'ok': True, 'filename': name, 'meta': {'provider':'xtts_server','format':ext}}
