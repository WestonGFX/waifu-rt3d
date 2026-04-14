"""Tests for backend/bond/memorial_scenes.py (Bond Phase 5).

Covers:
- SCENE_DEFINITIONS structure and content validity
- get_pending_scene returns correct scene at tier-transition levels
- get_pending_scene returns None at non-transition levels
- get_pending_scene returns None after scene is completed
- mark_scene_completed persists a row and is idempotent
- generate_first_memory_scene returns valid scene structure (stub mode)
- generate_first_memory_scene uses LLM caller when provided
- generate_first_memory_scene handles missing messages table gracefully
- get_all_scenes_status returns all scenes with completion status
- All 13 characters have at least one scene defined
"""

from __future__ import annotations

import sqlite3
from typing import Any
from unittest.mock import MagicMock

import pytest

from backend.bond.memorial_scenes import (
    SCENE_DEFINITIONS,
    TIER_TRANSITION_LEVELS,
    generate_first_memory_scene,
    get_all_scenes_status,
    get_pending_scene,
    mark_scene_completed,
)


# ── Fixtures ──────────────────────────────────────────────────────────────────


@pytest.fixture
def mem_db() -> sqlite3.Connection:
    """In-memory SQLite database with the minimal schema needed for tests."""
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row

    conn.executescript(
        """
        CREATE TABLE schema_version (version INTEGER);
        INSERT INTO schema_version VALUES (69);

        CREATE TABLE characters (
            id   INTEGER PRIMARY KEY,
            name TEXT NOT NULL
        );
        INSERT INTO characters (id, name) VALUES (1, 'Dae'), (2, 'Luna'),
            (3, 'Rin'), (4, 'Hana'), (5, 'Ayane'), (6, 'Sable'),
            (7, 'Shiori'), (8, 'Mika'), (9, 'Raine'), (10, 'Kaede'),
            (11, 'Yuki'), (12, 'Alana'), (13, 'Genki');

        CREATE TABLE bond_scenes_seen (
            char_id       INTEGER NOT NULL,
            scene_id      TEXT    NOT NULL,
            completed_at  REAL    NOT NULL DEFAULT (unixepoch()),
            PRIMARY KEY   (char_id, scene_id)
        );

        CREATE TABLE messages (
            id      INTEGER PRIMARY KEY AUTOINCREMENT,
            char_id INTEGER NOT NULL,
            role    TEXT NOT NULL,
            content TEXT NOT NULL
        );
        """
    )
    return conn


# ── SCENE_DEFINITIONS structure ───────────────────────────────────────────────


def test_scene_definitions_has_all_13_chars():
    """All 13 characters must appear in SCENE_DEFINITIONS."""
    expected_chars = {
        "dae", "genki", "luna", "rin", "hana", "ayane",
        "sable", "shiori", "mika", "raine", "kaede", "yuki", "alana",
    }
    assert expected_chars == set(SCENE_DEFINITIONS.keys()), (
        f"Missing chars: {expected_chars - set(SCENE_DEFINITIONS.keys())}"
    )


def test_each_char_has_3_scenes():
    """Each character must have exactly 3 scenes (levels 15, 35, 65)."""
    for char_key, scenes in SCENE_DEFINITIONS.items():
        assert len(scenes) == 3, f"{char_key} has {len(scenes)} scenes (expected 3)"
        levels = {s["level"] for s in scenes}
        assert levels == {15, 35, 65}, f"{char_key} scene levels are {levels}"


def test_scene_dict_required_fields():
    """Every scene dict must contain all required keys with non-empty values."""
    required = {"scene_id", "char_name", "level", "tier_label", "setting", "beats", "culmination", "keepsake"}
    for char_key, scenes in SCENE_DEFINITIONS.items():
        for scene in scenes:
            missing = required - set(scene.keys())
            assert not missing, f"{char_key} scene {scene.get('scene_id')} missing {missing}"
            for field in required:
                val = scene[field]
                assert val, f"{char_key}/{scene['scene_id']}: field {field!r} is empty"
            # beats must be a non-empty list
            assert isinstance(scene["beats"], list), f"{char_key}/{scene['scene_id']}: beats must be list"
            assert len(scene["beats"]) >= 3, f"{char_key}/{scene['scene_id']}: beats must have ≥3 entries"


def test_scene_ids_are_unique():
    """scene_id values must be unique across all characters and scenes."""
    all_ids: list[str] = []
    for scenes in SCENE_DEFINITIONS.values():
        all_ids.extend(s["scene_id"] for s in scenes)
    assert len(all_ids) == len(set(all_ids)), "Duplicate scene_ids found"


def test_tier_transition_levels_constant():
    """TIER_TRANSITION_LEVELS must contain exactly (15, 35, 65)."""
    assert set(TIER_TRANSITION_LEVELS) == {15, 35, 65}


# ── get_pending_scene ─────────────────────────────────────────────────────────


def test_get_pending_scene_returns_scene_at_threshold(mem_db: sqlite3.Connection):
    """Returns a scene dict when level is a threshold and scene hasn't been seen."""
    scene = get_pending_scene(1, 15, mem_db, char_name="Dae")
    assert scene is not None
    assert scene["scene_id"] == "dae_tier2"
    assert scene["level"] == 15
    assert scene["char_id"] == 1


def test_get_pending_scene_returns_none_at_non_threshold(mem_db: sqlite3.Connection):
    """Returns None for levels that are not tier-transition thresholds."""
    for level in [0, 5, 10, 16, 20, 34, 36, 64, 66, 100]:
        result = get_pending_scene(1, level, mem_db, char_name="Dae")
        assert result is None, f"Expected None at level {level}, got {result}"


