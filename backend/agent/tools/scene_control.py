"""Scene control tool for agentic characters.

Allows the character to change its expression, play an animation,
swap the background, or adjust lighting — all without external
dependencies.  The resulting commands are forwarded to the frontend
via the chat response payload.
"""

from __future__ import annotations

from backend.agent.registry import ToolContext, ToolDef, ToolResult

_EXPRESSIONS = [
    "neutral", "happy", "sad", "angry", "surprised", "relaxed", "fun",
]
_ANIMATIONS = [
    "idle", "wave", "dance", "nod", "shake_head", "think", "laugh", "cry",
    "bow", "jump",
]
_LIGHTING = ["default", "warm", "cool", "disco", "dramatic", "sunset"]


async def _execute(args: dict, context: ToolContext) -> ToolResult:
    """Execute the scene_control tool.

    Reads optional ``expression``, ``animation``, ``background``, and
    ``lighting`` keys from *args* and packages them into a commands dict
    that the frontend renderer consumes.

    Args:
        args: Tool arguments (all optional).
        context: Execution context (unused by this tool).

    Returns:
        A :class:`ToolResult` with ``display="scene_command"`` whose
        ``data["commands"]`` dict contains the requested changes.

    Example:
        >>> import asyncio
        >>> ctx = ToolContext(cfg={}, char_id=1, session_id=1)
        >>> result = asyncio.run(_execute({"expression": "happy"}, ctx))
        >>> result.data["commands"]["expression"]
        'happy'
    """
    commands: dict[str, str] = {}
    for key in ("expression", "animation", "background", "lighting"):
        value = args.get(key)
        if value:
            commands[key] = value
    return ToolResult(ok=True, data={"commands": commands}, display="scene_command")


scene_control_tool = ToolDef(
    name="scene_control",
    description=(
        "Change the 3D scene: set a facial expression, play an animation, "
        "swap the background image/color, or adjust lighting."
    ),
    parameters={
        "type": "object",
        "properties": {
            "expression": {
                "type": "string",
                "enum": _EXPRESSIONS,
                "description": "Facial expression to display.",
            },
            "animation": {
                "type": "string",
                "enum": _ANIMATIONS,
                "description": "Body animation to play.",
            },
            "background": {
                "type": "string",
                "description": "Background image URL or CSS color value.",
            },
            "lighting": {
                "type": "string",
                "enum": _LIGHTING,
                "description": "Lighting preset to apply.",
            },
        },
        "additionalProperties": False,
    },
    execute=_execute,
)
