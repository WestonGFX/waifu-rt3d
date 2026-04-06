"""Tests for backend.memory.decay — Ebbinghaus memory decay and importance scoring.

Covers:
    - compute_retention: permanent memories, zero importance, moderate/high importance,
      recall reinforcement, fresh memories, boundary comparisons.
    - compute_importance: weighted sums, boundary inputs, clamping.
    - score_new_memory: default novelty, duplicate detection, unique text novelty.
    - run_decay_pass: DB score updates, pruning below threshold, missing column
      tolerance, permanent memory preservation.
    - reinforce_memory: recall count increment, last_recalled_at update, graceful
      degradation when decay columns are absent.

All tests use an isolated in-memory SQLite database — no filesystem I/O.
"""

from __future__ import annotations

import math
import sqlite3
import unittest
from datetime import datetime, timedelta, timezone

import pytest

from backend.memory.decay import (
    compute_importance,
    compute_retention,
    reinforce_memory,
    run_decay_pass,
    score_new_memory,
)

# ---------------------------------------------------------------------------
# Schema helpers
# ---------------------------------------------------------------------------

_MEMORIES_DDL = """
CREATE TABLE memories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    character_id INTEGER, session_id INTEGER, role TEXT, text TEXT,
    tier INTEGER DEFAULT 1, salience REAL DEFAULT 0.5,
    created_at TEXT DEFAULT (datetime('now')),
    promoted_at TEXT, embedding_model TEXT,
    importance REAL DEFAULT 0.5,
    recall_count INTEGER DEFAULT 0,
    last_recalled_at TEXT DEFAULT NULL,
    decay_score REAL DEFAULT 1.0
)
"""

_MEMORIES_NO_DECAY_DDL = """
CREATE TABLE memories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    character_id INTEGER, session_id INTEGER, role TEXT, text TEXT,
    tier INTEGER DEFAULT 1, salience REAL DEFAULT 0.5,
    created_at TEXT DEFAULT (datetime('now'))
)
"""


def _make_db_with_decay() -> sqlite3.Connection:
    """Create an in-memory SQLite DB with the full decay-column schema.

    Returns:
        Open connection with memories table that includes all v66 columns.
    """
    conn = sqlite3.connect(":memory:")
    conn.execute(_MEMORIES_DDL)
    conn.commit()
    return conn


def _make_db_without_decay() -> sqlite3.Connection:
    """Create an in-memory SQLite DB missing the v66 decay columns.

    Returns:
        Open connection with a bare memories table (no importance/recall columns).
    """
    conn = sqlite3.connect(":memory:")
    conn.execute(_MEMORIES_NO_DECAY_DDL)
    conn.commit()
    return conn


def _insert_memory(
    conn: sqlite3.Connection,
    *,
    text: str = "test memory",
    importance: float = 0.5,
    recall_count: int = 0,
    tier: int = 1,
    created_at: str | None = None,
) -> int:
    """Insert a single memory row and return its id.

    Args:
        conn: Open connection with full decay schema.
        text: Memory text content.
        importance: Importance score to store.
        recall_count: Initial recall count.
        tier: Memory tier (1=active, 3=archived).
        created_at: ISO-8601 timestamp; defaults to now (UTC).

    Returns:
        Row id of the inserted memory.
    """
    if created_at is None:
        created_at = datetime.now(tz=timezone.utc).isoformat()
    cursor = conn.execute(
        """INSERT INTO memories
               (text, importance, recall_count, tier, created_at, decay_score)
           VALUES (?, ?, ?, ?, ?, 1.0)""",
        (text, importance, recall_count, tier, created_at),
    )
    conn.commit()
    return cursor.lastrowid


def _old_created_at(days_ago: float) -> str:
    """Return an ISO-8601 timestamp for ``days_ago`` days in the past.

    Args:
        days_ago: Number of days to subtract from now.

    Returns:
        UTC ISO-8601 string.
    """
    dt = datetime.now(tz=timezone.utc) - timedelta(days=days_ago)
    return dt.isoformat()


# ---------------------------------------------------------------------------
# TestComputeRetention
# ---------------------------------------------------------------------------


