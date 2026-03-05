"""Importance scoring for chat messages.

Assigns a 0.0–1.0 importance score to each message based on heuristic
signals. Higher scores indicate messages that should be preserved longer
in context (e.g. during compression/pruning), while lower scores mark
ephemeral exchanges that can safely be summarised away.

Scoring factors are additive from a base of 0.5, clamped to [0.0, 1.0]:

+0.3  First message in a session (sets conversational context)
+0.3  Contains user facts (knowledge extractor found new info)
+0.2  High emotion intensity (> 0.7 — emotionally charged exchanges)
+0.1  Contains a question (may need future reference)
-0.3  Short acknowledgment (< 10 chars, no question — e.g. "ok", "thanks")

Example:
    >>> score_message("Tell me about quantum computing?", "user",
    ...              is_first=True, has_question=True)
    0.9
"""

from __future__ import annotations


def score_message(
    text: str,
    role: str,
    *,
    is_first: bool = False,
    emotion_intensity: float = 0.0,
    has_user_facts: bool = False,
    has_question: bool = False,
) -> float:
    """Compute an importance score for a single chat message.

    The score is used by the context assembler to decide which archived
    messages are worth pulling back into context during budget-constrained
    assembly.

    Args:
        text: The message text content.
        role: Message role (``"user"``, ``"assistant"``, ``"system"``).
        is_first: Whether this is the first message in the session.
        emotion_intensity: Detected emotion intensity 0.0–1.0 from the
            emotion engine (only relevant for assistant messages).
        has_user_facts: Whether the knowledge extractor found user facts
            in this message (typically user messages only).
        has_question: Whether the message contains a question mark.

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

    # Short acknowledgments are low-value
    stripped = (text or "").strip()
    if len(stripped) < 10 and "?" not in stripped:
        score -= 0.3

    return max(0.0, min(1.0, score))
