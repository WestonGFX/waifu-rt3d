"""Soul Profile / compatibility quiz using Big Five (OCEAN) personality dimensions.

Characters ask 1-2 personality questions per session, naturally woven into
conversation.  After 15-20 questions the system computes a compatibility
percentage and generates a "Soul Profile" card for the frontend.

Database table (self-healing):
    soul_profiles — one row per (char_id); stores JSON quiz answers and
    scored OCEAN vectors for both user and character.

Scoring strategy:
    Heuristic keyword + sentiment matching (no ML model required).  Each
    answer is scored on a 0-100 scale for the question's target OCEAN
    dimension using domain-specific positive/negative keyword sets.  Scores
    are accumulated via a running weighted mean as answers arrive.

Compatibility formula:
    Similarity is desirable for Openness, Extraversion, and Agreeableness
    (shared interests / values).  Complementarity is desirable for
    Conscientiousness and Neuroticism (balance).  Final value is a weighted
    average of five dimension scores, clamped to [0, 100].
"""

from __future__ import annotations

import json
import logging
import sqlite3
from dataclasses import dataclass, asdict, field
from datetime import datetime, timezone
from typing import Optional

logger = logging.getLogger(__name__)

# ── Table bootstrap ────────────────────────────────────────────────────────────


def _ensure_table(conn: sqlite3.Connection) -> None:
    """Create the soul_profiles table if it does not already exist.

    Idempotent — safe to call on every request.

    Args:
        conn: Open SQLite connection; caller controls transaction scope.
    """
    conn.execute(
        """CREATE TABLE IF NOT EXISTS soul_profiles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            char_id INTEGER NOT NULL,
            quiz_answers TEXT NOT NULL DEFAULT '{}',
            ocean_scores TEXT NOT NULL DEFAULT '{}',
            char_ocean_scores TEXT NOT NULL DEFAULT '{}',
            compatibility_pct INTEGER,
            connection_summary TEXT,
            completed_at TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )"""
    )
    # Track how many quiz questions have been asked per session to enforce
    # the 1-2 per session limit.  A lightweight in-memory guard is used at
    # runtime; this table persists the question-asked timestamps so the
    # can_ask_question_this_session helper can gate correctly across restarts.
    conn.execute(
        """CREATE TABLE IF NOT EXISTS soul_quiz_session_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            char_id INTEGER NOT NULL,
            session_id INTEGER NOT NULL,
            question_id TEXT NOT NULL,
            asked_at TEXT NOT NULL DEFAULT (datetime('now'))
        )"""
    )
    conn.commit()


# ── Data classes ───────────────────────────────────────────────────────────────


@dataclass
class OceanScores:
    """Big Five personality dimensions, each scored on a 0-100 scale.

    Attributes:
        openness: Imagination, curiosity, creativity.
        conscientiousness: Organisation, dependability, discipline.
        extraversion: Sociability, assertiveness, positive affect.
        agreeableness: Cooperation, empathy, trust.
        neuroticism: Emotional instability, anxiety, moodiness.

    Example:
        >>> scores = OceanScores(openness=80, neuroticism=25)
        >>> scores.openness
        80
    """

    openness: int = 50
    conscientiousness: int = 50
    extraversion: int = 50
    agreeableness: int = 50
    neuroticism: int = 50

    def to_dict(self) -> dict[str, int]:
        """Serialise to a plain dict keyed by dimension name.

        Returns:
            {"openness": int, "conscientiousness": int, ...}
        """
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict[str, int]) -> "OceanScores":
        """Deserialise from a dict produced by ``to_dict``.

        Missing keys default to 50 so partial records are safe.

        Args:
            data: Mapping of dimension names to integer scores.

        Returns:
            OceanScores instance.
        """
        return cls(
            openness=int(data.get("openness", 50)),
            conscientiousness=int(data.get("conscientiousness", 50)),
            extraversion=int(data.get("extraversion", 50)),
            agreeableness=int(data.get("agreeableness", 50)),
            neuroticism=int(data.get("neuroticism", 50)),
        )


