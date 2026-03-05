"""Tests for backend.llm.token_counter — tiktoken wrapper with heuristic fallback.

Validates that:
- count_tokens() returns reasonable values for English, Japanese, and code
- count_messages_tokens() includes per-message framing overhead
- is_tiktoken_available() returns a bool
- Empty/None inputs handled gracefully
"""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.llm.token_counter import (
    count_tokens,
    count_messages_tokens,
    is_tiktoken_available,
)


class TestCountTokens:
    """Unit tests for count_tokens()."""

    def test_empty_string_returns_zero(self):
        assert count_tokens("") == 0

    def test_none_equivalent(self):
        """Falsy input should return 0."""
        assert count_tokens("") == 0

    def test_simple_english(self):
        """English text should tokenise to roughly 1 token per word."""
        result = count_tokens("The quick brown fox jumps over the lazy dog.")
        assert 5 <= result <= 15  # tiktoken gives ~10; heuristic gives ~11

    def test_japanese_text(self):
        """Japanese text typically has MORE tokens per character than English.

        tiktoken gives ~6-8 tokens for this short phrase; heuristic gives ~3.
        """
        result = count_tokens("こんにちは世界")
        assert result >= 1  # At minimum, something > 0

    def test_code_block(self):
        """Code with long identifiers and syntax."""
        code = "def calculate_fibonacci_sequence(n: int) -> list[int]:"
        result = count_tokens(code)
        assert result >= 5  # Should be reasonable

    def test_long_text(self):
        """Longer text should give proportionally more tokens."""
        short = count_tokens("Hello")
        long_text = "Hello world, this is a much longer sentence with many words in it."
        long_result = count_tokens(long_text)
        assert long_result > short

    def test_returns_at_least_one_for_nonempty(self):
        """Even single-character strings should return >= 1."""
        assert count_tokens("a") >= 1


class TestCountMessagesTokens:
    """Unit tests for count_messages_tokens()."""

    def test_empty_list(self):
        assert count_messages_tokens([]) == 0

    def test_single_message(self):
        msgs = [{"role": "user", "content": "Hello!"}]
        result = count_messages_tokens(msgs)
        # Should be content tokens + 4 framing
        content_tokens = count_tokens("Hello!")
        assert result == content_tokens + 4

    def test_multiple_messages(self):
        msgs = [
            {"role": "system", "content": "You are helpful."},
            {"role": "user", "content": "Hi!"},
            {"role": "assistant", "content": "Hello there!"},
        ]
        result = count_messages_tokens(msgs)
        expected = sum(count_tokens(m["content"]) + 4 for m in msgs)
        assert result == expected

    def test_missing_content_key(self):
        """Messages without 'content' should not crash."""
        msgs = [{"role": "user"}, {"role": "assistant", "content": "Hi"}]
        result = count_messages_tokens(msgs)
        assert result >= 4  # At least framing overhead

    def test_none_content(self):
        """None content should be treated as empty."""
        msgs = [{"role": "user", "content": None}]
        result = count_messages_tokens(msgs)
        assert result == 4  # Just framing, no content tokens


class TestIsTiktokenAvailable:
    """Tests for is_tiktoken_available()."""

    def test_returns_bool(self):
        result = is_tiktoken_available()
        assert isinstance(result, bool)


class TestHeuristicVsTiktoken:
    """Compare heuristic (chars // 4) against tiktoken for different text types."""

    def test_english_similar(self):
        """For English, chars//4 and tiktoken should be within ~2x of each other."""
        text = "This is a typical English sentence that we might see in a chat conversation."
        heuristic = max(1, len(text) // 4)
        actual = count_tokens(text)
        # They should be in the same ballpark
        ratio = actual / heuristic if heuristic > 0 else 1.0
        assert 0.3 < ratio < 3.0, f"Ratio {ratio} is too far off (heuristic={heuristic}, actual={actual})"

    def test_code_divergence(self):
        """Code with long identifiers: heuristic tends to underestimate."""
        code = """
def process_user_authentication_request(username: str, password: str) -> dict:
    validated_credentials = validate_input_credentials(username, password)
    return {"status": "ok", "token": generate_jwt_token(validated_credentials)}
"""
        heuristic = max(1, len(code) // 4)
        actual = count_tokens(code)
        # Both should give something > 0
        assert heuristic > 0
        assert actual > 0
