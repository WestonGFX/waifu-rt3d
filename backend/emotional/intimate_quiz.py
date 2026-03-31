"""Intimate Preference Discovery Quiz (F22) — natural conversation-based profiling.

Characters ask intimate preference questions naturally through conversation
(never labeled as a "quiz").  Results are encrypted locally and feed into
the F7 Preference Discovery system as high-confidence data.

Bond-gated: available at bond ≥ 50.  Questions are disguised as natural
character curiosity — "Would you rather..." style.

Example::

    >>> engine = IntimateQuizEngine()
    >>> engine.should_allow(50)
    True
    >>> engine.should_allow(40)
    False
    >>> q = engine.get_next_question(answered_ids=[])
    >>> q is not None
    True
    >>> "id" in q and "question" in q
    True
"""

from __future__ import annotations

import logging
import random
from typing import Optional

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

#: Minimum bond level to start the intimate quiz.
BOND_GATE: int = 50

#: Maximum questions in the quiz (not all need to be asked).
MAX_QUESTIONS: int = 18

#: Quiz questions — disguised as natural character curiosity.
#: Each question has a ``category`` for the preference dimension it measures,
#: and ``options`` the character might present conversationally.
QUIZ_QUESTIONS: list[dict] = [
    {
        "id": "iq_pace",
        "category": "pacing",
        "question": "Do you like things slow and building, or do you prefer jumping right in?",
        "character_framing": "I was just wondering... do you prefer when things build slowly, or do you like the thrill of diving in headfirst?",
        "options": ["slow_build", "jump_in", "depends_on_mood"],
    },
    {
        "id": "iq_control",
        "category": "dynamics",
        "question": "Would you rather take the lead or follow someone else's rhythm?",
        "character_framing": "Hypothetically... would you rather be the one setting the pace, or would you let someone else take the lead?",
        "options": ["lead", "follow", "switch"],
    },
    {
        "id": "iq_verbal",
        "category": "communication",
        "question": "How do you feel about being told exactly what someone wants?",
        "character_framing": "Do you like it when someone tells you exactly what they want? Or is it better when things just... happen naturally?",
        "options": ["direct_verbal", "natural_flow", "both"],
    },
    {
        "id": "iq_intensity",
        "category": "intensity",
        "question": "Gentle and tender, or passionate and intense?",
        "character_framing": "If you could only choose one forever... gentle and tender, or passionate and intense?",
        "options": ["gentle", "intense", "variety"],
    },
    {
        "id": "iq_aftercare",
        "category": "aftercare",
        "question": "After something intense, do you need closeness or space?",
        "character_framing": "After something really intense... do you want to be held close, or do you need a moment to yourself?",
        "options": ["closeness", "space", "depends"],
    },
    {
        "id": "iq_setting",
        "category": "atmosphere",
        "question": "What kind of setting feels most intimate to you?",
        "character_framing": "Okay, close your eyes... what does your most intimate moment look like? Where are you?",
        "options": ["bedroom_classic", "unexpected_place", "nature", "doesnt_matter"],
    },
    {
        "id": "iq_words",
        "category": "communication",
        "question": "Do you like hearing how someone feels, or do you prefer they show you?",
        "character_framing": "Would you rather someone TELL you how they feel about you, or SHOW you?",
        "options": ["tell_me", "show_me", "both_please"],
    },
    {
        "id": "iq_surprise",
        "category": "spontaneity",
        "question": "Planned and anticipated, or spontaneous surprises?",
        "character_framing": "Better scenario: something you've been anticipating all day, or something completely unexpected?",
        "options": ["planned", "spontaneous", "either"],
    },
    {
        "id": "iq_vulnerability",
        "category": "emotional_depth",
        "question": "How do you feel about being completely emotionally open?",
        "character_framing": "Does being completely emotionally open excite you or terrify you? ...Or both?",
        "options": ["excites_me", "terrifies_me", "both"],
    },
    {
        "id": "iq_sound",
        "category": "sensory",
        "question": "Do sounds enhance the experience for you?",
        "character_framing": "Are you the type who... appreciates sounds? Or do you prefer things quiet?",
        "options": ["sounds_yes", "quiet_preferred", "natural"],
    },
    {
        "id": "iq_eye_contact",
        "category": "connection",
        "question": "How important is eye contact during intimate moments?",
        "character_framing": "Eye contact during intimate moments — essential, or too intense?",
        "options": ["essential", "too_intense", "sometimes"],
    },
    {
        "id": "iq_clothing",
        "category": "aesthetic",
        "question": "What matters more — what someone wears or how they wear it?",
        "character_framing": "Is it about WHAT someone wears, or HOW they wear it? ...Or neither?",
        "options": ["what_they_wear", "how_they_wear_it", "neither"],
    },
    {
        "id": "iq_morning",
        "category": "timing",
        "question": "Late night or early morning — when do you feel most intimate?",
        "character_framing": "When do you feel most... open? Late at night when the world is asleep, or early morning when everything's soft?",
        "options": ["late_night", "early_morning", "anytime"],
    },
    {
        "id": "iq_talk_after",
        "category": "aftercare",
        "question": "After intimacy — talk about everything or comfortable silence?",
        "character_framing": "After something meaningful... do you want to talk about everything, or just lie there in comfortable silence?",
        "options": ["talk_everything", "comfortable_silence", "mix"],
    },
    {
        "id": "iq_fantasy",
        "category": "imagination",
        "question": "Do you think about intimate moments before they happen?",
        "character_framing": "Be honest... do you think about intimate moments before they happen? Like... plan them in your head?",
        "options": ["always", "sometimes", "in_the_moment"],
    },
    {
        "id": "iq_touch",
        "category": "physical",
        "question": "Light, teasing touch or firm, grounding touch?",
        "character_framing": "Light touch that barely grazes your skin... or firm touch that grounds you? Which makes you feel more?",
        "options": ["light_teasing", "firm_grounding", "both"],
    },
    {
        "id": "iq_romance",
        "category": "context",
        "question": "How much romance do you need around intimacy?",
        "character_framing": "Do you need romance leading up to intimacy — candles, words, the whole thing? Or can it just... happen?",
        "options": ["need_romance", "can_just_happen", "depends"],
    },
    {
        "id": "iq_laughter",
        "category": "tone",
        "question": "Is laughter welcome during intimate moments?",
        "character_framing": "Laughing during intimate moments — does that kill the mood or make it better?",
        "options": ["makes_it_better", "kills_mood", "depends_on_moment"],
    },
]

