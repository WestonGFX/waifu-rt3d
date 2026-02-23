"""Mood analysis tool for agentic characters.

Wraps the ``AdvancedSentimentAnalyzer`` to let a character introspect
on the emotional tone of any text passage.  The transformer model is
loaded lazily on first use, so the initial call may be slow (~2-3s).
"""

from __future__ import annotations

from starlette.concurrency import run_in_threadpool

from backend.agent.registry import ToolContext, ToolDef, ToolResult


async def _execute(args: dict, context: ToolContext) -> ToolResult:
    """Execute the analyze_mood tool.

    Validates the input text, loads the sentiment analyzer (deferred to
    avoid import-time model loading), and runs inference in a thread pool
    so the event loop is not blocked.

    Args:
        args: Tool arguments.  Expects ``"text"`` (str, required).
        context: Execution context (config is unused for this tool).

    Returns:
        A :class:`ToolResult` containing the detected emotion, intensity
        (0-1), optional secondary emotion, gesture hint, and the full
        emotion probability list.  Returns an error if the transformers
        library is not installed.

    Example:
        >>> # Requires transformers library
        >>> import asyncio
        >>> ctx = ToolContext(cfg={}, char_id=1, session_id=1)
        >>> result = asyncio.run(_execute({"text": ""}, ctx))
        >>> result.ok
        False
    """
    text = args.get("text", "")
    if not text:
        return ToolResult(ok=False, error="No text provided")

    try:
        from backend.emotion.advanced_sentiment import AdvancedSentimentAnalyzer
    except ImportError:
        return ToolResult(
            ok=False,
            data={},
            display="text",
            error="Mood analysis unavailable (transformers library not installed)",
        )

    try:
        analyzer = AdvancedSentimentAnalyzer(use_gpu=False)
        result = await run_in_threadpool(analyzer.analyze, text)
    except Exception as exc:
        return ToolResult(ok=False, error=f"Mood analysis failed: {exc}")

    return ToolResult(
        ok=True,
        data={
            "emotion": result["emotion"],
            "intensity": round(result["intensity"], 3),
            "secondary_emotion": result.get("secondary_emotion"),
            "gesture": result.get("gesture"),
            "all_emotions": result.get("all_emotions", []),
        },
        display="text",
    )


mood_tool = ToolDef(
    name="analyze_mood",
    description=(
        "Analyze the emotional tone of a text passage to understand "
        "feelings and mood. Returns the dominant emotion, intensity, "
        "and optional gesture hint."
    ),
    parameters={
        "type": "object",
        "properties": {
            "text": {
                "type": "string",
                "description": "Text to analyze for emotional content.",
            },
        },
        "required": ["text"],
        "additionalProperties": False,
    },
    execute=_execute,
)
