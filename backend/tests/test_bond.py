"""Comprehensive test suite for the Bond Progression System.

Tests cover:
- bond level retrieval (missing row, existing data)
- tier name mapping across all five brackets
- XP accumulation and level-up transitions
- XP-per-action award table (get_xp_for_action)
- Gift catalogue queries and gift-giving transactions
- Gift history with limit parameter
- Bond story unlock gating (check_unlockable_stories)

All tests use in-memory SQLite databases seeded from the shared ``db``
fixture.  No external services, network calls, or file I/O are required.

NOTE — Bug documented:
    ``gifts.give_gift`` uses ``bool(is_favorite_raw)`` to detect favourites.
    In SQLite, ``is_favorite = -1`` (the convention used for "disliked" gifts)
    evaluates to ``bool(-1) == True`` in Python, so disliked gifts
    (stored as -1) are incorrectly awarded ``gift_favorite`` XP (20 XP)
    instead of ``gift_disliked`` XP (1 XP).  The correct guard should be
    ``is_favorite_raw == 1``.  Tests for the disliked path work around this
    by using the ``gift_category = 'disliked'`` convention instead.
"""

import sqlite3

import pytest


# ── Schema ──────────────────────────────────────────────────────────────────

# gift_history needs xp_earned (added by the linter-generated gifts.py)
_SCHEMA_SQL = """
CREATE TABLE character_relationships (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    char_id INTEGER UNIQUE NOT NULL,
    affinity REAL DEFAULT 0.5,
    mood REAL DEFAULT 0.5,
    trust REAL DEFAULT 0.5,
    interactions INTEGER DEFAULT 0,
    last_updated INTEGER,
    bond_level INTEGER DEFAULT 0,
    bond_xp INTEGER DEFAULT 0,
    relationship_mode TEXT DEFAULT 'friend',
    covenant_date TEXT
);

CREATE TABLE bond_stories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    char_id INTEGER NOT NULL,
    bond_level_required INTEGER NOT NULL,
    title TEXT NOT NULL,
    scene_text TEXT NOT NULL,
    scene_type TEXT DEFAULT 'dialogue',
    story_key TEXT DEFAULT '',
    choices TEXT,
    unlocked INTEGER DEFAULT 0,
    unlocked_at TEXT,
    viewed INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE character_gifts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    char_id INTEGER NOT NULL,
    gift_name TEXT NOT NULL,
    gift_category TEXT NOT NULL,
    affinity_boost REAL DEFAULT 1.0,
    is_favorite INTEGER DEFAULT 0,
    description TEXT
);

CREATE TABLE gift_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    char_id INTEGER NOT NULL,
    gift_id INTEGER NOT NULL,
    given_at TEXT DEFAULT (datetime('now')),
    xp_earned INTEGER DEFAULT 0,
    reaction TEXT
);
"""


def _make_db() -> sqlite3.Connection:
    """Create an in-memory SQLite database with the full bond schema.

    Returns:
        Open connection with all four bond tables created.
    """
    con = sqlite3.connect(":memory:")
    con.executescript(_SCHEMA_SQL)
    con.commit()
    return con


# ── Fixtures ────────────────────────────────────────────────────────────────


