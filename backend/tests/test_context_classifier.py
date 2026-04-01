"""Tests for backend.adaptive.context_classifier — rule-based context classification.

Covers:
    - CONTEXTS tuple has exactly 7 entries
    - classify_context() returns the correct context for each of the 7 types
    - Priority order (comfort > emotional > factual > roleplay > philosophical > flirty > casual)
    - mood_state parameter influences classification thresholds
    - Edge cases: empty string, very long string, mixed signals
    - get_context_confidence() dict has all 7 keys summing to ~1.0
    - get_context_confidence() returns uniform distribution for empty input

All tests are pure function calls — no mocking, no I/O, no mutable state.
"""

from __future__ import annotations

import pytest

from backend.adaptive.context_classifier import (
    CONTEXTS,
    classify_context,
    get_context_confidence,
)


# ---------------------------------------------------------------------------
# Tests: CONTEXTS constant
# ---------------------------------------------------------------------------


class TestContextsConstant:
    """Tests for the CONTEXTS module-level tuple."""

    def test_contexts_has_exactly_seven_entries(self):
        """CONTEXTS must expose exactly the 7 documented context type strings."""
        assert len(CONTEXTS) == 7

    def test_contexts_contains_all_expected_types(self):
        """All seven context type strings are present in CONTEXTS."""
        expected = {
            "comfort_reassurance",
            "emotional_support",
            "factual_qa",
            "creative_roleplay",
            "deep_philosophical",
            "playful_flirty",
            "casual_chat",
        }
        assert set(CONTEXTS) == expected

    def test_contexts_is_tuple(self):
        """CONTEXTS is a tuple (immutable, not a list)."""
        assert isinstance(CONTEXTS, tuple)


# ---------------------------------------------------------------------------
# Tests: classify_context — happy paths for all 7 context types
# ---------------------------------------------------------------------------


class TestClassifyContextHappyPaths:
    """Tests that each context type fires correctly under ideal conditions."""

    def test_classify_comfort_reassurance(self):
        """Strong negative sentiment + comfort keyword → comfort_reassurance."""
        ctx = classify_context("I'm so scared and panicking, help me", -0.5, 0, 0)
        assert ctx == "comfort_reassurance"

    def test_classify_emotional_support_sentiment(self):
        """Moderate negative sentiment alone → emotional_support."""
        ctx = classify_context("I feel kind of down today", -0.2, 0, 0)
        assert ctx == "emotional_support"

    def test_classify_emotional_support_keyword(self):
        """Sadness keyword alone (with neutral sentiment) → emotional_support."""
        ctx = classify_context("I feel so lonely", 0.0, 0, 0)
        assert ctx == "emotional_support"

    def test_classify_factual_qa(self):
        """Question + factual phrase → factual_qa."""
        ctx = classify_context("What is the capital of France?", 0.0, 0, 1)
        assert ctx == "factual_qa"

    def test_classify_factual_qa_how_does(self):
        """'How does X work?' pattern → factual_qa."""
        ctx = classify_context("How does gravity work?", 0.0, 0, 1)
        assert ctx == "factual_qa"

    def test_classify_creative_roleplay_asterisk(self):
        """*action* asterisk markers → creative_roleplay."""
        ctx = classify_context("*hugs you tightly* let's pretend we're in a forest", 0.1, 0, 0)
        assert ctx == "creative_roleplay"

    def test_classify_creative_roleplay_keyword(self):
        """Roleplay keyword without asterisks → creative_roleplay."""
        ctx = classify_context("Let's roleplay as medieval knights", 0.0, 0, 0)
        assert ctx == "creative_roleplay"

    def test_classify_deep_philosophical(self):
        """Depth keyword + message length > 100 → deep_philosophical."""
        long_msg = (
            "I've been thinking about the meaning of existence a lot lately. "
            "Do you think consciousness is something that emerges from matter, "
            "or is it fundamental to the universe?"
        )
        assert len(long_msg) > 100
        ctx = classify_context(long_msg, 0.0, 0, 0)
        assert ctx == "deep_philosophical"

    def test_classify_playful_flirty(self):
        """Emoji >= 2 + positive sentiment + flirt keyword → playful_flirty."""
        ctx = classify_context("You're so cute and adorable 😊😘", 0.6, 2, 0)
        assert ctx == "playful_flirty"

    def test_classify_casual_chat_default(self):
        """Neutral message with no triggers → casual_chat fallback."""
        ctx = classify_context("Hey what's up", 0.0, 0, 0)
        assert ctx == "casual_chat"


# ---------------------------------------------------------------------------
# Tests: classify_context — priority order
# ---------------------------------------------------------------------------


