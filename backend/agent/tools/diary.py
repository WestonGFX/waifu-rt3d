"""Diary tool for agentic characters.

Allows the character to write a first-person diary entry reflecting
on recent conversations and feelings, persisted to the database.
"""

from __future__ import annotations

import json
from datetime import datetime

from backend.agent.registry import ToolContext, ToolDef, ToolResult


async def _execute(args: dict, context: ToolContext) -> ToolResult:
    """Write a diary entry to the character's database row.

    Stores the entry text and current date in the ``diary`` and
    ``diary_date`` columns of the ``characters`` table.

    Args:
        args: Tool arguments containing ``entry`` (required) and
            optional ``mood``.
        context: Execution context with ``db_conn`` and ``char_id``.

    Returns:
        ToolResult with the saved diary text, date, and mood.

    Example:
        >>> import asyncio, sqlite3
        >>> conn = sqlite3.connect(":memory:")
        >>> conn.execute("CREATE TABLE characters (id INT, diary TEXT, diary_date TEXT)")
        >>> conn.execute("INSERT INTO characters VALUES (1, NULL, NULL)")
        >>> ctx = ToolContext(cfg={}, char_id=1, session_id=1, db_conn=conn)
        >>> r = asyncio.run(_execute({"entry": "Good day!", "mood": "happy"}, ctx))
        >>> r.ok
        True
    """
    entry = args.get("entry", "")
    mood = args.get("mood", "neutral")
    today = datetime.now().strftime("%Y-%m-%d")

    try:
        context.db_conn.execute(
            "UPDATE characters SET diary = ?, diary_date = ? WHERE id = ?",
            (entry, today, context.char_id),
        )
        context.db_conn.commit()
    except Exception as exc:
        return ToolResult(ok=False, error=f"Failed to write diary: {exc}")

    return ToolResult(
        ok=True,
        data={"diary": entry, "date": today, "mood": mood},
        display="text",
    )


diary_tool = ToolDef(
    name="write_diary",
    description=(
        "Write a first-person diary entry reflecting on recent "
        "conversations and feelings"
    ),
    parameters={
        "type": "object",
        "properties": {
            "entry": {
                "type": "string",
                "description": "First-person diary entry text (2-4 sentences)",
            },
            "mood": {
                "type": "string",
                "description": "Current mood while writing",
                "enum": [
                    "happy", "sad", "thoughtful", "excited",
                    "worried", "grateful", "neutral",
                ],
            },
        },
        "required": ["entry"],
    },
    execute=_execute,
)
