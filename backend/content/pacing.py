"""Dynamic intensity pacing engine for intimate scene progression.

Manages a 6-phase state machine that creates natural pacing in intimate
conversations. The character mirrors the user's pace, never leading by
more than one phase. Includes three pacing modes: natural, slow-burn, direct.

Content ceiling enforcement ensures pacing cannot advance beyond what
the user's content settings allow.

Example:
    >>> engine = PacingEngine(char_id=1, pacing_personality="responsive")
    >>> engine.current_phase
    <IntimacyPhase.CASUAL: 1>
    >>> transition = engine.advance(signal_strength=2)
    >>> engine.current_phase
    <IntimacyPhase.FLIRTY: 2>
"""

from __future__ import annotations

import random
from dataclasses import dataclass
from enum import Enum, IntEnum
from typing import Optional

import logging

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------


class IntimacyPhase(IntEnum):
    """Six-phase intimacy progression ladder.

    Ordered from most casual (1) to post-scene care (6).  AFTERCARE is a
    special state: it can only be entered via ``force_aftercare()`` or by
    naturally completing INTENSE, and it automatically decays back to CASUAL
    after a few messages via ``tick_aftercare()``.

    Example:
        >>> IntimacyPhase.CASUAL < IntimacyPhase.FLIRTY
        True
        >>> int(IntimacyPhase.INTENSE)
        5
    """

    CASUAL = 1
    FLIRTY = 2
    SUGGESTIVE = 3
    INTIMATE = 4
    INTENSE = 5
    AFTERCARE = 6


class PacingMode(str, Enum):
    """Pacing behaviour mode for the session.

    Attributes:
        NATURAL: Standard mirroring — character follows the user at a
            realistic pace.
        SLOW_BURN: Tension is deliberately prolonged; advancement past
            SUGGESTIVE is blocked until a tension counter is satisfied.
        DIRECT: No pacing restrictions; character matches energy without
            artificial delays.

    Example:
        >>> PacingMode.SLOW_BURN.value
        'slow_burn'
    """

    NATURAL = "natural"
    SLOW_BURN = "slow_burn"
    DIRECT = "direct"


# ---------------------------------------------------------------------------
# Dataclasses
# ---------------------------------------------------------------------------


@dataclass
class PhaseTransition:
    """Records a single phase change event.

    Attributes:
        from_phase: Phase before the transition.
        to_phase: Phase after the transition.
        reason: Machine-readable cause of the transition.
            Possible values: ``"user_escalation"``, ``"cool_signal"``,
            ``"safe_word"``, ``"natural_decay"``, ``"aftercare_complete"``.

    Example:
        >>> t = PhaseTransition(IntimacyPhase.CASUAL, IntimacyPhase.FLIRTY, "user_escalation")
        >>> t.reason
        'user_escalation'
    """

    from_phase: IntimacyPhase
    to_phase: IntimacyPhase
    reason: str


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Content ceiling → maximum allowed IntimacyPhase
CEILING_PHASE_LIMITS: dict[str, IntimacyPhase] = {
    "general": IntimacyPhase.FLIRTY,
    "edgy": IntimacyPhase.SUGGESTIVE,
    "mature": IntimacyPhase.INTIMATE,
    "explicit": IntimacyPhase.INTENSE,
}
"""Maps each content ceiling string to the highest phase that may be entered.

AFTERCARE (6) is always reachable via ``force_aftercare()`` regardless of
ceiling because it de-escalates rather than escalates content.

Example:
    >>> CEILING_PHASE_LIMITS["general"]
    <IntimacyPhase.FLIRTY: 2>
    >>> CEILING_PHASE_LIMITS["explicit"]
    <IntimacyPhase.INTENSE: 5>
"""

# Pacing personality type configs
PACING_PERSONALITIES: dict[str, dict] = {
    "teaser": {
        "advance_probability": 0.6,
        "can_lead": False,
        "lead_probability": 0.0,
        "description": "Resists advancement, lingers in each phase",
    },
    "responsive": {
        "advance_probability": 0.9,
        "can_lead": False,
        "lead_probability": 0.0,
        "description": "Mirrors user exactly",
    },
    "initiator": {
        "advance_probability": 0.9,
        "can_lead": True,
        "lead_probability": 0.3,
        "description": "Occasionally advances first",
    },
}
"""Per-personality advance probability and leadership config.

``advance_probability``: chance (0–1) the engine accepts an advance signal.
``can_lead``: whether this personality may volunteer a phase advance without
    an explicit user signal.
``lead_probability``: chance (0–1) the character self-initiates an advance
    when ``can_lead`` is ``True``.

Example:
    >>> PACING_PERSONALITIES["teaser"]["advance_probability"]
    0.6
    >>> PACING_PERSONALITIES["initiator"]["can_lead"]
    True
"""

