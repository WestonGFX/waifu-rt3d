class LLMAdapter:
    """Base class for all LLM adapters.

    Subclasses must implement ``chat()`` and optionally ``chat_stream()``.
    Tool-capable adapters should override ``supports_tools()`` and
    ``native_tools_guaranteed()``.
    """

    def chat(self, messages, model, endpoint, api_key, **kw):
        raise NotImplementedError

    def supports_tools(self) -> bool:
        """Whether this adapter supports native function/tool calling.

        Returns:
            False by default. Override in subclasses that support tools.
        """
        return False

    def native_tools_guaranteed(self) -> bool:
        """Whether the model behind this adapter reliably uses native tool calling.

        Returns True for cloud APIs (Claude, OpenAI) where the model always
        respects the ``tools`` parameter.  Returns False for local/generic
        adapters (LM Studio, llama.cpp) where the loaded model may or may
        not support the function-calling protocol.

        When False, the agent runner injects XML tool descriptions as a
        fallback alongside the native ``tools`` parameter, ensuring tools
        work even if the model ignores the native protocol.

        Returns:
            False by default. Override in cloud-API adapters that guarantee
            native tool support.
        """
        return False

    def chat_stream(self, messages, model, endpoint, api_key, **kw):
        """Streaming variant of chat(). Yields token delta strings as they arrive.

        Subclasses that support streaming should override this.
        Falls back to non-streaming chat() if not overridden.

        Yields:
            str: Individual token deltas from the LLM response.
        """
        # Default fallback: call non-streaming and yield full response
        result = self.chat(messages, model, endpoint, api_key, **kw)
        if result.get("ok"):
            yield result["reply"]
        else:
            raise RuntimeError(result.get("error", "LLM adapter error"))
