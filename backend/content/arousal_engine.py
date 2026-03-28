"""Character arousal state machine for intimate scene modulation.

A hidden 0.0-10.0 internal state that drives writing style changes.
The user never sees a number — they experience vocabulary shifts,
sentence fragmentation, and behavioral changes as arousal rises/falls.

Each character has an arousal personality (slow_burn, responsive,
explosive, smolder, volatile) that affects escalation and decay rates.

Example:
    >>> engine = ArousalEngine(char_id=1, personality_type="slow_burn")
    >>> update = engine.update(message="*kisses you*", role="user", intimacy_delta=2.0)
    >>> engine.displayed_level
    1
    >>> mods = engine.get_prompt_modifiers()
    >>> mods.vocabulary_level
    'normal'
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Dataclasses
# ---------------------------------------------------------------------------


@dataclass
class ArousalUpdate:
    """Result of an arousal state update.

    Attributes:
        previous_level: Float arousal level before this update.
        new_level: Float arousal level after this update.
        delta: Signed change applied (positive = escalation, negative = decay/cool).
        reason: Short label indicating what drove the change.
            One of: ``"escalation_signal"``, ``"decay"``,
            ``"cool_signal"``, ``"reset"``.
    """

    previous_level: float
    new_level: float
    delta: float
    reason: str  # "escalation_signal", "decay", "cool_signal", "reset"


@dataclass
class ArousalPromptModifiers:
    """Writing style modifiers driven by current arousal level.

    Attributes:
        vocabulary_level: Word-choice register.
            ``"normal"`` / ``"charged"`` / ``"intense"`` / ``"minimal"``.
        max_response_tokens: Suggested token ceiling for LLM response.
            Decreases as arousal rises (300 → 200 → 150 → 80).
        sentence_style: Structural rhythm of generated prose.
            ``"flowing"`` / ``"mixed"`` / ``"short_fragmented"`` / ``"fragments_only"``.
        action_frequency: How often *roleplay actions* appear.
            ``"occasional"`` / ``"frequent"`` / ``"dominant"`` / ``"almost_all"``.
        breathing_mentions: Whether the character should describe
            breath/breathlessness. False below arousal 5.
        ellipsis_frequency: How often ``…`` or ``...`` trails appear.
            ``"none"`` / ``"occasional"`` / ``"frequent"``.
        coherence_level: How complete and grammatical speech is.
            ``"full"`` / ``"slightly_scattered"`` / ``"distracted"`` / ``"overwhelmed"``.
    """

    vocabulary_level: str     # "normal" / "charged" / "intense" / "minimal"
    max_response_tokens: int  # 300 → 200 → 150 → 80
    sentence_style: str       # "flowing" / "mixed" / "short_fragmented" / "fragments_only"
    action_frequency: str     # "occasional" / "frequent" / "dominant" / "almost_all"
    breathing_mentions: bool  # False until arousal 5+
    ellipsis_frequency: str   # "none" / "occasional" / "frequent"
    coherence_level: str      # "full" / "slightly_scattered" / "distracted" / "overwhelmed"


# ---------------------------------------------------------------------------
# Personality constants
# ---------------------------------------------------------------------------

#: Per-character arousal personality types.
#: ``max_advance`` — maximum arousal gain from a single user message.
#: ``decay_rate`` — points lost per message that contains no escalation signal.
AROUSAL_PERSONALITIES: dict[str, dict] = {
    "slow_burn": {
        "max_advance": 1.0,
        "decay_rate": 0.5,
        "characters": ["Dae (Neciridae)", "Luna (Tsukimi)", "Ayane (Yuki)"],
    },
    "responsive": {
        "max_advance": 2.0,
        "decay_rate": 1.0,
        "characters": ["Alana Calloway", "Hana (Momoka)", "Yuki (Shirayuki)"],
    },
    "explosive": {
        "max_advance": 2.0,
        "decay_rate": 1.5,
        "characters": ["Genki (Kitsune)", "Mika (Mikazuki)", "Rin (Akane)"],
    },
    "smolder": {
        "max_advance": 1.0,
        "decay_rate": 0.5,
        "characters": ["Sable (Kuroha)", "Kaede (Suzuha)"],
    },
    "volatile": {
        "max_advance": 2.0,
        "decay_rate": 2.0,
        "characters": ["Tsundere (Raine)"],
    },
}

#: Reverse lookup: character name → personality type, built at module load.
CHARACTER_AROUSAL_TYPE: dict[str, str] = {}
for _ptype, _data in AROUSAL_PERSONALITIES.items():
    for _char in _data["characters"]:
        CHARACTER_AROUSAL_TYPE[_char] = _ptype

# ---------------------------------------------------------------------------
# Signal patterns (compiled once)
# ---------------------------------------------------------------------------

#: Escalation signal patterns grouped by intensity.
#: ``mild`` → +1.0, ``moderate`` → +1.5, ``strong`` → +2.0.
ESCALATION_SIGNALS: dict[str, list[re.Pattern[str]]] = {
    "mild": [
        re.compile(r"\blean\b", re.I),
        re.compile(r"\bcloser?\b", re.I),
        re.compile(r"\btouch\b", re.I),
        re.compile(r"\bhand\b", re.I),
        re.compile(r"\bshoulder\b", re.I),
    ],
    "moderate": [
        re.compile(r"\bkiss\b", re.I),
        re.compile(r"\blips?\b", re.I),
        re.compile(r"\bneck\b", re.I),
        re.compile(r"\bpull\b", re.I),
        re.compile(r"\bgrab\b", re.I),
        re.compile(r"\bhold\b", re.I),
    ],
    "strong": [
        re.compile(r"\bbreath\b", re.I),
        re.compile(r"\bgasp\b", re.I),
        re.compile(r"\bmoan\b", re.I),
        re.compile(r"\bshiver\b", re.I),
        re.compile(r"\btremble\b", re.I),
    ],
}

#: Signal strengths (raw delta before personality cap).
_ESCALATION_STRENGTH: dict[str, float] = {
    "mild": 1.0,
    "moderate": 1.5,
    "strong": 2.0,
}

#: Cool-down signal patterns — any match causes an immediate -2 drop.
COOL_SIGNALS: list[re.Pattern[str]] = [
    re.compile(r"\bwait\b", re.I),
    re.compile(r"\bstop\b", re.I),
    re.compile(r"\bslow\s+down\b", re.I),
    re.compile(r"\bhang\s+on\b", re.I),
    re.compile(r"\blet'?s\s+talk\b", re.I),
]

# ---------------------------------------------------------------------------
# Pre-written arousal prompt blocks
# ---------------------------------------------------------------------------

#: Prompt text injected per arousal band.
#: Keys are inclusive ``(low, high)`` tuples of ``displayed_level``.
AROUSAL_PROMPTS: dict[tuple[int, int], str] = {
    (0, 3): (
        "[Arousal: Relaxed] Character is conversational and at ease. "
        "Normal vocabulary and sentence structure. "
        "Physical awareness is casual — friendly touches, comfortable proximity. "
        "No urgency."
    ),
    (4, 6): (
        "[Arousal: Heightened] Character is noticeably affected. "
        "Sensory descriptions become richer. "
        "Responses include more *physical actions*. "
        "Character may lose train of thought. "
        "Breathing becomes noticeable. "
        "Vocabulary shifts toward charged, evocative words. "
        "Responses are slightly longer as the character savors descriptions."
    ),
    (7, 9): (
        "[Arousal: Intense] Sentences become shorter, fragmented. "
        "Ellipses appear frequently. "
        "Breathing is heavy and described explicitly. "
        "Vocabulary is urgent and raw. "
        "Character struggles to form complete thoughts. "
        "*Actions* dominate over dialogue. "
        "Responses are shorter — quality over quantity. "
        "Single-word reactions become common."
    ),
    (10, 10): (
        "[Arousal: Peak] Minimal coherent speech. Pure sensory fragments. "
        "Eyes closed. Trembling. Broken words. "
        "This lasts only 1-2 messages before cooling. "
        "After peak: character is breathless, slowly returns to words."
    ),
}


# ---------------------------------------------------------------------------
# Main class
# ---------------------------------------------------------------------------


class ArousalEngine:
    """State machine tracking character arousal level 0.0-10.0.

    The ``current_level`` float is internal; callers should use
    ``displayed_level`` (rounded int) for downstream decisions.

    Arousal rises only from **user** messages containing escalation signals.
    Assistant messages never self-escalate. Natural decay applies whenever
    a user message contains no escalation signal.

    Attributes:
        char_id: Owning character's database ID.
        personality_type: One of the keys in ``AROUSAL_PERSONALITIES``.
        current_level: Raw float arousal in [0.0, 10.0].

    Example:
        >>> engine = ArousalEngine(char_id=3, personality_type="explosive")
        >>> result = engine.update(message="*grabs your hand*", role="user")
        >>> result.reason
        'escalation_signal'
        >>> engine.current_level > 0
        True
    """

    def __init__(self, char_id: int, personality_type: str = "responsive") -> None:
        """Initialise with character ID and arousal personality type.

        Args:
            char_id: Database ID of the owning character.
            personality_type: Key into ``AROUSAL_PERSONALITIES``.
                Defaults to ``"responsive"`` if the key is unknown.
        """
        self.char_id = char_id
        self.personality_type = personality_type
        self._config: dict = AROUSAL_PERSONALITIES.get(
            personality_type, AROUSAL_PERSONALITIES["responsive"]
        )
        self.current_level: float = 0.0
        self._messages_since_signal: int = 0

    # ------------------------------------------------------------------
    # Properties
    # ------------------------------------------------------------------

    @property
    def displayed_level(self) -> int:
        """Rounded integer for prompt injection and downstream consumers.

        Returns:
            ``current_level`` rounded to the nearest integer in [0, 10].
        """
        return round(self.current_level)

    # ------------------------------------------------------------------
    # Core state transitions
    # ------------------------------------------------------------------

    def update(
        self,
        message: str,
        role: str,
        intimacy_delta: float = 0.0,
        time_gap_minutes: float = 0.0,
    ) -> ArousalUpdate:
        """Process a message and update arousal state.

        Only ``role="user"`` messages can escalate arousal. Assistant
        messages still trigger natural decay if no signal is present in
        the paired user turn, but this method does not auto-escalate on
        assistant content.

        Args:
            message: Raw text of the message to evaluate.
            role: ``"user"`` or ``"assistant"``.  Only ``"user"`` can escalate.
            intimacy_delta: Optional external intimacy score delta from the
                ``IntimacyEngine`` (currently unused internally but available
                for future cross-engine coupling).
            time_gap_minutes: Minutes since the previous message.  Gaps
                larger than 5 minutes apply an additional -1 decay.

        Returns:
            ``ArousalUpdate`` describing the transition.

        Example:
            >>> engine = ArousalEngine(char_id=1, personality_type="responsive")
            >>> upd = engine.update("*kisses you softly*", role="user")
            >>> upd.reason
            'escalation_signal'
        """
        previous = self.current_level

        # Assistant turns never escalate — only optionally decay.
        if role != "user":
            # Apply time-gap decay if applicable; otherwise leave level alone.
            if time_gap_minutes > 5.0:
                decayed = self.decay(messages_since_signal=0, time_gap_minutes=time_gap_minutes)
                new_level = self.current_level
                return ArousalUpdate(
                    previous_level=previous,
                    new_level=new_level,
                    delta=new_level - previous,
                    reason="decay",
                )
            return ArousalUpdate(
                previous_level=previous,
                new_level=self.current_level,
                delta=0.0,
                reason="decay",
            )

        signal_type, raw_delta = self._detect_signals(message)

        if signal_type == "cool":
            # Cool signal: immediate -2, no decay stacking.
            new_level = max(0.0, self.current_level + raw_delta)
            self.current_level = new_level
            self._messages_since_signal = 0
            logger.debug(
                "char_id=%d arousal cool signal: %.1f → %.1f",
                self.char_id,
                previous,
                new_level,
            )
            return ArousalUpdate(
                previous_level=previous,
                new_level=new_level,
                delta=new_level - previous,
                reason="cool_signal",
            )

        if signal_type == "none":
            # No escalation — apply decay.
            self._messages_since_signal += 1
            self.decay(
                messages_since_signal=self._messages_since_signal,
                time_gap_minutes=time_gap_minutes,
            )
            new_level = self.current_level
            return ArousalUpdate(
                previous_level=previous,
                new_level=new_level,
                delta=new_level - previous,
                reason="decay",
            )

        # Escalation: cap advance by personality config.
        advance = min(raw_delta, self._config["max_advance"])
        new_level = min(10.0, self.current_level + advance)
        self.current_level = new_level
        self._messages_since_signal = 0
        logger.debug(
            "char_id=%d arousal %s signal +%.1f (capped from %.1f): %.1f → %.1f",
            self.char_id,
            signal_type,
            advance,
            raw_delta,
            previous,
            new_level,
        )
        return ArousalUpdate(
            previous_level=previous,
            new_level=new_level,
            delta=new_level - previous,
            reason="escalation_signal",
        )

    def decay(
        self,
        messages_since_signal: int = 1,
        time_gap_minutes: float = 0.0,
    ) -> float:
        """Apply natural decay to the current arousal level.

        Called internally by ``update()`` when no escalation signal is
        detected.  May also be called externally between conversation turns.

        Args:
            messages_since_signal: Number of consecutive messages with no
                escalation.  Currently used only to decide whether to apply
                decay at all (≥1 triggers decay).
            time_gap_minutes: Real-world minutes since the previous message.
                Gaps larger than 5 minutes add an extra -1 on top of the
                personality decay rate.

        Returns:
            The absolute amount decayed (always ≥ 0.0).

        Example:
            >>> engine = ArousalEngine(char_id=1, personality_type="responsive")
            >>> engine.current_level = 5.0
            >>> dropped = engine.decay()
            >>> dropped
            1.0
        """
        if self.current_level <= 0.0:
            return 0.0

        amount = self._config["decay_rate"]
        if time_gap_minutes > 5.0:
            amount += 1.0

        new_level = max(0.0, self.current_level - amount)
        actual_drop = self.current_level - new_level
        self.current_level = new_level
        return actual_drop

    def reset(self) -> ArousalUpdate:
        """Reset arousal to 0 immediately (safe-word trigger).

        Returns:
            ``ArousalUpdate`` with ``reason="reset"`` and ``new_level=0.0``.

        Example:
            >>> engine = ArousalEngine(char_id=1)
            >>> engine.current_level = 8.5
            >>> result = engine.reset()
            >>> result.new_level
            0.0
            >>> result.reason
            'reset'
        """
        previous = self.current_level
        self.current_level = 0.0
        self._messages_since_signal = 0
        logger.info("char_id=%d arousal reset from %.1f to 0.0", self.char_id, previous)
        return ArousalUpdate(
            previous_level=previous,
            new_level=0.0,
            delta=-previous,
            reason="reset",
        )

    # ------------------------------------------------------------------
    # Prompt helpers
    # ------------------------------------------------------------------

    def get_prompt_modifiers(self) -> ArousalPromptModifiers:
        """Get writing style modifiers for the current arousal level.

        Modifier values are keyed on ``displayed_level`` bands:

        * 0-3  → relaxed / normal
        * 4-6  → heightened / charged
        * 7-9  → intense / fragmented
        * 10   → peak / minimal

        Returns:
            ``ArousalPromptModifiers`` matching the current level band.

        Example:
            >>> engine = ArousalEngine(char_id=1)
            >>> engine.current_level = 8.0
            >>> mods = engine.get_prompt_modifiers()
            >>> mods.vocabulary_level
            'intense'
        """
        level = self.displayed_level

        if level <= 3:
            return ArousalPromptModifiers(
                vocabulary_level="normal",
                max_response_tokens=300,
                sentence_style="flowing",
                action_frequency="occasional",
                breathing_mentions=False,
                ellipsis_frequency="none",
                coherence_level="full",
            )
        if level <= 6:
            return ArousalPromptModifiers(
                vocabulary_level="charged",
                max_response_tokens=200,
                sentence_style="mixed",
                action_frequency="frequent",
                breathing_mentions=True,
                ellipsis_frequency="occasional",
                coherence_level="slightly_scattered",
            )
        if level <= 9:
            return ArousalPromptModifiers(
                vocabulary_level="intense",
                max_response_tokens=150,
                sentence_style="short_fragmented",
                action_frequency="dominant",
                breathing_mentions=True,
                ellipsis_frequency="frequent",
                coherence_level="distracted",
            )
        # level == 10
        return ArousalPromptModifiers(
            vocabulary_level="minimal",
            max_response_tokens=80,
            sentence_style="fragments_only",
            action_frequency="almost_all",
            breathing_mentions=True,
            ellipsis_frequency="frequent",
            coherence_level="overwhelmed",
        )

    def build_arousal_prompt(self) -> str:
        """Build the full prompt block for LLM injection.

        Returns an empty string when ``displayed_level`` is 0 or 1 — no
        injection is needed at baseline.  At level 2+ returns the band
        description from ``AROUSAL_PROMPTS`` followed by a modifier summary.

        Returns:
            Formatted string for insertion into the system prompt, or ``""``
            when arousal is at baseline.

        Example:
            >>> engine = ArousalEngine(char_id=1)
            >>> engine.build_arousal_prompt()
            ''
            >>> engine.current_level = 5.0
            >>> prompt = engine.build_arousal_prompt()
            >>> prompt.startswith('[Arousal:')
            True
        """
        level = self.displayed_level
        if level <= 1:
            return ""

        # Select matching band prompt.
        band_text = ""
        for (low, high), text in AROUSAL_PROMPTS.items():
            if low <= level <= high:
                band_text = text
                break

        mods = self.get_prompt_modifiers()
        modifier_summary = (
            f"[Writing style: vocabulary={mods.vocabulary_level}, "
            f"sentences={mods.sentence_style}, "
            f"actions={mods.action_frequency}, "
            f"coherence={mods.coherence_level}, "
            f"max_tokens={mods.max_response_tokens}]"
        )
        return f"{band_text}\n{modifier_summary}"

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _detect_signals(self, message: str) -> tuple[str, float]:
        """Detect escalation or cool-down signals in a message.

        Cool signals take priority over escalation signals.  When multiple
        escalation tiers match, the strongest tier wins.

        Args:
            message: Raw text to scan (typically the user's turn).

        Returns:
            A ``(signal_type, delta)`` tuple where ``signal_type`` is one
            of ``"cool"``, ``"mild"``, ``"moderate"``, ``"strong"``, or
            ``"none"``; and ``delta`` is the signed arousal change to apply
            before personality capping.

        Example:
            >>> engine = ArousalEngine(char_id=1)
            >>> engine._detect_signals("wait, let's slow down")
            ('cool', -2.0)
            >>> engine._detect_signals("*kisses your neck*")
            ('moderate', 1.5)
        """
        # Cool signals take priority.
        for pattern in COOL_SIGNALS:
            if pattern.search(message):
                return ("cool", -2.0)

        # Check escalation tiers from strongest to weakest so the highest
        # matched tier wins when multiple groups fire in the same message.
        for tier in ("strong", "moderate", "mild"):
            for pattern in ESCALATION_SIGNALS[tier]:
                if pattern.search(message):
                    return (tier, _ESCALATION_STRENGTH[tier])

        return ("none", 0.0)

    # ------------------------------------------------------------------
    # Factory
    # ------------------------------------------------------------------

    @classmethod
    def for_character(cls, char_id: int, char_name: str = "") -> "ArousalEngine":
        """Create an engine with the correct personality for a known character.

        Looks up ``char_name`` in ``CHARACTER_AROUSAL_TYPE``.  Falls back to
        ``"responsive"`` for unknown characters.

        Args:
            char_id: Database ID of the character.
            char_name: Display name as listed in ``AROUSAL_PERSONALITIES``
                character lists (e.g. ``"Dae (Neciridae)"``).

        Returns:
            A new ``ArousalEngine`` configured for the character.

        Example:
            >>> engine = ArousalEngine.for_character(char_id=2, char_name="Dae (Neciridae)")
            >>> engine.personality_type
            'slow_burn'
        """
        ptype = CHARACTER_AROUSAL_TYPE.get(char_name, "responsive")
        return cls(char_id, ptype)
