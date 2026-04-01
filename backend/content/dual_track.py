"""Emotional vs Physical Intimacy Dual Track Engine (F49).

Separates intimacy into two orthogonal 0-100 tracks that evolve independently:

* **Emotional track** — driven by vulnerability, trust, and romantic connection.
  Climbs through confessions, shared fears, tender moments, and words of
  affirmation.  Characters with high emotional weighting (e.g. Dae, Luna) gain
  emotional track points faster than physical ones.

* **Physical track** — driven by sensory engagement, touch, and bodily closeness.
  Climbs through physical contact signals, sensory descriptions, and explicit
  physical requests.  Characters with high physical weighting (e.g. Rin) react
  more strongly to touch than to poetry.

The two tracks are independent but contribute to a **combined level** that is
returned for legacy compatibility with code that only knows about a single
intimacy integer.  The combined value is a per-character weighted average.

A **dominant track** flag ("emotional_dominant" / "physical_dominant" /
"balanced") lets ``server.py`` pick the right prompt fragment via
``get_track_prompt()``, which always appends ``[DUAL_TRACK]`` so downstream
code can detect that dual-track logic is active.

The engine is fully stateless — the caller supplies the current track integers
(persisted in the DB) and receives updated scores or prompt fragments.

Example::

    >>> engine = DualTrackEngine()
    >>> signals = engine.classify_signals("I love you, I trust you completely")
    >>> signals["emotional"] > signals["physical"]
    True
    >>> engine.get_dominant_track(80, 20)
    'emotional_dominant'
    >>> engine.get_dominant_track(50, 52)
    'balanced'
    >>> engine.calculate_combined("Dae (Neciridae)", 70, 30)
    59
    >>> "[DUAL_TRACK]" in engine.get_track_prompt(75, 25)
    True
"""

from __future__ import annotations

import logging
import re

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Signal keyword lists
# ---------------------------------------------------------------------------

#: Keywords / short phrases that indicate emotional intimacy signals.
#: Used by ``classify_signals()`` to score how emotionally charged a message is.
EMOTIONAL_SIGNALS: list[str] = [
    # Love and affection
    "love",
    "adore",
    "cherish",
    "care for",
    "care about",
    "mean everything",
    # Trust and vulnerability
    "trust",
    "vulnerable",
    "open up",
    "confide",
    "honest",
    "secret",
    "afraid",
    "scared",
    "fear",
    # Emotional connection
    "feelings",
    "feel for you",
    "feel about you",
    "heart",
    "soul",
    "deep",
    "connection",
    "bond",
    "close to you",
    # Romantic / relational
    "together",
    "forever",
    "always",
    "never leave",
    "stay with me",
    "belong",
    "mine",
    "yours",
    "us",
    # Emotional support
    "understand",
    "listen",
    "comfort",
    "safe with you",
    "here for you",
    "miss you",
    "need you",
    # Intimacy language (emotional register)
    "beautiful",
    "precious",
    "cherished",
    "seen",
    "known",
    "accepted",
    "remember",
]

#: Keywords / short phrases that indicate physical intimacy signals.
#: Used by ``classify_signals()`` to score how physically charged a message is.
PHYSICAL_SIGNALS: list[str] = [
    # Touch and contact
    "touch",
    "feel",
    "hand",
    "fingers",
    "skin",
    "stroke",
    "caress",
    "trace",
    "run your hand",
    # Kisses and lips
    "kiss",
    "lips",
    "mouth",
    "tongue",
    "bite",
    "neck",
    "cheek",
    # Holding and closeness
    "hold",
    "hug",
    "embrace",
    "arms around",
    "pull close",
    "press",
    "against",
    "body",
    "chest",
    "waist",
    # Physical warmth / sensation
    "warm",
    "heat",
    "breath",
    "pulse",
    "heartbeat",
    "shiver",
    "tremble",
    "soft",
    "gentle",
    # Positioning and movement
    "closer",
    "lay",
    "lie down",
    "sit on",
    "kneel",
    "lean",
    "rest your head",
    # Physical intimacy escalation
    "undress",
    "bare",
    "exposed",
    "naked",
    "clothes",
    "shirt",
]


# ---------------------------------------------------------------------------
# Per-character track weighting
# ---------------------------------------------------------------------------