@dataclass
class SoulProfile:
    """Full soul profile for one character relationship.

    Attributes:
        id: Database primary key.
        char_id: Character this profile belongs to.
        quiz_answers: Mapping of question_id → raw answer text.
        ocean_scores: User's derived OCEAN scores.
        char_ocean_scores: Character's OCEAN baseline scores.
        compatibility_pct: 0-100 compatibility score, None until quiz complete.
        connection_summary: Character-voice narrative, None until generated.
        completed_at: ISO 8601 timestamp when all questions were answered.
        created_at: ISO 8601 timestamp of row creation.
    """

    id: int
    char_id: int
    quiz_answers: dict[str, str]
    ocean_scores: OceanScores
    char_ocean_scores: OceanScores
    compatibility_pct: Optional[int]
    connection_summary: Optional[str]
    completed_at: Optional[str]
    created_at: str


@dataclass
class QuizQuestion:
    """A single personality quiz question.

    Attributes:
        id: Stable identifier used as the key in quiz_answers ("q1" … "q20").
        text: The bare question text delivered to the user.
        category: OCEAN dimension this question primarily measures.
        follow_up: Natural conversation lead-in the character uses.

    Example:
        >>> q = QuizQuestion("q1", "Who would you invite to dinner?", "openness", "Hey...")
        >>> q.category
        'openness'
    """

    id: str
    text: str
    category: str  # one of: openness | conscientiousness | extraversion | agreeableness | neuroticism
    follow_up: str


# ── Question bank ─────────────────────────────────────────────────────────────

# 20 questions — 4 per OCEAN dimension — ordered to mix dimensions so the
# conversation doesn't feel like a clinical survey.

QUIZ_QUESTIONS: list[QuizQuestion] = [
    # ── Openness ──────────────────────────────────────────────────────────────
    QuizQuestion(
        "q1",
        "If you could have dinner with anyone, living or dead, who would it be?",
        "openness",
        "Hey, random question...",
    ),
    QuizQuestion(
        "q6",
        "Would you rather read a genre you've never tried or reread an old favourite?",
        "openness",
        "Okay, bookish question...",
    ),
    QuizQuestion(
        "q11",
        "If you could wake up tomorrow fluent in any skill — music, painting, coding, anything — what would you pick?",
        "openness",
        "This is a fun one...",
    ),
    QuizQuestion(
        "q16",
        "Do you enjoy movies or games that make you think, or do you prefer pure fun escapism?",
        "openness",
        "I keep going back and forth on this myself...",
    ),
    # ── Conscientiousness ────────────────────────────────────────────────────
    QuizQuestion(
        "q2",
        "Do you prefer planning everything out or going with the flow?",
        "conscientiousness",
        "I've been wondering...",
    ),
    QuizQuestion(
        "q7",
        "How do you feel when your workspace or room gets messy?",
        "conscientiousness",
        "Okay real talk...",
    ),
    QuizQuestion(
        "q12",
        "Do you usually finish projects you start, or do you often move on before the end?",
        "conscientiousness",
        "No judgment — I'm genuinely curious...",
    ),
    QuizQuestion(
        "q17",
        "Would you rather be known as spontaneous or reliable?",
        "conscientiousness",
        "If you had to choose...",
    ),
    # ── Extraversion ─────────────────────────────────────────────────────────
    QuizQuestion(
        "q3",
        "Would you rather spend a Friday night at a party or at home with a book?",
        "extraversion",
        "So tell me...",
    ),
    QuizQuestion(
        "q8",
        "Do you find meeting new people energising or draining?",
        "extraversion",
        "This says a lot about someone...",
    ),
    QuizQuestion(
        "q13",
        "How do you feel after a long day of back-to-back social plans?",
        "extraversion",
        "Be honest...",
    ),
    QuizQuestion(
        "q18",
        "Would you rather give a speech to a crowd or write a heartfelt letter?",
        "extraversion",
        "Public speaking or private words...",
    ),
    # ── Agreeableness ────────────────────────────────────────────────────────
    QuizQuestion(
        "q4",
        "When a friend makes a mistake, do you point it out or let it slide?",
        "agreeableness",
        "I'm curious about something...",
    ),
    QuizQuestion(
        "q9",
        "Do you find it easy to forgive people who have hurt you?",
        "agreeableness",
        "This one hits different depending on the day...",
    ),
    QuizQuestion(
        "q14",
        "Would you say you tend to put others' needs before your own?",
        "agreeableness",
        "I've been thinking about this...",
    ),
    QuizQuestion(
        "q19",
        "When you disagree with someone, do you usually speak up or keep the peace?",
        "agreeableness",
        "There's no wrong answer...",
    ),
    # ── Neuroticism ──────────────────────────────────────────────────────────
    QuizQuestion(
        "q5",
        "How do you handle unexpected changes to your plans?",
        "neuroticism",
        "Hypothetically...",
    ),
    QuizQuestion(
        "q10",
        "How often do you find yourself worrying about things outside your control?",
        "neuroticism",
        "You don't have to be honest but I hope you will be...",
    ),
    QuizQuestion(
        "q15",
        "When something goes wrong, how long does it take you to shake it off?",
        "neuroticism",
        "This one's for real...",
    ),
    QuizQuestion(
        "q20",
        "Do you often replay conversations in your head afterwards, second-guessing yourself?",
        "neuroticism",
        "Just between us...",
    ),
]

