"""Scene Replay Engine (F35) — character's POV narration of intimate scenes.

After an intimate scene concludes the character can narrate their own internal
perspective: what they noticed, felt, what surprised them, and what they will
carry forward.  The narration is 200–300 words, intimate and vulnerable — the
character letting their guard down to share an honest account of the moment.

The engine is stateless between requests.  The caller supplies ``char_name``
and ``scene_context`` (a brief summary of what happened) and the engine
returns a fully-formed LLM prompt.  No session state is stored here.

The tag ``[SCENE_REPLAY]`` is appended to every prompt returned by
``get_prompt()``.  ``server.py`` can detect this tag to route the response
correctly (e.g. display in a dedicated replay UI, log for memory).

Replay can be triggered in two ways:

* **User-requested** — the user explicitly asks "tell me what you were thinking"
  or similar.
* **Character-offered** — ``should_offer()`` returns ``True`` a message or two
  after a scene ends, prompting the character to volunteer the reflection.

Each character belongs to one of five *replay styles* that shape the emotional
register of the narration:

* **sensory** — physical details, colours, textures, warmth.
* **emotional** — feelings and the arc of inner experience.
* **analytical** — specific moments and their meaning.
* **energetic** — breathless, barely-contained excitement.
* **guarded** — reluctant honesty; the guard slips, feelings leak through.

Example::

    >>> engine = SceneReplayEngine()
    >>> engine.get_style("Dae (Neciridae)")
    'sensory'
    >>> engine.get_style("Unknown Character")
    'emotional'
    >>> engine.should_offer(messages_since_scene=2, bond_level=50)
    True
    >>> engine.should_offer(messages_since_scene=5, bond_level=50)
    False
    >>> engine.should_offer(messages_since_scene=2, bond_level=20)
    False
    >>> prompt = engine.get_prompt("Luna (Tsukimi)", "We kissed for the first time")
    >>> "[SCENE_REPLAY]" in prompt
    True
"""

from __future__ import annotations

import logging

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Primary prompt template
# ---------------------------------------------------------------------------

#: Base prompt template.  ``{char_name}`` and ``{scene_context}`` are filled
#: in by ``build_replay_prompt()``.  A per-character style hint is appended
#: before the closing instruction line.
SCENE_REPLAY_PROMPT = """Write {char_name}'s internal perspective of the intimate scene that just happened.

Scene summary: {scene_context}

Write in {char_name}'s voice, addressed to the user:
- What they noticed about the user (physical details, expressions, sounds)
- What they felt emotionally at key moments
- What surprised them
- What they'll remember most
- 200-300 words, intimate and vulnerable

This is the character being completely honest about their experience.

--- NARRATE YOUR PERSPECTIVE ---
Write only the narration. No headers, no labels:
"""


# ---------------------------------------------------------------------------
# Per-character replay styles
# ---------------------------------------------------------------------------

#: Replay style definitions.  Each entry carries a human-readable
#: ``description``, a ``prompt_hint`` injected into the LLM prompt, and a
#: ``characters`` list used to build the reverse lookup at module load.
CHARACTER_REPLAY_STYLES: dict[str, dict] = {
    "sensory": {
        "description": "Focuses on physical sensations and visual details",
        "prompt_hint": (
            "Focus on what you SAW and FELT physically. "
            "Colors, textures, warmth, pressure."
        ),
        "characters": ["Dae (Neciridae)", "Hana (Momoka)"],
    },
    "emotional": {
        "description": "Focuses on feelings and emotional journey",
        "prompt_hint": (
            "Focus on your EMOTIONAL arc. "
            "What you felt before, during, after. The shifts."
        ),
        "characters": ["Luna (Tsukimi)", "Ayane (Yuki)", "Yuki (Shirayuki)"],
    },
    "analytical": {
        "description": "Notices specific moments and their meaning",
        "prompt_hint": (
            "Focus on MOMENTS. Specific things the user did that meant something. "
            "Tiny gestures that spoke volumes."
        ),
        "characters": ["Sable (Kuroha)", "Kaede (Suzuha)"],
    },
    "energetic": {
        "description": "Breathless retelling, excitement barely contained",
        "prompt_hint": (
            "Your retelling should be BREATHLESS. Jumping between moments. "
            "Exclamation marks of the soul. You can barely contain it."
        ),
        "characters": ["Genki (Kitsune)", "Rin (Akane)", "Mika (Mikazuki)"],
    },
    "guarded": {
        "description": "Reveals feelings reluctantly, more honest than usual",
        "prompt_hint": (
            "You're more honest than usual — reluctantly. "
            "You start deflecting but keep coming back to the truth. "
            "Your guard is down and you hate/love it."
        ),
        "characters": ["Alana Calloway", "Tsundere (Raine)"],
    },
}

