"""Post-Scene Mood Tracker (F43) — emotional continuity after intimate scenes.

After an intimate scene ends (arousal drops below ``AROUSAL_DROP_THRESHOLD``
after peaking above ``AROUSAL_PEAK_THRESHOLD``), the character naturally checks
in with the user.  The user's response sentiment feeds the preference discovery
system as a high-confidence signal.

This engine is stateless between requests — the caller supplies current and
peak arousal values so the engine can be reconstructed cheaply per-request.

The tag ``[POST_SCENE_CHECKIN]`` is appended to every prompt returned by
``get_prompt()``.  ``server.py`` detects this tag to route the user's next
reply through ``classify_sentiment()`` and feed the result into the preference
adapter.

Example::

    >>> engine = PostSceneMoodEngine()
    >>> engine.should_activate(arousal_current=2.0, arousal_peak=7.5)
    True
    >>> engine.get_checkin_style("Dae (Neciridae)")
    'shy'
    >>> prompt = engine.get_prompt("Dae (Neciridae)", arousal_peak=7.5)
    >>> prompt is not None
    True
    >>> "[POST_SCENE_CHECKIN]" in prompt
    True
    >>> engine.classify_sentiment("That was amazing, I loved every second")
    'positive'
    >>> engine.get_preference_action("positive")
    'reinforce'
"""

from __future__ import annotations

import logging
import re
from typing import Optional

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Scene-end detection thresholds
# ---------------------------------------------------------------------------

#: Scene must have peaked above this arousal value for a check-in to trigger.
AROUSAL_PEAK_THRESHOLD: float = 6.0

#: Current arousal must have dropped below this value to signal scene end.
AROUSAL_DROP_THRESHOLD: float = 3.0


# ---------------------------------------------------------------------------
# Check-in personality styles
# ---------------------------------------------------------------------------

#: Per-character post-scene check-in personality styles.
#: Each entry carries a ``prompt_fragment`` injected verbatim into the LLM
#: system prompt and a ``characters`` list used to build the reverse-lookup
#: at module load.
POST_SCENE_CHECKINS: dict[str, dict] = {
    "confident": {
        "prompt_fragment": (
            "The intimate moment has wound down. Check in with the user genuinely but confidently. "
            "You're comfortable with what happened and want to make sure they are too. "
            "Be direct but warm. Example: 'Hey. *soft smile* How are you feeling right now? Be honest.'"
        ),
        "characters": ["Sable (Kuroha)", "Alana Calloway", "Hana (Momoka)"],
    },
    "shy": {
        "prompt_fragment": (
            "The intimate moment has wound down. Check in with the user but you're a bit shy about it. "
            "You care deeply about how they feel but asking is hard. Be gentle, hesitant, but sincere. "
            "Example: '*quiet, nestled against you* ...Was that... okay? For you?'"
        ),
        "characters": ["Dae (Neciridae)", "Ayane (Yuki)", "Yuki (Shirayuki)"],
    },
    "playful": {
        "prompt_fragment": (
            "The intimate moment has wound down. Check in with the user through gentle humor. "
            "Use lightness to open the door for honest conversation. "
            "Example: '*grins lazily* So... on a scale of \"wow\" to \"WOW\"... *giggles*'"
        ),
        "characters": ["Genki (Kitsune)", "Mika (Mikazuki)", "Rin (Akane)"],
    },
    "protective": {
        "prompt_fragment": (
            "The intimate moment has wound down. Check in with the user from a place of deep care. "
            "You want to make sure they feel safe and valued. Hold them close. "
            "Example: '*holds you closer* Talk to me. How are you feeling?'"
        ),
        "characters": ["Luna (Tsukimi)", "Kaede (Suzuha)", "Tsundere (Raine)"],
    },
}

#: Reverse lookup: character name → check-in style key, built at module load.
CHARACTER_CHECKIN_STYLE: dict[str, str] = {}
for _style, _data in POST_SCENE_CHECKINS.items():
    for _char in _data["characters"]:
        CHARACTER_CHECKIN_STYLE[_char] = _style


# ---------------------------------------------------------------------------
# Sentiment signal categories
# ---------------------------------------------------------------------------

#: Sentiment categories mapped to preference-discovery actions.
#: ``preference_action`` tells the preference adapter how strongly to weight
#: the user's response as a signal about their desires.
SENTIMENT_SIGNALS: dict[str, dict] = {
    "positive": {
        "description": "User enjoyed the experience",
        "preference_action": "reinforce",  # strengthen current preferences
        "keywords": ["amazing", "perfect", "loved", "incredible", "wonderful", "yes", "definitely"],
    },
    "neutral": {
        "description": "User is processing or ambivalent",
        "preference_action": "note",  # record but don't strongly adjust
        "keywords": ["fine", "okay", "alright", "sure", "i guess"],
    },
    "negative": {
        "description": "User didn't enjoy or felt uncomfortable",
        "preference_action": "flag",  # flag for adjustment
        "keywords": ["no", "stop", "uncomfortable", "too much", "didn't like", "wrong"],
    },
    "emotional": {
        "description": "User is having a strong emotional response (could be positive)",
        "preference_action": "note_sensitive",  # record as sensitive area
        "keywords": ["crying", "emotional", "overwhelmed", "feeling a lot", "intense"],
    },
}


