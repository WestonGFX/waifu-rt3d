"""Image generation tool for agentic characters.

Delegates to the existing ``backend.image_gen`` adapter system so the
character can create images during a conversation (e.g. "draw me a cat").
Uses a deferred import to avoid circular dependencies at module load time.
"""

from __future__ import annotations

from starlette.concurrency import run_in_threadpool

from backend.agent.registry import ToolContext, ToolDef, ToolResult


def _get_image_gen(cfg: dict):
    """Lazily import and return the active image generation adapter.

    The import is deferred to prevent circular imports between the agent
    package and the image_gen package at module-load time.

    Args:
        cfg: Full application config dict.

    Returns:
        An ``ImageGenAdapter`` instance from the image_gen registry.
    """
    from backend.image_gen.registry import get_image_gen
    return get_image_gen(cfg)


async def _execute(args: dict, context: ToolContext) -> ToolResult:
    """Execute the generate_image tool.

    Validates the prompt, checks adapter availability, then runs the
    synchronous ``generate()`` call in a thread pool so the event loop
    is not blocked.

    Args:
        args: Tool arguments.  Expects ``"prompt"`` (str, required).
        context: Execution context; ``context.cfg`` is forwarded to the
            image generation adapter.

    Returns:
        A :class:`ToolResult` with ``display="image"`` containing the
        generated image URL and filename, or an error if generation
        failed or is unavailable.

    Example:
        >>> # (requires a running image gen backend)
        >>> import asyncio
        >>> ctx = ToolContext(cfg={"image_gen": {"provider": "disabled"}},
        ...                   char_id=1, session_id=1)
        >>> result = asyncio.run(_execute({"prompt": "a cat"}, ctx))
        >>> result.ok
        False
    """
    prompt = args.get("prompt", "")
    if not prompt:
        return ToolResult(ok=False, error="No prompt provided")

    gen = _get_image_gen(context.cfg)
    if not gen.is_available():
        return ToolResult(
            ok=False,
            error="Image generation unavailable (provider offline)",
        )

    result = await run_in_threadpool(gen.generate, prompt, context.cfg)

    if result.get("ok"):
        return ToolResult(
            ok=True,
            data={"url": result["url"], "filename": result.get("filename", "")},
            display="image",
        )
    return ToolResult(ok=False, error=result.get("error", "Generation failed"))


image_gen_tool = ToolDef(
    name="generate_image",
    description=(
        "Generate an image from a text prompt using the configured image "
        "generation backend (ComfyUI, Easy Diffusion, etc.)."
    ),
    parameters={
        "type": "object",
        "properties": {
            "prompt": {
                "type": "string",
                "description": "Text description of the image to generate.",
            },
        },
        "required": ["prompt"],
        "additionalProperties": False,
    },
    execute=_execute,
)
