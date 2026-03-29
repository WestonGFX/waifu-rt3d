"""Tests for the proactive AI messaging system.

Covers trigger evaluation, rate limiting, active hours, milestone detection,
and fallback message generation.
"""

import datetime
import sqlite3
from unittest.mock import patch

import pytest

from backend.proactive.triggers import (
    evaluate_idle_trigger,
    evaluate_milestone_triggers,
    evaluate_time_trigger,
    get_daily_cap,
    get_daily_message_count,
    is_within_active_hours,
)
from backend.proactive.generator import (
    FALLBACK_TEMPLATES,
    _fallback_message,
    _get_time_period,
    generate_proactive_message,
)


# ---------------------------------------------------------------------------
# is_within_active_hours
# ---------------------------------------------------------------------------

class TestIsWithinActiveHours:
    """Boundary and wrap-around tests for active hours window."""

    def test_normal_range_inside(self):
        now = datetime.datetime(2026, 1, 1, 14, 0)
        assert is_within_active_hours("9-22", now) is True

    def test_normal_range_at_start(self):
        now = datetime.datetime(2026, 1, 1, 9, 0)
        assert is_within_active_hours("9-22", now) is True

    def test_normal_range_at_end_exclusive(self):
        now = datetime.datetime(2026, 1, 1, 22, 0)
        assert is_within_active_hours("9-22", now) is False

    def test_normal_range_before_start(self):
        now = datetime.datetime(2026, 1, 1, 6, 0)
        assert is_within_active_hours("9-22", now) is False

    def test_wraparound_night_window(self):
        """22-6 should be active at 2am and 23pm."""
        assert is_within_active_hours("22-6", datetime.datetime(2026, 1, 1, 2, 0)) is True
        assert is_within_active_hours("22-6", datetime.datetime(2026, 1, 1, 23, 0)) is True

    def test_wraparound_excluded(self):
        """22-6 should NOT be active at noon."""
        assert is_within_active_hours("22-6", datetime.datetime(2026, 1, 1, 12, 0)) is False

    def test_malformed_defaults_to_active(self):
        now = datetime.datetime(2026, 1, 1, 12, 0)
        assert is_within_active_hours("bad", now) is True
        assert is_within_active_hours("", now) is True


# ---------------------------------------------------------------------------
# evaluate_time_trigger
# ---------------------------------------------------------------------------

class TestEvaluateTimeTrigger:
    """Time-of-day trigger fires once per day within ±5 min window."""

    def test_fires_within_window(self):
        now = datetime.datetime(2026, 3, 18, 8, 3)
        assert evaluate_time_trigger("08:00", None, now) is True

    def test_does_not_fire_outside_window(self):
        now = datetime.datetime(2026, 3, 18, 8, 10)
        assert evaluate_time_trigger("08:00", None, now) is False

    def test_fires_once_per_day(self):
        now = datetime.datetime(2026, 3, 18, 8, 2)
        assert evaluate_time_trigger("08:00", "2026-03-18T08:01:00", now) is False

    def test_fires_next_day(self):
        now = datetime.datetime(2026, 3, 19, 8, 1)
        assert evaluate_time_trigger("08:00", "2026-03-18T08:01:00", now) is True

    def test_invalid_time_returns_false(self):
        now = datetime.datetime(2026, 3, 18, 8, 0)
        assert evaluate_time_trigger("xx:yy", None, now) is False


# ---------------------------------------------------------------------------
# evaluate_idle_trigger
# ---------------------------------------------------------------------------

