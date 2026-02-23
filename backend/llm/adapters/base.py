class LLMAdapter:
    def chat(self, messages, model, endpoint, api_key, **kw):
        raise NotImplementedError

    def supports_tools(self) -> bool:
        """Whether this adapter supports native function/tool calling.

        Returns:
            False by default. Override in subclasses that support tools.
        """
        return False

    def chat_stream(self, messages, model, endpoint, api_key, **kw):
        """
        Streaming variant of chat(). Yields token delta strings as they arrive.
        Subclasses that support streaming should override this.
        Falls back to non-streaming chat() if not overridden.

        Yields:
            str: Individual token deltas from the LLM response
        """
        # Default fallback: call non-streaming and yield full response
        result = self.chat(messages, model, endpoint, api_key, **kw)
        if result.get("ok"):
            yield result["reply"]
        else:
            raise RuntimeError(result.get("error", "LLM adapter error"))
