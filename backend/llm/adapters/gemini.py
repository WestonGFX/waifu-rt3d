"""Google Gemini LLM adapter.

Supports Gemini Flash / Pro / 2.5 via **two routes**:

1. **OpenAI-compatible endpoint** (recommended, zero extra dependencies):
   ``https://generativelanguage.googleapis.com/v1beta/openai/``
   Works identically to ``OpenAICompatAdapter`` — just point the endpoint there
   with your Google API key.

2. **Native SDK** (optional, richer feature set):
   Requires ``pip install google-generativeai``.
   Used automatically when the OpenAI-compat route returns an error or when
   the config explicitly sets ``"use_native_sdk": true``.

Configuration example (``app.json``)::

    {
      "llm": {
        "provider": "gemini",
        "model": "gemini-2.0-flash",
        "api_key": "AIza...",
        "endpoint": "https://generativelanguage.googleapis.com/v1beta/openai",
        "temperature": 0.7
      }
    }

Supported models (as of early 2026):
    gemini-2.5-flash-preview, gemini-2.0-flash, gemini-1.5-pro,
    gemini-1.5-flash, gemini-1.0-pro
"""
import json
import logging
import requests

from .base import LLMAdapter

logger = logging.getLogger("waifu.llm.gemini")

# Google AI — OpenAI-compatible base URL (no trailing slash needed)
_COMPAT_BASE = "https://generativelanguage.googleapis.com/v1beta/openai"


