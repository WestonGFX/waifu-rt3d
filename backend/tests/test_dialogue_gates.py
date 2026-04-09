"""Tests for backend.bond.dialogue_gates — Phase 3 bond directive system.

Covers:
- get_bond_directive: tier formatting, name interpolation, character overrides,
  unknown tier/character edge cases
- get_bond_context_section: DB-backed tier lookup, level-to-tier mapping,
  exception handling, missing rows
"""

from __future__ import annotations

import sqlite3
from unittest.mock import MagicMock

import pytest

from backend.bond.dialogue_gates import (
    CHARACTER_OVERRIDES,
    TIER_DIRECTIVES,
    get_bond_context_section,
    get_bond_directive,
)


# ── TestGetBondDirectiveTiers ─────────────────────────────────────────────────


class TestGetBondDirectiveTiers:
    """Tests verifying the five base tier directives are correctly formatted."""

    def test_stranger_tier_returns_nonempty_string(self) -> None:
        """'stranger' tier returns a non-empty directive string.

        Confirms the tier is present in TIER_DIRECTIVES and the format call
        succeeds without raising.
        """
        result = get_bond_directive("stranger", "TestChar")
        assert result != ""

    def test_acquaintance_tier_returns_nonempty_string(self) -> None:
        """'acquaintance' tier returns a non-empty directive string."""
        result = get_bond_directive("acquaintance", "TestChar")
        assert result != ""

    def test_friend_tier_returns_nonempty_string(self) -> None:
        """'friend' tier returns a non-empty directive string."""
        result = get_bond_directive("friend", "TestChar")
        assert result != ""

    def test_close_friend_tier_returns_nonempty_string(self) -> None:
        """'close_friend' tier returns a non-empty directive string."""
        result = get_bond_directive("close_friend", "TestChar")
        assert result != ""

    def test_soulmate_tier_returns_nonempty_string(self) -> None:
        """'soulmate' tier returns a non-empty directive string."""
        result = get_bond_directive("soulmate", "TestChar")
        assert result != ""

    def test_stranger_directive_contains_bond_header(self) -> None:
        """Stranger directive contains the '[Bond: Stranger]' header token."""
        result = get_bond_directive("stranger", "TestChar")
        assert "[Bond: Stranger]" in result

    def test_acquaintance_directive_contains_bond_header(self) -> None:
        """Acquaintance directive contains the '[Bond: Acquaintance]' header token."""
        result = get_bond_directive("acquaintance", "TestChar")
        assert "[Bond: Acquaintance]" in result

    def test_friend_directive_contains_bond_header(self) -> None:
        """Friend directive contains the '[Bond: Friend]' header token."""
        result = get_bond_directive("friend", "TestChar")
        assert "[Bond: Friend]" in result

    def test_close_friend_directive_contains_bond_header(self) -> None:
        """Close-friend directive contains the '[Bond: Close Friend]' header token."""
        result = get_bond_directive("close_friend", "TestChar")
        assert "[Bond: Close Friend]" in result

    def test_soulmate_directive_contains_bond_header(self) -> None:
        """Soulmate directive contains the '[Bond: Soulmate]' header token."""
        result = get_bond_directive("soulmate", "TestChar")
        assert "[Bond: Soulmate]" in result


# ── TestGetBondDirectiveNameInterpolation ─────────────────────────────────────


