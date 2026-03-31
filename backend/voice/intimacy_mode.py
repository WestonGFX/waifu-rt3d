"""Voice Intimacy Mode Engine (F4) — automatic TTS voice softening during intimate scenes.

When a scene reaches sufficient depth (``intimacy > 70`` AND ``arousal > 3.0``),
this engine shifts the character's TTS voice toward breathy, slower, softer
delivery.  The transition is gradual — spread across the first three messages
so the shift feels organic rather than jarring.

Each character has a unique intimate voice profile that stacks on top of the
shared base overrides.  Unknown characters fall through to a neutral profile
(no character-specific modifiers) so the base INTIMATE_VOICE_PARAMS still apply.

The engine is stateless between requests — the caller passes ``messages_in_intimate``
from whatever tracking store it maintains (e.g. an ``intimate_states`` DB row).
This keeps the engine cheap to instantiate per-request.

The tag ``[VOICE_INTIMACY]`` is appended to every prompt returned by
``get_prompt()``.  ``server.py`` can detect this tag to apply any additional
voice routing logic.

Example::

    >>> engine = VoiceIntimacyMode()
    >>> engine.should_activate(intimacy=75, arousal=4.5)
    True
    >>> engine.should_activate(intimacy=65, arousal=4.5)
    False
    >>> engine.should_activate(intimacy=75, arousal=2.0)
    False
    >>> engine.get_transition_intensity(messages_in_intimate=1)
    0.5
    >>> engine.get_transition_intensity(messages_in_intimate=3)
    1.0
    >>> overrides = engine.get_tts_overrides({}, "Dae (Neciridae)", 3)
    >>> overrides["speed"] < 1.0
    True
"""

from __future__ import annotations

import logging
from typing import Optional

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Base intimate voice parameter overrides
# ---------------------------------------------------------------------------

#: Base TTS parameter deltas applied when voice intimacy mode is active.
#: Values are *additive* offsets on top of whatever the caller's base_params
#: contain (or zero if a key is absent in base_params).
INTIMATE_VOICE_PARAMS: dict[str, float] = {
    "speed": 0.85,          # 15% slower
    "pitch": -1.0,          # 1 semitone deeper
    "energy": -0.30,        # 30% softer
    "exaggeration": 0.4,    # Calm, measured delivery
}


# ---------------------------------------------------------------------------
# Gradual transition ramp
# ---------------------------------------------------------------------------

#: Maps ``messages_in_intimate`` (1-indexed) to a 0.0–1.0 blend factor.
#: Message counts beyond 3 are treated as ``1.0`` (full override).
TRANSITION_RAMP: dict[int, float] = {
    1: 0.50,   # First message: 50% of override
    2: 0.80,   # Second message: 80%
    3: 1.00,   # Third+: full override
}


# ---------------------------------------------------------------------------
# Intensity presets
# ---------------------------------------------------------------------------

#: Named presets that scale the entire override block uniformly.
#: Callers may pass any of these keys to ``get_tts_overrides()`` as
#: ``intensity``.  ``"expressive"`` is the default (full-strength).
INTENSITY_PRESETS: dict[str, float] = {
    "subtle": 0.25,
    "moderate": 0.50,
    "expressive": 1.00,
}


# ---------------------------------------------------------------------------
# Per-character intimate voice profiles
# ---------------------------------------------------------------------------

