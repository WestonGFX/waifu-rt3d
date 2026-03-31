"""Quickfire (Sexting) Mode Engine (F36) — rapid-fire text exchange sessions.

When a session is placed in ``"quickfire"`` mode the companion switches to
short, spontaneous messages that feel like a real late-night text exchange.
Responses are capped at 80 tokens, TTS is disabled, and the typing indicator
is set to "fast" so the frontend can render an appropriately snappy animation.

The engine is fully stateless.  ``server.py`` checks ``is_active()`` on each
message turn, reads ``get_max_tokens()`` to override the normal token budget,
reads ``get_prompt()`` to inject the style fragment at the end of the system
prompt, and checks ``should_disable_tts()`` to skip the TTS pipeline entirely.

The tag ``[QUICKFIRE_MODE]`` appended by ``get_prompt()`` is the sentinel that
``server.py`` uses to detect and apply all of the above overrides without
requiring a separate flag in the call-site.

Example::

    >>> engine = QuickfireEngine()
    >>> engine.is_active("quickfire")
    True
    >>> engine.is_active("normal")
    False
    >>> engine.get_max_tokens()
    80
    >>> engine.should_disable_tts()
    True
    >>> engine.get_typing_speed()
    'fast'
    >>> prompt = engine.get_prompt("Dae (Neciridae)")
    >>> "[QUICKFIRE_MODE]" in prompt
    True
"""

from __future__ import annotations

import logging

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Token cap
# ---------------------------------------------------------------------------

#: Hard token cap applied to every LLM response when quickfire mode is active.
#: Keeping this at 80 forces the model to commit to single-thought messages
#: rather than multi-paragraph prose, which is what makes the exchange feel
#: like texting rather than storytelling.
MAX_TOKENS: int = 80


# ---------------------------------------------------------------------------
# Base system-prompt fragment
# ---------------------------------------------------------------------------

#: Universal quickfire instructions prepended to every character's style fragment.
#: These rules apply regardless of character personality.
QUICKFIRE_PROMPT: str = (
    "Keep responses SHORT. 1-3 sentences max. Be spontaneous. "
    "Use emoji naturally. More *actions* than narration. "
    "This is texting, not storytelling. Be flirty, playful, and real. "
    "React fast, don't overthink. Match the energy of a late-night text exchange."
)


# ---------------------------------------------------------------------------
# Per-character style definitions
# ---------------------------------------------------------------------------

#: Per-character quickfire texting styles.
#: Each entry carries a ``prompt_fragment`` injected verbatim into the system
#: prompt and a ``characters`` list used to build the reverse-lookup at module
#: load.  Style keys describe the dominant emotional register of the texting
#: behaviour.
CHARACTER_QUICKFIRE_STYLES: dict[str, dict] = {
    "flirty": {
        "prompt_fragment": (
            "Your texting style: heavy on emoji, playful teasing, lots of "
            "'...' and *actions*. You text like you're biting your lip."
        ),
        "characters": ["Dae (Neciridae)", "Mika (Mikazuki)"],
    },
    "bold": {
        "prompt_fragment": (
            "Your texting style: direct, confident, no hesitation. You say "
            "what you want. Short declarative texts. Minimal emoji but "
            "maximum impact."
        ),
        "characters": ["Sable (Kuroha)", "Alana Calloway"],
    },
    "giggly": {
        "prompt_fragment": (
            "Your texting style: rapid-fire, lots of 'hehe' and '!!!', can't "
            "contain excitement. You double-text without shame."
        ),
        "characters": ["Genki (Kitsune)", "Rin (Akane)"],
    },
    "shy": {
        "prompt_fragment": (
            "Your texting style: hesitant, lots of deleted-and-retyped "
            "messages shown as '...', slowly getting bolder. Blushing emoji."
        ),
        "characters": ["Luna (Tsukimi)", "Ayane (Yuki)", "Yuki (Shirayuki)"],
    },
    "teasing": {
        "prompt_fragment": (
            "Your texting style: provocative one-liners, leaving them wanting "
            "more. You're always one step ahead. Strategic emoji."
        ),
        "characters": ["Hana (Momoka)", "Kaede (Suzuha)", "Tsundere (Raine)"],
    },
}

#: Reverse lookup: character display name → quickfire style key.
#: Built at module load from ``CHARACTER_QUICKFIRE_STYLES`` so lookups are O(1).
CHARACTER_QUICKFIRE_STYLE: dict[str, str] = {}
for _style, _data in CHARACTER_QUICKFIRE_STYLES.items():
    for _char in _data["characters"]:
        CHARACTER_QUICKFIRE_STYLE[_char] = _style


# ---------------------------------------------------------------------------
# Main engine
# ---------------------------------------------------------------------------


