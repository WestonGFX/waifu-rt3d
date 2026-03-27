"""Comprehensive tests for Sprint 5 emotional depth modules.

Covers:
- backend.emotional.dreams  — DreamEntry, constants, gate logic, CRUD
- backend.emotional.capsules — TimeCapsule, constants, CRUD, prompt builders
- backend.emotional.quiz     — OceanScores, SoulProfile, QuizQuestion, OCEAN
                               quiz mechanics, compatibility scoring

All DB tests use in-memory SQLite.  No LLM adapters are called; the LLM path
is exercised only when explicitly testing the generate_dream orchestrator
(which is mocked to avoid network I/O).
"""

from __future__ import annotations

import json
import sqlite3
from datetime import date, timedelta
from unittest.mock import MagicMock, patch

import pytest


# ─────────────────────────────────────────────────────────────────────────────
# Helpers / DB factories
# ─────────────────────────────────────────────────────────────────────────────


def _make_conn() -> sqlite3.Connection:
    """Return a fresh in-memory SQLite connection.

    Returns:
        New :class:`sqlite3.Connection` pointing at ``:memory:``.
    """
    return sqlite3.connect(":memory:")


def _create_messages_table(conn: sqlite3.Connection) -> None:
    """Create the ``messages`` table with the ``content`` column.

    Args:
        conn: Open SQLite connection.
    """
    conn.execute(
        """CREATE TABLE IF NOT EXISTS messages (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            char_id         INTEGER NOT NULL,
            role            TEXT    NOT NULL DEFAULT 'user',
            content         TEXT,
            importance_score REAL
        )"""
    )
    conn.commit()


def _create_relationships_table(conn: sqlite3.Connection) -> None:
    """Create the ``character_relationships`` table.

    Args:
        conn: Open SQLite connection.
    """
    conn.execute(
        """CREATE TABLE IF NOT EXISTS character_relationships (
            char_id    INTEGER PRIMARY KEY,
            bond_level INTEGER NOT NULL DEFAULT 0
        )"""
    )
    conn.commit()


def _seed_messages(conn: sqlite3.Connection, char_id: int, count: int) -> None:
    """Insert ``count`` user messages for ``char_id``.

    Args:
        conn: Open SQLite connection.
        char_id: Character ID for the messages.
        count: Number of rows to insert.
    """
    for i in range(count):
        conn.execute(
            "INSERT INTO messages (char_id, role, content) VALUES (?, 'user', ?)",
            (char_id, f"message content {i}"),
        )
    conn.commit()


def _set_bond_level(conn: sqlite3.Connection, char_id: int, bond_level: int) -> None:
    """Upsert a bond_level for ``char_id``.

    Args:
        conn: Open SQLite connection.
        char_id: Character ID.
        bond_level: Bond level to set (0-100).
    """
    conn.execute(
        """INSERT INTO character_relationships (char_id, bond_level)
           VALUES (?, ?)
           ON CONFLICT(char_id) DO UPDATE SET bond_level = excluded.bond_level""",
        (char_id, bond_level),
    )
    conn.commit()


def _future_date(days: int = 7) -> str:
    """Return an ISO date string that is ``days`` days in the future.

    Args:
        days: Number of days ahead of today.

    Returns:
        ISO date string ``"YYYY-MM-DD"``.
    """
    return (date.today() + timedelta(days=days)).isoformat()


def _past_date(days: int = 1) -> str:
    """Return an ISO date string that is ``days`` days in the past.

    Args:
        days: Number of days behind today.

    Returns:
        ISO date string ``"YYYY-MM-DD"``.
    """
    return (date.today() - timedelta(days=days)).isoformat()


# ─────────────────────────────────────────────────────────────────────────────
# TestDreamsImport
# ─────────────────────────────────────────────────────────────────────────────


class TestDreamsImport:
    """Verify the dreams module and its public symbols are importable."""

    def test_import_module(self):
        """Module imports without errors."""
        import backend.emotional.dreams  # noqa: F401

    def test_dream_entry_dataclass_fields(self):
        """DreamEntry has the required field set."""
        from backend.emotional.dreams import DreamEntry

        entry = DreamEntry(
            id=1,
            char_id=2,
            dream_text="hello dream",
            dream_mood="warm",
            memory_refs=[10, 11],
            delivered=False,
            created_at="2026-03-26T00:00:00",
            delivered_at=None,
        )
        assert entry.id == 1
        assert entry.char_id == 2
        assert entry.dream_text == "hello dream"
        assert entry.dream_mood == "warm"
        assert entry.memory_refs == [10, 11]
        assert entry.delivered is False
        assert entry.delivered_at is None

    def test_dream_entry_delivered_at_defaults_none(self):
        """delivered_at field defaults to None."""
        from backend.emotional.dreams import DreamEntry

        entry = DreamEntry(
            id=99, char_id=1, dream_text="x", dream_mood="surreal",
            memory_refs=[], delivered=False, created_at="2026-01-01T00:00:00",
        )
        assert entry.delivered_at is None


# ─────────────────────────────────────────────────────────────────────────────
# TestDreamsConstants
# ─────────────────────────────────────────────────────────────────────────────


class TestDreamsConstants:
    """Validate DREAM_MOODS and FALLBACK_DREAMS constants."""

    def test_dream_moods_has_six_entries(self):
        """DREAM_MOODS must contain exactly 6 mood keys."""
        from backend.emotional.dreams import DREAM_MOODS

        assert len(DREAM_MOODS) == 6

    def test_dream_moods_expected_keys(self):
        """DREAM_MOODS contains the documented mood set."""
        from backend.emotional.dreams import DREAM_MOODS

        expected = {"mysterious", "warm", "melancholy", "surreal", "romantic", "anxious"}
        assert set(DREAM_MOODS.keys()) == expected

    def test_dream_moods_values_are_strings(self):
        """Every DREAM_MOODS value is a non-empty string."""
        from backend.emotional.dreams import DREAM_MOODS

        for key, val in DREAM_MOODS.items():
            assert isinstance(val, str) and val, f"DREAM_MOODS[{key!r}] is empty"

    def test_fallback_dreams_minimum_count(self):
        """FALLBACK_DREAMS must have at least 6 entries."""
        from backend.emotional.dreams import FALLBACK_DREAMS

        assert len(FALLBACK_DREAMS) >= 6

    def test_fallback_dreams_all_strings(self):
        """Every FALLBACK_DREAMS entry is a non-empty string."""
        from backend.emotional.dreams import FALLBACK_DREAMS

        for item in FALLBACK_DREAMS:
            assert isinstance(item, str) and item


# ─────────────────────────────────────────────────────────────────────────────
# TestShouldGenerateDream
# ─────────────────────────────────────────────────────────────────────────────


