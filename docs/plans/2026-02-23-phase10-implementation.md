# Phase 10: Agentic Characters — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Give characters the ability to use tools (image gen, memory search, web search, scene control) during conversation, with a hybrid protocol supporting both native API tool-use and prompt-engineered XML fallback.

**Architecture:** New `backend/agent/` middleware layer with AgentRunner (agentic loop), ToolRegistry (tool definitions), parser (XML + native), and 4 tool implementations. The streaming chat endpoint conditionally routes through AgentRunner when `capability_profile.supports_tools` is true. Frontend gains tool card rendering in chat bubbles.

**Tech Stack:** Python 3.12, FastAPI, asyncio, httpx (web search), ChromaDB (memory), existing ComfyUI adapter (image gen), JavaScript (frontend SSE handling)

**Design doc:** `docs/plans/2026-02-23-phase10-agentic-characters-design.md`

---

## Task 1: ToolRegistry + ToolDef data classes

**Files:**
- Create: `backend/agent/__init__.py`
- Create: `backend/agent/registry.py`
- Test: `backend/tests/test_agent_registry.py`

**Step 1: Write the failing test**

```python
# backend/tests/test_agent_registry.py
"""Tests for the agent tool registry."""

import pytest
from backend.agent.registry import ToolRegistry, ToolDef, ToolResult, ToolContext


class TestToolDef:
    """Test ToolDef data class."""

    def test_tool_def_creation(self):
        """ToolDef stores name, description, parameters, and executor."""
        async def dummy_exec(args, ctx):
            return ToolResult(ok=True, data={"test": 1}, display="text")

        tool = ToolDef(
            name="test_tool",
            description="A test tool",
            parameters={
                "type": "object",
                "properties": {"query": {"type": "string"}},
                "required": ["query"],
            },
            execute=dummy_exec,
        )
        assert tool.name == "test_tool"
        assert tool.description == "A test tool"
        assert "query" in tool.parameters["properties"]

    def test_tool_result_ok(self):
        """ToolResult with ok=True carries data and display type."""
        result = ToolResult(ok=True, data={"url": "/img.png"}, display="image")
        assert result.ok is True
        assert result.data["url"] == "/img.png"
        assert result.display == "image"
        assert result.error is None

    def test_tool_result_error(self):
        """ToolResult with ok=False carries error message."""
        result = ToolResult(ok=False, data={}, display="text", error="Timeout")
        assert result.ok is False
        assert result.error == "Timeout"


class TestToolRegistry:
    """Test tool registration and schema generation."""

    @pytest.fixture()
    def registry(self):
        return ToolRegistry()

    @pytest.fixture()
    def sample_tool(self):
        async def exec_fn(args, ctx):
            return ToolResult(ok=True, data={}, display="text")

        return ToolDef(
            name="greet",
            description="Say hello",
            parameters={
                "type": "object",
                "properties": {"name": {"type": "string", "description": "Name"}},
                "required": ["name"],
            },
            execute=exec_fn,
        )

    def test_register_and_get(self, registry, sample_tool):
        """Registered tools are retrievable by name."""
        registry.register(sample_tool)
        assert registry.get_tool("greet") is sample_tool
        assert registry.get_tool("nonexistent") is None

    def test_get_schemas_openai_format(self, registry, sample_tool):
        """get_schemas() returns OpenAI-compatible function schemas."""
        registry.register(sample_tool)
        schemas = registry.get_schemas()
        assert len(schemas) == 1
        assert schemas[0]["type"] == "function"
        assert schemas[0]["function"]["name"] == "greet"
        assert schemas[0]["function"]["description"] == "Say hello"
        assert "name" in schemas[0]["function"]["parameters"]["properties"]

    def test_all_tools_list(self, registry, sample_tool):
        """all_tools() returns list of all registered ToolDefs."""
        registry.register(sample_tool)
        tools = registry.all_tools()
        assert len(tools) == 1
        assert tools[0].name == "greet"

    def test_duplicate_register_overwrites(self, registry, sample_tool):
        """Registering a tool with the same name overwrites the previous one."""
        registry.register(sample_tool)
        new_tool = ToolDef(
            name="greet",
            description="Updated greeting",
            parameters=sample_tool.parameters,
            execute=sample_tool.execute,
        )
        registry.register(new_tool)
        assert registry.get_tool("greet").description == "Updated greeting"
        assert len(registry.all_tools()) == 1
```

**Step 2: Run test to verify it fails**

Run: `python -m pytest backend/tests/test_agent_registry.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'backend.agent'`

**Step 3: Write minimal implementation**

```python
# backend/agent/__init__.py
"""Phase 10: Agentic Characters — tool-use middleware.

This package provides the agentic loop that sits between the chat endpoint
and LLM adapters, enabling characters to use tools during conversation.

Exports:
    ToolRegistry: Registry of available tools with JSON schemas.
    ToolDef: Definition for a single tool.
    ToolResult: Result from executing a tool.
    ToolContext: Execution context passed to tool executors.
    AgentRunner: The agentic loop orchestrator (added in Task 4).
"""

from backend.agent.registry import ToolRegistry, ToolDef, ToolResult, ToolContext

__all__ = ["ToolRegistry", "ToolDef", "ToolResult", "ToolContext"]
```

```python
# backend/agent/registry.py
"""Tool registry and data classes for the agent system.

Provides the core types (ToolDef, ToolResult, ToolContext) and the
ToolRegistry that manages tool definitions and generates schemas for
both native API tool-use and prompt-engineered XML fallback.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable, Optional


@dataclass
class ToolResult:
    """Result from executing a tool.

    Args:
        ok: Whether the tool executed successfully.
        data: Tool-specific result payload (e.g. {"url": "..."}).
        display: How the frontend should render this result.
            One of: "image", "text", "list", "scene_command".
        error: Error message if ok is False.
    """

    ok: bool
    data: dict = field(default_factory=dict)
    display: str = "text"
    error: Optional[str] = None


@dataclass
class ToolContext:
    """Execution context passed to every tool executor.

    Args:
        cfg: Full app config dict.
        char_id: Current character ID.
        session_id: Current session ID.
        db_conn: Open SQLite connection.
        vector_store: ChromaDB VectorStore instance (may be None).
    """

    cfg: dict
    char_id: int
    session_id: int
    db_conn: Any = None
    vector_store: Any = None


@dataclass
class ToolDef:
    """Definition for a single tool.

    Args:
        name: Unique tool identifier (e.g. "generate_image").
        description: Human-readable description for the LLM.
        parameters: JSON Schema dict describing the tool's arguments.
        execute: Async callable ``(args: dict, context: ToolContext) -> ToolResult``.
    """

    name: str
    description: str
    parameters: dict
    execute: Callable


class ToolRegistry:
    """Registry of available tools with JSON schema definitions.

    Manages tool registration and produces schemas in both OpenAI API
    format (for native tool-use) and XML format (for prompt-engineered
    fallback with local models).

    Example:
        >>> registry = ToolRegistry()
        >>> registry.register(my_tool)
        >>> schemas = registry.get_schemas()  # OpenAI format
    """

    def __init__(self) -> None:
        self._tools: dict[str, ToolDef] = {}

    def register(self, tool: ToolDef) -> None:
        """Register a tool definition.

        Args:
            tool: ToolDef to register. Overwrites if name already exists.
        """
        self._tools[tool.name] = tool

    def get_tool(self, name: str) -> Optional[ToolDef]:
        """Look up a tool by name.

        Args:
            name: Tool identifier string.

        Returns:
            ToolDef if found, None otherwise.
        """
        return self._tools.get(name)

    def all_tools(self) -> list[ToolDef]:
        """Return all registered tools.

        Returns:
            List of ToolDef instances in registration order.
        """
        return list(self._tools.values())

    def get_schemas(self) -> list[dict]:
        """Generate OpenAI-compatible function schemas for all tools.

        Returns:
            List of tool schema dicts in OpenAI API format::

                [{"type": "function", "function": {"name": ..., "description": ..., "parameters": ...}}]
        """
        return [
            {
                "type": "function",
                "function": {
                    "name": t.name,
                    "description": t.description,
                    "parameters": t.parameters,
                },
            }
            for t in self._tools.values()
        ]
```

