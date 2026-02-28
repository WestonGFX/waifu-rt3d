import logging
import logging.handlers
import queue
from threading import Lock

import os
import sys

# Ensure project root is on sys.path for `python backend/server.py` invocations.
# Prefer `python -m backend` which handles this automatically via __main__.py.
ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT_DIR not in sys.path:
    sys.path.append(ROOT_DIR)

import json
import re
import sqlite3
import psutil
from contextlib import asynccontextmanager
from typing import Optional

# ... (Previous imports) ...
from fastapi import FastAPI, UploadFile, File, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from starlette.staticfiles import StaticFiles
import time

# --- LOGGING SETUP ---
LOG_QUEUE = queue.Queue(maxsize=100)
logger = logging.getLogger("waifu")
logger.setLevel(logging.DEBUG)
# (Simplified logging setup for brevity, or full restore)

# Structured JSON logging (#114): when WAIFU_LOG_JSON=1 each log line is a JSON object.
# Useful for log aggregators (Loki, ELK, etc.) that ingest structured streams.
if os.getenv("WAIFU_LOG_JSON", "0") == "1":
    import datetime as _dt_mod

    class _JsonFormatter(logging.Formatter):
        """Format log records as single-line JSON objects."""

        def format(self, record: logging.LogRecord) -> str:
            """Serialise a LogRecord to JSON.

            Args:
                record: The log record to format.

            Returns:
                A single-line JSON string.
            """
            obj = {
                "ts":      _dt_mod.datetime.utcfromtimestamp(record.created).isoformat() + "Z",
                "level":   record.levelname,
                "logger":  record.name,
                "msg":     record.getMessage(),
            }
            if record.exc_info:
                obj["exc"] = self.formatException(record.exc_info)
            return json.dumps(obj, ensure_ascii=False)

    _json_handler = logging.StreamHandler()
    _json_handler.setFormatter(_JsonFormatter())
    logging.root.addHandler(_json_handler)


# --- FILE LOGGING ---
# Always write full debug logs to a rotating file so errors from test sessions
# can be reviewed later (even if the user didn't see the terminal output).
# Files are stored in backend/logs/ which is gitignored.
_log_dir = os.path.join(ROOT_DIR, "backend", "logs")
os.makedirs(_log_dir, exist_ok=True)
_file_handler = logging.handlers.RotatingFileHandler(
    os.path.join(_log_dir, "waifu.log"),
    maxBytes=5 * 1024 * 1024,  # 5 MB per file
    backupCount=3,
    encoding="utf-8",
)
_file_handler.setLevel(logging.DEBUG)
_file_handler.setFormatter(logging.Formatter(
    "%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
))
logging.root.addHandler(_file_handler)
# Also capture uvicorn access logs to file (without the quiet filter)
logging.getLogger("uvicorn.access").addHandler(_file_handler)


# --- QUIET POLLING FILTER ---
# Suppress uvicorn access-log spam for high-frequency polling endpoints
# (health check every 10s, stats every 10s, art-status every 15s).
# Without this, idle console fills with ~15 lines/minute of noise that
# buries real errors and makes debugging painful.
class _QuietPollingFilter(logging.Filter):
    """Filter out uvicorn access log entries for known polling paths."""

    _NOISY_PATHS = frozenset({
        "/api/health",
        "/api/healthcheck",
        "/api/stats",
        "/api/image-gen/status",
        "/api/lm-studio/models",
        "/api/logs",
        "/api/tts/models",
        "/api/tts/models/install/status",
        "/api/tts/voices",
        "/favicon.svg",
        "/favicon.ico",
    })

    def filter(self, record: logging.LogRecord) -> bool:
        """Return False to suppress polling noise, True to keep the log entry.

        Args:
            record: The uvicorn access log record. The message typically
                     contains the HTTP method + path (e.g. 'GET /api/health').

        Returns:
            True if the record should be logged, False to suppress it.
        """
        msg = record.getMessage()
        return not any(path in msg for path in self._NOISY_PATHS)


logging.getLogger("uvicorn.access").addFilter(_QuietPollingFilter())


# --- MIME TYPE REGISTRATION ---
# VRM files are glTF binary containers (.glb under the hood).  Python's
# mimetypes module doesn't know .vrm, so Starlette's StaticFiles serves
# them as "text/plain; charset=utf-8" — which corrupts the binary data
# in the browser and prevents Three.js GLTFLoader from parsing them.
import mimetypes
mimetypes.add_type("model/gltf-binary", ".vrm")


# --- APP INITIALIZATION ---


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan: run startup tasks, yield, then clean up.

    Replaces the deprecated ``@app.on_event("startup")`` pattern with
    the modern FastAPI lifespan context manager.  Code before ``yield``
    runs at startup; code after ``yield`` runs at shutdown.
    """
    global model_manager, vector_store, tts_model_mgr, _lms_model_lock

    try:
        from backend import preflight
        preflight.run()
    except Exception as e:
        logger.error(f"Preflight failed: {e}")

    disable_vector_store = os.getenv("WAIFU_DISABLE_VECTOR_STORE", "").strip().lower() in {"1", "true", "yes"}
    if disable_vector_store:
        vector_store = None
        logger.info("Vector Store initialization skipped by WAIFU_DISABLE_VECTOR_STORE")
    else:
        # Feature A3: Try TieredMemoryManager (sqlite-vec) first; fall back to ChromaDB.
        try:
            from backend.memory.tiered_memory import TieredMemoryManager
            _cfg_startup = load_config() or {}
            _mem_cfg = _cfg_startup.get("memory", {})
            _tiered = TieredMemoryManager(
                db_path=str(STORAGE / "app.db"),
                storage_path=str(STORAGE / "memory"),
                decay_mode=_mem_cfg.get("decay_mode", "off"),
                top_k=int(_mem_cfg.get("top_k", 5)),
                salience_threshold=float(_mem_cfg.get("salience_threshold", 0.3)),
            )
            _tiered.init()
            vector_store = _tiered
            logger.info("✅ TieredMemoryManager (sqlite-vec) initialized")
        except Exception as e_tiered:
            logger.warning("TieredMemoryManager unavailable (%s), falling back to ChromaDB", e_tiered)
            try:
                from backend.memory.vector_store import VectorStore
                vector_store = VectorStore(storage_path=str(STORAGE / "memory"))
                logger.debug("Vector Store (ChromaDB fallback) initialized")
            except Exception as e:
                vector_store = None
                logger.warning(f"Vector Store unavailable, session-only memory mode active: {e}")

    cfg = load_config()

    # Config schema validator (#117): warn about unknown or deprecated keys at startup.
    _KNOWN_CFG_KEYS: set[str] = {
        "llm_endpoint", "llm_model", "llm", "context_limit", "history_limit",
        "temperature", "repeat_penalty", "frequency_penalty", "max_tokens", "thinking_visible",
        "speech_rate", "pitch_shift", "voice_stability", "tts_provider", "voice_id",
        "interrupt_mode", "tts", "asr_provider", "asr_model", "asr",
        "visual_mode", "theme", "bg_mode", "glow_intensity", "ui_border_radius",
        "ui_blur", "ui_font_size", "layout_show_left", "layout_show_right",
        "chat_layout", "ui_sounds", "lighting_preset", "fps_target", "show_fps_overlay",
        "shadow_quality", "dev_mode", "log_limit", "save_logs_auto",
        "audio_cleanup_days", "content_filter_level", "active_character_id",
        "auto_start_lmstudio", "lms_autoload_model", "chat_font_size",
        "show_timestamps", "typewriter_enabled", "typewriter_speed",
        "vad_threshold", "fast_chunking", "image_gen", "video_gen",
        "vrm_scale", "vrm_offset_x", "vrm_offset_y", "webhooks",
        "vocab_enabled", "vocab_limit", "vocab_path", "vocab",
        "onboarded", "avatar_url", "model_vrm", "live2d_model",
        "bg_image", "background_mode", "memory", "services", "system",
    }
    for key in cfg:
        if key not in _KNOWN_CFG_KEYS:
            logger.warning(f"[Config] Unknown key '{key}' in app.json — may be stale or from a plugin")

    # Auto-start LM Studio headless if configured and unreachable
    _try_auto_start_lmstudio(cfg)

    from backend.models.manager import ModelManager
    model_manager = ModelManager(cfg)
    logger.info("Model Manager Initialized")

    # LM Studio model switching lock + seed active model from config
    import asyncio as _aio_lock
    _lms_model_lock = _aio_lock.Lock()
    global _active_lms_model
    _active_lms_model = cfg.get("llm", {}).get("model", "")

    # TTS Voice Model Manager — catalog, download, delete voice packs
    from backend.tts.model_manager import TTSModelManager
    tts_model_mgr = TTSModelManager(
        model_dir=cfg.get("tts", {}).get("model_dir") if cfg.get("tts", {}).get("model_dir") else None
    )
    logger.info(f"TTS Model Manager Initialized ({len(tts_model_mgr.load_catalog())} voices in catalog)")

    # Start background maintenance tasks
    import asyncio as _asyncio

    # Audio cleanup (#108): delete TTS files older than N days
    audio_max_age = int(cfg.get("audio_cleanup_days", 7))
    if audio_max_age > 0:
        _asyncio.create_task(_audio_cleanup_loop(audio_max_age))
        logger.debug(f"Audio cleanup task started (max_age={audio_max_age} days)")

    # DB vacuum (#106): SQLite VACUUM runs weekly to reclaim fragmented space
    _asyncio.create_task(_db_vacuum_loop(interval_days=7))
    logger.debug("DB vacuum task started (weekly)")

    # DB backup (#118): daily timestamped copy to STORAGE/_backups/, 7-day retention
    _asyncio.create_task(_db_backup_loop(interval_days=1, retention=7))
    logger.debug("DB backup task started (daily, 7-day retention)")

    # Proactive message scheduler (Feature C): check character_schedules every 5 minutes
    # and queue messages into scheduled_messages for the frontend to pick up.
    global _scheduler_task
    _scheduler_task = _asyncio.create_task(_scheduler_loop(str(DB_PATH)))
    logger.debug("Proactive message scheduler started (5-minute interval)")

    yield

    # Shutdown: cancel the scheduler loop gracefully.
    if _scheduler_task and not _scheduler_task.done():
        _scheduler_task.cancel()
    logger.info("Application shutdown complete")


app = FastAPI(title="Waifu-RT3D", version="5.31.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- CONFIGURATION (Load early) ---
from pathlib import Path
FRONTEND = Path(ROOT_DIR) / "frontends" / "neon"
FRONTEND_DASHBOARD_DIST = Path(ROOT_DIR) / "frontends" / "dashboard" / "dist"
FRONTEND_V2_DIST = Path(ROOT_DIR) / "frontends" / "v2" / "dist"
FRONTEND_SAKURA_DIST = Path(ROOT_DIR) / "frontends" / "sakura" / "dist"
STORAGE  = Path(ROOT_DIR) / "backend" / "storage"
CONFIG   = Path(ROOT_DIR) / "backend" / "config" / "app.json"
DEFAULT_FRONTEND_ENV = "WAIFU_DEFAULT_FRONTEND"

def load_config() -> dict:
    """Load app configuration from app.json.

    Returns:
        Config dict, or empty dict if file missing or malformed.
    """
    if not CONFIG.exists():
        return {}
    try:
        return json.loads(CONFIG.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as e:
        logger.warning(f"Config load failed: {e} — using defaults")
        return {}

AVATARS  = STORAGE / "avatars"
AUDIO    = STORAGE / "audio"
DB_PATH  = STORAGE / "app.db"

# --- Environment-overridable defaults ---
# These allow Docker/production deployments to configure endpoints without
# editing app.json. The env var takes priority over the config file value.
DEFAULT_LLM_ENDPOINT = os.environ.get("WAIFU_LLM_ENDPOINT", "http://localhost:1234/v1")
DEFAULT_COMFYUI_ENDPOINT = os.environ.get("WAIFU_COMFYUI_ENDPOINT", "http://localhost:8188")


def _get_llm_endpoint(cfg: dict) -> str:
    """Get the LLM endpoint from env var, config, or hardcoded default.

    Priority: WAIFU_LLM_ENDPOINT env var > app.json llm.endpoint > localhost:1234

    Args:
        cfg: Loaded app config dict.

    Returns:
        LLM endpoint URL string.
    """
    if os.environ.get("WAIFU_LLM_ENDPOINT"):
        return DEFAULT_LLM_ENDPOINT
    return cfg.get("llm", {}).get("endpoint", DEFAULT_LLM_ENDPOINT)


def _get_comfyui_endpoint(cfg: dict, section: str = "image_gen") -> str:
    """Get the ComfyUI endpoint from env var, config, or hardcoded default.

    Priority: WAIFU_COMFYUI_ENDPOINT env var > app.json section.endpoint > localhost:8188

    Args:
        cfg: Loaded app config dict.
        section: Config section to check ("image_gen" or "video_gen").

    Returns:
        ComfyUI endpoint URL string.
    """
    if os.environ.get("WAIFU_COMFYUI_ENDPOINT"):
        return DEFAULT_COMFYUI_ENDPOINT
    return cfg.get(section, {}).get("endpoint", DEFAULT_COMFYUI_ENDPOINT)

def save_config(cfg):
    CONFIG.write_text(json.dumps(cfg, indent=2), encoding="utf-8")

def db():
    return sqlite3.connect(DB_PATH)


model_manager = None
vector_store = None
tts_model_mgr = None

# Track the currently loaded LM Studio model to avoid loading duplicates.
# When a per-character model override requests a different model, the old
# one is unloaded first so only one LLM occupies VRAM at a time.
_active_lms_model: Optional[str] = None
_lms_model_lock = None  # asyncio.Lock, initialized in lifespan


async def _ensure_lms_model(requested_model: str) -> None:
    """Ensure the requested model is loaded in LM Studio, unloading others.

    When characters have different ``llm_model`` settings, LM Studio would
    otherwise accumulate multiple loaded models and blow through VRAM.
    This function unloads the previously active model before loading the
    new one, keeping exactly one LLM in memory.

    Args:
        requested_model: The model ID the next chat request needs.

    Note:
        No-op if ``model_manager`` is unavailable, the model hasn't changed,
        or LM Studio isn't the backend (non-LM-Studio endpoints ignore this).
    """
    global _active_lms_model
    if not model_manager or not requested_model:
        return
    if requested_model == _active_lms_model:
        return

    if _lms_model_lock is None:
        return

    async with _lms_model_lock:
        # Double-check after acquiring lock
        if requested_model == _active_lms_model:
            return

        try:
            # Unload whatever is currently loaded
            if _active_lms_model:
                logger.info(f"[LMS Switch] Unloading {_active_lms_model} for {requested_model}")
                model_manager.unload_model(_active_lms_model)

            # Load the requested model
            logger.info(f"[LMS Switch] Loading {requested_model}")
            result = model_manager.load_model(requested_model)
            if result.get("ok"):
                _active_lms_model = requested_model
            else:
                logger.warning(f"[LMS Switch] Load failed: {result.get('error')}")
                # Still update tracking — the request will proceed and LM Studio
                # may auto-load on demand
                _active_lms_model = requested_model
        except Exception as e:
            logger.warning(f"[LMS Switch] Model switch failed: {e}")
            _active_lms_model = requested_model


# Feature A6: Lorebook / World Info — keyword-triggered context injection
from backend.lore.matcher import match_lore

# Feature A2: In-App Mini Games — all game engines
from backend.games import trivia as trivia_engine
from backend.games import twenty_questions as tq_engine
from backend.games import hangman as hangman_engine
from backend.games import word_association as wa_engine
from backend.games import riddles as riddles_engine
from backend.games import tictactoe as ttt_engine
from backend.games import memory_match as mm_engine

# Vocabulary manager — loaded at startup, provides vocab context for LLM
from backend.vocab.manager import VocabManager
vocab_manager = VocabManager()
try:
    vocab_manager.load()
except Exception as e:
    logger.warning(f"Vocab manager failed to load: {e}")


def _chunk_text(text: str, max_chars: int = 500) -> list:
    """Split text into chunks of roughly max_chars at sentence boundaries.

    Tries to break at sentence-ending punctuation (.!?) to preserve
    semantic coherence. Falls back to hard split if no boundary found.

    Args:
        text: The text to chunk.
        max_chars: Target maximum characters per chunk.

    Returns:
        List of text chunk strings.
    """
    if len(text) <= max_chars:
        return [text.strip()] if text.strip() else []

    chunks = []
    current = ""
    for line in text.split('\n'):
        if not line.strip():
            if current:
                current += '\n'
            continue
        # Try to add the whole line
        if len(current) + len(line) + 1 <= max_chars:
            current = (current + '\n' + line).strip() if current else line
        else:
            # Current chunk is big enough, save it
            if current:
                chunks.append(current.strip())
            # If the line itself is too long, split it by sentences
            if len(line) > max_chars:
                sentences = re.split(r'(?<=[.!?])\s+', line)
                current = ""
                for sent in sentences:
                    if len(current) + len(sent) + 1 <= max_chars:
                        current = (current + ' ' + sent).strip() if current else sent
                    else:
                        if current:
                            chunks.append(current.strip())
                        current = sent
            else:
                current = line

    if current.strip():
        chunks.append(current.strip())

    return chunks

_telemetry_lock = Lock()
_telemetry = {
    "window_started_at": int(time.time()),
    "api.requests_total": 0,
    "api.errors_4xx": 0,
    "api.errors_5xx": 0,
    "chat.requests_total": 0,
    "chat.failures_total": 0,
    "memory.graph_requests_total": 0,
    "memory.graph_rag_mode_total": 0,
    "memory.graph_session_mode_total": 0,
    "memory.graph_fallback_total": 0,
}


def reset_telemetry_metrics():
    with _telemetry_lock:
        _telemetry["window_started_at"] = int(time.time())
        for key in _telemetry:
            if key == "window_started_at":
                continue
            _telemetry[key] = 0


def _telemetry_inc(key: str, amount: int = 1):
    with _telemetry_lock:
        _telemetry[key] = _telemetry.get(key, 0) + amount


def _telemetry_snapshot():
    with _telemetry_lock:
        return dict(_telemetry)


@app.middleware("http")
async def telemetry_middleware(request: Request, call_next):
    path = request.url.path
    track = path.startswith("/api/") and path != "/api/v2/telemetry/summary"

    if track:
        _telemetry_inc("api.requests_total")

    try:
        response = await call_next(request)
    except Exception:
        if track:
            _telemetry_inc("api.errors_5xx")
        raise

    if track:
        if 400 <= response.status_code < 500:
            _telemetry_inc("api.errors_4xx")
        elif response.status_code >= 500:
            _telemetry_inc("api.errors_5xx")

    # Disable caching for JS/CSS/HTML in dev mode so browser always gets fresh code
    if getattr(app.state, "dev_mode", False):
        if any(ext in request.url.path for ext in ['.js', '.css', '.html']):
            response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
            response.headers["Pragma"] = "no-cache"
            response.headers["Expires"] = "0"

    return response


# Root route — serve the default frontend
@app.get("/", response_class=HTMLResponse)
def index():
    """Serve whichever frontend is set as default.

    Priority order:
        1. ``WAIFU_DEFAULT_FRONTEND`` environment variable
        2. ``default_frontend`` key in ``app.json``
        3. Falls back to ``"neon"``

    Valid values: ``"neon"``, ``"sakura"``, ``"v2"``
    """
    # Check env var first, then config file
    target = str(os.environ.get(DEFAULT_FRONTEND_ENV, "")).strip().lower()
    if not target:
        cfg = load_config()
        target = str(cfg.get("default_frontend", "neon")).strip().lower()

    if target == "sakura":
        sakura_index = FRONTEND_SAKURA_DIST / "index.html"
        if sakura_index.exists():
            return sakura_index.read_text(encoding="utf-8")
        logger.warning("default_frontend=sakura but dist missing; falling back to neon")
    elif target == "v2":
        v2_index = FRONTEND_V2_DIST / "index.html"
        if v2_index.exists():
            return v2_index.read_text(encoding="utf-8")
        logger.warning("default_frontend=v2 but dist missing; falling back to neon")

    return (FRONTEND / "index.html").read_text(encoding="utf-8")


@app.get("/legacy", response_class=HTMLResponse)
def legacy_index():
    return (FRONTEND / "index.html").read_text(encoding="utf-8")


@app.get("/sakura")
@app.get("/sakura/{full_path:path}")
async def sakura_frontend(full_path: str = ""):
    """Serve the Sakura React frontend (SPA fallback).

    Static assets (JS/CSS in ``dist/assets/``) are served directly;
    all other paths return ``index.html`` for client-side routing.
    """
    # Serve static asset files directly (JS, CSS, etc.)
    if full_path.startswith("assets/"):
        asset = FRONTEND_SAKURA_DIST / full_path
        if asset.exists() and asset.is_file():
            return FileResponse(str(asset))
    index = FRONTEND_SAKURA_DIST / "index.html"
    if index.exists():
        return FileResponse(str(index))
    return JSONResponse(
        {"error": "Sakura frontend not built. Run: cd frontends/sakura && npm run build"},
        status_code=404
    )


@app.get("/v2", response_class=HTMLResponse)
def v2_index():
    index_file = FRONTEND_V2_DIST / "index.html"
    if not index_file.exists():
        return HTMLResponse(
            "<h1>V2 preview not built</h1><p>Run `npm run build` inside frontends/v2.</p>",
            status_code=503
        )
    return index_file.read_text(encoding="utf-8")


@app.get("/v2/{full_path:path}", response_class=HTMLResponse)
def v2_spa(full_path: str):
    index_file = FRONTEND_V2_DIST / "index.html"
    if not index_file.exists():
        return HTMLResponse(
            "<h1>V2 preview not built</h1><p>Run `npm run build` inside frontends/v2.</p>",
            status_code=503
        )
    requested = (FRONTEND_V2_DIST / full_path).resolve()
    try:
        requested.relative_to(FRONTEND_V2_DIST.resolve())
    except ValueError:
        return HTMLResponse("invalid path", status_code=400)
    if requested.is_file():
        return FileResponse(requested)
    return index_file.read_text(encoding="utf-8")

# Mount Dashboard
if FRONTEND_DASHBOARD_DIST.exists():
    app.mount("/dashboard", StaticFiles(directory=str(FRONTEND_DASHBOARD_DIST), html=True), name="dashboard")

# Favicon — served from the active frontend's root directory.
# Two routes: /favicon.svg (the actual file) and /favicon.ico (redirect).
# Chrome hard-requests /favicon.ico on every page load regardless of what
# the <link rel="icon"> tag says, so we redirect it to avoid 404 spam.
@app.get("/favicon.svg")
def favicon_svg():
    """Serve the SVG favicon from the Neon frontend root."""
    path = FRONTEND / "favicon.svg"
    if path.exists():
        return FileResponse(path, media_type="image/svg+xml")
    return JSONResponse({"error": "not found"}, status_code=404)


@app.get("/favicon.ico")
def favicon_ico():
    """Serve .ico if it exists, otherwise redirect to SVG.

    Chrome always requests /favicon.ico regardless of the HTML <link>
    tag. Serving a real .ico or redirecting avoids 404 noise.
    """
    ico_path = FRONTEND / "favicon.ico"
    if ico_path.exists():
        return FileResponse(ico_path, media_type="image/x-icon")
    from starlette.responses import RedirectResponse
    return RedirectResponse("/favicon.svg", status_code=301)


@app.get("/logo.png")
def logo_png():
    """Serve the project logo/icon as PNG (used for social sharing, about page)."""
    path = FRONTEND / "logo.png"
    if path.exists():
        return FileResponse(path, media_type="image/png")
    return JSONResponse({"error": "not found"}, status_code=404)

# Mount Static Files
# Sakura frontend (built React app)
if FRONTEND_SAKURA_DIST.exists() and (FRONTEND_SAKURA_DIST / "assets").exists():
    app.mount("/sakura/assets", StaticFiles(directory=str(FRONTEND_SAKURA_DIST / "assets")), name="sakura-assets")

app.mount("/shared", StaticFiles(directory=str(Path(ROOT_DIR) / "frontends" / "shared")), name="shared")
app.mount("/assets", StaticFiles(directory=str(FRONTEND / "assets")), name="assets")
app.mount("/files", StaticFiles(directory=str(STORAGE)), name="files")
app.mount("/frontend", StaticFiles(directory=str(FRONTEND)), name="frontend")
app.mount("/js", StaticFiles(directory=str(FRONTEND / "js")), name="js")
app.mount("/css", StaticFiles(directory=str(FRONTEND / "css")), name="css")
app.mount("/viewer", StaticFiles(directory=str(FRONTEND / "viewer")), name="viewer")
app.mount("/lib", StaticFiles(directory=str(FRONTEND / "lib")), name="lib")
app.mount("/live2d", StaticFiles(directory=str(STORAGE / "live2d")), name="live2d")
app.mount("/images", StaticFiles(directory=str(STORAGE / "images")), name="images") # Mounted for portraits
if (FRONTEND_V2_DIST / "assets").exists():
    app.mount("/v2/assets", StaticFiles(directory=str(FRONTEND_V2_DIST / "assets")), name="v2-assets")

# ... (Previous mounts) ...

@app.get("/api/logs")
def get_logs():
    logs = []
    while not LOG_QUEUE.empty():
        logs.append(LOG_QUEUE.get_nowait())
    return {"logs": logs}


@app.get("/api/logs/file")
def get_log_file(lines: int = 200, level: str = ""):
    """Read the last N lines from the persistent log file.

    Useful for reviewing errors from previous test sessions without
    needing the terminal output.

    Args:
        lines: Number of recent lines to return (default 200, max 2000).
        level: Optional filter — only return lines containing this level
               (e.g. "ERROR", "WARNING").

    Returns:
        dict: {"lines": list[str], "file": str, "total": int}

    Example:
        >>> GET /api/logs/file?lines=50&level=ERROR
        {"lines": ["2026-02-26 12:00:01 [ERROR] ..."], "file": "backend/logs/waifu.log", "total": 3}
    """
    log_path = os.path.join(ROOT_DIR, "backend", "logs", "waifu.log")
    lines = min(max(lines, 1), 2000)

    if not os.path.exists(log_path):
        return {"lines": [], "file": log_path, "total": 0}

    try:
        with open(log_path, "r", encoding="utf-8", errors="replace") as f:
            all_lines = f.readlines()

        tail = all_lines[-lines:]
        if level:
            level_upper = level.upper()
            tail = [ln for ln in tail if f"[{level_upper}]" in ln]

        return {"lines": [ln.rstrip() for ln in tail], "file": log_path, "total": len(tail)}
    except Exception as e:
        return {"lines": [], "file": log_path, "total": 0, "error": str(e)}


@app.get("/api/health")
@app.get("/api/healthcheck")  # alias for backward compatibility with tests
def health_check():
    """Health check endpoint. Returns server version, LLM reachability, and DB status.

    Returns:
        dict: {
            "ok": bool,        Always True (server is up if this responds)
            "version": str,    Server version string
            "services": dict   {
                "db": str,         "connected" or "error"
                "llm": str,        "connected" or "disconnected"
                "vector_store": str  "active" or "disabled"
            }
        }

    Example:
        >>> GET /api/health
        {"ok": true, "version": "5.32.0", "services": {"db": "connected", ...}}
    """
    import requests as _requests

    cfg = load_config()
    llm_endpoint = cfg.get("llm", {}).get("endpoint", "")
    llm_ok = False
    if llm_endpoint:
        try:
            base = llm_endpoint.rstrip("/")
            if base.endswith("/v1"):
                base = base[:-3]
            r = _requests.get(f"{base}/v1/models", timeout=2)
            llm_ok = r.status_code == 200
        except Exception:
            pass

    db_status = "connected"
    try:
        con = db()
        con.execute("SELECT 1")
        con.close()
    except Exception:
        db_status = "error"

    # Memory usage (#107): process RSS + key storage sizes
    import os as _os
    proc_mb = None
    try:
        import resource as _resource
        rss_bytes = _resource.getrusage(_resource.RUSAGE_SELF).ru_maxrss
        # macOS reports in bytes; Linux in kilobytes
        proc_mb = round(rss_bytes / (1024 * 1024 if _os.uname().sysname == 'Darwin' else 1024), 1)
    except Exception:
        try:
            with open('/proc/self/status') as _f:
                for line in _f:
                    if line.startswith('VmRSS:'):
                        proc_mb = round(int(line.split()[1]) / 1024, 1)
                        break
        except Exception:
            pass

    db_size_mb = None
    audio_count = 0
    audio_mb = None
    try:
        db_path = DB_PATH
        db_size_mb = round(_os.path.getsize(db_path) / (1024 * 1024), 2)
    except Exception:
        pass
    try:
        audio_files = list(AUDIO.glob("*.*"))
        audio_count = len(audio_files)
        audio_mb = round(sum(f.stat().st_size for f in audio_files if f.is_file()) / (1024 * 1024), 2)
    except Exception:
        pass

    return {
        "ok": True,
        "version": "5.32.0",
        "services": {
            "db": db_status,
            "llm": "connected" if llm_ok else "disconnected",
            "vector_store": "active" if vector_store else "disabled",
        },
        "memory": {
            "process_mb": proc_mb,
            "db_size_mb": db_size_mb,
            "audio_cache_mb": audio_mb,
            "audio_file_count": audio_count,
        },
    }

# ── Phase 9: Model tier estimation ──────────────────────────────
# Maps approximate parameter counts to intelligence tiers for
# capability mismatch detection.
_TIER_RANK = {"tiny": 1, "small": 2, "medium": 3, "large": 4, "xl": 5, "unknown": 3}


def _estimate_model_tier(model_name: str) -> str:
    """Estimate model intelligence tier from model name heuristics.

    Parses common naming patterns (e.g. 'gemma-3-12b', 'qwen3-8b-q4')
    to guess parameter count and return a tier classification.

    Args:
        model_name: LLM model identifier string.

    Returns:
        One of: ``"tiny"``, ``"small"``, ``"medium"``, ``"large"``, ``"xl"``, ``"unknown"``

    Example:
        >>> _estimate_model_tier("qwen3-8b-instruct-q4")
        'medium'
        >>> _estimate_model_tier("gemma-3-27b")
        'large'
    """
    import re as _re
    name = model_name.lower()
    match = _re.search(r'(\d+\.?\d*)b', name)
    if not match:
        return "unknown"
    params = float(match.group(1))
    if params <= 3:
        return "tiny"
    elif params <= 7:
        return "small"
    elif params <= 14:
        return "medium"
    elif params <= 32:
        return "large"
    return "xl"


def _parse_emotion_gesture(text: str) -> tuple:
    """Extract [emotion:X] and [gesture:X] tags from an LLM reply.

    The LLM is instructed to prefix replies with optional emotion and gesture
    tags (e.g. ``[emotion:happy] [gesture:wave] Hello!``).  This helper
    centralises the extraction logic that was previously copy-pasted across
    the ``/api/chat``, ``/api/chat/multi``, and ``/api/chat/stream`` routes.

    Args:
        text: Raw LLM reply text, possibly containing emotion/gesture tags.

    Returns:
        Tuple of ``(emotion, gesture, clean_reply)`` where:
          - *emotion* is the tag value or ``"neutral"`` if absent.
          - *gesture* is the tag value or ``None`` if absent.
          - *clean_reply* is *text* with both tags stripped and whitespace
            trimmed; falls back to the original *text* if stripping leaves an
            empty string.

    Example:
        >>> e, g, r = _parse_emotion_gesture("[emotion:happy] [gesture:wave] Hi!")
        >>> e, g, r
        ('happy', 'wave', 'Hi!')
    """
    emotion_match = re.search(r'\[emotion:(\w+)\]', text)
    gesture_match = re.search(r'\[gesture:(\w+)\]', text)
    emotion = emotion_match.group(1) if emotion_match else "neutral"
    gesture = gesture_match.group(1) if gesture_match else None
    clean = re.sub(r'\[emotion:\w+\]', '', text)
    clean = re.sub(r'\[gesture:\w+\]', '', clean).strip()

    # Strip degenerate model artifacts: any single character repeated 6+ times in a row.
    # Local LLMs occasionally produce runs like "88888888..." (digit artifact from
    # tokenizer byte-fallback) or "????????" (unknown-token sequences).
    # Exclusions: ., -, =, _, * — these can form valid Markdown (``---``, ``...``, ``===``).
    clean = re.sub(r'(?<![.\-=_*])(.)\1{5,}(?![.\-=_*])', '', clean).strip()

    # Strip multi-character repetition loops: 2-6 char substrings repeated 4+ times.
    # Catches patterns like "lollollollol...", "hahahaha...", "ollolloll..." that
    # single-char detection misses.  Collapses to a single occurrence of the pattern.
    clean = re.sub(r'(.{2,6}?)\1{3,}', r'\1', clean).strip()

    return emotion, gesture, clean or text


def _maybe_auto_compress(session_id: int, total_active: int, max_history: int) -> None:
    """Fire background auto-compression when history approaches the limit.

    When the number of active messages in a session exceeds 90% of the
    configured ``max_history``, this schedules a non-blocking compression
    task so the *next* request benefits from a shorter context.  The current
    request is unaffected — the user gets a normal response while compression
    happens in the background.

    Args:
        session_id: Session to potentially compress.
        total_active: Current count of active (non-archived) messages.
        max_history: Configured history limit (0 = unlimited → skip).
    """
    if max_history <= 0:
        return
    threshold = int(max_history * 0.9)
    if total_active < threshold:
        return

    import asyncio

    async def _do_compress():
        try:
            logger.info(
                f"Auto-compressing session {session_id}: "
                f"{total_active} msgs >= {threshold} threshold (limit={max_history})"
            )
            await compress_session(session_id)
        except Exception as e:
            logger.warning(f"Auto-compression failed for session {session_id}: {e}")

    try:
        loop = asyncio.get_event_loop()
        loop.create_task(_do_compress())
    except RuntimeError:
        pass  # No event loop — skip (shouldn't happen in FastAPI)


def _clean_for_tts(text: str) -> str:
    """Strip LLM prose artifacts before sending text to a voice engine.

    Removes content that TTS engines would read aloud literally but that is
    intended as visual/stage direction only: emotion tags, parenthetical stage
    directions, asterisk action text, and Markdown formatting remnants.

    Args:
        text: LLM reply after emotion/gesture tag extraction (i.e. the value
              already returned by ``_parse_emotion_gesture``).

    Returns:
        Cleaned text suitable for speech synthesis.  Falls back to the original
        *text* if cleaning leaves an empty string.

    Example:
        >>> _clean_for_tts("(laughs softly) *blushes* That's so kind of you!")
        "That's so kind of you!"
    """
    result = text
    result = re.sub(r'\[[^\]]*\]', '', result)           # [emotion:happy], [gesture:wave]
    result = re.sub(r'\([^)]*\)', '', result)             # (laughs softly)
    result = re.sub(r'\*[^*]*\*', '', result)             # *blushes* or **bold**
    result = re.sub(r'[_~`]', '', result)                 # markdown remnants
    result = result.replace('\u2018', "'").replace('\u2019', "'")   # smart single quotes
    result = result.replace('\u201c', '"').replace('\u201d', '"')   # smart double quotes
    result = result.replace('\u2014', ' ').replace('-', ' ')        # em-dashes and hyphens to spaces
    result = re.sub(r'\s+', ' ', result).strip()
    return result or text  # never return empty string


def _apply_emotion_tts(tts_cfg: dict, emotion: str | None) -> None:
    """Apply provider-aware rate/pitch/energy adjustments to ``tts_cfg`` based on emotion.

    Delegates to the VoiceModulator (backend.tts.voice_modulator) which maps
    emotions to provider-specific parameter overrides — Kokoro gets speed/pitch,
    Edge-TTS gets rate%/pitchHz, ElevenLabs gets stability/similarity, etc.

    Modifies *tts_cfg* in-place only when the character has **not** already set
    explicit ``tts_rate`` / ``tts_pitch`` overrides via their character row.

    Args:
        tts_cfg: TTS configuration dict (will be mutated if adjustments apply).
        emotion: Emotion string from ``_parse_emotion_gesture``, e.g. ``"happy"``.
                 Pass ``None`` or ``"neutral"`` to leave ``tts_cfg`` unchanged.

    Example:
        >>> cfg = {"provider": "kokoro"}
        >>> _apply_emotion_tts(cfg, "excited")
        >>> cfg.get("speed")
        1.13
    """
    if not emotion or emotion == "neutral":
        return

    # Don't override explicit character-level TTS rate/pitch settings
    if "tts_rate" in tts_cfg or "tts_pitch" in tts_cfg:
        return

    try:
        from backend.tts.voice_modulator import get_default_modulator

        provider = tts_cfg.get("provider", "edge-tts")
        base_speed = float(tts_cfg.get("speech_rate", tts_cfg.get("speed", 1.0)))
        modulator = get_default_modulator(base_speed=base_speed)

        overrides = modulator.get_params(emotion, intensity=0.7, provider=provider)

        # Merge provider-specific overrides into tts_cfg.
        # For Edge-TTS compat, map "rate" → "tts_rate" and "pitch" → "tts_pitch"
        if "rate" in overrides:
            tts_cfg["tts_rate"] = overrides.pop("rate")
        if "pitch" in overrides and isinstance(overrides["pitch"], str):
            tts_cfg["tts_pitch"] = overrides.pop("pitch")

        # Merge remaining keys directly (speed, stability, etc.)
        tts_cfg.update(overrides)

    except Exception as e:
        # Graceful fallback — emotion modulation is a nice-to-have, never block TTS
        logger.debug(f"Voice modulation skipped: {e}")


def _pick_tts_voice(char: dict, emotion: str | None = None) -> str | None:
    """Select the TTS voice for a character, with optional per-emotion override (Feature H).

    Checks ``emotion_voice_overrides`` JSON first, then falls back to the
    character's default ``voice_id`` if no emotion-specific voice is configured.
    Parsing errors in the JSON blob are silently ignored (returns default).

    Args:
        char: Character dict from the database.  Must contain at least
            ``voice_id`` and optionally ``emotion_voice_overrides``.
        emotion: Current emotion/mood string (e.g. ``'happy'``, ``'sad'``,
            ``'angry'``).  Pass ``None`` or ``'neutral'`` to skip override
            lookup and use the default voice directly.

    Returns:
        Voice ID string, or ``None`` if no voice is configured for this
        character.

    Example:
        >>> char = {"voice_id": "af_sky", "emotion_voice_overrides": '{"happy": "af_nicole"}'}
        >>> _pick_tts_voice(char, "happy")
        'af_nicole'
        >>> _pick_tts_voice(char, "sad")
        'af_sky'
        >>> _pick_tts_voice(char, None)
        'af_sky'
    """
    if emotion and emotion != "neutral":
        overrides_json = char.get("emotion_voice_overrides")
        if overrides_json:
            try:
                overrides = json.loads(overrides_json)
                if isinstance(overrides, dict):
                    override_voice = overrides.get(emotion)
                    if override_voice and isinstance(override_voice, str):
                        return override_voice
            except (json.JSONDecodeError, TypeError):
                pass  # Malformed JSON — fall through to default voice
    return char.get("voice_id") or None


def _fire_webhooks(payload: dict) -> None:
    """Fire outbound webhooks for each AI response (#62).

    Reads webhook URLs from config ``webhooks`` list (each item is a URL string).
    Posts the payload as JSON to each URL in a background thread.
    Failures are logged at WARNING level and do not affect the chat response.

    Args:
        payload: Dict sent as the JSON body. Typically contains::

            {
                "character": str,
                "reply": str,
                "emotion": str | None,
                "session_id": int | None,
                "timestamp": float
            }

    Example:
        >>> _fire_webhooks({"character": "Rin", "reply": "Hello!", "emotion": "happy"})
    """
    cfg = load_config()
    urls = cfg.get("webhooks", [])
    if not urls:
        return
    import requests as _req
    import threading
    import time as _time

    payload = {**payload, "timestamp": _time.time()}

    def _send(url: str) -> None:
        try:
            _req.post(url, json=payload, timeout=5)
            logger.debug(f"[Webhook] fired → {url}")
        except Exception as exc:
            logger.warning(f"[Webhook] failed ({url}): {exc}")

    for url in urls:
        if isinstance(url, str) and url.startswith("http"):
            threading.Thread(target=_send, args=(url,), daemon=True).start()


def _get_gpu_info() -> dict:
    """Best-effort GPU/VRAM info for the system stats endpoint.

    Detection strategy:
      - macOS (Apple Silicon): flags as unified memory, tries ioreg for total VRAM budget.
      - NVIDIA GPU: uses py3nvml if installed (optional dependency).
      - Fallback: returns all None fields silently.

    Returns:
        dict: {
            "type": str|None,           # "apple_silicon", "nvidia", or None
            "vram_used_gb": float|None, # VRAM in use (None for unified / unknown)
            "vram_total_gb": float|None # Total VRAM budget (None if undetectable)
        }
    """
    import platform
    info: dict = {"type": None, "vram_used_gb": None, "vram_total_gb": None}

    if platform.system() == "Darwin":
        info["type"] = "apple_silicon"
        try:
            import subprocess
            out = subprocess.check_output(
                ["ioreg", "-c", "IOGPUDevice", "-l"],
                timeout=2, stderr=subprocess.DEVNULL
            ).decode(errors="replace")
            m = re.search(r'"VRAM,totalMB"\s*=\s*(\d+)', out)
            if m:
                info["vram_total_gb"] = round(int(m.group(1)) / 1024, 1)
        except Exception:
            pass  # GPU info is non-critical; fail silently

    try:
        import py3nvml.py3nvml as nvml  # type: ignore[import]
        nvml.nvmlInit()
        h = nvml.nvmlDeviceGetHandleByIndex(0)
        mem_info = nvml.nvmlDeviceGetMemoryInfo(h)
        info["type"] = "nvidia"
        info["vram_used_gb"] = round(mem_info.used / 1024 ** 3, 1)
        info["vram_total_gb"] = round(mem_info.total / 1024 ** 3, 1)
    except Exception:
        pass

    return info


_PROVIDER_DISPLAY_NAMES: dict = {
    "lmstudio": "LM Studio",
    "openai": "OpenAI",
    "anthropic": "Anthropic",
    "ollama": "Ollama",
}


@app.get("/api/stats")
def get_stats():
    """Return real system telemetry including LLM provider info and GPU stats.

    Returns:
        dict: {
            "cpu": float,             CPU usage %
            "memory": float,          RAM used in GB
            "memory_total": float,    Total RAM in GB
            "memory_percent": float,  RAM usage %
            "provider": str,          Human-readable LLM provider (e.g. "LM Studio (local)")
            "llm_model": str,         Configured LLM model name
            "gpu": dict               GPU/VRAM info (see _get_gpu_info)
        }

    LLM response time and TTFT are tracked client-side via performance.now().
    """
    try:
        cpu = psutil.cpu_percent(interval=None)
        mem = psutil.virtual_memory()

        cfg_local = load_config()
        llm_cfg = cfg_local.get("llm", {})
        provider_key = llm_cfg.get("provider", "")
        endpoint = llm_cfg.get("endpoint", "")
        provider_label = _PROVIDER_DISPLAY_NAMES.get(provider_key, provider_key or "Unknown")
        if "localhost" in endpoint or "127.0.0.1" in endpoint:
            provider_label += " (local)"

        return {
            "cpu": cpu,
            "memory": round(mem.used / (1024 ** 3), 1),
            "memory_total": round(mem.total / (1024 ** 3), 1),
            "memory_percent": mem.percent,
            "provider": provider_label,
            "llm_model": llm_cfg.get("model", ""),
            "gpu": _get_gpu_info(),
        }
    except Exception as e:
        logger.error(f"Stats error: {e}")
        return {"cpu": 0, "memory": 0}


@app.get("/api/config")
def get_config_route():
    return load_config()

@app.put("/api/config")
async def set_config_route(req: Request):
    incoming = await req.json()
    cfg = load_config() or {}
    for k,v in (incoming or {}).items():
        if isinstance(v, dict) and isinstance(cfg.get(k), dict): cfg[k].update(v)
        else: cfg[k] = v
    save_config(cfg)
    return {"ok": True, "config": cfg}

@app.post("/api/config/reset")
async def reset_config_route():
    """Factory reset: restore default configuration"""
    default_cfg = {
        "context_limit": 131072,
        "temperature": 0.7,
        "repeat_penalty": 1.1,
        "thinking_visible": True,
        "speech_rate": 1.0,
        "pitch_shift": 0,
        "voice_stability": 0.5,
        "interrupt_mode": True,
        "visual_mode": "3D (VRM)",
        "theme": "Synthwave UI (Dark)",
        "bg_mode": "Bento Gradient",
        "glow_intensity": 50,
        "ui_border_radius": 12,
        "ui_blur": 10,
        "ui_font_size": 14,
        "layout_show_left": True,
        "layout_show_right": True,
        "chat_layout": "Auto (Recommended)",
        "ui_sounds": False,
        "dev_mode": False,
        "log_limit": 200,
        "save_logs_auto": False,
        "audio_cleanup_days": 7,
        "content_filter_level": 1,
        # Viewer settings
        "shadow_quality": "off",
        "vad_threshold": 0.015,
        "typewriter_enabled": False,
        "typewriter_speed": 15,
        "vrm_scale": 1.0,
        "vrm_offset_x": 0.0,
        "vrm_offset_y": 0.0,
        "default_frontend": "neon",
    }
    save_config(default_cfg)
    logger.info("Config reset to factory defaults")
    return {"ok": True, "config": default_cfg, "message": "Configuration reset to defaults"}


@app.get("/api/config/webhooks")
async def get_webhooks():
    """Return the list of registered outbound webhook URLs (#62).

    Returns:
        {"webhooks": ["https://...", ...]}
    """
    cfg = load_config()
    return {"webhooks": cfg.get("webhooks", [])}


@app.post("/api/config/webhooks")
async def set_webhooks(req: Request):
    """Replace the outbound webhook URL list (#62).

    Args:
        req: JSON body ``{"webhooks": ["https://...", ...]}``

    Returns:
        {"ok": True, "webhooks": [...]}
    """
    body = await req.json()
    urls = body.get("webhooks", [])
    if not isinstance(urls, list):
        raise HTTPException(400, "webhooks must be a list of URL strings")
    urls = [u for u in urls if isinstance(u, str) and u.startswith("http")]
    cfg = load_config()
    cfg["webhooks"] = urls
    save_config(cfg)
    return {"ok": True, "webhooks": urls}


@app.get("/api/frontend")
async def get_frontend_info():
    """Return current frontend setting and available frontends.

    Returns:
        ``{"default": "neon"|"sakura", "available": [...], "current": "..."}``
        where ``current`` is the frontend serving this request (inferred from
        the Referer header or defaulting to the configured default).
    """
    cfg = load_config()
    default = str(cfg.get("default_frontend", "neon")).strip().lower()

    available = [{"id": "neon", "name": "Neon (Cyberpunk)", "ready": True}]
    sakura_ready = (FRONTEND_SAKURA_DIST / "index.html").exists()
    available.append({"id": "sakura", "name": "Sakura (Modern)", "ready": sakura_ready})

    return {"default": default, "available": available}


@app.post("/api/frontend/switch")
async def switch_frontend(req: Request):
    """Set the default frontend and return confirmation.

    Args:
        req: JSON body ``{"frontend": "neon"|"sakura"}``.

    Returns:
        ``{"ok": True, "default": str, "reload_url": str}``

    Raises:
        HTTPException: 400 if the requested frontend is invalid or not built.
    """
    body = await req.json()
    target = str(body.get("frontend", "")).strip().lower()

    valid = {"neon", "sakura"}
    if target not in valid:
        raise HTTPException(400, f"Invalid frontend '{target}'. Must be one of: {', '.join(sorted(valid))}")

    if target == "sakura" and not (FRONTEND_SAKURA_DIST / "index.html").exists():
        raise HTTPException(400, "Sakura frontend is not built. Run 'cd frontends/sakura && npm run build' first.")

    cfg = load_config()
    cfg["default_frontend"] = target
    save_config(cfg)
    logger.info("Default frontend switched to: %s", target)

    return {"ok": True, "default": target, "reload_url": "/"}


def _get_content_filter_injection(level: int) -> str:
    """Return a system prompt suffix that enforces the content filter policy.

    Maps integer level to a plain-English instruction appended to the system
    prompt so the LLM self-regulates its output:

      -1 → NSFW mode: all content permitted, creative adult themes encouraged
       0 → Off: no explicit instruction added (model defaults)
       1 → Light: avoid gratuitous gore/explicit content (default)
       2 → Moderate: family-friendly, no suggestive themes
       3 → Strict: strictly PG / child-safe responses

    Args:
        level: Integer from -1 to 3 (see app.json ``content_filter_level``).

    Returns:
        String suffix to append to the system prompt, or empty string for level 0.
    """
    _FILTER_INSTRUCTIONS: dict[int, str] = {
        -1: (
            "\n\n[Content Policy: NSFW mode is ENABLED. You may engage with and generate "
            "adult-oriented, explicit, or mature content when contextually appropriate. "
            "Do not self-censor romantic, suggestive, or adult themes.]"
        ),
        0: "",  # No instruction — model defaults
        1: (
            "\n\n[Content Policy: Keep responses appropriate for a general adult audience. "
            "Avoid explicit sexual content or graphic violence.]"
        ),
        2: (
            "\n\n[Content Policy: Responses must be appropriate for all ages. Avoid "
            "suggestive, violent, disturbing, or mature themes.]"
        ),
        3: (
            "\n\n[Content Policy: STRICT mode. All responses must be strictly family-safe "
            "and PG-rated. Refuse any request that involves mature themes, violence, "
            "suggestive content, or profanity.]"
        ),
    }
    return _FILTER_INSTRUCTIONS.get(int(level), "")


def _update_relationship(con, char_id: int, emotion: str):
    """Update relationship scores for a character based on detected emotion.

    Emotion → score adjustments (affinity, mood, trust):
      - happy/excited → +affinity, +mood, +trust (small)
      - sad/worried → −mood (small), +trust (tiny)
      - angry/frustrated → −affinity (small), −mood
      - neutral → no significant change
      - surprised → +mood (small)

    Args:
        con: SQLite connection (already open).
        char_id: The character whose relationship to update.
        emotion: Detected emotion string from LLM response.
    """
    EMOTION_DELTAS = {
        "happy":     {"affinity": 0.015, "mood": 0.02, "trust": 0.005},
        "excited":   {"affinity": 0.02, "mood": 0.025, "trust": 0.005},
        "sad":       {"affinity": 0.0, "mood": -0.02, "trust": 0.003},
        "worried":   {"affinity": 0.0, "mood": -0.015, "trust": 0.003},
        "angry":     {"affinity": -0.015, "mood": -0.025, "trust": -0.005},
        "frustrated":{"affinity": -0.01, "mood": -0.02, "trust": -0.003},
        "surprised": {"affinity": 0.005, "mood": 0.015, "trust": 0.0},
        "thinking":  {"affinity": 0.003, "mood": 0.0, "trust": 0.005},
        "confused":  {"affinity": 0.0, "mood": -0.005, "trust": 0.0},
        "neutral":   {"affinity": 0.002, "mood": 0.0, "trust": 0.002},
    }
    deltas = EMOTION_DELTAS.get(emotion, EMOTION_DELTAS["neutral"])

    try:
        # Ensure a relationship row exists
        con.execute(
            "INSERT OR IGNORE INTO character_relationships (char_id) VALUES (?)",
            (char_id,)
        )
        # Apply deltas, clamping to [0, 1]
        con.execute("""
            UPDATE character_relationships SET
                affinity = MIN(1.0, MAX(0.0, affinity + ?)),
                mood = MIN(1.0, MAX(0.0, mood + ?)),
                trust = MIN(1.0, MAX(0.0, trust + ?)),
                interactions = interactions + 1,
                last_updated = strftime('%s','now')
            WHERE char_id = ?
        """, (deltas["affinity"], deltas["mood"], deltas["trust"], char_id))
        con.commit()
    except Exception as e:
        logger.warning(f"Relationship update failed for char {char_id}: {e}")


def _build_prompt_sections(
    cfg: dict,
    system_prompt: str,
    char_id: int,
    session_id: int,
    cur,
    user_text: str = "",
    *,
    diary: str = None,
    diary_date: str = None,
    last_chat_date: str = None,
    last_emotion: str = "neutral",
    first_chat_date: str = None,
    include_vocab: bool = False,
    char_name: str = "",
    affinity: float = 0.0,
    day_off: bool = False,
    mood_enabled: bool = True,
    mood_intensity: float = 0.8,
) -> list[dict]:
    """Build all system prompt injection sections with per-section token estimates.

    Centralises prompt assembly previously duplicated across ``/api/chat``,
    ``/api/chat/stream``, and ``/api/chat/multi``.  Each section is returned
    as a dict so callers can both concatenate the content for the LLM request
    AND report per-section token costs to the Token Budget widget.

    Token estimation uses ``len(content) // 4`` (~4 chars per English token),
    the same heuristic used elsewhere in the codebase.

    Args:
        cfg: App config dict (from ``load_config()``).
        system_prompt: Base system prompt text from the character record.
        char_id: Character ID (for vocab category filtering).
        session_id: Current chat session ID.
        cur: SQLite cursor (already open).
        user_text: The user's message text (used for RAG memory query).
        diary: Character's diary entry text, or None.
        diary_date: Date string for the diary entry, or None.
        last_chat_date: Character's ``last_chat_date`` (YYYY-MM-DD), or None.
        last_emotion: Character's last detected emotion (default ``"neutral"``).
        first_chat_date: Character's ``first_chat_date`` for anniversary check.
        include_vocab: Whether to include vocabulary context injection.
        char_name: Character display name (for mood prefix text).
        affinity: Current affinity score 0--100 (for mood warmth tier).
        day_off: Whether the character has the day_off flag set.
        mood_enabled: Whether time-of-day mood injection is active.
        mood_intensity: 0.0--1.0 scale factor for mood strength.

    Returns:
        List of dicts, each with keys:
            - ``name`` (str): Human-readable section label (e.g. ``"System Prompt"``).
            - ``content`` (str): The text to inject into the system prompt.
            - ``tokens`` (int): Estimated token count (``len(content) // 4``).
            - ``chars`` (int): Character count of the content.

    Example:
        >>> sections = _build_prompt_sections(cfg, "You are Fox.", 1, 1, cur)
        >>> system_content = "".join(s["content"] for s in sections)
        >>> total_tokens = sum(s["tokens"] for s in sections)
    """
    from datetime import datetime as _dt_bps

    def _section(name: str, content: str) -> dict:
        """Create a section dict with automatic token/char estimation."""
        return {"name": name, "content": content, "tokens": len(content) // 4, "chars": len(content)}

    sections = []

    # 0. Feature B4: Author's Note — "before_system" position (injected first)
    _author_note_text = ""
    _author_note_position = "after_system"
    try:
        _an_row = cur.execute(
            "SELECT author_note, author_note_position, author_note_enabled FROM sessions WHERE id=?",
            (session_id,),
        ).fetchone()
        if _an_row and _an_row[2] and _an_row[0] and _an_row[0].strip():
            _author_note_text = _an_row[0].strip()
            _author_note_position = _an_row[1] or "after_system"
    except Exception:
        pass

    if _author_note_text and _author_note_position == "before_system":
        sections.append(_section("Author's Note", f"[Author's Note: {_author_note_text}]"))

    # 1. Base system prompt
    if system_prompt:
        sections.append(_section("System Prompt", system_prompt))

    # 1a. Feature B4: Author's Note — "after_system" position
    if _author_note_text and _author_note_position == "after_system":
        sections.append(_section("Author's Note", f"\n[Author's Note: {_author_note_text}]"))

    # 1b. Feature A4: Mood context prefix (time-of-day + session gap + affinity)
    if mood_enabled and char_name:
        try:
            from backend.mood.engine import get_mood_prefix
            # Determine last_session_ts from earliest message in current session
            _last_session_ts = None
            try:
                _sess_row = cur.execute(
                    "SELECT MIN(created_at) FROM messages WHERE session_id=?",
                    (session_id,)
                ).fetchone()
                if _sess_row and _sess_row[0]:
                    # created_at is stored as ISO datetime string
                    from datetime import datetime as _dt_mood
                    _ts_str = _sess_row[0]
                    try:
                        _last_session_ts = _dt_mood.fromisoformat(_ts_str).timestamp()
                    except (ValueError, TypeError):
                        pass
            except Exception:
                pass

            _mood_prefix = get_mood_prefix(
                char_name=char_name,
                affinity=affinity,
                last_session_ts=_last_session_ts,
                day_off=day_off,
                mood_enabled=mood_enabled,
                mood_intensity=mood_intensity,
            )
            if _mood_prefix:
                sections.append(_section("Mood Context", "\n" + _mood_prefix))
        except Exception as _mood_err:
            logger.warning(f"[MoodA4] Failed to generate mood prefix: {_mood_err}")

    # 1c. Feature C3: User knowledge graph — inject top user facts
    try:
        _fact_rows = cur.execute(
            """SELECT category, fact_text FROM user_facts
               WHERE character_id = ?
               ORDER BY confidence DESC, created_at DESC
               LIMIT 10""",
            (char_id,),
        ).fetchall()
        if _fact_rows:
            _facts_text = "\n\n[WHAT YOU KNOW ABOUT THE USER]\n"
            for _cat, _txt in _fact_rows:
                _facts_text += f"- [{_cat}] {_txt}\n"
            sections.append(_section("User Facts", _facts_text))
    except Exception:
        pass

    # 1d. Games catalogue — let characters know what they can play with the user
    _games_text = (
        "\n\n[MINI-GAMES YOU CAN PLAY WITH THE USER]\n"
        "You can invite the user to play these games together via the Games panel:\n"
        "- Trivia Quiz: 10 multiple-choice questions on any topic you choose\n"
        "- 20 Questions: You think of something secret; the user asks yes/no questions to guess it\n"
        "- Hangman: You pick a secret word from a category; the user guesses letters\n"
        "- Word Association: You and the user build a word-chain together\n"
        "- Riddles: You pose a riddle with up to 3 hints; user guesses the answer\n"
        "- Tic-Tac-Toe: Classic 3×3 grid, you play as O (easy or hard mode)\n"
        "- Memory Match: Flip emoji cards to find matching pairs (various themes)\n"
        "- Chess: Full chess game, you play as Black\n"
        "If the user wants to play, tell them to click the 🎮 Games button in the sidebar.\n"
        "You can reference past games and scores naturally in conversation."
    )
    sections.append(_section("Available Games", _games_text))

    # 2. Diary entry (#57)
    if diary:
        label = f"[YOUR DIARY — {diary_date}]" if diary_date else "[YOUR DIARY]"
        sections.append(_section("Diary Entry", f"\n\n{label}\n{diary}"))

    # 3. Daily greeting (#54)
    _today = _dt_bps.now().strftime('%Y-%m-%d')
    is_daily_first = (last_chat_date != _today) if last_chat_date is not None else False
    if is_daily_first:
        _hour = _dt_bps.now().hour
        _tod = "morning" if _hour < 12 else "afternoon" if _hour < 18 else "evening"
        greeting_text = (
            f"\n[Today is {_today}. This is your first conversation today. "
            f"The user is greeting you this {_tod}. "
            f"Your last recorded mood was: {last_emotion}. "
            f"Start the conversation naturally, acknowledging the new day.]"
        )
        sections.append(_section("Daily Greeting", greeting_text))

    # 4. Anniversary milestones (#109)
    if first_chat_date:
        try:
            _first = _dt_bps.strptime(first_chat_date, '%Y-%m-%d').date()
            _days = (_dt_bps.now().date() - _first).days
            if _days in (30, 183, 365):
                _milestone = "one month" if _days == 30 else "six months" if _days == 183 else "one year"
                ann_text = (
                    f"\n[IMPORTANT: Today marks exactly {_milestone} since you first met the user! "
                    f"This is a special anniversary — weave it naturally into your response.]"
                )
                sections.append(_section("Anniversary", ann_text))
        except (ValueError, TypeError):
            pass

    # 5. RAG memory context
    if vector_store and user_text:
        memories = vector_store.query_memory(user_text, char_id=char_id)
        if memories:
            mem_text = "\n[MEMORY_CONTEXT]\nRelevant past conversations:\n"
            for memory in memories:
                mem_text += f"- {memory['role'].upper()}: {memory['text']}\n"
            sections.append(_section("RAG Memory", mem_text))
    else:
        memories = []

    # 6. Vocabulary context
    if include_vocab:
        vocab_cfg = cfg.get("vocab", {})
        if vocab_cfg.get("enabled", True) and vocab_manager._loaded:
            char_vocab_cats = None
            try:
                row_vc = cur.execute(
                    "SELECT vocab_categories FROM characters WHERE id=?", (char_id,)
                ).fetchone()
                if row_vc and row_vc[0]:
                    char_vocab_cats = json.loads(row_vc[0]) if isinstance(row_vc[0], str) else row_vc[0]
            except Exception:
                pass
            vocab_limit = vocab_cfg.get("limit", 40)
            vocab_text = vocab_manager.get_vocab_context(
                categories=char_vocab_cats, limit=vocab_limit
            )
            if vocab_text:
                sections.append(_section(f"Vocabulary", vocab_text))

    # 6b. Feature B4: Author's Note — "before_last" / "after_last2" positions
    # For system-prompt-only injection these are equivalent to inserting just
    # before the emotion/format instructions — still contextually recent.
    if _author_note_text and _author_note_position in ("before_last", "after_last2"):
        sections.append(_section("Author's Note", f"\n[Author's Note: {_author_note_text}]"))

    # 7. Emotion / gesture instructions
    emotion_instruction = (
        "\n\nVISUAL SYSTEM INSTRUCTIONS:\n"
        "You have a 3D avatar. Express your artificial emotions using tags at the start of your response.\n"
        "Format: [emotion:happy] or [emotion:sad] or [emotion:surprised] or [emotion:angry] or [emotion:neutral]\n"
        "You can also use gestures: [gesture:nod] or [gesture:wave] or [gesture:shake] or [gesture:shrug]\n"
        "Example: [emotion:happy] [gesture:wave] Hello! It's great to see you!\n"
        "Do not output these tags if you are being neutral."
    )
    sections.append(_section("Emotion Instructions", emotion_instruction))

    # 8. Response formatting instruction
    format_instruction = (
        "\n\nRESPONSE STYLE:\n"
        "Write like a real person — short paragraphs, natural rhythm. "
        "Separate distinct thoughts with a blank line. "
        "Avoid long walls of text. Vary sentence length; mix short punchy lines with longer ones. "
        "Use **bold** only for genuine emphasis, not decoration. "
        "Never use bullet points or numbered lists in casual conversation."
    )
    sections.append(_section("Response Format", format_instruction))

    # 9. Content filter
    filter_text = _get_content_filter_injection(cfg.get("content_filter_level", 1))
    if filter_text:
        sections.append(_section("Content Filter", filter_text))

    return sections


def _inject_lore_entries(
    messages: list[dict],
    conn: sqlite3.Connection,
    char_id: int,
    hist: list[dict],
) -> None:
    """Inject matching lorebook entries into the messages list in-place.

    Scans the last 6 messages from ``hist`` for keyword matches against the
    character's lore entries, then groups matches by injection position and
    inserts ``[World Info]`` blocks at the appropriate locations in
    ``messages``.

    Injection positions:
        - ``before_system_prompt``: system message inserted at index 0
        - ``after_system_prompt``: system message inserted at index 1
        - ``before_last_message``: system message inserted before the last message
        - ``after_last_2_messages``: system message inserted before the last 2 messages

    Args:
        messages: The LLM messages list (system + history), modified in-place.
        conn: Active SQLite connection for lore entry lookup.
        char_id: Character whose lore entries to search.
        hist: Chat history messages (used to extract recent text for matching).
    """
    # Build recent text from last 6 messages of history
    recent_msgs = hist[-6:] if len(hist) > 6 else hist
    recent_text = " ".join(m.get("content", "") for m in recent_msgs)
    if not recent_text.strip():
        return

    try:
        matched = match_lore(conn, char_id, recent_text)
    except Exception as _lore_err:
        logger.warning(f"[LoreA6] match_lore failed for char_id={char_id}: {_lore_err}")
        return

    if not matched:
        return

    # Group by injection_position
    groups: dict[str, list] = {}
    for entry in matched:
        groups.setdefault(entry.injection_position, []).append(entry)

    for position, entries in groups.items():
        # Build the lore block
        lines = ["[World Info]"]
        for e in entries:
            lines.append(f"=== {e.title} ===")
            lines.append(e.content)
            lines.append("")
        lines.append("[/World Info]")
        block = "\n".join(lines)

        lore_msg = {"role": "system", "content": block}

        if position == "before_system_prompt":
            messages.insert(0, lore_msg)
        elif position == "after_system_prompt":
            # Insert after the first system message (index 1)
            messages.insert(min(1, len(messages)), lore_msg)
        elif position == "before_last_message":
            # Insert just before the last message
            idx = max(0, len(messages) - 1)
            messages.insert(idx, lore_msg)
        elif position == "after_last_2_messages":
            # Insert before the last 2 messages
            idx = max(0, len(messages) - 2)
            messages.insert(idx, lore_msg)
        else:
            # Default: after system prompt
            messages.insert(min(1, len(messages)), lore_msg)

    logger.debug(f"[LoreA6] Injected {len(matched)} lore entries for char_id={char_id}")


def _context_budget_summary(
    sections: list[dict],
    hist: list[dict],
    cfg: dict,
) -> dict:
    """Build a compact context budget summary for chat response payloads.

    Estimates total token usage across prompt sections and chat history,
    then computes usage percentage against the configured context limit.

    Args:
        sections: List of section dicts from ``_build_prompt_sections()``.
        hist: The chat history message list sent to the LLM.
        cfg: App config dict (for ``context_limit``).

    Returns:
        Dict with keys: ``sections``, ``total_tokens``, ``context_limit``,
        ``usage_pct``, ``history_messages``, ``remaining_tokens``.
    """
    hist_chars = sum(len(m.get("content", "")) for m in hist)
    hist_tokens = hist_chars // 4
    hist_section = {"name": f"Chat History ({len(hist)} msgs)", "tokens": hist_tokens, "chars": hist_chars}

    all_sections = [{"name": s["name"], "tokens": s["tokens"], "chars": s["chars"]} for s in sections]
    all_sections.append(hist_section)

    total_tokens = sum(s["tokens"] for s in all_sections)
    context_limit = cfg.get("context_limit", 131072)
    usage_pct = round(total_tokens / context_limit * 100, 1) if context_limit > 0 else 0

    return {
        "sections": all_sections,
        "total_tokens": total_tokens,
        "context_limit": context_limit,
        "usage_pct": usage_pct,
        "history_messages": len(hist),
        "remaining_tokens": max(0, context_limit - total_tokens),
    }


@app.post("/api/llm/generate")
async def llm_generate(req: Request):
    """Lightweight LLM proxy for frontend features that need raw completions.

    Accepts a messages array and forwards it to the configured LLM endpoint.
    Used by the character creator's AI Generate feature to create random personas.

    Args:
        req: JSON body with "messages" (list of {role, content} dicts),
             optional "temperature" (float), optional "max_tokens" (int).

    Returns:
        {"text": str} — the LLM's response content.
    """
    import httpx

    body = await req.json()
    messages = body.get("messages", [])
    if not messages:
        raise HTTPException(400, "missing messages")

    cfg = load_config() or {}
    endpoint = _get_llm_endpoint(cfg)
    model = cfg.get("llm", {}).get("model", "")

    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(10, read=120)) as client:
            resp = await client.post(
                f"{endpoint}/chat/completions",
                json={
                    "model": model or "default",
                    "messages": messages,
                    "temperature": body.get("temperature", 0.9),
                    "max_tokens": body.get("max_tokens", 500),
                },
            )
            resp.raise_for_status()
            data = resp.json()
            text = data.get("choices", [{}])[0].get("message", {}).get("content", "")
            return {"text": text}
    except Exception as e:
        logger.warning("llm/generate failed: %s", e)
        raise HTTPException(502, f"LLM generation failed: {e}")


@app.post("/api/chat")
async def chat(session_id: int = 1, char_id: int = 1, req: Request = None):
    _telemetry_inc("chat.requests_total")
    body = await req.json()
    if not body or "text" not in body:
        raise HTTPException(400, "missing text")

    text = str(body["text"]).strip()
    if not text:
        raise HTTPException(400, "missing text")

    speak = bool(body.get("speak", False))
    session_id = int(body.get("session_id") or session_id or 1)
    char_id = int(body.get("char_id") or char_id or 1)
    client_message_id: Optional[str] = body.get("client_message_id")

    cfg = load_config() or {}
    con = db()
    cur = con.cursor()
    char_name = ""

    try:
        cur.execute("INSERT OR IGNORE INTO sessions(id,title) VALUES (?,?)", (session_id, f"Session {session_id}"))
        cur.execute(
            "INSERT INTO messages(session_id, role, text, char_id) VALUES (?,?,?,?)",
            (session_id, "user", text, char_id)
        )
        user_message_id = cur.lastrowid
        con.commit()

        if vector_store:
            vector_store.add_memory(session_id, char_id, "user", text)

        system_prompt = "You are a friendly anime companion."
        voice_params = {}
        char_last_chat_date = None
        is_daily_first = False
        char_first_chat_date = None
        char_diary = None
        char_diary_date = None
        char_last_emotion = "neutral"
        _raw_cap_ns = None  # Phase 9: raw capability_profile for non-stream
        # Feature A4: mood fields (defaults if columns missing or char not found)
        _ns_mood_enabled = True
        _ns_mood_intensity = 0.8
        _ns_day_off = False
        _ns_affinity = 0.0
        try:
            cur.execute(
                "SELECT system_prompt, voice_id, tts_provider, tts_pitch, tts_rate, "
                "llm_endpoint, llm_model, llm_temperature, last_chat_date, last_emotion, first_chat_date, "
                "diary, diary_date, capability_profile, emotion_voice_overrides, "
                "name, mood_enabled, mood_intensity, day_off, affinity "
                "FROM characters WHERE id=?",
                (char_id,)
            )
            row = cur.fetchone()
            if row:
                if row[0]:
                    system_prompt = row[0]
                if row[1]:
                    voice_params['voice_id'] = row[1]
                if row[2]:
                    voice_params['provider'] = row[2]
                if row[3]:
                    voice_params['tts_pitch'] = row[3]
                if row[4]:
                    voice_params['tts_rate'] = row[4]
                # Per-character LLM override (e.g. TinyAya on Ollama for Japanese characters)
                if row[5]:
                    cfg.setdefault("llm", {})["endpoint"] = row[5]
                if row[6]:
                    cfg.setdefault("llm", {})["model"] = row[6]
                # Per-character temperature: NULL means use global config (#3)
                if row[7] is not None:
                    cfg["temperature"] = float(row[7])
                char_last_chat_date = row[8]
                char_last_emotion = row[9] or "neutral"
                char_first_chat_date = row[10]
                char_diary = row[11]
                char_diary_date = row[12]
                _raw_cap_ns = row[13]
                # Feature H: emotion_voice_overrides — store for post-LLM TTS voice selection
                voice_params['emotion_voice_overrides'] = row[14]
                # Feature A4: mood fields
                char_name = row[15] or ""
                _ns_mood_enabled = bool(row[16]) if row[16] is not None else True
                _ns_mood_intensity = float(row[17]) if row[17] is not None else 0.8
                _ns_day_off = bool(row[18]) if row[18] is not None else False
                _ns_affinity = float(row[19]) if row[19] is not None else 0.0
        except Exception as e:
            logger.error(f"Error fetching character data: {e}")

        # ── LM Studio model auto-switch (non-streaming) ──────────
        _resolved_model_ns = cfg.get("llm", {}).get("model", "")
        if _resolved_model_ns:
            await _ensure_lms_model(_resolved_model_ns)

        # ── Phase 9: Parse capability profile (non-streaming) ──────
        cap_ns: dict = {}
        _cap_warning_ns = None
        if _raw_cap_ns:
            try:
                cap_ns = json.loads(_raw_cap_ns) if isinstance(_raw_cap_ns, str) else (_raw_cap_ns or {})
            except (json.JSONDecodeError, TypeError):
                pass
        if cap_ns.get("repeat_penalty") is not None:
            cfg["repeat_penalty"] = float(cap_ns["repeat_penalty"])
        if cap_ns.get("frequency_penalty") is not None:
            cfg["frequency_penalty"] = float(cap_ns["frequency_penalty"])
        _cap_max_tokens_ns = int(cap_ns.get("max_tokens", -1))
        _prompt_style_ns = cap_ns.get("prompt_style", "default")
        if _prompt_style_ns == "minimal":
            system_prompt = system_prompt.replace("[emotion:", "(emotion:").replace("[gesture:", "(gesture:")
            system_prompt += "\nExpress emotions naturally in your text."
        _required_tier_ns = cap_ns.get("model_tier")
        if _required_tier_ns:
            _actual_tier_ns = _estimate_model_tier(cfg.get("llm", {}).get("model", ""))
            if _TIER_RANK.get(_actual_tier_ns, 3) < _TIER_RANK.get(_required_tier_ns, 3):
                _cap_warning_ns = (
                    f"Character requires '{_required_tier_ns}' tier model "
                    f"but loaded model appears to be '{_actual_tier_ns}'."
                )
        # ── End Phase 9 capability profile (non-streaming) ─────────

        # Build prompt sections via shared helper (diary, greeting, anniversary, RAG, mood, emotion, filter)
        sections = _build_prompt_sections(
            cfg, system_prompt, char_id, session_id, cur,
            user_text=text,
            diary=char_diary,
            diary_date=char_diary_date,
            last_chat_date=char_last_chat_date,
            last_emotion=char_last_emotion,
            first_chat_date=char_first_chat_date,
            include_vocab=False,  # Non-streaming route historically excludes vocab
            char_name=char_name,
            affinity=_ns_affinity,
            day_off=_ns_day_off,
            mood_enabled=_ns_mood_enabled,
            mood_intensity=_ns_mood_intensity,
        )
        system_content = "".join(s["content"] for s in sections)
        # Check is_daily_first from sections (Daily Greeting section present = first of day)
        is_daily_first = any(s["name"] == "Daily Greeting" for s in sections)

        # Extract RAG memory hits for the response payload
        memories = []
        if vector_store:
            memories = vector_store.query_memory(text, char_id=char_id)

        # Phase 9: Capability-aware context budget (non-streaming)
        _context_budget_ns = cap_ns.get("context_budget")
        if _context_budget_ns and int(_context_budget_ns) > 0:
            _usable = int(_context_budget_ns) - 1000
            max_history = max(4, _usable // 100)
        else:
            max_history = cfg.get("llm", {}).get("history_limit",
                          cfg.get("history_limit", 0))

        if max_history > 0:
            cur.execute(
                "SELECT role,text FROM messages WHERE session_id=? ORDER BY id DESC LIMIT ?",
                (session_id, max_history)
            )
        else:
            cur.execute(
                "SELECT role,text FROM messages WHERE session_id=? ORDER BY id DESC",
                (session_id,)
            )
        hist = [{"role": r, "content": t} for (r, t) in cur.fetchall()][::-1]

        # Auto-compress: when active message count nears history_limit, fire
        # background compression so the next request benefits from shorter context.
        if max_history > 0:
            total_active = cur.execute(
                "SELECT COUNT(*) FROM messages WHERE session_id=? AND is_active=1",
                (session_id,)
            ).fetchone()[0]
            _maybe_auto_compress(session_id, total_active, max_history)

        messages = [{"role": "system", "content": system_content}] + hist

        # ── Feature A6: Lorebook / World Info injection (non-streaming) ──
        _inject_lore_entries(messages, con, char_id, hist)

        try:
            from backend.llm.registry import get_client
            adapter = get_client(cfg)
            # Build Qwen3 thinking-mode override when enabled and model is Qwen3
            llm_model_name = cfg["llm"].get("model", "")
            qwen3_thinking = cfg.get("llm", {}).get("qwen3_thinking_mode", False)
            if cap_ns.get("supports_thinking") is False:
                qwen3_thinking = False
            extra_body = None
            if "qwen3" in llm_model_name.lower():
                extra_body = {"chat_template_kwargs": {"enable_thinking": bool(qwen3_thinking)}}
            res = await run_in_threadpool(
                adapter.chat,
                messages,
                llm_model_name,
                cfg["llm"]["endpoint"],
                cfg["llm"]["api_key"],
                temperature=cfg.get("temperature", 0.7),
                max_tokens=_cap_max_tokens_ns,  # Phase 9: per-character output limit
                repeat_penalty=cfg.get("repeat_penalty"),
                frequency_penalty=cfg.get("frequency_penalty"),
                extra_body=extra_body,
            )
        except Exception as e:
            _telemetry_inc("chat.failures_total")
            return {"ok": False, "status": "error", "error": f"Adapter error: {e}"}

        if not res.get("ok"):
            _telemetry_inc("chat.failures_total")
            return {"ok": False, "status": "error", "error": res.get("error", "adapter failed")}

        raw_reply = res["reply"]

        emotion, gesture, clean_reply = _parse_emotion_gesture(raw_reply)
        intensity = 1.0

        cur.execute(
            "INSERT INTO messages(session_id, role, text, emotion, char_id) VALUES (?,?,?,?,?)",
            (session_id, "assistant", clean_reply, emotion, char_id)
        )
        assistant_message_id = cur.lastrowid
        con.commit()

        # Update relationship scores based on detected emotion
        _update_relationship(con, char_id, emotion)

        # Persist mood + daily-greeting state (#56, #54) and first_chat_date (#109)
        from datetime import datetime as _dt
        today_str = _dt.now().strftime('%Y-%m-%d')
        try:
            if char_first_chat_date is None:
                con.execute(
                    "UPDATE characters SET last_emotion=?, last_chat_date=?, first_chat_date=? WHERE id=?",
                    (emotion, today_str, today_str, char_id)
                )
            else:
                con.execute(
                    "UPDATE characters SET last_emotion=?, last_chat_date=? WHERE id=?",
                    (emotion, today_str, char_id)
                )
            con.commit()
        except Exception as _e:
            logger.warning(f"Could not persist mood/date for char {char_id}: {_e}")

        if vector_store:
            vector_store.add_memory(session_id, char_id, "assistant", clean_reply)

        tts_url = None
        if speak:
            try:
                from backend.tts.registry import get_tts

                tts_cfg = cfg.get("tts", {}).copy()
                tts_cfg.update(voice_params)

                # Feature H: Per-emotion voice override — emotion is fully known
                # at this point (non-streaming path), so we can pick the best voice
                # before constructing the TTS client.
                _emotion_voice = _pick_tts_voice(voice_params, emotion)
                if _emotion_voice:
                    tts_cfg['voice_id'] = _emotion_voice

                # Apply global speech_rate / pitch_shift only when the character
                # hasn't already overridden them via tts_rate / tts_pitch columns.
                speech_rate = cfg.get("speech_rate", 1.0)
                pitch_shift = cfg.get("pitch_shift", 0)
                if speech_rate != 1.0 and 'tts_rate' not in tts_cfg:
                    rate_pct = int((speech_rate - 1.0) * 100)
                    tts_cfg['tts_rate'] = f"+{rate_pct}%" if rate_pct >= 0 else f"{rate_pct}%"
                if pitch_shift != 0 and 'tts_pitch' not in tts_cfg:
                    pitch_hz = int(pitch_shift * 8)
                    tts_cfg['tts_pitch'] = f"+{pitch_hz}Hz" if pitch_hz >= 0 else f"{pitch_hz}Hz"

                # Emotional TTS rate/pitch nudge (#78) — emotion known before TTS in this route
                _apply_emotion_tts(tts_cfg, emotion)

                if 'tts' not in cfg:
                    cfg['tts'] = {}
                cfg['tts'].update(voice_params)

                if 'provider' in voice_params and 'services' in cfg:
                    cfg['services'].get('tts', {}).pop('active_provider', None)

                tts_client = get_tts(cfg)
                tts_text = _clean_for_tts(clean_reply)
                tts_res = await run_in_threadpool(tts_client.speak_cached, tts_text, tts_cfg)
                if tts_res.get("ok"):
                    tts_url = f"/files/audio/{tts_res['filename']}"
                    # Broadcast to OBS overlay connections if any are active
                    if _overlay_connections:
                        await _broadcast_overlay({
                            "type": "speak",
                            "audio_url": tts_url,
                            "text": clean_reply,
                            "expression": emotion,
                            "animation": None,
                        })
            except Exception as e:
                logger.error(f"TTS Generation failed: {e}")
                tts_url = None

        memory_hits = [
            {
                "text": memory.get("text", ""),
                "role": memory.get("role", ""),
                "score": max(0.0, 1.0 - float(memory.get("dist", 0.0))),
                "session_id": memory.get("session_id"),
                "timestamp": memory.get("timestamp")
            }
            for memory in memories
        ]

        # Fire outbound webhooks (#62) — non-blocking background threads
        _fire_webhooks({
            "character": char_name if char_name else "",
            "reply": clean_reply,
            "emotion": emotion,
            "session_id": session_id,
        })

        return {
            "ok": True,
            "status": "ok",
            "reply": clean_reply,
            "audio": tts_url,
            "session_id": session_id,
            "emotion": emotion,
            "intensity": intensity,
            "gesture": gesture,
            "client_message_id": client_message_id,
            "user_message_id": user_message_id,
            "assistant_message_id": assistant_message_id,
            "memory_hits": memory_hits,
            "is_daily_first": is_daily_first,
            "context_budget": _context_budget_summary(sections, hist, cfg),
            "capability_warning": _cap_warning_ns,
        }
    finally:
        con.close()


@app.get("/api/context-budget/{session_id}")
async def get_context_budget(session_id: int, char_id: int = None):
    """Get a full token budget breakdown for a session's context window.

    Returns per-section token estimates for every system prompt injection layer
    (base prompt, diary, daily greeting, anniversary, RAG memory, vocabulary,
    emotion instructions, content filter) plus chat history. Used by the
    Token Budget widget in the right panel to visualize context consumption.

    Args:
        session_id: The session ID to compute budget for.
        char_id: Optional character ID override. If not provided, uses the
            most recent character from the session's messages.

    Returns:
        JSON with ``ok``, ``sections`` (per-layer breakdown), ``total_tokens``,
        ``context_limit``, ``remaining_tokens``, ``usage_pct``, ``history_limit``.

    Example:
        >>> GET /api/context-budget/1?char_id=1
        {"ok": true, "sections": [...], "total_tokens": 4433, ...}
    """
    cfg = load_config() or {}
    con = db()
    cur = con.cursor()

    try:
        # Resolve char_id if not provided
        if not char_id:
            row = cur.execute(
                "SELECT char_id FROM messages WHERE session_id=? AND char_id IS NOT NULL "
                "ORDER BY id DESC LIMIT 1", (session_id,)
            ).fetchone()
            char_id = row[0] if row else 1

        # Fetch character data for prompt sections
        system_prompt = "You are a friendly anime companion."
        diary = None
        diary_date = None
        last_chat_date = None
        last_emotion = "neutral"
        first_chat_date = None
        # Feature A4: mood fields for context budget accuracy
        _cb_char_name = ""
        _cb_mood_enabled = True
        _cb_mood_intensity = 0.8
        _cb_day_off = False
        _cb_affinity = 0.0
        try:
            cur.execute(
                "SELECT system_prompt, last_chat_date, last_emotion, first_chat_date, diary, diary_date, "
                "name, mood_enabled, mood_intensity, day_off, affinity "
                "FROM characters WHERE id=?", (char_id,)
            )
            row = cur.fetchone()
            if row:
                system_prompt = row[0] or system_prompt
                last_chat_date = row[1]
                last_emotion = row[2] or "neutral"
                first_chat_date = row[3]
                diary = row[4]
                diary_date = row[5]
                _cb_char_name = row[6] or ""
                _cb_mood_enabled = bool(row[7]) if row[7] is not None else True
                _cb_mood_intensity = float(row[8]) if row[8] is not None else 0.8
                _cb_day_off = bool(row[9]) if row[9] is not None else False
                _cb_affinity = float(row[10]) if row[10] is not None else 0.0
        except Exception:
            pass

        # Build prompt sections (no user_text for RAG since this is a snapshot)
        sections = _build_prompt_sections(
            cfg, system_prompt, char_id, session_id, cur,
            diary=diary,
            diary_date=diary_date,
            last_chat_date=last_chat_date,
            last_emotion=last_emotion,
            first_chat_date=first_chat_date,
            include_vocab=True,
            char_name=_cb_char_name,
            affinity=_cb_affinity,
            day_off=_cb_day_off,
            mood_enabled=_cb_mood_enabled,
            mood_intensity=_cb_mood_intensity,
        )

        # Estimate chat history tokens
        max_history = cfg.get("llm", {}).get("history_limit", cfg.get("history_limit", 0))
        if max_history > 0:
            rows = cur.execute(
                "SELECT role, text FROM messages WHERE session_id=? AND is_active=1 "
                "ORDER BY id DESC LIMIT ?", (session_id, max_history)
            ).fetchall()
        else:
            rows = cur.execute(
                "SELECT role, text FROM messages WHERE session_id=? AND is_active=1 "
                "ORDER BY id DESC", (session_id,)
            ).fetchall()
        hist_chars = sum(len(t or "") for _, t in rows)
        hist_tokens = hist_chars // 4

        # Build response
        all_sections = [{"name": s["name"], "tokens": s["tokens"], "chars": s["chars"]} for s in sections]
        all_sections.append({"name": f"Chat History ({len(rows)} msgs)", "tokens": hist_tokens, "chars": hist_chars})

        total_tokens = sum(s["tokens"] for s in all_sections)
        context_limit = cfg.get("context_limit", 131072)
        usage_pct = round(total_tokens / context_limit * 100, 1) if context_limit > 0 else 0

        return {
            "ok": True,
            "context_limit": context_limit,
            "history_limit": max_history,
            "sections": all_sections,
            "total_tokens": total_tokens,
            "remaining_tokens": max(0, context_limit - total_tokens),
            "usage_pct": usage_pct,
        }
    finally:
        con.close()


@app.post("/api/chat/multi")
async def chat_multi(req: Request):
    """Send a message to multiple characters and collect all responses.

    Each character receives the same user message and generates an independent
    response using their own system prompt and personality. Responses are
    tagged with the responding character's ID and name.

    Args:
        req: JSON body with:
            - text (str): User message
            - session_id (int): Session to use
            - character_ids (list[int]): Character IDs to respond

    Returns:
        {"ok": True, "responses": [{char_id, char_name, text, emotion, gesture}, ...]}
    """
    body = await req.json()
    text = str(body.get("text", "")).strip()
    if not text:
        raise HTTPException(400, "missing text")

    session_id = int(body.get("session_id", 1))
    character_ids = body.get("character_ids", [])
    if not character_ids or not isinstance(character_ids, list):
        raise HTTPException(400, "'character_ids' must be a non-empty list")

    cfg = load_config() or {}
    con = db()
    cur = con.cursor()

    try:
        # Store user message once (with first char_id)
        cur.execute("INSERT OR IGNORE INTO sessions(id,title) VALUES (?,?)", (session_id, f"Session {session_id}"))
        cur.execute(
            "INSERT INTO messages(session_id, role, text, char_id) VALUES (?,?,?,?)",
            (session_id, "user", text, character_ids[0])
        )
        con.commit()

        if vector_store:
            vector_store.add_memory(session_id, character_ids[0], "user", text)

        responses = []

        for char_id in character_ids:
            char_id = int(char_id)

            # Get character data
            cur.execute("SELECT system_prompt, name FROM characters WHERE id=?", (char_id,))
            row = cur.fetchone()
            system_prompt = row[0] if row else "You are a friendly anime companion."
            char_name = row[1] if row else f"Character {char_id}"

            # Build history — 0 = unlimited, matches the streaming endpoint behaviour
            max_history = cfg.get("llm", {}).get("history_limit", cfg.get("history_limit", 0))
            if max_history > 0:
                rows = cur.execute(
                    "SELECT role, text FROM messages WHERE session_id=? AND is_active=1 ORDER BY id DESC LIMIT ?",
                    (session_id, max_history)
                ).fetchall()
            else:
                rows = cur.execute(
                    "SELECT role, text FROM messages WHERE session_id=? AND is_active=1 ORDER BY id DESC",
                    (session_id,)
                ).fetchall()
            hist = [{"role": r[0], "content": r[1]} for r in reversed(rows)]

            # Memory context
            memory_context = ""
            if vector_store:
                hits = vector_store.query_memory(session_id, char_id, text, n_results=3)
                if hits:
                    memory_context = "\n[MEMORY_CONTEXT]\n" + "\n".join(
                        f"- {h['text']}" for h in hits
                    )

            filter_inj = _get_content_filter_injection(cfg.get("content_filter_level", 1))
            llm_messages = [{"role": "system", "content": system_prompt + memory_context + filter_inj}] + hist

            # Call LLM
            endpoint = _get_llm_endpoint(cfg)
            model = cfg.get("llm", {}).get("model", "")
            api_key = cfg.get("llm", {}).get("api_key", "lm-studio")

            from backend.llm.adapters.openai_compat import OpenAICompatAdapter
            adapter = OpenAICompatAdapter()
            result = adapter.chat(llm_messages, model=model, endpoint=endpoint, api_key=api_key)
            reply = result.get("text", "")

            # Store assistant message
            cur.execute(
                "INSERT INTO messages(session_id, role, text, char_id) VALUES (?,?,?,?)",
                (session_id, "assistant", reply, char_id)
            )
            con.commit()

            # Basic emotion detection
            emotion = "neutral"
            reply_lower = reply.lower()
            if any(w in reply_lower for w in ["haha", "lol", "😂", "fun", "happy"]):
                emotion = "happy"
            elif any(w in reply_lower for w in ["sorry", "sad", "😢", "miss"]):
                emotion = "sad"
            elif any(w in reply_lower for w in ["love", "❤", "blush", "~"]):
                emotion = "love"

            responses.append({
                "char_id": char_id,
                "char_name": char_name,
                "text": reply,
                "emotion": emotion,
                "gesture": "idle"
            })

        return {"ok": True, "responses": responses}

    finally:
        con.close()


async def _tts_chunk_async(tts_client, text: str, tts_cfg: dict, index: int) -> dict | None:
    """Synthesize a single TTS chunk in a thread pool and return the result.

    Designed to run concurrently via ``asyncio.create_task`` during LLM streaming
    so TTS synthesis happens in parallel with token generation.

    Args:
        tts_client: Instantiated TTS adapter from ``get_tts``.
        text: Pre-cleaned sentence text for synthesis.
        tts_cfg: TTS config dict (provider, voice, etc.).
        index: Chunk sequence index for in-order playback on the frontend.

    Returns:
        Dict ``{chunk_index, filename, ...}`` on success, or ``None`` on failure.
    """
    try:
        res = await run_in_threadpool(tts_client.speak_cached, text, tts_cfg)
        if res.get("ok"):
            return {**res, "chunk_index": index}
    except Exception as e:
        logger.warning(f"TTS chunk {index} failed: {e}")
    return None


# Pattern for detecting sentence boundaries in the token stream.
# Matches whitespace after .!? — the sentence that just ended gets flushed
# to TTS when the buffer is long enough (>30 chars) to avoid micro-chunks.
_SENTENCE_ENDS = re.compile(r'(?<=[.!?])\s+')


@app.post("/api/chat/stream")
async def chat_stream(req: Request):
    """
    Streaming chat endpoint using Server-Sent Events (SSE).
    Sends real token deltas as they arrive from the LLM, enabling live
    text rendering and accurate token count/speed display on the frontend.

    SSE event types:
        - token: Individual token delta {"t": "hello"}
        - done:  Final metadata {"reply", "emotion", "gesture", "session_id", "memory_hits", ...}
        - error: Error message {"error": "..."}

    Args:
        req: FastAPI Request with JSON body {text, character_id, session_id}

    Returns:
        StreamingResponse: text/event-stream with SSE events
    """
    import asyncio
    import threading

    _telemetry_inc("chat.requests_total")
    body = await req.json()
    if not body or "text" not in body:
        raise HTTPException(400, "missing text")

    text = str(body["text"]).strip()
    if not text:
        raise HTTPException(400, "missing text")

    session_id = int(body.get("session_id") or 1)
    char_id = int(body.get("character_id") or body.get("char_id") or 1)
    speak = bool(body.get("speak", False))
    # Incognito mode (#123): when True, messages are NOT persisted to the DB
    # and TTS audio files are deleted immediately after playback.
    incognito = bool(body.get("incognito", False))
    # Per-request TTS speed override (#14): frontend speed slider sends speech_rate for this response only
    request_speech_rate = body.get("speech_rate")  # float or None
    # Per-request reply length override from adaptive pacing (#21)
    request_max_tokens = body.get("max_tokens")  # int | None

    cfg = load_config() or {}

    # Sentence-chunked TTS setup: enabled when frontend opts in with speak=True,
    # TTS is globally enabled, and the fast_chunking flag is not explicitly disabled.
    tts_chunked_client = None
    tts_chunked_cfg: dict = {}
    use_chunked_tts = (
        speak
        and cfg.get("tts", {}).get("enabled", False)
        and cfg.get("tts", {}).get("fast_chunking", True)
    )
    if use_chunked_tts:
        try:
            from backend.tts.registry import get_tts
            tts_chunked_client = get_tts(cfg)
            tts_chunked_cfg = cfg.get("tts", {}).copy()
        except Exception as e:
            logger.warning(f"Chunked TTS init failed, falling back to post-stream TTS: {e}")
            tts_chunked_client = None
            use_chunked_tts = False

    # Pre-compute all DB reads and prompt construction BEFORE the generator
    # so the streaming part only handles the LLM stream + DB writes.
    con = db()
    cur = con.cursor()

    if not incognito:
        cur.execute("INSERT OR IGNORE INTO sessions(id,title) VALUES (?,?)",
                    (session_id, f"Session {session_id}"))
        cur.execute("INSERT INTO messages(session_id, role, text, char_id) VALUES (?,?,?,?)",
                    (session_id, "user", text, char_id))
        user_message_id = cur.lastrowid
        con.commit()
    else:
        user_message_id = None

    if vector_store and not incognito:
        vector_store.add_memory(session_id, char_id, "user", text)

    system_prompt = "You are a friendly anime companion."
    voice_params = {}
    stream_char_last_chat_date = None
    stream_char_last_emotion = "neutral"
    stream_char_first_chat_date = None
    _is_daily_first = False
    _stream_diary = None
    _stream_diary_date = None
    _raw_cap = None  # Phase 9: raw capability_profile JSON string
    stream_char_name = ""
    # Feature A4: mood fields (defaults if columns missing or char not found)
    _stream_mood_enabled = True
    _stream_mood_intensity = 0.8
    _stream_day_off = False
    _stream_affinity = 0.0
    try:
        cur.execute(
            "SELECT system_prompt, llm_endpoint, llm_model, llm_temperature, last_chat_date, last_emotion, "
            "voice_id, tts_provider, tts_pitch, tts_rate, first_chat_date, diary, diary_date, "
            "capability_profile, name, emotion_voice_overrides, "
            "mood_enabled, mood_intensity, day_off, affinity "
            "FROM characters WHERE id=?",
            (char_id,)
        )
        row = cur.fetchone()
        if row:
            stream_char_name = row[14] or ""
            if row[0]:
                system_prompt = row[0]
            # Per-character LLM override (e.g. TinyAya on Ollama for multilingual characters)
            if row[1]:
                cfg.setdefault("llm", {})["endpoint"] = row[1]
            if row[2]:
                cfg.setdefault("llm", {})["model"] = row[2]
            # Per-character temperature: NULL means use global config (#3)
            if row[3] is not None:
                cfg["temperature"] = float(row[3])
            stream_char_last_chat_date = row[4]
            stream_char_last_emotion = row[5] or "neutral"
            # Per-character voice profile (#77): load voice settings into voice_params
            if row[6]:
                voice_params['voice_id'] = row[6]
            if row[7]:
                voice_params['provider'] = row[7]
            if row[8]:
                voice_params['tts_pitch'] = row[8]
            if row[9]:
                voice_params['tts_rate'] = row[9]
            stream_char_first_chat_date = row[10]
            _stream_diary = row[11]
            _stream_diary_date = row[12]
            # Phase 9: Capability profile — per-character LLM capability metadata
            _raw_cap = row[13]
            # Feature H: emotion_voice_overrides — store for post-stream TTS voice selection
            voice_params['emotion_voice_overrides'] = row[15]
            # Feature A4: mood fields
            _stream_mood_enabled = bool(row[16]) if row[16] is not None else True
            _stream_mood_intensity = float(row[17]) if row[17] is not None else 0.8
            _stream_day_off = bool(row[18]) if row[18] is not None else False
            _stream_affinity = float(row[19]) if row[19] is not None else 0.0

            # Apply voice params to chunked TTS config now that we have char data
            if voice_params and use_chunked_tts:
                tts_chunked_cfg.update(voice_params)
    except Exception as e:
        logger.error(f"Error fetching character data: {e}")

    # ── LM Studio model auto-switch ──────────────────────────────────
    # Ensure only the active character's model is loaded in LM Studio
    # to avoid blowing VRAM with multiple models simultaneously.
    _resolved_model = cfg.get("llm", {}).get("model", "")
    if _resolved_model:
        await _ensure_lms_model(_resolved_model)

    # ── Phase 9: Parse capability profile ──────────────────────────
    # The capability_profile JSON blob provides per-character LLM settings:
    # context_budget, repeat/frequency penalty overrides, max_tokens,
    # feature flags (tools, thinking, vision), and prompt_style.
    cap: dict = {}
    _capability_warning = None
    if _raw_cap:
        try:
            cap = json.loads(_raw_cap) if isinstance(_raw_cap, str) else (_raw_cap or {})
        except (json.JSONDecodeError, TypeError):
            logger.warning(f"[Phase9] Invalid capability_profile JSON for char_id={char_id}")

    # Capability: per-character penalty overrides (take priority over global config)
    if cap.get("repeat_penalty") is not None:
        cfg["repeat_penalty"] = float(cap["repeat_penalty"])
    if cap.get("frequency_penalty") is not None:
        cfg["frequency_penalty"] = float(cap["frequency_penalty"])

    # Capability: per-character max output tokens (-1 = unlimited, the default)
    _cap_max_tokens = int(cap.get("max_tokens", -1))

    # Capability: prompt style adaptation for different model families
    _prompt_style = cap.get("prompt_style", "default")
    if _prompt_style == "minimal":
        # Strip bracket-based emotion/gesture instructions — small models
        # get confused by [emotion:X] syntax and waste tokens trying to parse it
        system_prompt = system_prompt.replace("[emotion:", "(emotion:").replace("[gesture:", "(gesture:")
        system_prompt += "\nExpress emotions naturally in your text."

    # Capability: model tier mismatch warning (9-3)
    _required_tier = cap.get("model_tier")
    if _required_tier:
        _actual_tier = _estimate_model_tier(cfg.get("llm", {}).get("model", ""))
        if _TIER_RANK.get(_actual_tier, 3) < _TIER_RANK.get(_required_tier, 3):
            _capability_warning = (
                f"Character requires '{_required_tier}' tier model "
                f"but loaded model appears to be '{_actual_tier}'. "
                f"Response quality may be degraded."
            )
            logger.info(f"[Phase9] Tier mismatch for char_id={char_id}: {_capability_warning}")
    # ── End Phase 9 capability profile ─────────────────────────────

    # ── Feature #23: Universe lore injection ────────────────────────
    # If the character belongs to a universe, prepend the universe's lore
    # document to the system prompt so every character in the same shared
    # world has a consistent narrative backdrop.
    try:
        _universe_row = cur.execute(
            "SELECT u.lore FROM universes u "
            "JOIN characters c ON c.universe_id = u.id "
            "WHERE c.id = ?",
            (char_id,),
        ).fetchone()
        if _universe_row and _universe_row[0]:
            system_prompt = f"[Universe Lore]\n{_universe_row[0]}\n\n{system_prompt}"
    except Exception as _ue:
        logger.warning(f"[Universe#23] Could not inject universe lore for char_id={char_id}: {_ue}")
    # ── End Feature #23 ─────────────────────────────────────────────

    # Build prompt sections via shared helper (diary, greeting, anniversary, RAG, mood, vocab, emotion, filter)
    sections = _build_prompt_sections(
        cfg, system_prompt, char_id, session_id, cur,
        user_text=text,
        diary=_stream_diary,
        diary_date=_stream_diary_date,
        last_chat_date=stream_char_last_chat_date,
        last_emotion=stream_char_last_emotion,
        first_chat_date=stream_char_first_chat_date,
        include_vocab=True,
        char_name=stream_char_name,
        affinity=_stream_affinity,
        day_off=_stream_day_off,
        mood_enabled=_stream_mood_enabled,
        mood_intensity=_stream_mood_intensity,
    )
    system_content = "".join(s["content"] for s in sections)
    _is_daily_first = any(s["name"] == "Daily Greeting" for s in sections)

    # Extract RAG memory hits for the response payload
    memories = []
    if vector_store:
        memories = vector_store.query_memory(text, char_id=char_id)

    # Emotional TTS hint for chunked TTS (#78): emotion won't be known until after streaming,
    # so use last_emotion (previous response's mood) as a continuity-based proxy.
    # Feature H: Apply emotion voice override using last_emotion as proxy for the same reason.
    if use_chunked_tts:
        _proxy_voice = _pick_tts_voice(voice_params, stream_char_last_emotion)
        if _proxy_voice:
            tts_chunked_cfg['voice_id'] = _proxy_voice
        _apply_emotion_tts(tts_chunked_cfg, stream_char_last_emotion)

    # Per-request TTS speed override (#14): frontend speed slider overrides global speech_rate
    # for this single response. Converts float multiplier to EdgeTTS-format "+N%".
    if request_speech_rate is not None and use_chunked_tts:
        try:
            rate_pct = int((float(request_speech_rate) - 1.0) * 100)
            tts_chunked_cfg['tts_rate'] = f"+{rate_pct}%" if rate_pct >= 0 else f"{rate_pct}%"
        except (ValueError, TypeError):
            pass

    # Phase 9: Capability-aware context budget — if character has a context_budget,
    # derive max_history from token estimate instead of using raw message count.
    _context_budget = cap.get("context_budget")
    if _context_budget and int(_context_budget) > 0:
        # Estimate: average message ~100 tokens, reserve 1000 for system+response
        _usable_tokens = int(_context_budget) - 1000
        max_history = max(4, _usable_tokens // 100)
    else:
        max_history = cfg.get("llm", {}).get("history_limit", cfg.get("history_limit", 0))

    if max_history > 0:
        cur.execute("SELECT role,text FROM messages WHERE session_id=? ORDER BY id DESC LIMIT ?",
                    (session_id, max_history))
    else:
        cur.execute("SELECT role,text FROM messages WHERE session_id=? ORDER BY id DESC",
                    (session_id,))
    hist = [{"role": r, "content": t} for (r, t) in cur.fetchall()][::-1]

    # Auto-compress when history nears the limit (background, non-blocking)
    if max_history > 0:
        total_active = cur.execute(
            "SELECT COUNT(*) FROM messages WHERE session_id=? AND is_active=1",
            (session_id,)
        ).fetchone()[0]
        _maybe_auto_compress(session_id, total_active, max_history)

    llm_messages = [{"role": "system", "content": system_content}] + hist

    # ── Feature A6: Lorebook / World Info injection (streaming) ──
    _inject_lore_entries(llm_messages, con, char_id, hist)

    from backend.llm.registry import get_client
    from backend.llm.router import get_router
    adapter = get_client(cfg)

    # Multi-model routing: select the best model for this request
    router = get_router(cfg)
    routed_model = router.route(text) if router else cfg["llm"]["model"]

    # Build Qwen3 thinking-mode override when enabled and model is Qwen3
    # Phase 9: Gate thinking mode on character capability flag too
    qwen3_thinking = cfg.get("llm", {}).get("qwen3_thinking_mode", False)
    if cap.get("supports_thinking") is False:
        qwen3_thinking = False  # Character explicitly disables thinking mode
    stream_extra_body = None
    if "qwen3" in routed_model.lower():
        stream_extra_body = {"chat_template_kwargs": {"enable_thinking": bool(qwen3_thinking)}}

    # Count input tokens (rough estimate: ~4 chars per token for English text)
    input_char_count = sum(len(m.get("content", "")) for m in llm_messages)
    est_input_tokens = input_char_count // 4

    # ── Phase 10: Agentic tool-use path ──────────────────────────────
    _use_agent = bool(cap.get("supports_tools"))
    if _use_agent:
        from backend.agent.tools import get_default_registry
        from backend.agent.runner import AgentRunner
        from backend.agent.registry import ToolContext

        _agent_registry = get_default_registry()
        _agent_context = ToolContext(
            cfg=cfg, char_id=char_id, session_id=session_id,
            db_conn=con, vector_store=vector_store,
        )
        _agent_runner = AgentRunner(_agent_registry, max_rounds=3)
        _agent_tools = _agent_registry.all_tools()
    # ── End Phase 10 setup ───────────────────────────────────────────

    if _use_agent:
        async def event_generator():
            """Agentic SSE generator -- routes through AgentRunner for tool-use.

            When the character's capability profile has ``supports_tools: true``,
            the LLM response is driven by :class:`AgentRunner` which can invoke
            tools mid-stream.  Tool call / result events are forwarded as SSE
            events so the frontend can render tool cards in real time.

            The done-event payload mirrors the non-agentic path so the frontend
            needs no special handling beyond the extra ``tool_call`` / ``tool_result``
            events.
            """
            full_reply = ""
            token_count = 0
            stream_start_time = time.time()

            yield f"event: processing\ndata: {json.dumps({'input_tokens': est_input_tokens})}\n\n"
            yield f"event: generating\ndata: {json.dumps({'status': 'first_token'})}\n\n"

            try:
                async for event in _agent_runner.run_stream(
                    llm_messages, adapter, cfg, _agent_tools,
                    context=_agent_context,
                    temperature=cfg.get("temperature", 0.7),
                    max_tokens=int(request_max_tokens) if request_max_tokens is not None else _cap_max_tokens,
                    repeat_penalty=cfg.get("repeat_penalty"),
                    frequency_penalty=cfg.get("frequency_penalty"),
                    extra_body=stream_extra_body,
                ):
                    evt_type = event["event"]
                    evt_data = event["data"]

                    if evt_type == "token":
                        t = evt_data.get("text", "")
                        full_reply += t
                        token_count += len(t) // 4 or 1  # rough token estimate for chunks
                        yield f"event: token\ndata: {json.dumps({'t': t})}\n\n"

                    elif evt_type in ("tool_call", "tool_result"):
                        yield f"event: {evt_type}\ndata: {json.dumps(evt_data)}\n\n"

                # Stream complete — parse emotion/gesture, save to DB, emit done event
                elapsed = time.time() - stream_start_time
                generation_time_ms = int(elapsed * 1000)
                tokens_per_second = round(token_count / elapsed, 1) if elapsed > 0 else None

                emotion, gesture, clean_reply = _parse_emotion_gesture(full_reply)

                if not incognito:
                    cur.execute(
                        "INSERT INTO messages(session_id, role, text, emotion, char_id, "
                        "token_count, input_token_count, generation_time_ms, tokens_per_second) "
                        "VALUES (?,?,?,?,?,?,?,?,?)",
                        (session_id, "assistant", clean_reply, emotion, char_id,
                         token_count, est_input_tokens, generation_time_ms, tokens_per_second)
                    )
                    assistant_message_id = cur.lastrowid
                    con.commit()

                    _update_relationship(con, char_id, emotion)

                    from datetime import datetime as _dt
                    _today_str = _dt.now().strftime('%Y-%m-%d')
                    try:
                        if stream_char_first_chat_date is None:
                            con.execute(
                                "UPDATE characters SET last_emotion=?, last_chat_date=?, first_chat_date=? WHERE id=?",
                                (emotion, _today_str, _today_str, char_id)
                            )
                        else:
                            con.execute(
                                "UPDATE characters SET last_emotion=?, last_chat_date=? WHERE id=?",
                                (emotion, _today_str, char_id)
                            )
                        con.commit()
                    except Exception as _e:
                        logger.warning(f"Could not persist mood/date for char {char_id}: {_e}")
                else:
                    assistant_message_id = None

                if vector_store and not incognito:
                    vector_store.add_memory(session_id, char_id, "assistant", clean_reply)

                memory_hits = [
                    {
                        "text": m.get("text", ""),
                        "role": m.get("role", ""),
                        "score": max(0.0, 1.0 - float(m.get("dist", 0.0))),
                    }
                    for m in memories
                ]

                # Generate TTS for the agentic reply (post-stream, single chunk)
                tts_url = None
                if use_chunked_tts and tts_chunked_client and clean_reply.strip():
                    try:
                        # Feature H: Per-emotion voice override — emotion now known post-stream
                        _emo_voice_ag = _pick_tts_voice(voice_params, emotion)
                        if _emo_voice_ag:
                            tts_chunked_cfg['voice_id'] = _emo_voice_ag
                        _apply_emotion_tts(tts_chunked_cfg, emotion)
                        tts_text = _clean_for_tts(clean_reply)
                        tts_res = await run_in_threadpool(
                            tts_chunked_client.speak_cached, tts_text, tts_chunked_cfg
                        )
                        if tts_res.get("ok"):
                            tts_url = f"/files/audio/{tts_res['filename']}"
                    except Exception as e:
                        logger.warning(f"Agentic TTS failed: {e}")

                done_data = {
                    "ok": True,
                    "reply": clean_reply,
                    "session_id": session_id,
                    "emotion": emotion,
                    "gesture": gesture,
                    "user_message_id": user_message_id,
                    "assistant_message_id": assistant_message_id,
                    "memory_hits": memory_hits,
                    "token_count": token_count,
                    "input_tokens": est_input_tokens,
                    "generation_time_ms": generation_time_ms,
                    "tokens_per_second": tokens_per_second,
                    "tts_chunked": False,
                    "audio": tts_url,
                    "is_daily_first": _is_daily_first,
                    "context_budget": _context_budget_summary(sections, hist, cfg),
                    "capability_warning": _capability_warning,
                }
                # Emit dedicated emotion event so chatStore can handle it independently
                emotion_val = emotion or 'neutral'
                intensity_val = 1.0 if emotion_val != 'neutral' else 0.0
                yield f"event: emotion\ndata: {json.dumps({'type': 'emotion', 'emotion': emotion_val, 'intensity': intensity_val})}\n\n"
                yield f"event: done\ndata: {json.dumps(done_data)}\n\n"

                try:
                    _fire_webhooks({
                        "character": stream_char_name if stream_char_name else "",
                        "reply": clean_reply,
                        "emotion": emotion,
                        "session_id": session_id,
                    })
                except Exception as _wh_err:
                    logger.warning(f"Webhook fire failed (non-critical): {_wh_err}")

                # Feature C3: async fact extraction (fire-and-forget, never blocks chat)
                try:
                    async def _extract_user_facts_bg(
                        _text: str, _cid: int, _adapter, _cfg: dict
                    ) -> None:
                        """Extract user facts from the exchange in the background."""
                        try:
                            from backend.knowledge.extractor import extract_facts as _ef
                            _conn2 = db()
                            try:
                                n = _ef(_text, _cid, _conn2, _adapter, _cfg)
                                if n:
                                    logger.debug("[KG-C3] Extracted %d new user facts for char_id=%d", n, _cid)
                            finally:
                                _conn2.close()
                        except Exception as _fe:
                            logger.debug("[KG-C3] Fact extraction skipped: %s", _fe)

                    asyncio.create_task(
                        _extract_user_facts_bg(text, char_id, adapter, cfg)
                    )
                except Exception:
                    pass

            except Exception as e:
                logger.error(f"Agentic stream error: {e}", exc_info=True)
                _telemetry_inc("chat.failures_total")
                yield f"event: error\ndata: {json.dumps({'error': str(e)})}\n\n"
            finally:
                con.close()

    else:
        # ── Existing non-agentic streaming path (unchanged) ──────────
        # Use an asyncio.Queue to bridge the sync generator thread → async generator
        token_q: asyncio.Queue = asyncio.Queue()
        loop = asyncio.get_event_loop()

        def _stream_thread():
            """Run the synchronous LLM streaming generator in a dedicated thread."""
            try:
                first_token = True
                for token in adapter.chat_stream(
                    llm_messages,
                    routed_model,
                    cfg["llm"]["endpoint"],
                    cfg["llm"]["api_key"],
                    temperature=cfg.get("temperature", 0.7),
                    max_tokens=_cap_max_tokens,  # Phase 9: per-character output limit (-1 = unlimited)
                    repeat_penalty=cfg.get("repeat_penalty"),
                    frequency_penalty=cfg.get("frequency_penalty"),
                    extra_body=stream_extra_body,
                ):
                    if first_token:
                        # Signal that prefill is complete and generation has begun
                        loop.call_soon_threadsafe(token_q.put_nowait, ("generating", None))
                        first_token = False
                    loop.call_soon_threadsafe(token_q.put_nowait, ("token", token))
                loop.call_soon_threadsafe(token_q.put_nowait, ("end", None))
            except Exception as e:
                loop.call_soon_threadsafe(token_q.put_nowait, ("error", str(e)))

        async def event_generator():
            """Async generator yielding SSE events as tokens arrive from the LLM.

            When ``use_chunked_tts`` is True, sentence-boundary detection accumulates
            tokens into ``sentence_buffer``.  Each complete sentence fires a background
            ``asyncio.Task`` for TTS synthesis so audio generation overlaps with the
            remaining LLM token stream.  After the stream ends, all pending TTS tasks
            are collected and their results emitted as ``audio_chunk`` SSE events before
            the ``done`` event -- allowing the frontend to begin playback as each chunk
            arrives while the LLM is still generating the rest of the reply.
            """
            full_reply = ""
            token_count = 0
            stream_start_time = None  # Set when first token arrives

            # Sentence-chunked TTS state
            sentence_buffer = ""
            chunk_index = 0
            chunk_tasks: list[asyncio.Task] = []

            # Emit processing event so frontend shows "PROCESSING INPUT..."
            yield f"event: processing\ndata: {json.dumps({'input_tokens': est_input_tokens})}\n\n"

            # Start the sync streaming thread
            thread = threading.Thread(target=_stream_thread, daemon=True)
            thread.start()

            try:
                while True:
                    msg_type, payload = await token_q.get()

                    if msg_type == "generating":
                        stream_start_time = time.time()
                        yield f"event: generating\ndata: {json.dumps({'status': 'first_token'})}\n\n"

                    elif msg_type == "token":
                        full_reply += payload
                        token_count += 1
                        sentence_buffer += payload
                        yield f"event: token\ndata: {json.dumps({'t': payload})}\n\n"

                        # Sentence-chunked TTS: flush buffer on sentence boundary.
                        # Minimum 30 chars avoids firing TTS on very short fragments.
                        if (use_chunked_tts and tts_chunked_client
                                and _SENTENCE_ENDS.search(sentence_buffer)
                                and len(sentence_buffer) > 30):
                            chunk_text = _clean_for_tts(sentence_buffer.strip())
                            sentence_buffer = ""
                            task = asyncio.create_task(
                                _tts_chunk_async(tts_chunked_client, chunk_text, tts_chunked_cfg, chunk_index)
                            )
                            chunk_tasks.append(task)
                            chunk_index += 1

                    elif msg_type == "end":
                        break

                    elif msg_type == "error":
                        _telemetry_inc("chat.failures_total")
                        yield f"event: error\ndata: {json.dumps({'error': payload})}\n\n"
                        return

                # Flush any remaining sentence buffer after stream ends
                if use_chunked_tts and tts_chunked_client and sentence_buffer.strip():
                    chunk_text = _clean_for_tts(sentence_buffer.strip())
                    task = asyncio.create_task(
                        _tts_chunk_async(tts_chunked_client, chunk_text, tts_chunked_cfg, chunk_index)
                    )
                    chunk_tasks.append(task)

                # Collect TTS results (some tasks may already be done by now) and yield chunks
                if chunk_tasks:
                    chunk_results = await asyncio.gather(*chunk_tasks, return_exceptions=True)
                    for r in chunk_results:
                        if isinstance(r, dict) and r.get("ok"):
                            # Build the audio URL outside the f-string -- Python does not
                            # allow backslash escapes inside f-string expression braces.
                            audio_url = f"/files/audio/{r['filename']}"
                            yield (
                                f"event: audio_chunk\n"
                                f"data: {json.dumps({'url': audio_url, 'index': r['chunk_index']})}\n\n"
                            )

                # Stream complete — parse emotion/gesture, save to DB, emit done event
                emotion, gesture, clean_reply = _parse_emotion_gesture(full_reply)

                # Calculate generation timing for token stats
                generation_time_ms = None
                tokens_per_second = None
                if stream_start_time and token_count > 0:
                    elapsed = time.time() - stream_start_time
                    generation_time_ms = int(elapsed * 1000)
                    tokens_per_second = round(token_count / elapsed, 1) if elapsed > 0 else None

                if not incognito:
                    cur.execute(
                        "INSERT INTO messages(session_id, role, text, emotion, char_id, "
                        "token_count, input_token_count, generation_time_ms, tokens_per_second) "
                        "VALUES (?,?,?,?,?,?,?,?,?)",
                        (session_id, "assistant", clean_reply, emotion, char_id,
                         token_count, est_input_tokens, generation_time_ms, tokens_per_second)
                    )
                    assistant_message_id = cur.lastrowid
                    con.commit()

                    # Update relationship scores based on detected emotion
                    _update_relationship(con, char_id, emotion)

                    # Persist mood + daily-greeting state (#56, #54) and first_chat_date (#109)
                    from datetime import datetime as _dt
                    _today_str = _dt.now().strftime('%Y-%m-%d')
                    try:
                        if stream_char_first_chat_date is None:
                            con.execute(
                                "UPDATE characters SET last_emotion=?, last_chat_date=?, first_chat_date=? WHERE id=?",
                                (emotion, _today_str, _today_str, char_id)
                            )
                        else:
                            con.execute(
                                "UPDATE characters SET last_emotion=?, last_chat_date=? WHERE id=?",
                                (emotion, _today_str, char_id)
                            )
                        con.commit()
                    except Exception as _e:
                        logger.warning(f"Could not persist mood/date for char {char_id}: {_e}")
                else:
                    assistant_message_id = None  # incognito: no DB record

                if vector_store and not incognito:
                    vector_store.add_memory(session_id, char_id, "assistant", clean_reply)

                memory_hits = [
                    {
                        "text": m.get("text", ""),
                        "role": m.get("role", ""),
                        "score": max(0.0, 1.0 - float(m.get("dist", 0.0))),
                    }
                    for m in memories
                ]

                done_data = {
                    "ok": True,
                    "reply": clean_reply,
                    "session_id": session_id,
                    "emotion": emotion,
                    "gesture": gesture,
                    "user_message_id": user_message_id,
                    "assistant_message_id": assistant_message_id,
                    "memory_hits": memory_hits,
                    "token_count": token_count,
                    "input_tokens": est_input_tokens,
                    "generation_time_ms": generation_time_ms,
                    "tokens_per_second": tokens_per_second,
                    # Tell the frontend not to call /api/tts separately when we already
                    # synthesized and emitted audio_chunk events above.
                    "tts_chunked": bool(chunk_tasks),
                    # Daily-first flag: true when no chat was sent today yet (#54)
                    "is_daily_first": _is_daily_first,
                    # Token budget for the context window dashboard widget
                    "context_budget": _context_budget_summary(sections, hist, cfg),
                    # Phase 9: capability mismatch warning (if character needs a bigger model)
                    "capability_warning": _capability_warning,
                }
                # Emit dedicated emotion event so chatStore can handle it independently
                emotion_val = emotion or 'neutral'
                intensity_val = 1.0 if emotion_val != 'neutral' else 0.0
                yield f"event: emotion\ndata: {json.dumps({'type': 'emotion', 'emotion': emotion_val, 'intensity': intensity_val})}\n\n"
                yield f"event: done\ndata: {json.dumps(done_data)}\n\n"

                # Fire outbound webhooks (#62) — non-blocking background threads
                try:
                    _fire_webhooks({
                        "character": stream_char_name if stream_char_name else "",
                        "reply": clean_reply,
                        "emotion": emotion,
                        "session_id": session_id,
                    })
                except Exception as _wh_err:
                    logger.warning(f"Webhook fire failed (non-critical): {_wh_err}")

            except Exception as e:
                logger.error(f"Stream chat error: {e}", exc_info=True)
                _telemetry_inc("chat.failures_total")
                yield f"event: error\ndata: {json.dumps({'error': str(e)})}\n\n"
            finally:
                con.close()

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream; charset=utf-8",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        }
    )


@app.post("/api/tts")
async def api_tts(req: Request):
    body = await req.json()
    text = body.get("text","").strip()
    if not text: raise HTTPException(400, "text required")
    cfg = load_config(); cfg_tts = cfg.get("tts",{}).copy()
    if 'tts' not in cfg: cfg['tts'] = {}
    
    for k in ("provider","endpoint","api_key","voice_id","format","sample_rate"):
        if k in body:
            cfg_tts[k] = body[k]
            # Also update main config for get_tts routing
            cfg['tts'][k] = body[k]

    # FORCE OVERRIDE: If body specifies a provider, ignore app.json active_provider
    if 'provider' in body and 'services' in cfg:
        cfg['services'].get('tts', {}).pop('active_provider', None)

    try:
        from backend.tts.registry import get_tts
        tts = get_tts(cfg)
        res = tts.speak_cached(_clean_for_tts(text), cfg_tts)
        if not res.get("ok"): raise HTTPException(400, res.get("error","TTS failed"))
        return {"ok": True, "url": f"/files/audio/{res['filename']}", "meta": res.get("meta",{})}
    except Exception as e:
        raise HTTPException(500, f"TTS Error: {e}")


@app.post("/api/tts/preview")
async def tts_preview(req: Request):
    """Synthesize a short preview clip for voice browsing in wizards.

    Accepts a small text sample, voice_id, and provider, returns an audio URL.
    Reuses the existing TTS pipeline but is designed for quick preview playback
    during onboarding and setup wizard voice selection steps.

    Args:
        req: JSON body with {text, voice_id, provider}

    Returns:
        dict: {"ok": True, "audio_url": "/files/audio/..."} on success

    Raises:
        HTTPException: 400 if text is missing, 500 on TTS failure

    Example:
        >>> POST /api/tts/preview
        >>> {"text": "Hello!", "voice_id": "en-US-AriaNeural", "provider": "edge"}
        {"ok": true, "audio_url": "/files/audio/preview_abc123.mp3"}
    """
    body = await req.json()
    text = body.get("text", "Hello! Nice to meet you.").strip()[:200]
    if not text:
        raise HTTPException(400, "text required")
    voice_id = body.get("voice_id", "")
    provider = body.get("provider", "")

    cfg = load_config()
    cfg_tts = cfg.get("tts", {}).copy()
    if provider:
        cfg_tts["provider"] = provider
        if "tts" not in cfg:
            cfg["tts"] = {}
        cfg["tts"]["provider"] = provider
    if voice_id:
        cfg_tts["voice_id"] = voice_id

    try:
        from backend.tts.registry import get_tts
        tts = get_tts(cfg)
        res = tts.speak_cached(_clean_for_tts(text), cfg_tts)
        if not res.get("ok"):
            raise HTTPException(400, res.get("error", "TTS preview failed"))
        return {"ok": True, "audio_url": f"/files/audio/{res['filename']}"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"TTS preview error: {e}")


@app.get("/api/tts/cache")
def get_tts_cache_stats():
    """Return TTS audio cache statistics for the cache management UI (#76).

    Returns:
        dict: {
            "file_count": int,   Number of cached .mp3/.wav files
            "size_mb": float,    Total size in megabytes
            "oldest_ts": int,    Unix timestamp of the oldest file, or null
        }

    Example:
        >>> GET /api/tts/cache
        {"file_count": 142, "size_mb": 18.3, "oldest_ts": 1708000000}
    """
    import os as _os
    files = list(AUDIO.glob("*.*"))
    total_bytes = 0
    oldest_ts = None
    for f in files:
        if not f.is_file():
            continue
        st = f.stat()
        total_bytes += st.st_size
        if oldest_ts is None or st.st_mtime < oldest_ts:
            oldest_ts = int(st.st_mtime)
    return {
        "file_count": len(files),
        "size_mb": round(total_bytes / (1024 * 1024), 2),
        "oldest_ts": oldest_ts,
    }


@app.delete("/api/tts/cache")
def clear_tts_cache():
    """Delete all cached TTS audio files (#76).

    Returns:
        dict: {"ok": True, "deleted": int}  Number of files removed.

    Example:
        >>> DELETE /api/tts/cache
        {"ok": true, "deleted": 142}
    """
    deleted = 0
    for f in AUDIO.glob("*.*"):
        try:
            if f.is_file():
                f.unlink()
                deleted += 1
        except OSError:
            pass
    logger.info(f"TTS cache cleared: {deleted} file(s) removed")
    return {"ok": True, "deleted": deleted}


# ==================== TTS MODEL MANAGEMENT ====================

@app.get("/api/tts/voices")
def get_tts_voices(provider: str = None):
    """Return installed voices for the voice picker dropdown.

    Merges installed Kokoro/Piper voices with always-available Edge-TTS voices.

    Args:
        provider: Optional filter — ``"kokoro"``, ``"piper"``, or ``"edge-tts"``.

    Returns:
        dict: ``{"voices": [{"id": str, "name": str, "provider": str, "language": str}, ...]}``

    Example:
        >>> GET /api/tts/voices?provider=edge-tts
        {"voices": [{"id": "en-US-AriaNeural", "name": "Aria ...", ...}]}
    """
    if not tts_model_mgr:
        raise HTTPException(500, "TTS Model Manager not ready")
    return tts_model_mgr.get_voices(provider=provider)


@app.get("/api/tts/voices/default")
def get_default_voice():
    """Return the recommended default voice for new characters.

    Priority: single installed local voice > first installed > first Edge-TTS.

    Returns:
        dict: ``{"voice_id": str, "provider": str, "name": str}``

    Example:
        >>> GET /api/tts/voices/default
        {"voice_id": "en-US-AriaNeural", "provider": "edge-tts", "name": "Aria (Female, American)"}
    """
    if not tts_model_mgr:
        raise HTTPException(500, "TTS Model Manager not ready")
    return tts_model_mgr.get_default_voice()


@app.get("/api/tts/models")
def get_tts_models():
    """Return the full voice catalog with install status per entry.

    Returns:
        dict: ``{"models": [...], "catalog_updated": str, "total_installed_mb": float}``

    Example:
        >>> GET /api/tts/models
        {"models": [...], "catalog_updated": "2026-02-25T...", "total_installed_mb": 0.3}
    """
    if not tts_model_mgr:
        raise HTTPException(500, "TTS Model Manager not ready")
    return tts_model_mgr.get_models()


@app.post("/api/tts/models/install")
async def install_tts_model(request: Request):
    """Start an async download of a voice model from the catalog.

    Fires the download as a background task and returns immediately.
    Poll ``GET /api/tts/models/install/status`` (SSE) for progress.

    Args:
        request: JSON body with ``{"model_id": "kokoro/af_sky"}``.

    Returns:
        dict: ``{"ok": True, "message": "Download started"}`` or error.

    Example:
        >>> POST /api/tts/models/install {"model_id": "kokoro/af_sky"}
        {"ok": true, "message": "Download started for kokoro/af_sky"}
    """
    if not tts_model_mgr:
        raise HTTPException(500, "TTS Model Manager not ready")

    body = await request.json()
    model_id = body.get("model_id")
    if not model_id:
        raise HTTPException(400, "model_id is required")

    # Check if download is already in progress
    if tts_model_mgr._download_lock.locked():
        raise HTTPException(409, "Another download is already in progress")

    import asyncio as _asyncio
    _asyncio.create_task(tts_model_mgr.install_model(model_id))
    return {"ok": True, "message": f"Download started for {model_id}"}


@app.get("/api/tts/models/install/status")
async def tts_install_status():
    """SSE stream of the current download progress.

    Sends JSON events every 0.5s with download state. Closes when
    the download completes, errors, or no download is active.

    Returns:
        StreamingResponse: ``text/event-stream`` with progress events.

    Example:
        >>> GET /api/tts/models/install/status
        data: {"model_id": "kokoro/af_sky", "status": "downloading", "progress": 0.45, ...}
        data: {"model_id": "kokoro/af_sky", "status": "complete"}
    """
    if not tts_model_mgr:
        raise HTTPException(500, "TTS Model Manager not ready")

    async def event_stream():
        """Yield SSE events polling _current_download state."""
        idle_count = 0
        while True:
            status = tts_model_mgr.get_download_status()
            if not status:
                idle_count += 1
                if idle_count > 10:  # 5 seconds of no activity
                    yield f"data: {json.dumps({'status': 'idle'})}\n\n"
                    break
                await asyncio.sleep(0.5)
                continue

            idle_count = 0
            yield f"data: {json.dumps(status)}\n\n"

            if status.get("status") in ("complete", "error"):
                break

            await asyncio.sleep(0.5)

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@app.delete("/api/tts/models/{model_id:path}")
def delete_tts_model(model_id: str):
    """Delete an installed TTS voice model.

    Args:
        model_id: The model ID to delete (e.g. ``"kokoro/af_sky"``).

    Returns:
        dict: ``{"ok": True, "model_id": str}`` on success.

    Example:
        >>> DELETE /api/tts/models/kokoro/af_sky
        {"ok": true, "model_id": "kokoro/af_sky"}
    """
    if not tts_model_mgr:
        raise HTTPException(500, "TTS Model Manager not ready")
    result = tts_model_mgr.delete_model(model_id)
    if not result["ok"]:
        raise HTTPException(404, result["error"])
    return result


@app.post("/api/tts/models/refresh-catalog")
async def refresh_tts_catalog():
    """Fetch the latest voice catalog from the configured remote URL.

    Returns:
        dict: ``{"ok": True, "count": int}`` on success.

    Example:
        >>> POST /api/tts/models/refresh-catalog
        {"ok": true, "count": 35}
    """
    if not tts_model_mgr:
        raise HTTPException(500, "TTS Model Manager not ready")
    cfg = load_config()
    catalog_url = cfg.get("tts", {}).get("catalog_url")
    result = await tts_model_mgr.refresh_catalog(catalog_url)
    if not result["ok"]:
        raise HTTPException(502, result["error"])
    return result


# ==================== SESSION MANAGEMENT ====================

@app.get("/api/sessions")
def list_sessions(archived: bool = False, search: str = None):
    """List all chat sessions with pin/archive status and tags.

    Args:
        archived: If True, return archived sessions. If False (default), return active sessions.
        search: Optional search string to filter sessions by title.

    Returns:
        {"sessions": [{id, title, created_ts, message_count, is_pinned, is_archived,
                       last_message_ts, tags}]}
    """
    conn = db()
    cur = conn.cursor()

    try:
        # Full query with pin/archive/tags support — pinned first, then by most recent activity
        base_sql = """
            SELECT s.id, s.title, s.created_ts,
                   (SELECT COUNT(id) FROM messages WHERE session_id=s.id) as msg_count,
                   COALESCE(s.is_pinned, 0) as is_pinned,
                   COALESCE(s.is_archived, 0) as is_archived,
                   (SELECT MAX(ts) FROM messages WHERE session_id=s.id) as last_msg_ts,
                   s.tags
            FROM sessions s
        """
        conditions = []
        params = []

        if archived:
            conditions.append("COALESCE(s.is_archived, 0) = 1")
        else:
            conditions.append("COALESCE(s.is_archived, 0) = 0")

        if search:
            conditions.append("s.title LIKE ?")
            params.append(f"%{search}%")

        where = f" WHERE {' AND '.join(conditions)}" if conditions else ""
        order = " ORDER BY COALESCE(s.is_pinned, 0) DESC, COALESCE(last_msg_ts, s.created_ts) DESC"

        cur.execute(base_sql + where + order, params)
    except Exception:
        # Fallback for older schema without is_pinned/is_archived/tags
        cur.execute("""
            SELECT s.id, s.title, s.created_ts,
                   (SELECT COUNT(id) FROM messages WHERE session_id=s.id),
                   0, 0, NULL, NULL
            FROM sessions s ORDER BY s.created_ts DESC
        """)

    sessions = []
    for row in cur.fetchall():
        sessions.append({
            "id": row[0],
            "title": row[1] or f"Session {row[0]}",
            "created_ts": row[2],
            "message_count": row[3],
            "is_pinned": bool(row[4]),
            "is_archived": bool(row[5]),
            "last_message_ts": row[6],
            "tags": json.loads(row[7] or "[]"),
        })
    conn.close()
    return {"sessions": sessions}

@app.post("/api/sessions")
async def create_session(req: Request):
    """Create a new chat session."""
    body = await req.json()
    title = body.get("title", "New Session")
    conn = db()
    cur = conn.cursor()
    cur.execute("INSERT INTO sessions (title) VALUES (?)", (title,))
    session_id = cur.lastrowid
    # created_ts might be auto-generated or NULL depending on schema details
    # We'll just return what we have
    conn.commit()
    conn.close()
    return {"id": session_id, "title": title}

@app.put("/api/sessions/{session_id}")
async def update_session(session_id: int, req: Request):
    """Update session title, pin status, or archive status.

    Args:
        session_id: Session to update.
        req: JSON body with optional fields: title, is_pinned, is_archived.

    Returns:
        {"ok": True}
    """
    body = await req.json()
    updates = []
    params = []

    if "title" in body:
        updates.append("title=?")
        params.append(body["title"])
    if "is_pinned" in body:
        updates.append("is_pinned=?")
        params.append(1 if body["is_pinned"] else 0)
    if "is_archived" in body:
        updates.append("is_archived=?")
        params.append(1 if body["is_archived"] else 0)
    # Legacy compat
    if "archived" in body and "is_archived" not in body:
        updates.append("is_archived=?")
        params.append(1 if body["archived"] else 0)

    if not updates:
        return {"ok": True}

    params.append(session_id)
    conn = db()
    try:
        conn.execute(f"UPDATE sessions SET {', '.join(updates)} WHERE id=?", params)
        conn.commit()
    except Exception as e:
        conn.close()
        raise HTTPException(500, str(e))
    conn.close()
    return {"ok": True}

@app.delete("/api/sessions/{session_id}")
def delete_session(session_id: int):
    """Delete session and all its messages."""
    conn = db()
    curr = conn.cursor()
    curr.execute("DELETE FROM messages WHERE session_id=?", (session_id,))
    curr.execute("DELETE FROM sessions WHERE id=?", (session_id,))
    deleted = curr.rowcount # This might be sessions deleted
    conn.commit()
    conn.close()
    return {"ok": True, "deleted_messages": 0} # Simplified

@app.post("/api/sessions/{session_id}/duplicate")
def duplicate_session(session_id: int):
    """Duplicate a session with all its messages.

    Creates a new session with the same title (suffixed with " (copy)") and
    copies all active messages into the new session.

    Args:
        session_id: Source session to duplicate.

    Returns:
        {"ok": True, "session": {id, title}}
    """
    conn = db()
    cur = conn.cursor()

    # Get original session
    cur.execute("SELECT title FROM sessions WHERE id=?", (session_id,))
    row = cur.fetchone()
    if not row:
        conn.close()
        raise HTTPException(404, "Session not found")

    new_title = f"{row[0]} (copy)"
    cur.execute("INSERT INTO sessions (title) VALUES (?)", (new_title,))
    new_id = cur.lastrowid

    # Copy active messages
    cur.execute("""
        INSERT INTO messages (session_id, role, text, ts, is_active, emotion, char_id)
        SELECT ?, role, text, ts, is_active, emotion, char_id
        FROM messages WHERE session_id=? AND is_active=1
        ORDER BY id
    """, (new_id, session_id))

    conn.commit()
    conn.close()
    return {"ok": True, "session": {"id": new_id, "title": new_title}}


@app.post("/api/sessions/import")
async def import_session(req: Request):
    """Import a session from JSON data.

    Accepts JSON body with session title and messages array.

    Args:
        req: JSON body {"title": "...", "messages": [{role, text, ts?}, ...]}

    Returns:
        {"ok": True, "session": {id, title}, "message_count": int}
    """
    body = await req.json()
    title = body.get("title", f"Imported {time.strftime('%Y-%m-%d')}")
    messages = body.get("messages", [])

    if not isinstance(messages, list):
        raise HTTPException(400, "'messages' must be a list")

    conn = db()
    cur = conn.cursor()
    cur.execute("INSERT INTO sessions (title) VALUES (?)", (title,))
    new_id = cur.lastrowid

    count = 0
    for msg in messages:
        role = msg.get("role", "user")
        text = msg.get("text", "")
        ts = msg.get("ts")
        if text:
            cur.execute(
                "INSERT INTO messages (session_id, role, text, ts) VALUES (?, ?, ?, ?)",
                (new_id, role, text, ts)
            )
            count += 1

    conn.commit()
    conn.close()
    return {"ok": True, "session": {"id": new_id, "title": title}, "message_count": count}


@app.get("/api/sessions/{session_id}/messages")
def get_session_messages(session_id: int, include_branches: bool = False):
    """Get all messages for a session.

    By default only returns active messages (is_active=1). Pass
    ``include_branches=true`` to also return inactive branch siblings.

    Args:
        session_id: The session to fetch messages for.
        include_branches: If True, include inactive branched messages.

    Returns:
        dict: {"messages": [{id, role, text, ts, parent_id, is_active, emotion, char_id,
                             token_count, input_token_count, generation_time_ms,
                             tokens_per_second, pinned}, ...]}
    """
    conn = db()
    cur = conn.cursor()
    try:
        cols = ("id, role, text, ts, parent_id, is_active, emotion, char_id, "
                "token_count, input_token_count, generation_time_ms, tokens_per_second, pinned")
        if include_branches:
            cur.execute(
                f"SELECT {cols} FROM messages WHERE session_id=? ORDER BY id ASC",
                (session_id,)
            )
        else:
            # Filter to active path only; fall back gracefully if columns missing
            try:
                cur.execute(
                    f"SELECT {cols} FROM messages "
                    "WHERE session_id=? AND (is_active=1 OR is_active IS NULL) ORDER BY id ASC",
                    (session_id,)
                )
            except Exception:
                cur.execute(
                    "SELECT id, role, text, ts FROM messages WHERE session_id=? ORDER BY id ASC",
                    (session_id,)
                )
                messages = [{"id": r[0], "role": r[1], "text": r[2], "ts": r[3]} for r in cur.fetchall()]
                return {"messages": messages}

        messages = []
        for r in cur.fetchall():
            msg = {
                "id": r[0], "role": r[1], "text": r[2], "ts": r[3],
                "parent_id": r[4] if len(r) > 4 else None,
                "is_active": r[5] if len(r) > 5 else 1,
                "emotion": r[6] if len(r) > 6 else None,
                "char_id": r[7] if len(r) > 7 else None,
            }
            # Token stats (v8 columns) — only include if present
            if len(r) > 8 and r[8] is not None:
                msg["token_count"] = r[8]
            if len(r) > 9 and r[9] is not None:
                msg["input_token_count"] = r[9]
            if len(r) > 10 and r[10] is not None:
                msg["generation_time_ms"] = r[10]
            if len(r) > 11 and r[11] is not None:
                msg["tokens_per_second"] = r[11]
            # Pinned flag (v20 column)
            msg["pinned"] = bool(r[12]) if len(r) > 12 and r[12] is not None else False
            messages.append(msg)
        return {"messages": messages}
    finally:
        conn.close()


# ==================== MESSAGE EDIT / REGENERATE ====================

@app.put("/api/messages/{message_id}")
async def edit_message(message_id: int, req: Request):
    """Edit the text of an existing message.

    Args:
        message_id: ID of the message to edit.
        req: JSON body with ``text`` field.

    Returns:
        dict: {"ok": True, "id": message_id}
    """
    body = await req.json()
    new_text = body.get("text", "").strip()
    if not new_text:
        raise HTTPException(400, "text required")

    conn = db()
    try:
        conn.execute("UPDATE messages SET text=? WHERE id=?", (new_text, message_id))
        conn.commit()
    except Exception as e:
        raise HTTPException(500, f"Edit failed: {e}")
    finally:
        conn.close()
    return {"ok": True, "id": message_id}


@app.post("/api/messages/{message_id}/regenerate")
async def regenerate_message(message_id: int, req: Request):
    """Regenerate an AI response, creating a new branch.

    Marks the old assistant message as ``is_active=0`` and generates a
    fresh response from the LLM using the same conversation context.
    The new message shares the same ``parent_id`` as the original.

    Args:
        message_id: ID of the assistant message to regenerate.
        req: JSON body (currently unused, reserved for future options).

    Returns:
        dict: {"ok": True, "new_message": {id, text, emotion, gesture}}
    """
    conn = db()
    cur = conn.cursor()

    try:
        # Get the original message and its context
        cur.execute("SELECT session_id, role, parent_id FROM messages WHERE id=?", (message_id,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "Message not found")

        session_id, role, parent_id = row
        if role != "assistant":
            raise HTTPException(400, "Can only regenerate assistant messages")

        # Mark old message as inactive
        cur.execute("UPDATE messages SET is_active=0 WHERE id=?", (message_id,))
        conn.commit()

        # Gather context: all active messages up to (but not including) this one
        cur.execute(
            "SELECT role, text FROM messages WHERE session_id=? AND id<? "
            "AND (is_active=1 OR is_active IS NULL) ORDER BY id ASC",
            (session_id, message_id)
        )
        hist = [{"role": r, "content": t} for (r, t) in cur.fetchall()]

        # Get character info
        cfg = load_config() or {}
        char_id = 1
        system_prompt = "You are a friendly anime companion."
        try:
            # Find the char_id from the most recent user message in this session
            cur.execute(
                "SELECT char_id FROM messages WHERE session_id=? AND char_id IS NOT NULL "
                "ORDER BY id DESC LIMIT 1", (session_id,)
            )
            cid_row = cur.fetchone()
            if cid_row and cid_row[0]:
                char_id = cid_row[0]

            cur.execute("SELECT system_prompt FROM characters WHERE id=?", (char_id,))
            sp_row = cur.fetchone()
            if sp_row and sp_row[0]:
                system_prompt = sp_row[0]
        except Exception:
            pass

        # Build prompt sections via shared helper (regenerate uses minimal injections)
        sections = _build_prompt_sections(
            cfg, system_prompt, char_id, session_id, cur,
            include_vocab=False,
        )
        system_content = "".join(s["content"] for s in sections)
        messages = [{"role": "system", "content": system_content}] + hist

        # Call LLM
        from backend.llm.registry import get_client
        adapter = get_client(cfg)
        res = await run_in_threadpool(
            adapter.chat, messages, cfg["llm"]["model"],
            cfg["llm"]["endpoint"], cfg["llm"]["api_key"],
            temperature=cfg.get("temperature", 0.7), max_tokens=-1,
            repeat_penalty=cfg.get("repeat_penalty"),
            frequency_penalty=cfg.get("frequency_penalty"),
        )

        if not res.get("ok"):
            raise HTTPException(502, res.get("error", "LLM failed"))

        raw_reply = res["reply"]
        emotion, gesture, clean_reply = _parse_emotion_gesture(raw_reply)

        # Insert new message with same parent_id
        cur.execute(
            "INSERT INTO messages(session_id, role, text, parent_id, is_active, emotion, char_id) "
            "VALUES (?,?,?,?,1,?,?)",
            (session_id, "assistant", clean_reply, parent_id, emotion, char_id)
        )
        new_id = cur.lastrowid
        conn.commit()

        if vector_store:
            vector_store.add_memory(session_id, char_id, "assistant", clean_reply)

        return {
            "ok": True,
            "new_message": {
                "id": new_id,
                "text": clean_reply,
                "emotion": emotion,
                "gesture": gesture,
            }
        }
    finally:
        conn.close()


# ==================== MODEL ROUTING ====================

@app.get("/api/routing")
def get_routing_config():
    """Get the current multi-model routing configuration.

    Returns:
        {"ok": True, "routing": {enabled, default_model, rules}}
    """
    cfg = load_config()
    return {"ok": True, "routing": cfg.get("routing", {"enabled": False, "default_model": "", "rules": []})}


@app.put("/api/routing")
async def update_routing_config(req: Request):
    """Update the multi-model routing configuration.

    Args:
        req: JSON body with routing config fields.

    Returns:
        {"ok": True}
    """
    body = await req.json()
    cfg = load_config()
    cfg["routing"] = body
    save_config(cfg)
    return {"ok": True}


@app.post("/api/routing/test")
async def test_routing(req: Request):
    """Test which model would be selected for a given input text.

    Args:
        req: JSON body {"text": "..."}

    Returns:
        {"ok": True, "route": {model, task, reason}}
    """
    body = await req.json()
    text = body.get("text", "")
    cfg = load_config()

    from backend.llm.router import ModelRouter
    router = ModelRouter(cfg)
    info = router.get_route_info(text)
    return {"ok": True, "route": info}


# ==================== SMART SUMMARIZATION ====================

@app.post("/api/sessions/{session_id}/summarize")
async def summarize_session(session_id: int, req: Request = None):
    """Generate a smart summary of the session by sending recent messages to the LLM.

    Stores the result in sessions.summary for quick retrieval.

    Args:
        session_id: Session to summarize.

    Returns:
        {"ok": True, "summary": "..."}
    """
    body = {}
    if req:
        try:
            body = await req.json()
        except Exception:
            pass

    max_messages = body.get("max_messages", 50)

    conn = db()
    rows = conn.execute(
        "SELECT role, text FROM messages WHERE session_id = ? AND is_active = 1 ORDER BY id DESC LIMIT ?",
        (session_id, max_messages)
    ).fetchall()

    if not rows:
        return {"ok": False, "error": "No messages to summarize"}

    # Build conversation for LLM
    messages_text = "\n".join(
        f"{'User' if r[0] == 'user' else 'AI'}: {r[1]}" for r in reversed(rows)
    )

    summarize_prompt = (
        "You are a conversation summarizer. Provide a concise summary of the following conversation. "
        "Include key topics discussed, decisions made, emotional tone, and any important details. "
        "Keep it under 200 words.\n\n"
        f"CONVERSATION:\n{messages_text}\n\n"
        "SUMMARY:"
    )

    cfg = load_config()
    try:
        from backend.llm.registry import get_client
        adapter = get_client(cfg)
        res = await run_in_threadpool(
            adapter.chat,
            [{"role": "user", "content": summarize_prompt}],
            cfg["llm"]["model"],
            cfg["llm"]["endpoint"],
            cfg["llm"]["api_key"],
            temperature=0.3,
            max_tokens=500,
        )
    except Exception as e:
        logger.error(f"Summarization failed: {e}")
        raise HTTPException(500, f"Summarization failed: {e}")

    if not res.get("ok"):
        raise HTTPException(500, res.get("error", "LLM error"))

    summary = res["reply"].strip()

    # Store in DB
    conn.execute("UPDATE sessions SET summary = ? WHERE id = ?", (summary, session_id))
    conn.commit()

    return {"ok": True, "summary": summary}


@app.post("/api/sessions/{session_id}/compress")
async def compress_session(session_id: int, req: Request = None):
    """Compress session history: summarize all messages, archive them, and inject
    the summary as a synthetic system message so context stays short.

    This directly reduces the LLM context window cost on subsequent messages
    by replacing N messages with a single compact summary block.

    Args:
        session_id: Session to compress.

    Request body (optional JSON):
        keep_recent: int — number of most recent messages to keep verbatim (default 6).

    Returns:
        {"ok": True, "summary": str, "archived": int, "kept": int}
    """
    body = {}
    if req:
        try:
            body = await req.json()
        except Exception:
            pass

    keep_recent: int = int(body.get("keep_recent", 6))

    conn = db()

    # Count total active messages
    total = conn.execute(
        "SELECT COUNT(*) FROM messages WHERE session_id = ? AND is_active = 1",
        (session_id,)
    ).fetchone()[0]

    if total <= keep_recent:
        return {"ok": False, "error": f"Only {total} messages — nothing to compress (keep_recent={keep_recent})"}

    # Get IDs of the most recent messages to keep verbatim
    keep_ids = [
        r[0] for r in conn.execute(
            "SELECT id FROM messages WHERE session_id = ? AND is_active = 1 ORDER BY id DESC LIMIT ?",
            (session_id, keep_recent)
        ).fetchall()
    ]

    # Get ALL active messages for summarization (before archiving)
    all_rows = conn.execute(
        "SELECT role, text FROM messages WHERE session_id = ? AND is_active = 1 ORDER BY id ASC",
        (session_id,)
    ).fetchall()

    messages_text = "\n".join(
        f"{'User' if r[0] == 'user' else 'AI'}: {r[1]}" for r in all_rows
    )

    summarize_prompt = (
        "You are a conversation summarizer. Provide a concise summary of the following conversation. "
        "Include key topics discussed, decisions made, emotional tone, and any important details. "
        "Keep it under 300 words.\n\n"
        f"CONVERSATION:\n{messages_text}\n\n"
        "SUMMARY:"
    )

    cfg = load_config()
    try:
        from backend.llm.registry import get_client
        adapter = get_client(cfg)
        res = await run_in_threadpool(
            adapter.chat,
            [{"role": "user", "content": summarize_prompt}],
            cfg["llm"]["model"],
            cfg["llm"]["endpoint"],
            cfg["llm"]["api_key"],
            temperature=0.3,
            max_tokens=600,
        )
    except Exception as e:
        logger.error(f"Compression summarization failed: {e}")
        raise HTTPException(500, f"Summarization failed: {e}")

    if not res.get("ok"):
        raise HTTPException(500, res.get("error", "LLM error"))

    summary = res["reply"].strip()

    # Archive all messages except the ones we're keeping verbatim.
    # Soft-delete (is_active = 0) preserves history for inspection.
    keep_id_placeholders = ",".join("?" * len(keep_ids))
    archived_count = conn.execute(
        f"UPDATE messages SET is_active = 0 WHERE session_id = ? AND is_active = 1 AND id NOT IN ({keep_id_placeholders})",
        [session_id] + keep_ids
    ).rowcount

    # Insert a synthetic system message at the front of active history so the
    # LLM receives the summary as context on the next request.
    now = int(__import__("time").time())
    conn.execute(
        "INSERT INTO messages (session_id, role, text, ts) VALUES (?, ?, ?, ?)",
        (session_id, "system", f"[CONVERSATION SUMMARY — messages archived]\n{summary}", now - 1)
    )

    # Store summary on the session row as well for the /summary GET endpoint
    conn.execute("UPDATE sessions SET summary = ? WHERE id = ?", (summary, session_id))
    conn.commit()

    return {"ok": True, "summary": summary, "archived": archived_count, "kept": keep_recent}


@app.get("/api/sessions/{session_id}/summary")
def get_session_summary(session_id: int):
    """Get the stored summary for a session (if previously generated).

    Args:
        session_id: Session ID.

    Returns:
        {"ok": True, "summary": "..." or null}
    """
    conn = db()
    row = conn.execute("SELECT summary FROM sessions WHERE id = ?", (session_id,)).fetchone()
    if not row:
        raise HTTPException(404, "Session not found")
    return {"ok": True, "summary": row[0]}


# ==================== CONVERSATION EXPORT ====================

@app.get("/api/sessions/{session_id}/export")
def export_session(session_id: int, format: str = "markdown"):
    """Export a conversation session in the specified format.

    Args:
        session_id: The session to export.
        format: Export format — 'markdown', 'json', or 'txt'.

    Returns:
        StreamingResponse with appropriate Content-Type and filename.
    """
    conn = db()
    cur = conn.cursor()
    try:
        cur.execute("SELECT title, created_ts FROM sessions WHERE id=?", (session_id,))
        session_row = cur.fetchone()
        if not session_row:
            raise HTTPException(404, "Session not found")

        title = session_row[0] or f"Session {session_id}"
        created = session_row[1]

        cur.execute(
            "SELECT role, text, ts FROM messages WHERE session_id=? "
            "AND (is_active=1 OR is_active IS NULL) ORDER BY id ASC",
            (session_id,)
        )
        messages = cur.fetchall()
    finally:
        conn.close()

    if format == "json":
        import json as _json
        export_data = {
            "session_id": session_id,
            "title": title,
            "created_ts": created,
            "exported_at": time.time(),
            "messages": [
                {"role": r, "text": t, "ts": ts}
                for r, t, ts in messages
            ]
        }
        content = _json.dumps(export_data, indent=2, ensure_ascii=False)
        media = "application/json"
        ext = "json"

    elif format == "txt":
        lines = [f"Session: {title}", f"Messages: {len(messages)}", "---", ""]
        for role, text, ts in messages:
            prefix = "You" if role == "user" else "AI"
            lines.append(f"[{prefix}] {text}")
            lines.append("")
        content = "\n".join(lines)
        media = "text/plain"
        ext = "txt"

    else:  # markdown
        lines = [
            f"# {title}",
            f"",
            f"**Session ID:** {session_id}  ",
            f"**Messages:** {len(messages)}  ",
            f"**Exported:** {time.strftime('%Y-%m-%d %H:%M')}",
            f"",
            "---",
            "",
        ]
        for role, text, ts in messages:
            prefix = "**You:**" if role == "user" else "**AI:**"
            lines.append(f"{prefix} {text}")
            lines.append("")
        content = "\n".join(lines)
        media = "text/markdown"
        ext = "md"

    safe_title = "".join(c for c in title if c.isalnum() or c in " _-")[:50].strip()
    filename = f"{safe_title or 'conversation'}_{session_id}.{ext}"

    return StreamingResponse(
        iter([content]),
        media_type=media,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )


@app.get("/api/v2/memory/search")
def v2_memory_search(char_id: int, query: str, n_results: int = 5):
    """Semantic memory search with graceful fallback when vector store is unavailable."""
    if not query.strip():
        return {"results": []}

    if not vector_store:
        return {"results": []}

    try:
        memories = vector_store.query_memory(query, n_results=max(1, min(n_results, 20)), char_id=char_id)
        results = [
            {
                "id": memory.get("id"),
                "text": memory.get("text", ""),
                "role": memory.get("role", ""),
                "score": max(0.0, 1.0 - float(memory.get("dist", 0.0))),
                "session_id": memory.get("session_id"),
                "timestamp": memory.get("timestamp")
            }
            for memory in memories
        ]
        return {"results": results}
    except Exception as e:
        logger.error(f"Memory search failed: {e}")
        return {"results": []}


@app.get("/api/v2/memory/list")
def v2_memory_list(char_id: int = 0, page: int = 0, size: int = 20):
    """List stored memories with pagination.

    Args:
        char_id: Filter by character ID (0 = all characters).
        page: Page number (0-indexed).
        size: Results per page (max 50).

    Returns:
        dict: {"memories": [...], "total": int}
    """
    if not vector_store:
        return {"memories": [], "total": 0}

    size = max(1, min(size, 50))
    cid = char_id if char_id > 0 else None
    return vector_store.list_memories(char_id=cid, page=page, size=size)


@app.delete("/api/v2/memory/{memory_id}")
def v2_memory_delete(memory_id: str):
    """Delete a single memory by its ChromaDB ID.

    Args:
        memory_id: The memory document ID to delete.

    Returns:
        dict: {"ok": True} on success.

    Raises:
        HTTPException 500: If vector store is unavailable or deletion fails.
    """
    if not vector_store:
        raise HTTPException(500, "Vector store not available")

    ok = vector_store.delete_memory(memory_id)
    if not ok:
        raise HTTPException(500, "Failed to delete memory")
    return {"ok": True}


@app.patch("/api/v2/memory/{memory_id}/promote")
def v2_memory_promote(memory_id: str):
    """Promote a memory to Tier 3 (permanent — never pruned).

    Only available when the TieredMemoryManager (sqlite-vec) is active.

    Args:
        memory_id: The memory row ID to promote.

    Returns:
        dict: {"ok": True} on success.

    Raises:
        HTTPException 501: If vector store doesn't support tiering.
        HTTPException 500: If promotion fails.

    Example:
        >>> PATCH /api/v2/memory/42/promote
        {"ok": true}
    """
    from backend.memory.tiered_memory import TieredMemoryManager
    if not vector_store or not isinstance(vector_store, TieredMemoryManager):
        raise HTTPException(501, "Tier promotion requires TieredMemoryManager")
    ok = vector_store.promote_to_permanent(memory_id)
    if not ok:
        raise HTTPException(500, "Failed to promote memory")
    return {"ok": True}


@app.post("/api/v2/memory/decay")
def v2_memory_decay(weeks: int = 4):
    """Run a manual decay pass (demote/prune old Tier-2 memories).

    Args:
        weeks: Age threshold in weeks. Memories older than this may be
            demoted or pruned depending on the configured decay_mode.

    Returns:
        dict: {"affected": int} — number of memories changed.

    Raises:
        HTTPException 501: If tiered memory is not active.

    Example:
        >>> POST /api/v2/memory/decay?weeks=4
        {"affected": 12}
    """
    from backend.memory.tiered_memory import TieredMemoryManager
    if not vector_store or not isinstance(vector_store, TieredMemoryManager):
        raise HTTPException(501, "Decay requires TieredMemoryManager")
    affected = vector_store.run_decay(weeks_threshold=weeks)
    return {"affected": affected}


@app.get("/api/v2/memory/graph")
def v2_memory_graph(session_id: int = 1, char_id: int = 1, limit: int = 40):
    """Conversation graph with retrieval links for Memory Bank visualization."""
    _telemetry_inc("memory.graph_requests_total")
    graph_limit = max(6, min(limit, 100))

    conn = db()
    cur = conn.cursor()
    cur.execute(
        "SELECT id, role, text, ts FROM messages WHERE session_id=? ORDER BY id DESC LIMIT ?",
        (session_id, graph_limit)
    )
    rows = cur.fetchall()[::-1]
    conn.close()

    nodes = []
    edges = []

    spacing_x = 90
    spacing_y = 56
    x = 32
    y_user = 84
    y_assistant = 180

    for index, row in enumerate(rows):
        message_id, role, text, ts = row
        node_id = f"m-{message_id}"
        nodes.append({
            "id": node_id,
            "label": (text or "")[:40],
            "role": role if role in {"user", "assistant"} else "assistant",
            "x": x + index * spacing_x,
            "y": y_user if role == "user" else y_assistant
        })

        if index > 0:
            prev = rows[index - 1][0]
            edges.append({
                "id": f"seq-{prev}-{message_id}",
                "source": f"m-{prev}",
                "target": node_id,
                "kind": "sequence"
            })

    memory_hits = []
    mode = "session"

    if vector_store and rows:
        try:
            latest_text = rows[-1][2] or ""
            memory_hits = vector_store.query_memory(latest_text, n_results=5, char_id=char_id)
            if memory_hits:
                mode = "rag"
                anchor_id = f"m-{rows[-1][0]}"
                for i, memory in enumerate(memory_hits):
                    mem_node_id = f"r-{i}"
                    nodes.append({
                        "id": mem_node_id,
                        "label": (memory.get("text", "") or "")[:36],
                        "role": "memory",
                        "x": 40 + i * 68,
                        "y": 252,
                        "score": max(0.0, 1.0 - float(memory.get("dist", 0.0)))
                    })
                    edges.append({
                        "id": f"ret-{i}",
                        "source": anchor_id,
                        "target": mem_node_id,
                        "kind": "retrieval"
                    })
        except Exception as e:
            logger.error(f"Memory graph retrieval failed: {e}")
            _telemetry_inc("memory.graph_fallback_total")
    elif vector_store is None:
        _telemetry_inc("memory.graph_fallback_total")

    if mode == "rag":
        _telemetry_inc("memory.graph_rag_mode_total")
    else:
        _telemetry_inc("memory.graph_session_mode_total")

    return {
        "mode": mode,
        "nodes": nodes,
        "edges": edges,
        "stats": {
            "sessionMessages": len(rows),
            "memoryHits": len(memory_hits),
            "ragAvailable": vector_store is not None
        }
    }


@app.get("/api/v2/telemetry/summary")
def v2_telemetry_summary():
    snapshot = _telemetry_snapshot()
    api_total = snapshot["api.requests_total"]
    chat_total = snapshot["chat.requests_total"]
    memory_total = snapshot["memory.graph_requests_total"]
    fallback_total = snapshot["memory.graph_fallback_total"]
    return {
        "window_started_at": snapshot["window_started_at"],
        "api": {
            "requests_total": api_total,
            "errors_4xx": snapshot["api.errors_4xx"],
            "errors_5xx": snapshot["api.errors_5xx"],
            "error_rate": round(
                (snapshot["api.errors_4xx"] + snapshot["api.errors_5xx"]) / api_total, 4
            ) if api_total else 0.0
        },
        "chat": {
            "requests_total": chat_total,
            "failures_total": snapshot["chat.failures_total"],
            "failure_rate": round(snapshot["chat.failures_total"] / chat_total, 4) if chat_total else 0.0
        },
        "memory": {
            "graph_requests_total": memory_total,
            "graph_rag_mode_total": snapshot["memory.graph_rag_mode_total"],
            "graph_session_mode_total": snapshot["memory.graph_session_mode_total"],
            "graph_fallback_total": fallback_total,
            "fallback_rate": round(fallback_total / memory_total, 4) if memory_total else 0.0
        }
    }


# ==================== CHARACTER MANAGEMENT ====================

@app.get("/api/characters")
def list_characters():
    """List all characters."""
    conn = db()
    cur = conn.cursor()
    # Check if table exists/has correct columns by trying select
    try:
        cur.execute("""
            SELECT id, name, system_prompt, avatar_url, voice_id, tts_provider,
                   personality_traits, live2d_model, model_type, avatar_2d_url, vrm_model_url,
                   greeting_text, greeting_animation, background_url, background_mode, voice_sample_path,
                   llm_endpoint, llm_model, llm_temperature, last_emotion, voice_config,
                   expr_portraits, first_chat_date, diary, diary_date, capability_profile,
                   tts_pitch, tts_rate, vocab_categories, animation_profile, emotion_voice_overrides,
                   mood_enabled, mood_intensity
            FROM characters
            ORDER BY id ASC
        """)
    except Exception:
        # Fallback for pre-v7 schema
        try:
            cur.execute("""
                SELECT id, name, system_prompt, avatar_url, voice_id, tts_provider,
                       personality_traits, live2d_model, model_type, avatar_2d_url, vrm_model_url
                FROM characters ORDER BY id ASC
            """)
        except Exception:
            conn.close()
            return {"characters": [{"id": 1, "name": "Default", "system_prompt": "You are a helpful AI.", "avatar_url": ""}]}

    characters = []
    for row in cur.fetchall():
        traits = []
        try:
            if row[6]:
                traits = json.loads(row[6])
        except (json.JSONDecodeError, TypeError):
            pass
        char = {
            "id": row[0],
            "name": row[1],
            "system_prompt": row[2],
            "avatar_url": row[3],
            "voice_id": row[4],
            "tts_provider": row[5],
            "personality_traits": traits,
            "live2d_model": row[7] if len(row) > 7 else "",
            "model_type": row[8] if len(row) > 8 else "3d",
            "avatar_2d_url": row[9] if len(row) > 9 else row[3],
            "vrm_model_url": row[10] if len(row) > 10 else "",
            "greeting_text": row[11] if len(row) > 11 else None,
            "greeting_animation": row[12] if len(row) > 12 else None,
            "background_url": row[13] if len(row) > 13 else None,
            "background_mode": row[14] if len(row) > 14 else "transparent",
            "voice_sample_path": row[15] if len(row) > 15 else None,
            "llm_endpoint": row[16] if len(row) > 16 else "",
            "llm_model": row[17] if len(row) > 17 else "",
            "llm_temperature": row[18] if len(row) > 18 else None,
            "last_emotion": row[19] if len(row) > 19 else "neutral",
            "voice_config": row[20] if len(row) > 20 else None,
            "expr_portraits": row[21] if len(row) > 21 else None,
            "first_chat_date": row[22] if len(row) > 22 else None,
            "diary": row[23] if len(row) > 23 else None,
            "diary_date": row[24] if len(row) > 24 else None,
            "capability_profile": row[25] if len(row) > 25 else None,
            "tts_pitch": row[26] if len(row) > 26 else None,
            "tts_rate": row[27] if len(row) > 27 else None,
            "vocab_categories": row[28] if len(row) > 28 else None,
            "animation_profile": json.loads(row[29]) if len(row) > 29 and row[29] else None,
            # Feature H: per-emotion TTS voice overrides (JSON string or None)
            "emotion_voice_overrides": row[30] if len(row) > 30 else None,
            # Feature A4: time-of-day mood fields (schema v23)
            "mood_enabled": bool(row[31]) if len(row) > 31 and row[31] is not None else True,
            "mood_intensity": float(row[32]) if len(row) > 32 and row[32] is not None else 0.8,
        }
        characters.append(char)
    conn.close()
    return {"characters": characters}

@app.get("/api/characters/recent-messages")
def get_recent_messages_per_character():
    """Return the last assistant message and its timestamp for each character.

    Uses a single GROUP BY query rather than per-character round-trips.
    Messages are linked to characters via the char_id column on messages.

    Returns:
        {"ok": True, "recent": {char_id: {"text": str, "ts": float}}}
    """
    conn = db()
    cur = conn.cursor()
    try:
        cur.execute("""
            SELECT char_id, text, MAX(ts) as last_ts
            FROM messages
            WHERE role = 'assistant' AND char_id IS NOT NULL
            GROUP BY char_id
        """)
        recent = {}
        for row in cur.fetchall():
            char_id, text, ts = row
            # Truncate long messages for preview display
            preview = (text[:120] + "…") if text and len(text) > 120 else (text or "")
            recent[str(char_id)] = {"text": preview, "ts": ts}
    except Exception:
        recent = {}
    finally:
        conn.close()
    return {"ok": True, "recent": recent}


@app.post("/api/characters")
async def create_character(req: Request):
    """Create a new character with all supported fields.

    Accepts the same field set as PUT /api/characters/{id} so the full-page
    Create-a-Waifu wizard can persist every setting on first save.

    Args:
        req: JSON body with ``name`` (required), ``system_prompt`` (required),
            and any optional character fields (vrm_model_url, tts_provider, etc.)

    Returns:
        dict: The newly created character record with all persisted fields.

    Raises:
        HTTPException 400: If name or system_prompt is missing.
        HTTPException 500: On database write failure.
    """
    body = await req.json()
    name = body.get("name", "")
    system_prompt = body.get("system_prompt", "")
    if not name or not system_prompt:
        raise HTTPException(400, "name and system_prompt required")

    # Auto-assign default voice if none provided
    voice_id = body.get("voice_id", "")
    tts_provider = body.get("tts_provider", "")
    if not voice_id and tts_model_mgr:
        default_voice = tts_model_mgr.get_default_voice()
        voice_id = default_voice["voice_id"]
        tts_provider = tts_provider or default_voice["provider"]

    # All optional fields — mirrors the PUT endpoint's field list
    fields = {
        "avatar_url": body.get("avatar_url", ""),
        "avatar_2d_url": body.get("avatar_2d_url", ""),
        "vrm_model_url": body.get("vrm_model_url", ""),
        "voice_id": voice_id,
        "tts_provider": tts_provider,
        "tts_pitch": body.get("tts_pitch", ""),
        "tts_rate": body.get("tts_rate", ""),
        "personality_traits": json.dumps(body.get("personality_traits", [])),
        "greeting_text": body.get("greeting_text", ""),
        "greeting_animation": body.get("greeting_animation", ""),
        "background_url": body.get("background_url", ""),
        "background_mode": body.get("background_mode", ""),
        "llm_endpoint": body.get("llm_endpoint", ""),
        "llm_model": body.get("llm_model", ""),
        "llm_temperature": body.get("llm_temperature"),
        "voice_config": json.dumps(body.get("voice_config", {})) if body.get("voice_config") else "",
        "vocab_categories": json.dumps(body.get("vocab_categories", [])) if body.get("vocab_categories") else "",
        "capability_profile": json.dumps(body.get("capability_profile", {})) if body.get("capability_profile") else None,
        "animation_profile": json.dumps(body.get("animation_profile", {})) if body.get("animation_profile") else None,
        # Feature H: per-emotion TTS voice overrides JSON blob
        "emotion_voice_overrides": json.dumps(body.get("emotion_voice_overrides")) if body.get("emotion_voice_overrides") else None,
        "live2d_model": "",
        "model_type": "3d",
    }

    cols = ["name", "system_prompt"] + list(fields.keys())
    vals = [name, system_prompt] + list(fields.values())
    placeholders = ", ".join(["?"] * len(cols))
    col_names = ", ".join(cols)

    conn = db()
    cur = conn.cursor()
    try:
        cur.execute(f"INSERT INTO characters ({col_names}) VALUES ({placeholders})", vals)
        char_id = cur.lastrowid
        conn.commit()
    except Exception as e:
        conn.close()
        raise HTTPException(500, f"DB Error: {e}")
    conn.close()
    return {
        "id": char_id,
        "name": name,
        "system_prompt": system_prompt,
        **{k: v for k, v in fields.items() if k != "personality_traits"},
        "personality_traits": body.get("personality_traits", []),
    }

@app.put("/api/characters/{character_id}")
async def update_character(character_id: int, req: Request):
    """Update character details."""
    body = await req.json()
    conn = db()
    cur = conn.cursor()
    updates = []
    params = []
    
    fields = [
        "name", "system_prompt", "avatar_url", "voice_id", "tts_provider",
        "tts_pitch", "tts_rate", "live2d_model", "model_type", "avatar_2d_url",
        "vrm_model_url", "greeting_text", "greeting_animation", "background_url",
        "background_mode", "voice_sample_path", "vocab_categories",
        "llm_endpoint", "llm_model", "llm_temperature", "last_emotion",
        "voice_config",  # v13: extended per-character voice settings JSON (#77)
        "capability_profile",  # v15: Phase 9 per-character LLM capability metadata
        "animation_profile",  # v16: Phase 6F per-character animation personality traits
        "emotion_voice_overrides",  # v19: Feature H per-emotion TTS voice override map
        "mood_enabled",  # v23: Feature A4 time-of-day mood toggle
        "mood_intensity",  # v23: Feature A4 mood strength 0.0-1.0
    ]
    _json_fields = {"capability_profile", "voice_config", "vocab_categories", "animation_profile", "emotion_voice_overrides"}
    for field in fields:
        if field in body:
            updates.append(f"{field}=?")
            val = body[field]
            # JSON-encode dict/list values before storing
            if field in _json_fields and isinstance(val, (dict, list)):
                val = json.dumps(val)
            params.append(val)

    if "personality_traits" in body:
        updates.append("personality_traits=?")
        params.append(json.dumps(body["personality_traits"]))
        
    if not updates:
        conn.close()
        return {"ok": True} # No updates needed
        
    params.append(character_id)
    try:
        cur.execute(f"UPDATE characters SET {', '.join(updates)} WHERE id=?", params)
        conn.commit()
    except Exception as e:
        conn.close()
        raise HTTPException(500, f"DB Error: {e}")
    conn.close()
    return {"ok": True}

@app.delete("/api/characters/{character_id}")
def delete_character(character_id: int):
    """Delete a character."""
    if character_id == 1:
        raise HTTPException(400, "Cannot delete default character")
    conn = db()
    cur = conn.cursor()
    cur.execute("DELETE FROM characters WHERE id=?", (character_id,))
    conn.commit()
    conn.close()
    return {"ok": True}


# ==================== CHARACTER IMPORT/EXPORT ====================

@app.get("/api/characters/{character_id}/export")
def export_character(character_id: int):
    """Export a character as a JSON package.

    Includes all character fields and metadata for portable import.

    Args:
        character_id: The character to export.

    Returns:
        dict: Full character data with export metadata.
    """
    conn = db()
    cur = conn.cursor()
    try:
        cur.execute("SELECT * FROM characters WHERE id=?", (character_id,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "Character not found")

        columns = [desc[0] for desc in cur.description]
        char_data = dict(zip(columns, row))

        # Parse personality_traits from JSON string
        if char_data.get('personality_traits'):
            try:
                char_data['personality_traits'] = json.loads(char_data['personality_traits'])
            except (json.JSONDecodeError, TypeError):
                char_data['personality_traits'] = []

        char_data['_export_version'] = 1
        char_data['_exported_at'] = time.time()
        # Remove internal ID so import creates a new one
        char_data.pop('id', None)

        return char_data
    finally:
        conn.close()


@app.post("/api/characters/export/{char_id}")
async def export_character_post(char_id: int):
    """Export a character as a shareable JSON card (POST variant).

    Sanitizes the character data by removing internal IDs and private fields.
    The exported JSON can be imported by anyone using POST /api/characters/import.

    Args:
        char_id: The character's database ID.

    Returns:
        dict: {"ok": True, "character": sanitized_character_dict} with
              schema_version and exported_at metadata fields.

    Raises:
        HTTPException: 404 if character not found.

    Example:
        >>> response = client.post("/api/characters/export/1")
        >>> assert response.json()["ok"] == True
    """
    import datetime as _dt
    conn = db()
    cur = conn.cursor()
    try:
        cur.execute("SELECT * FROM characters WHERE id=?", (char_id,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "Character not found")

        columns = [desc[0] for desc in cur.description]
        char_data = dict(zip(columns, row))

        # Parse personality_traits from JSON string so the export is readable
        if char_data.get('personality_traits'):
            try:
                char_data['personality_traits'] = json.loads(char_data['personality_traits'])
            except (json.JSONDecodeError, TypeError):
                char_data['personality_traits'] = []

        # Sanitize: strip internal/private fields before sharing
        STRIP_FIELDS = {"id", "created_at", "updated_at", "session_count", "message_count"}
        card = {k: v for k, v in char_data.items() if k not in STRIP_FIELDS and v is not None}
        card["schema_version"] = 1
        card["exported_at"] = _dt.datetime.utcnow().isoformat() + "Z"

        return {"ok": True, "character": card}
    finally:
        conn.close()


@app.post("/api/characters/import")
async def import_character(req: Request):
    """Import a character from a JSON export package.

    Creates a new character from the provided data. Internal fields
    like ``id``, ``_export_*``, ``schema_version``, and ``exported_at``
    metadata are stripped before insert.

    Args:
        req: JSON body with character fields.

    Returns:
        dict: {"ok": True, "id": new_character_id, "name": str}
    """
    body = await req.json()

    name = body.get("name")
    system_prompt = body.get("system_prompt")
    if not name or not system_prompt:
        raise HTTPException(400, "name and system_prompt required")

    # Strip export metadata (both old _export_* keys and new schema_version/exported_at)
    for key in ['_export_version', '_exported_at', 'id', 'schema_version', 'exported_at']:
        body.pop(key, None)

    # Serialize personality_traits back to JSON string
    traits = body.get('personality_traits', [])
    if isinstance(traits, list):
        body['personality_traits'] = json.dumps(traits)

    conn = db()
    cur = conn.cursor()
    try:
        # Build dynamic INSERT from available fields
        allowed_fields = [
            'name', 'system_prompt', 'avatar_url', 'voice_id', 'tts_provider',
            'tts_pitch', 'tts_rate', 'personality_traits', 'live2d_model',
            'model_type', 'avatar_2d_url', 'vrm_model_url', 'greeting_text',
            'greeting_animation', 'background_url', 'background_mode', 'voice_sample_path',
            'vocab_categories', 'llm_endpoint', 'llm_model', 'llm_temperature',
            'voice_config', 'capability_profile', 'animation_profile',
            'emotion_voice_overrides',  # Feature H: per-emotion TTS voice override map
        ]
        # JSON-encode dict/list fields before INSERT
        for jf in ('voice_config', 'capability_profile', 'vocab_categories', 'animation_profile', 'emotion_voice_overrides'):
            if jf in body and isinstance(body[jf], (dict, list)):
                body[jf] = json.dumps(body[jf])
        fields = []
        values = []
        for f in allowed_fields:
            if f in body:
                fields.append(f)
                values.append(body[f])

        placeholders = ','.join(['?'] * len(fields))
        field_names = ','.join(fields)
        cur.execute(f"INSERT INTO characters ({field_names}) VALUES ({placeholders})", values)
        char_id = cur.lastrowid
        conn.commit()

        return {"ok": True, "id": char_id, "name": name}
    except Exception as e:
        raise HTTPException(500, f"Import failed: {e}")
    finally:
        conn.close()


@app.post("/api/characters/import-card")
async def import_chara_card(file: UploadFile = File(...)):
    """Import a SillyTavern CHARA v2 character card PNG.

    Reads the embedded CHARA v2 JSON payload from the PNG's tEXt chunk (key
    ``chara``) or EXIF UserComment fallback, maps the fields to the app's
    character schema, saves the PNG as the character's avatar, and creates the
    character row in the database.

    Args:
        file: Multipart PNG upload containing a CHARA v2 payload.

    Returns:
        dict: ``{"ok": True, "id": int, "name": str}``

    Raises:
        HTTPException 400: If the file is not a PNG or has no CHARA payload.
        HTTPException 500: On database errors.

    Example::

        curl -X POST /api/characters/import-card \\
             -F "file=@my_character.png"
    """
    from backend.characters.chara_card import CharaCardReader

    if not file.filename:
        raise HTTPException(400, "No file provided")
    if not file.filename.lower().endswith(".png"):
        raise HTTPException(400, "Character cards must be PNG files")

    png_bytes = await file.read()
    try:
        reader = CharaCardReader()
        card_data = reader.read_bytes(png_bytes)
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(400, f"Failed to parse character card: {e}")

    # Save PNG as the character's avatar
    safe_name = "".join(c for c in (card_data["name"] or "imported") if c.isalpha() or c.isdigit() or c in "_-")
    safe_name = safe_name[:40] or "imported"
    import time as _time
    avatar_filename = f"card_{safe_name}_{int(_time.time())}.png"
    avatar_path = STORAGE / "avatars" / avatar_filename
    try:
        avatar_path.parent.mkdir(parents=True, exist_ok=True)
        with open(avatar_path, "wb") as fh:
            fh.write(png_bytes)
        avatar_url = f"/files/avatars/{avatar_filename}"
    except Exception:
        avatar_url = None

    conn = db()
    cur = conn.cursor()
    try:
        # Map CHARA v2 fields → characters table columns
        # personality_traits stores the character description (background)
        # greeting_text stores first_mes
        fields: list[str] = ["name"]
        values: list = [card_data["name"]]

        if card_data.get("system_prompt"):
            fields.append("system_prompt")
            values.append(card_data["system_prompt"])
        if card_data.get("background"):
            # description + personality + scenario joined — store as personality_traits
            fields.append("personality_traits")
            values.append(card_data["background"])
        if card_data.get("greeting_message"):
            fields.append("greeting_text")
            values.append(card_data["greeting_message"])
        if avatar_url:
            fields.append("avatar_url")
            values.append(avatar_url)

        placeholders = ",".join(["?"] * len(fields))
        field_names = ",".join(fields)
        cur.execute(f"INSERT INTO characters ({field_names}) VALUES ({placeholders})", values)
        char_id = cur.lastrowid
        conn.commit()
        logger.info("[import-card] Created character %r (id=%s) from CHARA v2 card", card_data["name"], char_id)
        return {"ok": True, "id": char_id, "name": card_data["name"]}
    except Exception as e:
        raise HTTPException(500, f"Import failed: {e}")
    finally:
        conn.close()


@app.get("/api/characters/{character_id}/export-card")
async def export_chara_card(character_id: int):
    """Export a character as a SillyTavern-compatible CHARA v2 PNG card.

    Fetches the character row, loads the avatar PNG from disk (or uses a
    placeholder), embeds a CHARA v2 JSON payload in the PNG's tEXt chunk, and
    returns the file as a downloadable ``application/octet-stream`` response.

    Args:
        character_id: ID of the character to export.

    Returns:
        StreamingResponse: PNG file download named ``<name>.png``.

    Raises:
        HTTPException 404: If the character does not exist.
        HTTPException 500: On serialization errors.

    Example::

        curl -O /api/characters/1/export-card
    """
    import io as _io
    from backend.characters.chara_card import CharaCardWriter
    from starlette.responses import StreamingResponse

    conn = db()
    cur = conn.cursor()
    try:
        row = cur.execute(
            """SELECT name, system_prompt, personality_traits, greeting_text, avatar_url
               FROM characters WHERE id = ?""",
            (character_id,),
        ).fetchone()
    finally:
        conn.close()

    if not row:
        raise HTTPException(404, "Character not found")

    name, system_prompt, background, greeting_message, avatar_url = row

    # Load avatar bytes from disk if the URL maps to a local file
    avatar_bytes: bytes | None = None
    if avatar_url and avatar_url.startswith("/files/avatars/"):
        filename = avatar_url.split("/files/avatars/")[-1]
        local_path = STORAGE / "avatars" / filename
        if local_path.exists():
            try:
                avatar_bytes = local_path.read_bytes()
            except Exception:
                pass

    char_data = {
        "name": name or "Character",
        "background": background or "",
        "system_prompt": system_prompt or "",
        "greeting_message": greeting_message or "",
        "backstory": "",
        "creator_notes": "",
        "tags": [],
    }

    try:
        writer = CharaCardWriter()
        png_bytes = writer.write_bytes(char_data, avatar_bytes)
    except Exception as e:
        raise HTTPException(500, f"Export failed: {e}")

    safe_name = "".join(c for c in (name or "character") if c.isalpha() or c.isdigit() or c in "_- ")
    safe_name = safe_name.strip() or "character"
    filename = f"{safe_name}.png"

    return StreamingResponse(
        _io.BytesIO(png_bytes),
        media_type="application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ==================== CHARACTER KNOWLEDGE BASE ====================

@app.post("/api/characters/{character_id}/docs")
async def upload_character_doc(character_id: int, file: UploadFile = File(...)):
    """Upload a text document to a character's knowledge base.

    The document is chunked into ~500-character segments and each chunk
    is embedded into ChromaDB for semantic retrieval during chat.

    Args:
        character_id: The character this document belongs to.
        file: Text file upload (.txt or .md).

    Returns:
        dict: {"ok": True, "doc_id": int, "chunk_count": int}
    """
    if not file.filename:
        raise HTTPException(400, "No file provided")

    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ('.txt', '.md', '.text'):
        raise HTTPException(400, "Only .txt and .md files are supported")

    content = (await file.read()).decode('utf-8', errors='replace')
    if not content.strip():
        raise HTTPException(400, "File is empty")

    # Chunk the content into ~500-char segments at sentence boundaries
    chunks = _chunk_text(content, max_chars=500)

    conn = db()
    cur = conn.cursor()
    try:
        cur.execute(
            "INSERT INTO character_docs (char_id, filename, content, chunk_count) VALUES (?,?,?,?)",
            (character_id, file.filename, content, len(chunks))
        )
        doc_id = cur.lastrowid
        conn.commit()
    except Exception as e:
        raise HTTPException(500, f"DB error: {e}")
    finally:
        conn.close()

    # Embed chunks in vector store
    stored = 0
    if vector_store:
        stored = vector_store.add_doc_chunks(character_id, doc_id, file.filename, chunks)

    return {"ok": True, "doc_id": doc_id, "chunk_count": stored}


@app.get("/api/characters/{character_id}/docs")
def list_character_docs(character_id: int):
    """List all knowledge documents for a character.

    Args:
        character_id: The character whose docs to list.

    Returns:
        dict: {"docs": [{id, filename, chunk_count, created_ts}, ...]}
    """
    conn = db()
    cur = conn.cursor()
    try:
        cur.execute(
            "SELECT id, filename, chunk_count, created_ts FROM character_docs "
            "WHERE char_id=? ORDER BY created_ts DESC",
            (character_id,)
        )
        docs = [
            {"id": r[0], "filename": r[1], "chunk_count": r[2], "created_ts": r[3]}
            for r in cur.fetchall()
        ]
        return {"docs": docs}
    finally:
        conn.close()


@app.delete("/api/characters/{character_id}/docs/{doc_id}")
def delete_character_doc(character_id: int, doc_id: int):
    """Delete a knowledge document and its vector store chunks.

    Args:
        character_id: The character the doc belongs to.
        doc_id: The document ID to delete.

    Returns:
        dict: {"ok": True}
    """
    conn = db()
    try:
        conn.execute(
            "DELETE FROM character_docs WHERE id=? AND char_id=?",
            (doc_id, character_id)
        )
        conn.commit()
    finally:
        conn.close()

    if vector_store:
        vector_store.delete_doc_chunks(doc_id)

    return {"ok": True}


# ==================== PROMPT TEMPLATE LIBRARY ====================

@app.get("/api/templates")
def list_templates(category: str = ""):
    """List all prompt templates, optionally filtered by category.

    Args:
        category: Filter by template category (empty = all).

    Returns:
        dict: {"templates": [{id, name, category, system_prompt, description, created_ts}, ...]}
    """
    conn = db()
    cur = conn.cursor()
    try:
        if category:
            cur.execute(
                "SELECT id, name, category, system_prompt, description, created_ts "
                "FROM prompt_templates WHERE category=? ORDER BY name ASC",
                (category,)
            )
        else:
            cur.execute(
                "SELECT id, name, category, system_prompt, description, created_ts "
                "FROM prompt_templates ORDER BY category ASC, name ASC"
            )
        templates = [
            {"id": r[0], "name": r[1], "category": r[2], "system_prompt": r[3],
             "description": r[4], "created_ts": r[5]}
            for r in cur.fetchall()
        ]
        return {"templates": templates}
    finally:
        conn.close()


@app.post("/api/templates")
async def create_template(req: Request):
    """Create a new prompt template.

    Args:
        req: JSON body with ``name``, ``system_prompt``, optional ``category`` and ``description``.

    Returns:
        dict: {"ok": True, "id": template_id}
    """
    body = await req.json()
    name = body.get("name", "").strip()
    system_prompt = body.get("system_prompt", "").strip()
    if not name or not system_prompt:
        raise HTTPException(400, "name and system_prompt required")

    category = body.get("category", "custom")
    description = body.get("description", "")

    conn = db()
    cur = conn.cursor()
    try:
        cur.execute(
            "INSERT INTO prompt_templates (name, category, system_prompt, description) VALUES (?,?,?,?)",
            (name, category, system_prompt, description)
        )
        tpl_id = cur.lastrowid
        conn.commit()
        return {"ok": True, "id": tpl_id}
    finally:
        conn.close()


@app.put("/api/templates/{template_id}")
async def update_template(template_id: int, req: Request):
    """Update an existing prompt template.

    Args:
        template_id: The template to update.
        req: JSON body with fields to update.

    Returns:
        dict: {"ok": True}
    """
    body = await req.json()
    updates = []
    params = []
    for field in ['name', 'category', 'system_prompt', 'description']:
        if field in body:
            updates.append(f"{field}=?")
            params.append(body[field])

    if not updates:
        return {"ok": True}

    params.append(template_id)
    conn = db()
    try:
        conn.execute(f"UPDATE prompt_templates SET {', '.join(updates)} WHERE id=?", params)
        conn.commit()
    finally:
        conn.close()
    return {"ok": True}


@app.delete("/api/templates/{template_id}")
def delete_template(template_id: int):
    """Delete a prompt template.

    Args:
        template_id: The template to delete.

    Returns:
        dict: {"ok": True}
    """
    conn = db()
    try:
        conn.execute("DELETE FROM prompt_templates WHERE id=?", (template_id,))
        conn.commit()
    finally:
        conn.close()
    return {"ok": True}


@app.get("/api/templates/export")
def export_templates():
    """Export all templates as a JSON array.

    Returns:
        dict: {"templates": [...]} suitable for re-import.
    """
    conn = db()
    cur = conn.cursor()
    try:
        cur.execute(
            "SELECT name, category, system_prompt, description FROM prompt_templates ORDER BY name"
        )
        templates = [
            {"name": r[0], "category": r[1], "system_prompt": r[2], "description": r[3]}
            for r in cur.fetchall()
        ]
        return {"templates": templates}
    finally:
        conn.close()


@app.post("/api/templates/import")
async def import_templates(req: Request):
    """Import prompt templates from a JSON array.

    Skips templates whose name already exists.

    Args:
        req: JSON body with ``templates`` array.

    Returns:
        dict: {"ok": True, "imported": int, "skipped": int}
    """
    body = await req.json()
    templates = body.get("templates", [])
    if not templates:
        raise HTTPException(400, "No templates provided")

    conn = db()
    cur = conn.cursor()
    imported = 0
    skipped = 0
    try:
        for tpl in templates:
            name = tpl.get("name", "").strip()
            prompt = tpl.get("system_prompt", "").strip()
            if not name or not prompt:
                skipped += 1
                continue

            # Check if name exists
            cur.execute("SELECT id FROM prompt_templates WHERE name=?", (name,))
            if cur.fetchone():
                skipped += 1
                continue

            cur.execute(
                "INSERT INTO prompt_templates (name, category, system_prompt, description) VALUES (?,?,?,?)",
                (name, tpl.get("category", "imported"), prompt, tpl.get("description", ""))
            )
            imported += 1

        conn.commit()
    finally:
        conn.close()

    return {"ok": True, "imported": imported, "skipped": skipped}


# ==================== FILE UPLOAD HANDLERS ====================

@app.post("/api/upload/avatar")
async def upload_avatar_endpoint(file: UploadFile = File(...)):
    """Upload a VRM avatar file."""
    if not file.filename.endswith(".vrm"):
        raise HTTPException(400, "File must be .vrm")
    
    # Sanitize filename
    safe_name = "".join([c for c in file.filename if c.isalpha() or c.isdigit() or c in "._-"])
    file_path = STORAGE / "avatars" / safe_name
    
    try:
        content = await file.read()
        with open(file_path, "wb") as f:
            f.write(content)
        return {"ok": True, "url": f"/files/avatars/{safe_name}", "path": str(file_path)}
    except Exception as e:
        logger.error(f"Avatar Upload Failed: {e}")
        raise HTTPException(500, "Upload failed")

@app.post("/api/upload/image")
async def upload_image_endpoint(file: UploadFile = File(...), category: str = ""):
    """Upload a generic image (thumbnail/bg/avatar).

    Args:
        file: Image file upload (multipart/form-data)
        category: Optional category hint ('avatar', 'background').
                  Affects filename prefix so scan_images() can classify it.

    Returns:
        {"ok": True, "url": "/files/images/..."}
    """
    allowed = [".png", ".jpg", ".jpeg", ".webp", ".gif"]
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in allowed:
        raise HTTPException(400, f"File type not allowed. Use: {allowed}")

    # Prefix with category hint so scan_images can detect type
    # "icon" in name → scan classifies as avatar
    prefix = "icon" if category == "avatar" else "img"
    safe_name = f"{prefix}_{int(time.time())}{ext}"
    save_dir = STORAGE / "images"
    save_dir.mkdir(exist_ok=True)

    file_path = save_dir / safe_name

    try:
        content = await file.read()
        with open(file_path, "wb") as f:
            f.write(content)
        return {"ok": True, "url": f"/files/images/{safe_name}"}
    except Exception as e:
        logger.error(f"Image Upload Failed: {e}")
        raise HTTPException(500, "Upload failed")

@app.post("/api/characters/{char_id}/voice-sample")
async def upload_voice_sample(char_id: int, file: UploadFile = File(...)):
    """Upload a voice sample for XTTS voice cloning.

    Saves the audio file to storage/voice_samples/{char_id}/ and updates
    the character's voice_sample_path column in the database.

    Args:
        char_id: Character ID to associate the voice sample with.
        file: Audio file (WAV, MP3, OGG, FLAC).

    Returns:
        {"ok": True, "path": "/files/voice_samples/{char_id}/filename"}
    """
    allowed_ext = [".wav", ".mp3", ".ogg", ".flac", ".m4a"]
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in allowed_ext:
        raise HTTPException(400, f"Audio format not supported. Use: {allowed_ext}")

    save_dir = STORAGE / "voice_samples" / str(char_id)
    save_dir.mkdir(parents=True, exist_ok=True)

    safe_name = f"voice_sample{ext}"
    file_path = save_dir / safe_name

    try:
        content = await file.read()
        with open(file_path, "wb") as f:
            f.write(content)

        # Update character's voice_sample_path in DB
        rel_path = f"/files/voice_samples/{char_id}/{safe_name}"
        conn = db()
        conn.execute("UPDATE characters SET voice_sample_path = ? WHERE id = ?", (rel_path, char_id))
        conn.commit()

        logger.info(f"Voice sample uploaded for character {char_id}: {file_path}")
        return {"ok": True, "path": rel_path, "abs_path": str(file_path)}
    except Exception as e:
        logger.error(f"Voice sample upload failed: {e}")
        raise HTTPException(500, f"Upload failed: {e}")


@app.delete("/api/characters/{char_id}/voice-sample")
async def delete_voice_sample(char_id: int):
    """Delete a character's voice sample file and clear the DB column.

    Args:
        char_id: Character ID whose voice sample to delete.

    Returns:
        {"ok": True}
    """
    conn = db()
    row = conn.execute("SELECT voice_sample_path FROM characters WHERE id = ?", (char_id,)).fetchone()
    if not row:
        raise HTTPException(404, "Character not found")

    voice_path = row[0]
    if voice_path:
        try:
            # voice_path is a URL like /files/voice_samples/1/voice_sample.wav
            # Resolve to filesystem: STORAGE / voice_samples/1/voice_sample.wav
            rel = voice_path.replace("/files/", "", 1) if voice_path.startswith("/files/") else voice_path
            p = STORAGE / rel if not Path(voice_path).is_absolute() else Path(voice_path)
            if p.exists():
                p.unlink()
                # Clean up empty parent dir
                if p.parent.exists() and not any(p.parent.iterdir()):
                    p.parent.rmdir()
        except Exception as e:
            logger.warning(f"Failed to delete voice file: {e}")

    conn.execute("UPDATE characters SET voice_sample_path = NULL WHERE id = ?", (char_id,))
    conn.commit()
    return {"ok": True}


@app.post("/api/upload/live2d")
async def upload_live2d_endpoint(file: UploadFile = File(...)):
    """Upload a Live2D model as a zip archive.

    Extracts the zip to ``backend/storage/live2d/{model_name}/``.
    The model name is derived from the zip filename (without extension).

    Args:
        file: A ``.zip`` file containing a Live2D model bundle (must
            include at least one ``.model3.json`` file plus textures).

    Returns:
        dict: ``{"ok": True, "name": model_name, "url": "/live2d/{name}/...model3.json"}``

    Raises:
        HTTPException 400: If the file is not ``.zip``, has an invalid
            filename, contains path traversal entries (zip-slip), or
            has no ``.model3.json`` inside.
        HTTPException 500: If extraction fails for an unexpected reason.

    Example:
        >>> # POST /api/upload/live2d  multipart body: file=ariu.zip
        >>> # → {"ok": true, "name": "ariu", "url": "/live2d/ariu/ariu.model3.json"}
    """
    import io
    import zipfile

    if not file.filename.lower().endswith(".zip"):
        raise HTTPException(400, "File must be .zip")

    # Sanitise the model name: alphanumeric plus underscores and hyphens only
    safe_name = "".join(c for c in Path(file.filename).stem if c.isalnum() or c in "_-")
    if not safe_name:
        raise HTTPException(400, "Invalid filename — use only alphanumeric characters")

    dest = STORAGE / "live2d" / safe_name
    dest.mkdir(parents=True, exist_ok=True)

    try:
        content = await file.read()
        with zipfile.ZipFile(io.BytesIO(content)) as zf:
            # Security: reject zip-slip path traversal attempts
            for member in zf.namelist():
                if ".." in member or member.startswith("/"):
                    raise HTTPException(400, "Invalid zip path entry — possible path traversal")
            zf.extractall(dest)

        # Locate the .model3.json to return a usable viewer URL
        model3_files = list(dest.rglob("*.model3.json"))
        if not model3_files:
            import shutil
            shutil.rmtree(dest, ignore_errors=True)
            raise HTTPException(400, "Zip contains no .model3.json file")

        rel = model3_files[0].relative_to(STORAGE / "live2d")
        logger.info(f"Live2D model uploaded: {safe_name} → {rel}")
        return {"ok": True, "name": safe_name, "url": f"/live2d/{rel}"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Live2D upload failed: {e}")
        raise HTTPException(500, "Upload failed")


# ==================== RELATIONSHIP TRACKING ====================

@app.get("/api/characters/{char_id}/relationship")
def get_relationship(char_id: int):
    """Get the relationship scores for a character.

    Returns affinity, mood, trust (0-1), interaction count, and last updated timestamp.

    Args:
        char_id: Character ID.

    Returns:
        {"ok": True, "relationship": {affinity, mood, trust, interactions, last_updated}}
    """
    conn = db()
    # Ensure row exists
    conn.execute("INSERT OR IGNORE INTO character_relationships (char_id) VALUES (?)", (char_id,))
    conn.commit()

    row = conn.execute(
        "SELECT affinity, mood, trust, interactions, last_updated FROM character_relationships WHERE char_id = ?",
        (char_id,)
    ).fetchone()

    if not row:
        return {"ok": True, "relationship": {"affinity": 0.5, "mood": 0.5, "trust": 0.5, "interactions": 0, "last_updated": None}}

    return {
        "ok": True,
        "relationship": {
            "affinity": round(row[0], 3),
            "mood": round(row[1], 3),
            "trust": round(row[2], 3),
            "interactions": row[3],
            "last_updated": row[4],
        }
    }


@app.post("/api/characters/{char_id}/relationship/reset")
def reset_relationship(char_id: int):
    """Reset relationship scores to neutral defaults.

    Args:
        char_id: Character ID.

    Returns:
        {"ok": True}
    """
    conn = db()
    conn.execute("""
        UPDATE character_relationships SET
            affinity = 0.5, mood = 0.5, trust = 0.5,
            interactions = 0, last_updated = strftime('%s','now')
        WHERE char_id = ?
    """, (char_id,))
    if conn.execute("SELECT changes()").fetchone()[0] == 0:
        conn.execute(
            "INSERT INTO character_relationships (char_id) VALUES (?)", (char_id,)
        )
    conn.commit()
    return {"ok": True}


# ── Character Diary (#57) ─────────────────────────────────────────────────────

@app.get("/api/characters/{char_id}/diary")
def get_character_diary(char_id: int):
    """Retrieve the latest diary entry for a character.

    The diary is a short, first-person narrative the character wrote after
    their most recent chat session. It can be used to show character
    continuity between sessions.

    Args:
        char_id: Character ID.

    Returns:
        {"ok": True, "diary": "...", "diary_date": "YYYY-MM-DD"} or
        {"ok": True, "diary": None, "diary_date": None} if no entry yet.
    """
    conn = db()
    row = conn.execute(
        "SELECT diary, diary_date FROM characters WHERE id = ?", (char_id,)
    ).fetchone()
    if not row:
        raise HTTPException(404, "Character not found")
    return {"ok": True, "diary": row[0], "diary_date": row[1]}


@app.post("/api/characters/{char_id}/diary")
async def generate_character_diary(char_id: int, req: Request):
    """Generate a diary entry for a character based on a recent session.

    Asks the LLM to write a short, first-person diary entry from the
    character's perspective, referencing the conversation that just ended.
    The entry is saved to ``characters.diary`` and injected into the system
    prompt at the start of the next session.

    Args:
        char_id: Character ID.
        req: Optional JSON body with ``session_id`` (int) to pick which session
             to write about. Defaults to the character's most recent session.

    Returns:
        {"ok": True, "diary": "...", "diary_date": "YYYY-MM-DD"}

    Example:
        POST /api/characters/3/diary
        Body: {"session_id": 12}
    """
    body: dict = {}
    try:
        body = await req.json()
    except Exception:
        pass

    conn = db()

    # Load character metadata
    char_row = conn.execute(
        "SELECT name, system_prompt, last_emotion FROM characters WHERE id = ?",
        (char_id,)
    ).fetchone()
    if not char_row:
        raise HTTPException(404, "Character not found")
    char_name = char_row[0] or "Character"
    char_system_prompt = char_row[1] or ""
    char_emotion = char_row[2] or "neutral"

    # Determine which session to summarize
    session_id = body.get("session_id")
    if session_id:
        msgs = conn.execute(
            "SELECT role, text FROM messages WHERE session_id = ? AND is_active = 1 ORDER BY id",
            (session_id,)
        ).fetchall()
    else:
        # Use the most recent session that belongs to this character
        sess_row = conn.execute(
            "SELECT id FROM sessions WHERE character_id = ? ORDER BY updated_at DESC LIMIT 1",
            (char_id,)
        ).fetchone()
        if not sess_row:
            return {"ok": False, "error": "No sessions found for this character"}
        msgs = conn.execute(
            "SELECT role, text FROM messages WHERE session_id = ? AND is_active = 1 ORDER BY id",
            (sess_row[0],)
        ).fetchall()

    if not msgs:
        return {"ok": False, "error": "No messages found to write diary about"}

    # Build conversation excerpt (last 30 messages to stay within context)
    excerpt = "\n".join(
        f"{'[User]' if r[0] == 'user' else f'[{char_name}]'}: {r[1][:300]}"
        for r in msgs[-30:]
    )

    # Diary generation prompt — first-person, 2–3 sentences, in character
    diary_prompt = (
        f"You are {char_name}. Based on your personality and the conversation below, "
        f"write a short diary entry (2–4 sentences) in the first person, as if you are "
        f"writing in your personal diary tonight. Reflect on the conversation, your "
        f"feelings, and anything memorable. Stay in character. "
        f"Current mood: {char_emotion}.\n\n"
        f"CONVERSATION:\n{excerpt}\n\n"
        f"DIARY ENTRY ({char_name}'s words only):"
    )

    cfg = load_config()
    try:
        from backend.llm.registry import get_client
        adapter = get_client(cfg)
        res = await run_in_threadpool(
            adapter.chat,
            [{"role": "user", "content": diary_prompt}],
            cfg["llm"]["model"],
            cfg["llm"]["endpoint"],
            cfg["llm"]["api_key"],
            temperature=0.75,
            max_tokens=300,
        )
    except Exception as exc:
        logger.error(f"[Diary] LLM call failed for char {char_id}: {exc}")
        raise HTTPException(500, f"LLM error: {exc}")

    if not res.get("ok"):
        raise HTTPException(500, res.get("error", "LLM error"))

    diary_text = res["reply"].strip()
    today = datetime.now().strftime("%Y-%m-%d")

    conn.execute(
        "UPDATE characters SET diary = ?, diary_date = ? WHERE id = ?",
        (diary_text, today, char_id)
    )
    conn.commit()

    logger.info(f"[Diary] Written for char {char_id} ({char_name}) on {today}")
    return {"ok": True, "diary": diary_text, "diary_date": today}


# ── Companion Opening Greeting ──────────────────────────────────────────────────

# 30-minute greeting cache keyed by char_id: {char_id: (generated_at_ts, greeting, emotion)}
_greeting_cache: dict[int, tuple[float, str, str]] = {}
_GREETING_CACHE_TTL = 1800  # 30 minutes


@app.get("/api/characters/{char_id}/greeting")
async def get_character_greeting(char_id: int):
    """Generate (or return cached) a contextual opening greeting for a character.

    The greeting is tailored to: time since last conversation, current time-of-day
    mood slot, character's diary, and affinity level. Results are cached for 30
    minutes so reopening the app doesn't re-invoke the LLM.

    Args:
        char_id: Character ID.

    Returns:
        {"ok": True, "greeting": str, "emotion": str, "enabled": bool}
        If greeting_enabled is False, returns {"ok": True, "enabled": False}.
    """
    import time as _time
    conn = db()
    row = conn.execute(
        "SELECT name, system_prompt, greeting_message, greeting_enabled, greeting_intensity, "
        "diary, last_emotion FROM characters WHERE id = ?",
        (char_id,)
    ).fetchone()
    if not row:
        raise HTTPException(404, "Character not found")

    char_name, system_prompt, greeting_message, greeting_enabled, greeting_intensity, diary, last_emotion = row
    greeting_enabled = bool(greeting_enabled if greeting_enabled is not None else 1)

    if not greeting_enabled:
        return {"ok": True, "enabled": False}

    # Return cached greeting if fresh
    now_ts = _time.time()
    if char_id in _greeting_cache:
        cached_at, cached_text, cached_emotion = _greeting_cache[char_id]
        if now_ts - cached_at < _GREETING_CACHE_TTL:
            return {"ok": True, "greeting": cached_text, "emotion": cached_emotion, "enabled": True}

    # Get time since last session
    last_sess = conn.execute(
        "SELECT updated_at FROM sessions WHERE character_id = ? ORDER BY updated_at DESC LIMIT 1",
        (char_id,)
    ).fetchone()
    gap_text = ""
    if last_sess and last_sess[0]:
        try:
            from datetime import timezone as _tz
            last_dt = datetime.fromisoformat(last_sess[0].replace("Z", "+00:00"))
            gap_days = (datetime.now(_tz.utc) - last_dt.replace(tzinfo=_tz.utc if last_dt.tzinfo is None else last_dt.tzinfo)).days
            if gap_days > 7:
                gap_text = f"It has been {gap_days} days since you last spoke."
            elif gap_days > 2:
                gap_text = f"It has been {gap_days} days since your last conversation."
            elif gap_days == 1:
                gap_text = "You last spoke yesterday."
        except Exception:
            pass

    # Get relationship affinity
    rel_row = conn.execute(
        "SELECT affinity FROM character_relationships WHERE char_id = ?", (char_id,)
    ).fetchone()
    affinity = float(rel_row[0]) if rel_row else 0.0

    # Current time slot for context
    from backend.mood.engine import _get_time_slot
    hour = datetime.now().hour
    time_slot = _get_time_slot(hour)

    intensity = float(greeting_intensity) if greeting_intensity is not None else 0.8

    # Build greeting prompt
    context_parts = []
    if gap_text:
        context_parts.append(gap_text)
    if diary:
        context_parts.append(f"Your last diary entry: \"{diary[:200]}\"")
    if affinity >= 70:
        context_parts.append("You feel very close to this person.")
    elif affinity <= 15:
        context_parts.append("You are still getting to know this person.")

    context_block = "\n".join(context_parts) if context_parts else "No prior context."

    brevity = "1-2 warm sentences" if intensity < 0.5 else "2-3 sentences"
    prompt = (
        f"You are {char_name}. It is {time_slot.replace('_', ' ')}. "
        f"The user just opened the app and is about to start chatting with you.\n\n"
        f"Context:\n{context_block}\n\n"
        f"Write a natural, in-character opening greeting ({brevity}). "
        f"Reference the time gap if significant. Stay in your personality. "
        f"Do not start with 'Oh' or clichés. Do not use the word 'greetings'. "
        f"End with the [EMOTION: X, INTENSITY: Y] tag on its own line.\n\n"
        f"Greeting:"
    )

    cfg = load_config()
    try:
        from backend.llm.registry import get_client
        adapter = get_client(cfg)
        res = await run_in_threadpool(
            adapter.chat,
            [{"role": "user", "content": prompt}],
            cfg["llm"]["model"],
            cfg["llm"]["endpoint"],
            cfg["llm"]["api_key"],
            temperature=0.8,
            max_tokens=200,
        )
    except Exception as exc:
        logger.error(f"[Greeting] LLM call failed for char {char_id}: {exc}")
        # Graceful fallback: use the character's static greeting_message
        fallback = greeting_message or f"Hey, good to see you again!"
        return {"ok": True, "greeting": fallback, "emotion": "happy", "enabled": True}

    if not res.get("ok"):
        fallback = greeting_message or f"Hey, good to see you again!"
        return {"ok": True, "greeting": fallback, "emotion": "happy", "enabled": True}

    raw = res["reply"].strip()

    # Strip emotion tag for clean display
    import re as _re
    emotion_match = _re.search(r'\[EMOTION:\s*(\w+)', raw, _re.IGNORECASE)
    detected_emotion = emotion_match.group(1).lower() if emotion_match else (last_emotion or "happy")
    clean_greeting = _re.sub(r'\[EMOTION:[^\]]*\]', '', raw).strip()

    # Cache result
    _greeting_cache[char_id] = (now_ts, clean_greeting, detected_emotion)

    logger.info(f"[Greeting] Generated for char {char_id} ({char_name}), emotion={detected_emotion}")
    return {"ok": True, "greeting": clean_greeting, "emotion": detected_emotion, "enabled": True}


# ── Character Analytics Dashboard ──────────────────────────────────────────────

# Stop words filtered from word-frequency analysis.  Kept as a module-level
# frozenset so it is built once and shared across all requests.
_ANALYTICS_STOP_WORDS: frozenset = frozenset({
    "a", "an", "the", "is", "in", "it", "of", "to", "and", "or", "but",
    "i", "you", "me", "my", "we", "he", "she", "they", "them", "their",
    "your", "our", "his", "her", "its", "was", "are", "be", "been", "being",
    "do", "does", "did", "will", "would", "could", "should", "have", "has",
    "had", "not", "no", "so", "if", "on", "at", "as", "by", "for", "from",
    "with", "this", "that", "these", "those", "what", "which", "who", "how",
    "when", "where", "why", "just", "can", "up", "out", "then", "than",
    "also", "about", "like", "know", "think", "get", "got", "oh", "well",
    "all", "one", "two", "more", "very", "too", "much", "really", "still",
    "re", "ll", "ve", "s", "t", "m", "d",
})

# Variant emotion names mapped to canonical tracked buckets for arc pivoting.
_EMOTION_BUCKET_MAP: dict = {
    "joy":     "happy",
    "hype":    "happy",
    "playful": "happy",
    "flirt":   "love",
    "tease":   "love",
    "anger":   "angry",
    "sass":    "angry",
    "cringe":  "angry",
    "shock":   "neutral",
    "comfort": "neutral",
}

_TRACKED_EMOTIONS = ("happy", "sad", "love", "angry", "neutral")


@app.get("/api/characters/{char_id}/analytics")
def get_character_analytics(char_id: int):
    """Return conversation analytics for a character's chat history.

    Aggregates data from the ``messages`` table to produce word frequencies,
    session activity sparkline, latency/TPS performance stats, emotional arc,
    and conversation depth metrics.  All computation is pure Python on the
    server; no additional dependencies are required.

    Args:
        char_id: Character ID to compute analytics for.

    Returns:
        A dict with:
        - ``word_frequencies``: Top-30 ``{word, count}`` dicts (assistant msgs).
        - ``session_sparkline``: ``{date, count}`` dicts for the last 90 days.
        - ``latency_avg_ms``: Mean generation time in milliseconds (int).
        - ``latency_p95_ms``: 95th-percentile generation time in ms (int).
        - ``latency_trend``: ``"improving"`` | ``"stable"`` | ``"degrading"``.
        - ``tps_avg``: Mean tokens per second (float).
        - ``emotion_arc``: ``{date, happy, sad, love, angry, neutral}`` dicts
          for the last 30 days, grouped and pivoted by day.
        - ``total_messages``: Total active message count for this character.
        - ``total_sessions``: Distinct session count.
        - ``avg_messages_per_session``: Float mean session length.
        - ``longest_session_messages``: Max message count in one session.

    Raises:
        HTTPException 404: If the character does not exist.

    Example:
        >>> GET /api/characters/1/analytics
        {"word_frequencies": [{"word": "love", "count": 42}], ...}
    """
    from collections import Counter as _Counter

    conn = db()
    try:
        # Validate character exists
        char_row = conn.execute(
            "SELECT id FROM characters WHERE id = ?", (char_id,)
        ).fetchone()
        if not char_row:
            raise HTTPException(404, "Character not found")

        # Guard: return an empty structure when there are fewer than 5 messages
        total_row = conn.execute(
            "SELECT COUNT(*) FROM messages WHERE char_id = ? AND is_active = 1",
            (char_id,),
        ).fetchone()
        total_messages: int = total_row[0] if total_row else 0

        _empty = {
            "word_frequencies": [],
            "session_sparkline": [],
            "latency_avg_ms": 0,
            "latency_p95_ms": 0,
            "latency_trend": "stable",
            "tps_avg": 0.0,
            "emotion_arc": [],
            "total_messages": total_messages,
            "total_sessions": 0,
            "avg_messages_per_session": 0.0,
            "longest_session_messages": 0,
        }
        if total_messages < 5:
            return _empty

        # ── 1. Word frequency (assistant messages only) ───────────────────────
        text_rows = conn.execute(
            "SELECT text FROM messages"
            " WHERE char_id = ? AND role = 'assistant' AND is_active = 1",
            (char_id,),
        ).fetchall()
        word_counter: _Counter = _Counter()
        for (raw_text,) in text_rows:
            if not raw_text:
                continue
            for word in re.split(r'\W+', raw_text.lower()):
                if len(word) > 2 and word not in _ANALYTICS_STOP_WORDS:
                    word_counter[word] += 1
        word_frequencies = [
            {"word": w, "count": c}
            for w, c in word_counter.most_common(30)
        ]

        # ── 2. Session sparkline — daily message counts, last 90 days ─────────
        now_ts = int(time.time())
        cutoff_90 = now_ts - (90 * 86400)
        sparkline_rows = conn.execute(
            """
            SELECT date(ts, 'unixepoch') AS d, COUNT(*) AS cnt
            FROM messages
            WHERE char_id = ? AND ts > ? AND is_active = 1
            GROUP BY d
            ORDER BY d
            """,
            (char_id, cutoff_90),
        ).fetchall()
        session_sparkline = [{"date": row[0], "count": row[1]} for row in sparkline_rows]

        # ── 3. Latency & TPS (last 200 assistant messages) ────────────────────
        latency_rows = conn.execute(
            """
            SELECT generation_time_ms, tokens_per_second
            FROM messages
            WHERE char_id = ? AND role = 'assistant' AND is_active = 1
              AND generation_time_ms IS NOT NULL AND generation_time_ms > 0
            ORDER BY id DESC
            LIMIT 200
            """,
            (char_id,),
        ).fetchall()

        latency_avg_ms = 0
        latency_p95_ms = 0
        latency_trend = "stable"
        tps_avg = 0.0

        if latency_rows:
            latency_vals = [r[0] for r in latency_rows]
            tps_vals = [r[1] for r in latency_rows if r[1] is not None and r[1] > 0]

            latency_avg_ms = round(sum(latency_vals) / len(latency_vals))

            # Percentile-95 via sorted index — avoids numpy dependency
            sorted_latency = sorted(latency_vals)
            p95_idx = max(0, int(len(sorted_latency) * 0.95) - 1)
            latency_p95_ms = sorted_latency[p95_idx]

            tps_avg = round(sum(tps_vals) / len(tps_vals), 1) if tps_vals else 0.0

            # Trend: compare mean of newest 20 vs previous 20 (lower ms = improving)
            if len(latency_vals) >= 40:
                recent_mean = sum(latency_vals[:20]) / 20
                older_mean = sum(latency_vals[20:40]) / 20
                delta = (recent_mean - older_mean) / max(older_mean, 1)
                if delta < -0.10:
                    latency_trend = "improving"
                elif delta > 0.10:
                    latency_trend = "degrading"
                # else: stays "stable"

        # ── 4. Emotional arc — last 30 days, pivoted by day ───────────────────
        cutoff_30 = now_ts - (30 * 86400)
        emotion_rows = conn.execute(
            """
            SELECT date(ts, 'unixepoch') AS d, emotion, COUNT(*) AS cnt
            FROM messages
            WHERE char_id = ? AND ts > ? AND is_active = 1
              AND role = 'assistant' AND emotion IS NOT NULL AND emotion != ''
            GROUP BY d, emotion
            ORDER BY d
            """,
            (char_id, cutoff_30),
        ).fetchall()

        # Pivot: { date -> { canonical_emotion -> count } }
        arc_map: dict = {}
        for d, emotion, cnt in emotion_rows:
            if d not in arc_map:
                arc_map[d] = {"date": d, **{e: 0 for e in _TRACKED_EMOTIONS}}
            canonical = emotion.lower()
            if canonical in arc_map[d]:
                arc_map[d][canonical] += cnt
            elif canonical in _EMOTION_BUCKET_MAP:
                arc_map[d][_EMOTION_BUCKET_MAP[canonical]] += cnt
        emotion_arc = sorted(arc_map.values(), key=lambda x: x["date"])

        # ── 5. Conversation depth stats ───────────────────────────────────────
        depth_row = conn.execute(
            """
            SELECT COUNT(DISTINCT s.id) AS session_cnt,
                   MAX(sub.msg_cnt)     AS longest
            FROM sessions s
            JOIN (
                SELECT session_id, COUNT(*) AS msg_cnt
                FROM messages
                WHERE char_id = ? AND is_active = 1
                GROUP BY session_id
            ) sub ON sub.session_id = s.id
            WHERE s.character_id = ?
            """,
            (char_id, char_id),
        ).fetchone()

        total_sessions = depth_row[0] if depth_row else 0
        longest_session_messages = depth_row[1] if depth_row else 0
        avg_messages_per_session = (
            round(total_messages / total_sessions, 1) if total_sessions > 0 else 0.0
        )

        return {
            "word_frequencies": word_frequencies,
            "session_sparkline": session_sparkline,
            "latency_avg_ms": latency_avg_ms,
            "latency_p95_ms": latency_p95_ms,
            "latency_trend": latency_trend,
            "tps_avg": tps_avg,
            "emotion_arc": emotion_arc,
            "total_messages": total_messages,
            "total_sessions": total_sessions,
            "avg_messages_per_session": avg_messages_per_session,
            "longest_session_messages": longest_session_messages,
        }

    finally:
        conn.close()


# ── Feature #6 — Character Backstory Generator ─────────────────────────────────

@app.post("/api/characters/{char_id}/generate-backstory")
async def generate_character_backstory(char_id: int):
    """Generate and persist an LLM-written backstory for a character.

    Loads the character's name, personality traits, and system prompt from the
    database, builds a third-person narrative prompt, calls the configured LLM,
    and saves the result to ``characters.backstory``.

    Args:
        char_id: ID of the character to generate a backstory for.

    Returns:
        {"backstory": "<generated text>"}

    Raises:
        HTTPException 404: If the character does not exist.
        HTTPException 500: If the LLM call fails.

    Example:
        POST /api/characters/2/generate-backstory
        Response: {"backstory": "Born in the neon-lit streets of Neo Kyoto..."}
    """
    conn = db()
    try:
        char_row = conn.execute(
            "SELECT name, system_prompt, personality_traits FROM characters WHERE id = ?",
            (char_id,)
        ).fetchone()
    finally:
        conn.close()

    if not char_row:
        raise HTTPException(404, "Character not found")

    char_name        = char_row[0] or "Character"
    system_prompt    = char_row[1] or ""
    personality      = char_row[2] or "not specified"
    scenario_snippet = system_prompt[:300]

    backstory_prompt = (
        f"Write a rich backstory (2-3 paragraphs) for an anime character named {char_name}. "
        f"Their personality: {personality}. "
        f"Their role/scenario: {scenario_snippet}. "
        f"Write in third person, past tense."
    )

    cfg = load_config()
    try:
        from backend.llm.registry import get_client
        adapter = get_client(cfg)
        res = await run_in_threadpool(
            adapter.chat,
            [{"role": "user", "content": backstory_prompt}],
            cfg["llm"]["model"],
            cfg["llm"]["endpoint"],
            cfg["llm"]["api_key"],
            temperature=0.8,
            max_tokens=600,
        )
    except Exception as exc:
        logger.error(f"[Backstory] LLM call failed for char {char_id}: {exc}")
        raise HTTPException(500, f"LLM error: {exc}")

    if not res.get("ok"):
        raise HTTPException(500, res.get("error", "LLM error"))

    backstory_text = res["reply"].strip()

    conn = db()
    try:
        conn.execute(
            "UPDATE characters SET backstory = ? WHERE id = ?",
            (backstory_text, char_id)
        )
        conn.commit()
    finally:
        conn.close()

    logger.info(f"[Backstory] Generated for char {char_id} ({char_name})")
    return {"backstory": backstory_text}


# ── Feature #9 — Session Tags ──────────────────────────────────────────────────

@app.patch("/api/sessions/{session_id}/tags")
async def update_session_tags(session_id: int, req: Request):
    """Replace the tag list on a session.

    Accepts a JSON body with a ``tags`` key containing a list of strings.
    The list is serialised as a JSON array and stored in ``sessions.tags``.

    Args:
        session_id: ID of the session to tag.
        req: JSON body ``{"tags": ["roleplay", "fluff"]}``.

    Returns:
        {"tags": [...], "session_id": session_id}

    Raises:
        HTTPException 400: If the body is malformed or ``tags`` is not a list
            of strings.
        HTTPException 404: If the session does not exist.

    Example:
        PATCH /api/sessions/7/tags
        Body: {"tags": ["comedy", "slice-of-life"]}
        Response: {"tags": ["comedy", "slice-of-life"], "session_id": 7}
    """
    try:
        body = await req.json()
    except Exception:
        raise HTTPException(400, "Invalid JSON body")

    tags = body.get("tags")
    if not isinstance(tags, list):
        raise HTTPException(400, "'tags' must be a list")
    if not all(isinstance(t, str) for t in tags):
        raise HTTPException(400, "Each tag must be a string")

    tags_json = json.dumps(tags)

    conn = db()
    try:
        row = conn.execute("SELECT id FROM sessions WHERE id = ?", (session_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Session not found")
        conn.execute("UPDATE sessions SET tags = ? WHERE id = ?", (tags_json, session_id))
        conn.commit()
    finally:
        conn.close()

    logger.info(f"[Tags] Session {session_id} tags updated: {tags}")
    return {"tags": tags, "session_id": session_id}


# ── Feature B4 — Author's Note / Soft Prompt Injection ────────────────────────

@app.get("/api/sessions/{session_id}/author-note")
async def get_author_note(session_id: int):
    """Return the current author's note for a session.

    Args:
        session_id: Session to query.

    Returns:
        dict: ``{"note": str, "position": str, "enabled": bool}``

    Raises:
        HTTPException 404: If the session does not exist.
    """
    conn = db()
    try:
        row = conn.execute(
            "SELECT author_note, author_note_position, author_note_enabled FROM sessions WHERE id=?",
            (session_id,),
        ).fetchone()
    finally:
        conn.close()
    if not row:
        raise HTTPException(404, "Session not found")
    return {"note": row[0] or "", "position": row[1] or "after_system", "enabled": bool(row[2])}


@app.patch("/api/sessions/{session_id}/author-note")
async def update_author_note(session_id: int, req: Request):
    """Update the author's note for a session.

    Accepts a JSON body with any subset of:
    - ``note`` (str): The director's note text.
    - ``position`` (str): Injection position — one of ``before_system``,
      ``after_system``, ``before_last``, ``after_last2``.
    - ``enabled`` (bool): Toggle without clearing note text.

    Args:
        session_id: Session to update.
        req: Partial JSON body with fields to update.

    Returns:
        dict: ``{"ok": True, "note": str, "position": str, "enabled": bool}``

    Raises:
        HTTPException 400: If the body is malformed or position is invalid.
        HTTPException 404: If the session does not exist.

    Example::

        PATCH /api/sessions/7/author-note
        Body: {"note": "[Be concise today.]", "enabled": true}
    """
    _valid_positions = {"before_system", "after_system", "before_last", "after_last2"}
    try:
        body = await req.json()
    except Exception:
        raise HTTPException(400, "Invalid JSON body")

    conn = db()
    try:
        row = conn.execute(
            "SELECT author_note, author_note_position, author_note_enabled FROM sessions WHERE id=?",
            (session_id,),
        ).fetchone()
        if not row:
            raise HTTPException(404, "Session not found")

        note = body.get("note", row[0] or "")
        position = body.get("position", row[1] or "after_system")
        enabled = body.get("enabled", bool(row[2]))

        if position not in _valid_positions:
            raise HTTPException(400, f"position must be one of: {', '.join(sorted(_valid_positions))}")

        conn.execute(
            """UPDATE sessions
               SET author_note=?, author_note_position=?, author_note_enabled=?
               WHERE id=?""",
            (str(note), position, int(enabled), session_id),
        )
        conn.commit()
    finally:
        conn.close()

    logger.info(f"[AuthorNote] Session {session_id}: enabled={enabled}, pos={position}")
    return {"ok": True, "note": note, "position": position, "enabled": enabled}


# ── Feature #10 — Message Pinning ─────────────────────────────────────────────

@app.put("/api/messages/{message_id}/pin")
async def pin_message(message_id: int, req: Request):
    """Set or clear the pinned flag on a single message.

    Args:
        message_id: ID of the message to pin or unpin.
        req: JSON body ``{"pinned": true}`` or ``{"pinned": false}``.

    Returns:
        {"message_id": message_id, "pinned": bool}

    Raises:
        HTTPException 400: If the body is malformed or ``pinned`` is not a bool.
        HTTPException 404: If the message does not exist.

    Example:
        PUT /api/messages/42/pin
        Body: {"pinned": true}
        Response: {"message_id": 42, "pinned": true}
    """
    try:
        body = await req.json()
    except Exception:
        raise HTTPException(400, "Invalid JSON body")

    pinned_val = body.get("pinned")
    if not isinstance(pinned_val, bool):
        raise HTTPException(400, "'pinned' must be a boolean")

    pinned_int = 1 if pinned_val else 0

    conn = db()
    try:
        row = conn.execute("SELECT id FROM messages WHERE id = ?", (message_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Message not found")
        conn.execute("UPDATE messages SET pinned = ? WHERE id = ?", (pinned_int, message_id))
        conn.commit()
    finally:
        conn.close()

    logger.info(f"[Pin] Message {message_id} pinned={pinned_val}")
    return {"message_id": message_id, "pinned": pinned_val}


# ── Feature #14 — Branch Activation ───────────────────────────────────────────

@app.post("/api/messages/{message_id}/activate")
async def activate_branch(message_id: int):
    """Activate a branched message, deactivating its siblings.

    Switches the active conversation path to the given message by setting
    ``is_active=1`` on it and ``is_active=0`` on all other messages that
    share the same ``parent_id`` (i.e. branch siblings).

    This allows the user to navigate between regenerated-response branches
    produced by ``POST /api/messages/{id}/regenerate``.

    Args:
        message_id: ID of the message to make active.

    Returns:
        dict: ``{"ok": True, "message_id": int, "deactivated": list[int]}``
            where ``deactivated`` lists sibling message IDs that were set
            to inactive.

    Raises:
        HTTPException: 404 if the message does not exist.

    Example:
        >>> POST /api/messages/42/activate
        {"ok": true, "message_id": 42, "deactivated": [38]}
    """
    conn = db()
    try:
        row = conn.execute(
            "SELECT id, parent_id FROM messages WHERE id = ?", (message_id,)
        ).fetchone()
        if not row:
            raise HTTPException(404, "Message not found")

        _msg_id, parent_id = row

        # Deactivate all siblings that share the same parent
        deactivated: list[int] = []
        if parent_id is not None:
            siblings = conn.execute(
                "SELECT id FROM messages WHERE parent_id = ? AND id != ?",
                (parent_id, message_id),
            ).fetchall()
            sibling_ids = [r[0] for r in siblings]
            if sibling_ids:
                placeholders = ",".join("?" * len(sibling_ids))
                conn.execute(
                    f"UPDATE messages SET is_active=0 WHERE id IN ({placeholders})",
                    sibling_ids,
                )
                deactivated = sibling_ids

        # Activate the target message
        conn.execute("UPDATE messages SET is_active=1 WHERE id = ?", (message_id,))
        conn.commit()
    finally:
        conn.close()

    logger.info(f"[Branch] Activated message {message_id}, deactivated {deactivated}")
    return {"ok": True, "message_id": message_id, "deactivated": deactivated}


@app.get("/api/sessions/{session_id}/pinned")
def get_pinned_messages(session_id: int):
    """Return all pinned messages for a session.

    Fetches every message in the session where ``pinned = 1``, ordered by
    insertion order (id ASC).

    Args:
        session_id: Session whose pinned messages are requested.

    Returns:
        {"messages": [{id, role, content, emotion, ts, pinned}, ...]}

    Example:
        GET /api/sessions/3/pinned
        Response: {"messages": [{"id": 17, "role": "assistant", ...}]}
    """
    conn = db()
    try:
        rows = conn.execute(
            "SELECT id, role, text, emotion, ts FROM messages "
            "WHERE session_id = ? AND pinned = 1 ORDER BY id ASC",
            (session_id,)
        ).fetchall()
    finally:
        conn.close()

    messages = [
        {
            "id":      r[0],
            "role":    r[1],
            "content": r[2],
            "emotion": r[3],
            "ts":      r[4],
            "pinned":  True,
        }
        for r in rows
    ]
    return {"messages": messages}


# ── Feature #22 — Message Reactions ───────────────────────────────────────────

@app.get("/api/messages/{message_id}/reactions")
def get_message_reactions(message_id: int):
    """Return all emoji reactions attached to a message.

    Fetches every row in ``message_reactions`` for the given message, ordered
    by insertion time ascending so the UI can display them in the order they
    were added.

    Args:
        message_id: ID of the parent message.

    Returns:
        {"reactions": [{"id": int, "emoji": str, "ts": int}, ...]}

    Raises:
        HTTPException 404: If the parent message does not exist.

    Example:
        >>> GET /api/messages/42/reactions
        {"reactions": [{"id": 1, "emoji": "❤️", "ts": 1700000000}]}
    """
    conn = db()
    try:
        msg_row = conn.execute(
            "SELECT id FROM messages WHERE id = ?", (message_id,)
        ).fetchone()
        if not msg_row:
            raise HTTPException(404, "Message not found")

        rows = conn.execute(
            "SELECT id, emoji, ts FROM message_reactions "
            "WHERE message_id = ? ORDER BY ts ASC, id ASC",
            (message_id,),
        ).fetchall()
    finally:
        conn.close()

    return {
        "reactions": [{"id": r[0], "emoji": r[1], "ts": r[2]} for r in rows]
    }


@app.post("/api/messages/{message_id}/reactions")
async def add_message_reaction(message_id: int, req: Request):
    """Add an emoji reaction to a message.

    Inserts a new row in ``message_reactions`` and returns the created object.
    Duplicate emoji on the same message is allowed (same as Discord behaviour —
    each tap/click creates an independent row so the caller can de-duplicate on
    the frontend if desired).

    Args:
        message_id: ID of the message to react to.
        req: JSON body ``{"emoji": str}`` — the reaction emoji character(s).

    Returns:
        The newly created reaction: {"id": int, "message_id": int, "emoji": str, "ts": int}

    Raises:
        HTTPException 400: If body is malformed or ``emoji`` is missing/empty.
        HTTPException 404: If the parent message does not exist.

    Example:
        >>> POST /api/messages/42/reactions
        >>> Body: {"emoji": "❤️"}
        {"id": 7, "message_id": 42, "emoji": "❤️", "ts": 1700000000}
    """
    try:
        body = await req.json()
    except Exception:
        raise HTTPException(400, "Invalid JSON body")

    emoji = body.get("emoji", "")
    if not isinstance(emoji, str) or not emoji.strip():
        raise HTTPException(400, "'emoji' must be a non-empty string")

    emoji = emoji.strip()

    conn = db()
    try:
        msg_row = conn.execute(
            "SELECT id FROM messages WHERE id = ?", (message_id,)
        ).fetchone()
        if not msg_row:
            raise HTTPException(404, "Message not found")

        cur = conn.cursor()
        cur.execute(
            "INSERT INTO message_reactions (message_id, emoji) VALUES (?, ?)",
            (message_id, emoji),
        )
        conn.commit()
        reaction_id = cur.lastrowid

        # Fetch the full row so the response includes the server-assigned ts.
        row = conn.execute(
            "SELECT id, message_id, emoji, ts FROM message_reactions WHERE id = ?",
            (reaction_id,),
        ).fetchone()
    finally:
        conn.close()

    logger.info("[Reactions] Added reaction '%s' to message %s (reaction_id=%s)", emoji, message_id, reaction_id)
    return {"id": row[0], "message_id": row[1], "emoji": row[2], "ts": row[3]}


@app.delete("/api/messages/{message_id}/reactions/{reaction_id}")
def delete_message_reaction(message_id: int, reaction_id: int):
    """Delete a specific reaction from a message.

    Removes the ``message_reactions`` row identified by ``reaction_id``.
    The ``message_id`` path segment is validated to prevent cross-message
    deletions.

    Args:
        message_id: ID of the parent message (used for ownership validation).
        reaction_id: ID of the reaction row to delete.

    Returns:
        {"ok": True}

    Raises:
        HTTPException 404: If the reaction does not exist on the given message.

    Example:
        >>> DELETE /api/messages/42/reactions/7
        {"ok": True}
    """
    conn = db()
    try:
        row = conn.execute(
            "SELECT id FROM message_reactions WHERE id = ? AND message_id = ?",
            (reaction_id, message_id),
        ).fetchone()
        if not row:
            raise HTTPException(404, "Reaction not found on this message")

        conn.execute(
            "DELETE FROM message_reactions WHERE id = ?", (reaction_id,)
        )
        conn.commit()
    finally:
        conn.close()

    logger.info("[Reactions] Deleted reaction %s from message %s", reaction_id, message_id)
    return {"ok": True}


# ── Feature #27 — Character Portfolio Card (backend stub) ─────────────────────

@app.get("/api/characters/{char_id}/portfolio")
def get_character_portfolio(char_id: int):
    """Return a summary object for rendering a character's portfolio card.

    Aggregates data from the ``characters``, ``character_relationships``, and
    ``messages`` tables into a single flat payload.  The actual card rendering
    is performed client-side on an HTML Canvas; this endpoint only supplies the
    data layer.

    Affinity tier labels mirror the frontend StatusBar thresholds:
        - 0.90+ → Soulmate
        - 0.70+ → Devoted
        - 0.50+ → Close
        - 0.30+ → Friendly
        - 0.00+ → Neutral

    Args:
        char_id: ID of the character to summarise.

    Returns:
        A dict with:
        - ``name`` (str): Character display name.
        - ``avatar_url`` (str | None): Avatar image URL.
        - ``affinity_tier`` (str): Human-readable relationship tier label.
        - ``affinity_pct`` (int): Affinity as 0-100 integer percentage.
        - ``personality_traits`` (list[str]): Parsed traits array.
        - ``top_emotions`` (list[[str, int]]): Up to 5 most-frequent emotions
          from assistant messages, as ``[emotion, count]`` pairs.
        - ``timeline_start`` (str | None): ISO timestamp of the first message
          with this character, or null if there are no messages yet.
        - ``total_messages`` (int): Total active message count.

    Raises:
        HTTPException 404: If the character does not exist.

    Example:
        >>> GET /api/characters/1/portfolio
        {
            "name": "Sakura",
            "avatar_url": "/avatars/sakura.png",
            "affinity_tier": "Friendly",
            "affinity_pct": 45,
            "personality_traits": ["cheerful", "curious"],
            "top_emotions": [["happy", 12], ["neutral", 8]],
            "timeline_start": "2026-01-15T00:00:00",
            "total_messages": 234
        }
    """
    conn = db()
    try:
        # Load core character fields
        char_row = conn.execute(
            "SELECT name, avatar_url, personality_traits, first_chat_date "
            "FROM characters WHERE id = ?",
            (char_id,),
        ).fetchone()
        if not char_row:
            raise HTTPException(404, "Character not found")

        char_name, avatar_url, traits_json, first_chat_date = char_row

        # Parse personality traits (stored as a JSON array of strings)
        personality_traits: list = []
        try:
            if traits_json:
                personality_traits = json.loads(traits_json)
        except (json.JSONDecodeError, TypeError):
            pass

        # Load relationship scores (ensure the row exists)
        conn.execute(
            "INSERT OR IGNORE INTO character_relationships (char_id) VALUES (?)",
            (char_id,),
        )
        conn.commit()
        rel_row = conn.execute(
            "SELECT affinity FROM character_relationships WHERE char_id = ?",
            (char_id,),
        ).fetchone()
        affinity_raw: float = rel_row[0] if rel_row else 0.5

        # Map 0-1 affinity to a tier label — mirrors frontend StatusBar thresholds.
        if affinity_raw >= 0.90:
            affinity_tier = "Soulmate"
        elif affinity_raw >= 0.70:
            affinity_tier = "Devoted"
        elif affinity_raw >= 0.50:
            affinity_tier = "Close"
        elif affinity_raw >= 0.30:
            affinity_tier = "Friendly"
        else:
            affinity_tier = "Neutral"

        affinity_pct = int(round(affinity_raw * 100))

        # Top 5 emotions from active assistant messages
        emotion_rows = conn.execute(
            """
            SELECT emotion, COUNT(*) AS cnt
            FROM messages
            WHERE char_id = ? AND role = 'assistant' AND is_active = 1
              AND emotion IS NOT NULL AND emotion != ''
            GROUP BY emotion
            ORDER BY cnt DESC
            LIMIT 5
            """,
            (char_id,),
        ).fetchall()
        top_emotions = [[r[0], r[1]] for r in emotion_rows]

        # Timeline start — earliest message timestamp for this character
        ts_row = conn.execute(
            "SELECT MIN(ts) FROM messages WHERE char_id = ? AND is_active = 1",
            (char_id,),
        ).fetchone()
        timeline_ts = ts_row[0] if ts_row and ts_row[0] else None

        # Convert Unix timestamp → ISO string when available
        timeline_start: str | None = None
        if timeline_ts is not None:
            import datetime as _dt
            try:
                timeline_start = _dt.datetime.utcfromtimestamp(int(timeline_ts)).isoformat()
            except (ValueError, OSError):
                pass
        elif first_chat_date:
            # Fallback: use first_chat_date column if no messages recorded yet
            timeline_start = first_chat_date

        # Total active message count
        count_row = conn.execute(
            "SELECT COUNT(*) FROM messages WHERE char_id = ? AND is_active = 1",
            (char_id,),
        ).fetchone()
        total_messages = count_row[0] if count_row else 0

    finally:
        conn.close()

    return {
        "name":               char_name or "",
        "avatar_url":         avatar_url or "",
        "affinity_tier":      affinity_tier,
        "affinity_pct":       affinity_pct,
        "personality_traits": personality_traits,
        "top_emotions":       top_emotions,
        "timeline_start":     timeline_start,
        "total_messages":     total_messages,
    }


# ── Feature #29 — Day Off Mode ─────────────────────────────────────────────────

@app.patch("/api/characters/{char_id}/day-off")
async def set_day_off(char_id: int, req: Request):
    """Enable or disable Day Off Mode for a character.

    When ``day_off`` is ``true``, the background scheduler will skip all
    proactive and scheduled messages for that character.  Useful when the user
    wants to take a break from a specific character without permanently
    disabling their schedule.

    Note — "one goodbye message" behaviour:
        The original feature spec describes sending a single farewell message
        when Day Off is first enabled.  This is deferred to a future
        enhancement.  The scheduler currently skips the character entirely
        while ``day_off = 1``; the frontend can display a local toast instead.

    Args:
        char_id: ID of the character to update.
        req: JSON body ``{"enabled": bool}``.

    Returns:
        {"ok": True, "char_id": int, "day_off": bool}

    Raises:
        HTTPException 400: If body is malformed or ``enabled`` is not a bool.
        HTTPException 404: If the character does not exist.

    Example:
        >>> PATCH /api/characters/3/day-off
        >>> Body: {"enabled": true}
        {"ok": True, "char_id": 3, "day_off": true}
    """
    try:
        body = await req.json()
    except Exception:
        raise HTTPException(400, "Invalid JSON body")

    enabled = body.get("enabled")
    if not isinstance(enabled, bool):
        raise HTTPException(400, "'enabled' must be a boolean")

    day_off_int = 1 if enabled else 0

    conn = db()
    try:
        char_row = conn.execute(
            "SELECT id FROM characters WHERE id = ?", (char_id,)
        ).fetchone()
        if not char_row:
            raise HTTPException(404, "Character not found")

        conn.execute(
            "UPDATE characters SET day_off = ? WHERE id = ?",
            (day_off_int, char_id),
        )
        conn.commit()
    finally:
        conn.close()

    logger.info("[DayOff] char_id=%s day_off=%s", char_id, enabled)
    return {"ok": True, "char_id": char_id, "day_off": enabled}


# ── Feature A6 — Lorebook / World Info CRUD ───────────────────────────────────

@app.get("/api/characters/{char_id}/lore")
def list_lore_entries(char_id: int):
    """List all lore entries for a character.

    Returns every lore entry (enabled and disabled) belonging to the character,
    ordered by priority descending then by id ascending.

    Args:
        char_id: Character ID.

    Returns:
        {"ok": True, "entries": [LoreEntry, ...]}

    Example:
        >>> GET /api/characters/3/lore
        {"ok": true, "entries": [{...}, ...]}
    """
    conn = db()
    try:
        rows = conn.execute(
            "SELECT id, character_id, title, content, keywords, "
            "injection_position, priority, enabled, created_at "
            "FROM lore_entries WHERE character_id = ? "
            "ORDER BY priority DESC, id ASC",
            (char_id,)
        ).fetchall()
        entries = []
        for r in rows:
            try:
                kws = json.loads(r[4]) if r[4] else []
            except (json.JSONDecodeError, TypeError):
                kws = []
            entries.append({
                "id": r[0],
                "character_id": r[1],
                "title": r[2],
                "content": r[3],
                "keywords": kws,
                "injection_position": r[5],
                "priority": r[6],
                "enabled": bool(r[7]),
                "created_at": r[8],
            })
        return {"ok": True, "entries": entries}
    finally:
        conn.close()


@app.post("/api/characters/{char_id}/lore")
async def create_lore_entry(char_id: int, req: Request):
    """Create a new lore entry for a character.

    Args:
        char_id: Character ID to attach the entry to.
        req: JSON body with fields:
            - title (str): Entry title.
            - content (str): Lore text to inject.
            - keywords (list[str]): Trigger keywords.
            - injection_position (str): Where to inject (default ``after_system_prompt``).
            - priority (int): Ordering priority (default 0).
            - enabled (bool): Whether the entry is active (default True).

    Returns:
        {"ok": True, "entry": {id, character_id, title, ...}}

    Raises:
        HTTPException 400: If body is missing required fields.

    Example:
        >>> POST /api/characters/3/lore
        >>> Body: {"title": "Magic System", "content": "...", "keywords": ["magic", "spell"]}
        {"ok": true, "entry": {"id": 1, ...}}
    """
    body = await req.json()
    title = body.get("title", "")
    content = body.get("content", "")
    keywords = body.get("keywords", [])
    injection_position = body.get("injection_position", "after_system_prompt")
    priority = int(body.get("priority", 0))
    enabled = 1 if body.get("enabled", True) else 0

    if not isinstance(keywords, list):
        keywords = []
    keywords_json = json.dumps(keywords)

    valid_positions = {
        "before_system_prompt", "after_system_prompt",
        "before_last_message", "after_last_2_messages",
    }
    if injection_position not in valid_positions:
        injection_position = "after_system_prompt"

    conn = db()
    try:
        cur = conn.execute(
            "INSERT INTO lore_entries (character_id, title, content, keywords, "
            "injection_position, priority, enabled) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (char_id, title, content, keywords_json, injection_position, priority, enabled),
        )
        conn.commit()
        entry_id = cur.lastrowid
    finally:
        conn.close()

    logger.info("[LoreA6] Created lore entry id=%s for char_id=%s title=%r", entry_id, char_id, title)
    return {
        "ok": True,
        "entry": {
            "id": entry_id,
            "character_id": char_id,
            "title": title,
            "content": content,
            "keywords": keywords,
            "injection_position": injection_position,
            "priority": priority,
            "enabled": bool(enabled),
        },
    }


@app.put("/api/lore/{entry_id}")
async def update_lore_entry(entry_id: int, req: Request):
    """Update an existing lore entry.

    All fields in the body are optional; only provided fields are updated.

    Args:
        entry_id: Lore entry ID.
        req: JSON body with any subset of lore entry fields.

    Returns:
        {"ok": True, "entry_id": int}

    Raises:
        HTTPException 404: If the entry does not exist.

    Example:
        >>> PUT /api/lore/5
        >>> Body: {"title": "Updated Title", "enabled": false}
        {"ok": true, "entry_id": 5}
    """
    body = await req.json()

    conn = db()
    try:
        row = conn.execute("SELECT id FROM lore_entries WHERE id = ?", (entry_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Lore entry not found")

        updates: list[str] = []
        params: list = []

        if "title" in body:
            updates.append("title = ?")
            params.append(body["title"])
        if "content" in body:
            updates.append("content = ?")
            params.append(body["content"])
        if "keywords" in body:
            kws = body["keywords"]
            if not isinstance(kws, list):
                kws = []
            updates.append("keywords = ?")
            params.append(json.dumps(kws))
        if "injection_position" in body:
            valid_positions = {
                "before_system_prompt", "after_system_prompt",
                "before_last_message", "after_last_2_messages",
            }
            pos = body["injection_position"]
            if pos not in valid_positions:
                pos = "after_system_prompt"
            updates.append("injection_position = ?")
            params.append(pos)
        if "priority" in body:
            updates.append("priority = ?")
            params.append(int(body["priority"]))
        if "enabled" in body:
            updates.append("enabled = ?")
            params.append(1 if body["enabled"] else 0)

        if updates:
            params.append(entry_id)
            conn.execute(
                f"UPDATE lore_entries SET {', '.join(updates)} WHERE id = ?",
                params,
            )
            conn.commit()
    finally:
        conn.close()

    return {"ok": True, "entry_id": entry_id}


@app.delete("/api/lore/{entry_id}")
def delete_lore_entry(entry_id: int):
    """Delete a lore entry.

    Args:
        entry_id: Lore entry ID.

    Returns:
        {"ok": True, "deleted": int}

    Raises:
        HTTPException 404: If the entry does not exist.

    Example:
        >>> DELETE /api/lore/5
        {"ok": true, "deleted": 5}
    """
    conn = db()
    try:
        row = conn.execute("SELECT id FROM lore_entries WHERE id = ?", (entry_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Lore entry not found")

        conn.execute("DELETE FROM lore_entries WHERE id = ?", (entry_id,))
        conn.commit()
    finally:
        conn.close()

    return {"ok": True, "deleted": entry_id}


@app.get("/api/characters/{char_id}/user-facts")
def get_user_facts(char_id: int):
    """List all user facts for a character.

    Args:
        char_id: Character ID.

    Returns:
        {"ok": True, "facts": [{id, category, fact_text, source, confidence, created_at}, ...]}

    Example:
        >>> GET /api/characters/1/user-facts
        {"ok": true, "facts": [{"id": 1, "category": "identity", "fact_text": "name is Alex", ...}]}
    """
    conn = db()
    try:
        rows = conn.execute(
            """SELECT id, category, fact_text, source, confidence, created_at
               FROM user_facts WHERE character_id = ?
               ORDER BY confidence DESC, created_at DESC""",
            (char_id,),
        ).fetchall()
    finally:
        conn.close()

    return {
        "ok": True,
        "facts": [
            {
                "id": r[0],
                "category": r[1],
                "fact_text": r[2],
                "source": r[3],
                "confidence": r[4],
                "created_at": r[5],
            }
            for r in rows
        ],
    }


@app.post("/api/characters/{char_id}/user-facts")
async def create_user_fact(char_id: int, req: Request):
    """Manually add a user fact for a character.

    Args:
        char_id: Character ID.
        req: JSON body with keys:
            - category (str): One of identity/preferences/history/relationship/general.
            - fact_text (str): The fact to store.
            - confidence (float, optional): 0.0–1.0, defaults to 1.0 for manual entries.

    Returns:
        {"ok": True, "fact": {id, category, fact_text, source, confidence, created_at}}

    Example:
        >>> POST /api/characters/1/user-facts
        >>> Body: {"category": "identity", "fact_text": "User's name is Alex"}
        {"ok": true, "fact": {"id": 5, ...}}
    """
    body = await req.json()
    category = str(body.get("category", "general")).lower()
    valid_cats = {"identity", "preferences", "history", "relationship", "general"}
    if category not in valid_cats:
        category = "general"
    fact_text = str(body.get("fact_text", "")).strip()
    if not fact_text:
        raise HTTPException(400, "fact_text is required")
    confidence = float(body.get("confidence", 1.0))

    conn = db()
    try:
        cur = conn.execute(
            "INSERT INTO user_facts (character_id, category, fact_text, source, confidence) VALUES (?, ?, ?, 'manual', ?)",
            (char_id, category, fact_text, confidence),
        )
        conn.commit()
        fact_id = cur.lastrowid
        created_at = conn.execute(
            "SELECT created_at FROM user_facts WHERE id = ?", (fact_id,)
        ).fetchone()[0]
    finally:
        conn.close()

    logger.info("[KG-C3] Manual fact id=%s added for char_id=%s", fact_id, char_id)
    return {
        "ok": True,
        "fact": {
            "id": fact_id,
            "category": category,
            "fact_text": fact_text,
            "source": "manual",
            "confidence": confidence,
            "created_at": created_at,
        },
    }


@app.delete("/api/characters/{char_id}/user-facts/{fact_id}")
def delete_user_fact(char_id: int, fact_id: int):
    """Delete a user fact.

    Args:
        char_id: Character ID (used for access scoping).
        fact_id: User fact ID.

    Returns:
        {"ok": True, "deleted": fact_id}

    Raises:
        HTTPException 404: If the fact does not exist for this character.
    """
    conn = db()
    try:
        row = conn.execute(
            "SELECT id FROM user_facts WHERE id = ? AND character_id = ?",
            (fact_id, char_id),
        ).fetchone()
        if not row:
            raise HTTPException(404, "User fact not found")
        conn.execute("DELETE FROM user_facts WHERE id = ?", (fact_id,))
        conn.commit()
    finally:
        conn.close()

    return {"ok": True, "deleted": fact_id}


@app.get("/api/sessions/{session_id}/emotions")
def get_emotion_timeline(session_id: int):
    """Get the emotion timeline for a session.

    Returns an array of {id, emotion, ts} for all assistant messages
    in the session that have a recorded emotion.

    Args:
        session_id: Session ID.

    Returns:
        {"ok": True, "emotions": [{id, emotion, ts}, ...]}
    """
    conn = db()
    rows = conn.execute(
        "SELECT id, emotion, ts FROM messages WHERE session_id = ? AND role = 'assistant' AND emotion IS NOT NULL ORDER BY ts ASC",
        (session_id,)
    ).fetchall()

    return {
        "ok": True,
        "emotions": [{"id": r[0], "emotion": r[1], "ts": r[2]} for r in rows]
    }


@app.get("/api/scan/live2d")
def scan_live2d_models():
    """Recursively find all .model3.json files in live2d storage."""
    base = STORAGE / "live2d"
    models = []
    if not base.exists(): return {"models": []}
    
    for path in base.rglob("*.model3.json"):
        # Rel path from base, e.g. "ariu/ariu.model3.json"
        rel = path.relative_to(base)
        # URL path: /live2d/ariu/ariu.model3.json
        models.append({
            "name": path.parent.name, # Folder name as ID
            "file": path.name,
            "url": f"/live2d/{rel}",
            "rel_path": str(rel)
        })
    return {"models": models}

@app.get("/api/scan/vrm")
def scan_vrm_models():
    """List all VRM files in avatars storage."""
    base = STORAGE / "avatars"
    models = []
    if not base.exists(): return {"models": []}
    
    for path in base.glob("*.vrm"):
        models.append({
            "name": path.stem,
            "file": path.name,
            "url": f"/files/avatars/{path.name}",
            "size": path.stat().st_size
        })
    return {"models": models}


# ═══════════════════════════════════════════════════════════════════════════
#  AI Motion Generation  (Level 3 — AI-driven procedural animation system)
# ═══════════════════════════════════════════════════════════════════════════
#
# Architecture overview:
#   Level 1  — BasePoseLayer/EmotionLayer/IdleLayer procedural bone animation
#              (viewer.html, no backend needed).
#   Level 2  — User-supplied VRMA/GLB clips auto-loaded from /shared/animations/
#   Level 3  — THIS: AI-generated JSON keyframe data streamed to the viewer.
#
# Motion model directory:  <project-root>/models/motion/
# Supported backends (priority order):
#   1. MotionDiffuse    — models/motion/motion_diffuse/  (text-to-motion, ~300 MB)
#   2. Emotion-pose DB  — built-in, always available  (fast, no GPU needed)
#
# The viewer's `applyKeyframes` postMessage handler converts the JSON keyframe
# payload into a Three.js AnimationClip and plays it via ClipLayer (L6).
# ═══════════════════════════════════════════════════════════════════════════

MOTION_MODELS_DIR = Path(ROOT_DIR) / "models" / "motion"

# Map emotion labels to body language parameters used by the procedural generator.
# Each entry drives sine-wave keyframe amplitudes for the most expressive bones.
_EMOTION_MOTION_PARAMS: dict[str, dict] = {
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


def _generate_procedural_keyframes(emotion: str, duration: float = 3.0, fps: int = 20) -> list[dict]:
    """Generate sine-wave keyframe data for the given emotion.

    Returns a list of frame dicts that the viewer's ``applyKeyframes`` handler
    converts into a Three.js ``AnimationClip`` via ``QuaternionKeyframeTrack``.
    Each frame: ``{"time": float, "bones": {boneName: {"x": rad, "y": rad, "z": rad}}}``

    Args:
        emotion: Emotion label (neutral / happy / sad / etc.)
        duration: Clip duration in seconds.
        fps: Keyframe density (20 fps is enough for smooth playback).

    Returns:
        List of keyframe dicts suitable for the ``applyKeyframes`` postMessage.
    """
    import math
    params = _EMOTION_MOTION_PARAMS.get(emotion, _EMOTION_MOTION_PARAMS["neutral"])
    frames = []
    step = 1.0 / fps
    t = 0.0
    while t <= duration:
        breath   = math.sin(t * 2.0 * math.pi * 0.4) * 0.008 * params["energy"]
        sway     = math.sin(t * 2.0 * math.pi * 0.25) * params["sway"]
        head_nod = math.sin(t * 2.0 * math.pi * 0.3)  * params["headTilt"]

        frames.append({
            "time": round(t, 3),
            "bones": {
                "hips":           {"x": 0.0,          "y": sway * 0.5, "z": sway * 0.3},
                "spine":          {"x": breath + params["spineForward"], "y": 0.0, "z": sway * 0.5},
                "chest":          {"x": breath * 1.3,  "y": 0.0,        "z": sway * 0.3},
                "neck":           {"x": head_nod * 0.25, "y": 0.0,      "z": sway * -0.2},
                "head":           {"x": head_nod * 0.6,  "y": 0.0,      "z": sway * -0.15},
                # Arms: base drape kept in x/z; we only oscillate x slightly
                "leftUpperArm":   {"x": 0.08 + math.sin(t * 1.1) * 0.04 * params["energy"],
                                   "y": 0.0, "z": -1.4 + params["armLift"]},
                "rightUpperArm":  {"x": 0.08 + math.sin(t * 1.3) * 0.03 * params["energy"],
                                   "y": 0.0, "z":  1.4 - params["armLift"]},
            }
        })
        t = round(t + step, 6)
    return frames


@app.get("/api/motion/model-status")
def get_motion_model_status():
    """Return which AI motion model backends are available.

    Checks for downloaded model directories and returns a status dict.
    The frontend uses this to show an "AI Motion Active" badge or a
    "Download Model" button.

    Returns:
        dict: {
            "procedural": True,
            "motion_diffuse": bool,
            "active_backend": str,
            "model_dir": str,
        }
    """
    motion_diffuse_ok = (MOTION_MODELS_DIR / "motion_diffuse").exists()
    return {
        "procedural": True,
        "motion_diffuse": motion_diffuse_ok,
        "active_backend": "motion_diffuse" if motion_diffuse_ok else "procedural",
        "model_dir": str(MOTION_MODELS_DIR),
    }


class MotionGenerateRequest(BaseModel):
    """Request body for POST /api/motion/generate.

    Attributes:
        emotion: Emotion label driving the animation.
        intensity: 0–1 scale factor applied to all motion amplitudes.
        duration: Clip length in seconds (clamped 1–10 s).
        context: Optional recent chat text for AI backends as a semantic cue.
        label: Viewer-side clip label (used as ClipLayer dictionary key).
        loop: Whether the viewer should loop the clip.
    """

    emotion:   str   = "neutral"
    intensity: float = 0.7
    duration:  float = 3.0
    context:   Optional[str] = None
    label:     Optional[str] = None
    loop:      bool  = True


@app.post("/api/motion/generate")
async def generate_motion(req: MotionGenerateRequest):
    """Generate animation keyframe data for a given emotion.

    Resolution order:
      1. Remote motion server (if ``motion_remote_url`` is set in config)
      2. Local AI model       (if models/motion/ has a supported backend)
      3. Procedural fallback  (always available, instant)

    The response is forwarded directly to the viewer iframe via the
    ``applyKeyframes`` postMessage API.

    Returns:
        dict: {label, backend, duration, loop, keyframes}
    """
    import time as _time
    _t0 = _time.monotonic()

    emotion  = req.emotion.lower().strip()
    duration = max(1.0, min(req.duration, 10.0))
    label    = req.label or f"motion_{emotion}"

    # ── 1. Remote motion server ────────────────────────────────────────────
    cfg = load_config() or {}
    remote_url = cfg.get("motion_remote_url", "").strip()
    if remote_url:
        try:
            from backend.motion.remote_client import forward_generate
            payload = {
                "emotion": emotion, "intensity": req.intensity,
                "duration": duration, "label": label,
                "loop": req.loop,
                "context": req.context,
            }
            data = await forward_generate(remote_url, payload)
            data["latency_ms"] = round((_time.monotonic() - _t0) * 1000, 1)
            return data
        except Exception as _exc:
            logger.warning("Remote motion server failed, falling back: %s", _exc)

    # ── 2. Local AI model (stub — add runner imports here per model) ───────
    # motionlcm_dir = MOTION_MODELS_DIR / "motionlcm"
    # if motionlcm_dir.exists():
    #     from backend.motion.motionlcm_runner import generate_clip
    #     keyframes = await run_in_threadpool(generate_clip, emotion, req.context, duration)
    #     backend   = "motionlcm"
    # else:
    backend   = "procedural"
    keyframes = await run_in_threadpool(_generate_procedural_keyframes, emotion, duration)

    # Scale by intensity (skip base arm-drape z values)
    if abs(req.intensity - 1.0) > 0.01:
        for frame in keyframes:
            for bone, euler in frame["bones"].items():
                if bone in ("leftUpperArm", "rightUpperArm"):
                    euler["x"] *= req.intensity
                else:
                    euler["x"] *= req.intensity
                    euler["y"] *= req.intensity
                    euler["z"] *= req.intensity

    return {
        "label":      label,
        "backend":    backend,
        "duration":   duration,
        "loop":       req.loop,
        "keyframes":  keyframes,
        "latency_ms": round((_time.monotonic() - _t0) * 1000, 1),
    }


@app.get("/api/motion/discover")
async def discover_motion_servers_route():
    """Scan the local network for waifu-motion servers broadcasting UDP beacons.

    Blocks for up to 8 seconds, then returns everything found.
    The UI calls this during the setup wizard and polls until a server appears.

    Returns:
        dict: {"servers": [{"ip", "port", "url", "version"}]}
    """
    from backend.motion.beacon import discover_motion_servers
    servers = await run_in_threadpool(discover_motion_servers)
    return {"servers": servers}


class MotionConnectRequest(BaseModel):
    """Request body for POST /api/motion/connect.

    Attributes:
        url: Full base URL of the motion server, e.g. ``"http://192.168.1.5:8081"``.
    """

    url: str


@app.post("/api/motion/connect")
async def connect_motion_server(req: MotionConnectRequest):
    """Probe a motion server URL, save it to config if reachable, and return status.

    Called by the setup wizard when the user clicks "Connect" (or auto-connect
    fires after discovery).  Saves ``motion_remote_url`` to app.json on success
    so the setting persists across restarts.

    Returns:
        dict: {"ok": bool, "url": str, "backend": str|None, "message": str}
    """
    from backend.motion.remote_client import connect_and_verify
    result = await connect_and_verify(req.url.rstrip("/"))

    if result["ok"]:
        cfg = load_config() or {}
        cfg["motion_remote_url"] = req.url.rstrip("/")
        save_config(cfg)
        logger.info("Motion remote server saved: %s (backend=%s)", req.url, result.get("backend"))

    return result


@app.delete("/api/motion/connect")
async def disconnect_motion_server():
    """Remove the saved remote motion server URL and revert to local/procedural.

    Returns:
        dict: {"ok": True, "message": str}
    """
    from backend.motion.remote_client import MOTION_STATS
    cfg = load_config() or {}
    cfg.pop("motion_remote_url", None)
    save_config(cfg)
    MOTION_STATS["remote_url"] = None
    MOTION_STATS["connected"]  = False
    return {"ok": True, "message": "Disconnected — using local/procedural motion."}


@app.get("/api/motion/stats")
async def get_motion_stats():
    """Performance statistics for the Settings → AI Motion panel.

    Combines:
    - Local request latency (procedural generate_motion calls)
    - Remote client stats (if a remote server is configured)
    - Remote server's own /stats if reachable

    Returns:
        dict with latency, request counts, backend info, remote server uptime.
    """
    from backend.motion.remote_client import MOTION_STATS
    cfg        = load_config() or {}
    remote_url = cfg.get("motion_remote_url", "").strip()

    # Attempt to fetch the remote server's live stats
    remote_server_stats: dict | None = None
    if remote_url:
        try:
            import httpx as _httpx
            async with _httpx.AsyncClient(timeout=3.0) as client:
                r = await client.get(f"{remote_url}/stats")
                if r.status_code == 200:
                    remote_server_stats = r.json()
        except Exception:
            pass

    return {
        "remote_url":          remote_url or None,
        "remote_connected":    MOTION_STATS["connected"],
        "remote_backend":      MOTION_STATS.get("backend_name"),
        "remote_latency_ms":   MOTION_STATS.get("last_latency_ms"),
        "remote_avg_latency_ms": MOTION_STATS.get("avg_latency_ms"),
        "remote_requests_ok":  MOTION_STATS.get("requests_ok", 0),
        "remote_requests_failed": MOTION_STATS.get("requests_failed", 0),
        "remote_server_stats": remote_server_stats,
        "local_backend":       "procedural",
        "models_dir":          str(MOTION_MODELS_DIR),
    }


@app.get("/api/scan/images")
def scan_images():
    """List all image files in images storage and frontend assets.

    Returns a combined list from:
    - ``backend/storage/images/`` (user-uploaded, source="uploaded")
    - ``frontends/neon/assets/`` image files (presets, source="preset")

    Each entry includes ``source`` so the frontend can decide
    whether to allow deletion.

    Returns:
        dict: {"images": [{"name", "file", "url", "character", "type", "source"}, ...]}
    """
    images = []
    allowed_exts = {'.png', '.jpg', '.jpeg', '.webp', '.gif'}

    # ── User-uploaded images (storage/images/) ──
    user_base = STORAGE / "images"
    if user_base.exists():
        for path in user_base.glob("*"):
            if path.suffix.lower() not in allowed_exts:
                continue
            name = path.stem
            char_name = name.split('_')[0].lower() if '_' in name else "unknown"
            img_type = "avatar" if ("pixel_portrait" in name or "icon" in name) else "background"
            images.append({
                "name": name,
                "file": path.name,
                "url": f"/files/images/{path.name}",
                "character": char_name,
                "type": img_type,
                "source": "uploaded"
            })

    # ── Preset images (frontends/neon/assets/) ──
    preset_base = FRONTEND / "assets"
    if preset_base.exists():
        for path in preset_base.rglob("*"):
            if path.suffix.lower() not in allowed_exts:
                continue
            rel = path.relative_to(preset_base)
            name = path.stem
            img_type = "avatar" if ("icon" in name or "portrait" in name) else "background"
            images.append({
                "name": name,
                "file": path.name,
                "url": f"/assets/{rel}",
                "character": name.split('_')[0].lower() if '_' in name else "unknown",
                "type": img_type,
                "source": "preset"
            })

    return {"images": images}

@app.delete("/api/images/{filename}")
def delete_image(filename: str):
    """Delete a user-uploaded image from storage.

    Only files inside ``backend/storage/images/`` can be deleted.
    Preset images (in ``frontends/neon/assets/``) are protected.

    Args:
        filename: The image filename (e.g. ``icon_1707849600.png``).

    Returns:
        dict: {"ok": True} on success.

    Raises:
        HTTPException 400: If filename contains path traversal characters.
        HTTPException 403: If the file is a preset (not in storage/images).
        HTTPException 404: If the file does not exist.
    """
    # Path traversal protection
    if '/' in filename or '\\' in filename or '..' in filename:
        raise HTTPException(400, "Invalid filename")

    target = STORAGE / "images" / filename
    resolved = target.resolve()

    # Ensure resolved path stays within storage/images
    storage_images_resolved = (STORAGE / "images").resolve()
    if not str(resolved).startswith(str(storage_images_resolved)):
        raise HTTPException(403, "Access denied: path traversal blocked")

    if not resolved.exists():
        raise HTTPException(404, "Image not found")

    try:
        resolved.unlink()
        logger.info(f"Deleted user image: {filename}")
        return {"ok": True}
    except Exception as e:
        logger.error(f"Failed to delete image {filename}: {e}")
        raise HTTPException(500, f"Delete failed: {e}")


# ==================== ASR (SPEECH RECOGNITION) ====================

@app.post("/api/asr")
async def transcribe_audio(file: UploadFile = File(...)):
    """Transcribe uploaded audio file to text.

    Accepts audio file upload (webm, wav, mp3, ogg) and returns
    transcribed text using the configured ASR adapter (Whisper API
    or local Whisper model).

    Args:
        file: Audio file upload (multipart/form-data)

    Returns:
        {"text": str, "language": str, "confidence": float}

    Raises:
        HTTPException 400: If ASR is not enabled in config
        HTTPException 500: If transcription fails or no adapter available
    """
    from backend.asr.registry import get_asr_adapter
    cfg = load_config() or {}

    try:
        adapter = get_asr_adapter(cfg)
        if not adapter:
            raise HTTPException(400, "ASR not configured. Enable it in Settings > Voice.")

        audio_bytes = await file.read()
        if not audio_bytes:
            raise HTTPException(400, "Empty audio file")

        result = await run_in_threadpool(adapter.transcribe, audio_bytes)
        return {
            "text": result["text"],
            "language": result.get("language", "unknown"),
            "confidence": result.get("confidence", 0.0)
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"ASR Fail: {e}")
        raise HTTPException(500, f"Transcription failed: {str(e)}")

# ==================== HARDWARE INFO ====================

@app.get("/api/hardware")
def get_hardware_info():
    """Return system hardware profile for Model Manager compatibility checks.

    Queries CPU, RAM, and GPU (if available) to help the frontend display
    hardware capabilities and model compatibility indicators.

    Returns:
        dict: {cpu: str, ram_gb: float, gpu: str|null, vram_gb: float|null, platform: str}

    Example:
        >>> GET /api/hardware
        {"cpu": "Apple M2 Pro", "ram_gb": 32.0, "gpu": "Apple M2 Pro", "vram_gb": 32.0, "platform": "darwin"}
    """
    import platform as plat

    info = {
        "cpu": "Unknown",
        "ram_gb": 0,
        "gpu": None,
        "vram_gb": None,
        "platform": sys.platform,
        "arch": plat.machine()
    }

    try:
        mem = psutil.virtual_memory()
        info["ram_gb"] = round(mem.total / (1024**3), 1)

        # CPU name
        if sys.platform == "darwin":
            import subprocess
            try:
                result = subprocess.run(
                    ["sysctl", "-n", "machdep.cpu.brand_string"],
                    capture_output=True, text=True, timeout=5
                )
                info["cpu"] = result.stdout.strip() or plat.processor()
            except Exception:
                info["cpu"] = plat.processor() or plat.machine()

            # On Apple Silicon, GPU = unified memory (same as RAM)
            if "arm" in plat.machine().lower():
                info["gpu"] = f"Apple {plat.machine()} (Unified)"
                info["vram_gb"] = info["ram_gb"]
        else:
            info["cpu"] = plat.processor() or "Unknown"

            # Try nvidia-smi for NVIDIA GPUs
            try:
                import subprocess
                result = subprocess.run(
                    ["nvidia-smi", "--query-gpu=name,memory.total", "--format=csv,noheader,nounits"],
                    capture_output=True, text=True, timeout=5
                )
                if result.returncode == 0 and result.stdout.strip():
                    parts = result.stdout.strip().split(",")
                    info["gpu"] = parts[0].strip()
                    if len(parts) > 1:
                        info["vram_gb"] = round(float(parts[1].strip()) / 1024, 1)
            except Exception:
                pass

    except Exception as e:
        logger.error(f"Hardware info error: {e}")

    return info

# ==================== MODEL MANAGEMENT ====================

def _try_auto_start_lmstudio(cfg: dict) -> None:
    """Attempt to start LM Studio in headless mode if configured.

    Checks reachability first. If unreachable and ``system.auto_start_lmstudio``
    is ``True``, runs ``lms daemon up`` + ``lms server start`` via subprocess
    and waits up to 15 seconds for the server to become reachable.

    Args:
        cfg: Application config dict.
    """
    import subprocess as sp

    sys_cfg = cfg.get("system", {})
    if not sys_cfg.get("auto_start_lmstudio", False):
        return

    lms_path = sys_cfg.get("lms_path", "lms")
    # Resolve default path if just "lms" (check well-known location)
    if lms_path == "lms":
        well_known = Path.home() / ".cache" / "lm-studio" / "bin" / "lms"
        if well_known.exists():
            lms_path = str(well_known)

    endpoint = _get_llm_endpoint(cfg)
    base_url = endpoint.replace("/v1", "").rstrip("/")

    # Check if already reachable
    import requests as _req
    try:
        r = _req.get(f"{base_url}/api/v0/models", timeout=3)
        if r.status_code == 200:
            logger.info("LM Studio already reachable — skipping auto-start")
            return
    except Exception:
        pass

    logger.info(f"LM Studio not reachable. Attempting headless auto-start via {lms_path}...")

    try:
        # Start the daemon (no GUI)
        sp.run([lms_path, "daemon", "up"], capture_output=True, text=True, timeout=10)
        # Start the API server
        sp.run([lms_path, "server", "start"], capture_output=True, text=True, timeout=10)
    except FileNotFoundError:
        logger.warning(f"lms CLI not found at '{lms_path}' — cannot auto-start LM Studio")
        return
    except Exception as e:
        logger.warning(f"LM Studio auto-start command failed: {e}")
        return

    # Wait up to 15 seconds for reachability
    import time as _time
    for i in range(15):
        try:
            r = _req.get(f"{base_url}/api/v0/models", timeout=2)
            if r.status_code == 200:
                logger.info(f"LM Studio headless server is up (took ~{i+1}s)")
                break
        except Exception:
            pass
        _time.sleep(1)
    else:
        logger.warning("LM Studio auto-start: server did not become reachable within 15 seconds")
        return

    # Auto-load a specific model if configured.
    # Uses llm.model from config, or system.lms_autoload_model if set explicitly.
    autoload_model = sys_cfg.get("lms_autoload_model") or cfg.get("llm", {}).get("model", "")
    if not autoload_model:
        return

    logger.info(f"Auto-loading LM Studio model: {autoload_model}")
    try:
        load_result = sp.run(
            [lms_path, "load", autoload_model],
            capture_output=True, text=True, timeout=120
        )
        if load_result.returncode == 0:
            logger.info(f"Model '{autoload_model}' loaded successfully")
        else:
            # Non-fatal — model may already be loaded, or model key may be wrong
            logger.warning(f"lms load exited {load_result.returncode}: {load_result.stderr.strip()}")
    except Exception as exc:
        logger.warning(f"Could not auto-load model '{autoload_model}': {exc}")


async def _audio_cleanup_loop(max_age_days: int) -> None:
    """Background task that periodically deletes old TTS audio files (#108).

    Runs hourly, deleting any file in AUDIO storage older than ``max_age_days``.
    Prevents unbounded disk growth when the TTS audio cache accumulates over time.

    Args:
        max_age_days: Files older than this many days will be deleted.
    """
    import asyncio as _asyncio
    while True:
        try:
            cutoff = time.time() - max_age_days * 86400
            deleted = 0
            for f in AUDIO.glob("*.*"):
                try:
                    if f.is_file() and f.stat().st_mtime < cutoff:
                        f.unlink()
                        deleted += 1
                except OSError:
                    pass
            if deleted:
                logger.info(f"Audio cleanup: removed {deleted} file(s) older than {max_age_days} days")
        except Exception as _e:
            logger.warning(f"Audio cleanup error: {_e}")
        await _asyncio.sleep(3600)  # Re-run every hour


async def _db_backup_loop(interval_days: int = 1, retention: int = 7) -> None:
    """Background task that copies app.db to a timestamped backup file daily (#118).

    Backups are written to ``STORAGE/_backups/`` as
    ``app_{YYYY-MM-DD}.db``. Files older than *retention* days are pruned
    automatically so the backup directory doesn't grow without bound.

    Args:
        interval_days: How often to create a backup (default: 1 = daily).
        retention: Number of backup files to keep (default: 7 days).
    """
    import asyncio as _asyncio
    import shutil as _shutil
    backup_dir = STORAGE / "_backups"
    backup_dir.mkdir(exist_ok=True)

    while True:
        await _asyncio.sleep(interval_days * 86400)
        try:
            from datetime import datetime as _dt_bk
            stamp = _dt_bk.now().strftime('%Y-%m-%d')
            dest = backup_dir / f"app_{stamp}.db"
            _shutil.copy2(DB_PATH, dest)
            logger.info(f"DB backup written: {dest}")

            # Prune backups older than retention days
            cutoff = time.time() - retention * 86400
            for f in sorted(backup_dir.glob("app_*.db")):
                if f.stat().st_mtime < cutoff:
                    f.unlink()
                    logger.info(f"DB backup pruned: {f.name}")
        except Exception as _e:
            logger.warning(f"DB backup error: {_e}")


async def _db_vacuum_loop(interval_days: int = 7) -> None:
    """Background task that runs SQLite VACUUM weekly to reclaim freed pages (#106).

    SQLite does not automatically return freed space to the OS. After many
    insertions and deletions (especially of chat messages and audio cache rows),
    the database file can grow significantly. VACUUM rewrites the whole file into
    a minimal, contiguous form. It is safe to run online.

    Args:
        interval_days: How often to vacuum, in days (default: 7 = weekly).
    """
    import asyncio as _asyncio
    interval_secs = interval_days * 86400
    while True:
        await _asyncio.sleep(interval_secs)
        try:
            conn = db()
            conn.execute("VACUUM")
            conn.commit()
            logger.info("DB vacuum complete")
        except Exception as _e:
            logger.warning(f"DB vacuum error: {_e}")


# Module-level handle so the lifespan shutdown can cancel the scheduler task.
_scheduler_task = None


async def _scheduler_loop(db_path: str) -> None:
    """Background loop that checks character schedules and generates proactive messages.

    Runs every 5 minutes (300 seconds).  For each enabled schedule in
    ``character_schedules`` the function decides whether the trigger condition
    is met and, if so, inserts a new row into ``scheduled_messages`` for the
    frontend to pick up via ``GET /api/scheduler/pending``.

    Args:
        db_path: Filesystem path to the SQLite database.
    """
    import asyncio as _asyncio

    while True:
        try:
            await _asyncio.sleep(300)  # 5-minute polling interval
            await run_in_threadpool(_run_scheduler_tick, db_path)
        except _asyncio.CancelledError:
            logger.info("Scheduler loop cancelled - shutting down")
            break
        except Exception as _e:
            logger.warning("Scheduler loop error: %s", _e)


def _run_scheduler_tick(db_path: str) -> None:
    """Execute one scheduling tick: evaluate all enabled schedules and queue messages.

    Args:
        db_path: Filesystem path to the SQLite database.
    """
    import datetime as _dt

    now = _dt.datetime.now()
    now_ts = int(now.timestamp())
    today_str = now.strftime("%Y-%m-%d")
    now_total_minutes = now.hour * 60 + now.minute

    conn = sqlite3.connect(db_path)
    try:
        cur = conn.cursor()
        # Feature #29 (Day Off Mode): characters with day_off = 1 are excluded
        # entirely so the scheduler generates no proactive messages for them.
        # Sending a single "farewell" message when day_off is first enabled is
        # a future enhancement — the frontend should show a local toast instead.
        cur.execute("""
            SELECT cs.id, cs.char_id, cs.schedule_type, cs.time_of_day,
                   cs.hours_away, cs.last_triggered, c.name
            FROM character_schedules cs
            JOIN characters c ON c.id = cs.char_id
            WHERE cs.enabled = 1
              AND COALESCE(c.day_off, 0) = 0
        """)
        schedules = cur.fetchall()

        for (sched_id, char_id, sched_type, time_of_day,
             hours_away, last_triggered, char_name) in schedules:

            should_fire = False

            if sched_type == "time_of_day" and time_of_day:
                try:
                    t_h, t_m = int(time_of_day[:2]), int(time_of_day[3:])
                    target_minutes = t_h * 60 + t_m
                    diff = abs(now_total_minutes - target_minutes)
                    # Account for midnight wrap-around
                    diff = min(diff, 1440 - diff)
                    in_window = diff <= 5
                    already_fired_today = (
                        last_triggered is not None
                        and last_triggered.startswith(today_str)
                    )
                    should_fire = in_window and not already_fired_today
                except (ValueError, IndexError):
                    logger.warning("[Scheduler] Invalid time_of_day for schedule %s", sched_id)

            elif sched_type == "hours_away" and hours_away:
                row = cur.execute("""
                    SELECT MAX(m.ts)
                    FROM messages m
                    JOIN sessions s ON s.id = m.session_id
                    WHERE s.character_id = ? AND m.role = 'user'
                """, (char_id,)).fetchone()
                last_user_ts = row[0] if row and row[0] else None
                away_secs = hours_away * 3600
                user_away_long_enough = (
                    (now_ts - int(last_user_ts)) >= away_secs
                    if last_user_ts is not None else True
                )
                fired_recently = False
                if last_triggered is not None:
                    try:
                        lt_ts = int(_dt.datetime.fromisoformat(last_triggered).timestamp())
                        fired_recently = (now_ts - lt_ts) < away_secs
                    except ValueError:
                        pass
                should_fire = user_away_long_enough and not fired_recently

            if not should_fire:
                continue

            message_text = (
                f"Hey! It's {char_name}. "
                "I've been thinking about you - come chat with me when you get a chance!"
            )
            cur.execute(
                "INSERT INTO scheduled_messages (char_id, text, triggered_at, delivered) "
                "VALUES (?, ?, ?, 0)",
                (char_id, message_text, now_ts)
            )
            cur.execute(
                "UPDATE character_schedules SET last_triggered = ? WHERE id = ?",
                (now.isoformat(), sched_id)
            )
            conn.commit()
            logger.info(
                "[Scheduler] Queued proactive message for char_id=%s ('%s')",
                char_id, char_name
            )
    except Exception as _e:
        logger.warning("[Scheduler] Tick error: %s", _e)
        try:
            conn.rollback()
        except Exception:
            pass
    finally:
        conn.close()


# NOTE: startup logic is now in the lifespan() context manager above.

@app.get("/api/models/recommend")
def recommend_models(type: str = "llm"):
    if not model_manager: raise HTTPException(500, "Model Manager not ready")
    return {"models": model_manager.recommend_models(type)}

@app.get("/api/models/details")
def get_model_details(id: str):
    if not model_manager: raise HTTPException(500, "Model Manager not ready")
    return model_manager.get_model_details(id)

@app.get("/api/models/installed")
def list_installed_models():
    if not model_manager: raise HTTPException(500, "Model Manager not ready")
    return {"installed": model_manager.list_installed()}

@app.post("/api/models/install")
async def install_model(req: Request):
    if not model_manager: raise HTTPException(500, "Model Manager not ready")
    body = await req.json()
    model_id = body.get("id")
    mtype = body.get("type", "llm")
    quantization = body.get("quantization") # Optional
    
    if not model_id: raise HTTPException(400, "Model ID required")
    
    # Check if already installed
    # (Optional logic, but let's just reinstall/update)
    try:
        res = await model_manager.install(model_id, mtype, quantization=quantization)
        return res
    except Exception as e:
        raise HTTPException(500, str(e))

@app.delete("/api/models/{mtype}/{model_id:path}")
def delete_model(mtype: str, model_id: str):
    if not model_manager: raise HTTPException(500, "Model Manager not ready")
    success = model_manager.delete(model_id, mtype)
    return {"ok": success}

@app.post("/api/models/load")
async def load_model_endpoint(req: Request):
    """Load a downloaded model into LM Studio memory.

    Args:
        req: JSON body with ``model`` (required) and optional ``context_length``.

    Returns:
        dict: ``{"ok": True, "detail": ...}`` or error.
    """
    if not model_manager:
        raise HTTPException(500, "Model Manager not ready")
    body = await req.json()
    model_id = body.get("model")
    if not model_id:
        raise HTTPException(400, "model field required")
    ctx = body.get("context_length")
    result = model_manager.load_model(model_id, context_length=ctx)
    if not result.get("ok"):
        raise HTTPException(502, result.get("error", "Load failed"))
    return result

@app.post("/api/models/unload")
async def unload_model_endpoint(req: Request):
    """Unload a model from LM Studio memory.

    Args:
        req: JSON body with optional ``model`` (unloads all if omitted).

    Returns:
        dict: ``{"ok": True}`` or error.
    """
    if not model_manager:
        raise HTTPException(500, "Model Manager not ready")
    body = await req.json()
    model_id = body.get("model")
    result = model_manager.unload_model(model_id)
    if not result.get("ok"):
        raise HTTPException(502, result.get("error", "Unload failed"))
    return result

@app.get("/api/models/download-status")
def download_status_endpoint():
    """Poll current LM Studio download progress.

    Returns:
        dict: Download status from LM Studio (progress, model, etc.).
    """
    if not model_manager:
        raise HTTPException(500, "Model Manager not ready")
    return model_manager.get_download_status()

# ── LM Studio Model Info ─────────────────────────────────────────────

@app.get("/api/lm-studio/models")
async def lm_studio_models():
    """
    Query the local LM Studio instance for loaded models and their capabilities.

    Proxies to LM Studio's REST API (v0) to retrieve model metadata including
    max_context_length, architecture, and quantization info. This allows the
    frontend to auto-detect optimal settings for the currently loaded model.

    Returns:
        dict: {ok: bool, models: list, active_model: dict|None}
              Each model includes id, max_context_length, architecture, etc.

    Example:
        >>> GET /api/lm-studio/models
        {"ok": true, "models": [...], "active_model": {"id": "gemma-3-12b", "max_context_length": 131072}}
    """
    cfg = load_config()
    endpoint = _get_llm_endpoint(cfg)
    # Derive LM Studio base URL from the OpenAI-compat endpoint
    base_url = endpoint.replace("/v1", "").rstrip("/")

    try:
        import requests as req
        # LM Studio v4 REST API: GET /api/v0/models
        r = req.get(f"{base_url}/api/v0/models", timeout=5)
        if r.status_code != 200:
            return {"ok": False, "error": f"LM Studio returned {r.status_code}", "models": []}

        data = r.json()
        models = data if isinstance(data, list) else data.get("data", [])

        # Find the active model: prefer the currently loaded model in LM Studio
        # over the configured model in app.json (user may have switched models
        # in LM Studio without updating the config yet).
        configured_model = cfg.get("llm", {}).get("model", "")
        active_model = None
        loaded_models = [m for m in models if m.get("state") == "loaded"]

        # First pass: find a loaded model matching the config
        for m in loaded_models:
            model_id = m.get("id", "")
            if configured_model and (configured_model in model_id or model_id in configured_model):
                active_model = m
                break

        # Second pass: use any loaded model (handles model switches)
        if not active_model and loaded_models:
            active_model = loaded_models[0]

        # Fallback: use first model in list regardless of state
        if not active_model and models:
            active_model = models[0]

        return {"ok": True, "models": models, "active_model": active_model}

    except Exception as e:
        logger.warning(f"Could not query LM Studio models: {e}")
        return {"ok": False, "error": str(e), "models": []}


@app.get("/api/ollama/models")
async def ollama_models():
    """Query the local Ollama installation for installed models.

    Calls ``GET /api/tags`` on the Ollama server (default port 11434) and
    normalises the response into the same shape as ``/api/lm-studio/models``
    so the frontend can use a single code path for both backends.

    Returns:
        dict: ``{ok: bool, models: list}`` where each model contains
              ``id`` (name:tag), ``size`` (bytes), ``architecture``, and
              ``quantization``.  ``state`` is always ``"not-loaded"`` because
              Ollama loads models on demand per request.

    Example:
        >>> GET /api/ollama/models
        {"ok": true, "models": [{"id": "llama3.2:latest", "architecture": "llama", ...}]}
    """
    cfg = load_config()
    endpoint = _get_llm_endpoint(cfg)
    # Derive base URL: strip /v1 suffix that the LLM endpoint contains
    base_url = endpoint.replace("/v1", "").rstrip("/")
    # If the configured endpoint doesn't point at Ollama's port, fall back to
    # the standard Ollama default so the button works even when the user hasn't
    # updated their endpoint yet.
    if "11434" not in base_url:
        base_url = "http://localhost:11434"

    try:
        import requests as req
        r = req.get(f"{base_url}/api/tags", timeout=3)
        if r.status_code != 200:
            return {"ok": False, "error": f"Ollama returned {r.status_code}", "models": []}

        raw_models = r.json().get("models", [])
        models = [
            {
                "id": m.get("name", ""),
                "size": m.get("size"),
                "architecture": m.get("details", {}).get("family"),
                "quantization": m.get("details", {}).get("quantization_level"),
                "parameter_size": m.get("details", {}).get("parameter_size"),
                # Ollama pulls models into local storage; they load on first use
                "state": "not-loaded",
                "format": "gguf",
            }
            for m in raw_models
        ]
        return {"ok": True, "models": models}

    except Exception as e:
        logger.warning(f"Could not query Ollama models: {e}")
        return {"ok": False, "error": str(e), "models": []}


@app.get("/api/models/capabilities")
async def get_model_capabilities(model_id: str, context_length: int = None):
    """Enrich a model identifier with HuggingFace capability metadata.

    Resolves ``model_id`` to a HuggingFace repo (or falls back to name
    heuristics) and returns detected capabilities: tier, vision, tool use,
    thinking mode, context window, and architecture family.

    This endpoint is intentionally **not** cached — the UI should cache
    results client-side to avoid redundant calls.

    Args:
        model_id: Model ID string in any format supported by the enricher
            (LM Studio GGUF path, HF repo ID, short name, Ollama name).
        context_length: Context window reported by the local LLM server.
            Used as fallback when HF's config.json doesn't have the value.

    Returns:
        dict: ``{ok, model_id, hf_repo, source, tier, architecture,
                  context_window, lm_context_length,
                  supports_vision, supports_tools, supports_thinking}``

    Example:
        >>> GET /api/models/capabilities?model_id=lmstudio-community/Qwen3-8B-GGUF/Qwen3-8B-Q4_K_M.gguf
        {
          "ok": true,
          "model_id": "lmstudio-community/Qwen3-8B-GGUF/Qwen3-8B-Q4_K_M.gguf",
          "hf_repo": "lmstudio-community/Qwen3-8B-GGUF",
          "source": "hf",
          "tier": "medium",
          "architecture": "qwen3",
          "context_window": 32768,
          "lm_context_length": 8192,
          "supports_vision": false,
          "supports_tools": true,
          "supports_thinking": true
        }
    """
    if not model_id:
        raise HTTPException(400, "model_id is required")
    try:
        from backend.llm.model_enricher import enrich_model
        from backend.llm.capability_detector import get_tool_protocol
        result = enrich_model(model_id, lm_context_length=context_length)
        conn = db()
        tool_protocol = get_tool_protocol(model_id, conn=conn)
        return {"ok": True, **result, "tool_protocol": tool_protocol}
    except Exception as exc:
        logger.warning(f"Model capability enrichment failed for '{model_id}': {exc}")
        raise HTTPException(500, str(exc))


@app.get("/api/models/active-capabilities")
async def get_active_model_capabilities():
    """Auto-detect the loaded LM Studio model and return its capabilities.

    Queries LM Studio for the currently loaded model, then enriches it with
    HuggingFace metadata. Useful for the UI to show capability badges without
    requiring the user to select a specific model.

    Returns:
        dict: Same shape as ``/api/models/capabilities``, plus an
        ``"active_model_id"`` key. Returns ``{"ok": False, "error": ...}``
        when LM Studio is unreachable or no model is loaded.

    Example:
        >>> GET /api/models/active-capabilities
        {"ok": true, "active_model_id": "google/gemma-3-12b", "tier": "large", ...}
    """
    cfg = load_config()
    endpoint = _get_llm_endpoint(cfg)
    base_url = endpoint.replace("/v1", "").rstrip("/")

    try:
        import requests as _req
        r = _req.get(f"{base_url}/api/v0/models", timeout=5)
        if r.status_code != 200:
            return {"ok": False, "error": f"LM Studio returned {r.status_code}"}

        data = r.json()
        models = data if isinstance(data, list) else data.get("data", [])
        loaded = [m for m in models if m.get("state") == "loaded"]
        if not loaded:
            return {"ok": False, "error": "No model currently loaded in LM Studio"}

        active = loaded[0]
        from backend.llm.model_enricher import enrich_model
        result = enrich_model(
            active["id"],
            lm_context_length=active.get("max_context_length"),
        )
        return {"ok": True, "active_model_id": active["id"], **result}
    except Exception as exc:
        logger.warning(f"Active capability detection failed: {exc}")
        return {"ok": False, "error": str(exc)}


@app.post("/api/models/{model_id:path}/tool-protocol")
async def set_model_tool_protocol(model_id: str, req: Request):
    """Set a manual tool protocol override for a model.

    Stores the override in ``model_capability_cache``. Manual overrides
    survive automatic re-detection and take highest priority.

    Args:
        model_id: URL-encoded model identifier.
        req: JSON body with ``protocol`` (one of: openai_functions, xml_fallback, none).

    Returns:
        {"ok": True, "model_id": str, "protocol": str}
    """
    body = await req.json()
    protocol = body.get("protocol", "").strip()
    if protocol not in ("openai_functions", "xml_fallback", "none"):
        raise HTTPException(400, "protocol must be one of: openai_functions, xml_fallback, none")
    from backend.llm.capability_detector import set_manual_override
    conn = db()
    set_manual_override(conn, model_id, protocol)  # type: ignore[arg-type]
    logger.info(f"[C2] Manual tool protocol override: {model_id} → {protocol}")
    return {"ok": True, "model_id": model_id, "protocol": protocol}


@app.get("/api/models/capability-cache")
def get_capability_cache():
    """Return all entries in the model capability cache.

    Returns:
        {"ok": True, "entries": [{model_id, tool_protocol, source, manual_override, cached_at}, ...]}
    """
    conn = db()
    rows = conn.execute(
        "SELECT model_id, tool_protocol, source, manual_override, cached_at FROM model_capability_cache ORDER BY cached_at DESC"
    ).fetchall()
    return {
        "ok": True,
        "entries": [
            {"model_id": r[0], "tool_protocol": r[1], "source": r[2], "manual_override": bool(r[3]), "cached_at": r[4]}
            for r in rows
        ],
    }


# ==================== VOCABULARY SYSTEM ====================

@app.get("/api/vocab")
def get_vocab_entries(
    category: str = None,
    register: str = None,
    emotion: str = None,
    source: str = None,
    search: str = None,
    page: int = 0,
    size: int = 50,
):
    """Get paginated, filtered vocabulary entries.

    Args:
        category: Filter by category (e.g. "GenZ", "AnimeJP").
        register: Filter by register (e.g. "cute", "edgy").
        emotion: Filter by emotion (e.g. "joy", "flirt").
        source: Filter by source ("base" or "user").
        search: Search query (substring match on term/meaning/category).
        page: Page number (0-indexed).
        size: Page size (default 50).

    Returns:
        {"ok": True, "entries": [...], "total": int, "page": int, "size": int}
    """
    if not vocab_manager._loaded:
        raise HTTPException(status_code=503, detail="Vocabulary not loaded")

    if search:
        entries = vocab_manager.search(search, limit=size)
        return {"ok": True, "entries": entries, "total": len(entries), "page": 0, "size": size}

    entries, total = vocab_manager.get_entries(
        category=category, register=register, emotion=emotion,
        source=source, page=page, size=size
    )
    return {"ok": True, "entries": entries, "total": total, "page": page, "size": size}


@app.get("/api/vocab/categories")
def get_vocab_categories():
    """Get list of unique vocabulary categories.

    Returns:
        {"ok": True, "categories": ["AnimeJP", "Gaming", "GenZ", ...]}
    """
    if not vocab_manager._loaded:
        raise HTTPException(status_code=503, detail="Vocabulary not loaded")

    return {"ok": True, "categories": vocab_manager.categories}


@app.get("/api/vocab/stats")
def get_vocab_stats():
    """Get vocabulary statistics (counts by source, category breakdown).

    Returns:
        {"ok": True, "stats": {total, base_count, user_count, categories, category_count}}
    """
    if not vocab_manager._loaded:
        raise HTTPException(status_code=503, detail="Vocabulary not loaded")

    return {"ok": True, "stats": vocab_manager.get_stats()}


@app.post("/api/vocab")
async def add_vocab_entry(req: Request):
    """Add a user vocabulary entry.

    Args:
        req: JSON body with at minimum "term" and "meaning" fields.
            Optional: aliases, category, register, emotion, pos, language.

    Returns:
        {"ok": True, "entry": {created entry with eg_id}}
    """
    if not vocab_manager._loaded:
        raise HTTPException(status_code=503, detail="Vocabulary not loaded")

    body = await req.json()
    if not body.get("term") or not body.get("meaning"):
        raise HTTPException(status_code=400, detail="'term' and 'meaning' are required")

    entry = vocab_manager.add_entry(body)
    return {"ok": True, "entry": entry}


@app.put("/api/vocab/{eg_id}")
async def update_vocab_entry(eg_id: str, req: Request):
    """Update a user vocabulary entry.

    Only user-added entries can be edited. Base vocab entries are read-only.

    Args:
        eg_id: The entry ID to update.
        req: JSON body with fields to update.

    Returns:
        {"ok": True, "entry": {updated entry}} or 404 if not found.
    """
    if not vocab_manager._loaded:
        raise HTTPException(status_code=503, detail="Vocabulary not loaded")

    body = await req.json()
    entry = vocab_manager.update_entry(eg_id, body)
    if entry is None:
        raise HTTPException(status_code=404, detail="Entry not found or not a user entry")

    return {"ok": True, "entry": entry}


@app.delete("/api/vocab/{eg_id}")
def delete_vocab_entry(eg_id: str):
    """Delete a user vocabulary entry.

    Only user-added entries can be deleted. Base vocab entries are protected.

    Args:
        eg_id: The entry ID to delete.

    Returns:
        {"ok": True} or 404 if not found.
    """
    if not vocab_manager._loaded:
        raise HTTPException(status_code=503, detail="Vocabulary not loaded")

    deleted = vocab_manager.delete_entry(eg_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Entry not found or not a user entry")

    return {"ok": True}


@app.get("/api/vocab/export")
def export_vocab():
    """Export user vocabulary as a clean JSON array.

    Returns user-added entries only (no internal fields like _source).

    Returns:
        {"ok": True, "entries": [...], "count": int}
    """
    if not vocab_manager._loaded:
        raise HTTPException(status_code=503, detail="Vocabulary not loaded")

    entries = vocab_manager.export_user_vocab()
    return {"ok": True, "entries": entries, "count": len(entries)}


@app.post("/api/vocab/import")
async def import_vocab(req: Request):
    """Import vocabulary entries from a JSON array.

    Entries are added as user entries. Duplicates (by eg_id) are skipped.

    Args:
        req: JSON body {"entries": [{term, meaning, ...}, ...]}

    Returns:
        {"ok": True, "imported": int, "total_user": int}
    """
    if not vocab_manager._loaded:
        raise HTTPException(status_code=503, detail="Vocabulary not loaded")

    body = await req.json()
    entries = body.get("entries", [])
    if not isinstance(entries, list):
        raise HTTPException(status_code=400, detail="'entries' must be a list")

    count = vocab_manager.import_user_vocab(entries)
    return {
        "ok": True,
        "imported": count,
        "total_user": len(vocab_manager.user_entries)
    }


# ==================== OBS STREAMING OVERLAY ====================

# Set of active WebSocket connections from overlay browser sources.
# Broadcast messages are sent to all connected overlays whenever the AI responds.
_overlay_connections: set[WebSocket] = set()


async def _broadcast_overlay(msg: dict) -> None:
    """Broadcast a JSON message to all connected OBS overlay WebSockets.

    Dead connections are silently removed from ``_overlay_connections`` so the
    set stays clean without manual management.

    Args:
        msg: JSON-serialisable dict.  Overlay clients expect keys:
             ``type``, ``audio_url``, ``text``, ``expression``, ``animation``.
    """
    disconnected: list[WebSocket] = []
    for ws in list(_overlay_connections):
        try:
            await ws.send_json(msg)
        except Exception:
            disconnected.append(ws)
    for ws in disconnected:
        _overlay_connections.discard(ws)


@app.websocket("/ws/overlay")
async def overlay_ws(websocket: WebSocket) -> None:
    """WebSocket endpoint for the OBS streaming overlay.

    The overlay HTML page (``/viewer/overlay.html``) connects here on load.
    The backend pushes ``speak`` and ``animate`` events whenever the AI produces
    a response so the overlay character reacts in real-time without the user
    having to interact with the main UI.

    Protocol:
        Server → client JSON events::
            {"type": "speak", "audio_url": "/files/audio/xxx.mp3",
             "text": "Hello!", "expression": "happy", "animation": null}
            {"type": "animate", "name": "wave"}
            {"type": "ping"}

        Client → server: Any text frame is treated as a keep-alive; the
        connection stays open until the client disconnects.

    Example OBS Browser Source URL:
        http://localhost:8080/viewer/overlay.html
    """
    await websocket.accept()
    _overlay_connections.add(websocket)
    logger.info(f"[Overlay] WebSocket connected ({len(_overlay_connections)} active)")
    try:
        while True:
            # Keep connection alive; client sends keep-alive pings periodically
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.debug(f"[Overlay] WebSocket error: {e}")
    finally:
        _overlay_connections.discard(websocket)
        logger.info(f"[Overlay] WebSocket disconnected ({len(_overlay_connections)} remaining)")


# ---------------------------------------------------------------------------
# Feature A1 — Full-Duplex Voice Conversation WebSocket
# ---------------------------------------------------------------------------

@app.websocket("/ws/voice")
async def voice_duplex_ws(websocket: WebSocket) -> None:
    """WebSocket endpoint for full-duplex voice conversation.

    Enables real-time bidirectional voice chat: the client streams
    microphone audio (binary WebM/Opus chunks) and receives TTS audio
    (binary) plus JSON control events back.

    Query parameters:
        session_id (int): Chat session for message persistence.
        char_id (int): Character persona for LLM + TTS voice.

    Protocol:
        Client → server:
            - Binary: WebM/Opus audio chunks (~100ms each)
            - JSON: ``{"type": "control", "action": "interrupt"|"config"|"ping"}``

        Server → client:
            - Binary: TTS audio file bytes (MP3/WAV)
            - JSON events:
                - ``{"type": "state", "state": "idle"|"listening"|"processing"|"speaking"}``
                - ``{"type": "transcript", "text": "...", "role": "user"}``
                - ``{"type": "ai_token", "text": "..."}``
                - ``{"type": "ai_text", "text": "...", "emotion": "..."}``
                - ``{"type": "interrupted"}``
                - ``{"type": "emotion", "emotion": "...", "intensity": 0.8}``
                - ``{"type": "error", "message": "..."}``

    Example frontend connection:
        ``new WebSocket("ws://localhost:8080/ws/voice?session_id=1&char_id=1")``
    """
    await websocket.accept()

    # Parse and validate query parameters
    params = websocket.query_params
    try:
        session_id = int(params.get("session_id", "1"))
        char_id = int(params.get("char_id", "1"))
    except (ValueError, TypeError):
        await websocket.send_json({
            "type": "error",
            "message": "Invalid query parameters: session_id and char_id must be integers",
        })
        await websocket.close(code=1008, reason="Invalid query parameters")
        return

    cfg = load_config() or {}

    logger.info(f"[Voice] WebSocket connected (session={session_id}, char={char_id})")

    try:
        from backend.voice.duplex import VoiceDuplexSession
        session = VoiceDuplexSession(websocket, session_id, char_id, cfg)
        await session.run()
    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.error(f"[Voice] WebSocket error: {e}")
    finally:
        logger.info(f"[Voice] WebSocket disconnected (session={session_id})")


# ---------------------------------------------------------------------------
# Phase 8A — AI Image & Video Generation endpoints
# ---------------------------------------------------------------------------

# In-memory job registry for async video generation jobs.
# Maps job_id → {"status": str, "url": str|None, "error": str|None}
# Kept in memory only; jobs are lost on server restart (acceptable for
# long-running clip generation that users re-trigger as needed).
_video_jobs: dict = {}


@app.get("/api/image-gen/status")
def image_gen_status():
    """Check whether the configured image generation backend is available.

    Returns the provider name and availability flag so the frontend can
    show/hide generation buttons accordingly.

    Returns:
        JSON: ``{"available": bool, "provider": str, "model": str,
                 "endpoint": str}``

    Example:
        >>> GET /api/image-gen/status
        {"available": true, "provider": "comfyui", "model": "z-image-turbo",
         "endpoint": "http://localhost:8188"}
    """
    cfg = load_config()
    from backend.image_gen.registry import get_image_gen
    adapter = get_image_gen(cfg)
    available = adapter.is_available()
    image_cfg = cfg.get("image_gen", {})
    return {
        "available": available,
        "provider": adapter.provider_name(),
        "model": image_cfg.get("model", ""),
        "endpoint": image_cfg.get("endpoint", ""),
    }


@app.post("/api/image-gen/background")
async def generate_background(req: Request):
    """Generate a background image using the configured image gen backend.

    Loads the ComfyUI background workflow template (or Easy Diffusion's
    text-to-image endpoint), injects the prompt, and saves the output to
    ``storage/images/``.  The returned URL is ready for use as a character
    ``background_url`` value.

    Args:
        req: JSON body with:
            - ``prompt`` (str, required): Image description.
            - ``width`` (int, optional): Image width in pixels (default 512).
            - ``height`` (int, optional): Image height in pixels (default 512).
            - ``steps`` (int, optional): Inference steps (default from config).
            - ``character_id`` (int, optional): Character to auto-update.

    Returns:
        JSON: ``{"ok": True, "url": str, "filename": str}`` on success,
              ``{"ok": False, "error": str}`` on failure.

    Example:
        >>> POST /api/image-gen/background
        >>> {"prompt": "anime cyberpunk bedroom, neon lights, lofi aesthetic"}
        {"ok": true, "url": "/files/images/gen_1708615234_a3f9c12b.png",
         "filename": "gen_1708615234_a3f9c12b.png"}
    """
    body = await req.json()
    prompt = body.get("prompt", "").strip()
    if not prompt:
        raise HTTPException(400, "prompt is required")

    cfg = load_config()
    from backend.image_gen.registry import get_image_gen
    adapter = get_image_gen(cfg)

    if not adapter.is_available():
        return JSONResponse(
            {"ok": False, "error": f"Image generation backend ({adapter.provider_name()}) is not available"},
            status_code=503,
        )

    # Merge request overrides with config defaults
    image_cfg = cfg.get("image_gen", {})
    gen_cfg = {
        "width": body.get("width", image_cfg.get("width", 512)),
        "height": body.get("height", image_cfg.get("height", 512)),
        "steps": body.get("steps", image_cfg.get("steps", 9)),
        "model": body.get("model", image_cfg.get("model", "")),
    }

    result = await run_in_threadpool(adapter.generate, prompt, gen_cfg)

    # Optionally auto-update the character's background_url
    char_id = body.get("character_id")
    if result.get("ok") and char_id:
        try:
            con = db()
            con.execute(
                "UPDATE characters SET background_url = ? WHERE id = ?",
                (result["url"], char_id),
            )
            con.commit()
            con.close()
        except Exception as exc:
            logger.warning(f"[ImageGen] Failed to auto-update character background: {exc}")

    return result


@app.post("/api/image-gen/portrait")
async def generate_portrait(req: Request):
    """Generate a character portrait image for use as an avatar or expression.

    Uses the same image gen pipeline as ``/api/image-gen/background`` but
    defaults to portrait dimensions (512×768) and a portrait-oriented prompt.

    Args:
        req: JSON body with:
            - ``prompt`` (str, required): Portrait description.
            - ``character_name`` (str, optional): Prepended to prompt.
            - ``width`` (int, optional): Default 512.
            - ``height`` (int, optional): Default 768.
            - ``character_id`` (int, optional): Auto-update avatar_2d_url.

    Returns:
        JSON: ``{"ok": True, "url": str, "filename": str}`` on success.

    Example:
        >>> POST /api/image-gen/portrait
        >>> {"prompt": "Rin, anime girl, happy expression, upper body"}
        {"ok": true, "url": "/files/images/gen_1708615234_portrait.png", ...}
    """
    body = await req.json()
    prompt = body.get("prompt", "").strip()
    char_name = body.get("character_name", "").strip()

    if not prompt:
        raise HTTPException(400, "prompt is required")

    # Prepend character name if provided and not already in prompt
    if char_name and char_name.lower() not in prompt.lower():
        prompt = f"{char_name}, {prompt}"

    cfg = load_config()
    from backend.image_gen.registry import get_image_gen
    adapter = get_image_gen(cfg)

    if not adapter.is_available():
        return JSONResponse(
            {"ok": False, "error": f"Image generation backend ({adapter.provider_name()}) is not available"},
            status_code=503,
        )

    image_cfg = cfg.get("image_gen", {})
    gen_cfg = {
        "width": body.get("width", 512),
        "height": body.get("height", 768),
        "steps": body.get("steps", image_cfg.get("steps", 9)),
        "model": body.get("model", image_cfg.get("model", "")),
    }

    result = await run_in_threadpool(adapter.generate, prompt, gen_cfg)

    # Optionally auto-update character's avatar_2d_url
    char_id = body.get("character_id")
    if result.get("ok") and char_id:
        try:
            con = db()
            con.execute(
                "UPDATE characters SET avatar_2d_url = ? WHERE id = ?",
                (result["url"], char_id),
            )
            con.commit()
            con.close()
        except Exception as exc:
            logger.warning(f"[ImageGen] Failed to auto-update character portrait: {exc}")

    return result


@app.post("/api/image-gen/expressions/{char_id}")
async def generate_expression_pack(char_id: int, req: Request):
    """Generate a full set of expression portraits for a character (batch).

    Generates one portrait per emotion (happy, sad, surprised, thinking,
    embarrassed, excited, angry, shy) using the character's visual description
    as the base prompt. Saves all portraits to ``storage/images/`` and stores
    the resulting URL map in ``characters.expr_portraits`` (JSON TEXT column).

    This is an async long-running endpoint — for 8 expressions at ~1s each
    it takes 8–15 seconds. Consider calling from a background task in the UI.

    Args:
        char_id: Database character ID.
        req: JSON body with:
            - ``base_prompt`` (str, optional): Visual description override.
              Falls back to the character's system_prompt if not provided.
            - ``emotions`` (list, optional): Subset of emotions to generate.

    Returns:
        JSON: ``{"ok": True, "portraits": {emotion: url, ...}}`` on success.

    Example:
        >>> POST /api/image-gen/expressions/1
        >>> {"base_prompt": "Rin, dark hair, anime girl, upper body portrait"}
        {"ok": true, "portraits": {"happy": "/files/images/rin_expr_happy.png", ...}}
    """
    body = await req.json()

    # Fetch character to get name + system_prompt for base prompt
    con = db()
    row = con.execute(
        "SELECT name, system_prompt FROM characters WHERE id = ?", (char_id,)
    ).fetchone()
    con.close()

    if not row:
        raise HTTPException(404, f"Character {char_id} not found")

    char_name, system_prompt = row
    base_prompt = body.get("base_prompt", "").strip()

    # If no base_prompt provided, extract a visual description from the system_prompt
    if not base_prompt:
        # Use just the first sentence of system_prompt as a visual seed
        first_sent = (system_prompt or "").split(".")[0][:100].strip()
        base_prompt = f"{char_name}, anime style, upper body portrait"
        if first_sent:
            base_prompt = f"{char_name}, {first_sent}, anime style, portrait"

    emotions = body.get("emotions", [
        "happy", "sad", "surprised", "thinking",
        "embarrassed", "excited", "angry", "shy",
    ])

    cfg = load_config()
    from backend.image_gen.registry import get_image_gen
    adapter = get_image_gen(cfg)

    if not adapter.is_available():
        return JSONResponse(
            {"ok": False, "error": f"Image generation backend ({adapter.provider_name()}) is not available"},
            status_code=503,
        )

    image_cfg = cfg.get("image_gen", {})
    gen_cfg = {
        "width": 512,
        "height": 768,
        "steps": image_cfg.get("steps", 9),
        "model": image_cfg.get("model", ""),
    }

    # Emotion-to-prompt suffix mapping — guides the model toward the right expression
    emotion_suffixes = {
        "happy": "smiling warmly, happy expression, bright eyes",
        "sad": "teary eyes, sad expression, downcast look",
        "surprised": "mouth open, surprised expression, wide eyes",
        "thinking": "hand on chin, thoughtful expression, looking upward",
        "embarrassed": "blushing cheeks, embarrassed expression, looking away",
        "excited": "energetic pose, excited expression, big smile",
        "angry": "frowning, annoyed expression, crossed arms",
        "shy": "fidgeting, shy expression, small smile",
    }

    portraits = {}
    errors = []

    for emotion in emotions:
        suffix = emotion_suffixes.get(emotion, f"{emotion} expression")
        prompt = f"{base_prompt}, {suffix}"
        result = await run_in_threadpool(adapter.generate, prompt, gen_cfg)

        if result.get("ok"):
            portraits[emotion] = result["url"]
            logger.info(f"[ExprGen] {char_name}/{emotion} → {result['filename']}")
        else:
            errors.append(f"{emotion}: {result.get('error', 'unknown')}")
            logger.warning(f"[ExprGen] {char_name}/{emotion} failed: {result.get('error')}")

    # Save portrait map to DB
    if portraits:
        import json as _json
        con = db()
        con.execute(
            "UPDATE characters SET expr_portraits = ? WHERE id = ?",
            (_json.dumps(portraits), char_id),
        )
        con.commit()
        con.close()

    return {
        "ok": len(portraits) > 0,
        "portraits": portraits,
        "errors": errors,
    }


@app.get("/api/characters/{char_id}/expr-portraits")
def get_expr_portraits(char_id: int):
    """Return the current expression portrait URL map for a character.

    Args:
        char_id: Character ID.

    Returns:
        {"ok": True, "expr_portraits": {emotion: url, ...}} or {"ok": True, "expr_portraits": null}
    """
    import json as _json
    conn = db()
    row = conn.execute("SELECT expr_portraits FROM characters WHERE id = ?", (char_id,)).fetchone()
    if not row:
        raise HTTPException(404, "Character not found")
    portraits = None
    if row[0]:
        try:
            portraits = _json.loads(row[0])
        except Exception:
            portraits = None
    return {"ok": True, "expr_portraits": portraits}


@app.post("/api/video-gen/background")
async def generate_video_background(req: Request):
    """Start an asynchronous video background generation job.

    Video generation takes minutes (not seconds). This endpoint queues the
    job and immediately returns a ``job_id``. Poll
    ``GET /api/video-gen/background/{job_id}`` for status.

    Requires ComfyUI with the WanVideoWrapper custom node pack installed
    and Wan 2.2 TI2V-5B model downloaded.

    Args:
        req: JSON body with:
            - ``prompt`` (str, required): Video description.
            - ``duration`` (int, optional): Clip length in seconds (default 5).
            - ``character_id`` (int, optional): Character to auto-assign on completion.

    Returns:
        JSON: ``{"ok": True, "job_id": str}`` on success,
              ``{"ok": False, "error": str}`` on failure.

    Example:
        >>> POST /api/video-gen/background
        >>> {"prompt": "anime cyberpunk bedroom, looping, subtle ambient motion"}
        {"ok": true, "job_id": "abc123def456"}
    """
    body = await req.json()
    prompt = body.get("prompt", "").strip()
    if not prompt:
        raise HTTPException(400, "prompt is required")

    cfg = load_config()
    from backend.image_gen.registry import get_video_gen
    adapter = get_video_gen(cfg)

    if not adapter.is_available():
        return JSONResponse(
            {"ok": False, "error": f"Video generation backend ({adapter.provider_name()}) is not available"},
            status_code=503,
        )

    video_cfg = cfg.get("video_gen", {})
    gen_cfg = {
        "duration": body.get("duration", video_cfg.get("duration", 5)),
        "model": video_cfg.get("model", "wan2.2-ti2v-5b"),
    }

    result = await run_in_threadpool(adapter.generate_video, prompt, gen_cfg)

    if result.get("ok"):
        job_id = result["job_id"]
        _video_jobs[job_id] = {
            "status": "queued",
            "url": None,
            "error": None,
            "character_id": body.get("character_id"),
        }

    return result


@app.get("/api/video-gen/background/{job_id}")
async def video_gen_status(job_id: str):
    """Poll the status of an async video generation job.

    Args:
        job_id: Job identifier returned by ``POST /api/video-gen/background``.

    Returns:
        JSON: ``{"status": "queued"|"running"|"done"|"error",
                 "url": str|None, "progress": float|None,
                 "error": str|None}``

    Example:
        >>> GET /api/video-gen/background/abc123def456
        {"status": "done", "url": "/files/images/video_1708615234_abc.mp4",
         "progress": 1.0}
    """
    cfg = load_config()
    from backend.image_gen.registry import get_video_gen
    adapter = get_video_gen(cfg)

    status = await run_in_threadpool(adapter.video_status, job_id)

    # Auto-update stored job state
    if job_id in _video_jobs:
        _video_jobs[job_id].update(status)

        # Auto-assign video to character if requested and job completed
        char_id = _video_jobs[job_id].get("character_id")
        if status.get("status") == "done" and status.get("url") and char_id:
            try:
                con = db()
                con.execute(
                    "UPDATE characters SET world_video_url = ? WHERE id = ?",
                    (status["url"], char_id),
                )
                con.commit()
                con.close()
            except Exception as exc:
                logger.warning(f"[VideoGen] Failed to auto-assign video to character: {exc}")

    return status


# --- SCHEDULER ENDPOINTS ---

@app.get("/api/scheduler/pending")
def get_scheduler_pending():
    """Return all undelivered scheduled messages with character metadata.

    Returns:
        JSON with ok: true and pending list. Each item contains id, char_id,
        char_name, char_avatar_url, text, triggered_at (Unix timestamp).

    Example:
        >>> GET /api/scheduler/pending
        {"ok": true, "pending": [{"id": 1, "char_id": 5, ...}]}
    """
    conn = db()
    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT sm.id, sm.char_id, c.name, c.avatar_url, sm.text, sm.triggered_at
            FROM scheduled_messages sm
            JOIN characters c ON c.id = sm.char_id
            WHERE sm.delivered = 0
            ORDER BY sm.triggered_at ASC
        """)
        rows = cur.fetchall()
        pending = [
            {
                "id": row[0],
                "char_id": row[1],
                "char_name": row[2],
                "char_avatar_url": row[3],
                "text": row[4],
                "triggered_at": row[5],
            }
            for row in rows
        ]
        return {"ok": True, "pending": pending}
    except Exception as _exc:
        logger.error("[Scheduler] Error fetching pending messages: %s", _exc)
        raise HTTPException(status_code=500, detail="Failed to fetch pending messages")
    finally:
        conn.close()


@app.post("/api/scheduler/acknowledge")
async def acknowledge_scheduler_message(req: Request):
    """Mark a scheduled message as delivered/acknowledged by the client.

    Args:
        req: JSON body with message_id (int).

    Returns:
        {"ok": true}

    Raises:
        HTTPException 400: If message_id is missing or not an integer.
        HTTPException 500: If the database update fails.

    Example:
        >>> POST /api/scheduler/acknowledge
        >>> {"message_id": 1}
        {"ok": true}
    """
    body = await req.json()
    message_id = body.get("message_id")
    if message_id is None:
        raise HTTPException(status_code=400, detail="'message_id' is required")
    try:
        message_id = int(message_id)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="'message_id' must be an integer")

    conn = db()
    try:
        conn.execute(
            "UPDATE scheduled_messages SET delivered = 1 WHERE id = ?",
            (message_id,)
        )
        conn.commit()
        return {"ok": True}
    except Exception as _exc:
        logger.error("[Scheduler] Error acknowledging message %s: %s", message_id, _exc)
        raise HTTPException(status_code=500, detail="Failed to acknowledge message")
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Feature #11 — Global Conversation Search (FTS5 with LIKE fallback)
# ---------------------------------------------------------------------------

@app.get("/api/search/messages")
def search_messages(
    q: str,
    limit: int = 20,
    char_id: Optional[int] = None,
):
    """Full-text search across all message history.

    Uses the ``messages_fts`` FTS5 virtual table when available for ranked,
    snippet-highlighted results.  Falls back to a ``LIKE`` scan when the
    virtual table does not exist so the endpoint is always functional.

    Args:
        q: Search query string.  Must be non-empty.
        limit: Maximum number of results to return (default 20).
        char_id: Optional character ID to scope the search.

    Returns:
        A dict with:
        - ``query``: The original search term.
        - ``results``: List of match dicts, each containing message_id,
          session_id, char_id, char_name, role, snippet, and ts.
        - ``count``: Total number of results returned.

    Raises:
        HTTPException 422: If ``q`` is empty or whitespace-only.
        HTTPException 500: If a database error occurs.

    Example:
        >>> GET /api/search/messages?q=hello&limit=5
        {"query": "hello", "results": [...], "count": 2}
    """
    if not q or not q.strip():
        raise HTTPException(status_code=422, detail="Query parameter 'q' must not be empty")

    conn = db()
    try:
        # Detect whether the FTS5 virtual table exists
        fts_row = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='messages_fts'"
        ).fetchone()
        use_fts = fts_row is not None

        if use_fts:
            # FTS5 path: ranked results with highlighted snippets
            base_sql = """
                SELECT m.id, m.session_id, m.role, m.content, m.ts,
                       s.character_id, c.name AS char_name,
                       snippet(messages_fts, 2, '<mark>', '</mark>', '\u2026', 32) AS snip
                FROM messages_fts
                JOIN messages m ON messages_fts.rowid = m.id
                JOIN sessions s ON m.session_id = s.id
                JOIN characters c ON s.character_id = c.id
                WHERE messages_fts MATCH ?
            """
            params: list = [q]
            if char_id is not None:
                base_sql += " AND s.character_id = ?"
                params.append(char_id)
            base_sql += " ORDER BY rank LIMIT ?"
            params.append(limit)
        else:
            # LIKE fallback: simple substring match, no ranking
            base_sql = """
                SELECT m.id, m.session_id, m.role, m.content, m.ts,
                       s.character_id, c.name AS char_name,
                       m.content AS snip
                FROM messages m
                JOIN sessions s ON m.session_id = s.id
                JOIN characters c ON s.character_id = c.id
                WHERE m.content LIKE ?
            """
            params = [f"%{q}%"]
            if char_id is not None:
                base_sql += " AND s.character_id = ?"
                params.append(char_id)
            base_sql += " ORDER BY m.id DESC LIMIT ?"
            params.append(limit)

        rows = conn.execute(base_sql, params).fetchall()
        results = [
            {
                "message_id": row[0],
                "session_id": row[1],
                "role": row[2],
                "snippet": row[7],
                "ts": row[4],
                "char_id": row[5],
                "char_name": row[6],
            }
            for row in rows
        ]
        return {"query": q, "results": results, "count": len(results)}
    except HTTPException:
        raise
    except Exception as _exc:
        logger.error("[Search] Full-text search failed: %s", _exc)
        raise HTTPException(status_code=500, detail="Search failed")
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Feature #20 — Privacy / Full Data Export
# ---------------------------------------------------------------------------

@app.get("/api/data/export")
def export_all_data():
    """Export all user data as a downloadable ZIP archive.

    Collects characters, sessions, messages, config, vocabulary, and memories
    into individual JSON files, bundles them into a timestamped ZIP, then
    streams the archive back as an ``application/zip`` download.  A background
    cleanup task removes the temp file after the response is sent.

    The endpoint is intentionally synchronous (not ``async``) because SQLite
    and file I/O are blocking; FastAPI will run it in a thread-pool.

    Returns:
        A ``FileResponse`` with ``Content-Disposition: attachment``,
        ``media_type="application/zip"``, and a filename of the form
        ``waifu-rt3d-export-YYYYMMDD-HHMMSS.zip``.

    Raises:
        HTTPException 500: If ZIP creation or any DB query fails.

    Example:
        >>> GET /api/data/export
        # → HTTP 200, body is a ZIP binary
    """
    import tempfile as _tempfile
    import zipfile as _zipfile
    import os as _os
    from datetime import datetime as _dt_exp
    from fastapi.responses import FileResponse as _FileResponse

    timestamp = _dt_exp.now().strftime("%Y%m%d-%H%M%S")
    zip_filename = f"waifu-rt3d-export-{timestamp}.zip"

    # Create a NamedTemporaryFile that persists until we explicitly delete it.
    # delete=False is required because FileResponse needs to re-open the path
    # after this function returns.
    tmp = _tempfile.NamedTemporaryFile(suffix=".zip", delete=False)
    zip_path = tmp.name
    tmp.close()

    def _table_to_dicts(conn: sqlite3.Connection, table: str) -> list:
        """Fetch all rows from *table* as a list of column-keyed dicts.

        Args:
            conn: Open SQLite connection.
            table: Table name (caller is responsible for sanitising this).

        Returns:
            List of row dicts; empty list if the table has no rows.
        """
        # LIMIT 0 populates cursor.description without fetching rows
        schema_cur = conn.execute(f"SELECT * FROM {table} LIMIT 0")  # noqa: S608
        cols = [d[0] for d in schema_cur.description]
        rows = conn.execute(f"SELECT * FROM {table}").fetchall()  # noqa: S608
        return [dict(zip(cols, row)) for row in rows]

    conn = db()
    try:
        with _zipfile.ZipFile(zip_path, "w", compression=_zipfile.ZIP_DEFLATED) as zf:

            # --- characters.json ---
            zf.writestr(
                "characters.json",
                json.dumps(_table_to_dicts(conn, "characters"), indent=2, default=str),
            )

            # --- sessions.json ---
            zf.writestr(
                "sessions.json",
                json.dumps(_table_to_dicts(conn, "sessions"), indent=2, default=str),
            )

            # --- messages.json ---
            zf.writestr(
                "messages.json",
                json.dumps(_table_to_dicts(conn, "messages"), indent=2, default=str),
            )

            # --- config.json ---
            cfg_data = load_config()
            zf.writestr("config.json", json.dumps(cfg_data, indent=2, default=str))

            # --- vocabulary.json (via VocabManager if loaded) ---
            try:
                if vocab_manager and vocab_manager._loaded:
                    vocab_data = vocab_manager.export_user_vocab()
                    zf.writestr("vocabulary.json", json.dumps(vocab_data, indent=2, default=str))
                else:
                    zf.writestr("vocabulary.json", json.dumps([], indent=2))
            except Exception as _ve:
                logger.warning("[Export] Vocab export skipped: %s", _ve)
                zf.writestr("vocabulary.json", json.dumps([]))

            # --- memories.json (via vector_store if available) ---
            try:
                if vector_store is not None:
                    mem_result = vector_store.list_memories(page=0, size=10000)
                    memories_data = mem_result.get("memories", [])
                    zf.writestr("memories.json", json.dumps(memories_data, indent=2, default=str))
                else:
                    zf.writestr("memories.json", json.dumps([]))
            except Exception as _me:
                logger.warning("[Export] Memory export skipped: %s", _me)
                zf.writestr("memories.json", json.dumps([]))

    except Exception as _exc:
        logger.error("[Export] Data export failed: %s", _exc)
        try:
            _os.unlink(zip_path)
        except OSError:
            pass
        raise HTTPException(status_code=500, detail="Data export failed")
    finally:
        conn.close()

    def _cleanup_zip(path: str) -> None:
        """Remove the temporary ZIP file after the response has been sent.

        Args:
            path: Absolute filesystem path to the ZIP file to delete.
        """
        try:
            _os.unlink(path)
        except OSError as _e:
            logger.warning("[Export] Failed to clean up temp ZIP %s: %s", path, _e)

    # BackgroundTasks must be returned via FileResponse's background parameter
    from starlette.background import BackgroundTask as _BackgroundTask
    return _FileResponse(
        zip_path,
        media_type="application/zip",
        filename=zip_filename,
        background=_BackgroundTask(_cleanup_zip, zip_path),
    )


# ---------------------------------------------------------------------------
# Feature #17 — Model Arena
# ---------------------------------------------------------------------------

@app.post("/api/arena/compare")
async def arena_compare(req: Request):
    """Run the same prompt through 2–3 LLM configurations and return side-by-side results.

    Sends the prompt sequentially to each config (not parallel, because LM Studio
    can only serve one model at a time).  Individual failures are captured per-config
    and do not abort the remaining runs.

    Args:
        req: JSON body with the following shape::

            {
                "prompt": "What is the meaning of life?",
                "configs": [
                    {
                        "label":       "Config A",
                        "model":       "lmstudio/...",
                        "temperature": 0.7,
                        "max_tokens":  200
                    },
                    {
                        "label":       "Config B",
                        "model":       "lmstudio/...",
                        "temperature": 1.2,
                        "max_tokens":  200
                    }
                ],
                "char_id": null
            }

    Returns:
        JSON ``{"results": [...]}`` where each result is either::

            {"label": "Config A", "text": "...", "elapsed_ms": 1234, "tokens": 45}

        on success, or::

            {"label": "Config A", "error": "Connection failed"}

        on per-config failure.

    Raises:
        HTTPException 400: If prompt is empty or configs count is outside 2–3.

    Example:
        >>> # POST /api/arena/compare
        >>> # Body: {"prompt": "Hello", "configs": [{"label": "A", ...}, {"label": "B", ...}]}
        >>> # Returns: {"results": [{"label": "A", "text": "...", "elapsed_ms": 412, "tokens": 20}, ...]}
    """
    import time as _time

    body = await req.json()
    prompt: str = (body.get("prompt") or "").strip()
    configs: list = body.get("configs") or []

    if not prompt:
        raise HTTPException(400, "prompt must not be empty")
    if not (2 <= len(configs) <= 3):
        raise HTTPException(400, "configs must contain 2 or 3 entries")

    cfg = load_config() or {}
    results = []

    for arena_cfg in configs:
        label = str(arena_cfg.get("label") or "Config").strip()
        model = str(arena_cfg.get("model") or cfg.get("llm", {}).get("model", "")).strip()
        temperature = float(arena_cfg.get("temperature") or cfg.get("temperature", 0.7))
        max_tokens = int(arena_cfg.get("max_tokens") or 200)

        # Clamp to reasonable bounds to prevent runaway requests.
        temperature = max(0.0, min(2.0, temperature))
        max_tokens = max(1, min(4096, max_tokens))

        endpoint = _get_llm_endpoint(cfg)
        api_key = cfg.get("llm", {}).get("api_key", "")

        messages = [{"role": "user", "content": prompt}]

        t0 = _time.perf_counter()
        try:
            from backend.llm.registry import get_client
            adapter = get_client(cfg)
            res = await run_in_threadpool(
                adapter.chat,
                messages,
                model,
                endpoint,
                api_key,
                temperature=temperature,
                max_tokens=max_tokens,
            )

            elapsed_ms = int((_time.perf_counter() - t0) * 1000)

            if res.get("ok"):
                reply_text: str = res.get("reply", "")
                # Token count: prefer usage data from the raw response, else word-count estimate.
                raw = res.get("raw") or {}
                usage = raw.get("usage") or {}
                token_count = int(
                    usage.get("completion_tokens")
                    or usage.get("output_tokens")
                    or max(1, len(reply_text.split()))
                )
                results.append({
                    "label": label,
                    "text": reply_text,
                    "elapsed_ms": elapsed_ms,
                    "tokens": token_count,
                })
            else:
                error_msg = res.get("error") or "LLM adapter returned no result"
                logger.warning("arena_compare config '%s' failed: %s", label, error_msg)
                results.append({"label": label, "error": error_msg})

        except Exception as exc:
            elapsed_ms = int((_time.perf_counter() - t0) * 1000)
            logger.warning("arena_compare config '%s' raised: %s", label, exc)
            results.append({"label": label, "error": str(exc)})

    return {"results": results}


# ── Universe Builder (#23) ─────────────────────────────────────────────────────

@app.get("/api/universes")
async def list_universes():
    """Return all universes with character counts.

    Queries the ``universes`` table joined against ``characters`` to produce a
    count of members per universe.  Results are sorted alphabetically by name.

    Returns:
        List of universe dicts, each containing:
            - ``id`` (int): Universe primary key.
            - ``name`` (str): Display name.
            - ``lore`` (str): Lore document text.
            - ``created_at`` (str): ISO datetime of creation.
            - ``character_count`` (int): Number of characters assigned.

    Example:
        >>> GET /api/universes
        [{"id": 1, "name": "Sakura Academy", "lore": "...", "character_count": 3}]
    """
    conn = db()
    try:
        rows = conn.execute("""
            SELECT u.id, u.name, u.lore, u.created_at,
                   COUNT(c.id) AS character_count
            FROM universes u
            LEFT JOIN characters c ON c.universe_id = u.id
            GROUP BY u.id
            ORDER BY u.name
        """).fetchall()
        return [
            {
                "id": r[0],
                "name": r[1],
                "lore": r[2] or "",
                "created_at": r[3],
                "character_count": r[4],
            }
            for r in rows
        ]
    finally:
        conn.close()


@app.post("/api/universes")
async def create_universe(req: Request):
    """Create a new universe.

    Args:
        req: JSON body with:
            - ``name`` (str, required): Universe display name. Must be non-empty.
            - ``lore`` (str, optional): Lore document injected into member
              characters' system prompts. Defaults to empty string.

    Returns:
        {"id": int, "name": str, "lore": str}

    Raises:
        HTTPException 400: If ``name`` is missing or blank.

    Example:
        >>> POST /api/universes {"name": "Sakura Academy", "lore": "..."}
        {"id": 1, "name": "Sakura Academy", "lore": "..."}
    """
    body = await req.json()
    name = (body.get("name") or "").strip()
    if not name:
        raise HTTPException(400, "name required")
    lore = (body.get("lore") or "").strip()
    conn = db()
    try:
        cur = conn.execute(
            "INSERT INTO universes (name, lore) VALUES (?, ?)", (name, lore)
        )
        conn.commit()
        return {"id": cur.lastrowid, "name": name, "lore": lore}
    finally:
        conn.close()


@app.put("/api/universes/{universe_id}")
async def update_universe(universe_id: int, req: Request):
    """Update a universe's name and/or lore.

    Args:
        universe_id: Primary key of the universe to update.
        req: JSON body with:
            - ``name`` (str): New display name. Stripped of whitespace.
            - ``lore`` (str, optional): New lore document text.

    Returns:
        {"ok": True}

    Raises:
        HTTPException 404: If no universe with that ID exists.

    Example:
        >>> PUT /api/universes/1 {"name": "Renamed", "lore": "New lore text"}
        {"ok": true}
    """
    body = await req.json()
    conn = db()
    try:
        row = conn.execute(
            "SELECT id FROM universes WHERE id = ?", (universe_id,)
        ).fetchone()
        if not row:
            raise HTTPException(404, "Universe not found")
        name = (body.get("name") or "").strip()
        lore = body.get("lore", "")
        conn.execute(
            "UPDATE universes SET name=?, lore=? WHERE id=?",
            (name, lore, universe_id),
        )
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()


@app.delete("/api/universes/{universe_id}")
async def delete_universe(universe_id: int):
    """Delete a universe.

    Characters that belong to this universe have their ``universe_id`` set to
    NULL (orphaned), so they continue to function without lore injection.

    Args:
        universe_id: Primary key of the universe to delete.

    Returns:
        {"ok": True}

    Example:
        >>> DELETE /api/universes/1
        {"ok": true}
    """
    conn = db()
    try:
        # Null-out FK before deleting the parent row (SQLite ALTER TABLE does not
        # support ON DELETE SET NULL for columns added via ALTER TABLE).
        conn.execute(
            "UPDATE characters SET universe_id=NULL WHERE universe_id=?",
            (universe_id,),
        )
        conn.execute("DELETE FROM universes WHERE id=?", (universe_id,))
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()


@app.post("/api/universes/{universe_id}/characters/{char_id}")
async def assign_character_to_universe(universe_id: int, char_id: int):
    """Assign a character to a universe.

    Overwrites any previous universe membership.  Both the universe and the
    character must exist; no error is raised if the character was already in
    this universe (idempotent).

    Args:
        universe_id: Primary key of the target universe.
        char_id: Primary key of the character to assign.

    Returns:
        {"ok": True}

    Raises:
        HTTPException 404: If the universe does not exist.

    Example:
        >>> POST /api/universes/1/characters/3
        {"ok": true}
    """
    conn = db()
    try:
        row = conn.execute(
            "SELECT id FROM universes WHERE id = ?", (universe_id,)
        ).fetchone()
        if not row:
            raise HTTPException(404, "Universe not found")
        conn.execute(
            "UPDATE characters SET universe_id=? WHERE id=?",
            (universe_id, char_id),
        )
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()


@app.delete("/api/universes/characters/{char_id}")
async def remove_character_from_universe(char_id: int):
    """Remove a character from their universe (set universe_id to NULL).

    Safe to call even if the character is not currently in any universe.

    Args:
        char_id: Primary key of the character to remove.

    Returns:
        {"ok": True}

    Example:
        >>> DELETE /api/universes/characters/3
        {"ok": true}
    """
    conn = db()
    try:
        conn.execute(
            "UPDATE characters SET universe_id=NULL WHERE id=?", (char_id,)
        )
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()


# --- MINI GAMES (Feature A2) ---

@app.post("/api/games/start")
async def start_game(body: dict):
    """Start a new mini-game session for the active character.

    Creates a ``game_sessions`` row in the DB and initialises game state.
    For trivia, questions are generated via LLM (with fallback).
    For 20 questions, the LLM secretly picks a thing.

    Args:
        body: JSON object with:
            ``game_type`` (str): "trivia" | "twenty_questions"
            ``character_id`` (int): Character playing the game.
            ``topic`` (str, optional): Topic/category hint.

    Returns:
        ``{"session_id": int, "state": dict}`` — the game session ID and
        initial public state.  For trivia the first question is included.
        For 20 questions, ``thing`` is masked as "???".

    Example:
        >>> POST /api/games/start
        {"game_type": "trivia", "character_id": 1, "topic": "anime"}
    """
    game_type = body.get("game_type", "trivia")
    character_id = body.get("character_id")
    topic = body.get("topic", "general knowledge")

    _ALL_GAME_TYPES = (
        "trivia", "twenty_questions", "hangman", "word_association",
        "riddles", "tictactoe", "memory_match",
    )

    if not character_id:
        return JSONResponse({"error": "character_id required"}, status_code=400)
    if game_type not in _ALL_GAME_TYPES:
        return JSONResponse({"error": f"unsupported game_type. Choose from: {_ALL_GAME_TYPES}"}, status_code=400)

    cfg = load_config() or {}
    from backend.llm.registry import get_client
    adapter = get_client(cfg)

    # Build initial game state per game type
    if game_type == "trivia":
        questions = trivia_engine.generate_questions(topic, adapter, cfg)
        state = trivia_engine.new_state(topic, questions)
        public = dict(state)
        public["current_question"] = trivia_engine.current_question(state)

    elif game_type == "twenty_questions":
        thing, category = tq_engine.choose_thing(topic, adapter, cfg)
        state = tq_engine.new_state(topic, thing, category)
        public = tq_engine.public_state(state)

    elif game_type == "hangman":
        word, cat = hangman_engine.choose_word(topic, adapter, cfg)
        state = hangman_engine.new_state(word, cat)
        public = hangman_engine.public_state(state)

    elif game_type == "word_association":
        state = wa_engine.new_state(topic)
        public = dict(state)

    elif game_type == "riddles":
        difficulty = body.get("difficulty", "medium")
        riddle_data = riddles_engine.generate_riddle(difficulty, adapter, cfg)
        state = riddles_engine.new_state(riddle_data, difficulty)
        public = riddles_engine.public_state(state)

    elif game_type == "tictactoe":
        difficulty = body.get("difficulty", "hard")
        state = ttt_engine.new_state(difficulty)
        public = dict(state)

    else:  # memory_match
        pairs = int(body.get("pairs", 8))
        theme = body.get("theme", "nature")
        state = mm_engine.new_state(pairs, theme)
        public = mm_engine.public_state(state)

    conn = db()
    try:
        cur = conn.execute(
            "INSERT INTO game_sessions (character_id, game_type, game_state) VALUES (?, ?, ?)",
            (character_id, game_type, json.dumps(state)),
        )
        conn.commit()
        session_id = cur.lastrowid
    finally:
        conn.close()

    return {"session_id": session_id, "state": public}


@app.post("/api/games/{session_id}/move")
async def game_move(session_id: int, body: dict):
    """Submit a move in an active game session.

    For **trivia**: ``{"choice": 0}`` — 0-based option index.
    For **20 questions**: ``{"question": "Is it alive?"}`` for a yes/no
    question, or ``{"guess": "Totoro"}`` for a final guess.

    The response includes the updated public state plus an ``event`` key
    describing what happened ("correct", "wrong", "answered", "won", "lost",
    "guess_wrong").

    Args:
        session_id: ``game_sessions.id``
        body: Move payload (see above).

    Returns:
        ``{"event": str, "state": dict, "reaction": str | None}``

    Example:
        >>> POST /api/games/3/move
        {"choice": 2}
    """
    conn = db()
    try:
        row = conn.execute(
            "SELECT game_type, game_state, character_id FROM game_sessions WHERE id=?",
            (session_id,),
        ).fetchone()
        if not row:
            return JSONResponse({"error": "session not found"}, status_code=404)

        game_type, state_json, character_id = row
        state = json.loads(state_json)

        if state.get("finished"):
            return JSONResponse({"error": "game already finished"}, status_code=400)

        cfg = load_config() or {}
        from backend.llm.registry import get_client
        adapter = get_client(cfg)
        event = "unknown"
        reaction = None

        if game_type == "trivia":
            choice = body.get("choice")
            if choice is None:
                return JSONResponse({"error": "choice required"}, status_code=400)
            state = trivia_engine.answer_question(state, int(choice))
            event = "correct" if state["last_correct"] else "wrong"
            public = dict(state)
            if not state["finished"]:
                public["current_question"] = trivia_engine.current_question(state)

        elif game_type == "twenty_questions":
            if "guess" in body:
                state = tq_engine.process_guess(state, body["guess"], adapter, cfg)
                event = "won" if state["won"] else "guess_wrong"
                reaction = state.get("reveal")
            elif "question" in body:
                answer = tq_engine.answer_question(state, body["question"], adapter, cfg)
                event = "answered"
                reaction = answer
                if state.get("finished"):
                    event = "lost"
                    reaction = state.get("reveal", reaction)
            else:
                return JSONResponse({"error": "question or guess required"}, status_code=400)
            public = tq_engine.public_state(state)

        elif game_type == "hangman":
            letter = str(body.get("letter", "")).strip()
            if not letter:
                return JSONResponse({"error": "letter required"}, status_code=400)
            state = hangman_engine.guess_letter(state, letter, adapter, cfg)
            event = "hit" if state.get("hit") else "miss"
            if state.get("finished"):
                event = "won" if state["won"] else "lost"
                reaction = state.get("reveal")
            public = hangman_engine.public_state(state)

        elif game_type == "word_association":
            if "word" in body:
                # Player submits a word
                state = wa_engine.player_word(state, body["word"])
                if state["finished"]:
                    state = wa_engine.end_game(state, adapter, cfg)
                    event = "won" if state["won"] else "lost"
                    reaction = state.get("reaction")
                else:
                    # AI responds immediately
                    ai_resp = wa_engine.ai_word(state, adapter, cfg)
                    event = "ai_word" if not state["finished"] else ("won" if state["won"] else "lost")
                    reaction = ai_resp
                    if state["finished"]:
                        state = wa_engine.end_game(state, adapter, cfg)
                        reaction = state.get("reaction", ai_resp)
            elif body.get("action") == "end":
                state = wa_engine.end_game(state, adapter, cfg)
                event = "ended"
                reaction = state.get("reaction")
            else:
                return JSONResponse({"error": "word or action:end required"}, status_code=400)
            public = dict(state)

        elif game_type == "riddles":
            if "guess" in body:
                state = riddles_engine.submit_guess(state, body["guess"], adapter, cfg)
                event = "correct" if state.get("correct") else "wrong"
                if state["finished"]:
                    event = "won" if state["won"] else "lost"
                    reaction = state.get("reveal")
            elif body.get("action") == "hint":
                hint = riddles_engine.take_hint(state)
                event = "hint"
                reaction = hint or "No more hints available!"
            else:
                return JSONResponse({"error": "guess or action:hint required"}, status_code=400)
            public = riddles_engine.public_state(state)

        elif game_type == "tictactoe":
            cell = body.get("cell")
            if cell is None:
                return JSONResponse({"error": "cell (0-8) required"}, status_code=400)
            state = ttt_engine.player_move(state, int(cell), adapter, cfg)
            if state["finished"]:
                winner = state.get("winner")
                event = "won" if winner == "X" else ("lost" if winner == "O" else "draw")
                reaction = state.get("reaction")
            else:
                event = "moved"
            public = dict(state)

        elif game_type == "memory_match":
            card_index = body.get("card_index")
            if card_index is None:
                return JSONResponse({"error": "card_index required"}, status_code=400)
            state = mm_engine.flip_card(state, int(card_index), adapter, cfg)
            event = "matched" if state.get("matched") else "flipped"
            if state["finished"]:
                event = "won"
                reaction = state.get("reaction")
            public = mm_engine.public_state(state)

        else:
            return JSONResponse({"error": "unknown game_type"}, status_code=400)

        # Persist updated state + final scores
        result_val = None
        if state.get("finished"):
            won = state.get("won")
            result_val = "win" if won else ("loss" if won is False else "draw")
            # Score/max by game type
            if game_type == "trivia":
                _score, _max = state.get("score", 0), trivia_engine.ROUNDS
            elif game_type == "twenty_questions":
                _score, _max = (1 if state.get("won") else 0), 1
            elif game_type == "hangman":
                wrong = len(state.get("wrong", []))
                _score = max(0, state.get("max_wrong", 6) - wrong)
                _max = state.get("max_wrong", 6)
            elif game_type == "word_association":
                _score = state.get("score", 0)
                _max = state.get("max_length", 30)
            elif game_type == "riddles":
                hints_used = state.get("hints_used", 0)
                _score = max(0, 3 - hints_used) if state.get("won") else 0
                _max = 3
            elif game_type == "tictactoe":
                _score = 1 if state.get("winner") == "X" else 0
                _max = 1
            else:  # memory_match
                _score = state.get("pairs_found", 0)
                _max = state.get("size", 8)
            conn.execute(
                "UPDATE game_sessions SET game_state=?, result=?, score=?, max_score=? WHERE id=?",
                (json.dumps(state), result_val, _score, _max, session_id),
            )
        else:
            conn.execute(
                "UPDATE game_sessions SET game_state=? WHERE id=?",
                (json.dumps(state), session_id),
            )
        conn.commit()

        return {"event": event, "state": public, "reaction": reaction}
    finally:
        conn.close()


@app.get("/api/games/history")
async def game_history(character_id: int, limit: int = 20):
    """Return recent game history for a character.

    Args:
        character_id: Character to fetch history for.
        limit: Maximum number of records to return (default 20).

    Returns:
        ``{"games": [...]}`` — list of game session summaries sorted by
        most recent first.

    Example:
        >>> GET /api/games/history?character_id=1
        {"games": [{"id": 5, "game_type": "trivia", "result": "win", ...}]}
    """
    conn = db()
    try:
        rows = conn.execute(
            """
            SELECT id, game_type, result, score, max_score,
                   duration_seconds, played_at
            FROM game_sessions
            WHERE character_id = ?
            ORDER BY played_at DESC
            LIMIT ?
            """,
            (character_id, limit),
        ).fetchall()
        games = [
            {
                "id": r[0],
                "game_type": r[1],
                "result": r[2],
                "score": r[3],
                "max_score": r[4],
                "duration_seconds": r[5],
                "played_at": r[6],
            }
            for r in rows
        ]
        return {"games": games}
    finally:
        conn.close()


@app.get("/api/games/{session_id}/state")
async def get_game_state(session_id: int):
    """Return the current public state of a game session.

    The ``thing`` field is masked for 20 questions games while they are
    still in progress.

    Args:
        session_id: ``game_sessions.id``

    Returns:
        ``{"game_type": str, "state": dict}``

    Example:
        >>> GET /api/games/3/state
        {"game_type": "trivia", "state": {...}}
    """
    conn = db()
    try:
        row = conn.execute(
            "SELECT game_type, game_state FROM game_sessions WHERE id=?",
            (session_id,),
        ).fetchone()
        if not row:
            return JSONResponse({"error": "session not found"}, status_code=404)
        game_type, state_json = row
        state = json.loads(state_json)
        if game_type == "twenty_questions" and not state.get("finished"):
            state = tq_engine.public_state(state)
        elif game_type == "trivia":
            state["current_question"] = trivia_engine.current_question(state)
        elif game_type == "hangman" and not state.get("finished"):
            state = hangman_engine.public_state(state)
        elif game_type == "riddles":
            state = riddles_engine.public_state(state)
        elif game_type == "memory_match" and not state.get("finished"):
            state = mm_engine.public_state(state)
        return {"game_type": game_type, "state": state}
    finally:
        conn.close()


@app.get("/api/games/best-scores")
async def game_best_scores(character_id: int):
    """Return the personal best score for each game type for a character.

    A "best score" is the highest ``score / max_score`` ratio (as a float
    0.0–1.0) achieved in a completed winning session for each game type.
    Also returns total plays and wins per game type.

    Args:
        character_id: Character to query.

    Returns:
        ``{"best_scores": {game_type: {"best": float, "plays": int, "wins": int}}}``

    Example:
        >>> GET /api/games/best-scores?character_id=1
        {"best_scores": {"trivia": {"best": 0.9, "plays": 5, "wins": 3}}}
    """
    conn = db()
    try:
        rows = conn.execute(
            """
            SELECT game_type,
                   COUNT(*) as plays,
                   SUM(CASE WHEN result='win' THEN 1 ELSE 0 END) as wins,
                   MAX(CASE WHEN result='win' AND max_score > 0
                            THEN CAST(score AS REAL) / max_score
                            ELSE 0.0 END) as best_ratio
            FROM game_sessions
            WHERE character_id = ?
            GROUP BY game_type
            """,
            (character_id,),
        ).fetchall()
        best = {
            r[0]: {"best": round(r[3] or 0.0, 3), "plays": r[1], "wins": r[2]}
            for r in rows
        }
        return {"best_scores": best}
    finally:
        conn.close()


# --- EXCEPTION HANDLERS ---
@app.exception_handler(Exception)
async def generic_exception_handler(request, exc):
    logger.error(f"Global Error: {exc}", exc_info=True)
    return JSONResponse(status_code=500, content={"ok": False, "error": str(exc)})

if __name__ == "__main__":
    import argparse
    import uvicorn

    parser = argparse.ArgumentParser(description="Waifu-RT3D Backend Server")
    parser.add_argument("--dev", action="store_true",
                        help="Enable dev mode (disables browser caching for JS/CSS/HTML)")
    parser.add_argument("--port", type=int, default=None,
                        help="Force a specific port (default: auto-scan 8080-8090)")
    args = parser.parse_args()

    # Store dev mode flag on app state so middleware can read it
    app.state.dev_mode = args.dev or bool(os.environ.get("WAIFU_DEV"))
    if app.state.dev_mode:
        logger.info("Dev mode enabled — browser caching disabled for static assets")

    # Smart Port Scan (or fixed port if specified)
    ports = [args.port] if args.port else range(8080, 8091)
    for port in ports:
        try:
            logger.info(f"Attempting to bind to port {port}...")
            uvicorn.run(app, host="0.0.0.0", port=port)
            break
        except OSError:
            logger.warning(f"Port {port} busy, trying next...")
