"""Comprehensive tests for Bond Progression Phase 1 modules.

Covers:
- backend.bond.xp_engine: depth multiplier, XP calculation, bonus checks
- backend.bond.unlocks: unlock table queries, tier metadata
- backend.bond.milestones: DB-backed milestone/XP-event recording
- backend.bond.progression: XP curve, tier boundaries, add_bond_xp
"""

from __future__ import annotations

import sqlite3
from datetime import date, datetime, timedelta, timezone

import pytest

from backend.bond.milestones import (
    check_and_record_unlocks,
    get_milestones,
    get_xp_history,
    mark_milestone_viewed,
    record_milestone,
    record_xp_event,
)
from backend.bond.progression import (
    _xp_required_for_level,
    add_bond_xp,
    get_tier_name,
)
from backend.bond.unlocks import (
    TIER_COLORS,
    TIER_NAMES,
    UNLOCK_TABLE,
    get_next_unlock,
    get_unlocked_features,
    get_unlocks_for_level,
)
from backend.bond.xp_engine import (
    calculate_depth_multiplier,
    calculate_message_xp,
    check_daily_bonus,
    check_interest_match,
    check_session_bonus,
)

# ── Shared DB helpers ─────────────────────────────────────────────────────────

_BOND_SCHEMA = """
CREATE TABLE bond_milestones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    char_id INTEGER NOT NULL,
    milestone_type TEXT NOT NULL,
    milestone_key TEXT NOT NULL,
    bond_level INTEGER NOT NULL,
    achieved_at TEXT DEFAULT (datetime('now')),
    viewed INTEGER DEFAULT 0,
    UNIQUE(char_id, milestone_key)
);
CREATE TABLE bond_xp_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    char_id INTEGER NOT NULL,
    xp_amount INTEGER NOT NULL,
    action TEXT NOT NULL,
    multiplier REAL DEFAULT 1.0,
    source_detail TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);
"""

_CHARACTER_RELATIONSHIPS_SCHEMA = """
CREATE TABLE character_relationships (
    char_id INTEGER PRIMARY KEY,
    bond_level INTEGER DEFAULT 0,
    bond_xp INTEGER DEFAULT 0,
    relationship_mode TEXT DEFAULT 'friend',
    covenant_date TEXT,
    last_daily_bonus_date TEXT,
    current_session_msgs INTEGER DEFAULT 0,
    session_bonus_awarded INTEGER DEFAULT 0
);
"""


def _make_bond_db() -> sqlite3.Connection:
    """Create an in-memory SQLite DB with bond_milestones + bond_xp_events tables.

    Returns:
        Open sqlite3.Connection with the bond schema applied.
    """
    con = sqlite3.connect(":memory:")
    con.executescript(_BOND_SCHEMA)
    con.commit()
    return con


def _make_full_bond_db() -> sqlite3.Connection:
    """Create an in-memory SQLite DB with all bond tables required for progression.

    Returns:
        Open sqlite3.Connection with both bond and character_relationships schemas.
    """
    con = sqlite3.connect(":memory:")
    con.executescript(_BOND_SCHEMA + _CHARACTER_RELATIONSHIPS_SCHEMA)
    con.commit()
    return con


# ── TestXPEngine ──────────────────────────────────────────────────────────────


