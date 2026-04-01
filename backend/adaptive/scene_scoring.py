"""Intimate Scene Scoring Engine (F26) — hidden post-scene quality rating.

After an intimate scene ends the platform needs a private, numeric signal that
describes how *well* the scene went across five independent dimensions.  Those
scores are not shown to the user; they feed directly into the preference-
learning pipeline so the adaptive engine can nudge future scene generation
toward styles the user implicitly enjoyed.

Five scoring dimensions are evaluated independently and then combined into a
single weighted overall score:

* **pacing_quality** — did the scene move through phases at a natural speed, or
  did it stall / rush?
* **emotional_depth** — were vulnerable, emotionally-open moments present in
  meaningful proportion?
* **user_engagement** — did the user write actively (long messages, high
  response rate) or disengage?
* **variety** — did descriptive language stay fresh, or did the same phrases
  keep recycling?
* **natural_flow** — were scene transitions smooth, or did the LLM force
  awkward phase jumps?

Each dimension returns an integer in [1, 5].  ``get_overall_score()`` applies
dimension weights and returns a float in [1.0, 5.0].

The engine is fully stateless.  All inputs are derived from the session data
the caller already holds (message lists, phase-transition logs, etc.) so the
engine can be instantiated cheaply per-request.

Example::

    >>> engine = SceneScoringEngine()
    >>> scores = {
    ...     "pacing_quality":   engine.score_pacing(["buildup", "peak", "resolution"], 18),
    ...     "emotional_depth":  engine.score_emotional_depth(5, 20),
    ...     "user_engagement":  engine.score_engagement(120.5, 0.9),
    ...     "variety":          engine.score_variety(14, 20),
    ...     "natural_flow":     engine.score_flow(1, 3),
    ... }
    >>> overall = engine.get_overall_score(scores)
    >>> 1.0 <= overall <= 5.0
    True
    >>> signals = engine.get_preference_signals(scores)
    >>> "preferred_pacing" in signals
    True
"""

from __future__ import annotations

import logging
import math
from typing import Optional

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Dimension registry
# ---------------------------------------------------------------------------

#: Canonical definitions for each scoring dimension.
#:
#: Each entry contains:
#:   ``description`` — human-readable one-liner (used in prompts / debug logs).
#:   ``weight``      — relative importance when computing the overall score.
#:                     Weights are normalised inside ``get_overall_score()``.
#:   ``criteria``    — ordered list of scoring criterion strings, index 0 = score 1,
#:                     index 4 = score 5.  Used when building LLM scoring prompts.
SCORING_DIMENSIONS: dict[str, dict] = {
    "pacing_quality": {
        "description": (
            "How naturally the scene moved through its phases — neither "
            "rushing to climax nor stalling in a single beat."
        ),
        "weight": 1.5,
        "criteria": [
            "Scene felt static or repetitive; no meaningful phase progression.",
            "Some progression but phases were unbalanced or skipped awkwardly.",
            "Reasonable flow; occasional pacing hiccup but not distracting.",
            "Good phase progression; minor hesitations that felt intentional.",
            "Flawless, organic pacing; every phase earned its space.",
        ],
    },
    "emotional_depth": {
        "description": (
            "Presence of genuine vulnerability and emotional openness from "
            "both parties — not just physical intensity."
        ),
        "weight": 1.3,
        "criteria": [
            "Purely physical; no emotional content or vulnerability visible.",
            "A single brief emotional beat but otherwise surface-level.",
            "Moderate emotional presence; a few genuine moments.",
            "Emotionally rich; vulnerability felt real and well-distributed.",
            "Deeply emotional throughout; intimacy felt soul-level as well as physical.",
        ],
    },
    "user_engagement": {
        "description": (
            "Quality of user participation — message length and response "
            "consistency signal active versus passive engagement."
        ),
        "weight": 1.2,
        "criteria": [
            "User wrote very little; mostly one-word or absent responses.",
            "Short replies; minimal co-authorship of the scene.",
            "Average engagement; some investment but often passive.",
            "Active engagement; longer messages showing genuine involvement.",
            "Highly engaged; rich co-authorship, long and expressive messages throughout.",
        ],
    },
    "variety": {
        "description": (
            "Freshness of descriptive language — unique imagery and phrasing "
            "versus repetitive stock phrases."
        ),
        "weight": 1.0,
        "criteria": [
            "Heavy repetition; same phrases or descriptions recycled throughout.",
            "Noticeable repetition; limited vocabulary range.",
            "Moderate variety; some fresh imagery mixed with repeated phrases.",
            "Good variety; descriptive language stayed largely fresh.",
            "Excellent variety; vivid, unique imagery sustained throughout.",
        ],
    },
    "natural_flow": {
        "description": (
            "Smoothness of scene transitions — organic shifts between moods "
            "and beats versus jarring or forced jumps."
        ),
        "weight": 1.1,
        "criteria": [
            "Multiple forced or incoherent transitions broke immersion.",
            "A couple of awkward transitions that were noticeable.",
            "Generally smooth with one minor forced shift.",
            "Mostly natural transitions; flow rarely interrupted.",
            "Every transition felt earned and seamless.",
        ],
    },
}

