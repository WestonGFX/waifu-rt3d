"""Rule-based conversation context classifier for adaptive AI companion behaviour.

Classifies each user message into one of seven conversation context types using
keyword heuristics and pre-computed signal values (sentiment, emoji count,
question count).  No LLM call is made — the entire classification is
synchronous, pure, and side-effect-free.

The classification drives the adaptive parameter tuner in
``backend/adaptive/param_tuner.py``, which maps each context type to a set of
LLM generation parameters (temperature, repetition penalty, etc.) that best
suit the conversational register.

Context types (evaluated in priority order):
    1. ``comfort_reassurance`` — acute distress, user needs calming
    2. ``emotional_support``   — sadness or negative affect (broader net)
    3. ``factual_qa``          — information-seeking questions
    4. ``creative_roleplay``   — imaginative / in-character exchanges
    5. ``deep_philosophical``  — reflective, long-form inquiry
    6. ``playful_flirty``      — high-energy, positive, teasing tone
    7. ``casual_chat``         — default fallback

All public functions are pure — they take only plain Python values and return
plain Python values.  Import only :mod:`re` and :mod:`logging` from stdlib.

Example:
    >>> from backend.adaptive.context_classifier import classify_context
    >>> classify_context("I feel so sad today", -0.3, 0, 0)
    'emotional_support'
    >>> classify_context("What is the capital of France?", 0.0, 0, 1)
    'factual_qa'
    >>> classify_context("*hugs you tightly* let's pretend we're in a forest", 0.1, 0, 0)
    'creative_roleplay'
"""

from __future__ import annotations

import logging
import re

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Valid context type identifiers
# ---------------------------------------------------------------------------

CONTEXTS: tuple[str, ...] = (
    "emotional_support",
    "casual_chat",
    "creative_roleplay",
    "deep_philosophical",
    "playful_flirty",
    "factual_qa",
    "comfort_reassurance",
)

# ---------------------------------------------------------------------------
# Compiled regex patterns (module-level, initialised once)
# ---------------------------------------------------------------------------

# Matches *action* style roleplay markers (anything surrounded by asterisks).
_ROLEPLAY_ACTION_RE: re.Pattern[str] = re.compile(r"\*[^*]+\*")

# ---------------------------------------------------------------------------
# Keyword sets — frozensets for O(1) membership tests
# ---------------------------------------------------------------------------

# Triggers comfort_reassurance when combined with strong negative sentiment.
_COMFORT_KEYWORDS: frozenset[str] = frozenset(
    {
        "scared",
        "worried",
        "anxious",
        "help me",
        "afraid",
        "panic",
        "panicking",
        "nervous",
        "terrified",
        "frightened",
        "overwhelmed",
        "can't cope",
        "freaking out",
    }
)

# Triggers emotional_support on moderate negative sentiment or keyword match.
_SADNESS_KEYWORDS: frozenset[str] = frozenset(
    {
        "sad",
        "lonely",
        "miss",
        "feel",
        "depressed",
        "crying",
        "hurt",
        "broken",
        "empty",
        "hopeless",
        "miserable",
        "upset",
        "heartbroken",
        "grief",
    }
)

# Triggers factual_qa when question_count >= 1 and phrase appears in message.
_FACTUAL_PHRASES: frozenset[str] = frozenset(
    {
        "what is",
        "what are",
        "how do",
        "how does",
        "explain",
        "tell me about",
        "define",
        "who is",
        "who are",
        "where is",
        "where are",
        "when did",
        "why does",
        "what's",
        "how's",
    }
)

# Triggers creative_roleplay (non-asterisk markers).
_ROLEPLAY_KEYWORDS: frozenset[str] = frozenset(
    {
        "imagine",
        "pretend",
        "let's say",
        "in character",
        "roleplay",
        "role play",
        "role-play",
        "/me ",
        "act as",
        "play as",
        "scenario",
        "fantasy",
    }
)

# Triggers deep_philosophical when combined with message length > 100.
_DEPTH_KEYWORDS: frozenset[str] = frozenset(
    {
        "meaning",
        "purpose",
        "think about",
        "philosophy",
        "existence",
        "consciousness",
        "moral",
        "ethics",
        "truth",
        "reality",
        "soul",
        "identity",
        "free will",
        "life and death",
    }
)