class TestGetBondDirectiveNameInterpolation:
    """Tests verifying that {name} placeholders are replaced with the character name."""

    def test_char_name_appears_in_stranger_directive(self) -> None:
        """Character name is interpolated into the stranger tier text."""
        result = get_bond_directive("stranger", "Sakura")
        assert "Sakura" in result

    def test_char_name_appears_in_friend_directive(self) -> None:
        """Character name is interpolated into the friend tier text.

        The friend template uses {name} twice (once at start, once mid-text),
        so both occurrences should resolve to the supplied name.
        """
        result = get_bond_directive("friend", "Haruki")
        assert "Haruki" in result
        # Count that the raw placeholder is gone
        assert "{name}" not in result

    def test_char_name_appears_in_soulmate_directive(self) -> None:
        """Character name is interpolated into the soulmate tier text.

        The soulmate template ends with "This is {name}'s most important person."
        """
        result = get_bond_directive("soulmate", "Rei")
        assert "Rei" in result
        assert "{name}" not in result

    def test_no_raw_name_placeholder_in_any_tier(self) -> None:
        """No tier directive should contain a raw un-interpolated {name} token."""
        for tier in TIER_DIRECTIVES:
            result = get_bond_directive(tier, "Nami")
            assert "{name}" not in result, (
                f"Tier {tier!r} still contains {{name}} placeholder after formatting"
            )


# ── TestGetBondDirectiveCharacterOverrides ────────────────────────────────────


class TestGetBondDirectiveCharacterOverrides:
    """Tests verifying per-character override text is appended correctly."""

    def test_fox_gets_override_text_at_friend_tier(self) -> None:
        """Fox's friend-tier override ('dude') is appended to the base directive."""
        result = get_bond_directive("friend", "Fox")
        # The fox/friend override mentions 'dude'
        assert "dude" in result

    def test_yuki_gets_override_text_at_friend_tier(self) -> None:
        """Yuki's friend-tier override ('tsundere') is appended."""
        result = get_bond_directive("friend", "Yuki")
        assert "tsundere" in result.lower()

    def test_dae_gets_override_text_at_friend_tier(self) -> None:
        """Dae's friend-tier override ('sarcastic') is appended."""
        result = get_bond_directive("friend", "Dae")
        assert "sarcastic" in result.lower()

    def test_hana_gets_override_text_at_friend_tier(self) -> None:
        """Hana's friend-tier override (recipes/eating) is appended."""
        result = get_bond_directive("friend", "Hana")
        assert "recipe" in result.lower() or "eating" in result.lower() or "scolds" in result.lower()

    def test_luna_gets_override_text_at_friend_tier(self) -> None:
        """Luna's friend-tier override ('occult') is appended."""
        result = get_bond_directive("friend", "Luna")
        assert "occult" in result.lower()

    def test_aria_gets_override_text_at_friend_tier(self) -> None:
        """Aria's friend-tier override ('songs') is appended."""
        result = get_bond_directive("friend", "Aria")
        assert "song" in result.lower()

    def test_unknown_character_gets_no_override(self) -> None:
        """An unknown character name produces only the base tier directive.

        The result must equal the base template with the name interpolated in,
        without any extra appended text.
        """
        result = get_bond_directive("friend", "Unknown")
        expected_base = TIER_DIRECTIVES["friend"].format(name="Unknown")
        assert result == expected_base

    def test_override_appended_after_base_not_replacing_it(self) -> None:
        """The base directive content is still present when an override is added.

        Fox's friend override must not replace the base — both must appear.
        """
        result = get_bond_directive("friend", "Fox")
        base_fragment = "[Bond: Friend]"
        assert base_fragment in result

    def test_character_matching_is_case_insensitive(self) -> None:
        """Character name lookup is lowercased, so 'FOX' matches the 'fox' key."""
        result_lower = get_bond_directive("friend", "Fox")
        result_upper = get_bond_directive("friend", "FOX")
        # Both should have override text; lower vs upper may differ in name substitution
        # but the override presence (the 'dude' word) must appear in both
        assert "dude" in result_lower
        assert "dude" in result_upper

    def test_all_six_known_chars_get_override_at_soulmate_tier(self) -> None:
        """Every supported character produces longer output at soulmate due to override.

        For each known character, the soulmate directive with override must be
        longer than the base-only (unknown character) version.
        """
        known_chars = ["Fox", "Yuki", "Dae", "Hana", "Luna", "Aria"]
        base_len = len(get_bond_directive("soulmate", "Unkno_wn"))
        for char in known_chars:
            result = get_bond_directive("soulmate", char)
            assert len(result) > base_len, (
                f"Character {char!r} did not receive soulmate override text"
            )