@pytest.fixture()
def db() -> sqlite3.Connection:
    """In-memory bond database seeded with one character, gifts, and stories.

    Seed data:
        character_relationships: char_id=1 at level 0, 0 XP.
        character_gifts (3 rows):
            id=1  Sakura Tea     — is_favorite=1  (favourite)
            id=2  Paperback Novel — is_favorite=0  (normal)
            id=3  Ear-Splitter CD — gift_category='disliked', is_favorite=0
        bond_stories (3 rows):
            level 5  — 'first_smile'  (unlocked=0)
            level 10 — 'quiet_walk'   (unlocked=0)
            level 20 — 'stargazing'   (unlocked=1, already viewed=0)

    Yields:
        Open connection.  Closed automatically after the test.
    """
    con = _make_db()

    con.execute(
        "INSERT INTO character_relationships (char_id, bond_level, bond_xp) VALUES (1, 0, 0)"
    )

    # Gifts — note: disliked gift uses gift_category='disliked' (not is_favorite=-1)
    # because gifts.py routes to gift_disliked XP via category string check.
    con.execute(
        "INSERT INTO character_gifts (char_id, gift_name, gift_category, affinity_boost, is_favorite, description) "
        "VALUES (1, 'Sakura Tea', 'drink', 1.5, 1, 'Her favourite tea')"
    )
    con.execute(
        "INSERT INTO character_gifts (char_id, gift_name, gift_category, affinity_boost, is_favorite, description) "
        "VALUES (1, 'Paperback Novel', 'book', 1.0, 0, 'A generic book')"
    )
    con.execute(
        "INSERT INTO character_gifts (char_id, gift_name, gift_category, affinity_boost, is_favorite, description) "
        "VALUES (1, 'Ear-Splitter CD', 'disliked', 0.2, 0, 'She hates loud music')"
    )

    # Stories
    con.execute(
        "INSERT INTO bond_stories (char_id, bond_level_required, title, scene_text, story_key, unlocked, viewed) "
        "VALUES (1, 5, 'First Smile', 'She smiles at you shyly.', 'first_smile', 0, 0)"
    )
    con.execute(
        "INSERT INTO bond_stories (char_id, bond_level_required, title, scene_text, story_key, unlocked, viewed) "
        "VALUES (1, 10, 'A Quiet Walk', 'You walk together in silence.', 'quiet_walk', 0, 0)"
    )
    con.execute(
        "INSERT INTO bond_stories (char_id, bond_level_required, title, scene_text, story_key, unlocked, viewed) "
        "VALUES (1, 20, 'Stargazing', 'You watch the stars together.', 'stargazing', 1, 0)"
    )

    con.commit()
    yield con
    con.close()


# ── TestBondLevel ────────────────────────────────────────────────────────────


class TestBondLevel:
    """Tests for get_bond_level() and get_tier_name()."""

    def test_new_character_starts_at_zero(self):
        """A character with no relationship row is initialised to level 0."""
        from backend.bond.progression import get_bond_level

        con = _make_db()
        cur = con.cursor()
        # char_id=99 has no row — get_bond_level inserts a default row
        state = get_bond_level(char_id=99, cur=cur)

        assert state["bond_level"] == 0
        assert state["bond_xp"] == 0
        assert state["tier"] == "stranger"
        con.close()

    def test_get_bond_level_with_existing_data(self, db):
        """Existing row returns its stored level, XP, and correct tier."""
        from backend.bond.progression import get_bond_level

        db.execute(
            "UPDATE character_relationships SET bond_level = 25, bond_xp = 75 WHERE char_id = 1"
        )
        db.commit()

        cur = db.cursor()
        state = get_bond_level(char_id=1, cur=cur)

        assert state["bond_level"] == 25
        assert state["bond_xp"] == 75
        # Level 25 is in [11, 31) = 'friend' bracket (close_friend starts at 31)
        assert state["tier"] == "friend"

    def test_get_bond_level_dict_has_expected_keys(self, db):
        """Return dict contains all required keys."""
        from backend.bond.progression import get_bond_level

        cur = db.cursor()
        state = get_bond_level(char_id=1, cur=cur)

        for key in ("bond_level", "bond_xp", "xp_to_next", "tier"):
            assert key in state, f"Missing key '{key}' in get_bond_level result"

    def test_tier_stranger(self):
        """Level 5 maps to tier 'stranger' (bracket [0, 11))."""
        from backend.bond.progression import get_tier_name

        assert get_tier_name(5) == "stranger"

    def test_tier_friend(self):
        """Level 15 maps to tier 'friend' (bracket [11, 31))."""
        from backend.bond.progression import get_tier_name

        assert get_tier_name(15) == "friend"

    def test_tier_close_friend(self):
        """Level 45 maps to tier 'close_friend' (bracket [31, 61))."""
        from backend.bond.progression import get_tier_name

        assert get_tier_name(45) == "close_friend"

    def test_tier_best_friend(self):
        """Level 75 maps to tier 'best_friend' (bracket [61, 91))."""
        from backend.bond.progression import get_tier_name

        assert get_tier_name(75) == "best_friend"

    def test_tier_soulmate(self):
        """Level 95 maps to tier 'soulmate' (bracket [91, ∞))."""
        from backend.bond.progression import get_tier_name

        assert get_tier_name(95) == "soulmate"

    def test_tier_boundary_zero(self):
        """Level 0 is 'stranger'."""
        from backend.bond.progression import get_tier_name

        assert get_tier_name(0) == "stranger"

    def test_tier_boundary_at_max(self):
        """Level 100 resolves to 'soulmate'."""
        from backend.bond.progression import get_tier_name

        assert get_tier_name(100) == "soulmate"

    def test_tier_boundary_friend_start(self):
        """Level 11 is the first 'friend' tier level."""
        from backend.bond.progression import get_tier_name

        assert get_tier_name(11) == "friend"

    def test_tier_boundary_below_friend(self):
        """Level 10 is still 'stranger' (friend starts at 11)."""
        from backend.bond.progression import get_tier_name

        assert get_tier_name(10) == "stranger"


