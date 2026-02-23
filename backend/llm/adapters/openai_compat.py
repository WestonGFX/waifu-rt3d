import requests
import time
import json
import logging
from .base import LLMAdapter

logger = logging.getLogger("waifu.llm.openai")

class OpenAICompatAdapter(LLMAdapter):
    def chat(self, messages, model, endpoint, api_key, **kw):
        """
        Non-streaming chat completion via OpenAI-compatible API.

        Args:
            messages: List of message dicts with 'role' and 'content'
            model: Model identifier string
            endpoint: Base URL of the OpenAI-compatible API
            api_key: API key (or None for local servers)
            **kw: Optional max_tokens, temperature, timeout

        Returns:
            dict: {ok: bool, reply: str, raw: dict} on success,
                  {ok: False, error: str, code: str} on failure
        """
        url, headers = self._build_request(endpoint, api_key)

        payload = {
            "model": model,
            "messages": messages,
            "max_tokens": kw.get("max_tokens", -1),
            "temperature": kw.get("temperature", 0.7),
            "stream": False
        }
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
        """
        Streaming chat completion via OpenAI-compatible API (SSE).
        Yields individual token delta strings as they arrive from the LLM.

        Uses `stream: true` in the OpenAI API, which returns Server-Sent Events
        with `data: {"choices": [{"delta": {"content": "token"}}]}` lines.

        Args:
            messages: List of message dicts with 'role' and 'content'
            model: Model identifier string
            endpoint: Base URL of the OpenAI-compatible API
            api_key: API key (or None for local servers)
            **kw: Optional max_tokens, temperature, timeout

        Yields:
            str: Individual token deltas from the LLM response

        Raises:
            RuntimeError: If the API returns an error status code
        """
        url, headers = self._build_request(endpoint, api_key)

        payload = {
            "model": model,
            "messages": messages,
            "max_tokens": kw.get("max_tokens", -1),
            "temperature": kw.get("temperature", 0.7),
            "stream": True
        }
        # Merge any extra_body kwargs (e.g. Qwen3 thinking mode)
        if kw.get("extra_body"):
            payload.update(kw["extra_body"])

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

            # Parse SSE stream line by line
            for line in r.iter_lines(decode_unicode=True):
                if not line or not line.startswith("data: "):
                    continue

                data_str = line[6:]  # Strip "data: " prefix
                if data_str.strip() == "[DONE]":
                    break

                try:
                    chunk = json.loads(data_str)
                    delta = chunk.get("choices", [{}])[0].get("delta", {})
                    content = delta.get("content")
                    if content:
                        yield content
                except json.JSONDecodeError:
                    logger.warning(f"Failed to parse SSE chunk: {data_str[:100]}")
                    continue

        except requests.exceptions.Timeout:
            raise RuntimeError("Request Timed Out")
        except RuntimeError:
            raise
        except Exception as e:
            raise RuntimeError(f"Connection Failed: {str(e)}")

    def _build_request(self, endpoint, api_key):
        """
        Build the URL and headers for an OpenAI-compatible API request.

        Args:
            endpoint: Base URL of the API
            api_key: API key string or None

        Returns:
            tuple: (url, headers) for the chat completions endpoint
        """
        base_url = endpoint.rstrip('/')
        if not base_url.endswith('/v1'):
            base_url += '/v1'
        url = f"{base_url}/chat/completions"

        headers = {"Content-Type": "application/json"}
        if api_key and not api_key.startswith("env:"):
            headers["Authorization"] = f"Bearer {api_key}"

        return url, headers