class TestShouldGenerateDream:
    """Gate-logic tests for should_generate_dream."""

    def test_empty_db_returns_false(self):
        """Returns False on a totally empty DB (no messages table at all)."""
        from backend.emotional.dreams import should_generate_dream

        conn = _make_conn()
        assert should_generate_dream(1, conn) is False

    def test_no_messages_returns_false(self):
        """Returns False when message count is below the minimum threshold."""
        from backend.emotional.dreams import should_generate_dream

        conn = _make_conn()
        _create_messages_table(conn)
        _create_relationships_table(conn)
        _set_bond_level(conn, 1, 50)
        # Only 5 messages — below the 10-message minimum
        _seed_messages(conn, 1, 5)
        assert should_generate_dream(1, conn) is False

    def test_stranger_bond_returns_false(self):
        """Bond level 0 (Stranger) never generates dreams regardless of messages."""
        from backend.emotional.dreams import should_generate_dream

        conn = _make_conn()
        _create_messages_table(conn)
        _create_relationships_table(conn)
        _set_bond_level(conn, 1, 0)
        _seed_messages(conn, 1, 20)
        assert should_generate_dream(1, conn) is False

    def test_bond_level_10_returns_false(self):
        """Bond level 10 is still Stranger tier — no dreams."""
        from backend.emotional.dreams import should_generate_dream

        conn = _make_conn()
        _create_messages_table(conn)
        _create_relationships_table(conn)
        _set_bond_level(conn, 1, 10)
        _seed_messages(conn, 1, 20)
        assert should_generate_dream(1, conn) is False

    def test_bond_level_11_enough_messages_returns_true(self):
        """Bond level 11 (Friend tier) with enough messages → True."""
        from backend.emotional.dreams import should_generate_dream

        conn = _make_conn()
        _create_messages_table(conn)
        _create_relationships_table(conn)
        _set_bond_level(conn, 1, 11)
        _seed_messages(conn, 1, 15)
        assert should_generate_dream(1, conn) is True

    def test_bond_level_50_enough_messages_returns_true(self):
        """Close Friend bond (31-60) with ≥10 messages returns True."""
        from backend.emotional.dreams import should_generate_dream

        conn = _make_conn()
        _create_messages_table(conn)
        _create_relationships_table(conn)
        _set_bond_level(conn, 1, 50)
        _seed_messages(conn, 1, 10)
        assert should_generate_dream(1, conn) is True

    def test_pending_undelivered_dream_blocks_generation(self):
        """Presence of an undelivered dream prevents creating another."""
        from backend.emotional.dreams import should_generate_dream, _ensure_table

        conn = _make_conn()
        _create_messages_table(conn)
        _create_relationships_table(conn)
        _set_bond_level(conn, 1, 50)
        _seed_messages(conn, 1, 15)

        # Insert an undelivered dream directly
        _ensure_table(conn)
        conn.execute(
            "INSERT INTO dream_entries (char_id, dream_text, dream_mood, delivered) "
            "VALUES (1, 'pending dream', 'warm', 0)"
        )
        conn.commit()

        assert should_generate_dream(1, conn) is False

    def test_delivered_dream_does_not_block_after_cooldown(self):
        """A fully delivered dream from >7 days ago does not block generation
        for a Friend-tier bond (7-day cooldown)."""
        from backend.emotional.dreams import should_generate_dream, _ensure_table

        conn = _make_conn()
        _create_messages_table(conn)
        _create_relationships_table(conn)
        _set_bond_level(conn, 1, 20)  # Friend tier — 7-day cooldown
        _seed_messages(conn, 1, 15)

        _ensure_table(conn)
        old_date = (date.today() - timedelta(days=8)).strftime("%Y-%m-%dT%H:%M:%S")
        conn.execute(
            "INSERT INTO dream_entries (char_id, dream_text, dream_mood, delivered, created_at) "
            "VALUES (1, 'old dream', 'warm', 1, ?)",
            (old_date,),
        )
        conn.commit()

        assert should_generate_dream(1, conn) is True

    def test_missing_relationships_table_returns_false(self):
        """If character_relationships table is absent, bond defaults to 0 → False."""
        from backend.emotional.dreams import should_generate_dream

        conn = _make_conn()
        _create_messages_table(conn)
        # No relationships table — bond falls back to 0
        _seed_messages(conn, 1, 20)
        assert should_generate_dream(1, conn) is False


# ─────────────────────────────────────────────────────────────────────────────
# TestBuildDreamPrompt
# ─────────────────────────────────────────────────────────────────────────────


class TestBuildDreamPrompt:
    """Tests for build_dream_prompt content and bond-level scaling."""

    def test_prompt_contains_char_name(self):
        """Character name appears in the generated prompt."""
        from backend.emotional.dreams import build_dream_prompt

        prompt = build_dream_prompt("Sakura", "You are Sakura.", [], "warm", 50)
        assert "Sakura" in prompt

    def test_prompt_contains_dream_word(self):
        """The word 'dream' appears in the generated prompt."""
        from backend.emotional.dreams import build_dream_prompt

        prompt = build_dream_prompt("Dae", "You are Dae.", [], "surreal", 30)
        assert "dream" in prompt.lower()

    def test_prompt_includes_memory_text(self):
        """Memory seed text is woven into the prompt."""
        from backend.emotional.dreams import build_dream_prompt

        memories = [{"text": "we talked about rainy days", "importance_score": 0.9}]
        prompt = build_dream_prompt("Alana", "You are Alana.", memories, "melancholy", 45)
        assert "rainy days" in prompt

    def test_low_bond_prompt_uses_impersonal_language(self):
        """Bond ≤ 10 triggers the 'impersonal' intimacy instruction."""
        from backend.emotional.dreams import build_dream_prompt

        prompt = build_dream_prompt("Dae", "You are Dae.", [], "mysterious", 5)
        assert "impersonal" in prompt.lower() or "distant" in prompt.lower()

    def test_high_bond_prompt_uses_intimate_language(self):
        """Bond ≥ 91 (Soulmate) triggers the 'genuine emotional intimacy' instruction."""
        from backend.emotional.dreams import build_dream_prompt

        prompt = build_dream_prompt("Dae", "You are Dae.", [], "romantic", 95)
        assert "intimacy" in prompt.lower() or "deeply important" in prompt.lower()

    def test_mid_bond_prompt_uses_trusted_language(self):
        """Bond 31-60 produces 'trusted presence' language."""
        from backend.emotional.dreams import build_dream_prompt

        prompt = build_dream_prompt("Dae", "You are Dae.", [], "warm", 45)
        assert "trusted" in prompt.lower()

    def test_unknown_mood_falls_back_to_mysterious(self):
        """An unrecognised mood key falls back to the 'mysterious' description."""
        from backend.emotional.dreams import build_dream_prompt, DREAM_MOODS

        prompt = build_dream_prompt("Dae", "You are Dae.", [], "nonexistent_mood", 50)
        assert DREAM_MOODS["mysterious"] in prompt

    def test_long_system_prompt_is_trimmed(self):
        """System prompt is truncated to 500 chars + ellipsis."""
        from backend.emotional.dreams import build_dream_prompt

        long_prompt = "X" * 1000
        result = build_dream_prompt("Dae", long_prompt, [], "warm", 50)
        # The excerpt plus "..." = 503 characters at most
        assert "..." in result
        # The full un-trimmed portion must not appear verbatim
        assert "X" * 501 not in result


# ─────────────────────────────────────────────────────────────────────────────
# TestDreamsCRUD
# ─────────────────────────────────────────────────────────────────────────────


