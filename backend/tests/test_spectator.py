"""Tests for the game spectator system (Part 9).

Tests cover:
- Adapter VLM image_chat() methods (payload construction)
- ReactionThrottle timing and anti-spam logic
- FrameAnalyzer prompt building and reaction parsing
- Game memory CRUD operations
- get_game_memory_snippet context injection
"""

import json
import sqlite3
import time
from unittest.mock import MagicMock, patch

import pytest

# ── Adapter VLM tests ──────────────────────────────────────────────────────


class TestAdapterVision:
    """Test image_chat() produces correct payloads for each adapter."""

    def test_base_adapter_strips_images(self):
        """Base adapter falls back to text-only chat()."""
        from backend.llm.adapters.base import LLMAdapter

        adapter = LLMAdapter()
        assert adapter.supports_vision() is False

        # image_chat should call chat() — which raises NotImplementedError
        with pytest.raises(NotImplementedError):
            adapter.image_chat(
                messages=[{"role": "user", "content": "test"}],
                images=[{"data": "abc123", "media_type": "image/jpeg"}],
                model="test", endpoint="", api_key="",
            )

    def test_claude_adapter_vision_payload(self):
        """ClaudeAPIAdapter.image_chat() injects Anthropic image blocks."""
        from backend.llm.adapters.claude_api import ClaudeAPIAdapter

        adapter = ClaudeAPIAdapter()
        assert adapter.supports_vision() is True

        messages = [
            {"role": "system", "content": "You are a game watcher."},
            {"role": "user", "content": "What do you see?"},
        ]
        images = [{"data": "base64data", "media_type": "image/jpeg"}]

        # Mock requests.post to capture the payload
        with patch("backend.llm.adapters.claude_api.requests.post") as mock_post:
            mock_resp = MagicMock()
            mock_resp.status_code = 200
            mock_resp.json.return_value = {
                "content": [{"type": "text", "text": "I see a game!"}]
            }
            mock_post.return_value = mock_resp

            result = adapter.image_chat(messages, images, "claude-sonnet-4-6", "", "sk-ant-test")

            assert result["ok"] is True
            assert result["reply"] == "I see a game!"

            # Verify the payload has image content blocks
            call_kwargs = mock_post.call_args
            payload = call_kwargs.kwargs.get("json") or call_kwargs[1].get("json")
            user_msgs = [m for m in payload["messages"] if m["role"] == "user"]
            assert len(user_msgs) == 1
            content = user_msgs[0]["content"]
            assert isinstance(content, list)
            assert content[0]["type"] == "image"
            assert content[0]["source"]["type"] == "base64"
            assert content[0]["source"]["data"] == "base64data"
            assert content[1]["type"] == "text"
            assert content[1]["text"] == "What do you see?"

    def test_openai_adapter_vision_payload(self):
        """OpenAICompatAdapter.image_chat() injects image_url blocks."""
        from backend.llm.adapters.openai_compat import OpenAICompatAdapter

        adapter = OpenAICompatAdapter()
        assert adapter.supports_vision() is True

        messages = [{"role": "user", "content": "Describe this"}]
        images = [{"data": "imgdata", "media_type": "image/png"}]

        with patch("backend.llm.adapters.openai_compat.requests.post") as mock_post:
            mock_resp = MagicMock()
            mock_resp.status_code = 200
            mock_resp.json.return_value = {
                "choices": [{"message": {"content": "A game screen"}}]
            }
            mock_post.return_value = mock_resp

            result = adapter.image_chat(messages, images, "llava", "http://localhost:1234", "")

            assert result["ok"] is True
            call_kwargs = mock_post.call_args
            payload = call_kwargs.kwargs.get("json") or call_kwargs[1].get("json")
            user_msg = payload["messages"][0]
            assert isinstance(user_msg["content"], list)
            assert user_msg["content"][0]["type"] == "image_url"
            assert "data:image/png;base64,imgdata" in user_msg["content"][0]["image_url"]["url"]

    def test_gemini_adapter_vision_payload(self):
        """GeminiAdapter.image_chat() injects image_url blocks via compat route."""
        from backend.llm.adapters.gemini import GeminiAdapter

        adapter = GeminiAdapter()
        assert adapter.supports_vision() is True

        messages = [{"role": "user", "content": "What game?"}]
        images = [{"data": "geminidata", "media_type": "image/jpeg"}]

        with patch("backend.llm.adapters.gemini.requests.post") as mock_post:
            mock_resp = MagicMock()
            mock_resp.status_code = 200
            mock_resp.json.return_value = {
                "choices": [{"message": {"content": "PokeRogue"}}]
            }
            mock_post.return_value = mock_resp

            result = adapter.image_chat(messages, images, "gemini-2.0-flash", "", "AIza...")

            assert result["ok"] is True
            call_kwargs = mock_post.call_args
            payload = call_kwargs.kwargs.get("json") or call_kwargs[1].get("json")
            user_msg = payload["messages"][0]
            assert isinstance(user_msg["content"], list)
            assert user_msg["content"][0]["type"] == "image_url"

    def test_image_chat_no_images_fallback(self):
        """image_chat() with empty images list falls back to chat()."""
        from backend.llm.adapters.openai_compat import OpenAICompatAdapter

        adapter = OpenAICompatAdapter()
        with patch("backend.llm.adapters.openai_compat.requests.post") as mock_post:
            mock_resp = MagicMock()
            mock_resp.status_code = 200
            mock_resp.json.return_value = {
                "choices": [{"message": {"content": "text-only reply"}}]
            }
            mock_post.return_value = mock_resp

            result = adapter.image_chat(
                [{"role": "user", "content": "no images"}],
                [],  # Empty images
                "model", "http://localhost:1234", "",
            )
            assert result["ok"] is True

            # Verify no image_url in payload (plain string content)
            call_kwargs = mock_post.call_args
            payload = call_kwargs.kwargs.get("json") or call_kwargs[1].get("json")
            user_msg = payload["messages"][0]
            assert isinstance(user_msg["content"], str)


