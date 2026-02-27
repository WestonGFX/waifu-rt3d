"""Tests for Phase 10b additional agent tools (Tier 2).

Covers the voice generation, mood analysis, and knowledge search tools
using mocked backends to avoid requiring real TTS models or transformer
libraries during CI.
"""

import pytest
from unittest.mock import MagicMock, patch

from backend.agent.registry import ToolContext, ToolResult
from backend.agent.tools.voice import voice_tool
from backend.agent.tools.mood import mood_tool
from backend.agent.tools.knowledge import knowledge_tool


@pytest.fixture()
def context():
    """Build a minimal ToolContext with an in-memory SQLite DB.

    Creates the ``characters`` and ``character_docs`` tables used by the
    voice and knowledge tools, and inserts a single default character.

    Returns:
        A :class:`ToolContext` pointing at the in-memory database.
    """
    import sqlite3

    conn = sqlite3.connect(":memory:")
    conn.execute(
        """CREATE TABLE characters (
            id INTEGER PRIMARY KEY,
            voice_config TEXT,
            voice_id TEXT,
            tts_provider TEXT
        )"""
    )
    conn.execute("INSERT INTO characters (id) VALUES (1)")
    conn.execute(
        """CREATE TABLE character_docs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            char_id INTEGER,
            filename TEXT,
            content TEXT,
            chunk_count INTEGER DEFAULT 0
        )"""
    )
    conn.commit()
    return ToolContext(
        cfg={"tts": {"provider": "stub", "voice_id": "test-voice"}},
        char_id=1,
        session_id=1,
        db_conn=conn,
        vector_store=None,
    )


# -------------------------------------------------------------------
# Voice tool tests
# -------------------------------------------------------------------


class TestVoiceTool:
    """Tests for the generate_voice tool."""

    @pytest.mark.asyncio
    async def test_generate_voice_success(self, context):
        """Successful TTS generation returns an audio URL."""
        with patch("backend.agent.tools.voice._get_tts") as mock_get:
            mock_tts = MagicMock()
            mock_tts.speak_cached.return_value = {
                "ok": True,
                "filename": "cache_abc123.mp3",
                "cached": True,
            }
            mock_get.return_value = mock_tts

            result = await voice_tool.execute(
                {"text": "Hello world"}, context
            )
            assert result.ok is True
            assert "/files/audio/" in result.data["url"]
            assert result.data["cached"] is True

    @pytest.mark.asyncio
    async def test_generate_voice_empty_text(self, context):
        """Empty text input returns an error."""
        result = await voice_tool.execute({"text": ""}, context)
        assert result.ok is False
        assert "No text" in result.error

    @pytest.mark.asyncio
    async def test_generate_voice_tts_failure(self, context):
        """TTS backend returning ok=False propagates the error."""
        with patch("backend.agent.tools.voice._get_tts") as mock_get:
            mock_tts = MagicMock()
            mock_tts.speak_cached.return_value = {
                "ok": False,
                "error": "Engine offline",
            }
            mock_get.return_value = mock_tts

            result = await voice_tool.execute(
                {"text": "test"}, context
            )
            assert result.ok is False

    @pytest.mark.asyncio
    async def test_voice_uses_character_voice_config(self, context):
        """Character-specific voice_id is merged into TTS config."""
        import json

        context.db_conn.execute(
            "UPDATE characters SET voice_id='custom-voice', "
            "voice_config=? WHERE id=1",
            (json.dumps({"speed": 1.2}),),
        )
        context.db_conn.commit()

        with patch("backend.agent.tools.voice._get_tts") as mock_get:
            mock_tts = MagicMock()
            mock_tts.speak_cached.return_value = {
                "ok": True,
                "filename": "out.mp3",
            }
            mock_get.return_value = mock_tts

            await voice_tool.execute({"text": "hi"}, context)

            call_args = mock_tts.speak_cached.call_args
            tts_cfg = call_args[0][1]
            assert tts_cfg["voice_id"] == "custom-voice"
            assert tts_cfg["speed"] == 1.2


# -------------------------------------------------------------------
# Mood tool tests
# -------------------------------------------------------------------


