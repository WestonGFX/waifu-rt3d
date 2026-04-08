"""Tests for CHARA Card V2 reader/writer round-trip and v68 migration.

Covers:
- CharaCardReader._map_fields: all V2 fields preserved individually
- CharaCardWriter._build_payload: individual fields exported correctly
- Round-trip: read → write → read produces matching fields
- migrate_to_v68: adds all 7 new columns idempotently
"""

from __future__ import annotations

import json
import sqlite3

import pytest

from backend.characters.chara_card import CharaCardReader, CharaCardWriter


# ── Sample CHARA v2 payloads ───────────────────────────────────────────────

SAMPLE_V2_CARD = {
    "spec": "chara_card_v2",
    "spec_version": "2.0",
    "data": {
        "name": "Sakura",
        "description": "A cheerful high school student who loves cherry blossoms.",
        "personality": "Kind, energetic, slightly clumsy",
        "scenario": "You meet Sakura in the school courtyard during cherry blossom season.",
        "first_mes": "Hi there! I'm Sakura. Want to watch the cherry blossoms with me?",
        "alternate_greetings": [
            "Oh! I didn't see you there. Are you new here?",
            "*waves enthusiastically* Hey! Come sit with me!",
        ],
        "mes_example": "<START>\n{{user}}: How are you?\n{{char}}: I'm great! The weather is perfect today.",
        "system_prompt": "You are Sakura, a cheerful 18-year-old student.",
        "post_history_instructions": "Always stay in character. Never break the fourth wall.",
        "creator_notes": "Created by TestAuthor. Best with creative models.",
        "tags": ["school", "romance", "wholesome"],
        "character_book": None,
    },
}

SAMPLE_V1_CARD = {
    "name": "OldChar",
    "description": "A mysterious traveler.",
    "personality": "Quiet, thoughtful",
    "scenario": "A rainy evening at a tavern.",
    "first_mes": "The rain has been falling for three days now...",
    "mes_example": "",
}


class TestCharaCardReader:
    """Tests for CharaCardReader._map_fields."""

    def test_v2_preserves_all_individual_fields(self) -> None:
        """V2 card fields are mapped to individual DB columns, not smashed together."""
        reader = CharaCardReader()
        result = reader._map_fields(SAMPLE_V2_CARD)

        assert result["name"] == "Sakura"
        assert result["chara_description"] == "A cheerful high school student who loves cherry blossoms."
        assert result["scenario"] == "You meet Sakura in the school courtyard during cherry blossom season."
        assert result["greeting_message"] == "Hi there! I'm Sakura. Want to watch the cherry blossoms with me?"
        assert result["system_prompt"] == "You are Sakura, a cheerful 18-year-old student."
        assert result["mes_example"] == "<START>\n{{user}}: How are you?\n{{char}}: I'm great! The weather is perfect today."
        assert result["post_history_instructions"] == "Always stay in character. Never break the fourth wall."
        assert result["creator_notes"] == "Created by TestAuthor. Best with creative models."
        assert result["alternate_greetings"] == [
            "Oh! I didn't see you there. Are you new here?",
            "*waves enthusiastically* Hey! Come sit with me!",
        ]
        assert result["chara_tags"] == ["school", "romance", "wholesome"]

    def test_v2_preserves_legacy_background_field(self) -> None:
        """The legacy 'background' field still joins description+personality+scenario."""
        reader = CharaCardReader()
        result = reader._map_fields(SAMPLE_V2_CARD)

        # background is the legacy combined field
        assert "A cheerful high school student" in result["background"]
        assert "Kind, energetic" in result["background"]
        assert "school courtyard" in result["background"]

    def test_v1_card_handled_gracefully(self) -> None:
        """V1 cards (no 'data' wrapper) are handled with sensible defaults."""
        reader = CharaCardReader()
        result = reader._map_fields(SAMPLE_V1_CARD)

        assert result["name"] == "OldChar"
        assert result["scenario"] == "A rainy evening at a tavern."
        assert result["chara_description"] == "A mysterious traveler."
        assert result["alternate_greetings"] == []
        assert result["post_history_instructions"] == ""

    def test_missing_fields_default_safely(self) -> None:
        """Missing CHARA fields default to empty strings/lists, not None."""
        reader = CharaCardReader()
        minimal_card = {"data": {"name": "Minimal"}}
        result = reader._map_fields(minimal_card)

        assert result["name"] == "Minimal"
        assert result["scenario"] == ""
        assert result["chara_description"] == ""
        assert result["alternate_greetings"] == []
        assert result["post_history_instructions"] == ""
        assert result["mes_example"] == ""
        assert result["chara_tags"] == []

    def test_alternate_greetings_non_list_fallback(self) -> None:
        """Non-list alternate_greetings falls back to empty list."""
        reader = CharaCardReader()
        card = {"data": {"name": "Test", "alternate_greetings": "not a list"}}
        result = reader._map_fields(card)

        assert result["alternate_greetings"] == []


