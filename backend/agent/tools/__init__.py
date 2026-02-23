"""Default tool registry with all built-in agent tools.

Provides a singleton :func:`get_default_registry` that lazily creates a
:class:`~backend.agent.registry.ToolRegistry` pre-populated with all 12
agent tools: 4 core (Phase 10) + 8 additional (Phase 10b).

Example:
    >>> registry = get_default_registry()
    >>> len(registry.all_tools())
    12
"""

from __future__ import annotations

from backend.agent.registry import ToolRegistry

# Phase 10: Core tools
from backend.agent.tools.image_gen import image_gen_tool
from backend.agent.tools.memory import memory_search_tool
from backend.agent.tools.web_search import web_search_tool
from backend.agent.tools.scene_control import scene_control_tool

# Phase 10b: Tier 1 — DB-backed tools
from backend.agent.tools.diary import diary_tool
from backend.agent.tools.relationship import relationship_tool
from backend.agent.tools.modify_self import modify_self_tool
from backend.agent.tools.webhook import webhook_tool

# Phase 10b: Tier 2 — Adapter-backed tools
from backend.agent.tools.voice import voice_tool
from backend.agent.tools.mood import mood_tool
from backend.agent.tools.knowledge import knowledge_tool

# Phase 10b: Tier 3 — Cross-character communication
from backend.agent.tools.message_character import message_character_tool

_default_registry: ToolRegistry | None = None


def get_default_registry() -> ToolRegistry:
    """Return the singleton default tool registry.

    Lazily constructs the registry on first call, registering all 12
    built-in tools across Phase 10 and Phase 10b.

    Returns:
        A :class:`ToolRegistry` with all agent tools registered.

    Example:
        >>> reg = get_default_registry()
        >>> len(reg.all_tools())
        12
    """
    global _default_registry
    if _default_registry is None:
        _default_registry = ToolRegistry()
        # Phase 10: Core tools
        _default_registry.register(image_gen_tool)
        _default_registry.register(memory_search_tool)
        _default_registry.register(web_search_tool)
        _default_registry.register(scene_control_tool)
        # Phase 10b: Additional tools
        _default_registry.register(diary_tool)
        _default_registry.register(relationship_tool)
        _default_registry.register(modify_self_tool)
        _default_registry.register(webhook_tool)
        _default_registry.register(voice_tool)
        _default_registry.register(mood_tool)
        _default_registry.register(knowledge_tool)
        _default_registry.register(message_character_tool)
    return _default_registry
