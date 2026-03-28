"""Tests for backend/relationship/vocabulary.py — VocabularyManager (F30).

All tests use in-memory SQLite so no disk state is created or leaked.
"""

from __future__ import annotations

import sqlite3

import pytest

from backend.relationship.vocabulary import (
    FREQUENCY_SCALE,
    VocabularyManager,
)

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

_DDL = """
CREATE TABLE IF NOT EXISTS private_vocabulary (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    char_id INTEGER NOT NULL,
    term TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'pet_name',
    meaning TEXT NOT NULL DEFAULT '',
    origin TEXT NOT NULL DEFAULT 'user',
    context TEXT NOT NULL DEFAULT '',
    first_used_at TEXT NOT NULL DEFAULT (datetime('now')),
    usage_count INTEGER NOT NULL DEFAULT 1,
    last_used_at TEXT NOT NULL DEFAULT (datetime('now')),
    is_active INTEGER NOT NULL DEFAULT 1,
    UNIQUE(char_id, term)
)
"""


@pytest.fixture()
def conn() -> sqlite3.Connection:
    """Provide a fresh in-memory SQLite connection with the vocabulary table."""
    c = sqlite3.connect(":memory:")
    c.execute(_DDL)
    c.commit()
    yield c
    c.close()


@pytest.fixture()
def mgr() -> VocabularyManager:
    """Provide a clean VocabularyManager instance."""
    return VocabularyManager()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _add(mgr: VocabularyManager, conn: sqlite3.Connection, **kwargs):
    """Shorthand: add a term with sensible defaults."""
    defaults = {
        "char_id": 1,
        "term": "sunshine",
        "category": "pet_name",
        "meaning": "endearment",
        "origin": "character",
        "context": "started naturally",
    }
    defaults.update(kwargs)
    return mgr.add_term(conn=conn, **defaults)


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestAddAndGet:
    def test_add_and_get_vocabulary(self, mgr, conn):
        """Basic add then retrieve round-trip."""
        _add(mgr, conn, term="sunshine")
        terms = mgr.get_vocabulary(char_id=1, conn=conn)
        assert len(terms) == 1
        assert terms[0].term == "sunshine"
        assert terms[0].is_active is True

    def test_returned_term_has_correct_fields(self, mgr, conn):
        """Returned VocabTerm carries all expected field values."""
        t = _add(mgr, conn, term="starlight", category="pet_name", meaning="bright", origin="mutual", context="from a late-night chat")
        assert t.char_id == 1
        assert t.term == "starlight"
        assert t.category == "pet_name"
        assert t.meaning == "bright"
        assert t.origin == "mutual"
        assert t.context == "from a late-night chat"
        assert t.usage_count == 1
        assert t.is_active is True


class TestDuplicateSkip:
    def test_add_duplicate_skipped(self, mgr, conn):
        """Inserting the same (char_id, term) twice does not create two rows."""
        t1 = _add(mgr, conn, term="anchor")
        t2 = _add(mgr, conn, term="anchor")  # duplicate
        terms = mgr.get_vocabulary(char_id=1, conn=conn)
        assert len(terms) == 1
        # Both calls return a valid VocabTerm with the same id
        assert t1.id == t2.id

    def test_different_chars_same_term_allowed(self, mgr, conn):
        """Same term for different char_ids is NOT a duplicate."""
        _add(mgr, conn, char_id=1, term="honey")
        _add(mgr, conn, char_id=2, term="honey")
        assert len(mgr.get_vocabulary(char_id=1, conn=conn)) == 1
        assert len(mgr.get_vocabulary(char_id=2, conn=conn)) == 1


class TestIncrementUsage:
    def test_increment_usage(self, mgr, conn):
        """usage_count increases by 1 on each call."""
        t = _add(mgr, conn)
        assert t.usage_count == 1
        mgr.increment_usage(t.id, conn)
        terms = mgr.get_vocabulary(char_id=1, conn=conn)
        assert terms[0].usage_count == 2

    def test_increment_usage_multiple_times(self, mgr, conn):
        """usage_count accumulates correctly over several increments."""
        t = _add(mgr, conn)
        for _ in range(4):
            mgr.increment_usage(t.id, conn)
        terms = mgr.get_vocabulary(char_id=1, conn=conn)
        assert terms[0].usage_count == 5  # 1 initial + 4 increments


class TestDeactivateTerm:
    def test_deactivate_term(self, mgr, conn):
        """Deactivated term does not appear in get_vocabulary results."""
        t = _add(mgr, conn)
        mgr.deactivate_term(t.id, conn)
        terms = mgr.get_vocabulary(char_id=1, conn=conn)
        assert terms == []

    def test_deactivate_leaves_other_terms_intact(self, mgr, conn):
        """Only the specified term is deactivated; others remain active."""
        t1 = _add(mgr, conn, term="firstterm")
        t2 = _add(mgr, conn, term="secondterm")
        mgr.deactivate_term(t1.id, conn)
        terms = mgr.get_vocabulary(char_id=1, conn=conn)
        assert len(terms) == 1
        assert terms[0].term == "secondterm"


