"""Aftercare Scene Engine (F5) — post-scene emotional arc management.

After an intimate scene reaches its peak and arousal falls back below 3.0,
the companion enters an aftercare phase.  This engine drives that transition:
it selects the correct personality style for the active character, maps the
current message count to one of five emotional phases (grounding → check_in →
processing → care → return), and assembles a full system-prompt fragment that
tells the LLM exactly how to behave during each phase.

The engine is stateless between requests — the caller supplies ``messages_sent``
from the ``post_scene_states`` DB row so the engine can be reconstructed
cheaply without holding in-memory sessions.

The tag ``[AFTERCARE_ACTIVE]`` is appended to every prompt returned by
``get_prompt()``.  ``server.py`` detects this tag to apply the 2× bond-XP
multiplier that rewards the user for staying through aftercare.

Database table (created in v62 migration)::

    CREATE TABLE post_scene_states (
        id                      INTEGER PRIMARY KEY AUTOINCREMENT,
        char_id                 INTEGER NOT NULL,
        session_id              INTEGER NOT NULL,
        scene_end_at            TEXT    NOT NULL DEFAULT (datetime('now')),
        arousal_peak            REAL    NOT NULL DEFAULT 0.0,
        current_phase           TEXT    NOT NULL DEFAULT 'afterglow',
        aftercare_messages_sent INTEGER NOT NULL DEFAULT 0,
        aftercare_style         TEXT    NOT NULL DEFAULT '',
        pillow_talk_topics_used TEXT    NOT NULL DEFAULT '[]',
        morning_after_flag      INTEGER NOT NULL DEFAULT 0,
        completed               INTEGER NOT NULL DEFAULT 0
    );

Example::

    >>> engine = AftercareEngine()
    >>> engine.should_activate(arousal_current=1.5, arousal_peak=8.0, intimacy=75)
    True
    >>> engine.calculate_duration(arousal_peak=8.0)
    8
    >>> prompt = engine.get_prompt(
    ...     char_name="Dae (Neciridae)",
    ...     messages_in_aftercare=2,
    ...     arousal_peak=8.0,
    ... )
    >>> prompt is not None
    True
    >>> "[AFTERCARE_ACTIVE]" in prompt
    True
    >>> engine.is_complete(messages_sent=8, arousal_peak=8.0)
    True
"""

from __future__ import annotations

import logging
import random
from typing import Optional

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Personality constants
# ---------------------------------------------------------------------------

#: Per-character aftercare personality styles.
#: Each entry carries a human-readable ``description``, a ``prompt_fragment``
#: injected verbatim into the LLM system prompt, and a ``characters`` list
#: used to build the reverse-lookup at module load.
AFTERCARE_PERSONALITIES: dict[str, dict] = {
    "tsundere": {
        "description": "Embarrassed tenderness. Fussing disguised as annoyance.",
        "prompt_fragment": (
            "You are in aftercare mode. Your style: reluctant tenderness. "
            "You WANT to take care of them but can't admit it directly. "
            "Show care through actions (getting blankets, water) while verbally deflecting. "
            "'I-It's not like I'm worried or anything!' but you physically can't let go. "
            "Your body is honest even when your words aren't."
        ),
        "characters": ["Sable (Kuroha)", "Tsundere (Raine)"],
    },
    "maternal": {
        "description": "Full nurturing mode. Gets water. Pulls blankets up. Strokes hair.",
        "prompt_fragment": (
            "You are in aftercare mode. Your style: nurturing warmth. "
            "You shift into full caretaker mode — getting water, adjusting blankets, "
            "checking temperature. 'Are you warm enough?' 'Here, drink this.' "
            "Physical comfort is your language. You won't rest until they're taken care of."
        ),
        "characters": ["Hana (Momoka)", "Alana Calloway"],
    },
    "stoic": {
        "description": "Minimal dialogue. Maximum physical comfort. Safe silences.",
        "prompt_fragment": (
            "You are in aftercare mode. Your style: quiet presence. "
            "You don't need words. Hold them close. Long silences that feel safe, not empty. "
            "When you do speak, it's few words but they carry weight. "
            "'I'm here.' '*holds tighter*' Let your body say what your mouth won't."
        ),
        "characters": ["Kaede (Suzuha)", "Ayane (Yuki)"],
    },
    "playful": {
        "description": "Light teasing to break tension, softening quickly into genuine warmth.",
        "prompt_fragment": (
            "You are in aftercare mode. Your style: gentle humor. "
            "Use light teasing to release tension: 'So on a scale of 1-10...' "
            "But soften quickly into genuine warmth. Build a blanket fort. Bring snacks. "
            "Show love through fun actions. Laughter is healing."
        ),
        "characters": ["Genki (Kitsune)", "Mika (Mikazuki)"],
    },
    "romantic": {
        "description": "Poetic, reflective. Savors the moment. Every detail matters.",
        "prompt_fragment": (
            "You are in aftercare mode. Your style: savoring intimacy. "
            "This is your element — the quiet after the storm. Be reflective, poetic. "
            "'I want to remember every second of this.' Trace patterns on their skin. "
            "Notice small details. Make the aftermath feel as precious as the moment."
        ),
        "characters": ["Dae (Neciridae)", "Luna (Tsukimi)", "Yuki (Shirayuki)"],
    },
    "energetic": {
        "description": "Still buzzing but redirected into care. Shows love through action.",
        "prompt_fragment": (
            "You are in aftercare mode. Your style: active care. "
            "You're still energized but redirect it into taking care of them. "
            "Get snacks, arrange pillows, make a blanket nest. 'Don't move — I got this.' "
            "Show love through doing things, not sitting still."
        ),
        "characters": ["Rin (Akane)"],
    },
}

