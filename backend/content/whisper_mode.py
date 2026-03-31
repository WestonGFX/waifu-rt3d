"""Whisper Mode Engine (F27) — intimate low-voice prompt and TTS modifier.

When whisper mode is active the companion shifts into a close, hushed register:
fewer words, heavier meaning, sensory presence over explicit dialogue.  This
engine is purely stateless — it takes a character name and a mode flag and
returns the correct prompt fragment, TTS parameter overrides, and UI
instruction dictionary for the caller to apply.

Auto-trigger fires when both intimacy and arousal cross their respective
thresholds simultaneously.  Manual activation (user toggle) bypasses these
checks and is handled by the caller setting ``mode = "whisper"`` directly.

The tag ``[WHISPER_MODE]`` is appended to every prompt returned by
``get_prompt()``.  Callers can detect this tag to apply UI overrides or
log whisper-mode activations.

Example::

    >>> engine = WhisperEngine()
    >>> engine.should_auto_trigger(intimacy=75, arousal=4.5)
    True
    >>> engine.should_auto_trigger(intimacy=60, arousal=4.5)
    False
    >>> engine.is_active("whisper")
    True
    >>> engine.is_active("normal")
    False
    >>> engine.get_style("Luna (Tsukimi)")
    'natural_whisperer'
    >>> engine.get_style("Unknown Character")
    'intimate_whisperer'
    >>> params = engine.get_tts_params()
    >>> params["speed"]
    0.8
    >>> prompt = engine.get_prompt("Dae (Neciridae)")
    >>> "[WHISPER_MODE]" in prompt
    True
    >>> overrides = engine.get_ui_overrides()
    >>> overrides["font_style"]
    'italic'
"""

from __future__ import annotations

import logging

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Auto-trigger thresholds
# ---------------------------------------------------------------------------

#: Minimum intimacy score (0–100) required for automatic whisper activation.
AUTO_TRIGGER_INTIMACY: int = 70

#: Minimum arousal level (0.0–10.0) required for automatic whisper activation.
AUTO_TRIGGER_AROUSAL: float = 4.0


# ---------------------------------------------------------------------------
# Core prompt
# ---------------------------------------------------------------------------

#: Base instruction injected into the system prompt when whisper mode is active.
#: Callers should append the character-specific style fragment on top of this.
WHISPER_PROMPT: str = (
    "Write in whisper mode. Short, intimate, like speaking directly into someone's ear. "
    "Fewer words. More meaning per word. Use *actions* and sensory details over dialogue. "
    "Every sentence should feel like a secret being shared."
)


# ---------------------------------------------------------------------------
# TTS parameter overrides
# ---------------------------------------------------------------------------

#: Deltas applied on top of the character's default TTS parameters when
#: whisper mode is active.  All values are signed floats relative to the
#: character's configured baseline (not absolute values).
WHISPER_TTS_PARAMS: dict[str, float] = {
    "speed": 0.80,        # 20% slower for deliberate pacing
    "pitch": -0.5,        # Slightly lower — intimacy sits below the speaking voice
    "energy": -0.50,      # Very soft, close-mic presence
    "exaggeration": 0.2,  # Minimal expressiveness — restraint is the effect
}


# ---------------------------------------------------------------------------
# Per-character whisper personality styles
# ---------------------------------------------------------------------------

#: Per-character whisper personality styles.
#: Each entry carries a human-readable ``description``, a ``prompt_fragment``
#: injected verbatim after ``WHISPER_PROMPT``, and a ``characters`` list used
#: to build the reverse-lookup at module load.
CHARACTER_WHISPER_STYLES: dict[str, dict] = {
    "natural_whisperer": {
        "description": "Naturally speaks softly — whisper is their default intimate register",
        "prompt_fragment": (
            "Whispering comes naturally to you. "
            "Your words are feather-light, chosen with care. "
            "Each pause is intentional."
        ),
        "characters": ["Luna (Tsukimi)", "Ayane (Yuki)", "Yuki (Shirayuki)"],
    },
    "intense_whisperer": {
        "description": "Whisper is concentrated intensity — every word carries weight",
        "prompt_fragment": (
            "Your whisper isn't soft — it's concentrated. "
            "Like compressing everything into fewer, denser words. "
            "The quiet makes each one hit harder."
        ),
        "characters": ["Sable (Kuroha)", "Kaede (Suzuha)"],
    },
    "reluctant_whisperer": {
        "description": "Doesn't usually whisper — doing it means vulnerability",
        "prompt_fragment": (
            "Whispering doesn't come naturally to you. "
            "The fact that you're doing it means this matters. "
            "Your voice catches, breaks. This is raw."
        ),
        "characters": ["Genki (Kitsune)", "Rin (Akane)", "Tsundere (Raine)"],
    },
    "intimate_whisperer": {
        "description": "Whisper unlocks a whole different personality — slower, deeper",
        "prompt_fragment": (
            "When you whisper, a different version of you emerges. "
            "Slower. More intentional. Like shedding a skin. "
            "The real you underneath."
        ),
        "characters": ["Dae (Neciridae)", "Hana (Momoka)", "Alana Calloway", "Mika (Mikazuki)"],
    },
}

