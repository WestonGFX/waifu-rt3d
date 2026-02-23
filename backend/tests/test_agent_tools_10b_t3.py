"""Tests for Phase 10b message_character tool (Tier 3).

Validates cross-character messaging including success, self-message
rejection, nonexistent character handling, and LLM failure propagation.
"""

import sqlite3

import pytest
from unittest.mock import MagicMock, patch

from backend.agent.registry import ToolContext, ToolResult
from backend.agent.tools.message_character import message_character_tool


@pytest.fixture()
def context():
    """Build an in-memory ToolContext with two test characters.

    Returns:
        ToolContext wired to an in-memory SQLite DB containing
        characters Alice (id=1) and Bob (id=2).
    """
    conn = sqlite3.connect(":memory:")
    conn.execute(
        """CREATE TABLE characters (
            id INTEGER PRIMARY KEY, name TEXT, system_prompt TEXT
        )"""
    )
    conn.execute("INSERT INTO characters VALUES (1, 'Alice', 'You are Alice.')")
    conn.execute("INSERT INTO characters VALUES (2, 'Bob', 'You are Bob.')")
    conn.commit()
    return ToolContext(
        cfg={"llm": {"model": "test-model", "endpoint": "http://test", "api_key": "k"}},
        char_id=1,
        session_id=1,
        db_conn=conn,
    )


class TestMessageCharacterTool:
    """Tests for the message_character agent tool."""

    @pytest.mark.asyncio
    async def test_message_success(self, context: ToolContext) -> None:
        """Successful cross-character message returns the target's reply."""
        with patch("backend.agent.tools.message_character.get_client") as mock_get:
            mock_adapter = MagicMock()
            mock_adapter.chat.return_value = {"ok": True, "reply": "Hi from Bob!"}
            mock_get.return_value = mock_adapter

            result = await message_character_tool.execute(
                {"character_id": 2, "message": "Hello Bob!"}, context
            )

            assert result.ok is True
            assert result.data["from_character"] == "Bob"
            assert "Hi from Bob!" in result.data["reply"]

    @pytest.mark.asyncio
    async def test_self_message_rejected(self, context: ToolContext) -> None:
        """Characters cannot message themselves."""
        result = await message_character_tool.execute(
            {"character_id": 1, "message": "Hello me!"}, context
        )

        assert result.ok is False
        assert "yourself" in result.error.lower()

    @pytest.mark.asyncio
    async def test_nonexistent_character(self, context: ToolContext) -> None:
        """Messaging a nonexistent character returns a clear error."""
        result = await message_character_tool.execute(
            {"character_id": 999, "message": "Hello?"}, context
        )

        assert result.ok is False
        assert "not found" in result.error.lower()

    @pytest.mark.asyncio
    async def test_llm_failure(self, context: ToolContext) -> None:
        """LLM adapter errors are propagated as a failed ToolResult."""
        with patch("backend.agent.tools.message_character.get_client") as mock_get:
            mock_adapter = MagicMock()
            mock_adapter.chat.return_value = {"ok": False, "error": "Model offline"}
            mock_get.return_value = mock_adapter

            result = await message_character_tool.execute(
                {"character_id": 2, "message": "Hello?"}, context
            )

            assert result.ok is False
            assert "model offline" in result.error.lower()

    @pytest.mark.asyncio
    async def test_default_system_prompt_when_none(self, context: ToolContext) -> None:
        """A character with no system prompt gets a sensible default."""
        # Insert a character with NULL system_prompt
        context.db_conn.execute(
            "INSERT INTO characters VALUES (3, 'Charlie', NULL)"
        )
        context.db_conn.commit()

        with patch("backend.agent.tools.message_character.get_client") as mock_get:
            mock_adapter = MagicMock()
            mock_adapter.chat.return_value = {"ok": True, "reply": "Hey!"}
            mock_get.return_value = mock_adapter

            result = await message_character_tool.execute(
                {"character_id": 3, "message": "Hi Charlie"}, context
            )

            assert result.ok is True
            # Verify the fallback prompt was used
            call_args = mock_adapter.chat.call_args[0]
            assert call_args[0][0]["content"] == "You are a friendly anime companion."
