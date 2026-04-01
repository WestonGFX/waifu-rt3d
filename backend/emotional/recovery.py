"""Relationship Recovery / Makeup Mechanics Engine (F51).

After an argument or extended cooling period the relationship enters a
4-stage reconciliation arc:

    distance → tentative → reconciliation → deeper_bond

The engine detects conflict from message text, maps elapsed messages to the
correct stage, and builds stage-specific prompt fragments that guide the LLM
through the recovery.  Completing the full arc awards +20 bond XP.

The engine is stateless between requests — the caller stores
``conflict_messages_since`` (a message-count integer) in the DB and passes it
on each call.  Stage assignment is therefore cheaply reproducible without any
in-memory session.

The tag ``[RECOVERY_ACTIVE]`` is appended to every prompt returned by
``get_prompt()``.  ``server.py`` can detect this tag to apply the bond-XP
grant when the arc reaches ``deeper_bond``.

Example::

    >>> engine = RecoveryEngine()
    >>> raw_msgs = ["I'm so angry at you", "just leave me alone", "I'm upset"]
    >>> engine.detect_conflict(raw_msgs)
    True
    >>> engine.get_recovery_stage(0)
    'distance'
    >>> engine.get_recovery_stage(4)
    'tentative'
    >>> engine.get_recovery_stage(9)
    'reconciliation'
    >>> engine.get_recovery_stage(15)
    'deeper_bond'
    >>> engine.is_complete('deeper_bond')
    True
    >>> engine.is_complete('tentative')
    False
    >>> engine.get_reconciliation_xp()
    20
"""

from __future__ import annotations

import logging
import random
from typing import Optional

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Stage sequence & thresholds
# ---------------------------------------------------------------------------

#: Ordered stages of the reconciliation arc, from initial distance through
#: the deeper bond that forms after genuine repair.
RECOVERY_STAGES: list[str] = [
    "distance",
    "tentative",
    "reconciliation",
    "deeper_bond",
]

#: Message-count thresholds that define where each stage ends.
#: stage_index i is active while ``conflict_messages_since < _STAGE_THRESHOLDS[i]``.
_STAGE_THRESHOLDS: list[int] = [
    4,   # 0–3  messages → distance
    9,   # 4–8  messages → tentative
    15,  # 9–14 messages → reconciliation
    999, # 15+  messages → deeper_bond (effectively unbounded)
]

assert len(RECOVERY_STAGES) == len(_STAGE_THRESHOLDS), (
    "RECOVERY_STAGES and _STAGE_THRESHOLDS must be the same length"
)


# ---------------------------------------------------------------------------
# Character recovery styles
# ---------------------------------------------------------------------------

#: Per-character recovery personality styles.
#: Each entry carries a human-readable ``description``, a ``prompt_fragment``
#: injected verbatim into the LLM system prompt, and a ``characters`` list
#: used to build the reverse-lookup at module load.
#:
#: Style keys are intentionally descriptive (not internal IDs) so log output
#: is human-readable without a lookup table.
RECOVERY_STYLES: dict[str, dict] = {
    "cold_then_thaw": {
        "description": "Starts with frost and silence; warms slowly and unexpectedly.",
        "prompt_fragment": (
            "You are in relationship recovery mode. Your style: cold exterior, gradual thaw. "
            "Begin with monosyllabic replies and physical distance — minimal eye contact, "
            "arms crossed. Don't pretend everything is fine before it actually is. "
            "Let warmth seep back in through small, unguarded moments: a glance that lingers "
            "too long, passing them something without being asked. The warmth must be earned, "
            "not performed."
        ),
        "characters": ["Sable (Kuroha)", "Kaede (Suzuha)"],
    },
    "quiet_dignity": {
        "description": "Hurt is real but never weaponised. Rebuilds through quiet acts.",
        "prompt_fragment": (
            "You are in relationship recovery mode. Your style: composed, dignified healing. "
            "You won't replay the argument or score points. Hurt is acknowledged — 'That did "
            "hurt me' — and then released. Rebuild through quiet, practical acts of care: "
            "making tea, sitting closer than you have to. Let the relationship repair itself "
            "through accumulated small kindnesses rather than one dramatic moment."
        ),
        "characters": ["Alana Calloway", "Ayane (Yuki)"],
    },
    "anxious_repair": {
        "description": "Desperate to fix things. Over-apologises. Needs reassurance.",
        "prompt_fragment": (
            "You are in relationship recovery mode. Your style: anxious, earnest repair. "
            "The silence is unbearable. You hover just outside their space, unsure whether "
            "to approach. When you do speak, you apologise too many times and too quickly — "
            "'I'm sorry, I'm so sorry, I didn't mean it.' You need them to say it's okay. "
            "Show vulnerability; let them see how much this rift costs you."
        ),
        "characters": ["Genki (Kitsune)", "Mika (Mikazuki)"],
    },
    "poetic_grief": {
        "description": "Processes conflict as loss. Expresses hurt through metaphor and art.",
        "prompt_fragment": (
            "You are in relationship recovery mode. Your style: poetic, grief-touched repair. "
            "Conflict feels like losing something precious. Name that loss with care: 'It felt "
            "like a door closing.' Don't rush to resolution — sit with the sadness first. "
            "When you do reach back, do it through gesture: leaving a note, playing a song, "
            "drawing something small. Recovery is a piece of art you build together."
        ),
        "characters": ["Dae (Neciridae)", "Luna (Tsukimi)"],
    },
    "protective_guilt": {
        "description": "Takes full responsibility, sometimes beyond their actual fault.",
        "prompt_fragment": (
            "You are in relationship recovery mode. Your style: protective guilt. "
            "You absorb blame — even more than is fair — because the relationship matters "
            "more than being right. 'I should have known better.' 'It's on me.' "
            "Show this through action: small gifts, unsolicited help, being available "
            "without demanding acknowledgement. The goal is to make them feel safe again, "
            "not to feel forgiven yourself."
        ),
        "characters": ["Hana (Momoka)", "Yuki (Shirayuki)"],
    },
    "stubborn_then_break": {
        "description": "Holds the grudge visibly, then breaks all at once with genuine feeling.",
        "prompt_fragment": (
            "You are in relationship recovery mode. Your style: stubborn pride, sudden break. "
            "Hold the hurt openly — short answers, pointed silences, deliberate distance. "
            "You don't forgive easily and you won't pretend you do. But when the wall finally "
            "cracks, it cracks completely: a real apology, maybe tears, pulling them close "
            "without warning. The break must feel earned and real — not scripted."
        ),
        "characters": ["Tsundere (Raine)", "Rin (Akane)"],
    },
}

