"""Shared Fantasy Builder (F47) — collaborative user/character fantasy creation.

User and character collaboratively build a fantasy scenario over multiple
sessions through alternating contributions.  Once complete, the fantasy can
be converted to a scenario template (F8) and "played out" as an interactive
scene.

Bond-gated: requires bond ≥ 30 to start building.  Each fantasy tracks its
contributions as a JSON list of ``{"role": "user"|"character", "text": str}``
entries.

The DB table ``shared_fantasies`` is created in the v64 migration::

    CREATE TABLE shared_fantasies (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        char_id         INTEGER NOT NULL,
        title           TEXT    NOT NULL DEFAULT '',
        description     TEXT    NOT NULL DEFAULT '',
        contributions   TEXT    NOT NULL DEFAULT '[]',
        status          TEXT    NOT NULL DEFAULT 'building',
        created_at      TEXT    DEFAULT (datetime('now')),
        played_at       TEXT
    );

Example::

    >>> engine = SharedFantasyEngine()
    >>> engine.should_allow(30)
    True
    >>> engine.should_allow(20)
    False
    >>> engine.get_status_options()
    ['building', 'complete', 'played', 'archived']
"""

from __future__ import annotations

import json
import logging
from typing import Optional

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

#: Minimum bond level to start building fantasies.
BOND_GATE: int = 30

#: Valid fantasy statuses.
STATUS_OPTIONS: list[str] = ["building", "complete", "played", "archived"]

#: Maximum contributions before a fantasy should be marked complete.
MAX_CONTRIBUTIONS: int = 20

#: Prompt for character to add their contribution to the fantasy.
CONTRIBUTION_PROMPT: str = (
    "The user and {char_name} are collaboratively building a shared fantasy together.\n\n"
    "Fantasy title: {title}\n"
    "Fantasy description: {description}\n\n"
    "Previous contributions:\n{contributions_text}\n\n"
    "It's your turn to add to the fantasy. Write 2-4 sentences that:\n"
    "- Build on what came before\n"
    "- Add a new element, setting detail, or emotional beat\n"
    "- Stay in {char_name}'s voice and personality\n"
    "- Leave room for the user to continue\n\n"
    "Content ceiling: {content_ceiling}\n\n"
    "--- YOUR CONTRIBUTION ---\n"
    "Write only your addition. No labels or headers:\n"
)

#: Prompt for converting a complete fantasy into a playable scenario.
PLAY_PROMPT: str = (
    "Convert this shared fantasy into an interactive scene.\n\n"
    "Fantasy: {title}\n"
    "{description}\n\n"
    "The complete fantasy built together:\n{full_text}\n\n"
    "Now narrate this as a live scene. {char_name} is IN the fantasy, "
    "acting it out with the user. Make it immersive, sensory, present-tense.\n"
    "Content ceiling: {content_ceiling}\n\n"
    "[FANTASY_PLAY]"
)


# ---------------------------------------------------------------------------
# Engine
# ---------------------------------------------------------------------------