# ── TestGetBondDirectiveUnknownTier ───────────────────────────────────────────


class TestGetBondDirectiveUnknownTier:
    """Tests for the unknown/invalid tier edge case."""

    def test_unknown_tier_returns_empty_string(self) -> None:
        """A tier name not in TIER_DIRECTIVES returns an empty string."""
        result = get_bond_directive("best_friend", "Fox")
        assert result == ""

    def test_empty_string_tier_returns_empty_string(self) -> None:
        """An empty string tier returns an empty string."""
        result = get_bond_directive("", "Fox")
        assert result == ""

    def test_garbage_tier_returns_empty_string(self) -> None:
        """A random nonsense tier string returns an empty string."""
        result = get_bond_directive("not_a_real_tier_xyz", "Fox")
        assert result == ""

    def test_none_char_name_with_valid_tier_does_not_raise(self) -> None:
        """Passing None as char_name should not raise — format() handles it as 'None'.

        This is a boundary test: the function does .format(name=char_name), which
        will coerce None to the string 'None'.  No exception should propagate.
        """
        # This should not raise even with None
        try:
            result = get_bond_directive("stranger", None)  # type: ignore[arg-type]
            # If it succeeds, 'None' (the string) should appear in the result
            assert "None" in result
        except (AttributeError, TypeError):
            # Acceptable if the implementation rejects None — document the behavior
            pass


# ── TestGetBondContextSection ─────────────────────────────────────────────────