class TestComputeRetention(unittest.TestCase):
    """Tests for compute_retention() pure math function."""

    def test_permanent_memory_never_decays(self):
        """importance=1.0 returns exactly 1.0 regardless of elapsed time."""
        self.assertEqual(compute_retention(1.0, 9999), 1.0)
        self.assertEqual(compute_retention(1.0, 0), 1.0)

    def test_zero_importance_decays_fast(self):
        """importance=0.1 after 30 days drops to a very low retention value."""
        score = compute_retention(0.1, 30, recall_count=0)
        self.assertLess(score, 0.02)

    def test_moderate_importance_30_days(self):
        """importance=0.7 after 30 days falls in the ~0.05–0.15 range per spec."""
        score = compute_retention(0.7, 30, recall_count=0)
        # lambda_eff = 0.16 * (1 - 0.7*0.8) = 0.16 * 0.44 = 0.0704
        # R = 0.7 * e^(-0.0704 * 30) ≈ 0.7 * e^(-2.112) ≈ 0.7 * 0.1213 ≈ 0.085
        self.assertGreater(score, 0.04)
        self.assertLess(score, 0.15)

    def test_recall_reinforcement(self):
        """recall_count=5 with importance=0.7 yields significantly higher retention than recall_count=0."""
        base = compute_retention(0.7, 30, recall_count=0)
        boosted = compute_retention(0.7, 30, recall_count=5)
        self.assertGreater(boosted, base * 1.5)

    def test_fresh_memory_high_retention(self):
        """days=0 returns importance * 1.0 (the initial retention equals importance)."""
        importance = 0.6
        score = compute_retention(importance, 0, recall_count=0)
        self.assertAlmostEqual(score, importance, places=6)

    def test_high_importance_slow_decay(self):
        """importance=0.9 at 30 days retains significantly more than importance=0.3 at 30 days."""
        high = compute_retention(0.9, 30, recall_count=0)
        low = compute_retention(0.3, 30, recall_count=0)
        self.assertGreater(high, low * 3)


# ---------------------------------------------------------------------------
# TestComputeImportance
# ---------------------------------------------------------------------------


class TestComputeImportance(unittest.TestCase):
    """Tests for compute_importance() weighted-sum function."""

    def test_weighted_sum_correct(self):
        """(0.8, 0.7, 0.6) inputs produce 0.715 = 0.8*0.4 + 0.7*0.35 + 0.6*0.25."""
        expected = 0.8 * 0.40 + 0.7 * 0.35 + 0.6 * 0.25
        result = compute_importance(0.8, 0.7, 0.6)
        self.assertAlmostEqual(result, expected, places=6)

    def test_all_zeros(self):
        """All-zero inputs return exactly 0.0."""
        self.assertEqual(compute_importance(0.0, 0.0, 0.0), 0.0)

    def test_all_ones(self):
        """All-one inputs return exactly 1.0."""
        self.assertAlmostEqual(compute_importance(1.0, 1.0, 1.0), 1.0, places=6)

    def test_clamped_to_range(self):
        """Inputs above 1.0 are clamped so the output never exceeds 1.0."""
        result = compute_importance(2.0, 2.0, 2.0)
        self.assertLessEqual(result, 1.0)


# ---------------------------------------------------------------------------
# TestScoreNewMemory
# ---------------------------------------------------------------------------


class TestScoreNewMemory(unittest.TestCase):
    """Tests for score_new_memory() composite scoring helper."""

    def test_default_novelty(self):
        """No existing_memories argument → novelty defaults to 0.7."""
        # With novelty=0.7, engagement=0.5, sentiment=0.5 (intensity=0.5):
        # importance = 0.5*0.4 + 0.5*0.35 + 0.7*0.25 = 0.2 + 0.175 + 0.175 = 0.55
        result = score_new_memory("hello world", sentiment_score=0.5, engagement_score=0.5)
        expected = compute_importance(0.5, 0.5, 0.7)
        self.assertAlmostEqual(result, expected, places=6)

    def test_low_novelty_for_duplicate(self):
        """Existing memory with the same text drives novelty close to 0 → lower importance."""
        text = "I love watching anime every evening"
        existing = [text]
        result = score_new_memory(
            text,
            sentiment_score=0.8,
            engagement_score=0.8,
            existing_memories=existing,
        )
        unique_result = score_new_memory(
            "completely different subject matter about space rockets",
            sentiment_score=0.8,
            engagement_score=0.8,
            existing_memories=existing,
        )
        self.assertLess(result, unique_result)

    def test_high_novelty_for_unique(self):
        """Text with no word overlap against existing memories → high importance."""
        existing = ["cats and dogs playing in the yard"]
        unique_text = "quantum physics research laboratory experiments"
        result = score_new_memory(
            unique_text,
            sentiment_score=0.9,
            engagement_score=0.8,
            existing_memories=existing,
        )
        self.assertGreater(result, 0.6)


