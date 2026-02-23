"""Tests for the four core agent tools and the default registry.

Covers the singleton registry, scene control, memory search, and
image generation tools.  Web search is tested elsewhere (requires
network mocking).
"""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from backend.agent.registry import ToolContext, ToolResult


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_context(**overrides) -> ToolContext:
    """Build a minimal ToolContext with sensible defaults.

    Args:
        **overrides: Any ToolContext field to override.

    Returns:
        A :class:`ToolContext` instance.
    """
    defaults = {"cfg": {}, "char_id": 1, "session_id": 100}
    defaults.update(overrides)
    return ToolContext(**defaults)


# ---------------------------------------------------------------------------
# TestDefaultRegistry
# ---------------------------------------------------------------------------

class TestDefaultRegistry:
    """Tests for the singleton default tool registry."""

    def test_registry_has_all_tools(self) -> None:
        """Registry should contain exactly 4 tools after initialisation."""
        from backend.agent.tools import get_default_registry

        registry = get_default_registry()
        assert len(registry.all_tools()) == 4

    def test_registry_schemas_are_valid(self) -> None:
        """Every schema must have the expected OpenAI function-calling shape."""
        from backend.agent.tools import get_default_registry

        registry = get_default_registry()
        schemas = registry.get_schemas()
        assert len(schemas) == 4

        for schema in schemas:
            assert schema["type"] == "function"
            func = schema["function"]
            assert "name" in func
            assert "description" in func
            assert "parameters" in func
            assert isinstance(func["parameters"], dict)


# ---------------------------------------------------------------------------
# TestSceneControlTool
# ---------------------------------------------------------------------------

class TestSceneControlTool:
    """Tests for the scene_control tool."""

    @pytest.mark.asyncio
    async def test_set_expression(self) -> None:
        """Setting expression should appear in the commands dict."""
        from backend.agent.tools.scene_control import _execute

        ctx = _make_context()
        result = await _execute({"expression": "happy"}, ctx)

        assert result.ok is True
        assert result.display == "scene_command"
        assert result.data["commands"]["expression"] == "happy"

    @pytest.mark.asyncio
    async def test_set_multiple(self) -> None:
        """Multiple scene args should all appear in commands."""
        from backend.agent.tools.scene_control import _execute

        ctx = _make_context()
        result = await _execute(
            {"expression": "sad", "animation": "wave", "lighting": "warm"},
            ctx,
        )

        assert result.ok is True
        cmds = result.data["commands"]
        assert cmds["expression"] == "sad"
        assert cmds["animation"] == "wave"
        assert cmds["lighting"] == "warm"

    @pytest.mark.asyncio
    async def test_empty_args(self) -> None:
        """Empty args should produce an empty commands dict but still ok=True."""
        from backend.agent.tools.scene_control import _execute

        ctx = _make_context()
        result = await _execute({}, ctx)

        assert result.ok is True
        assert result.data["commands"] == {}


# ---------------------------------------------------------------------------
# TestMemorySearchTool
# ---------------------------------------------------------------------------

class TestMemorySearchTool:
    """Tests for the memory_search tool."""

    @pytest.mark.asyncio
    async def test_search_returns_memories(self) -> None:
        """Should query the vector store and return formatted memories."""
        from backend.agent.tools.memory import _execute

        mock_vs = MagicMock()
        mock_vs.query_memory.return_value = [
            {"text": "I like cats", "role": "user", "dist": 0.2},
            {"text": "Me too!", "role": "assistant", "dist": 0.4},
        ]
        ctx = _make_context(vector_store=mock_vs)

        result = await _execute({"query": "cats", "max_results": 5}, ctx)

        assert result.ok is True
        assert result.display == "list"
        assert len(result.data["memories"]) == 2
        assert result.data["memories"][0]["text"] == "I like cats"
        assert result.data["memories"][0]["score"] == 0.8  # 1.0 - 0.2
        assert result.data["memories"][1]["score"] == 0.6  # 1.0 - 0.4

        mock_vs.query_memory.assert_called_once_with(
            "cats", n_results=5, char_id=1,
        )

    @pytest.mark.asyncio
    async def test_search_with_no_vector_store(self) -> None:
        """Should return an error when vector_store is None."""
        from backend.agent.tools.memory import _execute

        ctx = _make_context(vector_store=None)
        result = await _execute({"query": "anything"}, ctx)

        assert result.ok is False
        assert "vector store" in result.error.lower()


# ---------------------------------------------------------------------------
# TestImageGenTool
# ---------------------------------------------------------------------------

class TestImageGenTool:
    """Tests for the generate_image tool."""

    @pytest.mark.asyncio
    async def test_generate_unavailable(self) -> None:
        """Should return an error when the image gen adapter is offline."""
        from backend.agent.tools.image_gen import _execute

        mock_adapter = MagicMock()
        mock_adapter.is_available.return_value = False

        with patch(
            "backend.agent.tools.image_gen._get_image_gen",
            return_value=mock_adapter,
        ):
            ctx = _make_context()
            result = await _execute({"prompt": "a cute cat"}, ctx)

        assert result.ok is False
        assert "unavailable" in result.error.lower()
        mock_adapter.is_available.assert_called_once()