class TestCharaCardWriter:
    """Tests for CharaCardWriter._build_payload."""

    def test_v2_fields_exported_correctly(self) -> None:
        """Individual V2 fields are exported to their correct CHARA v2 positions."""
        writer = CharaCardWriter()
        char_data = {
            "name": "Sakura",
            "chara_description": "A cheerful student.",
            "personality_traits": '["kind", "energetic"]',
            "scenario": "School courtyard during spring.",
            "greeting_message": "Hi there!",
            "mes_example": "<START>\nUser: Hi\nChar: Hello!",
            "post_history_instructions": "Stay in character.",
            "alternate_greetings": ["Alt greeting 1", "Alt greeting 2"],
            "creator_notes": "By TestAuthor",
            "chara_tags": ["school", "romance"],
        }
        payload = writer._build_payload(char_data)

        assert payload["spec"] == "chara_card_v2"
        assert payload["data"]["name"] == "Sakura"
        assert payload["data"]["description"] == "A cheerful student."
        assert payload["data"]["personality"] == "kind, energetic"  # JSON array → prose
        assert payload["data"]["scenario"] == "School courtyard during spring."
        assert payload["data"]["first_mes"] == "Hi there!"
        assert payload["data"]["mes_example"] == "<START>\nUser: Hi\nChar: Hello!"
        assert payload["data"]["post_history_instructions"] == "Stay in character."
        assert payload["data"]["alternate_greetings"] == ["Alt greeting 1", "Alt greeting 2"]
        assert payload["data"]["creator_notes"] == "By TestAuthor"
        assert payload["data"]["tags"] == ["school", "romance"]

    def test_legacy_fallback_when_v2_columns_empty(self) -> None:
        """Writer falls back to legacy combined fields when V2 columns are empty."""
        writer = CharaCardWriter()
        char_data = {
            "name": "LegacyChar",
            "background": "A brave warrior from the north.",
            "system_prompt": "You are a warrior.",
            "greeting_message": "Greetings, traveler.",
            "backstory": "User: Hello\nChar: Greetings.",
        }
        payload = writer._build_payload(char_data)

        # description falls back to background
        assert payload["data"]["description"] == "A brave warrior from the north."
        # mes_example falls back to backstory
        assert payload["data"]["mes_example"] == "User: Hello\nChar: Greetings."

    def test_alternate_greetings_json_string_parsed(self) -> None:
        """JSON-encoded alternate_greetings string from DB is parsed correctly."""
        writer = CharaCardWriter()
        char_data = {
            "name": "Test",
            "alternate_greetings": '["Hello!", "Hi there!"]',
        }
        payload = writer._build_payload(char_data)
        assert payload["data"]["alternate_greetings"] == ["Hello!", "Hi there!"]

    def test_chara_tags_json_string_parsed(self) -> None:
        """JSON-encoded chara_tags string from DB is parsed correctly."""
        writer = CharaCardWriter()
        char_data = {
            "name": "Test",
            "chara_tags": '["tag1", "tag2"]',
        }
        payload = writer._build_payload(char_data)
        assert payload["data"]["tags"] == ["tag1", "tag2"]

    def test_empty_scenario_and_personality(self) -> None:
        """Empty scenario/personality fields export as empty strings, not None."""
        writer = CharaCardWriter()
        char_data = {"name": "Minimal"}
        payload = writer._build_payload(char_data)

        assert payload["data"]["scenario"] == ""
        assert payload["data"]["personality"] == ""
        assert payload["data"]["post_history_instructions"] == ""
        assert payload["data"]["alternate_greetings"] == []


