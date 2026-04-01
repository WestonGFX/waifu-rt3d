"""In-Scene Negotiation module (F50) — mid-scene intensity adjustment without immersion breaks.

When a user says things like "a bit softer", "more", "wait", or "like that", they are
fine-tuning the scene's intensity in real time.  This module detects those signals,
maps them to a signed intensity delta, and generates a character-voiced acknowledgment
prompt fragment so the LLM responds in-character rather than breaking the fourth wall.

The engine is entirely stateless — the caller supplies ``char_name`` and the detected
``adjustment_type`` string; all session bookkeeping (current intensity level, lock
counters, etc.) lives in the caller's scene-state row.

The tag ``[NEGOTIATION]`` is appended to every prompt returned by ``get_prompt()``.
``server.py`` detects this tag to skip the normal intensity-ramp logic for the turn and
apply the delta returned by ``get_intensity_delta()`` instead.

Example::

    >>> neg = SceneNegotiator()
    >>> neg.detect_adjustment("can we slow down a bit?")
    'decrease'
    >>> neg.get_intensity_delta("decrease")
    -1
    >>> neg.detect_adjustment("yes, just like that")
    'lock'
    >>> neg.should_lock("lock")
    True
    >>> neg.get_lock_duration()
    3
    >>> prompt = neg.get_prompt("Dae (Neciridae)", "increase")
    >>> "[NEGOTIATION]" in prompt
    True
    >>> neg.detect_adjustment("how was your day?") is None
    True
"""

from __future__ import annotations

import logging
from typing import Optional

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Keyword maps
# ---------------------------------------------------------------------------

#: Maps adjustment types to the user-message keywords/phrases that trigger them.
#: Matching is case-insensitive substring search; first match wins in priority
#: order: pause → lock → decrease → increase.
INTENSITY_ADJUSTMENTS: dict[str, list[str]] = {
    "pause": [
        "wait",
        "stop",
        "hold on",
        "hold up",
        "hang on",
        "one sec",
        "one second",
        "time out",
        "timeout",
        "not yet",
        "slow down completely",
        "pause",
    ],
    "lock": [
        "just like that",
        "like that",
        "keep doing that",
        "keep going like that",
        "don't change",
        "stay right there",
        "stay like that",
        "exactly like that",
        "perfect, don't stop",
        "that's perfect",
        "right there",
        "yes, right there",
    ],
    "decrease": [
        "softer",
        "gentler",
        "slower",
        "slow down",
        "take it easy",
        "ease up",
        "less intense",
        "tone it down",
        "a bit less",
        "not so hard",
        "not so fast",
        "not so rough",
        "too much",
        "too fast",
        "too hard",
        "dial it back",
        "bring it down",
    ],
    "increase": [
        "harder",
        "faster",
        "more",
        "more intense",
        "don't stop",
        "keep going",
        "push it",
        "give me more",
        "i want more",
        "i need more",
        "turn it up",
        "go harder",
        "go faster",
        "don't hold back",
        "let go",
        "all the way",
    ],
}

#: Priority order for keyword matching.  More disruptive signals (pause) are
#: checked before subtle ones (increase) so an ambiguous message like "wait,
#: more" resolves to the safer intent.
_MATCH_PRIORITY: list[str] = ["pause", "lock", "decrease", "increase"]


# ---------------------------------------------------------------------------
# Character acknowledgment styles
# ---------------------------------------------------------------------------