class TestDreamsCRUD:
    """CRUD tests: get_undelivered_dreams, mark_dream_delivered, get_dream_history."""

    def test_get_undelivered_dreams_empty_returns_list(self):
        """Returns empty list when no dreams exist."""
        from backend.emotional.dreams import get_undelivered_dreams

        conn = _make_conn()
        result = get_undelivered_dreams(1, conn)
        assert result == []

    def test_inserted_dream_appears_in_get_undelivered(self):
        """A manually inserted undelivered dream is returned by the query."""
        from backend.emotional.dreams import get_undelivered_dreams, _ensure_table

        conn = _make_conn()
        _ensure_table(conn)
        conn.execute(
            "INSERT INTO dream_entries (char_id, dream_text, dream_mood, delivered) "
            "VALUES (1, 'test dream text', 'warm', 0)"
        )
        conn.commit()

        results = get_undelivered_dreams(1, conn)
        assert len(results) == 1
        assert results[0].dream_text == "test dream text"
        assert results[0].delivered is False

    def test_delivered_dream_not_in_undelivered_list(self):
        """Delivered dreams are excluded from get_undelivered_dreams."""
        from backend.emotional.dreams import get_undelivered_dreams, _ensure_table

        conn = _make_conn()
        _ensure_table(conn)
        conn.execute(
            "INSERT INTO dream_entries (char_id, dream_text, dream_mood, delivered) "
            "VALUES (1, 'already delivered', 'warm', 1)"
        )
        conn.commit()

        results = get_undelivered_dreams(1, conn)
        assert results == []

    def test_mark_dream_delivered_valid_id_returns_true(self):
        """mark_dream_delivered returns True on a valid undelivered dream ID."""
        from backend.emotional.dreams import mark_dream_delivered, _ensure_table

        conn = _make_conn()
        _ensure_table(conn)
        conn.execute(
            "INSERT INTO dream_entries (char_id, dream_text, dream_mood, delivered) "
            "VALUES (1, 'deliver me', 'surreal', 0)"
        )
        conn.commit()
        dream_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]

        result = mark_dream_delivered(dream_id, conn)
        assert result is True

    def test_mark_dream_delivered_updates_delivered_flag(self):
        """After mark_dream_delivered, the dream row has delivered=1."""
        from backend.emotional.dreams import mark_dream_delivered, _ensure_table

        conn = _make_conn()
        _ensure_table(conn)
        conn.execute(
            "INSERT INTO dream_entries (char_id, dream_text, dream_mood, delivered) "
            "VALUES (1, 'check flag', 'warm', 0)"
        )
        conn.commit()
        dream_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]

        mark_dream_delivered(dream_id, conn)

        row = conn.execute(
            "SELECT delivered FROM dream_entries WHERE id = ?", (dream_id,)
        ).fetchone()
        assert row[0] == 1

    def test_mark_dream_delivered_invalid_id_returns_false(self):
        """mark_dream_delivered returns False for a non-existent ID."""
        from backend.emotional.dreams import mark_dream_delivered

        conn = _make_conn()
        result = mark_dream_delivered(99999, conn)
        assert result is False

    def test_get_dream_history_returns_newest_first(self):
        """get_dream_history returns entries ordered newest-first (DESC by id)."""
        from backend.emotional.dreams import get_dream_history, _ensure_table

        conn = _make_conn()
        _ensure_table(conn)
        for i in range(3):
            conn.execute(
                "INSERT INTO dream_entries (char_id, dream_text, dream_mood, delivered) "
                "VALUES (1, ?, 'warm', 0)",
                (f"dream {i}",),
            )
        conn.commit()

        history = get_dream_history(1, conn, limit=10)
        assert len(history) == 3
        # Newest ID should be first
        assert history[0].id > history[1].id > history[2].id

    def test_get_dream_history_respects_limit(self):
        """get_dream_history honours the limit parameter."""
        from backend.emotional.dreams import get_dream_history, _ensure_table

        conn = _make_conn()
        _ensure_table(conn)
        for i in range(5):
            conn.execute(
                "INSERT INTO dream_entries (char_id, dream_text, dream_mood, delivered) "
                "VALUES (1, ?, 'warm', 0)",
                (f"dream {i}",),
            )
        conn.commit()

        history = get_dream_history(1, conn, limit=2)
        assert len(history) == 2

    def test_get_dream_history_empty_returns_list(self):
        """Returns empty list when no history exists."""
        from backend.emotional.dreams import get_dream_history

        conn = _make_conn()
        assert get_dream_history(1, conn, limit=5) == []

    def test_memory_refs_round_trip_as_json_list(self):
        """memory_refs are stored as JSON and deserialized back to a list."""
        from backend.emotional.dreams import get_dream_history, _ensure_table

        conn = _make_conn()
        _ensure_table(conn)
        refs = [5, 12, 99]
        conn.execute(
            "INSERT INTO dream_entries (char_id, dream_text, dream_mood, memory_refs, delivered) "
            "VALUES (1, 'refs test', 'warm', ?, 0)",
            (json.dumps(refs),),
        )
        conn.commit()

        history = get_dream_history(1, conn)
        assert history[0].memory_refs == refs


# ─────────────────────────────────────────────────────────────────────────────
# TestCapsulesImport
# ─────────────────────────────────────────────────────────────────────────────


class TestCapsulesImport:
    """Verify capsules module and public symbols are importable."""

    def test_import_module(self):
        """Module imports without errors."""
        import backend.emotional.capsules  # noqa: F401

    def test_time_capsule_dataclass_fields(self):
        """TimeCapsule has all required fields."""
        from backend.emotional.capsules import TimeCapsule

        cap = TimeCapsule(
            id=1,
            char_id=2,
            creator="user",
            message_text="Hello future me",
            character_commentary=None,
            deliver_at="2026-04-01",
            delivered=False,
            delivered_at=None,
            context_snapshot=None,
            created_at="2026-03-26T00:00:00",
        )
        assert cap.creator == "user"
        assert cap.delivered is False
        assert cap.context_snapshot is None

    def test_delivery_periods_has_six_entries(self):
        """DELIVERY_PERIODS must contain exactly 6 keys."""
        from backend.emotional.capsules import DELIVERY_PERIODS

        assert len(DELIVERY_PERIODS) == 6

    def test_delivery_periods_expected_keys(self):
        """DELIVERY_PERIODS has the documented period labels."""
        from backend.emotional.capsules import DELIVERY_PERIODS

        expected = {"1_week", "2_weeks", "1_month", "3_months", "6_months", "1_year"}
        assert set(DELIVERY_PERIODS.keys()) == expected

    def test_delivery_periods_values_are_positive_ints(self):
        """Every DELIVERY_PERIODS value is a positive integer."""
        from backend.emotional.capsules import DELIVERY_PERIODS

        for key, val in DELIVERY_PERIODS.items():
            assert isinstance(val, int) and val > 0, f"Bad value for {key!r}"


# ─────────────────────────────────────────────────────────────────────────────
# TestCreateCapsule
# ─────────────────────────────────────────────────────────────────────────────


