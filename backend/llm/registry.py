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
        ``openai``, ``ollama``, ``lmstudio-rest``, ``gemini``, ``claude``,
        ``peft_local`` (requires torch + peft installed; raises ImportError otherwise)

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
        if ptype == "peft_local":
            from .adapters.peft_local import PeftLocalAdapter
            return PeftLocalAdapter()
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
    if simple_provider == "peft_local":
        from .adapters.peft_local import PeftLocalAdapter
        return PeftLocalAdapter()

    return OpenAICompatAdapter()


def get_vision_client(cfg: dict):
    """Return an LLM adapter suitable for vision (image) tasks.

    Routing priority:
    1. Primary LLM adapter if it supports vision.
    2. OpenAI-compat adapter as fallback (user may have a vision model
       loaded on LM Studio without explicit config).

    Args:
        cfg: Full application config dict.

    Returns:
        Tuple of ``(adapter, model, endpoint, api_key)`` ready for
        ``adapter.image_chat()``.

    Example:
        >>> adapter, model, endpoint, api_key = get_vision_client(cfg)
        >>> result = adapter.image_chat(msgs, imgs, model, endpoint, api_key)
    """
    primary = get_client(cfg)
    llm_cfg = cfg.get("llm", {})
    model = llm_cfg.get("model", "")
    endpoint = llm_cfg.get("endpoint", "http://localhost:1234")
    api_key = llm_cfg.get("api_key", "")

    if primary.supports_vision():
        return primary, model, endpoint, api_key

    # Last resort — OpenAI compat is optimistically vision-capable
    fallback = OpenAICompatAdapter()
    return fallback, model, endpoint, api_key
