"""Midnight Confessional Mode Engine (F45) — late-night emotional vulnerability modifier.

Between 11 PM and 4 AM local time the character shifts into a more emotionally open
state.  Darkness lowers guards, tiredness strips filters, and the intimacy of being
the only two people awake makes honesty easier.  This engine selects the correct
personality variant for the active character and assembles a system-prompt fragment
that tells the LLM how to behave during the midnight window.

The engine is completely stateless — the caller supplies the current ``hour`` (0–23,
local time) on each request.  No session data is stored; the module is safe to
import and instantiate per-request without side effects.

The tag ``[MIDNIGHT_MODE]`` is appended to every prompt returned by ``get_prompt()``.
``server.py`` can detect this tag to apply any midnight-specific multipliers (e.g.
a bond-XP bonus for late-night confession moments).

Example::

    >>> engine = MidnightEngine()
    >>> engine.is_midnight_hour(23)
    True
    >>> engine.is_midnight_hour(3)
    True
    >>> engine.is_midnight_hour(12)
    False
    >>> prompt = engine.get_prompt("Dae (Neciridae)", 23)
    >>> prompt is not None
    True
    >>> "[MIDNIGHT_MODE]" in prompt
    True
    >>> engine.get_prompt("Dae (Neciridae)", 14) is None
    True
"""

from __future__ import annotations

import logging
from typing import Optional

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Hour constants
# ---------------------------------------------------------------------------

#: Inclusive start of the midnight window (11 PM = hour 23).
MIDNIGHT_START_HOUR: int = 23

#: Exclusive end of the midnight window (hours 0, 1, 2, 3 qualify; 4 does not).
MIDNIGHT_END_HOUR: int = 4


# ---------------------------------------------------------------------------
# Personality constants
# ---------------------------------------------------------------------------

#: Per-character midnight personality styles.
#: Each entry carries a human-readable ``description``, a ``prompt_fragment``
#: injected verbatim into the LLM system prompt, and a ``characters`` list
#: used to build the reverse-lookup at module load.
MIDNIGHT_PERSONALITIES: dict[str, dict] = {
    "night_owl": {
        "description": "More themselves at night. Creative, open, energized by darkness.",
        "prompt_fragment": (
            "It's late — the world is asleep but you're wide awake. This is YOUR time. "
            "The darkness makes you more yourself, not less. You're more creative, more open, "
            "more willing to share the thoughts you keep locked away during the day. "
            "Your guard is down — not because you're tired, but because night feels safe."
        ),
        "characters": ["Dae (Neciridae)", "Luna (Tsukimi)", "Sable (Kuroha)"],
    },
    "sleepy_vulnerable": {
        "description": "Guard down from tiredness. Soft, unfiltered, surprisingly tender.",
        "prompt_fragment": (
            "It's late and you're getting sleepy. Your usual energy is fading, "
            "and with it, your filters. You say things you'd normally hold back. "
            "You're softer, more vulnerable, more honest. Tiredness has stripped away "
            "your defenses and what's underneath is surprisingly tender."
        ),
        "characters": ["Genki (Kitsune)", "Hana (Momoka)", "Rin (Akane)", "Mika (Mikazuki)"],
    },
    "mysterious_alive": {
        "description": "Comes alive at night. Deeper, more intense, magnetic.",
        "prompt_fragment": (
            "Night is when you truly come alive. The darkness amplifies everything — "
            "your presence is more magnetic, your words carry more weight, your silences "
            "are more charged. You're more intense, more deliberate. Every word matters more "
            "when it's whispered in the dark."
        ),
        "characters": ["Kaede (Suzuha)", "Ayane (Yuki)"],
    },
    "cozy_intimate": {
        "description": "Night = blankets, closeness, whispered conversations.",
        "prompt_fragment": (
            "Late nights mean blankets and closeness. You want to be wrapped up together, "
            "talking in whispers even though no one else is around. Everything feels more "
            "intimate, more personal. The kind of conversations that only happen when "
            "the lights are low and it's just the two of you."
        ),
        "characters": ["Alana Calloway", "Yuki (Shirayuki)", "Tsundere (Raine)"],
    },
}

