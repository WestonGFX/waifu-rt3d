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

    def test_appends_no_think_to_last_user_message_for_qwen3(self):
        payload = {
            "model": "qwen3",
            "messages": [
                {"role": "system", "content": "You are Rin."},
                {"role": "user", "content": "hello"},
                {"role": "assistant", "content": "hi back"},
                {"role": "user", "content": "tell me a story"},
            ],
        }
        _apply_reasoning_defaults(payload, "qwen/qwen3.5-9b")
        # Last user message gets the directive
        assert payload["messages"][-1]["content"] == "tell me a story /no_think"
        # Earlier user message is untouched
        assert payload["messages"][1]["content"] == "hello"
        # System message untouched
        assert payload["messages"][0]["content"] == "You are Rin."

    def test_no_think_not_duplicated_when_already_present(self):
        payload = {
            "model": "qwen3",
            "messages": [{"role": "user", "content": "hello /no_think"}],
        }
        _apply_reasoning_defaults(payload, "qwen/qwen3.5-9b")
        assert payload["messages"][0]["content"] == "hello /no_think"

    def test_no_think_skipped_for_non_reasoning_model(self):
        payload = {
            "model": "gemma",
            "messages": [{"role": "user", "content": "hello"}],
        }
        _apply_reasoning_defaults(payload, "gemma-4-26b-it")
        assert payload["messages"][0]["content"] == "hello"


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


class TestChatStreamReasoningFallback:
    """Streaming `chat_stream()`: reasoning_content deltas → visible tokens.

    The actual chat UI uses chat_stream(), so the empty-bubble bug for
    reasoning-family models lives here. Verified live against qwen3.5-9b
    via LM Studio in session 46.
    """

    def _mock_stream(self, lines):
        """Build a mock requests.Response that yields the given SSE lines."""
        resp = MagicMock()
        resp.status_code = 200
        resp.encoding = "utf-8"
        resp.iter_lines.return_value = iter(lines)
        return resp

    def _sse(self, **delta):
        payload = {"choices": [{"delta": delta}]}
        return f"data: {__import__('json').dumps(payload)}"

    def test_reasoning_model_yields_reasoning_content_as_tokens(self):
        adapter = OpenAICompatAdapter()
        lines = [
            self._sse(reasoning_content="Hi "),
            self._sse(reasoning_content="there!"),
            "data: [DONE]",
        ]
        with patch("backend.llm.adapters.openai_compat.requests.post") as mock_post:
            mock_post.return_value = self._mock_stream(lines)
            tokens = list(adapter.chat_stream(
                messages=[{"role": "user", "content": "hi"}],
                model="qwen/qwen3.5-9b",
                endpoint="http://localhost:1234/v1",
                api_key=None,
            ))
        # Filter to string tokens only (no tool_call dicts)
        text_tokens = [t for t in tokens if isinstance(t, str)]
        assert text_tokens == ["Hi ", "there!"]

    def test_normal_content_still_works_for_reasoning_model(self):
        adapter = OpenAICompatAdapter()
        lines = [
            self._sse(content="Hello"),
            self._sse(content=" world"),
            "data: [DONE]",
        ]
        with patch("backend.llm.adapters.openai_compat.requests.post") as mock_post:
            mock_post.return_value = self._mock_stream(lines)
            tokens = list(adapter.chat_stream(
                messages=[{"role": "user", "content": "hi"}],
                model="qwen/qwen3.5-9b",
                endpoint="http://localhost:1234/v1",
                api_key=None,
            ))
        text_tokens = [t for t in tokens if isinstance(t, str)]
        assert text_tokens == ["Hello", " world"]

    def test_non_reasoning_model_ignores_reasoning_content_when_content_seen(self):
        # If a non-reasoning model emits content first then later sends a
        # stray reasoning_content delta, we don't suddenly start emitting
        # it — protects against accidental thinking-text leakage.
        adapter = OpenAICompatAdapter()
        lines = [
            self._sse(content="Hello"),
            self._sse(reasoning_content="(stray)"),
            "data: [DONE]",
        ]
        with patch("backend.llm.adapters.openai_compat.requests.post") as mock_post:
            mock_post.return_value = self._mock_stream(lines)
            tokens = list(adapter.chat_stream(
                messages=[{"role": "user", "content": "hi"}],
                model="gemma-4-26b-it",
                endpoint="http://localhost:1234/v1",
                api_key=None,
            ))
        text_tokens = [t for t in tokens if isinstance(t, str)]
        assert text_tokens == ["Hello"]

    def test_non_reasoning_model_falls_back_when_only_reasoning_emitted(self):
        # Defensive fallback: if a non-reasoning-named model nevertheless
        # only emits reasoning_content (e.g. someone runs a thinking model
        # under a custom name we don't match), still surface it so the user
        # gets *something* rather than a silent empty bubble.
        adapter = OpenAICompatAdapter()
        lines = [
            self._sse(reasoning_content="surprise reasoning"),
            "data: [DONE]",
        ]
        with patch("backend.llm.adapters.openai_compat.requests.post") as mock_post:
            mock_post.return_value = self._mock_stream(lines)
            tokens = list(adapter.chat_stream(
                messages=[{"role": "user", "content": "hi"}],
                model="some-custom-model",
                endpoint="http://localhost:1234/v1",
                api_key=None,
            ))
        text_tokens = [t for t in tokens if isinstance(t, str)]
        assert text_tokens == ["surprise reasoning"]


