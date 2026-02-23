from typing import Dict, Optional
from .adapters.base import ASRAdapter
from .adapters.whisper_api import WhisperAPIAdapter
from .adapters.whisper_local import WhisperLocalAdapter
from .adapters.faster_whisper import FasterWhisperAdapter

# Registry of available ASR adapters
ASR_ADAPTERS = {
    "whisper_api": WhisperAPIAdapter,
    "whisper_local": WhisperLocalAdapter,
    "faster_whisper": FasterWhisperAdapter,
}

def get_asr_adapter(cfg: Dict) -> Optional[ASRAdapter]:
    """
    Factory to return ASR adapter based on unified services config.
    """
    # Unified Config
    services = cfg.get("services", {})
    asr_cfg = services.get("asr", {})
    
    provider_name = "browser"
    provider_config = {}

    if "active_provider" in asr_cfg:
        provider_name = asr_cfg["active_provider"]
        provider_config = asr_cfg.get("providers", {}).get(provider_name, {})
        # Map unified types to adapter keys if needed, or stick to simple mapping
        # Adapters usage uses 'provider' key in config typically.
        provider_config["provider"] = provider_config.get("type", "web_speech")
        
    else:
        # Legacy
        legacy = cfg.get("asr", {})
        if not legacy.get("enabled", False): return None
        provider_name = legacy.get("provider", "browser")
        provider_config = legacy

    # Resolve adapter class
    # For now mapping types: 'openai' -> 'whisper_api', 'local' -> 'whisper_local'
    ptype = provider_config.get("type", provider_config.get("provider"))
    
    adapter_key = None
    if ptype == "openai" or ptype == "whisper_api": adapter_key = "whisper_api"
    elif ptype == "whisper_local": adapter_key = "whisper_local"
    elif ptype == "faster_whisper": adapter_key = "faster_whisper"
    
    if not adapter_key: 
        return None # Browser ASR is client side only

    adapter_class = ASR_ADAPTERS.get(adapter_key)
    if not adapter_class:
        return None

    adapter = adapter_class(provider_config)
    return adapter
