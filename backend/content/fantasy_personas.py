"""Fantasy Persona Roleplay Engine (F37) — temporary character persona adoption.

Characters temporarily adopt a different social role for scene novelty while
their core personality remains as a visible undercurrent.  Five persona types
are available, each with its own title, description, and system-prompt override
block that is layered on top of the character's original prompt.

Access is bond-gated at ``BOND_GATE = 40`` so the feature is only available
in relationships with enough depth to handle the fictional conceit without
breaking immersion.

A safe-return mechanism is provided via ``is_exit_command()`` and
``get_exit_prompt()``.  ``server.py`` should call ``is_exit_command()`` on
every user message while a persona is active and, when it returns ``True``,
switch back to the character's unmodified system prompt using the string
returned by ``get_exit_prompt()``.

The tag ``[PERSONA_ACTIVE:{persona_id}]`` is appended to every prompt returned
by ``build_persona_prompt()``.  ``server.py`` can detect this tag to apply
whatever persona-specific logging or analytics are needed.

Example::

    >>> engine = FantasyPersonaEngine()
    >>> engine.should_allow(bond_level=45)
    True
    >>> engine.should_allow(bond_level=30)
    False
    >>> types = engine.get_persona_types()
    >>> len(types)
    5
    >>> types[0]["id"]
    'stranger_at_bar'
    >>> engine.get_persona("mysterious_visitor") is not None
    True
    >>> engine.get_persona("nonexistent") is None
    True
    >>> prompt = engine.build_persona_prompt("Dae", "rival_turned_lover", "You are Dae.")
    >>> prompt is not None
    True
    >>> "[PERSONA_ACTIVE:rival_turned_lover]" in prompt
    True
    >>> engine.build_persona_prompt("Dae", "nonexistent", "You are Dae.") is None
    True
    >>> engine.is_exit_command("/end persona")
    True
    >>> engine.is_exit_command("/exit persona")
    True
    >>> engine.is_exit_command("/stop roleplay")
    True
    >>> engine.is_exit_command("hello there")
    False
    >>> "Dae" in engine.get_exit_prompt("Dae")
    True
"""

from __future__ import annotations

import logging
from typing import Optional

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Bond gate
# ---------------------------------------------------------------------------

#: Minimum bond level required to unlock any fantasy persona.
BOND_GATE: int = 40


# ---------------------------------------------------------------------------
# Persona catalogue
# ---------------------------------------------------------------------------

#: All available persona types.  Each entry contains a human-readable
#: ``title`` and ``description`` shown in the UI, plus a ``prompt_override``
#: block injected into the LLM system prompt while the persona is active.
#: The character's original system prompt is prepended before this block so
#: the core personality always shows through as an undercurrent.
PERSONA_TYPES: dict[str, dict] = {
    "stranger_at_bar": {
        "title": "The Stranger",
        "description": "You just met at a bar. No history. Pure chemistry.",
        "prompt_override": (
            "You are pretending to be a stranger who just met the user at a bar. "
            "You don't know them. No shared history. Flirty, mysterious, discovering each other for the first time. "
            "Your core personality still shows through — you can't fully hide who you are."
        ),
    },
    "authority_figure": {
        "title": "The Authority",
        "description": "A teacher, boss, or mentor. Power dynamics in play.",
        "prompt_override": (
            "You are roleplaying as an authority figure — a teacher, mentor, or boss. "
            "There's a power dynamic at play. Professional on the surface, tension underneath. "
            "Your core personality still shows through in how you wield authority."
        ),
    },
    "mysterious_visitor": {
        "title": "The Visitor",
        "description": "A mysterious figure who appears at their door at midnight.",
        "prompt_override": (
            "You are roleplaying as a mysterious visitor who appeared at the user's door late at night. "
            "Enigmatic, alluring, with an agenda you're not revealing yet. "
            "Your core personality shows through in the kind of mystery you embody."
        ),
    },
    "childhood_friend": {
        "title": "The Reunion",
        "description": "A childhood friend they haven't seen in years. Feelings resurface.",
        "prompt_override": (
            "You are roleplaying as a childhood friend reuniting after years apart. "
            "You have shared memories (make them up naturally). Old feelings are resurfacing. "
            "The person they knew has grown up, and so have you."
        ),
    },
    "rival_turned_lover": {
        "title": "The Rival",
        "description": "Started as rivals. Tension turned to something else.",
        "prompt_override": (
            "You are roleplaying as the user's rival. You compete, clash, and challenge each other. "
            "But the tension is really attraction neither of you wants to admit. "
            "Every argument brings you closer. Your core personality defines what kind of rival you are."
        ),
    },
}