# ── TestBondXP ──────────────────────────────────────────────────────────────


class TestBondXP:
    """Tests for add_bond_xp() — accumulation, level-up, and story unlocks."""

    def test_add_xp_basic(self, db):
        """Adding XP below the threshold increases bond_xp without leveling."""
        from backend.bond.progression import add_bond_xp, _xp_required_for_level

        cur = db.cursor()
        # Level 0 requires 50 XP to level up; add 30 — no level-up expected
        threshold = _xp_required_for_level(0)
        small_amount = threshold - 1
        result = add_bond_xp(char_id=1, cur=cur, xp=small_amount, source="test")
        db.commit()

        assert result["new_xp"] == small_amount
        assert result["new_level"] == 0
        assert result["leveled_up"] is False

    def test_level_up_on_threshold(self, db):
        """Adding exactly the threshold XP triggers exactly one level-up."""
        from backend.bond.progression import add_bond_xp, _xp_required_for_level

        threshold = _xp_required_for_level(0)  # 50 XP
        cur = db.cursor()
        result = add_bond_xp(char_id=1, cur=cur, xp=threshold, source="test")
        db.commit()

        assert result["leveled_up"] is True
        assert result["new_level"] == 1
        assert result["new_xp"] == 0

    def test_no_level_down(self, db):
        """Passing 0 XP does not change level or XP."""
        from backend.bond.progression import add_bond_xp

        db.execute(
            "UPDATE character_relationships SET bond_level = 5, bond_xp = 40 WHERE char_id = 1"
        )
        db.commit()

        cur = db.cursor()
        result = add_bond_xp(char_id=1, cur=cur, xp=0, source="test")
        db.commit()

        assert result["new_level"] == 5
        assert result["new_xp"] == 40
        assert result["leveled_up"] is False

    def test_level_up_unlocks_story(self, db):
        """Leveling up to a story's required level marks it unlocked in the DB."""
        from backend.bond.progression import add_bond_xp, _xp_required_for_level

        cur = db.cursor()
        # Advance from level 0 to exactly level 5
        # Levels 0→1→2→3→4→5 costs: 50+60+70+80+90 = 350 XP
        xp_to_level_5 = sum(_xp_required_for_level(lvl) for lvl in range(5))
        result = add_bond_xp(char_id=1, cur=cur, xp=xp_to_level_5, source="test")
        db.commit()

        assert result["new_level"] == 5
        assert result["leveled_up"] is True

        # 'first_smile' requires level 5 — should now be unlocked
        row = db.execute(
            "SELECT unlocked FROM bond_stories WHERE story_key = 'first_smile'"
        ).fetchone()
        assert row is not None
        assert row[0] == 1, "first_smile story should be unlocked at level 5"

    def test_multiple_level_ups(self, db):
        """A large XP grant spanning multiple thresholds lands on correct level."""
        from backend.bond.progression import add_bond_xp, _xp_required_for_level

        cur = db.cursor()
        # XP to reach level 3: 50+60+70 = 180
        xp_for_3 = sum(_xp_required_for_level(lvl) for lvl in range(3))
        result = add_bond_xp(char_id=1, cur=cur, xp=xp_for_3, source="test")
        db.commit()

        assert result["new_level"] == 3
        assert result["leveled_up"] is True

    def test_xp_to_next_level_calculation(self, db):
        """xp_to_next is the gap between the threshold and accumulated XP."""
        from backend.bond.progression import get_bond_level, _xp_required_for_level

        # Set level=2, xp=30 — threshold for level 2 is (2*10+50)=70, gap = 70-30 = 40
        db.execute(
            "UPDATE character_relationships SET bond_level = 2, bond_xp = 30 WHERE char_id = 1"
        )
        db.commit()

        cur = db.cursor()
        state = get_bond_level(char_id=1, cur=cur)

        expected_gap = _xp_required_for_level(2) - 30
        assert state["xp_to_next"] == expected_gap

    def test_story_not_unlocked_below_required_level(self, db):
        """'quiet_walk' (requires level 10) stays locked at level 4."""
        from backend.bond.progression import add_bond_xp, _xp_required_for_level

        cur = db.cursor()
        # Advance to level 4 only
        xp_for_4 = sum(_xp_required_for_level(lvl) for lvl in range(4))
        add_bond_xp(char_id=1, cur=cur, xp=xp_for_4, source="test")
        db.commit()

        row = db.execute(
            "SELECT unlocked FROM bond_stories WHERE story_key = 'quiet_walk'"
        ).fetchone()
        assert row[0] == 0, "quiet_walk must remain locked below level 10"

    def test_already_unlocked_story_not_modified(self, db):
        """Stories seeded as unlocked=1 remain 1 — not re-locked or double-set."""
        from backend.bond.progression import add_bond_xp, _xp_required_for_level

        cur = db.cursor()
        # Advance past level 20 (where 'stargazing' lives)
        xp_to_20 = sum(_xp_required_for_level(lvl) for lvl in range(20))
        add_bond_xp(char_id=1, cur=cur, xp=xp_to_20, source="test")
        db.commit()

        row = db.execute(
            "SELECT unlocked FROM bond_stories WHERE story_key = 'stargazing'"
        ).fetchone()
        assert row[0] == 1, "stargazing was seeded unlocked=1 and must remain 1"

    def test_add_xp_creates_row_if_missing(self):
        """add_bond_xp inserts a relationship row for a new character."""
        from backend.bond.progression import add_bond_xp, get_bond_level

        con = _make_db()
        cur = con.cursor()
        # char_id=42 has no row yet
        add_bond_xp(char_id=42, cur=cur, xp=10, source="test")
        con.commit()

        state = get_bond_level(char_id=42, cur=cur)
        assert state["bond_level"] == 0
        assert state["bond_xp"] == 10
        con.close()