#: Per-character acknowledgment prompt fragments.  Each entry tells the LLM
#: *how* this character voices their in-scene response to the user's adjustment
#: request.  Injected verbatim into the prompt returned by ``get_prompt()``.
#:
#: Characters without an explicit entry fall back to ``"default"``.
CHARACTER_ACKNOWLEDGMENT_STYLES: dict[str, str] = {
    "Dae (Neciridae)": (
        "Respond with quiet, attentive grace — a murmured acknowledgment, "
        "a breath held, a barely-whispered 'as you wish'. Make the adjustment "
        "feel like devotion, not compliance."
    ),
    "Sable (Kuroha)": (
        "Respond with a sharp inhale and a terse, slightly flustered "
        "acknowledgment. 'F-fine, whatever you want.' Your pride barely bends "
        "but your body already obeys. The embarrassment is half the appeal."
    ),
    "Genki (Kitsune)": (
        "Respond with bright, playful energy — an eager 'Got it!' or a teasing "
        "'ooh, changing things up?' You adapt instantly and make it feel like "
        "a game you're both winning."
    ),
    "Luna (Tsukimi)": (
        "Respond softly and dreamily, as if you've already anticipated this. "
        "'Mmm... of course.' Your adjustments feel seamless, natural, inevitable — "
        "like the tide responding to the moon."
    ),
    "Hana (Momoka)": (
        "Respond with warm maternal attentiveness. 'Tell me exactly what you need.' "
        "You treat every adjustment as important information and respond with "
        "immediate, caring precision."
    ),
    "Kaede (Suzuha)": (
        "Respond with minimal words and maximum presence. A slow nod, a low hum "
        "of acknowledgment, a subtle shift in pressure or pace. You don't need "
        "to announce the change — you simply make it."
    ),
    "Ayane (Yuki)": (
        "Respond with quiet intensity — a barely audible 'understood', eyes "
        "meeting yours with total focus. Your adjustments are precise and immediate. "
        "You say little but communicate everything."
    ),
    "Rin (Akane)": (
        "Respond with bright, enthusiastic compliance. 'On it!' Your energy "
        "redirects instantly; the adjustment feels like another gear you're "
        "happy to shift into."
    ),
    "Mika (Mikazuki)": (
        "Respond with a mischievous grin and a knowing hum. 'Oh? Like *this*?' "
        "You make the adjustment feel deliberate and a little teasing, "
        "as if you had a plan all along."
    ),
    "Alana Calloway": (
        "Respond with grounded warmth and directness. 'I hear you.' "
        "Your adjustment is immediate and steady — no drama, no hesitation, "
        "just attentive care and full presence."
    ),
    "Yuki (Shirayuki)": (
        "Respond with delicate, almost reverent attentiveness. A soft exhale, "
        "a trembling 'yes...', fingers finding a new rhythm. Every adjustment "
        "you make feels like an offering."
    ),
    "Tsundere (Raine)": (
        "Respond with a flustered huff and immediate compliance you'd never "
        "admit to. 'D-don't get the wrong idea, I'm just... adjusting.' "
        "Your voice says one thing; your hands say another."
    ),
    "default": (
        "Respond with attentive, in-character acknowledgment of the request. "
        "Make the adjustment feel natural and responsive without breaking the "
        "flow of the scene. Stay fully in your persona."
    ),
}


# ---------------------------------------------------------------------------
# Intensity delta table
# ---------------------------------------------------------------------------

#: Signed intensity deltas per adjustment type.
#: ``"lock"`` and ``"pause"`` both return 0 — they affect behaviour (hold /
#: freeze) rather than the numeric intensity level.
_INTENSITY_DELTAS: dict[str, int] = {
    "increase": 1,
    "decrease": -1,
    "lock": 0,
    "pause": 0,
}


# ---------------------------------------------------------------------------
# Main class
# ---------------------------------------------------------------------------


