"""Tests for backend.llm.importance_scorer — message importance scoring.

Validates that scoring factors combine correctly and edge cases are handled.
"""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.llm.importance_scorer import score_message


class TestScoreMessage:
    """Unit tests for score_message()."""

    def test_default_score(self):
        """Base score with no special factors should be 0.5."""
        assert score_message("Hello there, how are you?", "user") == 0.5

    def test_first_message_bonus(self):
        """First message in session gets +0.3."""
        score = score_message("Hello, how are you doing today?", "user", is_first=True)
        assert score == 0.8

    def test_user_facts_bonus(self):
        """Messages containing user facts get +0.3."""
        score = score_message("I live in Tokyo and work as an engineer.", "user",
                              has_user_facts=True)
        assert score == 0.8

    def test_high_emotion_bonus(self):
        """High emotion intensity (> 0.7) adds +0.2."""
        score = score_message("That makes me so happy!", "assistant",
                              emotion_intensity=0.9)
        assert score == 0.7

    def test_question_bonus(self):
        """Messages with questions get +0.1."""
        score = score_message("What is your favorite color?", "user",
                              has_question=True)
        assert score == 0.6

    def test_short_acknowledgment_penalty(self):
        """Short messages without questions get -0.3."""
        score = score_message("ok", "user")
        assert score == 0.2

    def test_short_with_question_no_penalty(self):
        """Short messages WITH questions should not get the penalty."""
        score = score_message("why?", "user", has_question=True)
        # Base 0.5 + question 0.1 = 0.6 (no short penalty because '?' is present)
        assert score == 0.6

    def test_combined_factors(self):
        """Multiple positive factors stack up."""
        score = score_message(
            "Tell me about quantum computing?",
            "user",
            is_first=True,
            has_user_facts=True,
            has_question=True,
        )
        # 0.5 + 0.3 + 0.3 + 0.1 = 1.2 → clamped to 1.0
        assert score == 1.0

    def test_clamp_lower_bound(self):
        """Score should never go below 0.0."""
        # Short text with no positive factors: 0.5 - 0.3 = 0.2
        score = score_message("k", "user")
        assert score >= 0.0

    def test_clamp_upper_bound(self):
        """Score should never exceed 1.0."""
        score = score_message(
            "What do you think about this interesting topic?",
            "user",
            is_first=True,
            has_user_facts=True,
            emotion_intensity=0.9,
            has_question=True,
        )
        assert score == 1.0

    def test_empty_text(self):
        """Empty text should not crash."""
        score = score_message("", "user")
        # Empty string is < 10 chars with no question → penalty
        assert score == 0.2

    def test_none_text(self):
        """None text should not crash."""
        score = score_message(None, "user")
        assert score == 0.2

    def test_low_emotion_no_bonus(self):
        """Emotion intensity <= 0.7 should NOT add the bonus."""
        score = score_message("I feel okay about that.", "assistant",
                              emotion_intensity=0.5)
        assert score == 0.5

    def test_exactly_0_7_emotion(self):
        """Emotion intensity of exactly 0.7 should NOT trigger the bonus (> 0.7 required)."""
        score = score_message("I feel strongly about this topic.", "assistant",
                              emotion_intensity=0.7)
        assert score == 0.5