class SharedFantasyEngine:
    """Stateless engine for collaborative fantasy building.

    Example::

        >>> engine = SharedFantasyEngine()
        >>> engine.should_allow(35)
        True
        >>> engine.should_allow(25)
        False
        >>> engine.get_max_contributions()
        20
    """

    def should_allow(self, bond_level: int) -> bool:
        """Check whether fantasy building is allowed at this bond level.

        Args:
            bond_level: Current bond level (0–100).

        Returns:
            ``True`` when bond is at or above :data:`BOND_GATE`.

        Example::

            >>> SharedFantasyEngine().should_allow(30)
            True
            >>> SharedFantasyEngine().should_allow(29)
            False
        """
        return bond_level >= BOND_GATE

    def get_status_options(self) -> list[str]:
        """Return valid fantasy status values.

        Returns:
            List of status strings.

        Example::

            >>> SharedFantasyEngine().get_status_options()
            ['building', 'complete', 'played', 'archived']
        """
        return list(STATUS_OPTIONS)

    def get_max_contributions(self) -> int:
        """Return the maximum contribution count before auto-complete.

        Returns:
            Maximum number of alternating contributions.

        Example::

            >>> SharedFantasyEngine().get_max_contributions()
            20
        """
        return MAX_CONTRIBUTIONS

    def should_auto_complete(self, contributions: list[dict]) -> bool:
        """Check whether the fantasy has enough contributions to complete.

        Args:
            contributions: List of contribution dicts with ``role`` and ``text``.

        Returns:
            ``True`` when the contribution count has reached or exceeded
            :data:`MAX_CONTRIBUTIONS`.

        Example::

            >>> SharedFantasyEngine().should_auto_complete([{"role": "user", "text": "x"}] * 19)
            False
            >>> SharedFantasyEngine().should_auto_complete([{"role": "user", "text": "x"}] * 20)
            True
        """
        return len(contributions) >= MAX_CONTRIBUTIONS

    def format_contributions(self, contributions: list[dict]) -> str:
        """Format contribution history for prompt injection.

        Args:
            contributions: List of dicts with ``role`` and ``text`` keys.

        Returns:
            Human-readable string of alternating contributions.

        Example::

            >>> engine = SharedFantasyEngine()
            >>> engine.format_contributions([
            ...     {"role": "user", "text": "A moonlit garden"},
            ...     {"role": "character", "text": "With fireflies dancing"},
            ... ])
            'User: A moonlit garden\\nCharacter: With fireflies dancing'
        """
        lines: list[str] = []
        for c in contributions:
            role = "User" if c.get("role") == "user" else "Character"
            lines.append(f"{role}: {c.get('text', '')}")
        return "\n".join(lines) if lines else "(no contributions yet)"

    def build_contribution_prompt(
        self,
        char_name: str,
        title: str,
        description: str,
        contributions: list[dict],
        content_ceiling: str = "suggestive",
    ) -> str:
        """Build the LLM prompt for the character's next contribution.

        Args:
            char_name: Character display name.
            title: Fantasy title.
            description: Fantasy description/premise.
            contributions: Previous contributions list.
            content_ceiling: Content intensity level.

        Returns:
            Formatted prompt string.

        Example::

            >>> engine = SharedFantasyEngine()
            >>> prompt = engine.build_contribution_prompt("Dae", "Moonlit Garden", "A magical night", [], "mild")
            >>> "Dae" in prompt
            True
        """
        return CONTRIBUTION_PROMPT.format(
            char_name=char_name,
            title=title,
            description=description,
            contributions_text=self.format_contributions(contributions),
            content_ceiling=content_ceiling,
        )

    def build_play_prompt(
        self,
        char_name: str,
        title: str,
        description: str,
        contributions: list[dict],
        content_ceiling: str = "suggestive",
    ) -> str:
        """Build the prompt for playing out a completed fantasy as a scene.

        Args:
            char_name: Character display name.
            title: Fantasy title.
            description: Fantasy description.
            contributions: All contributions from the building phase.
            content_ceiling: Content intensity level.

        Returns:
            Formatted prompt ending with ``[FANTASY_PLAY]`` tag.

        Example::

            >>> engine = SharedFantasyEngine()
            >>> prompt = engine.build_play_prompt("Luna", "Starlight", "Under the stars", [], "mild")
            >>> "[FANTASY_PLAY]" in prompt
            True
        """
        full_text = self.format_contributions(contributions)
        return PLAY_PROMPT.format(
            char_name=char_name,
            title=title,
            description=description,
            full_text=full_text,
            content_ceiling=content_ceiling,
        )

    def validate_contribution(self, text: str) -> bool:
        """Check whether a contribution text is valid (non-empty, reasonable length).

        Args:
            text: The contribution text to validate.

        Returns:
            ``True`` if the text is 1–1000 characters.

        Example::

            >>> SharedFantasyEngine().validate_contribution("A moonlit garden")
            True
            >>> SharedFantasyEngine().validate_contribution("")
            False
        """
        return 0 < len(text.strip()) <= 1000
