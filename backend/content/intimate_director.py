"""Intimate scene director commands for real-time scene control.

Extends the existing director system with 8 intimate-specific commands
for focus, tempo, and camera.  Commands persist until changed or the
scene ends.  Only active when intimacy > 30.

Commands are combinable — one per category (focus, tempo, camera) may be
active simultaneously.  Setting a new command in the same category
replaces the previous one; calling ``clear_all()`` resets the state,
e.g. when the scene ends.

Example::

    >>> director = IntimateDirector()
    >>> cmd = director.parse_command("/focus emotion")
    >>> cmd is not None
    True
    >>> cmd.category
    'focus'
    >>> cmd.value
    'emotion'
    >>> director.build_director_prompt()
    ''
    >>> _ = director.apply_command(cmd)
    >>> prompt = director.build_director_prompt()
    >>> "FEELING" in prompt
    True
"""

from __future__ import annotations

from dataclasses import dataclass


# ---------------------------------------------------------------------------
# Command catalogue
# ---------------------------------------------------------------------------

INTIMATE_DIRECTOR_COMMANDS: dict[str, dict[str, str]] = {
    "/focus emotion": {
        "category": "focus",
        "value": "emotion",
        "prompt": (
            "Focus your writing on what the characters are FEELING. "
            "Internal thoughts, emotional reactions, vulnerability. "
            "Prioritize emotional descriptions over physical."
        ),
    },
    "/focus physical": {
        "category": "focus",
        "value": "physical",
        "prompt": (
            "Focus your writing on physical SENSATIONS. "
            "Touch, temperature, pressure, skin-on-skin detail. "
            "Prioritize sensory descriptions."
        ),
    },
    "/focus dialogue": {
        "category": "focus",
        "value": "dialogue",
        "prompt": (
            "Focus your writing on what the characters are SAYING. "
            "Words, whispers, confessions. "
            "Less narration, more spoken words and reactions."
        ),
    },
    "/tempo faster": {
        "category": "tempo",
        "value": "faster",
        "prompt": (
            "Pick up the pace. "
            "Shorter sentences. "
            "More action, less description. "
            "Build momentum. "
            "Increase urgency."
        ),
    },
    "/tempo slower": {
        "category": "tempo",
        "value": "slower",
        "prompt": (
            "Slow everything down. "
            "Longer, more deliberate descriptions. "
            "Savor each moment. "
            "Draw out anticipation."
        ),
    },
    "/tempo pause": {
        "category": "tempo",
        "value": "pause",
        "prompt": (
            "FREEZE this moment. "
            "Describe it in exquisite detail. "
            "Time stops. "
            "Every sensory detail matters. "
            "Make this a photograph in words."
        ),
    },
    "/closeup": {
        "category": "camera",
        "value": "closeup",
        "prompt": (
            "Zoom in on the most intimate detail of this moment. "
            "A single touch. "
            "A look. "
            "A breath. "
            "Extreme specificity."
        ),
    },
    "/wideshot": {
        "category": "camera",
        "value": "wideshot",
        "prompt": (
            "Pull back. "
            "Describe the entire scene — the room, the lighting, the atmosphere, "
            "the two of them together in the space."
        ),
    },
}
"""All 8 intimate director commands, keyed by canonical slash-command string.

Each entry maps to a dict with ``category``, ``value``, and ``prompt`` keys.
The ``prompt`` value is injected verbatim into the LLM system prompt when the
command is active.
"""

# Pre-build a lower-case lookup table once at import time for O(1) matching.
_COMMAND_LOOKUP: dict[str, dict[str, str]] = {
    k.lower(): v for k, v in INTIMATE_DIRECTOR_COMMANDS.items()
}


# ---------------------------------------------------------------------------
# Data model
# ---------------------------------------------------------------------------


@dataclass
class DirectorCommand:
    """A parsed and resolved intimate director command.

    Attributes:
        category: Logical grouping of the command — one of ``"focus"``,
            ``"tempo"``, or ``"camera"``.
        value: Specific value within the category, e.g. ``"emotion"``,
            ``"faster"``, or ``"closeup"``.
        prompt: Full LLM directive text that is injected into the system
            prompt while this command is active.

    Example::

        >>> cmd = DirectorCommand(category="tempo", value="pause",
        ...     prompt="FREEZE this moment.")
        >>> cmd.category
        'tempo'
    """

    category: str
    value: str
    prompt: str