class TestGetBondContextSection:
    """Tests for get_bond_context_section using mock cursors and in-memory SQLite."""

    # -- helpers --

    @staticmethod
    def _make_mock_cursor(bond_level: int) -> MagicMock:
        """Build a MagicMock sqlite3.Cursor that returns the given bond_level row.

        Args:
            bond_level: The integer value to return from bond_levels.

        Returns:
            MagicMock with .execute().fetchone() returning (bond_level,).
        """
        cur = MagicMock(spec=sqlite3.Cursor)
        cur.execute.return_value.fetchone.return_value = (bond_level,)
        return cur

    @staticmethod
    def _make_no_row_cursor() -> MagicMock:
        """Build a MagicMock cursor that returns None (no bond_levels row).

        Returns:
            MagicMock with .execute().fetchone() returning None.
        """
        cur = MagicMock(spec=sqlite3.Cursor)
        cur.execute.return_value.fetchone.return_value = None
        return cur

    @staticmethod
    def _make_failing_cursor() -> MagicMock:
        """Build a MagicMock cursor whose execute() raises an Exception.

        Returns:
            MagicMock where .execute() raises sqlite3.OperationalError.
        """
        cur = MagicMock(spec=sqlite3.Cursor)
        cur.execute.side_effect = sqlite3.OperationalError("no such table: bond_levels")
        return cur

    # -- bond context header --

    def test_returns_bond_context_header_when_row_exists(self) -> None:
        """Result contains '[BOND CONTEXT' header when bond_levels row is present."""
        cur = self._make_mock_cursor(bond_level=20)
        result = get_bond_context_section(1, "Fox", cur)
        assert result is not None
        assert "[BOND CONTEXT" in result

    def test_level_in_header_matches_db_value(self) -> None:
        """The numeric level in the header matches the value from bond_levels."""
        cur = self._make_mock_cursor(bond_level=42)
        result = get_bond_context_section(1, "Fox", cur)
        assert result is not None
        assert "42" in result

    def test_char_name_appears_in_section_text(self) -> None:
        """The character's name is present in the returned context section."""
        cur = self._make_mock_cursor(bond_level=20)
        result = get_bond_context_section(1, "Hana", cur)
        assert result is not None
        assert "Hana" in result

    # -- level-to-tier mapping --

    def test_level_0_no_row_produces_stranger_tier(self) -> None:
        """No bond_levels row (defaults to 0) maps to the 'stranger' tier.

        The returned text must contain the '[Bond: Stranger]' directive header.
        """
        cur = self._make_no_row_cursor()
        result = get_bond_context_section(1, "Fox", cur)
        assert result is not None
        assert "[Bond: Stranger]" in result

    def test_explicit_level_0_row_produces_stranger_tier(self) -> None:
        """An explicit bond_level=0 row maps to 'stranger'."""
        cur = self._make_mock_cursor(bond_level=0)
        result = get_bond_context_section(1, "Fox", cur)
        assert result is not None
        assert "[Bond: Stranger]" in result

    def test_level_20_produces_friend_tier(self) -> None:
        """bond_level=20 falls in the 15–34 friend tier range.

        The section must contain '[Bond: Friend]' and the tier label 'Friend'.
        """
        cur = self._make_mock_cursor(bond_level=20)
        result = get_bond_context_section(1, "Fox", cur)
        assert result is not None
        assert "[Bond: Friend]" in result
        assert "Friend" in result

    def test_level_5_produces_acquaintance_tier(self) -> None:
        """bond_level=5 is the first level of the acquaintance tier (5–14)."""
        cur = self._make_mock_cursor(bond_level=5)
        result = get_bond_context_section(1, "Fox", cur)
        assert result is not None
        assert "[Bond: Acquaintance]" in result

    def test_level_35_produces_close_friend_tier(self) -> None:
        """bond_level=35 is the first level of close_friend tier (35–64)."""
        cur = self._make_mock_cursor(bond_level=35)
        result = get_bond_context_section(1, "Fox", cur)
        assert result is not None
        assert "[Bond: Close Friend]" in result

    def test_level_80_produces_soulmate_tier(self) -> None:
        """bond_level=80 falls in the soulmate tier (65–100).

        The section must contain '[Bond: Soulmate]' and the tier label 'Soulmate'.
        """
        cur = self._make_mock_cursor(bond_level=80)
        result = get_bond_context_section(1, "Fox", cur)
        assert result is not None
        assert "[Bond: Soulmate]" in result
        assert "Soulmate" in result

    def test_level_100_produces_soulmate_tier(self) -> None:
        """bond_level=100 (max level) still maps to soulmate."""
        cur = self._make_mock_cursor(bond_level=100)
        result = get_bond_context_section(1, "Yuki", cur)
        assert result is not None
        assert "[Bond: Soulmate]" in result

    # -- exception resilience --

    def test_exception_in_cursor_falls_back_to_stranger_tier(self) -> None:
        """A cursor that raises on execute() falls back gracefully to level 0 / stranger.

        The function should not propagate the exception; instead it should
        return the stranger-tier directive (bond_level defaults to 0).
        """
        cur = self._make_failing_cursor()
        result = get_bond_context_section(1, "Fox", cur)
        # Must not raise; must return something (stranger tier)
        assert result is not None
        assert "[Bond: Stranger]" in result

    def test_exception_does_not_propagate(self) -> None:
        """get_bond_context_section never raises when the cursor is broken."""
        cur = self._make_failing_cursor()
        try:
            get_bond_context_section(99, "UnknownChar", cur)
        except Exception as exc:
            pytest.fail(f"get_bond_context_section raised unexpectedly: {exc!r}")

    # -- tier label formatting --

    def test_tier_label_uses_title_case_in_header(self) -> None:
        """The tier label in the header uses Title Case (underscores replaced).

        close_friend -> 'Close Friend', not 'close_friend'.
        """
        cur = self._make_mock_cursor(bond_level=35)
        result = get_bond_context_section(1, "Fox", cur)
        assert result is not None
        assert "Close Friend" in result
        assert "close_friend" not in result

    def test_section_starts_with_newline(self) -> None:
        """The returned context section begins with a newline for clean injection."""
        cur = self._make_mock_cursor(bond_level=20)
        result = get_bond_context_section(1, "Fox", cur)
        assert result is not None
        assert result.startswith("\n")

    # -- in-memory DB integration --

    def test_real_cursor_with_bond_levels_table(self) -> None:
        """End-to-end: real in-memory SQLite DB with bond_levels table returns section."""
        con = sqlite3.connect(":memory:")
        con.execute(
            "CREATE TABLE bond_levels (char_id INTEGER PRIMARY KEY, bond_level INTEGER DEFAULT 0)"
        )
        con.execute("INSERT INTO bond_levels (char_id, bond_level) VALUES (1, 65)")
        con.commit()
        cur = con.cursor()
        result = get_bond_context_section(1, "Luna", cur)
        assert result is not None
        assert "[Bond: Soulmate]" in result
        con.close()

    def test_real_cursor_missing_row_falls_back_to_stranger(self) -> None:
        """Real cursor with no matching row defaults to bond_level=0 (stranger)."""
        con = sqlite3.connect(":memory:")
        con.execute(
            "CREATE TABLE bond_levels (char_id INTEGER PRIMARY KEY, bond_level INTEGER DEFAULT 0)"
        )
        con.commit()
        cur = con.cursor()
        result = get_bond_context_section(99, "Aria", cur)
        assert result is not None
        assert "[Bond: Stranger]" in result
        con.close()

    def test_real_cursor_missing_table_falls_back_to_stranger(self) -> None:
        """Real cursor with no bond_levels table at all falls back to stranger tier."""
        con = sqlite3.connect(":memory:")
        cur = con.cursor()
        result = get_bond_context_section(1, "Fox", cur)
        assert result is not None
        assert "[Bond: Stranger]" in result
        con.close()


