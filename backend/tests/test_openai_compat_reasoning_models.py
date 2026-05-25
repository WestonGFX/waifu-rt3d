"""Regression tests for openai_compat reasoning-model auto-detection.

Locks in the session-46 P0 fix: qwen3 + deepseek-r1 + o1 + qwq must have
`chat_template_kwargs.enable_thinking=False` injected automatically, and
empty `content` must fall back to `reasoning_content` so the chat UI
never renders a silent empty bubble.
"""
from unittest.mock import patch, MagicMock

import pytest

from backend.llm.adapters.openai_compat import (
    OpenAICompatAdapter,
    _apply_reasoning_defaults,
    _is_reasoning_model,
)


class TestIsReasoningModel:
    """Model-name pattern matcher for reasoning-family detection."""

    @pytest.mark.parametrize("name", [
        "qwen/qwen3.5-9b",
        "qwen3-32b",
        "lmstudio-community/Qwen3-14B-GGUF",
        "deepseek-r1-distill-qwen-7b",
        "deepseek_r1_8b",
        "openai/o1",
        "o1-preview",
        "o1/mini",
        "qwq-32b-preview",
        "QWEN3.5",
    ])
    def test_reasoning_models_detected(self, name):
        assert _is_reasoning_model(name) is True

    @pytest.mark.parametrize("name", [
        "gemma-4-26b-a4b-it-abliterated",
        "llama-3.2-8x4b-moe-v2",
        "mistral-nemo-instruct-2407",
        "qwen2.5-7b-instruct",  # not qwen3
        "",
        "claude-3-5-sonnet",
        None,
    ])
    def test_non_reasoning_models_not_detected(self, name):
        assert _is_reasoning_model(name) is False


class TestApplyReasoningDefaults:
    """Payload mutation: injects enable_thinking=False for reasoning models."""

    def test_injects_chat_template_kwargs_for_qwen3(self):
        payload = {"model": "qwen3", "messages": []}
        _apply_reasoning_defaults(payload, "qwen/qwen3.5-9b")
        assert payload["chat_template_kwargs"] == {"enable_thinking": False}

    def test_noop_for_non_reasoning_model(self):
        payload = {"model": "gemma", "messages": []}
        _apply_reasoning_defaults(payload, "gemma-4-26b-it")
        assert "chat_template_kwargs" not in payload

    def test_respects_caller_override(self):
        # Caller already set chat_template_kwargs — don't clobber.
        payload = {
            "model": "qwen3",
            "chat_template_kwargs": {"enable_thinking": True, "extra": "keep"},
        }
        _apply_reasoning_defaults(payload, "qwen/qwen3.5-9b")
        assert payload["chat_template_kwargs"] == {"enable_thinking": True, "extra": "keep"}


class TestChatReasoningFallback:
    """Non-streaming `chat()`: empty content → reasoning_content fallback."""

    def _mock_response(self, content, reasoning=""):
        resp = MagicMock()
        resp.status_code = 200
        resp.json.return_value = {
            "choices": [
                {"message": {"content": content, "reasoning_content": reasoning}}
            ]
        }
        return resp

    def test_uses_content_when_present(self):
        adapter = OpenAICompatAdapter()
        with patch("backend.llm.adapters.openai_compat.requests.post") as mock_post:
            mock_post.return_value = self._mock_response("hello", reasoning="thinking…")
            result = adapter.chat(
                messages=[{"role": "user", "content": "hi"}],
                model="qwen/qwen3.5-9b",
                endpoint="http://localhost:1234/v1",
                api_key=None,
            )
        assert result["ok"] is True
        assert result["reply"] == "hello"

    def test_falls_back_to_reasoning_when_content_empty(self):
        adapter = OpenAICompatAdapter()
        with patch("backend.llm.adapters.openai_compat.requests.post") as mock_post:
            mock_post.return_value = self._mock_response("", reasoning="I think the answer is OK")
            result = adapter.chat(
                messages=[{"role": "user", "content": "hi"}],
                model="qwen/qwen3.5-9b",
                endpoint="http://localhost:1234/v1",
                api_key=None,
            )
        assert result["ok"] is True
        assert result["reply"] == "I think the answer is OK"

    def test_empty_content_and_empty_reasoning_returns_empty_reply(self):
        adapter = OpenAICompatAdapter()
        with patch("backend.llm.adapters.openai_compat.requests.post") as mock_post:
            mock_post.return_value = self._mock_response("", reasoning="")
            result = adapter.chat(
                messages=[{"role": "user", "content": "hi"}],
                model="qwen/qwen3.5-9b",
                endpoint="http://localhost:1234/v1",
                api_key=None,
            )
        assert result["ok"] is True
        assert result["reply"] == ""

    def test_payload_includes_enable_thinking_false_for_qwen3(self):
        adapter = OpenAICompatAdapter()
        with patch("backend.llm.adapters.openai_compat.requests.post") as mock_post:
            mock_post.return_value = self._mock_response("ok")
            adapter.chat(
                messages=[{"role": "user", "content": "hi"}],
                model="qwen/qwen3.5-9b",
                endpoint="http://localhost:1234/v1",
                api_key=None,
            )
        sent_payload = mock_post.call_args.kwargs["json"]
        assert sent_payload["chat_template_kwargs"] == {"enable_thinking": False}

    def test_payload_omits_enable_thinking_for_non_reasoning(self):
        adapter = OpenAICompatAdapter()
        with patch("backend.llm.adapters.openai_compat.requests.post") as mock_post:
            mock_post.return_value = self._mock_response("ok")
            adapter.chat(
                messages=[{"role": "user", "content": "hi"}],
                model="gemma-4-26b-it",
                endpoint="http://localhost:1234/v1",
                api_key=None,
            )
        sent_payload = mock_post.call_args.kwargs["json"]
        assert "chat_template_kwargs" not in sent_payload
