"""Tests for the NostalgiaTrigger system.

Uses an in-memory SQLite database to avoid touching the production DB.
All tests verify the probabilistic and structural behaviour described in
nostalgia.py without relying on random luck — they use monkeypatching to
control the random outcome where needed.
"""

from __future__ import annotations

import sqlite3
import time
from typing import Generator
from unittest.mock import patch

import pytest

from backend.memory.nostalgia import (
    NostalgiaPrompt,
    NostalgiaTrigger,
    _BASE_PROB,
    _BOOST_PROB,
    _COOLDOWN_MESSAGES,
    _WARMUP_MESSAGES,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


def _build_db() -> sqlite3.Connection:
    """Create a minimal in-memory SQLite DB with the required tables.

    Returns:
        An open ``sqlite3.Connection`` to the in-memory database.
    """
    con = sqlite3.connect(":memory:")
    con.execute("""
        CREATE TABLE characters (
            id   INTEGER PRIMARY KEY,
            name TEXT NOT NULL
        )
    """)
    con.execute("""
        CREATE TABLE messages (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            character_id    INTEGER NOT NULL,
            session_id      INTEGER NOT NULL,
            role            TEXT    NOT NULL,
            text            TEXT    NOT NULL,
            importance_score REAL   DEFAULT 0.5,
            created_at      REAL    DEFAULT 0
        )
    """)
    con.commit()
    return con


def _seed_character(con: sqlite3.Connection, char_id: int, name: str) -> None:
    """Insert a character row.

    Args:
        con: Open DB connection.
        char_id: Primary key to assign.
        name: Character display name.
    """
    con.execute("INSERT INTO characters (id, name) VALUES (?, ?)", (char_id, name))
    con.commit()


def _seed_message(
    con: sqlite3.Connection,
    char_id: int,
    session_id: int,
    role: str,
    text: str,
    importance: float,
) -> None:
    """Insert a single message row.

    Args:
        con: Open DB connection.
        char_id: Character this message belongs to.
        session_id: Session it was recorded in.
        role: ``'user'`` or ``'assistant'``.
        text: Message body.
        importance: Importance score 0.0–1.0.
    """
    con.execute(
        """
        INSERT INTO messages (character_id, session_id, role, text, importance_score, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (char_id, session_id, role, text, importance, time.time()),
    )
    con.commit()


@pytest.fixture()
def db_con() -> Generator[sqlite3.Connection, None, None]:
    """Provide a fresh in-memory DB for each test.

    Yields:
        An open ``sqlite3.Connection``.
    """
    con = _build_db()
    yield con
    con.close()


def _trigger_for(con: sqlite3.Connection) -> NostalgiaTrigger:
    """Build a NostalgiaTrigger that reads from *con* (in-memory DB).

    We abuse the fact that ``sqlite3.connect(':memory:')`` creates a NEW
    database each time, so we patch ``sqlite3.connect`` inside the trigger to
    return our shared connection instead.

    Args:
        con: The shared in-memory connection to inject.

    Returns:
        A :class:`NostalgiaTrigger` wired to the given connection.
    """
    trigger = NostalgiaTrigger(db_path=":memory:")
    # Patch sqlite3.connect so the trigger reuses our shared in-memory DB.
    trigger._db_path = ":shared:"  # sentinel — won't be used directly
    trigger._con = con  # store for use in patched methods
    return trigger


class _PatchedTrigger(NostalgiaTrigger):
    """NostalgiaTrigger subclass that holds a shared in-memory connection.

    Overrides the private DB helpers so they always reuse the same
    in-memory SQLite connection rather than opening a new file-path based
    connection (which would produce a different, empty DB).
    """

    def __init__(self, con: sqlite3.Connection) -> None:
        """Initialise with a shared connection instead of a file path.

        Args:
            con: Open in-memory SQLite connection to use for all queries.
        """
        super().__init__(db_path=":memory:")
        self._shared_con = con

    def _select_memory(self, character_id: int, session_id: int):  # type: ignore[override]
        """Override to use the shared in-memory connection."""
        sql = """
            SELECT text, role, importance_score, created_at
            FROM   messages
            WHERE  character_id  = ?
              AND  session_id   != ?
              AND  importance_score > 0.7
              AND  role          = 'user'
            ORDER  BY importance_score DESC
            LIMIT  20
        """
        self._shared_con.row_factory = sqlite3.Row
        rows = self._shared_con.execute(sql, (character_id, session_id)).fetchall()
        if not rows:
            return None
        import random
        chosen = random.choice(rows)
        return {
            "text": chosen["text"],
            "role": chosen["role"],
            "importance_score": chosen["importance_score"],
            "created_at": chosen["created_at"],
        }

    def _get_character_name(self, character_id: int) -> str:
        """Override to use the shared in-memory connection."""
        row = self._shared_con.execute(
            "SELECT name FROM characters WHERE id = ?", (character_id,)
        ).fetchone()
        return row[0] if row else "the character"


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestTriggerProbability:
    """Verify that trigger probability thresholds are respected."""

    def test_no_trigger_before_warmup(self, db_con: sqlite3.Connection) -> None:
        """Trigger must return None for every message before the warmup count.

        Ensures the 10-message warmup gate is enforced regardless of mood or
        cooldown state.
        """
        _seed_character(db_con, 1, "Aria")
        _seed_message(db_con, 1, session_id=1, role="user", text="old memory", importance=0.9)

        trigger = _PatchedTrigger(db_con)
        # Reset cooldown so it is not the reason for None returns.
        trigger._messages_since_trigger = _COOLDOWN_MESSAGES

        for msg_count in range(_WARMUP_MESSAGES):
            result = trigger.maybe_trigger(
                character_id=1,
                session_id=2,
                mood="reflective",
                message_count=msg_count,
            )
            assert result is None, (
                f"Expected None at message_count={msg_count} (below warmup threshold)"
            )

    def test_no_trigger_during_cooldown(self, db_con: sqlite3.Connection) -> None:
        """Trigger must return None until cooldown messages have elapsed.

        Simulates a recently-fired trigger and verifies that subsequent calls
        return None until the cooldown window has passed.
        """
        _seed_character(db_con, 1, "Aria")
        _seed_message(db_con, 1, session_id=1, role="user", text="old memory", importance=0.9)

        trigger = _PatchedTrigger(db_con)
        # Simulate a trigger that just fired — counter at zero.
        trigger._messages_since_trigger = 0

        # Force random to always fire so probability is not the blocker.
        with patch("backend.memory.nostalgia.random.random", return_value=0.0):
            for step in range(1, _COOLDOWN_MESSAGES):
                result = trigger.maybe_trigger(
                    character_id=1,
                    session_id=2,
                    mood="reflective",
                    message_count=20,
                )
                assert result is None, (
                    f"Expected None during cooldown at step {step} "
                    f"(messages_since_trigger={trigger._messages_since_trigger})"
                )

    def test_trigger_fires_after_cooldown(self, db_con: sqlite3.Connection) -> None:
        """Trigger can fire once the cooldown window has fully elapsed."""
        _seed_character(db_con, 1, "Aria")
        _seed_message(db_con, 1, session_id=1, role="user", text="old memory", importance=0.9)

        trigger = _PatchedTrigger(db_con)
        # Set counter to exactly cooldown - 1 so one more increment reaches the threshold.
        trigger._messages_since_trigger = _COOLDOWN_MESSAGES - 1

        with patch("backend.memory.nostalgia.random.random", return_value=0.0):
            result = trigger.maybe_trigger(
                character_id=1,
                session_id=2,
                mood="neutral",
                message_count=15,
            )
        assert result is not None

    def test_reflective_mood_uses_boosted_probability(self, db_con: sqlite3.Connection) -> None:
        """Reflective moods should use the boosted probability constant.

        We test this structurally: random() just below the boost threshold
        must fire, while the same value just above the base threshold must
        not fire for a non-reflective mood.
        """
        _seed_character(db_con, 1, "Aria")
        _seed_message(db_con, 1, session_id=1, role="user", text="old memory", importance=0.9)

        trigger_reflective = _PatchedTrigger(db_con)
        trigger_reflective._messages_since_trigger = _COOLDOWN_MESSAGES
        trigger_neutral = _PatchedTrigger(db_con)
        trigger_neutral._messages_since_trigger = _COOLDOWN_MESSAGES

        # Value between base and boost probabilities — fires only for reflective.
        between = (_BASE_PROB + _BOOST_PROB) / 2  # e.g. 0.10

        with patch("backend.memory.nostalgia.random.random", return_value=between - 0.001):
            result_reflective = trigger_reflective.maybe_trigger(
                character_id=1, session_id=2, mood="reflective", message_count=15
            )
        with patch("backend.memory.nostalgia.random.random", return_value=between - 0.001):
            result_neutral = trigger_neutral.maybe_trigger(
                character_id=1, session_id=2, mood="neutral", message_count=15
            )

        assert result_reflective is not None, "Reflective mood should fire at boosted probability"
        assert result_neutral is None, "Neutral mood should not fire below boosted probability"

    def test_nostalgic_mood_treated_as_reflective(self, db_con: sqlite3.Connection) -> None:
        """'nostalgic' mood string should also receive the boosted probability."""
        _seed_character(db_con, 1, "Aria")
        _seed_message(db_con, 1, session_id=1, role="user", text="old memory", importance=0.9)

        trigger = _PatchedTrigger(db_con)
        trigger._messages_since_trigger = _COOLDOWN_MESSAGES

        between = (_BASE_PROB + _BOOST_PROB) / 2
        with patch("backend.memory.nostalgia.random.random", return_value=between - 0.001):
            result = trigger.maybe_trigger(
                character_id=1, session_id=2, mood="nostalgic", message_count=15
            )
        assert result is not None

    def test_evening_mood_treated_as_reflective(self, db_con: sqlite3.Connection) -> None:
        """Time-slot mood strings like 'evening' should receive the boosted probability."""
        _seed_character(db_con, 1, "Aria")
        _seed_message(db_con, 1, session_id=1, role="user", text="old memory", importance=0.9)

        trigger = _PatchedTrigger(db_con)
        trigger._messages_since_trigger = _COOLDOWN_MESSAGES

        between = (_BASE_PROB + _BOOST_PROB) / 2
        with patch("backend.memory.nostalgia.random.random", return_value=between - 0.001):
            result = trigger.maybe_trigger(
                character_id=1, session_id=2, mood="evening", message_count=15
            )
        assert result is not None


class TestMemorySelection:
    """Verify memory query behaviour."""

    def test_only_high_importance_user_messages_selected(
        self, db_con: sqlite3.Connection
    ) -> None:
        """Only importance > 0.7 user messages from past sessions should be candidates.

        Seeds multiple messages with varying importance and roles, then
        asserts the selected memory always comes from the qualifying set.
        """
        _seed_character(db_con, 1, "Aria")
        # Should NOT be selected: low importance
        _seed_message(db_con, 1, session_id=1, role="user", text="low importance", importance=0.3)
        # Should NOT be selected: assistant role
        _seed_message(db_con, 1, session_id=1, role="assistant", text="assistant msg", importance=0.95)
        # Should NOT be selected: current session
        _seed_message(db_con, 1, session_id=2, role="user", text="current session", importance=0.95)
        # SHOULD be selected
        _seed_message(db_con, 1, session_id=1, role="user", text="qualifying memory", importance=0.85)

        trigger = _PatchedTrigger(db_con)
        trigger._messages_since_trigger = _COOLDOWN_MESSAGES

        with patch("backend.memory.nostalgia.random.random", return_value=0.0):
            result = trigger.maybe_trigger(
                character_id=1, session_id=2, mood="neutral", message_count=15
            )

        assert result is not None
        assert result.source_message == "qualifying memory"

    def test_no_memories_returns_none(self, db_con: sqlite3.Connection) -> None:
        """Returns None gracefully when no qualifying memories exist."""
        _seed_character(db_con, 1, "Aria")
        # Only a low-importance message — should never be selected.
        _seed_message(db_con, 1, session_id=1, role="user", text="not important", importance=0.2)

        trigger = _PatchedTrigger(db_con)
        trigger._messages_since_trigger = _COOLDOWN_MESSAGES

        with patch("backend.memory.nostalgia.random.random", return_value=0.0):
            result = trigger.maybe_trigger(
                character_id=1, session_id=2, mood="reflective", message_count=15
            )

        assert result is None

    def test_messages_from_current_session_excluded(
        self, db_con: sqlite3.Connection
    ) -> None:
        """Messages from the current session must never be surfaced as nostalgia."""
        _seed_character(db_con, 1, "Aria")
        # Only message is from the current session.
        _seed_message(db_con, 1, session_id=5, role="user", text="current session msg", importance=0.95)

        trigger = _PatchedTrigger(db_con)
        trigger._messages_since_trigger = _COOLDOWN_MESSAGES

        with patch("backend.memory.nostalgia.random.random", return_value=0.0):
            result = trigger.maybe_trigger(
                character_id=1, session_id=5, mood="reflective", message_count=15
            )

        assert result is None


class TestFormatNostalgia:
    """Verify the prompt formatting contract."""

    def test_format_includes_character_name(self, db_con: sqlite3.Connection) -> None:
        """The formatted prompt must include the character's name."""
        _seed_character(db_con, 1, "Lumina")
        _seed_message(db_con, 1, session_id=1, role="user", text="I love stargazing", importance=0.9)

        trigger = _PatchedTrigger(db_con)
        trigger._messages_since_trigger = _COOLDOWN_MESSAGES

        with patch("backend.memory.nostalgia.random.random", return_value=0.0):
            result = trigger.maybe_trigger(
                character_id=1, session_id=2, mood="reflective", message_count=15
            )

        assert result is not None
        assert "Lumina" in result.prompt

    def test_format_includes_memory_text(self, db_con: sqlite3.Connection) -> None:
        """The formatted prompt must include the original memory text."""
        _seed_character(db_con, 1, "Aria")
        _seed_message(db_con, 1, session_id=1, role="user", text="I love rainy days", importance=0.9)

        trigger = _PatchedTrigger(db_con)
        trigger._messages_since_trigger = _COOLDOWN_MESSAGES

        with patch("backend.memory.nostalgia.random.random", return_value=0.0):
            result = trigger.maybe_trigger(
                character_id=1, session_id=2, mood="reflective", message_count=15
            )

        assert result is not None
        assert "I love rainy days" in result.prompt

    def test_format_starts_with_bracket(self, db_con: sqlite3.Connection) -> None:
        """Formatted prompt should be a bracketed directive (system-prompt style)."""
        trigger = _PatchedTrigger(_build_db())
        directive = trigger._format_nostalgia(
            memory={"text": "I want to visit Japan someday", "importance_score": 0.8},
            character_name="Yuki",
        )
        assert directive.startswith("[Yuki is reminded")
        assert directive.endswith("]")

    def test_format_truncates_long_memory(self) -> None:
        """Very long memory texts should be truncated to avoid context bloat."""
        trigger = NostalgiaTrigger(db_path=":memory:")
        long_text = "a" * 500
        directive = trigger._format_nostalgia(
            memory={"text": long_text, "importance_score": 0.9},
            character_name="Aria",
        )
        # The source text is truncated but the directive is well-formed.
        assert len(directive) < len(long_text) + 200
        assert directive.endswith("]")
        assert "..." in directive


class TestNostalgiaPromptDataclass:
    """Sanity checks for the NostalgiaPrompt dataclass."""

    def test_dataclass_fields(self) -> None:
        """NostalgiaPrompt should expose prompt, source_message, importance_score."""
        np = NostalgiaPrompt(
            prompt="[Aria remembers]",
            source_message="original text",
            importance_score=0.88,
        )
        assert np.prompt == "[Aria remembers]"
        assert np.source_message == "original text"
        assert np.importance_score == pytest.approx(0.88)

    def test_result_importance_score_matches_memory(
        self, db_con: sqlite3.Connection
    ) -> None:
        """The importance_score on the returned NostalgiaPrompt must match the DB row."""
        _seed_character(db_con, 1, "Aria")
        _seed_message(db_con, 1, session_id=1, role="user", text="test memory", importance=0.92)

        trigger = _PatchedTrigger(db_con)
        trigger._messages_since_trigger = _COOLDOWN_MESSAGES

        with patch("backend.memory.nostalgia.random.random", return_value=0.0):
            result = trigger.maybe_trigger(
                character_id=1, session_id=2, mood="reflective", message_count=15
            )

        assert result is not None
        assert result.importance_score == pytest.approx(0.92)