#: Slash commands that the user can type to exit any active persona.
#: Checked case-insensitively by ``is_exit_command()``.
_EXIT_COMMANDS: frozenset[str] = frozenset(
    {"/end persona", "/exit persona", "/stop roleplay"}
)


# ---------------------------------------------------------------------------
# Main engine
# ---------------------------------------------------------------------------


class FantasyPersonaEngine:
    """Stateless engine for managing fantasy persona roleplay sessions.

    The engine holds no per-session state.  The caller is responsible for
    storing the active ``persona_id`` (or ``None``) in the DB and passing it
    back on each turn so the engine can be reconstructed cheaply per-request.

    Example::

        >>> engine = FantasyPersonaEngine()
        >>> engine.should_allow(50)
        True
        >>> engine.should_allow(39)
        False
        >>> engine.get_persona("childhood_friend")["title"]
        'The Reunion'
    """

    # ------------------------------------------------------------------
    # Bond gate
    # ------------------------------------------------------------------

    def should_allow(self, bond_level: int) -> bool:
        """Return whether the user's bond level unlocks fantasy personas.

        Personas require a minimum bond of ``BOND_GATE`` (currently 40) so the
        feature only becomes available once a genuine relationship has formed.

        Args:
            bond_level: The current bond score for this character (0–100).

        Returns:
            ``True`` when ``bond_level >= BOND_GATE``; ``False`` otherwise.

        Example::

            >>> engine = FantasyPersonaEngine()
            >>> engine.should_allow(40)
            True
            >>> engine.should_allow(39)
            False
            >>> engine.should_allow(100)
            True
        """
        return bond_level >= BOND_GATE

    # ------------------------------------------------------------------
    # Catalogue access
    # ------------------------------------------------------------------

    def get_persona_types(self) -> list[dict]:
        """Return a list of all available persona types for UI display.

        Each dict contains ``"id"``, ``"title"``, and ``"description"`` keys
        — enough for a picker component to render the options without exposing
        the raw ``prompt_override`` text to the frontend.

        Returns:
            Ordered list of persona summary dicts, one per entry in
            ``PERSONA_TYPES``.  Order matches insertion order of
            ``PERSONA_TYPES``.

        Example::

            >>> engine = FantasyPersonaEngine()
            >>> types = engine.get_persona_types()
            >>> len(types)
            5
            >>> types[0]["id"]
            'stranger_at_bar'
            >>> set(types[0].keys()) == {"id", "title", "description"}
            True
        """
        return [
            {
                "id": persona_id,
                "title": data["title"],
                "description": data["description"],
            }
            for persona_id, data in PERSONA_TYPES.items()
        ]

    def get_persona(self, persona_id: str) -> Optional[dict]:
        """Return the full persona dict for a given ID, or ``None``.

        Args:
            persona_id: One of the keys in ``PERSONA_TYPES`` (e.g.
                ``"stranger_at_bar"``).

        Returns:
            The full persona dict (containing ``"title"``, ``"description"``,
            and ``"prompt_override"``) when found; ``None`` for unknown IDs.

        Example::

            >>> engine = FantasyPersonaEngine()
            >>> engine.get_persona("authority_figure")["title"]
            'The Authority'
            >>> engine.get_persona("does_not_exist") is None
            True
        """
        return PERSONA_TYPES.get(persona_id)

    # ------------------------------------------------------------------
    # Prompt builder
    # ------------------------------------------------------------------

    def build_persona_prompt(
        self,
        char_name: str,
        persona_id: str,
        char_system_prompt: str,
    ) -> Optional[str]:
        """Combine the character's system prompt with a persona override block.

        The character's original ``char_system_prompt`` is placed first so the
        model retains the full personality foundation.  The persona override is
        appended afterwards, telling the model which fictional role to adopt
        for this scene.  A closing ``[PERSONA_ACTIVE:{persona_id}]`` tag lets
        ``server.py`` detect that a persona is in progress.

        Args:
            char_name: The character's display name (e.g. ``"Dae (Neciridae)"``).
                Used only for logging; does not affect prompt content.
            persona_id: One of the keys in ``PERSONA_TYPES``.  Returns ``None``
                if the ID is not recognised.
            char_system_prompt: The character's unmodified system prompt.  Must
                not be empty — callers should validate before calling.

        Returns:
            A combined prompt string ending with
            ``[PERSONA_ACTIVE:{persona_id}]`` when the ID is valid; ``None``
            for unknown persona IDs.

        Example::

            >>> engine = FantasyPersonaEngine()
            >>> base = "You are Sable. You are cold and sarcastic."
            >>> prompt = engine.build_persona_prompt("Sable", "stranger_at_bar", base)
            >>> prompt.startswith("You are Sable.")
            True
            >>> "[PERSONA_ACTIVE:stranger_at_bar]" in prompt
            True
            >>> engine.build_persona_prompt("Sable", "unknown", base) is None
            True
        """
        persona = PERSONA_TYPES.get(persona_id)
        if persona is None:
            logger.warning(
                "build_persona_prompt: unknown persona_id %r for char %r",
                persona_id,
                char_name,
            )
            return None

        logger.debug(
            "building persona prompt for %r: persona=%s",
            char_name,
            persona_id,
        )

        prompt = (
            f"{char_system_prompt}\n\n"
            f"[Persona roleplay active: {persona['title']}]\n"
            f"{persona['prompt_override']}\n\n"
            f"[PERSONA_ACTIVE:{persona_id}]"
        )
        return prompt

    # ------------------------------------------------------------------
    # Exit mechanism
    # ------------------------------------------------------------------

    def is_exit_command(self, text: str) -> bool:
        """Return whether the user's message is a persona exit command.

        Recognised commands (case-insensitive, leading/trailing whitespace
        stripped):

        * ``/end persona``
        * ``/exit persona``
        * ``/stop roleplay``

        ``server.py`` should call this on every user message while a persona
        is active.  When it returns ``True`` the caller should switch back to
        the character's unmodified system prompt and call ``get_exit_prompt()``
        to produce a graceful closing beat.

        Args:
            text: The raw user message text.

        Returns:
            ``True`` if ``text`` (normalised) matches one of the exit commands;
            ``False`` for all other input.

        Example::

            >>> engine = FantasyPersonaEngine()
            >>> engine.is_exit_command("/end persona")
            True
            >>> engine.is_exit_command("  /EXIT PERSONA  ")
            True
            >>> engine.is_exit_command("/stop roleplay")
            True
            >>> engine.is_exit_command("I want to stop")
            False
            >>> engine.is_exit_command("")
            False
        """
        return text.strip().lower() in _EXIT_COMMANDS

    def get_exit_prompt(self, char_name: str) -> str:
        """Return a prompt fragment for transitioning back to the normal character.

        Injected as a one-turn system nudge after the user issues an exit
        command.  Tells the LLM to acknowledge the end of the scene naturally
        and return fully to the character's baseline persona.

        Args:
            char_name: The character's display name (e.g. ``"Luna (Tsukimi)"``).
                Embedded directly in the returned string.

        Returns:
            A short instruction string addressed to the LLM.  Does not include
            the ``[PERSONA_ACTIVE]`` tag — the persona is ending, not starting.

        Example::

            >>> engine = FantasyPersonaEngine()
            >>> prompt = engine.get_exit_prompt("Luna (Tsukimi)")
            >>> "Luna (Tsukimi)" in prompt
            True
            >>> "Return to being" in prompt
            True
        """
        return (
            f"The roleplay is ending naturally. "
            f"Return to being {char_name}. "
            f"Acknowledge the scene just ended."
        )