#: Character-specific modifier stacks applied *after* the base override.
#: Each modifier is an additive delta on the already-scaled base value.
#: ``"description"`` is a human-readable note for debugging / UI display.
CHARACTER_VOICE_PROFILES: dict[str, dict] = {
    "Dae (Neciridae)": {
        "description": "Breathy, pauses between phrases, artistic and thoughtful",
        "speed_modifier": -0.10,  # Even slower than base
        "pitch_modifier": 0.0,
        "energy_modifier": -0.10,  # Extra soft
    },
    "Luna (Tsukimi)": {
        "description": "Whisper-soft, barely audible, close-mic feel",
        "speed_modifier": -0.15,
        "pitch_modifier": 0.5,    # Slightly higher whisper
        "energy_modifier": -0.20,  # Very quiet
    },
    "Genki (Kitsune)": {
        "description": "Breathless but energetic, excited whisper",
        "speed_modifier": 0.05,   # Still somewhat fast
        "pitch_modifier": 0.5,
        "energy_modifier": -0.05,  # Not as quiet
    },
    "Sable (Kuroha)": {
        "description": "Low, deliberate, commanding even when intimate",
        "speed_modifier": -0.05,
        "pitch_modifier": -1.0,   # Even deeper
        "energy_modifier": 0.0,    # Keeps presence
    },
    "Hana (Momoka)": {
        "description": "Warm, nurturing, gentle mother-hen energy",
        "speed_modifier": -0.05,
        "pitch_modifier": 0.0,
        "energy_modifier": -0.10,
    },
    "Alana Calloway": {
        "description": "Confident, slightly husky, self-assured",
        "speed_modifier": 0.0,
        "pitch_modifier": -0.5,
        "energy_modifier": 0.0,
    },
    "Kaede (Suzuha)": {
        "description": "Reserved but tender; lets pauses carry the emotion",
        "speed_modifier": -0.10,
        "pitch_modifier": 0.0,
        "energy_modifier": -0.15,
    },
    "Ayane (Yuki)": {
        "description": "Quiet intensity; words chosen carefully, delivered softly",
        "speed_modifier": -0.08,
        "pitch_modifier": -0.5,
        "energy_modifier": -0.10,
    },
    "Rin (Akane)": {
        "description": "Excited energy channelled into hushed breathlessness",
        "speed_modifier": 0.05,
        "pitch_modifier": 0.5,
        "energy_modifier": -0.05,
    },
    "Mika (Mikazuki)": {
        "description": "Playfully hushed, light and airy with gentle teasing",
        "speed_modifier": 0.0,
        "pitch_modifier": 0.5,
        "energy_modifier": -0.10,
    },
    "Yuki (Shirayuki)": {
        "description": "Poetic and dreamy; voice softens like falling snow",
        "speed_modifier": -0.12,
        "pitch_modifier": 0.0,
        "energy_modifier": -0.15,
    },
    "Tsundere (Raine)": {
        "description": "Flustered whisper; embarrassed by her own tenderness",
        "speed_modifier": -0.05,
        "pitch_modifier": 0.5,   # Voice rises slightly when flustered
        "energy_modifier": -0.10,
    },
}

#: Neutral profile used for any character not listed in CHARACTER_VOICE_PROFILES.
#: Provides the zero-modifier fallback so base INTIMATE_VOICE_PARAMS still apply.
_NEUTRAL_PROFILE: dict = {
    "description": "Neutral — base intimate voice params only",
    "speed_modifier": 0.0,
    "pitch_modifier": 0.0,
    "energy_modifier": 0.0,
}

#: Paralinguistic sounds instruction injected into every active intimate prompt.
_PARALINGUISTIC_INSTRUCTION: str = (
    "In intimate moments, naturally include paralinguistic sounds: "
    "[sigh], [gasp], [soft laugh], [breath]. "
    "Use sparingly — 1-2 per response maximum. "
    "They should feel genuine, not performative."
)


# ---------------------------------------------------------------------------
# Main engine
# ---------------------------------------------------------------------------