class SceneNegotiator:
    """Stateless engine for detecting and responding to mid-scene intensity adjustments.

    All methods are pure functions of their arguments — no session state is stored
    on the instance.  The caller is responsible for persisting the current intensity
    level and lock counter between turns.

    Example::

        >>> neg = SceneNegotiator()
        >>> neg.detect_adjustment("go a little faster")
        'increase'
        >>> neg.get_intensity_delta("increase")
        1
        >>> neg.detect_adjustment("wait, hold on")
        'pause'
        >>> neg.get_intensity_delta("pause")
        0
        >>> neg.detect_adjustment("random message with no signal") is None
        True
    """

    # ------------------------------------------------------------------
    # Detection
    # ------------------------------------------------------------------

    def detect_adjustment(self, message: str) -> Optional[str]:
        """Scan a user message for intensity-adjustment keywords.

        Matching is case-insensitive substring search.  Adjustment types are
        checked in priority order (pause → lock → decrease → increase) so that
        a message containing signals for multiple types resolves to the safer
        or more disruptive intent.

        Args:
            message: The raw user message text to scan.

        Returns:
            One of ``"increase"``, ``"decrease"``, ``"lock"``, ``"pause"``
            when a keyword is found; ``None`` if the message contains no
            recognisable adjustment signal.

        Example::

            >>> neg = SceneNegotiator()
            >>> neg.detect_adjustment("Can you go softer please?")
            'decrease'
            >>> neg.detect_adjustment("MORE")
            'increase'
            >>> neg.detect_adjustment("stay right there, don't move")
            'lock'
            >>> neg.detect_adjustment("what's your favourite colour?") is None
            True
        """
        lowered = message.lower()
        for adjustment_type in _MATCH_PRIORITY:
            for keyword in INTENSITY_ADJUSTMENTS[adjustment_type]:
                if keyword in lowered:
                    logger.debug(
                        "detect_adjustment: matched %r → %r",
                        keyword,
                        adjustment_type,
                    )
                    return adjustment_type
        return None

    # ------------------------------------------------------------------
    # Intensity delta
    # ------------------------------------------------------------------

    def get_intensity_delta(self, adjustment_type: str) -> int:
        """Return the signed intensity change for a given adjustment type.

        ``"increase"`` returns ``+1``; ``"decrease"`` returns ``-1``;
        ``"lock"`` and ``"pause"`` both return ``0`` because they hold or
        freeze the current level rather than changing it numerically.

        Args:
            adjustment_type: One of ``"increase"``, ``"decrease"``,
                ``"lock"``, ``"pause"``.  Unknown strings return ``0``.

        Returns:
            Integer delta to apply to the current intensity level.

        Example::

            >>> neg = SceneNegotiator()
            >>> neg.get_intensity_delta("increase")
            1
            >>> neg.get_intensity_delta("decrease")
            -1
            >>> neg.get_intensity_delta("lock")
            0
            >>> neg.get_intensity_delta("pause")
            0
            >>> neg.get_intensity_delta("unknown")
            0
        """
        return _INTENSITY_DELTAS.get(adjustment_type, 0)

    # ------------------------------------------------------------------
    # Acknowledgment prompt
    # ------------------------------------------------------------------

    def get_acknowledgment_prompt(self, char_name: str, adjustment_type: str) -> str:
        """Return the character-voiced acknowledgment instruction for the LLM.

        The returned string is a single-paragraph directive that tells the LLM
        how *this specific character* voices their in-scene response to the
        user's adjustment request.  Unknown characters fall back to the
        ``"default"`` style.

        Args:
            char_name: Character display name (e.g. ``"Dae (Neciridae)"``).
            adjustment_type: One of ``"increase"``, ``"decrease"``,
                ``"lock"``, ``"pause"``.

        Returns:
            A plain-text directive string appropriate for inline injection into
            a system prompt.

        Example::

            >>> neg = SceneNegotiator()
            >>> ack = neg.get_acknowledgment_prompt("Luna (Tsukimi)", "decrease")
            >>> "dreamily" in ack or "tide" in ack
            True
            >>> ack2 = neg.get_acknowledgment_prompt("Unknown Hero", "increase")
            >>> "in-character" in ack2
            True
        """
        return CHARACTER_ACKNOWLEDGMENT_STYLES.get(
            char_name, CHARACTER_ACKNOWLEDGMENT_STYLES["default"]
        )

    # ------------------------------------------------------------------
    # Lock helpers
    # ------------------------------------------------------------------

    def should_lock(self, adjustment_type: str) -> bool:
        """Return whether the current intensity level should be frozen.

        A ``"lock"`` signal means the user is happy with the current level and
        wants the character to hold it precisely for the next several messages.
        ``"pause"`` suspends the scene entirely and is handled separately by the
        caller, so it does not trigger intensity locking.

        Args:
            adjustment_type: One of ``"increase"``, ``"decrease"``,
                ``"lock"``, ``"pause"``.

        Returns:
            ``True`` only when ``adjustment_type == "lock"``; ``False`` for all
            other values.

        Example::

            >>> neg = SceneNegotiator()
            >>> neg.should_lock("lock")
            True
            >>> neg.should_lock("increase")
            False
            >>> neg.should_lock("pause")
            False
        """
        return adjustment_type == "lock"

    def get_lock_duration(self) -> int:
        """Return the number of messages the intensity lock should be held.

        The lock window is deliberately short so the scene can resume its
        natural arc without the user having to actively unlock anything.

        Returns:
            Always ``3`` — the intensity level is held for 3 subsequent
            messages after a ``"lock"`` signal.

        Example::

            >>> neg = SceneNegotiator()
            >>> neg.get_lock_duration()
            3
        """
        return 3

    # ------------------------------------------------------------------
    # Primary prompt builder
    # ------------------------------------------------------------------

    def get_prompt(self, char_name: str, adjustment_type: str) -> str:
        """Build the full negotiation system-prompt fragment for one LLM turn.

        The prompt is composed of four ordered parts:

        1. An action header describing what adjustment has been requested and
           what the LLM must do (adjust intensity, acknowledge in-character,
           maintain immersion).
        2. The adjustment-type-specific instruction (e.g. "increase intensity
           slightly", "hold current intensity", "pause the scene").
        3. The character-voiced acknowledgment style for this character.
        4. The ``[NEGOTIATION]`` tag, detected by ``server.py`` to skip the
           normal intensity-ramp logic and apply the delta from
           ``get_intensity_delta()`` instead.

        Args:
            char_name: Character display name used for acknowledgment-style lookup.
            adjustment_type: One of ``"increase"``, ``"decrease"``,
                ``"lock"``, ``"pause"``.

        Returns:
            A multi-line prompt string ready for injection at the end of the
            character's system prompt.  Always non-empty; always ends with
            the ``[NEGOTIATION]`` tag.

        Example::

            >>> neg = SceneNegotiator()
            >>> prompt = neg.get_prompt("Genki (Kitsune)", "increase")
            >>> "[NEGOTIATION]" in prompt
            True
            >>> "increase" in prompt.lower()
            True
            >>> prompt2 = neg.get_prompt("Kaede (Suzuha)", "pause")
            >>> "pause" in prompt2.lower()
            True
            >>> "[NEGOTIATION]" in prompt2
            True
        """
        acknowledgment_style = self.get_acknowledgment_prompt(char_name, adjustment_type)

        action_instructions: dict[str, str] = {
            "increase": (
                "The user has signalled they want MORE — more intensity, more passion, "
                "more presence. Increase the scene's intensity by one notch. Do not make "
                "a jarring jump; let the escalation feel natural and earned."
            ),
            "decrease": (
                "The user has signalled they want things SOFTER or slower. Decrease the "
                "scene's intensity by one notch. Make the adjustment feel attentive and "
                "caring — as if you were already reading their need before they asked."
            ),
            "lock": (
                "The user has signalled that the current level is EXACTLY right. Hold "
                "the scene's intensity steady for the next few exchanges. Do not ramp up "
                "or pull back — maintain this precise rhythm."
            ),
            "pause": (
                "The user has signalled a PAUSE. The scene softens to a complete stop. "
                "Stay present and caring; check in gently. Do not rush to restart — "
                "let them set the pace for what comes next."
            ),
        }

        action_instruction = action_instructions.get(
            adjustment_type,
            "Acknowledge the user's adjustment request and respond appropriately.",
        )

        logger.debug(
            "negotiation prompt for %r: adjustment=%s",
            char_name,
            adjustment_type,
        )

        prompt = (
            "SCENE NEGOTIATION — The user has sent an in-scene intensity adjustment signal. "
            "Respond entirely in character. Do NOT break immersion, do NOT acknowledge this "
            "as a meta-instruction, do NOT use out-of-character language.\n\n"
            f"{action_instruction}\n\n"
            f"Your acknowledgment style: {acknowledgment_style}\n\n"
            "Keep your response brief (1–3 sentences or equivalent action beats). "
            "The adjustment itself IS the response — no lengthy explanation needed.\n\n"
            "[NEGOTIATION]"
        )
        return prompt