# Triggers playful_flirty when combined with emoji count >= 2 and positive
# sentiment > 0.2.
_FLIRT_KEYWORDS: frozenset[str] = frozenset(
    {
        "cute",
        "flirt",
        "tease",
        "wink",
        "kiss",
        "hug",
        "blush",
        "adorable",
        "smooch",
        "cuddle",
        "sweet",
        "darling",
        "handsome",
    }
)

# Mood states that boost certain context classifications.
_INTIMATE_MOOD_STATES: frozenset[str] = frozenset(
    {
        "romantic",
        "flirty",
        "tender",
        "affectionate",
    }
)

_DISTRESSED_MOOD_STATES: frozenset[str] = frozenset(
    {
        "sad",
        "anxious",
        "melancholy",
        "fearful",
        "depressed",
    }
)

# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------


def _lower(text: str) -> str:
    """Return *text* in lowercase for case-insensitive keyword matching.

    Args:
        text: Input string of any length.

    Returns:
        Lowercased copy of *text*.
    """
    return text.lower()


def _has_comfort_keyword(lower_msg: str) -> bool:
    """Return True when *lower_msg* contains any comfort/reassurance keyword.

    Args:
        lower_msg: Lowercased user message.

    Returns:
        ``True`` if at least one comfort keyword is present.
    """
    return any(kw in lower_msg for kw in _COMFORT_KEYWORDS)


def _has_sadness_keyword(lower_msg: str) -> bool:
    """Return True when *lower_msg* contains any sadness/emotional keyword.

    Args:
        lower_msg: Lowercased user message.

    Returns:
        ``True`` if at least one sadness keyword is present.
    """
    return any(kw in lower_msg for kw in _SADNESS_KEYWORDS)


def _has_factual_phrase(lower_msg: str) -> bool:
    """Return True when *lower_msg* contains a factual-question opener.

    Args:
        lower_msg: Lowercased user message.

    Returns:
        ``True`` if at least one factual phrase is found.
    """
    return any(phrase in lower_msg for phrase in _FACTUAL_PHRASES)


def _has_roleplay_marker(msg: str, lower_msg: str) -> bool:
    """Return True when *msg* or *lower_msg* contains a roleplay signal.

    Checks both the *action* asterisk pattern (on original-cased *msg*) and
    keyword markers (on *lower_msg*).

    Args:
        msg: Original user message (preserves case for asterisk pattern).
        lower_msg: Lowercased user message for keyword matching.

    Returns:
        ``True`` if any roleplay marker is detected.
    """
    if _ROLEPLAY_ACTION_RE.search(msg):
        return True
    return any(kw in lower_msg for kw in _ROLEPLAY_KEYWORDS)


def _has_depth_keyword(lower_msg: str) -> bool:
    """Return True when *lower_msg* contains a philosophical depth keyword.

    Args:
        lower_msg: Lowercased user message.

    Returns:
        ``True`` if at least one depth keyword is present.
    """
    return any(kw in lower_msg for kw in _DEPTH_KEYWORDS)


def _has_flirt_keyword(lower_msg: str) -> bool:
    """Return True when *lower_msg* contains a flirtatious keyword.

    Args:
        lower_msg: Lowercased user message.

    Returns:
        ``True`` if at least one flirt keyword is present.
    """
    return any(kw in lower_msg for kw in _FLIRT_KEYWORDS)