**Step 4: Run test to verify it passes**

Run: `python -m pytest backend/tests/test_agent_registry.py -v`
Expected: 7 passed

**Step 5: Commit**

```bash
git add backend/agent/__init__.py backend/agent/registry.py backend/tests/test_agent_registry.py
git commit -m "feat(agent): add ToolRegistry, ToolDef, ToolResult data classes"
```

---

## Task 2: XML parser — extract tool calls from LLM text

**Files:**
- Create: `backend/agent/parser.py`
- Test: `backend/tests/test_agent_parser.py`

**Step 1: Write the failing test**

```python
# backend/tests/test_agent_parser.py
"""Tests for agent tool-call parser (XML extraction from LLM text)."""

import pytest
from backend.agent.parser import parse_xml_tool_calls, ToolCallParsed


class TestParseXmlToolCalls:
    """Test XML tool call extraction from LLM output text."""

    def test_single_tool_call(self):
        """Extract a single tool call from text."""
        text = 'Let me search for that!\n<tool_call name="web_search">\n{"query": "anime conventions 2026"}\n</tool_call>'
        calls = parse_xml_tool_calls(text)
        assert len(calls) == 1
        assert calls[0].name == "web_search"
        assert calls[0].args == {"query": "anime conventions 2026"}

    def test_text_before_and_after(self):
        """Tool call with surrounding text preserves the text_before."""
        text = 'Sure! Let me draw that.\n<tool_call name="generate_image">\n{"prompt": "cat"}\n</tool_call>\nHope you like it!'
        calls = parse_xml_tool_calls(text)
        assert len(calls) == 1
        assert calls[0].name == "generate_image"
        assert calls[0].text_before.strip() == "Sure! Let me draw that."
        assert calls[0].text_after.strip() == "Hope you like it!"

    def test_no_tool_call(self):
        """Plain text without tool calls returns empty list."""
        text = "Just a normal response without any tools."
        calls = parse_xml_tool_calls(text)
        assert len(calls) == 0

    def test_malformed_json_in_tool_call(self):
        """Malformed JSON inside tool_call returns error in parsed result."""
        text = '<tool_call name="web_search">\n{not valid json}\n</tool_call>'
        calls = parse_xml_tool_calls(text)
        assert len(calls) == 1
        assert calls[0].name == "web_search"
        assert calls[0].args is None
        assert calls[0].parse_error is not None

    def test_multiple_tool_calls(self):
        """Multiple tool calls in one response are all extracted."""
        text = (
            '<tool_call name="web_search">\n{"query": "test"}\n</tool_call>\n'
            'Found it!\n'
            '<tool_call name="generate_image">\n{"prompt": "result"}\n</tool_call>'
        )
        calls = parse_xml_tool_calls(text)
        assert len(calls) == 2
        assert calls[0].name == "web_search"
        assert calls[1].name == "generate_image"

    def test_whitespace_variations(self):
        """Parser handles various whitespace patterns around tags."""
        text = '  <tool_call  name="greet" >\n  {"name": "World"}  \n  </tool_call>  '
        calls = parse_xml_tool_calls(text)
        assert len(calls) == 1
        assert calls[0].args == {"name": "World"}

    def test_tool_call_id_generated(self):
        """Each parsed tool call gets a unique ID."""
        text = '<tool_call name="a">\n{"x": 1}\n</tool_call>\n<tool_call name="b">\n{"y": 2}\n</tool_call>'
        calls = parse_xml_tool_calls(text)
        assert calls[0].id != calls[1].id
        assert calls[0].id.startswith("tc_")
```

**Step 2: Run test to verify it fails**

Run: `python -m pytest backend/tests/test_agent_parser.py -v`
Expected: FAIL with `ModuleNotFoundError`

**Step 3: Write minimal implementation**

```python
# backend/agent/parser.py
"""Parse tool calls from LLM output text.

Supports two modes:
1. XML extraction — parse ``<tool_call name="...">...</tool_call>`` blocks
   from the LLM's text output (used with local models that don't support
   native function calling).
2. Native extraction — convert OpenAI/Anthropic structured tool_calls into
   the same ToolCallParsed format (used with API providers).
"""

from __future__ import annotations

import json
import re
import uuid
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class ToolCallParsed:
    """A parsed tool call extracted from LLM output.

    Args:
        id: Unique call identifier (e.g. "tc_a1b2c3").
        name: Tool name (e.g. "generate_image").
        args: Parsed JSON arguments dict, or None if JSON was malformed.
        text_before: Any text the LLM wrote before this tool call.
        text_after: Any text after the closing tag (may be empty).
        parse_error: Error message if JSON parsing failed.
    """

    id: str = ""
    name: str = ""
    args: Optional[dict] = None
    text_before: str = ""
    text_after: str = ""
    parse_error: Optional[str] = None


# Regex to match <tool_call name="...">...JSON...</tool_call>
_TOOL_CALL_RE = re.compile(
    r'<tool_call\s+name="([^"]+)"\s*>(.*?)</tool_call>',
    re.DOTALL,
)


def _make_id() -> str:
    """Generate a short unique tool call ID."""
    return f"tc_{uuid.uuid4().hex[:8]}"


def parse_xml_tool_calls(text: str) -> list[ToolCallParsed]:
    """Extract tool calls from LLM text containing XML tool_call blocks.

    Args:
        text: Raw LLM output text that may contain ``<tool_call>`` blocks.

    Returns:
        List of ToolCallParsed, one per ``<tool_call>`` found. Empty if none.

    Example:
        >>> calls = parse_xml_tool_calls('Hello!\\n<tool_call name="greet">\\n{"name": "World"}\\n</tool_call>')
        >>> calls[0].name
        'greet'
        >>> calls[0].args
        {'name': 'World'}
    """
    results: list[ToolCallParsed] = []
    last_end = 0

    for match in _TOOL_CALL_RE.finditer(text):
        tool_name = match.group(1)
        raw_json = match.group(2).strip()

        text_before = text[last_end:match.start()]
        last_end = match.end()

        args = None
        parse_error = None
        try:
            args = json.loads(raw_json)
        except (json.JSONDecodeError, TypeError) as e:
            parse_error = str(e)

        results.append(ToolCallParsed(
            id=_make_id(),
            name=tool_name,
            args=args,
            text_before=text_before,
            parse_error=parse_error,
        ))

    # Set text_after on the last call
    if results:
        results[-1].text_after = text[last_end:]

    return results


def parse_native_tool_calls(tool_calls: list[dict]) -> list[ToolCallParsed]:
    """Convert OpenAI-format native tool calls to ToolCallParsed.

    Args:
        tool_calls: List of tool call dicts from the API response, each with
            ``{"id": "...", "function": {"name": "...", "arguments": "..."}}``

    Returns:
        List of ToolCallParsed.
    """
    results: list[ToolCallParsed] = []
    for tc in tool_calls:
        func = tc.get("function", {})
        raw_args = func.get("arguments", "{}")
        args = None
        parse_error = None
        try:
            args = json.loads(raw_args) if isinstance(raw_args, str) else raw_args
        except (json.JSONDecodeError, TypeError) as e:
            parse_error = str(e)

        results.append(ToolCallParsed(
            id=tc.get("id", _make_id()),
            name=func.get("name", ""),
            args=args,
            parse_error=parse_error,
        ))
    return results
```

**Step 4: Run test to verify it passes**

Run: `python -m pytest backend/tests/test_agent_parser.py -v`
Expected: 7 passed

**Step 5: Commit**

```bash
git add backend/agent/parser.py backend/tests/test_agent_parser.py
git commit -m "feat(agent): add XML tool-call parser with native fallback"
```

---

## Task 3: XML prompt generator

**Files:**
- Create: `backend/agent/prompt.py`
- Test: `backend/tests/test_agent_prompt.py`

**Step 1: Write the failing test**