def test_get_pending_scene_returns_none_if_already_seen(mem_db: sqlite3.Connection):
    """Returns None if the scene has already been completed."""
    mark_scene_completed(1, "dae_tier2", mem_db)
    result = get_pending_scene(1, 15, mem_db, char_name="Dae")
    assert result is None


def test_get_pending_scene_resolves_name_from_db(mem_db: sqlite3.Connection):
    """Resolves character name from DB when char_name is not provided."""
    scene = get_pending_scene(1, 15, mem_db)
    assert scene is not None
    assert scene["scene_id"] == "dae_tier2"


def test_get_pending_scene_all_threshold_levels(mem_db: sqlite3.Connection):
    """Returns a scene at each of the three threshold levels for Dae."""
    for level, expected_id in [(15, "dae_tier2"), (35, "dae_tier3"), (65, "dae_tier4")]:
        scene = get_pending_scene(1, level, mem_db, char_name="Dae")
        assert scene is not None, f"Expected scene at level {level}"
        assert scene["scene_id"] == expected_id


# ── mark_scene_completed ──────────────────────────────────────────────────────


def test_mark_scene_completed_inserts_row(mem_db: sqlite3.Connection):
    """First call inserts a row and returns True."""
    result = mark_scene_completed(1, "dae_tier2", mem_db)
    assert result is True
    row = mem_db.execute(
        "SELECT scene_id FROM bond_scenes_seen WHERE char_id = 1"
    ).fetchone()
    assert row is not None
    assert row[0] == "dae_tier2"


def test_mark_scene_completed_is_idempotent(mem_db: sqlite3.Connection):
    """Second call for the same scene returns False (already recorded)."""
    mark_scene_completed(1, "dae_tier2", mem_db)
    result = mark_scene_completed(1, "dae_tier2", mem_db)
    assert result is False


def test_mark_scene_completed_missing_table():
    """Degrades gracefully when bond_scenes_seen table doesn't exist."""
    bare_conn = sqlite3.connect(":memory:")
    bare_conn.execute("CREATE TABLE characters (id INTEGER PRIMARY KEY, name TEXT)")
    bare_conn.execute("INSERT INTO characters VALUES (1, 'Dae')")
    result = mark_scene_completed(1, "dae_tier2", bare_conn)
    assert result is False


# ── generate_first_memory_scene ───────────────────────────────────────────────


def test_generate_first_memory_scene_stub_mode(mem_db: sqlite3.Connection):
    """Returns a valid scene dict with stub beats when no LLM caller is provided."""
    scene = generate_first_memory_scene(1, mem_db)
    assert scene["scene_id"] == "first_memory_1"
    assert scene["char_id"] == 1
    assert scene["level"] == 34
    assert isinstance(scene["beats"], list)
    assert len(scene["beats"]) >= 3
    assert scene["generated"] is False


def test_generate_first_memory_scene_uses_llm_caller(mem_db: sqlite3.Connection):
    """Uses LLM caller output for beats when provided and messages exist."""
    # Seed some messages.
    mem_db.executemany(
        "INSERT INTO messages (char_id, role, content) VALUES (?, ?, ?)",
        [
            (1, "user", "Hello, what's your name?"),
            (1, "assistant", "I'm Dae. I like to draw."),
            (1, "user", "What do you draw?"),
            (1, "assistant", "Mostly people I find interesting."),
            (1, "user", "Am I interesting?"),
        ],
    )
    mem_db.commit()

    mock_llm = MagicMock(return_value="She remembers a sketch she made.\nIt was rough but honest.\nShe kept it.")
    scene = generate_first_memory_scene(1, mem_db, llm_caller=mock_llm)

    assert scene["generated"] is True
    assert "She remembers a sketch she made." in scene["beats"]
    mock_llm.assert_called_once()


def test_generate_first_memory_scene_handles_missing_messages_table():
    """Falls back to stub beats gracefully when messages table is absent."""
    bare_conn = sqlite3.connect(":memory:")
    bare_conn.execute("CREATE TABLE characters (id INTEGER PRIMARY KEY, name TEXT)")
    bare_conn.execute("INSERT INTO characters VALUES (1, 'Dae')")
    bare_conn.execute(
        "CREATE TABLE bond_scenes_seen (char_id INTEGER, scene_id TEXT, completed_at REAL, PRIMARY KEY(char_id, scene_id))"
    )
    scene = generate_first_memory_scene(1, bare_conn)
    assert scene["scene_id"] == "first_memory_1"
    assert isinstance(scene["beats"], list)
    assert scene["source_messages"] == []


# ── get_all_scenes_status ─────────────────────────────────────────────────────


def test_get_all_scenes_status_returns_three_entries(mem_db: sqlite3.Connection):
    """Returns 3 status entries for Dae (one per tier level)."""
    statuses = get_all_scenes_status(1, mem_db, char_name="Dae")
    assert len(statuses) == 3


def test_get_all_scenes_status_shows_completed_flag(mem_db: sqlite3.Connection):
    """Completed flag is True only for scenes that have been marked done."""
    mark_scene_completed(1, "dae_tier2", mem_db)
    statuses = get_all_scenes_status(1, mem_db, char_name="Dae")
    by_id = {s["scene_id"]: s for s in statuses}
    assert by_id["dae_tier2"]["completed"] is True
    assert by_id["dae_tier3"]["completed"] is False
    assert by_id["dae_tier4"]["completed"] is False
