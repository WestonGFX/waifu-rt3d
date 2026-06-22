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
import base64
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
_ai_backend: str | None = None   # None = procedural; "dart" = DART loaded
_server_start_time = time.time()
_no_ai = False                   # set by --no-ai: never attempt the AI backend

# DART resident engine (Stage 3 Phase 3). Lazily constructed in
# _try_load_ai_backend; only importable on the box (WSL ``dart`` conda env, run
# from the DART repo root). Stays None on machines without DART.
_dart_runner: Any | None = None

# Clip cache keyed by (prompt, primitives, seed) → npz bytes. A companion reuses
# a small recurring gesture vocabulary, so the second ask for the same motion is
# free. Bounded to avoid unbounded growth on a long-running box service.
_dart_cache: "dict[tuple[str, int, int], bytes]" = {}
_DART_CACHE_MAX = 64

# Emotion → DART text-prompt fallback. Used only when the request carries no
# explicit ``prompt``. Deliberately small; richer emotion→motion mapping is the
# Mac-side Phase 5.1 concern. BABEL/HML3D-style action words.
_EMOTION_TO_PROMPT: dict[str, str] = {
    "neutral":   "stand",
    "happy":     "wave",
    "excited":   "jump for joy",
    "sad":       "look down sadly",
    "angry":     "cross arms",
    "shy":       "look away shyly",
    "surprised": "step back in surprise",
    "thinking":  "scratch head",
    "proud":     "raise both hands",
    "sleepy":    "stretch",
}


def _emotion_to_prompt(emotion: str) -> str:
    """Map an emotion label to a DART text prompt (fallback when none given).

    Args:
        emotion: Emotion label (already lowercased/stripped).

    Returns:
        A BABEL-style action prompt; ``"stand"`` for unknown emotions.
    """
    return _EMOTION_TO_PROMPT.get(emotion, "stand")


def _duration_to_primitives(duration: float) -> int:
    """Convert a clip duration in seconds to DART rollout primitives.

    ~8 primitives ≈ 2.2 s @ 30 fps (the measured rollout cadence), so each
    primitive is ~0.275 s. Clamped to a sane 2–24 range.

    Args:
        duration: Requested clip length in seconds.

    Returns:
        Primitive count for the DART rollout.
    """
    return max(2, min(24, round(duration / 0.275)))

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
    prompt:    Optional[str] = None   # explicit DART text prompt (overrides emotion map)
    seed:      int   = 0              # DART RNG seed (cache key + reproducibility)