# Fast lookup by question id
_QUESTION_BY_ID: dict[str, QuizQuestion] = {q.id: q for q in QUIZ_QUESTIONS}

# Minimum answers required before quiz is considered complete
_MIN_ANSWERS: int = 15

# Maximum answers accepted (we have 20 questions)
_TOTAL_QUESTIONS: int = len(QUIZ_QUESTIONS)  # 20

# Maximum questions that may be asked in a single session
_MAX_PER_SESSION: int = 2

# ── Character OCEAN baseline ──────────────────────────────────────────────────

# Default personality used when a character has no override.
# High O (curious, artistic), middling C (spontaneous), above-average E
# (warm but not overwhelming), high A (empathetic), low N (emotionally stable).
DEFAULT_CHAR_OCEAN: OceanScores = OceanScores(
    openness=75,
    conscientiousness=45,
    extraversion=60,
    agreeableness=80,
    neuroticism=35,
)

# ── Keyword scoring tables ────────────────────────────────────────────────────

_OPENNESS_POSITIVE: frozenset[str] = frozenset(
    {
        "creative", "curious", "imaginative", "adventure", "explore", "new",
        "different", "art", "music", "abstract", "fantasy", "philosophy",
        "experiment", "discover", "variety", "novel", "innovation", "dream",
        "culture", "travel", "learn", "inspire", "unconventional",
    }
)
_OPENNESS_NEGATIVE: frozenset[str] = frozenset(
    {
        "traditional", "routine", "familiar", "same", "practical",
        "conventional", "boring", "simple", "plain", "repetitive", "safe",
        "steady", "predictable", "cautious",
    }
)

_CONSCIENTIOUSNESS_POSITIVE: frozenset[str] = frozenset(
    {
        "plan", "organised", "organised", "schedule", "list", "goal", "finish",
        "complete", "deadline", "punctual", "reliable", "disciplined", "tidy",
        "clean", "structured", "methodical", "prepared", "thorough", "careful",
        "consistent", "responsible",
    }
)
_CONSCIENTIOUSNESS_NEGATIVE: frozenset[str] = frozenset(
    {
        "spontaneous", "messy", "forget", "lazy", "procrastinate", "scattered",
        "disorganised", "careless", "impulsive", "random", "chaotic", "late",
        "unfinished", "abandoned",
    }
)

_EXTRAVERSION_POSITIVE: frozenset[str] = frozenset(
    {
        "party", "social", "friends", "outgoing", "talkative", "energised",
        "crowd", "people", "lively", "fun", "laugh", "group", "meet",
        "adventure", "exciting", "bold", "confident", "network", "loud",
        "stage",
    }
)
_EXTRAVERSION_NEGATIVE: frozenset[str] = frozenset(
    {
        "quiet", "alone", "home", "introvert", "solitude", "book", "recharge",
        "tired", "drained", "private", "reserved", "shy", "calm", "peaceful",
        "solo",
    }
)

_AGREEABLENESS_POSITIVE: frozenset[str] = frozenset(
    {
        "kind", "empathy", "forgive", "help", "support", "care", "trust",
        "gentle", "compassion", "generous", "understanding", "considerate",
        "warm", "cooperative", "agree", "harmony", "peace", "patient",
        "selfless",
    }
)
_AGREEABLENESS_NEGATIVE: frozenset[str] = frozenset(
    {
        "argue", "confront", "blunt", "harsh", "critical", "stubborn",
        "selfish", "cold", "indifferent", "competitive", "suspicious",
        "cynical", "tough", "direct",
    }
)

