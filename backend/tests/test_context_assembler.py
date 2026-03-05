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
        Connection with sessions, messages, and session_summaries tables populated.
    """
    con = sqlite3.connect(":memory:")
    con.executescript("""
        CREATE TABLE sessions (
            id INTEGER PRIMARY KEY,
            title TEXT,
            summary TEXT
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
            created_at INTEGER NOT NULL
        );
        INSERT INTO sessions (id, title) VALUES (1, 'Test Session');
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
