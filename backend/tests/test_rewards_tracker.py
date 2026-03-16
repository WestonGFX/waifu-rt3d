"""Tests for interaction rewards tracker."""

from backend.rewards.tracker import xp_for_tier, record_interaction, get_streak_info
import sqlite3


def _setup_db():
    """Create an in-memory test database with required schema."""
    con = sqlite3.connect(":memory:")
    con.execute("CREATE TABLE schema_version (version INTEGER)")
    con.execute("INSERT INTO schema_version VALUES (49)")
    con.execute("""
        CREATE TABLE characters (
            id INTEGER PRIMARY KEY,
            name TEXT,
            current_streak INTEGER DEFAULT 0,
            total_xp INTEGER DEFAULT 0,
            relationship_tier TEXT DEFAULT 'stranger'
        )
    """)
    con.execute("""
        CREATE TABLE interaction_rewards (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            character_id INTEGER,
            interaction_date TEXT NOT NULL,
            message_count INTEGER DEFAULT 0,
            xp_earned INTEGER DEFAULT 0,
            streak_day INTEGER DEFAULT 1,
            milestone_hit TEXT,
            UNIQUE(character_id, interaction_date)
        )
    """)
    con.execute("INSERT INTO characters (id, name) VALUES (1, 'TestChar')")
    con.commit()
    return con


class TestXpForTier:
    """Tests for XP → tier mapping."""

    def test_stranger(self):
        assert xp_for_tier(0) == "stranger"

    def test_acquaintance(self):
        assert xp_for_tier(100) == "acquaintance"

    def test_friend(self):
        assert xp_for_tier(500) == "friend"

    def test_close_friend(self):
        assert xp_for_tier(2000) == "close_friend"

    def test_soulmate(self):
        assert xp_for_tier(10000) == "soulmate"

    def test_between_tiers(self):
        assert xp_for_tier(250) == "acquaintance"


class TestRecordInteraction:
    """Tests for record_interaction()."""

    def test_first_interaction(self):
        con = _setup_db()
        result = record_interaction(con, 1)
        assert result["streak"] == 1
        assert result["xp_earned"] > 0
        assert result["tier"] == "stranger"

    def test_same_day_increments(self):
        con = _setup_db()
        r1 = record_interaction(con, 1)
        r2 = record_interaction(con, 1)
        assert r2["total_xp"] > r1["total_xp"]

    def test_tier_up_detected(self):
        con = _setup_db()
        # Give enough XP to trigger acquaintance
        con.execute("UPDATE characters SET total_xp = 98 WHERE id = 1")
        con.commit()
        result = record_interaction(con, 1)
        assert result["tier"] == "acquaintance"
        assert result["tier_changed"] is True
        assert "tier_up_acquaintance" in result["milestones"]


class TestGetStreakInfo:
    """Tests for get_streak_info()."""

    def test_default_values(self):
        con = _setup_db()
        info = get_streak_info(con, 1)
        assert info["streak"] == 0
        assert info["tier"] == "stranger"
        assert info["xp_to_next"] == 100

    def test_after_interaction(self):
        con = _setup_db()
        record_interaction(con, 1)
        info = get_streak_info(con, 1)
        assert info["total_xp"] > 0
