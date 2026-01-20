from pathlib import Path
from .adapters.fish_audio import FishAudioAdapter
from .adapters.elevenlabs import ElevenLabsAdapter
from .adapters.piper_local import PiperLocalAdapter
from .adapters.xtts_server import XTTSAdapter
from .adapters.pinokio_generic import PinokioGenericAdapter
from .adapters.edge_tts import EdgeTTSAdapter

def get_tts(cfg):
    audio_dir = Path(__file__).resolve().parents[2] / "backend" / "storage" / "audio"
    
    # New Config Structure "services.tts"
    services = cfg.get("services", {})
    tts_cfg = services.get("tts", {})
    
    if "active_provider" in tts_cfg:
        active = tts_cfg["active_provider"]
        provider_cfg = tts_cfg.get("providers", {}).get(active, {})
        ptype = provider_cfg.get("type", "generic_rest")
        
        if ptype == "fish_audio_local": return FishAudioAdapter(audio_dir)
        if ptype == "elevenlabs": return ElevenLabsAdapter(audio_dir)
        if ptype == "piper_local": return PiperLocalAdapter(audio_dir)
        if ptype == "xtts_server": return XTTSAdapter(audio_dir)
        if ptype == "edge_tts": return EdgeTTSAdapter(audio_dir)
        if ptype == "generic_rest": return PinokioGenericAdapter(audio_dir)
        
        # Fallback to generic if we have an endpoint
        if "endpoint" in provider_cfg:
            return PinokioGenericAdapter(audio_dir)
            
    # Legacy Fallback
    prov = (cfg.get('tts',{}) or {}).get('provider','edge-tts') # Default to edge-tts if unspecified
    if prov == 'fish_audio': return FishAudioAdapter(audio_dir)
    if prov == 'elevenlabs': return ElevenLabsAdapter(audio_dir)
    if prov == 'piper_local': return PiperLocalAdapter(audio_dir)
    if prov == 'xtts_server': return XTTSAdapter(audio_dir)
    if prov == 'edge-tts': return EdgeTTSAdapter(audio_dir)
    return EdgeTTSAdapter(audio_dir) # Ultimate fallback