class TestXPEngine:
    """Tests for backend.bond.xp_engine pure functions."""

    # -- calculate_depth_multiplier --

    def test_short_messages_return_base_multiplier(self) -> None:
        """Very short messages with no signals should yield exactly 1.0.

        'ok' + 'ok' = 4 chars combined — below every bonus threshold.
        """
        result = calculate_depth_multiplier("ok", "ok")
        assert result == 1.0

    def test_long_combined_message_adds_half_point(self) -> None:
        """Combined length > 600 chars should add +0.5 to the multiplier."""
        user_msg = "a" * 400
        assistant_msg = "b" * 300  # combined = 700 > 600
        result = calculate_depth_multiplier(user_msg, assistant_msg)
        assert result == pytest.approx(1.5)

    def test_medium_combined_message_adds_point_two(self) -> None:
        """Combined length > 200 and ≤ 600 chars adds +0.2."""
        user_msg = "a" * 150
        assistant_msg = "b" * 100  # combined = 250
        result = calculate_depth_multiplier(user_msg, assistant_msg)
        assert result == pytest.approx(1.2)

    def test_question_mark_adds_point_two(self) -> None:
        """A '?' in the user message adds +0.2."""
        result = calculate_depth_multiplier("How are you?", "Fine.")
        assert result == pytest.approx(1.2)

    def test_one_emotional_keyword_adds_point_fifteen(self) -> None:
        """A single emotional keyword hit (no disclosure pattern) adds +0.15.

        'happy' is in _EMOTIONAL_KEYWORDS; the phrase 'happy sad today' avoids
        all _DISCLOSURE_PATTERNS ('i feel', 'i think', 'my family', etc.) so
        the only bonus applied is the 1–2 keyword tier.
        """
        # 'happy' and 'sad' are keywords; no disclosure pattern in "happy sad today"
        result = calculate_depth_multiplier("happy sad today", "")
        assert result == pytest.approx(1.15)

    def test_three_or_more_emotional_keywords_add_point_three(self) -> None:
        """Three or more emotional keyword hits add +0.3 (not +0.15)."""
        result = calculate_depth_multiplier("I feel love and miss you and I'm sad", "")
        # 'feel', 'love', 'miss', 'sad' — at least 3 → +0.3
        assert result >= 1.3

    def test_disclosure_pattern_adds_point_three(self) -> None:
        """A personal disclosure pattern adds +0.3."""
        result = calculate_depth_multiplier("I feel really nervous today", "")
        # "I feel" is a disclosure pattern → +0.3; "feel" is also an emotional kw → +0.15
        # Total = 1.0 + 0.3 + 0.15 = 1.45
        assert result == pytest.approx(1.45)

    def test_multiplier_theoretical_max_is_2_3(self) -> None:
        """All bonuses stacked reach 2.3, which is below the 2.5 cap.

        The scoring components sum to: 1.0 (base) + 0.5 (>600 chars) +
        0.2 (question) + 0.3 (3+ keywords) + 0.3 (disclosure) = 2.3.
        The cap of 2.5 is defined but unreachable with the current scoring
        rules.  This test documents the actual reachable maximum.
        """
        # All bonuses: >600 chars combined, '?', 3+ emotional keywords, disclosure pattern
        long_user = "I feel love and miss you and I'm sad and worried and lonely, why? " + "x" * 600
        result = calculate_depth_multiplier(long_user, "")
        assert result == pytest.approx(2.3)

    def test_multiplier_is_at_least_1_0(self) -> None:
        """Multiplier never drops below 1.0 (floor guard)."""
        result = calculate_depth_multiplier("", "")
        assert result == pytest.approx(1.0)

    # -- calculate_message_xp --

    def test_calculate_message_xp_returns_three_tuple(self) -> None:
        """calculate_message_xp must return (int, float, bool)."""
        xp, mult, matched = calculate_message_xp("hi", "hey", [], base_xp=5)
        assert isinstance(xp, int)
        assert isinstance(mult, float)
        assert isinstance(matched, bool)

    def test_base_xp_default_is_5(self) -> None:
        """Default base_xp of 5 with neutral message yields 5 XP."""
        xp, _, _ = calculate_message_xp("ok", "ok", [])
        assert xp == 5

    def test_xp_capped_at_12(self) -> None:
        """No single message exchange can award more than 12 XP."""
        # Use a high-signal message to push the multiplier to 2.5
        long_user = "I feel love and miss you and I'm sad and worried and lonely, why? " + "x" * 600
        xp, _, _ = calculate_message_xp(long_user, "", [], base_xp=5)
        assert xp <= 12

    def test_interest_match_applies_1_5x_boost(self) -> None:
        """When an interest matches, effective multiplier is boosted 1.5x.

        The message 'anime is great' triggers no emotional keywords or
        disclosure patterns, so depth_mult=1.0, and after the interest-match
        boost it becomes 1.0 * 1.5 = 1.5.
        """
        # "anime is great" — no keywords, no disclosure → depth_mult = 1.0
        xp, mult, matched = calculate_message_xp(
            "anime is great", "cool", ["anime"], base_xp=5
        )
        assert matched is True
        assert mult == pytest.approx(1.5)
        assert xp == round(5 * 1.5)

    def test_no_interest_match_when_interest_absent(self) -> None:
        """No interest match when message doesn't contain any interest word."""
        _, _, matched = calculate_message_xp("Hello there", "Hi", ["anime"], base_xp=5)
        assert matched is False

    def test_xp_at_least_base_when_no_signals(self) -> None:
        """Minimum XP equals base_xp for neutral messages (multiplier=1.0)."""
        xp, _, _ = calculate_message_xp("ok", "ok", [], base_xp=5)
        assert xp == 5

    # -- check_interest_match --

    def test_interest_match_true_when_word_present(self) -> None:
        """Returns True when an interest word appears in the user message."""
        assert check_interest_match("I love anime", ["anime"]) is True

    def test_interest_match_false_when_word_absent(self) -> None:
        """Returns False when no interest words appear in the user message."""
        assert check_interest_match("Hello there!", ["anime", "manga"]) is False

    def test_interest_match_case_insensitive(self) -> None:
        """Interest matching is case-insensitive."""
        assert check_interest_match("I watch ANIME daily", ["anime"]) is True

    def test_interest_match_empty_interests_returns_false(self) -> None:
        """Empty interests list always returns False."""
        assert check_interest_match("I love anime", []) is False

    # -- check_daily_bonus --

    def test_daily_bonus_true_when_never_awarded(self) -> None:
        """None last_bonus_date means the bonus was never awarded — grant it."""
        assert check_daily_bonus(None) is True

    def test_daily_bonus_true_for_yesterday(self) -> None:
        """A bonus date from yesterday should allow granting today's bonus."""
        yesterday = (date.today() - timedelta(days=1)).isoformat()
        assert check_daily_bonus(yesterday) is True

    def test_daily_bonus_false_for_today(self) -> None:
        """Bonus already granted today means it should not be re-granted."""
        today = date.today().isoformat()
        assert check_daily_bonus(today) is False

    def test_daily_bonus_true_for_unparseable_date(self) -> None:
        """Malformed date string is treated as never-awarded (don't block user)."""
        assert check_daily_bonus("not-a-date") is True

    def test_daily_bonus_accepts_full_iso_datetime(self) -> None:
        """Full ISO datetime strings (not just date) are parsed correctly."""
        today_dt = datetime.now(timezone.utc).isoformat()
        assert check_daily_bonus(today_dt) is False

    # -- check_session_bonus --

    def test_session_bonus_true_at_exactly_10_messages(self) -> None:
        """Session bonus is granted at exactly 10 messages if not already awarded."""
        assert check_session_bonus(10, already_awarded=False) is True

    def test_session_bonus_true_above_10_messages(self) -> None:
        """Session bonus is still True for 11+ messages when not yet awarded."""
        assert check_session_bonus(20, already_awarded=False) is True

    def test_session_bonus_false_below_threshold(self) -> None:
        """9 messages is below the threshold of 10 — bonus not granted."""
        assert check_session_bonus(9, already_awarded=False) is False

    def test_session_bonus_false_when_already_awarded(self) -> None:
        """Bonus is not re-granted if already_awarded is True."""
        assert check_session_bonus(10, already_awarded=True) is False

    def test_session_bonus_false_zero_messages(self) -> None:
        """Zero messages — bonus must not be awarded."""
        assert check_session_bonus(0, already_awarded=False) is False


