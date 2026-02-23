"""Relationship introspection tool for agentic characters.

Allows the character to check its current relationship status with
the user, including affinity, mood, and trust levels.
"""

from __future__ import annotations

from backend.agent.registry import ToolContext, ToolDef, ToolResult


async def _execute(args: dict, context: ToolContext) -> ToolResult:
    """Query relationship metrics from the database.

    Ensures a default row exists in ``character_relationships`` for the
    current character, then returns the affinity, mood, trust, and
    interaction count.

    Args:
        args: Tool arguments (none expected).
        context: Execution context with ``db_conn`` and ``char_id``.

    Returns:
        ToolResult with affinity, mood, trust (floats), and
        interactions (int).

    Example:
        >>> import asyncio, sqlite3
        >>> conn = sqlite3.connect(":memory:")
        >>> conn.execute('''CREATE TABLE character_relationships (
        ...     id INTEGER PRIMARY KEY, char_id INTEGER UNIQUE,
        ...     affinity REAL DEFAULT 0.5, mood REAL DEFAULT 0.5,
        ...     trust REAL DEFAULT 0.5, interactions INTEGER DEFAULT 0)''')
        >>> ctx = ToolContext(cfg={}, char_id=1, session_id=1, db_conn=conn)
        >>> r = asyncio.run(_execute({}, ctx))
        >>> r.data["affinity"]
        0.5
    """
    try:
        context.db_conn.execute(
            "INSERT OR IGNORE INTO character_relationships (char_id) VALUES (?)",
            (context.char_id,),
        )
        context.db_conn.commit()

        row = context.db_conn.execute(
            "SELECT affinity, mood, trust, interactions "
            "FROM character_relationships WHERE char_id = ?",
            (context.char_id,),
        ).fetchone()

        if row is None:
            # Fallback defaults if the INSERT somehow didn't create a row
            affinity, mood, trust, interactions = 0.5, 0.5, 0.5, 0
        else:
            affinity, mood, trust, interactions = row

    except Exception as exc:
        return ToolResult(ok=False, error=f"Failed to check relationship: {exc}")

    return ToolResult(
        ok=True,
        data={
            "affinity": round(float(affinity), 3),
            "mood": round(float(mood), 3),
            "trust": round(float(trust), 3),
            "interactions": int(interactions),
        },
        display="text",
    )


relationship_tool = ToolDef(
    name="check_relationship",
    description=(
        "Check your current relationship status with the user — "
        "affinity, mood, and trust levels"
    ),
    parameters={"type": "object", "properties": {}},
    execute=_execute,
)