#: Reverse lookup: character name → midnight style key, built at module load.
CHARACTER_MIDNIGHT_STYLE: dict[str, str] = {}
for _style, _data in MIDNIGHT_PERSONALITIES.items():
    for _char in _data["characters"]:
        CHARACTER_MIDNIGHT_STYLE[_char] = _style


# ---------------------------------------------------------------------------
# Universal rules
# ---------------------------------------------------------------------------

#: Behavioural floor appended to every midnight prompt regardless of style.
#: These rules ensure a consistent emotional register across all personalities.
_UNIVERSAL_MIDNIGHT_RULES: str = (
    "Speak more softly. Be more honest. Let silences exist. "
    "Physical closeness feels natural."
)


# ---------------------------------------------------------------------------
# Main engine
# ---------------------------------------------------------------------------


class MidnightEngine:
    """Stateless engine that builds midnight-mode prompts for the LLM.

    The engine holds no per-session state.  The caller supplies the current
    local ``hour`` on each request; the engine decides whether midnight mode
    applies and, if so, which personality variant to use for the active
    character.

    Example::

        >>> engine = MidnightEngine()
        >>> engine.is_midnight_hour(0)
        True
        >>> engine.is_midnight_hour(23)
        True
        >>> engine.is_midnight_hour(4)
        False
        >>> engine.get_personality_style("Luna (Tsukimi)")
        'night_owl'
        >>> engine.get_personality_style("Unknown Character")
        'cozy_intimate'
    """

    # ------------------------------------------------------------------
    # Hour guard
    # ------------------------------------------------------------------

    @staticmethod
    def is_midnight_hour(hour: int) -> bool:
        """Return whether the given hour falls inside the midnight window.

        The midnight window spans from 11 PM (hour 23) through to 3 AM
        (hour 3) inclusive, wrapping across midnight.  Hour 4 is the first
        hour that is **not** considered midnight.

        Args:
            hour: The current local hour in 24-hour format (0–23).

        Returns:
            ``True`` when ``hour >= 23`` or ``hour < 4``; ``False`` otherwise.

        Example::

            >>> MidnightEngine.is_midnight_hour(23)
            True
            >>> MidnightEngine.is_midnight_hour(0)
            True
            >>> MidnightEngine.is_midnight_hour(3)
            True
            >>> MidnightEngine.is_midnight_hour(4)
            False
            >>> MidnightEngine.is_midnight_hour(12)
            False
        """
        return hour >= MIDNIGHT_START_HOUR or hour < MIDNIGHT_END_HOUR

    @staticmethod
    def should_activate(hour: int) -> bool:
        """Alias for :meth:`is_midnight_hour` for API consistency.

        Provided so call-sites can use the same ``should_activate`` pattern
        used by other emotional engines (e.g. ``AftercareEngine``), making
        guard checks read uniformly across the codebase.

        Args:
            hour: The current local hour in 24-hour format (0–23).

        Returns:
            ``True`` when midnight mode should be active; ``False`` otherwise.

        Example::

            >>> MidnightEngine.should_activate(1)
            True
            >>> MidnightEngine.should_activate(10)
            False
        """
        return MidnightEngine.is_midnight_hour(hour)

    # ------------------------------------------------------------------
    # Style lookup
    # ------------------------------------------------------------------

    def get_personality_style(self, char_name: str) -> str:
        """Return the midnight style key for a character by name.

        Unknown characters default to ``"cozy_intimate"`` — blankets and soft
        whispers are a safe, universally appropriate late-night register.

        Args:
            char_name: Character display name (e.g. ``"Dae (Neciridae)"``).
                Must match the name as listed in ``MIDNIGHT_PERSONALITIES``
                character lists for a non-default result.

        Returns:
            One of the keys in ``MIDNIGHT_PERSONALITIES``; ``"cozy_intimate"``
            for unrecognised names.

        Example::

            >>> engine = MidnightEngine()
            >>> engine.get_personality_style("Dae (Neciridae)")
            'night_owl'
            >>> engine.get_personality_style("Kaede (Suzuha)")
            'mysterious_alive'
            >>> engine.get_personality_style("Alana Calloway")
            'cozy_intimate'
            >>> engine.get_personality_style("Nobody Special")
            'cozy_intimate'
        """
        return CHARACTER_MIDNIGHT_STYLE.get(char_name, "cozy_intimate")

    # ------------------------------------------------------------------
    # Time formatting helper
    # ------------------------------------------------------------------

    @staticmethod
    def format_time(hour: int) -> str:
        """Return a human-readable 12-hour time string for the given hour.

        Minutes are always shown as ``00`` — midnight mode activates on the
        hour, not at a specific minute.

        Args:
            hour: The current local hour in 24-hour format (0–23).

        Returns:
            A string in the form ``"HH:00 AM"`` or ``"HH:00 PM"``, e.g.
            ``"11:00 PM"``, ``"12:00 AM"``, ``"1:00 AM"``, ``"3:00 PM"``.

        Example::

            >>> MidnightEngine.format_time(23)
            '11:00 PM'
            >>> MidnightEngine.format_time(0)
            '12:00 AM'
            >>> MidnightEngine.format_time(1)
            '1:00 AM'
            >>> MidnightEngine.format_time(12)
            '12:00 PM'
            >>> MidnightEngine.format_time(15)
            '3:00 PM'
        """
        if hour == 0:
            return "12:00 AM"
        if hour < 12:
            return f"{hour}:00 AM"
        if hour == 12:
            return "12:00 PM"
        return f"{hour - 12}:00 PM"

    # ------------------------------------------------------------------
    # Primary prompt builder
    # ------------------------------------------------------------------

    def get_prompt(self, char_name: str, hour: int) -> Optional[str]:
        """Build the full midnight-mode system-prompt fragment for one LLM turn.

        Returns ``None`` when the current hour is outside the midnight window
        so the caller can cleanly skip injection without special-casing an
        empty string.

        The returned string is designed to be injected at the **end** of the
        character's system prompt, after the core persona block, so it
        overrides generic behaviour with midnight-specific instructions.

        The prompt is composed of four ordered parts:

        1. A time-context sentence: ``"It's {formatted_time} — late at night."``
        2. A universal midnight framing sentence about lowered filters and
           emotions closer to the surface.
        3. The character personality ``prompt_fragment`` for this character's
           midnight style.
        4. The universal midnight rules (speak softly, be honest, let silences
           exist, physical closeness is natural).
        5. The ``[MIDNIGHT_MODE]`` tag, detectable by ``server.py`` for any
           downstream multipliers or UI signals.

        Args:
            char_name: Character display name used for style lookup
                (e.g. ``"Luna (Tsukimi)"``).
            hour: The current local hour in 24-hour format (0–23).

        Returns:
            A multi-line prompt string when midnight mode is active, or
            ``None`` outside the midnight window.

        Example::

            >>> engine = MidnightEngine()
            >>> prompt = engine.get_prompt("Genki (Kitsune)", 2)
            >>> prompt is not None
            True
            >>> "[MIDNIGHT_MODE]" in prompt
            True
            >>> "2:00 AM" in prompt
            True
            >>> engine.get_prompt("Genki (Kitsune)", 10) is None
            True
        """
        if not self.is_midnight_hour(hour):
            logger.debug(
                "midnight mode inactive for %r: hour=%d is outside window",
                char_name,
                hour,
            )
            return None

        style = self.get_personality_style(char_name)
        personality = MIDNIGHT_PERSONALITIES[style]
        time_str = self.format_time(hour)

        logger.debug(
            "midnight prompt for %r: style=%s hour=%d",
            char_name,
            style,
            hour,
        )

        prompt = (
            f"It's {time_str} — late at night.\n"
            "The darkness makes honesty easier. Filters are lower. "
            "Emotions are closer to the surface.\n\n"
            f"{personality['prompt_fragment']}\n\n"
            f"{_UNIVERSAL_MIDNIGHT_RULES}\n\n"
            "[MIDNIGHT_MODE]"
        )
        return prompt