@app.get("/status")
def get_status() -> dict:
    """Health check and capability report.

    Returns:
        dict: Service info, active backend, available capabilities, uptime.
    """
    uptime = int(time.time() - _server_start_time)
    return {
        "service":        "waifu-motion",
        "version":        "1.1",
        "backend":        _ai_backend or "procedural",
        "procedural":     True,
        "dart":           _ai_backend == "dart",
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


def _generate_dart_npz(prompt: str, primitives: int, seed: int) -> bytes:
    """Generate (or cache-hit) a DART SMPL-X clip and return its npz bytes.

    Runs the resident :class:`DartRunner` synchronously (call from a threadpool
    executor — DART rollout is GPU-blocking). Results are cached by
    ``(prompt, primitives, seed)``; the cache is bounded to ``_DART_CACHE_MAX``.

    Args:
        prompt: DART text prompt (e.g. ``"wave"``).
        primitives: Rollout length in motion primitives.
        seed: RNG seed.

    Returns:
        Raw bytes of the generated ``sample_0_smplx.npz``.

    Raises:
        RuntimeError: If the DART runner is not loaded.
    """
    key = (prompt, primitives, seed)
    cached = _dart_cache.get(key)
    if cached is not None:
        return cached
    if _dart_runner is None:
        raise RuntimeError("DART runner not loaded")
    npz_path = _dart_runner.generate(prompt, primitives=primitives, seed=seed)
    data = Path(npz_path).read_bytes()
    if len(_dart_cache) >= _DART_CACHE_MAX:
        _dart_cache.pop(next(iter(_dart_cache)))   # evict oldest (FIFO)
    _dart_cache[key] = data
    return data


@app.post("/generate")
async def generate(req: GenerateRequest) -> dict:
    """Generate motion for the given emotion/prompt.

    Uses the best available backend: DART (clip artifact) if loaded, else the
    procedural keyframe generator. Tracks latency for the /stats endpoint.

    Returns:
        dict: For DART, a clip artifact
        ``{kind:"clip", format:"npz", npz_b64, name, fps, primitives, backend,
        duration, loop, latency_ms}``; otherwise the procedural keyframe shape
        ``{kind:"keyframes", label, backend, duration, loop, keyframes, latency_ms}``.
    """
    global _requests_total, _requests_ok
    _requests_total += 1
    t0 = time.monotonic()

    emotion  = req.emotion.lower().strip()
    duration = max(1.0, min(req.duration, 10.0))
    label    = req.label or f"motion_{emotion}"

    # ── DART AI backend — return a normalized-clip artifact (npz) ─────────────
    if _ai_backend == "dart" and _dart_runner is not None:
        prompt = (req.prompt or "").strip() or _emotion_to_prompt(emotion)
        primitives = _duration_to_primitives(duration)
        try:
            npz_bytes = await asyncio.get_event_loop().run_in_executor(
                None, _generate_dart_npz, prompt, primitives, req.seed
            )
            elapsed_ms = (time.monotonic() - t0) * 1000
            _latency_ring.append(elapsed_ms)
            if len(_latency_ring) > 50:
                _latency_ring.pop(0)
            _requests_ok += 1
            return {
                "kind":       "clip",
                "format":     "npz",
                "npz_b64":    base64.b64encode(npz_bytes).decode("ascii"),
                "name":       label,
                "prompt":     prompt,
                "primitives": primitives,
                "fps":        30,
                "backend":    "dart",
                "duration":   duration,
                "loop":       req.loop,
                "latency_ms": round(elapsed_ms, 1),
            }
        except Exception as exc:   # noqa: BLE001
            logger.warning("DART generate failed (%s) — falling back to procedural.", exc)

    # ── Procedural fallback (always available, no dependencies) ───────────────
    keyframes = _procedural_keyframes(emotion, duration)
    backend   = "procedural"

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
        "kind":      "keyframes",
        "label":     label,
        "backend":   backend,
        "duration":  duration,
        "loop":      req.loop,
        "keyframes": keyframes,
        "latency_ms": round(elapsed_ms, 1),
    }


# ─── Background AI model loader ───────────────────────────────────────────────

async def _try_load_ai_backend() -> None:
    """Try to load the DART resident engine in the background.

    Runs once at startup. Attempts to construct + load :class:`DartRunner` (the
    Stage-3 DART text→motion engine). This only succeeds on the GPU box, run from
    the DART repo root in the WSL ``dart`` conda env — DART's ``mld.*`` modules
    are not importable elsewhere. On any failure (ImportError on a non-box
    machine, missing checkpoint, CUDA error) it logs and stays on the procedural
    backend, so the server is always usable.

    Honors ``--no-ai`` (sets :data:`_no_ai`). The checkpoint path may be
    overridden via the ``WAIFU_DART_CHECKPOINT`` env var (default is
    DART-repo-relative, matching ``demos/run_demo.sh``).
    """
    global _ai_backend, _dart_runner
    if _no_ai:
        logger.info("--no-ai set: procedural backend only.")
        return
    await asyncio.sleep(2)   # let the server finish starting first

    try:
        from backend.motion.dart_runner import DartRunner, DEFAULT_CHECKPOINT  # noqa: PLC0415
        checkpoint = os.environ.get("WAIFU_DART_CHECKPOINT", DEFAULT_CHECKPOINT)
        logger.info("Loading DART engine (checkpoint=%s)… one-time, ~10–15 s.", checkpoint)
        runner = DartRunner(checkpoint)
        # load() is heavy + blocking (model into VRAM) — run off the event loop.
        await asyncio.get_event_loop().run_in_executor(None, runner.load)
        _dart_runner = runner
        _ai_backend = "dart"
        logger.info("DART engine loaded — AI motion active.")
    except Exception as exc:  # noqa: BLE001
        logger.info("DART engine unavailable (%s) — using procedural backend.", exc)

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
        global _ai_backend, _no_ai
        _ai_backend = None
        _no_ai = True
        logger.info("--no-ai flag set: using procedural generator only")

    # Start UDP beacon so the Mac app discovers this server automatically
    start_beacon_sender(motion_port=args.port)

    _print_banner(args.host, args.port)
    uvicorn.run(app, host=args.host, port=args.port, log_level="warning")


if __name__ == "__main__":
    main()
