"""Standalone motion inference server — runs on the GPU machine.

This is a SEPARATE, LIGHTWEIGHT server you run on your Windows PC (or any
machine with a CUDA GPU).  The main waifu-rt3d app on your Mac discovers it
automatically over your home WiFi and uses it for AI-generated animations.

Running
-------
Double-click  setup_windows.bat  on your Windows PC.
That script handles everything (Python, packages, firewall, model download).

You can also run it manually in a terminal:
    python -m backend.motion.motion_server

Command-line options
--------------------
--port PORT     Port to listen on (default: 8081).
--host HOST     Host to bind to (default: 0.0.0.0 = all interfaces).
--no-ai         Force procedural-only mode even if AI model is present.

Architecture
------------
  POST /generate  ← main app calls this, same schema as local /api/motion/generate
  GET  /status    ← health check + capability report
  GET  /stats     ← perf stats (latency histogram, GPU util, etc.)
  GET  /models    ← list downloaded AI models

The server always starts immediately using the fast procedural backend.
If an AI model (MotionLCM, MDM, etc.) is present it is loaded in the
background and swapped in automatically — no restart needed.
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import math
import os
import sys
import time
from pathlib import Path
from typing import Any, Optional

# ── Make the project root importable when run as a standalone script ──────────
_HERE = Path(__file__).resolve()
_ROOT = _HERE.parents[2]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from backend.motion.beacon import start_beacon_sender

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("waifu-motion")

# ─── Paths ────────────────────────────────────────────────────────────────────
MODELS_DIR = _ROOT / "models" / "motion"

# ─── Global state ─────────────────────────────────────────────────────────────
_ai_backend: str | None = None   # None = procedural; "motionlcm" = AI loaded
_server_start_time = time.time()

# Per-request timing ring buffer (last 50 requests)
_latency_ring: list[float] = []
_requests_total = 0
_requests_ok    = 0

# ─── Emotion → motion parameter table (shared with main server) ───────────────
_EMOTION_PARAMS: dict[str, dict] = {
    "neutral":    {"energy": 0.4, "sway": 0.015, "headTilt": 0.04,  "armLift": 0.00,  "spineForward": 0.00},
    "happy":      {"energy": 0.7, "sway": 0.025, "headTilt": 0.06,  "armLift": 0.10,  "spineForward": -0.01},
    "excited":    {"energy": 1.0, "sway": 0.035, "headTilt": 0.08,  "armLift": 0.18,  "spineForward": -0.02},
    "sad":        {"energy": 0.2, "sway": 0.008, "headTilt": 0.03,  "armLift": -0.08, "spineForward":  0.04},
    "angry":      {"energy": 0.6, "sway": 0.010, "headTilt": 0.02,  "armLift": 0.07,  "spineForward": -0.01},
    "shy":        {"energy": 0.3, "sway": 0.012, "headTilt": 0.07,  "armLift": -0.05, "spineForward":  0.03},
    "embarrassed":{"energy": 0.3, "sway": 0.012, "headTilt": 0.07,  "armLift": -0.05, "spineForward":  0.03},
    "surprised":  {"energy": 0.8, "sway": 0.005, "headTilt": 0.00,  "armLift": 0.12,  "spineForward": -0.03},
    "thinking":   {"energy": 0.4, "sway": 0.010, "headTilt": 0.09,  "armLift": 0.05,  "spineForward":  0.01},
    "pouty":      {"energy": 0.4, "sway": 0.018, "headTilt": 0.05,  "armLift": 0.00,  "spineForward":  0.02},
}


# ─── Procedural generator (always available, no dependencies) ─────────────────

def _procedural_keyframes(emotion: str, duration: float = 3.0, fps: int = 20) -> list[dict]:
    """Generate sine-wave VRM bone keyframes for the given emotion.

    Args:
        emotion: Emotion label string.
        duration: Clip length in seconds.
        fps: Keyframe density.

    Returns:
        List of ``{"time": float, "bones": {name: {x,y,z}}}`` dicts.
    """
    params = _EMOTION_PARAMS.get(emotion, _EMOTION_PARAMS["neutral"])
    frames: list[dict] = []
    step = 1.0 / fps
    t = 0.0
    while t <= duration:
        breath   = math.sin(t * 2.0 * math.pi * 0.4) * 0.008 * params["energy"]
        sway     = math.sin(t * 2.0 * math.pi * 0.25) * params["sway"]
        head_nod = math.sin(t * 2.0 * math.pi * 0.3) * params["headTilt"]
        frames.append({
            "time": round(t, 3),
            "bones": {
                "hips":          {"x": 0.0,          "y": sway * 0.5,  "z": sway * 0.3},
                "spine":         {"x": breath + params["spineForward"], "y": 0.0, "z": sway * 0.5},
                "chest":         {"x": breath * 1.3,  "y": 0.0,         "z": sway * 0.3},
                "neck":          {"x": head_nod * 0.25, "y": 0.0,       "z": sway * -0.2},
                "head":          {"x": head_nod * 0.6,  "y": 0.0,       "z": sway * -0.15},
                "leftUpperArm":  {"x": 0.08 + math.sin(t * 1.1) * 0.04 * params["energy"],
                                  "y": 0.0, "z": -1.4 + params["armLift"]},
                "rightUpperArm": {"x": 0.08 + math.sin(t * 1.3) * 0.03 * params["energy"],
                                  "y": 0.0, "z":  1.4 - params["armLift"]},
            },
        })
        t = round(t + step, 6)
    return frames


# ─── FastAPI app ──────────────────────────────────────────────────────────────

app = FastAPI(title="Waifu Motion Server", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class GenerateRequest(BaseModel):
    """Motion generation request body.

    Attributes:
        emotion: Emotion label (neutral/happy/sad/…).
        intensity: 0–1 amplitude scale.
        duration: Clip length in seconds (clamped 1–10).
        context: Optional chat context text for AI backends.
        label: Viewer-side clip label.
        loop: Whether the clip should loop.
    """

    emotion:   str   = "neutral"
    intensity: float = 0.7
    duration:  float = 3.0
    context:   Optional[str] = None
    label:     Optional[str] = None
    loop:      bool  = True


@app.get("/status")
def get_status() -> dict:
    """Health check and capability report.

    Returns:
        dict: Service info, active backend, available models, uptime.
    """
    uptime = int(time.time() - _server_start_time)
    return {
        "service":        "waifu-motion",
        "version":        "1.0",
        "backend":        _ai_backend or "procedural",
        "procedural":     True,
        "motionlcm":      _ai_backend == "motionlcm",
        "uptime_seconds": uptime,
        "models_dir":     str(MODELS_DIR),
    }


@app.get("/stats")
def get_stats() -> dict:
    """Performance statistics for the Settings panel.

    Returns:
        dict: Request counts, latency histogram, backend name, uptime.
    """
    window = _latency_ring[-20:] if _latency_ring else []
    avg_ms = round(sum(window) / len(window), 1) if window else None
    p95_ms = round(sorted(window)[int(len(window) * 0.95)], 1) if len(window) >= 4 else None
    return {
        "backend":          _ai_backend or "procedural",
        "requests_total":   _requests_total,
        "requests_ok":      _requests_ok,
        "avg_latency_ms":   avg_ms,
        "p95_latency_ms":   p95_ms,
        "last_latencies_ms": [round(v, 1) for v in window],
        "uptime_seconds":   int(time.time() - _server_start_time),
    }


@app.get("/models")
def list_models() -> dict:
    """List AI model directories present under models/motion/.

    Returns:
        dict: {"models": [{"name": str, "path": str, "size_mb": float}]}
    """
    entries = []
    if MODELS_DIR.exists():
        for p in MODELS_DIR.iterdir():
            if p.is_dir() and p.name != "__pycache__":
                size_mb = sum(f.stat().st_size for f in p.rglob("*") if f.is_file()) / 1e6
                entries.append({"name": p.name, "path": str(p), "size_mb": round(size_mb, 1)})
    return {"models": entries}


@app.post("/generate")
async def generate(req: GenerateRequest) -> dict:
    """Generate bone keyframe data for the given emotion.

    Uses the best available backend (AI if loaded, else procedural).
    Tracks latency for the /stats endpoint.

    Returns:
        dict: {label, backend, duration, loop, keyframes}
    """
    global _requests_total, _requests_ok
    _requests_total += 1
    t0 = time.monotonic()

    emotion  = req.emotion.lower().strip()
    duration = max(1.0, min(req.duration, 10.0))
    label    = req.label or f"motion_{emotion}"

    # ── AI backend (stub — plug in MotionLCM runner here) ─────────────────
    # if _ai_backend == "motionlcm":
    #     from backend.motion.motionlcm_runner import generate_clip
    #     keyframes = await asyncio.get_event_loop().run_in_executor(
    #         None, generate_clip, emotion, req.context, duration)
    # else:
    keyframes = _procedural_keyframes(emotion, duration)
    backend   = _ai_backend or "procedural"

    # Scale by intensity
    if abs(req.intensity - 1.0) > 0.01:
        for frame in keyframes:
            for bone, euler in frame["bones"].items():
                if bone in ("leftUpperArm", "rightUpperArm"):
                    euler["x"] *= req.intensity
                else:
                    euler["x"] *= req.intensity
                    euler["y"] *= req.intensity
                    euler["z"] *= req.intensity

    elapsed_ms = (time.monotonic() - t0) * 1000
    _latency_ring.append(elapsed_ms)
    if len(_latency_ring) > 50:
        _latency_ring.pop(0)
    _requests_ok += 1

    return {
        "label":     label,
        "backend":   backend,
        "duration":  duration,
        "loop":      req.loop,
        "keyframes": keyframes,
        "latency_ms": round(elapsed_ms, 1),
    }


# ─── Background AI model loader ───────────────────────────────────────────────

async def _try_load_ai_backend() -> None:
    """Try to load the best available AI model in the background.

    Runs once at startup.  If a model directory is found under models/motion/,
    attempts to import and initialise the corresponding runner.
    Silently falls back to procedural if anything fails.
    """
    global _ai_backend
    await asyncio.sleep(2)   # let the server finish starting first

    motionlcm_dir = MODELS_DIR / "motionlcm"
    if motionlcm_dir.exists():
        logger.info("MotionLCM model found — attempting to load…")
        try:
            # Placeholder — real import added in motionlcm sprint:
            # from backend.motion.motionlcm_runner import load_model
            # await asyncio.get_event_loop().run_in_executor(None, load_model, motionlcm_dir)
            # _ai_backend = "motionlcm"
            logger.info("MotionLCM runner not yet wired — using procedural.")
        except Exception as exc:  # noqa: BLE001
            logger.warning("MotionLCM load failed: %s — using procedural.", exc)

    logger.info("Active backend: %s", _ai_backend or "procedural")


@app.on_event("startup")
async def on_startup() -> None:
    asyncio.create_task(_try_load_ai_backend())


# ─── Entrypoint ───────────────────────────────────────────────────────────────

def _print_banner(host: str, port: int) -> None:
    """Print a friendly startup message visible in the cmd window."""
    try:
        import socket as _sock
        local_ip = _sock.gethostbyname(_sock.gethostname())
    except Exception:   # noqa: BLE001
        local_ip = "your-pc-ip"

    lines = [
        "",
        "╔══════════════════════════════════════════════╗",
        "║       WAIFU MOTION SERVER  —  Running!       ║",
        "╠══════════════════════════════════════════════╣",
        f"║  Local:    http://localhost:{port}             ║",
        f"║  Network:  http://{local_ip}:{port}".ljust(47) + "║",
        "║                                              ║",
        "║  Your main app will find this PC             ║",
        "║  automatically over WiFi.                    ║",
        "║                                              ║",
        "║  Keep this window open while using the app. ║",
        "║  Close it to stop the motion server.        ║",
        "╚══════════════════════════════════════════════╝",
        "",
    ]
    for line in lines:
        print(line)


def main() -> None:
    """CLI entrypoint — called by setup_windows.bat and `python -m backend.motion.motion_server`."""
    parser = argparse.ArgumentParser(description="Waifu Motion Server")
    parser.add_argument("--port", type=int, default=8081)
    parser.add_argument("--host", type=str, default="0.0.0.0")
    parser.add_argument("--no-ai", action="store_true", help="Force procedural-only mode")
    args = parser.parse_args()

    if args.no_ai:
        global _ai_backend
        _ai_backend = None
        logger.info("--no-ai flag set: using procedural generator only")

    # Start UDP beacon so the Mac app discovers this server automatically
    start_beacon_sender(motion_port=args.port)

    _print_banner(args.host, args.port)
    uvicorn.run(app, host=args.host, port=args.port, log_level="warning")


if __name__ == "__main__":
    main()
