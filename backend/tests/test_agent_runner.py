"""Tests for the AgentRunner agentic loop.

Verifies that the runner correctly:
- Passes through plain text from the LLM
- Detects and executes XML tool calls
- Enforces the max_rounds limit
- Streams text that precedes a tool call
"""

import sys
from pathlib import Path

import pytest
import pytest_asyncio

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.agent.registry import ToolContext, ToolDef, ToolRegistry, ToolResult
from backend.agent.runner import AgentRunner

# Enable auto asyncio mode so @pytest.mark.asyncio is not needed per-test
pytestmark = pytest.mark.asyncio


# ---------------------------------------------------------------------------
# Mock adapter
# ---------------------------------------------------------------------------

class MockAdapter:
    """Mock LLM adapter that yields character-by-character from pre-configured responses.

    Each call to ``chat_stream`` consumes the next response in the list.
    When responses are exhausted, the last one is repeated.

    Args:
        responses: List of strings, one per call round.
    """

    def __init__(self, responses: list[str]) -> None:
        self._responses = list(responses)
        self._call_count = 0

    def supports_tools(self) -> bool:
        """This mock does not support native tool calling."""
        return False

    def chat_stream(self, messages, model, endpoint, api_key, **kw):
        """Yield each character of the next pre-configured response.

        Args:
            messages: Conversation messages (ignored).
            model: Model name (ignored).
            endpoint: API endpoint (ignored).
            api_key: API key (ignored).
            **kw: Extra kwargs (ignored).

        Yields:
            str: One character at a time from the response.
        """
        idx = min(self._call_count, len(self._responses) - 1)
        self._call_count += 1
        for char in self._responses[idx]:
            yield char


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture()
def simple_registry() -> ToolRegistry:
    """Registry with a single 'echo' tool that returns its input."""

    async def echo_execute(args: dict, ctx: ToolContext | None) -> ToolResult:
        """Echo the input arguments back as data.

        Args:
            args: Must contain a ``"msg"`` key.
            ctx: Execution context (unused).

        Returns:
            ToolResult with ok=True and the args echoed back.
        """
        return ToolResult(ok=True, data={"echoed": args.get("msg", "")})

    registry = ToolRegistry()
    registry.register(
        ToolDef(
            name="echo",
            description="Echoes input back",
            parameters={
                "type": "object",
                "properties": {"msg": {"type": "string"}},
                "required": ["msg"],
            },
            execute=echo_execute,
        )
    )
    return registry


@pytest.fixture()
def context() -> ToolContext:
    """Minimal ToolContext for testing."""
    return ToolContext(cfg={}, char_id=1, session_id=1)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _collect_events(
    runner: AgentRunner,
    messages: list[dict],
    adapter: MockAdapter,
    cfg: dict,
    tools: list[ToolDef],
    context: ToolContext,
) -> list[dict]:
    """Collect all events from a run_stream call into a list.

    Args:
        runner: AgentRunner instance.
        messages: Conversation messages.
        adapter: Mock LLM adapter.
        cfg: Config dict.
        tools: Tool definitions.
        context: Tool execution context.

    Returns:
        List of event dicts emitted by the runner.
    """
    events = []
    async for event in runner.run_stream(messages, adapter, cfg, tools, context=context):
        events.append(event)
    return events


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

async def test_plain_text_response(simple_registry, context):
    """Plain text LLM output should emit token events with no tool calls."""
    adapter = MockAdapter(["Hello world!"])
    runner = AgentRunner(simple_registry, max_rounds=3)
    tools = simple_registry.all_tools()
    messages = [{"role": "user", "content": "Hi"}]

    events = await _collect_events(runner, messages, adapter, {}, tools, context)

    token_events = [e for e in events if e["event"] == "token"]
    tool_events = [e for e in events if e["event"] == "tool_call"]

    assert len(tool_events) == 0, "No tool_call events expected for plain text"
    assert len(token_events) >= 1, "Should have at least one token event"

    full_text = "".join(e["data"]["text"] for e in token_events)
    assert full_text == "Hello world!"


async def test_xml_tool_call_executes(simple_registry, context):
    """XML tool call should trigger execution and yield tool_call + tool_result events."""
    xml_call = 'Let me check. <tool_call name="echo">{"msg": "ping"}</tool_call>'
    follow_up = "The echo returned ping."

    adapter = MockAdapter([xml_call, follow_up])
    runner = AgentRunner(simple_registry, max_rounds=3)
    tools = simple_registry.all_tools()
    messages = [{"role": "user", "content": "Test tools"}]

    events = await _collect_events(runner, messages, adapter, {}, tools, context)

    tool_call_events = [e for e in events if e["event"] == "tool_call"]
    tool_result_events = [e for e in events if e["event"] == "tool_result"]
    token_events = [e for e in events if e["event"] == "token"]

    assert len(tool_call_events) == 1, "Expected exactly one tool_call event"
    assert tool_call_events[0]["data"]["name"] == "echo"
    assert tool_call_events[0]["data"]["args"] == {"msg": "ping"}

    assert len(tool_result_events) == 1, "Expected exactly one tool_result event"
    assert tool_result_events[0]["data"]["ok"] is True
    assert tool_result_events[0]["data"]["data"]["echoed"] == "ping"

    # The follow-up text from the second round should appear in tokens
    full_text = "".join(e["data"]["text"] for e in token_events)
    assert "The echo returned ping." in full_text


async def test_max_rounds_enforced(simple_registry, context):
    """Runner should stop after max_rounds even if LLM keeps calling tools."""
    always_call = '<tool_call name="echo">{"msg": "loop"}</tool_call>'
    adapter = MockAdapter([always_call])  # Same response every round
    runner = AgentRunner(simple_registry, max_rounds=2)
    tools = simple_registry.all_tools()
    messages = [{"role": "user", "content": "Loop test"}]

    events = await _collect_events(runner, messages, adapter, {}, tools, context)

    tool_call_events = [e for e in events if e["event"] == "tool_call"]
    assert len(tool_call_events) <= 2, f"Expected at most 2 tool calls, got {len(tool_call_events)}"


async def test_text_before_tool_call_is_streamed(simple_registry, context):
    """Text preceding a tool call should appear in token events."""
    response = 'Thinking...\n<tool_call name="echo">{"msg": "hi"}</tool_call>'
    follow_up = "Done."

    adapter = MockAdapter([response, follow_up])
    runner = AgentRunner(simple_registry, max_rounds=3)
    tools = simple_registry.all_tools()
    messages = [{"role": "user", "content": "Think first"}]

    events = await _collect_events(runner, messages, adapter, {}, tools, context)

    token_events = [e for e in events if e["event"] == "token"]
    full_text = "".join(e["data"]["text"] for e in token_events)

    assert "Thinking..." in full_text, "Text before tool call should be streamed"