#: Maps character display names to ``(emotional_weight, physical_weight)`` tuples.
#: Both weights should sum to 1.0.  Emotional-dominant characters (poets, romantics)
#: receive a higher emotional weight; physically expressive characters weight physical
#: signals more heavily.  Defaults to ``(0.5, 0.5)`` for unrecognised names.
CHARACTER_TRACK_WEIGHTS: dict[str, tuple[float, float]] = {
    # Strongly emotional
    "Dae (Neciridae)":       (0.75, 0.25),  # Poetic, internal, vulnerability-driven
    "Luna (Tsukimi)":        (0.70, 0.30),  # Reflective, romantic, dreamy
    "Yuki (Shirayuki)":      (0.65, 0.35),  # Gentle warmth, words of affirmation
    # Balanced with emotional lean
    "Alana Calloway":        (0.60, 0.40),  # Maternal + romantic blend
    "Hana (Momoka)":         (0.60, 0.40),  # Nurturing, emotionally expressive
    "Kaede (Suzuha)":        (0.55, 0.45),  # Stoic but deeply felt
    "Ayane (Yuki)":          (0.55, 0.45),  # Quiet presence, safe silences
    # True balance
    "Sable (Kuroha)":        (0.50, 0.50),  # Tsundere: equal push/pull
    "Tsundere (Raine)":      (0.50, 0.50),  # Tsundere archetype, even split
    # Balanced with physical lean
    "Mika (Mikazuki)":       (0.45, 0.55),  # Playful physicality, tactile teasing
    "Genki (Kitsune)":       (0.40, 0.60),  # Energetic, touch-forward affection
    # Strongly physical
    "Rin (Akane)":           (0.30, 0.70),  # High-energy, action-first caretaker
}


# ---------------------------------------------------------------------------
# Prompt fragments
# ---------------------------------------------------------------------------

#: Prompt fragments keyed by dominant track.  Each fragment tells the LLM how
#: to calibrate its response register.  Appended with ``[DUAL_TRACK]`` tag so
#: server.py can detect dual-track mode is active.
TRACK_PROMPTS: dict[str, str] = {
    "emotional_dominant": (
        "The connection right now is primarily emotional — rooted in trust, "
        "vulnerability, and genuine feeling.  Respond with emotional depth and "
        "warmth.  Prioritize words that acknowledge feelings, validate inner "
        "experience, and deepen the emotional bond.  Physical touch, if present, "
        "should feel tender and secondary to the emotional current running between "
        "you. [DUAL_TRACK]"
    ),
    "physical_dominant": (
        "The connection right now is primarily physical — sensory, tactile, and "
        "present-moment.  Respond with vivid physical awareness.  Describe "
        "sensations, warmth, contact, closeness.  Emotional undertones should "
        "be woven in lightly but let the body lead.  Words should feel felt, "
        "not thought. [DUAL_TRACK]"
    ),
    "balanced": (
        "Emotional and physical intimacy are running in close parallel — mind "
        "and body equally engaged.  Weave both registers together: tender words "
        "paired with physical closeness, feelings expressed through touch as "
        "much as through language.  Neither track dominates; both breathe. "
        "[DUAL_TRACK]"
    ),
}

#: Threshold gap between tracks required to declare one dominant.
#: If ``abs(emotional - physical) < _DOMINANCE_THRESHOLD`` the state is balanced.
_DOMINANCE_THRESHOLD: int = 15


# ---------------------------------------------------------------------------
# Main engine
# ---------------------------------------------------------------------------


