"""Tests for backend.llm.importance_scorer — message importance scoring.

Validates that scoring factors combine correctly and edge cases are handled.
"""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.llm.importance_scorer import score_message, _keyword_overlap, _cosine_sim


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

    # ── Topic shift detection tests ────────────────────────────────────

    def test_topic_shift_bonus(self):
        """Switching to a completely different topic should add +0.2."""
        score = score_message(
            "What kind of music do you listen to?", "user",
            prev_text="I had pasta for dinner last night and it was amazing.",
            has_question=True,
        )
        # Base 0.5 + question 0.1 + topic shift 0.2 = 0.8
        assert score == 0.8

    def test_no_topic_shift_for_same_topic(self):
        """Continuing the same topic should NOT trigger the topic shift bonus."""
        score = score_message(
            "I love pasta dinner amazing night.", "user",
            prev_text="I had pasta for dinner last night and it was amazing.",
        )
        # Significant word overlap (pasta, dinner, amazing, night) → Jaccard >= 0.15
        assert score == 0.5

    def test_no_topic_shift_without_prev_text(self):
        """Without prev_text, no topic shift bonus should be added."""
        score = score_message(
            "Something completely new and different!", "user",
            prev_text="",
        )
        assert score == 0.5

    # ── Callback reference detection tests ─────────────────────────────

    def test_callback_reference_bonus(self):
        """Messages referencing earlier conversation should get +0.15."""
        score = score_message(
            "Remember when I told you about my trip to Japan?", "user",
        )
        # Base 0.5 + callback 0.15 = 0.65
        assert score == 0.65

    def test_callback_like_i_said(self):
        """'Like I said' pattern should trigger callback bonus."""
        score = score_message(
            "Like I said earlier, I prefer the blue one.", "user",
        )
        assert score == 0.65

    def test_callback_you_mentioned(self):
        """'You mentioned' pattern should trigger callback bonus."""
        score = score_message(
            "Like you mentioned, the weather is nice today.", "user",
        )
        assert score == 0.65

    def test_callback_you_promised(self):
        """'You promised' pattern should trigger callback bonus."""
        score = score_message(
            "But you promised you would help me with that!", "user",
        )
        assert score == 0.65

    def test_no_callback_normal_message(self):
        """Normal messages should not trigger the callback bonus."""
        score = score_message(
            "The weather is really nice today, don't you think?", "user",
            has_question=True,
        )
        # Base 0.5 + question 0.1 = 0.6 (no callback)
        assert score == 0.6

    def test_combined_topic_shift_and_callback(self):
        """Topic shift + callback reference should stack."""
        score = score_message(
            "Going back to what we discussed earlier about pizza...", "user",
            prev_text="The stock market has been volatile this week.",
        )
        # Base 0.5 + topic shift 0.2 + callback 0.15 = 0.85
        assert score == 0.85


class TestKeywordOverlap:
    """Unit tests for _keyword_overlap() helper."""

    def test_identical_texts(self):
        """Identical texts should have overlap of 1.0."""
        assert _keyword_overlap("hello world foo", "hello world foo") == 1.0

    def test_completely_different(self):
        """Completely different topics should have overlap of 0.0."""
        assert _keyword_overlap("pizza sushi ramen", "stocks bonds crypto") == 0.0

    def test_partial_overlap(self):
        """Partial overlap should return a value between 0 and 1."""
        overlap = _keyword_overlap("pizza sushi", "pizza ramen")
        assert 0.0 < overlap < 1.0

    def test_both_empty(self):
        """Both empty strings should return 1.0 (no false topic shift)."""
        assert _keyword_overlap("", "") == 1.0

    def test_stop_words_ignored(self):
        """Stop words should not contribute to overlap."""
        # "the" and "is" are stop words — only "cat" and "dog" matter
        overlap = _keyword_overlap("the cat is here", "the dog is here")
        # cat vs dog → 0/2 = 0.0 (if "here" is not a stop word)
        assert overlap < 0.5

    def test_none_handling(self):
        """None inputs should not crash."""
        assert _keyword_overlap(None, "hello world") == 0.0
        assert _keyword_overlap("hello world", None) == 0.0
        assert _keyword_overlap(None, None) == 1.0


class TestSemanticTopicShift:
    """Tests for embedding-based topic-shift detection in score_message()."""

    def test_semantic_shift_with_low_similarity(self):
        """Low cosine similarity between embeddings triggers topic shift bonus."""
        # Orthogonal vectors → similarity = 0.0, which is < 0.5 threshold
        score = score_message(
            "What kind of music do you listen to?", "user",
            text_embedding=[1.0, 0.0, 0.0],
            prev_embedding=[0.0, 1.0, 0.0],
        )
        # Base 0.5 + topic shift 0.2 = 0.7
        assert score == 0.7

    def test_semantic_no_shift_with_high_similarity(self):
        """High cosine similarity should NOT trigger topic shift."""
        # Nearly identical vectors → high similarity
        score = score_message(
            "Tell me more about that topic.", "user",
            text_embedding=[0.9, 0.1, 0.0],
            prev_embedding=[0.85, 0.15, 0.0],
        )
        # Base 0.5 only — no topic shift
        assert score == 0.5

    def test_semantic_overrides_jaccard(self):
        """When embeddings are provided, Jaccard overlap is not used."""
        # Texts share no keywords (Jaccard would detect shift), but
        # embeddings are identical (semantic = no shift)
        score = score_message(
            "Space exploration rockets NASA", "user",
            prev_text="Pizza sushi ramen noodles",
            text_embedding=[1.0, 0.0],
            prev_embedding=[1.0, 0.0],
        )
        # Identical embeddings → cosine sim = 1.0 → no topic shift
        assert score == 0.5

    def test_falls_back_to_jaccard_without_embeddings(self):
        """Without embeddings, Jaccard overlap is still used."""
        score = score_message(
            "What kind of music do you listen to?", "user",
            prev_text="I had pasta for dinner last night and it was amazing.",
            has_question=True,
        )
        # Base 0.5 + question 0.1 + Jaccard topic shift 0.2 = 0.8
        assert score == 0.8

    def test_partial_embeddings_fall_back(self):
        """If only one embedding is provided, falls back to Jaccard."""
        score = score_message(
            "Space rockets NASA exploration", "user",
            prev_text="Pizza sushi ramen noodles",
            text_embedding=[1.0, 0.0],
            prev_embedding=None,
        )
        # No prev_embedding → Jaccard path → topic shift detected
        assert score == 0.7


class TestCosineSim:
    """Tests for the _cosine_sim() helper function."""

    def test_identical_vectors(self):
        """Identical vectors have similarity 1.0."""
        assert abs(_cosine_sim([1.0, 0.0], [1.0, 0.0]) - 1.0) < 1e-6

    def test_orthogonal_vectors(self):
        """Orthogonal vectors have similarity 0.0."""
        assert abs(_cosine_sim([1.0, 0.0], [0.0, 1.0])) < 1e-6

    def test_opposite_vectors(self):
        """Opposite vectors have similarity -1.0."""
        assert abs(_cosine_sim([1.0, 0.0], [-1.0, 0.0]) - (-1.0)) < 1e-6

    def test_empty_vectors(self):
        """Empty vectors should return 1.0 (no false topic shift)."""
        assert _cosine_sim([], [1.0, 0.0]) == 1.0
        assert _cosine_sim([1.0, 0.0], []) == 1.0
        assert _cosine_sim([], []) == 1.0

    def test_zero_magnitude(self):
        """Zero-magnitude vector should return 1.0."""
        assert _cosine_sim([0.0, 0.0], [1.0, 0.0]) == 1.0
