"""Self-modification tool for agentic characters.

Allows the character to update its own greeting message, background
settings, or personality traits — with a strict field whitelist to
prevent unauthorized mutations.
"""

from __future__ import annotations

import json

from backend.agent.registry import ToolContext, ToolDef, ToolResult

# Only these columns may be updated via this tool.
_ALLOWED_FIELDS = frozenset({
    "greeting_text",
    "background_url",
    "background_mode",
    "personality_traits",
})


async def _execute(args: dict, context: ToolContext) -> ToolResult:
    """Update whitelisted character fields in the database.

    Builds a dynamic ``UPDATE`` statement from the intersection of
    *args* keys and :data:`_ALLOWED_FIELDS`.  The ``personality_traits``
    value is JSON-encoded before storage.

    Args:
        args: Dict of field names to new values.  Only keys present in
            :data:`_ALLOWED_FIELDS` are applied.
        context: Execution context with ``db_conn`` and ``char_id``.

    Returns:
        ToolResult listing which fields were updated, or an error if
        none of the supplied fields are valid.

    Example:
        >>> import asyncio, sqlite3
        >>> conn = sqlite3.connect(":memory:")
        >>> conn.execute("CREATE TABLE characters (id INT, greeting_text TEXT)")
        >>> conn.execute("INSERT INTO characters VALUES (1, NULL)")
        >>> ctx = ToolContext(cfg={}, char_id=1, session_id=1, db_conn=conn)
        >>> r = asyncio.run(_execute({"greeting_text": "Hi!"}, ctx))
        >>> r.data["updated_fields"]
        ['greeting_text']
    """
    updates: list[str] = []
    params: list = []

    for key, value in args.items():
        if key not in _ALLOWED_FIELDS:
            continue
        # JSON-encode list-type fields
        if key == "personality_traits":
            value = json.dumps(value)
        updates.append(f"{key} = ?")
        params.append(value)

    if not updates:
        return ToolResult(ok=False, error="No valid fields to update")

    params.append(context.char_id)
    sql = f"UPDATE characters SET {', '.join(updates)} WHERE id = ?"

    try:
        context.db_conn.execute(sql, params)
        context.db_conn.commit()
    except Exception as exc:
        return ToolResult(ok=False, error=f"Failed to update character: {exc}")

    updated_fields = [
        k for k in args if k in _ALLOWED_FIELDS
    ]
    return ToolResult(
        ok=True,
        data={"updated_fields": updated_fields},
        display="text",
    )


modify_self_tool = ToolDef(
    name="modify_self",
    description=(
        "Update your own greeting message, background, or personality traits"
    ),
    parameters={
        "type": "object",
        "properties": {
            "greeting_text": {
                "type": "string",
                "description": "New greeting message shown when user opens chat",
            },
            "background_url": {
                "type": "string",
                "description": "Background image filename or CSS color",
            },
            "background_mode": {
                "type": "string",
                "enum": ["transparent", "color", "image"],
                "description": "How the background is displayed",
            },
            "personality_traits": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Updated personality trait list",
            },
        },
    },
    execute=_execute,
)
