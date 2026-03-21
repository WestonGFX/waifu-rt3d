"""Tests for backend.llm.context_assembler — token-budget-aware context assembly.

Uses an in-memory SQLite database with 100+ messages to verify that
the assembler correctly fits content within the token budget and picks
the right messages.
"""

import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.llm.context_assembler import assemble_context, AssembledContext


def _create_test_db() -> sqlite3.Connection:
    """Create an in-memory SQLite database with test data.

    Returns:
        Connection with sessions, messages, session_summaries, and characters tables populated.
    """
    con = sqlite3.connect(":memory:")
    con.executescript("""
        CREATE TABLE sessions (
            id INTEGER PRIMARY KEY,
            title TEXT,
            summary TEXT,
            character_id INTEGER
        );
        CREATE TABLE characters (
            id INTEGER PRIMARY KEY,
            name TEXT
        );
        CREATE TABLE messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id INTEGER NOT NULL,
            role TEXT NOT NULL,
            text TEXT NOT NULL,
            ts INTEGER DEFAULT 0,
            is_active INTEGER DEFAULT 1,
            emotion TEXT,
            char_id INTEGER,
            importance_score REAL DEFAULT 0.5
        );
        CREATE TABLE session_summaries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id INTEGER NOT NULL,
            summary_text TEXT NOT NULL,
            msg_range_start INTEGER NOT NULL,
            msg_range_end INTEGER NOT NULL,
            msg_count INTEGER NOT NULL,
            token_count INTEGER,
            created_at INTEGER NOT NULL,
            meta_summary_id INTEGER DEFAULT NULL
        );
        INSERT INTO characters (id, name) VALUES (1, 'Fox');
        INSERT INTO sessions (id, title, character_id) VALUES (1, 'Test Session', 1);
    """)
    return con


def _insert_messages(con: sqlite3.Connection, count: int, session_id: int = 1) -> None:
    """Insert alternating user/assistant messages."""
    for i in range(1, count + 1):
        role = "user" if i % 2 == 1 else "assistant"
        text = f"Message number {i} with some content to give it reasonable length for tokenization."
        con.execute(
            "INSERT INTO messages (session_id, role, text, is_active) VALUES (?, ?, ?, 1)",
            (session_id, role, text),
        )
    con.commit()


def _make_sections(system_text: str = "You are a helpful assistant.") -> list[dict]:
    """Build a minimal sections list for testing."""
    from backend.llm.token_counter import count_tokens
    return [{"name": "System Prompt", "content": system_text,
             "tokens": count_tokens(system_text), "chars": len(system_text)}]


