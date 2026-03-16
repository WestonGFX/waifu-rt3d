"""Tests for output format rules."""

from backend.llm.output_formatter import apply_format_rules


class TestApplyFormatRules:
    """Tests for apply_format_rules()."""

    def test_strip_action_text(self):
        rules = [{"pattern": r"\*[^*]+\*", "replacement": "", "is_enabled": 1}]
        result = apply_format_rules("Hello *waves* friend!", rules)
        assert result == "Hello  friend!"

    def test_remove_ooc_markers(self):
        rules = [{"pattern": r"\(OOC:.*?\)", "replacement": "", "is_enabled": 1}]
        result = apply_format_rules("Hi! (OOC: this is meta) Bye!", rules)
        assert result == "Hi!  Bye!"

    def test_disabled_rule_skipped(self):
        rules = [{"pattern": r"bad", "replacement": "good", "is_enabled": 0}]
        result = apply_format_rules("bad word", rules)
        assert result == "bad word"

    def test_invalid_regex_skipped(self):
        rules = [{"pattern": r"[invalid", "replacement": "", "is_enabled": 1}]
        result = apply_format_rules("test [invalid text", rules)
        assert result == "test [invalid text"

    def test_empty_rules(self):
        assert apply_format_rules("hello", []) == "hello"

    def test_multiple_rules_applied_in_order(self):
        rules = [
            {"pattern": r"foo", "replacement": "bar", "is_enabled": 1},
            {"pattern": r"bar", "replacement": "baz", "is_enabled": 1},
        ]
        result = apply_format_rules("foo", rules)
        assert result == "baz"  # foo→bar→baz

    def test_backreference_replacement(self):
        rules = [{"pattern": r'"([^"]+)"', "replacement": r"«\1»", "is_enabled": 1}]
        result = apply_format_rules('She said "hello" to me', rules)
        assert result == "She said «hello» to me"

    def test_strips_whitespace(self):
        rules = [{"pattern": r"end", "replacement": "", "is_enabled": 1}]
        result = apply_format_rules("  the   ", rules)
        assert result == "the"
