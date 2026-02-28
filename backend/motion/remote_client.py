"""Async HTTP client that proxies motion-generate requests to a remote GPU server.

When the user has configured a remote motion server URL (stored in app.json as
``motion_remote_url``), :func:`forward_generate` is called instead of running
the local procedural generator.

Connection stats (latency, success rate, backend name) are tracked in
:data:`MOTION_STATS` so the Settings panel can display them without extra
round-trips.
"""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Any

import httpx

logger = logging.getLogger(__name__)

# ─── Live stats — updated by every request, read by /api/motion/stats ────────
MOTION_STATS: dict[str, Any] = {
    "remote_url":          None,      # str | None — currently active remote URL
    "connected":           False,     # bool
    "last_check_ts":       0.0,       # epoch float
    "last_latency_ms":     None,      # float | None — last successful round-trip
    "avg_latency_ms":      None,      # float | None — rolling average (last 20)
    "requests_total":      0,         # int — total proxied requests
    "requests_ok":         0,         # int — successful
    "requests_failed":     0,         # int — failed / timed-out
    "backend_name":        None,      # str | None — e.g. "procedural", "motionlcm"
    "_latency_window":     [],        # internal: last 20 latency samples
}

_CONNECT_TIMEOUT = 3.0    # seconds to wait for TCP handshake
_REQUEST_TIMEOUT = 15.0   # max seconds for full generate call


def _update_latency(ms: float) -> None:
    """Append latency sample and keep rolling window of 20."""
    window: list = MOTION_STATS["_latency_window"]
    window.append(ms)
    if len(window) > 20:
        window.pop(0)
    MOTION_STATS["avg_latency_ms"] = round(sum(window) / len(window), 1)
    MOTION_STATS["last_latency_ms"] = round(ms, 1)


async def probe(url: str) -> dict | None:
    """Ping a motion server's /status endpoint.

    Args:
        url: Base URL of the remote motion server, e.g. ``"http://192.168.1.5:8081"``.

    Returns:
        Status dict from the server, or None if unreachable.

    Example:
        >>> info = await probe("http://192.168.1.5:8081")
        >>> print(info["backend"])   # "procedural" | "motionlcm" | etc.
    """
    try:
        async with httpx.AsyncClient(timeout=_CONNECT_TIMEOUT) as client:
            r = await client.get(f"{url.rstrip('/')}/status")
            if r.status_code == 200:
                return r.json()
    except Exception:   # noqa: BLE001
        pass
    return None


async def forward_generate(remote_url: str, payload: dict) -> dict:
    """Forward a generate request to the remote motion server and return its response.

    Also updates :data:`MOTION_STATS` with latency and success/failure counts.

    Args:
        remote_url: Base URL of the remote server.
        payload: JSON body for ``POST /generate`` (same schema as local endpoint).

    Returns:
        Response dict from the remote server (label, backend, duration, loop, keyframes).

    Raises:
        httpx.HTTPError: If the request fails after the timeout.
    """
    MOTION_STATS["requests_total"] += 1
    t0 = time.monotonic()

    try:
        async with httpx.AsyncClient(timeout=_REQUEST_TIMEOUT) as client:
            r = await client.post(
                f"{remote_url.rstrip('/')}/generate",
                json=payload,
            )
            r.raise_for_status()
            data = r.json()
    except Exception as exc:
        MOTION_STATS["requests_failed"] += 1
        MOTION_STATS["connected"] = False
        logger.warning("Remote motion request failed: %s", exc)
        raise

    elapsed_ms = (time.monotonic() - t0) * 1000
    _update_latency(elapsed_ms)
    MOTION_STATS["requests_ok"] += 1
    MOTION_STATS["connected"]   = True
    MOTION_STATS["backend_name"] = data.get("backend")
    MOTION_STATS["last_check_ts"] = time.time()

    return data


async def connect_and_verify(url: str) -> dict:
    """Probe a URL, update global stats, and return a user-friendly status dict.

    Args:
        url: Full base URL to test, e.g. ``"http://192.168.1.5:8081"``.

    Returns:
        ``{"ok": bool, "url": str, "backend": str|None, "message": str}``
    """
    info = await probe(url)
    if info is None:
        MOTION_STATS["connected"] = False
        return {
            "ok":      False,
            "url":     url,
            "backend": None,
            "message": f"Could not reach {url} — is the motion server running?",
        }

    MOTION_STATS["remote_url"]   = url
    MOTION_STATS["connected"]    = True
    MOTION_STATS["backend_name"] = info.get("backend", "procedural")
    MOTION_STATS["last_check_ts"] = time.time()
    return {
        "ok":      True,
        "url":     url,
        "backend": info.get("backend"),
        "message": f"Connected to motion server at {url}",
    }