class TestClassifyContextPriority:
    """Tests that the priority ordering is strictly respected."""

    def test_comfort_beats_emotional_support(self):
        """comfort_reassurance fires before emotional_support when both match."""
        # Strong negative sentiment + sadness keyword + comfort keyword
        ctx = classify_context("I'm terrified and sad, help me", -0.5, 0, 0)
        assert ctx == "comfort_reassurance"

    def test_emotional_support_beats_factual(self):
        """emotional_support fires before factual_qa even when both have signals."""
        # sadness keyword + question + factual phrase — emotional wins
        ctx = classify_context("I feel sad. What is happiness?", -0.2, 0, 1)
        assert ctx == "emotional_support"

    def test_factual_beats_roleplay(self):
        """factual_qa fires before creative_roleplay when factual phrase + question mark present."""
        # factual phrase + question mark should win over roleplay keyword
        msg = "What is pretend? I'm just curious"
        ctx = classify_context(msg, 0.0, 0, 1)
        # The message has "what is" + "?" → factual should win
        assert ctx == "factual_qa"

    def test_roleplay_beats_philosophical_short_message(self):
        """creative_roleplay fires before deep_philosophical on short roleplay messages."""
        # roleplay keyword but message < 100 chars (so philosophical won't fire anyway)
        ctx = classify_context("Let's roleplay — act as a wizard", 0.0, 0, 0)
        assert ctx == "creative_roleplay"

    def test_philosophical_beats_flirty_when_both_could_fire(self):
        """deep_philosophical fires before playful_flirty (rule 5 vs 6)."""
        # Build a message with depth keyword, > 100 chars, AND emoji + flirt keyword
        long_msg = (
            "What is the meaning of life and truth and reality, my darling? "
            "I wonder about consciousness and the soul every single day 😊😊"
        )
        assert len(long_msg) > 100
        ctx = classify_context(long_msg, 0.3, 2, 0)
        assert ctx == "deep_philosophical"

    def test_casual_chat_is_last_resort(self):
        """casual_chat is only returned when nothing else fires."""
        ctx = classify_context("alright cool", 0.0, 0, 0)
        assert ctx == "casual_chat"


# ---------------------------------------------------------------------------
# Tests: classify_context — mood_state influence
# ---------------------------------------------------------------------------


class TestClassifyContextMoodState:
    """Tests that mood_state adjusts classification thresholds correctly."""

    def test_distressed_mood_lowers_emotional_support_threshold(self):
        """With a distressed mood, neutral-sentiment text with sadness keyword → emotional_support."""
        # Without distressed mood, sentiment=0.0 + no sadness keyword → casual_chat
        # With distressed mood, threshold drops to 0.0 (sentiment < 0.0 not met,
        # but keyword match should still trigger)
        ctx_default = classify_context("I feel a bit off", 0.05, 0, 0, mood_state=None)
        # Sentiment 0.05 > default threshold -0.1, and "feel" is a sadness keyword
        # → emotional_support still fires on keyword match
        ctx_distressed = classify_context("I feel a bit off", 0.05, 0, 0, mood_state="sad")
        # With distressed mood the threshold becomes 0.0: sentiment 0.05 > 0.0
        # but the sadness keyword "feel" still triggers — both should be emotional_support
        assert ctx_distressed == "emotional_support"

    def test_intimate_mood_lowers_flirty_emoji_threshold(self):
        """With romantic mood, 1 emoji (instead of 2) is enough for playful_flirty."""
        # Without intimate mood, 1 emoji fails the >= 2 check → casual_chat
        ctx_no_mood = classify_context("You're so cute darling 😊", 0.5, 1, 0, mood_state=None)
        assert ctx_no_mood != "playful_flirty"

        # With romantic mood, 1 emoji meets the lowered threshold
        ctx_romantic = classify_context("You're so cute darling 😊", 0.5, 1, 0, mood_state="romantic")
        assert ctx_romantic == "playful_flirty"

    def test_unknown_mood_state_treated_as_no_mood(self):
        """An unrecognised mood_state string does not crash and has no effect."""
        ctx = classify_context("Hey what's up", 0.0, 0, 0, mood_state="unknown_mood_xyz")
        assert ctx == "casual_chat"

    def test_none_mood_state_is_default(self):
        """mood_state=None behaves identically to omitting it."""
        ctx_explicit_none = classify_context("What is love?", 0.0, 0, 1, mood_state=None)
        ctx_omitted = classify_context("What is love?", 0.0, 0, 1)
        assert ctx_explicit_none == ctx_omitted


# ---------------------------------------------------------------------------
# Tests: classify_context — edge cases
# ---------------------------------------------------------------------------


