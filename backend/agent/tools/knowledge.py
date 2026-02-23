"""Knowledge base search tool for agentic characters.

Searches the character's uploaded knowledge base documents, using
semantic vector search when available or falling back to simple SQL
``LIKE`` matching.
"""

from __future__ import annotations

from backend.agent.registry import ToolContext, ToolDef, ToolResult


async def _execute(args: dict, context: ToolContext) -> ToolResult:
    """Execute the read_knowledge tool.

    Checks whether the character has any uploaded documents, then
    performs either a semantic vector search (if ``context.vector_store``
    supports ``query_doc_chunks``) or a simple SQL ``LIKE`` fallback.

    Args:
        args: Tool arguments.  Expects ``"query"`` (str, required) and
            optionally ``"max_results"`` (int, default 3, capped at 5).
        context: Execution context providing the DB connection and
            optional vector store for semantic search.

    Returns:
        A :class:`ToolResult` containing a list of matching documents
        with filename, text snippet, and relevance score.  Returns an
        empty list (still ``ok=True``) if no documents are uploaded.

    Example:
        >>> import asyncio, sqlite3
        >>> conn = sqlite3.connect(":memory:")
        >>> ctx = ToolContext(cfg={}, char_id=1, session_id=1, db_conn=conn)
        >>> result = asyncio.run(_execute({"query": "hello"}, ctx))
        >>> result.ok  # True even if table doesn't exist
        True
    """
    query = args.get("query", "")
    if not query:
        return ToolResult(ok=False, error="No search query provided")

    max_results = min(max(args.get("max_results", 3), 1), 5)

    if context.db_conn is None:
        return ToolResult(
            ok=False,
            error="Knowledge search unavailable (no database connection)",
        )

    # Check if the character has any docs uploaded
    try:
        count_row = context.db_conn.execute(
            "SELECT COUNT(*) FROM character_docs WHERE char_id = ?",
            (context.char_id,),
        ).fetchone()
        doc_count = count_row[0] if count_row else 0
    except Exception:
        # Table may not exist in older installations
        return ToolResult(
            ok=True,
            data={
                "results": [],
                "note": "Knowledge base not available in this installation",
            },
            display="list",
        )

    if doc_count == 0:
        return ToolResult(
            ok=True,
            data={
                "results": [],
                "note": "No knowledge base documents uploaded",
            },
            display="list",
        )

    # Try semantic search via vector store first
    if (
        context.vector_store is not None
        and hasattr(context.vector_store, "query_doc_chunks")
    ):
        try:
            raw = context.vector_store.query_doc_chunks(
                context.char_id, query, n_results=max_results,
            )
            results = [
                {
                    "filename": r.get("filename", ""),
                    "text": r.get("text", ""),
                    "score": round(
                        max(0.0, 1.0 - float(r.get("dist", 0.0))), 3
                    ),
                }
                for r in raw
            ]
            return ToolResult(
                ok=True, data={"results": results}, display="list"
            )
        except Exception:
            pass  # Fall through to SQL fallback

    # SQL LIKE fallback
    try:
        rows = context.db_conn.execute(
            "SELECT filename, content FROM character_docs "
            "WHERE char_id=? AND content LIKE ? LIMIT ?",
            (context.char_id, f"%{query}%", max_results),
        ).fetchall()
    except Exception as exc:
        return ToolResult(
            ok=False, error=f"Knowledge search failed: {exc}"
        )

    results = [
        {"filename": row[0], "text": row[1][:500], "score": 0.5}
        for row in rows
    ]
    return ToolResult(ok=True, data={"results": results}, display="list")


knowledge_tool = ToolDef(
    name="read_knowledge",
    description=(
        "Search your knowledge base documents for relevant information. "
        "Returns matching text passages from uploaded files."
    ),
    parameters={
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "description": "What to search for in your knowledge base.",
            },
            "max_results": {
                "type": "integer",
                "description": "Maximum number of results to return (1-5).",
                "default": 3,
                "minimum": 1,
                "maximum": 5,
            },
        },
        "required": ["query"],
        "additionalProperties": False,
    },
    execute=_execute,
)