```python
# backend/tests/test_agent_prompt.py
"""Tests for agent XML prompt generation."""

import pytest
from backend.agent.registry import ToolRegistry, ToolDef, ToolResult
from backend.agent.prompt import render_tool_prompt


class TestRenderToolPrompt:
    """Test XML tool prompt generation for local models."""

    @pytest.fixture()
    def registry_with_tools(self):
        registry = ToolRegistry()

        async def noop(args, ctx):
            return ToolResult(ok=True, data={}, display="text")

        registry.register(ToolDef(
            name="web_search",
            description="Search the internet",
            parameters={
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Search query"},
                    "max_results": {"type": "integer", "default": 3},
                },
                "required": ["query"],
            },
            execute=noop,
        ))
        registry.register(ToolDef(
            name="generate_image",
            description="Generate an image",
            parameters={
                "type": "object",
                "properties": {
                    "prompt": {"type": "string", "description": "Image description"},
                },
                "required": ["prompt"],
            },
            execute=noop,
        ))
        return registry

    def test_prompt_contains_tool_names(self, registry_with_tools):
        """Generated prompt includes all registered tool names."""
        prompt = render_tool_prompt(registry_with_tools.all_tools())
        assert "web_search" in prompt
        assert "generate_image" in prompt

    def test_prompt_contains_descriptions(self, registry_with_tools):
        """Generated prompt includes tool descriptions."""
        prompt = render_tool_prompt(registry_with_tools.all_tools())
        assert "Search the internet" in prompt
        assert "Generate an image" in prompt

    def test_prompt_contains_parameters(self, registry_with_tools):
        """Generated prompt includes parameter names and types."""
        prompt = render_tool_prompt(registry_with_tools.all_tools())
        assert "query" in prompt
        assert "string" in prompt

    def test_prompt_contains_usage_instructions(self, registry_with_tools):
        """Generated prompt includes the <tool_call> usage example."""
        prompt = render_tool_prompt(registry_with_tools.all_tools())
        assert "<tool_call" in prompt
        assert "</tool_call>" in prompt

    def test_empty_registry(self):
        """Empty tool list returns empty string."""
        prompt = render_tool_prompt([])
        assert prompt == ""
```

**Step 2: Run test to verify it fails**

Run: `python -m pytest backend/tests/test_agent_prompt.py -v`
Expected: FAIL

**Step 3: Write minimal implementation**

```python
# backend/agent/prompt.py
"""Generate XML tool definition prompts for local models.

When the LLM adapter doesn't support native function calling, the agent
runner injects this XML block into the system prompt so the model knows
what tools are available and how to invoke them.
"""

from __future__ import annotations

from backend.agent.registry import ToolDef


def render_tool_prompt(tools: list[ToolDef]) -> str:
    """Render an XML tool definition block for prompt injection.

    Args:
        tools: List of ToolDef instances to include in the prompt.

    Returns:
        XML string to append to the system prompt, or empty string if
        no tools are provided.

    Example:
        >>> prompt = render_tool_prompt([my_tool])
        >>> assert '<available_tools>' in prompt
    """
    if not tools:
        return ""

    tool_blocks = []
    for t in tools:
        params = t.parameters.get("properties", {})
        required = set(t.parameters.get("required", []))

        param_lines = []
        for pname, pspec in params.items():
            ptype = pspec.get("type", "string")
            pdesc = pspec.get("description", "")
            is_req = pname in required
            default = pspec.get("default")

            attrs = f'name="{pname}" type="{ptype}" required="{str(is_req).lower()}"'
            if default is not None:
                attrs += f' default="{default}"'
            if pspec.get("enum"):
                attrs += f' options="{"|".join(str(e) for e in pspec["enum"])}"'

            param_lines.append(f"    <param {attrs}>{pdesc}</param>")

        params_xml = "\n".join(param_lines)
        tool_blocks.append(
            f'  <tool name="{t.name}" description="{t.description}">\n'
            f"{params_xml}\n"
            f"  </tool>"
        )

    tools_xml = "\n".join(tool_blocks)

    return (
        "\n\n<available_tools>\n"
        f"{tools_xml}\n"
        "</available_tools>\n\n"
        "To use a tool, include this in your response:\n"
        '<tool_call name="TOOL_NAME">\n'
        '{"param1": "value1", "param2": "value2"}\n'
        "</tool_call>\n\n"
        "You may include text before and after a tool call. "
        "Use at most one tool per response. "
        "After a tool call, you will receive the result and can continue responding."
    )
```

**Step 4: Run test to verify it passes**

Run: `python -m pytest backend/tests/test_agent_prompt.py -v`
Expected: 5 passed

**Step 5: Commit**

```bash
git add backend/agent/prompt.py backend/tests/test_agent_prompt.py
git commit -m "feat(agent): add XML tool prompt generator for local models"
```

---

## Task 4: AgentRunner — the agentic loop

**Files:**
- Create: `backend/agent/runner.py`
- Modify: `backend/agent/__init__.py` (add AgentRunner export)
- Test: `backend/tests/test_agent_runner.py`

**Step 1: Write the failing test**

```python
# backend/tests/test_agent_runner.py
"""Tests for the AgentRunner agentic loop."""

import asyncio
import pytest
from backend.agent.registry import ToolRegistry, ToolDef, ToolResult, ToolContext
from backend.agent.runner import AgentRunner


class MockAdapter:
    """Mock LLM adapter that returns pre-configured responses."""

    def __init__(self, responses):
        """Args: responses — list of strings to yield in sequence per call."""
        self._responses = list(responses)
        self._call_count = 0

    def supports_tools(self):
        return False

    def chat_stream(self, messages, model, endpoint, api_key, **kw):
        idx = min(self._call_count, len(self._responses) - 1)
        self._call_count += 1
        for char in self._responses[idx]:
            yield char


class MockNativeAdapter:
    """Mock adapter that supports native tool-use."""

    def __init__(self, responses):
        self._responses = list(responses)
        self._call_count = 0

    def supports_tools(self):
        return True

    def chat_stream(self, messages, model, endpoint, api_key, **kw):
        idx = min(self._call_count, len(self._responses) - 1)
        self._call_count += 1
        resp = self._responses[idx]
        if isinstance(resp, dict):
            # Native tool call
            yield resp
        else:
            for char in resp:
                yield char


async def _collect_events(runner, messages, adapter, cfg, tools, context):
    """Helper to collect all events from runner.run_stream()."""
    events = []
    async for event in runner.run_stream(messages, adapter, cfg, tools, context=context):
        events.append(event)
    return events


@pytest.fixture()
def simple_registry():
    registry = ToolRegistry()

    async def echo_tool(args, ctx):
        return ToolResult(ok=True, data={"echo": args.get("text", "")}, display="text")

    registry.register(ToolDef(
        name="echo",
        description="Echo back text",
        parameters={
            "type": "object",
            "properties": {"text": {"type": "string"}},
            "required": ["text"],
        },
        execute=echo_tool,
    ))
    return registry


@pytest.fixture()
def context():
    return ToolContext(cfg={"llm": {"model": "test", "endpoint": "http://test", "api_key": "k"}},
                       char_id=1, session_id=1)


class TestAgentRunnerNoTools:
    """Test runner behavior when LLM doesn't call any tools."""

    @pytest.mark.asyncio
    async def test_plain_text_response(self, simple_registry, context):
        """LLM returns plain text → tokens streamed, no tool events."""
        adapter = MockAdapter(["Hello world!"])
        runner = AgentRunner(simple_registry, max_rounds=3)
        events = await _collect_events(
            runner,
            [{"role": "user", "content": "Hi"}],
            adapter, context.cfg,
            simple_registry.all_tools(),
            context,
        )
        token_events = [e for e in events if e["event"] == "token"]
        tool_events = [e for e in events if e["event"] == "tool_call"]
        assert len(token_events) > 0
        assert len(tool_events) == 0
        # Reconstruct full text from tokens
        full_text = "".join(e["data"]["t"] for e in token_events)
        assert "Hello world!" in full_text


class TestAgentRunnerWithToolCall:
    """Test runner behavior when LLM invokes a tool via XML."""

    @pytest.mark.asyncio
    async def test_xml_tool_call_executes(self, simple_registry, context):
        """LLM emits XML tool_call → tool executes → result emitted."""
        adapter = MockAdapter([
            'Let me echo that.\n<tool_call name="echo">\n{"text": "hello"}\n</tool_call>',
            "Done! I echoed it.",
        ])
        runner = AgentRunner(simple_registry, max_rounds=3)
        events = await _collect_events(
            runner,
            [{"role": "user", "content": "echo hello"}],
            adapter, context.cfg,
            simple_registry.all_tools(),
            context,
        )
        tool_call_events = [e for e in events if e["event"] == "tool_call"]
        tool_result_events = [e for e in events if e["event"] == "tool_result"]
        assert len(tool_call_events) == 1
        assert tool_call_events[0]["data"]["name"] == "echo"
        assert len(tool_result_events) == 1
        assert tool_result_events[0]["data"]["ok"] is True
        assert tool_result_events[0]["data"]["data"]["echo"] == "hello"

    @pytest.mark.asyncio
    async def test_max_rounds_enforced(self, simple_registry, context):
        """Runner stops after max_rounds even if LLM keeps calling tools."""
        # Every response calls a tool — should stop after 2 rounds
        adapter = MockAdapter([
            '<tool_call name="echo">\n{"text": "1"}\n</tool_call>',
            '<tool_call name="echo">\n{"text": "2"}\n</tool_call>',
            '<tool_call name="echo">\n{"text": "3"}\n</tool_call>',
        ])
        runner = AgentRunner(simple_registry, max_rounds=2)
        events = await _collect_events(
            runner,
            [{"role": "user", "content": "loop"}],
            adapter, context.cfg,
            simple_registry.all_tools(),
            context,
        )
        tool_call_events = [e for e in events if e["event"] == "tool_call"]
        # Should have at most 2 tool calls (max_rounds=2)
        assert len(tool_call_events) <= 2

    @pytest.mark.asyncio
    async def test_text_before_tool_call_is_streamed(self, simple_registry, context):
        """Text before XML tool_call is streamed as token events."""
        adapter = MockAdapter([
            'Thinking about it...\n<tool_call name="echo">\n{"text": "x"}\n</tool_call>',
            "All done.",
        ])
        runner = AgentRunner(simple_registry, max_rounds=3)
        events = await _collect_events(
            runner,
            [{"role": "user", "content": "test"}],
            adapter, context.cfg,
            simple_registry.all_tools(),
            context,
        )
        token_events = [e for e in events if e["event"] == "token"]
        all_text = "".join(e["data"]["t"] for e in token_events)
        assert "Thinking about it..." in all_text
```

