from .adapters.openai_compat import OpenAICompatAdapter
from .adapters.ollama import OllamaAdapter
from .adapters.lmstudio_rest import LMStudioRESTAdapter
from .adapters.gemini import GeminiAdapter
from .adapters.claude_api import ClaudeAPIAdapter


def get_client(cfg):
    """Return the appropriate LLM adapter based on the active configuration.

    Resolves from the new ``services.llm`` config structure first, then falls
    back to the legacy flat ``llm.provider`` key.

    Supported provider types:
        ``openai``, ``ollama``, ``lmstudio-rest``, ``gemini``

    Args:
        cfg: Full application config dict (from ``load_config()``).

    Returns:
        An ``LLMAdapter`` subclass instance.
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
        if ptype == "ollama":
            return OllamaAdapter()
        if ptype == "lmstudio-rest":
            return LMStudioRESTAdapter()
        if ptype == "gemini":
            return GeminiAdapter()
        if ptype in ("claude", "anthropic"):
            return ClaudeAPIAdapter()
        # Fallback to generic openai compat for unknown types
        return OpenAICompatAdapter()

    # Legacy flat-config fallback
    simple_provider = cfg.get("llm", {}).get("provider", "local")
    if simple_provider == "lmstudio-rest":
        return LMStudioRESTAdapter()
    if simple_provider == "ollama":
        return OllamaAdapter()
    if simple_provider == "gemini":
        return GeminiAdapter()
    if simple_provider in ("claude", "anthropic"):
        return ClaudeAPIAdapter()

    return OpenAICompatAdapter()
