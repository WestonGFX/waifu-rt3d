"""Thin client for LM Studio / Ollama / any OpenAI-compatible local server.

Chat calls go through the app's own :class:`OpenAICompatAdapter` — the same
class ``backend.llm.registry.get_client`` returns for ``provider: openai`` and
``provider: ollama`` — so the benchmark exercises the real request path
(payload shape, reasoning-model ``/no_think`` handling, ``reasoning_content``
fallback).  Both LM Studio (``:1234``) and Ollama (``:11434``) expose the same
``/v1`` interface, so one client covers both.
"""
from __future__ import annotations

import re
import time
from dataclasses import dataclass, field
from typing import Optional

import requests

from backend.llm.adapters.openai_compat import OpenAICompatAdapter

# Names that are never chat models (LM Studio lists embedding models too).
# "tts" only as its own token (kokoro-tts-v1), never inside a longer word.
_NON_CHAT_RE = re.compile(r"embed|rerank|whisper|(?<![a-z])tts(?![a-z])|nomic-bert", re.IGNORECASE)


@dataclass
class ChatResult:
    """Outcome of one chat completion call.

    Attributes:
        ok: HTTP + parse success (False on any transport/API error).
        text: Assistant text (``""`` on failure).
        error: Error string when ``ok`` is False.
        latency_s: Wall-clock seconds for the request.
        prompt_tokens: Server-reported prompt tokens (0 if not reported).
        completion_tokens: Server-reported completion tokens (0 if not reported).
        reasoning_only: True when the server returned only ``reasoning_content``
            (thinking mode ate the output) and the adapter fell back to it.
    """
    ok: bool
    text: str = ""
    error: str = ""
    latency_s: float = 0.0
    prompt_tokens: int = 0
    completion_tokens: int = 0
    reasoning_only: bool = False
    extra: dict = field(default_factory=dict)

    @property
    def tokens_per_s(self) -> float:
        """Completion tokens per second (0.0 when unknown)."""
        if self.latency_s <= 0 or self.completion_tokens <= 0:
            return 0.0
        return self.completion_tokens / self.latency_s


def guess_backend_label(base_url: str) -> str:
    """Label a server by its conventional port (lmstudio / ollama / custom)."""
    from urllib.parse import urlparse  # noqa: PLC0415

    try:
        port = urlparse(base_url if "//" in base_url else "//" + base_url).port
    except ValueError:
        port = None
    return {1234: "lmstudio", 11434: "ollama"}.get(port, "custom")


class BenchClient:
    """Chat + model-discovery against one OpenAI-compatible base URL."""

    def __init__(self, base_url: str, api_key: str = "", timeout: tuple[int, int] = (10, 300)):
        """Create a client.

        Args:
            base_url: e.g. ``http://localhost:1234/v1`` or ``http://localhost:11434``.
            api_key: Optional bearer token (local servers ignore it).
            timeout: ``(connect, read)`` seconds per request.
        """
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.timeout = timeout
        self._adapter = OpenAICompatAdapter()

    def _v1(self) -> str:
        return self.base_url if self.base_url.endswith("/v1") else self.base_url + "/v1"

    def list_models(self, include: Optional[str] = None, exclude: Optional[str] = None) -> list[str]:
        """Return chat-capable model ids the server advertises.

        Args:
            include: Optional regex; keep only matching ids.
            exclude: Optional regex; drop matching ids.

        Returns:
            Sorted model ids (embedding/ASR/TTS models filtered out).

        Raises:
            RuntimeError: If the server cannot be reached.
        """
        try:
            headers = {"Authorization": f"Bearer {self.api_key}"} if self.api_key and not self.api_key.startswith("env:") else {}
            r = requests.get(self._v1() + "/models", headers=headers, timeout=(5, 15))
            r.raise_for_status()
            ids = [m["id"] for m in r.json().get("data", []) if m.get("id")]
        except Exception as e:  # noqa: BLE001
            raise RuntimeError(f"Could not list models at {self._v1()}/models: {e}") from e
        ids = [i for i in ids if not _NON_CHAT_RE.search(i)]
        if include:
            ids = [i for i in ids if re.search(include, i, re.IGNORECASE)]
        if exclude:
            ids = [i for i in ids if not re.search(exclude, i, re.IGNORECASE)]
        return sorted(set(ids))

    def chat(
        self,
        messages: list[dict],
        model: str,
        *,
        temperature: float = 0.8,
        max_tokens: int = 700,
        response_format: Optional[dict] = None,
    ) -> ChatResult:
        """One non-streaming chat completion.

        Args:
            messages: OpenAI-style message list.
            model: Model id exactly as the server lists it.
            temperature: Sampling temperature.
            max_tokens: Completion cap (bounded so a runaway model can't stall a sweep).
            response_format: Optional OpenAI ``response_format`` (``json_schema``)
                forwarded via the adapter's ``extra_body`` passthrough.

        Returns:
            A :class:`ChatResult`; never raises.
        """
        extra = {"response_format": response_format} if response_format else None
        t0 = time.perf_counter()
        res = self._adapter.chat(
            messages, model, self.base_url, self.api_key,
            temperature=temperature, max_tokens=max_tokens,
            extra_body=extra, timeout=self.timeout,
        )
        dt = time.perf_counter() - t0
        if not res.get("ok"):
            return ChatResult(ok=False, error=str(res.get("error", "unknown error")), latency_s=dt)
        raw = res.get("raw") or {}
        usage = raw.get("usage") or {}
        msg = (raw.get("choices") or [{}])[0].get("message") or {}
        reasoning_only = (not (msg.get("content") or "")) and bool(msg.get("reasoning_content"))
        return ChatResult(
            ok=True,
            text=res.get("reply") or "",
            latency_s=dt,
            prompt_tokens=int(usage.get("prompt_tokens") or 0),
            completion_tokens=int(usage.get("completion_tokens") or 0),
            reasoning_only=reasoning_only,
        )