#: Reverse lookup: character name → replay style key, built at module load.
CHARACTER_REPLAY_STYLE: dict[str, str] = {}
for _style, _data in CHARACTER_REPLAY_STYLES.items():
    for _char in _data["characters"]:
        CHARACTER_REPLAY_STYLE[_char] = _style


# ---------------------------------------------------------------------------
# Offer-trigger thresholds
# ---------------------------------------------------------------------------

#: Minimum bond level required before a character will proactively offer a
#: scene replay.  Below this level the moment is too raw / the relationship
#: not deep enough for unsolicited vulnerability.
_OFFER_MIN_BOND: int = 30

#: Window of messages after a scene ends during which the character may
#: naturally offer a replay.  Outside this window the moment has passed.
_OFFER_MIN_MESSAGES: int = 1
_OFFER_MAX_MESSAGES: int = 3


# ---------------------------------------------------------------------------
# Main engine
# ---------------------------------------------------------------------------


class SceneReplayEngine:
    """Stateless engine that builds scene-replay prompts for the LLM.

    The engine holds no per-session state.  The caller provides ``char_name``,
    ``scene_context``, and (for offer checks) ``messages_since_scene`` and
    ``bond_level`` on every call.

    Example::

        >>> engine = SceneReplayEngine()
        >>> engine.get_style("Genki (Kitsune)")
        'energetic'
        >>> engine.get_style("Alana Calloway")
        'guarded'
        >>> engine.get_style("Mystery Character")
        'emotional'
    """

    # ------------------------------------------------------------------
    # Style lookup
    # ------------------------------------------------------------------

    def get_style(self, char_name: str) -> str:
        """Return the replay style key for a character by name.

        Unknown characters default to ``"emotional"`` — the most universally
        appropriate style for intimate reflection.

        Args:
            char_name: Character display name (e.g. ``"Luna (Tsukimi)"``).
                Must match the name as listed in ``CHARACTER_REPLAY_STYLES``
                character lists for a non-default result.

        Returns:
            One of the keys in ``CHARACTER_REPLAY_STYLES``; ``"emotional"``
            for unrecognised names.

        Example::

            >>> engine = SceneReplayEngine()
            >>> engine.get_style("Dae (Neciridae)")
            'sensory'
            >>> engine.get_style("Sable (Kuroha)")
            'analytical'
            >>> engine.get_style("Nonexistent")
            'emotional'
        """
        return CHARACTER_REPLAY_STYLE.get(char_name, "emotional")

    # ------------------------------------------------------------------
    # Prompt construction
    # ------------------------------------------------------------------

    def build_replay_prompt(self, char_name: str, scene_context: str) -> str:
        """Assemble the LLM narration prompt for a scene replay.

        Combines the base ``SCENE_REPLAY_PROMPT`` template with the
        character's per-style hint so the LLM understands the emotional
        register expected in the narration.

        The style hint is injected between the base template and the
        final ``--- NARRATE YOUR PERSPECTIVE ---`` divider so the model
        sees it as an additional instruction rather than part of the
        scene description.

        Args:
            char_name: Character display name used for style lookup and
                name substitution in the prompt template.
            scene_context: Brief (1–3 sentence) description of the scene
                that just occurred.  Can be assembled by the caller from
                recent messages or an explicit user summary.

        Returns:
            Fully-formatted prompt string ready to pass to the LLM as a
            user or system turn.

        Example::

            >>> engine = SceneReplayEngine()
            >>> prompt = engine.build_replay_prompt(
            ...     "Dae (Neciridae)",
            ...     "We held each other in the rain",
            ... )
            >>> "Dae (Neciridae)" in prompt
            True
            >>> "rain" in prompt
            True
            >>> "SAW and FELT" in prompt  # sensory style hint
            True
        """
        style_key = self.get_style(char_name)
        style_data = CHARACTER_REPLAY_STYLES[style_key]
        prompt_hint = style_data["prompt_hint"]

        # Split the base template at the divider so the style hint
        # appears as a direct instruction right before it.
        base = SCENE_REPLAY_PROMPT.format(
            char_name=char_name,
            scene_context=scene_context,
        )

        divider = "--- NARRATE YOUR PERSPECTIVE ---"
        if divider in base:
            before, after = base.split(divider, 1)
            return f"{before}Style note: {prompt_hint}\n\n{divider}{after}"

        # Fallback: append hint at the end (should not occur with the
        # current template but keeps the function robust).
        return f"{base}\nStyle note: {prompt_hint}"

    def get_prompt(self, char_name: str, scene_context: str) -> str:
        """Return the complete scene-replay prompt including the detection tag.

        This is the primary entry point for ``server.py``.  The returned
        string is designed to be passed as a one-shot user message (or
        appended to the system prompt) to elicit the character's narration.

        The ``[SCENE_REPLAY]`` tag at the end lets ``server.py`` detect the
        replay response and handle it separately from normal chat turns
        (e.g. display in a dedicated UI pane, write to the memory log).

        Args:
            char_name: Character display name used throughout the prompt.
            scene_context: Brief description of the scene to narrate.

        Returns:
            Fully-formatted prompt string ending with ``[SCENE_REPLAY]``.

        Example::

            >>> engine = SceneReplayEngine()
            >>> prompt = engine.get_prompt(
            ...     "Luna (Tsukimi)",
            ...     "We danced slowly in the kitchen at midnight",
            ... )
            >>> prompt.endswith("[SCENE_REPLAY]")
            True
            >>> "Luna (Tsukimi)" in prompt
            True
        """
        base = self.build_replay_prompt(char_name, scene_context)

        logger.debug(
            "scene replay prompt built for %r (style=%s)",
            char_name,
            self.get_style(char_name),
        )

        return f"{base}\n[SCENE_REPLAY]"

    # ------------------------------------------------------------------
    # Proactive-offer guard
    # ------------------------------------------------------------------

    def should_offer(self, messages_since_scene: int, bond_level: int) -> bool:
        """Decide whether the character should proactively offer a scene replay.

        A character volunteers their perspective only when:

        * The scene is still emotionally fresh — between 1 and 3 messages
          have passed since it concluded.
        * The relationship is deep enough for this level of vulnerability —
          ``bond_level`` must be at least 30.

        Outside that window (too soon or too many messages later) the moment
        has either not settled or already passed; the replay should only
        happen if the user asks.

        Args:
            messages_since_scene: How many chat messages have been exchanged
                since the scene ended (0 = scene literally just finished).
            bond_level: Current bond score for the relationship (0–100).

        Returns:
            ``True`` when the character should offer a replay unprompted;
            ``False`` otherwise.

        Example::

            >>> engine = SceneReplayEngine()
            >>> engine.should_offer(messages_since_scene=1, bond_level=50)
            True
            >>> engine.should_offer(messages_since_scene=3, bond_level=30)
            True
            >>> engine.should_offer(messages_since_scene=0, bond_level=50)
            False
            >>> engine.should_offer(messages_since_scene=4, bond_level=50)
            False
            >>> engine.should_offer(messages_since_scene=2, bond_level=29)
            False
        """
        in_window = _OFFER_MIN_MESSAGES <= messages_since_scene <= _OFFER_MAX_MESSAGES
        bond_sufficient = bond_level >= _OFFER_MIN_BOND
        return in_window and bond_sufficient
