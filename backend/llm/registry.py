from .adapters.openai_compat import OpenAICompatAdapter
from .adapters.ollama import OllamaAdapter
from .adapters.lmstudio_rest import LMStudioRESTAdapter

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
        elif ptype == "lmstudio-rest":
            return LMStudioRESTAdapter()
        else:
            # Fallback to generic openai compat for unknown types as safe bet
            return OpenAICompatAdapter()
            
    # Legacy / Fallback [Update default logic if needed, but usually config drives this]
    # If legacy config uses "local" and endpoint is generic, default to OpenAICompat.
    # But if user specifically asked for defaults, they are likely in app.json.
    # Legacy / Fallback
    simple_provider = cfg.get("llm", {}).get("provider", "local")
    if simple_provider == "lmstudio-rest":
        return LMStudioRESTAdapter()
    elif simple_provider == "ollama":
        return OllamaAdapter()
        
    return OpenAICompatAdapter()