class TestPromptInjection:
    def test_prompt_injection_empty(self, mgr, conn):
        """Returns empty string when no active terms exist."""
        result = mgr.get_prompt_injection(char_id=1, intimacy_level=50, conn=conn)
        assert result == ""

    def test_prompt_below_threshold(self, mgr, conn):
        """Returns empty string when intimacy_level < 20."""
        _add(mgr, conn, term="darling")
        result = mgr.get_prompt_injection(char_id=1, intimacy_level=10, conn=conn)
        assert result == ""

    def test_prompt_at_exact_threshold(self, mgr, conn):
        """Returns non-empty string when intimacy_level == 20 (boundary)."""
        _add(mgr, conn, term="darling")
        result = mgr.get_prompt_injection(char_id=1, intimacy_level=20, conn=conn)
        assert result != ""

    def test_prompt_injection_with_terms(self, mgr, conn):
        """Returns formatted prompt block that includes pet name data."""
        _add(mgr, conn, term="starshine", category="pet_name", origin="character")
        result = mgr.get_prompt_injection(
            char_id=1, intimacy_level=50, conn=conn, user_name="Alex"
        )
        assert "YOUR PRIVATE VOCABULARY WITH THE USER:" in result
        assert "starshine" in result
        assert "Alex" in result

    def test_prompt_includes_reference_section(self, mgr, conn):
        """Reference terms appear in the prompt under Shared references."""
        _add(mgr, conn, term="the mission", category="reference", meaning="our long-term goal")
        result = mgr.get_prompt_injection(char_id=1, intimacy_level=40, conn=conn)
        assert "Shared references" in result
        assert "the mission" in result

    def test_prompt_includes_joke_section(self, mgr, conn):
        """Inside jokes appear in the prompt under Inside jokes."""
        _add(mgr, conn, term="potato mode", category="joke", context="when everything went wrong")
        result = mgr.get_prompt_injection(char_id=1, intimacy_level=40, conn=conn)
        assert "Inside jokes" in result
        assert "potato mode" in result

    def test_prompt_includes_code_word_section(self, mgr, conn):
        """Code words appear in the prompt under Code words."""
        _add(mgr, conn, term="red flag", category="code_word", meaning="I need a break")
        result = mgr.get_prompt_injection(char_id=1, intimacy_level=40, conn=conn)
        assert "Code words" in result
        assert "red flag" in result


class TestFrequencyScaling:
    """Verify that the correct frequency percentage is injected per intimacy band."""

    @pytest.mark.parametrize(
        "intimacy,expected_pct",
        [
            (20, 20),
            (39, 20),
            (40, 35),
            (59, 35),
            (60, 50),
            (79, 50),
            (80, 60),
            (100, 60),
        ],
    )
    def test_frequency_scaling(self, mgr, conn, intimacy: int, expected_pct: int):
        """Correct percentage appears in the prompt for each intimacy band."""
        _add(mgr, conn, term="sunshine")
        result = mgr.get_prompt_injection(char_id=1, intimacy_level=intimacy, conn=conn)
        assert f"{expected_pct}%" in result


class TestPetNameProposal:
    def test_get_pet_name_proposal_known_character(self, mgr):
        """Returns a valid proposal dict for a character in the catalogue."""
        result = mgr.get_pet_name_proposal("Dae (Neciridae)")
        assert result is not None
        assert result["name"] in ["my muse", "starshine", "anchor"]
        assert result["name"] in result["proposal"]
        assert "reason" in result

    def test_get_pet_name_proposal_unknown_character(self, mgr):
        """Returns None for a character not in the proposals catalogue."""
        result = mgr.get_pet_name_proposal("Unknown Character XYZ")
        assert result is None

    def test_proposal_text_contains_name_and_reason(self, mgr):
        """Proposal string is formatted with both name and reason substituted."""
        result = mgr.get_pet_name_proposal("Luna (Tsukimi)")
        assert result is not None
        assert result["name"] in result["proposal"]
        assert result["reason"] in result["proposal"]

    def test_all_catalogue_characters_return_proposals(self, mgr):
        """Every character in PET_NAME_PROPOSALS returns a non-None proposal."""
        from backend.relationship.vocabulary import PET_NAME_PROPOSALS
        for char_name in PET_NAME_PROPOSALS:
            result = mgr.get_pet_name_proposal(char_name)
            assert result is not None, f"No proposal returned for {char_name!r}"


class TestGetStats:
    def test_get_stats_empty(self, mgr, conn):
        """Stats for a character with no vocabulary are all zero/None."""
        stats = mgr.get_stats(char_id=99, conn=conn)
        assert stats["total_terms"] == 0
        assert stats["pet_names_count"] == 0
        assert stats["most_used_term"] is None
        assert stats["newest_term"] is None

    def test_get_stats_returns_correct_counts(self, mgr, conn):
        """total_terms and pet_names_count reflect inserted rows."""
        _add(mgr, conn, term="darling", category="pet_name")
        _add(mgr, conn, term="the plan", category="reference")
        stats = mgr.get_stats(char_id=1, conn=conn)
        assert stats["total_terms"] == 2
        assert stats["pet_names_count"] == 1

    def test_get_stats_most_used_term(self, mgr, conn):
        """most_used_term reflects the term with the highest usage_count."""
        t1 = _add(mgr, conn, term="frequently")
        t2 = _add(mgr, conn, term="rarely")
        for _ in range(5):
            mgr.increment_usage(t1.id, conn)
        stats = mgr.get_stats(char_id=1, conn=conn)
        assert stats["most_used_term"] == "frequently"

    def test_get_stats_excludes_deactivated(self, mgr, conn):
        """Deactivated terms are not counted in stats."""
        t = _add(mgr, conn, term="gone")
        mgr.deactivate_term(t.id, conn)
        stats = mgr.get_stats(char_id=1, conn=conn)
        assert stats["total_terms"] == 0
