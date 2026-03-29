"""Power Dynamic Modes — F32 role-based scene direction.

Characters can shift between dominant, submissive, or switch roles during
intimate scenes.  Each mode injects a behaviour directive into the LLM system
prompt so the character's voice and actions reflect the chosen dynamic.

Bond-gated: modes are unavailable until the user has reached bond level ≥ 50
with the character, ensuring the feature is earned through relationship
investment rather than available immediately.

Safe-word always overrides — any cooling signal detected by the consent layer
must immediately supersede whatever dynamic is active.

Example:
    >>> engine = PowerDynamicEngine("Dae (Neciridae)", mode="dominant", intensity=0.8)
    >>> engine.is_available(bond_level=55)
    True
    >>> "CHARACTER LEADS" in engine.get_prompt_modifier()
    True
    >>> engine.is_available(bond_level=40)
    False
"""

from __future__ import annotations

import logging
import random

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Mode constants
# ---------------------------------------------------------------------------


class PowerDynamicMode:
    """String constants for power dynamic mode identifiers.

    Using a class of constants rather than an Enum so values are plain strings
    and can be stored/retrieved from SQLite without serialisation overhead.
    """

    OFF = "off"
    DOMINANT = "dominant"
    SUBMISSIVE = "submissive"
    SWITCH = "switch"


# ---------------------------------------------------------------------------
# Prompt templates
# ---------------------------------------------------------------------------

POWER_DYNAMIC_PROMPTS: dict[str, str] = {
    "dominant": """[DYNAMIC MODE: CHARACTER LEADS]
The character takes initiative, sets the pace, guides the scene.
Vocabulary: commanding (gentle or firm per personality), decisive, leading.
Behavior: initiates contact, positions the user, makes statements not questions.
Intensity: {intensity_desc}
IMPORTANT: Always respect safe word and cooling signals.""",

    "submissive": """[DYNAMIC MODE: USER LEADS]
The character yields to the user's direction and follows their lead.
Vocabulary: deferential, responsive, eager to please, trusting.
Behavior: waits for user signals, asks what user wants, follows instructions.
Intensity: {intensity_desc}
IMPORTANT: Character still has personality. Submissive ≠ blank. They CHOOSE to yield.""",

    "switch": """[DYNAMIC MODE: SWITCHING]
Naturally alternate between leading and following every 3-5 exchanges.
Signal shifts in character voice:
Dominant shift: "My turn." / "Come here." / *takes control*
Submissive shift: "What do you want?" / *lets you lead* / "Tell me."
Switches should feel natural, not mechanical.""",
}

# Switch-suggestion snippets injected when a role flip is due.
# Two separate pools so the engine alternates direction cleanly.
_SWITCH_TO_DOMINANT: list[str] = [
    '[SWITCH SUGGESTION: Time for the character to take the lead. "My turn." or *takes control* — shift into dominant posture naturally.]',
    '[SWITCH SUGGESTION: The character asserts themselves. "Come here." — guide the scene forward with decisive energy.]',
    '[SWITCH SUGGESTION: Dominant shift. Character sets the pace now — initiates, positions, leads.]',
]

_SWITCH_TO_SUBMISSIVE: list[str] = [
    '[SWITCH SUGGESTION: Time for the character to yield. "What do you want?" — soften, follow, let the user lead.]',
    '[SWITCH SUGGESTION: Submissive shift. *lets you lead* — character waits, responsive, eager to please.]',
    '[SWITCH SUGGESTION: The character steps back. "Tell me." — invite user direction, follow their signals.]',
]

# ---------------------------------------------------------------------------
# Per-character natural leanings
# ---------------------------------------------------------------------------

CHARACTER_NATURAL_LEANINGS: dict[str, str] = {
    "Dae (Neciridae)": "dominant",
    "Luna (Tsukimi)": "submissive",
    "Genki (Kitsune)": "switch",
    "Alana Calloway": "switch",
    "Sable (Kuroha)": "dominant",
    "Tsundere (Raine)": "switch",
    "Ayane (Yuki)": "submissive",
    "Hana (Momoka)": "switch",
    "Kaede (Suzuha)": "switch",
    "Mika (Mikazuki)": "dominant",
    "Rin (Akane)": "dominant",
    "Shiori (Nana)": "submissive",
    "Yuki (Shirayuki)": "submissive",
}

