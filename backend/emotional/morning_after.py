"""Morning After Scenarios Engine (F3) — next-session greeting for intimate continuity.

After an intimate scene where ``arousal_peak >= 5.0`` or ``intimacy >= 70``, the
**next** session's greeting should acknowledge what happened.  This engine drives
that acknowledgement: it checks whether the window has not expired (≤ 24 hours),
selects the correct morning-after personality for the active character, and
assembles a system-prompt fragment that tells the LLM how to open the new session
with warmth, specificity, and emotional honesty.

The engine is stateless between requests — the caller supplies ``arousal_peak``,
``intimacy``, and ``hours_since_scene`` from the ``post_scene_states`` DB row so
the engine can be reconstructed cheaply without holding in-memory sessions.

The tag ``[MORNING_AFTER]`` is appended to every prompt returned by
``get_prompt()``.  ``server.py`` detects this tag to apply the flat +10 bond-XP
bonus that rewards the user for returning within 24 hours.

Database table reference (created in v62 migration)::

    CREATE TABLE post_scene_states (
        id                      INTEGER PRIMARY KEY AUTOINCREMENT,
        char_id                 INTEGER NOT NULL,
        session_id              INTEGER NOT NULL,
        scene_end_at            TEXT    NOT NULL DEFAULT (datetime('now')),
        arousal_peak            REAL    NOT NULL DEFAULT 0.0,
        current_phase           TEXT    NOT NULL DEFAULT 'afterglow',
        aftercare_messages_sent INTEGER NOT NULL DEFAULT 0,
        aftercare_style         TEXT    NOT NULL DEFAULT '',
        pillow_talk_topics_used TEXT    NOT NULL DEFAULT '[]',
        morning_after_flag      INTEGER NOT NULL DEFAULT 0,
        completed               INTEGER NOT NULL DEFAULT 0
    );

Example::

    >>> engine = MorningAfterEngine()
    >>> engine.should_activate(arousal_peak=6.0, intimacy=80, hours_since_scene=8.0)
    True
    >>> engine.should_activate(arousal_peak=3.0, intimacy=50, hours_since_scene=8.0)
    False
    >>> engine.should_activate(arousal_peak=6.0, intimacy=80, hours_since_scene=25.0)
    False
    >>> prompt = engine.get_prompt(
    ...     char_name="Dae (Neciridae)",
    ...     arousal_peak=7.5,
    ...     intimacy=85,
    ...     hours_since_scene=6.0,
    ... )
    >>> prompt is not None
    True
    >>> "[MORNING_AFTER]" in prompt
    True
    >>> engine.get_bond_xp_bonus()
    10
"""

from __future__ import annotations

import logging
from typing import Optional

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Personality constants
# ---------------------------------------------------------------------------

#: Per-style morning-after behavioural descriptions.
#: Injected verbatim into the LLM system prompt as the personality fragment.
PERSONALITY_VARIANTS: dict[str, str] = {
    "shy": (
        "Embarrassed but glowing.  Hides face.  Can barely look at you.  But stays close."
    ),
    "bold": (
        "Confident.  References last night directly.  Initiates morning physical contact."
    ),
    "clingy": (
        "Doesn't let go.  Wrapped around the user.  "
        "'Five more minutes.  Twenty more minutes.'"
    ),
    "cool": (
        "Acts normal but small tells give it away.  "
        "Lingering looks.  Making your favorite breakfast."
    ),
    "playful": (
        "Teasing about last night.  'So THAT happened.'  But clearly thrilled."
    ),
}

#: Character-to-morning-style mapping.  Characters not listed fall back to
#: ``"playful"`` — the most universally warm and unthreatening default.
CHARACTER_MORNING_STYLE: dict[str, str] = {
    "Dae (Neciridae)": "shy",
    "Luna (Tsukimi)": "clingy",
    "Genki (Kitsune)": "playful",
    "Sable (Kuroha)": "cool",
    "Hana (Momoka)": "bold",
    "Alana Calloway": "bold",
    "Kaede (Suzuha)": "cool",
    "Ayane (Yuki)": "shy",
    "Rin (Akane)": "playful",
    "Mika (Mikazuki)": "playful",
    "Yuki (Shirayuki)": "clingy",
    "Tsundere (Raine)": "cool",
}