class TestRegistryVisionClient:
    """Test get_vision_client() returns correct adapter."""

    def test_returns_vision_capable_adapter(self):
        """get_vision_client returns a vision-capable adapter."""
        from backend.llm.registry import get_vision_client

        cfg = {"llm": {"provider": "local", "model": "llava", "endpoint": "http://localhost:1234"}}
        adapter, model, endpoint, api_key = get_vision_client(cfg)
        assert adapter.supports_vision() is True


# ── Throttle tests ──────────────────────────────────────────────────────────


class TestReactionThrottle:
    """Test ReactionThrottle timing and anti-spam logic."""

    def test_initial_reaction_allowed(self):
        """First reaction should always be allowed."""
        from backend.spectator.throttle import ReactionThrottle

        throttle = ReactionThrottle(preset="normal")
        assert throttle.should_react(urgency=0.5) is True

    def test_cooldown_blocks_rapid_fire(self):
        """Reactions within cooldown should be blocked."""
        from backend.spectator.throttle import ReactionThrottle

        throttle = ReactionThrottle(preset="normal")  # 15s cooldown
        throttle.record_reaction()
        # Immediately after — should be blocked
        assert throttle.should_react(urgency=0.3) is False

    def test_high_urgency_bypasses_normal_cooldown(self):
        """High urgency uses shorter cooldown."""
        from backend.spectator.throttle import ReactionThrottle

        throttle = ReactionThrottle(preset="normal")
        throttle.record_reaction()
        # Normal urgency blocked
        assert throttle.should_react(urgency=0.3) is False
        # High urgency uses 5s cooldown — still too soon at time 0
        assert throttle.should_react(urgency=0.8) is False

    def test_preset_change(self):
        """Preset changes update cooldown values."""
        from backend.spectator.throttle import ReactionThrottle

        throttle = ReactionThrottle(preset="normal")
        throttle.set_preset("hyped")
        assert throttle.preset == "hyped"

    def test_invalid_preset_raises(self):
        """Invalid preset should raise ValueError."""
        from backend.spectator.throttle import ReactionThrottle

        throttle = ReactionThrottle()
        with pytest.raises(ValueError, match="Unknown preset"):
            throttle.set_preset("turbo")

    def test_anti_spam_forced_quiet(self):
        """After MAX_CONSECUTIVE reactions, forced quiet period activates."""
        from backend.spectator.throttle import ReactionThrottle

        throttle = ReactionThrottle(preset="hyped")
        # Record 3 rapid reactions (MAX_CONSECUTIVE = 3)
        for _ in range(3):
            throttle.record_reaction()

        # Should now be in forced quiet (even high urgency blocked)
        assert throttle.should_react(urgency=1.0) is False

    def test_reset_clears_all(self):
        """Reset should clear all timing state."""
        from backend.spectator.throttle import ReactionThrottle

        throttle = ReactionThrottle(preset="normal")
        throttle.record_reaction()
        assert throttle.should_react(urgency=0.5) is False

        throttle.reset()
        assert throttle.should_react(urgency=0.5) is True