**Step 2: Run test to verify it fails**

Run: `python -m pytest backend/tests/test_agent_runner.py -v`
Expected: FAIL with `ModuleNotFoundError`

**Step 3: Write minimal implementation**

```python
# backend/agent/runner.py
"""AgentRunner — the agentic tool-use loop.

Sits between the chat endpoint and LLM adapter. For each user message:
1. Calls the LLM (streaming)
2. Detects tool calls in the response (XML or native)
3. Executes tools and feeds results back to the LLM
4. Repeats up to max_rounds times

Yields SSE-ready event dicts that the chat endpoint formats as SSE lines.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from typing import AsyncGenerator, Optional

from starlette.concurrency import run_in_threadpool

from backend.agent.parser import parse_xml_tool_calls, parse_native_tool_calls
from backend.agent.prompt import render_tool_prompt
from backend.agent.registry import ToolContext, ToolDef, ToolRegistry, ToolResult

logger = logging.getLogger("waifu.agent.runner")


class AgentRunner:
    """Orchestrates the agentic tool-use loop.

    Yields SSE event dicts with ``{"event": str, "data": dict}`` that the
    caller formats into Server-Sent Events for the frontend.

    Args:
        registry: ToolRegistry with available tools.
        max_rounds: Maximum tool-call iterations per user message (default 3).

    Example:
        >>> runner = AgentRunner(registry, max_rounds=3)
        >>> async for event in runner.run_stream(messages, adapter, cfg, tools, context=ctx):
        ...     yield format_sse(event["event"], event["data"])
    """

    def __init__(self, registry: ToolRegistry, max_rounds: int = 3) -> None:
        self.registry = registry
        self.max_rounds = max_rounds

    async def run_stream(
        self,
        messages: list[dict],
        adapter,
        cfg: dict,
        tools: list[ToolDef],
        context: Optional[ToolContext] = None,
        **llm_kwargs,
    ) -> AsyncGenerator[dict, None]:
        """Run the agentic loop, yielding SSE event dicts.

        Args:
            messages: Chat message history (system + user + assistant).
            adapter: LLM adapter instance with ``chat_stream()``.
            cfg: App config dict (contains llm.model, llm.endpoint, etc.).
            tools: List of ToolDef available to the character.
            context: ToolContext for tool execution.
            **llm_kwargs: Extra kwargs passed to ``adapter.chat_stream()``.

        Yields:
            dict: ``{"event": "token"|"tool_call"|"tool_result", "data": {...}}``
        """
        use_native = hasattr(adapter, "supports_tools") and adapter.supports_tools()
        working_messages = list(messages)  # Don't mutate caller's list

        for round_num in range(self.max_rounds):
            # For XML fallback: inject tool prompt into system message
            call_messages = working_messages
            if not use_native and tools:
                call_messages = self._inject_tool_prompt(working_messages, tools)

            # Stream LLM response, collecting full text
            full_text = ""
            tool_calls_native = []

            llm_model = cfg.get("llm", {}).get("model", "")
            llm_endpoint = cfg.get("llm", {}).get("endpoint", "")
            llm_api_key = cfg.get("llm", {}).get("api_key", "")

            # Build kwargs for adapter
            stream_kwargs = dict(llm_kwargs)
            if use_native and tools:
                stream_kwargs["tools"] = self.registry.get_schemas()

            # Run sync generator in thread
            tokens = await run_in_threadpool(
                lambda: list(adapter.chat_stream(
                    call_messages, llm_model, llm_endpoint, llm_api_key,
                    **stream_kwargs,
                ))
            )

            for token in tokens:
                if isinstance(token, dict) and token.get("type") == "tool_call":
                    # Native tool call from adapter
                    tool_calls_native.append(token)
                elif isinstance(token, str):
                    full_text += token

            # Parse tool calls
            if tool_calls_native:
                parsed_calls = parse_native_tool_calls(tool_calls_native)
            else:
                parsed_calls = parse_xml_tool_calls(full_text)

            if not parsed_calls:
                # No tool calls — stream all tokens and finish
                for char in full_text:
                    yield {"event": "token", "data": {"t": char}}
                break

            # We have tool call(s) — process the first one
            call = parsed_calls[0]

            # Stream any text before the tool call
            if call.text_before.strip():
                yield {"event": "token", "data": {"t": call.text_before}}

            # Emit tool_call event
            yield {
                "event": "tool_call",
                "data": {
                    "id": call.id,
                    "name": call.name,
                    "args": call.args or {},
                },
            }

            # Execute the tool
            tool_def = self.registry.get_tool(call.name)
            if tool_def and call.args is not None:
                try:
                    start_time = time.time()
                    result = await tool_def.execute(call.args, context)
                    elapsed = round(time.time() - start_time, 2)
                except Exception as e:
                    logger.error(f"[Agent] Tool '{call.name}' failed: {e}")
                    result = ToolResult(ok=False, data={}, display="text", error=str(e))
                    elapsed = 0
            else:
                error_msg = call.parse_error or f"Unknown tool: {call.name}"
                result = ToolResult(ok=False, data={}, display="text", error=error_msg)
                elapsed = 0

            # Emit tool_result event
            yield {
                "event": "tool_result",
                "data": {
                    "id": call.id,
                    "ok": result.ok,
                    "display": result.display,
                    "data": result.data,
                    "error": result.error,
                    "elapsed": elapsed,
                },
            }

            # Append tool call + result to message history for next round
            working_messages.append({
                "role": "assistant",
                "content": full_text if full_text else f"[Used tool: {call.name}]",
            })
            result_summary = json.dumps(result.data) if result.ok else f"Error: {result.error}"
            working_messages.append({
                "role": "user",
                "content": f"<tool_result name=\"{call.name}\">\n{result_summary}\n</tool_result>",
            })
        else:
            # max_rounds exhausted — the last round's text was already streamed
            # or the loop ended with a tool call (text was streamed above)
            pass

    def _inject_tool_prompt(
        self, messages: list[dict], tools: list[ToolDef]
    ) -> list[dict]:
        """Clone messages and append tool prompt to the system message.

        Args:
            messages: Original message list.
            tools: Tools to include in the prompt.

        Returns:
            New message list with tool prompt injected into system message.
        """
        result = []
        for msg in messages:
            if msg["role"] == "system":
                tool_prompt = render_tool_prompt(tools)
                result.append({
                    "role": "system",
                    "content": msg["content"] + tool_prompt,
                })
            else:
                result.append(msg)
        return result
```