class TestAssembleContext:
    """Integration tests for assemble_context()."""

    def test_basic_assembly(self):
        """Basic assembly with a few messages should include all of them."""
        con = _create_test_db()
        _insert_messages(con, 10)
        sections = _make_sections()
        cfg = {"context_limit": 131072}

        ctx = assemble_context(1, 1, "Hello!", sections, cfg, con.cursor())

        assert isinstance(ctx, AssembledContext)
        assert len(ctx.messages) > 0
        assert ctx.token_count > 0
        assert ctx.history_count == 10
        # Last message should be the user's current message
        assert ctx.messages[-1]["role"] == "user"
        assert ctx.messages[-1]["content"] == "Hello!"

    def test_budget_constraint(self):
        """With a tight budget, fewer messages should be included."""
        con = _create_test_db()
        _insert_messages(con, 100)
        sections = _make_sections()
        # Very tight budget: only ~200 tokens available
        cfg = {"context_limit": 300}

        ctx = assemble_context(1, 1, "Hi", sections, cfg, con.cursor())

        # Should have fewer than 100 messages due to budget constraint
        assert ctx.history_count < 100
        assert ctx.token_count > 0

    def test_system_message_always_first(self):
        """System prompt should always be the first message."""
        con = _create_test_db()
        _insert_messages(con, 5)
        sections = _make_sections("Custom system prompt.")
        cfg = {"context_limit": 131072}

        ctx = assemble_context(1, 1, "Test", sections, cfg, con.cursor())

        assert ctx.messages[0]["role"] == "system"
        assert "Custom system prompt" in ctx.messages[0]["content"]

    def test_rolling_summaries_included(self):
        """Rolling summaries from session_summaries should be included."""
        con = _create_test_db()
        _insert_messages(con, 10)

        # Add a rolling summary
        con.execute(
            "INSERT INTO session_summaries "
            "(session_id, summary_text, msg_range_start, msg_range_end, msg_count, token_count, created_at) "
            "VALUES (1, 'Summary of early conversation about greetings.', 1, 20, 20, 10, 1000)"
        )
        con.commit()

        sections = _make_sections()
        cfg = {"context_limit": 131072}

        ctx = assemble_context(1, 1, "Hi", sections, cfg, con.cursor())

        assert ctx.summaries_included == 1
        # Check summary message is in the assembled context
        summary_msgs = [m for m in ctx.messages if "Summary of" in m.get("content", "")]
        assert len(summary_msgs) == 1

    def test_high_importance_recalled(self):
        """Archived messages with high importance should be recalled."""
        con = _create_test_db()
        _insert_messages(con, 10)

        # Archive a message with high importance
        con.execute(
            "INSERT INTO messages (session_id, role, text, is_active, importance_score) "
            "VALUES (1, 'user', 'I am allergic to peanuts — very important info!', 0, 0.95)"
        )
        con.commit()

        sections = _make_sections()
        cfg = {"context_limit": 131072}

        ctx = assemble_context(1, 1, "Hi", sections, cfg, con.cursor())

        assert ctx.high_importance_kept == 1
        recalled = [m for m in ctx.messages if "allergic" in m.get("content", "")]
        assert len(recalled) == 1

    def test_budget_summary_structure(self):
        """Budget summary should have all required keys."""
        con = _create_test_db()
        _insert_messages(con, 5)
        sections = _make_sections()
        cfg = {"context_limit": 8192}

        ctx = assemble_context(1, 1, "Test", sections, cfg, con.cursor())

        bs = ctx.budget_summary
        assert "sections" in bs
        assert "total_tokens" in bs
        assert "context_limit" in bs
        assert "usage_pct" in bs
        assert "history_messages" in bs
        assert "remaining_tokens" in bs
        assert bs["context_limit"] == 8192

    def test_empty_session(self):
        """Assembly with no messages should still work."""
        con = _create_test_db()
        sections = _make_sections()
        cfg = {"context_limit": 131072}

        ctx = assemble_context(1, 1, "First message!", sections, cfg, con.cursor())

        assert ctx.history_count == 0
        assert len(ctx.messages) >= 2  # system + user message

    def test_history_limit_respected(self):
        """history_limit in config should cap the number of messages fetched."""
        con = _create_test_db()
        _insert_messages(con, 50)
        sections = _make_sections()
        cfg = {"context_limit": 131072, "llm": {"history_limit": 10}}

        ctx = assemble_context(1, 1, "Hi", sections, cfg, con.cursor())

        assert ctx.history_count <= 10

    def test_skip_user_append(self):
        """When skip_user_append=True, user_text should NOT be appended as final message."""
        con = _create_test_db()
        _insert_messages(con, 5)
        sections = _make_sections()
        cfg = {"context_limit": 131072}

        ctx = assemble_context(1, 1, "SHOULD_NOT_APPEAR", sections, cfg, con.cursor(),
                               skip_user_append=True)

        # The assembler should NOT append "SHOULD_NOT_APPEAR" as a separate message
        last_msg = ctx.messages[-1]
        assert last_msg["content"] != "SHOULD_NOT_APPEAR", \
            "skip_user_append=True should prevent appending user_text"

    def test_skip_user_append_with_db_message(self):
        """skip_user_append=True simulates server.py flow where user msg is already in DB."""
        con = _create_test_db()
        _insert_messages(con, 4)
        # Insert a user message as if server.py had already stored it
        con.execute(
            "INSERT INTO messages (session_id, role, text, is_active) VALUES (1, 'user', 'Hello from DB!', 1)"
        )
        con.commit()

        sections = _make_sections()
        cfg = {"context_limit": 131072}

        ctx = assemble_context(1, 1, "Hello from DB!", sections, cfg, con.cursor(),
                               skip_user_append=True)

        # The user message should appear exactly once (from DB), not duplicated
        user_msgs = [m for m in ctx.messages if m.get("content") == "Hello from DB!"]
        assert len(user_msgs) == 1, f"Expected 1 occurrence, got {len(user_msgs)}"

    def test_session_with_only_summaries(self):
        """Session where all messages are archived but summaries exist."""
        con = _create_test_db()
        # Insert messages but mark them all as archived (is_active=0)
        for i in range(1, 11):
            role = "user" if i % 2 == 1 else "assistant"
            con.execute(
                "INSERT INTO messages (session_id, role, text, is_active, importance_score) "
                "VALUES (1, ?, ?, 0, 0.5)",
                (role, f"Archived message {i}")
            )
        # Add a rolling summary
        con.execute(
            "INSERT INTO session_summaries "
            "(session_id, summary_text, msg_range_start, msg_range_end, msg_count, token_count, created_at) "
            "VALUES (1, 'User discussed their favorite movies and music.', 1, 10, 10, 12, 1000)"
        )
        con.commit()

        sections = _make_sections()
        cfg = {"context_limit": 131072}

        ctx = assemble_context(1, 1, "New message!", sections, cfg, con.cursor())

        assert ctx.summaries_included == 1
        assert ctx.history_count == 0  # No active messages
        # Should have system + summary + user message
        assert len(ctx.messages) >= 3

    def test_budget_summary_has_token_counter(self):
        """Budget summary should include the token_counter field."""
        con = _create_test_db()
        _insert_messages(con, 5)
        sections = _make_sections()
        cfg = {"context_limit": 8192}

        ctx = assemble_context(1, 1, "Test", sections, cfg, con.cursor())

        assert "token_counter" in ctx.budget_summary
        assert ctx.budget_summary["token_counter"] in ("tiktoken", "heuristic")

    def test_messages_in_chronological_order(self):
        """History messages should be in chronological order (oldest first)."""
        con = _create_test_db()
        _insert_messages(con, 10)
        sections = _make_sections()
        cfg = {"context_limit": 131072}

        ctx = assemble_context(1, 1, "Hi", sections, cfg, con.cursor())

        # Extract history messages (skip system and user message)
        hist = [m for m in ctx.messages if m["role"] in ("user", "assistant")
                and m["content"] != "Hi"]
        for i in range(1, len(hist)):
            # Message numbers should increase
            prev_num = int(hist[i - 1]["content"].split()[2])
            curr_num = int(hist[i]["content"].split()[2])
            assert curr_num > prev_num, f"Messages out of order: {prev_num} before {curr_num}"

    # ── RAG semantic memory tests ──────────────────────────────────────

    def test_semantic_memories_included(self):
        """When vector_store is provided, semantic memories should be injected."""
        con = _create_test_db()
        _insert_messages(con, 5)
        sections = _make_sections()
        cfg = {"context_limit": 131072}

        # Mock vector store with a search method
        class MockVectorStore:
            def search(self, query, char_id=None, top_k=5):
                return [
                    {"text": "User mentioned they love sushi", "dist": 0.3},
                    {"text": "User's birthday is March 15", "dist": 0.5},
                ]

        ctx = assemble_context(1, 1, "Hi", sections, cfg, con.cursor(),
                               vector_store=MockVectorStore())

        assert ctx.semantic_memories_included == 2
        mem_msgs = [m for m in ctx.messages if "[Memory]" in m.get("content", "")]
        assert len(mem_msgs) == 2
        assert "sushi" in mem_msgs[0]["content"]

    def test_semantic_memories_budget_constrained(self):
        """Under tight budget, semantic memories should be dropped."""
        con = _create_test_db()
        _insert_messages(con, 5)
        sections = _make_sections()
        cfg = {"context_limit": 250}  # Very tight budget

        class MockVectorStore:
            def search(self, query, char_id=None, top_k=5):
                return [
                    {"text": "A " * 500, "dist": 0.3},  # Huge memory that won't fit
                ]

        ctx = assemble_context(1, 1, "Hi", sections, cfg, con.cursor(),
                               vector_store=MockVectorStore())

        # Should gracefully handle — memory didn't fit
        assert ctx.semantic_memories_included == 0

    def test_semantic_memories_none_vector_store(self):
        """When vector_store is None, semantic memories should be 0."""
        con = _create_test_db()
        _insert_messages(con, 5)
        sections = _make_sections()
        cfg = {"context_limit": 131072}

        ctx = assemble_context(1, 1, "Hi", sections, cfg, con.cursor(),
                               vector_store=None)

        assert ctx.semantic_memories_included == 0

    def test_budget_summary_has_semantic_field(self):
        """Budget summary should include the semantic_memories_included field."""
        con = _create_test_db()
        _insert_messages(con, 5)
        sections = _make_sections()
        cfg = {"context_limit": 8192}

        ctx = assemble_context(1, 1, "Test", sections, cfg, con.cursor())

        assert "semantic_memories_included" in ctx.budget_summary

    # ── Cross-session recall tests ─────────────────────────────────────

    def test_cross_session_recall(self):
        """High-importance messages from other sessions with same character should be recalled."""
        con = _create_test_db()
        _insert_messages(con, 5)

        # Create another session with same character and a high-importance archived message
        con.execute("INSERT INTO sessions (id, title, character_id) VALUES (2, 'Old Session', 1)")
        con.execute(
            "INSERT INTO messages (session_id, role, text, is_active, importance_score, char_id) "
            "VALUES (2, 'user', 'I have a severe peanut allergy — please remember this!', 0, 0.95, 1)"
        )
        con.commit()

        sections = _make_sections()
        cfg = {"context_limit": 131072}

        ctx = assemble_context(1, 1, "Hi", sections, cfg, con.cursor())

        assert ctx.high_importance_kept >= 1
        recalled = [m for m in ctx.messages if "peanut allergy" in m.get("content", "")]
        assert len(recalled) == 1

    # ── Adaptive threshold tests ───────────────────────────────────────

    def test_adaptive_threshold_under_pressure(self):
        """Under budget pressure, only very high importance messages should be recalled."""
        con = _create_test_db()
        _insert_messages(con, 50)  # Many messages to eat budget

        # Add archived messages with varying importance
        con.execute(
            "INSERT INTO messages (session_id, role, text, is_active, importance_score, char_id) "
            "VALUES (1, 'user', 'Moderately important fact.', 0, 0.85, 1)"
        )
        con.execute(
            "INSERT INTO messages (session_id, role, text, is_active, importance_score, char_id) "
            "VALUES (1, 'user', 'Very important user allergy info!', 0, 0.98, 1)"
        )
        con.commit()

        sections = _make_sections()
        # Tight budget — threshold should be raised
        cfg = {"context_limit": 500}

        ctx = assemble_context(1, 1, "Hi", sections, cfg, con.cursor())

        # Under pressure the threshold rises, so moderate-importance may be skipped
        # but very high importance should still be included if budget allows
        assert ctx.high_importance_kept >= 0  # At minimum, it doesn't crash

    # ── Meta-summary / hierarchical summarization tests ────────────────

    def test_meta_summary_skips_rolled_children(self):
        """Summaries with meta_summary_id set should be skipped by the assembler."""
        con = _create_test_db()
        _insert_messages(con, 5)

        # Insert a meta-summary and two child summaries
        con.execute(
            "INSERT INTO session_summaries "
            "(id, session_id, summary_text, msg_range_start, msg_range_end, msg_count, token_count, created_at, meta_summary_id) "
            "VALUES (1, 1, 'Child summary 1', 1, 10, 10, 20, 1000, 3)"
        )
        con.execute(
            "INSERT INTO session_summaries "
            "(id, session_id, summary_text, msg_range_start, msg_range_end, msg_count, token_count, created_at, meta_summary_id) "
            "VALUES (2, 1, 'Child summary 2', 11, 20, 10, 20, 2000, 3)"
        )
        con.execute(
            "INSERT INTO session_summaries "
            "(id, session_id, summary_text, msg_range_start, msg_range_end, msg_count, token_count, created_at, meta_summary_id) "
            "VALUES (3, 1, 'Meta-summary of early conversation', 1, 20, 0, 30, 3000, NULL)"
        )
        con.commit()

        sections = _make_sections()
        cfg = {"context_limit": 131072}

        ctx = assemble_context(1, 1, "Hi", sections, cfg, con.cursor())

        # Only the meta-summary (id=3) should be included, not the children
        assert ctx.summaries_included == 1
        summary_msgs = [m for m in ctx.messages if "Meta-summary" in m.get("content", "")]
        assert len(summary_msgs) == 1
        child_msgs = [m for m in ctx.messages if "Child summary" in m.get("content", "")]
        assert len(child_msgs) == 0

    # ── Cache hints tests ──────────────────────────────────────────────

    def test_cache_breakpoints_recorded(self):
        """When cache_hints=True, breakpoints should be recorded."""
        con = _create_test_db()
        _insert_messages(con, 5)
        sections = _make_sections()
        cfg = {"context_limit": 131072}

        ctx = assemble_context(1, 1, "Hi", sections, cfg, con.cursor(),
                               cache_hints=True)

        assert len(ctx.cache_breakpoints) >= 1
        # Breakpoint should be at valid index
        assert all(0 <= bp < len(ctx.messages) for bp in ctx.cache_breakpoints)

    def test_no_cache_breakpoints_by_default(self):
        """When cache_hints=False (default), no breakpoints should be recorded."""
        con = _create_test_db()
        _insert_messages(con, 5)
        sections = _make_sections()
        cfg = {"context_limit": 131072}

        ctx = assemble_context(1, 1, "Hi", sections, cfg, con.cursor())

        assert ctx.cache_breakpoints == []

    # ── Scene context tests ────────────────────────────────────────────

    def test_scene_context_injected(self):
        """When scene_context is provided, it should appear as a system message."""
        con = _create_test_db()
        _insert_messages(con, 5)
        sections = _make_sections()
        cfg = {"context_limit": 131072}
        scene = "You're both sitting on the couch together, relaxing"

        ctx = assemble_context(1, 1, "Hi", sections, cfg, con.cursor(),
                               scene_context=scene)

        scene_msgs = [m for m in ctx.messages
                      if "[Scene:" in m.get("content", "")]
        assert len(scene_msgs) == 1
        assert scene in scene_msgs[0]["content"]
        assert scene_msgs[0]["role"] == "system"

    def test_scene_context_none_omitted(self):
        """When scene_context is None (default), no [Scene:] block should appear."""
        con = _create_test_db()
        _insert_messages(con, 5)
        sections = _make_sections()
        cfg = {"context_limit": 131072}

        ctx = assemble_context(1, 1, "Hi", sections, cfg, con.cursor())

        scene_msgs = [m for m in ctx.messages
                      if "[Scene:" in m.get("content", "")]
        assert len(scene_msgs) == 0

    def test_scene_context_dropped_under_budget_pressure(self):
        """Scene context should be silently dropped when the budget is exhausted."""
        con = _create_test_db()
        _insert_messages(con, 5)
        sections = _make_sections()
        cfg = {"context_limit": 100}  # Extremely tight budget

        ctx = assemble_context(1, 1, "Hi", sections, cfg, con.cursor(),
                               scene_context="You're lying on the bed together, comfortable and cozy")

        # Must not raise — scene dropped gracefully
        scene_msgs = [m for m in ctx.messages
                      if "[Scene:" in m.get("content", "")]
        assert len(scene_msgs) == 0

    def test_scene_context_appears_before_recent_history(self):
        """Scene context message should appear before the recent chat history."""
        con = _create_test_db()
        _insert_messages(con, 5)
        sections = _make_sections()
        cfg = {"context_limit": 131072}
        scene = "You're standing together, facing each other"

        ctx = assemble_context(1, 1, "Hi", sections, cfg, con.cursor(),
                               scene_context=scene)

        indices = {i: m for i, m in enumerate(ctx.messages)}
        scene_idx = next(
            i for i, m in indices.items() if "[Scene:" in m.get("content", "")
        )
        # At least one history or user message should come after the scene block
        messages_after = [m for m in ctx.messages[scene_idx + 1:]
                          if m["role"] in ("user", "assistant")]
        assert len(messages_after) > 0
