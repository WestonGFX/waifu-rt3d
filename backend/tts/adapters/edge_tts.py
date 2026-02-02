import subprocess
import shutil
from .base import TTSAdapter

class EdgeTTSAdapter(TTSAdapter):
    def speak(self, text: str, tts_cfg: dict) -> dict:
        # Verify edge-tts is installed
        if not shutil.which("edge-tts"):
            return {'ok': False, 'error': 'edge-tts CLI not found. Install with `pip install edge-tts`'}

        voice = tts_cfg.get('voice_id') or "en-US-AriaNeural"
        rate = tts_cfg.get('tts_rate') or "+0%"
        pitch = tts_cfg.get('tts_pitch') or "+0Hz"
        
        # Generate filename
        # key includes text and params to cache distinct variations
        key = f"edge|{voice}|{rate}|{pitch}|{text}"
        name = self._mk_name(key, "mp3")
        out_path = self.audio_dir / name
        
        # Build command
        # edge-tts --text "Hello" --voice en-US-AriaNeural --write-media out.mp3 --rate=+10% --pitch=+5Hz
        cmd = [
            "edge-tts",
            "--text", text,
            "--voice", voice,
            "--write-media", str(out_path),
            "--rate", rate,
            "--pitch", pitch
        ]
        
        try:
            # Run blocking subprocess
            subprocess.run(cmd, check=True, capture_output=True, text=True)
            
            return {
                'ok': True, 
                'filename': name, 
                'meta': {
                    'provider': 'edge-tts',
                    'voice_id': voice,
                    'rate': rate,
                    'pitch': pitch
                }
            }
        except subprocess.CalledProcessError as e:
            return {'ok': False, 'error': f"edge-tts failed: {e.stderr}"}
        except Exception as e:
            return {'ok': False, 'error': f"EdgeTTS adapter error: {e}"}