Update `__init__.py`:

```python
# Add to backend/agent/__init__.py
from backend.agent.runner import AgentRunner

__all__ = ["ToolRegistry", "ToolDef", "ToolResult", "ToolContext", "AgentRunner"]
```

**Step 4: Run test to verify it passes**

Run: `pip install pytest-asyncio && python -m pytest backend/tests/test_agent_runner.py -v`
Expected: 4 passed

**Step 5: Commit**

```bash
git add backend/agent/runner.py backend/agent/__init__.py backend/tests/test_agent_runner.py
git commit -m "feat(agent): add AgentRunner agentic loop with XML + native support"
```

---

## Task 5: Implement 4 core tools

**Files:**
- Create: `backend/agent/tools/__init__.py`
- Create: `backend/agent/tools/image_gen.py`
- Create: `backend/agent/tools/memory.py`
- Create: `backend/agent/tools/web_search.py`
- Create: `backend/agent/tools/scene_control.py`
- Test: `backend/tests/test_agent_tools.py`

**Step 1: Write the failing test**

```python
# backend/tests/test_agent_tools.py
"""Tests for the 4 core agent tools."""

import pytest
from unittest.mock import MagicMock, AsyncMock, patch
from backend.agent.registry import ToolContext, ToolResult
from backend.agent.tools import get_default_registry
from backend.agent.tools.image_gen import image_gen_tool
from backend.agent.tools.memory import memory_search_tool
from backend.agent.tools.web_search import web_search_tool
from backend.agent.tools.scene_control import scene_control_tool


@pytest.fixture()
def context():
    return ToolContext(
        cfg={"image_gen": {"provider": "comfyui", "endpoint": "http://localhost:8188"}},
        char_id=1,
        session_id=1,
        db_conn=MagicMock(),
        vector_store=MagicMock(),
    )


class TestDefaultRegistry:
    """Test that all 4 tools are auto-registered."""

    def test_registry_has_all_tools(self):
        registry = get_default_registry()
        assert registry.get_tool("generate_image") is not None
        assert registry.get_tool("search_memory") is not None
        assert registry.get_tool("web_search") is not None
        assert registry.get_tool("set_scene") is not None

    def test_registry_schemas_are_valid(self):
        registry = get_default_registry()
        schemas = registry.get_schemas()
        assert len(schemas) == 4
        for s in schemas:
            assert s["type"] == "function"
            assert "name" in s["function"]
            assert "parameters" in s["function"]


class TestSceneControlTool:
    """Test set_scene tool (no external dependencies)."""

    @pytest.mark.asyncio
    async def test_set_expression(self, context):
        result = await scene_control_tool.execute(
            {"expression": "happy"}, context
        )
        assert result.ok is True
        assert result.display == "scene_command"
        assert result.data["commands"]["expression"] == "happy"

    @pytest.mark.asyncio
    async def test_set_multiple(self, context):
        result = await scene_control_tool.execute(
            {"expression": "thinking", "animation": "think", "lighting": "warm"},
            context,
        )
        assert result.data["commands"]["expression"] == "thinking"
        assert result.data["commands"]["animation"] == "think"
        assert result.data["commands"]["lighting"] == "warm"

    @pytest.mark.asyncio
    async def test_empty_args(self, context):
        result = await scene_control_tool.execute({}, context)
        assert result.ok is True
        # No commands set but still valid
        assert result.data["commands"] == {}


class TestMemorySearchTool:
    """Test search_memory tool with mocked vector store."""

    @pytest.mark.asyncio
    async def test_search_returns_memories(self, context):
        context.vector_store.query_memory.return_value = [
            {"text": "We talked about cats", "role": "user", "dist": 0.2,
             "session_id": 1, "timestamp": 1000},
        ]
        result = await memory_search_tool.execute(
            {"query": "cats"}, context
        )
        assert result.ok is True
        assert result.display == "list"
        assert len(result.data["memories"]) == 1
        assert "cats" in result.data["memories"][0]["text"]

    @pytest.mark.asyncio
    async def test_search_with_no_vector_store(self, context):
        context.vector_store = None
        result = await memory_search_tool.execute(
            {"query": "anything"}, context
        )
        assert result.ok is False
        assert "unavailable" in result.error.lower()


class TestImageGenTool:
    """Test generate_image tool with mocked image gen adapter."""

    @pytest.mark.asyncio
    async def test_generate_success(self, context):
        with patch("backend.agent.tools.image_gen.get_image_gen") as mock_get:
            mock_adapter = MagicMock()
            mock_adapter.generate.return_value = {
                "ok": True, "filename": "gen_123.png", "url": "/files/images/gen_123.png"
            }
            mock_adapter.is_available.return_value = True
            mock_get.return_value = mock_adapter

            result = await image_gen_tool.execute(
                {"prompt": "cute cat"}, context
            )
            assert result.ok is True
            assert result.display == "image"
            assert "/files/images/" in result.data["url"]

    @pytest.mark.asyncio
    async def test_generate_unavailable(self, context):
        with patch("backend.agent.tools.image_gen.get_image_gen") as mock_get:
            mock_adapter = MagicMock()
            mock_adapter.is_available.return_value = False
            mock_get.return_value = mock_adapter

            result = await image_gen_tool.execute(
                {"prompt": "cat"}, context
            )
            assert result.ok is False
            assert "unavailable" in result.error.lower()
```

**Step 2: Run test to verify it fails**

Run: `python -m pytest backend/tests/test_agent_tools.py -v`
Expected: FAIL

**Step 3: Write the tool implementations**

```python
# backend/agent/tools/__init__.py
"""Auto-registers all core agent tools and provides the default registry.

Usage:
    >>> from backend.agent.tools import get_default_registry
    >>> registry = get_default_registry()
    >>> registry.get_tool("generate_image")
"""

from backend.agent.registry import ToolRegistry
from backend.agent.tools.image_gen import image_gen_tool
from backend.agent.tools.memory import memory_search_tool
from backend.agent.tools.web_search import web_search_tool
from backend.agent.tools.scene_control import scene_control_tool

_default_registry: ToolRegistry | None = None


def get_default_registry() -> ToolRegistry:
    """Get or create the singleton default tool registry.

    Returns:
        ToolRegistry with all 4 core tools registered.
    """
    global _default_registry
    if _default_registry is None:
        _default_registry = ToolRegistry()
        _default_registry.register(image_gen_tool)
        _default_registry.register(memory_search_tool)
        _default_registry.register(web_search_tool)
        _default_registry.register(scene_control_tool)
    return _default_registry
```