#: Dimension weight vector, pre-extracted for fast access in ``get_overall_score()``.
_DIMENSION_WEIGHTS: dict[str, float] = {k: v["weight"] for k, v in SCORING_DIMENSIONS.items()}

#: Total weight sum used for normalisation.
_TOTAL_WEIGHT: float = sum(_DIMENSION_WEIGHTS.values())


# ---------------------------------------------------------------------------
# Preference-signal mapping
# ---------------------------------------------------------------------------

#: Maps (dimension, score_band) → preference-key/value pairs that the adaptive
#: preference engine can directly consume.
#:
#: Score bands:
#:   ``"low"``  — score in [1, 2]
#:   ``"mid"``  — score == 3
#:   ``"high"`` — score in [4, 5]
_PREFERENCE_SIGNAL_MAP: dict[str, dict[str, dict[str, str | int]]] = {
    "pacing_quality": {
        "low":  {"preferred_pacing": "slow", "pacing_confidence": 1},
        "mid":  {"preferred_pacing": "moderate", "pacing_confidence": 0},
        "high": {"preferred_pacing": "dynamic", "pacing_confidence": 1},
    },
    "emotional_depth": {
        "low":  {"preferred_tone": "physical", "tone_confidence": 1},
        "mid":  {"preferred_tone": "balanced", "tone_confidence": 0},
        "high": {"preferred_tone": "emotional", "tone_confidence": 1},
    },
    "user_engagement": {
        "low":  {"engagement_level": "passive", "engagement_confidence": 1},
        "mid":  {"engagement_level": "moderate", "engagement_confidence": 0},
        "high": {"engagement_level": "active", "engagement_confidence": 1},
    },
    "variety": {
        "low":  {"variety_preference": "consistent", "variety_confidence": 1},
        "mid":  {"variety_preference": "balanced", "variety_confidence": 0},
        "high": {"variety_preference": "diverse", "variety_confidence": 1},
    },
    "natural_flow": {
        "low":  {"flow_preference": "structured", "flow_confidence": 1},
        "mid":  {"flow_preference": "moderate", "flow_confidence": 0},
        "high": {"flow_preference": "organic", "flow_confidence": 1},
    },
}


# ---------------------------------------------------------------------------
# Scoring engine
# ---------------------------------------------------------------------------