# ── Analyzer tests ──────────────────────────────────────────────────────────


class TestFrameAnalyzer:
    """Test FrameAnalyzer parsing and prompt building."""

    def test_parse_reaction_full_tags(self):
        """Parses emotion and urgency from tagged response."""
        from backend.spectator.analyzer import FrameAnalyzer

        analyzer = FrameAnalyzer.__new__(FrameAnalyzer)
        analyzer._observations = []

        raw = "[EMOTION: excited] [URGENCY: 0.8]\nOh wow, nice catch!"
        reaction = analyzer._parse_reaction(raw)

        assert reaction.emotion == "excited"
        assert reaction.urgency == 0.8
        assert "nice catch" in reaction.text
        assert reaction.quiet is False

    def test_parse_reaction_quiet(self):
        """Parses [QUIET] response."""
        from backend.spectator.analyzer import FrameAnalyzer

        analyzer = FrameAnalyzer.__new__(FrameAnalyzer)
        analyzer._observations = []

        reaction = analyzer._parse_reaction("[QUIET]")
        assert reaction.quiet is True

    def test_parse_reaction_empty(self):
        """Empty response is treated as quiet."""
        from backend.spectator.analyzer import FrameAnalyzer

        analyzer = FrameAnalyzer.__new__(FrameAnalyzer)
        analyzer._observations = []

        reaction = analyzer._parse_reaction("")
        assert reaction.quiet is True

    def test_parse_reaction_missing_tags(self):
        """Response without tags uses defaults."""
        from backend.spectator.analyzer import FrameAnalyzer

        analyzer = FrameAnalyzer.__new__(FrameAnalyzer)
        analyzer._observations = []

        reaction = analyzer._parse_reaction("Just walking around the map.")
        assert reaction.emotion == "neutral"
        assert reaction.urgency == 0.5
        assert "walking" in reaction.text

    def test_observations_rolling_window(self):
        """Observation window doesn't grow beyond MAX_OBSERVATIONS."""
        from backend.spectator.analyzer import FrameAnalyzer

        analyzer = FrameAnalyzer.__new__(FrameAnalyzer)
        analyzer._observations = []

        for i in range(10):
            analyzer._parse_reaction(f"[EMOTION: happy] [URGENCY: 0.5]\nReaction {i}")

        assert len(analyzer._observations) <= FrameAnalyzer.MAX_OBSERVATIONS

    def test_build_spectator_prompt_watch_mode(self):
        """Spectator prompt includes game tag and watch mode context."""
        from backend.spectator.analyzer import FrameAnalyzer

        analyzer = FrameAnalyzer.__new__(FrameAnalyzer)
        analyzer._char_name = "Kitsune"
        analyzer._char_persona = "A playful fox girl."
        analyzer.game_tag = "PokeRogue"
        analyzer.mode = "watch"
        analyzer._observations = ["Caught a wild Eevee!"]

        prompt = analyzer._build_spectator_prompt(user_name="Chris")
        assert "Kitsune" in prompt
        assert "PokeRogue" in prompt
        assert "Chris is playing" in prompt
        assert "Caught a wild Eevee" in prompt