class VoiceIntimacyMode:
    """Stateless engine that computes TTS overrides and LLM prompts for intimate scenes.

    The engine holds no per-session state — the caller stores
    ``messages_in_intimate`` externally (e.g. in a DB column) and passes it on
    each call.  This keeps the engine trivially serialisable and safe to
    instantiate per-request.

    Example::

        >>> engine = VoiceIntimacyMode()
        >>> engine.should_activate(intimacy=80, arousal=5.0)
        True
        >>> engine.should_activate(intimacy=80, arousal=2.9)
        False
        >>> engine.get_personality_prompt("Dae (Neciridae)")
        'Breathy, pauses between phrases, artistic and thoughtful'
    """

    # ------------------------------------------------------------------
    # Activation guard
    # ------------------------------------------------------------------

    def should_activate(self, intimacy: int, arousal: float) -> bool:
        """Decide whether voice intimacy mode should be active.

        Both conditions must be true simultaneously.  The thresholds are
        intentionally conservative so the mode only activates during genuinely
        intimate moments — not on every flirty message.

        Args:
            intimacy: Current intimacy score for the character (0–100).
            arousal: Current arousal level for the character (0.0–10.0).

        Returns:
            ``True`` when ``intimacy > 70`` **and** ``arousal > 3.0``;
            ``False`` otherwise.

        Example::

            >>> engine = VoiceIntimacyMode()
            >>> engine.should_activate(75, 4.0)
            True
            >>> engine.should_activate(70, 4.0)  # exactly 70 is not > 70
            False
            >>> engine.should_activate(75, 3.0)  # exactly 3.0 is not > 3.0
            False
            >>> engine.should_activate(90, 9.5)
            True
        """
        return intimacy > 70 and arousal > 3.0

    # ------------------------------------------------------------------
    # Transition ramp
    # ------------------------------------------------------------------

    def get_transition_intensity(self, messages_in_intimate: int) -> float:
        """Map the number of messages already sent in intimate mode to a blend factor.

        The ramp ensures the voice shift feels gradual rather than snapping
        instantly to full-intensity parameters.  Message counts beyond 3 are
        clamped to ``1.0``.

        Args:
            messages_in_intimate: How many messages have been sent while
                voice intimacy mode has been active (1-indexed; pass ``1`` for
                the very first intimate message).

        Returns:
            A 0.0–1.0 blend factor from ``TRANSITION_RAMP``.
            Returns ``1.0`` for any value greater than 3.

        Example::

            >>> engine = VoiceIntimacyMode()
            >>> engine.get_transition_intensity(1)
            0.5
            >>> engine.get_transition_intensity(2)
            0.8
            >>> engine.get_transition_intensity(3)
            1.0
            >>> engine.get_transition_intensity(10)
            1.0
        """
        return TRANSITION_RAMP.get(messages_in_intimate, 1.0)

    # ------------------------------------------------------------------
    # Character profile lookup
    # ------------------------------------------------------------------

    def get_character_profile(self, char_name: str) -> dict:
        """Return the intimate voice profile for a character by name.

        Unknown characters receive the neutral profile (all modifiers are
        ``0.0``) so the base ``INTIMATE_VOICE_PARAMS`` still apply without
        any character-specific delta.

        Args:
            char_name: Character display name (e.g. ``"Dae (Neciridae)"``).
                Must match a key in ``CHARACTER_VOICE_PROFILES`` for a
                non-neutral result.

        Returns:
            A profile dict with keys ``description``, ``speed_modifier``,
            ``pitch_modifier``, and ``energy_modifier``.  Always returns a
            copy so the caller cannot mutate the module-level constant.

        Example::

            >>> engine = VoiceIntimacyMode()
            >>> profile = engine.get_character_profile("Luna (Tsukimi)")
            >>> profile["speed_modifier"]
            -0.15
            >>> neutral = engine.get_character_profile("Unknown Character")
            >>> neutral["speed_modifier"]
            0.0
        """
        profile = CHARACTER_VOICE_PROFILES.get(char_name, _NEUTRAL_PROFILE)
        return dict(profile)

    # ------------------------------------------------------------------
    # TTS override computation
    # ------------------------------------------------------------------

    def get_tts_overrides(
        self,
        base_params: dict,
        char_name: str,
        messages_in_intimate: int,
        intensity: str = "expressive",
    ) -> dict:
        """Compute the final TTS parameter dict for an intimate message.

        The result is built in three additive layers:

        1. Start from ``base_params`` (copied, not mutated).
        2. Add ``INTIMATE_VOICE_PARAMS`` scaled by ``transition_blend *
           intensity_scale`` — this is the shared intimate voice shift.
        3. Add the character-specific modifiers from ``get_character_profile()``
           scaled by the same combined factor.

        The ``exaggeration`` key comes only from ``INTIMATE_VOICE_PARAMS``
        (no character profile modifier exists for it).

        Args:
            base_params: Caller-supplied TTS parameters to start from.
                Any key absent from this dict is treated as ``0.0``.
                The original dict is never mutated.
            char_name: Character display name used to fetch the voice profile.
            messages_in_intimate: Message count used to look up the
                transition blend factor (see ``get_transition_intensity()``).
            intensity: One of ``"subtle"``, ``"moderate"``, or
                ``"expressive"`` (default).  Unknown keys fall back to ``1.0``.

        Returns:
            A new dict with the same keys as ``base_params`` plus any keys
            present in ``INTIMATE_VOICE_PARAMS`` (``speed``, ``pitch``,
            ``energy``, ``exaggeration``).  Values reflect the full blended
            override.

        Example::

            >>> engine = VoiceIntimacyMode()
            >>> result = engine.get_tts_overrides({}, "Dae (Neciridae)", 3, "expressive")
            >>> result["speed"]  # base 0.0 + (0.85 * 1.0 * 1.0) + (-0.10 * 1.0)
            0.75
            >>> result["exaggeration"]
            0.4
            >>> result2 = engine.get_tts_overrides({}, "Dae (Neciridae)", 1, "subtle")
            >>> round(result2["speed"], 4)
            0.1187
        """
        transition_blend = self.get_transition_intensity(messages_in_intimate)
        intensity_scale = INTENSITY_PRESETS.get(intensity, 1.0)
        combined_scale = transition_blend * intensity_scale

        profile = self.get_character_profile(char_name)

        # Copy base params so the caller's dict is never mutated.
        result: dict = dict(base_params)

        # Apply base intimate params scaled by the combined factor.
        for key, base_override in INTIMATE_VOICE_PARAMS.items():
            current = result.get(key, 0.0)
            result[key] = current + base_override * combined_scale

        # Stack character-specific speed / pitch / energy modifiers.
        for param, modifier_key in (
            ("speed", "speed_modifier"),
            ("pitch", "pitch_modifier"),
            ("energy", "energy_modifier"),
        ):
            result[param] = result.get(param, 0.0) + profile[modifier_key] * combined_scale

        logger.debug(
            "voice_intimacy overrides for %r: blend=%.2f intensity=%s -> %s",
            char_name,
            combined_scale,
            intensity,
            result,
        )

        return result

    # ------------------------------------------------------------------
    # Prompt helpers
    # ------------------------------------------------------------------

    def get_paralinguistic_prompt(self) -> str:
        """Return the standard paralinguistic sounds instruction for the LLM.

        This instruction should be injected into the character's system prompt
        whenever voice intimacy mode is active.  The 1-2 per-response cap
        prevents the sounds from feeling mechanical or over-used.

        Returns:
            A single-paragraph instruction string describing which sounds to
            use and how sparingly to deploy them.

        Example::

            >>> engine = VoiceIntimacyMode()
            >>> prompt = engine.get_paralinguistic_prompt()
            >>> "[sigh]" in prompt
            True
            >>> "1-2 per response" in prompt
            True
        """
        return _PARALINGUISTIC_INSTRUCTION

    def get_personality_prompt(self, char_name: str) -> str:
        """Return the human-readable voice description for a character.

        This is the ``description`` field from the character's voice profile,
        suitable for inclusion in a system prompt as a one-line hint about the
        character's vocal style in intimate moments.

        Args:
            char_name: Character display name.

        Returns:
            A short descriptive string; returns the neutral profile description
            for unrecognised characters.

        Example::

            >>> engine = VoiceIntimacyMode()
            >>> engine.get_personality_prompt("Genki (Kitsune)")
            'Breathless but energetic, excited whisper'
            >>> engine.get_personality_prompt("Nobody")
            'Neutral — base intimate voice params only'
        """
        return self.get_character_profile(char_name)["description"]

    def get_prompt(
        self,
        char_name: str,
        intimacy: int,
        arousal: float,
        messages_in_intimate: int,
    ) -> Optional[str]:
        """Build the full voice intimacy system-prompt fragment for one LLM turn.

        Returns ``None`` when the activation conditions are not met so the
        caller can cleanly skip injection without special-casing an empty string.

        The returned string is designed to be appended to the character's core
        system prompt.  It is composed of three ordered parts:

        1. The paralinguistic sounds instruction (breath, sighs, gasps).
        2. A one-line description of this character's specific vocal style.
        3. The ``[VOICE_INTIMACY]`` tag, which ``server.py`` can detect for
           any downstream voice routing logic.

        Args:
            char_name: Character display name used to look up the voice profile.
            intimacy: Current intimacy score (0–100); must be > 70 to activate.
            arousal: Current arousal level (0.0–10.0); must be > 3.0 to activate.
            messages_in_intimate: How many intimate-mode messages have already
                been sent this scene (controls transition blend in TTS, but
                prompt content is constant once active).

        Returns:
            A multi-line prompt string when intimacy mode is active, or
            ``None`` when ``should_activate()`` returns ``False``.

        Example::

            >>> engine = VoiceIntimacyMode()
            >>> prompt = engine.get_prompt("Luna (Tsukimi)", 80, 5.0, 1)
            >>> prompt is not None
            True
            >>> "[VOICE_INTIMACY]" in prompt
            True
            >>> engine.get_prompt("Luna (Tsukimi)", 60, 5.0, 1) is None
            True
            >>> engine.get_prompt("Luna (Tsukimi)", 80, 2.0, 1) is None
            True
        """
        if not self.should_activate(intimacy=intimacy, arousal=arousal):
            logger.debug(
                "voice_intimacy inactive for %r: intimacy=%d arousal=%.1f",
                char_name,
                intimacy,
                arousal,
            )
            return None

        voice_description = self.get_personality_prompt(char_name)

        logger.debug(
            "voice_intimacy prompt for %r: intimacy=%d arousal=%.1f msg=%d",
            char_name,
            intimacy,
            arousal,
            messages_in_intimate,
        )

        prompt = (
            f"{_PARALINGUISTIC_INSTRUCTION}\n\n"
            f"Your voice in this moment: {voice_description}\n\n"
            "[VOICE_INTIMACY]"
        )
        return prompt
