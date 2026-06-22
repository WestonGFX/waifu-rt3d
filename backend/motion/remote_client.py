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
import base64
import hashlib
import logging
import time
from pathlib import Path
from typing import Any

import httpx

logger = logging.getLogger(__name__)

# Repo root (…/backend/motion/remote_client.py → parents[2]).
_ROOT = Path(__file__).resolve().parents[2]
# Where Mac-converted DART clips land; served by the main app at /files/… .
_DART_GEN_DIR = _ROOT / "backend" / "storage" / "animations" / "dart-generated"
_DART_GEN_URL_BASE = "/files/animations/dart-generated"

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


def _safe_stem(name: str) -> str:
    """Reduce an arbitrary clip name to a filesystem-safe stem.

    Args:
        name: Box-supplied clip name / label.

    Returns:
        Lowercased stem with non-alphanumerics collapsed to underscores;
        ``"clip"`` if nothing survives.
    """
    keep = "".join(c if c.isalnum() else "_" for c in (name or "").lower())
    stem = "_".join(filter(None, keep.split("_")))
    return stem or "clip"


def _convert_clip_npz_to_glb(npz_b64: str, name: str) -> str:
    """Decode a DART npz clip artifact and convert it to a normalized-VRM GLB.

    Implements transport A2 (Phase-3 design): the box returns the SMPL-X npz; the
    Mac runs :func:`tools.dart_to_glb.convert_file` and serves the GLB locally.
    The output filename embeds a content hash so identical motions dedupe and
    distinct ones never collide.

    Args:
        npz_b64: Base64-encoded ``sample_0_smplx.npz`` bytes from the box.
        name: Clip name/label (used for a human-readable filename prefix).

    Returns:
        The ``/files`` URL the viewer can load the converted GLB from.

    Raises:
        ValueError: If the base64 payload is empty/undecodable.
        Exception: Propagates any conversion error from ``dart_to_glb``.
    """
    raw = base64.b64decode(npz_b64)
    if not raw:
        raise ValueError("empty npz payload")
    digest = hashlib.sha1(raw).hexdigest()[:8]
    stem = f"{_safe_stem(name)}_{digest}"
    _DART_GEN_DIR.mkdir(parents=True, exist_ok=True)
    glb_path = _DART_GEN_DIR / f"{stem}.glb"
    url = f"{_DART_GEN_URL_BASE}/{stem}.glb"
    if glb_path.exists():
        return url   # already converted this exact motion — reuse

    npz_path = _DART_GEN_DIR / f"{stem}.npz"
    npz_path.write_bytes(raw)
    try:
        from tools.dart_to_glb import convert_file  # noqa: PLC0415
        convert_file(npz_path, glb_path, face_camera=True, anim_name=stem)
    finally:
        npz_path.unlink(missing_ok=True)   # keep only the GLB
    return url


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

    # Clip artifact (DART): the box ships a normalized-VRM-bound SMPL-X npz; we
    # convert it to a GLB on the Mac and hand the viewer a plain clip URL,
    # collapsing the response to the same {kind:"clip", format:"glb", url, …}
    # the frontend's loadAnimation path consumes (transport A2). On any
    # conversion failure we surface it to the caller, which falls back to the
    # local procedural generator.
    if data.get("kind") == "clip" and data.get("format") == "npz":
        npz_b64 = data.get("npz_b64") or ""
        name = data.get("name") or data.get("prompt") or "clip"
        url = await asyncio.get_event_loop().run_in_executor(
            None, _convert_clip_npz_to_glb, npz_b64, name
        )
        data = {
            "kind":       "clip",
            "format":     "glb",
            "url":        url,
            "name":       _safe_stem(name),
            "backend":    data.get("backend", "dart"),
            "duration":   data.get("duration"),
            "loop":       data.get("loop", False),
            "prompt":     data.get("prompt"),
            "latency_ms": data.get("latency_ms"),
        }

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
