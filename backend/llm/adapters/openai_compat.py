"""OpenAI-compatible LLM adapter.

Works with any endpoint that follows the OpenAI Chat Completions API:
LM Studio, llama.cpp, Together, Groq, OpenRouter, OpenAI itself, etc.

Supports streaming, non-streaming, and native function calling (tool use).
When tools are passed via ``chat_stream(..., tools=[...])``, the adapter
sends them in the request payload and parses ``tool_calls`` from the
streamed response deltas.
"""
import re
import requests
import time
import json
import logging
from .base import LLMAdapter

logger = logging.getLogger("waifu.llm.openai")

# Models that emit `reasoning_content` and burn their entire output budget on
# thinking when `enable_thinking` is left at its template default. Without
# `chat_template_kwargs.enable_thinking=False`, qwen3 returns `content: ""` on
# any reasonable max_tokens (verified with qwen/qwen3.5-9b at max_tokens=4096),
# which presents to end users as a 35-second silent timeout. Match by name
# fragment so vendor prefixes (`qwen/`, `lmstudio-community/`) don't matter.
# Session 46 multi-persona test surfaced this as P0 ("brutal first impression").
_REASONING_MODEL_PATTERNS = re.compile(
    r"qwen-?3|qwen3|deepseek-r1|deepseek_r1|/r1\b|/o1\b|^o1[-/]|qwq",
    re.IGNORECASE,
)


def _is_reasoning_model(model: str) -> bool:
    """Whether the model name looks like a reasoning/thinking-mode family.

    Reasoning models emit `reasoning_content` separate from `content`. They
    benefit from `chat_template_kwargs.enable_thinking=False` for fast chat
    use cases where the user wants the answer, not the scratchpad.

    Args:
        model: Model identifier string (e.g. "qwen/qwen3.5-9b").

    Returns:
        True if the model name matches a known reasoning family.

    Example:
        >>> _is_reasoning_model("qwen/qwen3.5-9b")
        True
        >>> _is_reasoning_model("gemma-4-26b-it")
        False
    """
    if not model:
        return False
    return bool(_REASONING_MODEL_PATTERNS.search(model))


def _apply_reasoning_defaults(payload: dict, model: str) -> None:
    """Inject `chat_template_kwargs.enable_thinking=False` for reasoning models.

    No-op when the caller already supplied `chat_template_kwargs` (respects
    explicit override). Mutates `payload` in place.

    Args:
        payload: Request payload dict (will be mutated).
        model: Configured model name used to detect reasoning families.
    """
    if not _is_reasoning_model(model):
        return
    if "chat_template_kwargs" in payload:
        return
    payload["chat_template_kwargs"] = {"enable_thinking": False}

