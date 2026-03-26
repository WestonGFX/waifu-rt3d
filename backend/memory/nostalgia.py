"""Nostalgia trigger system for resurfacing meaningful past conversations.

Selects emotionally significant memories from past conversations and
formats them as character-voice reminiscences that can be injected
into the LLM context at appropriate moments.

The system is triggered probabilistically based on conversation length,
time since last trigger, and mood state.  When triggered, it retrieves
a high-importance memory (importance_score > 0.7, role = 'user') from a
previous session and wraps it in a nostalgia injection prompt that the
context assembler can prepend to the system prompt.

Trigger rules:
    - No trigger before message 10 (conversation needs to warm up first).
    - Base probability: 5% per message after message 10.
    - Reflective/nostalgic moods boost probability to 15%.
    - Cooldown: at least 20 messages must pass between triggers.
    - Returns None when no qualifying memories exist.

Example::

    >>> trigger = NostalgiaTrigger(db_path="backend/storage/app.db")
    >>> result = trigger.maybe_trigger(
    ...     character_id=1,
    ...     session_id=5,
    ...     mood="reflective",
    ...     message_count=15,
    ... )
    >>> if result:
    ...     print(result.prompt)
    "[Aria is reminded of something the user said before: '...'. If natural, ...]"
"""

from __future__ import annotations

import logging
import random
import sqlite3
from dataclasses import dataclass
from typing import Optional

logger = logging.getLogger(__name__)

# Moods that lift trigger probability from BASE to BOOSTED.
_REFLECTIVE_MOODS: frozenset[str] = frozenset(
    {"reflective", "nostalgic", "evening", "night", "late_night", "melancholy", "wistful"}
)

_BASE_PROB: float = 0.05   # 5 % per qualifying message
_BOOST_PROB: float = 0.15  # 15 % during reflective moods
_WARMUP_MESSAGES: int = 10  # no trigger before this message count
_COOLDOWN_MESSAGES: int = 20  # minimum messages between triggers
_MEMORY_POOL_SIZE: int = 20  # candidates drawn from top-N by importance


@dataclass
class NostalgiaPrompt:
    """A formatted nostalgia injection ready for context assembly.

    Attributes:
        prompt: Bracketed directive string for injection into the system
            prompt.  Instructs the character to optionally reference the
            memory if it feels natural.
        source_message: Original user message text that was selected.
        importance_score: Importance score of the selected memory (0.0–1.0).
    """

    prompt: str
    source_message: str
    importance_score: float


