"""Tests for backend.adaptive.topic_graph — topic extraction, tracking, and context building.

Covers:
    - extract_topics: basic extraction, stop-word filtering, max_topics cap, empty
      input, short-word filtering, case insensitivity.
    - update_topic_tracking: new-row insert, mention_count increment, sentiment
      average update, graceful handling of absent table.
    - get_emerging_topics: returns flagged rows, empty list when none, empty list
      when table is absent.
    - get_topic_affinities: normalisation to max=1.0, sentiment boost, low mention
      count exclusion.
    - build_topic_context_block: formatted interest block, empty string for no data,
      negative-sentiment topics in avoid section.

All tests use an isolated in-memory SQLite database — no filesystem I/O.
"""

from __future__ import annotations

import sqlite3
import unittest

from backend.adaptive.topic_graph import (
    build_topic_context_block,
    extract_topics,
    get_emerging_topics,
    get_topic_affinities,
    update_topic_tracking,
)

# ---------------------------------------------------------------------------
# Schema helpers
# ---------------------------------------------------------------------------

_TOPIC_TRACKING_DDL = """
CREATE TABLE topic_tracking (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    char_id INTEGER NOT NULL,
    topic TEXT NOT NULL,
    mention_count INTEGER DEFAULT 1,
    total_sentiment REAL DEFAULT 0.0,
    avg_sentiment REAL DEFAULT 0.0,
    first_seen_at TEXT DEFAULT (datetime('now')),
    last_seen_at TEXT DEFAULT (datetime('now')),
    is_emerging INTEGER DEFAULT 0,
    UNIQUE(char_id, topic)
)
"""


def _make_db() -> sqlite3.Connection:
    """Create an in-memory SQLite DB with the topic_tracking table.

    Returns:
        Open connection with topic_tracking table created.
    """
    conn = sqlite3.connect(":memory:")
    conn.execute(_TOPIC_TRACKING_DDL)
    conn.commit()
    return conn


def _make_empty_db() -> sqlite3.Connection:
    """Create an in-memory SQLite DB with no tables at all.

    Returns:
        Open connection with no tables, for graceful-degradation tests.
    """
    return sqlite3.connect(":memory:")


def _insert_topic(
    conn: sqlite3.Connection,
    *,
    char_id: int = 1,
    topic: str,
    mention_count: int = 1,
    avg_sentiment: float = 0.0,
    total_sentiment: float = 0.0,
    is_emerging: int = 0,
) -> None:
    """Insert a topic row directly for test setup.

    Args:
        conn: Open connection with topic_tracking table.
        char_id: Character owner of this topic.
        topic: Topic string to insert.
        mention_count: Number of times the topic has been mentioned.
        avg_sentiment: Running average sentiment for this topic.
        total_sentiment: Running total sentiment for this topic.
        is_emerging: Whether the topic is flagged as emerging (1) or not (0).
    """
    conn.execute(
        """INSERT INTO topic_tracking
               (char_id, topic, mention_count, total_sentiment, avg_sentiment, is_emerging)
           VALUES (?, ?, ?, ?, ?, ?)""",
        (char_id, topic, mention_count, total_sentiment, avg_sentiment, is_emerging),
    )
    conn.commit()


# ---------------------------------------------------------------------------
# TestExtractTopics
# ---------------------------------------------------------------------------


class TestExtractTopics(unittest.TestCase):
    """Tests for the extract_topics() pure text-extraction function."""

    def test_basic_extraction(self):
        """Plain sentence with meaningful nouns includes those words in results."""
        topics = extract_topics("I love anime and cooking")
        self.assertIn("anime", topics)
        self.assertIn("cooking", topics)

    def test_stop_words_filtered(self):
        """Common English stop words like 'the' and 'and' are never returned."""
        topics = extract_topics("the cat and the dog are here")
        self.assertNotIn("the", topics)
        self.assertNotIn("and", topics)

    def test_max_topics_respected(self):
        """Output list length never exceeds the max_topics argument."""
        long_text = (
            "anime cooking philosophy astronomy biology chemistry "
            "literature history mathematics physics engineering"
        )
        topics = extract_topics(long_text, max_topics=4)
        self.assertLessEqual(len(topics), 4)

    def test_empty_text_returns_empty(self):
        """Empty string input returns an empty list."""
        self.assertEqual(extract_topics(""), [])

    def test_short_words_filtered(self):
        """Words shorter than 3 characters are excluded from results."""
        topics = extract_topics("go do it at ok so")
        for t in topics:
            for word in t.split():
                self.assertGreaterEqual(len(word), 3)

    def test_case_insensitive(self):
        """Upper-case input is normalised — 'ANIME' and 'anime' produce the same result."""
        lower = extract_topics("anime")
        upper = extract_topics("ANIME")
        self.assertEqual(lower, upper)


# ---------------------------------------------------------------------------
# TestUpdateTopicTracking
# ---------------------------------------------------------------------------


