"""Tests for backend.adaptive.journal — character journal generation.

Covers the gate function (should_generate_journal), prompt construction
(build_journal_prompt), entry retrieval (get_journal_entries), and the
module-level FALLBACK_TEMPLATES constant.

All tests use an in-memory SQLite database seeded with the minimal schema
required by the journal module.  No LLM calls are made.
"""

import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.adaptive.journal import (
    FALLBACK_TEMPLATES,
    MIN_MESSAGES_FOR_JOURNAL,
    build_journal_prompt,
    get_journal_entries,
    should_generate_journal,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_db() -> sqlite3.Connection:
    """Create an in-memory SQLite database with the journal-module schema.

    Returns:
        Connection with all four required tables created.
    """
    con = sqlite3.connect(":memory:")
    con.executescript("""
        CREATE TABLE character_journals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            char_id INTEGER NOT NULL,
            session_id INTEGER,
            entry_text TEXT NOT NULL,
            created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id INTEGER NOT NULL DEFAULT 1,
            role TEXT NOT NULL,
            text TEXT NOT NULL,
            ts INTEGER DEFAULT (strftime('%s','now')),
            char_id INTEGER DEFAULT 1
        );

        CREATE TABLE characters (
            id INTEGER PRIMARY KEY,
            name TEXT,
            system_prompt TEXT
        );

        CREATE TABLE user_facts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            character_id INTEGER NOT NULL,
            category TEXT,
            fact_text TEXT NOT NULL,
            confidence REAL DEFAULT 0.8,
            created_ts INTEGER DEFAULT (strftime('%s','now'))
        );
    """)
    return con


def _insert_messages(
    con: sqlite3.Connection,
    count: int,
    session_id: int = 1,
    char_id: int = 1,
) -> None:
    """Insert alternating user/assistant messages into the messages table.

    Args:
        con: Active SQLite connection.
        count: Number of messages to insert.
        session_id: Session to insert messages into.
        char_id: Character ID to tag messages with.
    """
    for i in range(1, count + 1):
        role = "user" if i % 2 == 1 else "assistant"
        text = f"This is message number {i} in session {session_id}."
        con.execute(
            "INSERT INTO messages (session_id, role, text, char_id) VALUES (?, ?, ?, ?)",
            (session_id, role, text, char_id),
        )
    con.commit()


def _insert_journal_entry(
    con: sqlite3.Connection,
    char_id: int,
    session_id: int,
    entry_text: str = "A test journal entry.",
) -> None:
    """Insert a single journal entry row.

    Args:
        con: Active SQLite connection.
        char_id: Character ID.
        session_id: Session the entry belongs to.
        entry_text: The entry body text.
    """
    con.execute(
        "INSERT INTO character_journals (char_id, session_id, entry_text) VALUES (?, ?, ?)",
        (char_id, session_id, entry_text),
    )
    con.commit()


# ---------------------------------------------------------------------------
# TestShouldGenerateJournal
# ---------------------------------------------------------------------------


class TestShouldGenerateJournal:
    """Gate function: returns True only when preconditions are met."""

    def test_returns_true_with_enough_messages(self):
        """5+ messages in a session should unlock journal generation."""
        con = _make_db()
        _insert_messages(con, MIN_MESSAGES_FOR_JOURNAL, session_id=1, char_id=1)
        cur = con.cursor()
        assert should_generate_journal(1, 1, cur) is True

    def test_returns_false_with_few_messages(self):
        """Fewer than MIN_MESSAGES_FOR_JOURNAL messages → no journal."""
        con = _make_db()
        _insert_messages(con, MIN_MESSAGES_FOR_JOURNAL - 1, session_id=1, char_id=1)
        cur = con.cursor()
        assert should_generate_journal(1, 1, cur) is False

    def test_returns_false_with_zero_messages(self):
        """Empty session → no journal (boundary: 0 messages)."""
        con = _make_db()
        cur = con.cursor()
        assert should_generate_journal(1, 1, cur) is False

    def test_returns_false_if_already_generated(self):
        """Existing journal entry for the session must block regeneration."""
        con = _make_db()
        _insert_messages(con, MIN_MESSAGES_FOR_JOURNAL, session_id=1, char_id=1)
        _insert_journal_entry(con, char_id=1, session_id=1)
        cur = con.cursor()
        assert should_generate_journal(1, 1, cur) is False

    def test_returns_true_for_different_session(self):
        """Entry for session 1 must NOT block generation for session 2."""
        con = _make_db()
        # Session 1 already has an entry
        _insert_messages(con, MIN_MESSAGES_FOR_JOURNAL, session_id=1, char_id=1)
        _insert_journal_entry(con, char_id=1, session_id=1)
        # Session 2 has enough messages but no entry yet
        _insert_messages(con, MIN_MESSAGES_FOR_JOURNAL, session_id=2, char_id=1)
        cur = con.cursor()
        assert should_generate_journal(1, 2, cur) is True

    def test_exactly_at_threshold(self):
        """Exactly MIN_MESSAGES_FOR_JOURNAL messages is sufficient (inclusive boundary)."""
        con = _make_db()
        _insert_messages(con, MIN_MESSAGES_FOR_JOURNAL, session_id=1, char_id=1)
        cur = con.cursor()
        assert should_generate_journal(1, 1, cur) is True

    def test_messages_for_different_char_not_counted(self):
        """Messages belonging to a different char_id must not count toward the threshold."""
        con = _make_db()
        # Insert messages for char_id=2, but check for char_id=1
        _insert_messages(con, MIN_MESSAGES_FOR_JOURNAL + 5, session_id=1, char_id=2)
        cur = con.cursor()
        assert should_generate_journal(1, 1, cur) is False


# ---------------------------------------------------------------------------
# TestBuildJournalPrompt
# ---------------------------------------------------------------------------


class TestBuildJournalPrompt:
    """Prompt builder produces a correctly structured string."""

    def _setup_character(self, con: sqlite3.Connection, name: str = "Dae") -> None:
        """Insert a character row into the test database."""
        con.execute(
            "INSERT INTO characters (id, name, system_prompt) VALUES (1, ?, 'You are Dae.')",
            (name,),
        )
        con.commit()

    def test_prompt_contains_character_name(self):
        """Character name must appear somewhere in the generated prompt."""
        con = _make_db()
        self._setup_character(con, "Dae")
        _insert_messages(con, 6, session_id=1, char_id=1)
        cur = con.cursor()
        prompt = build_journal_prompt(1, 1, cur)
        assert "Dae" in prompt

    def test_prompt_includes_messages(self):
        """Message text must be embedded in the prompt so the LLM has context."""
        con = _make_db()
        self._setup_character(con, "Luna")
        con.execute(
            "INSERT INTO messages (session_id, role, text, char_id) VALUES (1, 'user', 'I love stargazing', 1)"
        )
        con.commit()
        cur = con.cursor()
        prompt = build_journal_prompt(1, 1, cur)
        assert "stargazing" in prompt

    def test_prompt_includes_user_facts(self):
        """Known user facts must appear in the prompt."""
        con = _make_db()
        self._setup_character(con, "Dae")
        _insert_messages(con, 3, session_id=1, char_id=1)
        con.execute(
            "INSERT INTO user_facts (character_id, fact_text) VALUES (1, 'User lives in Vancouver')"
        )
        con.commit()
        cur = con.cursor()
        prompt = build_journal_prompt(1, 1, cur)
        assert "Vancouver" in prompt

    def test_prompt_is_first_person_instruction(self):
        """Prompt must instruct the LLM to write in a journal/diary/reflective voice."""
        con = _make_db()
        self._setup_character(con)
        _insert_messages(con, 3, session_id=1, char_id=1)
        cur = con.cursor()
        prompt = build_journal_prompt(1, 1, cur).lower()
        assert any(word in prompt for word in ("journal", "diary", "reflect"))

    def test_prompt_fallback_name_when_no_character(self):
        """When the character row is missing, the prompt should not crash."""
        con = _make_db()
        _insert_messages(con, 3, session_id=1, char_id=99)
        cur = con.cursor()
        # Must not raise; fallback name contains the char_id
        prompt = build_journal_prompt(99, 1, cur)
        assert "99" in prompt or "Character" in prompt

    def test_prompt_no_facts_section_graceful(self):
        """Missing user_facts rows must produce a graceful placeholder, not an error."""
        con = _make_db()
        self._setup_character(con)
        _insert_messages(con, 3, session_id=1, char_id=1)
        cur = con.cursor()
        prompt = build_journal_prompt(1, 1, cur)
        # Should contain either actual facts or the placeholder
        assert "none known yet" in prompt or "---" in prompt

    def test_prompt_is_nonempty_string(self):
        """The returned prompt must always be a non-empty string."""
        con = _make_db()
        self._setup_character(con)
        cur = con.cursor()
        prompt = build_journal_prompt(1, 1, cur)
        assert isinstance(prompt, str) and len(prompt) > 0


# ---------------------------------------------------------------------------
# TestGetJournalEntries
# ---------------------------------------------------------------------------


class TestGetJournalEntries:
    """Entry retrieval respects ordering, limits, and missing-data tolerance."""

    def test_returns_entries_newest_first(self):
        """Entries must be returned in reverse-insertion (newest-first) order."""
        con = _make_db()
        for i in range(1, 4):
            con.execute(
                "INSERT INTO character_journals (char_id, session_id, entry_text) "
                "VALUES (1, ?, ?)",
                (i, f"Entry for session {i}"),
            )
        con.commit()
        cur = con.cursor()
        entries = get_journal_entries(1, cur)
        texts = [e["entry_text"] for e in entries]
        # Newest entry (session 3) should be first
        assert texts[0] == "Entry for session 3"
        assert texts[-1] == "Entry for session 1"

    def test_respects_limit(self):
        """limit=2 must return exactly 2 entries even when 3 exist."""
        con = _make_db()
        for i in range(1, 4):
            con.execute(
                "INSERT INTO character_journals (char_id, session_id, entry_text) "
                "VALUES (1, ?, 'Entry')",
                (i,),
            )
        con.commit()
        cur = con.cursor()
        entries = get_journal_entries(1, cur, limit=2)
        assert len(entries) == 2

    def test_empty_for_new_character(self):
        """A character with no journal entries must return an empty list."""
        con = _make_db()
        cur = con.cursor()
        entries = get_journal_entries(42, cur)
        assert entries == []

    def test_entry_has_expected_keys(self):
        """Every returned dict must contain id, session_id, entry_text, created_at."""
        con = _make_db()
        con.execute(
            "INSERT INTO character_journals (char_id, session_id, entry_text) "
            "VALUES (1, 1, 'Test entry')"
        )
        con.commit()
        cur = con.cursor()
        entries = get_journal_entries(1, cur)
        assert len(entries) == 1
        entry = entries[0]
        for key in ("id", "session_id", "entry_text", "created_at"):
            assert key in entry, f"Missing key: {key}"

    def test_entries_isolated_by_char_id(self):
        """Entries belonging to a different char_id must not appear in the results."""
        con = _make_db()
        con.execute(
            "INSERT INTO character_journals (char_id, session_id, entry_text) "
            "VALUES (1, 1, 'Char 1 entry')"
        )
        con.execute(
            "INSERT INTO character_journals (char_id, session_id, entry_text) "
            "VALUES (2, 1, 'Char 2 entry')"
        )
        con.commit()
        cur = con.cursor()
        entries = get_journal_entries(1, cur)
        assert len(entries) == 1
        assert entries[0]["entry_text"] == "Char 1 entry"

    def test_limit_zero_returns_empty(self):
        """limit=0 must return an empty list (boundary value)."""
        con = _make_db()
        con.execute(
            "INSERT INTO character_journals (char_id, session_id, entry_text) "
            "VALUES (1, 1, 'Entry')"
        )
        con.commit()
        cur = con.cursor()
        entries = get_journal_entries(1, cur, limit=0)
        assert entries == []

    def test_entry_text_preserved(self):
        """The stored entry_text must be returned exactly as inserted."""
        con = _make_db()
        original_text = "Today was really special. I felt a deep connection."
        con.execute(
            "INSERT INTO character_journals (char_id, session_id, entry_text) "
            "VALUES (1, 5, ?)",
            (original_text,),
        )
        con.commit()
        cur = con.cursor()
        entries = get_journal_entries(1, cur)
        assert entries[0]["entry_text"] == original_text


# ---------------------------------------------------------------------------
# TestFallbackTemplates
# ---------------------------------------------------------------------------


class TestFallbackTemplates:
    """FALLBACK_TEMPLATES constant must be a usable, non-trivial list of strings."""

    def test_fallback_templates_exist(self):
        """FALLBACK_TEMPLATES must exist and be a non-empty list."""
        assert isinstance(FALLBACK_TEMPLATES, list)
        assert len(FALLBACK_TEMPLATES) > 0

    def test_fallback_templates_are_strings(self):
        """Every item in FALLBACK_TEMPLATES must be a str instance."""
        for item in FALLBACK_TEMPLATES:
            assert isinstance(item, str), f"Non-string template found: {item!r}"

    def test_fallback_templates_nonempty(self):
        """No template in the list may be an empty or whitespace-only string."""
        for item in FALLBACK_TEMPLATES:
            assert item.strip() != "", f"Empty/whitespace template found: {item!r}"

    def test_fallback_templates_minimum_length(self):
        """Each template should be at least 20 characters — not a trivial stub."""
        for item in FALLBACK_TEMPLATES:
            assert len(item) >= 20, f"Template too short: {item!r}"

    def test_fallback_templates_first_person(self):
        """At least one template must use first-person language (I / me / my)."""
        first_person_words = {"i ", "i'", "me ", "my ", "i've", "i'll", "i'm"}
        has_first_person = any(
            any(word in item.lower() for word in first_person_words)
            for item in FALLBACK_TEMPLATES
        )
        assert has_first_person, "No first-person language found in any fallback template"