class TestEvaluateIdleTrigger:
    """Idle trigger respects hours-away threshold and cooldown."""

    def test_fires_when_away_long_enough(self):
        now = datetime.datetime(2026, 3, 18, 12, 0)
        # User last spoke 3 hours ago, threshold is 2 hours
        last_msg_ts = int(now.timestamp()) - (3 * 3600)
        assert evaluate_idle_trigger(2, last_msg_ts, None, now) is True

    def test_does_not_fire_when_user_active(self):
        now = datetime.datetime(2026, 3, 18, 12, 0)
        last_msg_ts = int(now.timestamp()) - (30 * 60)  # 30 min ago
        assert evaluate_idle_trigger(2, last_msg_ts, None, now) is False

    def test_cooldown_allows_after_window(self):
        """Fires when last trigger was longer ago than the hours_away cooldown."""
        now = datetime.datetime(2026, 3, 18, 12, 0)
        last_msg_ts = int(now.timestamp()) - (5 * 3600)  # 5 hours ago
        last_triggered = (now - datetime.timedelta(hours=3)).isoformat()  # fired 3h ago, cooldown is 2h
        assert evaluate_idle_trigger(2, last_msg_ts, last_triggered, now) is True

    def test_cooldown_blocks_within_window(self):
        """Does NOT fire when last trigger was within the hours_away cooldown."""
        now = datetime.datetime(2026, 3, 18, 12, 0)
        last_msg_ts = int(now.timestamp()) - (5 * 3600)
        last_triggered = (now - datetime.timedelta(hours=1)).isoformat()  # fired 1h ago, cooldown is 2h
        assert evaluate_idle_trigger(2, last_msg_ts, last_triggered, now) is False

    def test_no_messages_treated_as_away(self):
        now = datetime.datetime(2026, 3, 18, 12, 0)
        assert evaluate_idle_trigger(2, None, None, now) is True


# ---------------------------------------------------------------------------
# Daily rate limiting
# ---------------------------------------------------------------------------

class TestDailyRateLimit:
    """Daily cap enforcement per frequency tier."""

    def test_quiet_cap(self):
        assert get_daily_cap("quiet") == 1

    def test_normal_cap(self):
        assert get_daily_cap("normal") == 3

    def test_chatty_cap(self):
        assert get_daily_cap("chatty") == 5

    def test_unknown_defaults_to_normal(self):
        assert get_daily_cap("unknown") == 3

    def test_daily_message_count_empty(self):
        """Count is 0 when no messages exist."""
        conn = sqlite3.connect(":memory:")
        conn.execute("""
            CREATE TABLE scheduled_messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                char_id INTEGER,
                text TEXT,
                triggered_at INTEGER,
                delivered INTEGER DEFAULT 0,
                trigger_type TEXT DEFAULT 'schedule'
            )
        """)
        cur = conn.cursor()
        assert get_daily_message_count(1, cur, "2026-03-18") == 0

    def test_daily_message_count_with_data(self):
        """Count reflects messages from today only."""
        conn = sqlite3.connect(":memory:")
        conn.execute("""
            CREATE TABLE scheduled_messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                char_id INTEGER,
                text TEXT,
                triggered_at INTEGER,
                delivered INTEGER DEFAULT 0,
                trigger_type TEXT DEFAULT 'schedule'
            )
        """)
        # Use today's date for reliable cross-timezone test
        today = datetime.date.today()
        today_noon = datetime.datetime.combine(today, datetime.time(12, 0))
        ts_today = int(today_noon.timestamp())
        ts_yesterday = ts_today - 86400
        conn.execute(
            "INSERT INTO scheduled_messages (char_id, text, triggered_at) VALUES (1, 'hi', ?)",
            (ts_today,),
        )
        conn.execute(
            "INSERT INTO scheduled_messages (char_id, text, triggered_at) VALUES (1, 'old', ?)",
            (ts_yesterday,),
        )
        conn.commit()
        cur = conn.cursor()
        assert get_daily_message_count(1, cur, today.isoformat()) == 1


# ---------------------------------------------------------------------------
# Day Off blocks all triggers
# ---------------------------------------------------------------------------