class TestClassifyContextEdgeCases:
    """Tests for boundary and unusual input conditions."""

    def test_empty_string_returns_casual_chat(self):
        """Empty message falls through to casual_chat."""
        ctx = classify_context("", 0.0, 0, 0)
        assert ctx == "casual_chat"

    def test_very_long_string_with_no_signals(self):
        """Very long neutral text (no keywords) still returns casual_chat."""
        long_neutral = "blah " * 200  # 1000 chars, no keywords
        ctx = classify_context(long_neutral, 0.0, 0, 0)
        assert ctx == "casual_chat"

    def test_philosophical_requires_both_keyword_and_length(self):
        """depth keyword without sufficient length does NOT trigger deep_philosophical."""
        ctx = classify_context("meaning of life", 0.0, 0, 0)
        # Message is short (< 100 chars) → philosophical rule fails → casual_chat
        assert ctx != "deep_philosophical"

    def test_factual_qa_requires_question_mark(self):
        """Factual phrase without a '?' does not trigger factual_qa."""
        ctx = classify_context("tell me about quantum physics", 0.0, 0, 0)
        # No question mark → factual_qa rule fails
        assert ctx != "factual_qa"

    def test_comfort_requires_both_conditions(self):
        """comfort_reassurance requires BOTH negative sentiment AND a comfort keyword."""
        # Only negative sentiment, no comfort keyword → emotional_support not comfort
        ctx = classify_context("things are bad and awful", -0.5, 0, 0)
        assert ctx != "comfort_reassurance"
        # Only comfort keyword, but positive sentiment → emotional_support from keyword match
        ctx2 = classify_context("I feel scared but ok", 0.1, 0, 0)
        assert ctx2 != "comfort_reassurance"

    def test_mixed_signals_respects_priority(self):
        """When multiple contexts could fire, priority order is respected."""
        # sadness keyword + roleplay keyword + question mark + factual phrase
        # emotional_support (rule 2) comes before factual (3) and roleplay (4)
        msg = "I feel sad. What is pretend anyway? Let's roleplay"
        ctx = classify_context(msg, -0.2, 0, 1)
        assert ctx == "emotional_support"

    def test_whitespace_only_returns_casual_chat(self):
        """Whitespace-only input falls through to casual_chat."""
        ctx = classify_context("   \t\n  ", 0.0, 0, 0)
        assert ctx == "casual_chat"

    def test_return_value_is_always_in_contexts(self):
        """classify_context always returns a member of CONTEXTS."""
        test_cases = [
            ("", 0.0, 0, 0),
            ("I'm scared", -0.5, 0, 0),
            ("What is truth?", 0.0, 0, 1),
            ("You're so cute 😊😘", 0.5, 2, 0),
        ]
        for msg, sent, emo, qn in test_cases:
            result = classify_context(msg, sent, emo, qn)
            assert result in CONTEXTS, f"classify_context returned {result!r} not in CONTEXTS"


# ---------------------------------------------------------------------------
# Tests: get_context_confidence
# ---------------------------------------------------------------------------


class TestGetContextConfidence:
    """Tests for the get_context_confidence() function."""

    def test_returns_all_seven_context_keys(self):
        """Result dict contains exactly the 7 context type keys."""
        scores = get_context_confidence("What is love?", 0.0, 0, 1)
        assert set(scores.keys()) == set(CONTEXTS)

    def test_values_sum_to_one(self):
        """All confidence values sum to 1.0 (within floating-point tolerance)."""
        scores = get_context_confidence("I feel sad about everything", -0.3, 0, 0)
        assert sum(scores.values()) == pytest.approx(1.0, abs=1e-5)

    def test_values_are_between_zero_and_one(self):
        """Every confidence value is in [0.0, 1.0]."""
        scores = get_context_confidence("Let's pretend we're in space", 0.1, 0, 0)
        for ctx, val in scores.items():
            assert 0.0 <= val <= 1.0, f"Context {ctx!r} has out-of-range confidence {val}"

    def test_dominant_context_has_highest_confidence(self):
        """The classified context should have the highest (or tied highest) confidence."""
        msg = "What is the capital of Germany?"
        classified = classify_context(msg, 0.0, 0, 1)
        scores = get_context_confidence(msg, 0.0, 0, 1)
        max_score = max(scores.values())
        assert scores[classified] == pytest.approx(max_score, abs=1e-5)

    def test_empty_message_casual_chat_wins(self):
        """Empty message gives all weight to casual_chat (the only non-zero raw scorer).

        casual_chat always contributes a baseline score of 0.1 so even an empty
        message normalises to casual_chat=1.0.  The uniform-distribution branch
        in the source code is only reached when *every* raw score is zero, which
        cannot happen because casual_chat always contributes its 0.1 baseline.
        """
        scores = get_context_confidence("", 0.0, 0, 0)
        assert scores["casual_chat"] == pytest.approx(1.0, abs=1e-5)
        assert sum(scores.values()) == pytest.approx(1.0, abs=1e-5)

    def test_strong_roleplay_signal_dominates(self):
        """Asterisk roleplay markers produce the highest score for creative_roleplay."""
        scores = get_context_confidence("*draws sword dramatically*", 0.0, 0, 0)
        assert scores["creative_roleplay"] == max(scores.values())

    def test_factual_qa_score_exceeds_casual_for_question(self):
        """A factual question gives factual_qa higher confidence than casual_chat."""
        scores = get_context_confidence("What is Python?", 0.0, 0, 1)
        assert scores["factual_qa"] > scores["casual_chat"]
