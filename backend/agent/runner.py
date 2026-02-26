"""Core agentic loop that orchestrates LLM calls and tool execution.

The :class:`AgentRunner` drives multi-round conversations where the LLM
can invoke tools, receive results, and continue generating.  It supports
both native tool-calling (OpenAI/Anthropic-style) and XML-based tool calls
for local models that lack a built-in tool protocol.
"""

from __future__ import annotations

import asyncio
import copy
import inspect
import json
import logging
import time
from typing import Any, AsyncGenerator

from starlette.concurrency import run_in_threadpool

from backend.agent.parser import ToolCallParsed, parse_native_tool_calls, parse_xml_tool_calls
from backend.agent.prompt import render_tool_prompt
from backend.agent.registry import ToolContext, ToolDef, ToolRegistry, ToolResult

logger = logging.getLogger(__name__)


class AgentRunner:
    """Agentic loop that calls the LLM, detects tool calls, executes tools,
    and feeds results back for multi-round conversations.

    The runner operates as an async generator, yielding event dicts as it
    progresses through rounds of LLM inference and tool execution.

    Attributes:
        registry: Registry of tools available for execution.
        max_rounds: Maximum number of tool-call rounds before forcing a stop.

    Example:
        >>> runner = AgentRunner(registry, max_rounds=3)
        >>> async for event in runner.run_stream(messages, adapter, cfg, tools):
        ...     if event["event"] == "token":
        ...         print(event["data"]["text"], end="")
        ...     elif event["event"] == "tool_result":
        ...         print(f"Tool result: {event['data']}")
    """

    def __init__(self, registry: ToolRegistry, max_rounds: int = 3) -> None:
        """Initialise the runner with a tool registry.

        Args:
            registry: Registry containing all available tool definitions.
            max_rounds: Maximum number of LLM-call-then-tool-execute rounds.
                After this many tool calls, the loop breaks even if the LLM
                wants to call more tools.
        """
        self.registry = registry
        self.max_rounds = max_rounds

    async def run_stream(
        self,
        messages: list[dict],
        adapter: Any,
        cfg: dict,
        tools: list[ToolDef],
        context: ToolContext | None = None,
        **llm_kwargs: Any,
    ) -> AsyncGenerator[dict, None]:
        """Run the agentic loop, yielding events as they occur.

        Each event is a dict with ``"event"`` and ``"data"`` keys.

        Event types:
            - ``"token"``: A chunk of text from the LLM.
              ``data: {"text": str}``
            - ``"tool_call"``: The LLM is invoking a tool.
              ``data: {"id": str, "name": str, "args": dict}``
            - ``"tool_result"``: A tool has finished executing.
              ``data: {"id": str, "ok": bool, "display": str, "data": dict,
              "error": str | None, "elapsed": float}``

        Args:
            messages: Conversation history in OpenAI chat format.
            adapter: LLM adapter instance (must have ``chat_stream()`` and
                optionally ``supports_tools()``).
            cfg: Application configuration dict (used for endpoint/model/key).
            tools: List of tool definitions available for this call.
            context: Execution context passed to tool executors.
            **llm_kwargs: Extra keyword arguments forwarded to the adapter's
                ``chat_stream()`` call.

        Yields:
            Event dicts describing tokens, tool calls, and tool results.
        """
        native_mode = hasattr(adapter, "supports_tools") and adapter.supports_tools()
        working_messages = copy.deepcopy(messages)

        # Build OpenAI-format tool schemas for native mode adapters
        tool_schemas = self.registry.get_schemas() if (native_mode and tools) else None

        for round_idx in range(self.max_rounds):
            logger.debug("AgentRunner round %d/%d (native=%s)", round_idx + 1, self.max_rounds, native_mode)

            # In XML mode, inject tool prompt into system message
            if not native_mode and tools:
                call_messages = self._inject_tool_prompt(working_messages, tools)
            else:
                call_messages = working_messages

            # Build kwargs for the adapter, including tool schemas for native mode
            adapter_kwargs = dict(llm_kwargs)
            if native_mode and tool_schemas:
                adapter_kwargs["tools"] = tool_schemas

            # Run the synchronous chat_stream in a threadpool and collect output
            tokens: list[str] = []
            native_tool_calls: list[dict] = []

            stream_iter = await run_in_threadpool(
                adapter.chat_stream,
                call_messages,
                cfg.get("model", ""),
                cfg.get("endpoint", ""),
                cfg.get("api_key", ""),
                **adapter_kwargs,
            )

            # chat_stream returns a sync generator; iterate it in threadpool
            chunks = await run_in_threadpool(list, stream_iter)

            for chunk in chunks:
                if isinstance(chunk, dict) and chunk.get("type") == "tool_call":
                    native_tool_calls.append(chunk)
                elif isinstance(chunk, str):
                    tokens.append(chunk)

            full_text = "".join(tokens)

            # Parse tool calls — native mode with XML fallback for local
            # models that ignore the tools parameter but output XML tags.
            parsed_calls: list[ToolCallParsed] = []
            if native_mode and native_tool_calls:
                parsed_calls = parse_native_tool_calls(native_tool_calls)
            elif native_mode and not native_tool_calls and full_text:
                # Fallback: model was sent tools natively but didn't use the
                # protocol — check if it emitted XML tool calls in its text
                # instead (common with local models via LM Studio/llama.cpp
                # that don't support the OpenAI function-calling spec).
                parsed_calls = parse_xml_tool_calls(full_text)
                if parsed_calls:
                    logger.info("Native tool mode active but model used XML fallback (%d calls)", len(parsed_calls))
            elif not native_mode:
                parsed_calls = parse_xml_tool_calls(full_text)

            # No tool calls found — emit all text as tokens and finish
            if not parsed_calls:
                if full_text:
                    yield {"event": "token", "data": {"text": full_text}}
                break

            # Process tool calls
            for call in parsed_calls:
                # Emit text before the tool call
                if call.text_before:
                    yield {"event": "token", "data": {"text": call.text_before}}

                yield {
                    "event": "tool_call",
                    "data": {
                        "id": call.id,
                        "name": call.name,
                        "args": call.args or {},
                    },
                }

                # Execute the tool
                tool_def = self.registry.get_tool(call.name)
                t0 = time.monotonic()

                if tool_def is None:
                    result = ToolResult(ok=False, error=f"Unknown tool: {call.name}")
                elif call.parse_error:
                    result = ToolResult(ok=False, error=f"Argument parse error: {call.parse_error}")
                else:
                    try:
                        result = await self._execute_tool(tool_def, call.args or {}, context)
                    except Exception as exc:
                        logger.exception("Tool %s raised an exception", call.name)
                        result = ToolResult(ok=False, error=str(exc))

                elapsed = time.monotonic() - t0

                yield {
                    "event": "tool_result",
                    "data": {
                        "id": call.id,
                        "ok": result.ok,
                        "display": result.display,
                        "data": result.data,
                        "error": result.error,
                        "elapsed": round(elapsed, 3),
                    },
                }

                # Append tool call + result to working messages for the next round.
                # Format depends on whether we're in native or XML mode.
                # Use native format only if the model actually used native tool
                # calling (not the XML fallback path).
                result_text = str(result.data) if result.ok else f"ERROR: {result.error}"
                used_native_protocol = native_mode and bool(native_tool_calls)

                if used_native_protocol:
                    # Native mode: use structured assistant/tool messages so the
                    # LLM sees properly formatted tool interactions.
                    self._append_native_tool_turn(
                        working_messages, call, result_text, full_text
                    )
                else:
                    # XML mode: append as plain text user/assistant turns
                    assistant_content = (call.text_before or "") + f"[Called tool: {call.name}]"
                    working_messages.append({"role": "assistant", "content": assistant_content})
                    working_messages.append({
                        "role": "user",
                        "content": f"Tool '{call.name}' returned: {result_text}",
                    })

            # Emit text_after from the last call (if any)
            last_call = parsed_calls[-1]
            if last_call.text_after and last_call.text_after.strip():
                yield {"event": "token", "data": {"text": last_call.text_after}}

        # Loop exhausted without a plain-text reply — that's okay, we just stop

    @staticmethod
    def _append_native_tool_turn(
        messages: list[dict],
        call: ToolCallParsed,
        result_text: str,
        full_text: str,
    ) -> None:
        """Append a native-format tool call + result turn to the message list.

        For providers that support native tool calling (OpenAI, Anthropic),
        the conversation history must include properly structured tool
        messages rather than plain text descriptions of tool usage.

        This uses the OpenAI format (``tool_calls`` on the assistant message,
        ``role: "tool"`` for the result), which both the OpenAI-compat and
        Claude adapters can translate as needed.

        Args:
            messages: Working message list to append to (mutated in place).
            call: The parsed tool call.
            result_text: Stringified tool result or error.
            full_text: Full text output from the LLM (text before tool calls).
        """
        # Assistant message with tool_calls array (OpenAI format)
        messages.append({
            "role": "assistant",
            "content": full_text if full_text.strip() else None,
            "tool_calls": [{
                "id": call.id,
                "type": "function",
                "function": {
                    "name": call.name,
                    "arguments": json.dumps(call.args or {}),
                },
            }],
        })

        # Tool result message
        messages.append({
            "role": "tool",
            "tool_call_id": call.id,
            "content": result_text,
        })

    @staticmethod
    async def _execute_tool(
        tool_def: ToolDef,
        args: dict,
        context: ToolContext | None,
    ) -> ToolResult:
        """Execute a tool, handling both sync and async executors.

        Args:
            tool_def: The tool definition containing the executor callable.
            args: Parsed arguments to pass to the executor.
            context: Execution context for the tool.

        Returns:
            The tool's result.
        """
        if inspect.iscoroutinefunction(tool_def.execute):
            return await tool_def.execute(args, context)
        else:
            return await run_in_threadpool(tool_def.execute, args, context)

    @staticmethod
    def _inject_tool_prompt(
        messages: list[dict],
        tools: list[ToolDef],
    ) -> list[dict]:
        """Clone messages and append the XML tool prompt to the system message.

        If no system message exists, one is prepended.

        Args:
            messages: Original conversation messages (not mutated).
            tools: Tool definitions to render into the prompt.

        Returns:
            A new messages list with the tool prompt injected.
        """
        cloned = copy.deepcopy(messages)
        tool_block = render_tool_prompt(tools)

        if not tool_block:
            return cloned

        # Find existing system message and append
        for msg in cloned:
            if msg.get("role") == "system":
                msg["content"] = msg.get("content", "") + "\n\n" + tool_block
                return cloned

        # No system message found — prepend one
        cloned.insert(0, {"role": "system", "content": tool_block})
        return cloned
