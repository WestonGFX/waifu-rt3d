import shutil, subprocess
from pathlib import Path
from .base import TTSAdapter


class PiperLocalAdapter(TTSAdapter):
    """TTS adapter for Piper local neural TTS.

    Supports both manually-configured model paths and voices installed
    via the TTS Model Manager (``piper/`` prefix in voice_id).
    """

    def speak(self, text: str, tts_cfg: dict) -> dict:
        """Synthesise speech using the local Piper executable.

        Args:
            text: Text to synthesise.
            tts_cfg: Config dict with ``path``, ``voice``/``model``,
                and optionally ``voice_id`` for managed models.

        Returns:
            Success dict with ``filename`` or error dict.
        """
        exe = tts_cfg.get('path') or shutil.which('piper') or shutil.which('piper.exe')
        if not exe:
            return {'ok': False, 'error': 'piper not found in PATH. Install Piper and set tts.piper.path'}

        model = tts_cfg.get('voice') or tts_cfg.get('model')

        # Managed model path resolution: voice_id like "piper/en_US-amy-medium"
        # maps to storage/tts_models/piper/en_US-amy-medium.onnx
        if not model and tts_cfg.get('voice_id', '').startswith('piper/'):
            voice_name = tts_cfg['voice_id'].split('/', 1)[1]
            managed = Path(__file__).resolve().parents[2] / "storage" / "tts_models" / "piper" / f"{voice_name}.onnx"
            if managed.exists():
                model = str(managed)

        if not model:
            return {'ok': False, 'error': 'piper voice model path required in tts.voice'}

        name = self._mk_name(f"piper|{model}|{text}", 'wav')
        dest = (self.audio_dir / name)
        cmd = [exe, '-m', model, '-f', str(dest), '-t', text]
        try:
            subprocess.run(cmd, check=True)
        except Exception as e:
            return {'ok': False, 'error': f'Piper failed: {e}'}
        return {'ok': True, 'filename': name, 'meta': {'provider': 'piper_local', 'voice': model, 'format': 'wav'}}