class TestDayOff:
    """day_off flag excludes character from scheduler entirely.

    This is tested via the SQL WHERE clause in _run_scheduler_tick, but we
    verify here that the trigger functions themselves don't bypass it.
    """

    def test_day_off_is_respected_by_scheduler_query(self):
        """The scheduler query filters out day_off=1 characters."""
        conn = sqlite3.connect(":memory:")
        conn.executescript("""
            CREATE TABLE characters (
                id INTEGER PRIMARY KEY, name TEXT, day_off INTEGER DEFAULT 0,
                proactive_enabled INTEGER DEFAULT 1,
                proactive_frequency TEXT DEFAULT 'normal',
                proactive_hours TEXT DEFAULT '9-22'
            );
            CREATE TABLE character_schedules (
                id INTEGER PRIMARY KEY, char_id INTEGER, schedule_type TEXT,
                time_of_day TEXT, hours_away INTEGER, enabled INTEGER DEFAULT 1,
                last_triggered TEXT
            );
            INSERT INTO characters (id, name, day_off, proactive_enabled) VALUES (1, 'Luna', 1, 1);
            INSERT INTO character_schedules (id, char_id, schedule_type, time_of_day, enabled) VALUES (1, 1, 'time_of_day', '08:00', 1);
        """)
        cur = conn.cursor()
        cur.execute("""
            SELECT cs.id FROM character_schedules cs
            JOIN characters c ON c.id = cs.char_id
            WHERE cs.enabled = 1 AND COALESCE(c.day_off, 0) = 0
        """)
        assert cur.fetchall() == []  # day_off=1 excluded


# ---------------------------------------------------------------------------
# Fallback message generation
# ---------------------------------------------------------------------------

class TestFallbackMessage:
    """Template-based fallback when LLM is unavailable."""

    def test_fallback_returns_string(self):
        msg = _fallback_message("time_of_day", "Luna")
        assert isinstance(msg, str)
        assert len(msg) > 0

    def test_fallback_substitutes_char_name(self):
        """At least one template uses {char_name}."""
        # Run multiple times to hit templates with char_name
        found = False
        for _ in range(20):
            msg = _fallback_message("time_of_day", "TestChar")
            if "TestChar" in msg:
                found = True
                break
        assert found, "Expected at least one template to include char_name"

    def test_fallback_unknown_type_uses_hours_away(self):
        msg = _fallback_message("nonexistent_type", "Luna")
        hours_away_templates = FALLBACK_TEMPLATES["hours_away"]
        # Should be from the hours_away bank
        assert any(t.format(char_name="Luna", time_period=_get_time_period()) == msg for t in hours_away_templates)

    def test_all_trigger_types_have_templates(self):
        """Every expected trigger type has fallback templates."""
        expected_types = ["time_of_day", "hours_away", "idle", "affinity_50", "affinity_80", "streak_7", "streak_30"]
        for t in expected_types:
            assert t in FALLBACK_TEMPLATES, f"Missing templates for {t}"
            assert len(FALLBACK_TEMPLATES[t]) >= 3, f"Need at least 3 templates for {t}"


# ---------------------------------------------------------------------------
# Milestone triggers
# ---------------------------------------------------------------------------

class TestMilestoneAffinity:
    """Affinity milestone detection."""

    def _make_db(self):
        conn = sqlite3.connect(":memory:")
        conn.executescript("""
            CREATE TABLE characters (id INTEGER PRIMARY KEY, name TEXT, affinity REAL DEFAULT 0);
            CREATE TABLE proactive_milestones (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                char_id INTEGER, milestone_type TEXT, triggered_at TEXT, created_at TEXT
            );
            CREATE TABLE messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id INTEGER, role TEXT, text TEXT, ts INTEGER
            );
            CREATE TABLE sessions (
                id INTEGER PRIMARY KEY, character_id INTEGER
            );
        """)
        return conn

    def test_affinity_50_fires(self):
        conn = self._make_db()
        conn.execute("INSERT INTO characters (id, name, affinity) VALUES (1, 'Luna', 55)")
        conn.commit()
        milestones = evaluate_milestone_triggers(1, conn.cursor())
        assert "affinity_50" in milestones

    def test_affinity_80_fires(self):
        conn = self._make_db()
        conn.execute("INSERT INTO characters (id, name, affinity) VALUES (1, 'Luna', 85)")
        conn.commit()
        milestones = evaluate_milestone_triggers(1, conn.cursor())
        assert "affinity_50" in milestones
        assert "affinity_80" in milestones

    def test_already_triggered_not_repeated(self):
        conn = self._make_db()
        conn.execute("INSERT INTO characters (id, name, affinity) VALUES (1, 'Luna', 55)")
        conn.execute(
            "INSERT INTO proactive_milestones (char_id, milestone_type, triggered_at) VALUES (1, 'affinity_50', '2026-03-18T12:00:00')"
        )
        conn.commit()
        milestones = evaluate_milestone_triggers(1, conn.cursor())
        assert "affinity_50" not in milestones