class NostalgiaTrigger:
    """Probabilistic nostalgia trigger that resurfaces meaningful past messages.

    Maintains a lightweight in-memory counter (``_messages_since_trigger``)
    that tracks how many messages have passed since the last trigger fired.
    This counter is per-instance; create one instance per character session
    and reuse it across turns.

    Args:
        db_path: Absolute or relative path to the SQLite database file.

    Example::

        trigger = NostalgiaTrigger(db_path="backend/storage/app.db")
        result = trigger.maybe_trigger(
            character_id=1,
            session_id=5,
            mood="reflective",
            message_count=15,
        )
        if result:
            context_parts.insert(0, result.prompt)
    """

    def __init__(self, db_path: str) -> None:
        """Initialise the trigger with a database path.

        Args:
            db_path: Path to the SQLite database.  The file must already
                exist and contain the ``messages`` and ``characters``
                tables created by the preflight migrations.
        """
        self._db_path = db_path
        # Tracks messages elapsed since the last successful trigger so
        # the cooldown can be enforced without a DB round-trip.
        self._messages_since_trigger: int = _COOLDOWN_MESSAGES  # start ready

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def maybe_trigger(
        self,
        character_id: int,
        session_id: int,
        mood: str,
        message_count: int,
    ) -> Optional[NostalgiaPrompt]:
        """Decide whether to surface a nostalgic memory this turn.

        Called once per assistant turn.  Returns a formatted
        :class:`NostalgiaPrompt` when the probabilistic check fires AND
        a qualifying memory can be found, otherwise returns ``None``.

        Args:
            character_id: ID of the character whose message history to
                search.
            session_id: Current session ID.  Memories from this session
                are excluded so the character only recalls *past*
                conversations.
            mood: Current mood string from :func:`backend.mood.engine.get_mood_prefix`
                or the time-slot name (e.g. ``"evening"``).  Reflective
                moods increase trigger probability.
            message_count: Number of messages exchanged so far in the
                current session.  Trigger is suppressed below
                ``_WARMUP_MESSAGES`` (10).

        Returns:
            A :class:`NostalgiaPrompt` instance when the trigger fires,
            or ``None`` otherwise.

        Example::

            result = trigger.maybe_trigger(
                character_id=1, session_id=3, mood="evening", message_count=12
            )
            assert result is None or isinstance(result, NostalgiaPrompt)
        """
        # Always increment the cooldown counter regardless of outcome.
        self._messages_since_trigger += 1

        # Gate 1: conversation must have warmed up.
        if message_count < _WARMUP_MESSAGES:
            return None

        # Gate 2: cooldown must have elapsed.
        if self._messages_since_trigger < _COOLDOWN_MESSAGES:
            return None

        # Choose probability based on mood.
        mood_lower = mood.lower()
        probability = (
            _BOOST_PROB if mood_lower in _REFLECTIVE_MOODS else _BASE_PROB
        )

        if random.random() >= probability:
            return None

        # Trigger fired — attempt memory retrieval.
        memory = self._select_memory(character_id=character_id, session_id=session_id)
        if memory is None:
            return None

        character_name = self._get_character_name(character_id)
        prompt_text = self._format_nostalgia(memory=memory, character_name=character_name)

        self._messages_since_trigger = 0  # reset cooldown

        return NostalgiaPrompt(
            prompt=prompt_text,
            source_message=memory["text"],
            importance_score=memory["importance_score"],
        )

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _select_memory(
        self, character_id: int, session_id: int
    ) -> Optional[dict]:
        """Retrieve a random high-importance user message from past sessions.

        Queries the top :data:`_MEMORY_POOL_SIZE` user messages by
        importance score (> 0.7) from sessions other than the current one,
        then picks randomly among them so the same memory is not always
        surfaced.

        Args:
            character_id: Character whose history to search.
            session_id: Session to exclude (the current one).

        Returns:
            A dict with keys ``text``, ``role``, ``importance_score``, and
            ``created_at``, or ``None`` if no qualifying messages exist.
        """
        sql = """
            SELECT text, role, importance_score, created_at
            FROM   messages
            WHERE  character_id  = ?
              AND  session_id   != ?
              AND  importance_score > 0.7
              AND  role          = 'user'
            ORDER  BY importance_score DESC
            LIMIT  ?
        """
        try:
            con = sqlite3.connect(self._db_path)
            con.row_factory = sqlite3.Row
            try:
                rows = con.execute(
                    sql, (character_id, session_id, _MEMORY_POOL_SIZE)
                ).fetchall()
            finally:
                con.close()
        except sqlite3.Error as exc:
            logger.warning("NostalgiaTrigger: DB error during memory query: %s", exc)
            return None

        if not rows:
            return None

        chosen = random.choice(rows)
        return {
            "text": chosen["text"],
            "role": chosen["role"],
            "importance_score": chosen["importance_score"],
            "created_at": chosen["created_at"],
        }

    def _get_character_name(self, character_id: int) -> str:
        """Fetch the character's display name from the database.

        Args:
            character_id: Primary key in the ``characters`` table.

        Returns:
            The character's name string, or ``"the character"`` if the
            record cannot be found or a DB error occurs.
        """
        try:
            con = sqlite3.connect(self._db_path)
            try:
                row = con.execute(
                    "SELECT name FROM characters WHERE id = ?", (character_id,)
                ).fetchone()
            finally:
                con.close()
            return row[0] if row else "the character"
        except sqlite3.Error as exc:
            logger.warning("NostalgiaTrigger: could not fetch character name: %s", exc)
            return "the character"

    def _format_nostalgia(self, memory: dict, character_name: str) -> str:
        """Wrap a raw memory dict in a bracketed system-prompt directive.

        The directive is invisible to the user.  It tells the character
        that a past memory has surfaced and invites them to reference it
        organically if the flow of conversation permits.

        Args:
            memory: Dict with at least a ``text`` key containing the
                original user message.
            character_name: The character's display name used in the
                directive text.

        Returns:
            A single-line bracketed injection string, e.g.::

                "[Aria is reminded of something the user said before:
                 'I love rainy days'. If natural, Aria might reference
                 this memory warmly.]"

        Example::

            directive = trigger._format_nostalgia(
                memory={"text": "I love rainy days", "importance_score": 0.85},
                character_name="Aria",
            )
            assert directive.startswith("[Aria is reminded")
        """
        # Truncate very long memories to avoid bloating the context window.
        memory_text = memory["text"]
        if len(memory_text) > 300:
            memory_text = memory_text[:297] + "..."

        return (
            f"[{character_name} is reminded of something the user said before: "
            f"'{memory_text}'. "
            f"If natural, {character_name} might reference this memory warmly.]"
        )
