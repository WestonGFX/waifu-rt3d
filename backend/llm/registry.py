from .adapters.openai_compat import OpenAICompatAdapter
from .adapters.ollama import OllamaAdapter
# from .adapters.lmstudio import LMStudioAdapter # Legacy, now covered by OpenAICompat

def get_client(cfg):
    """
    Factory to return the appropriate LLM adapter based on config.
    Supports new 'services' structure with fallback to legacy.
    """
    services = cfg.get("services", {})
    llm_cfg = services.get("llm", {})
    
    # New Config Structure
    if "active_provider" in llm_cfg:
        active = llm_cfg["active_provider"]
        provider_cfg = llm_cfg.get("providers", {}).get(active, {})
        ptype = provider_cfg.get("type", "openai")
        
        if ptype == "openai":
            return OpenAICompatAdapter()
        elif ptype == "ollama":
            return OllamaAdapter()
        else:
            # Fallback to generic openai compat for unknown types as safe bet
            return OpenAICompatAdapter()
            
    # Legacy / Fallback
    return OpenAICompatAdapter()
