from pathlib import Path
import hashlib, time
class TTSAdapter:
    def __init__(self, audio_dir: Path):
        self.audio_dir = audio_dir
    def _mk_name(self, key: str, ext: str):
        h = hashlib.sha1(key.encode('utf-8')).hexdigest()[:16]
        return f"{int(time.time())}_{h}.{ext}"
    def speak(self, text: str, tts_cfg: dict) -> dict: raise NotImplementedError
