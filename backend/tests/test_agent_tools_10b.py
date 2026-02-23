"""Tests for Phase 10b additional agent tools (Tier 1).

Covers diary writing, relationship checking, self-modification,
and webhook dispatch tools using real SQLite databases.
"""

import json
import sqlite3

import pytest

from backend.agent.registry import ToolContext, ToolResult
from backend.agent.tools.diary import diary_tool
from backend.agent.tools.modify_self import modify_self_tool
from backend.agent.tools.relationship import relationship_tool
from backend.agent.tools.webhook import webhook_tool


@pytest.fixture()
def context_with_db(tmp_path):
    """Create a ToolContext with a real SQLite DB for testing.

    Sets up ``characters`` and ``character_relationships`` tables with
    a single test character (id=1).
    """
    db_path = tmp_path / "test.db"
    conn = sqlite3.connect(str(db_path))
    conn.execute(
        """CREATE TABLE characters (
            id INTEGER PRIMARY KEY,
            name TEXT,
            diary TEXT,
            diary_date TEXT,
            greeting_text TEXT,
            background_url TEXT,
            background_mode TEXT,
            personality_traits TEXT
        )"""
    )
    conn.execute(
        """CREATE TABLE character_relationships (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            char_id INTEGER UNIQUE NOT NULL,
            affinity REAL DEFAULT 0.5,
            mood REAL DEFAULT 0.5,
            trust REAL DEFAULT 0.5,
            interactions INTEGER DEFAULT 0,
            last_updated REAL
        )"""
    )
    conn.execute("INSERT INTO characters (id, name) VALUES (1, 'TestChar')")
    conn.commit()
    return ToolContext(cfg={"webhooks": []}, char_id=1, session_id=1, db_conn=conn)


# -- Diary Tool --------------------------------------------------------


class TestDiaryTool:
    """Tests for the write_diary tool."""

    @pytest.mark.asyncio
    async def test_write_diary_entry(self, context_with_db):
        """Diary entry is returned with correct data fields."""
        result = await diary_tool.execute(
            {"entry": "Today was a great day!", "mood": "happy"},
            context_with_db,
        )
        assert result.ok is True
        assert result.data["diary"] == "Today was a great day!"
        assert result.data["mood"] == "happy"
        assert "date" in result.data

    @pytest.mark.asyncio
    async def test_diary_persists_to_db(self, context_with_db):
        """Diary text is persisted to the characters table."""
        await diary_tool.execute({"entry": "Test entry"}, context_with_db)
        row = context_with_db.db_conn.execute(
            "SELECT diary FROM characters WHERE id=1"
        ).fetchone()
        assert row[0] == "Test entry"

    @pytest.mark.asyncio
    async def test_diary_default_mood(self, context_with_db):
        """Mood defaults to 'neutral' when not provided."""
        result = await diary_tool.execute(
            {"entry": "No mood given"}, context_with_db
        )
        assert result.ok is True
        assert result.data["mood"] == "neutral"


# -- Relationship Tool -------------------------------------------------


class TestRelationshipTool:
    """Tests for the check_relationship tool."""

    @pytest.mark.asyncio
    async def test_check_relationship_defaults(self, context_with_db):
        """Freshly created relationship row has default values."""
        result = await relationship_tool.execute({}, context_with_db)
        assert result.ok is True
        assert result.data["affinity"] == 0.5
        assert result.data["mood"] == 0.5
        assert result.data["trust"] == 0.5
        assert result.data["interactions"] == 0

    @pytest.mark.asyncio
    async def test_relationship_row_created(self, context_with_db):
        """A relationship row is auto-created if it doesn't exist."""
        await relationship_tool.execute({}, context_with_db)
        row = context_with_db.db_conn.execute(
            "SELECT char_id FROM character_relationships WHERE char_id = 1"
        ).fetchone()
        assert row is not None


# -- Modify Self Tool --------------------------------------------------


class TestModifySelfTool:
    """Tests for the modify_self tool."""

    @pytest.mark.asyncio
    async def test_update_greeting(self, context_with_db):
        """Greeting text can be updated."""
        result = await modify_self_tool.execute(
            {"greeting_text": "Hello there!"}, context_with_db
        )
        assert result.ok is True
        assert "greeting_text" in result.data["updated_fields"]

    @pytest.mark.asyncio
    async def test_rejects_disallowed_fields(self, context_with_db):
        """Fields not in the whitelist are rejected."""
        result = await modify_self_tool.execute(
            {"system_prompt": "HACKED"}, context_with_db
        )
        assert result.ok is False

    @pytest.mark.asyncio
    async def test_update_personality_traits(self, context_with_db):
        """Personality traits are JSON-encoded and persisted."""
        result = await modify_self_tool.execute(
            {"personality_traits": ["kind", "brave"]}, context_with_db
        )
        assert result.ok is True
        row = context_with_db.db_conn.execute(
            "SELECT personality_traits FROM characters WHERE id=1"
        ).fetchone()
        assert json.loads(row[0]) == ["kind", "brave"]

    @pytest.mark.asyncio
    async def test_update_multiple_fields(self, context_with_db):
        """Multiple whitelisted fields can be updated at once."""
        result = await modify_self_tool.execute(
            {"greeting_text": "Hey!", "background_mode": "color"},
            context_with_db,
        )
        assert result.ok is True
        assert set(result.data["updated_fields"]) == {
            "greeting_text",
            "background_mode",
        }


# -- Webhook Tool ------------------------------------------------------


class TestWebhookTool:
    """Tests for the trigger_webhook tool."""

    @pytest.mark.asyncio
    async def test_no_webhooks_configured(self, context_with_db):
        """Returns sent_to=0 when no URLs are configured."""
        result = await webhook_tool.execute(
            {"event_type": "test", "message": "hello"}, context_with_db
        )
        assert result.ok is True
        assert result.data["sent_to"] == 0

    @pytest.mark.asyncio
    async def test_webhook_with_urls(self, context_with_db):
        """Counts dispatched webhooks (does not verify delivery)."""
        context_with_db.cfg["webhooks"] = ["http://example.com/hook"]
        result = await webhook_tool.execute(
            {"event_type": "mood_change", "message": "feeling great"},
            context_with_db,
        )
        assert result.ok is True
        assert result.data["sent_to"] == 1

    @pytest.mark.asyncio
    async def test_webhook_skips_invalid_urls(self, context_with_db):
        """Non-HTTP URLs are silently skipped."""
        context_with_db.cfg["webhooks"] = ["not-a-url", 12345]
        result = await webhook_tool.execute(
            {"event_type": "test", "message": "hi"}, context_with_db
        )
        assert result.ok is True
        assert result.data["sent_to"] == 0
