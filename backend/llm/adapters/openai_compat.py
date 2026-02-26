"""OpenAI-compatible LLM adapter.

Works with any endpoint that follows the OpenAI Chat Completions API:
LM Studio, llama.cpp, Together, Groq, OpenRouter, OpenAI itself, etc.

Supports streaming, non-streaming, and native function calling (tool use).
When tools are passed via ``chat_stream(..., tools=[...])``, the adapter
sends them in the request payload and parses ``tool_calls`` from the
streamed response deltas.
"""
import requests
import time
import json
import logging
from .base import LLMAdapter

logger = logging.getLogger("waifu.llm.openai")

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

            reply = data["choices"][0]["message"]["content"]
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