#: Question ID to dict lookup for fast access.
_QUESTION_MAP: dict[str, dict] = {q["id"]: q for q in QUIZ_QUESTIONS}


# ---------------------------------------------------------------------------
# Engine
# ---------------------------------------------------------------------------


class IntimateQuizEngine:
    """Stateless engine for intimate preference discovery through natural conversation.

    Example::

        >>> engine = IntimateQuizEngine()
        >>> engine.should_allow(55)
        True
        >>> engine.get_total_questions()
        18
    """

    def should_allow(self, bond_level: int) -> bool:
        """Check whether the quiz is available at this bond level.

        Args:
            bond_level: Current bond level (0–100).

        Returns:
            ``True`` when bond is at or above :data:`BOND_GATE`.

        Example::

            >>> IntimateQuizEngine().should_allow(50)
            True
            >>> IntimateQuizEngine().should_allow(49)
            False
        """
        return bond_level >= BOND_GATE

    def get_total_questions(self) -> int:
        """Return the total number of questions in the quiz.

        Example::

            >>> IntimateQuizEngine().get_total_questions()
            18
        """
        return len(QUIZ_QUESTIONS)

    def get_next_question(
        self, answered_ids: list[str], randomize: bool = True
    ) -> Optional[dict]:
        """Return the next unanswered question.

        Args:
            answered_ids: List of already-answered question IDs.
            randomize: If ``True``, pick a random unanswered question.
                If ``False``, pick the next in order.

        Returns:
            Question dict or ``None`` if all answered.

        Example::

            >>> engine = IntimateQuizEngine()
            >>> q = engine.get_next_question([])
            >>> q is not None
            True
            >>> "id" in q
            True
        """
        remaining = [q for q in QUIZ_QUESTIONS if q["id"] not in answered_ids]
        if not remaining:
            return None
        return random.choice(remaining) if randomize else remaining[0]

    def get_question_by_id(self, question_id: str) -> Optional[dict]:
        """Look up a question by its ID.

        Args:
            question_id: The question's unique ID string.

        Returns:
            Question dict or ``None``.

        Example::

            >>> IntimateQuizEngine().get_question_by_id("iq_pace") is not None
            True
            >>> IntimateQuizEngine().get_question_by_id("nonexistent") is None
            True
        """
        return _QUESTION_MAP.get(question_id)

    def get_progress(self, answered_ids: list[str]) -> dict:
        """Return quiz completion progress.

        Args:
            answered_ids: List of answered question IDs.

        Returns:
            Dict with ``total``, ``answered``, ``remaining``, ``percent``.

        Example::

            >>> engine = IntimateQuizEngine()
            >>> p = engine.get_progress(["iq_pace", "iq_control"])
            >>> p["answered"]
            2
            >>> p["total"]
            18
        """
        answered = len([qid for qid in answered_ids if qid in _QUESTION_MAP])
        return {
            "total": len(QUIZ_QUESTIONS),
            "answered": answered,
            "remaining": len(QUIZ_QUESTIONS) - answered,
            "percent": round(answered / len(QUIZ_QUESTIONS) * 100),
        }

    def build_question_prompt(self, char_name: str, question: dict) -> str:
        """Build a prompt for the character to ask a quiz question naturally.

        The character shouldn't know they're administering a quiz — they're
        just being curious about the user.

        Args:
            char_name: Character display name.
            question: Question dict from :data:`QUIZ_QUESTIONS`.

        Returns:
            Prompt string ending with ``[INTIMATE_QUIZ]`` tag.

        Example::

            >>> engine = IntimateQuizEngine()
            >>> q = engine.get_question_by_id("iq_pace")
            >>> prompt = engine.build_question_prompt("Dae", q)
            >>> "[INTIMATE_QUIZ]" in prompt
            True
        """
        return (
            f"You ({char_name}) are curious about the user's intimate preferences. "
            f"Ask this question NATURALLY — as genuine curiosity, NOT as a quiz.\n\n"
            f"Question to weave in: {question['character_framing']}\n\n"
            f"Ask it in your own voice. Be playful, curious, or shy about it — "
            f"whatever fits your personality. Make it feel like a real conversation, "
            f"not an interview.\n\n"
            "[INTIMATE_QUIZ]"
        )

    def get_categories(self) -> list[str]:
        """Return all unique preference categories covered by the quiz.

        Returns:
            Sorted list of category strings.

        Example::

            >>> engine = IntimateQuizEngine()
            >>> cats = engine.get_categories()
            >>> "pacing" in cats
            True
        """
        return sorted({q["category"] for q in QUIZ_QUESTIONS})