class TestUpdateTopicTracking(unittest.TestCase):
    """Tests for update_topic_tracking() upsert and sentiment averaging."""

    def test_inserts_new_topic(self):
        """First call for a topic creates a row with mention_count=1."""
        conn = _make_db()
        update_topic_tracking(1, ["anime"], 0.5, conn)
        row = conn.execute(
            "SELECT mention_count FROM topic_tracking WHERE topic = 'anime'"
        ).fetchone()
        self.assertIsNotNone(row)
        self.assertEqual(row[0], 1)

    def test_increments_existing_topic(self):
        """Second call for the same topic increments mention_count to 2."""
        conn = _make_db()
        update_topic_tracking(1, ["cooking"], 0.3, conn)
        update_topic_tracking(1, ["cooking"], 0.7, conn)
        row = conn.execute(
            "SELECT mention_count FROM topic_tracking WHERE topic = 'cooking'"
        ).fetchone()
        self.assertEqual(row[0], 2)

    def test_updates_sentiment_average(self):
        """Two upserts with different sentiments yield a correct running average."""
        conn = _make_db()
        update_topic_tracking(1, ["philosophy"], 0.2, conn)
        update_topic_tracking(1, ["philosophy"], 0.8, conn)
        row = conn.execute(
            "SELECT avg_sentiment FROM topic_tracking WHERE topic = 'philosophy'"
        ).fetchone()
        # average of 0.2 and 0.8 = 0.5
        self.assertAlmostEqual(row[0], 0.5, places=4)

    def test_missing_table_graceful(self):
        """update_topic_tracking does not raise when the topic_tracking table is absent."""
        conn = _make_empty_db()
        # Should log a warning internally and silently skip
        update_topic_tracking(1, ["anime"], 0.5, conn)


# ---------------------------------------------------------------------------
# TestGetEmergingTopics
# ---------------------------------------------------------------------------


class TestGetEmergingTopics(unittest.TestCase):
    """Tests for get_emerging_topics() flagged-topic query."""

    def test_returns_emerging_flagged_topics(self):
        """Topics with is_emerging=1 are returned in the result list."""
        conn = _make_db()
        _insert_topic(conn, topic="anime", mention_count=5, is_emerging=1)
        results = get_emerging_topics(1, conn)
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["topic"], "anime")

    def test_empty_when_no_emerging(self):
        """No topics with is_emerging=1 → empty list returned."""
        conn = _make_db()
        _insert_topic(conn, topic="cooking", mention_count=2, is_emerging=0)
        results = get_emerging_topics(1, conn)
        self.assertEqual(results, [])

    def test_missing_table_returns_empty(self):
        """Returns an empty list without raising when the table does not exist."""
        conn = _make_empty_db()
        results = get_emerging_topics(1, conn)
        self.assertEqual(results, [])


# ---------------------------------------------------------------------------
# TestGetTopicAffinities
# ---------------------------------------------------------------------------


class TestGetTopicAffinities(unittest.TestCase):
    """Tests for get_topic_affinities() normalised-affinity computation."""

    def test_normalizes_to_max_one(self):
        """The highest-affinity topic always maps to exactly 1.0."""
        conn = _make_db()
        _insert_topic(conn, topic="anime", mention_count=10, avg_sentiment=0.8)
        _insert_topic(conn, topic="cooking", mention_count=5, avg_sentiment=0.4)
        affinities = get_topic_affinities(1, conn)
        self.assertAlmostEqual(max(affinities.values()), 1.0, places=6)

    def test_positive_sentiment_boosts_affinity(self):
        """Topic with positive avg_sentiment has higher affinity than same mention_count with neutral."""
        conn = _make_db()
        _insert_topic(conn, topic="anime", mention_count=5, avg_sentiment=1.0)
        _insert_topic(conn, topic="cooking", mention_count=5, avg_sentiment=0.0)
        affinities = get_topic_affinities(1, conn)
        self.assertGreater(affinities["anime"], affinities["cooking"])

    def test_low_mention_count_excluded(self):
        """Topics with mention_count <= 2 are not included in the affinity results."""
        conn = _make_db()
        _insert_topic(conn, topic="philosophy", mention_count=2, avg_sentiment=0.9)
        affinities = get_topic_affinities(1, conn)
        self.assertNotIn("philosophy", affinities)


# ---------------------------------------------------------------------------
# TestBuildTopicContextBlock
# ---------------------------------------------------------------------------


class TestBuildTopicContextBlock(unittest.TestCase):
    """Tests for build_topic_context_block() LLM prompt formatter."""

    def test_builds_formatted_block(self):
        """With qualifying topics the output starts with '[User interests:'."""
        conn = _make_db()
        _insert_topic(conn, topic="anime", mention_count=10, avg_sentiment=0.8)
        block = build_topic_context_block(1, conn)
        self.assertIn("[User interests:", block)

    def test_empty_returns_empty_string(self):
        """No topics tracked → returns an empty string."""
        conn = _make_db()
        block = build_topic_context_block(1, conn)
        self.assertEqual(block, "")

    def test_negative_topics_in_avoid(self):
        """Topics with strongly negative avg_sentiment and low affinity appear in '[Avoid:...' section."""
        conn = _make_db()
        # High-affinity positive topic so affinities can be normalised
        _insert_topic(
            conn,
            topic="anime",
            mention_count=20,
            avg_sentiment=0.9,
            total_sentiment=18.0,
        )
        # Low-affinity, strongly negative topic — should end up in the Avoid block
        _insert_topic(
            conn,
            topic="politics",
            mention_count=4,
            avg_sentiment=-0.8,
            total_sentiment=-3.2,
        )
        block = build_topic_context_block(1, conn)
        self.assertIn("[Avoid:", block)
        self.assertIn("politics", block)
