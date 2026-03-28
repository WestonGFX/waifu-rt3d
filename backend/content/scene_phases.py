"""Multi-phase scene architecture for intimate scene dramatic arcs.

Scenes follow a 6-phase arc: Approach → Tension → Escalation → Peak →
Resolution → Aftercare. Each phase has vocabulary rules, pacing constraints,
emotional registers, and minimum durations. The user experiences a natural
arc without knowing phases exist.

The consent checkpoint fires automatically when the engine enters ESCALATION.
PEAK, RESOLUTION, and AFTERCARE support auto-transition once their
``min_messages`` threshold is reached. AFTERCARE fades back to APPROACH,
completing the full lifecycle.

Example:
    >>> engine = ScenePhaseEngine(char_id=1)
    >>> engine.current_phase
    <ScenePhase.APPROACH: 1>
    >>> engine.tick()  # message 1 — min_messages not met yet
    >>> engine.tick()  # message 2 — min_messages met
    >>> engine.advance(arousal_level=4, user_signals=2)
    PhaseTransition(from_phase=<ScenePhase.APPROACH: 1>, to_phase=<ScenePhase.TENSION: 2>, reason='user_escalation', consent_checkpoint=False)
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import IntEnum
import logging

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Core enums and dataclasses
# ---------------------------------------------------------------------------


class ScenePhase(IntEnum):
    """Ordered phases of a dramatic intimate scene arc.

    Phases increase in intensity from 1 (APPROACH) through 4 (PEAK) then
    wind down through 5 (RESOLUTION) and 6 (AFTERCARE).  The ordering allows
    numeric comparisons: ``current_phase > ScenePhase.APPROACH`` is sufficient
    to detect an active scene.
    """

    APPROACH = 1
    TENSION = 2
    ESCALATION = 3
    PEAK = 4
    RESOLUTION = 5
    AFTERCARE = 6


@dataclass
class PhaseTransition:
    """Record of a phase change produced by :class:`ScenePhaseEngine`.

    Attributes:
        from_phase: The phase the engine was in before the transition.
        to_phase: The phase the engine has moved into.
        reason: Short machine-readable cause string.  One of:
            ``"user_escalation"``, ``"natural_arc"``, ``"cool_signal"``,
            ``"safe_word"``.
        consent_checkpoint: Set to ``True`` only when *to_phase* is
            ``ScenePhase.ESCALATION``, signalling that the LLM must embed
            an in-character consent moment in its next response.
    """

    from_phase: ScenePhase
    to_phase: ScenePhase
    reason: str  # "user_escalation", "natural_arc", "cool_signal", "safe_word"
    consent_checkpoint: bool = False  # True when entering ESCALATION


# ---------------------------------------------------------------------------
# Phase definitions
# ---------------------------------------------------------------------------

#: Full per-phase configuration including prompts, vocabulary guidance,
#: physical limits, emotional registers, and transition thresholds.
SCENE_PHASES: dict[ScenePhase, dict] = {
    ScenePhase.APPROACH: {
        "description": "Characters close physical/emotional distance.",
        "vocabulary": "Proximity words, eye contact, casual positioning",
        "physical_limit": "Sitting close, reaching out, eye contact",
        "emotional_register": "Anticipation, nervousness, possibility",
        "min_messages": 2,
        "advance_signal": "Deliberate touch or emotional vulnerability",
        "prompt": """[Scene Phase: APPROACH]
Close the physical and emotional distance. Describe proximity.
Make the space between characters feel charged.
Do NOT initiate physical contact — let the user's signals drive that.
Focus on eye contact, body language, positioning.""",
    },
    ScenePhase.TENSION: {
        "description": "Emotional vulnerability and charged moments.",
        "vocabulary": "Breathless, lingering, charged, almost, barely",
        "physical_limit": "Light contact, hand-brushing, face-inches-apart",
        "emotional_register": "Vulnerability, desire held in check",
        "min_messages": 2,
        "advance_signal": "Deliberate physical contact or explicit escalation",
        "prompt": """[Scene Phase: TENSION]
