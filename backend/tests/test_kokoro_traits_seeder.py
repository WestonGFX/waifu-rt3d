"""Tests for backend.kokoro.traits_seeder."""
from __future__ import annotations

import sqlite3
from pathlib import Path

import pytest

from backend.kokoro.traits_seeder import (
    infer_traits_from_text,
    seed_traits_for_character,
)
from backend.preflight import migrate_to_v83, migrate_to_v84


@pytest.fixture()
def con():
    c = sqlite3.connect(":memory:")
    c.execute("PRAGMA foreign_keys = ON")
    c.execute("CREATE TABLE schema_version (version INTEGER, applied_ts REAL)")
    c.execute("INSERT INTO schema_version VALUES (82, 0)")
    c.execute(
        "CREATE TABLE characters ("
        " id INTEGER PRIMARY KEY,"
        " name TEXT,"
        " system_prompt TEXT,"
        " bible_path TEXT,"
        " bible_sections TEXT"
        ")"
    )
    c.execute("CREATE TABLE sessions (id INTEGER PRIMARY KEY)")
    assert migrate_to_v83(c)
    assert migrate_to_v84(c)
    yield c
    c.close()


def test_empty_text_returns_baselines():
    v = infer_traits_from_text("", character_id=42)
    assert v.character_id == 42
    assert v.openness == 0.5
    assert v.warmth == 0.5
    assert v.dominance == 0.5
    assert v.mischief == 0.5
    assert v.melancholy_tendency == 0.3


def test_warm_keywords_raise_warmth():
    v = infer_traits_from_text(
        "She is warm, kind, tender, and deeply caring. Soft-hearted, nurturing.",
        character_id=1,
    )
    assert v.warmth > 0.55, f"warmth should rise, got {v.warmth}"


def test_cold_keywords_lower_warmth():
    v = infer_traits_from_text(
        "Cold, distant, aloof, and harsh. Cynical and standoffish.",
        character_id=1,
    )
    assert v.warmth < 0.45, f"warmth should fall, got {v.warmth}"


def test_mischief_descriptors_raise_mischief():
    v = infer_traits_from_text(
        "Playful, mischievous, teasing — a sly trickster who loves a good prank.",
        character_id=1,
    )
    assert v.mischief > 0.55


def test_melancholy_baseline_can_rise():
    v = infer_traits_from_text(
        "Wistful and longing. Often pensive, brooding on regret.",
        character_id=1,
    )
    assert v.melancholy_tendency > 0.30


def test_balanced_text_stays_near_baseline():
    v = infer_traits_from_text(
        "She is warm but also cold. Open yet guarded. Playful then serious.",
        character_id=1,
    )
    # Net signal is approximately zero per dial; vector should hug baselines.
    assert abs(v.warmth - 0.5) <= 0.05
    assert abs(v.openness - 0.5) <= 0.05
    assert abs(v.mischief - 0.5) <= 0.05


def test_clamping_at_bounds():
    # Spam warmth keywords; clamp at 1.0.
    text = ("warm " * 200) + ("kind " * 200) + ("tender " * 200)
    v = infer_traits_from_text(text, character_id=1)
    assert 0.0 <= v.warmth <= 1.0
    assert v.warmth == pytest.approx(1.0)


def test_seed_uses_system_prompt_when_no_bible_file(con):
    con.execute(
        "INSERT INTO characters (id, name, system_prompt) VALUES (1, 'Mei',"
        " 'A mischievous prankster who loves teasing and surprises.')"
    )
    v = seed_traits_for_character(con, 1)
    assert v.mischief > 0.55

    # Row persisted, idempotent.
    again = seed_traits_for_character(con, 1)
    assert again.mischief == v.mischief
    rows = con.execute("SELECT COUNT(*) FROM character_traits WHERE character_id=1").fetchone()
    assert rows[0] == 1


def test_seed_handles_missing_bible_file(con, tmp_path: Path):
    con.execute(
        "INSERT INTO characters (id, name, system_prompt, bible_path)"
        " VALUES (1, 'Yui', 'A warm and gentle soul.', 'does_not_exist.md')"
    )
    # bibles dir empty; tmp_path used as storage_root.
    v = seed_traits_for_character(con, 1, storage_root=tmp_path)
    # Should still process system_prompt and bump warmth.
    assert v.warmth > 0.5