```python
# backend/agent/tools/scene_control.py
"""Tool: set_scene — control character expression, animation, background, lighting."""

from backend.agent.registry import ToolDef, ToolResult, ToolContext


async def _execute(args: dict, context: ToolContext) -> ToolResult:
    """Build scene commands from args and return for frontend execution.

    Args:
        args: Dict with optional keys: expression, animation, background, lighting.
        context: Tool execution context (unused for this tool).

    Returns:
        ToolResult with display="scene_command" and commands dict.
    """
    commands = {}
    for key in ("expression", "animation", "background", "lighting"):
        if args.get(key):
            commands[key] = args[key]

    return ToolResult(ok=True, data={"commands": commands}, display="scene_command")


scene_control_tool = ToolDef(
    name="set_scene",
    description="Change your expression, play an animation, or adjust the scene background and lighting",
    parameters={
        "type": "object",
        "properties": {
            "expression": {
                "type": "string",
                "description": "Emotion expression to display",
                "enum": ["happy", "sad", "angry", "surprised", "thinking",
                         "excited", "worried", "neutral"],
            },
            "animation": {
                "type": "string",
                "description": "Animation to play",
                "enum": ["wave", "nod", "bow", "shrug", "clap", "think",
                         "point", "celebrate", "shy", "dance"],
            },
            "background": {
                "type": "string",
                "description": "Background image filename or CSS color value",
            },
            "lighting": {
                "type": "string",
                "description": "Lighting preset",
                "enum": ["warm", "cool", "dramatic", "disco", "natural"],
            },
        },
    },
    execute=_execute,
)
```

```python
# backend/agent/tools/memory.py
"""Tool: search_memory — search past conversation memories via vector store."""

from backend.agent.registry import ToolDef, ToolResult, ToolContext


async def _execute(args: dict, context: ToolContext) -> ToolResult:
    """Search conversation memories using semantic similarity.

    Args:
        args: {"query": str, "max_results": int (default 5)}.
        context: Must have vector_store set.

    Returns:
        ToolResult with list of memory matches, or error if store unavailable.
    """
    if context.vector_store is None:
        return ToolResult(ok=False, data={}, display="text",
                          error="Memory search unavailable (vector store not initialized)")

    query = args.get("query", "")
    max_results = min(args.get("max_results", 5), 10)

    try:
        raw = context.vector_store.query_memory(query, n_results=max_results,
                                                 char_id=context.char_id)
        memories = [
            {
                "text": m.get("text", ""),
                "role": m.get("role", ""),
                "score": round(max(0.0, 1.0 - float(m.get("dist", 0.0))), 3),
            }
            for m in raw
        ]
        return ToolResult(ok=True, data={"memories": memories}, display="list")
    except Exception as e:
        return ToolResult(ok=False, data={}, display="text",
                          error=f"Memory search failed: {e}")


memory_search_tool = ToolDef(
    name="search_memory",
    description="Search past conversations for relevant memories and context",
    parameters={
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "description": "What to search for in conversation history",
            },
            "max_results": {
                "type": "integer",
                "description": "Maximum results to return (1-10)",
                "default": 5,
            },
        },
        "required": ["query"],
    },
    execute=_execute,
)
```

```python
# backend/agent/tools/image_gen.py
"""Tool: generate_image — create images via ComfyUI/EasyDiffusion."""

import logging

from starlette.concurrency import run_in_threadpool

from backend.agent.registry import ToolDef, ToolResult, ToolContext

logger = logging.getLogger("waifu.agent.tools.image_gen")


def get_image_gen(cfg):
    """Import and return the image gen adapter (deferred to avoid circular imports)."""
    from backend.image_gen.registry import get_image_gen as _get
    return _get(cfg)


async def _execute(args: dict, context: ToolContext) -> ToolResult:
    """Generate an image from a text prompt.

    Args:
        args: {"prompt": str, "style": str (optional, default "anime")}.
        context: Must have cfg with image_gen settings.

    Returns:
        ToolResult with display="image" and data={"url": "..."}.
    """
    prompt = args.get("prompt", "")
    if not prompt:
        return ToolResult(ok=False, data={}, display="text", error="No prompt provided")

    try:
        gen = get_image_gen(context.cfg)
        if not gen.is_available():
            return ToolResult(ok=False, data={}, display="text",
                              error="Image generation unavailable (provider offline)")

        style = args.get("style", "anime")
        full_prompt = f"{style} style, {prompt}" if style != "anime" else prompt

        result = await run_in_threadpool(gen.generate, full_prompt, context.cfg)

        if result.get("ok"):
            return ToolResult(
                ok=True,
                data={"url": result["url"], "filename": result.get("filename", "")},
                display="image",
            )
        else:
            return ToolResult(ok=False, data={}, display="text",
                              error=result.get("error", "Generation failed"))
    except Exception as e:
        logger.error(f"[Agent] Image generation failed: {e}")
        return ToolResult(ok=False, data={}, display="text", error=str(e))


image_gen_tool = ToolDef(
    name="generate_image",
    description="Generate an anime-style image from a text description",
    parameters={
        "type": "object",
        "properties": {
            "prompt": {
                "type": "string",
                "description": "Detailed description of the image to generate",
            },
            "style": {
                "type": "string",
                "description": "Art style for the image",
                "enum": ["anime", "realistic", "chibi"],
                "default": "anime",
            },
        },
        "required": ["prompt"],
    },
    execute=_execute,
)
```

```python
# backend/agent/tools/web_search.py
"""Tool: web_search — search the internet via DuckDuckGo HTML.

Uses DuckDuckGo's HTML-only interface (no API key required). Parses
search result titles, snippets, and URLs from the response HTML.
"""

import logging
import re
from html import unescape
from urllib.parse import quote_plus, unquote

import httpx

from backend.agent.registry import ToolDef, ToolResult, ToolContext

logger = logging.getLogger("waifu.agent.tools.web_search")

_DDG_URL = "https://html.duckduckgo.com/html/"
_RESULT_RE = re.compile(
    r'<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>(.*?)</a>.*?'
    r'<a[^>]+class="result__snippet"[^>]*>(.*?)</a>',
    re.DOTALL,
)
_TAG_RE = re.compile(r"<[^>]+>")


def _strip_tags(html: str) -> str:
    """Remove HTML tags and unescape entities."""
    return unescape(_TAG_RE.sub("", html)).strip()


def _extract_url(ddg_url: str) -> str:
    """Extract real URL from DuckDuckGo's redirect URL."""
    if "uddg=" in ddg_url:
        match = re.search(r"uddg=([^&]+)", ddg_url)
        if match:
            return unquote(match.group(1))
    return ddg_url


async def _execute(args: dict, context: ToolContext) -> ToolResult:
    """Search the web via DuckDuckGo HTML interface.

    Args:
        args: {"query": str, "max_results": int (default 3, max 5)}.
        context: Tool execution context (unused).

    Returns:
        ToolResult with display="list" and data={"results": [...]}.
    """
    query = args.get("query", "")
    if not query:
        return ToolResult(ok=False, data={}, display="text", error="No query provided")

    max_results = min(args.get("max_results", 3), 5)

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                _DDG_URL,
                data={"q": query, "b": ""},
                headers={"User-Agent": "Mozilla/5.0 (compatible; WaifuBot/1.0)"},
            )
            resp.raise_for_status()

        results = []
        for match in _RESULT_RE.finditer(resp.text):
            if len(results) >= max_results:
                break
            url = _extract_url(match.group(1))
            title = _strip_tags(match.group(2))
            snippet = _strip_tags(match.group(3))
            if title and snippet:
                results.append({"title": title, "snippet": snippet, "url": url})

        return ToolResult(
            ok=True,
            data={"results": results, "query": query},
            display="list",
        )
    except Exception as e:
        logger.error(f"[Agent] Web search failed: {e}")
        return ToolResult(ok=False, data={}, display="text",
                          error=f"Web search failed: {e}")


web_search_tool = ToolDef(
    name="web_search",
    description="Search the internet for current information, news, or facts",
    parameters={
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "description": "Search query",
            },
            "max_results": {
                "type": "integer",
                "description": "Maximum results to return (1-5)",
                "default": 3,
            },
        },
        "required": ["query"],
    },
    execute=_execute,
)
```

**Step 4: Run test to verify it passes**

