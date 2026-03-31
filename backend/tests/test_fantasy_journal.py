"""Tests for backend.adaptive.journal — Fantasy Journal extension (F11).

Covers bond gating, frequency capping, prompt building, visibility rules,
and the entry_type column.  All tests are pure-unit — no LLM or network I/O.
"""

from __future__ import annotations

import sqlite3

import pytest

from backend.adaptive.journal import (
    FANTASY_FREQUENCY_RATIO,
    FANTASY_GENERATION_BOND,
    FANTASY_VISIBILITY_BOND,
    build_fantasy_journal_prompt,
    get_fantasy_entries,
    get_journal_entries,
    should_generate_fantasy,
    _ensure_table,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_db() -> sqlite3.Connection:
    """Create an in-memory DB with the character_journals table."""
    con = sqlite3.connect(":memory:")
    _ensure_table(con)
    return con


def _seed_entries(
    con: sqlite3.Connection,
    char_id: int,
    regular: int = 0,
    fantasy: int = 0,
) -> None:
    """Insert dummy journal entries for frequency cap testing."""
    for i in range(regular):
        con.execute(
            "INSERT INTO character_journals (char_id, entry_text, entry_type) "
            "VALUES (?, ?, 'reflection')",
            (char_id, f"Regular entry {i}"),
        )
    for i in range(fantasy):
        con.execute(
            "INSERT INTO character_journals (char_id, entry_text, entry_type) "
            "VALUES (?, ?, 'fantasy')",
            (char_id, f"Fantasy entry {i}"),
        )
    con.commit()


# ---------------------------------------------------------------------------
# 1. Constants sanity
# ---------------------------------------------------------------------------


def test_generation_bond_threshold() -> None:
    """Fantasy generation requires bond >= 50."""
    assert FANTASY_GENERATION_BOND == 50


def test_visibility_bond_threshold() -> None:
    """Fantasy visibility requires bond >= 80."""
    assert FANTASY_VISIBILITY_BOND == 80


def test_frequency_ratio() -> None:
    """1 fantasy per 3 regular entries."""
    assert FANTASY_FREQUENCY_RATIO == 3


# ---------------------------------------------------------------------------
# 2. should_generate_fantasy — bond gate
# ---------------------------------------------------------------------------


def test_fantasy_gate_below_bond() -> None:
    """Bond < 50 → no fantasy generation allowed."""
    con = _make_db()
    _seed_entries(con, char_id=1, regular=10)
    assert should_generate_fantasy(1, 40, con.cursor()) is False


def test_fantasy_gate_at_bond() -> None:
    """Bond == 50 → generation allowed (if frequency permits)."""
    con = _make_db()
    _seed_entries(con, char_id=1, regular=6)
    assert should_generate_fantasy(1, 50, con.cursor()) is True


def test_fantasy_gate_above_bond() -> None:
    """Bond > 50 → generation allowed (if frequency permits)."""
    con = _make_db()
    _seed_entries(con, char_id=1, regular=6)
    assert should_generate_fantasy(1, 80, con.cursor()) is True


# ---------------------------------------------------------------------------
# 3. should_generate_fantasy — frequency cap
# ---------------------------------------------------------------------------


def test_frequency_cap_no_regular_entries() -> None:
    """0 regular entries → 0 fantasy allowed → False even at high bond."""
    con = _make_db()
    assert should_generate_fantasy(1, 90, con.cursor()) is False


def test_frequency_cap_exact_ratio() -> None:
    """3 regular, 1 fantasy → cap reached (1/3) → False."""
    con = _make_db()
    _seed_entries(con, char_id=1, regular=3, fantasy=1)
    assert should_generate_fantasy(1, 90, con.cursor()) is False


def test_frequency_cap_room_available() -> None:
    """6 regular, 1 fantasy → room for 1 more (max 2) → True."""
    con = _make_db()
    _seed_entries(con, char_id=1, regular=6, fantasy=1)
    assert should_generate_fantasy(1, 90, con.cursor()) is True


def test_frequency_cap_just_enough() -> None:
    """3 regular, 0 fantasy → room for 1 → True."""
    con = _make_db()
    _seed_entries(con, char_id=1, regular=3, fantasy=0)
    assert should_generate_fantasy(1, 90, con.cursor()) is True


def test_frequency_cap_exceeded() -> None:
    """6 regular, 2 fantasy → cap reached (2/6 = max 2) → False."""
    con = _make_db()
    _seed_entries(con, char_id=1, regular=6, fantasy=2)
    assert should_generate_fantasy(1, 90, con.cursor()) is False


def test_frequency_cap_different_chars() -> None:
    """Fantasy entries from other characters don't affect this one's cap."""
    con = _make_db()
    _seed_entries(con, char_id=1, regular=6, fantasy=0)
    _seed_entries(con, char_id=2, regular=0, fantasy=5)
    assert should_generate_fantasy(1, 90, con.cursor()) is True


# ---------------------------------------------------------------------------
# 4. build_fantasy_journal_prompt
# ---------------------------------------------------------------------------


def test_prompt_contains_char_name() -> None:
    """Character name appears in the generated prompt."""
    prompt = build_fantasy_journal_prompt("Dae", "You are Dae.", "Likes art", "mild")
    assert "Dae" in prompt


def test_prompt_contains_content_ceiling() -> None:
    """Content ceiling level is injected into the prompt."""
    prompt = build_fantasy_journal_prompt("Luna", "Stargazer.", "Loves stars", "suggestive")
    assert "suggestive" in prompt


def test_prompt_contains_relationship_context() -> None:
    """Relationship context is included in the prompt."""
    prompt = build_fantasy_journal_prompt("Genki", "Energetic.", "Plays games together", "mild")
    assert "Plays games together" in prompt


def test_prompt_truncates_long_system_prompt() -> None:
    """System prompts over 600 chars are truncated with ellipsis."""
    long_prompt = "A" * 700
    result = build_fantasy_journal_prompt("Dae", long_prompt, "Context", "mild")
    assert "..." in result


def test_prompt_empty_relationship_context() -> None:
    """Empty relationship context gets a placeholder."""
    prompt = build_fantasy_journal_prompt("Dae", "Prompt.", "", "mild")
    assert "no specific details" in prompt


def test_prompt_different_ceilings() -> None:
    """Different content ceilings produce different prompts."""
    mild = build_fantasy_journal_prompt("Dae", "P", "C", "mild")
    explicit = build_fantasy_journal_prompt("Dae", "P", "C", "explicit")
    assert mild != explicit
    assert "mild" in mild
    assert "explicit" in explicit


# ---------------------------------------------------------------------------
# 5. get_fantasy_entries — visibility bond gate
# ---------------------------------------------------------------------------


def test_fantasy_entries_below_visibility_bond() -> None:
    """Bond < 80 → empty list even if entries exist."""
    con = _make_db()
    _seed_entries(con, char_id=1, regular=0, fantasy=3)
    result = get_fantasy_entries(1, 70, con.cursor())
    assert result == []


def test_fantasy_entries_at_visibility_bond() -> None:
    """Bond == 80 → entries are visible."""
    con = _make_db()
    _seed_entries(con, char_id=1, regular=0, fantasy=3)
    result = get_fantasy_entries(1, 80, con.cursor())
    assert len(result) == 3


def test_fantasy_entries_above_visibility_bond() -> None:
    """Bond > 80 → entries are visible."""
    con = _make_db()
    _seed_entries(con, char_id=1, regular=0, fantasy=2)
    result = get_fantasy_entries(1, 95, con.cursor())
    assert len(result) == 2


def test_fantasy_entries_limit() -> None:
    """Limit parameter caps results."""
    con = _make_db()
    _seed_entries(con, char_id=1, regular=0, fantasy=10)
    result = get_fantasy_entries(1, 90, con.cursor(), limit=5)
    assert len(result) == 5


def test_fantasy_entries_empty_db() -> None:
    """No entries → empty list."""
    con = _make_db()
    result = get_fantasy_entries(1, 90, con.cursor())
    assert result == []


def test_fantasy_entries_only_returns_fantasy_type() -> None:
    """Regular entries are not returned by get_fantasy_entries."""
    con = _make_db()
    _seed_entries(con, char_id=1, regular=5, fantasy=2)
    result = get_fantasy_entries(1, 90, con.cursor())
    assert len(result) == 2
    for entry in result:
        assert entry["entry_type"] == "fantasy"


# ---------------------------------------------------------------------------
# 6. get_journal_entries — entry_type field
# ---------------------------------------------------------------------------


def test_journal_entries_include_entry_type() -> None:
    """Regular get_journal_entries now returns entry_type field."""
    con = _make_db()
    _seed_entries(con, char_id=1, regular=2, fantasy=1)
    result = get_journal_entries(1, con.cursor(), limit=10)
    assert len(result) == 3
    types = {e["entry_type"] for e in result}
    assert "reflection" in types
    assert "fantasy" in types


# ---------------------------------------------------------------------------
# 7. Table schema — entry_type column
# ---------------------------------------------------------------------------


def test_table_has_entry_type_column() -> None:
    """The character_journals table has an entry_type column."""
    con = _make_db()
    cursor = con.execute("PRAGMA table_info(character_journals)")
    columns = {row[1] for row in cursor.fetchall()}
    assert "entry_type" in columns


def test_entry_type_defaults_to_reflection() -> None:
    """Entries without explicit entry_type default to 'reflection'."""
    con = _make_db()
    con.execute(
        "INSERT INTO character_journals (char_id, entry_text) VALUES (1, 'test')"
    )
    con.commit()
    row = con.execute(
        "SELECT entry_type FROM character_journals WHERE char_id = 1"
    ).fetchone()
    assert row[0] == "reflection"


def test_ensure_table_idempotent() -> None:
    """Calling _ensure_table twice doesn't error."""
    con = sqlite3.connect(":memory:")
    _ensure_table(con)
    _ensure_table(con)
    # If we get here without error, the test passes
    cursor = con.execute("PRAGMA table_info(character_journals)")
    columns = {row[1] for row in cursor.fetchall()}
    assert "entry_type" in columns