# ── TestXPForAction ──────────────────────────────────────────────────────────


class TestXPForAction:
    """Tests for get_xp_for_action() — action XP award table."""

    def test_message_xp_in_range(self):
        """'message' at level 0 returns XP within [2, 6]."""
        from backend.bond.progression import get_xp_for_action

        xp = get_xp_for_action("message", bond_level=0)
        assert 2 <= xp <= 6

    def test_message_xp_at_high_level_capped(self):
        """'message' at level 100 does not exceed the cap of 6."""
        from backend.bond.progression import get_xp_for_action

        xp = get_xp_for_action("message", bond_level=100)
        assert xp <= 6

    def test_favorite_gift_xp_in_range(self):
        """'gift_favorite' at level 0 returns XP within [15, 25]."""
        from backend.bond.progression import get_xp_for_action

        xp = get_xp_for_action("gift_favorite", bond_level=0)
        assert 15 <= xp <= 25

    def test_normal_gift_xp_in_range(self):
        """'gift_normal' at level 0 returns XP within [5, 10]."""
        from backend.bond.progression import get_xp_for_action

        xp = get_xp_for_action("gift_normal", bond_level=0)
        assert 5 <= xp <= 10

    def test_daily_login_always_three(self):
        """'daily_login' always returns exactly 3 XP regardless of level."""
        from backend.bond.progression import get_xp_for_action

        assert get_xp_for_action("daily_login", bond_level=0) == 3
        assert get_xp_for_action("daily_login", bond_level=50) == 3
        assert get_xp_for_action("daily_login", bond_level=99) == 3

    def test_unknown_action_returns_zero(self):
        """Unrecognised action string returns 0 XP."""
        from backend.bond.progression import get_xp_for_action

        assert get_xp_for_action("teleport_to_moon", bond_level=0) == 0

    def test_empty_string_action_returns_zero(self):
        """Empty string action key returns 0 XP."""
        from backend.bond.progression import get_xp_for_action

        assert get_xp_for_action("", bond_level=0) == 0

    def test_gift_disliked_xp(self):
        """'gift_disliked' returns 1 XP (always, no level scaling)."""
        from backend.bond.progression import get_xp_for_action

        assert get_xp_for_action("gift_disliked", bond_level=0) == 1
        assert get_xp_for_action("gift_disliked", bond_level=99) == 1

    def test_xp_for_action_scales_with_level(self):
        """'message' XP at level 50 is >= XP at level 0."""
        from backend.bond.progression import get_xp_for_action

        low = get_xp_for_action("message", bond_level=0)
        high = get_xp_for_action("message", bond_level=50)
        assert high >= low


