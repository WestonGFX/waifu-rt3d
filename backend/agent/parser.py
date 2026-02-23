"""
Tool-call parser for agentic LLM output.

Extracts structured tool calls from either XML-tagged text output
or OpenAI-format native tool_calls, normalizing both into a common
``ToolCallParsed`` dataclass.
"""

from __future__ import annotations

import json
import re
import uuid
from dataclasses import dataclass, field
from typing import Any

# Matches <tool_call name="TOOL_NAME">...JSON...</tool_call> with DOTALL
_XML_TOOL_CALL_RE = re.compile(
    r'<tool_call\s+name="([^"]+)"\s*>(.*?)</tool_call>',
    re.DOTALL,
)


@dataclass
class ToolCallParsed:
    """A single parsed tool invocation extracted from LLM output.

    Attributes:
        id: Unique identifier with ``tc_`` prefix.
        name: Tool name extracted from the tag or native call.
        args: Parsed JSON arguments dict, or ``None`` on parse failure.
        text_before: Any plain text preceding this tool call in the output.
        text_after: Any plain text following this tool call in the output.
        parse_error: Human-readable error string if JSON parsing failed.
    """

    id: str = ""
    name: str = ""
    args: dict[str, Any] | None = None
    text_before: str = ""
    text_after: str = ""
    parse_error: str | None = None


def _make_tc_id() -> str:
    """Generate a unique ``tc_``-prefixed identifier."""
    return f"tc_{uuid.uuid4().hex[:12]}"


def parse_xml_tool_calls(text: str) -> list[ToolCallParsed]:
    """Extract tool calls from XML-tagged LLM text output.

    Scans *text* for ``<tool_call name="NAME">JSON</tool_call>`` blocks
    and returns a list of parsed results.  Text surrounding the tags is
    captured in ``text_before`` / ``text_after`` on the adjacent calls.

    Args:
        text: Raw LLM output that may contain zero or more XML tool-call
              blocks interspersed with plain text.

    Returns:
        List of ``ToolCallParsed`` instances in the order they appear.
        An empty list when no tool calls are found.

    Example:
        >>> calls = parse_xml_tool_calls(
        ...     'Hello! <tool_call name="greet">{"target": "world"}</tool_call> Done.'
        ... )
        >>> len(calls)
        1
        >>> calls[0].name
        'greet'
        >>> calls[0].args
        {'target': 'world'}
    """
    results: list[ToolCallParsed] = []
    last_end = 0

    for match in _XML_TOOL_CALL_RE.finditer(text):
        tool_name = match.group(1)
        raw_json = match.group(2).strip()

        before = text[last_end : match.start()]
        last_end = match.end()

        parsed_args: dict[str, Any] | None = None
        parse_error: str | None = None

        if raw_json:
            try:
                parsed_args = json.loads(raw_json)
            except (json.JSONDecodeError, ValueError) as exc:
                parse_error = str(exc)

        results.append(
            ToolCallParsed(
                id=_make_tc_id(),
                name=tool_name,
                args=parsed_args,
                text_before=before,
                parse_error=parse_error,
            )
        )

    # Attach trailing text to the last call's text_after
    if results:
        results[-1].text_after = text[last_end:]

    return results


def parse_native_tool_calls(tool_calls: list[dict]) -> list[ToolCallParsed]:
    """Convert OpenAI-format native tool calls to ``ToolCallParsed``.

    Args:
        tool_calls: List of dicts in the OpenAI chat-completion format::

                [{"id": "call_abc", "function": {"name": "greet",
                  "arguments": '{"target": "world"}'}}]

    Returns:
        List of ``ToolCallParsed`` instances.  The original ``id`` is
        preserved if present; otherwise a new ``tc_``-prefixed id is
        generated.

    Example:
        >>> native = [{"id": "call_1", "function": {"name": "say",
        ...            "arguments": '{"msg": "hi"}'}}]
        >>> calls = parse_native_tool_calls(native)
        >>> calls[0].name
        'say'
        >>> calls[0].args
        {'msg': 'hi'}
    """
    results: list[ToolCallParsed] = []

    for tc in tool_calls:
        func = tc.get("function", {})
        raw_args = func.get("arguments", "")

        parsed_args: dict[str, Any] | None = None
        parse_error: str | None = None

        if raw_args:
            try:
                parsed_args = json.loads(raw_args) if isinstance(raw_args, str) else raw_args
            except (json.JSONDecodeError, ValueError) as exc:
                parse_error = str(exc)

        results.append(
            ToolCallParsed(
                id=tc.get("id") or _make_tc_id(),
                name=func.get("name", ""),
                args=parsed_args,
                parse_error=parse_error,
            )
        )

    return results