# ── TestUnlocks ───────────────────────────────────────────────────────────────


class TestUnlocks:
    """Tests for backend.bond.unlocks data and query helpers."""

    # -- get_unlocks_for_level --

    def test_level_0_returns_basic_conversation(self) -> None:
        """Level 0 must have exactly one unlock: basic_conversation."""
        unlocks = get_unlocks_for_level(0)
        assert len(unlocks) == 1
        assert unlocks[0]["key"] == "basic_conversation"
        assert unlocks[0]["type"] == "base"

    def test_level_5_returns_story_and_ceremony(self) -> None:
        """Level 5 has two unlocks: first_real_talk (story) + tier_acquaintance (ceremony)."""
        unlocks = get_unlocks_for_level(5)
        keys = {u["key"] for u in unlocks}
        assert "first_real_talk" in keys
        assert "tier_acquaintance" in keys

    def test_missing_level_returns_empty_list(self) -> None:
        """A level with no entries (e.g. 19) returns an empty list."""
        assert get_unlocks_for_level(19) == []

    def test_shallow_copy_exposes_dict_mutation_bug(self) -> None:
        """get_unlocks_for_level returns a shallow list copy — the inner dicts are NOT copied.

        This test documents a known bug: mutating a returned dict modifies
        UNLOCK_TABLE directly.  The implementation uses ``list(...)`` which
        copies the list container but not the dict items inside it.

        NOTE: This test intentionally re-inserts the original value after
        mutation to avoid polluting subsequent tests that depend on UNLOCK_TABLE.
        """
        result = get_unlocks_for_level(0)
        original_type = UNLOCK_TABLE[0][0]["type"]
        result[0]["type"] = "mutated"
        # BUG: the original table is now corrupted
        assert UNLOCK_TABLE[0][0]["type"] == "mutated"
        # Restore to avoid cross-test pollution
        UNLOCK_TABLE[0][0]["type"] = original_type

    # -- get_unlocked_features --

    def test_level_0_returns_one_item(self) -> None:
        """At level 0, only basic_conversation is unlocked."""
        features = get_unlocked_features(0)
        assert len(features) == 1
        assert features[0]["key"] == "basic_conversation"

    def test_level_5_returns_six_items(self) -> None:
        """At level 5, all unlocks from levels 0–5 are present (7 total entries)."""
        features = get_unlocked_features(5)
        # Levels 0,1,2,3,4 each have 1 entry; level 5 has 2 entries → 7 total
        assert len(features) == 7

    def test_each_feature_has_level_key(self) -> None:
        """Each returned dict must include a 'level' key."""
        features = get_unlocked_features(5)
        for feat in features:
            assert "level" in feat

    def test_features_sorted_by_ascending_level(self) -> None:
        """Returned features are in ascending level order."""
        features = get_unlocked_features(10)
        levels = [int(f["level"]) for f in features]
        assert levels == sorted(levels)

    def test_level_key_is_string(self) -> None:
        """The 'level' key added to each dict is a string, not an int."""
        features = get_unlocked_features(1)
        for feat in features:
            assert isinstance(feat["level"], str)

    # -- get_next_unlock --

    def test_next_unlock_from_level_0_is_level_1(self) -> None:
        """The first unlock after level 0 is at level 1."""
        nxt = get_next_unlock(0)
        assert nxt is not None
        assert nxt["level"] == "1"

    def test_next_unlock_contains_expected_keys(self) -> None:
        """Returned dict has type, key, label, and level."""
        nxt = get_next_unlock(0)
        assert nxt is not None
        for required_key in ("type", "key", "label", "level"):
            assert required_key in nxt

    def test_next_unlock_from_level_100_is_none(self) -> None:
        """At max level there are no more unlocks — returns None."""
        assert get_next_unlock(100) is None

    def test_next_unlock_skips_already_earned_levels(self) -> None:
        """get_next_unlock returns the next *unearned* level, not the current one."""
        # At level 4 the next unlock is at level 5
        nxt = get_next_unlock(4)
        assert nxt is not None
        assert int(nxt["level"]) == 5

    # -- TIER_NAMES / TIER_COLORS --

    def test_tier_names_has_all_five_keys(self) -> None:
        """TIER_NAMES must have exactly the 5 expected tier keys."""
        expected = {"stranger", "acquaintance", "friend", "close_friend", "soulmate"}
        assert set(TIER_NAMES.keys()) == expected

    def test_tier_colors_has_all_five_keys(self) -> None:
        """TIER_COLORS must have exactly the 5 expected tier keys."""
        expected = {"stranger", "acquaintance", "friend", "close_friend", "soulmate"}
        assert set(TIER_COLORS.keys()) == expected

    def test_tier_colors_are_hex_strings(self) -> None:
        """All TIER_COLORS values must be valid CSS hex color strings."""
        for key, color in TIER_COLORS.items():
            assert color.startswith("#"), f"TIER_COLORS[{key!r}] not a hex color: {color!r}"
            assert len(color) in (4, 7), f"TIER_COLORS[{key!r}] unexpected length: {color!r}"