# ── Input controller tests ──────────────────────────────────────────────────


class TestInputController:
    """Test PlaySession action parsing."""

    def test_parse_action_press(self):
        """Parses press action from VLM response."""
        from backend.spectator.input_controller import _parse_action

        raw = '```json\n{"action": "press", "key": "ArrowUp"}\n```\nTHOUGHT: Need to move up.'
        action = _parse_action(raw)
        assert action.action == "press"
        assert action.key == "ArrowUp"
        assert "move up" in action.thought

    def test_parse_action_click(self):
        """Parses click action with coordinates."""
        from backend.spectator.input_controller import _parse_action

        raw = '```json\n{"action": "click", "x": 640, "y": 360}\n```\nTHOUGHT: Click the button.'
        action = _parse_action(raw)
        assert action.action == "click"
        assert action.x == 640
        assert action.y == 360

    def test_parse_action_wait(self):
        """Parses wait action with duration."""
        from backend.spectator.input_controller import _parse_action

        raw = '```json\n{"action": "wait", "duration_ms": 2000}\n```\nTHOUGHT: Loading screen.'
        action = _parse_action(raw)
        assert action.action == "wait"
        assert action.duration_ms == 2000

    def test_parse_action_bare_json(self):
        """Parses action from bare JSON without code block."""
        from backend.spectator.input_controller import _parse_action

        raw = '{"action": "press", "key": "z"}'
        action = _parse_action(raw)
        assert action.action == "press"
        assert action.key == "z"

    def test_parse_action_invalid_json(self):
        """Invalid JSON falls back to wait action."""
        from backend.spectator.input_controller import _parse_action

        raw = "I'm not sure what to do... let me think."
        action = _parse_action(raw)
        assert action.action == "wait"


# ── Game memory tests ───────────────────────────────────────────────────────


@pytest.fixture
def mem_db():
    """In-memory SQLite with game companion tables (schema v37 subset)."""
    con = sqlite3.connect(":memory:")
    con.execute("""
        CREATE TABLE characters (
            id INTEGER PRIMARY KEY,
            name TEXT,
            persona TEXT
        )
    """)
    con.execute("INSERT INTO characters (id, name, persona) VALUES (1, 'Kitsune', 'A fox girl')")
    con.execute("""
        CREATE TABLE game_companion_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            character_id INTEGER NOT NULL,
            game_tag TEXT NOT NULL,
            mode TEXT NOT NULL DEFAULT 'watch',
            started_at TEXT NOT NULL DEFAULT (datetime('now')),
            ended_at TEXT,
            duration_seconds INTEGER,
            reaction_count INTEGER NOT NULL DEFAULT 0,
            memorable_moments TEXT,
            outcome TEXT,
            notes TEXT
        )
    """)
    con.execute("""
        CREATE TABLE game_companion_reactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id INTEGER NOT NULL,
            timestamp TEXT NOT NULL DEFAULT (datetime('now')),
            reaction_text TEXT NOT NULL,
            emotion TEXT NOT NULL DEFAULT 'neutral',
            urgency REAL NOT NULL DEFAULT 0.5,
            frame_hash TEXT,
            action_taken TEXT
        )
    """)
    con.commit()
    return con