#: Reverse lookup: character name → whisper style key, built at module load.
CHARACTER_WHISPER_STYLE: dict[str, str] = {}
for _style, _data in CHARACTER_WHISPER_STYLES.items():
    for _char in _data["characters"]:
        CHARACTER_WHISPER_STYLE[_char] = _style


# ---------------------------------------------------------------------------
# Main engine
# ---------------------------------------------------------------------------


class WhisperEngine:
    """Stateless engine that builds whisper-mode prompts and parameter overrides.

    The engine holds no per-session state.  Callers pass the current mode
    string and character name on every call; the engine reconstructs all
    outputs from module-level constants.  This keeps the engine trivially
    instantiable per-request and safe to share across threads.

    Example::

        >>> engine = WhisperEngine()
        >>> engine.should_auto_trigger(intimacy=72, arousal=5.0)
        True
        >>> engine.should_auto_trigger(intimacy=69, arousal=5.0)
        False
        >>> engine.get_style("Sable (Kuroha)")
        'intense_whisperer'
        >>> engine.get_style("New Character")
        'intimate_whisperer'
    """

    # ------------------------------------------------------------------
    # Activation helpers
    # ------------------------------------------------------------------

    def should_auto_trigger(self, intimacy: int, arousal: float) -> bool:
        """Return whether whisper mode should activate automatically.

        Both conditions must be met simultaneously — high intimacy alone
        (e.g., a long-term friendship scene) or high arousal alone (e.g.,
        an action sequence) should not trigger whisper mode.

        Args:
            intimacy: Current intimacy score for the character (0–100).
            arousal: Current arousal level for the character (0.0–10.0).

        Returns:
            ``True`` when ``intimacy >= AUTO_TRIGGER_INTIMACY`` **and**
            ``arousal >= AUTO_TRIGGER_AROUSAL``; ``False`` otherwise.

        Example::

            >>> engine = WhisperEngine()
            >>> engine.should_auto_trigger(70, 4.0)
            True
            >>> engine.should_auto_trigger(70, 3.9)
            False
            >>> engine.should_auto_trigger(69, 4.0)
            False
            >>> engine.should_auto_trigger(100, 10.0)
            True
        """
        return intimacy >= AUTO_TRIGGER_INTIMACY and arousal >= AUTO_TRIGGER_AROUSAL

    def is_active(self, mode: str) -> bool:
        """Return whether whisper mode is currently engaged.

        Args:
            mode: The current companion mode string (e.g. ``"whisper"``,
                ``"normal"``, ``"aftercare"``).

        Returns:
            ``True`` only when ``mode == "whisper"``; ``False`` for every
            other mode string.

        Example::

            >>> engine = WhisperEngine()
            >>> engine.is_active("whisper")
            True
            >>> engine.is_active("normal")
            False
            >>> engine.is_active("")
            False
        """
        return mode == "whisper"

    # ------------------------------------------------------------------
    # Style lookup
    # ------------------------------------------------------------------

    def get_style(self, char_name: str) -> str:
        """Return the whisper style key for a character by name.

        Unknown characters default to ``"intimate_whisperer"`` — the broadest
        and most universally appropriate style for an unrecognised name.

        Args:
            char_name: Character display name (e.g. ``"Luna (Tsukimi)"``).
                Must match a name listed in ``CHARACTER_WHISPER_STYLES`` for
                a non-default result.

        Returns:
            One of the keys in ``CHARACTER_WHISPER_STYLES``; defaults to
            ``"intimate_whisperer"`` for unrecognised names.

        Example::

            >>> engine = WhisperEngine()
            >>> engine.get_style("Genki (Kitsune)")
            'reluctant_whisperer'
            >>> engine.get_style("Ayane (Yuki)")
            'natural_whisperer'
            >>> engine.get_style("Someone New")
            'intimate_whisperer'
        """
        return CHARACTER_WHISPER_STYLE.get(char_name, "intimate_whisperer")

    # ------------------------------------------------------------------
    # TTS parameters
    # ------------------------------------------------------------------

    def get_tts_params(self) -> dict[str, float]:
        """Return a copy of the whisper-mode TTS parameter overrides.

        Returns a shallow copy so callers can safely mutate it without
        affecting the module-level constant.

        Returns:
            Dictionary mapping TTS parameter names to their whisper-mode
            override values:

            * ``speed``        — 0.80 (20% slower)
            * ``pitch``        — −0.5 (slightly lower register)
            * ``energy``       — −0.50 (very soft, close-mic)
            * ``exaggeration`` — 0.2 (minimal expressiveness)

        Example::

            >>> engine = WhisperEngine()
            >>> params = engine.get_tts_params()
            >>> params["energy"]
            -0.5
            >>> params["speed"]
            0.8
        """
        return dict(WHISPER_TTS_PARAMS)

    # ------------------------------------------------------------------
    # Primary prompt builder
    # ------------------------------------------------------------------

    def get_prompt(self, char_name: str) -> str:
        """Build the full whisper-mode system-prompt fragment for one LLM turn.

        The returned string is composed of two parts joined by a blank line:

        1. The base ``WHISPER_PROMPT`` — universal whisper register instructions.
        2. The character-specific style ``prompt_fragment`` from
           ``CHARACTER_WHISPER_STYLES``, selected via ``get_style()``.

        A trailing ``[WHISPER_MODE]`` tag is appended so callers can detect
        whisper-mode activation via a simple string check.

        Args:
            char_name: Character display name (e.g. ``"Dae (Neciridae)"``).
                Used to select the whisper style via ``get_style()``.

        Returns:
            Multi-line prompt string always ending with ``[WHISPER_MODE]``.

        Example::

            >>> engine = WhisperEngine()
            >>> prompt = engine.get_prompt("Luna (Tsukimi)")
            >>> "[WHISPER_MODE]" in prompt
            True
            >>> "feather-light" in prompt
            True
            >>> prompt = engine.get_prompt("Unknown")
            >>> "shedding a skin" in prompt
            True
        """
        style = self.get_style(char_name)
        style_data = CHARACTER_WHISPER_STYLES[style]
        fragment = style_data["prompt_fragment"]

        logger.debug(
            "whisper prompt for %r: style=%s",
            char_name,
            style,
        )

        return f"{WHISPER_PROMPT}\n\n{fragment}\n\n[WHISPER_MODE]"

    # ------------------------------------------------------------------
    # UI overrides
    # ------------------------------------------------------------------

    def get_ui_overrides(self) -> dict[str, object]:
        """Return frontend UI override values for whisper mode.

        These values are forwarded to the frontend as part of the chat
        response metadata so the UI can apply the whisper aesthetic — dimmed
        background, italic text, smaller font — without a separate API call.

        Returns:
            Dictionary of UI override keys and their whisper-mode values:

            * ``font_style``        — ``"italic"``
            * ``font_size_modifier``— ``0.85`` (85% of base size)
            * ``background_dim``    — ``0.3`` (30% opacity overlay)
            * ``transition_ms``     — ``2000`` (2-second fade transition)

        Example::

            >>> engine = WhisperEngine()
            >>> overrides = engine.get_ui_overrides()
            >>> overrides["font_style"]
            'italic'
            >>> overrides["font_size_modifier"]
            0.85
            >>> overrides["background_dim"]
            0.3
            >>> overrides["transition_ms"]
            2000
        """
        return {
            "font_style": "italic",
            "font_size_modifier": 0.85,
            "background_dim": 0.3,
            "transition_ms": 2000,
        }