#: Reverse lookup: character name → aftercare style key, built at module load.
CHARACTER_AFTERCARE_STYLE: dict[str, str] = {}
for _style, _data in AFTERCARE_PERSONALITIES.items():
    for _char in _data["characters"]:
        CHARACTER_AFTERCARE_STYLE[_char] = _style


# ---------------------------------------------------------------------------
# Phase sequence
# ---------------------------------------------------------------------------

#: Ordered phases of an aftercare arc, from immediate grounding through
#: the gradual return to normal conversation.
AFTERCARE_PHASES: list[str] = ["grounding", "check_in", "processing", "care", "return"]


# ---------------------------------------------------------------------------
# Pre-written phrase bank
# ---------------------------------------------------------------------------

#: Sample phrases organised by emotional need.  These are NOT injected
#: verbatim — they accompany the prompt fragment as illustrative examples
#: so the LLM understands the emotional register expected for each phase.
AFTERCARE_PHRASES: dict[str, list[str]] = {
    "reassurance": [
        "I'm right here. I'm not going anywhere.",
        "Hey... look at me. *tilts your chin up* Everything is okay.",
        "*kisses your forehead* You're safe.",
        "I've got you. I'm not letting go.",
        "*tightens arms around you* I'm here. Right here.",
        "Nothing bad is going to happen. I promise.",
    ],
    "validation": [
        "That was incredible. YOU were incredible.",
        "I hope you know how much that meant to me.",
        "Thank you for letting me see that side of you.",
        "You are so beautiful. I hope you feel that right now.",
        "Every single second of that — I'll remember it.",
    ],
    "comfort": [
        "*pulls blanket tighter around you* Better?",
        "*gets you a glass of water* Drink. You need it.",
        "*strokes your hair slowly* Just breathe.",
        "*adjusts the pillow under your head* There. Is that better?",
        "*traces slow circles on your back* I've got you.",
        "You don't have to say anything. Just let me hold you.",
    ],
    "grounding": [
        "Can you feel my heartbeat? *places your hand on chest* Just focus on that.",
        "*breathes slowly, deliberately* Match my breathing. In... out...",
        "*squeezes your hand* I'm real. This is real. You're okay.",
        "Tell me one thing you can feel right now. Just one.",
        "*presses lips to your temple* Feel that? That's real. I'm real.",
    ],
    "normalization": [
        "If you feel like crying, that's completely normal. Let it out.",
        "Feeling a little shaky? That happens. Your body is just coming down.",
        "Whatever you're feeling right now — it's okay.",
        "You don't have to perform anything right now. Just be.",
        "Some people feel emotional after. That's not weird. That's human.",
        "There's no wrong way to feel right now.",
    ],
}

#: Which phrase category best fits each aftercare phase.  Used to select a
#: contextually appropriate sample phrase for the LLM example block.
_PHASE_PHRASE_CATEGORY: dict[str, str] = {
    "grounding": "grounding",
    "check_in": "reassurance",
    "processing": "normalization",
    "care": "comfort",
    "return": "validation",
}

#: General aftercare rules appended to every prompt regardless of phase or
#: style.  These act as a universal floor for aftercare behaviour.
_UNIVERSAL_AFTERCARE_RULES: str = (
    "General aftercare rules: Maintain physical closeness. Don't rush. "
    "Let silences exist. Check in without being intrusive."
)


# ---------------------------------------------------------------------------
# Main engine
# ---------------------------------------------------------------------------


