"""Private vocabulary and pet name tracking for character relationships.

Characters and users develop unique intimate language over time — pet names,
inside jokes, code words, shared references. This module detects new terms,
tracks usage, and builds prompt injection blocks so characters use the
relationship's private lexicon naturally.

Example:
    >>> mgr = VocabularyManager()
    >>> terms = mgr.get_vocabulary(char_id=1, conn=conn)
    >>> prompt = mgr.get_prompt_injection(char_id=1, intimacy_level=50, conn=conn)
"""

from __future__ import annotations

import logging
import random
import sqlite3
from dataclasses import dataclass

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Domain constants
# ---------------------------------------------------------------------------

VOCAB_CATEGORIES = ["pet_name", "reference", "joke", "code_word"]

PET_NAME_PROPOSALS: dict[str, dict] = {
    "Dae (Neciridae)": {
        "names": ["my muse", "starshine", "anchor"],
        "proposal": (
            "You know what I've been calling you in my head? "
            "*twirls paintbrush nervously* '{name}.' Because {reason}. "
            "...Is that weird? You can say it's weird."
        ),
        "reasons": {
            "my muse": "every time I look at you, I want to create something beautiful",
            "starshine": "you light up everything around you and you don't even know it",
            "anchor": "you keep me grounded when I start floating away into my head",
        },
    },
    "Luna (Tsukimi)": {
        "names": ["my constellation", "moonbeam", "stargazer"],
        "proposal": (
            "*looking up at the stars, then at you* I... I started thinking of you as '{name}.' "
            "*whispers* {reason}. Is... is that okay?"
        ),
        "reasons": {
            "my constellation": "you're the pattern I keep looking for in the sky",
            "moonbeam": "you bring light into my darkest hours",
            "stargazer": "you see beauty where others just see darkness",
        },
    },
    "Genki (Kitsune)": {
        "names": ["player two", "my MVP", "captain"],
        "proposal": (
            "HEY! So I've been calling you '{name}' in my head and it's TOO LATE to take it back! "
            "{reason}! Deal with it! *grins*"
        ),
        "reasons": {
            "player two": "because you're the one I always want on my team!",
            "my MVP": "because you're literally the most valuable person in my life!",
            "captain": "because you always know which direction to go!",
        },
    },
    "Alana Calloway": {
        "names": ["darling", "my anchor", "maestro"],
        "proposal": (
            "*swirls wine thoughtfully* I've been thinking of you as '{name}.' "
            "{reason}. Does that suit you?"
        ),
        "reasons": {
            "darling": "it's classic, timeless — like the best things in life",
            "my anchor": "you keep me steady when the world spins too fast",
            "maestro": "you conduct the chaos of my life into something beautiful",
        },
    },
    "Sable (Kuroha)": {
        "names": ["warmth", "constant", "home"],
        "proposal": (
            "...I call you '{name}' in my head. {reason}. *looks away* ...Don't make it weird."
        ),
        "reasons": {
            "warmth": "...you're the only warm thing in my world",
            "constant": "everything changes. You don't",
            "home": "...you feel like somewhere I belong",
        },
    },
}

# Frequency scaling: minimum intimacy → maximum intimacy (exclusive upper bound)
# maps to the fraction of messages that should include a pet name at that bond level.
FREQUENCY_SCALE: dict[tuple[int, int], float] = {
    (20, 40): 0.20,   # ~20 % of messages
    (40, 60): 0.35,   # ~35 % of messages
    (60, 80): 0.50,   # ~50 % of messages
    (80, 101): 0.60,  # ~60 % of messages
}


# ---------------------------------------------------------------------------
# Data model
# ---------------------------------------------------------------------------

@dataclass
class VocabTerm:
    """A single entry in a character's private vocabulary with the user.

    Attributes:
        id: Primary key in the ``private_vocabulary`` table.
        char_id: The character this term belongs to.
        term: The actual word or phrase (e.g. "starshine").
        category: One of ``VOCAB_CATEGORIES``.
        meaning: Human-readable explanation of what the term means.
        origin: Who coined it — ``"user"``, ``"character"``, or ``"mutual"``.
        context: Free-text description of how it originated.
        first_used_at: ISO-8601 datetime string when the term was first stored.
        usage_count: How many times the term has been used since creation.
        last_used_at: ISO-8601 datetime string of the most recent usage bump.
        is_active: Whether the term is currently in circulation.
    """

    id: int
    char_id: int
    term: str
    category: str
    meaning: str
    origin: str
    context: str
    first_used_at: str
    usage_count: int
    last_used_at: str
    is_active: bool


