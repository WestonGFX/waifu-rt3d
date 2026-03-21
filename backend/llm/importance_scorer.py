"""Importance scoring for chat messages.

Assigns a 0.0–1.0 importance score to each message based on heuristic
signals. Higher scores indicate messages that should be preserved longer
in context (e.g. during compression/pruning), while lower scores mark
ephemeral exchanges that can safely be summarised away.

Scoring factors are additive from a base of 0.5, clamped to [0.0, 1.0]:

+0.3  First message in a session (sets conversational context)
+0.3  Contains user facts (knowledge extractor found new info)
+0.2  High emotion intensity (> 0.7 — emotionally charged exchanges)
+0.2  Topic shift from previous message (Jaccard overlap < 0.15)
+0.15 Callback reference ("like I said", "remember when", etc.)
+0.1  Contains a question (may need future reference)
-0.3  Short acknowledgment (< 10 chars, no question — e.g. "ok", "thanks")

Example:
    >>> score_message("Tell me about quantum computing?", "user",
    ...              is_first=True, has_question=True)
    0.9
"""

from __future__ import annotations

import math
import re

# Common English stop words — excluded from topic-shift Jaccard calculation.
_STOP_WORDS = frozenset({
    "the", "a", "an", "is", "was", "are", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would",
    "could", "should", "may", "might", "shall", "can", "need",
    "i", "me", "my", "we", "us", "our", "you", "your", "he",
    "she", "it", "they", "them", "his", "her", "its", "their",
    "this", "that", "these", "those", "what", "which", "who",
    "when", "where", "how", "why", "if", "then", "than", "so",
    "but", "and", "or", "not", "no", "yes", "just", "also",
    "very", "too", "quite", "really", "about", "of", "in", "on",
    "at", "to", "for", "with", "from", "by", "up", "out",
})

# Phrases that signal the user is referencing earlier conversation context.
_CALLBACK_RE = re.compile(
    r"(like (i|you) (said|mentioned)"
    r"|remember when"
    r"|as (we|you) discussed"
    r"|going back to"
    r"|earlier (i|you|we)"
    r"|you told me"
    r"|i told you"
    r"|we talked about"
    r"|you promised"
    r"|i mentioned)",
    re.IGNORECASE,
)


def _keyword_overlap(a: str, b: str) -> float:
    """Jaccard similarity of non-stopword tokens between two texts.

    Used to detect topic shifts — a low overlap score between consecutive
    messages suggests the conversation has pivoted to a new subject.

    Args:
        a: First text (typically the previous message).
        b: Second text (typically the current message).

    Returns:
        Jaccard similarity coefficient (0.0–1.0).  Returns 1.0 if both
        texts are empty (avoids false-positive topic shift detection).

    Example:
        >>> _keyword_overlap("I love pizza", "Tell me about space travel")
        0.0
        >>> _keyword_overlap("I love pizza", "pizza is great")
        0.5
    """
    tokens_a = {w.lower() for w in (a or "").split()} - _STOP_WORDS
    tokens_b = {w.lower() for w in (b or "").split()} - _STOP_WORDS
    if not tokens_a and not tokens_b:
        return 1.0  # Both empty — no topic shift
    union = tokens_a | tokens_b
    if not union:
        return 1.0
    return len(tokens_a & tokens_b) / len(union)


def _cosine_sim(a: list[float], b: list[float]) -> float:
    """Compute cosine similarity between two embedding vectors.

    Used for semantic topic-shift detection when pre-computed embeddings
    are available.  Falls back gracefully if vectors are empty or zero.

    Args:
        a: First embedding vector.
        b: Second embedding vector.

    Returns:
        Cosine similarity in [-1.0, 1.0].  Returns 1.0 if either
        vector is empty (avoids false-positive topic shift).

    Example:
        >>> _cosine_sim([1.0, 0.0], [0.0, 1.0])
        0.0
    """
    if not a or not b:
        return 1.0
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(x * x for x in b))
    if norm_a == 0.0 or norm_b == 0.0:
        return 1.0
    return dot / (norm_a * norm_b)


def score_message(
    text: str,
    role: str,
    *,
    is_first: bool = False,
    emotion_intensity: float = 0.0,
    has_user_facts: bool = False,
    has_question: bool = False,
    prev_text: str = "",
    budget_pressure: float = 0.0,
    text_embedding: list[float] | None = None,
    prev_embedding: list[float] | None = None,
) -> float:
    """Compute an importance score for a single chat message.

    The score is used by the context assembler to decide which archived
    messages are worth pulling back into context during budget-constrained
    assembly.

    When ``text_embedding`` and ``prev_embedding`` are both provided,
    topic-shift detection uses cosine similarity (more accurate than
    Jaccard for paraphrased or synonym-heavy pivots).  When embeddings
    are not available, falls back to the original Jaccard keyword overlap.

    Args:
        text: The message text content.
        role: Message role (``"user"``, ``"assistant"``, ``"system"``).
        is_first: Whether this is the first message in the session.
        emotion_intensity: Detected emotion intensity 0.0–1.0 from the
            emotion engine (only relevant for assistant messages).
        has_user_facts: Whether the knowledge extractor found user facts
            in this message (typically user messages only).
        has_question: Whether the message contains a question mark.
        prev_text: Text of the immediately preceding message.  When provided,
            enables topic-shift detection via Jaccard overlap.
        budget_pressure: Context fullness ratio 0.0–1.0.  Currently reserved
            for future use (callers may pass it for logging/tuning).
        text_embedding: Pre-computed embedding of ``text`` from the memory
            system.  When paired with ``prev_embedding``, enables semantic
            topic-shift detection via cosine similarity.
        prev_embedding: Pre-computed embedding of the previous message.

    Returns:
        Float clamped to [0.0, 1.0]. Higher = more important to retain.

    Example:
        >>> score_message("ok", "user")
        0.2
        >>> score_message("What is your favorite color?", "user",
        ...              is_first=True, has_question=True)
        0.9
    """
    score = 0.5

    if is_first:
        score += 0.3

    if has_user_facts:
        score += 0.3

    if emotion_intensity > 0.7:
        score += 0.2

    if has_question:
        score += 0.1

    # Topic shift detection: prefer cosine similarity when embeddings are
    # available (better at detecting paraphrased topic pivots), otherwise
    # fall back to Jaccard keyword overlap.
    if text_embedding and prev_embedding:
        sim = _cosine_sim(text_embedding, prev_embedding)
        if sim < 0.5:
            score += 0.2
    elif prev_text and _keyword_overlap(prev_text, text or "") < 0.15:
        score += 0.2

    # Callback reference: user explicitly references earlier conversation
    if _CALLBACK_RE.search(text or ""):
        score += 0.15

    # Short acknowledgments are low-value
    stripped = (text or "").strip()
    if len(stripped) < 10 and "?" not in stripped:
        score -= 0.3

    return max(0.0, min(1.0, score))
