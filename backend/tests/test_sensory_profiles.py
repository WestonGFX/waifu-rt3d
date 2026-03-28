"""Tests for backend/content/sensory_profiles.py.

Covers profile constants, prompt-builder intensity tiers, DB round-trip,
and per-character sensory spot-checks.
"""

from __future__ import annotations

import json
import sqlite3

import pytest

from backend.content.sensory_profiles import (
    CHARACTER_SENSORY_PROFILES,
    CharacterSensoryProfile,
    _profile_from_dict,
    build_character_sensory_prompt,
    get_sensory_profile,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_conn(*, profile_json: str | None = None) -> sqlite3.Connection:
    """Create an in-memory SQLite connection with the ``characters`` table.

    Args:
        profile_json: Optional JSON string to pre-insert as ``sensory_profile``
            for character with id=1.  When ``None`` the row has a NULL profile.

    Returns:
        An open :class:`sqlite3.Connection` with one character row inserted.
    """
    conn = sqlite3.connect(":memory:")
    conn.execute(
        "CREATE TABLE characters "
        "(id INTEGER PRIMARY KEY, sensory_profile TEXT, display_name TEXT)"
    )
    conn.execute(
        "INSERT INTO characters (id, sensory_profile, display_name) VALUES (?, ?, ?)",
        (1, profile_json, "Dae (Neciridae)"),
    )
    conn.commit()
    return conn


def _dummy_profile(
    *,
    primary: list[str] | None = None,
    secondary: list[str] | None = None,
) -> CharacterSensoryProfile:
    """Return a minimal profile for use in prompt-builder tests."""
    return CharacterSensoryProfile(
        primary=primary or ["visual", "texture"],
        secondary=secondary or ["touch"],
        descriptors="Test descriptor.",
        sample="Test sample.",
    )


# ---------------------------------------------------------------------------
# 1. All 13 profiles exist
# ---------------------------------------------------------------------------


def test_all_13_profiles_exist() -> None:
    """CHARACTER_SENSORY_PROFILES must contain exactly 13 entries."""
    assert len(CHARACTER_SENSORY_PROFILES) == 13


# ---------------------------------------------------------------------------
# 2–5. Prompt builder intensity tiers
# ---------------------------------------------------------------------------


def test_build_prompt_below_threshold() -> None:
    """build_character_sensory_prompt returns '' when intimacy_level < 40."""
    profile = _dummy_profile()
    assert build_character_sensory_prompt(profile, intimacy_level=0) == ""
    assert build_character_sensory_prompt(profile, intimacy_level=39) == ""


def test_build_prompt_subtle() -> None:
    """Intimacy 40–59 produces a prompt containing the word 'subtly'."""
    profile = _dummy_profile()
    for level in (40, 50, 59):
        prompt = build_character_sensory_prompt(profile, intimacy_level=level)
        assert "subtly" in prompt.lower(), f"Expected 'subtly' at level={level}"


def test_build_prompt_richly() -> None:
    """Intimacy 60–79 produces a prompt containing the word 'richly'."""
    profile = _dummy_profile()
    for level in (60, 70, 79):
        prompt = build_character_sensory_prompt(profile, intimacy_level=level)
        assert "richly" in prompt.lower(), f"Expected 'richly' at level={level}"


def test_build_prompt_intensely() -> None:
    """Intimacy >= 80 produces a prompt containing the word 'intensely'."""
    profile = _dummy_profile()
    for level in (80, 90, 100):
        prompt = build_character_sensory_prompt(profile, intimacy_level=level)
        assert "intensely" in prompt.lower(), f"Expected 'intensely' at level={level}"


# ---------------------------------------------------------------------------
# 6. Secondary senses absent below 60
# ---------------------------------------------------------------------------


def test_no_secondary_below_60() -> None:
    """Secondary senses must NOT appear in the prompt when intimacy_level < 60."""
    profile = _dummy_profile(primary=["visual"], secondary=["touch"])
    for level in (40, 55, 59):
        prompt = build_character_sensory_prompt(profile, intimacy_level=level)
        assert "touch" not in prompt, (
            f"Secondary sense 'touch' unexpectedly present at level={level}"
        )


# ---------------------------------------------------------------------------
# 7. get_sensory_profile falls back to constants when DB has no data
# ---------------------------------------------------------------------------


def test_get_profile_fallback_to_constants() -> None:
    """When the DB row has no sensory_profile, falls back to character name lookup."""
    conn = _make_conn(profile_json=None)
    profile = get_sensory_profile(1, conn, char_name="Dae (Neciridae)")
    assert profile is not None
    assert "visual" in profile.primary


# ---------------------------------------------------------------------------
# 8. get_sensory_profile parses JSON from DB column
# ---------------------------------------------------------------------------


def test_get_profile_from_db() -> None:
    """get_sensory_profile parses a JSON-encoded profile from the DB column."""
    db_profile = {
        "primary": ["sound"],
        "secondary": ["scent"],
        "descriptors": "Hears everything.",
        "sample": "The rustling...",
    }
    conn = _make_conn(profile_json=json.dumps(db_profile))
    profile = get_sensory_profile(1, conn, char_name="Dae (Neciridae)")
    assert profile is not None
    # DB value should take precedence over constant lookup.
    assert profile.primary == ["sound"]
    assert profile.secondary == ["scent"]
    assert profile.descriptors == "Hears everything."


# ---------------------------------------------------------------------------
# 9–10. Per-character spot checks
# ---------------------------------------------------------------------------


def test_dae_is_visual() -> None:
    """Dae's primary senses must include 'visual'."""
    conn = _make_conn(profile_json=None)
    profile = get_sensory_profile(1, conn, char_name="Dae (Neciridae)")
    assert profile is not None
    assert "visual" in profile.primary


def test_luna_is_sound() -> None:
    """Luna's primary senses must include 'sound'."""
    conn = sqlite3.connect(":memory:")
    conn.execute(
        "CREATE TABLE characters "
        "(id INTEGER PRIMARY KEY, sensory_profile TEXT, display_name TEXT)"
    )
    conn.execute(
        "INSERT INTO characters (id, sensory_profile, display_name) VALUES (?, ?, ?)",
        (2, None, "Luna (Tsukimi)"),
    )
    conn.commit()
    profile = get_sensory_profile(2, conn, char_name="Luna (Tsukimi)")
    assert profile is not None
    assert "sound" in profile.primary
