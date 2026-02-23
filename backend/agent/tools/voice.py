"""Voice generation tool for agentic characters.

Delegates to the existing ``backend.tts`` adapter system so the character
can generate spoken audio clips during a conversation.  Uses a deferred
import to avoid circular dependencies at module load time.
"""

from __future__ import annotations

from starlette.concurrency import run_in_threadpool

from backend.agent.registry import ToolContext, ToolDef, ToolResult


def _get_tts(cfg: dict):
    """Lazily import and return the active TTS adapter.

    The import is deferred to prevent circular imports between the agent
    package and the TTS package at module-load time.

    Args:
        cfg: Full application config dict.

    Returns:
        A TTS adapter instance from the TTS registry.
    """
    from backend.tts.registry import get_tts

    return get_tts(cfg)


async def _execute(args: dict, context: ToolContext) -> ToolResult:
    """Execute the generate_voice tool.

    Validates the input text, looks up the character's voice configuration,
    then runs the synchronous ``speak_cached()`` call in a thread pool so
    the event loop is not blocked.

    Args:
        args: Tool arguments.  Expects ``"text"`` (str, required).
        context: Execution context providing config, DB connection, and
            character ID for voice configuration lookup.

    Returns:
        A :class:`ToolResult` containing the audio file URL and cache
        status, or an error if TTS generation failed.

    Example:
        >>> # (requires a running TTS backend)
        >>> import asyncio
        >>> ctx = ToolContext(cfg={"tts": {"provider": "disabled"}},
        ...                   char_id=1, session_id=1)
        >>> result = asyncio.run(_execute({"text": ""}, ctx))
        >>> result.ok
        False
    """
    text = args.get("text", "")
    if not text:
        return ToolResult(ok=False, error="No text provided")

    tts = _get_tts(context.cfg)
    tts_cfg = dict(context.cfg.get("tts", {}))

    # Merge character-specific voice settings if available
    if context.db_conn is not None:
        try:
            row = context.db_conn.execute(
                "SELECT voice_config, voice_id, tts_provider "
                "FROM characters WHERE id=?",
                (context.char_id,),
            ).fetchone()
            if row and row[0]:
                import json

                char_voice = (
                    json.loads(row[0]) if isinstance(row[0], str) else row[0]
                )
                tts_cfg.update(char_voice)
            if row and row[1]:
                tts_cfg["voice_id"] = row[1]
            if row and row[2]:
                tts_cfg["provider"] = row[2]
        except Exception:
            pass  # Use defaults if lookup fails

    try:
        result = await run_in_threadpool(tts.speak_cached, text, tts_cfg)
    except Exception as exc:
        return ToolResult(ok=False, error=f"TTS generation failed: {exc}")

    if result.get("ok"):
        return ToolResult(
            ok=True,
            data={
                "url": f"/files/audio/{result['filename']}",
                "cached": result.get("cached", False),
            },
            display="text",
        )
    return ToolResult(
        ok=False, error=result.get("error", "Voice generation failed")
    )


voice_tool = ToolDef(
    name="generate_voice",
    description=(
        "Generate a voice audio clip of any text using your character "
        "voice. Returns a URL to the generated audio file."
    ),
    parameters={
        "type": "object",
        "properties": {
            "text": {
                "type": "string",
                "description": "Text to speak aloud.",
            },
        },
        "required": ["text"],
        "additionalProperties": False,
    },
    execute=_execute,
)