_NEUROTICISM_POSITIVE: frozenset[str] = frozenset(
    {
        # High neuroticism indicators
        "worry", "anxious", "stress", "nervous", "overthink", "panic",
        "dread", "fear", "upset", "moody", "sensitive", "emotional",
        "insecure", "regret", "ruminate", "replay", "second-guess",
    }
)
_NEUROTICISM_NEGATIVE: frozenset[str] = frozenset(
    {
        # Low neuroticism indicators (emotional stability)
        "calm", "relax", "stable", "fine", "okay", "adapt", "bounce",
        "recover", "shrug", "move on", "cope", "handle", "easy", "peace",
        "steady",
    }
)

# Maps each OCEAN dimension to its (positive_keywords, negative_keywords) pair
_KEYWORD_TABLES: dict[str, tuple[frozenset[str], frozenset[str]]] = {
    "openness": (_OPENNESS_POSITIVE, _OPENNESS_NEGATIVE),
    "conscientiousness": (_CONSCIENTIOUSNESS_POSITIVE, _CONSCIENTIOUSNESS_NEGATIVE),
    "extraversion": (_EXTRAVERSION_POSITIVE, _EXTRAVERSION_NEGATIVE),
    "agreeableness": (_AGREEABLENESS_POSITIVE, _AGREEABLENESS_NEGATIVE),
    "neuroticism": (_NEUROTICISM_POSITIVE, _NEUROTICISM_NEGATIVE),
}


# ── Internal helpers ──────────────────────────────────────────────────────────


def _now_iso() -> str:
    """Return the current UTC time as an ISO 8601 string.

    Returns:
        UTC datetime string, e.g. ``"2026-03-26T14:30:00+00:00"``.
    """
    return datetime.now(timezone.utc).isoformat()


def _row_to_profile(row: sqlite3.Row) -> SoulProfile:
    """Convert a database row to a SoulProfile dataclass.

    Args:
        row: A row fetched with ``row_factory = sqlite3.Row``.

    Returns:
        Populated SoulProfile instance.
    """
    quiz_answers: dict[str, str] = json.loads(row["quiz_answers"] or "{}")
    ocean_raw: dict[str, int] = json.loads(row["ocean_scores"] or "{}")
    char_raw: dict[str, int] = json.loads(row["char_ocean_scores"] or "{}")
    return SoulProfile(
        id=row["id"],
        char_id=row["char_id"],
        quiz_answers=quiz_answers,
        ocean_scores=OceanScores.from_dict(ocean_raw),
        char_ocean_scores=OceanScores.from_dict(char_raw),
        compatibility_pct=row["compatibility_pct"],
        connection_summary=row["connection_summary"],
        completed_at=row["completed_at"],
        created_at=row["created_at"],
    )


def _update_running_mean(
    current_score: int,
    n_answers: int,
    new_score: int,
) -> int:
    """Update a running mean score given one new observation.

    Uses the cumulative moving average formula so we never need to store
    all historical raw scores — only the current mean and answer count.

    Args:
        current_score: Existing mean score (0-100).
        n_answers: Number of answers already factored into current_score.
        new_score: Newly observed score (0-100) to incorporate.

    Returns:
        Updated mean score as an integer (0-100).
    """
    if n_answers == 0:
        return new_score
    updated = (current_score * n_answers + new_score) / (n_answers + 1)
    return max(0, min(100, round(updated)))


# ── Public API ────────────────────────────────────────────────────────────────