Run: `python -m pytest backend/tests/test_agent_tools.py -v`
Expected: 8 passed

**Step 5: Commit**

```bash
git add backend/agent/tools/
git add backend/tests/test_agent_tools.py
git commit -m "feat(agent): implement 4 core tools — image gen, memory, web search, scene control"
```

---

## Task 6: Add `supports_tools()` to LLM adapters

**Files:**
- Modify: `backend/llm/adapters/base.py:1-19`
- Modify: `backend/llm/adapters/openai_compat.py:9` (class body)
- Modify: `backend/llm/adapters/claude_api.py` (class body)

**Step 1: Add `supports_tools()` to base adapter**

Add after line 3 of `backend/llm/adapters/base.py`:

```python
    def supports_tools(self) -> bool:
        """Whether this adapter supports native function/tool calling.

        Returns:
            False by default. Override in subclasses that support tools.
        """
        return False
```

**Step 2: Override in OpenAI-compat adapter**

Add to `OpenAICompatAdapter` class in `backend/llm/adapters/openai_compat.py`:

```python
    def supports_tools(self) -> bool:
        """OpenAI-compatible APIs generally support function calling."""
        return True
```

**Step 3: Override in Claude adapter**

Add to `ClaudeAdapter` class in `backend/llm/adapters/claude_api.py`:

```python
    def supports_tools(self) -> bool:
        """Anthropic Claude API supports native tool use."""
        return True
```

**Step 4: Run existing tests**

