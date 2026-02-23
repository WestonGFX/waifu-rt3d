"""XML tool prompt generator for local LLMs without native function calling.

Local models (e.g. llama.cpp, Ollama) typically lack a built-in tool-use
protocol.  This module renders tool definitions into an XML block that can
be injected into the system prompt so the model knows which tools exist and
how to invoke them.
"""

from __future__ import annotations

from typing import Any

from backend.agent.registry import ToolDef


def render_tool_prompt(tools: list[ToolDef]) -> str:
    """Render a list of tool definitions into an XML prompt block.

    Generates an ``<available_tools>`` XML section followed by usage
    instructions that teach the model how to emit ``<tool_call>`` tags.

    Args:
        tools: Tool definitions to include.  Each tool's ``parameters``
            dict should follow the JSON Schema / OpenAI function-calling
            format (with ``properties`` and optionally ``required`` keys).

    Returns:
        A multi-line string containing the XML tool block and usage
        instructions.  Returns an empty string when *tools* is empty.

    Example:
        >>> from backend.agent.registry import ToolDef, ToolResult
        >>> async def noop(args, ctx):
        ...     return ToolResult(ok=True)
        >>> td = ToolDef(
        ...     name="ping",
        ...     description="Health check",
        ...     parameters={
        ...         "type": "object",
        ...         "properties": {"host": {"type": "string"}},
        ...         "required": ["host"],
        ...     },
        ...     execute=noop,
        ... )
        >>> prompt = render_tool_prompt([td])
        >>> "<tool" in prompt and "ping" in prompt
        True
    """
    if not tools:
        return ""

    lines: list[str] = ["<available_tools>"]

    for tool in tools:
        lines.append(
            f'  <tool name="{_esc(tool.name)}" '
            f'description="{_esc(tool.description)}">'
        )
        _render_params(tool.parameters, lines)
        lines.append("  </tool>")

    lines.append("</available_tools>")
    lines.append("")
    lines.append("To use a tool, include this in your response:")
    lines.append('<tool_call name="TOOL_NAME">')
    lines.append('{"param1": "value1", "param2": "value2"}')
    lines.append("</tool_call>")
    lines.append("")
    lines.append(
        "You may include text before and after a tool call. "
        "Use at most one tool per response. After a tool call, "
        "you will receive the result and can continue responding."
    )

    return "\n".join(lines)


# ------------------------------------------------------------------
# Internal helpers
# ------------------------------------------------------------------

def _esc(value: str) -> str:
    """Escape XML-special characters in attribute values.

    Args:
        value: Raw string to escape.

    Returns:
        String safe for inclusion inside XML double-quoted attributes.
    """
    return (
        value
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


def _render_params(parameters: dict[str, Any], lines: list[str]) -> None:
    """Append ``<param>`` elements for each property in a JSON Schema.

    Args:
        parameters: JSON Schema dict (expects ``properties`` and
            optionally ``required`` keys).
        lines: Accumulator list that ``<param>`` lines are appended to.
    """
    properties: dict[str, Any] = parameters.get("properties", {})
    required_names: list[str] = parameters.get("required", [])

    for pname, schema in properties.items():
        attrs = _param_attrs(pname, schema, pname in required_names)
        desc = schema.get("description", "")
        if desc:
            lines.append(f"    <param {attrs}>{_esc(desc)}</param>")
        else:
            lines.append(f"    <param {attrs}></param>")


def _param_attrs(name: str, schema: dict[str, Any], required: bool) -> str:
    """Build the attribute string for a single ``<param>`` element.

    Args:
        name: Parameter name.
        schema: JSON Schema for this parameter.
        required: Whether the parameter is listed as required.

    Returns:
        A string of XML attributes like
        ``name="query" type="string" required="true"``.
    """
    parts: list[str] = [
        f'name="{_esc(name)}"',
        f'type="{_esc(schema.get("type", "string"))}"',
        f'required="{"true" if required else "false"}"',
    ]

    # Include default value when present
    if "default" in schema:
        parts.append(f'default="{_esc(str(schema["default"]))}"')

    # Render enum options as pipe-separated list
    if "enum" in schema:
        options = "|".join(str(v) for v in schema["enum"])
        parts.append(f'options="{_esc(options)}"')

    return " ".join(parts)