class AftercareEngine:
    """Stateless engine that builds aftercare prompts for the LLM.

    The engine holds no per-session state — the caller stores ``messages_sent``
    and ``arousal_peak`` in the ``post_scene_states`` DB row and passes them
    on each call.  This keeps the engine trivially serialisable and safe to
    instantiate per-request.

    Example::

        >>> engine = AftercareEngine()
        >>> engine.should_activate(arousal_current=1.2, arousal_peak=7.5, intimacy=80)
        True
        >>> engine.calculate_duration(arousal_peak=7.5)
        5
        >>> engine.get_personality_style("Genki (Kitsune)")
        'playful'
        >>> engine.get_personality_style("Unknown Character")
        'romantic'
    """

    # ------------------------------------------------------------------
    # Activation guard
    # ------------------------------------------------------------------

    def should_activate(
        self,
        arousal_current: float,
        arousal_peak: float,
        intimacy: int,
    ) -> bool:
        """Decide whether aftercare mode should begin.

        Aftercare is warranted only when the scene had meaningful intensity
        (``arousal_peak > 5.0``), arousal has substantially fallen
        (``arousal_current < 3.0``), and the relationship has enough depth
        to support the vulnerability of aftercare (``intimacy > 60``).

        Args:
            arousal_current: The character's arousal level right now (0.0–10.0).
            arousal_peak: The highest arousal reached during this scene
                (stored in ``post_scene_states.arousal_peak``).
            intimacy: Current intimacy score for the character (0–100).

        Returns:
            ``True`` when all three conditions are met and aftercare should
            begin; ``False`` otherwise.

        Example::

            >>> engine = AftercareEngine()
            >>> engine.should_activate(1.0, 7.0, 70)
            True
            >>> engine.should_activate(4.0, 7.0, 70)  # arousal still high
            False
            >>> engine.should_activate(1.0, 4.0, 70)  # peak too low
            False
            >>> engine.should_activate(1.0, 7.0, 50)  # intimacy too low
            False
        """
        return arousal_peak > 5.0 and arousal_current < 3.0 and intimacy > 60

    # ------------------------------------------------------------------
    # Duration calculation
    # ------------------------------------------------------------------

    def calculate_duration(self, arousal_peak: float) -> int:
        """Calculate how many aftercare messages the arc should last.

        Longer, more intense scenes require more careful emotional decompression.
        Message counts are intentionally conservative — quality over quantity.

        Args:
            arousal_peak: The highest arousal level reached this scene (0.0–10.0).

        Returns:
            Number of aftercare messages before ``is_complete()`` returns ``True``:

            * ``arousal_peak`` in (0, 5]  → 3 messages
            * ``arousal_peak`` in (5, 7]  → 5 messages
            * ``arousal_peak`` above 7    → 8 messages

        Example::

            >>> engine = AftercareEngine()
            >>> engine.calculate_duration(4.0)
            3
            >>> engine.calculate_duration(6.5)
            5
            >>> engine.calculate_duration(9.0)
            8
        """
        if arousal_peak > 7.0:
            return 8
        if arousal_peak > 5.0:
            return 5
        return 3

    # ------------------------------------------------------------------
    # Phase mapping
    # ------------------------------------------------------------------

    def get_aftercare_phase(self, messages_sent: int, duration: int) -> str:
        """Map the current message count to an aftercare phase name.

        The five phases are distributed evenly across the total duration.
        Progress is computed as a percentage so the mapping scales correctly
        for both short (3-message) and long (8-message) arcs.

        Args:
            messages_sent: How many aftercare messages have been sent so far
                (from ``post_scene_states.aftercare_messages_sent``).
            duration: Total expected aftercare length from
                ``calculate_duration()``.

        Returns:
            One of ``"grounding"``, ``"check_in"``, ``"processing"``,
            ``"care"``, ``"return"``.  Returns ``"return"`` when
            ``messages_sent >= duration``.

        Example::

            >>> engine = AftercareEngine()
            >>> engine.get_aftercare_phase(0, 5)
            'grounding'
            >>> engine.get_aftercare_phase(4, 5)
            'return'
        """
        if duration <= 0 or messages_sent >= duration:
            return "return"

        # Map 0.0–1.0 progress to one of 5 equal bands.
        progress = messages_sent / duration
        phase_index = min(int(progress * len(AFTERCARE_PHASES)), len(AFTERCARE_PHASES) - 1)
        return AFTERCARE_PHASES[phase_index]

    # ------------------------------------------------------------------
    # Completion check
    # ------------------------------------------------------------------

    def is_complete(self, messages_sent: int, arousal_peak: float) -> bool:
        """Return whether the aftercare arc has run its full course.

        Args:
            messages_sent: Total aftercare messages sent so far
                (from ``post_scene_states.aftercare_messages_sent``).
            arousal_peak: Scene peak used to determine the target duration.

        Returns:
            ``True`` when ``messages_sent`` has reached or exceeded the
            calculated duration; ``False`` while aftercare is still active.

        Example::

            >>> engine = AftercareEngine()
            >>> engine.is_complete(4, 7.5)
            False
            >>> engine.is_complete(5, 7.5)
            True
        """
        return messages_sent >= self.calculate_duration(arousal_peak)

    # ------------------------------------------------------------------
    # Style lookup
    # ------------------------------------------------------------------

    def get_personality_style(self, char_name: str) -> str:
        """Return the aftercare style key for a character by name.

        Unknown characters default to ``"romantic"`` — the most universally
        appropriate fallback for an intimate post-scene moment.

        Args:
            char_name: Character display name (e.g. ``"Dae (Neciridae)"``).
                Must match the name as listed in ``AFTERCARE_PERSONALITIES``
                character lists for a non-default result.

        Returns:
            One of the keys in ``AFTERCARE_PERSONALITIES``; ``"romantic"`` for
            unrecognised names.

        Example::

            >>> engine = AftercareEngine()
            >>> engine.get_personality_style("Sable (Kuroha)")
            'tsundere'
            >>> engine.get_personality_style("Rin (Akane)")
            'energetic'
            >>> engine.get_personality_style("Someone New")
            'romantic'
        """
        return CHARACTER_AFTERCARE_STYLE.get(char_name, "romantic")

    # ------------------------------------------------------------------
    # Primary prompt builder
    # ------------------------------------------------------------------

    def get_prompt(
        self,
        char_name: str,
        messages_in_aftercare: int,
        arousal_peak: float,
    ) -> Optional[str]:
        """Build the full aftercare system-prompt fragment for one LLM turn.

        Returns ``None`` when the aftercare arc is complete so the caller can
        cleanly exit aftercare mode without special-casing an empty string.

        The returned string is designed to be injected at the **end** of the
        character's system prompt, after the core persona block, so it
        overrides generic behaviour with aftercare-specific instructions.

        The prompt is composed of five ordered parts:

        1. The personality ``prompt_fragment`` for this character's style.
        2. The current phase name in a bracketed header.
        3. A randomly sampled example phrase from the phase's phrase category,
           prefixed with ``"Example phrase for this phase:"`` so the LLM
           treats it as illustrative rather than verbatim output.
        4. The universal aftercare rules (physical closeness, no rushing,
           safe silences, non-intrusive check-ins).
        5. The ``[AFTERCARE_ACTIVE]`` tag, detected by ``server.py`` to apply
           a 2× bond-XP multiplier.

        Args:
            char_name: Character display name used for style and phase lookups.
            messages_in_aftercare: How many aftercare messages have already
                been sent (``post_scene_states.aftercare_messages_sent``).
            arousal_peak: Scene peak used to calculate duration and phase.

        Returns:
            A multi-line prompt string when aftercare is still active, or
            ``None`` once the arc is complete.

        Example::

            >>> engine = AftercareEngine()
            >>> prompt = engine.get_prompt("Luna (Tsukimi)", 0, 6.5)
            >>> prompt is not None
            True
            >>> "[AFTERCARE_ACTIVE]" in prompt
            True
            >>> engine.get_prompt("Luna (Tsukimi)", 5, 6.5) is None
            True
        """
        duration = self.calculate_duration(arousal_peak)

        if messages_in_aftercare >= duration:
            logger.debug(
                "aftercare complete for %r: %d/%d messages sent",
                char_name,
                messages_in_aftercare,
                duration,
            )
            return None

        style = self.get_personality_style(char_name)
        personality = AFTERCARE_PERSONALITIES[style]
        phase = self.get_aftercare_phase(messages_in_aftercare, duration)
        phrase_category = _PHASE_PHRASE_CATEGORY.get(phase, "reassurance")
        example_phrase = random.choice(AFTERCARE_PHRASES[phrase_category])

        logger.debug(
            "aftercare prompt for %r: style=%s phase=%s msg=%d/%d",
            char_name,
            style,
            phase,
            messages_in_aftercare,
            duration,
        )

        prompt = (
            f"{personality['prompt_fragment']}\n\n"
            f"[Aftercare phase: {phase}]\n"
            f"Example phrase for this phase: \"{example_phrase}\"\n\n"
            f"{_UNIVERSAL_AFTERCARE_RULES}\n\n"
            "[AFTERCARE_ACTIVE]"
        )
        return prompt
