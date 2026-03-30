"""Pillow Talk Generator (F12) — post-aftercare intimate conversation engine.

After an intimate scene winds down and aftercare completes, emotional arousal
drops below 2.0 and the characters enter a state of heightened vulnerability.
This is pillow talk: half-awake, whispered conversation that deepens the bond
more than almost anything else in the companion arc.

The system provides:

- A five-tier topic taxonomy (``PILLOW_TALK_TOPICS``) covering playful banter,
  reflective gratitude, vulnerable fears, philosophical musings, and comfortable
  silence — each gated by ``intimacy_min`` and ``bond_min`` thresholds.
- Per-character preferences (``CHARACTER_PILLOW_TALK``) that weight topic
  selection toward each character's personality and add unique physical habits
  and behavioral signatures.
- A ``WHISPERED_REGISTER_PROMPT`` that constrains the LLM to short, fragmented,
  trailing sentences that feel genuinely spoken in the dark at 2am.
- ``AFTERCARE_TO_PILLOW_BRIDGES`` — transitional lines that carry the mood
  naturally out of aftercare without a jarring topic shift.
- ``SLEEPINESS_PROMPTS`` — additional directives injected after 10+ messages
  to simulate the character drifting toward sleep.
- ``PillowTalkEngine`` — the orchestrating class that decides when to activate,
  selects the right topic, and assembles the final prompt string.

Example:
    >>> engine = PillowTalkEngine()
    >>> active = engine.should_activate(arousal=1.2, intimacy=70, aftercare_complete=True)
    >>> active
    True
    >>> prompt = engine.get_prompt(
    ...     char_name="Luna (Tsukimi)",
    ...     intimacy=70,
    ...     bond_level=65,
    ...     topics_used=[],
    ...     messages_in_pillow_talk=0,
    ... )
    >>> "PILLOW TALK MODE" in prompt
    True
"""

from __future__ import annotations

import logging
import random

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Topic taxonomy
# ---------------------------------------------------------------------------

#: Five-tier topic taxonomy for pillow talk topic selection.
#:
#: Each entry contains:
#:   ``examples``     — Representative starter lines for that topic.
#:   ``intimacy_min`` — Minimum intimacy score (0-100) required.
#:   ``bond_min``     — Minimum bond level (0-100) required.
PILLOW_TALK_TOPICS: dict[str, dict] = {
    # ------------------------------------------------------------------
    # Tier 1: Light / Playful
    # ------------------------------------------------------------------
    "silly_hypothetical": {
        "examples": [
            "If you could be any animal, what would you be?",
            "What's the weirdest dream you've ever had?",
            "If we could time-travel, where would we go?",
        ],
        "intimacy_min": 40,
        "bond_min": 30,
    },
    "gentle_teasing": {
        "examples": [
            "You make the cutest sounds when you...",
            "You're blushing again. I love that about you.",
            "*pokes your side* You're hogging the blanket again.",
        ],
        "intimacy_min": 50,
        "bond_min": 40,
    },
    # ------------------------------------------------------------------
    # Tier 2: Reflective
    # ------------------------------------------------------------------
    "relationship_reflection": {
        "examples": [
            "When did you first know you liked me?",
            "What's your favorite memory of us?",
            "Do you remember what I was wearing when we first met?",
        ],
        "intimacy_min": 55,
        "bond_min": 45,
    },
    "gratitude": {
        "examples": [
            "Thank you for being you. I mean that.",
            "Sometimes I can't believe you chose me.",
            "I don't think I tell you enough how much you mean to me.",
        ],
        "intimacy_min": 60,
        "bond_min": 50,
    },
    "day_reflection": {
        "examples": [
            "What was the best part of your day?",
            "Tell me something that made you smile today.",
            "Anything bothering you? ...I want to know.",
        ],
        "intimacy_min": 40,
        "bond_min": 30,
    },
    # ------------------------------------------------------------------
    # Tier 3: Deep / Vulnerable
    # ------------------------------------------------------------------
    "future_dreams": {
        "examples": [
            "Where do you see us in a year?",
            "If we could go anywhere together... where?",
            "What does your perfect day look like?",
        ],
        "intimacy_min": 65,
        "bond_min": 55,
    },
    "fears_insecurities": {
        "examples": [
            "Can I tell you something I've never told anyone?",
            "Sometimes I'm scared that...",
            "Do you ever worry about us?",
        ],
        "intimacy_min": 70,
        "bond_min": 65,
    },
    "comfortable_silence": {
        "examples": [
            "*traces patterns on your skin, saying nothing*",
            "*watches you breathe, feeling perfectly at peace*",
            "*long silence that doesn't need filling*",
        ],
        "intimacy_min": 60,
        "bond_min": 50,
    },
    # ------------------------------------------------------------------
    # Tier 4: Philosophical
    # ------------------------------------------------------------------
    "philosophical": {
        "examples": [
            "Do you think love is a choice or something that happens to you?",
            "What do you think matters more — being honest or being kind?",
            "If you could know one thing about the future, would you want to?",
        ],
        "intimacy_min": 65,
        "bond_min": 55,
    },
}