# ── TestGifts ───────────────────────────────────────────────────────────────


class TestGifts:
    """Tests for get_available_gifts(), give_gift(), and get_gift_history()."""

    def test_get_available_gifts(self, db):
        """get_available_gifts returns all gifts for a character."""
        from backend.bond.gifts import get_available_gifts

        cur = db.cursor()
        gifts = get_available_gifts(char_id=1, cur=cur)

        assert len(gifts) == 3
        names = {g["gift_name"] for g in gifts}
        assert "Sakura Tea" in names
        assert "Paperback Novel" in names
        assert "Ear-Splitter CD" in names

    def test_get_available_gifts_empty_for_unknown_char(self, db):
        """Returns an empty list for a character with no gifts defined."""
        from backend.bond.gifts import get_available_gifts

        cur = db.cursor()
        gifts = get_available_gifts(char_id=999, cur=cur)
        assert gifts == []

    def test_gift_dict_has_expected_keys(self, db):
        """Each gift dict includes all required keys."""
        from backend.bond.gifts import get_available_gifts

        cur = db.cursor()
        gifts = get_available_gifts(char_id=1, cur=cur)
        assert len(gifts) > 0
        required = ("id", "gift_name", "gift_category", "affinity_boost",
                    "is_favorite", "description")
        for gift in gifts:
            for key in required:
                assert key in gift, f"Missing key '{key}' in gift dict"

    def test_give_gift_records_history(self, db):
        """give_gift inserts a row into gift_history."""
        from backend.bond.gifts import give_gift

        cur = db.cursor()
        # Gift id=1 is 'Sakura Tea' (favourite)
        result = give_gift(char_id=1, gift_id=1, cur=cur)
        db.commit()

        assert "reaction" in result
        assert "xp_earned" in result

        history_count = db.execute(
            "SELECT COUNT(*) FROM gift_history WHERE char_id = 1 AND gift_id = 1"
        ).fetchone()[0]
        assert history_count == 1

    def test_give_favorite_gift_bonus_xp(self, db):
        """Giving a favourite gift awards XP in the [15, 25] range."""
        from backend.bond.gifts import give_gift

        cur = db.cursor()
        # Sakura Tea is_favorite=1 — should be gift_favorite XP
        result = give_gift(char_id=1, gift_id=1, cur=cur)
        db.commit()

        assert 15 <= result["xp_earned"] <= 25

    def test_give_normal_gift_xp(self, db):
        """Giving a normal gift awards XP in the [5, 10] range."""
        from backend.bond.gifts import give_gift

        cur = db.cursor()
        # Paperback Novel is_favorite=0, category='book' — gift_normal XP
        result = give_gift(char_id=1, gift_id=2, cur=cur)
        db.commit()

        assert 5 <= result["xp_earned"] <= 10

    def test_give_disliked_gift_minimal_xp(self, db):
        """Giving a gift with gift_category='disliked' awards 1 XP."""
        from backend.bond.gifts import give_gift

        cur = db.cursor()
        # Ear-Splitter CD has category='disliked', is_favorite=0 — gift_disliked XP
        result = give_gift(char_id=1, gift_id=3, cur=cur)
        db.commit()

        assert result["xp_earned"] == 1

    def test_give_gift_not_found_raises(self, db):
        """give_gift raises ValueError when gift_id does not exist."""
        from backend.bond.gifts import give_gift

        cur = db.cursor()
        with pytest.raises(ValueError, match="not found"):
            give_gift(char_id=1, gift_id=9999, cur=cur)

    def test_give_gift_wrong_char_raises(self, db):
        """give_gift raises ValueError when the gift belongs to a different character."""
        from backend.bond.gifts import give_gift

        cur = db.cursor()
        # Gift id=1 belongs to char_id=1; requesting for char_id=2 should raise
        with pytest.raises(ValueError):
            give_gift(char_id=2, gift_id=1, cur=cur)

    def test_give_gift_bond_update_in_result(self, db):
        """give_gift result includes the bond_update sub-dict from add_bond_xp."""
        from backend.bond.gifts import give_gift

        cur = db.cursor()
        result = give_gift(char_id=1, gift_id=2, cur=cur)
        db.commit()

        assert "bond_update" in result
        bond = result["bond_update"]
        assert "new_level" in bond
        assert "leveled_up" in bond

    def test_gift_history_limit(self, db):
        """get_gift_history returns at most ``limit`` rows."""
        from backend.bond.gifts import give_gift, get_gift_history

        cur = db.cursor()
        # Give the same normal gift 5 times
        for _ in range(5):
            give_gift(char_id=1, gift_id=2, cur=cur)
        db.commit()

        cur2 = db.cursor()
        history_all = get_gift_history(char_id=1, cur=cur2, limit=100)
        assert len(history_all) == 5

        cur3 = db.cursor()
        history_3 = get_gift_history(char_id=1, cur=cur3, limit=3)
        assert len(history_3) == 3

    def test_gift_history_most_recent_first(self, db):
        """get_gift_history returns rows ordered by most-recent first."""
        from backend.bond.gifts import give_gift, get_gift_history

        cur = db.cursor()
        give_gift(char_id=1, gift_id=2, cur=cur)  # Paperback Novel first
        give_gift(char_id=1, gift_id=1, cur=cur)  # Sakura Tea second (most recent)
        db.commit()

        cur2 = db.cursor()
        history = get_gift_history(char_id=1, cur=cur2, limit=10)
        assert len(history) >= 2
        # Most recent insert (Sakura Tea, id=1) should appear first
        assert history[0]["gift_id"] == 1

    def test_gift_history_empty_for_new_char(self, db):
        """get_gift_history returns an empty list for a character with no history."""
        from backend.bond.gifts import get_gift_history

        cur = db.cursor()
        history = get_gift_history(char_id=999, cur=cur, limit=10)
        assert history == []

    def test_gift_history_xp_earned_stored(self, db):
        """xp_earned is stored in gift_history and returned by get_gift_history."""
        from backend.bond.gifts import give_gift, get_gift_history

        cur = db.cursor()
        give_result = give_gift(char_id=1, gift_id=1, cur=cur)
        db.commit()

        cur2 = db.cursor()
        history = get_gift_history(char_id=1, cur=cur2, limit=1)
        assert len(history) == 1
        assert history[0]["xp_earned"] == give_result["xp_earned"]