class TestMoodTool:
    """Tests for the analyze_mood tool."""

    @pytest.mark.asyncio
    async def test_analyze_mood_with_mock(self, context):
        """Successful mood analysis returns emotion data."""
        mock_result = {
            "emotion": "joy",
            "intensity": 0.85,
            "secondary_emotion": "surprise",
            "gesture": "nod",
            "all_emotions": [{"label": "joy", "score": 0.85}],
        }
        # Use sys.modules injection instead of patch() — the module imports
        # transformers/torch at module level, so it can't be imported in CI.
        # Injecting a MagicMock into sys.modules lets the mood tool's lazy
        # `from backend.emotion.advanced_sentiment import AdvancedSentimentAnalyzer`
        # resolve to our mock without touching the real module.
        mock_module = MagicMock()
        mock_module.AdvancedSentimentAnalyzer.return_value.analyze.return_value = mock_result
        with patch.dict("sys.modules", {"backend.emotion.advanced_sentiment": mock_module}):
            result = await mood_tool.execute(
                {"text": "I'm so happy today!"}, context
            )
            assert result.ok is True
            assert result.data["emotion"] == "joy"
            assert result.data["intensity"] == 0.85
            assert result.data["gesture"] == "nod"

    @pytest.mark.asyncio
    async def test_analyze_mood_empty_text(self, context):
        """Empty text input returns an error."""
        result = await mood_tool.execute({"text": ""}, context)
        assert result.ok is False
        assert "No text" in result.error

    @pytest.mark.asyncio
    async def test_analyze_mood_import_error(self, context):
        """Missing transformers library returns a graceful error."""
        with patch.dict(
            "sys.modules",
            {"backend.emotion.advanced_sentiment": None},
        ):
            result = await mood_tool.execute({"text": "hello"}, context)
            assert result.ok is False
            assert "unavailable" in result.error


# -------------------------------------------------------------------
# Knowledge tool tests
# -------------------------------------------------------------------


class TestKnowledgeTool:
    """Tests for the read_knowledge tool."""

    @pytest.mark.asyncio
    async def test_no_docs_uploaded(self, context):
        """Character with no documents returns an empty result list."""
        result = await knowledge_tool.execute(
            {"query": "anything"}, context
        )
        assert result.ok is True
        assert len(result.data["results"]) == 0
        assert "No knowledge" in result.data.get("note", "")

    @pytest.mark.asyncio
    async def test_sql_fallback_search(self, context):
        """SQL LIKE fallback finds matching text in uploaded docs."""
        context.db_conn.execute(
            "INSERT INTO character_docs (char_id, filename, content) "
            "VALUES (1, 'notes.txt', 'Cats are wonderful animals')"
        )
        context.db_conn.commit()
        result = await knowledge_tool.execute({"query": "Cats"}, context)
        assert result.ok is True
        assert len(result.data["results"]) >= 1
        assert "cats" in result.data["results"][0]["text"].lower()

    @pytest.mark.asyncio
    async def test_empty_query_returns_error(self, context):
        """Empty query string returns an error."""
        result = await knowledge_tool.execute({"query": ""}, context)
        assert result.ok is False

    @pytest.mark.asyncio
    async def test_vector_store_search(self, context):
        """Semantic search is used when vector_store supports it."""
        context.db_conn.execute(
            "INSERT INTO character_docs (char_id, filename, content) "
            "VALUES (1, 'lore.txt', 'Character backstory content')"
        )
        context.db_conn.commit()

        mock_vs = MagicMock()
        mock_vs.query_doc_chunks.return_value = [
            {"filename": "lore.txt", "text": "backstory snippet", "dist": 0.2}
        ]
        context.vector_store = mock_vs

        result = await knowledge_tool.execute(
            {"query": "backstory"}, context
        )
        assert result.ok is True
        assert len(result.data["results"]) == 1
        assert result.data["results"][0]["score"] == 0.8

    @pytest.mark.asyncio
    async def test_no_db_connection(self, context):
        """Missing DB connection returns a graceful error."""
        context.db_conn = None
        result = await knowledge_tool.execute(
            {"query": "test"}, context
        )
        assert result.ok is False
        assert "database" in result.error.lower()

    @pytest.mark.asyncio
    async def test_max_results_clamped(self, context):
        """max_results is clamped between 1 and 5."""
        for i in range(10):
            context.db_conn.execute(
                "INSERT INTO character_docs (char_id, filename, content) "
                "VALUES (1, ?, ?)",
                (f"doc{i}.txt", f"content about topic {i}"),
            )
        context.db_conn.commit()

        result = await knowledge_tool.execute(
            {"query": "topic", "max_results": 20}, context
        )
        assert result.ok is True
        assert len(result.data["results"]) <= 5
