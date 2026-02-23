"""Cross-character messaging tool for agentic characters.

Allows one character to send a message to another character and receive
their LLM-generated reply.  The exchange is a side-channel -- it is NOT
persisted to the main conversation history so it does not pollute the
user-facing chat log.
"""

from __future__ import annotations

from backend.agent.registry import ToolContext, ToolDef, ToolResult
from backend.llm.registry import get_client
from starlette.concurrency import run_in_threadpool


async def _execute(args: dict, context: ToolContext) -> ToolResult:
    """Send a message to another character and return their reply.

    Looks up the target character's system prompt, builds a minimal
    message list, and calls the LLM adapter synchronously (via
    ``run_in_threadpool``) to generate the target character's response.

    Args:
        args: Tool arguments containing ``character_id`` (int) and
            ``message`` (str).
        context: Execution context with ``cfg``, ``char_id``, and
            ``db_conn``.

    Returns:
        ToolResult with the target character's reply in ``data``, or an
        error if the character was not found, a self-message was
        attempted, or the LLM call failed.

    Example:
        >>> import asyncio, sqlite3
        >>> conn = sqlite3.connect(":memory:")
        >>> conn.execute("CREATE TABLE characters (id INTEGER PRIMARY KEY, name TEXT, system_prompt TEXT)")
        >>> conn.execute("INSERT INTO characters VALUES (1, 'A', 'prompt A')")
        >>> conn.execute("INSERT INTO characters VALUES (2, 'B', 'prompt B')")
        >>> conn.commit()
        >>> ctx = ToolContext(cfg={"llm": {}}, char_id=1, session_id=1, db_conn=conn)
        >>> # (actual execution requires a running LLM adapter)
    """
    try:
        # -- Validate target character exists --------------------------------
        row = context.db_conn.execute(
            "SELECT name, system_prompt FROM characters WHERE id=?",
            (args["character_id"],),
        ).fetchone()

        if not row:
            return ToolResult(
                ok=False,
                data={},
                display="text",
                error=f"Character with ID {args['character_id']} not found",
            )

        target_name, target_prompt = row

        # -- Prevent self-messaging ------------------------------------------
        if args["character_id"] == context.char_id:
            return ToolResult(
                ok=False,
                data={},
                display="text",
                error="Cannot message yourself",
            )

        # -- Build messages for the target character -------------------------
        messages = [
            {
                "role": "system",
                "content": target_prompt or "You are a friendly anime companion.",
            },
            {"role": "user", "content": args["message"]},
        ]

        # -- Call LLM adapter (non-streaming) --------------------------------
        adapter = get_client(context.cfg)

        model = context.cfg.get("llm", {}).get("model", "")
        endpoint = context.cfg.get("llm", {}).get("endpoint", "")
        api_key = context.cfg.get("llm", {}).get("api_key", "")

        result = await run_in_threadpool(
            adapter.chat, messages, model, endpoint, api_key
        )

        # -- Handle response -------------------------------------------------
        if result.get("ok"):
            reply = result.get("reply", result.get("text", ""))
            return ToolResult(
                ok=True,
                data={
                    "from_character": target_name,
                    "character_id": args["character_id"],
                    "reply": reply,
                },
                display="text",
            )
        else:
            return ToolResult(
                ok=False,
                data={},
                display="text",
                error=result.get("error", "Failed to get response from character"),
            )

    except Exception as exc:
        return ToolResult(
            ok=False,
            data={},
            display="text",
            error=f"message_character failed: {exc}",
        )


message_character_tool = ToolDef(
    name="message_character",
    description="Send a message to another character and receive their reply",
    parameters={
        "type": "object",
        "properties": {
            "character_id": {
                "type": "integer",
                "description": "ID of the character to message",
            },
            "message": {
                "type": "string",
                "description": "Message to send to the other character",
            },
        },
        "required": ["character_id", "message"],
    },
    execute=_execute,
)