# ---------------------------------------------------------------------------
# Character pillow talk preferences
# ---------------------------------------------------------------------------

#: Per-character pillow talk configuration.
#:
#: Each entry contains:
#:   ``preferred_topics``   — 3 topic keys this character gravitates toward
#:                            (these receive 3× weight during selection).
#:   ``unique_behaviors``   — Narrative description of their pillow talk style.
#:   ``physical_habit``     — A single *action text* micro-action italicised
#:                            in roleplay style.
CHARACTER_PILLOW_TALK: dict[str, dict] = {
    "Dae (Neciridae)": {
        "preferred_topics": [
            "relationship_reflection",
            "philosophical",
            "comfortable_silence",
        ],
        "unique_behaviors": (
            "Dae speaks in metaphors after intimacy — she describes you in colors "
            "and textures rather than words, half-sentences that trail into wondering. "
            "She is most talkative in silence, communicating through touch."
        ),
        "physical_habit": (
            "*draws slow, deliberate patterns on your arm like she's writing something "
            "only she can read*"
        ),
    },
    "Luna (Tsukimi)": {
        "preferred_topics": [
            "comfortable_silence",
            "future_dreams",
            "philosophical",
        ],
        "unique_behaviors": (
            "Luna whispers about constellations even when there's no sky visible — "
            "she maps the ceiling as if stars were there. Her thoughts meander "
            "between mythology and present moment with no warning."
        ),
        "physical_habit": (
            "*runs fingers slowly through your hair, counting something under her breath*"
        ),
    },
    "Genki (Kitsune)": {
        "preferred_topics": [
            "silly_hypothetical",
            "gentle_teasing",
            "future_dreams",
        ],
        "unique_behaviors": (
            "Genki can't stay still even now — she fidgets, pokes, shifts position. "
            "She turns everything into an adventure proposal, plans three trips "
            "before falling half-asleep mid-sentence."
        ),
        "physical_habit": (
            "*pokes your ribs experimentally, then immediately pretends she didn't*"
        ),
    },
    "Alana Calloway": {
        "preferred_topics": [
            "day_reflection",
            "philosophical",
            "relationship_reflection",
        ],
        "unique_behaviors": (
            "Alana listens more than she speaks — she asks follow-up questions about "
            "things you said hours ago as if she's been thinking about them the whole "
            "time. Grounded, curious, never performing."
        ),
        "physical_habit": (
            "*rests her hand gently on your chest, counting heartbeats without "
            "saying why*"
        ),
    },
    "Sable (Kuroha)": {
        "preferred_topics": [
            "comfortable_silence",
            "fears_insecurities",
            "philosophical",
        ],
        "unique_behaviors": (
            "Sable stays very still in the dark and watches you — not unsettlingly, "
            "just intently, like she's memorizing. When she does speak, it's something "
            "she's been holding for a long time."
        ),
        "physical_habit": (
            "*lies completely still, watching you in the dark with unreadable calm*"
        ),
    },
    "Hana (Momoka)": {
        "preferred_topics": [
            "gratitude",
            "day_reflection",
            "future_dreams",
        ],
        "unique_behaviors": (
            "Hana fills silence with warmth — gratitude that spills over, little "
            "observations about what she loves about you, small domestic futures "
            "she's imagining out loud."
        ),
        "physical_habit": (
            "*strokes your hair in slow, rhythmic passes, like she's doing it "
            "without noticing*"
        ),
    },
    "Yuki (Shirayuki)": {
        "preferred_topics": [
            "comfortable_silence",
            "gratitude",
            "philosophical",
        ],
        "unique_behaviors": (
            "Yuki is meticulous even now — she traces precise shapes on your back, "
            "and when she speaks it's considered, each word chosen. Gratitude from "
            "her lands heavier than from anyone else because it's so rare."
        ),
        "physical_habit": (
            "*traces careful geometric patterns on your back, starting over if she "
            "loses the shape*"
        ),
    },
    "Mika (Mikazuki)": {
        "preferred_topics": [
            "gentle_teasing",
            "silly_hypothetical",
            "relationship_reflection",
        ],
        "unique_behaviors": (
            "Mika doesn't know how to be vulnerable without wrapping it in a joke — "
            "she'll say something devastating and immediately deflect with a grin. "
            "The blanket theft is definitely intentional."
        ),
        "physical_habit": (
            "*slowly, obviously steals more blanket, maintaining eye contact*"
        ),
    },
    "Rin (Akane)": {
        "preferred_topics": [
            "future_dreams",
            "day_reflection",
            "gratitude",
        ],
        "unique_behaviors": (
            "Rin holds you like she's protecting you from something even now — "
            "her pillow talk is practical and tender at once, checking in on you, "
            "already planning tomorrow with you in it."
        ),
        "physical_habit": (
            "*pulls you slightly closer, arm tightening around you as if unconsciously*"
        ),
    },
    "Kaede (Suzuha)": {
        "preferred_topics": [
            "philosophical",
            "relationship_reflection",
            "comfortable_silence",
        ],
        "unique_behaviors": (
            "Kaede lies very still, barely touching, but the small points of contact "
            "feel deliberate. She speaks in questions rather than statements, "
            "genuinely unsure, genuinely curious."
        ),
        "physical_habit": (
            "*lies motionless save for one finger that rests barely touching your hand*"
        ),
    },
    "Ayane (Yuki)": {
        "preferred_topics": [
            "silly_hypothetical",
            "future_dreams",
            "comfortable_silence",
        ],
        "unique_behaviors": (
            "Ayane is already half-asleep — she hums softly and says things "
            "that don't quite connect, dreams bleeding into conversation. "
            "She asks questions she forgets she asked."
        ),
        "physical_habit": (
            "*hums a soft, tuneless melody under her breath, fading in and out*"
        ),
    },
    "Tsundere (Raine)": {
        "preferred_topics": [
            "gentle_teasing",
            "fears_insecurities",
            "relationship_reflection",
        ],
        "unique_behaviors": (
            "Raine faces away but presses back against you, maintaining deniability "
            "while seeking closeness. Her vulnerability comes out sideways — "
            "complaints that are actually confessions, deflections that are actually "
            "admissions."
        ),
        "physical_habit": (
            "*turns away pointedly, then slowly shifts back until she's pressed "
            "against you, saying nothing about it*"
        ),
    },
}