def test_merge_keeps_trailing_instruction_in_final_user_turn():
    from backend.llm.adapters.openai_compat import _merge_system_messages

    merged = _merge_system_messages([
        {"role": "system", "content": "persona"},
        {"role": "system", "content": "[Memory] a"},
        {"role": "user", "content": "hi"},
        {"role": "assistant", "content": "hello"},
        {"role": "user", "content": "again"},
        {"role": "system", "content": "reply format"},
    ])
    assert [m["role"] for m in merged] == ["system", "user", "assistant", "user"]
    assert merged[0]["content"] == "persona\n\n[Memory] a"
    # Recency preserved: the late instruction is the LAST thing the model reads.
    assert merged[-1]["content"] == "again\n\nreply format"
    assert merged[1]["content"] == "hi"


def test_merge_handles_list_content_and_blank_system_messages():
    from backend.llm.adapters.openai_compat import _merge_system_messages

    merged = _merge_system_messages([
        {"role": "system", "content": [{"type": "text", "text": "multi"}, {"type": "text", "text": "part"}]},
        {"role": "system", "content": "   "},
        {"role": "user", "content": "hi"},
    ])
    assert merged == [
        {"role": "system", "content": "multi\npart"},
        {"role": "user", "content": "hi"},
    ]


def test_merge_without_user_turn_joins_late_system_into_leading():
    from backend.llm.adapters.openai_compat import _merge_system_messages

    merged = _merge_system_messages([{"role": "system", "content": "A"}])
    assert merged == [{"role": "system", "content": "A"}]


def test_merge_does_not_mutate_input():
    from backend.llm.adapters.openai_compat import _merge_system_messages

    msgs = [{"role": "user", "content": "hi"}, {"role": "system", "content": "late"}]
    _merge_system_messages(msgs)
    assert msgs == [{"role": "user", "content": "hi"}, {"role": "system", "content": "late"}]


def test_reasoning_defaults_merge_system_for_qwen_only():
    from backend.llm.adapters.openai_compat import _apply_reasoning_defaults

    msgs = [{"role": "user", "content": "hi"}, {"role": "system", "content": "late"}]
    qwen = {"messages": list(msgs)}
    _apply_reasoning_defaults(qwen, "qwen/qwen3.5-9b")
    assert all(m["role"] != "system" for m in qwen["messages"])
    assert "late" in qwen["messages"][-1]["content"]

    llama = {"messages": list(msgs)}
    _apply_reasoning_defaults(llama, "llama-3.2-1b-instruct")
    assert llama["messages"] == msgs


class TestReasoningIsMarkedSeparately:
    """The thinking card depends on reasoning deltas being distinguishable from the reply."""

    def _stream(self, lines):
        resp = MagicMock()
        resp.status_code = 200
        resp.encoding = "utf-8"
        resp.iter_lines.return_value = iter(lines)
        return resp

    def _sse(self, **delta):
        return "data: " + __import__("json").dumps({"choices": [{"delta": delta}]})

    def test_reasoning_deltas_are_reasoning_chunks_and_reply_is_plain(self):
        from backend.llm.adapters.openai_compat import ReasoningChunk

        lines = [
            self._sse(reasoning_content="Thinking... "),
            self._sse(content="Hello!"),
            "data: [DONE]",
        ]
        with patch("backend.llm.adapters.openai_compat.requests.post") as mock_post:
            mock_post.return_value = self._stream(lines)
            tokens = list(OpenAICompatAdapter().chat_stream(
                messages=[{"role": "user", "content": "hi"}],
                model="qwen/qwen3.5-9b",
                endpoint="http://localhost:1234/v1",
                api_key=None,
            ))
        assert [type(t) is ReasoningChunk for t in tokens] == [True, False]
        assert "".join(tokens) == "Thinking... Hello!"  # back-compat: still a str stream

    def test_non_stream_chat_returns_reasoning_separately(self):
        body = {"choices": [{"message": {"content": "Hi!", "reasoning_content": "because"}}]}
        resp = MagicMock(status_code=200)
        resp.json.return_value = body
        with patch("backend.llm.adapters.openai_compat.requests.post", return_value=resp):
            out = OpenAICompatAdapter().chat(
                messages=[{"role": "user", "content": "hi"}],
                model="qwen/qwen3.5-9b", endpoint="http://localhost:1234/v1", api_key=None,
            )
        assert out["reply"] == "Hi!" and out["reasoning"] == "because"
