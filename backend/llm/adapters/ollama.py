"""Ollama LLM adapter.

Delegates entirely to :class:`OpenAICompatAdapter` using Ollama's built-in
OpenAI-compatible ``/v1/chat/completions`` endpoint, which supports streaming,
tool calling, and all standard sampling parameters.

The native ``/api/chat`` route is **not** used here because it lacks tool
calling support and requires a different streaming format.  Since Ollama 0.1.24
the ``/v1`` path is the canonical way to consume Ollama from any OpenAI client.

Usage:
    Set ``llm.provider = "ollama"`` and ``llm.endpoint = "http://localhost:11434/v1"``
    in ``backend/config/app.json``.  The ``get_client()`` factory in
    ``backend/llm/registry.py`` will return this adapter automatically.

Example:
    >>> adapter = OllamaAdapter()
    >>> for token in adapter.chat_stream(
    ...     messages=[{"role": "user", "content": "Hi"}],
    ...     model="llama3.2", endpoint="http://localhost:11434", api_key="",
    ... ):
    ...     print(token, end="")
"""
from .openai_compat import OpenAICompatAdapter


class OllamaAdapter(OpenAICompatAdapter):
    """LLM adapter for local Ollama installations.

    Extends :class:`OpenAICompatAdapter` with no overrides — Ollama's
    ``/v1/chat/completions`` endpoint is fully OpenAI-compatible.
    Supports streaming, tool calling, and vision (for multimodal models).

    Default endpoint: ``http://localhost:11434``
    API key: not required (pass any non-empty string or leave blank)
    """
