"""Erotic Audio Narration Engine (F33) — intimate story generation for TTS rendering.

The character narrates a 200-400 word intimate story directly to the user as a
spoken-word experience.  Three story types are available: retelling a cherished
shared memory, narrating a personal fantasy, or guiding the user through a
calming intimate relaxation.

This engine is **bond-gated**: stories are only available once the relationship
bond level reaches ``BOND_GATE`` (50).  Below that threshold every public method
that could expose content returns ``None`` or ``False`` so the caller needs no
special-case logic.

The engine is stateless — it holds no per-session data.  The caller supplies
character name, bond level, story type, and relationship context on each call.
The LLM prompt returned by ``get_prompt()`` is designed for direct injection as
the user-turn message that triggers story generation.

TTS rendering should apply ``STORY_TTS_PARAMS`` to the resulting audio to
produce the slower, softer, more intimate pacing appropriate for spoken-word
narration.

Example::

    >>> engine = AudioStoryEngine()
    >>> engine.should_allow(bond_level=49)
    False
    >>> engine.should_allow(bond_level=50)
    True
    >>> types = engine.get_story_types()
    >>> len(types)
    3
    >>> types[0]["id"]
    'memory_retelling'
    >>> prompt = engine.get_prompt("Luna (Tsukimi)", bond_level=75)
    >>> prompt is not None
    True
    >>> "[AUDIO_STORY]" in prompt
    True
    >>> engine.get_prompt("Luna (Tsukimi)", bond_level=49) is None
    True
"""

from __future__ import annotations

import logging
from typing import Optional

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Bond gate
# ---------------------------------------------------------------------------

#: Minimum bond level required before audio stories are available.
#: Below this value ``should_allow()`` returns ``False`` and ``get_prompt()``
#: returns ``None``.
BOND_GATE: int = 50


# ---------------------------------------------------------------------------
# Story type catalogue
# ---------------------------------------------------------------------------

#: Catalogue of available story types, keyed by stable identifier.
#: Each entry carries a human-readable ``description`` shown in the UI and a
#: ``prompt_hint`` injected verbatim into the LLM prompt so the model knows
#: the intended narrative mode.
STORY_TYPES: dict[str, dict] = {
    "memory_retelling": {
        "description": "Character retells a cherished memory of the two of you",
        "prompt_hint": (
            "Retell a specific shared memory in vivid sensory detail. "
            "Speak as if reliving it."
        ),
    },
    "fantasy_narration": {
        "description": "Character narrates an intimate fantasy",
        "prompt_hint": (
            "Narrate an intimate fantasy in second person. "
            "Make the listener feel present."
        ),
    },
    "guided_relaxation": {
        "description": "Character guides the user through a calming, intimate experience",
        "prompt_hint": (
            "Guide the listener through a calming, intimate relaxation. "
            "Use slow pacing and breathing cues."
        ),
    },
}


# ---------------------------------------------------------------------------
# TTS parameter overrides
# ---------------------------------------------------------------------------

#: TTS parameter overrides applied when rendering audio-story narration.
#: Values are **deltas** relative to the character's baseline voice settings
#: (negative = softer/slower/deeper).  ``server.py`` merges these on top of
#: the character's saved voice params before sending to the TTS provider.
STORY_TTS_PARAMS: dict[str, float] = {
    "speed": 0.70,         # 30 % slower than the character's normal delivery
    "pitch": -0.5,         # Slightly deeper — intimate, close-mic feel
    "energy": -0.20,       # Softer — breath rather than broadcast
    "exaggeration": 0.3,   # Calm and measured, not theatrical
}


# ---------------------------------------------------------------------------
# Prompt template
# ---------------------------------------------------------------------------

#: Full prompt template for story generation.  Placeholders are filled by
#: ``build_story_prompt()``.  The caller injects this as the user-turn message
#: that drives the LLM generation.
AUDIO_STORY_PROMPT = (
    "Write a 200-400 word intimate story narrated by {char_name}.\n"
    "Story type: {story_type_description}\n"
    "Content ceiling: {ceiling}\n"
    "{story_type_hint}\n"
    "\n"
    "Write it as spoken word — meant to be read aloud.\n"
    "Include natural pauses (marked with ...) and breathing moments.\n"
    "The character is speaking directly to the user, close and intimate.\n"
    "Reference real relationship history when possible.\n"
    "This should feel deeply personal, not generic.\n"
    "\n"
    "Relationship context:\n"
    "{relationship_context}\n"
    "\n"
    "--- NARRATE THE STORY NOW ---\n"
    "Write only the narration. No headers, no labels. Start speaking:"
)