class TestGameMemory:
    """Test game memory CRUD operations."""

    def test_create_session(self, mem_db):
        """Create a new game session."""
        from backend.spectator.memory import create_session

        session_id = create_session(mem_db, character_id=1, game_tag="PokeRogue", mode="watch")
        assert session_id > 0

        row = mem_db.execute(
            "SELECT game_tag, mode FROM game_companion_sessions WHERE id = ?",
            (session_id,),
        ).fetchone()
        assert row[0] == "PokeRogue"
        assert row[1] == "watch"

    def test_log_reaction(self, mem_db):
        """Log reactions and increment counter."""
        from backend.spectator.memory import create_session, log_reaction

        sid = create_session(mem_db, 1, "PokeRogue")
        log_reaction(mem_db, sid, "Nice!", emotion="excited", urgency=0.7)
        log_reaction(mem_db, sid, "Watch out!", emotion="worried", urgency=0.9)

        count = mem_db.execute(
            "SELECT reaction_count FROM game_companion_sessions WHERE id = ?",
            (sid,),
        ).fetchone()[0]
        assert count == 2

    def test_log_memorable_moment(self, mem_db):
        """Log memorable moments as JSON array."""
        from backend.spectator.memory import create_session, log_memorable_moment

        sid = create_session(mem_db, 1, "Balatro")
        log_memorable_moment(mem_db, sid, "Got a flush five!")
        log_memorable_moment(mem_db, sid, "Destroyed the boss blind!")

        moments_json = mem_db.execute(
            "SELECT memorable_moments FROM game_companion_sessions WHERE id = ?",
            (sid,),
        ).fetchone()[0]
        moments = json.loads(moments_json)
        assert len(moments) == 2
        assert "flush five" in moments[0]

    def test_close_session(self, mem_db):
        """Close session computes duration and sets outcome."""
        from backend.spectator.memory import create_session, close_session

        sid = create_session(mem_db, 1, "PokeRogue")
        close_session(mem_db, sid, outcome="win", notes="Great run!")

        row = mem_db.execute(
            "SELECT ended_at, outcome, notes FROM game_companion_sessions WHERE id = ?",
            (sid,),
        ).fetchone()
        assert row[0] is not None  # ended_at set
        assert row[1] == "win"
        assert row[2] == "Great run!"

    def test_get_game_memory_snippet(self, mem_db):
        """Get memory snippet includes recent sessions."""
        from backend.spectator.memory import (
            create_session, log_memorable_moment, close_session,
            get_game_memory_snippet,
        )

        sid = create_session(mem_db, 1, "PokeRogue", mode="watch")
        log_memorable_moment(mem_db, sid, "Caught a shiny Eevee!")
        close_session(mem_db, sid, outcome="win")

        snippet = get_game_memory_snippet(mem_db, character_id=1)
        assert "PokeRogue" in snippet
        assert "shiny Eevee" in snippet

    def test_get_game_memory_snippet_empty(self, mem_db):
        """Empty history returns empty string."""
        from backend.spectator.memory import get_game_memory_snippet

        snippet = get_game_memory_snippet(mem_db, character_id=1)
        assert snippet == ""

    def test_get_session_history(self, mem_db):
        """Get session history returns recent sessions."""
        from backend.spectator.memory import create_session, get_session_history

        create_session(mem_db, 1, "PokeRogue")
        create_session(mem_db, 1, "Balatro")

        sessions = get_session_history(mem_db, character_id=1)
        assert len(sessions) == 2
        # Both sessions present
        game_tags = {s["game_tag"] for s in sessions}
        assert "PokeRogue" in game_tags
        assert "Balatro" in game_tags


# ── Migration test ──────────────────────────────────────────────────────────


class TestMigrationV37:
    """Test schema v37 migration (game companion tables)."""

    def test_migration_creates_tables(self):
        """migrate_to_v37 creates both tables."""
        from backend.preflight import migrate_to_v37

        con = sqlite3.connect(":memory:")
        con.execute("CREATE TABLE schema_version (version INTEGER)")
        con.execute("CREATE TABLE characters (id INTEGER PRIMARY KEY, name TEXT)")
        con.commit()

        result = migrate_to_v37(con)
        assert result is True

        # Verify tables exist
        tables = {r[0] for r in con.execute(
            "SELECT name FROM sqlite_master WHERE type='table'"
        ).fetchall()}
        assert "game_companion_sessions" in tables
        assert "game_companion_reactions" in tables

    def test_migration_idempotent(self):
        """migrate_to_v37 is idempotent (safe to run twice)."""
        from backend.preflight import migrate_to_v37

        con = sqlite3.connect(":memory:")
        con.execute("CREATE TABLE schema_version (version INTEGER)")
        con.execute("CREATE TABLE characters (id INTEGER PRIMARY KEY, name TEXT)")
        con.commit()

        migrate_to_v37(con)
        result = migrate_to_v37(con)
        assert result is False  # Already applied