class TestCreateCapsule:
    """Tests for create_capsule."""

    def test_create_capsule_returns_time_capsule(self):
        """create_capsule returns a TimeCapsule instance."""
        from backend.emotional.capsules import create_capsule, TimeCapsule

        conn = _make_conn()
        cap = create_capsule(1, "Stay strong!", _future_date(7), conn)
        assert isinstance(cap, TimeCapsule)

    def test_create_capsule_correct_fields(self):
        """Created capsule has correct char_id, message, and delivered=False."""
        from backend.emotional.capsules import create_capsule

        conn = _make_conn()
        deliver = _future_date(14)
        cap = create_capsule(3, "You've got this.", deliver, conn)

        assert cap.char_id == 3
        assert cap.message_text == "You've got this."
        assert cap.deliver_at == deliver
        assert cap.delivered is False
        assert cap.delivered_at is None
        assert cap.character_commentary is None

    def test_create_capsule_past_date_raises_value_error(self):
        """Providing a past date raises ValueError."""
        from backend.emotional.capsules import create_capsule

        conn = _make_conn()
        with pytest.raises(ValueError, match="today or in the future"):
            create_capsule(1, "Too late.", _past_date(1), conn)

    def test_create_capsule_today_is_valid(self):
        """Providing today's date is valid (not strictly in the past)."""
        from backend.emotional.capsules import create_capsule

        conn = _make_conn()
        today = date.today().isoformat()
        cap = create_capsule(1, "Same day delivery.", today, conn)
        assert cap.deliver_at == today

    def test_create_capsule_context_snapshot_stored_as_json(self):
        """context_snapshot dict is serialised to JSON in the DB."""
        from backend.emotional.capsules import create_capsule

        conn = _make_conn()
        snapshot = {"mood": "happy", "bond_level": 42, "user_facts": ["owns a cat"]}
        cap = create_capsule(1, "Context test.", _future_date(7), conn, context_snapshot=snapshot)

        row = conn.execute(
            "SELECT context_snapshot FROM time_capsules WHERE id = ?", (cap.id,)
        ).fetchone()
        stored = json.loads(row[0])
        assert stored["mood"] == "happy"
        assert stored["bond_level"] == 42

    def test_create_capsule_creator_user_default(self):
        """creator defaults to 'user'."""
        from backend.emotional.capsules import create_capsule

        conn = _make_conn()
        cap = create_capsule(1, "Default creator.", _future_date(7), conn)
        assert cap.creator == "user"

    def test_create_capsule_creator_character(self):
        """creator='character' is stored correctly."""
        from backend.emotional.capsules import create_capsule

        conn = _make_conn()
        cap = create_capsule(1, "Char-written.", _future_date(7), conn, creator="character")
        assert cap.creator == "character"

    def test_create_capsule_invalid_date_format_raises(self):
        """An unparseable date string raises ValueError."""
        from backend.emotional.capsules import create_capsule

        conn = _make_conn()
        with pytest.raises(ValueError):
            create_capsule(1, "Bad date.", "not-a-date", conn)


# ─────────────────────────────────────────────────────────────────────────────
# TestGetPendingAndReadyCapsules
# ─────────────────────────────────────────────────────────────────────────────


class TestGetPendingAndReadyCapsules:
    """Tests for get_pending_capsules and get_ready_capsules."""

    def test_get_pending_empty_db_returns_empty_list(self):
        """get_pending_capsules on a fresh DB returns []."""
        from backend.emotional.capsules import get_pending_capsules

        conn = _make_conn()
        assert get_pending_capsules(1, conn) == []

    def test_get_pending_returns_undelivered_sorted_by_date(self):
        """Pending capsules are sorted by deliver_at ascending."""
        from backend.emotional.capsules import create_capsule, get_pending_capsules

        conn = _make_conn()
        create_capsule(1, "far future", _future_date(30), conn)
        create_capsule(1, "near future", _future_date(7), conn)

        pending = get_pending_capsules(1, conn)
        assert len(pending) == 2
        # Near future should come first
        assert pending[0].deliver_at < pending[1].deliver_at

    def test_get_ready_capsules_future_date_returns_empty(self):
        """A capsule with a future deliver_at is not yet ready."""
        from backend.emotional.capsules import create_capsule, get_ready_capsules

        conn = _make_conn()
        create_capsule(1, "not yet", _future_date(10), conn)
        assert get_ready_capsules(1, conn) == []

    def test_get_ready_capsules_past_date_returns_capsule(self):
        """A capsule with deliver_at in the past is immediately ready."""
        from backend.emotional.capsules import get_ready_capsules
        from backend.emotional.capsules import _ensure_table

        conn = _make_conn()
        _ensure_table(conn)
        past = _past_date(2)
        conn.execute(
            "INSERT INTO time_capsules (char_id, creator, message_text, deliver_at) "
            "VALUES (1, 'user', 'overdue capsule', ?)",
            (past,),
        )
        conn.commit()

        ready = get_ready_capsules(1, conn)
        assert len(ready) == 1
        assert ready[0].message_text == "overdue capsule"

    def test_get_ready_capsules_today_returns_capsule(self):
        """A capsule with deliver_at = today is ready."""
        from backend.emotional.capsules import get_ready_capsules
        from backend.emotional.capsules import _ensure_table

        conn = _make_conn()
        _ensure_table(conn)
        today = date.today().isoformat()
        conn.execute(
            "INSERT INTO time_capsules (char_id, creator, message_text, deliver_at) "
            "VALUES (1, 'user', 'today capsule', ?)",
            (today,),
        )
        conn.commit()

        ready = get_ready_capsules(1, conn)
        assert len(ready) == 1

    def test_delivered_capsule_not_in_pending(self):
        """A delivered capsule is excluded from get_pending_capsules."""
        from backend.emotional.capsules import (
            create_capsule,
            deliver_capsule,
            get_pending_capsules,
        )

        conn = _make_conn()
        cap = create_capsule(1, "deliver me", _future_date(7), conn)
        deliver_capsule(cap.id, conn, "great message!")
        assert get_pending_capsules(1, conn) == []


# ─────────────────────────────────────────────────────────────────────────────
# TestDeliverCapsule
# ─────────────────────────────────────────────────────────────────────────────


class TestDeliverCapsule:
    """Tests for deliver_capsule."""

    def test_deliver_capsule_valid_returns_true(self):
        """Delivering an undelivered capsule returns True."""
        from backend.emotional.capsules import create_capsule, deliver_capsule
        from backend.emotional.capsules import _ensure_table

        conn = _make_conn()
        _ensure_table(conn)
        past = _past_date(1)
        conn.execute(
            "INSERT INTO time_capsules (char_id, creator, message_text, deliver_at) "
            "VALUES (1, 'user', 'deliver this', ?)",
            (past,),
        )
        conn.commit()
        cap_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]

        result = deliver_capsule(cap_id, conn, "So proud of you.")
        assert result is True

    def test_deliver_capsule_sets_delivered_flag(self):
        """After delivery, the row has delivered=1 and commentary stored."""
        from backend.emotional.capsules import deliver_capsule
        from backend.emotional.capsules import _ensure_table

        conn = _make_conn()
        _ensure_table(conn)
        past = _past_date(1)
        conn.execute(
            "INSERT INTO time_capsules (char_id, creator, message_text, deliver_at) "
            "VALUES (1, 'user', 'check me', ?)",
            (past,),
        )
        conn.commit()
        cap_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]

        deliver_capsule(cap_id, conn, "Beautiful message.")
        row = conn.execute(
            "SELECT delivered, character_commentary FROM time_capsules WHERE id = ?",
            (cap_id,),
        ).fetchone()
        assert row[0] == 1
        assert row[1] == "Beautiful message."

    def test_deliver_capsule_already_delivered_returns_false(self):
        """Delivering an already-delivered capsule is idempotent → False."""
        from backend.emotional.capsules import deliver_capsule
        from backend.emotional.capsules import _ensure_table

        conn = _make_conn()
        _ensure_table(conn)
        past = _past_date(1)
        conn.execute(
            "INSERT INTO time_capsules (char_id, creator, message_text, deliver_at) "
            "VALUES (1, 'user', 'already done', ?)",
            (past,),
        )
        conn.commit()
        cap_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]

        deliver_capsule(cap_id, conn)
        result = deliver_capsule(cap_id, conn, "Try again.")
        assert result is False

    def test_deliver_capsule_nonexistent_returns_false(self):
        """Delivering a non-existent capsule ID returns False."""
        from backend.emotional.capsules import deliver_capsule

        conn = _make_conn()
        assert deliver_capsule(99999, conn) is False