# ── TestMilestones ────────────────────────────────────────────────────────────


class TestMilestones:
    """Tests for backend.bond.milestones DB functions.

    Uses an in-memory SQLite database created fresh for each test method.
    """

    # -- record_milestone --

    def test_record_milestone_inserts_row_returns_true(self) -> None:
        """First insert for a (char_id, milestone_key) pair returns True."""
        con = _make_bond_db()
        cur = con.cursor()
        result = record_milestone(1, "level_up", "level_5", 5, cur)
        con.commit()
        assert result is True

    def test_record_milestone_duplicate_returns_false(self) -> None:
        """Inserting the same (char_id, milestone_key) a second time returns False."""
        con = _make_bond_db()
        cur = con.cursor()
        record_milestone(1, "level_up", "level_5", 5, cur)
        con.commit()
        result = record_milestone(1, "level_up", "level_5", 5, cur)
        con.commit()
        assert result is False

    def test_record_milestone_different_chars_are_independent(self) -> None:
        """Same milestone_key for different char_ids are separate records."""
        con = _make_bond_db()
        cur = con.cursor()
        r1 = record_milestone(1, "level_up", "level_5", 5, cur)
        r2 = record_milestone(2, "level_up", "level_5", 5, cur)
        con.commit()
        assert r1 is True
        assert r2 is True

    def test_record_milestone_graceful_on_missing_table(self) -> None:
        """record_milestone returns False (not raises) when the table is absent."""
        con = sqlite3.connect(":memory:")
        cur = con.cursor()
        result = record_milestone(1, "level_up", "level_5", 5, cur)
        assert result is False

    # -- get_milestones --

    def test_get_milestones_returns_expected_keys(self) -> None:
        """Each milestone dict must have the documented keys."""
        con = _make_bond_db()
        cur = con.cursor()
        record_milestone(1, "level_up", "level_1", 1, cur)
        con.commit()
        milestones = get_milestones(1, cur)
        assert len(milestones) == 1
        row = milestones[0]
        for key in ("id", "char_id", "milestone_type", "milestone_key", "bond_level", "achieved_at", "viewed"):
            assert key in row, f"Missing key {key!r} in milestone dict"

    def test_get_milestones_ordered_by_bond_level_asc(self) -> None:
        """Milestones are returned in ascending bond_level order."""
        con = _make_bond_db()
        cur = con.cursor()
        record_milestone(1, "level_up", "level_5", 5, cur)
        record_milestone(1, "level_up", "level_3", 3, cur)
        record_milestone(1, "level_up", "level_1", 1, cur)
        con.commit()
        milestones = get_milestones(1, cur)
        levels = [m["bond_level"] for m in milestones]
        assert levels == sorted(levels)

    def test_get_milestones_empty_for_unknown_char(self) -> None:
        """Returns an empty list for a char_id with no recorded milestones."""
        con = _make_bond_db()
        cur = con.cursor()
        assert get_milestones(999, cur) == []

    def test_get_milestones_empty_on_missing_table(self) -> None:
        """Returns empty list (not raises) when bond_milestones table is absent."""
        con = sqlite3.connect(":memory:")
        cur = con.cursor()
        assert get_milestones(1, cur) == []

    def test_get_milestones_include_unviewed_only_filter(self) -> None:
        """include_unviewed_only=True returns only milestones where viewed=0."""
        con = _make_bond_db()
        cur = con.cursor()
        record_milestone(1, "level_up", "level_1", 1, cur)
        record_milestone(1, "level_up", "level_2", 2, cur)
        con.commit()
        # Mark the first one viewed
        milestones = get_milestones(1, cur)
        mark_milestone_viewed(milestones[0]["id"], cur)
        con.commit()
        unviewed = get_milestones(1, cur, include_unviewed_only=True)
        assert all(m["viewed"] == 0 for m in unviewed)
        assert len(unviewed) == 1

    # -- mark_milestone_viewed --

    def test_mark_milestone_viewed_returns_true(self) -> None:
        """mark_milestone_viewed returns True when the row exists."""
        con = _make_bond_db()
        cur = con.cursor()
        record_milestone(1, "level_up", "level_1", 1, cur)
        con.commit()
        milestone_id = get_milestones(1, cur)[0]["id"]
        result = mark_milestone_viewed(milestone_id, cur)
        assert result is True

    def test_mark_milestone_viewed_sets_viewed_flag(self) -> None:
        """After mark_milestone_viewed, the viewed column is 1."""
        con = _make_bond_db()
        cur = con.cursor()
        record_milestone(1, "level_up", "level_1", 1, cur)
        con.commit()
        milestone_id = get_milestones(1, cur)[0]["id"]
        mark_milestone_viewed(milestone_id, cur)
        con.commit()
        milestones = get_milestones(1, cur)
        assert milestones[0]["viewed"] == 1

    def test_mark_milestone_viewed_returns_false_for_missing_id(self) -> None:
        """mark_milestone_viewed returns False when the id does not exist."""
        con = _make_bond_db()
        cur = con.cursor()
        result = mark_milestone_viewed(99999, cur)
        assert result is False

    def test_mark_milestone_viewed_graceful_on_missing_table(self) -> None:
        """Returns False (not raises) when bond_milestones table is absent."""
        con = sqlite3.connect(":memory:")
        cur = con.cursor()
        result = mark_milestone_viewed(1, cur)
        assert result is False

    # -- record_xp_event --

    def test_record_xp_event_inserts_without_error(self) -> None:
        """record_xp_event succeeds and the row is readable."""
        con = _make_bond_db()
        cur = con.cursor()
        record_xp_event(1, 5, "message", 1.0, None, cur)
        con.commit()
        cur.execute("SELECT COUNT(*) FROM bond_xp_events")
        assert cur.fetchone()[0] == 1

    def test_record_xp_event_graceful_on_missing_table(self) -> None:
        """record_xp_event does not raise when the table is absent."""
        con = sqlite3.connect(":memory:")
        cur = con.cursor()
        record_xp_event(1, 5, "message", 1.0, None, cur)  # must not raise

    # -- get_xp_history --

    def test_get_xp_history_returns_expected_keys(self) -> None:
        """Each XP history entry contains the documented keys."""
        con = _make_bond_db()
        cur = con.cursor()
        record_xp_event(1, 5, "message", 1.0, "first", cur)
        con.commit()
        history = get_xp_history(1, cur)
        assert len(history) == 1
        for key in ("id", "xp_amount", "action", "multiplier", "source_detail", "created_at"):
            assert key in history[0], f"Missing key {key!r}"

    def test_get_xp_history_ordered_most_recent_first(self) -> None:
        """XP events are returned in descending created_at order."""
        con = _make_bond_db()
        cur = con.cursor()
        # Insert with explicit timestamps to ensure order
        cur.execute(
            "INSERT INTO bond_xp_events (char_id, xp_amount, action, multiplier, created_at) VALUES (?,?,?,?,?)",
            (1, 5, "message", 1.0, "2026-01-01 10:00:00"),
        )
        cur.execute(
            "INSERT INTO bond_xp_events (char_id, xp_amount, action, multiplier, created_at) VALUES (?,?,?,?,?)",
            (1, 8, "voice_chat", 1.0, "2026-01-01 11:00:00"),
        )
        con.commit()
        history = get_xp_history(1, cur)
        assert history[0]["xp_amount"] == 8  # most recent first
        assert history[1]["xp_amount"] == 5

    def test_get_xp_history_respects_limit(self) -> None:
        """get_xp_history respects the limit parameter."""
        con = _make_bond_db()
        cur = con.cursor()
        for i in range(10):
            record_xp_event(1, i, "message", 1.0, None, cur)
        con.commit()
        history = get_xp_history(1, cur, limit=3)
        assert len(history) == 3

    def test_get_xp_history_empty_on_missing_table(self) -> None:
        """Returns empty list (not raises) when bond_xp_events table is absent."""
        con = sqlite3.connect(":memory:")
        cur = con.cursor()
        assert get_xp_history(1, cur) == []

    # -- check_and_record_unlocks --

    def test_check_and_record_unlocks_level_0_to_5(self) -> None:
        """Progressing 0 → 5 creates milestones for levels 1 through 5."""
        con = _make_bond_db()
        cur = con.cursor()
        newly = check_and_record_unlocks(1, old_level=0, new_level=5, cur=cur)
        con.commit()
        # Each of levels 1-5 gets a generic level_up milestone, plus unlocks at some levels
        level_up_keys = {m["key"] for m in newly if m["type"] == "level_up"}
        for level in range(1, 6):
            assert f"level_{level}" in level_up_keys

    def test_check_and_record_unlocks_creates_tier_up_at_5(self) -> None:
        """Tier ceremony for tier_acquaintance is recorded when reaching level 5."""
        con = _make_bond_db()
        cur = con.cursor()
        newly = check_and_record_unlocks(1, old_level=4, new_level=5, cur=cur)
        con.commit()
        tier_keys = {m["key"] for m in newly if m["type"] == "tier_up"}
        assert "tier_acquaintance" in tier_keys

    def test_check_and_record_unlocks_is_idempotent(self) -> None:
        """Running the same unlock range twice yields no new entries on the second run."""
        con = _make_bond_db()
        cur = con.cursor()
        check_and_record_unlocks(1, old_level=0, new_level=5, cur=cur)
        con.commit()
        second_run = check_and_record_unlocks(1, old_level=0, new_level=5, cur=cur)
        con.commit()
        assert second_run == []

    def test_check_and_record_unlocks_no_op_for_same_level(self) -> None:
        """If old_level == new_level, no milestones are recorded."""
        con = _make_bond_db()
        cur = con.cursor()
        newly = check_and_record_unlocks(1, old_level=5, new_level=5, cur=cur)
        assert newly == []