# ---------------------------------------------------------------------------
# Director class
# ---------------------------------------------------------------------------


class IntimateDirector:
    """Stateful manager for intimate scene director commands.

    Holds at most one active command per category (focus / tempo / camera).
    Applying a second command to the same category silently replaces the first,
    mirroring the expected "last command wins" UX.

    Commands should only be offered to the user and injected into prompts when
    ``intimacy_level > 30``; enforcement of that threshold is the caller's
    responsibility.

    Example::

        >>> d = IntimateDirector()
        >>> d.has_active_commands()
        False
        >>> cmd = d.parse_command("/tempo slower")
        >>> d.apply_command(cmd)
        DirectorCommand(category='tempo', value='slower', prompt=...)
        >>> d.active_tempo
        'slower'
        >>> d.has_active_commands()
        True
        >>> d.clear_all()
        >>> d.has_active_commands()
        False
    """

    def __init__(self) -> None:
        # category string → active DirectorCommand
        self._active_commands: dict[str, DirectorCommand] = {}

    # ------------------------------------------------------------------
    # Parsing
    # ------------------------------------------------------------------

    def parse_command(self, text: str) -> DirectorCommand | None:
        """Parse a director command from raw message text.

        Leading/trailing whitespace is stripped and the lookup is
        case-insensitive, so ``"/FOCUS EMOTION"`` and ``" /focus emotion "``
        both resolve correctly.  Returns ``None`` for any text that does not
        match a known command.

        Args:
            text: Raw message text from the user or UI.

        Returns:
            A :class:`DirectorCommand` if the text is a known command,
            otherwise ``None``.

        Example::

            >>> d = IntimateDirector()
            >>> d.parse_command("/TEMPO PAUSE") is not None
            True
            >>> d.parse_command("hello there") is None
            True
        """
        normalised = text.strip().lower()
        entry = _COMMAND_LOOKUP.get(normalised)
        if entry is None:
            return None
        return DirectorCommand(
            category=entry["category"],
            value=entry["value"],
            prompt=entry["prompt"],
        )

    # ------------------------------------------------------------------
    # State mutations
    # ------------------------------------------------------------------

    def apply_command(self, command: DirectorCommand) -> DirectorCommand:
        """Make a parsed command active, replacing any prior command in the same category.

        Args:
            command: A :class:`DirectorCommand` returned by
                :meth:`parse_command`.

        Returns:
            The same ``command`` instance, for convenient chaining.

        Example::

            >>> d = IntimateDirector()
            >>> cmd = d.parse_command("/tempo faster")
            >>> d.apply_command(cmd).value
            'faster'
            >>> cmd2 = d.parse_command("/tempo slower")
            >>> d.apply_command(cmd2)
            DirectorCommand(category='tempo', value='slower', ...)
            >>> d.active_tempo
            'slower'
        """
        self._active_commands[command.category] = command
        return command

    def clear_category(self, category: str) -> None:
        """Remove the active command for a single category.

        A no-op if no command is active for that category.

        Args:
            category: One of ``"focus"``, ``"tempo"``, or ``"camera"``.

        Example::

            >>> d = IntimateDirector()
            >>> cmd = d.parse_command("/focus dialogue")
            >>> d.apply_command(cmd)
            DirectorCommand(...)
            >>> d.clear_category("focus")
            >>> d.active_focus is None
            True
        """
        self._active_commands.pop(category, None)

    def clear_all(self) -> None:
        """Clear all active commands.

        Typically called when a scene ends or the session resets so that
        stale directives do not bleed into the next scene.

        Example::

            >>> d = IntimateDirector()
            >>> d.apply_command(d.parse_command("/focus emotion"))
            DirectorCommand(...)
            >>> d.clear_all()
            >>> d.has_active_commands()
            False
        """
        self._active_commands.clear()

    # ------------------------------------------------------------------
    # Prompt building
    # ------------------------------------------------------------------

    def build_director_prompt(self) -> str:
        """Build a combined prompt block from all currently active commands.

        Returns an empty string when no commands are active, so callers can
        safely concatenate without extra blank-line guards.

        The block is prefixed with a header line that signals to the LLM that
        these are persistent, high-priority directives rather than conversational
        context.

        Returns:
            A multi-line string with all active command prompts, or ``""`` if
            no commands are active.

        Example::

            >>> d = IntimateDirector()
            >>> d.build_director_prompt()
            ''
            >>> d.apply_command(d.parse_command("/focus emotion"))
            DirectorCommand(...)
            >>> d.apply_command(d.parse_command("/tempo slower"))
            DirectorCommand(...)
            >>> block = d.build_director_prompt()
            >>> block.startswith("[INTIMATE DIRECTOR")
            True
            >>> "FEELING" in block
            True
        """
        if not self._active_commands:
            return ""

        lines: list[str] = ["[INTIMATE DIRECTOR — Active Commands]"]
        for cmd in self._active_commands.values():
            lines.append(f"[{cmd.category.upper()}] {cmd.prompt}")
        return "\n".join(lines)

    # ------------------------------------------------------------------
    # Introspection
    # ------------------------------------------------------------------

    def list_commands(self) -> list[dict[str, str]]:
        """Return metadata for all 8 available commands, suitable for UI display.

        Each entry in the returned list contains the keys ``command``
        (the slash-command string), ``category``, ``value``, and a
        shortened ``description`` derived from the first sentence of the
        full prompt.

        Returns:
            List of dicts with ``command``, ``category``, ``value``, and
            ``description`` keys.  Order follows insertion order in
            :data:`INTIMATE_DIRECTOR_COMMANDS`.

        Example::

            >>> d = IntimateDirector()
            >>> cmds = d.list_commands()
            >>> len(cmds)
            8
            >>> cmds[0]["command"]
            '/focus emotion'
        """
        result: list[dict[str, str]] = []
        for slash_cmd, entry in INTIMATE_DIRECTOR_COMMANDS.items():
            # Use the first sentence of the prompt as a short description.
            description = entry["prompt"].split(".")[0].rstrip()
            result.append(
                {
                    "command": slash_cmd,
                    "category": entry["category"],
                    "value": entry["value"],
                    "description": description,
                }
            )
        return result

    def has_active_commands(self) -> bool:
        """Return ``True`` if at least one command is currently active.

        Example::

            >>> d = IntimateDirector()
            >>> d.has_active_commands()
            False
            >>> d.apply_command(d.parse_command("/closeup"))
            DirectorCommand(...)
            >>> d.has_active_commands()
            True
        """
        return bool(self._active_commands)

    # ------------------------------------------------------------------
    # Category property accessors
    # ------------------------------------------------------------------

    @property
    def active_focus(self) -> str | None:
        """Current focus command value (``"emotion"``, ``"physical"``, or ``"dialogue"``), or ``None``.

        Example::

            >>> d = IntimateDirector()
            >>> d.active_focus is None
            True
            >>> d.apply_command(d.parse_command("/focus physical"))
            DirectorCommand(...)
            >>> d.active_focus
            'physical'
        """
        cmd = self._active_commands.get("focus")
        return cmd.value if cmd else None

    @property
    def active_tempo(self) -> str | None:
        """Current tempo command value (``"faster"``, ``"slower"``, or ``"pause"``), or ``None``.

        Example::

            >>> d = IntimateDirector()
            >>> d.active_tempo is None
            True
            >>> d.apply_command(d.parse_command("/tempo pause"))
            DirectorCommand(...)
            >>> d.active_tempo
            'pause'
        """
        cmd = self._active_commands.get("tempo")
        return cmd.value if cmd else None

    @property
    def active_camera(self) -> str | None:
        """Current camera command value (``"closeup"`` or ``"wideshot"``), or ``None``.

        Example::

            >>> d = IntimateDirector()
            >>> d.active_camera is None
            True
            >>> d.apply_command(d.parse_command("/wideshot"))
            DirectorCommand(...)
            >>> d.active_camera
            'wideshot'
        """
        cmd = self._active_commands.get("camera")
        return cmd.value if cmd else None