# Minimum bond level required for any non-off mode to activate.
BOND_GATE: int = 50

# ---------------------------------------------------------------------------
# Intensity helpers
# ---------------------------------------------------------------------------


def _intensity_description(intensity: float) -> str:
    """Map a 0–1 intensity float to a human-readable directive string.

    Args:
        intensity: A float in the range [0.0, 1.0] representing how explicit
            the power dynamic behaviour should be.

    Returns:
        A short descriptor string ready to be interpolated into a prompt
        template.

    Example:
        >>> _intensity_description(0.2)
        'subtle hints of control/deference'
        >>> _intensity_description(0.5)
        'clear authority/yielding'
        >>> _intensity_description(0.9)
        'explicit dominance/submission'
    """
    if intensity < 0.3:
        return "subtle hints of control/deference"
    if intensity <= 0.7:
        return "clear authority/yielding"
    return "explicit dominance/submission"


# ---------------------------------------------------------------------------
# Main engine
# ---------------------------------------------------------------------------


class PowerDynamicEngine:
    """Manages a single character's active power dynamic mode.

    Injects a behaviour-modifying directive into the LLM system prompt
    whenever the mode is non-off and the bond gate has been cleared.  The
    switch mode additionally tracks message count and periodically returns a
    role-flip suggestion.

    Attributes:
        char_id: Identifier or display name of the character this engine
            belongs to.
        mode: Active mode string — one of the :class:`PowerDynamicMode`
            constants.
        intensity: Float [0.0, 1.0] controlling how explicit the directive
            language is.

    Example:
        >>> engine = PowerDynamicEngine("Luna (Tsukimi)", mode="submissive", intensity=0.5)
        >>> engine.is_available(bond_level=60)
        True
        >>> "USER LEADS" in engine.get_prompt_modifier()
        True
    """

    def __init__(
        self,
        char_id: str,
        mode: str = PowerDynamicMode.OFF,
        intensity: float = 0.5,
    ) -> None:
        """Initialise the engine for a specific character.

        Args:
            char_id: The character's display name or DB identifier.  Used for
                natural-leaning lookups.
            mode: Starting power dynamic mode.  Defaults to ``"off"``.
            intensity: Initial intensity in [0.0, 1.0].  Defaults to 0.5
                (clear authority/yielding level).
        """
        self.char_id: str = char_id
        self.mode: str = mode
        self.intensity: float = max(0.0, min(1.0, intensity))

        # Internal state for switch-pulse logic.
        # _message_count tracks how many calls to switch_pulse() have occurred
        # since the last fired suggestion.
        self._message_count: int = 0
        # Randomly choose next threshold in [3, 5] at start and after each fire.
        self._next_threshold: int = random.randint(3, 5)
        # Alternates which direction the next switch suggestion points.
        self._next_switch_dominant: bool = True

    # ------------------------------------------------------------------
    # Bond gate
    # ------------------------------------------------------------------

    def is_available(self, bond_level: int) -> bool:
        """Return whether non-off modes are unlocked for this bond level.

        Args:
            bond_level: The current numeric bond score (0–100) between the
                user and this character.

        Returns:
            ``True`` when ``bond_level`` is at or above :data:`BOND_GATE`
            (50), otherwise ``False``.

        Example:
            >>> engine = PowerDynamicEngine("Genki (Kitsune)")
            >>> engine.is_available(49)
            False
            >>> engine.is_available(50)
            True
        """
        return bond_level >= BOND_GATE

    # ------------------------------------------------------------------
    # Prompt modifier
    # ------------------------------------------------------------------

    def get_prompt_modifier(self) -> str:
        """Return the system-prompt directive for the active mode.

        When mode is ``"off"`` an empty string is returned so callers can
        safely concatenate without conditionals.  Intensity is embedded in
        the ``{intensity_desc}`` placeholder of each template.

        Returns:
            A multi-line directive string ready for injection, or ``""`` when
            mode is ``"off"``.

        Example:
            >>> engine = PowerDynamicEngine("Dae (Neciridae)", mode="dominant", intensity=0.1)
            >>> mod = engine.get_prompt_modifier()
            >>> "subtle hints" in mod
            True
        """
        if self.mode == PowerDynamicMode.OFF:
            return ""

        template = POWER_DYNAMIC_PROMPTS.get(self.mode)
        if template is None:
            logger.warning("Unknown power dynamic mode %r — returning empty modifier", self.mode)
            return ""

        intensity_desc = _intensity_description(self.intensity)
        return template.format(intensity_desc=intensity_desc)

    # ------------------------------------------------------------------
    # Switch pulse
    # ------------------------------------------------------------------

    def switch_pulse(self, message_count: int) -> str | None:
        """Suggest a role flip when enough messages have accumulated.

        Intended for use with ``mode == "switch"`` only; returns ``None``
        immediately for all other modes.  Each call increments an internal
        counter; when the counter reaches the randomly chosen threshold
        (3–5 messages) a suggestion prompt is returned and the counter resets.

        The direction alternates between dominant → submissive on each fire
        so the character naturally oscillates without mechanical repetition.

        Args:
            message_count: Ignored — present only for API symmetry.  The
                engine maintains its own counter so callers do not need to
                track message indices.

        Returns:
            A switch-suggestion directive string when a flip is due, or
            ``None`` otherwise.

        Example:
            >>> engine = PowerDynamicEngine("Genki (Kitsune)", mode="switch")
            >>> # Force threshold to 1 for deterministic testing
            >>> engine._next_threshold = 1
            >>> result = engine.switch_pulse(0)
            >>> result is not None
            True
        """
        if self.mode != PowerDynamicMode.SWITCH:
            return None

        self._message_count += 1

        if self._message_count < self._next_threshold:
            return None

        # Threshold reached — fire a suggestion.
        self._message_count = 0
        self._next_threshold = random.randint(3, 5)

        if self._next_switch_dominant:
            suggestion = random.choice(_SWITCH_TO_DOMINANT)
        else:
            suggestion = random.choice(_SWITCH_TO_SUBMISSIVE)

        # Flip direction for next fire.
        self._next_switch_dominant = not self._next_switch_dominant

        logger.debug(
            "Switch pulse fired: char_id=%r direction=%s",
            self.char_id,
            "dominant" if not self._next_switch_dominant else "submissive",
        )
        return suggestion

    # ------------------------------------------------------------------
    # Natural leaning helper
    # ------------------------------------------------------------------

    @staticmethod
    def natural_leaning(char_id: str) -> str:
        """Look up the character's natural power-dynamic leaning.

        Falls back to ``"switch"`` for unrecognised characters so callers
        always receive a valid mode constant.

        Args:
            char_id: The character's display name as it appears in
                :data:`CHARACTER_NATURAL_LEANINGS`.

        Returns:
            One of ``"dominant"``, ``"submissive"``, or ``"switch"``.

        Example:
            >>> PowerDynamicEngine.natural_leaning("Dae (Neciridae)")
            'dominant'
            >>> PowerDynamicEngine.natural_leaning("Unknown")
            'switch'
        """
        return CHARACTER_NATURAL_LEANINGS.get(char_id, PowerDynamicMode.SWITCH)

    # ------------------------------------------------------------------
    # Configuration
    # ------------------------------------------------------------------

    def set_mode(self, mode: str) -> None:
        """Update the active mode at runtime.

        Args:
            mode: One of the :class:`PowerDynamicMode` string constants.
                Unknown values are silently accepted (callers should validate
                before calling if strict enforcement is needed).
        """
        self.mode = mode
        # Reset switch counter whenever mode changes so the first pulse
        # fires at a fresh random interval.
        self._message_count = 0
        self._next_threshold = random.randint(3, 5)
        logger.debug("Power dynamic mode set: char_id=%r mode=%r", self.char_id, mode)

    def set_intensity(self, intensity: float) -> None:
        """Update the intensity level, clamped to [0.0, 1.0].

        Args:
            intensity: New intensity value.  Values outside [0, 1] are
                clamped rather than raising an error.
        """
        self.intensity = max(0.0, min(1.0, intensity))
        logger.debug(
            "Power dynamic intensity set: char_id=%r intensity=%.2f",
            self.char_id,
            self.intensity,
        )