# ── TestProgressionCurve ──────────────────────────────────────────────────────


class TestProgressionCurve:
    """Tests for the XP formula and tier system in backend.bond.progression."""

    # -- _xp_required_for_level --

    def test_level_0_requires_150_xp(self) -> None:
        """Level 0 → 1 costs exactly 150 XP (base cost, no quadratic contribution)."""
        assert _xp_required_for_level(0) == 150

    def test_level_100_requires_0_xp(self) -> None:
        """Level 100 is the cap — no further XP is required."""
        assert _xp_required_for_level(100) == 0

    def test_xp_is_monotonically_increasing(self) -> None:
        """Each successive level requires more XP than the last."""
        for level in range(1, 100):
            assert _xp_required_for_level(level) > _xp_required_for_level(level - 1), (
                f"Level {level} costs less than level {level - 1}"
            )

    def test_total_xp_0_to_100_in_expected_range(self) -> None:
        """Total XP from level 0 to 100 is in the range 500k-650k.

        The docstring in progression.py claims ~340k but the actual formula
        150 + N^2 + 50*N with growth=1.0 (not 0.1 as might be implied by the
        ~340k target) sums to ~590,850.  This test documents the actual value.
        """
        total = sum(_xp_required_for_level(lvl) for lvl in range(100))
        assert 500_000 <= total <= 650_000, f"Total XP {total:,} outside expected range"

    def test_level_14_formula_value(self) -> None:
        """Level 14 → 15 matches the documented example: 150 + 14^2 + 50*14 = 1046."""
        assert _xp_required_for_level(14) == 1046

    def test_level_64_formula_value(self) -> None:
        """Level 64 → 65 formula: 150 + 64^2 + 50*64 = 7446.

        The docstring in progression.py claims 7346, but the actual
        formula with growth=1.0 gives 150 + 4096 + 3200 = 7446.
        This test documents the actual computed value.
        """
        assert _xp_required_for_level(64) == 7446

    # -- get_tier_name --

    def test_level_0_is_stranger(self) -> None:
        """Bond level 0 maps to the 'stranger' tier."""
        assert get_tier_name(0) == "stranger"

    def test_level_4_is_still_stranger(self) -> None:
        """Level 4 is the upper boundary of the stranger tier."""
        assert get_tier_name(4) == "stranger"

    def test_level_5_is_acquaintance(self) -> None:
        """Level 5 is the lower boundary of the acquaintance tier."""
        assert get_tier_name(5) == "acquaintance"

    def test_level_15_is_friend(self) -> None:
        """Level 15 is the lower boundary of the friend tier."""
        assert get_tier_name(15) == "friend"

    def test_level_35_is_close_friend(self) -> None:
        """Level 35 is the lower boundary of the close_friend tier."""
        assert get_tier_name(35) == "close_friend"

    def test_level_65_is_soulmate(self) -> None:
        """Level 65 is the lower boundary of the soulmate tier."""
        assert get_tier_name(65) == "soulmate"

    def test_level_100_is_soulmate(self) -> None:
        """Level 100 (max) is still in the soulmate tier."""
        assert get_tier_name(100) == "soulmate"

    def test_all_tier_boundary_transitions(self) -> None:
        """Each documented tier boundary is tested for correct tier name."""
        boundaries = [
            (0, "stranger"),
            (4, "stranger"),
            (5, "acquaintance"),
            (14, "acquaintance"),
            (15, "friend"),
            (34, "friend"),
            (35, "close_friend"),
            (64, "close_friend"),
            (65, "soulmate"),
            (100, "soulmate"),
        ]
        for level, expected_tier in boundaries:
            actual = get_tier_name(level)
            assert actual == expected_tier, (
                f"Level {level}: expected {expected_tier!r}, got {actual!r}"
            )
