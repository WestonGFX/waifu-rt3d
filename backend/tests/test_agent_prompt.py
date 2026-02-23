"""Tests for the XML tool prompt generator."""

from __future__ import annotations

import pytest

from backend.agent.prompt import render_tool_prompt
from backend.agent.registry import ToolDef, ToolRegistry, ToolResult


# ------------------------------------------------------------------
# Fixtures
# ------------------------------------------------------------------

async def _noop(args: dict, ctx: object) -> ToolResult:
    """Placeholder executor used by test fixtures."""
    return ToolResult(ok=True)


@pytest.fixture
def registry() -> ToolRegistry:
    """Create a registry with two sample tools: web_search and generate_image."""
    reg = ToolRegistry()

    reg.register(ToolDef(
        name="web_search",
        description="Search the internet for information",
        parameters={
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Search query",
                },
                "max_results": {
                    "type": "integer",
                    "default": 3,
                },
            },
            "required": ["query"],
        },
        execute=_noop,
    ))

    reg.register(ToolDef(
        name="generate_image",
        description="Generate an image from a text prompt",
        parameters={
            "type": "object",
            "properties": {
                "prompt": {
                    "type": "string",
                    "description": "Image description",
                },
                "style": {
                    "type": "string",
                    "enum": ["anime", "realistic", "watercolor"],
                },
            },
            "required": ["prompt"],
        },
        execute=_noop,
    ))

    return reg


# ------------------------------------------------------------------
# Tests
# ------------------------------------------------------------------

def test_prompt_contains_tool_names(registry: ToolRegistry) -> None:
    """Both tool names should appear in the rendered prompt."""
    prompt = render_tool_prompt(registry.all_tools())
    assert "web_search" in prompt
    assert "generate_image" in prompt


def test_prompt_contains_descriptions(registry: ToolRegistry) -> None:
    """Tool descriptions should be present in the rendered prompt."""
    prompt = render_tool_prompt(registry.all_tools())
    assert "Search the internet for information" in prompt
    assert "Generate an image from a text prompt" in prompt


def test_prompt_contains_parameters(registry: ToolRegistry) -> None:
    """Parameter names and types should appear in the rendered prompt."""
    prompt = render_tool_prompt(registry.all_tools())
    # web_search params
    assert 'name="query"' in prompt
    assert 'type="string"' in prompt
    assert 'type="integer"' in prompt
    # generate_image enum param
    assert 'options="anime|realistic|watercolor"' in prompt


def test_prompt_contains_usage_instructions(registry: ToolRegistry) -> None:
    """Usage instructions with tool_call tags should be present."""
    prompt = render_tool_prompt(registry.all_tools())
    assert "<tool_call" in prompt
    assert "</tool_call>" in prompt


def test_empty_registry() -> None:
    """An empty tools list should produce an empty string."""
    assert render_tool_prompt([]) == ""
