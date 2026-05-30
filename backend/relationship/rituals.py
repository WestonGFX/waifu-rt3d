"""Relationship rituals — recurring-pattern memory for the companion.

A *ritual* is a recurring interaction pattern the character can reference to
show she knows the user's habits: late-night sessions, recurring greetings,
"our usual" callbacks, anniversaries.  This is the missing third leg of
shared-history memory, complementing:

  - ``private_vocabulary`` (pet names, inside jokes) — see
    :mod:`backend.relationship.vocabulary`
  - ``user_facts`` (semantic facts about the user) — see
    :mod:`backend.knowledge.extractor`

Unlike the milestone tables (``intimate_milestones``,
``relationship_milestones``, ``bond_milestones``) which record one-time
*firsts*, rituals are *recurring* and are reinforced on each observation.

The manager is stateless: every method takes an open ``sqlite3.Connection`` so
it can participate in the caller's transaction.  Backed by the
``relationship_rituals`` table (schema v87).
"""
from __future__ import annotations

import re
import sqlite3
from dataclasses import dataclass

# Ritual types. ``recurring`` is the catch-all for habitual activities;
# ``greeting`` for recurring openings; ``callback`` for in-joke references the
# pair returns to; ``anniversary`` for date-anchored recurrences.
RITUAL_TYPES = ("greeting", "recurring", "callback", "anniversary")

# A ritual must be observed at least this many times before it is injected into
# the prompt — a single mention is a moment, not yet a pattern.
MIN_OBSERVE_FOR_INJECTION = 2

# Maximum rituals surfaced in one prompt block (keeps the token cost bounded).
_MAX_INJECTED = 4

# Recurrence cues that suggest the user is describing a habit/pattern. Matched
# case-insensitively against the user's message.  Deliberately conservative —
# false positives create phantom rituals, which read as the character making
# things up.
_RECURRENCE_CUES = (
    "every night",
    "every morning",
    "every day",
    "every time",
    "always",
    "our usual",
    "our thing",
    "like we always",
    "like always",
    "as always",
    "each night",
    "each time",
    "routine",
    "ritual",
    "tradition",
    "habit",
    "we usually",
    "we always",
    "every evening",
    "every week",
    "every year",
)

# Filler words stripped when deriving a short label from the surrounding text.
_LABEL_STOPWORDS = {
    "the", "a", "an", "our", "my", "your", "we", "i", "you", "to", "of", "and",
    "with", "this", "that", "do", "doing", "have", "having", "is", "are", "it",
    "just", "really", "kind", "sort", "always", "every", "each", "usual",
}


def detect_ritual_candidate(text: str) -> dict | None:
    """Heuristically detect whether a user message describes a recurring ritual.

    Looks for recurrence cues (e.g. "every night", "our usual", "we always")
    and, when found, derives a short stable label and a ritual type.  Returns
    ``None`` when no recurrence language is present — the common case — so this
    is cheap to call on every turn.

    This is intentionally a heuristic, not an LLM call: it rides on the existing
    chat turn with zero extra model latency and never fabricates rituals from
    ordinary messages.  Reinforcement (via :meth:`RitualManager.record_ritual`)
    is what promotes a candidate into an injected ritual, so an occasional false
    positive stays below the injection threshold.

    Args:
        text: The raw user message text.

    Returns:
        A dict ``{"label": str, "ritual_type": str, "description": str}`` when a
        ritual is detected, otherwise ``None``.

    Example:
        >>> detect_ritual_candidate("we always start with coffee before coding")
        {'label': 'start with coffee before coding', 'ritual_type': 'recurring', ...}
        >>> detect_ritual_candidate("what's the weather today?") is None
        True
    """
    if not text or not text.strip():
        return None

    lowered = text.lower()
    matched_cue = next((cue for cue in _RECURRENCE_CUES if cue in lowered), None)
    if matched_cue is None:
        return None

    ritual_type = _classify_ritual_type(lowered)
    label = _derive_label(text, matched_cue)
    if not label:
        return None

    # Description is the trimmed sentence the cue appeared in, for prompt use.
    description = _extract_sentence(text, matched_cue)
    return {"label": label, "ritual_type": ritual_type, "description": description}