# Character name → pacing personality key
CHARACTER_PACING_TYPE: dict[str, str] = {
    "Dae (Neciridae)": "teaser",
    "Luna (Tsukimi)": "teaser",
    "Genki (Kitsune)": "responsive",
    "Alana Calloway": "responsive",
    "Sable (Kuroha)": "responsive",
    "Tsundere (Raine)": "teaser",
    "Ayane (Yuki)": "teaser",
    "Hana (Momoka)": "responsive",
    "Kaede (Suzuha)": "responsive",
    "Mika (Mikazuki)": "initiator",
    "Rin (Akane)": "initiator",
    "Shiori (Nana)": "teaser",
    "Yuki (Shirayuki)": "responsive",
}
"""Maps each character's display name to their pacing personality key.

Characters with a ``"teaser"`` type naturally linger in early phases and
require more user effort to advance.  ``"initiator"`` types occasionally
push forward on their own.

Example:
    >>> CHARACTER_PACING_TYPE["Mika (Mikazuki)"]
    'initiator'
    >>> CHARACTER_PACING_TYPE["Dae (Neciridae)"]
    'teaser'
"""

# Character name → default pacing mode (unspecified → NATURAL)
CHARACTER_DEFAULT_MODE: dict[str, PacingMode] = {
    "Dae (Neciridae)": PacingMode.SLOW_BURN,
    "Luna (Tsukimi)": PacingMode.SLOW_BURN,
    "Genki (Kitsune)": PacingMode.DIRECT,
    "Sable (Kuroha)": PacingMode.NATURAL,
}
"""Preferred default ``PacingMode`` for named characters.

Characters absent from this mapping default to ``PacingMode.NATURAL``.

Example:
    >>> CHARACTER_DEFAULT_MODE["Dae (Neciridae)"]
    <PacingMode.SLOW_BURN: 'slow_burn'>
    >>> CHARACTER_DEFAULT_MODE.get("Alana Calloway", PacingMode.NATURAL)
    <PacingMode.NATURAL: 'natural'>
"""

# Per-phase system-prompt snippets injected by get_phase_prompt()
PHASE_PROMPTS: dict[IntimacyPhase, str] = {
    IntimacyPhase.CASUAL: (
        "[Scene Pacing: CASUAL]\n"
        "Friendly, platonic, comfortable interaction. Casual proximity and friendly gestures only.\n"
        "Physical limit: side-by-side sitting, shoulder bumps, friendly arm touches."
    ),
    IntimacyPhase.FLIRTY: (
        "[Scene Pacing: FLIRTY]\n"
        "Teasing, complimentary, charged double-meanings. Lingering looks and light touches.\n"
        "Physical limit: hand touches, arm touches, sitting close, playful nudges."
    ),
    IntimacyPhase.SUGGESTIVE: (
        "[Scene Pacing: SUGGESTIVE]\n"
        "Innuendo, breathless observations, building anticipation. Deliberate touching.\n"
        "Physical limit: hair touching, face cupping, forehead touching, hand-holding."
    ),
    IntimacyPhase.INTIMATE: (
        "[Scene Pacing: INTIMATE]\n"
        "Vulnerable, emotional, physical descriptions. Embracing, cuddling, kissing.\n"
        "Physical limit: kissing, holding, pressing close, emotional openness."
    ),
    IntimacyPhase.INTENSE: (
        "[Scene Pacing: INTENSE]\n"
        "Raw, urgent, sensory-dominant. Full physical engagement per content ceiling.\n"
        "Physical limit: determined by content ceiling setting."
    ),
    IntimacyPhase.AFTERCARE: (
        "[Scene Pacing: AFTERCARE]\n"
        "Gentle, nurturing, warm, sleepy. Cuddling, holding, gentle touches only.\n"
        "Physical limit: gentle physical comfort. Transitions to CASUAL after 3-5 messages."
    ),
}
"""System-prompt text inserted at the top of each response for the active phase.

These snippets are combined with pacing-mode modifiers by ``get_phase_prompt()``.
"""

