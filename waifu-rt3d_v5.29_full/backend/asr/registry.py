from typing import Dict, Optional
from .adapters.base import ASRAdapter
from .adapters.whisper_api import WhisperAPIAdapter
from .adapters.whisper_local import WhisperLocalAdapter

# Registry of available ASR adapters
ASR_ADAPTERS = {
    "whisper_api": WhisperAPIAdapter,
    "whisper_local": WhisperLocalAdapter,
}

def get_asr_adapter(config: Dict) -> Optional[ASRAdapter]:
    """
    Factory function to get ASR adapter instance.

    Args:
        config: ASR configuration dictionary
               Must include 'provider' key matching ASR_ADAPTERS keys

    Returns:
        ASRAdapter instance or None if ASR disabled

    Raises:
        ValueError: If provider not found or config invalid

    Example:
        config = {
            "enabled": True,
            "provider": "whisper_api",
            "endpoint": "https://api.openai.com/v1",
            "api_key": "sk-...",
            "model": "whisper-1"
        }
        adapter = get_asr_adapter(config)
        result = await adapter.transcribe(audio_bytes)
    """
    # Check if ASR is enabled
    if not config.get("enabled", False):
        return None

    # Get provider name
    provider = config.get("provider", "").lower()
    if not provider:
        raise ValueError("ASR config missing 'provider' key")

    # Get adapter class
    adapter_class = ASR_ADAPTERS.get(provider)
    if not adapter_class:
        available = ", ".join(ASR_ADAPTERS.keys())
        raise ValueError(
            f"Unknown ASR provider: '{provider}'. "
            f"Available: {available}"
        )

    # Create and validate adapter
    adapter = adapter_class(config)
    adapter.validate_config()

    return adapter