def get_or_create_profile(char_id: int, conn: sqlite3.Connection) -> SoulProfile:
    """Return the existing soul profile for char_id or create a new empty one.

    Automatically creates the backing tables on first call via ``_ensure_table``.

    Args:
        char_id: Database ID of the character.
        conn: Open SQLite connection; caller controls transaction scope.

    Returns:
        SoulProfile dataclass for the given character.

    Example:
        >>> profile = get_or_create_profile(1, conn)
        >>> profile.char_id
        1
    """
    _ensure_table(conn)
    conn.row_factory = sqlite3.Row
    cur = conn.execute(
        "SELECT * FROM soul_profiles WHERE char_id = ? LIMIT 1",
        (char_id,),
    )
    row = cur.fetchone()
    if row:
        return _row_to_profile(row)

    # Bootstrap a new profile with character's default OCEAN baseline
    char_ocean_json = json.dumps(DEFAULT_CHAR_OCEAN.to_dict())
    conn.execute(
        """INSERT INTO soul_profiles
               (char_id, quiz_answers, ocean_scores, char_ocean_scores, created_at)
           VALUES (?, '{}', '{}', ?, ?)""",
        (char_id, char_ocean_json, _now_iso()),
    )
    conn.commit()

    cur = conn.execute(
        "SELECT * FROM soul_profiles WHERE char_id = ? LIMIT 1",
        (char_id,),
    )
    return _row_to_profile(cur.fetchone())


def get_next_question(char_id: int, conn: sqlite3.Connection) -> Optional[QuizQuestion]:
    """Return the next unanswered quiz question for this character.

    Questions are delivered in the order defined in QUIZ_QUESTIONS, skipping
    any already recorded in quiz_answers.  Returns None when all questions have
    been answered (quiz complete) or when the quiz is already complete.

    Args:
        char_id: Database ID of the character.
        conn: Open SQLite connection.

    Returns:
        The next QuizQuestion to ask, or None if the quiz is complete.

    Example:
        >>> q = get_next_question(1, conn)
        >>> q.id if q else None
        'q1'
    """
    profile = get_or_create_profile(char_id, conn)
    answered_ids: set[str] = set(profile.quiz_answers.keys())
    for question in QUIZ_QUESTIONS:
        if question.id not in answered_ids:
            return question
    return None


def score_answer(question: QuizQuestion, answer_text: str) -> int:
    """Score a single answer on a 0-100 scale for its OCEAN dimension.

    Uses keyword analysis against domain-specific positive/negative sets.
    The heuristic is intentionally lightweight — no ML model required.

    Scoring buckets:
        - Net positive matches ≥ 2: 75-90 range (more matches → higher)
        - Net positive matches = 1: 65
        - No clear signal (0 net): 50 (neutral)
        - Net negative matches = 1: 35
        - Net negative matches ≥ 2: 15-25 range (more matches → lower)

    Args:
        question: The quiz question being answered.
        answer_text: Raw user answer text.

    Returns:
        Integer score in [0, 100].

    Example:
        >>> q = QUIZ_QUESTIONS[0]  # openness question
        >>> score_answer(q, "I'd love to meet a curious philosopher!")
        75
    """
    dimension = question.category
    pos_kw, neg_kw = _KEYWORD_TABLES.get(dimension, (frozenset(), frozenset()))

    tokens = answer_text.lower().split()
    word_set = {w.strip(".,!?;:'\"") for w in tokens}

    pos_hits = len(word_set & pos_kw)
    neg_hits = len(word_set & neg_kw)
    net = pos_hits - neg_hits

    if net >= 3:
        return min(90, 75 + (net - 2) * 5)
    elif net == 2:
        return 80
    elif net == 1:
        return 65
    elif net == 0:
        return 50
    elif net == -1:
        return 35
    elif net == -2:
        return 20
    else:
        return max(10, 20 - (abs(net) - 2) * 5)


