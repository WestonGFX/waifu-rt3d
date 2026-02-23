"""Memory search tool for agentic characters.

Queries the ChromaDB vector store for semantically similar past
conversation memories and character knowledge, letting the character
recall earlier topics on demand.
"""

from __future__ import annotations

from backend.agent.registry import ToolContext, ToolDef, ToolResult


async def _execute(args: dict, context: ToolContext) -> ToolResult:
    """Execute the memory_search tool.

    Performs a semantic similarity search against the vector store,
    returning the closest matching memories for the current character.

    Args:
        args: Tool arguments.  Expects ``"query"`` (str) and optionally
            ``"max_results"`` (int, default 5, capped at 10).
        context: Execution context; must have a non-None ``vector_store``.

    Returns:
        A :class:`ToolResult` containing a list of memory dicts, each with
        ``text``, ``role``, and ``score`` (0-1, higher = more relevant).
        Returns an error result if the vector store is unavailable.

    Example:
        >>> # With a mock vector store
        >>> import asyncio
        >>> from unittest.mock import MagicMock
        >>> vs = MagicMock()
        >>> vs.query_memory.return_value = [
        ...     {"text": "hello", "role": "user", "dist": 0.2}
        ... ]
        >>> ctx = ToolContext(cfg={}, char_id=1, session_id=1, vector_store=vs)
        >>> result = asyncio.run(_execute({"query": "greetings"}, ctx))
        >>> result.data["memories"][0]["score"]
        0.8
    """
    if context.vector_store is None:
        return ToolResult(
            ok=False,
            error="Memory search unavailable (vector store not initialized)",
        )

    query = args.get("query", "")
    max_results = min(args.get("max_results", 5), 10)

    raw = context.vector_store.query_memory(
        query, n_results=max_results, char_id=context.char_id,
    )

    memories = [
        {
            "text": m.get("text", ""),
            "role": m.get("role", ""),
            "score": round(max(0.0, 1.0 - float(m.get("dist", 0.0))), 3),
        }
        for m in raw
    ]

    return ToolResult(ok=True, data={"memories": memories}, display="list")


memory_search_tool = ToolDef(
    name="memory_search",
    description=(
        "Search past conversation memories by semantic similarity. "
        "Use this to recall what the user said before or to look up "
        "character knowledge."
    ),
    parameters={
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "description": "Natural language search query.",
            },
            "max_results": {
                "type": "integer",
                "description": "Maximum number of memories to return (1-10).",
                "default": 5,
                "minimum": 1,
                "maximum": 10,
            },
        },
        "required": ["query"],
        "additionalProperties": False,
    },
    execute=_execute,
)