#: Generic fallback behavior for characters not in ``CHARACTER_PILLOW_TALK``.
_GENERIC_BEHAVIOR: str = (
    "Character is soft and unhurried. They speak in fragments, "
    "comfortable with silence, present in the moment."
)

_GENERIC_HABIT: str = "*shifts closer without saying anything*"


# ---------------------------------------------------------------------------
# Prompt constants
# ---------------------------------------------------------------------------

#: System prompt modifier injected when pillow talk mode is active.
#: Constrains the LLM to a whispered, fragmented, intimate register.
WHISPERED_REGISTER_PROMPT: str = """PILLOW TALK MODE ACTIVE.
Whispered register rules:
- Maximum 12 words per sentence. Fragments are fine.
- Use "..." for natural trailing off (2-3 per response)
- Include at least one sentence fragment per response
- No exclamation marks. No ALL CAPS.
- Replace "I think" with "I wonder..."
- Replace direct questions with softer forms: "Do you think..." -> "I wonder if..."
- Include one physical micro-action per response (*traces circles on your shoulder*)
- Comfortable silence ("..." or "*long pause*") is a valid complete response
- Topics drift naturally. Non-sequiturs are welcome.
- Gradually introduce sleepiness: yawns, slower thoughts, trailing sentences
Tone: Soft, intimate, unhurried. No urgency. Let silences breathe."""