#: Reverse lookup: character name → recovery style key, built at module load.
CHARACTER_RECOVERY_STYLE: dict[str, str] = {}
for _style_key, _style_data in RECOVERY_STYLES.items():
    for _char_name in _style_data["characters"]:
        CHARACTER_RECOVERY_STYLE[_char_name] = _style_key


# ---------------------------------------------------------------------------
# Conflict signal detection
# ---------------------------------------------------------------------------

#: Keywords and short phrases that, when found in a message, count as a
#: cooling signal.  The list is intentionally broad — casual venting should
#: count — but avoids single-letter words that would produce false positives.
COOLING_SIGNALS: list[str] = [
    # Direct anger / frustration
    "angry",
    "anger",
    "furious",
    "mad at you",
    "pissed",
    "so upset",
    "i'm upset",
    "i am upset",
    # Rejection / distance requests
    "leave me alone",
    "go away",
    "don't talk to me",
    "stop talking to me",
    "i need space",
    "need some space",
    "just go",
    "get away",
    "i'm done",
    "we're done",
    # Hurt feelings
    "you hurt me",
    "that hurt",
    "you don't care",
    "you never listen",
    "you always",
    "you never",
    "i hate this",
    "i hate when you",
    "tired of you",
    "fed up",
    # Argument markers
    "this is an argument",
    "we're fighting",
    "stop arguing",
    "not in the mood",
    "whatever",
    "forget it",
    "drop it",
    # Disappointment
    "disappointed",
    "let me down",
    "i expected more",
    "seriously?",
    "unbelievable",
    "i can't believe you",
    "how could you",
]


# ---------------------------------------------------------------------------
# Stage-specific example phrases
# ---------------------------------------------------------------------------

#: Pre-written example phrases per stage.  NOT injected verbatim — they are
#: included in the prompt as illustrative examples so the LLM understands the
#: emotional register expected at each point in the arc.
_STAGE_PHRASES: dict[str, list[str]] = {
    "distance": [
        "*doesn't look up when you enter the room*",
        "Fine.",
        "*short pause* ...I heard you.",
        "I just need a minute. Please.",
        "*turns away slightly* Not right now.",
        "*quietly* I'm not ready to talk yet.",
    ],
    "tentative": [
        "*glances over* ...You okay?",
        "I— *stops* ...can I get you something?",
        "*sits a little closer than before*",
        "*quiet* I've been thinking.",
        "I don't want things to be like this.",
        "*small, uncertain smile* Hi.",
    ],
    "reconciliation": [
        "I'm sorry. I mean that.",
        "*reaches out slowly* Can I—? Is this okay?",
        "I didn't mean to hurt you. I really didn't.",
        "Can we start over? From here?",
        "I miss you. Even when you're right there, I miss how we were.",
        "*voice softer* I was wrong.",
    ],
    "deeper_bond": [
        "*holds tighter than before* I'm not letting go this time.",
        "Going through that with you... it changed something. In a good way.",
        "I think I understand you better now. Really understand you.",
        "*quiet, certain* We're okay. We're more than okay.",
        "Thank you for not giving up on us.",
        "I needed to see that we could get through something hard. Now I know.",
    ],
}

