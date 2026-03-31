"""Erogenous Personality Map (F44) — per-character physical sensitivity zones.

Each character has a unique map of physical zones with varying sensitivity
levels (high/medium/low).  When the user interacts with a zone in
conversation, the character's reaction intensity matches the sensitivity.

The map is NOT shown to the user — they discover it naturally through
interaction.  The LLM receives a prompt fragment telling it how to react
to specific zones mentioned in the user's message.

Example::

    >>> engine = ErogenousMapEngine()
    >>> engine.get_sensitivity("Dae (Neciridae)", "neck")
    'high'
    >>> engine.get_sensitivity("Dae (Neciridae)", "shoulder")
    'medium'
    >>> engine.detect_zone_mention("I kiss your neck softly")
    ['neck']
"""

from __future__ import annotations

import logging
import re
from typing import Optional

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Sensitivity maps
# ---------------------------------------------------------------------------

#: Per-character zone sensitivity maps.  ``"high"`` zones provoke strong
#: reactions, ``"medium"`` zones get moderate responses, ``"low"`` zones
#: are acknowledged but don't escalate.
CHARACTER_MAPS: dict[str, dict[str, str]] = {
    "Dae (Neciridae)": {
        "neck": "high", "hands": "high", "collarbone": "high",
        "hair": "medium", "back": "medium", "waist": "medium",
        "shoulder": "medium", "cheek": "low", "forehead": "low",
    },
    "Luna (Tsukimi)": {
        "hair": "high", "hands": "high", "cheek": "high",
        "waist": "medium", "back": "medium", "ear": "medium",
        "neck": "low", "shoulder": "low", "forehead": "low",
    },
    "Genki (Kitsune)": {
        "ears": "high", "tail": "high", "waist": "high",
        "neck": "medium", "hair": "medium", "hands": "medium",
        "back": "medium", "cheek": "low", "shoulder": "low",
    },
    "Sable (Kuroha)": {
        "neck": "high", "wrist": "high", "jawline": "high",
        "collarbone": "medium", "back": "medium", "hair": "medium",
        "hands": "low", "shoulder": "low", "cheek": "low",
    },
    "Hana (Momoka)": {
        "hands": "high", "hair": "high", "back": "high",
        "cheek": "medium", "waist": "medium", "neck": "medium",
        "shoulder": "low", "forehead": "low", "ear": "low",
    },
    "Alana Calloway": {
        "collarbone": "high", "neck": "high", "waist": "high",
        "back": "medium", "hands": "medium", "hair": "medium",
        "cheek": "low", "shoulder": "low", "ear": "low",
    },
    "Kaede (Suzuha)": {
        "wrist": "high", "neck": "high", "ear": "high",
        "hair": "medium", "hands": "medium", "back": "medium",
        "cheek": "low", "shoulder": "low", "waist": "low",
    },
    "Ayane (Yuki)": {
        "hands": "high", "neck": "high", "waist": "high",
        "hair": "medium", "back": "medium", "cheek": "medium",
        "shoulder": "low", "ear": "low", "forehead": "low",
    },
    "Rin (Akane)": {
        "waist": "high", "neck": "high", "hair": "high",
        "hands": "medium", "back": "medium", "cheek": "medium",
        "shoulder": "low", "ear": "low", "collarbone": "low",
    },
    "Mika (Mikazuki)": {
        "ear": "high", "neck": "high", "hands": "high",
        "hair": "medium", "waist": "medium", "back": "medium",
        "cheek": "low", "shoulder": "low", "collarbone": "low",
    },
    "Yuki (Shirayuki)": {
        "hands": "high", "cheek": "high", "hair": "high",
        "neck": "medium", "waist": "medium", "back": "medium",
        "shoulder": "low", "ear": "low", "forehead": "low",
    },
    "Tsundere (Raine)": {
        "ear": "high", "waist": "high", "hands": "high",
        "neck": "medium", "hair": "medium", "back": "medium",
        "cheek": "low", "shoulder": "low", "collarbone": "low",
    },
}

#: Default sensitivity map for unknown characters.
DEFAULT_MAP: dict[str, str] = {
    "neck": "high", "hands": "medium", "hair": "medium",
    "waist": "medium", "back": "medium", "cheek": "low",
    "shoulder": "low", "ear": "low", "forehead": "low",
}

#: All recognisable body zones for keyword detection.
ALL_ZONES: list[str] = sorted({
    zone
    for char_map in CHARACTER_MAPS.values()
    for zone in char_map
} | set(DEFAULT_MAP.keys()))