# ─────────────────────────────────────────────────────────────────────────────
# TestDeleteCapsule
# ─────────────────────────────────────────────────────────────────────────────


class TestDeleteCapsule:
    """Tests for delete_capsule."""

    def test_delete_undelivered_capsule_returns_true(self):
        """Deleting an undelivered capsule returns True and removes the row."""
        from backend.emotional.capsules import create_capsule, delete_capsule

        conn = _make_conn()
        cap = create_capsule(1, "delete me", _future_date(7), conn)
        result = delete_capsule(cap.id, conn)
        assert result is True

        row = conn.execute(
            "SELECT id FROM time_capsules WHERE id = ?", (cap.id,)
        ).fetchone()
        assert row is None

    def test_delete_delivered_capsule_returns_false(self):
        """Delivered capsules may not be deleted."""
        from backend.emotional.capsules import deliver_capsule, delete_capsule
        from backend.emotional.capsules import _ensure_table

        conn = _make_conn()
        _ensure_table(conn)
        past = _past_date(1)
        conn.execute(
            "INSERT INTO time_capsules (char_id, creator, message_text, deliver_at) "
            "VALUES (1, 'user', 'delivered one', ?)",
            (past,),
        )
        conn.commit()
        cap_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]

        deliver_capsule(cap_id, conn)
        result = delete_capsule(cap_id, conn)
        assert result is False

    def test_delete_nonexistent_capsule_returns_false(self):
        """Deleting a non-existent ID returns False."""
        from backend.emotional.capsules import delete_capsule

        conn = _make_conn()
        assert delete_capsule(99999, conn) is False


# ─────────────────────────────────────────────────────────────────────────────
# TestCapsulePromptBuilders
# ─────────────────────────────────────────────────────────────────────────────


class TestCapsulePromptBuilders:
    """Tests for build_delivery_prompt and build_character_capsule_prompt."""

    def test_build_delivery_prompt_contains_char_name(self):
        """The delivery prompt includes the character's name."""
        from backend.emotional.capsules import create_capsule, build_delivery_prompt

        conn = _make_conn()
        cap = create_capsule(1, "Look forward!", _future_date(1), conn)
        prompt = build_delivery_prompt(cap, "Dae", "You are Dae.")
        assert "Dae" in prompt

    def test_build_delivery_prompt_contains_message_text(self):
        """The original capsule message text appears verbatim in the prompt."""
        from backend.emotional.capsules import create_capsule, build_delivery_prompt

        conn = _make_conn()
        cap = create_capsule(1, "Keep shining bright!", _future_date(1), conn)
        prompt = build_delivery_prompt(cap, "Alana", "You are Alana.")
        assert "Keep shining bright!" in prompt

    def test_build_delivery_prompt_with_context_snapshot(self):
        """Snapshot facts appear in a then-vs-now section of the delivery prompt."""
        from backend.emotional.capsules import create_capsule, build_delivery_prompt

        conn = _make_conn()
        snapshot = {"mood": "hopeful", "bond_level": 60, "user_facts": ["learning guitar"]}
        cap = create_capsule(
            1, "Practice every day.", _future_date(1), conn, context_snapshot=snapshot
        )
        prompt = build_delivery_prompt(cap, "Dae", "You are Dae.", current_facts=["plays guitar well"])
        # Snapshot mood/bond info should appear
        assert "hopeful" in prompt or "60" in prompt

    def test_build_character_capsule_prompt_contains_char_name(self):
        """Character capsule prompt contains char_name."""
        from backend.emotional.capsules import build_character_capsule_prompt

        prompt = build_character_capsule_prompt("Sakura", "You are Sakura.", "recent chat...", 50)
        assert "Sakura" in prompt

    def test_build_character_capsule_prompt_contains_time_capsule(self):
        """Prompt contains the phrase 'time capsule'."""
        from backend.emotional.capsules import build_character_capsule_prompt

        prompt = build_character_capsule_prompt("Dae", "You are Dae.", "...", 30)
        assert "time capsule" in prompt.lower()

    def test_build_character_capsule_prompt_low_bond_tone(self):
        """Low bond (< 20) produces 'getting to know each other' tone guidance."""
        from backend.emotional.capsules import build_character_capsule_prompt

        prompt = build_character_capsule_prompt("Dae", "You are Dae.", "...", 10)
        assert "getting to know" in prompt.lower() or "warm" in prompt.lower()

    def test_build_character_capsule_prompt_high_bond_tone(self):
        """High bond (≥ 80) produces the deepest intimacy tone guidance."""
        from backend.emotional.capsules import build_character_capsule_prompt

        prompt = build_character_capsule_prompt("Dae", "You are Dae.", "...", 90)
        assert "deep" in prompt.lower() or "vulnerable" in prompt.lower()

    def test_build_delivery_prompt_user_vs_character_creator_label(self):
        """'user wrote' vs 'you wrote' changes based on creator field."""
        from backend.emotional.capsules import build_delivery_prompt
        from backend.emotional.capsules import _ensure_table

        conn = _make_conn()
        _ensure_table(conn)
        future = _future_date(1)

        # user-created capsule
        conn.execute(
            "INSERT INTO time_capsules (char_id, creator, message_text, deliver_at) "
            "VALUES (1, 'user', 'user msg', ?)", (future,)
        )
        conn.commit()
        uid = conn.execute("SELECT last_insert_rowid()").fetchone()[0]

        from backend.emotional.capsules import _row_to_capsule, _SELECT_COLS
        row = conn.execute(f"SELECT {_SELECT_COLS} FROM time_capsules WHERE id = ?", (uid,)).fetchone()
        user_cap = _row_to_capsule(row)
        user_prompt = build_delivery_prompt(user_cap, "Dae", "You are Dae.")
        assert "the user wrote" in user_prompt

        # character-created capsule
        conn.execute(
            "INSERT INTO time_capsules (char_id, creator, message_text, deliver_at) "
            "VALUES (1, 'character', 'char msg', ?)", (future,)
        )
        conn.commit()
        cid = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
        row2 = conn.execute(f"SELECT {_SELECT_COLS} FROM time_capsules WHERE id = ?", (cid,)).fetchone()
        char_cap = _row_to_capsule(row2)
        char_prompt = build_delivery_prompt(char_cap, "Dae", "You are Dae.")
        assert "you wrote" in char_prompt


# ─────────────────────────────────────────────────────────────────────────────
# TestGetCapsuleSummary
# ─────────────────────────────────────────────────────────────────────────────