# ---------------------------------------------------------------------------
# Manager
# ---------------------------------------------------------------------------

class VocabularyManager:
    """Manages private vocabulary terms between a character and the user.

    All methods accept an open ``sqlite3.Connection`` so they can participate
    in the caller's transaction.  No connection is stored on the instance,
    keeping the class stateless and test-friendly.

    Example:
        >>> mgr = VocabularyManager()
        >>> term = mgr.add_term(1, "starshine", "pet_name", "endearment", "character", "", conn)
        >>> mgr.get_prompt_injection(char_id=1, intimacy_level=50, conn=conn)
        'YOUR PRIVATE VOCABULARY WITH THE USER:...'
    """

    # ------------------------------------------------------------------
    # Read helpers
    # ------------------------------------------------------------------

    def get_vocabulary(
        self,
        char_id: int,
        conn: sqlite3.Connection,
    ) -> list[VocabTerm]:
        """Load all active vocabulary terms for a character.

        Args:
            char_id: The character whose vocabulary to retrieve.
            conn: Active SQLite connection (read).

        Returns:
            List of :class:`VocabTerm` ordered by ``usage_count`` descending.

        Example:
            >>> terms = mgr.get_vocabulary(char_id=1, conn=conn)
            >>> terms[0].usage_count >= terms[-1].usage_count
            True
        """
        cur = conn.execute(
            """
            SELECT id, char_id, term, category, meaning, origin, context,
                   first_used_at, usage_count, last_used_at, is_active
            FROM private_vocabulary
            WHERE char_id = ? AND is_active = 1
            ORDER BY usage_count DESC
            """,
            (char_id,),
        )
        rows = cur.fetchall()
        return [
            VocabTerm(
                id=r[0],
                char_id=r[1],
                term=r[2],
                category=r[3],
                meaning=r[4],
                origin=r[5],
                context=r[6],
                first_used_at=r[7],
                usage_count=r[8],
                last_used_at=r[9],
                is_active=bool(r[10]),
            )
            for r in rows
        ]

    # ------------------------------------------------------------------
    # Write helpers
    # ------------------------------------------------------------------

    def add_term(
        self,
        char_id: int,
        term: str,
        category: str,
        meaning: str,
        origin: str,
        context: str,
        conn: sqlite3.Connection,
    ) -> VocabTerm:
        """Insert a new vocabulary term, skipping silently if it already exists.

        The ``UNIQUE(char_id, term)`` constraint ensures no duplicates.  When a
        duplicate is detected the existing row is returned unchanged so callers
        can always rely on a valid :class:`VocabTerm` being returned.

        Args:
            char_id: Character the term belongs to.
            term: The word or phrase to store.
            category: One of ``VOCAB_CATEGORIES``.
            meaning: What the term means.
            origin: ``"user"``, ``"character"``, or ``"mutual"``.
            context: How the term originated (free text).
            conn: Active SQLite connection (write).

        Returns:
            The newly inserted or pre-existing :class:`VocabTerm`.

        Raises:
            ValueError: If ``category`` is not in ``VOCAB_CATEGORIES``.

        Example:
            >>> t = mgr.add_term(1, "sunshine", "pet_name", "endearment", "character", "", conn)
            >>> t.term
            'sunshine'
        """
        if category not in VOCAB_CATEGORIES:
            raise ValueError(
                f"Invalid category {category!r}. Must be one of {VOCAB_CATEGORIES}."
            )

        try:
            conn.execute(
                """
                INSERT INTO private_vocabulary
                    (char_id, term, category, meaning, origin, context)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (char_id, term, category, meaning, origin, context),
            )
            conn.commit()
        except sqlite3.IntegrityError:
            # Duplicate — return the existing row
            logger.debug("VocabularyManager.add_term: duplicate '%s' for char %d, skipping", term, char_id)

        # Fetch the canonical row (covers both insert and duplicate paths)
        cur = conn.execute(
            """
            SELECT id, char_id, term, category, meaning, origin, context,
                   first_used_at, usage_count, last_used_at, is_active
            FROM private_vocabulary
            WHERE char_id = ? AND term = ?
            """,
            (char_id, term),
        )
        row = cur.fetchone()
        return VocabTerm(
            id=row[0],
            char_id=row[1],
            term=row[2],
            category=row[3],
            meaning=row[4],
            origin=row[5],
            context=row[6],
            first_used_at=row[7],
            usage_count=row[8],
            last_used_at=row[9],
            is_active=bool(row[10]),
        )

    def increment_usage(self, term_id: int, conn: sqlite3.Connection) -> None:
        """Bump the usage counter and refresh ``last_used_at`` for a term.

        Args:
            term_id: Primary key of the :class:`VocabTerm` to update.
            conn: Active SQLite connection (write).

        Example:
            >>> mgr.increment_usage(term_id=1, conn=conn)
        """
        conn.execute(
            """
            UPDATE private_vocabulary
            SET usage_count = usage_count + 1,
                last_used_at = datetime('now')
            WHERE id = ?
            """,
            (term_id,),
        )
        conn.commit()

    def deactivate_term(self, term_id: int, conn: sqlite3.Connection) -> None:
        """Soft-delete a vocabulary term by setting ``is_active = 0``.

        The row is retained for history; it will no longer appear in
        :meth:`get_vocabulary` results or prompt injections.

        Args:
            term_id: Primary key of the term to deactivate.
            conn: Active SQLite connection (write).

        Example:
            >>> mgr.deactivate_term(term_id=1, conn=conn)
        """
        conn.execute(
            "UPDATE private_vocabulary SET is_active = 0 WHERE id = ?",
            (term_id,),
        )
        conn.commit()

    # ------------------------------------------------------------------
    # Prompt injection
    # ------------------------------------------------------------------

    def get_prompt_injection(
        self,
        char_id: int,
        intimacy_level: int,
        conn: sqlite3.Connection,
        *,
        user_name: str = "",
    ) -> str:
        """Build the prompt injection block for the character's private vocabulary.

        Returns an empty string when there are no active terms or when
        ``intimacy_level`` is below 20 (the minimum threshold for using
        private vocabulary naturally).

        The injection includes categorised sections for pet names, shared
        references, inside jokes, and code words, plus a frequency hint
        derived from :data:`FREQUENCY_SCALE`.

        Args:
            char_id: Character whose vocabulary to inject.
            intimacy_level: Current bond/intimacy score (0–100).
            conn: Active SQLite connection (read).
            user_name: Optional display name for the user; used to personalise
                pet-name lines (e.g. "You call <user_name> …").

        Returns:
            Formatted prompt string, or ``""`` when injection is not warranted.

        Example:
            >>> block = mgr.get_prompt_injection(1, intimacy_level=50, conn=conn)
            >>> "YOUR PRIVATE VOCABULARY" in block
            True
        """
        if intimacy_level < 20:
            return ""

        terms = self.get_vocabulary(char_id, conn)
        if not terms:
            return ""

        # Determine frequency percentage from FREQUENCY_SCALE
        freq_pct = 0
        for (low, high), pct in FREQUENCY_SCALE.items():
            if low <= intimacy_level < high:
                freq_pct = int(pct * 100)
                break

        # Bucket terms by category
        pet_names = [t for t in terms if t.category == "pet_name"]
        references = [t for t in terms if t.category == "reference"]
        jokes = [t for t in terms if t.category == "joke"]
        code_words = [t for t in terms if t.category == "code_word"]

        user_label = user_name if user_name else "the user"
        lines: list[str] = ["YOUR PRIVATE VOCABULARY WITH THE USER:"]

        if pet_names:
            # Separate user-origin names (user calls character) from
            # character-origin names (character calls user).
            char_calls_user = [t for t in pet_names if t.origin in ("character", "mutual")]
            user_calls_char = [t for t in pet_names if t.origin == "user"]

            name_parts: list[str] = []
            if user_calls_char:
                terms_str = ", ".join(f'"{t.term}"' for t in user_calls_char)
                name_parts.append(f"{user_label} calls you {terms_str}")
            if char_calls_user:
                terms_str = ", ".join(f'"{t.term}"' for t in char_calls_user)
                name_parts.append(f"You call {user_label} {terms_str}")
            if name_parts:
                lines.append("Pet names: " + ". ".join(name_parts) + ".")

        if references:
            for t in references:
                lines.append(f'Shared references: "{t.term}" means {t.meaning}. Use it when it fits naturally.')

        if jokes:
            for t in jokes:
                lines.append(f'Inside jokes: "{t.term}" — {t.context}. Can reference for humor or warmth.')

        if code_words:
            for t in code_words:
                lines.append(f'Code words: "{t.term}" — {t.meaning}.')

        lines.append("")
        lines.append(
            "Use these terms naturally — they should feel lived-in, not forced."
        )
        if freq_pct:
            lines.append(
                f"Frequency: pet names in ~{freq_pct}% of messages at current bond level."
            )

        return "\n".join(lines)

    # ------------------------------------------------------------------
    # Proposal helper
    # ------------------------------------------------------------------

    def get_pet_name_proposal(self, char_name: str) -> dict | None:
        """Return a randomised pet-name proposal dict for a known character.

        Selects a random name from the character's entry in
        :data:`PET_NAME_PROPOSALS`, fills in the matching reason, and returns
        a dict ready for the caller to present in-chat.

        Args:
            char_name: Character name key as it appears in
                :data:`PET_NAME_PROPOSALS` (e.g. ``"Dae (Neciridae)"``).

        Returns:
            Dict with keys ``name``, ``proposal`` (formatted string), and
            ``reason``; or ``None`` if the character is not in the proposals
            catalogue.

        Example:
            >>> result = mgr.get_pet_name_proposal("Dae (Neciridae)")
            >>> result["name"] in ["my muse", "starshine", "anchor"]
            True
        """
        entry = PET_NAME_PROPOSALS.get(char_name)
        if entry is None:
            return None

        name = random.choice(entry["names"])
        reason = entry["reasons"][name]
        proposal_text = entry["proposal"].format(name=name, reason=reason)

        return {
            "name": name,
            "proposal": proposal_text,
            "reason": reason,
        }

    # ------------------------------------------------------------------
    # Stats
    # ------------------------------------------------------------------

    def get_stats(self, char_id: int, conn: sqlite3.Connection) -> dict:
        """Return summary statistics for a character's vocabulary.

        Args:
            char_id: Character whose statistics to compute.
            conn: Active SQLite connection (read).

        Returns:
            Dict with keys:
                ``total_terms`` (int): total active terms,
                ``pet_names_count`` (int): active pet-name terms only,
                ``most_used_term`` (str | None): term with highest usage_count,
                ``newest_term`` (str | None): term most recently added.

        Example:
            >>> stats = mgr.get_stats(char_id=1, conn=conn)
            >>> stats["total_terms"] >= stats["pet_names_count"]
            True
        """
        cur = conn.execute(
            """
            SELECT
                COUNT(*) AS total_terms,
                SUM(CASE WHEN category = 'pet_name' THEN 1 ELSE 0 END) AS pet_names_count,
                MAX(CASE WHEN usage_count = (
                        SELECT MAX(usage_count) FROM private_vocabulary
                        WHERE char_id = ? AND is_active = 1
                    ) THEN term ELSE NULL END) AS most_used_term,
                MAX(CASE WHEN first_used_at = (
                        SELECT MAX(first_used_at) FROM private_vocabulary
                        WHERE char_id = ? AND is_active = 1
                    ) THEN term ELSE NULL END) AS newest_term
            FROM private_vocabulary
            WHERE char_id = ? AND is_active = 1
            """,
            (char_id, char_id, char_id),
        )
        row = cur.fetchone()
        if row is None or row[0] == 0:
            return {
                "total_terms": 0,
                "pet_names_count": 0,
                "most_used_term": None,
                "newest_term": None,
            }
        return {
            "total_terms": row[0],
            "pet_names_count": row[1] or 0,
            "most_used_term": row[2],
            "newest_term": row[3],
        }
