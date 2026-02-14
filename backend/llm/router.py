"""
Multi-Model Router for intelligent request routing.

Routes chat requests to different LLM models based on configurable rules
(message length, keyword heuristics, task categories). Useful when users
have multiple models loaded — e.g. a fast small model for simple questions
and a large model for creative/complex tasks.

Config example (in app.json):
    "routing": {
        "enabled": true,
        "default_model": "google/gemma-3-12b",
        "rules": [
            {"task": "simple", "model": "google/gemma-3-4b", "keywords": ["hello", "hi", "thanks", "yes", "no"]},
            {"task": "creative", "model": "google/gemma-3-12b", "keywords": ["story", "write", "poem", "imagine"]},
            {"task": "code", "model": "google/gemma-3-12b", "keywords": ["code", "function", "debug", "python"]},
            {"task": "analysis", "model": "google/gemma-3-12b", "keywords": ["analyze", "explain", "compare"]}
        ]
    }
"""
import logging
from typing import Optional

logger = logging.getLogger("waifu.router")


class ModelRouter:
    """Routes chat requests to appropriate models based on heuristics.

    The router classifies incoming text using keyword matching and message length,
    then selects the appropriate model from configured routing rules.

    Args:
        config: The full app config dict containing 'routing' section.

    Example:
        >>> router = ModelRouter(config)
        >>> model = router.route("Tell me a story about dragons")
        >>> # Returns the creative model if keyword 'story' matched
    """

    def __init__(self, config: dict):
        routing = config.get("routing", {})
        self.enabled = routing.get("enabled", False)
        self.default_model = routing.get("default_model", config.get("llm", {}).get("model", ""))
        self.rules = routing.get("rules", [])

        # Short message threshold — messages under this are likely simple
        self.short_threshold = routing.get("short_threshold", 20)

    def route(self, text: str) -> str:
        """Determine which model should handle this request.

        Classification priority:
        1. Keyword match (first matching rule wins)
        2. Message length heuristic (very short → simple task model)
        3. Default model

        Args:
            text: The user's input message.

        Returns:
            Model identifier string (e.g. "google/gemma-3-12b").
        """
        if not self.enabled or not self.rules:
            return self.default_model

        text_lower = text.lower().strip()

        # Check keyword rules
        for rule in self.rules:
            keywords = rule.get("keywords", [])
            model = rule.get("model", self.default_model)

            for kw in keywords:
                if kw.lower() in text_lower:
                    logger.debug(f"Router: matched keyword '{kw}' → task '{rule.get('task')}' → model '{model}'")
                    return model

        # Length heuristic — very short messages are likely simple
        if len(text_lower) <= self.short_threshold:
            # Find the 'simple' task model
            for rule in self.rules:
                if rule.get("task") == "simple":
                    logger.debug(f"Router: short message → simple task → model '{rule['model']}'")
                    return rule["model"]

        return self.default_model

    def get_route_info(self, text: str) -> dict:
        """Get routing decision details for debugging/UI display.

        Args:
            text: The user's input message.

        Returns:
            Dict with model, task, reason fields.
        """
        if not self.enabled:
            return {"model": self.default_model, "task": "default", "reason": "routing disabled"}

        text_lower = text.lower().strip()

        for rule in self.rules:
            for kw in rule.get("keywords", []):
                if kw.lower() in text_lower:
                    return {
                        "model": rule.get("model", self.default_model),
                        "task": rule.get("task", "unknown"),
                        "reason": f"keyword match: '{kw}'"
                    }

        if len(text_lower) <= self.short_threshold:
            for rule in self.rules:
                if rule.get("task") == "simple":
                    return {"model": rule["model"], "task": "simple", "reason": "short message"}

        return {"model": self.default_model, "task": "default", "reason": "no rule matched"}


def get_router(config: dict) -> Optional[ModelRouter]:
    """Factory function to create a router from config.

    Returns None if routing is not enabled.

    Args:
        config: Full app config dict.

    Returns:
        ModelRouter instance or None.
    """
    routing = config.get("routing", {})
    if not routing.get("enabled", False):
        return None
    return ModelRouter(config)