def _classify_ritual_type(lowered: str) -> str:
    """Map recurrence language to a :data:`RITUAL_TYPES` value."""
    if any(g in lowered for g in ("good morning", "good night", "goodnight", "greet", "hello", "hey")):
        return "greeting"
    if any(a in lowered for a in ("anniversary", "every year", "birthday", "tradition")):
        return "anniversary"
    if any(c in lowered for c in ("our thing", "our usual", "remember when", "like we always")):
        return "callback"
    return "recurring"


def _derive_label(text: str, cue: str) -> str:
    """Derive a short, stable label from the text around the recurrence cue.

    Takes the words following the cue, strips filler, and caps the length so
    the same described ritual collapses to the same UNIQUE label on repeat
    mentions.
    """
    lowered = text.lower()
    idx = lowered.find(cue)
    tail = text[idx + len(cue):]
    # Stop at sentence punctuation so the label stays tight.
    tail = re.split(r"[.!?\n]", tail)[0]
    tokens = [t for t in re.findall(r"[a-zA-Z']+", tail.lower()) if t not in _LABEL_STOPWORDS]
    label = " ".join(tokens[:6]).strip()
    # Fall back to the cue itself if nothing meaningful followed it.
    if not label:
        label = cue.strip()
    return label[:80]


def _extract_sentence(text: str, cue: str) -> str:
    """Return the sentence containing the cue, trimmed for prompt injection."""
    lowered = text.lower()
    idx = lowered.find(cue)
    # Expand to sentence boundaries around the cue.
    start = max((lowered.rfind(p, 0, idx) for p in ".!?\n"), default=-1) + 1
    end_candidates = [lowered.find(p, idx) for p in ".!?\n" if lowered.find(p, idx) != -1]
    end = min(end_candidates) if end_candidates else len(text)
    return text[start:end].strip()[:160]


@dataclass
class Ritual:
    """A recurring interaction pattern between the character and the user.

    Attributes:
        id: Primary key in ``relationship_rituals``.
        char_id: The character this ritual belongs to.
        ritual_type: One of :data:`RITUAL_TYPES`.
        label: Short stable name (UNIQUE per character) used for upsert.
        description: One-line description surfaced in prompt injection.
        observe_count: Times the ritual has been observed/reinforced.
        importance: Salience weight in ``[0, 1]``.
        first_observed_at: ISO-8601 datetime of first observation.
        last_observed_at: ISO-8601 datetime of most recent reinforcement.
        is_active: Whether the ritual is currently in circulation.
    """

    id: int
    char_id: int
    ritual_type: str
    label: str
    description: str
    observe_count: int
    importance: float
    first_observed_at: str
    last_observed_at: str
    is_active: bool