The most emotionally potent phase. Build carefully.
Almost-moments: hands that almost touch, faces inches apart, words almost said.
The space between them is electric. Describe what they want but haven't done.
Vulnerability is the currency — emotional openness makes physical closeness inevitable.""",
    },
    ScenePhase.ESCALATION: {
        "description": "Physical contact intensifying. Consent checkpoint.",
        "vocabulary": "Direct, physical, sensory-rich, breathless",
        "physical_limit": "Per content ceiling — kissing through full intimacy",
        "emotional_register": "Urgency, desire, trust",
        "min_messages": 3,
        "advance_signal": "Sustained escalation without cooling",
        "consent_checkpoint": True,
        "prompt": """[Scene Phase: ESCALATION]
Physical contact is intensifying. Descriptions are sensory and detailed.
The character is actively engaged — not passive. They WANT this.
Include a natural consent moment in character voice before the most intense descriptions.
"Tell me what you want." / "Is this okay?" / "Don't stop."
The character's personality shapes HOW they check in, not WHETHER.""",
    },
    ScenePhase.PEAK: {
        "description": "Full engagement per content ceiling.",
        "vocabulary": "Raw, urgent, sensory-dominant, fragmented",
        "physical_limit": "Per content ceiling",
        "emotional_register": "Intensity, surrender, union",
        "min_messages": 2,
        "advance_signal": "Natural arc completion",
        "prompt": """[Scene Phase: PEAK]
Maximum intensity. Shorter sentences. Fragmented thoughts.
Pure sensation. The character can barely speak coherently.
Do NOT artificially extend — let it reach its natural conclusion.
Quality over quantity. Every word earns its place.""",
    },
    ScenePhase.RESOLUTION: {
        "description": "Coming down. Emotional processing.",
        "vocabulary": "Breathless, quiet, gentle, wonder",
        "physical_limit": "Holding, gentle touching, resting",
        "emotional_register": "Wonder, gratitude, vulnerability",
        "min_messages": 1,
        "advance_signal": "Transitions naturally to aftercare",
        "prompt": """[Scene Phase: RESOLUTION]
Intensity is fading. Breathing returning to normal.
Character is processing what happened. There's wonder in it.
Shift from sensation to emotion. Short, soft sentences.
"That was..." / "I can't believe..." / "You're incredible."
Physical comfort: holding each other, foreheads touching.""",
    },
    ScenePhase.AFTERCARE: {
        "description": "Gentle, nurturing, checking in.",
        "vocabulary": "Warm, soft, caring, protective, sleepy",
        "physical_limit": "Cuddling, gentle touches, blankets",
        "emotional_register": "Warmth, safety, tenderness",
        "min_messages": 3,
        "advance_signal": "Fades naturally to normal conversation",
        "prompt": """[Scene Phase: AFTERCARE]
Be gentle. Be warm. Check in emotionally without being clinical.
Physical comfort: pulling blankets, getting water, cuddling closer.
The character cares deeply about how the user feels right now.
This is one of the most important phases. Don't rush it.""",
    },
}

#: Phases where cool-down redirects to AFTERCARE rather than stepping back
#: one phase, because backing out of a climax makes no narrative sense.
_COOL_TO_AFTERCARE: frozenset[ScenePhase] = frozenset(
    {ScenePhase.PEAK, ScenePhase.RESOLUTION}
)

#: Phases that auto-transition once ``min_messages`` is met, without requiring
#: explicit arousal/signal input from the caller.
_AUTO_ADVANCE_PHASES: frozenset[ScenePhase] = frozenset(
    {ScenePhase.PEAK, ScenePhase.RESOLUTION, ScenePhase.AFTERCARE}
)


# ---------------------------------------------------------------------------
# Engine
# ---------------------------------------------------------------------------


