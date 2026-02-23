"""Tests for backend.agent.parser — XML and native tool-call parsing."""

import pytest

from backend.agent.parser import ToolCallParsed, parse_xml_tool_calls, parse_native_tool_calls


class TestParseXmlToolCalls:
    """Unit tests for parse_xml_tool_calls()."""

    def test_single_tool_call(self) -> None:
        """Extract name and args from one well-formed tool call."""
        text = '<tool_call name="search">{"query": "cats"}</tool_call>'
        calls = parse_xml_tool_calls(text)

        assert len(calls) == 1
        assert calls[0].name == "search"
        assert calls[0].args == {"query": "cats"}
        assert calls[0].parse_error is None

    def test_text_before_and_after(self) -> None:
        """Verify text_before and text_after capture surrounding prose."""
        text = 'Let me look that up. <tool_call name="search">{"q": "dogs"}</tool_call> Here you go!'
        calls = parse_xml_tool_calls(text)

        assert len(calls) == 1
        assert calls[0].text_before == "Let me look that up. "
        assert calls[0].text_after == " Here you go!"

    def test_no_tool_call(self) -> None:
        """Plain text with no tool-call tags returns an empty list."""
        calls = parse_xml_tool_calls("Just a normal message, nothing special.")
        assert calls == []

    def test_malformed_json_in_tool_call(self) -> None:
        """Malformed JSON sets args=None and populates parse_error."""
        text = '<tool_call name="broken">{not valid json}</tool_call>'
        calls = parse_xml_tool_calls(text)

        assert len(calls) == 1
        assert calls[0].name == "broken"
        assert calls[0].args is None
        assert calls[0].parse_error is not None

    def test_multiple_tool_calls(self) -> None:
        """Two consecutive tool calls are both extracted in order."""
        text = (
            '<tool_call name="first">{"a": 1}</tool_call>'
            '<tool_call name="second">{"b": 2}</tool_call>'
        )
        calls = parse_xml_tool_calls(text)

        assert len(calls) == 2
        assert calls[0].name == "first"
        assert calls[0].args == {"a": 1}
        assert calls[1].name == "second"
        assert calls[1].args == {"b": 2}

    def test_whitespace_variations(self) -> None:
        """Handles extra whitespace around and inside the tags."""
        text = '<tool_call  name="spaced" >\n  {"key": "val"}\n</tool_call>'
        calls = parse_xml_tool_calls(text)

        assert len(calls) == 1
        assert calls[0].name == "spaced"
        assert calls[0].args == {"key": "val"}

    def test_tool_call_id_generated(self) -> None:
        """Each parsed call receives a unique tc_-prefixed ID."""
        text = (
            '<tool_call name="a">{"x": 1}</tool_call>'
            '<tool_call name="b">{"y": 2}</tool_call>'
        )
        calls = parse_xml_tool_calls(text)

        assert len(calls) == 2
        for call in calls:
            assert call.id.startswith("tc_")
            assert len(call.id) > 3
        # IDs must be unique
        assert calls[0].id != calls[1].id