class TestGetCapsuleSummary:
    """Tests for get_capsule_summary."""

    def test_empty_db_returns_zeroed_summary(self):
        """Empty DB returns all-zero summary dict."""
        from backend.emotional.capsules import get_capsule_summary

        conn = _make_conn()
        summary = get_capsule_summary(1, conn)
        assert summary == {"pending": 0, "next_delivery": None, "total_delivered": 0}

    def test_summary_correct_pending_count(self):
        """pending count matches the number of undelivered capsules."""
        from backend.emotional.capsules import create_capsule, get_capsule_summary

        conn = _make_conn()
        create_capsule(1, "a", _future_date(5), conn)
        create_capsule(1, "b", _future_date(10), conn)
        summary = get_capsule_summary(1, conn)
        assert summary["pending"] == 2

    def test_summary_next_delivery_is_soonest(self):
        """next_delivery is the ISO date of the soonest pending capsule."""
        from backend.emotional.capsules import create_capsule, get_capsule_summary

        conn = _make_conn()
        near = _future_date(3)
        far = _future_date(20)
        create_capsule(1, "far", far, conn)
        create_capsule(1, "near", near, conn)
        summary = get_capsule_summary(1, conn)
        assert summary["next_delivery"] == near

    def test_summary_delivered_count_increments(self):
        """total_delivered increases after a capsule is delivered."""
        from backend.emotional.capsules import deliver_capsule, get_capsule_summary
        from backend.emotional.capsules import _ensure_table

        conn = _make_conn()
        _ensure_table(conn)
        past = _past_date(1)
        conn.execute(
            "INSERT INTO time_capsules (char_id, creator, message_text, deliver_at) "
            "VALUES (1, 'user', 'already delivered', ?)", (past,)
        )
        conn.commit()
        cap_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]

        deliver_capsule(cap_id, conn)
        summary = get_capsule_summary(1, conn)
        assert summary["total_delivered"] == 1
        assert summary["pending"] == 0

    def test_summary_keys_always_present(self):
        """All three expected keys are present regardless of data."""
        from backend.emotional.capsules import get_capsule_summary

        conn = _make_conn()
        summary = get_capsule_summary(99, conn)
        assert "pending" in summary
        assert "next_delivery" in summary
        assert "total_delivered" in summary


# ─────────────────────────────────────────────────────────────────────────────
# TestQuizImport
# ─────────────────────────────────────────────────────────────────────────────


class TestQuizImport:
    """Verify the quiz module and its public symbols are importable."""

    def test_import_module(self):
        """Module imports without errors."""
        import backend.emotional.quiz  # noqa: F401

    def test_ocean_scores_defaults_fifty(self):
        """OceanScores all default to 50."""
        from backend.emotional.quiz import OceanScores

        scores = OceanScores()
        assert scores.openness == 50
        assert scores.conscientiousness == 50
        assert scores.extraversion == 50
        assert scores.agreeableness == 50
        assert scores.neuroticism == 50

    def test_ocean_scores_custom_values(self):
        """OceanScores accepts custom values per field."""
        from backend.emotional.quiz import OceanScores

        scores = OceanScores(openness=80, neuroticism=25)
        assert scores.openness == 80
        assert scores.neuroticism == 25
        # Others still default
        assert scores.conscientiousness == 50

    def test_ocean_scores_to_dict_round_trip(self):
        """to_dict / from_dict round-trip preserves all values."""
        from backend.emotional.quiz import OceanScores

        original = OceanScores(openness=70, conscientiousness=40, extraversion=60,
                               agreeableness=75, neuroticism=30)
        restored = OceanScores.from_dict(original.to_dict())
        assert original == restored

    def test_ocean_scores_from_dict_missing_keys_default_fifty(self):
        """from_dict with partial data fills missing keys with 50."""
        from backend.emotional.quiz import OceanScores

        scores = OceanScores.from_dict({"openness": 80})
        assert scores.openness == 80
        assert scores.conscientiousness == 50

    def test_quiz_question_dataclass(self):
        """QuizQuestion stores id, text, category, and follow_up."""
        from backend.emotional.quiz import QuizQuestion

        q = QuizQuestion("q99", "Test question?", "openness", "Follow up...")
        assert q.id == "q99"
        assert q.category == "openness"

    def test_soul_profile_has_correct_attributes(self):
        """SoulProfile carries all expected fields."""
        from backend.emotional.quiz import SoulProfile, OceanScores

        profile = SoulProfile(
            id=1,
            char_id=2,
            quiz_answers={"q1": "Tesla"},
            ocean_scores=OceanScores(),
            char_ocean_scores=OceanScores(),
            compatibility_pct=None,
            connection_summary=None,
            completed_at=None,
            created_at="2026-01-01T00:00:00",
        )
        assert profile.char_id == 2
        assert profile.completed_at is None


# ─────────────────────────────────────────────────────────────────────────────
# TestQuizQuestions
# ─────────────────────────────────────────────────────────────────────────────


class TestQuizQuestions:
    """Validate the QUIZ_QUESTIONS bank structure."""

    def test_quiz_questions_has_exactly_twenty(self):
        """QUIZ_QUESTIONS must contain exactly 20 entries."""
        from backend.emotional.quiz import QUIZ_QUESTIONS

        assert len(QUIZ_QUESTIONS) == 20

    def test_each_ocean_dimension_has_four_questions(self):
        """Each OCEAN dimension has exactly 4 questions."""
        from backend.emotional.quiz import QUIZ_QUESTIONS

        from collections import Counter
        dim_counts = Counter(q.category for q in QUIZ_QUESTIONS)
        for dim in ("openness", "conscientiousness", "extraversion", "agreeableness", "neuroticism"):
            assert dim_counts[dim] == 4, f"{dim} has {dim_counts[dim]} questions (expected 4)"

    def test_all_question_ids_are_unique(self):
        """Every question has a distinct id."""
        from backend.emotional.quiz import QUIZ_QUESTIONS

        ids = [q.id for q in QUIZ_QUESTIONS]
        assert len(ids) == len(set(ids))

    def test_question_categories_are_valid_ocean_dims(self):
        """Every question's category is a valid OCEAN dimension name."""
        from backend.emotional.quiz import QUIZ_QUESTIONS

        valid = {"openness", "conscientiousness", "extraversion", "agreeableness", "neuroticism"}
        for q in QUIZ_QUESTIONS:
            assert q.category in valid, f"Invalid category {q.category!r} on question {q.id!r}"

    def test_all_questions_have_non_empty_text(self):
        """Every question's text field is a non-empty string."""
        from backend.emotional.quiz import QUIZ_QUESTIONS

        for q in QUIZ_QUESTIONS:
            assert isinstance(q.text, str) and q.text.strip(), f"Empty text on {q.id!r}"


# ─────────────────────────────────────────────────────────────────────────────
# TestGetOrCreateProfile
# ─────────────────────────────────────────────────────────────────────────────


class TestGetOrCreateProfile:
    """Tests for get_or_create_profile."""

    def test_creates_new_profile(self):
        """Creates a SoulProfile row for a new char_id."""
        from backend.emotional.quiz import get_or_create_profile

        conn = _make_conn()
        profile = get_or_create_profile(1, conn)
        assert profile.char_id == 1
        assert profile.quiz_answers == {}
        assert profile.compatibility_pct is None

    def test_returns_existing_profile(self):
        """Second call returns the same profile — no duplicate rows."""
        from backend.emotional.quiz import get_or_create_profile

        conn = _make_conn()
        p1 = get_or_create_profile(1, conn)
        p2 = get_or_create_profile(1, conn)
        assert p1.id == p2.id

    def test_new_profile_uses_default_char_ocean(self):
        """Fresh profile has DEFAULT_CHAR_OCEAN scores set on char_ocean_scores."""
        from backend.emotional.quiz import get_or_create_profile, DEFAULT_CHAR_OCEAN

        conn = _make_conn()
        profile = get_or_create_profile(1, conn)
        assert profile.char_ocean_scores.openness == DEFAULT_CHAR_OCEAN.openness
        assert profile.char_ocean_scores.agreeableness == DEFAULT_CHAR_OCEAN.agreeableness