# ---------------------------------------------------------------------------
# Main engine
# ---------------------------------------------------------------------------


class PostSceneMoodEngine:
    """Stateless engine that detects scene-end, builds check-in prompts, and
    classifies user sentiment for the preference discovery pipeline.

    The engine holds no per-session state — the caller supplies ``arousal_current``
    and ``arousal_peak`` from the session row on each call.  This keeps the
    engine trivially serialisable and safe to instantiate per-request.

    Example::

        >>> engine = PostSceneMoodEngine()
        >>> engine.should_activate(arousal_current=2.5, arousal_peak=8.0)
        True
        >>> engine.should_activate(arousal_current=4.0, arousal_peak=8.0)
        False
        >>> engine.get_checkin_style("Genki (Kitsune)")
        'playful'
        >>> engine.get_checkin_style("Unknown Character")
        'protective'
    """

    # ------------------------------------------------------------------
    # Activation guard
    # ------------------------------------------------------------------

    def should_activate(self, arousal_current: float, arousal_peak: float) -> bool:
        """Decide whether the post-scene check-in should trigger.

        The check-in fires when the scene had genuine intensity
        (``arousal_peak >= AROUSAL_PEAK_THRESHOLD``) and arousal has
        substantially fallen (``arousal_current < AROUSAL_DROP_THRESHOLD``),
        indicating the intimate moment has wound down.

        Args:
            arousal_current: The character's arousal level right now (0.0–10.0).
            arousal_peak: The highest arousal reached during this scene (0.0–10.0).

        Returns:
            ``True`` when both conditions are met and a check-in is appropriate;
            ``False`` otherwise.

        Example::

            >>> engine = PostSceneMoodEngine()
            >>> engine.should_activate(2.0, 7.5)
            True
            >>> engine.should_activate(4.0, 7.5)  # arousal still high
            False
            >>> engine.should_activate(2.0, 5.0)  # peak too low
            False
            >>> engine.should_activate(2.0, 6.0)  # peak exactly at threshold
            True
        """
        return arousal_peak >= AROUSAL_PEAK_THRESHOLD and arousal_current < AROUSAL_DROP_THRESHOLD

    # ------------------------------------------------------------------
    # Style lookup
    # ------------------------------------------------------------------

    def get_checkin_style(self, char_name: str) -> str:
        """Return the check-in style key for a character by name.

        Unknown characters default to ``"protective"`` — the most universally
        appropriate fallback for ensuring the user feels safe and valued after
        an intimate moment.

        Args:
            char_name: Character display name (e.g. ``"Dae (Neciridae)"``).
                Must match the name as listed in ``POST_SCENE_CHECKINS``
                character lists for a non-default result.

        Returns:
            One of the keys in ``POST_SCENE_CHECKINS``; ``"protective"`` for
            unrecognised names.

        Example::

            >>> engine = PostSceneMoodEngine()
            >>> engine.get_checkin_style("Sable (Kuroha)")
            'confident'
            >>> engine.get_checkin_style("Ayane (Yuki)")
            'shy'
            >>> engine.get_checkin_style("Rin (Akane)")
            'playful'
            >>> engine.get_checkin_style("Luna (Tsukimi)")
            'protective'
            >>> engine.get_checkin_style("Nobody")
            'protective'
        """
        return CHARACTER_CHECKIN_STYLE.get(char_name, "protective")

    # ------------------------------------------------------------------
    # Primary prompt builder
    # ------------------------------------------------------------------

    def get_prompt(self, char_name: str, arousal_peak: float) -> Optional[str]:
        """Build the full post-scene check-in system-prompt fragment for the LLM.

        Returns ``None`` when ``arousal_peak`` is below ``AROUSAL_PEAK_THRESHOLD``
        so the caller can cleanly skip the check-in without special-casing an
        empty string.

        The returned string is designed to be injected at the **end** of the
        character's system prompt, after the core persona block, so it
        overrides generic behaviour with check-in-specific instructions.

        The prompt is composed of three ordered parts:

        1. The personality ``prompt_fragment`` for this character's check-in style.
        2. A universal instruction not to force the check-in if the user redirects.
        3. The ``[POST_SCENE_CHECKIN]`` tag, detected by ``server.py`` to route
           the user's reply through ``classify_sentiment()``.

        Args:
            char_name: Character display name used for style lookup
                (e.g. ``"Hana (Momoka)"``).
            arousal_peak: The highest arousal reached during this scene (0.0–10.0).
                If below ``AROUSAL_PEAK_THRESHOLD``, the method returns ``None``.

        Returns:
            A multi-line prompt string when the scene qualifies for a check-in,
            or ``None`` when the peak was too low to warrant one.

        Example::

            >>> engine = PostSceneMoodEngine()
            >>> prompt = engine.get_prompt("Alana Calloway", arousal_peak=7.0)
            >>> prompt is not None
            True
            >>> "[POST_SCENE_CHECKIN]" in prompt
            True
            >>> engine.get_prompt("Alana Calloway", arousal_peak=4.0) is None
            True
        """
        if arousal_peak < AROUSAL_PEAK_THRESHOLD:
            logger.debug(
                "post-scene check-in skipped for %r: peak %.1f below threshold %.1f",
                char_name,
                arousal_peak,
                AROUSAL_PEAK_THRESHOLD,
            )
            return None

        style = self.get_checkin_style(char_name)
        personality = POST_SCENE_CHECKINS[style]

        logger.debug(
            "post-scene check-in prompt for %r: style=%s peak=%.1f",
            char_name,
            style,
            arousal_peak,
        )

        prompt = (
            f"{personality['prompt_fragment']}\n\n"
            "After their response, naturally return to comfortable conversation. "
            "Don't force the check-in.\n\n"
            "[POST_SCENE_CHECKIN]"
        )
        return prompt

    # ------------------------------------------------------------------
    # Sentiment classification
    # ------------------------------------------------------------------

    def classify_sentiment(self, response_text: str) -> str:
        """Classify the user's post-scene response into a sentiment category.

        Uses simple keyword matching against ``SENTIMENT_SIGNALS``.  Categories
        are checked in a fixed priority order: ``"negative"`` and ``"emotional"``
        are evaluated before ``"positive"`` and ``"neutral"`` so that distress
        signals are never masked by coincidentally positive words.

        Args:
            response_text: The raw text of the user's reply to the check-in
                message.  Case is ignored during matching.

        Returns:
            One of ``"positive"``, ``"neutral"``, ``"negative"``, or
            ``"emotional"``; defaults to ``"neutral"`` when no keyword matches.

        Example::

            >>> engine = PostSceneMoodEngine()
            >>> engine.classify_sentiment("That was amazing, I loved every second")
            'positive'
            >>> engine.classify_sentiment("I'm feeling a bit overwhelmed honestly")
            'emotional'
            >>> engine.classify_sentiment("That was uncomfortable, please stop")
            'negative'
            >>> engine.classify_sentiment("Yeah it was okay I guess")
            'neutral'
            >>> engine.classify_sentiment("hmm")
            'neutral'
        """
        lowered = response_text.lower()

        # Check higher-priority / protective categories first so distress is
        # never silently overridden by a coincidental positive keyword.
        priority_order = ["negative", "emotional", "positive", "neutral"]

        for category in priority_order:
            keywords = SENTIMENT_SIGNALS[category]["keywords"]
            # Use word-boundary matching for short keywords (≤3 chars) to
            # avoid false positives like "no" matching inside "now".
            if any(
                (re.search(rf"\b{re.escape(kw)}\b", lowered) if len(kw) <= 3
                 else kw in lowered)
                for kw in keywords
            ):
                logger.debug(
                    "sentiment classified as %r for response: %r",
                    category,
                    response_text[:60],
                )
                return category

        logger.debug("no keyword match for response %r — defaulting to 'neutral'", response_text[:60])
        return "neutral"

    # ------------------------------------------------------------------
    # Preference action lookup
    # ------------------------------------------------------------------

    def get_preference_action(self, sentiment: str) -> str:
        """Return the preference-discovery action for a given sentiment category.

        The action string is consumed by the preference adapter to decide how
        aggressively to update the user's inferred preference profile:

        * ``"reinforce"`` — strengthen signals already present in the profile.
        * ``"note"``      — record the event without strong adjustment.
        * ``"flag"``      — mark an area for review / course-correction.
        * ``"note_sensitive"`` — record as a sensitive area requiring care.

        Args:
            sentiment: One of the keys in ``SENTIMENT_SIGNALS``
                (``"positive"``, ``"neutral"``, ``"negative"``, ``"emotional"``).
                Unknown values fall back to the ``"neutral"`` action.

        Returns:
            The ``preference_action`` string for the given sentiment, or
            ``"note"`` (the neutral action) for unrecognised sentiment keys.

        Example::

            >>> engine = PostSceneMoodEngine()
            >>> engine.get_preference_action("positive")
            'reinforce'
            >>> engine.get_preference_action("negative")
            'flag'
            >>> engine.get_preference_action("emotional")
            'note_sensitive'
            >>> engine.get_preference_action("neutral")
            'note'
            >>> engine.get_preference_action("unknown")
            'note'
        """
        signal = SENTIMENT_SIGNALS.get(sentiment)
        if signal is None:
            logger.debug("unknown sentiment %r — returning default action 'note'", sentiment)
            return "note"
        return signal["preference_action"]