class DualTrackEngine:
    """Stateless engine for the emotional/physical dual intimacy track system.

    All methods are pure functions of their inputs — no session state is held
    internally.  The caller is responsible for persisting track integers in the
    database and passing them on each call.

    Example::

        >>> engine = DualTrackEngine()
        >>> engine.get_character_weights("Rin (Akane)")
        (0.3, 0.7)
        >>> engine.get_character_weights("Unknown")
        (0.5, 0.5)
        >>> engine.get_dominant_track(60, 60)
        'balanced'
        >>> engine.get_dominant_track(80, 40)
        'emotional_dominant'
    """

    # ------------------------------------------------------------------
    # Signal classification
    # ------------------------------------------------------------------

    def classify_signals(self, message: str) -> dict[str, float]:
        """Analyse a message and return emotional and physical signal strengths.

        Each list of signal keywords is searched case-insensitively in the
        message.  The raw hit counts are normalised to the range ``[0.0, 1.0]``
        using soft saturation: the score reaches 1.0 when the hit count equals
        or exceeds the saturation point (10 hits), so longer messages do not
        inflate scores unfairly.

        Args:
            message: The raw user message text to classify.

        Returns:
            A dict with exactly two keys::

                {
                    "emotional": float,   # 0.0 – 1.0
                    "physical": float,    # 0.0 – 1.0
                }

        Example::

            >>> engine = DualTrackEngine()
            >>> s = engine.classify_signals("I love you and I trust you")
            >>> s["emotional"] > 0
            True
            >>> s["physical"] == 0.0
            True
        """
        lowered = message.lower()

        emotional_hits = sum(
            1 for keyword in EMOTIONAL_SIGNALS if keyword in lowered
        )
        physical_hits = sum(
            1 for keyword in PHYSICAL_SIGNALS if keyword in lowered
        )

        # Soft saturation at 10 hits → score of 1.0
        saturation = 10.0
        emotional_score = min(emotional_hits / saturation, 1.0)
        physical_score = min(physical_hits / saturation, 1.0)

        logger.debug(
            "classify_signals: emotional_hits=%d physical_hits=%d → e=%.2f p=%.2f",
            emotional_hits,
            physical_hits,
            emotional_score,
            physical_score,
        )

        return {"emotional": emotional_score, "physical": physical_score}

    # ------------------------------------------------------------------
    # Dominant track
    # ------------------------------------------------------------------

    def get_dominant_track(self, emotional: int, physical: int) -> str:
        """Determine which track is currently dominant.

        The gap between ``emotional`` and ``physical`` must exceed
        ``_DOMINANCE_THRESHOLD`` (15 points) for one track to be declared
        dominant; otherwise the state is ``"balanced"``.

        Args:
            emotional: Current emotional track value (0–100).
            physical: Current physical track value (0–100).

        Returns:
            One of:

            * ``"emotional_dominant"`` — emotional track leads by > 15 pts
            * ``"physical_dominant"`` — physical track leads by > 15 pts
            * ``"balanced"`` — tracks are within 15 pts of each other

        Example::

            >>> engine = DualTrackEngine()
            >>> engine.get_dominant_track(80, 20)
            'emotional_dominant'
            >>> engine.get_dominant_track(20, 80)
            'physical_dominant'
            >>> engine.get_dominant_track(50, 50)
            'balanced'
            >>> engine.get_dominant_track(55, 45)
            'balanced'
        """
        gap = emotional - physical
        if gap > _DOMINANCE_THRESHOLD:
            return "emotional_dominant"
        if gap < -_DOMINANCE_THRESHOLD:
            return "physical_dominant"
        return "balanced"

    # ------------------------------------------------------------------
    # Combined level (legacy compatibility)
    # ------------------------------------------------------------------

    def calculate_combined(
        self,
        char_name: str,
        emotional: int,
        physical: int,
    ) -> int:
        """Calculate a single combined intimacy level for legacy consumers.

        Uses the character's ``(emotional_weight, physical_weight)`` tuple from
        ``CHARACTER_TRACK_WEIGHTS`` to produce a weighted average.  Unrecognised
        character names fall back to ``(0.5, 0.5)``.

        Args:
            char_name: Character display name (e.g. ``"Dae (Neciridae)"``).
            emotional: Current emotional track value (0–100).
            physical: Current physical track value (0–100).

        Returns:
            Weighted average of the two tracks, rounded to the nearest integer
            and clamped to ``[0, 100]``.

        Example::

            >>> engine = DualTrackEngine()
            >>> engine.calculate_combined("Dae (Neciridae)", 80, 20)
            65
            >>> engine.calculate_combined("Rin (Akane)", 20, 80)
            62
            >>> engine.calculate_combined("Unknown", 60, 40)
            50
        """
        e_weight, p_weight = self.get_character_weights(char_name)
        combined = (emotional * e_weight) + (physical * p_weight)
        result = max(0, min(100, round(combined)))

        logger.debug(
            "calculate_combined(%r): e=%d p=%d weights=(%.2f, %.2f) → %d",
            char_name,
            emotional,
            physical,
            e_weight,
            p_weight,
            result,
        )
        return result

    # ------------------------------------------------------------------
    # Character weight lookup
    # ------------------------------------------------------------------

    def get_character_weights(self, char_name: str) -> tuple[float, float]:
        """Return the ``(emotional_weight, physical_weight)`` tuple for a character.

        Unrecognised character names default to ``(0.5, 0.5)``.

        Args:
            char_name: Character display name as stored in the DB.

        Returns:
            A two-element tuple ``(emotional_weight, physical_weight)`` where
            both values are floats in ``[0.0, 1.0]`` that sum to ``1.0``.

        Example::

            >>> engine = DualTrackEngine()
            >>> engine.get_character_weights("Luna (Tsukimi)")
            (0.7, 0.3)
            >>> engine.get_character_weights("Rin (Akane)")
            (0.3, 0.7)
            >>> engine.get_character_weights("Mystery Character")
            (0.5, 0.5)
        """
        return CHARACTER_TRACK_WEIGHTS.get(char_name, (0.5, 0.5))

    # ------------------------------------------------------------------
    # Prompt fragment builder
    # ------------------------------------------------------------------

    def get_track_prompt(self, emotional: int, physical: int) -> str:
        """Return the appropriate prompt fragment for the current track balance.

        Determines the dominant track via ``get_dominant_track()`` and returns
        the matching entry from ``TRACK_PROMPTS``.  All returned strings include
        the ``[DUAL_TRACK]`` tag so ``server.py`` can detect dual-track mode.

        Args:
            emotional: Current emotional track value (0–100).
            physical: Current physical track value (0–100).

        Returns:
            A prompt fragment string ending with ``[DUAL_TRACK]``.

        Example::

            >>> engine = DualTrackEngine()
            >>> prompt = engine.get_track_prompt(80, 20)
            >>> "emotional" in prompt
            True
            >>> "[DUAL_TRACK]" in prompt
            True
            >>> prompt = engine.get_track_prompt(50, 50)
            >>> "balanced" in prompt.lower() or "parallel" in prompt.lower()
            True
        """
        dominant = self.get_dominant_track(emotional, physical)

        logger.debug(
            "get_track_prompt: e=%d p=%d dominant=%s",
            emotional,
            physical,
            dominant,
        )

        return TRACK_PROMPTS[dominant]