#: Reaction intensity descriptions for prompt injection.
REACTION_INTENSITIES: dict[str, str] = {
    "high": (
        "React STRONGLY to this touch. Visible physical response — gasp, shiver, "
        "lean into it, eyes close. This is a very sensitive zone for you."
    ),
    "medium": (
        "React warmly to this touch. Pleasurable but controlled — a soft sound, "
        "slight movement toward them, a smile. Enjoy it but don't lose composure."
    ),
    "low": (
        "Acknowledge this touch gently. It's nice but doesn't overwhelm you. "
        "A small smile, a comfortable shift. Pleasant background contact."
    ),
}


# ---------------------------------------------------------------------------
# Engine
# ---------------------------------------------------------------------------


class ErogenousMapEngine:
    """Stateless engine for zone-sensitivity lookups and prompt injection.

    Example::

        >>> engine = ErogenousMapEngine()
        >>> engine.get_sensitivity("Luna (Tsukimi)", "hair")
        'high'
        >>> engine.get_sensitivity("Luna (Tsukimi)", "neck")
        'low'
        >>> engine.get_sensitivity("Unknown", "neck")
        'high'
    """

    def get_map(self, char_name: str) -> dict[str, str]:
        """Return the full sensitivity map for a character.

        Args:
            char_name: Character display name.

        Returns:
            Dict mapping zone names to sensitivity levels.

        Example::

            >>> engine = ErogenousMapEngine()
            >>> m = engine.get_map("Dae (Neciridae)")
            >>> m["neck"]
            'high'
        """
        return CHARACTER_MAPS.get(char_name, DEFAULT_MAP)

    def get_sensitivity(self, char_name: str, zone: str) -> str:
        """Return the sensitivity level for a specific zone.

        Args:
            char_name: Character display name.
            zone: Body zone name (e.g. ``"neck"``, ``"hands"``).

        Returns:
            ``"high"``, ``"medium"``, or ``"low"``.  Unknown zones
            default to ``"low"``.

        Example::

            >>> ErogenousMapEngine().get_sensitivity("Sable (Kuroha)", "wrist")
            'high'
            >>> ErogenousMapEngine().get_sensitivity("Sable (Kuroha)", "unknown_zone")
            'low'
        """
        char_map = self.get_map(char_name)
        return char_map.get(zone, "low")

    def detect_zone_mention(self, message_text: str) -> list[str]:
        """Detect which body zones are mentioned in a message.

        Uses word-boundary regex to avoid false positives (e.g. ``"earn"``
        matching ``"ear"``).

        Args:
            message_text: The user's message text.

        Returns:
            List of detected zone names, possibly empty.

        Example::

            >>> engine = ErogenousMapEngine()
            >>> engine.detect_zone_mention("I kiss your neck softly")
            ['neck']
            >>> engine.detect_zone_mention("I hold your hands")
            ['hands']
            >>> engine.detect_zone_mention("hello there")
            []
        """
        lowered = message_text.lower()
        detected: list[str] = []
        for zone in ALL_ZONES:
            if re.search(rf"\b{re.escape(zone)}\b", lowered):
                detected.append(zone)
        return detected

    def get_prompt(self, char_name: str, detected_zones: list[str]) -> Optional[str]:
        """Build a prompt fragment for zone-specific reactions.

        Returns ``None`` if no zones are detected.

        Args:
            char_name: Character display name.
            detected_zones: List of zone names found in the user's message.

        Returns:
            Prompt string with reaction instructions per zone, ending
            with ``[EROGENOUS_REACTION]`` tag, or ``None`` if no zones.

        Example::

            >>> engine = ErogenousMapEngine()
            >>> prompt = engine.get_prompt("Dae (Neciridae)", ["neck"])
            >>> prompt is not None
            True
            >>> "[EROGENOUS_REACTION]" in prompt
            True
            >>> engine.get_prompt("Dae (Neciridae)", []) is None
            True
        """
        if not detected_zones:
            return None

        parts: list[str] = ["Physical touch detected — react according to your sensitivity:\n"]
        for zone in detected_zones:
            sensitivity = self.get_sensitivity(char_name, zone)
            reaction = REACTION_INTENSITIES[sensitivity]
            parts.append(f"[{zone}] (sensitivity: {sensitivity}): {reaction}")

        parts.append("\n[EROGENOUS_REACTION]")
        return "\n".join(parts)
