import shutil, subprocess
from .base import TTSAdapter
class PiperLocalAdapter(TTSAdapter):
    def speak(self, text: str, tts_cfg: dict) -> dict:
        exe = tts_cfg.get('path') or shutil.which('piper') or shutil.which('piper.exe')
        if not exe: return {'ok': False, 'error': 'piper not found in PATH. Install Piper and set tts.piper.path'}
        model = tts_cfg.get('voice') or tts_cfg.get('model')
        if not model: return {'ok': False, 'error': 'piper voice model path required in tts.voice'}
        name = self._mk_name(f"piper|{model}|{text}", 'wav')
        dest = (self.audio_dir / name)
        cmd = [exe, '-m', model, '-f', str(dest), '-t', text]
        try: subprocess.run(cmd, check=True)
        except Exception as e: return {'ok': False, 'error': f'Piper failed: {e}'}
        return {'ok': True, 'filename': name, 'meta': {'provider':'piper_local','voice':model,'format':'wav'}}