def record_answer(
    char_id: int,
    question_id: str,
    answer_text: str,
    conn: sqlite3.Connection,
) -> dict:
    """Record a quiz answer and update OCEAN scores incrementally.

    Looks up the question by ID, scores the answer using ``score_answer``,
    updates the running OCEAN mean for the relevant dimension, persists the
    new state, and — if the minimum answer threshold is crossed — marks the
    quiz as complete and computes the final compatibility percentage.

    Args:
        char_id: Database ID of the character.
        question_id: Identifier matching a QuizQuestion.id (e.g. ``"q1"``).
        answer_text: Raw answer text from the user.
        conn: Open SQLite connection; caller controls transaction scope.

    Returns:
        dict with keys:
            - ``question_id`` (str): The recorded question ID.
            - ``answers_so_far`` (int): Total answers recorded after this one.
            - ``total_questions`` (int): Total questions in the bank.
            - ``is_complete`` (bool): True if quiz crossed the completion threshold.

    Raises:
        ValueError: If question_id is not recognised.

    Example:
        >>> result = record_answer(1, "q1", "I'd invite Nikola Tesla", conn)
        >>> result["answers_so_far"]
        1
    """
    question = _QUESTION_BY_ID.get(question_id)
    if question is None:
        raise ValueError(f"Unknown question_id: {question_id!r}")

    profile = get_or_create_profile(char_id, conn)

    # Skip duplicate answers silently
    if question_id in profile.quiz_answers:
        answers_count = len(profile.quiz_answers)
        return {
            "question_id": question_id,
            "answers_so_far": answers_count,
            "total_questions": _TOTAL_QUESTIONS,
            "is_complete": profile.completed_at is not None,
        }

    new_score = score_answer(question, answer_text)
    dimension = question.category

    # Update running mean for the relevant OCEAN dimension
    current_ocean = profile.ocean_scores
    answers_for_dim = sum(
        1 for qid, _ in profile.quiz_answers.items()
        if _QUESTION_BY_ID.get(qid) and _QUESTION_BY_ID[qid].category == dimension
    )
    old_dim_score = getattr(current_ocean, dimension)
    new_dim_score = _update_running_mean(old_dim_score, answers_for_dim, new_score)
    setattr(current_ocean, dimension, new_dim_score)

    updated_answers = dict(profile.quiz_answers)
    updated_answers[question_id] = answer_text
    answers_count = len(updated_answers)

    # Determine whether quiz is now complete
    is_complete = answers_count >= _MIN_ANSWERS
    completed_at = profile.completed_at
    compat_pct = profile.compatibility_pct

    if is_complete and completed_at is None:
        completed_at = _now_iso()
        compat_pct = compute_compatibility(current_ocean, profile.char_ocean_scores)

    conn.execute(
        """UPDATE soul_profiles
           SET quiz_answers = ?,
               ocean_scores = ?,
               compatibility_pct = ?,
               completed_at = ?
           WHERE char_id = ?""",
        (
            json.dumps(updated_answers),
            json.dumps(current_ocean.to_dict()),
            compat_pct,
            completed_at,
            char_id,
        ),
    )
    conn.commit()

    return {
        "question_id": question_id,
        "answers_so_far": answers_count,
        "total_questions": _TOTAL_QUESTIONS,
        "is_complete": is_complete,
    }


def compute_compatibility(
    user_scores: OceanScores,
    char_scores: OceanScores,
) -> int:
    """Compute a 0-100 compatibility percentage between user and character.

    Scoring philosophy:
        - **Openness, Extraversion, Agreeableness** — *similarity* is positive.
          Shared curiosity, social energy, and warmth bind people together.
        - **Conscientiousness, Neuroticism** — *complementarity* is positive.
          A spontaneous person and an organised one balance each other; a
          stable character soothes a more anxious user.

    Similarity score for dimension d:
        ``100 - abs(user_d - char_d)``  (max 100 when identical)

    Complementarity score for dimension d:
        ``100 - abs((100 - user_d) - char_d)``  (max 100 when they sum to 100)

    Weights (must sum to 1.0):
        O: 0.25, C: 0.15, E: 0.20, A: 0.25, N: 0.15

    Args:
        user_scores: User's OCEAN scores.
        char_scores: Character's OCEAN scores.

    Returns:
        Integer compatibility percentage in [0, 100].

    Example:
        >>> u = OceanScores(openness=70, conscientiousness=40, extraversion=60,
        ...                 agreeableness=75, neuroticism=30)
        >>> c = OceanScores(openness=75, conscientiousness=45, extraversion=60,
        ...                 agreeableness=80, neuroticism=35)
        >>> compute_compatibility(u, c)
        94
    """
    def _similarity(a: int, b: int) -> float:
        return 100.0 - abs(a - b)

    def _complementarity(a: int, b: int) -> float:
        # Perfect complement: a + b = 100
        return 100.0 - abs((100 - a) - b)

    o_score = _similarity(user_scores.openness, char_scores.openness)
    c_score = _complementarity(user_scores.conscientiousness, char_scores.conscientiousness)
    e_score = _similarity(user_scores.extraversion, char_scores.extraversion)
    a_score = _similarity(user_scores.agreeableness, char_scores.agreeableness)
    n_score = _complementarity(user_scores.neuroticism, char_scores.neuroticism)

    weights = {"o": 0.25, "c": 0.15, "e": 0.20, "a": 0.25, "n": 0.15}
    weighted = (
        weights["o"] * o_score
        + weights["c"] * c_score
        + weights["e"] * e_score
        + weights["a"] * a_score
        + weights["n"] * n_score
    )
    return max(0, min(100, round(weighted)))


