"""Anthropic Claude API adapter.

Supports all Claude models via the Anthropic Messages API, including streaming
and native tool use (function calling).

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

Uses raw HTTP requests against ``api.anthropic.com`` — no SDK dependency.
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

    Supports streaming, non-streaming, and native tool use.  When tools
    are passed via ``chat_stream(..., tools=[...])``, the adapter sends
    them as Anthropic-format tool definitions and parses ``tool_use``
    content blocks from the response stream.

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

    def supports_tools(self) -> bool:
        """Anthropic Claude API supports native tool use."""
        return True

    def native_tools_guaranteed(self) -> bool:
        """Claude always respects the tools parameter — no XML fallback needed."""
        return True

    def supports_vision(self) -> bool:
        """Claude supports vision via image content blocks."""
        return True

    # ------------------------------------------------------------------ #
    # Internal helpers
    # ------------------------------------------------------------------ #

    def _split_messages(self, messages: list, cache_breakpoints: list[int] | None = None) -> tuple:
        """Separate the system prompt and convert to Anthropic message format.

        The Anthropic API requires:
        - System prompt as a top-level ``system`` field (not in messages)
        - Tool calls as ``tool_use`` content blocks on the assistant turn
        - Tool results as ``tool_result`` content blocks on a ``user`` turn

        When ``cache_breakpoints`` are provided, the system prompt is returned
        as a list of content blocks with ``cache_control`` on the last block
        (for Anthropic prompt caching).

        Args:
            messages: OpenAI-style list including possible ``role=system``,
                ``role=tool``, and ``tool_calls`` on assistant messages.
            cache_breakpoints: Optional list of message indices that mark
                cache boundaries.  When provided, system text is returned as
                content blocks with ``cache_control: {"type": "ephemeral"}``.

        Returns:
            ``(system_prompt, conversation_messages)`` where system_prompt is
            either a string (no caching) or a list of content blocks (caching).
        """
        system_parts = []
        conversation = []
        use_cache_blocks = bool(cache_breakpoints)

        for m in messages:
            role = m.get("role", "")

            if role == "system":
                system_parts.append(m["content"])

            elif role == "assistant" and m.get("tool_calls"):
                # Convert OpenAI tool_calls to Anthropic content blocks
                content_blocks = []
                text = m.get("content")
                if text:
                    content_blocks.append({"type": "text", "text": text})
                for tc in m["tool_calls"]:
                    func = tc.get("function", {})
                    args_str = func.get("arguments", "{}")
                    try:
                        input_data = json.loads(args_str) if isinstance(args_str, str) else args_str
                    except (json.JSONDecodeError, ValueError):
                        input_data = {}
                    content_blocks.append({
                        "type": "tool_use",
                        "id": tc.get("id", ""),
                        "name": func.get("name", ""),
                        "input": input_data,
                    })
                conversation.append({"role": "assistant", "content": content_blocks})

            elif role == "tool":
                # Convert OpenAI tool result to Anthropic tool_result block.
                # Anthropic expects tool results on a "user" turn.
                tool_result_block = {
                    "type": "tool_result",
                    "tool_use_id": m.get("tool_call_id", ""),
                    "content": m.get("content", ""),
                }
                # Check if previous message is already a user turn with tool_result
                # blocks — if so, append to it (Anthropic allows multiple results
                # on one user turn).
                if (conversation and conversation[-1].get("role") == "user"
                        and isinstance(conversation[-1].get("content"), list)):
                    conversation[-1]["content"].append(tool_result_block)
                else:
                    conversation.append({"role": "user", "content": [tool_result_block]})

            else:
                conversation.append(m)

        if use_cache_blocks and system_parts:
            # Return as content block array with cache_control on the last block
            blocks = []
            for i, part in enumerate(system_parts):
                block = {"type": "text", "text": part}
                if i == len(system_parts) - 1:
                    block["cache_control"] = {"type": "ephemeral"}
                blocks.append(block)
            return blocks, conversation

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

    @staticmethod
    def _convert_tools_to_anthropic(tools: list[dict]) -> list[dict]:
        """Convert OpenAI function-calling tool schemas to Anthropic format.

        OpenAI format::

            {"type": "function", "function": {"name": "...", "description": "...",
             "parameters": {...}}}

        Anthropic format::

            {"name": "...", "description": "...", "input_schema": {...}}

        Args:
            tools: List of OpenAI-format tool schemas.

        Returns:
            List of Anthropic-format tool definitions.
        """
        result = []
        for t in tools:
            func = t.get("function", t)
            result.append({
                "name": func["name"],
                "description": func.get("description", ""),
                "input_schema": func.get("parameters", {"type": "object", "properties": {}}),
            })
        return result

    # ------------------------------------------------------------------ #
    # Public interface
    # ------------------------------------------------------------------ #

    def image_chat(
        self,
        messages: list,
        images: list[dict],
        model: str,
        endpoint: str,
        api_key: str,
        **kw,
    ) -> dict:
        """Claude chat completion with vision (image content blocks).

        Injects base64 images into the last user message as Anthropic-format
        image content blocks alongside the text.

        Args:
            messages: OpenAI-style message list.
            images: List of ``{"data": "base64...", "media_type": "image/jpeg"}`` dicts.
            model: Claude model name (must support vision, e.g. ``claude-sonnet-4-6``).
            endpoint: Unused (Anthropic endpoint is fixed).
            api_key: Anthropic API key.
            **kw: Passed through to ``chat()``.

        Returns:
            Same shape as ``chat()``.

        Example:
            >>> adapter = ClaudeAPIAdapter()
            >>> result = adapter.image_chat(
            ...     messages=[{"role": "user", "content": "Describe this game screen"}],
            ...     images=[{"data": "/9j/4AAQ...", "media_type": "image/jpeg"}],
            ...     model="claude-sonnet-4-6", endpoint="", api_key="sk-ant-...",
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
                # Build multi-content block: images first, then text
                content_blocks = []
                for img in images:
                    content_blocks.append({
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": img.get("media_type", "image/jpeg"),
                            "data": img["data"],
                        },
                    })
                content_blocks.append({
                    "type": "text",
                    "text": m.get("content", ""),
                })
                enriched.append({"role": "user", "content": content_blocks})
            else:
                enriched.append(m)

        return self.chat(enriched, model, endpoint, api_key, **kw)

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
            **kw: Optional ``temperature``, ``max_tokens``, ``timeout``,
                ``cache_breakpoints`` (list of int indices for prompt caching).

        Returns:
            ``{"ok": True, "reply": str, "raw": dict}`` on success,
            ``{"ok": False, "error": str, "code": str}`` on failure.
        """
        if not api_key:
            return {"ok": False, "error": "Anthropic API key not configured. Add api_key to llm config.", "code": "ERR_NO_KEY"}

        cache_breakpoints = kw.pop("cache_breakpoints", None)
        system_prompt, conversation = self._split_messages(messages, cache_breakpoints)
        max_tokens = kw.get("max_tokens") or 4096

        payload = {
            "model": model,
            "max_tokens": max_tokens,
            "temperature": kw.get("temperature", 0.7),
            "messages": conversation,
        }
        if system_prompt:
            payload["system"] = system_prompt

        headers = self._build_headers(api_key)
        if cache_breakpoints:
            headers["anthropic-beta"] = "prompt-caching-2024-07-31"

        try:
            r = requests.post(
                _ANTHROPIC_URL,
                headers=headers,
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

        Yields token delta strings as they arrive.  When tools are provided
        via ``kw["tools"]``, the adapter sends them as Anthropic-format tool
        definitions and parses ``tool_use`` content blocks from the stream,
        yielding ``{"type": "tool_call", ...}`` dicts for each invocation.

        Args:
            messages: OpenAI-style message list.
            model: Claude model name.
            endpoint: Unused.
            api_key: Anthropic API key.
            **kw: Optional ``temperature``, ``max_tokens``, ``timeout``,
                ``tools`` (list of OpenAI-format tool schemas).

        Yields:
            str: Individual token delta strings.
            dict: Tool call dicts with ``{"type": "tool_call", "id": str,
                "function": {"name": str, "arguments": str}}`` when the
                model invokes a tool.

        Raises:
            RuntimeError: If the API key is missing or the request fails.
        """
        if not api_key:
            raise RuntimeError("Anthropic API key not configured. Add api_key to llm config.")

        cache_breakpoints = kw.pop("cache_breakpoints", None)
        system_prompt, conversation = self._split_messages(messages, cache_breakpoints)
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

        # Add tools if provided (convert from OpenAI to Anthropic format)
        tools = kw.get("tools")
        if tools:
            payload["tools"] = self._convert_tools_to_anthropic(tools)

        headers = self._build_headers(api_key)
        if cache_breakpoints:
            headers["anthropic-beta"] = "prompt-caching-2024-07-31"

        try:
            resp = requests.post(
                _ANTHROPIC_URL,
                headers=headers,
                json=payload,
                timeout=kw.get("timeout", (10, 300)),
                stream=True,
            )
            resp.raise_for_status()

            # Track tool_use content blocks as they stream in.
            # Anthropic streams tool calls as:
            #   content_block_start  → {type: "tool_use", id, name}
            #   content_block_delta  → {type: "input_json_delta", partial_json: "..."}
            #   content_block_stop   → block complete, emit the accumulated call
            current_tool_id = None
            current_tool_name = None
            current_tool_json_parts: list[str] = []

            for raw_line in resp.iter_lines():
                if not raw_line:
                    continue
                line = raw_line.decode("utf-8") if isinstance(raw_line, bytes) else raw_line

                if not line.startswith("data: "):
                    continue

                payload_str = line[6:]
                if payload_str.strip() in ("[DONE]", ""):
                    continue

                try:
                    chunk = json.loads(payload_str)
                except json.JSONDecodeError:
                    continue

                event_type = chunk.get("type", "")

                if event_type == "content_block_start":
                    block = chunk.get("content_block", {})
                    if block.get("type") == "tool_use":
                        # Start accumulating a new tool call
                        current_tool_id = block.get("id", "")
                        current_tool_name = block.get("name", "")
                        current_tool_json_parts = []

                elif event_type == "content_block_delta":
                    delta = chunk.get("delta", {})
                    delta_type = delta.get("type", "")

                    if delta_type == "text_delta":
                        text = delta.get("text", "")
                        if text:
                            yield text

                    elif delta_type == "input_json_delta":
                        # Accumulate partial JSON for the current tool call
                        partial = delta.get("partial_json", "")
                        if partial:
                            current_tool_json_parts.append(partial)

                elif event_type == "content_block_stop":
                    # If we were accumulating a tool call, emit it now
                    if current_tool_id is not None:
                        full_json = "".join(current_tool_json_parts)
                        yield {
                            "type": "tool_call",
                            "id": current_tool_id,
                            "function": {
                                "name": current_tool_name,
                                "arguments": full_json or "{}",
                            },
                        }
                        current_tool_id = None
                        current_tool_name = None
                        current_tool_json_parts = []

        except Exception as exc:
            raise RuntimeError(f"Claude streaming error: {exc}") from exc