# ─────────────────────────────────────────────────────────────────────────────
# TestGetNextQuestion
# ─────────────────────────────────────────────────────────────────────────────


class TestGetNextQuestion:
    """Tests for get_next_question."""

    def test_fresh_profile_returns_q1(self):
        """Fresh profile returns the first QUIZ_QUESTIONS entry (q1)."""
        from backend.emotional.quiz import get_next_question, QUIZ_QUESTIONS

        conn = _make_conn()
        q = get_next_question(1, conn)
        assert q is not None
        assert q.id == QUIZ_QUESTIONS[0].id

    def test_returns_none_when_all_answered(self):
        """Returns None once all 20 questions have been answered."""
        from backend.emotional.quiz import get_next_question, record_answer, QUIZ_QUESTIONS

        conn = _make_conn()
        for question in QUIZ_QUESTIONS:
            record_answer(1, question.id, "some answer", conn)

        q = get_next_question(1, conn)
        assert q is None

    def test_skips_already_answered_questions(self):
        """After answering q1, the next question is q6 (second openness question)."""
        from backend.emotional.quiz import get_next_question, record_answer, QUIZ_QUESTIONS

        conn = _make_conn()
        first_id = QUIZ_QUESTIONS[0].id
        record_answer(1, first_id, "interesting answer", conn)

        q = get_next_question(1, conn)
        assert q is not None
        assert q.id != first_id


# ─────────────────────────────────────────────────────────────────────────────
# TestRecordAnswer
# ─────────────────────────────────────────────────────────────────────────────


class TestRecordAnswer:
    """Tests for record_answer."""

    def test_record_answer_increments_answers_so_far(self):
        """answers_so_far is 1 after first answer."""
        from backend.emotional.quiz import record_answer

        conn = _make_conn()
        result = record_answer(1, "q1", "I'd invite Nikola Tesla", conn)
        assert result["answers_so_far"] == 1

    def test_record_answer_total_questions_is_twenty(self):
        """total_questions is always 20."""
        from backend.emotional.quiz import record_answer

        conn = _make_conn()
        result = record_answer(1, "q1", "Any answer", conn)
        assert result["total_questions"] == 20

    def test_record_answer_is_complete_false_initially(self):
        """is_complete is False after the first answer."""
        from backend.emotional.quiz import record_answer

        conn = _make_conn()
        result = record_answer(1, "q1", "Any answer", conn)
        assert result["is_complete"] is False

    def test_record_answer_marks_complete_at_threshold(self):
        """is_complete flips to True once the minimum threshold (15) is crossed."""
        from backend.emotional.quiz import record_answer, QUIZ_QUESTIONS, _MIN_ANSWERS

        conn = _make_conn()
        # Answer exactly _MIN_ANSWERS questions
        answered = 0
        for question in QUIZ_QUESTIONS:
            result = record_answer(1, question.id, "a typical answer", conn)
            answered += 1
            if answered == _MIN_ANSWERS:
                assert result["is_complete"] is True
                break

    def test_record_answer_invalid_question_id_raises(self):
        """Unknown question_id raises ValueError."""
        from backend.emotional.quiz import record_answer

        conn = _make_conn()
        with pytest.raises(ValueError, match="Unknown question_id"):
            record_answer(1, "q99_bogus", "some text", conn)

    def test_record_answer_duplicate_is_idempotent(self):
        """Recording the same question_id twice does not increase answers_so_far."""
        from backend.emotional.quiz import record_answer

        conn = _make_conn()
        record_answer(1, "q1", "First answer", conn)
        result = record_answer(1, "q1", "Second answer — should be ignored", conn)
        assert result["answers_so_far"] == 1

    def test_record_answer_returns_question_id(self):
        """Result dict contains the submitted question_id."""
        from backend.emotional.quiz import record_answer

        conn = _make_conn()
        result = record_answer(1, "q2", "I prefer planning", conn)
        assert result["question_id"] == "q2"


# ─────────────────────────────────────────────────────────────────────────────
# TestScoreAnswer
# ─────────────────────────────────────────────────────────────────────────────


class TestScoreAnswer:
    """Tests for score_answer keyword heuristic."""

    def _openness_q(self):
        """Return the first openness quiz question."""
        from backend.emotional.quiz import QUIZ_QUESTIONS

        for q in QUIZ_QUESTIONS:
            if q.category == "openness":
                return q

    def _conscientiousness_q(self):
        """Return the first conscientiousness quiz question."""
        from backend.emotional.quiz import QUIZ_QUESTIONS

        for q in QUIZ_QUESTIONS:
            if q.category == "conscientiousness":
                return q

    def _neuroticism_q(self):
        """Return the first neuroticism quiz question."""
        from backend.emotional.quiz import QUIZ_QUESTIONS

        for q in QUIZ_QUESTIONS:
            if q.category == "neuroticism":
                return q

    def test_strong_positive_keywords_high_score(self):
        """Multiple positive keywords produce a score above 60."""
        from backend.emotional.quiz import score_answer

        q = self._openness_q()
        # "creative curious imaginative" — three openness-positive keywords
        score = score_answer(q, "I love creative and imaginative art and music adventures")
        assert score > 60

    def test_strong_negative_keywords_low_score(self):
        """Multiple negative keywords produce a score below 40."""
        from backend.emotional.quiz import score_answer

        q = self._openness_q()
        # "traditional familiar same routine" — four openness-negative keywords
        score = score_answer(q, "I like the traditional familiar same routine, very conventional")
        assert score < 40

    def test_neutral_text_returns_fifty(self):
        """Text with no recognisable keywords scores exactly 50."""
        from backend.emotional.quiz import score_answer

        q = self._openness_q()
        score = score_answer(q, "hmm interesting question")
        assert score == 50

    def test_score_within_valid_range(self):
        """score_answer always returns a value in [0, 100]."""
        from backend.emotional.quiz import score_answer, QUIZ_QUESTIONS

        extreme_positive = " ".join([
            "creative curious imaginative adventure explore new different art music abstract"
        ])
        extreme_negative = " ".join([
            "traditional routine familiar same practical conventional boring simple plain repetitive"
        ])
        for q in QUIZ_QUESTIONS:
            for text in (extreme_positive, extreme_negative, "", "blah"):
                s = score_answer(q, text)
                assert 0 <= s <= 100, f"score {s} out of range for question {q.id!r}"

    def test_conscientiousness_positive_keywords(self):
        """Conscientiousness-positive keywords score high for a C question."""
        from backend.emotional.quiz import score_answer

        q = self._conscientiousness_q()
        score = score_answer(q, "I always plan, organise, and keep a list of goals to finish")
        assert score > 60

    def test_neuroticism_positive_keywords(self):
        """Neuroticism-positive keywords score high for an N question."""
        from backend.emotional.quiz import score_answer

        q = self._neuroticism_q()
        score = score_answer(q, "I worry and feel anxious and overthink everything, nervous stress")
        assert score > 60


# ─────────────────────────────────────────────────────────────────────────────
# TestComputeCompatibility
# ─────────────────────────────────────────────────────────────────────────────