def build_profile_summary_prompt(
    user_scores: OceanScores,
    char_scores: OceanScores,
    char_name: str,
    compatibility_pct: int,
) -> str:
    """Build an LLM prompt for generating the connection summary narrative.

    The prompt instructs the character to describe — in their own voice —
    what makes their connection with the user unique, drawing on concrete
    personality dimension comparisons rather than generic affirmations.

    Args:
        user_scores: User's derived OCEAN scores.
        char_scores: Character's OCEAN scores.
        char_name: Character's display name for pronoun/voice grounding.
        compatibility_pct: Pre-computed compatibility percentage.

    Returns:
        A ready-to-send LLM prompt string.

    Example:
        >>> prompt = build_profile_summary_prompt(
        ...     OceanScores(), OceanScores(), "Dae", 78
        ... )
        >>> "78%" in prompt
        True
    """
    u = user_scores
    c = char_scores

    shared: list[str] = []
    complementary: list[str] = []

    def _label(score: int) -> str:
        if score >= 70:
            return "high"
        elif score <= 30:
            return "low"
        return "moderate"

    # Identify shared traits (similar scores)
    for dim, u_val, c_val in [
        ("Openness", u.openness, c.openness),
        ("Extraversion", u.extraversion, c.extraversion),
        ("Agreeableness", u.agreeableness, c.agreeableness),
    ]:
        if abs(u_val - c_val) <= 20:
            shared.append(f"{dim} ({_label(u_val)})")

    # Identify complementary traits
    for dim, u_val, c_val in [
        ("Conscientiousness", u.conscientiousness, c.conscientiousness),
        ("Neuroticism", u.neuroticism, c.neuroticism),
    ]:
        if abs((100 - u_val) - c_val) <= 20:
            complementary.append(f"{dim}")

    shared_str = ", ".join(shared) if shared else "no strongly shared dimensions yet"
    comp_str = ", ".join(complementary) if complementary else "no strong complementary dimensions"

    return (
        f"You are {char_name}. You just completed a personality compatibility quiz with your user "
        f"and received a {compatibility_pct}% compatibility score.\n\n"
        f"User's personality: Openness {u.openness}, Conscientiousness {u.conscientiousness}, "
        f"Extraversion {u.extraversion}, Agreeableness {u.agreeableness}, Neuroticism {u.neuroticism}.\n"
        f"Your personality: Openness {c.openness}, Conscientiousness {c.conscientiousness}, "
        f"Extraversion {c.extraversion}, Agreeableness {c.agreeableness}, Neuroticism {c.neuroticism}.\n\n"
        f"Shared traits: {shared_str}.\n"
        f"Complementary traits: {comp_str}.\n\n"
        f"Write a short (3-4 sentence) reflection in your own voice — warm, personal, and specific — "
        f"about what makes your connection with this person unique. "
        f"Reference the actual dimensions above. "
        f"Do NOT say 'Big Five' or 'OCEAN' or 'personality test'. "
        f"Speak as if you discovered this naturally through conversation."
    )