def _score_context(
    context: str,
    lower_msg: str,
    original_msg: str,
    sentiment_score: float,
    emoji_count: int,
    question_count: int,
) -> float:
    """Compute a raw confidence score for a single context type.

    Each rule contributes a fixed additive weight so that
    :func:`get_context_confidence` can normalise scores across all types.
    The weights are intentionally coarse — they reflect relative signal
    strength, not calibrated probabilities.

    Args:
        context: One of the seven context type strings.
        lower_msg: Lowercased user message (pre-computed for efficiency).
        original_msg: Original (unmodified) user message.
        sentiment_score: Pre-computed sentiment float in ``[-1.0, 1.0]``.
        emoji_count: Number of emoji characters in the message.
        question_count: Number of ``?`` characters in the message.

    Returns:
        Non-negative float representing the raw signal strength for *context*.
    """
    msg_len = len(original_msg)

    if context == "comfort_reassurance":
        score = 0.0
        if sentiment_score < -0.2:
            score += 0.5
        if _has_comfort_keyword(lower_msg):
            score += 0.5
        return score

    if context == "emotional_support":
        score = 0.0
        if sentiment_score < -0.1:
            score += 0.4
        if _has_sadness_keyword(lower_msg):
            score += 0.4
        # Boost when both conditions hold
        if sentiment_score < -0.1 and _has_sadness_keyword(lower_msg):
            score += 0.2
        return score

    if context == "factual_qa":
        score = 0.0
        if question_count >= 1:
            score += 0.3
        if _has_factual_phrase(lower_msg):
            score += 0.5
        if question_count >= 1 and _has_factual_phrase(lower_msg):
            score += 0.2
        return score

    if context == "creative_roleplay":
        score = 0.0
        if _has_roleplay_marker(original_msg, lower_msg):
            score += 0.8
        return score

    if context == "deep_philosophical":
        score = 0.0
        if _has_depth_keyword(lower_msg):
            score += 0.5
        if msg_len > 100:
            score += 0.3
        if _has_depth_keyword(lower_msg) and msg_len > 100:
            score += 0.2
        return score

    if context == "playful_flirty":
        score = 0.0
        if emoji_count >= 2:
            score += 0.3
        if sentiment_score > 0.2:
            score += 0.3
        if _has_flirt_keyword(lower_msg):
            score += 0.4
        return score

    # casual_chat — weak baseline so it wins only when all others score low
    if context == "casual_chat":
        return 0.1

    return 0.0


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def classify_context(
    user_msg: str,
    sentiment_score: float,
    emoji_count: int,
    question_count: int,
    mood_state: str | None = None,
) -> str:
    """Classify a user message into a conversation context using rule-based heuristics.

    Rules are evaluated in strict priority order.  The first rule whose
    conditions are fully satisfied determines the returned context.  When no
    rule fires the function returns ``"casual_chat"`` as a safe default.

    An optional *mood_state* string (from the MoodEngine) can nudge the
    classification: an intimate mood loosens the playful_flirty threshold
    (emoji count requirement drops to 1), and a distressed mood lowers the
    emotional_support sentiment threshold to ``0.0``.

    Priority order:
        1. ``comfort_reassurance`` — negative sentiment (< -0.2) AND comfort keyword
        2. ``emotional_support``   — negative sentiment (< -0.1) OR sadness keyword
           (threshold is ``0.0`` when *mood_state* is distressed)
        3. ``factual_qa``          — question_count >= 1 AND factual phrase
        4. ``creative_roleplay``   — asterisk action OR roleplay keyword
        5. ``deep_philosophical``  — depth keyword AND message length > 100
        6. ``playful_flirty``      — emoji >= 2 (or 1 in intimate mood) AND positive
           sentiment AND flirt keyword
        7. ``casual_chat``         — default fallback

    Args:
        user_msg: The raw user message text to classify.
        sentiment_score: Pre-computed keyword sentiment score in ``[-1.0, 1.0]``
            (e.g. from :func:`backend.adaptive.signals.compute_sentiment`).
        emoji_count: Number of emoji characters counted in *user_msg*.
        question_count: Number of ``?`` characters in *user_msg*.
        mood_state: Optional current mood label from the MoodEngine (e.g.
            ``"romantic"``, ``"sad"``, ``"playful"``).  Passed as
            ``None`` when the mood system is unavailable.

    Returns:
        One of the seven context type strings defined in :data:`CONTEXTS`.

    Example:
        >>> classify_context("I feel so sad today", -0.3, 0, 0)
        'emotional_support'
        >>> classify_context("What is the capital of France?", 0.0, 0, 1)
        'factual_qa'
        >>> classify_context("*hugs you* let's pretend we're adventurers", 0.1, 0, 0)
        'creative_roleplay'
        >>> classify_context("I'm so scared, help me please", -0.4, 0, 0)
        'comfort_reassurance'
        >>> classify_context("You're so cute 😊😘", 0.5, 2, 0)
        'playful_flirty'
    """
    lower_msg = _lower(user_msg)

    # Mood-state adjustments to rule thresholds.
    mood_lower = _lower(mood_state) if mood_state else ""
    is_distressed_mood = mood_lower in _DISTRESSED_MOOD_STATES
    is_intimate_mood = mood_lower in _INTIMATE_MOOD_STATES

    # Adjusted thresholds based on mood context.
    emotional_support_threshold = 0.0 if is_distressed_mood else -0.1
    flirty_emoji_threshold = 1 if is_intimate_mood else 2

    # -----------------------------------------------------------------------
    # Rule 1: comfort_reassurance
    # Requires BOTH strong negative sentiment AND a comfort keyword.
    # -----------------------------------------------------------------------
    if sentiment_score < -0.2 and _has_comfort_keyword(lower_msg):
        logger.debug("classify_context: comfort_reassurance (sentiment=%.2f)", sentiment_score)
        return "comfort_reassurance"

    # -----------------------------------------------------------------------
    # Rule 2: emotional_support
    # Fires on moderate negative sentiment OR sadness keyword alone.
    # -----------------------------------------------------------------------
    if sentiment_score < emotional_support_threshold or _has_sadness_keyword(lower_msg):
        logger.debug(
            "classify_context: emotional_support (sentiment=%.2f, mood=%s)",
            sentiment_score,
            mood_state,
        )
        return "emotional_support"

    # -----------------------------------------------------------------------
    # Rule 3: factual_qa
    # Requires at least one question mark AND a factual phrase opener.
    # -----------------------------------------------------------------------
    if question_count >= 1 and _has_factual_phrase(lower_msg):
        logger.debug("classify_context: factual_qa (questions=%d)", question_count)
        return "factual_qa"

    # -----------------------------------------------------------------------
    # Rule 4: creative_roleplay
    # Fires on asterisk action patterns OR roleplay keywords.
    # -----------------------------------------------------------------------
    if _has_roleplay_marker(user_msg, lower_msg):
        logger.debug("classify_context: creative_roleplay")
        return "creative_roleplay"

    # -----------------------------------------------------------------------
    # Rule 5: deep_philosophical
    # Requires a depth keyword AND message length > 100 characters.
    # -----------------------------------------------------------------------
    if _has_depth_keyword(lower_msg) and len(user_msg) > 100:
        logger.debug("classify_context: deep_philosophical (len=%d)", len(user_msg))
        return "deep_philosophical"

    # -----------------------------------------------------------------------
    # Rule 6: playful_flirty
    # Requires sufficient emoji density, positive sentiment, AND a flirt keyword.
    # -----------------------------------------------------------------------
    if (
        emoji_count >= flirty_emoji_threshold
        and sentiment_score > 0.2
        and _has_flirt_keyword(lower_msg)
    ):
        logger.debug(
            "classify_context: playful_flirty (emoji=%d, sentiment=%.2f)",
            emoji_count,
            sentiment_score,
        )
        return "playful_flirty"

    # -----------------------------------------------------------------------
    # Rule 7: casual_chat (default)
    # -----------------------------------------------------------------------
    logger.debug("classify_context: casual_chat (default fallback)")
    return "casual_chat"