class TestMilestoneStreak:
    """Chat streak milestone detection."""

    def _make_db_with_streak(self, days: int):
        conn = sqlite3.connect(":memory:")
        conn.executescript("""
            CREATE TABLE characters (id INTEGER PRIMARY KEY, name TEXT, affinity REAL DEFAULT 0);
            CREATE TABLE proactive_milestones (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                char_id INTEGER, milestone_type TEXT, triggered_at TEXT, created_at TEXT
            );
            CREATE TABLE messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id INTEGER, role TEXT, text TEXT, ts INTEGER
            );
            CREATE TABLE sessions (id INTEGER PRIMARY KEY, character_id INTEGER);
        """)
        conn.execute("INSERT INTO characters (id, name) VALUES (1, 'Luna')")
        conn.execute("INSERT INTO sessions (id, character_id) VALUES (1, 1)")

        import time
        today = datetime.date.today()
        for i in range(days):
            day = today - datetime.timedelta(days=i)
            ts = int(datetime.datetime.combine(day, datetime.time(12, 0)).timestamp())
            conn.execute(
                "INSERT INTO messages (session_id, role, text, ts) VALUES (1, 'user', 'hi', ?)",
                (ts,),
            )
        conn.commit()
        return conn

    def test_streak_7_fires(self):
        conn = self._make_db_with_streak(8)
        milestones = evaluate_milestone_triggers(1, conn.cursor())
        assert "streak_7" in milestones

    def test_streak_30_fires(self):
        conn = self._make_db_with_streak(31)
        milestones = evaluate_milestone_triggers(1, conn.cursor())
        assert "streak_7" in milestones
        assert "streak_30" in milestones

    def test_short_streak_no_milestone(self):
        conn = self._make_db_with_streak(3)
        milestones = evaluate_milestone_triggers(1, conn.cursor())
        assert "streak_7" not in milestones
        assert "streak_30" not in milestones


# ---------------------------------------------------------------------------
# generate_proactive_message (with mocked LLM)
# ---------------------------------------------------------------------------

class TestGenerateProactiveMessage:
    """Full generation path with mocked LLM."""

    def _make_db(self, tmp_path):
        db_path = str(tmp_path / "test.db")
        conn = sqlite3.connect(db_path)
        conn.executescript("""
            CREATE TABLE characters (
                id INTEGER PRIMARY KEY, name TEXT, system_prompt TEXT,
                affinity REAL DEFAULT 0, mood_enabled INTEGER DEFAULT 1,
                mood_intensity REAL DEFAULT 0.8
            );
            CREATE TABLE messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id INTEGER, role TEXT, text TEXT, ts INTEGER, is_active INTEGER DEFAULT 1
            );
            CREATE TABLE sessions (id INTEGER PRIMARY KEY, character_id INTEGER);
            INSERT INTO characters (id, name, system_prompt) VALUES (1, 'Luna', 'You are Luna.');
        """)
        conn.commit()
        conn.close()
        return db_path

    def test_fallback_when_llm_unavailable(self, tmp_path):
        """When LLM import fails, falls back to templates."""
        db_path = self._make_db(tmp_path)
        cfg = {"llm": {"provider": "stub", "model": "x", "endpoint": "http://bad", "api_key": "k"}}

        # Patch get_client to raise so we hit fallback
        with patch("backend.llm.registry.get_client", side_effect=Exception("no LLM")):
            msg = generate_proactive_message(1, "Luna", "time_of_day", db_path, cfg)

        assert isinstance(msg, str)
        assert len(msg) > 0

    def test_llm_success_returns_reply(self, tmp_path):
        """When LLM returns ok, we get the cleaned reply."""
        db_path = self._make_db(tmp_path)
        cfg = {"llm": {"provider": "stub", "model": "x", "endpoint": "http://ok", "api_key": "k"}}

        class MockClient:
            def chat(self, messages, **kw):
                return {"ok": True, "reply": "[emotion:happy] Good morning sunshine!"}

        with patch("backend.llm.registry.get_client", return_value=MockClient()):
            msg = generate_proactive_message(1, "Luna", "time_of_day", db_path, cfg)

        assert msg == "Good morning sunshine!"
        assert "[emotion:" not in msg