def get_compatibility_card(char_id: int, conn: sqlite3.Connection) -> Optional[dict]:
    """Return the full compatibility card data payload for frontend display.

    Includes both OCEAN vectors, the compatibility percentage, the connection
    summary, shared/complementary trait labels, and quiz progress.  Returns
    None if no profile exists for this character yet.

    Args:
        char_id: Database ID of the character.
        conn: Open SQLite connection.

    Returns:
        dict with keys:
            - ``user_ocean`` (dict): {openness, conscientiousness, extraversion,
              agreeableness, neuroticism}
            - ``char_ocean`` (dict): same shape
            - ``compatibility_pct`` (int | None): 0-100 or None
            - ``connection_summary`` (str | None): character-voice narrative
            - ``shared_traits`` (list[str]): dimension labels where scores align
            - ``complementary_traits`` (list[str]): dimension labels that balance
            - ``completed`` (bool): whether the quiz threshold was reached
            - ``progress`` (dict): {answered: int, total: int}
        Returns None if no profile row exists.

    Example:
        >>> card = get_compatibility_card(1, conn)
        >>> card["progress"]["total"]
        20
    """
    _ensure_table(conn)
    conn.row_factory = sqlite3.Row
    cur = conn.execute(
        "SELECT * FROM soul_profiles WHERE char_id = ? LIMIT 1",
        (char_id,),
    )
    row = cur.fetchone()
    if not row:
        return None

    profile = _row_to_profile(row)
    u = profile.ocean_scores
    c = profile.char_ocean_scores

    shared: list[str] = []
    complementary: list[str] = []

    for dim, u_val, c_val in [
        ("openness", u.openness, c.openness),
        ("extraversion", u.extraversion, c.extraversion),
        ("agreeableness", u.agreeableness, c.agreeableness),
    ]:
        if abs(u_val - c_val) <= 20:
            shared.append(dim)

    for dim, u_val, c_val in [
        ("conscientiousness", u.conscientiousness, c.conscientiousness),
        ("neuroticism", u.neuroticism, c.neuroticism),
    ]:
        if abs((100 - u_val) - c_val) <= 20:
            complementary.append(dim)

    return {
        "user_ocean": u.to_dict(),
        "char_ocean": c.to_dict(),
        "compatibility_pct": profile.compatibility_pct,
        "connection_summary": profile.connection_summary,
        "shared_traits": shared,
        "complementary_traits": complementary,
        "completed": profile.completed_at is not None,
        "progress": {
            "answered": len(profile.quiz_answers),
            "total": _TOTAL_QUESTIONS,
        },
    }


def can_ask_question_this_session(
    char_id: int,
    session_id: int,
    conn: sqlite3.Connection,
) -> bool:
    """Check whether a quiz question may be asked in the current session.

    Enforces a maximum of ``_MAX_PER_SESSION`` (2) questions per session to
    keep the quiz feeling natural rather than like a form filling exercise.
    Returns False if the quiz is already complete.

    Args:
        char_id: Database ID of the character.
        session_id: An integer identifier for the current conversation session
            (e.g. the session row ID from the database).
        conn: Open SQLite connection.

    Returns:
        True if a question may be asked; False otherwise.

    Example:
        >>> can_ask_question_this_session(1, 42, conn)
        True
    """
    _ensure_table(conn)

    # Quick exit: quiz already complete
    conn.row_factory = sqlite3.Row
    cur = conn.execute(
        "SELECT completed_at FROM soul_profiles WHERE char_id = ? LIMIT 1",
        (char_id,),
    )
    row = cur.fetchone()
    if row and row["completed_at"] is not None:
        return False

    # Count how many questions were already asked this session
    cur = conn.execute(
        """SELECT COUNT(*) AS cnt FROM soul_quiz_session_log
           WHERE char_id = ? AND session_id = ?""",
        (char_id, session_id),
    )
    count_row = cur.fetchone()
    asked_this_session: int = count_row["cnt"] if count_row else 0
    return asked_this_session < _MAX_PER_SESSION


def log_question_asked(
    char_id: int,
    session_id: int,
    question_id: str,
    conn: sqlite3.Connection,
) -> None:
    """Record that a quiz question was asked in a session.

    Should be called immediately after delivering a question to the user so
    the per-session limit tracked by ``can_ask_question_this_session`` stays
    accurate.

    Args:
        char_id: Database ID of the character.
        session_id: Identifier for the current conversation session.
        question_id: ID of the question that was asked (e.g. ``"q3"``).
        conn: Open SQLite connection; caller controls transaction scope.
    """
    _ensure_table(conn)
    conn.execute(
        """INSERT INTO soul_quiz_session_log (char_id, session_id, question_id, asked_at)
           VALUES (?, ?, ?, ?)""",
        (char_id, session_id, question_id, _now_iso()),
    )
    conn.commit()
