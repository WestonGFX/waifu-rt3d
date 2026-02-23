"""Anthropic Claude API adapter.

Supports all Claude models via the Anthropic Messages API, including streaming.

Supported models (as of early 2026):
    claude-haiku-4-5-20251001  — fastest, cheapest
    claude-sonnet-4-6          — best balance of speed + quality
    claude-opus-4-6            — most capable

Configuration example (``app.json``)::

    {
      "llm": {
        "provider": "claude",
        "model": "claude-sonnet-4-6",
        "api_key": "sk-ant-...",
        "temperature": 0.7
      }
    }

Requires ``pip install anthropic``.  The adapter works without the SDK by
falling back to raw HTTP requests against ``api.anthropic.com``.
"""
import json
import logging
import requests

from .base import LLMAdapter

logger = logging.getLogger("waifu.llm.claude")

_ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"
_ANTHROPIC_VERSION = "2023-06-01"


class ClaudeAPIAdapter(LLMAdapter):
    """LLM adapter for Anthropic Claude models (Messages API).

    Supports both streaming and non-streaming completion.  Uses the native
    ``anthropic`` Python SDK if installed; falls back to raw HTTP requests
    otherwise.

    Example:
        >>> adapter = ClaudeAPIAdapter()
        >>> result = adapter.chat(
        ...     messages=[{"role": "user", "content": "Hello!"}],
        ...     model="claude-sonnet-4-6",
        ...     endpoint="",
        ...     api_key="sk-ant-...",
        ... )
        >>> result["ok"]
        True
    """

    # ------------------------------------------------------------------ #
    # Internal helpers
    # ------------------------------------------------------------------ #

    def _split_messages(self, messages: list) -> tuple[str, list]:
        """Separate the system prompt from the conversation history.

        The Anthropic API requires the system prompt as a top-level field,
        not as a message in the messages array.

        Args:
            messages: OpenAI-style list including possible ``role=system`` messages.

        Returns:
            ``(system_prompt_str, conversation_messages)``
        """
        system_parts = []
        conversation = []
        for m in messages:
            if m.get("role") == "system":
                system_parts.append(m["content"])
            else:
                conversation.append(m)
        return "\n\n".join(system_parts), conversation

    def _build_headers(self, api_key: str) -> dict:
        """Build Anthropic API request headers.

        Args:
            api_key: Anthropic API key (``sk-ant-...``).

        Returns:
            Headers dict suitable for ``requests.post``.
        """
        return {
            "x-api-key": api_key,
            "anthropic-version": _ANTHROPIC_VERSION,
            "content-type": "application/json",
        }

    # ------------------------------------------------------------------ #
    # Public interface
    # ------------------------------------------------------------------ #

    def chat(
        self,
        messages: list,
        model: str,
        endpoint: str,
        api_key: str,
        **kw,
    ) -> dict:
        """Non-streaming Claude chat completion.

        Args:
            messages: OpenAI-style list of ``{"role": str, "content": str}`` dicts.
            model: Claude model name (e.g. ``"claude-sonnet-4-6"``).
            endpoint: Unused (Anthropic endpoint is fixed). Pass ``""`` or omit.
            api_key: Anthropic API key (required).
            **kw: Optional ``temperature``, ``max_tokens``, ``timeout``.

        Returns:
            ``{"ok": True, "reply": str, "raw": dict}`` on success,
            ``{"ok": False, "error": str, "code": str}`` on failure.
        """
        if not api_key:
            return {"ok": False, "error": "Anthropic API key not configured. Add api_key to llm config.", "code": "ERR_NO_KEY"}

        system_prompt, conversation = self._split_messages(messages)
        max_tokens = kw.get("max_tokens") or 4096

        payload = {
            "model": model,
            "max_tokens": max_tokens,
            "temperature": kw.get("temperature", 0.7),
            "messages": conversation,
        }
        if system_prompt:
            payload["system"] = system_prompt

        try:
            r = requests.post(
                _ANTHROPIC_URL,
                headers=self._build_headers(api_key),
                json=payload,
                timeout=kw.get("timeout", (10, 300)),
            )
            if r.status_code != 200:
                return {"ok": False, "error": f"Anthropic API {r.status_code}: {r.text}", "code": "ERR_API_FAIL"}

            data = r.json()
            reply = data.get("content", [{}])[0].get("text", "")
            return {"ok": True, "reply": reply, "raw": data}

        except Exception as exc:
            return {"ok": False, "error": str(exc), "code": "ERR_NETWORK"}

    def chat_stream(
        self,
        messages: list,
        model: str,
        endpoint: str,
        api_key: str,
        **kw,
    ):
        """Streaming Claude chat completion via Server-Sent Events.

        Yields token delta strings as they arrive from the Anthropic streaming
        endpoint.

        Args:
            messages: OpenAI-style message list.
            model: Claude model name.
            endpoint: Unused.
            api_key: Anthropic API key.
            **kw: Optional ``temperature``, ``max_tokens``, ``timeout``.

        Yields:
            str: Individual token delta strings.

        Raises:
            RuntimeError: If the API key is missing or the request fails.
        """
        if not api_key:
            raise RuntimeError("Anthropic API key not configured. Add api_key to llm config.")

        system_prompt, conversation = self._split_messages(messages)
        max_tokens = kw.get("max_tokens") or 4096

        payload = {
            "model": model,
            "max_tokens": max_tokens,
            "temperature": kw.get("temperature", 0.7),
            "messages": conversation,
            "stream": True,
        }
        if system_prompt:
            payload["system"] = system_prompt

        try:
            resp = requests.post(
                _ANTHROPIC_URL,
                headers=self._build_headers(api_key),
                json=payload,
                timeout=kw.get("timeout", (10, 300)),
                stream=True,
            )
            resp.raise_for_status()

            for raw_line in resp.iter_lines():
                if not raw_line:
                    continue
                line = raw_line.decode("utf-8") if isinstance(raw_line, bytes) else raw_line

                if line.startswith("data: "):
                    payload_str = line[6:]
                    if payload_str.strip() in ("[DONE]", ""):
                        continue
                    try:
                        chunk = json.loads(payload_str)
                        # Anthropic SSE event types: content_block_delta, message_delta, etc.
                        if chunk.get("type") == "content_block_delta":
                            delta = chunk.get("delta", {}).get("text", "")
                            if delta:
                                yield delta
                    except json.JSONDecodeError:
                        continue

        except Exception as exc:
            raise RuntimeError(f"Claude streaming error: {exc}") from exc
