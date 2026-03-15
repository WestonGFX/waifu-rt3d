"""Tests for prompt template macro expansion."""

from backend.llm.macro_expander import expand_macros, build_macro_context, _affinity_to_tier


class TestExpandMacros:
    """Tests for the expand_macros() function."""

    def test_basic_expansion(self):
        ctx = {"char_name": "Mika", "time": "14:30"}
        result = expand_macros("Hi, I'm {{char_name}}! It's {{time}}.", ctx)
        assert result == "Hi, I'm Mika! It's 14:30."

    def test_unknown_macros_preserved(self):
        ctx = {"char_name": "Fox"}
        result = expand_macros("{{char_name}} says {{unknown}}", ctx)
        assert result == "Fox says {{unknown}}"

    def test_no_macros_passthrough(self):
        result = expand_macros("No macros here.", {"char_name": "Fox"})
        assert result == "No macros here."

    def test_case_insensitive_keys(self):
        ctx = {"char_name": "Yuki"}
        result = expand_macros("{{CHAR_NAME}} and {{Char_Name}}", ctx)
        assert result == "Yuki and Yuki"

    def test_empty_text(self):
        assert expand_macros("", {"x": "y"}) == ""

    def test_multiple_same_macro(self):
        ctx = {"char_name": "Mika"}
        result = expand_macros("{{char_name}} loves {{char_name}}", ctx)
        assert result == "Mika loves Mika"

    def test_whitespace_in_macro(self):
        ctx = {"char_name": "Fox"}
        result = expand_macros("{{ char_name }}", ctx)
        # regex only matches \w+ so spaces won't match — preserved as-is
        assert result == "{{ char_name }}"


class TestAffinityToTier:
    """Tests for affinity score → tier mapping."""

    def test_soulmate(self):
        assert _affinity_to_tier(95.0) == "soulmate"

    def test_close_friend(self):
        assert _affinity_to_tier(65.0) == "close_friend"

    def test_friend(self):
        assert _affinity_to_tier(45.0) == "friend"

    def test_acquaintance(self):
        assert _affinity_to_tier(25.0) == "acquaintance"

    def test_stranger(self):
        assert _affinity_to_tier(5.0) == "stranger"

    def test_boundary_values(self):
        assert _affinity_to_tier(80.0) == "soulmate"
        assert _affinity_to_tier(79.9) == "close_friend"
        assert _affinity_to_tier(0.0) == "stranger"


class TestBuildMacroContext:
    """Tests for build_macro_context() helper."""

    def test_basic_context(self):
        ctx = build_macro_context(char_name="Fox", affinity=50.0)
        assert ctx["char_name"] == "Fox"
        assert ctx["trust_level"] == "friend"
        assert ctx["user_name"] == "User"  # default
        assert "time" in ctx
        assert "date" in ctx
        assert "day" in ctx

    def test_relationship_days(self):
        from datetime import datetime, timedelta
        ten_days_ago = (datetime.now() - timedelta(days=10)).strftime("%Y-%m-%d")
        ctx = build_macro_context(first_chat_date=ten_days_ago)
        assert ctx["relationship_days"] == "10"

    def test_no_first_chat_date(self):
        ctx = build_macro_context()
        assert ctx["relationship_days"] == "0"

    def test_custom_user_name(self):
        ctx = build_macro_context(user_name="Chris")
        assert ctx["user_name"] == "Chris"