SLOW_BURN_PROMPT: str = (
    "[PACING MODE: SLOW-BURN]\n"
    "Build tension gradually. Do NOT resolve romantic/physical tension quickly.\n"
    "Instead: come CLOSE to resolution, then pull back with a smile/tease.\n"
    "Let charged silences hang. Physical proximity WITHOUT contact.\n"
    "After {remaining} more exchanges of tension, you may begin to resolve.\n"
    "The anticipation IS the experience."
)
"""Prompt modifier injected when ``PacingMode.SLOW_BURN`` is active and the
tension counter has not yet reached the release threshold.

Use ``SLOW_BURN_PROMPT.format(remaining=N)`` to fill in the countdown.
"""

SLOW_BURN_RELEASE_PROMPT: str = (
    "[PACING MODE: SLOW-BURN RELEASE]\n"
    "The tension has built to its breaking point. The character is DONE waiting.\n"
    "Make it dramatic, emotional, and worth every moment of build.\n"
    'Reference the anticipation: "I\'ve been wanting to do this all night." '
)
"""Prompt modifier injected when the slow-burn tension counter has been
satisfied and advancement is now permitted.
"""

DIRECT_MODE_PROMPT: str = (
    "[PACING MODE: DIRECT]\n"
    "No pacing restrictions. Respond at whatever intensity feels natural.\n"
    "Match the user's energy without artificial delays."
)
"""Prompt modifier injected when ``PacingMode.DIRECT`` is active."""


# ---------------------------------------------------------------------------
# PacingEngine
# ---------------------------------------------------------------------------