# ---------------------------------------------------------------------------
# TestRunDecayPass
# ---------------------------------------------------------------------------


class TestRunDecayPass(unittest.TestCase):
    """Tests for run_decay_pass() database decay-and-prune operation."""

    def test_updates_decay_scores(self):
        """Decay pass rewrites the decay_score column for rows with importance set."""
        conn = _make_db_with_decay()
        created_at = _old_created_at(30)
        _insert_memory(conn, importance=0.7, created_at=created_at)

        result = run_decay_pass(conn)

        self.assertGreater(result["updated"], 0)
        row = conn.execute("SELECT decay_score FROM memories WHERE id = 1").fetchone()
        # Score must have changed from the default 1.0 to a decayed value
        self.assertLess(row[0], 1.0)

    def test_prunes_below_threshold(self):
        """Memories with very low importance and old creation date get archived to tier=3."""
        conn = _make_db_with_decay()
        # Very low importance, 60 days ago → will definitely fall below 0.05 threshold
        created_at = _old_created_at(60)
        _insert_memory(conn, importance=0.1, created_at=created_at)

        result = run_decay_pass(conn, prune_threshold=0.05)

        self.assertGreater(result["pruned"], 0)
        row = conn.execute("SELECT tier FROM memories WHERE id = 1").fetchone()
        self.assertEqual(row[0], 3)

    def test_missing_columns_graceful(self):
        """Tables without decay columns return an error dict without raising."""
        conn = _make_db_without_decay()
        result = run_decay_pass(conn)
        self.assertEqual(result.get("error"), "columns not available")

    def test_permanent_memories_not_pruned(self):
        """importance=1.0 memories are never archived regardless of age."""
        conn = _make_db_with_decay()
        created_at = _old_created_at(3650)  # 10 years old
        _insert_memory(conn, importance=1.0, created_at=created_at)

        result = run_decay_pass(conn, prune_threshold=0.05)

        self.assertEqual(result["pruned"], 0)
        row = conn.execute("SELECT tier, decay_score FROM memories WHERE id = 1").fetchone()
        self.assertEqual(row[0], 1)  # still tier 1
        self.assertAlmostEqual(row[1], 1.0, places=4)  # score is still 1.0


# ---------------------------------------------------------------------------
# TestReinforceMemory
# ---------------------------------------------------------------------------


class TestReinforceMemory(unittest.TestCase):
    """Tests for reinforce_memory() recall-count and timestamp updater."""

    def test_increments_recall_count(self):
        """Calling reinforce_memory once increments recall_count from 0 to 1."""
        conn = _make_db_with_decay()
        _insert_memory(conn, recall_count=0)

        reinforce_memory(1, conn)

        row = conn.execute("SELECT recall_count FROM memories WHERE id = 1").fetchone()
        self.assertEqual(row[0], 1)

    def test_updates_last_recalled_at(self):
        """Calling reinforce_memory sets last_recalled_at to a non-null value."""
        conn = _make_db_with_decay()
        _insert_memory(conn)

        reinforce_memory(1, conn)

        row = conn.execute("SELECT last_recalled_at FROM memories WHERE id = 1").fetchone()
        self.assertIsNotNone(row[0])

    def test_missing_columns_graceful(self):
        """reinforce_memory does not raise when the decay columns are absent."""
        conn = _make_db_without_decay()
        # Insert a bare row so the id exists
        conn.execute(
            "INSERT INTO memories (character_id, text) VALUES (1, 'bare row')"
        )
        conn.commit()
        # Should silently swallow the OperationalError
        reinforce_memory(1, conn)
