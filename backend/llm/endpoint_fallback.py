"""Smart LLM endpoint fallback — tries multiple local endpoints when primary fails.

Probes common local LLM server endpoints (LM Studio, Ollama, text-generation-webui,
etc.) to find a working one when the configured primary endpoint is unreachable.
Caches successful probes for the session lifetime to avoid repeated discovery
overhead.

The module is intentionally stdlib-only (urllib.request, json, time, logging) so
it can be imported without any optional dependencies.

Usage::

    from backend.llm.endpoint_fallback import resolve_endpoint

    endpoint, model, api_key = resolve_endpoint(cfg)
    # Returns the first working (endpoint, model, api_key) tuple
"""

from __future__ import annotations

import json
import logging
import threading
import time
import urllib.error
import urllib.request
from typing import Optional

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Module-level cache
# ---------------------------------------------------------------------------

# key -> (endpoint, model, api_key, timestamp)
_endpoint_cache: dict[str, tuple[str, str, str, float]] = {}
_cache_lock = threading.Lock()

# How long a cached result is considered fresh (seconds).
_CACHE_TTL: float = 60.0

# ---------------------------------------------------------------------------
# Candidate fallback endpoints probed in priority order.
# Port 8080 is omitted here because it may be our own FastAPI server; it is
# added dynamically only when it differs from the configured server port.
# ---------------------------------------------------------------------------
_FALLBACK_CANDIDATES: list[tuple[str, str]] = [
    ("http://localhost:11434/v1", "ollama"),
    ("http://localhost:1234/v1", "lm-studio"),
    ("http://localhost:5001/v1", "not-needed"),   # text-generation-webui
    ("http://localhost:8000/v1", "not-needed"),   # vLLM default
]

# Model name substrings checked in preference order (after exact-match attempt).
_MODEL_PREFERENCE: list[str] = ["qwen", "llama", "mistral"]


# ---------------------------------------------------------------------------
# Public error class
# ---------------------------------------------------------------------------


class NoLLMAvailableError(Exception):
    """Raised when no LLM endpoint could be reached after trying all candidates.

    Attributes:
        tried_endpoints: List of endpoint URLs that were attempted.
    """

    def __init__(self, tried_endpoints: list[str]) -> None:
        """Initialise with the list of endpoints that were attempted.

        Args:
            tried_endpoints: URL strings that were probed and failed.
        """
        self.tried_endpoints: list[str] = tried_endpoints
        super().__init__(
            f"No LLM endpoint available. Tried: {', '.join(tried_endpoints)}"
        )


# ---------------------------------------------------------------------------
# Public helpers
# ---------------------------------------------------------------------------