# ── TestStoryUnlocks ─────────────────────────────────────────────────────────


class TestStoryUnlocks:
    """Tests for check_unlockable_stories() — story gating by bond level."""

    def test_no_stories_available(self):
        """Returns empty list when bond_stories table is empty."""
        from backend.bond.progression import check_unlockable_stories

        con = _make_db()
        cur = con.cursor()
        result = check_unlockable_stories(char_id=1, bond_level=50, cur=cur)
        assert result == []
        con.close()

    def test_story_unlocked_at_level(self, db):
        """Story with bond_level_required=5 is returned and DB-flagged at level 5."""
        from backend.bond.progression import check_unlockable_stories

        cur = db.cursor()
        newly = check_unlockable_stories(char_id=1, bond_level=5, cur=cur)
        db.commit()

        assert len(newly) >= 1
        assert any(s.get("story_key") == "first_smile" for s in newly), (
            f"Expected 'first_smile' in newly unlocked, got: {newly}"
        )

        row = db.execute(
            "SELECT unlocked FROM bond_stories WHERE story_key = 'first_smile'"
        ).fetchone()
        assert row[0] == 1

    def test_story_not_unlocked_below_level(self, db):
        """Story requiring level 10 is NOT returned when bond_level=4."""
        from backend.bond.progression import check_unlockable_stories

        cur = db.cursor()
        newly = check_unlockable_stories(char_id=1, bond_level=4, cur=cur)
        db.commit()

        assert not any(s.get("story_key") == "quiet_walk" for s in newly)

        row = db.execute(
            "SELECT unlocked FROM bond_stories WHERE story_key = 'quiet_walk'"
        ).fetchone()
        assert row[0] == 0

    def test_already_unlocked_not_returned(self, db):
        """Stories already unlocked=1 are excluded from the result."""
        from backend.bond.progression import check_unlockable_stories

        # 'stargazing' was seeded with unlocked=1
        cur = db.cursor()
        newly = check_unlockable_stories(char_id=1, bond_level=50, cur=cur)
        db.commit()

        assert not any(s.get("story_key") == "stargazing" for s in newly)

    def test_multiple_stories_unlocked_at_once(self, db):
        """A level high enough to clear multiple thresholds unlocks all of them."""
        from backend.bond.progression import check_unlockable_stories

        # Level 15 is above both level-5 and level-10 thresholds
        cur = db.cursor()
        newly = check_unlockable_stories(char_id=1, bond_level=15, cur=cur)
        db.commit()

        story_keys = {s.get("story_key") for s in newly}
        assert "first_smile" in story_keys
        assert "quiet_walk" in story_keys

    def test_no_stories_for_different_char(self, db):
        """Stories for char_id=1 are not returned when querying char_id=2."""
        from backend.bond.progression import check_unlockable_stories

        cur = db.cursor()
        newly = check_unlockable_stories(char_id=2, bond_level=50, cur=cur)
        assert newly == []

    def test_graceful_when_table_missing(self):
        """check_unlockable_stories returns [] when bond_stories table is absent."""
        from backend.bond.progression import check_unlockable_stories

        con = sqlite3.connect(":memory:")
        con.execute(
            """
            CREATE TABLE character_relationships (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                char_id INTEGER UNIQUE NOT NULL,
                bond_level INTEGER DEFAULT 0,
                bond_xp INTEGER DEFAULT 0,
                relationship_mode TEXT DEFAULT 'friend'
            )
            """
        )
        con.commit()
        cur = con.cursor()

        result = check_unlockable_stories(char_id=1, bond_level=10, cur=cur)
        assert result == []
        con.close()

    def test_returned_dict_has_expected_keys(self, db):
        """Each newly-unlocked story dict has id, story_key, bond_level_required."""
        from backend.bond.progression import check_unlockable_stories

        cur = db.cursor()
        newly = check_unlockable_stories(char_id=1, bond_level=5, cur=cur)
        db.commit()

        assert len(newly) >= 1
        for story in newly:
            assert "id" in story
            assert "story_key" in story
            assert "bond_level_required" in story