Run: `python -m pytest backend/tests/ -v`
Expected: All existing tests still pass (new methods don't break anything)

**Step 5: Commit**

```bash
git add backend/llm/adapters/base.py backend/llm/adapters/openai_compat.py backend/llm/adapters/claude_api.py
git commit -m "feat(agent): add supports_tools() to LLM adapter base + overrides"
```

---

## Task 7: Wire AgentRunner into streaming chat endpoint

**Files:**
- Modify: `backend/server.py:2044-2070` (streaming chat endpoint, the `_stream_thread` section)
- Test: manually + `python -m pytest backend/tests/ -v` for regression

**Step 1: Add the conditional agentic branch**

In `backend/server.py`, after the Phase 9 capability profile parsing section (around line 2030, after `stream_extra_body` is set), add the agentic path check. The key change is: if `cap.get("supports_tools")` is True, route through `AgentRunner` instead of direct `_stream_thread`.

Find the section starting with `# Use an asyncio.Queue to bridge` (line 2044) and wrap the existing streaming code in an else branch. Insert BEFORE that line:

```python
    # ── Phase 10: Agentic tool-use path ──────────────────────────────
    _use_agent = bool(cap.get("supports_tools"))
    if _use_agent:
        from backend.agent.tools import get_default_registry
        from backend.agent.runner import AgentRunner
        from backend.agent.registry import ToolContext

        _agent_registry = get_default_registry()
        _agent_context = ToolContext(
            cfg=cfg, char_id=char_id, session_id=session_id,
            db_conn=con, vector_store=vector_store,
        )
        _agent_runner = AgentRunner(_agent_registry, max_rounds=3)
        _agent_tools = _agent_registry.all_tools()
    # ── End Phase 10 setup ───────────────────────────────────────────
```

Then wrap the existing `_stream_thread` + `event_generator` in `if not _use_agent:` / `else:` blocks. The agentic path's event_generator becomes:

```python
    if _use_agent:
        async def event_generator():
            full_reply = ""
            token_count = 0
            stream_start_time = time.time()

            yield f"event: processing\ndata: {json.dumps({'input_tokens': est_input_tokens})}\n\n"
            yield f"event: generating\ndata: {json.dumps({'status': 'first_token'})}\n\n"

            async for event in _agent_runner.run_stream(
                llm_messages, adapter, cfg, _agent_tools,
                context=_agent_context,
                temperature=cfg.get("temperature", 0.7),
                max_tokens=_cap_max_tokens,
                repeat_penalty=cfg.get("repeat_penalty"),
                frequency_penalty=cfg.get("frequency_penalty"),
                extra_body=stream_extra_body,
            ):
                evt_type = event["event"]
                evt_data = event["data"]

                if evt_type == "token":
                    t = evt_data.get("t", "")
                    full_reply += t
                    token_count += len(t) // 4  # rough estimate
                    yield f"event: token\ndata: {json.dumps({'t': t})}\n\n"

                elif evt_type in ("tool_call", "tool_result"):
                    yield f"event: {evt_type}\ndata: {json.dumps(evt_data)}\n\n"

            # Emit done event with metadata
            elapsed = time.time() - stream_start_time
            speed = round(token_count / elapsed, 1) if elapsed > 0 else 0

            emotion, gesture, clean_reply = _parse_emotion_gesture(full_reply)

            # Save assistant message
            cur.execute(
                "INSERT INTO messages(session_id, role, text, emotion, char_id, "
                "token_count, generation_time_ms, tokens_per_second) VALUES (?,?,?,?,?,?,?,?)",
                (session_id, "assistant", clean_reply, emotion, char_id,
                 token_count, int(elapsed * 1000), speed)
            )
            assistant_message_id = cur.lastrowid
            con.commit()

            _update_relationship(con, char_id, emotion)

            done_data = {
                "reply": clean_reply,
                "emotion": emotion,
                "gesture": gesture,
                "token_count": token_count,
                "tokens_per_second": speed,
                "generation_time_ms": int(elapsed * 1000),
                "session_id": session_id,
                "assistant_message_id": assistant_message_id,
                "context_budget": _context_budget_summary(sections, hist, cfg),
                "capability_warning": _capability_warning,
            }
            yield f"event: done\ndata: {json.dumps(done_data)}\n\n"
    else:
        # Existing non-agentic streaming code (unchanged)
        ...
```

**Step 2: Run full test suite**

Run: `python -m pytest backend/tests/ -v`
Expected: All tests pass (agentic path is gated by `supports_tools` — default characters don't trigger it)

**Step 3: Commit**

```bash
git add backend/server.py
git commit -m "feat(agent): wire AgentRunner into streaming chat endpoint"
```

---

## Task 8: Frontend — tool card rendering in ChatInterface

**Files:**
- Modify: `frontends/neon/js/components/ChatInterface.js:971-1005` (SSE parser)
- Modify: `frontends/neon/css/cyber_glass.css` (or new `tool_cards.css`)

**Step 1: Add tool_call and tool_result SSE event handlers**

In `ChatInterface.js`, find the SSE event handler chain (around line 1003, after the `else if (eventType === 'error')` block). Add before the closing `}`:

```javascript
                        } else if (eventType === 'tool_call') {
                            // Agent is calling a tool — show inline status card
                            if (streamContentEl) {
                                this._renderToolCard(streamContentEl, parsed);
                            }

                        } else if (eventType === 'tool_result') {
                            // Tool finished — update the card with results
                            if (streamContentEl) {
                                this._updateToolCard(streamContentEl, parsed);
                            }
                        }
```

**Step 2: Add `_renderToolCard()` method**

Add to ChatInterface class:

```javascript
    /**
     * Render an inline tool card inside a chat bubble showing tool execution status.
     *
     * @param {HTMLElement} container - The chat bubble's content element
     * @param {Object} data - Tool call event data {id, name, args}
     */
    _renderToolCard(container, data) {
        const TOOL_ICONS = {
            generate_image: '\u{1F3A8}',
            search_memory: '\u{1F4AD}',
            web_search: '\u{1F50D}',
            set_scene: '\u2728',
        };
        const TOOL_LABELS = {
            generate_image: 'Generating image',
            search_memory: 'Searching memories',
            web_search: 'Searching the web',
            set_scene: 'Adjusting scene',
        };

        const icon = TOOL_ICONS[data.name] || '\u2699\uFE0F';
        const label = TOOL_LABELS[data.name] || data.name;

        const card = document.createElement('div');
        card.className = 'tool-card tool-card--running';
        card.dataset.toolId = data.id;
        card.innerHTML = `
            <div class="tool-card-header">
                <span class="tool-icon">${icon}</span>
                <span class="tool-name">${label}...</span>
                <span class="tool-spinner"></span>
            </div>
            <div class="tool-card-body"></div>
        `;
        container.appendChild(card);
    }

    /**
     * Update an existing tool card with results after tool execution completes.
     *
     * @param {HTMLElement} container - The chat bubble's content element
     * @param {Object} data - Tool result event data {id, ok, display, data, error, elapsed}
     */
    _updateToolCard(container, data) {
        const card = container.querySelector(`.tool-card[data-tool-id="${data.id}"]`);
        if (!card) return;

        card.classList.remove('tool-card--running');
        card.classList.add(data.ok ? 'tool-card--done' : 'tool-card--error');

        // Remove spinner
        const spinner = card.querySelector('.tool-spinner');
        if (spinner) spinner.remove();

        // Update label
        const nameEl = card.querySelector('.tool-name');
        if (nameEl) {
            nameEl.textContent = nameEl.textContent.replace('...', data.ok ? '' : ' (failed)');
        }

        const body = card.querySelector('.tool-card-body');
        if (!body) return;

        if (!data.ok) {
            body.innerHTML = `<span class="tool-error">${data.error || 'Tool failed'}</span>`;
            return;
        }

        // Render based on display type
        if (data.display === 'image' && data.data?.url) {
            body.innerHTML = `<img src="${data.data.url}" class="tool-card-image" alt="Generated image" loading="lazy">`;
        } else if (data.display === 'list') {
            const items = data.data?.memories || data.data?.results || [];
            if (items.length > 0) {
                const html = items.map(item => {
                    const text = item.text || item.snippet || '';
                    const meta = item.title || (item.score ? `score: ${item.score}` : '');
                    return `<div class="tool-result-item"><strong>${meta}</strong><br>${text}</div>`;
                }).join('');
                body.innerHTML = html;
            }
        } else if (data.display === 'scene_command') {
            // Scene commands are executed, not displayed
            const cmds = data.data?.commands || {};
            if (cmds.expression && window.app?.viewerBridge) {
                window.app.viewerBridge.postMessage({type: 'setExpression', expression: cmds.expression});
            }
            if (cmds.animation && window.app?.viewerBridge) {
                window.app.viewerBridge.postMessage({type: 'playAnimation', animation: cmds.animation});
            }
            // Show subtle inline note
            const noteText = Object.entries(cmds).map(([k,v]) => `${k}: ${v}`).join(', ');
            body.innerHTML = `<em class="tool-scene-note">✨ ${noteText}</em>`;
        }

        // Add collapsible details
        const details = document.createElement('details');
        details.className = 'tool-card-details';
        details.innerHTML = `
            <summary>Show details</summary>
            <pre>${JSON.stringify({name: card.dataset.toolName || data.name, elapsed: data.elapsed, ...data.data}, null, 2)}</pre>
        `;
        card.appendChild(details);
    }
```

**Step 3: Add CSS for tool cards**

Add to `frontends/neon/css/cyber_glass.css` (or create `tool_cards.css` and link in index.html):

```css
/* ── Agent Tool Cards ──────────────────────────────────────── */
.tool-card {
    margin: 8px 0;
    padding: 10px 12px;
    border-radius: 8px;
    background: var(--glass-panel, rgba(0,0,0,0.3));
    border: 1px solid var(--glass-border, rgba(255,255,255,0.1));
    font-size: 0.85rem;
}
.tool-card--running { border-color: var(--neon-cyan, #0ff); }
.tool-card--done { border-color: #00ff88; }
.tool-card--error { border-color: #ff4466; }

.tool-card-header {
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 600;
}
.tool-icon { font-size: 1.1em; }
.tool-spinner {
    width: 14px; height: 14px;
    border: 2px solid var(--neon-cyan, #0ff);
    border-top-color: transparent;
    border-radius: 50%;
    animation: tool-spin 0.8s linear infinite;
    margin-left: auto;
}
@keyframes tool-spin { to { transform: rotate(360deg); } }

.tool-card-body { margin-top: 8px; }
.tool-card-image { max-width: 100%; max-height: 300px; border-radius: 6px; }
.tool-result-item {
    padding: 4px 0;
    border-bottom: 1px solid rgba(255,255,255,0.05);
    font-size: 0.8rem;
}
.tool-error { color: #ff4466; }
.tool-scene-note { color: var(--neon-cyan, #0ff); font-size: 0.8rem; }

.tool-card-details { margin-top: 6px; font-size: 0.75rem; opacity: 0.7; }
.tool-card-details summary { cursor: pointer; }
.tool-card-details pre {
    margin-top: 4px;
    white-space: pre-wrap;
    word-break: break-all;
    max-height: 200px;
    overflow-y: auto;
}
```

**Step 4: Manual verification**

1. Create a character with `capability_profile: {"supports_tools": true}` via the API
2. Send a message like "draw me a picture of a cat"
3. Verify tool_call and tool_result SSE events appear in browser devtools
4. Verify tool cards render in the chat bubble

**Step 5: Commit**

```bash
git add frontends/neon/js/components/ChatInterface.js frontends/neon/css/cyber_glass.css
git commit -m "feat(agent): frontend tool card rendering in chat bubbles"
```

---

## Task 9: Run full test suite + fix any regressions

**Files:**
- All test files

**Step 1: Run full test suite**

Run: `python -m pytest backend/tests/ -v --tb=short`
Expected: All tests pass (37 existing + ~27 new agent tests = ~64 total)

**Step 2: Fix any failures**

Address any import errors, missing dependencies, or broken tests.

**Step 3: Commit any fixes**

```bash
git commit -m "fix: resolve Phase 10 test regressions"
```

---

## Task 10: Fix Phase 12 WaifuCreator review issues

While implementing Phase 10, we also need to fix the 2 critical issues from the code review.

**Files:**
- Modify: `frontends/neon/js/components/WaifuCreator.js:1212-1222` (stale DOM ref)
- Modify: `frontends/neon/js/components/WaifuCreator.js:105-116` (blank edit form)

**Step 1: Fix stale DOM reference in `_generateIcon`**

Find the `_generateIcon` method. Remove the `finally` block that restores the detached `btn`. The `_switchTab()` re-render creates a fresh enabled button.

**Step 2: Fix blank edit form fallback**

In `open(charId)`, add an API fallback when character is not in state cache:

```javascript
if (charId) {
    let char = state.state.characters?.find(c => c.id == charId);
    if (!char) {
        try {
            const resp = await API.get(`characters`);
            const chars = resp.characters || [];
            char = chars.find(c => c.id == charId);
        } catch (e) {
            console.error('Failed to fetch character for edit:', e);
        }
    }
    if (char) {
        this._populateFromCharacter(char);
    } else {
        toast.error('Character not found', 4000);
        window.location.hash = '';
        return;
    }
}
```

**Step 3: Commit**

```bash
git add frontends/neon/js/components/WaifuCreator.js
git commit -m "fix: WaifuCreator stale DOM ref in _generateIcon + blank edit form fallback"
```

---

## Summary

| Task | Component | Estimated Size |
|------|-----------|---------------|
| 1 | ToolRegistry + data classes | ~120 lines impl + ~80 lines test |
| 2 | XML parser | ~80 lines impl + ~60 lines test |
| 3 | XML prompt generator | ~50 lines impl + ~40 lines test |
| 4 | AgentRunner loop | ~150 lines impl + ~100 lines test |
| 5 | 4 core tools | ~200 lines impl + ~80 lines test |
| 6 | Adapter `supports_tools()` | ~15 lines |
| 7 | server.py integration | ~60 lines |
| 8 | Frontend tool cards | ~120 lines JS + ~60 lines CSS |
| 9 | Test suite + regressions | Fix-only |
| 10 | WaifuCreator review fixes | ~20 lines |

**Total:** ~800 lines implementation + ~360 lines tests across 12 new files and 5 modified files.

**Dependencies:** `httpx` (likely already installed), `pytest-asyncio` (for async test support).