def probe_endpoint(url: str, timeout: float = 2.0) -> Optional[list[str]]:
    """Probe a single endpoint's ``/v1/models`` and return its model list.

    Uses only ``urllib.request`` so there are no external dependencies.

    Args:
        url: Base URL including ``/v1`` path (e.g. ``"http://localhost:1234/v1"``).
        timeout: HTTP request timeout in seconds.

    Returns:
        List of model ID strings if the endpoint is reachable and returns a
        valid response, or ``None`` if the endpoint is unreachable / returns
        an error.

    Example:
        >>> models = probe_endpoint("http://localhost:11434/v1")
        >>> if models is not None:
        ...     print(models)  # ['llama3.2:3b', 'qwen2.5:14b']
    """
    models_url = url.rstrip("/") + "/models"
    try:
        req = urllib.request.Request(
            models_url,
            headers={"Accept": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            if resp.status != 200:
                return None
            raw = resp.read().decode("utf-8", errors="replace")
    except (urllib.error.URLError, OSError, TimeoutError):
        # Connection refused, DNS failure, or timeout — endpoint not running.
        return None
    except Exception as exc:  # noqa: BLE001
        logger.debug("[EndpointFallback] Unexpected error probing %s: %s", url, exc)
        return None

    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        logger.debug("[EndpointFallback] Non-JSON response from %s", url)
        return None

    models: list[str] = []
    for entry in data.get("data", []):
        model_id = entry.get("id", "")
        if model_id:
            models.append(model_id)

    return models


def _pick_model(models: list[str], preferred: str) -> str:
    """Pick the best model from ``models`` using the preference rules.

    Selection priority:
    1. Exact match with ``preferred`` (case-insensitive).
    2. First model whose name contains ``"qwen"``.
    3. First model whose name contains ``"llama"``.
    4. First model whose name contains ``"mistral"``.
    5. First model in the list (fallback).

    Args:
        models: Non-empty list of model ID strings available at an endpoint.
        preferred: The configured preferred model name.

    Returns:
        The chosen model ID.  Returns an empty string only when ``models``
        is empty (callers should guard against that).

    Example:
        >>> _pick_model(["mistral-7b", "qwen2.5:14b"], "gpt-4")
        'qwen2.5:14b'
    """
    if not models:
        return ""

    # 1. Exact match (case-insensitive)
    preferred_lower = preferred.lower()
    for m in models:
        if m.lower() == preferred_lower:
            return m

    # 2-4. Keyword preference
    for keyword in _MODEL_PREFERENCE:
        for m in models:
            if keyword in m.lower():
                return m

    # 5. First available
    return models[0]


def clear_cache() -> None:
    """Clear the endpoint resolution cache.

    Forces the next ``resolve_endpoint`` call to re-probe all candidates
    rather than returning the cached result.  Primarily useful for tests
    and after the user manually changes the configured endpoint.

    Example:
        >>> clear_cache()
        >>> endpoint, model, api_key = resolve_endpoint(cfg)  # fresh probe
    """
    with _cache_lock:
        _endpoint_cache.clear()


def resolve_endpoint(cfg: dict) -> tuple[str, str, str]:
    """Resolve the best available LLM endpoint and model from configuration.

    Algorithm:
    1. Return the cached result if it is fresher than ``_CACHE_TTL`` seconds.
    2. Extract primary ``endpoint``, ``model``, and ``api_key`` from
       ``cfg["llm"]``.
    3. Probe the primary endpoint via ``GET /v1/models`` (2 s timeout).
       a. If reachable and configured model is present → use it.
       b. If reachable but configured model not found → pick the best
          available model at that endpoint.
    4. If the primary endpoint is unreachable, iterate over
       ``_FALLBACK_CANDIDATES`` (plus port 8080 if it is not our server).
    5. For each reachable fallback, pick the best model and return it.
    6. If nothing works, raise ``NoLLMAvailableError``.

    The result is cached under the ``"primary"`` key so repeated calls
    within the same 60-second window are free.

    Args:
        cfg: Application configuration dict.  Must contain an ``"llm"``
            sub-dict with at least ``"endpoint"`` and ``"model"`` keys.

    Returns:
        3-tuple ``(endpoint_url, model_id, api_key)`` for the first working
        endpoint.

    Raises:
        NoLLMAvailableError: When no endpoint could be reached.

    Example:
        >>> endpoint, model, api_key = resolve_endpoint(cfg)
        >>> print(endpoint, model)
        http://localhost:1234/v1 qwen2.5:14b
    """
    cache_key = "primary"

    # Check the cache first
    with _cache_lock:
        cached = _endpoint_cache.get(cache_key)
        if cached is not None:
            ep, mdl, key, ts = cached
            if time.monotonic() - ts < _CACHE_TTL:
                return ep, mdl, key

    llm_cfg = cfg.get("llm", {})
    primary_url: str = llm_cfg.get("endpoint", "http://localhost:11434/v1").rstrip("/")
    preferred_model: str = llm_cfg.get("model", "")
    primary_api_key: str = llm_cfg.get("api_key", "not-needed")

    # Build the candidate list: primary first, then known fallbacks, then
    # optionally port 8080 if it is not our own FastAPI server.
    server_port: int = int(cfg.get("server_port", 8080))
    port_8080_url = "http://localhost:8080/v1"

    candidates: list[tuple[str, str]] = [
        (primary_url, primary_api_key),
    ]
    for url, key in _FALLBACK_CANDIDATES:
        if url != primary_url:
            candidates.append((url, key))

    # Include port 8080 only when our FastAPI is NOT on that port
    if server_port != 8080 and port_8080_url not in {u for u, _ in candidates}:
        candidates.append((port_8080_url, "not-needed"))

    tried: list[str] = []
    primary_failed = False

    for idx, (url, api_key) in enumerate(candidates):
        tried.append(url)
        models = probe_endpoint(url)

        if models is None:
            # Endpoint not reachable
            if idx == 0:
                # Primary failed — log and continue to fallbacks
                logger.info(
                    "[EndpointFallback] Primary endpoint %s unreachable, "
                    "trying fallbacks...",
                    url,
                )
                primary_failed = True
            continue

        # Endpoint is alive — pick the best model
        chosen = _pick_model(models, preferred_model)
        if not chosen:
            # Endpoint responded but has no models loaded — skip
            logger.debug(
                "[EndpointFallback] %s reachable but no models loaded, skipping",
                url,
            )
            continue

        if primary_failed:
            logger.info(
                "[EndpointFallback] Found working endpoint: %s with model %s",
                url,
                chosen,
            )
        elif idx == 0 and chosen != preferred_model:
            logger.info(
                "[EndpointFallback] Primary endpoint reachable but model '%s' "
                "not found; using '%s' instead",
                preferred_model,
                chosen,
            )

        result = (url, chosen, api_key)
        with _cache_lock:
            _endpoint_cache[cache_key] = (*result, time.monotonic())
        return result

    logger.warning(
        "[EndpointFallback] No working LLM endpoint found. Tried: %s",
        ", ".join(tried),
    )
    raise NoLLMAvailableError(tried)


def get_endpoint_status(cfg: dict) -> dict:
    """Return a status snapshot of all candidate endpoints for the API/UI.

    Probes each candidate endpoint individually (parallel probing is not
    done here to keep this synchronous and dependency-free).  Intended for
    display in a settings panel or health-check API endpoint.

    Args:
        cfg: Application configuration dict (same shape as ``resolve_endpoint``).

    Returns:
        Dict with the following keys:

        - ``"primary_endpoint"`` (str): The configured primary URL.
        - ``"primary_reachable"`` (bool): Whether the primary endpoint responded.
        - ``"active_endpoint"`` (str): URL currently in use (may differ if
          a fallback was selected).
        - ``"active_model"`` (str): Model currently in use.
        - ``"fallback_used"`` (bool): Whether a fallback endpoint is active.
        - ``"available_endpoints"`` (list[dict]): Per-endpoint probe results,
          each with ``"url"``, ``"models"``, and ``"reachable"`` keys.

    Example:
        >>> status = get_endpoint_status(cfg)
        >>> status["fallback_used"]
        True
        >>> status["active_model"]
        'qwen2.5:14b'
    """
    llm_cfg = cfg.get("llm", {})
    primary_url: str = llm_cfg.get("endpoint", "http://localhost:11434/v1").rstrip("/")
    preferred_model: str = llm_cfg.get("model", "")
    primary_api_key: str = llm_cfg.get("api_key", "not-needed")

    server_port: int = int(cfg.get("server_port", 8080))
    port_8080_url = "http://localhost:8080/v1"

    # Build the full candidate list (same logic as resolve_endpoint)
    all_candidates: list[tuple[str, str]] = [(primary_url, primary_api_key)]
    for url, key in _FALLBACK_CANDIDATES:
        if url != primary_url:
            all_candidates.append((url, key))
    if server_port != 8080 and port_8080_url not in {u for u, _ in all_candidates}:
        all_candidates.append((port_8080_url, "not-needed"))

    available_endpoints: list[dict] = []
    primary_reachable = False
    active_endpoint = ""
    active_model = ""

    # Check cached resolution first for the active endpoint/model
    with _cache_lock:
        cached = _endpoint_cache.get("primary")
        if cached is not None:
            ep, mdl, _key, ts = cached
            if time.monotonic() - ts < _CACHE_TTL:
                active_endpoint = ep
                active_model = mdl

    for idx, (url, _key) in enumerate(all_candidates):
        models_result = probe_endpoint(url)
        reachable = models_result is not None
        models_list: list[str] = models_result if models_result is not None else []

        if idx == 0 and reachable:
            primary_reachable = True

        available_endpoints.append(
            {
                "url": url,
                "models": models_list,
                "reachable": reachable,
            }
        )

        # If we don't have a cached active endpoint, derive it live
        if not active_endpoint and reachable and models_list:
            chosen = _pick_model(models_list, preferred_model)
            if chosen:
                active_endpoint = url
                active_model = chosen

    fallback_used = bool(active_endpoint) and active_endpoint != primary_url

    return {
        "primary_endpoint": primary_url,
        "primary_reachable": primary_reachable,
        "active_endpoint": active_endpoint,
        "active_model": active_model,
        "fallback_used": fallback_used,
        "available_endpoints": available_endpoints,
    }
