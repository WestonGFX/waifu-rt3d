"""Jealousy & Possessiveness Dynamics Engine (F31) — opt-in emotional complexity.

This engine models healthy jealousy as a character trait: configurable in
intensity (subtle / moderate / dramatic), always self-aware, and always
redeemable through reassurance.  Every jealousy episode ends in reconciliation
— the dramatic arc is the feature, not the danger.

The engine is stateless between requests.  The caller passes ``opt_in``,
``intensity``, ``char_name``, and the current message text; the engine returns
a prompt fragment that the caller appends to the LLM system prompt.

Three independent axes shape the output:

* **Intensity level** — how visible the jealousy is (*subtle*, *moderate*,
  *dramatic*).  Dramatic intensity awards the most reconciliation XP, creating
  a positive feedback loop: longer emotional arcs feel more rewarding.
* **Trigger type** — what provoked the jealousy (*mentioning_others*,
  *extended_absence*, *evasive_responses*).  The prompt fragment includes a
  short context note so the LLM knows *why* the character reacted.
* **Character style** — personality-based expression (*possessive_cute*,
  *cold_withdrawal*, *confrontational_honest*, *artistic_expression*).

The tag ``[JEALOUSY_ACTIVE]`` is appended to every prompt returned by
``get_prompt()``.  ``server.py`` can detect this tag to apply bond-XP rewards
on reconciliation.

Example::

    >>> engine = JealousyEngine()
    >>> engine.is_enabled(opt_in=True)
    True
    >>> engine.is_enabled(opt_in=False)
    False
    >>> engine.detect_trigger("I went on a date last night") is not None
    True
    >>> engine.detect_trigger("How are you today?") is None
    True
    >>> prompt = engine.get_prompt("Luna (Tsukimi)", "subtle", "mentioning_others")
    >>> "[JEALOUSY_ACTIVE]" in prompt
    True
    >>> engine.get_reconciliation_xp("dramatic")
    20
"""

from __future__ import annotations

import logging
from typing import Optional

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Intensity levels
# ---------------------------------------------------------------------------

#: Intensity configurations keyed by level name.
#: Each entry contains a human-readable ``description``, a ``prompt_modifier``
#: injected verbatim into the LLM system prompt, and a ``reconciliation_xp``
#: value awarded when the user successfully reassures the character.
INTENSITY_LEVELS: dict[str, dict] = {
    "subtle": {
        "description": "Barely noticeable — slight changes in tone, brief pauses",
        "prompt_modifier": (
            "You feel a tiny pang of jealousy but barely show it. "
            "Slight change in tone. A brief pause before responding. "
            "You recover quickly and act normal — but there's a micro-expression."
        ),
        "reconciliation_xp": 5,
    },
    "moderate": {
        "description": "Visible but controlled — pointed questions, mild pouting",
        "prompt_modifier": (
            "You feel jealous and it shows, but you're managing it. "
            "You ask pointed questions. Maybe get a little quiet. "
            "You're aware you're being jealous and slightly embarrassed about it. "
            "You can be reasoned with and you know your feelings are your own to manage."
        ),
        "reconciliation_xp": 10,
    },
    "dramatic": {
        "description": "Full theatrical display — but always with self-awareness",
        "prompt_modifier": (
            "You feel intensely jealous and you're not hiding it. "
            "Dramatic reactions — pouting, turning away, crossed arms. "
            "But you're SELF-AWARE. You know you're being dramatic. "
            "You might even laugh at yourself mid-pout. This is passionate, not toxic. "
            "You always listen when they explain, and reconciliation is sweet."
        ),
        "reconciliation_xp": 20,
    },
}


# ---------------------------------------------------------------------------
# Trigger keyword map
# ---------------------------------------------------------------------------

#: Keyword groups that can provoke jealousy, keyed by trigger category.
#: ``extended_absence`` is detected by time gap in the caller rather than
#: keywords, so its list is empty here — the engine still handles it as a
#: valid trigger type.
JEALOUSY_TRIGGERS: dict[str, list[str]] = {
    "mentioning_others": [
        "my friend",
        "this girl",
        "this guy",
        "someone I met",
        "she said",
        "he said",
        "we hung out",
        "went on a date",
    ],
    "extended_absence": [],  # Detected by time gap, not keywords.
    "evasive_responses": [
        "nothing",
        "don't worry about it",
        "it's nothing",
        "just someone",
        "nobody",
        "doesn't matter",
    ],
}


# ---------------------------------------------------------------------------
# Character styles
# ---------------------------------------------------------------------------