class OpenAICompatAdapter(LLMAdapter):
    """LLM adapter for OpenAI-compatible chat completion APIs.

    Supports LM Studio, llama.cpp server, Together AI, Groq, OpenRouter,
    and any other endpoint implementing the ``/v1/chat/completions`` spec.

    Example:
        >>> adapter = OpenAICompatAdapter()
        >>> for token in adapter.chat_stream(
        ...     messages=[{"role": "user", "content": "Hi"}],
        ...     model="", endpoint="http://localhost:1234", api_key="lm-studio",
        ... ):
        ...     print(token, end="")
    """

    def supports_tools(self) -> bool:
        """OpenAI-compatible APIs generally support function calling."""
        return True

    def supports_vision(self) -> bool:
        """OpenAI-compat endpoints support vision if the loaded model does.

        Returns True optimistically — the server will return an error if the
        model doesn't support images, which callers handle gracefully.
        """
        return True

    def image_chat(
        self,
        messages: list,
        images: list[dict],
        model: str,
        endpoint: str,
        api_key: str,
        **kw,
    ) -> dict:
        """OpenAI-compatible chat with vision (image_url content blocks).

        Injects base64 images into the last user message as OpenAI-format
        ``image_url`` content items.  Works with LM Studio + LLaVA, Ollama
        with vision models, OpenAI GPT-4o, etc.

        Args:
            messages: OpenAI-style message list.
            images: List of ``{"data": "base64...", "media_type": "image/jpeg"}`` dicts.
            model: Model identifier string.
            endpoint: Base URL of the OpenAI-compatible API.
            api_key: API key (or None for local servers).
            **kw: Passed through to ``chat()``.

        Returns:
            Same shape as ``chat()``.

        Example:
            >>> adapter = OpenAICompatAdapter()
            >>> result = adapter.image_chat(
            ...     messages=[{"role": "user", "content": "What game is this?"}],
            ...     images=[{"data": "/9j/4AAQ...", "media_type": "image/jpeg"}],
            ...     model="llava-v1.6", endpoint="http://localhost:1234", api_key="",
            ... )
        """
        if not images:
            return self.chat(messages, model, endpoint, api_key, **kw)

        # Clone messages and inject images into the last user message
        enriched = []
        last_user_idx = -1
        for i, m in enumerate(messages):
            if m.get("role") == "user":
                last_user_idx = i

        for i, m in enumerate(messages):
            if i == last_user_idx:
                content_parts = []
                for img in images:
                    media_type = img.get("media_type", "image/jpeg")
                    content_parts.append({
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:{media_type};base64,{img['data']}",
                        },
                    })
                content_parts.append({
                    "type": "text",
                    "text": m.get("content", ""),
                })
                enriched.append({"role": "user", "content": content_parts})
            else:
                enriched.append(m)

        return self.chat(enriched, model, endpoint, api_key, **kw)

    def chat(self, messages, model, endpoint, api_key, **kw):
        """Non-streaming chat completion via OpenAI-compatible API.

        Args:
            messages: List of message dicts with 'role' and 'content'.
            model: Model identifier string.
            endpoint: Base URL of the OpenAI-compatible API.
            api_key: API key (or None for local servers).
            **kw: Optional max_tokens, temperature, timeout, tools.

        Returns:
            dict: {ok: bool, reply: str, raw: dict} on success,
                  {ok: False, error: str, code: str} on failure.
        """
        url, headers = self._build_request(endpoint, api_key)

        payload = {
            "model": model,
            "messages": messages,
            "max_tokens": kw.get("max_tokens", -1),
            "temperature": kw.get("temperature", 0.7),
            "stream": False
        }
        # Repetition / frequency penalties — critical for preventing degenerate
        # loops on local models (Gemma, LLaMA, etc.).  LM Studio and llama.cpp
        # recognise "repetition_penalty" (multiplicative) while the OpenAI spec
        # uses "frequency_penalty" (additive).  We send both when configured so
        # the server can use whichever it supports.
        if kw.get("repeat_penalty") is not None:
            payload["repetition_penalty"] = kw["repeat_penalty"]
        if kw.get("frequency_penalty") is not None:
            payload["frequency_penalty"] = kw["frequency_penalty"]
        # Merge any extra_body kwargs (e.g. Qwen3 thinking mode: {"chat_template_kwargs": {"enable_thinking": False}})
        if kw.get("extra_body"):
            payload.update(kw["extra_body"])
        _apply_reasoning_defaults(payload, model)

        try:
            timeout = kw.get("timeout", (10, 300))
            r = requests.post(url, headers=headers, json=payload, timeout=timeout)

            if r.status_code != 200:
                return {
                    "ok": False,
                    "error": f"API Error {r.status_code}: {r.text}",
                    "code": "ERR_API_FAIL"
                }

            data = r.json()
            if "choices" not in data or not data["choices"]:
                return {"ok": False, "error": "Empty response from LLM", "code": "ERR_EMPTY"}

            msg = data["choices"][0]["message"]
            reply = msg.get("content") or ""
            # Reasoning-model fallback: when the server returned only
            # `reasoning_content` (auto-disable thinking was ignored or the
            # template didn't honor it), surface the reasoning so the user
            # gets *something* rather than a silent empty bubble.
            if not reply and msg.get("reasoning_content"):
                reply = msg["reasoning_content"]
                logger.info("openai_compat: empty content; fell back to reasoning_content (%d chars)", len(reply))
            return {"ok": True, "reply": reply, "raw": data}

        except requests.exceptions.Timeout:
            return {"ok": False, "error": "Request Timed Out", "code": "ERR_TIMEOUT"}
        except Exception as e:
            return {"ok": False, "error": f"Connection Failed: {str(e)}", "code": "ERR_CONN"}

    def chat_stream(self, messages, model, endpoint, api_key, **kw):
        """Streaming chat completion via OpenAI-compatible API (SSE).

        Yields individual token delta strings as they arrive from the LLM.
        When tools are provided via ``kw["tools"]``, the adapter includes
        them in the request and parses ``tool_calls`` from the streamed
        deltas, yielding ``{"type": "tool_call", ...}`` dicts.

        Args:
            messages: List of message dicts with 'role' and 'content'.
            model: Model identifier string.
            endpoint: Base URL of the OpenAI-compatible API.
            api_key: API key (or None for local servers).
            **kw: Optional max_tokens, temperature, timeout, tools.

        Yields:
            str: Individual token deltas from the LLM response.
            dict: Tool call dicts ``{"type": "tool_call", "id": str,
                "function": {"name": str, "arguments": str}}`` when the
                model invokes a function.

        Raises:
            RuntimeError: If the API returns an error status code.
        """
        url, headers = self._build_request(endpoint, api_key)

        payload = {
            "model": model,
            "messages": messages,
            "max_tokens": kw.get("max_tokens", -1),
            "temperature": kw.get("temperature", 0.7),
            "stream": True
        }
        if kw.get("repeat_penalty") is not None:
            payload["repetition_penalty"] = kw["repeat_penalty"]
        if kw.get("frequency_penalty") is not None:
            payload["frequency_penalty"] = kw["frequency_penalty"]
        # Merge any extra_body kwargs (e.g. Qwen3 thinking mode)
        if kw.get("extra_body"):
            payload.update(kw["extra_body"])
        _apply_reasoning_defaults(payload, model)

        # Add tools if provided (already in OpenAI format)
        tools = kw.get("tools")
        if tools:
            payload["tools"] = tools

        try:
            timeout = kw.get("timeout", (10, 300))
            r = requests.post(url, headers=headers, json=payload,
                              timeout=timeout, stream=True)

            if r.status_code != 200:
                raise RuntimeError(f"API Error {r.status_code}: {r.text[:200]}")

            # Force UTF-8 decoding — LM Studio may not declare charset in
            # Content-Type, causing requests to default to ISO-8859-1 which
            # mangles multi-byte chars (curly quotes, emoji, CJK, etc.)
            r.encoding = 'utf-8'

            # Track tool calls being streamed incrementally.
            # OpenAI streams tool calls as delta.tool_calls[i] where:
            #   - First chunk for index i has function.name
            #   - Subsequent chunks for same index accumulate function.arguments
            # We accumulate per-index and emit when the stream ends or a new
            # content delta arrives after tool call deltas.
            pending_tool_calls: dict[int, dict] = {}  # index → {id, name, args_parts}

            for line in r.iter_lines(decode_unicode=True):
                if not line or not line.startswith("data: "):
                    continue

                data_str = line[6:]  # Strip "data: " prefix
                if data_str.strip() == "[DONE]":
                    break

                try:
                    chunk = json.loads(data_str)
                    delta = chunk.get("choices", [{}])[0].get("delta", {})

                    # Handle text content
                    content = delta.get("content")
                    if content:
                        yield content

                    # Handle streamed tool calls
                    tool_calls = delta.get("tool_calls")
                    if tool_calls:
                        for tc in tool_calls:
                            idx = tc.get("index", 0)
                            func = tc.get("function", {})

                            if idx not in pending_tool_calls:
                                # First chunk for this tool call index
                                pending_tool_calls[idx] = {
                                    "id": tc.get("id", ""),
                                    "name": func.get("name", ""),
                                    "args_parts": [],
                                }

                            # Accumulate argument fragments
                            args_chunk = func.get("arguments", "")
                            if args_chunk:
                                pending_tool_calls[idx]["args_parts"].append(args_chunk)

                            # If we got an id on a later chunk, capture it
                            if tc.get("id") and not pending_tool_calls[idx]["id"]:
                                pending_tool_calls[idx]["id"] = tc["id"]
                            # Same for name
                            if func.get("name") and not pending_tool_calls[idx]["name"]:
                                pending_tool_calls[idx]["name"] = func["name"]

                except json.JSONDecodeError:
                    logger.warning("Failed to parse SSE chunk: %s", data_str[:100])
                    continue

            # Emit all accumulated tool calls at end of stream
            for idx in sorted(pending_tool_calls.keys()):
                tc = pending_tool_calls[idx]
                full_args = "".join(tc["args_parts"]) or "{}"
                yield {
                    "type": "tool_call",
                    "id": tc["id"],
                    "function": {
                        "name": tc["name"],
                        "arguments": full_args,
                    },
                }

        except requests.exceptions.Timeout:
            raise RuntimeError("Request Timed Out")
        except RuntimeError:
            raise
        except Exception as e:
            raise RuntimeError(f"Connection Failed: {str(e)}")

    def _build_request(self, endpoint, api_key):
        """Build the URL and headers for an OpenAI-compatible API request.

        Args:
            endpoint: Base URL of the API.
            api_key: API key string or None.

        Returns:
            tuple: (url, headers) for the chat completions endpoint.
        """
        base_url = endpoint.rstrip('/')
        if not base_url.endswith('/v1'):
            base_url += '/v1'
        url = f"{base_url}/chat/completions"

        headers = {"Content-Type": "application/json"}
        if api_key and not api_key.startswith("env:"):
            headers["Authorization"] = f"Bearer {api_key}"

        return url, headers
