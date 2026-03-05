"""Tests for generic thinking mode config key and multi-arch helper."""
import json
from pathlib import Path
import pytest


def test_config_uses_thinking_mode_not_qwen3():
    """Config should use generic 'thinking_mode', not 'qwen3_thinking_mode'."""
    cfg = json.loads((Path(__file__).parent.parent / "config" / "app.json").read_text())
    llm = cfg.get("llm", {})
    assert "qwen3_thinking_mode" not in llm, "Old key 'qwen3_thinking_mode' should be removed"
    assert "thinking_mode" in llm, "New key 'thinking_mode' should exist"


# Import the helper — it's a module-level function in server.py
# We test it by importing from the server module
class TestBuildThinkingExtraBody:
    """Tests for _build_thinking_extra_body helper."""

    @pytest.fixture(autouse=True)
    def import_helper(self):
        from backend.server import _build_thinking_extra_body
        self.build = _build_thinking_extra_body

    def test_returns_none_when_disabled(self):
        assert self.build("qwen3-8b", False) is None

    def test_qwen3_uses_chat_template_kwargs(self):
        result = self.build("Qwen3-8B-Instruct", True)
        assert result == {"chat_template_kwargs": {"enable_thinking": True}}

    def test_deepseek_r1_uses_enable_thinking(self):
        result = self.build("deepseek-r1-distill-qwen-7b", True)
        assert result == {"enable_thinking": True}

    def test_qwq_uses_enable_thinking(self):
        result = self.build("QwQ-32B-Preview", True)
        assert result == {"enable_thinking": True}

    def test_unknown_model_returns_none(self):
        """Unknown models should not get thinking params injected."""
        result = self.build("some-unknown-model", True)
        assert result is None