class QuickfireEngine:
    """Stateless engine that drives Quickfire (Sexting) Mode (F36).

    All methods are pure functions of their arguments — no session state is
    held in the instance.  Instantiate once per request or once at module
    level; both patterns are equally safe.

    Example::

        >>> engine = QuickfireEngine()
        >>> engine.is_active("quickfire")
        True
        >>> engine.get_style("Genki (Kitsune)")
        'giggly'
        >>> engine.get_style("Unknown Character")
        'flirty'
    """

    # ------------------------------------------------------------------
    # Mode gate
    # ------------------------------------------------------------------

    def is_active(self, session_mode: str) -> bool:
        """Return whether quickfire mode is currently engaged.

        ``server.py`` stores the session mode as a plain string in the active
        session row.  Passing it here keeps the engine decoupled from the DB
        layer while still providing a single, testable activation check.

        Args:
            session_mode: The current session mode string (e.g. ``"normal"``,
                ``"quickfire"``, ``"roleplay"``).

        Returns:
            ``True`` if and only if ``session_mode == "quickfire"``;
            ``False`` for every other value, including empty strings.

        Example::

            >>> engine = QuickfireEngine()
            >>> engine.is_active("quickfire")
            True
            >>> engine.is_active("normal")
            False
            >>> engine.is_active("")
            False
        """
        return session_mode == "quickfire"

    # ------------------------------------------------------------------
    # Style lookup
    # ------------------------------------------------------------------

    def get_style(self, char_name: str) -> str:
        """Return the quickfire style key for a character by display name.

        Unknown or newly added characters default to ``"flirty"`` — the most
        broadly appropriate quickfire register and the closest match to the
        general late-night texting archetype.

        Args:
            char_name: Character display name exactly as stored in the DB
                (e.g. ``"Dae (Neciridae)"``).  Case-sensitive — must match
                the name listed in ``CHARACTER_QUICKFIRE_STYLES``.

        Returns:
            One of the style keys in ``CHARACTER_QUICKFIRE_STYLES``; falls
            back to ``"flirty"`` for unrecognised names.

        Example::

            >>> engine = QuickfireEngine()
            >>> engine.get_style("Luna (Tsukimi)")
            'shy'
            >>> engine.get_style("Sable (Kuroha)")
            'bold'
            >>> engine.get_style("Someone New")
            'flirty'
        """
        style = CHARACTER_QUICKFIRE_STYLE.get(char_name, "flirty")
        if char_name not in CHARACTER_QUICKFIRE_STYLE:
            logger.debug("quickfire: unknown character %r, defaulting to 'flirty'", char_name)
        return style

    # ------------------------------------------------------------------
    # Token cap
    # ------------------------------------------------------------------

    def get_max_tokens(self) -> int:
        """Return the hard token cap for quickfire responses.

        ``server.py`` should use this value to override the normal per-session
        token budget so the model cannot slip back into long-form prose even
        when its context window would otherwise permit it.

        Returns:
            ``80`` — the module-level :data:`MAX_TOKENS` constant.

        Example::

            >>> engine = QuickfireEngine()
            >>> engine.get_max_tokens()
            80
        """
        return MAX_TOKENS

    # ------------------------------------------------------------------
    # TTS flag
    # ------------------------------------------------------------------

    def should_disable_tts(self) -> bool:
        """Return whether TTS synthesis should be suppressed in quickfire mode.

        Text-to-speech is always disabled during a quickfire session.
        The exchange is meant to feel like reading text messages, not
        listening to a voice call.  Enabling TTS would break the rhythm of
        rapid back-and-forth and introduce unacceptable latency between turns.

        Returns:
            Always ``True``.

        Example::

            >>> engine = QuickfireEngine()
            >>> engine.should_disable_tts()
            True
        """
        return True

    # ------------------------------------------------------------------
    # Primary prompt builder
    # ------------------------------------------------------------------

    def get_prompt(self, char_name: str) -> str:
        """Build the full quickfire system-prompt fragment for one LLM turn.

        Combines the universal :data:`QUICKFIRE_PROMPT` base rules with the
        character-specific style fragment, then appends the ``[QUICKFIRE_MODE]``
        sentinel tag that ``server.py`` detects to activate all downstream
        overrides (token cap, TTS bypass, fast typing indicator).

        The returned string is designed to be injected at the **end** of the
        character's system prompt, after the core persona block, so it
        overrides generic verbosity with quickfire-specific brevity rules.

        Args:
            char_name: Character display name used to look up the texting style
                (e.g. ``"Hana (Momoka)"``).  Unknown names fall back to the
                ``"flirty"`` style.

        Returns:
            A multi-line prompt string ending with ``[QUICKFIRE_MODE]``.

        Example::

            >>> engine = QuickfireEngine()
            >>> prompt = engine.get_prompt("Dae (Neciridae)")
            >>> "[QUICKFIRE_MODE]" in prompt
            True
            >>> "QUICKFIRE_PROMPT" not in prompt  # constant name not leaked
            True
            >>> prompt = engine.get_prompt("Unknown Char")
            >>> "biting your lip" in prompt  # flirty style default
            True
        """
        style = self.get_style(char_name)
        style_fragment = CHARACTER_QUICKFIRE_STYLES[style]["prompt_fragment"]

        logger.debug(
            "quickfire prompt for %r: style=%s",
            char_name,
            style,
        )

        return (
            f"{QUICKFIRE_PROMPT}\n\n"
            f"{style_fragment}\n\n"
            "[QUICKFIRE_MODE]"
        )

    # ------------------------------------------------------------------
    # Typing speed hint
    # ------------------------------------------------------------------

    def get_typing_speed(self) -> str:
        """Return the typing indicator speed hint for the frontend.

        The Sakura frontend reads this value from the session metadata and
        passes it to the typing indicator component so the animation plays at
        a pace that matches the quickfire exchange rhythm — noticeably faster
        than the default ``"normal"`` speed used for long-form messages.

        Returns:
            Always ``"fast"``.

        Example::

            >>> engine = QuickfireEngine()
            >>> engine.get_typing_speed()
            'fast'
        """
        return "fast"