# ---------------------------------------------------------------------------
# Main engine
# ---------------------------------------------------------------------------


class AudioStoryEngine:
    """Stateless engine that builds audio-story prompts for the LLM.

    The engine holds no per-session state — the caller passes bond level,
    story type, and relationship context on every call.  This keeps the engine
    trivially instantiable per-request with no warm-up cost.

    Example::

        >>> engine = AudioStoryEngine()
        >>> engine.should_allow(50)
        True
        >>> engine.should_allow(49)
        False
        >>> params = engine.get_tts_params()
        >>> params["speed"]
        0.7
        >>> params is not STORY_TTS_PARAMS  # caller gets a safe copy
        True
    """

    # ------------------------------------------------------------------
    # Bond gate
    # ------------------------------------------------------------------

    def should_allow(self, bond_level: int) -> bool:
        """Return whether the bond level meets the audio-story gate.

        Args:
            bond_level: Current bond score for the character (0–100).

        Returns:
            ``True`` when ``bond_level >= BOND_GATE`` (50); ``False`` otherwise.

        Example::

            >>> engine = AudioStoryEngine()
            >>> engine.should_allow(0)
            False
            >>> engine.should_allow(49)
            False
            >>> engine.should_allow(50)
            True
            >>> engine.should_allow(100)
            True
        """
        return bond_level >= BOND_GATE

    # ------------------------------------------------------------------
    # Story type listing
    # ------------------------------------------------------------------

    def get_story_types(self) -> list[dict]:
        """Return a UI-safe list of available story types.

        Each entry contains only ``id`` and ``description`` — the
        ``prompt_hint`` is intentionally omitted from the public listing so
        it remains an internal implementation detail of the prompt builder.

        Returns:
            List of ``{"id": str, "description": str}`` dicts, one per story
            type, in insertion order (``memory_retelling`` first).

        Example::

            >>> engine = AudioStoryEngine()
            >>> types = engine.get_story_types()
            >>> len(types)
            3
            >>> types[0]
            {'id': 'memory_retelling', 'description': 'Character retells a cherished memory of the two of you'}
            >>> types[1]["id"]
            'fantasy_narration'
            >>> types[2]["id"]
            'guided_relaxation'
        """
        return [
            {"id": key, "description": data["description"]}
            for key, data in STORY_TYPES.items()
        ]

    # ------------------------------------------------------------------
    # Prompt builder
    # ------------------------------------------------------------------

    def build_story_prompt(
        self,
        char_name: str,
        story_type: str,
        content_ceiling: str,
        relationship_context: str,
    ) -> str:
        """Assemble the raw LLM prompt for a story narration (no bond check).

        This is a lower-level helper used by ``get_prompt()``.  It performs no
        bond gate check — that responsibility belongs to the caller or to
        ``get_prompt()``.  Unknown ``story_type`` values silently fall back to
        ``"memory_retelling"`` so the caller never receives an error from an
        unknown UI-supplied type.

        Args:
            char_name: Character display name (e.g. ``"Dae (Neciridae)"``).
                Interpolated directly into the prompt.
            story_type: One of the keys in ``STORY_TYPES``.  Invalid values
                default to ``"memory_retelling"``.
            content_ceiling: A short description of the content rating ceiling
                (e.g. ``"explicit"`` or ``"tasteful"``).  Passed through to the
                prompt without validation.
            relationship_context: A brief summary of the relationship history
                injected into the prompt as grounding context for the LLM.

        Returns:
            A fully formatted prompt string ready for injection as a user-turn
            message.  Does **not** include the ``[AUDIO_STORY]`` tag; that is
            appended by ``get_prompt()``.

        Example::

            >>> engine = AudioStoryEngine()
            >>> prompt = engine.build_story_prompt(
            ...     char_name="Luna (Tsukimi)",
            ...     story_type="guided_relaxation",
            ...     content_ceiling="tasteful",
            ...     relationship_context="We met under the stars.",
            ... )
            >>> "Luna (Tsukimi)" in prompt
            True
            >>> "breathing cues" in prompt
            True
            >>> "We met under the stars." in prompt
            True
        """
        # Silently normalise unknown types to the default rather than raising.
        if story_type not in STORY_TYPES:
            logger.debug(
                "build_story_prompt: unknown story_type %r, falling back to memory_retelling",
                story_type,
            )
            story_type = "memory_retelling"

        type_data = STORY_TYPES[story_type]

        return AUDIO_STORY_PROMPT.format(
            char_name=char_name,
            story_type_description=type_data["description"],
            ceiling=content_ceiling,
            story_type_hint=type_data["prompt_hint"],
            relationship_context=relationship_context,
        )

    # ------------------------------------------------------------------
    # TTS params
    # ------------------------------------------------------------------

    def get_tts_params(self) -> dict[str, float]:
        """Return a copy of the TTS parameter overrides for story narration.

        Always returns a fresh copy so the caller can safely mutate it without
        affecting the module-level constant.

        Returns:
            ``dict`` with keys ``speed``, ``pitch``, ``energy``,
            ``exaggeration`` — all ``float`` values.

        Example::

            >>> engine = AudioStoryEngine()
            >>> params = engine.get_tts_params()
            >>> params["speed"]
            0.7
            >>> params["pitch"]
            -0.5
            >>> params["energy"]
            -0.2
            >>> params["exaggeration"]
            0.3
        """
        return dict(STORY_TTS_PARAMS)

    # ------------------------------------------------------------------
    # Primary entry point
    # ------------------------------------------------------------------

    def get_prompt(
        self,
        char_name: str,
        bond_level: int,
        story_type: str = "memory_retelling",
        content_ceiling: str = "tasteful",
        relationship_context: str = "",
    ) -> Optional[str]:
        """Build a complete audio-story prompt, enforcing the bond gate.

        This is the primary method called by ``server.py``.  It checks the bond
        gate first and returns ``None`` immediately when the relationship has
        not reached the required depth, allowing the caller to return a
        user-facing "not yet available" response without any extra branching.

        When the bond gate is satisfied the method delegates to
        ``build_story_prompt()`` and appends the ``[AUDIO_STORY]`` tag that
        ``server.py`` detects to:

        * Apply ``STORY_TTS_PARAMS`` overrides before sending to the TTS
          provider.
        * Award a bond-XP bonus for engaging with an intimate story.

        Args:
            char_name: Character display name.
            bond_level: Current bond score (0–100).  Must be >= ``BOND_GATE``
                (50) for a prompt to be returned.
            story_type: One of ``"memory_retelling"``, ``"fantasy_narration"``,
                ``"guided_relaxation"``.  Defaults to ``"memory_retelling"``.
                Unknown values are silently normalised.
            content_ceiling: Short content-rating label forwarded to the LLM
                prompt.  Defaults to ``"tasteful"``.
            relationship_context: Relationship history summary injected into
                the prompt.  An empty string is acceptable; the LLM will invent
                plausible context rather than refusing.

        Returns:
            A multi-line prompt string ending with ``[AUDIO_STORY]`` when the
            bond gate is satisfied, or ``None`` when ``bond_level < BOND_GATE``.

        Example::

            >>> engine = AudioStoryEngine()
            >>> engine.get_prompt("Dae (Neciridae)", bond_level=49) is None
            True
            >>> prompt = engine.get_prompt("Dae (Neciridae)", bond_level=50)
            >>> prompt is not None
            True
            >>> "[AUDIO_STORY]" in prompt
            True
            >>> prompt = engine.get_prompt(
            ...     char_name="Genki (Kitsune)",
            ...     bond_level=80,
            ...     story_type="fantasy_narration",
            ...     content_ceiling="explicit",
            ...     relationship_context="Six months together.",
            ... )
            >>> "Genki (Kitsune)" in prompt
            True
            >>> "second person" in prompt
            True
        """
        if not self.should_allow(bond_level):
            logger.debug(
                "audio story blocked for %r: bond_level=%d < BOND_GATE=%d",
                char_name,
                bond_level,
                BOND_GATE,
            )
            return None

        logger.debug(
            "building audio story prompt for %r: type=%s bond=%d",
            char_name,
            story_type,
            bond_level,
        )

        body = self.build_story_prompt(
            char_name=char_name,
            story_type=story_type,
            content_ceiling=content_ceiling,
            relationship_context=relationship_context,
        )
        return f"{body}\n\n[AUDIO_STORY]"