class GeminiAdapter(LLMAdapter):
    """LLM adapter for Google Gemini models.

    Wraps the Google Generative Language API using the OpenAI-compatible
    endpoint, with automatic fallback to the native ``google-generativeai``
    SDK if the dependency is installed.

    Example:
        >>> adapter = GeminiAdapter()
        >>> result = adapter.chat(
        ...     messages=[{"role": "user", "content": "Hello!"}],
        ...     model="gemini-2.0-flash",
        ...     endpoint="https://generativelanguage.googleapis.com/v1beta/openai",
        ...     api_key="AIza...",
        ... )
        >>> result["ok"]
        True
    """

    def supports_vision(self) -> bool:
        """Gemini models support vision via both compat and native routes."""
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
        """Gemini chat with vision via the OpenAI-compat image_url format.

        Uses the same ``image_url`` content block format as
        ``OpenAICompatAdapter`` since Google's compat endpoint supports it.

        Args:
            messages: OpenAI-style message list.
            images: List of ``{"data": "base64...", "media_type": "image/jpeg"}`` dicts.
            model: Gemini model name.
            endpoint: API base URL.
            api_key: Google AI API key.
            **kw: Passed through to ``chat()``.

        Returns:
            Same shape as ``chat()``.
        """
        if not images:
            return self.chat(messages, model, endpoint, api_key, **kw)

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

    # ------------------------------------------------------------------ #
    # Internal helpers
    # ------------------------------------------------------------------ #

    def _openai_compat_chat(
        self,
        messages: list,
        model: str,
        endpoint: str,
        api_key: str,
        stream: bool = False,
        **kw,
    ):
        """Call Gemini via the OpenAI-compatible /chat/completions route.

        Args:
            messages: OpenAI-style message list.
            model: Gemini model name (e.g. ``"gemini-2.0-flash"``).
            endpoint: Base URL (defaults to Google AI compat base).
            api_key: Google AI API key.
            stream: Whether to request SSE token streaming.
            **kw: Optional temperature, max_tokens, timeout.

        Returns:
            For non-streaming: ``{"ok": bool, "reply": str, "raw": dict}``
            For streaming: yields raw ``requests.Response`` chunk strings.
        """
        base = (endpoint or _COMPAT_BASE).rstrip("/")
        url = f"{base}/chat/completions"
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        }
        payload = {
            "model": model,
            "messages": messages,
            "temperature": kw.get("temperature", 0.7),
            "stream": stream,
        }
        max_tokens = kw.get("max_tokens")
        if max_tokens and max_tokens > 0:
            payload["max_tokens"] = max_tokens

        timeout = kw.get("timeout", (10, 300))

        if stream:
            return requests.post(url, headers=headers, json=payload, timeout=timeout, stream=True)

        try:
            r = requests.post(url, headers=headers, json=payload, timeout=timeout)
            if r.status_code != 200:
                return {"ok": False, "error": f"Gemini API {r.status_code}: {r.text}", "code": "ERR_API_FAIL"}
            data = r.json()
            reply = data.get("choices", [{}])[0].get("message", {}).get("content", "")
            return {"ok": True, "reply": reply, "raw": data}
        except Exception as exc:
            return {"ok": False, "error": str(exc), "code": "ERR_NETWORK"}

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
        """Non-streaming Gemini chat completion.

        Args:
            messages: OpenAI-style list of ``{"role": str, "content": str}`` dicts.
            model: Gemini model name (e.g. ``"gemini-2.0-flash"``).
            endpoint: API base URL.  Defaults to Google AI OpenAI-compat endpoint.
            api_key: Google AI API key (required).
            **kw: Optional ``temperature``, ``max_tokens``, ``timeout``.

        Returns:
            ``{"ok": True, "reply": str, "raw": dict}`` on success,
            ``{"ok": False, "error": str, "code": str}`` on failure.
        """
        if not api_key:
            return {"ok": False, "error": "Google API key not configured. Add api_key to llm config.", "code": "ERR_NO_KEY"}

        result = self._openai_compat_chat(messages, model, endpoint, api_key, stream=False, **kw)
        if not result.get("ok"):
            logger.warning("Gemini compat route failed: %s — trying native SDK", result.get("error"))
            return self._native_chat(messages, model, api_key, **kw)
        return result

    def chat_stream(
        self,
        messages: list,
        model: str,
        endpoint: str,
        api_key: str,
        **kw,
    ):
        """Streaming Gemini chat completion.

        Yields token delta strings as they arrive via SSE.  Falls back to
        the native SDK generator if the compat route fails.

        Args:
            messages: OpenAI-style message list.
            model: Gemini model name.
            endpoint: API base URL.
            api_key: Google AI API key.
            **kw: Optional temperature, max_tokens, timeout.

        Yields:
            str: Individual token delta strings.
        """
        if not api_key:
            raise RuntimeError("Google API key not configured. Add api_key to llm config.")

        try:
            resp = self._openai_compat_chat(messages, model, endpoint, api_key, stream=True, **kw)
            if not isinstance(resp, requests.Response):
                # Returned an error dict — fall through to native
                raise RuntimeError(resp.get("error", "compat route failed"))

            resp.raise_for_status()

            for raw_line in resp.iter_lines():
                if not raw_line:
                    continue
                line = raw_line.decode("utf-8") if isinstance(raw_line, bytes) else raw_line
                if not line.startswith("data: "):
                    continue
                payload = line[6:]
                if payload.strip() == "[DONE]":
                    break
                try:
                    chunk = json.loads(payload)
                    delta = chunk.get("choices", [{}])[0].get("delta", {}).get("content", "")
                    if delta:
                        yield delta
                except json.JSONDecodeError:
                    continue

        except Exception as exc:
            logger.warning("Gemini compat stream failed: %s — falling back to native SDK", exc)
            yield from self._native_stream(messages, model, api_key, **kw)

    # ------------------------------------------------------------------ #
    # Native SDK fallback
    # ------------------------------------------------------------------ #

    def _native_chat(self, messages: list, model: str, api_key: str, **kw) -> dict:
        """Chat via the native ``google-generativeai`` SDK.

        Only invoked when the OpenAI-compat route fails.  Requires
        ``pip install google-generativeai``.

        Args:
            messages: OpenAI-style message list.
            model: Gemini model name.
            api_key: Google AI API key.
            **kw: Optional temperature, max_tokens.

        Returns:
            Same shape as ``chat()``.
        """
        try:
            import google.generativeai as genai  # type: ignore
        except ImportError:
            return {
                "ok": False,
                "error": "google-generativeai not installed. Run: pip install google-generativeai",
                "code": "ERR_MISSING_DEP",
            }

        genai.configure(api_key=api_key)
        gen_cfg = genai.GenerationConfig(
            temperature=kw.get("temperature", 0.7),
            max_output_tokens=kw.get("max_tokens") or None,
        )

        # Extract system prompt (last system message or first)
        system_parts = [m["content"] for m in messages if m["role"] == "system"]
        history = [m for m in messages if m["role"] != "system"]

        gemini_model = genai.GenerativeModel(
            model_name=model,
            system_instruction="\n".join(system_parts) if system_parts else None,
        )

        # Convert to Gemini history format
        gemini_history = []
        for m in history[:-1]:
            role = "user" if m["role"] == "user" else "model"
            gemini_history.append({"role": role, "parts": [m["content"]]})

        chat = gemini_model.start_chat(history=gemini_history)
        last_user = history[-1]["content"] if history else ""

        try:
            response = chat.send_message(last_user, generation_config=gen_cfg)
            return {"ok": True, "reply": response.text, "raw": {}}
        except Exception as exc:
            return {"ok": False, "error": str(exc), "code": "ERR_NATIVE"}

    def _native_stream(self, messages: list, model: str, api_key: str, **kw):
        """Streaming via native SDK.

        Args:
            messages: OpenAI-style message list.
            model: Gemini model name.
            api_key: Google AI API key.
            **kw: Optional temperature, max_tokens.

        Yields:
            str: Token delta strings.
        """
        try:
            import google.generativeai as genai  # type: ignore
        except ImportError:
            raise RuntimeError("google-generativeai not installed. Run: pip install google-generativeai")

        genai.configure(api_key=api_key)
        system_parts = [m["content"] for m in messages if m["role"] == "system"]
        history = [m for m in messages if m["role"] != "system"]

        gemini_model = genai.GenerativeModel(
            model_name=model,
            system_instruction="\n".join(system_parts) if system_parts else None,
        )

        gemini_history = []
        for m in history[:-1]:
            role = "user" if m["role"] == "user" else "model"
            gemini_history.append({"role": role, "parts": [m["content"]]})

        chat = gemini_model.start_chat(history=gemini_history)
        last_user = history[-1]["content"] if history else ""

        gen_cfg = genai.GenerationConfig(temperature=kw.get("temperature", 0.7))
        response = chat.send_message(last_user, stream=True, generation_config=gen_cfg)

        for chunk in response:
            if chunk.text:
                yield chunk.text