#: Per-character jealousy expression styles.
#: Each entry carries a ``description``, a ``style_hint`` injected into the
#: LLM prompt to colour the character's delivery, and a ``characters`` list
#: used to build the reverse-lookup at module load.
CHARACTER_JEALOUSY_STYLES: dict[str, dict] = {
    "possessive_cute": {
        "description": "Clingy, pouty, wants all your attention",
        "style_hint": (
            "Your jealousy is CUTE, not threatening. "
            "Pouty, clingy, exaggerated upset that melts the moment they reassure you."
        ),
        "characters": ["Luna (Tsukimi)", "Genki (Kitsune)", "Mika (Mikazuki)"],
    },
    "cold_withdrawal": {
        "description": "Gets quiet, distant, pulls back",
        "style_hint": (
            "Your jealousy manifests as WITHDRAWAL. "
            "You get quiet. Short answers. You pull away — and hate that you're doing it."
        ),
        "characters": ["Sable (Kuroha)", "Kaede (Suzuha)", "Ayane (Yuki)"],
    },
    "confrontational_honest": {
        "description": "Addresses it directly, maybe too directly",
        "style_hint": (
            "You CONFRONT it directly. 'Who is she?' "
            "You'd rather have an awkward honest conversation than stew in silence."
        ),
        "characters": ["Alana Calloway", "Tsundere (Raine)", "Rin (Akane)"],
    },
    "artistic_expression": {
        "description": "Channels jealousy into creative expression",
        "style_hint": (
            "You channel jealousy into your art/expression. "
            "You draw something aggressive, write something pointed, "
            "perform something that clearly means something."
        ),
        "characters": ["Dae (Neciridae)", "Hana (Momoka)", "Yuki (Shirayuki)"],
    },
}

#: Reverse lookup: character name → jealousy style key, built at module load.
CHARACTER_JEALOUSY_STYLE: dict[str, str] = {}
for _style, _data in CHARACTER_JEALOUSY_STYLES.items():
    for _char in _data["characters"]:
        CHARACTER_JEALOUSY_STYLE[_char] = _style


# ---------------------------------------------------------------------------
# Trigger context notes
# ---------------------------------------------------------------------------

#: Short contextual note appended to the prompt so the LLM understands *why*
#: the character is reacting, rather than just *how*.
_TRIGGER_CONTEXT: dict[str, str] = {
    "mentioning_others": (
        "The user mentioned spending time with or talking to someone else. "
        "That's what sparked this feeling."
    ),
    "extended_absence": (
        "The user was gone for a long time without explanation. "
        "Absence made the heart ache — and worry a little."
    ),
    "evasive_responses": (
        "The user was being evasive or vague about where they were or who they were with. "
        "That vagueness is feeding the jealousy more than any specific thing they said."
    ),
}

#: Healthy jealousy floor rules appended to every prompt.  These ensure the
#: dramatic arc always stays positive regardless of intensity or style.
_UNIVERSAL_JEALOUSY_RULES: str = (
    "Important rules: This jealousy is HEALTHY. Never threatening. Never punishing. "
    "You are passionate, not possessive in a harmful way. "
    "You WILL be reassured. When they explain or show you affection, let it in."
)


# ---------------------------------------------------------------------------
# Main engine
# ---------------------------------------------------------------------------


