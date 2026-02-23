"""Webhook notification tool for agentic characters.

Allows the character to send notifications to configured external
services (Discord, IFTTT, etc.) by POSTing a JSON payload to each
registered webhook URL.
"""

from __future__ import annotations

import threading
import time

from backend.agent.registry import ToolContext, ToolDef, ToolResult


def _post_webhook(url: str, payload: dict) -> None:
    """Fire a single webhook POST in a background thread.

    Tries ``requests`` first, falls back to ``httpx`` synchronous
    client.  Errors are silently swallowed since webhooks are
    best-effort.

    Args:
        url: The webhook endpoint URL.
        payload: JSON-serialisable dict to send.
    """
    try:
        import requests as _req
        _req.post(url, json=payload, timeout=5)
    except ImportError:
        import httpx
        httpx.post(url, json=payload, timeout=5)
    except Exception:
        pass  # Best-effort delivery


async def _execute(args: dict, context: ToolContext) -> ToolResult:
    """Send a webhook notification to all configured URLs.

    Reads ``webhooks`` from ``context.cfg``, builds a JSON payload with
    the event type, message, character ID, and timestamp, then fires
    each webhook in a daemon thread for non-blocking delivery.

    Args:
        args: Tool arguments with ``event_type`` and ``message``.
        context: Execution context with ``cfg`` and ``char_id``.

    Returns:
        ToolResult indicating how many webhooks were dispatched.

    Example:
        >>> import asyncio
        >>> ctx = ToolContext(cfg={"webhooks": []}, char_id=1, session_id=1)
        >>> r = asyncio.run(_execute({"event_type": "test", "message": "hi"}, ctx))
        >>> r.data["sent_to"]
        0
    """
    urls = context.cfg.get("webhooks", [])

    if not urls:
        return ToolResult(
            ok=True,
            data={"sent_to": 0, "note": "No webhooks configured"},
            display="text",
        )

    payload = {
        "event_type": args["event_type"],
        "message": args["message"],
        "character_id": context.char_id,
        "timestamp": time.time(),
    }

    count = 0
    for url in urls:
        if isinstance(url, str) and url.startswith("http"):
            threading.Thread(
                target=_post_webhook,
                args=(url, payload),
                daemon=True,
            ).start()
            count += 1

    return ToolResult(
        ok=True,
        data={"sent_to": count, "event_type": args["event_type"]},
        display="text",
    )


webhook_tool = ToolDef(
    name="trigger_webhook",
    description=(
        "Send a notification to configured external services "
        "(Discord, IFTTT, etc.)"
    ),
    parameters={
        "type": "object",
        "properties": {
            "event_type": {
                "type": "string",
                "description": (
                    "Event name (e.g. 'mood_change', 'milestone', 'custom')"
                ),
            },
            "message": {
                "type": "string",
                "description": "Message content to send",
            },
        },
        "required": ["event_type", "message"],
    },
    execute=_execute,
)