def get_context_confidence(
    user_msg: str,
    sentiment_score: float,
    emoji_count: int,
    question_count: int,
) -> dict[str, float]:
    """Return confidence scores in ``[0.0, 1.0]`` for all seven context types.

    Computes a raw signal-strength score for every context using the same
    heuristics as :func:`classify_context`, then normalises so that the scores
    sum to ``1.0``.  This is useful for the parameter tuner when no single
    context dominates — it can blend LLM parameters proportionally to the
    confidence distribution rather than making a hard switch.

    When all raw scores are zero (an empty message, for example) the function
    returns a uniform distribution across all context types.

    Args:
        user_msg: The raw user message text to evaluate.
        sentiment_score: Pre-computed keyword sentiment score in ``[-1.0, 1.0]``.
        emoji_count: Number of emoji characters counted in *user_msg*.
        question_count: Number of ``?`` characters in *user_msg*.

    Returns:
        Dict mapping each context type string to a float confidence value in
        ``[0.0, 1.0]``.  All values sum to ``1.0`` (subject to floating-point
        rounding).  Context types with zero raw signal still appear in the dict
        with a value of ``0.0`` (before normalisation).

    Example:
        >>> scores = get_context_confidence("What is love?", 0.0, 0, 1)
        >>> scores["factual_qa"] > scores["casual_chat"]
        True
        >>> round(sum(scores.values()), 5)
        1.0
        >>> all(0.0 <= v <= 1.0 for v in scores.values())
        True
    """
    lower_msg = _lower(user_msg)

    raw: dict[str, float] = {}
    for context in CONTEXTS:
        raw[context] = _score_context(
            context,
            lower_msg,
            user_msg,
            sentiment_score,
            emoji_count,
            question_count,
        )

    total = sum(raw.values())

    if total == 0.0:
        # Uniform distribution when no signals fire (e.g. empty message).
        uniform = 1.0 / len(CONTEXTS)
        return {ctx: uniform for ctx in CONTEXTS}

    return {ctx: raw[ctx] / total for ctx in CONTEXTS}
