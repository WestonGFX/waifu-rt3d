from pathlib import Path
from .adapters.fish_audio import FishAudioAdapter
from .adapters.elevenlabs import ElevenLabsAdapter
from .adapters.piper_local import PiperLocalAdapter
from .adapters.xtts_server import XTTSAdapter

def get_tts(cfg):
    audio_dir = Path(__file__).resolve().parents[2] / "storage" / "audio"
    prov = (cfg.get('tts',{}) or {}).get('provider','fish_audio')
    if prov == 'fish_audio': return FishAudioAdapter(audio_dir)
    if prov == 'elevenlabs': return ElevenLabsAdapter(audio_dir)
    if prov == 'piper_local': return PiperLocalAdapter(audio_dir)
    if prov == 'xtts_server': return XTTSAdapter(audio_dir)
    return FishAudioAdapter(audio_dir)
