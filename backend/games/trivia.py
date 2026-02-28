"""Trivia game engine for the In-App Mini Games feature (A2).

Architecture:
    - Game state is deterministic Python: a list of questions, current index,
      and cumulative score.
    - LLM is called only for question generation and reaction dialogue.
    - Stored in ``game_sessions.game_state`` as JSON.

State schema:
    {
        "questions": [{"q": str, "options": [str, str, str, str], "answer": int}],
        "current":   int,   # 0-based index of active question
        "score":     int,   # correct answers so far
        "topic":     str,
        "finished":  bool
    }
"""

from __future__ import annotations

import json
import logging
import random
from typing import Any

logger = logging.getLogger(__name__)

ROUNDS = 10  # questions per game


def generate_questions(topic: str, adapter, cfg: dict) -> list[dict]:
    """Generate ``ROUNDS`` trivia questions via the active LLM.

    The prompt asks the model to return a JSON array. A fallback set of
    general-knowledge questions is used if the LLM call fails so the game
    can always start.

    Args:
        topic: The trivia category/topic (e.g. "Japanese culture").
        adapter: Active LLM adapter (claude_api or openai_compat).
        cfg: App config dict.

    Returns:
        List of dicts: ``{"q": str, "options": [str, str, str, str], "answer": int}``
        where ``answer`` is the 0-based index of the correct option.

    Example:
        >>> qs = generate_questions("anime", adapter, cfg)
        >>> len(qs) == ROUNDS
        True
    """
    prompt = (
        f"Generate exactly {ROUNDS} multiple-choice trivia questions about: {topic}.\n"
        "Return ONLY a JSON array, no other text. Each element:\n"
        '{"q":"question text","options":["A","B","C","D"],"answer":0}\n'
        "where 'answer' is the 0-based index of the correct option.\n"
        "Vary difficulty. Use concise, unambiguous options."
    )
    try:
        text = adapter.complete(prompt, system="You are a trivia quiz writer. Respond only with valid JSON.", **cfg.get("llm_kwargs", {}))
        # Strip markdown code blocks if present
        text = text.strip()
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        questions = json.loads(text)
        if isinstance(questions, list) and len(questions) >= ROUNDS:
            return questions[:ROUNDS]
    except Exception as e:
        logger.warning("[Trivia] Question generation failed: %s", e)

    # Fallback: generic questions
    return _fallback_questions()


def _fallback_questions() -> list[dict]:
    """Return a minimal set of hardcoded fallback questions.

    Returns:
        List of 10 general knowledge question dicts.
    """
    pool = [
        {"q": "How many planets are in our solar system?",
         "options": ["7", "8", "9", "10"], "answer": 1},
        {"q": "What is the chemical symbol for water?",
         "options": ["H2O", "CO2", "NaCl", "O2"], "answer": 0},
        {"q": "Who painted the Mona Lisa?",
         "options": ["Michelangelo", "Raphael", "da Vinci", "Botticelli"], "answer": 2},
        {"q": "What is the capital of Japan?",
         "options": ["Osaka", "Kyoto", "Hiroshima", "Tokyo"], "answer": 3},
        {"q": "How many sides does a hexagon have?",
         "options": ["5", "6", "7", "8"], "answer": 1},
        {"q": "Which element has the symbol 'Au'?",
         "options": ["Silver", "Gold", "Aluminum", "Argon"], "answer": 1},
        {"q": "In what year did World War II end?",
         "options": ["1943", "1944", "1945", "1946"], "answer": 2},
        {"q": "What is the largest ocean on Earth?",
         "options": ["Atlantic", "Indian", "Arctic", "Pacific"], "answer": 3},
        {"q": "What is 7 × 8?",
         "options": ["48", "54", "56", "64"], "answer": 2},
        {"q": "Which planet is known as the Red Planet?",
         "options": ["Venus", "Mars", "Jupiter", "Saturn"], "answer": 1},
    ]
    random.shuffle(pool)
    return pool[:ROUNDS]


def new_state(topic: str, questions: list[dict]) -> dict[str, Any]:
    """Create a fresh trivia game state.

    Args:
        topic: Category label for display.
        questions: Pre-generated question list.

    Returns:
        Initial game state dict.

    Example:
        >>> state = new_state("anime", questions)
        >>> state["current"] == 0
        True
    """
    return {
        "questions": questions,
        "current": 0,
        "score": 0,
        "topic": topic,
        "finished": False,
    }


def answer_question(state: dict, choice: int) -> dict:
    """Process the player's answer and advance to the next question.

    Args:
        state: Current game state (mutated in place).
        choice: 0-based index of the chosen option.

    Returns:
        Updated state dict with ``correct`` key indicating if the choice
        was right, and ``finished`` set True when all questions answered.

    Example:
        >>> result = answer_question(state, 2)
        >>> result["correct"]  # True if choice matched answer
        True
    """
    q = state["questions"][state["current"]]
    correct = (choice == q["answer"])
    if correct:
        state["score"] += 1
    state["current"] += 1
    if state["current"] >= len(state["questions"]):
        state["finished"] = True
    state["last_correct"] = correct
    state["last_answer"] = q["answer"]
    return state


def current_question(state: dict) -> dict | None:
    """Return the current question dict, or None if the game is finished.

    Args:
        state: Current game state.

    Returns:
        Question dict with ``q``, ``options``, and masked ``answer`` (-1),
        or None if the game is over.

    Example:
        >>> q = current_question(state)
        >>> len(q["options"]) == 4
        True
    """
    if state["finished"]:
        return None
    q = state["questions"][state["current"]].copy()
    q["answer"] = -1  # never expose the answer to the client
    return q