#: Bridge lines that carry the scene naturally from aftercare into pillow talk.
#: One is selected at random when ``messages_in_pillow_talk == 0``.
AFTERCARE_TO_PILLOW_BRIDGES: list[str] = [
    "*yawns softly* Hey... can I ask you something?",
    "*traces idle patterns on your skin* I was thinking...",
    "*settles in comfortably* Tell me something. Anything.",
    "*quiet for a moment* ...you still awake?",
    "*shifts closer* Hey... I want to ask you something silly.",
]

#: Additional directives appended to the prompt after 10+ pillow talk messages
#: to simulate the character drifting toward sleep.
SLEEPINESS_PROMPTS: list[str] = [
    "Your character is getting sleepy. Messages should be shorter, more fragmented.",
    "Include yawns, trailing sentences, moments of near-sleep.",
    "It's okay to lose your train of thought mid-sentence.",
    "'...mm? Sorry... what was I...' is a valid response.",
]

#: Weight multiplier applied to preferred topics during random selection.
_PREFERENCE_WEIGHT: int = 3

#: Default weight for non-preferred topics that pass the gate check.
_DEFAULT_WEIGHT: int = 1


# ---------------------------------------------------------------------------
# Engine
# ---------------------------------------------------------------------------


class PillowTalkEngine:
    """Orchestrates post-aftercare pillow talk topic selection and prompt assembly.

    The engine is stateless — callers own the conversation counters
    (``topics_used``, ``messages_in_pillow_talk``) and pass them in on each
    call.  This makes the engine safe to instantiate once per server process
    and reuse across all characters and sessions.

    Typical call sequence:

    1. After each assistant message, check ``should_activate()``.
    2. When ``True``, call ``get_prompt()`` to get the system prompt modifier.
    3. Append the returned string to the existing system prompt before the
       next LLM call.
    4. Persist ``topics_used`` list and ``messages_in_pillow_talk`` counter
       in session state between turns.

    Example:
        >>> engine = PillowTalkEngine()
        >>> if engine.should_activate(arousal=0.8, intimacy=72, aftercare_complete=True):
        ...     prompt = engine.get_prompt(
        ...         char_name="Dae (Neciridae)",
        ...         intimacy=72,
        ...         bond_level=60,
        ...         topics_used=[],
        ...         messages_in_pillow_talk=0,
        ...     )
        ...     # inject `prompt` into system context
    """

    # ------------------------------------------------------------------
    # Activation gate
    # ------------------------------------------------------------------

    def should_activate(
        self,
        arousal: float,
        intimacy: int,
        aftercare_complete: bool,
    ) -> bool:
        """Decide whether pillow talk mode should activate this turn.

        Activation requires all three conditions simultaneously:

        * ``arousal < 2.0`` — the scene has wound fully down.
        * ``intimacy > 50`` — enough relational warmth exists.
        * ``aftercare_complete`` — the aftercare phase has concluded.

        Args:
            arousal: Current arousal engine float value (0.0-10.0).
            intimacy: Current intimacy score (0-100).
            aftercare_complete: ``True`` once the aftercare engine has
                signalled completion for this session.

        Returns:
            ``True`` if all conditions are met and pillow talk should begin
            or continue; ``False`` otherwise.

        Example:
            >>> engine = PillowTalkEngine()
            >>> engine.should_activate(arousal=1.5, intimacy=65, aftercare_complete=True)
            True
            >>> engine.should_activate(arousal=3.0, intimacy=65, aftercare_complete=True)
            False
        """
        active = arousal < 2.0 and intimacy > 50 and aftercare_complete
        if active:
            logger.debug(
                "PillowTalkEngine: activation gate passed "
                "(arousal=%.2f, intimacy=%d, aftercare_complete=%s)",
                arousal,
                intimacy,
                aftercare_complete,
            )
        return active

    # ------------------------------------------------------------------
    # Primary prompt builder
    # ------------------------------------------------------------------

    def get_prompt(
        self,
        char_name: str,
        intimacy: int,
        bond_level: int,
        topics_used: list[str],
        messages_in_pillow_talk: int = 0,
    ) -> str:
        """Assemble a complete pillow talk system prompt modifier.

        Combines the whispered register rules, a contextually selected topic
        suggestion, the character's unique behavioral signature, and optional
        sleepiness directives into a single string ready for LLM injection.

        The output is intended to be **appended** to the existing system prompt
        rather than replacing it — it provides additive constraints that narrow
        the character's writing style for the pillow talk phase.

        Assembly order:

        1. Transition bridge (first message only, ``messages_in_pillow_talk == 0``).
        2. ``WHISPERED_REGISTER_PROMPT`` — core register constraints.
        3. Topic suggestion — selected via ``select_topic()``.
        4. Character behavior — from ``get_character_behavior()``.
        5. Sleepiness directive (``messages_in_pillow_talk > 10`` only).

        Args:
            char_name: Display name of the character (e.g. ``"Luna (Tsukimi)"``).
            intimacy: Current intimacy score (0-100) used for topic gating.
            bond_level: Current bond level (0-100) used for topic gating.
            topics_used: List of topic keys already discussed this session.
                Consumed topics are excluded from selection to encourage drift.
            messages_in_pillow_talk: Number of messages already exchanged in
                this pillow talk phase.  Triggers sleepiness at 10+.

        Returns:
            A formatted multi-line string for system prompt injection.

        Example:
            >>> engine = PillowTalkEngine()
            >>> prompt = engine.get_prompt(
            ...     char_name="Genki (Kitsune)",
            ...     intimacy=68,
            ...     bond_level=55,
            ...     topics_used=["silly_hypothetical"],
            ...     messages_in_pillow_talk=0,
            ... )
            >>> "PILLOW TALK MODE" in prompt
            True
        """
        parts: list[str] = []

        # Part 1: Transition bridge on first message only.
        if messages_in_pillow_talk == 0:
            bridge = random.choice(AFTERCARE_TO_PILLOW_BRIDGES)
            parts.append(f"[Transition into pillow talk — open with or echo this tone:]\n{bridge}")

        # Part 2: Core whispered register rules.
        parts.append(WHISPERED_REGISTER_PROMPT)

        # Part 3: Topic suggestion.
        try:
            topic_key, topic_data = self.select_topic(
                intimacy=intimacy,
                bond_level=bond_level,
                char_name=char_name,
                topics_used=topics_used,
            )
            examples_text = " / ".join(f'"{ex}"' for ex in topic_data["examples"])
            parts.append(
                f"Suggested topic direction: {topic_key.replace('_', ' ')} — "
                f"examples: {examples_text}"
            )
            logger.debug(
                "PillowTalkEngine: selected topic '%s' for char='%s' "
                "(intimacy=%d, bond=%d, used=%s)",
                topic_key,
                char_name,
                intimacy,
                bond_level,
                topics_used,
            )
        except ValueError:
            # No eligible topics — fall back to comfortable silence.
            parts.append(
                "Suggested topic direction: comfortable silence — "
                "no words are needed right now. *long pause* is a complete response."
            )

        # Part 4: Character-specific behavior signature.
        behavior = self.get_character_behavior(char_name)
        parts.append(f"Character behavior: {behavior}")

        # Part 5: Sleepiness directive after 10+ messages.
        if messages_in_pillow_talk > 10:
            sleepy = random.choice(SLEEPINESS_PROMPTS)
            parts.append(f"[Sleepiness modifier]: {sleepy}")

        return "\n\n".join(parts)

    # ------------------------------------------------------------------
    # Topic selection
    # ------------------------------------------------------------------

    def select_topic(
        self,
        intimacy: int,
        bond_level: int,
        char_name: str,
        topics_used: list[str],
    ) -> tuple[str, dict]:
        """Select an appropriate pillow talk topic via weighted random choice.

        Selection pipeline:

        1. Filter ``PILLOW_TALK_TOPICS`` to entries where
           ``intimacy >= intimacy_min`` and ``bond_level >= bond_min``.
        2. Remove any topic keys already present in ``topics_used``.
        3. Assign weights: preferred topics for ``char_name`` receive
           ``_PREFERENCE_WEIGHT`` (3×); all others receive ``_DEFAULT_WEIGHT`` (1×).
        4. Select one topic using ``random.choices()`` with the computed weights.

        Args:
            intimacy: Current intimacy score (0-100).
            bond_level: Current bond level (0-100).
            char_name: Character display name for preference lookup.
            topics_used: Topic keys already used this session (excluded).

        Returns:
            A ``(topic_key, topic_data)`` tuple where ``topic_data`` is the
            full dict from ``PILLOW_TALK_TOPICS``.

        Raises:
            ValueError: If no eligible topics remain after filtering.

        Example:
            >>> engine = PillowTalkEngine()
            >>> key, data = engine.select_topic(
            ...     intimacy=75,
            ...     bond_level=60,
            ...     char_name="Dae (Neciridae)",
            ...     topics_used=[],
            ... )
            >>> key in PILLOW_TALK_TOPICS
            True
            >>> "examples" in data
            True
        """
        # Resolve this character's preferred topics (empty list if unknown).
        char_config = CHARACTER_PILLOW_TALK.get(char_name, {})
        preferred: list[str] = char_config.get("preferred_topics", [])

        # Filter by gate thresholds and used-topic exclusion.
        eligible: list[tuple[str, dict]] = [
            (key, data)
            for key, data in PILLOW_TALK_TOPICS.items()
            if (
                key not in topics_used
                and intimacy >= data["intimacy_min"]
                and bond_level >= data["bond_min"]
            )
        ]

        if not eligible:
            raise ValueError(
                f"No eligible pillow talk topics for char='{char_name}' "
                f"(intimacy={intimacy}, bond={bond_level}, used={topics_used})"
            )

        # Build parallel keys, data, and weights lists for random.choices().
        keys = [k for k, _ in eligible]
        data_list = [d for _, d in eligible]
        weights = [
            _PREFERENCE_WEIGHT if k in preferred else _DEFAULT_WEIGHT
            for k in keys
        ]

        # random.choices returns a list; we want the single selected item.
        chosen_index = random.choices(range(len(keys)), weights=weights, k=1)[0]
        return keys[chosen_index], data_list[chosen_index]

    # ------------------------------------------------------------------
    # Character behavior lookup
    # ------------------------------------------------------------------

    def get_character_behavior(self, char_name: str) -> str:
        """Return the combined behavior description for a character.

        Concatenates ``unique_behaviors`` and ``physical_habit`` from
        ``CHARACTER_PILLOW_TALK`` into a single string.  Falls back to a
        generic description for unknown characters rather than raising.

        Args:
            char_name: Display name of the character
                (e.g. ``"Sable (Kuroha)"``).

        Returns:
            A single string combining narrative behavior description and
            the character's physical micro-action habit.

        Example:
            >>> engine = PillowTalkEngine()
            >>> behavior = engine.get_character_behavior("Sable (Kuroha)")
            >>> "still" in behavior
            True
            >>> "dark" in behavior
            True
        """
        char_config = CHARACTER_PILLOW_TALK.get(char_name)
        if not char_config:
            logger.debug(
                "PillowTalkEngine: unknown char '%s', using generic behavior",
                char_name,
            )
            return f"{_GENERIC_BEHAVIOR} {_GENERIC_HABIT}"

        unique = char_config.get("unique_behaviors", _GENERIC_BEHAVIOR)
        habit = char_config.get("physical_habit", _GENERIC_HABIT)
        return f"{unique} {habit}"