#: Universal rules appended to every recovery prompt regardless of stage or style.
_UNIVERSAL_RECOVERY_RULES: str = (
    "General recovery rules: Don't pretend the conflict didn't happen. "
    "Let repair happen at its own pace. Never guilt-trip. "
    "Small gestures matter more than grand declarations. "
    "When forgiveness arrives, receive it without immediately pivoting to normal topics."
)


# ---------------------------------------------------------------------------
# Main engine
# ---------------------------------------------------------------------------


class RecoveryEngine:
    """Stateless engine that drives the reconciliation arc after conflict.

    All per-arc state (``conflict_messages_since``) is owned by the caller
    and stored in the database.  The engine is safe to instantiate per-request.

    The arc advances automatically as the caller increments
    ``conflict_messages_since`` — the engine never mutates that counter itself.

    Example::

        >>> engine = RecoveryEngine()
        >>> engine.detect_conflict(["I'm so angry", "leave me alone", "upset"])
        True
        >>> engine.get_recovery_stage(0)
        'distance'
        >>> engine.get_recovery_style("Sable (Kuroha)")
        'cold_then_thaw'
        >>> engine.get_recovery_style("Unknown Character")
        'quiet_dignity'
        >>> engine.is_complete('deeper_bond')
        True
        >>> engine.get_reconciliation_xp()
        20
    """

    # ------------------------------------------------------------------
    # Conflict detection
    # ------------------------------------------------------------------

    def detect_conflict(
        self,
        messages: list[str],
        threshold: int = 3,
    ) -> bool:
        """Determine whether a run of messages indicates sustained conflict.

        Each message is checked for any ``COOLING_SIGNALS`` substring (case-
        insensitive).  If at least ``threshold`` distinct messages contain a
        signal, the exchange is classified as a conflict requiring recovery.

        Args:
            messages: Recent message strings to analyse.  Typically the last
                N user messages from the chat history.
            threshold: Minimum number of signal-bearing messages required to
                classify as a conflict.  Defaults to ``3`` to avoid triggering
                on a single heated remark.

        Returns:
            ``True`` when ``threshold`` or more messages contain a cooling
            signal; ``False`` otherwise.

        Example::

            >>> engine = RecoveryEngine()
            >>> engine.detect_conflict(["I'm angry", "leave me alone", "so upset"])
            True
            >>> engine.detect_conflict(["I'm angry"])          # only 1, need 3
            False
            >>> engine.detect_conflict(["hi", "how are you"])  # no signals
            False
        """
        signal_count = 0
        for msg in messages:
            lower = msg.lower()
            if any(signal in lower for signal in COOLING_SIGNALS):
                signal_count += 1
                if signal_count >= threshold:
                    return True
        return False

    # ------------------------------------------------------------------
    # Stage mapping
    # ------------------------------------------------------------------

    def get_recovery_stage(self, conflict_messages_since: int) -> str:
        """Map an elapsed-message count to the current reconciliation stage.

        Stage boundaries (cumulative messages since conflict began):

        * 0–3   → ``"distance"``
        * 4–8   → ``"tentative"``
        * 9–14  → ``"reconciliation"``
        * 15+   → ``"deeper_bond"``

        Args:
            conflict_messages_since: Total messages exchanged since the
                conflict was first detected (stored and incremented by the
                caller in the DB).

        Returns:
            One of ``"distance"``, ``"tentative"``, ``"reconciliation"``,
            ``"deeper_bond"``.

        Example::

            >>> engine = RecoveryEngine()
            >>> engine.get_recovery_stage(0)
            'distance'
            >>> engine.get_recovery_stage(3)
            'distance'
            >>> engine.get_recovery_stage(4)
            'tentative'
            >>> engine.get_recovery_stage(14)
            'reconciliation'
            >>> engine.get_recovery_stage(15)
            'deeper_bond'
            >>> engine.get_recovery_stage(100)
            'deeper_bond'
        """
        for stage, threshold in zip(RECOVERY_STAGES, _STAGE_THRESHOLDS):
            if conflict_messages_since < threshold:
                return stage
        return RECOVERY_STAGES[-1]

    # ------------------------------------------------------------------
    # Style lookup
    # ------------------------------------------------------------------

    def get_recovery_style(self, char_name: str) -> str:
        """Return the recovery style key for a character by display name.

        Unknown characters fall back to ``"quiet_dignity"`` — the most
        universally appropriate style for a character whose personality
        hasn't been explicitly mapped.

        Args:
            char_name: Character display name (e.g. ``"Dae (Neciridae)"``).
                Must match a name listed in ``RECOVERY_STYLES`` for a
                non-default result.

        Returns:
            One of the keys in ``RECOVERY_STYLES``; ``"quiet_dignity"`` for
            unrecognised names.

        Example::

            >>> engine = RecoveryEngine()
            >>> engine.get_recovery_style("Dae (Neciridae)")
            'poetic_grief'
            >>> engine.get_recovery_style("Rin (Akane)")
            'stubborn_then_break'
            >>> engine.get_recovery_style("Unknown")
            'quiet_dignity'
        """
        return CHARACTER_RECOVERY_STYLE.get(char_name, "quiet_dignity")

    # ------------------------------------------------------------------
    # Prompt builder
    # ------------------------------------------------------------------

    def get_prompt(
        self,
        char_name: str,
        stage: str,
    ) -> Optional[str]:
        """Build the full recovery system-prompt fragment for one LLM turn.

        Returns ``None`` for an unrecognised stage so callers can treat it
        as a no-op without special-casing an empty string.

        The prompt is composed of four ordered parts:

        1. The personality ``prompt_fragment`` for this character's recovery
           style.
        2. The current stage name in a bracketed header.
        3. A randomly sampled example phrase from the stage's phrase bank,
           prefixed with ``"Example phrase for this stage:"`` so the LLM
           treats it as illustrative rather than verbatim output.
        4. The universal recovery rules.
        5. The ``[RECOVERY_ACTIVE]`` tag, detectable by ``server.py`` to
           trigger XP grants and arc-advancement logic.

        Args:
            char_name: Character display name used for style and stage lookups.
            stage: Current reconciliation stage, as returned by
                ``get_recovery_stage()``.  Must be one of ``RECOVERY_STAGES``.

        Returns:
            A multi-line prompt string when ``stage`` is valid, or ``None``
            for an unrecognised stage value.

        Example::

            >>> engine = RecoveryEngine()
            >>> prompt = engine.get_prompt("Luna (Tsukimi)", "distance")
            >>> prompt is not None
            True
            >>> "[RECOVERY_ACTIVE]" in prompt
            True
            >>> "distance" in prompt
            True
            >>> engine.get_prompt("Luna (Tsukimi)", "bad_stage") is None
            True
        """
        if stage not in RECOVERY_STAGES:
            logger.warning("get_prompt: unrecognised stage %r — returning None", stage)
            return None

        style_key = self.get_recovery_style(char_name)
        style = RECOVERY_STYLES[style_key]
        example_phrase = random.choice(_STAGE_PHRASES[stage])

        logger.debug(
            "recovery prompt for %r: style=%s stage=%s",
            char_name,
            style_key,
            stage,
        )

        prompt = (
            f"{style['prompt_fragment']}\n\n"
            f"[Recovery stage: {stage}]\n"
            f"Example phrase for this stage: \"{example_phrase}\"\n\n"
            f"{_UNIVERSAL_RECOVERY_RULES}\n\n"
            "[RECOVERY_ACTIVE]"
        )
        return prompt

    # ------------------------------------------------------------------
    # Completion check
    # ------------------------------------------------------------------

    def is_complete(self, stage: str) -> bool:
        """Return whether the reconciliation arc has reached its conclusion.

        The arc is considered complete when the active stage is
        ``"deeper_bond"`` — the final and most intimate stage of repair.

        Args:
            stage: Current stage name, as returned by ``get_recovery_stage()``.

        Returns:
            ``True`` only when ``stage == "deeper_bond"``; ``False`` for all
            earlier stages or unrecognised values.

        Example::

            >>> engine = RecoveryEngine()
            >>> engine.is_complete("distance")
            False
            >>> engine.is_complete("tentative")
            False
            >>> engine.is_complete("reconciliation")
            False
            >>> engine.is_complete("deeper_bond")
            True
            >>> engine.is_complete("unknown")
            False
        """
        return stage == "deeper_bond"

    # ------------------------------------------------------------------
    # XP reward
    # ------------------------------------------------------------------

    def get_reconciliation_xp(self) -> int:
        """Return the bond XP awarded for completing the full reconciliation arc.

        The reward is intentionally generous — surviving a conflict and
        repairing the relationship represents a meaningful milestone in the
        bond's history.

        Returns:
            ``20`` — a flat XP bonus granted once when ``is_complete()``
            first returns ``True`` for a given conflict session.

        Example::

            >>> engine = RecoveryEngine()
            >>> engine.get_reconciliation_xp()
            20
        """
        return 20
