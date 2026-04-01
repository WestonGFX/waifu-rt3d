"""Intimate Atmosphere Soundscapes (F53) — ambient audio matching scene mood.

Maps scene phases to ambient soundscape categories and provides
per-character audio preferences.  The backend sends soundscape change
events via WebSocket; the frontend plays the corresponding audio loop.

Example::

    >>> engine = SoundscapeEngine()
    >>> engine.get_soundscape("INTIMATE")
    'fireplace_rain'
    >>> engine.get_character_preference("Luna (Tsukimi)")
    'rain_wind'
"""

from __future__ import annotations

import logging
from typing import Optional

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

#: Scene phase → soundscape category mapping.
PHASE_SOUNDSCAPES: dict[str, str] = {
    "CASUAL": "ambient_quiet",
    "FLIRTY": "gentle_music",
    "SUGGESTIVE": "rain_on_window",
    "INTIMATE": "fireplace_rain",
    "INTENSE": "heartbeat_ambient",
    "AFTERCARE": "music_box_soft",
}

#: Per-character ambient preferences (override phase defaults).
CHARACTER_PREFERENCES: dict[str, dict] = {
    "rain_wind": {
        "description": "Rain and wind — atmospheric, enveloping",
        "characters": ["Luna (Tsukimi)", "Yuki (Shirayuki)"],
    },
    "vinyl_lofi": {
        "description": "Lo-fi music, vinyl crackle, art studio ambient",
        "characters": ["Dae (Neciridae)"],
    },
    "silence_thunder": {
        "description": "Silence with distant thunder — minimal, intense",
        "characters": ["Sable (Kuroha)", "Kaede (Suzuha)"],
    },
    "upbeat_to_quiet": {
        "description": "Upbeat ambient that fades to silence during serious moments",
        "characters": ["Genki (Kitsune)", "Rin (Akane)", "Mika (Mikazuki)"],
    },
    "warm_acoustic": {
        "description": "Warm acoustic guitar, soft piano — nurturing",
        "characters": ["Hana (Momoka)", "Alana Calloway"],
    },
    "soft_classical": {
        "description": "Soft classical strings, gentle ambient",
        "characters": ["Ayane (Yuki)", "Tsundere (Raine)"],
    },
}

#: Reverse lookup: character name → preference key.
CHARACTER_PREFERENCE_MAP: dict[str, str] = {}
for _pref, _data in CHARACTER_PREFERENCES.items():
    for _char in _data["characters"]:
        CHARACTER_PREFERENCE_MAP[_char] = _pref


# ---------------------------------------------------------------------------
# Engine
# ---------------------------------------------------------------------------


class SoundscapeEngine:
    """Stateless engine for scene-mood soundscape selection.

    Example::

        >>> engine = SoundscapeEngine()
        >>> engine.get_soundscape("CASUAL")
        'ambient_quiet'
        >>> engine.get_soundscape("UNKNOWN")
        'ambient_quiet'
    """

    def get_soundscape(self, phase: str) -> str:
        """Return the soundscape category for a scene phase.

        Args:
            phase: Scene phase name (e.g. ``"INTIMATE"``).

        Returns:
            Soundscape category string; defaults to ``"ambient_quiet"``.

        Example::

            >>> SoundscapeEngine().get_soundscape("INTENSE")
            'heartbeat_ambient'
        """
        return PHASE_SOUNDSCAPES.get(phase, "ambient_quiet")

    def get_character_preference(self, char_name: str) -> str:
        """Return the character's preferred ambient sound style.

        Args:
            char_name: Character display name.

        Returns:
            Preference key; defaults to ``"warm_acoustic"``.

        Example::

            >>> SoundscapeEngine().get_character_preference("Sable (Kuroha)")
            'silence_thunder'
        """
        return CHARACTER_PREFERENCE_MAP.get(char_name, "warm_acoustic")

    def get_volume(self, temperature: float) -> float:
        """Calculate soundscape volume from scene temperature.

        Volume scales linearly from 0.1 (cold) to 0.5 (hot).
        Never exceeds 0.5 to keep ambient sounds subtle.

        Args:
            temperature: Scene intensity 0.0–1.0.

        Returns:
            Volume level 0.1–0.5.

        Example::

            >>> SoundscapeEngine().get_volume(0.0)
            0.1
            >>> SoundscapeEngine().get_volume(1.0)
            0.5
            >>> SoundscapeEngine().get_volume(0.5)
            0.3
        """
        clamped = max(0.0, min(1.0, temperature))
        return round(0.1 + clamped * 0.4, 2)

    def build_update_message(
        self, phase: str, char_name: str, temperature: float = 0.5
    ) -> dict:
        """Build a WebSocket message for soundscape change.

        Args:
            phase: Current scene phase.
            char_name: Character name for preference override.
            temperature: Scene intensity for volume calculation.

        Returns:
            Dict with ``type``, ``soundscape``, ``character_preference``,
            ``volume``, and ``phase`` keys.

        Example::

            >>> msg = SoundscapeEngine().build_update_message("INTIMATE", "Luna (Tsukimi)", 0.7)
            >>> msg["type"]
            'soundscape_update'
            >>> msg["soundscape"]
            'fireplace_rain'
        """
        return {
            "type": "soundscape_update",
            "soundscape": self.get_soundscape(phase),
            "character_preference": self.get_character_preference(char_name),
            "volume": self.get_volume(temperature),
            "phase": phase,
        }