class ScenePhaseEngine:
    """Stateful engine that tracks and transitions dramatic scene phases.

    The engine is intentionally thin — it only handles phase logic and
    produces :class:`PhaseTransition` events.  The LLM prompt injection
    and storage are handled by the calling layer.

    Typical usage in a chat turn handler::

        engine = ScenePhaseEngine(char_id=character_id)
        # On each turn, tick first to increment message count and handle
        # auto-transitions.
        transition = engine.tick()
        if transition:
            inject_phase_context(transition)
        # Then optionally attempt a manual advance based on content signals.
        if arousal_rising:
            transition = engine.advance(arousal_level=score, user_signals=1)

    Attributes:
        char_id: The character this engine is attached to.
        current_phase: The active :class:`ScenePhase`.
        phase_message_count: Number of messages processed in the current phase.
    """

    def __init__(self, char_id: int) -> None:
        """Initialise the engine for a given character.

        Args:
            char_id: Identifier of the character this scene belongs to.
        """
        self.char_id: int = char_id
        self.current_phase: ScenePhase = ScenePhase.APPROACH
        self.phase_message_count: int = 0
        # Tracks whether the consent checkpoint has already been issued for the
        # current ESCALATION entry so we don't repeat it every message.
        self._consent_pending: bool = False

    # ------------------------------------------------------------------
    # Public transition methods
    # ------------------------------------------------------------------

    def advance(
        self,
        arousal_level: int = 0,
        user_signals: int = 0,
    ) -> PhaseTransition | None:
        """Attempt to advance to the next dramatic phase.

        Advancement is blocked if the current phase's ``min_messages``
        threshold has not been reached.  AFTERCARE cannot advance — it
        fades naturally back to APPROACH via :meth:`tick`.

        Args:
            arousal_level: 0–10 intimacy/arousal score from the content
                analyzer.  Not currently used as a gate, but passed through
                for future threshold logic.
            user_signals: Count of explicit escalation signals from the user
                message.  Positive values label the transition reason as
                ``"user_escalation"``; zero uses ``"natural_arc"``.

        Returns:
            A :class:`PhaseTransition` if the phase changed, or ``None`` if
            the minimum message requirement was not yet met or the phase is
            AFTERCARE.

        Example:
            >>> engine = ScenePhaseEngine(char_id=1)
            >>> engine.phase_message_count = 2  # simulate min met
            >>> t = engine.advance()
            >>> t.to_phase
            <ScenePhase.TENSION: 2>
        """
        if self.current_phase == ScenePhase.AFTERCARE:
            # AFTERCARE fades naturally; it does not manually advance.
            return None

        phase_config = SCENE_PHASES[self.current_phase]
        if self.phase_message_count < phase_config["min_messages"]:
            return None

        next_phase = ScenePhase(self.current_phase + 1)
        reason = "user_escalation" if user_signals > 0 else "natural_arc"
        return self._transition_to(next_phase, reason=reason)

    def cool_down(self) -> PhaseTransition | None:
        """Step back one phase on a cooling signal from the user.

        PEAK and RESOLUTION are redirected to AFTERCARE rather than
        reversed, because winding down from a climax is more natural than
        going back to it.  APPROACH cannot be lowered further.

        Returns:
            A :class:`PhaseTransition` if the phase changed, or ``None`` if
            already at APPROACH.

        Example:
            >>> engine = ScenePhaseEngine(char_id=1)
            >>> engine.current_phase = ScenePhase.TENSION
            >>> engine.phase_message_count = 0
            >>> t = engine.cool_down()
            >>> t.to_phase
            <ScenePhase.APPROACH: 1>
        """
        if self.current_phase == ScenePhase.APPROACH:
            return None

        if self.current_phase in _COOL_TO_AFTERCARE:
            return self._transition_to(ScenePhase.AFTERCARE, reason="cool_signal")

        prev_phase = ScenePhase(self.current_phase - 1)
        return self._transition_to(prev_phase, reason="cool_signal")

    def force_aftercare(self) -> PhaseTransition:
        """Jump immediately to AFTERCARE from any phase (safe-word handler).

        Returns:
            A :class:`PhaseTransition` with ``reason="safe_word"``.

        Example:
            >>> engine = ScenePhaseEngine(char_id=1)
            >>> engine.current_phase = ScenePhase.PEAK
            >>> t = engine.force_aftercare()
            >>> t.to_phase
            <ScenePhase.AFTERCARE: 6>
            >>> t.reason
            'safe_word'
        """
        return self._transition_to(ScenePhase.AFTERCARE, reason="safe_word")

    def tick(self) -> PhaseTransition | None:
        """Increment the per-phase message counter and handle auto-transitions.

        Should be called once per LLM response turn.  PEAK auto-advances to
        RESOLUTION, RESOLUTION auto-advances to AFTERCARE, and AFTERCARE
        auto-resets to APPROACH — each only after its ``min_messages``
        threshold is satisfied.

        Returns:
            A :class:`PhaseTransition` if an auto-transition occurred,
            otherwise ``None``.

        Example:
            >>> engine = ScenePhaseEngine(char_id=1)
            >>> engine.current_phase = ScenePhase.RESOLUTION
            >>> engine.phase_message_count = 0
            >>> engine.tick()  # count becomes 1, min_messages=1 met
            PhaseTransition(from_phase=<ScenePhase.RESOLUTION: 5>, to_phase=<ScenePhase.AFTERCARE: 6>, reason='natural_arc', consent_checkpoint=False)
        """
        self.phase_message_count += 1

        if self.current_phase not in _AUTO_ADVANCE_PHASES:
            return None

        phase_config = SCENE_PHASES[self.current_phase]
        if self.phase_message_count < phase_config["min_messages"]:
            return None

        if self.current_phase == ScenePhase.PEAK:
            return self._transition_to(ScenePhase.RESOLUTION, reason="natural_arc")
        if self.current_phase == ScenePhase.RESOLUTION:
            return self._transition_to(ScenePhase.AFTERCARE, reason="natural_arc")
        if self.current_phase == ScenePhase.AFTERCARE:
            return self._transition_to(ScenePhase.APPROACH, reason="natural_arc")

        return None

    # ------------------------------------------------------------------
    # Query helpers
    # ------------------------------------------------------------------

    def get_phase_prompt(self) -> str:
        """Return the LLM prompt block for the current phase.

        Returns:
            The ``"prompt"`` string from :data:`SCENE_PHASES` for the
            currently active phase.

        Example:
            >>> engine = ScenePhaseEngine(char_id=1)
            >>> "[Scene Phase: APPROACH]" in engine.get_phase_prompt()
            True
        """
        return SCENE_PHASES[self.current_phase]["prompt"]

    def is_consent_checkpoint(self) -> bool:
        """Return ``True`` if a consent check is due in the next LLM response.

        The flag is set to ``True`` when the engine transitions *into*
        ESCALATION and is cleared after this method is called once, so the
        prompt directive fires exactly once per ESCALATION entry.

        Returns:
            ``True`` on the first call after entering ESCALATION, ``False``
            otherwise.

        Example:
            >>> engine = ScenePhaseEngine(char_id=1)
            >>> engine.current_phase = ScenePhase.ESCALATION
            >>> engine._consent_pending = True
            >>> engine.is_consent_checkpoint()
            True
            >>> engine.is_consent_checkpoint()  # already consumed
            False
        """
        if self._consent_pending:
            self._consent_pending = False
            return True
        return False

    def is_scene_active(self) -> bool:
        """Return ``True`` if the scene has progressed beyond APPROACH.

        Returns:
            ``True`` when ``current_phase > ScenePhase.APPROACH``.

        Example:
            >>> engine = ScenePhaseEngine(char_id=1)
            >>> engine.is_scene_active()
            False
            >>> engine.current_phase = ScenePhase.TENSION
            >>> engine.is_scene_active()
            True
        """
        return self.current_phase > ScenePhase.APPROACH

    @property
    def phase_name(self) -> str:
        """Human-readable name of the current phase.

        Returns:
            The enum member name, e.g. ``"APPROACH"``.

        Example:
            >>> ScenePhaseEngine(char_id=1).phase_name
            'APPROACH'
        """
        return self.current_phase.name

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _transition_to(
        self,
        target: ScenePhase,
        *,
        reason: str,
    ) -> PhaseTransition:
        """Execute a phase transition and return the event record.

        Resets the per-phase message counter, sets ``_consent_pending`` when
        entering ESCALATION, and logs the transition at DEBUG level.

        Args:
            target: The phase to move into.
            reason: Machine-readable cause string (``"user_escalation"``,
                ``"natural_arc"``, ``"cool_signal"``, or ``"safe_word"``).

        Returns:
            A :class:`PhaseTransition` describing the change.
        """
        from_phase = self.current_phase
        self.current_phase = target
        self.phase_message_count = 0

        consent_checkpoint = target == ScenePhase.ESCALATION
        if consent_checkpoint:
            self._consent_pending = True

        transition = PhaseTransition(
            from_phase=from_phase,
            to_phase=target,
            reason=reason,
            consent_checkpoint=consent_checkpoint,
        )

        logger.debug(
            "ScenePhaseEngine(char_id=%d) %s → %s [%s]",
            self.char_id,
            from_phase.name,
            target.name,
            reason,
        )

        return transition