class SceneScoringEngine:
    """Stateless engine that scores a completed intimate scene across five dimensions.

    All scoring methods are pure functions — they accept only the derived
    statistics the caller has already computed from the session data and return
    an integer score in [1, 5].  No I/O, no state, no side effects.

    Typical call sequence::

        engine = SceneScoringEngine()

        scores = {
            "pacing_quality":  engine.score_pacing(phase_transitions, total_messages),
            "emotional_depth": engine.score_emotional_depth(vulnerable_count, total_messages),
            "user_engagement": engine.score_engagement(avg_message_length, response_rate),
            "variety":         engine.score_variety(unique_descriptions, total_descriptions),
            "natural_flow":    engine.score_flow(forced_transitions, total_transitions),
        }
        overall  = engine.get_overall_score(scores)
        signals  = engine.get_preference_signals(scores)
        # → feed signals into the adaptive preference engine

    Example::

        >>> engine = SceneScoringEngine()
        >>> engine.score_pacing(["buildup", "peak", "resolution"], 15)
        4
        >>> engine.score_emotional_depth(0, 10)
        1
        >>> engine.score_engagement(200.0, 1.0)
        5
        >>> engine.score_variety(10, 10)
        5
        >>> engine.score_flow(0, 4)
        5
    """

    # ------------------------------------------------------------------
    # Individual dimension scorers
    # ------------------------------------------------------------------

    def score_pacing(
        self,
        phase_transitions: list[str],
        total_messages: int,
    ) -> int:
        """Score scene pacing quality based on phase progression.

        Pacing is evaluated on two sub-signals that are averaged:

        1. **Phase variety** — how many distinct phase names appeared.
           One unique phase = rushed; four or more = well-layered.
        2. **Messages-per-phase ratio** — total messages divided by the number
           of unique phases.  Very low ratios (< 2) mean phases were skipped;
           very high ratios (> 12) mean the scene stalled.

        Args:
            phase_transitions: Ordered list of phase names recorded as the
                scene progressed (e.g. ``["buildup", "buildup", "peak",
                "resolution"]``).  Duplicate consecutive entries are normal
                and represent multiple messages within the same phase.
            total_messages: Total number of messages exchanged during the scene
                (both user and character turns).

        Returns:
            Integer in [1, 5] where 1 = poor pacing and 5 = excellent pacing.

        Example::

            >>> engine = SceneScoringEngine()
            >>> engine.score_pacing(["buildup", "peak", "resolution"], 15)
            4
            >>> engine.score_pacing(["peak"], 3)
            1
            >>> engine.score_pacing(["buildup", "tension", "peak", "plateau", "resolution"], 25)
            5
        """
        if not phase_transitions or total_messages <= 0:
            return 1

        unique_phases = len(set(phase_transitions))
        total_phases = len(phase_transitions)

        # Sub-score 1: variety of phases encountered (1-5).
        if unique_phases >= 4:
            variety_score = 5
        elif unique_phases == 3:
            variety_score = 4
        elif unique_phases == 2:
            variety_score = 3
        else:
            variety_score = 1

        # Sub-score 2: messages-per-transition ratio captures stalling vs rushing.
        # Ideal range: 4–8 messages per transition.
        transitions = max(total_phases - 1, 1)
        ratio = total_messages / transitions
        if 4.0 <= ratio <= 8.0:
            ratio_score = 5
        elif 2.0 <= ratio < 4.0 or 8.0 < ratio <= 12.0:
            ratio_score = 4
        elif 1.5 <= ratio < 2.0 or 12.0 < ratio <= 16.0:
            ratio_score = 3
        elif 1.0 <= ratio < 1.5 or 16.0 < ratio <= 20.0:
            ratio_score = 2
        else:
            ratio_score = 1

        raw = (variety_score + ratio_score) / 2.0
        score = max(1, min(5, round(raw)))
        logger.debug(
            "score_pacing: unique=%d ratio=%.1f variety=%d ratio_s=%d → %d",
            unique_phases, ratio, variety_score, ratio_score, score,
        )
        return score

    def score_emotional_depth(
        self,
        vulnerable_count: int,
        total_messages: int,
    ) -> int:
        """Score emotional depth based on vulnerability moment density.

        A "vulnerable moment" is any message where the character or user
        expressed genuine emotional openness — e.g. a confession, a fear
        shared, a tender request.  The caller is responsible for counting
        these (typically via keyword matching or a lightweight classifier).

        The score is driven by the proportion of vulnerable messages relative
        to total scene length, scaled so that a 20-message scene needs roughly
        3–4 vulnerable moments to earn a top score.

        Args:
            vulnerable_count: Number of messages flagged as emotionally
                vulnerable or open.
            total_messages: Total messages in the scene (both turns).

        Returns:
            Integer in [1, 5] where 1 = no emotional content and 5 = deeply
            emotionally rich throughout.

        Example::

            >>> engine = SceneScoringEngine()
            >>> engine.score_emotional_depth(0, 10)
            1
            >>> engine.score_emotional_depth(3, 20)
            4
            >>> engine.score_emotional_depth(8, 20)
            5
        """
        if total_messages <= 0 or vulnerable_count <= 0:
            return 1

        ratio = vulnerable_count / total_messages

        if ratio >= 0.30:
            score = 5
        elif ratio >= 0.20:
            score = 4
        elif ratio >= 0.12:
            score = 3
        elif ratio >= 0.05:
            score = 2
        else:
            score = 1

        logger.debug(
            "score_emotional_depth: vulnerable=%d total=%d ratio=%.2f → %d",
            vulnerable_count, total_messages, ratio, score,
        )
        return score

    def score_engagement(
        self,
        avg_message_length: float,
        response_rate: float,
    ) -> int:
        """Score user engagement from message length and response consistency.

        Two signals are combined:

        1. **Average message length** (characters) — longer messages indicate
           the user is investing creative energy in co-authoring the scene.
           Threshold ladder: < 20 → 1, < 50 → 2, < 100 → 3, < 180 → 4, ≥ 180 → 5.
        2. **Response rate** — fraction of character messages that received a
           user reply (0.0–1.0).  Dropping below 0.6 is a strong disengagement
           signal; 1.0 means the user responded to every single message.

        The final score is the rounded average of both sub-scores.

        Args:
            avg_message_length: Mean character count across all user messages
                during the scene.
            response_rate: Proportion of character turns that received a user
                response (``user_replies / char_turns``).  Clamped to [0.0, 1.0].

        Returns:
            Integer in [1, 5] where 1 = highly disengaged and 5 = fully
            invested co-author.

        Example::

            >>> engine = SceneScoringEngine()
            >>> engine.score_engagement(200.0, 1.0)
            5
            >>> engine.score_engagement(30.0, 0.5)
            1
            >>> engine.score_engagement(95.0, 0.8)
            3
        """
        # Sub-score 1: message length ladder.
        if avg_message_length >= 180:
            length_score = 5
        elif avg_message_length >= 100:
            length_score = 4
        elif avg_message_length >= 50:
            length_score = 3
        elif avg_message_length >= 20:
            length_score = 2
        else:
            length_score = 1

        # Sub-score 2: response rate ladder.
        rate = max(0.0, min(1.0, response_rate))
        if rate >= 0.95:
            rate_score = 5
        elif rate >= 0.80:
            rate_score = 4
        elif rate >= 0.65:
            rate_score = 3
        elif rate >= 0.50:
            rate_score = 2
        else:
            rate_score = 1

        raw = (length_score + rate_score) / 2.0
        score = max(1, min(5, round(raw)))
        logger.debug(
            "score_engagement: avg_len=%.1f rate=%.2f len_s=%d rate_s=%d → %d",
            avg_message_length, rate, length_score, rate_score, score,
        )
        return score

    def score_variety(
        self,
        unique_descriptions: int,
        total_descriptions: int,
    ) -> int:
        """Score descriptive variety based on unique-to-total description ratio.

        "Descriptions" here means any flagged descriptive phrase or action tag
        in the scene (e.g. ``*touches your cheek*``).  The caller counts how
        many distinct phrase roots appeared versus the total count.

        A ratio near 1.0 means every phrase was fresh; a ratio near 0.0 means
        heavy repetition.  The scoring ladder intentionally rewards moderate
        variety (≥ 0.60) with a passing grade because some repetition can be
        intentional and poetic.

        Args:
            unique_descriptions: Count of distinct descriptive phrases or
                action tags used across the scene.
            total_descriptions: Total count of all descriptive phrases or
                action tags (including repeats).

        Returns:
            Integer in [1, 5] where 1 = severe repetition and 5 = rich,
            consistently fresh imagery.

        Example::

            >>> engine = SceneScoringEngine()
            >>> engine.score_variety(10, 10)
            5
            >>> engine.score_variety(6, 10)
            4
            >>> engine.score_variety(2, 10)
            1
            >>> engine.score_variety(0, 0)
            3
        """
        # Edge case: no descriptions at all — neutral score.
        if total_descriptions <= 0:
            return 3

        ratio = unique_descriptions / total_descriptions

        if ratio >= 0.85:
            score = 5
        elif ratio >= 0.65:
            score = 4
        elif ratio >= 0.45:
            score = 3
        elif ratio >= 0.25:
            score = 2
        else:
            score = 1

        logger.debug(
            "score_variety: unique=%d total=%d ratio=%.2f → %d",
            unique_descriptions, total_descriptions, ratio, score,
        )
        return score

    def score_flow(
        self,
        forced_transitions: int,
        total_transitions: int,
    ) -> int:
        """Score scene flow based on forced-transition proportion.

        A "forced transition" is one where the LLM abruptly shifted tone,
        phase, or activity in a way that broke continuity — e.g. jumping from
        a tender moment directly to explicit content without a bridge, or
        repeating a transition that was already resolved.  The caller detects
        these (e.g. via a lightweight classifier or explicit flags set by the
        scene controller).

        The score degrades as the forced-to-total ratio rises.  Even a single
        forced transition in a short scene (ratio ≥ 0.5) earns a low score.

        Args:
            forced_transitions: Number of transitions the scene controller
                flagged as incoherent or forced.
            total_transitions: Total number of phase transitions that occurred.

        Returns:
            Integer in [1, 5] where 1 = mostly forced/jarring and 5 = every
            transition felt organic and earned.

        Example::

            >>> engine = SceneScoringEngine()
            >>> engine.score_flow(0, 4)
            5
            >>> engine.score_flow(1, 4)
            3
            >>> engine.score_flow(2, 4)
            2
            >>> engine.score_flow(4, 4)
            1
        """
        if total_transitions <= 0:
            # No transitions → trivially smooth.
            return 4

        if forced_transitions <= 0:
            return 5

        ratio = forced_transitions / total_transitions

        if ratio <= 0.10:
            score = 5
        elif ratio <= 0.25:
            score = 4
        elif ratio <= 0.40:
            score = 3
        elif ratio <= 0.60:
            score = 2
        else:
            score = 1

        logger.debug(
            "score_flow: forced=%d total=%d ratio=%.2f → %d",
            forced_transitions, total_transitions, ratio, score,
        )
        return score

    # ------------------------------------------------------------------
    # Aggregation
    # ------------------------------------------------------------------

    def get_overall_score(self, scores: dict[str, int]) -> float:
        """Compute a weighted overall scene quality score from the five dimensions.

        Missing dimensions are skipped gracefully (their weight is excluded
        from the denominator), so partial score dicts are accepted without
        raising errors.

        Args:
            scores: Mapping of dimension name → integer score [1, 5].  Keys
                should be a subset of ``SCORING_DIMENSIONS``.

        Returns:
            Weighted average as a float in [1.0, 5.0].  Returns ``1.0`` if
            ``scores`` is empty or all keys are unrecognised.

        Example::

            >>> engine = SceneScoringEngine()
            >>> engine.get_overall_score({
            ...     "pacing_quality": 4,
            ...     "emotional_depth": 5,
            ...     "user_engagement": 3,
            ...     "variety": 4,
            ...     "natural_flow": 5,
            ... })
            4.19...
        """
        if not scores:
            return 1.0

        weighted_sum = 0.0
        active_weight = 0.0

        for dimension, score in scores.items():
            weight = _DIMENSION_WEIGHTS.get(dimension)
            if weight is None:
                logger.warning("get_overall_score: unknown dimension %r — skipped", dimension)
                continue
            weighted_sum += score * weight
            active_weight += weight

        if active_weight == 0.0:
            return 1.0

        overall = weighted_sum / active_weight
        # Clamp to [1.0, 5.0] in case a caller supplied out-of-range scores.
        result = max(1.0, min(5.0, overall))
        logger.debug("get_overall_score: weighted=%.3f active_w=%.2f → %.3f", weighted_sum, active_weight, result)
        return result

    # ------------------------------------------------------------------
    # LLM-assisted scoring support
    # ------------------------------------------------------------------

    def build_scoring_prompt(self, scene_messages: list[dict]) -> str:
        """Build a structured LLM prompt that requests per-dimension scene scores.

        The generated prompt instructs a language model to act as a hidden
        quality-assessment layer and return a JSON object with one integer
        score per dimension.  It includes the dimension descriptions and
        scoring criteria from ``SCORING_DIMENSIONS`` so the LLM has full
        rubric context.

        The prompt is intentionally framed as an *internal analysis* task
        (not visible to the user) and asks for numeric scores only, avoiding
        prose explanations that would waste tokens.

        Args:
            scene_messages: List of message dicts representing the scene,
                each with at minimum a ``"role"`` key (``"user"`` or
                ``"assistant"``) and a ``"content"`` key (string).

        Returns:
            A multi-line string prompt ready to be sent to the LLM as the
            ``user`` turn (with an appropriate system instruction to act as
            a scoring assistant).

        Example::

            >>> engine = SceneScoringEngine()
            >>> prompt = engine.build_scoring_prompt([
            ...     {"role": "user", "content": "Hey..."},
            ...     {"role": "assistant", "content": "I'm here."},
            ... ])
            >>> "pacing_quality" in prompt
            True
            >>> "JSON" in prompt
            True
        """
        # Serialise the transcript into a readable format.
        transcript_lines: list[str] = []
        for i, msg in enumerate(scene_messages, start=1):
            role = msg.get("role", "unknown")
            content = str(msg.get("content", "")).strip()
            # Truncate very long messages to stay within token budgets.
            if len(content) > 400:
                content = content[:397] + "..."
            transcript_lines.append(f"[{i}] {role.upper()}: {content}")
        transcript = "\n".join(transcript_lines)

        # Build the rubric block from SCORING_DIMENSIONS.
        rubric_parts: list[str] = []
        for dim, meta in SCORING_DIMENSIONS.items():
            criteria_lines = "\n".join(
                f"  {i + 1}: {criterion}"
                for i, criterion in enumerate(meta["criteria"])
            )
            rubric_parts.append(
                f"## {dim}\n{meta['description']}\nScoring criteria:\n{criteria_lines}"
            )
        rubric = "\n\n".join(rubric_parts)

        expected_keys = ", ".join(f'"{k}"' for k in SCORING_DIMENSIONS)

        prompt = (
            "You are an internal scene quality analyzer. "
            "The following transcript is from a completed intimate roleplay scene. "
            "Your task is to rate the scene across five quality dimensions. "
            "This analysis is private — it is never shown to the user.\n\n"
            "--- TRANSCRIPT ---\n"
            f"{transcript}\n"
            "--- END TRANSCRIPT ---\n\n"
            "--- SCORING RUBRIC ---\n"
            f"{rubric}\n"
            "--- END RUBRIC ---\n\n"
            "Return ONLY a JSON object with integer scores (1-5) for each dimension. "
            f"Required keys: {expected_keys}. "
            "Example: {\"pacing_quality\": 4, \"emotional_depth\": 3, "
            "\"user_engagement\": 5, \"variety\": 4, \"natural_flow\": 4}\n"
            "No additional text. JSON only."
        )
        return prompt

    # ------------------------------------------------------------------
    # Preference signal extraction
    # ------------------------------------------------------------------

    def get_preference_signals(self, scores: dict[str, int]) -> dict:
        """Translate dimension scores into preference signals for the adaptive engine.

        Each score is bucketed into ``"low"`` (1–2), ``"mid"`` (3), or
        ``"high"`` (4–5) and mapped to a preference key/value pair that the
        adaptive preference engine can directly ingest.

        An additional top-level key ``"overall_quality"`` carries the raw
        float overall score, and ``"weak_dimensions"`` lists any dimensions
        that scored 2 or below (useful for targeted improvement).

        Args:
            scores: Mapping of dimension name → integer score [1, 5], as
                returned by the individual ``score_*`` methods.

        Returns:
            Flat dict of preference signals.  All keys are strings; values are
            strings or integers.  Unknown dimension keys in ``scores`` are
            silently ignored.

        Example::

            >>> engine = SceneScoringEngine()
            >>> signals = engine.get_preference_signals({
            ...     "pacing_quality": 5,
            ...     "emotional_depth": 2,
            ...     "user_engagement": 4,
            ...     "variety": 3,
            ...     "natural_flow": 4,
            ... })
            >>> signals["preferred_pacing"]
            'dynamic'
            >>> signals["preferred_tone"]
            'physical'
            >>> "emotional_depth" in signals["weak_dimensions"]
            True
        """
        signals: dict = {}
        weak_dimensions: list[str] = []

        for dimension, score in scores.items():
            signal_map = _PREFERENCE_SIGNAL_MAP.get(dimension)
            if signal_map is None:
                continue

            if score <= 2:
                band = "low"
            elif score == 3:
                band = "mid"
            else:
                band = "high"

            band_signals = signal_map.get(band, {})
            signals.update(band_signals)

            if score <= 2:
                weak_dimensions.append(dimension)

        signals["overall_quality"] = self.get_overall_score(scores)
        signals["weak_dimensions"] = weak_dimensions

        logger.debug(
            "get_preference_signals: %d signals, weak=%r",
            len(signals),
            weak_dimensions,
        )
        return signals
