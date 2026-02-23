"""Tool registry and data classes for the agentic character system.

Provides the core abstractions for defining, registering, and discovering
tools that LLM-driven characters can invoke during conversation.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable, Optional


@dataclass
class ToolResult:
    """Result returned after executing a tool.

    Attributes:
        ok: Whether the tool executed successfully.
        data: Arbitrary payload returned by the tool.
        display: Hint for how the frontend should render the result
            (e.g. ``"text"``, ``"image"``, ``"table"``).
        error: Human-readable error message when ``ok`` is False.

    Example:
        >>> result = ToolResult(ok=True, data={"count": 42})
        >>> result.display
        'text'
    """

    ok: bool
    data: dict = field(default_factory=dict)
    display: str = "text"
    error: Optional[str] = None


@dataclass
class ToolContext:
    """Execution context passed into every tool executor.

    Carries references to shared resources so tools can read config,
    access the database, or query the vector store without importing
    them directly.

    Attributes:
        cfg: The application configuration dictionary.
        char_id: Database ID of the character invoking the tool.
        session_id: Current chat session ID.
        db_conn: Optional database connection handle.
        vector_store: Optional vector / memory store instance.

    Example:
        >>> ctx = ToolContext(cfg={"llm": {}}, char_id=1, session_id=100)
        >>> ctx.char_id
        1
    """

    cfg: dict
    char_id: int
    session_id: int
    db_conn: Any = None
    vector_store: Any = None


@dataclass
class ToolDef:
    """Definition of a single tool available to agentic characters.

    Attributes:
        name: Machine-readable tool name (e.g. ``"recall_memory"``).
        description: Short description shown to the LLM so it knows
            when to pick this tool.
        parameters: JSON Schema dict describing accepted arguments,
            following the OpenAI function-calling ``parameters`` format.
        execute: Async or sync callable with signature
            ``(args: dict, ctx: ToolContext) -> ToolResult``.

    Example:
        >>> async def noop(args, ctx):
        ...     return ToolResult(ok=True)
        >>> td = ToolDef(
        ...     name="noop",
        ...     description="Does nothing",
        ...     parameters={"type": "object", "properties": {}},
        ...     execute=noop,
        ... )
        >>> td.name
        'noop'
    """

    name: str
    description: str
    parameters: dict
    execute: Callable


class ToolRegistry:
    """Registry of tools available to the agentic loop.

    Stores :class:`ToolDef` instances by name and provides helpers to
    enumerate them or export OpenAI-compatible function schemas.

    Example:
        >>> registry = ToolRegistry()
        >>> async def echo(args, ctx):
        ...     return ToolResult(ok=True, data=args)
        >>> registry.register(ToolDef(
        ...     name="echo",
        ...     description="Echoes input",
        ...     parameters={"type": "object", "properties": {"msg": {"type": "string"}}},
        ...     execute=echo,
        ... ))
        >>> registry.get_tool("echo").name
        'echo'
    """

    def __init__(self) -> None:
        """Initialise an empty registry."""
        self._tools: dict[str, ToolDef] = {}

    def register(self, tool: ToolDef) -> None:
        """Register a tool, overwriting any existing tool with the same name.

        Args:
            tool: The tool definition to register.
        """
        self._tools[tool.name] = tool

    def get_tool(self, name: str) -> Optional[ToolDef]:
        """Look up a tool by name.

        Args:
            name: The machine-readable tool name.

        Returns:
            The matching :class:`ToolDef`, or ``None`` if not found.
        """
        return self._tools.get(name)

    def all_tools(self) -> list[ToolDef]:
        """Return a list of all registered tools.

        Returns:
            List of :class:`ToolDef` instances in insertion order.
        """
        return list(self._tools.values())

    def get_schemas(self) -> list[dict]:
        """Export all tools as OpenAI function-calling schemas.

        Returns:
            A list of dicts, each shaped like::

                {
                    "type": "function",
                    "function": {
                        "name": "...",
                        "description": "...",
                        "parameters": { ... }
                    }
                }
        """
        return [
            {
                "type": "function",
                "function": {
                    "name": t.name,
                    "description": t.description,
                    "parameters": t.parameters,
                },
            }
            for t in self._tools.values()
        ]
