"""Scene Spontaneity Control (F52) — who initiates intimate moments.

Toggle controlling whether the character can initiate intimate moments
on their own, or must wait for the user.  Three modes with per-character
initiation personalities.

Example::

    >>> engine = SpontaneityEngine()
    >>> engine.get_modes()
    ['user_only', 'character_hints', 'character_initiates']
    >>> engine.can_character_initiate("user_only", 50)
    False
    >>> engine.can_character_initiate("character_initiates", 50)
    True
"""

from __future__ import annotations

import logging
from typing import Optional

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

#: Bond gate for character-initiated moments.
INITIATION_BOND_GATE: int = 40

#: Maximum character initiations per session.
MAX_INITIATIONS_PER_SESSION: int = 1

#: Available spontaneity modes.
MODES: dict[str, dict] = {
    "user_only": {
        "description": "Character NEVER escalates beyond the user's current energy",
        "prompt_fragment": (
            "IMPORTANT: Do NOT escalate physical or intimate energy beyond what "
            "the user has established. Follow their lead completely. You can be "
            "warm and responsive, but never push for more."
        ),
    },
    "character_hints": {
        "description": "Character drops hints but doesn't escalate without user response",
        "prompt_fragment": (
            "You can DROP HINTS about wanting more closeness, but never act on them "
            "without the user responding positively first. Be suggestive, not assertive. "
            "Example: 'This couch is awfully comfortable...' but don't follow through "
            "unless they engage."
        ),
    },
    "character_initiates": {
        "description": "Character can initiate based on bond + context",
        "prompt_fragment": (
            "You may INITIATE intimate moments when the context feels right. "
            "Only when: the mood is already warm, the conversation is private, "
            "and it feels natural — not forced. Read the room. If they seem "
            "distracted or stressed, don't. Your initiation should feel like "
            "a natural extension of the moment, not a interruption."
        ),
    },
}

#: Per-character initiation personality.
CHARACTER_INITIATION_STYLES: dict[str, dict] = {
    "bold_initiator": {
        "description": "Naturally takes the lead, confident in expressing desire",
        "characters": ["Rin (Akane)", "Mika (Mikazuki)", "Genki (Kitsune)"],
    },
    "hint_dropper": {
        "description": "Prefers suggestion over action, creates opportunities",
        "characters": ["Dae (Neciridae)", "Alana Calloway", "Kaede (Suzuha)"],
    },
    "rarely_initiates": {
        "description": "Waits for the other person, initiation is a big deal",
        "characters": [
            "Luna (Tsukimi)", "Ayane (Yuki)", "Yuki (Shirayuki)",
            "Hana (Momoka)", "Sable (Kuroha)", "Tsundere (Raine)",
        ],
    },
}

#: Reverse lookup.
CHARACTER_INITIATION_STYLE: dict[str, str] = {}
for _style, _data in CHARACTER_INITIATION_STYLES.items():
    for _char in _data["characters"]:
        CHARACTER_INITIATION_STYLE[_char] = _style


# ---------------------------------------------------------------------------
# Engine
# ---------------------------------------------------------------------------


class SpontaneityEngine:
    """Stateless engine for spontaneity mode management.

    Example::

        >>> engine = SpontaneityEngine()
        >>> engine.get_initiation_style("Rin (Akane)")
        'bold_initiator'
    """

    def get_modes(self) -> list[str]:
        """Return available spontaneity modes.

        Example::

            >>> SpontaneityEngine().get_modes()
            ['user_only', 'character_hints', 'character_initiates']
        """
        return list(MODES.keys())

    def can_character_initiate(self, mode: str, bond_level: int) -> bool:
        """Check whether the character can initiate in the given mode.

        Args:
            mode: Current spontaneity mode.
            bond_level: Current bond level (0–100).

        Returns:
            ``True`` only in ``character_initiates`` mode with sufficient bond.

        Example::

            >>> SpontaneityEngine().can_character_initiate("character_initiates", 50)
            True
            >>> SpontaneityEngine().can_character_initiate("character_initiates", 30)
            False
            >>> SpontaneityEngine().can_character_initiate("user_only", 90)
            False
        """
        if mode != "character_initiates":
            return False
        return bond_level >= INITIATION_BOND_GATE

    def can_character_hint(self, mode: str) -> bool:
        """Check whether the character can drop hints.

        Args:
            mode: Current spontaneity mode.

        Returns:
            ``True`` in ``character_hints`` or ``character_initiates`` modes.

        Example::

            >>> SpontaneityEngine().can_character_hint("character_hints")
            True
            >>> SpontaneityEngine().can_character_hint("user_only")
            False
        """
        return mode in ("character_hints", "character_initiates")

    def get_initiation_style(self, char_name: str) -> str:
        """Return the character's initiation personality style.

        Args:
            char_name: Character display name.

        Returns:
            Style key; defaults to ``"hint_dropper"``.

        Example::

            >>> SpontaneityEngine().get_initiation_style("Genki (Kitsune)")
            'bold_initiator'
            >>> SpontaneityEngine().get_initiation_style("Unknown")
            'hint_dropper'
        """
        return CHARACTER_INITIATION_STYLE.get(char_name, "hint_dropper")

    def get_prompt(self, mode: str) -> str:
        """Return the prompt fragment for the given spontaneity mode.

        Args:
            mode: Spontaneity mode string.

        Returns:
            Prompt fragment ending with ``[SPONTANEITY_MODE]`` tag.

        Example::

            >>> prompt = SpontaneityEngine().get_prompt("user_only")
            >>> "[SPONTANEITY_MODE]" in prompt
            True
        """
        mode_data = MODES.get(mode, MODES["user_only"])
        return f"{mode_data['prompt_fragment']}\n\n[SPONTANEITY_MODE]"

    def get_max_initiations(self) -> int:
        """Return the max character initiations per session.

        Example::

            >>> SpontaneityEngine().get_max_initiations()
            1
        """
        return MAX_INITIATIONS_PER_SESSION