class TestRoundTrip:
    """Test that read → write → read preserves all V2 fields."""

    def test_full_round_trip(self) -> None:
        """A V2 card read, written, and re-read preserves all fields."""
        reader = CharaCardReader()
        writer = CharaCardWriter()

        # Read the sample card
        read_data = reader._map_fields(SAMPLE_V2_CARD)

        # Write it to a payload
        payload = writer._build_payload(read_data)

        # Re-read the payload as if it were a new card
        re_read = reader._map_fields(payload)

        # All individual fields should match
        assert re_read["name"] == "Sakura"
        assert re_read["chara_description"] == read_data["chara_description"]
        assert re_read["scenario"] == read_data["scenario"]
        assert re_read["greeting_message"] == read_data["greeting_message"]
        assert re_read["system_prompt"] == read_data["system_prompt"]
        assert re_read["mes_example"] == read_data["mes_example"]
        assert re_read["post_history_instructions"] == read_data["post_history_instructions"]
        assert re_read["creator_notes"] == read_data["creator_notes"]
        assert re_read["alternate_greetings"] == read_data["alternate_greetings"]
        assert re_read["chara_tags"] == read_data["chara_tags"]


class TestMigrationV68:
    """Tests for the v68 schema migration."""

    @pytest.fixture()
    def db_at_v67(self) -> sqlite3.Connection:
        """Create an in-memory DB at schema v67 with a minimal characters table."""
        con = sqlite3.connect(":memory:")
        con.execute("CREATE TABLE schema_version (version INTEGER)")
        con.execute("INSERT INTO schema_version VALUES (67)")
        con.execute("""
            CREATE TABLE characters (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT,
                system_prompt TEXT,
                personality_traits TEXT,
                greeting_text TEXT
            )
        """)
        con.execute(
            "INSERT INTO characters (name, system_prompt) VALUES (?, ?)",
            ("TestChar", "You are a test character."),
        )
        con.commit()
        return con

    def test_migration_adds_all_columns(self, db_at_v67: sqlite3.Connection) -> None:
        """v68 migration adds all 7 CHARA V2 columns."""
        from backend.preflight import migrate_to_v68

        assert migrate_to_v68(db_at_v67) is True

        # Verify columns exist by selecting them
        row = db_at_v67.execute("""
            SELECT scenario, chara_description, alternate_greetings,
                   mes_example, post_history_instructions, chara_tags, creator_notes
            FROM characters WHERE name='TestChar'
        """).fetchone()

        assert row is not None
        # All new columns should have their default values
        assert row[0] is None  # scenario
        assert row[1] is None  # chara_description
        assert row[2] == "[]"  # alternate_greetings
        assert row[3] is None  # mes_example
        assert row[4] is None  # post_history_instructions
        assert row[5] == "[]"  # chara_tags
        assert row[6] is None  # creator_notes

    def test_migration_bumps_version(self, db_at_v67: sqlite3.Connection) -> None:
        """v68 migration updates schema_version to 68."""
        from backend.preflight import migrate_to_v68, get_schema_version

        migrate_to_v68(db_at_v67)
        assert get_schema_version(db_at_v67) == 68

    def test_migration_is_idempotent(self, db_at_v67: sqlite3.Connection) -> None:
        """Running v68 migration twice does not error or change state."""
        from backend.preflight import migrate_to_v68, get_schema_version

        assert migrate_to_v68(db_at_v67) is True
        assert migrate_to_v68(db_at_v67) is True  # Second run is a no-op
        assert get_schema_version(db_at_v67) == 68

    def test_migration_preserves_existing_data(self, db_at_v67: sqlite3.Connection) -> None:
        """Existing character data is not altered by the migration."""
        from backend.preflight import migrate_to_v68

        migrate_to_v68(db_at_v67)
        row = db_at_v67.execute(
            "SELECT name, system_prompt FROM characters WHERE id=1"
        ).fetchone()
        assert row == ("TestChar", "You are a test character.")
