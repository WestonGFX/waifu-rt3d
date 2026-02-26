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
        try:
            from backend.memory.vector_store import VectorStore
            vector_store = VectorStore(storage_path=str(STORAGE / "memory"))
            logger.debug("Vector Store Initialized")
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

    yield

    # Shutdown: nothing to clean up currently
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


# Root route — serve the frontend
@app.get("/", response_class=HTMLResponse)
def index():
    target = str(os.environ.get(DEFAULT_FRONTEND_ENV, "neon")).strip().lower()
    if target == "v2":
        index_file = FRONTEND_V2_DIST / "index.html"
        if index_file.exists():
            return index_file.read_text(encoding="utf-8")
        logger.warning(
            "Requested default frontend=v2 but dist is missing; falling back to neon at /"
        )
    return (FRONTEND / "index.html").read_text(encoding="utf-8")


@app.get("/legacy", response_class=HTMLResponse)
def legacy_index():
    return (FRONTEND / "index.html").read_text(encoding="utf-8")


@app.get("/sakura")
@app.get("/sakura/{full_path:path}")
async def sakura_frontend(full_path: str = ""):
    """Serve the Sakura React frontend (SPA fallback)."""
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
    """Apply subtle rate/pitch adjustments to ``tts_cfg`` based on detected emotion (#78).

    Modifies *tts_cfg* in-place only when the character has **not** already set
    explicit ``tts_rate`` / ``tts_pitch`` overrides via their character row.
    Adjustments are intentionally subtle so they complement rather than override
    the voice actor's natural delivery.

    Args:
        tts_cfg: TTS configuration dict (will be mutated if adjustments apply).
        emotion:  Emotion string from ``_parse_emotion_gesture``, e.g. ``"happy"``.
                  Pass ``None`` or ``"neutral"`` to leave ``tts_cfg`` unchanged.

    Example:
        >>> cfg = {}
        >>> _apply_emotion_tts(cfg, "excited")
        >>> cfg
        {'tts_rate': '+12%', 'tts_pitch': '+2Hz'}
    """
    if not emotion or emotion == "neutral":
        return

    # Map emotion → (rate_delta_pct, pitch_delta_hz)
    # Values are intentionally small — these accent the voice, not transform it.
    _EMOTION_TTS_MAP: dict[str, tuple[int, int]] = {
        "happy":       (+8,  +1),
        "excited":     (+12, +2),
        "sad":         (-12, -2),
        "scared":      (-5,  -1),
        "embarrassed": (-4,   0),
        "shy":         (-4,   0),
        "angry":       (+6,  +1),
        "thinking":    (-4,   0),
        "surprised":   (+5,  +1),
    }
    rate_pct, pitch_hz = _EMOTION_TTS_MAP.get(emotion, (0, 0))

    if rate_pct != 0 and 'tts_rate' not in tts_cfg:
        tts_cfg['tts_rate'] = f"+{rate_pct}%" if rate_pct >= 0 else f"{rate_pct}%"
    if pitch_hz != 0 and 'tts_pitch' not in tts_cfg:
        tts_cfg['tts_pitch'] = f"+{pitch_hz}Hz" if pitch_hz >= 0 else f"{pitch_hz}Hz"


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

    # 1. Base system prompt
    if system_prompt:
        sections.append(_section("System Prompt", system_prompt))

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

    # 8. Content filter
    filter_text = _get_content_filter_injection(cfg.get("content_filter_level", 1))
    if filter_text:
        sections.append(_section("Content Filter", filter_text))

    return sections


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
        try:
            cur.execute(
                "SELECT system_prompt, voice_id, tts_provider, tts_pitch, tts_rate, "
                "llm_endpoint, llm_model, llm_temperature, last_chat_date, last_emotion, first_chat_date, "
                "diary, diary_date, capability_profile "
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

        # Build prompt sections via shared helper (diary, greeting, anniversary, RAG, emotion, filter)
        sections = _build_prompt_sections(
            cfg, system_prompt, char_id, session_id, cur,
            user_text=text,
            diary=char_diary,
            diary_date=char_diary_date,
            last_chat_date=char_last_chat_date,
            last_emotion=char_last_emotion,
            first_chat_date=char_first_chat_date,
            include_vocab=False,  # Non-streaming route historically excludes vocab
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
        try:
            cur.execute(
                "SELECT system_prompt, last_chat_date, last_emotion, first_chat_date, diary, diary_date "
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
    try:
        cur.execute(
            "SELECT system_prompt, llm_endpoint, llm_model, llm_temperature, last_chat_date, last_emotion, "
            "voice_id, tts_provider, tts_pitch, tts_rate, first_chat_date, diary, diary_date, "
            "capability_profile, name "
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

    # Build prompt sections via shared helper (diary, greeting, anniversary, RAG, vocab, emotion, filter)
    sections = _build_prompt_sections(
        cfg, system_prompt, char_id, session_id, cur,
        user_text=text,
        diary=_stream_diary,
        diary_date=_stream_diary_date,
        last_chat_date=stream_char_last_chat_date,
        last_emotion=stream_char_last_emotion,
        first_chat_date=stream_char_first_chat_date,
        include_vocab=True,
    )
    system_content = "".join(s["content"] for s in sections)
    _is_daily_first = any(s["name"] == "Daily Greeting" for s in sections)

    # Extract RAG memory hits for the response payload
    memories = []
    if vector_store:
        memories = vector_store.query_memory(text, char_id=char_id)

    # Emotional TTS hint for chunked TTS (#78): emotion won't be known until after streaming,
    # so use last_emotion (previous response's mood) as a continuity-based proxy.
    if use_chunked_tts:
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
                    max_tokens=_cap_max_tokens,
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
                yield f"event: done\ndata: {json.dumps(done_data)}\n\n"

                _fire_webhooks({
                    "character": stream_char_name if stream_char_name else "",
                    "reply": clean_reply,
                    "emotion": emotion,
                    "session_id": session_id,
                })

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
                yield f"event: done\ndata: {json.dumps(done_data)}\n\n"

                # Fire outbound webhooks (#62) — non-blocking background threads
                _fire_webhooks({
                    "character": stream_char_name if stream_char_name else "",
                    "reply": clean_reply,
                    "emotion": emotion,
                    "session_id": session_id,
                })

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
    """List all chat sessions with pin/archive status.

    Args:
        archived: If True, return archived sessions. If False (default), return active sessions.
        search: Optional search string to filter sessions by title.

    Returns:
        {"sessions": [{id, title, created_ts, message_count, is_pinned, is_archived, last_message_ts}]}
    """
    conn = db()
    cur = conn.cursor()

    try:
        # Full query with pin/archive support — pinned first, then by most recent activity
        base_sql = """
            SELECT s.id, s.title, s.created_ts,
                   (SELECT COUNT(id) FROM messages WHERE session_id=s.id) as msg_count,
                   COALESCE(s.is_pinned, 0) as is_pinned,
                   COALESCE(s.is_archived, 0) as is_archived,
                   (SELECT MAX(ts) FROM messages WHERE session_id=s.id) as last_msg_ts
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
        # Fallback for older schema without is_pinned/is_archived
        cur.execute("""
            SELECT s.id, s.title, s.created_ts,
                   (SELECT COUNT(id) FROM messages WHERE session_id=s.id),
                   0, 0, NULL
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
                             token_count, input_token_count, generation_time_ms, tokens_per_second}, ...]}
    """
    conn = db()
    cur = conn.cursor()
    try:
        cols = ("id, role, text, ts, parent_id, is_active, emotion, char_id, "
                "token_count, input_token_count, generation_time_ms, tokens_per_second")
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
                   tts_pitch, tts_rate, vocab_categories, animation_profile
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
        }
        characters.append(char)
    conn.close()
    return {"characters": characters}

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

    # All optional fields — mirrors the PUT endpoint's field list
    fields = {
        "avatar_url": body.get("avatar_url", ""),
        "avatar_2d_url": body.get("avatar_2d_url", ""),
        "vrm_model_url": body.get("vrm_model_url", ""),
        "voice_id": body.get("voice_id", ""),
        "tts_provider": body.get("tts_provider", ""),
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
    ]
    _json_fields = {"capability_profile", "voice_config", "vocab_categories", "animation_profile"}
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


@app.post("/api/characters/import")
async def import_character(req: Request):
    """Import a character from a JSON export package.

    Creates a new character from the provided data. Internal fields
    like ``id`` and ``_export_*`` metadata are stripped.

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

    # Strip export metadata
    for key in ['_export_version', '_exported_at', 'id']:
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
        ]
        # JSON-encode dict/list fields before INSERT
        for jf in ('voice_config', 'capability_profile', 'vocab_categories', 'animation_profile'):
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

        # Find the currently configured model
        configured_model = cfg.get("llm", {}).get("model", "")
        active_model = None
        for m in models:
            model_id = m.get("id", "")
            if configured_model and (configured_model in model_id or model_id in configured_model):
                active_model = m
                break

        # If no exact match, use the first loaded model
        if not active_model and models:
            active_model = models[0]

        return {"ok": True, "models": models, "active_model": active_model}

    except Exception as e:
        logger.warning(f"Could not query LM Studio models: {e}")
        return {"ok": False, "error": str(e), "models": []}

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