class RitualManager:
    """Stores and recalls a character's recurring rituals with the user.

    Stateless — every method accepts an open ``sqlite3.Connection`` so it can
    join the caller's transaction.

    Example:
        >>> mgr = RitualManager()
        >>> mgr.record_ritual(1, "late-night coding", conn)
        >>> mgr.record_ritual(1, "late-night coding", conn)  # reinforce
        >>> "SHARED RITUALS" in mgr.get_prompt_injection(1, conn)
        True
    """

    def record_ritual(
        self,
        char_id: int,
        label: str,
        conn: sqlite3.Connection,
        *,
        ritual_type: str = "recurring",
        description: str = "",
    ) -> int:
        """Upsert a ritual, reinforcing it if the label already exists.

        On first sight the ritual is created with ``observe_count = 1``.  On
        repeat observation of the same ``(char_id, label)`` the count is
        incremented, ``last_observed_at`` is bumped, importance nudges up (capped
        at 1.0), and the description is refreshed if a non-empty one is supplied.

        Args:
            char_id: The character the ritual belongs to.
            label: Short stable name (the UNIQUE key for upsert).
            conn: Active SQLite connection (write).
            ritual_type: One of :data:`RITUAL_TYPES`; coerced to ``"recurring"``
                if unrecognised.
            description: Optional one-line description for prompt injection.

        Returns:
            The row id of the inserted or reinforced ritual.

        Raises:
            ValueError: If ``label`` is empty after stripping.
        """
        label = (label or "").strip()
        if not label:
            raise ValueError("ritual label must be non-empty")
        if ritual_type not in RITUAL_TYPES:
            ritual_type = "recurring"

        # Reinforce if it already exists (kept explicit rather than relying on
        # ON CONFLICT so importance/description logic is readable and testable).
        row = conn.execute(
            "SELECT id, importance FROM relationship_rituals "
            "WHERE char_id = ? AND label = ?",
            (char_id, label),
        ).fetchone()

        if row is not None:
            rid, importance = int(row[0]), float(row[1])
            new_importance = min(1.0, importance + 0.1)
            conn.execute(
                "UPDATE relationship_rituals "
                "SET observe_count = observe_count + 1, "
                "    last_observed_at = datetime('now'), "
                "    importance = ?, "
                "    is_active = 1, "
                "    description = CASE WHEN ? <> '' THEN ? ELSE description END "
                "WHERE id = ?",
                (new_importance, description, description, rid),
            )
            return rid

        cur = conn.execute(
            "INSERT INTO relationship_rituals "
            "(char_id, ritual_type, label, description) VALUES (?, ?, ?, ?)",
            (char_id, ritual_type, label, description),
        )
        return int(cur.lastrowid)

    def get_rituals(
        self,
        char_id: int,
        conn: sqlite3.Connection,
        *,
        min_observe: int = 1,
        limit: int = 20,
    ) -> list[Ritual]:
        """Load active rituals, most salient first.

        Ordered by ``importance`` then recency so the rituals the pair returns
        to most often surface first.

        Args:
            char_id: The character whose rituals to load.
            conn: Active SQLite connection (read).
            min_observe: Minimum ``observe_count`` to include (1 returns all).
            limit: Maximum rows to return.

        Returns:
            A list of :class:`Ritual`.
        """
        rows = conn.execute(
            "SELECT id, char_id, ritual_type, label, description, observe_count, "
            "       importance, first_observed_at, last_observed_at, is_active "
            "FROM relationship_rituals "
            "WHERE char_id = ? AND is_active = 1 AND observe_count >= ? "
            "ORDER BY importance DESC, last_observed_at DESC "
            "LIMIT ?",
            (char_id, min_observe, limit),
        ).fetchall()
        return [
            Ritual(
                id=int(r[0]), char_id=int(r[1]), ritual_type=str(r[2]),
                label=str(r[3]), description=str(r[4]), observe_count=int(r[5]),
                importance=float(r[6]), first_observed_at=str(r[7]),
                last_observed_at=str(r[8]), is_active=bool(r[9]),
            )
            for r in rows
        ]

    def get_prompt_injection(
        self,
        char_id: int,
        conn: sqlite3.Connection,
        *,
        min_observe: int = MIN_OBSERVE_FOR_INJECTION,
    ) -> str:
        """Build the prompt block for the character's established rituals.

        Only rituals observed at least ``min_observe`` times are included — a
        single mention is a moment, not yet a pattern — and at most
        :data:`_MAX_INJECTED` are surfaced to bound the token cost.

        Args:
            char_id: The character whose rituals to inject.
            conn: Active SQLite connection (read).
            min_observe: Minimum observations before a ritual is "established".

        Returns:
            A formatted prompt block, or ``""`` when no established rituals
            exist (so the caller can skip the section entirely).

        Example:
            >>> block = mgr.get_prompt_injection(1, conn)
            >>> block.startswith("[SHARED RITUALS")
            True
        """
        rituals = self.get_rituals(char_id, conn, min_observe=min_observe, limit=_MAX_INJECTED)
        if not rituals:
            return ""

        lines = [
            "[SHARED RITUALS WITH THE USER]",
            "Recurring patterns the two of you have built. Reference them",
            "naturally when fitting — never force them.",
        ]
        for r in rituals:
            detail = r.description.strip() or r.label
            lines.append(f"- ({r.ritual_type}) {detail}")
        return "\n".join(lines)
