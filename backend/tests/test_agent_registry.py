"""Tests for backend.agent.registry — ToolDef, ToolResult, ToolContext, ToolRegistry."""

import asyncio

import pytest

from backend.agent.registry import ToolContext, ToolDef, ToolRegistry, ToolResult


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _dummy_execute(args: dict, ctx: ToolContext) -> ToolResult:
    """No-op executor used by tests."""
    return ToolResult(ok=True, data=args)


def _make_tool(name: str = "greet", description: str = "Say hello") -> ToolDef:
    """Create a minimal ToolDef for testing."""
    return ToolDef(
        name=name,
        description=description,
        parameters={
            "type": "object",
            "properties": {"name": {"type": "string"}},
        },
        execute=_dummy_execute,
    )


# ---------------------------------------------------------------------------
# TestToolDef
# ---------------------------------------------------------------------------

class TestToolDef:
    """Tests for ToolDef and ToolResult data classes."""

    def test_tool_def_creation(self) -> None:
        """Verify all ToolDef fields are stored correctly."""
        td = _make_tool(name="recall", description="Recall a memory")
        assert td.name == "recall"
        assert td.description == "Recall a memory"
        assert "properties" in td.parameters
        assert td.execute is _dummy_execute

    def test_tool_result_ok(self) -> None:
        """A successful ToolResult carries data and display hint."""
        result = ToolResult(ok=True, data={"key": "value"}, display="table")
        assert result.ok is True
        assert result.data == {"key": "value"}
        assert result.display == "table"
        assert result.error is None

    def test_tool_result_error(self) -> None:
        """A failed ToolResult carries an error message."""
        result = ToolResult(ok=False, error="something went wrong")
        assert result.ok is False
        assert result.error == "something went wrong"
        assert result.data == {}
        assert result.display == "text"


# ---------------------------------------------------------------------------
# TestToolRegistry
# ---------------------------------------------------------------------------

class TestToolRegistry:
    """Tests for the ToolRegistry class."""

    def test_register_and_get(self) -> None:
        """Register a tool then retrieve it by name."""
        registry = ToolRegistry()
        tool = _make_tool()
        registry.register(tool)

        retrieved = registry.get_tool("greet")
        assert retrieved is tool
        assert registry.get_tool("nonexistent") is None

    def test_get_schemas_openai_format(self) -> None:
        """get_schemas() returns the OpenAI function-calling shape."""
        registry = ToolRegistry()
        registry.register(_make_tool(name="alpha", description="First tool"))

        schemas = registry.get_schemas()
        assert len(schemas) == 1

        schema = schemas[0]
        assert schema["type"] == "function"
        assert "function" in schema
        fn = schema["function"]
        assert fn["name"] == "alpha"
        assert fn["description"] == "First tool"
        assert "properties" in fn["parameters"]

    def test_all_tools_list(self) -> None:
        """all_tools() returns a list of all registered ToolDefs."""
        registry = ToolRegistry()
        registry.register(_make_tool(name="a"))
        registry.register(_make_tool(name="b"))
        registry.register(_make_tool(name="c"))

        tools = registry.all_tools()
        assert isinstance(tools, list)
        assert len(tools) == 3
        assert [t.name for t in tools] == ["a", "b", "c"]

    def test_duplicate_register_overwrites(self) -> None:
        """Registering a tool with the same name overwrites the previous one."""
        registry = ToolRegistry()
        registry.register(_make_tool(name="dup", description="v1"))
        registry.register(_make_tool(name="dup", description="v2"))

        assert len(registry.all_tools()) == 1
        assert registry.get_tool("dup").description == "v2"