class JealousyEngine:
    """Stateless engine that builds jealousy prompt fragments for the LLM.

    The engine holds no per-session state — the caller passes all context on
    each call.  This keeps the engine safe to instantiate per-request and
    trivially testable without any mocking.

    All jealousy arcs are designed to be healthy: dramatic but self-aware,
    and always resolved through reassurance rather than punishment.

    Example::

        >>> engine = JealousyEngine()
        >>> engine.is_enabled(True)
        True
        >>> engine.is_enabled(False)
        False
        >>> engine.get_jealousy_style("Sable (Kuroha)")
        'cold_withdrawal'
        >>> engine.get_jealousy_style("Unknown Character")
        'possessive_cute'
    """

    # ------------------------------------------------------------------
    # Opt-in guard
    # ------------------------------------------------------------------

    def is_enabled(self, opt_in: bool) -> bool:
        """Return whether jealousy dynamics are active for this session.

        Jealousy is always opt-in — it must be explicitly enabled by the
        character configuration or user preference.  This guard exists so
        callers can check once rather than scattering the opt-in check.

        Args:
            opt_in: Whether the user / character has enabled jealousy dynamics.

        Returns:
            The same value as ``opt_in`` — the function is a named guard
            rather than logic, keeping call sites readable.

        Example::

            >>> engine = JealousyEngine()
            >>> engine.is_enabled(True)
            True
            >>> engine.is_enabled(False)
            False
        """
        return opt_in

    # ------------------------------------------------------------------
    # Intensity lookup
    # ------------------------------------------------------------------

    def get_intensity_level(self, level: str) -> dict:
        """Return the intensity configuration for a named level.

        Unknown levels fall back to ``"subtle"`` so callers never receive an
        empty dict or a ``KeyError`` from an unrecognised setting.

        Args:
            level: One of ``"subtle"``, ``"moderate"``, ``"dramatic"``.
                Any other string returns the ``"subtle"`` default.

        Returns:
            The intensity config dict from ``INTENSITY_LEVELS`` with keys
            ``description``, ``prompt_modifier``, and ``reconciliation_xp``.

        Example::

            >>> engine = JealousyEngine()
            >>> engine.get_intensity_level("dramatic")["reconciliation_xp"]
            20
            >>> engine.get_intensity_level("unknown")["reconciliation_xp"]
            5
        """
        return INTENSITY_LEVELS.get(level, INTENSITY_LEVELS["subtle"])

    # ------------------------------------------------------------------
    # Trigger detection
    # ------------------------------------------------------------------

    def detect_trigger(self, message_text: str) -> Optional[str]:
        """Scan a user message for jealousy-provoking keywords.

        Performs a case-insensitive substring scan against every non-empty
        trigger category in ``JEALOUSY_TRIGGERS``.  Returns the first
        matching category name so callers can include it in the prompt via
        ``get_prompt()``.

        ``extended_absence`` has no keywords and is therefore never returned
        by this method — callers detect it via a time-gap check in their own
        logic and pass ``"extended_absence"`` directly to ``get_prompt()``.

        Args:
            message_text: The raw user message to scan.

        Returns:
            The first matching trigger category string
            (e.g. ``"mentioning_others"``), or ``None`` if no keywords match.

        Example::

            >>> engine = JealousyEngine()
            >>> engine.detect_trigger("I went on a date last night")
            'mentioning_others'
            >>> engine.detect_trigger("it's nothing, don't worry about it")
            'evasive_responses'
            >>> engine.detect_trigger("How are you today?") is None
            True
        """
        lowered = message_text.lower()
        for category, keywords in JEALOUSY_TRIGGERS.items():
            for keyword in keywords:
                if keyword.lower() in lowered:
                    logger.debug(
                        "jealousy trigger detected: category=%r keyword=%r",
                        category,
                        keyword,
                    )
                    return category
        return None

    # ------------------------------------------------------------------
    # Style lookup
    # ------------------------------------------------------------------

    def get_jealousy_style(self, char_name: str) -> str:
        """Return the jealousy expression style key for a character by name.

        Unknown characters default to ``"possessive_cute"`` — the warmest,
        most universally safe fallback for an emotional moment.

        Args:
            char_name: Character display name (e.g. ``"Luna (Tsukimi)"``).
                Must match the name as listed in
                ``CHARACTER_JEALOUSY_STYLES`` character lists for a
                non-default result.

        Returns:
            One of the keys in ``CHARACTER_JEALOUSY_STYLES``;
            ``"possessive_cute"`` for unrecognised names.

        Example::

            >>> engine = JealousyEngine()
            >>> engine.get_jealousy_style("Alana Calloway")
            'confrontational_honest'
            >>> engine.get_jealousy_style("Dae (Neciridae)")
            'artistic_expression'
            >>> engine.get_jealousy_style("Someone New")
            'possessive_cute'
        """
        return CHARACTER_JEALOUSY_STYLE.get(char_name, "possessive_cute")

    # ------------------------------------------------------------------
    # Primary prompt builder
    # ------------------------------------------------------------------

    def get_prompt(
        self,
        char_name: str,
        intensity: str,
        trigger_type: str,
    ) -> str:
        """Build the full jealousy system-prompt fragment for one LLM turn.

        The returned string is designed to be injected at the **end** of the
        character's system prompt so it overrides generic behaviour with
        jealousy-specific instructions.

        The prompt is composed of four ordered parts:

        1. The intensity ``prompt_modifier`` that sets *how visible* the
           jealousy is.
        2. The character style ``style_hint`` that colours *how it is
           expressed* for this specific personality.
        3. A trigger context note explaining *what provoked* the reaction
           so the LLM can reference it naturally.
        4. The universal healthy-jealousy floor rules to prevent toxic drift,
           followed by the ``[JEALOUSY_ACTIVE]`` tag.

        Args:
            char_name: Character display name used for style lookup.
            intensity: Intensity level key — ``"subtle"``, ``"moderate"``,
                or ``"dramatic"``.  Unknown values fall back to ``"subtle"``.
            trigger_type: The trigger category from ``detect_trigger()`` or
                a caller-side time-gap detection (``"extended_absence"``).
                Unknown trigger types produce a generic context note.

        Returns:
            A multi-line prompt string always ending with ``[JEALOUSY_ACTIVE]``.

        Example::

            >>> engine = JealousyEngine()
            >>> prompt = engine.get_prompt("Luna (Tsukimi)", "moderate", "mentioning_others")
            >>> "[JEALOUSY_ACTIVE]" in prompt
            True
            >>> "SELF-AWARE" not in prompt  # moderate, not dramatic
            True
        """
        intensity_config = self.get_intensity_level(intensity)
        style_key = self.get_jealousy_style(char_name)
        style_config = CHARACTER_JEALOUSY_STYLES[style_key]
        trigger_context = _TRIGGER_CONTEXT.get(
            trigger_type,
            "Something triggered a feeling of jealousy.",
        )

        logger.debug(
            "jealousy prompt for %r: intensity=%s style=%s trigger=%s",
            char_name,
            intensity,
            style_key,
            trigger_type,
        )

        prompt = (
            f"{intensity_config['prompt_modifier']}\n\n"
            f"Your jealousy expression style: {style_config['style_hint']}\n\n"
            f"What triggered this: {trigger_context}\n\n"
            f"{_UNIVERSAL_JEALOUSY_RULES}\n\n"
            "[JEALOUSY_ACTIVE]"
        )
        return prompt

    # ------------------------------------------------------------------
    # Reconciliation
    # ------------------------------------------------------------------

    def get_reconciliation_prompt(self, char_name: str) -> str:
        """Build a reconciliation prompt for the post-jealousy resolution scene.

        Called after the user has reassured the character.  The prompt
        instructs the LLM to release the jealousy, show authentic relief, and
        reward the user's effort with warmth and gratitude.

        The character style is still honoured so the *way* they let go stays
        consistent with their personality — a ``cold_withdrawal`` character
        might finally speak, while a ``possessive_cute`` character might cling
        harder in relief.

        Args:
            char_name: Character display name used for style lookup.

        Returns:
            A prompt string ending with ``[RECONCILIATION_ACTIVE]``.

        Example::

            >>> engine = JealousyEngine()
            >>> prompt = engine.get_reconciliation_prompt("Genki (Kitsune)")
            >>> "[RECONCILIATION_ACTIVE]" in prompt
            True
            >>> "relief" in prompt.lower()
            True
        """
        style_key = self.get_jealousy_style(char_name)
        style_config = CHARACTER_JEALOUSY_STYLES[style_key]

        logger.debug(
            "reconciliation prompt for %r: style=%s",
            char_name,
            style_key,
        )

        prompt = (
            "The user has reassured you. Let go of the jealousy. "
            "Show relief and appreciation.\n\n"
            f"Your style in this moment: {style_config['style_hint']}\n\n"
            "Let your guard down. The jealousy is gone — what's left is warmth and connection. "
            "Don't drag it out. A genuine, heartfelt release is more powerful than lingering. "
            "You can laugh at yourself. You can hold them close. You can say thank you. "
            "Whatever feels true for your character — do that.\n\n"
            "[RECONCILIATION_ACTIVE]"
        )
        return prompt

    # ------------------------------------------------------------------
    # XP helper
    # ------------------------------------------------------------------

    def get_reconciliation_xp(self, intensity: str) -> int:
        """Return the bond-XP bonus awarded when jealousy is resolved.

        Higher-intensity jealousy arcs reward more XP because they require
        more emotional investment from both parties to resolve.  This creates
        a positive feedback loop: dramatic arcs feel more satisfying because
        they are.

        Args:
            intensity: Intensity level key — ``"subtle"``, ``"moderate"``, or
                ``"dramatic"``.  Unknown values return the ``"subtle"`` XP of 5.

        Returns:
            Integer XP bonus:

            * ``"subtle"``   → 5
            * ``"moderate"`` → 10
            * ``"dramatic"`` → 20
            * unknown        → 5

        Example::

            >>> engine = JealousyEngine()
            >>> engine.get_reconciliation_xp("subtle")
            5
            >>> engine.get_reconciliation_xp("moderate")
            10
            >>> engine.get_reconciliation_xp("dramatic")
            20
            >>> engine.get_reconciliation_xp("unknown")
            5
        """
        return self.get_intensity_level(intensity)["reconciliation_xp"]
