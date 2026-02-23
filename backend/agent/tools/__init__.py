"""Default tool registry with all built-in agent tools.

Provides a singleton :func:`get_default_registry` that lazily creates a
:class:`~backend.agent.registry.ToolRegistry` pre-populated with the four
core tools: image generation, memory search, web search, and scene control.

Example:
    >>> registry = get_default_registry()
    >>> len(registry.all_tools())
    4
"""

from __future__ import annotations

from backend.agent.registry import ToolRegistry
from backend.agent.tools.image_gen import image_gen_tool
from backend.agent.tools.memory import memory_search_tool
from backend.agent.tools.web_search import web_search_tool
from backend.agent.tools.scene_control import scene_control_tool

_default_registry: ToolRegistry | None = None


def get_default_registry() -> ToolRegistry:
    """Return the singleton default tool registry.

    Lazily constructs the registry on first call, registering all four
    built-in tools (image_gen, memory_search, web_search, scene_control).

    Returns:
        A :class:`ToolRegistry` with all core tools registered.

    Example:
        >>> reg = get_default_registry()
        >>> sorted(t.name for t in reg.all_tools())
        ['generate_image', 'memory_search', 'scene_control', 'web_search']
    """
    global _default_registry
    if _default_registry is None:
        _default_registry = ToolRegistry()
        _default_registry.register(image_gen_tool)
        _default_registry.register(memory_search_tool)
        _default_registry.register(web_search_tool)
        _default_registry.register(scene_control_tool)
    return _default_registry