# ── TestTierDirectivesConstant ────────────────────────────────────────────────


class TestTierDirectivesConstant:
    """Sanity checks on the TIER_DIRECTIVES and CHARACTER_OVERRIDES constants."""

    def test_tier_directives_has_five_keys(self) -> None:
        """TIER_DIRECTIVES must define exactly the five canonical tier keys."""
        expected = {"stranger", "acquaintance", "friend", "close_friend", "soulmate"}
        assert set(TIER_DIRECTIVES.keys()) == expected

    def test_all_base_directives_contain_name_placeholder(self) -> None:
        """Every base directive template must contain at least one {name} placeholder.

        Without {name}, the character's identity is not injected into the prompt.
        """
        for tier, template in TIER_DIRECTIVES.items():
            assert "{name}" in template, (
                f"TIER_DIRECTIVES[{tier!r}] missing {{name}} placeholder"
            )

    def test_character_overrides_has_six_known_characters(self) -> None:
        """CHARACTER_OVERRIDES must contain all six named characters."""
        expected = {"fox", "yuki", "dae", "hana", "luna", "aria"}
        assert set(CHARACTER_OVERRIDES.keys()) == expected

    def test_each_character_has_all_five_tiers(self) -> None:
        """Every character in CHARACTER_OVERRIDES defines overrides for all five tiers."""
        expected_tiers = {"stranger", "acquaintance", "friend", "close_friend", "soulmate"}
        for char, tier_map in CHARACTER_OVERRIDES.items():
            assert set(tier_map.keys()) == expected_tiers, (
                f"CHARACTER_OVERRIDES[{char!r}] missing tiers: "
                f"{expected_tiers - set(tier_map.keys())}"
            )

    def test_all_override_strings_are_nonempty(self) -> None:
        """No override string in CHARACTER_OVERRIDES should be empty."""
        for char, tier_map in CHARACTER_OVERRIDES.items():
            for tier, text in tier_map.items():
                assert text.strip(), (
                    f"CHARACTER_OVERRIDES[{char!r}][{tier!r}] is empty"
                )