class PacingEngine:
    """6-phase intimacy pacing state machine for a single conversation session.

    The engine tracks the current ``IntimacyPhase`` and enforces:

    * **No 0-to-100 jumps** — maximum one phase advance per message.
    * **Content ceiling** — phase cannot exceed the user's content setting.
    * **Pacing personality** — advance probability varies by character archetype.
    * **Slow-burn gating** — advancement past SUGGESTIVE is blocked until the
      tension counter reaches ``_release_threshold`` exchanges.
    * **Aftercare decay** — AFTERCARE phase automatically decays to CASUAL
      after 3–5 ``tick_aftercare()`` calls.

    The engine is stateful and session-scoped: one instance per active chat
    session. It does not touch the database; persistence is the caller's
    responsibility.

    Attributes:
        char_id: Opaque character identifier (mirrors the DB primary key).
        pacing_personality: Key into ``PACING_PERSONALITIES`` config dict.
        pacing_mode: Active ``PacingMode`` for this session.
        content_ceiling: The user's content rating string (``"general"``
            through ``"explicit"``).
        current_phase: Current ``IntimacyPhase``.

    Example:
        >>> engine = PacingEngine(char_id=1, pacing_personality="responsive")
        >>> engine.current_phase
        <IntimacyPhase.CASUAL: 1>
        >>> t = engine.advance(signal_strength=1)
        >>> engine.current_phase
        <IntimacyPhase.FLIRTY: 2>
    """

    def __init__(
        self,
        char_id: int,
        pacing_personality: str = "responsive",
        pacing_mode: PacingMode = PacingMode.NATURAL,
        content_ceiling: str = "explicit",
    ) -> None:
        """Initialise the pacing engine for a character session.

        Args:
            char_id: DB primary key of the character (used for logging only).
            pacing_personality: One of ``"teaser"``, ``"responsive"``,
                ``"initiator"``.  Defaults to ``"responsive"`` if unknown.
            pacing_mode: Initial ``PacingMode``.
            content_ceiling: User's content ceiling (``"general"``,
                ``"edgy"``, ``"mature"``, ``"explicit"``).

        Example:
            >>> e = PacingEngine(char_id=5, pacing_personality="teaser",
            ...                  content_ceiling="mature")
            >>> e.current_phase
            <IntimacyPhase.CASUAL: 1>
        """
        self.char_id = char_id
        self.pacing_personality = pacing_personality
        self._config: dict = PACING_PERSONALITIES.get(
            pacing_personality, PACING_PERSONALITIES["responsive"]
        )
        self.pacing_mode = pacing_mode
        self.content_ceiling = content_ceiling

        self.current_phase: IntimacyPhase = IntimacyPhase.CASUAL

        # Per-message guard: allow at most one advance per incoming message.
        self._advanced_this_message: bool = False

        # Aftercare countdown: ticks until CASUAL reversion.
        self._aftercare_message_count: int = 0
        # Randomise the AFTERCARE window (3–5 messages) at init time;
        # reset each time AFTERCARE is entered.
        self._aftercare_threshold: int = random.randint(3, 5)

        # Slow-burn state
        self._tension_counter: int = 0
        self._release_threshold: int = 8  # exchanged before slow-burn releases
        self._released: bool = False  # True once threshold has been crossed

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def advance(self, signal_strength: int = 1) -> Optional[PhaseTransition]:
        """Attempt to advance the phase based on an explicit user escalation signal.

        Rules enforced (in order):

        1. Only one advance per message — second call within the same message
           returns ``None``.
        2. Cannot advance while in AFTERCARE (use ``tick_aftercare()`` to
           exit aftercare naturally).
        3. Cannot exceed the content-ceiling phase limit.
        4. In ``SLOW_BURN`` mode, advancement past ``SUGGESTIVE`` is blocked
           until ``_tension_counter >= _release_threshold``.
        5. Personality advance probability — a random roll against
           ``advance_probability`` may absorb weak signals.
        6. ``DIRECT`` mode bypasses probability roll entirely.

        Each call also increments the slow-burn tension counter so that
        repeated escalation attempts accumulate toward release.

        Args:
            signal_strength: How strongly the user is escalating.
                ``1`` = gentle, ``2`` = clear intent, ``3`` = explicit request.
                Higher values are not currently used but are accepted for
                forward compatibility.

        Returns:
            A ``PhaseTransition`` if the phase changed, otherwise ``None``.

        Example:
            >>> e = PacingEngine(char_id=1)
            >>> t = e.advance()
            >>> t.reason
            'user_escalation'
            >>> e.advance()  # second call same message → None
        """
        if self._advanced_this_message:
            logger.debug("char=%d advance blocked: already advanced this message", self.char_id)
            return None

        if self.current_phase == IntimacyPhase.AFTERCARE:
            logger.debug("char=%d advance blocked: in AFTERCARE", self.char_id)
            return None

        # Increment tension regardless of whether advance succeeds — builds
        # the slow-burn counter even when probability blocks us.
        self._tension_counter += 1

        max_phase = self._max_phase_for_ceiling()
        if self.current_phase >= max_phase:
            logger.debug(
                "char=%d advance blocked: at ceiling phase %s", self.char_id, self.current_phase
            )
            return None

        # Slow-burn gate: block past SUGGESTIVE until threshold met.
        if (
            self.pacing_mode == PacingMode.SLOW_BURN
            and self.current_phase >= IntimacyPhase.SUGGESTIVE
            and not self._released
        ):
            if self._tension_counter < self._release_threshold:
                logger.debug(
                    "char=%d slow-burn gate: %d/%d exchanges",
                    self.char_id,
                    self._tension_counter,
                    self._release_threshold,
                )
                return None
            # Threshold reached — unlock release.
            self._released = True
            logger.debug("char=%d slow-burn released at counter=%d", self.char_id, self._tension_counter)

        # Probability roll (skipped in DIRECT mode).
        if self.pacing_mode != PacingMode.DIRECT:
            prob = self._config.get("advance_probability", 0.9)
            if random.random() > prob:
                logger.debug(
                    "char=%d advance absorbed by probability (%.2f)", self.char_id, prob
                )
                return None

        # Advance.
        from_phase = self.current_phase
        # AFTERCARE is never the *target* of a normal advance — skip it.
        next_val = from_phase + 1
        if next_val == IntimacyPhase.AFTERCARE:
            # Should not normally happen via advance(); AFTERCARE is only
            # entered through force_aftercare().
            return None

        to_phase = IntimacyPhase(next_val)
        # Respect ceiling one final time (paranoia guard).
        to_phase = min(to_phase, max_phase)

        self.current_phase = to_phase
        self._advanced_this_message = True
        logger.info(
            "char=%d phase %s → %s (user_escalation)", self.char_id, from_phase.name, to_phase.name
        )
        return PhaseTransition(from_phase=from_phase, to_phase=to_phase, reason="user_escalation")

    def cool_down(self, signal: str = "cool") -> Optional[PhaseTransition]:
        """Drop the phase by one step in response to a cooling signal.

        Cannot drop below ``CASUAL``.  AFTERCARE is not affected by
        ``cool_down`` — use ``tick_aftercare()`` to exit aftercare.

        Also clears the per-message advance guard so that the next
        ``advance()`` call in the same message is not blocked.

        Args:
            signal: Human-readable label for the cooling trigger (used for
                logging only, e.g. ``"topic_change"``, ``"user_explicit"``).

        Returns:
            A ``PhaseTransition`` if the phase changed, otherwise ``None``
            (already at CASUAL or currently in AFTERCARE).

        Example:
            >>> e = PacingEngine(char_id=1)
            >>> e.current_phase = IntimacyPhase.INTIMATE
            >>> t = e.cool_down()
            >>> t.to_phase
            <IntimacyPhase.SUGGESTIVE: 3>
        """
        if self.current_phase == IntimacyPhase.CASUAL:
            return None
        if self.current_phase == IntimacyPhase.AFTERCARE:
            return None

        from_phase = self.current_phase
        to_phase = IntimacyPhase(int(from_phase) - 1)
        self.current_phase = to_phase
        # Allow advance again after a cooldown in the same message.
        self._advanced_this_message = False
        logger.info(
            "char=%d phase %s → %s (cool_signal:%s)", self.char_id, from_phase.name, to_phase.name, signal
        )
        return PhaseTransition(from_phase=from_phase, to_phase=to_phase, reason="cool_signal")

    def force_aftercare(self) -> PhaseTransition:
        """Immediately jump to AFTERCARE from any phase (safe-word handler).

        Resets the aftercare counter and generates a fresh randomised
        threshold (3–5 messages) for the CASUAL reversion.

        Returns:
            A ``PhaseTransition`` with reason ``"safe_word"``.

        Example:
            >>> e = PacingEngine(char_id=1)
            >>> e.current_phase = IntimacyPhase.INTENSE
            >>> t = e.force_aftercare()
            >>> t.to_phase
            <IntimacyPhase.AFTERCARE: 6>
            >>> t.reason
            'safe_word'
        """
        from_phase = self.current_phase
        self.current_phase = IntimacyPhase.AFTERCARE
        self._aftercare_message_count = 0
        self._aftercare_threshold = random.randint(3, 5)
        self._advanced_this_message = False
        logger.info("char=%d safe_word → AFTERCARE from %s", self.char_id, from_phase.name)
        return PhaseTransition(from_phase=from_phase, to_phase=IntimacyPhase.AFTERCARE, reason="safe_word")

    def get_phase_prompt(self) -> str:
        """Build the complete system-prompt snippet for the current phase and mode.

        Combines the base phase description from ``PHASE_PROMPTS`` with any
        applicable pacing-mode modifier:

        * ``SLOW_BURN`` (pre-release): appends countdown text.
        * ``SLOW_BURN`` (post-release): appends release/payoff text.
        * ``DIRECT``: appends the direct-mode note.
        * ``NATURAL``: no modifier appended.

        Returns:
            A multi-line string ready for insertion into the LLM system prompt.

        Example:
            >>> e = PacingEngine(char_id=1, pacing_mode=PacingMode.DIRECT)
            >>> "DIRECT" in e.get_phase_prompt()
            True
        """
        base = PHASE_PROMPTS[self.current_phase]

        if self.pacing_mode == PacingMode.DIRECT:
            return f"{base}\n\n{DIRECT_MODE_PROMPT}"

        if self.pacing_mode == PacingMode.SLOW_BURN:
            if self._released:
                return f"{base}\n\n{SLOW_BURN_RELEASE_PROMPT}"
            remaining = max(0, self._release_threshold - self._tension_counter)
            return f"{base}\n\n{SLOW_BURN_PROMPT.format(remaining=remaining)}"

        # NATURAL mode — base prompt only.
        return base

    def set_pacing_mode(self, mode: PacingMode) -> None:
        """Switch the pacing mode mid-session.

        Switching to ``SLOW_BURN`` resets the tension counter and release
        flag so the slow-burn window starts fresh.  Switching away from
        ``SLOW_BURN`` does not reset any state.

        Args:
            mode: The new ``PacingMode`` to activate.

        Example:
            >>> e = PacingEngine(char_id=1)
            >>> e.set_pacing_mode(PacingMode.SLOW_BURN)
            >>> e.pacing_mode
            <PacingMode.SLOW_BURN: 'slow_burn'>
        """
        if mode == PacingMode.SLOW_BURN and self.pacing_mode != PacingMode.SLOW_BURN:
            # Reset slow-burn state when freshly enabling the mode.
            self._tension_counter = 0
            self._released = False
        self.pacing_mode = mode
        logger.debug("char=%d pacing_mode → %s", self.char_id, mode.value)

    def tick_aftercare(self) -> Optional[PhaseTransition]:
        """Advance the aftercare message counter and transition to CASUAL when done.

        Should be called once per LLM response while ``current_phase`` is
        ``AFTERCARE``.  After 3–5 ticks (randomised at aftercare entry) the
        engine reverts to ``CASUAL`` and resets slow-burn state.

        Returns:
            A ``PhaseTransition`` with reason ``"aftercare_complete"`` when
            the transition fires, otherwise ``None``.

        Example:
            >>> e = PacingEngine(char_id=1)
            >>> e.force_aftercare()
            PhaseTransition(...)
            >>> e._aftercare_threshold = 3  # force short window for test
            >>> for _ in range(2): e.tick_aftercare()
            >>> t = e.tick_aftercare()
            >>> t.to_phase
            <IntimacyPhase.CASUAL: 1>
        """
        if self.current_phase != IntimacyPhase.AFTERCARE:
            return None

        self._aftercare_message_count += 1
        logger.debug(
            "char=%d aftercare tick %d/%d",
            self.char_id,
            self._aftercare_message_count,
            self._aftercare_threshold,
        )

        if self._aftercare_message_count >= self._aftercare_threshold:
            from_phase = IntimacyPhase.AFTERCARE
            self.current_phase = IntimacyPhase.CASUAL
            # Reset slow-burn so a new scene starts fresh.
            self._tension_counter = 0
            self._released = False
            self._advanced_this_message = False
            logger.info("char=%d aftercare complete → CASUAL", self.char_id)
            return PhaseTransition(
                from_phase=from_phase,
                to_phase=IntimacyPhase.CASUAL,
                reason="aftercare_complete",
            )
        return None

    def reset_message(self) -> None:
        """Clear the per-message advance guard.

        Must be called at the start of each new incoming user message so
        that the engine permits one advance per message again.  Callers
        that use the engine inside a request handler should call this at
        the top of their turn-processing function.

        Example:
            >>> e = PacingEngine(char_id=1)
            >>> e.advance()
            PhaseTransition(...)
            >>> e._advanced_this_message
            True
            >>> e.reset_message()
            >>> e._advanced_this_message
            False
        """
        self._advanced_this_message = False

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _max_phase_for_ceiling(self) -> IntimacyPhase:
        """Return the maximum ``IntimacyPhase`` permitted by the content ceiling.

        AFTERCARE is always reachable (it de-escalates content), so this
        method only concerns itself with the upward advancement limit.

        Returns:
            The ``IntimacyPhase`` ceiling mapped from ``self.content_ceiling``.
            Falls back to ``IntimacyPhase.INTENSE`` for unknown ceiling strings.

        Example:
            >>> e = PacingEngine(char_id=1, content_ceiling="general")
            >>> e._max_phase_for_ceiling()
            <IntimacyPhase.FLIRTY: 2>
        """
        return CEILING_PHASE_LIMITS.get(self.content_ceiling, IntimacyPhase.INTENSE)

    # ------------------------------------------------------------------
    # Factory
    # ------------------------------------------------------------------

    @classmethod
    def for_character(
        cls,
        char_id: int,
        char_name: str = "",
        content_ceiling: str = "explicit",
    ) -> "PacingEngine":
        """Create a ``PacingEngine`` pre-configured for a named character.

        Looks up the character's pacing personality and default pacing mode
        from the project's character-to-config mappings.  Characters not in
        the lookup tables receive ``"responsive"`` personality and
        ``PacingMode.NATURAL`` mode.

        Args:
            char_id: DB primary key of the character.
            char_name: Display name exactly as it appears in
                ``CHARACTER_PACING_TYPE`` (e.g. ``"Dae (Neciridae)"``).
            content_ceiling: User's content ceiling string.

        Returns:
            A fully-initialised ``PacingEngine`` instance.

        Example:
            >>> e = PacingEngine.for_character(7, "Dae (Neciridae)")
            >>> e.pacing_personality
            'teaser'
            >>> e.pacing_mode
            <PacingMode.SLOW_BURN: 'slow_burn'>
        """
        personality = CHARACTER_PACING_TYPE.get(char_name, "responsive")
        mode = CHARACTER_DEFAULT_MODE.get(char_name, PacingMode.NATURAL)
        logger.debug(
            "for_character: char_id=%d name=%r personality=%s mode=%s",
            char_id,
            char_name,
            personality,
            mode.value,
        )
        return cls(
            char_id=char_id,
            pacing_personality=personality,
            pacing_mode=mode,
            content_ceiling=content_ceiling,
        )