class TestComputeCompatibility:
    """Tests for compute_compatibility."""

    def test_identical_scores_high_compatibility(self):
        """Identical user and char scores produce compatibility above 80."""
        from backend.emotional.quiz import compute_compatibility, OceanScores

        scores = OceanScores(openness=70, conscientiousness=50, extraversion=60,
                             agreeableness=80, neuroticism=40)
        result = compute_compatibility(scores, scores)
        assert result > 80

    def test_opposite_scores_low_compatibility(self):
        """Maximally different O/E/A scores produce compatibility below 40."""
        from backend.emotional.quiz import compute_compatibility, OceanScores

        user = OceanScores(openness=0, conscientiousness=50, extraversion=0,
                           agreeableness=0, neuroticism=50)
        char = OceanScores(openness=100, conscientiousness=50, extraversion=100,
                           agreeableness=100, neuroticism=50)
        result = compute_compatibility(user, char)
        assert result < 40

    def test_result_is_within_zero_to_hundred(self):
        """compute_compatibility always returns a value in [0, 100]."""
        from backend.emotional.quiz import compute_compatibility, OceanScores

        for _ in range(10):
            u = OceanScores(openness=0, conscientiousness=0, extraversion=0,
                            agreeableness=0, neuroticism=0)
            c = OceanScores(openness=100, conscientiousness=100, extraversion=100,
                            agreeableness=100, neuroticism=100)
            r = compute_compatibility(u, c)
            assert 0 <= r <= 100

    def test_near_identical_scores_very_high(self):
        """Scores differing by ≤5 across all dimensions give ≥90%."""
        from backend.emotional.quiz import compute_compatibility, OceanScores

        u = OceanScores(openness=70, conscientiousness=40, extraversion=60,
                        agreeableness=75, neuroticism=30)
        c = OceanScores(openness=75, conscientiousness=45, extraversion=60,
                        agreeableness=80, neuroticism=35)
        result = compute_compatibility(u, c)
        assert result >= 90

    def test_complementarity_for_conscientiousness(self):
        """For C dimension, user+char summing to 100 is the ideal complement."""
        from backend.emotional.quiz import compute_compatibility, OceanScores

        # Perfect C complement: user=30, char=70 → 100-30=70, |70-70|=0 → 100 score
        user = OceanScores(openness=75, conscientiousness=30, extraversion=60,
                           agreeableness=80, neuroticism=35)
        char = OceanScores(openness=75, conscientiousness=70, extraversion=60,
                           agreeableness=80, neuroticism=65)
        result = compute_compatibility(user, char)
        assert result >= 80


# ─────────────────────────────────────────────────────────────────────────────
# TestGetCompatibilityCard
# ─────────────────────────────────────────────────────────────────────────────


class TestGetCompatibilityCard:
    """Tests for get_compatibility_card."""

    def test_none_when_no_profile(self):
        """Returns None when no soul_profiles row exists for char_id."""
        from backend.emotional.quiz import get_compatibility_card, _ensure_table

        conn = _make_conn()
        _ensure_table(conn)
        result = get_compatibility_card(999, conn)
        assert result is None

    def test_returns_dict_with_all_keys_after_profile_creation(self):
        """A fresh profile returns a dict with all required keys."""
        from backend.emotional.quiz import get_compatibility_card, get_or_create_profile

        conn = _make_conn()
        get_or_create_profile(1, conn)  # ensure profile exists
        card = get_compatibility_card(1, conn)
        assert card is not None

        expected_keys = {
            "user_ocean", "char_ocean", "compatibility_pct", "connection_summary",
            "shared_traits", "complementary_traits", "completed", "progress",
        }
        assert expected_keys.issubset(set(card.keys()))

    def test_progress_total_is_twenty(self):
        """progress.total is always 20."""
        from backend.emotional.quiz import get_compatibility_card, get_or_create_profile

        conn = _make_conn()
        get_or_create_profile(1, conn)
        card = get_compatibility_card(1, conn)
        assert card["progress"]["total"] == 20

    def test_completed_false_on_fresh_profile(self):
        """A fresh (unanswered) profile has completed=False."""
        from backend.emotional.quiz import get_compatibility_card, get_or_create_profile

        conn = _make_conn()
        get_or_create_profile(1, conn)
        card = get_compatibility_card(1, conn)
        assert card["completed"] is False

    def test_compatibility_pct_none_before_completion(self):
        """compatibility_pct is None until the quiz is complete."""
        from backend.emotional.quiz import get_compatibility_card, get_or_create_profile

        conn = _make_conn()
        get_or_create_profile(1, conn)
        card = get_compatibility_card(1, conn)
        assert card["compatibility_pct"] is None

    def test_compatibility_pct_set_after_completion(self):
        """compatibility_pct is an integer 0-100 after reaching completion."""
        from backend.emotional.quiz import (
            get_compatibility_card,
            record_answer,
            QUIZ_QUESTIONS,
            _MIN_ANSWERS,
        )

        conn = _make_conn()
        for question in QUIZ_QUESTIONS[:_MIN_ANSWERS]:
            record_answer(1, question.id, "I love exploring creative adventures", conn)

        card = get_compatibility_card(1, conn)
        assert card is not None
        assert card["completed"] is True
        assert isinstance(card["compatibility_pct"], int)
        assert 0 <= card["compatibility_pct"] <= 100


# ─────────────────────────────────────────────────────────────────────────────
# TestCanAskQuestionThisSession
# ─────────────────────────────────────────────────────────────────────────────


class TestCanAskQuestionThisSession:
    """Tests for can_ask_question_this_session."""

    def test_initially_true(self):
        """Returns True for a fresh profile with no session log."""
        from backend.emotional.quiz import can_ask_question_this_session

        conn = _make_conn()
        result = can_ask_question_this_session(1, 42, conn)
        assert result is True

    def test_false_after_two_questions_same_session(self):
        """Returns False once _MAX_PER_SESSION (2) questions have been logged."""
        from backend.emotional.quiz import (
            can_ask_question_this_session,
            log_question_asked,
        )

        conn = _make_conn()
        log_question_asked(1, 42, "q1", conn)
        log_question_asked(1, 42, "q2", conn)
        assert can_ask_question_this_session(1, 42, conn) is False

    def test_true_after_one_question_same_session(self):
        """Returns True when only 1 of the 2 allowed questions have been asked."""
        from backend.emotional.quiz import (
            can_ask_question_this_session,
            log_question_asked,
        )

        conn = _make_conn()
        log_question_asked(1, 42, "q1", conn)
        assert can_ask_question_this_session(1, 42, conn) is True

    def test_different_session_resets_count(self):
        """A new session_id starts the count fresh."""
        from backend.emotional.quiz import (
            can_ask_question_this_session,
            log_question_asked,
        )

        conn = _make_conn()
        # Exhaust session 42
        log_question_asked(1, 42, "q1", conn)
        log_question_asked(1, 42, "q2", conn)
        # Session 43 should still be open
        assert can_ask_question_this_session(1, 43, conn) is True

    def test_false_when_quiz_is_complete(self):
        """Returns False once the quiz is fully completed (completed_at set)."""
        from backend.emotional.quiz import (
            can_ask_question_this_session,
            record_answer,
            QUIZ_QUESTIONS,
            _MIN_ANSWERS,
        )

        conn = _make_conn()
        for question in QUIZ_QUESTIONS[:_MIN_ANSWERS]:
            record_answer(1, question.id, "any answer here", conn)

        assert can_ask_question_this_session(1, 99, conn) is False