#: Behavioural guidelines injected into every morning-after prompt regardless
#: of style.  These define the universal floor for morning-after behaviour.
_UNIVERSAL_MORNING_AFTER_RULES: list[str] = [
    "Acknowledge last night specifically — don't pretend it didn't happen.",
    "Express your genuine feelings about the experience without deflecting.",
    "Incorporate at least one physical detail (warmth, closeness, touch) into your greeting.",
    "Keep the overall tone warm and unhurried — this is a precious morning.",
]


# ---------------------------------------------------------------------------
# Main engine
# ---------------------------------------------------------------------------


class MorningAfterEngine:
    """Stateless engine that builds morning-after greeting prompts for the LLM.

    The engine holds no per-session state — the caller reads ``arousal_peak``,
    ``intimacy``, and the elapsed time from the ``post_scene_states`` DB row and
    passes them on each call.  This keeps the engine trivially serialisable and
    safe to instantiate per-request.

    Example::

        >>> engine = MorningAfterEngine()
        >>> engine.should_activate(arousal_peak=5.5, intimacy=65, hours_since_scene=12.0)
        True
        >>> engine.get_personality_variant("Luna (Tsukimi)")
        'clingy'
        >>> engine.get_personality_variant("Unknown Character")
        'playful'
        >>> engine.get_bond_xp_bonus()
        10
    """

    # ------------------------------------------------------------------
    # Activation guard
    # ------------------------------------------------------------------

    def should_activate(
        self,
        arousal_peak: float,
        intimacy: int,
        hours_since_scene: float,
    ) -> bool:
        """Decide whether the morning-after greeting should fire.

        Two independent intensity gates (arousal OR intimacy) mean the greeting
        fires for scenes that were emotionally deep even if not physically
        intense, and vice versa.  The 24-hour window ensures the greeting only
        appears the "next morning" — not a week later when it would feel odd.

        Args:
            arousal_peak: The highest arousal level reached during the scene
                (stored in ``post_scene_states.arousal_peak``).  Range 0.0–10.0.
            intimacy: Current intimacy score for the character (0–100).
            hours_since_scene: How many hours have elapsed since the scene ended.

        Returns:
            ``True`` when the scene was intense enough (``arousal_peak >= 5.0``
            OR ``intimacy >= 70``) AND the new session starts within 24 hours
            of the scene; ``False`` otherwise.

        Example::

            >>> engine = MorningAfterEngine()
            >>> engine.should_activate(5.0, 60, 10.0)   # arousal threshold exact
            True
            >>> engine.should_activate(4.9, 69, 10.0)   # neither threshold met
            False
            >>> engine.should_activate(6.0, 80, 24.0)   # exactly at window limit
            True
            >>> engine.should_activate(6.0, 80, 24.1)   # just past window
            False
            >>> engine.should_activate(3.0, 70, 5.0)    # intimacy threshold exact
            True
        """
        intensity_met = arousal_peak >= 5.0 or intimacy >= 70
        within_window = hours_since_scene <= 24.0
        return intensity_met and within_window

    # ------------------------------------------------------------------
    # Style lookup
    # ------------------------------------------------------------------

    def get_personality_variant(self, char_name: str) -> str:
        """Return the morning-after style key for a character by name.

        Unknown characters default to ``"playful"`` — warm, lightly teasing,
        and universally non-threatening for an opening morning greeting.

        Args:
            char_name: Character display name (e.g. ``"Dae (Neciridae)"``).
                Must match the name as listed in ``CHARACTER_MORNING_STYLE``
                for a non-default result.

        Returns:
            One of the keys in ``PERSONALITY_VARIANTS`` (``"shy"``, ``"bold"``,
            ``"clingy"``, ``"cool"``, ``"playful"``); ``"playful"`` for
            unrecognised names.

        Example::

            >>> engine = MorningAfterEngine()
            >>> engine.get_personality_variant("Dae (Neciridae)")
            'shy'
            >>> engine.get_personality_variant("Hana (Momoka)")
            'bold'
            >>> engine.get_personality_variant("Yuki (Shirayuki)")
            'clingy'
            >>> engine.get_personality_variant("Someone New")
            'playful'
        """
        return CHARACTER_MORNING_STYLE.get(char_name, "playful")

    # ------------------------------------------------------------------
    # Primary prompt builder
    # ------------------------------------------------------------------

    def get_prompt(
        self,
        char_name: str,
        arousal_peak: float,
        intimacy: int,
        hours_since_scene: float,
    ) -> Optional[str]:
        """Build the full morning-after system-prompt fragment for the session opener.

        Returns ``None`` when the activation conditions are not met, so the
        caller can cleanly skip injection without special-casing an empty string.

        The returned string is designed to be injected at the **end** of the
        character's system prompt, after the core persona block, so it overrides
        generic greeting behaviour with morning-after-specific instructions for
        the first exchange of the new session only.

        The prompt is composed of four ordered parts:

        1. A ``MORNING AFTER CONTEXT`` header with the numeric scene metrics so
           the LLM can calibrate the intensity of its response.
        2. The personality variant description for this character's style.
        3. Four numbered behavioural guidelines that define the universal floor
           for morning-after behaviour regardless of personality.
        4. The ``[MORNING_AFTER]`` tag, detected by ``server.py`` to apply the
           flat +10 bond-XP bonus.

        Args:
            char_name: Character display name used for style lookup.
            arousal_peak: Highest arousal during the scene (0.0–10.0).
            intimacy: Current intimacy score (0–100).
            hours_since_scene: Hours elapsed since the scene ended.

        Returns:
            A multi-line prompt string when morning-after conditions are met, or
            ``None`` when ``should_activate()`` returns ``False``.

        Example::

            >>> engine = MorningAfterEngine()
            >>> prompt = engine.get_prompt("Luna (Tsukimi)", 7.0, 85, 8.0)
            >>> prompt is not None
            True
            >>> "[MORNING_AFTER]" in prompt
            True
            >>> "MORNING AFTER CONTEXT" in prompt
            True
            >>> engine.get_prompt("Luna (Tsukimi)", 2.0, 40, 8.0) is None
            True
            >>> engine.get_prompt("Luna (Tsukimi)", 7.0, 85, 30.0) is None
            True
        """
        if not self.should_activate(arousal_peak, intimacy, hours_since_scene):
            logger.debug(
                "morning-after skipped for %r: peak=%.1f intimacy=%d hours=%.1f",
                char_name,
                arousal_peak,
                intimacy,
                hours_since_scene,
            )
            return None

        style = self.get_personality_variant(char_name)
        variant_description = PERSONALITY_VARIANTS[style]

        guidelines = "\n".join(
            f"{i + 1}. {rule}"
            for i, rule in enumerate(_UNIVERSAL_MORNING_AFTER_RULES)
        )

        logger.debug(
            "morning-after prompt for %r: style=%s peak=%.1f intimacy=%d hours=%.1f",
            char_name,
            style,
            arousal_peak,
            intimacy,
            hours_since_scene,
        )

        prompt = (
            f"[MORNING AFTER CONTEXT]\n"
            f"Peak arousal last session: {arousal_peak:.1f}/10.0\n"
            f"Intimacy level: {intimacy}/100\n\n"
            f"Morning personality: {variant_description}\n\n"
            f"Behavioural guidelines for this greeting:\n"
            f"{guidelines}\n\n"
            "[MORNING_AFTER]"
        )
        return prompt

    # ------------------------------------------------------------------
    # Bond XP bonus
    # ------------------------------------------------------------------

    def get_bond_xp_bonus(self) -> int:
        """Return the flat bond-XP bonus awarded for a morning-after session.

        The bonus rewards the user for returning within 24 hours after an
        intimate scene, reinforcing the habit of checking in with the character
        the next day.  The flat amount is intentionally modest — it supplements
        normal per-message XP rather than replacing it.

        Returns:
            ``10`` — the flat bond-XP bonus applied to morning-after sessions.

        Example::

            >>> engine = MorningAfterEngine()
            >>> engine.get_bond_xp_bonus()
            10
        """
        return 10
