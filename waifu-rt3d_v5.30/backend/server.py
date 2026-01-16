import logging
import logging.handlers
import queue
import psutil
import os
import sys
import json
import sqlite3
import requests
import asyncio
import time
from datetime import datetime
from pathlib import Path
from dotenv import load_dotenv

from fastapi import FastAPI, UploadFile, File, HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from starlette.staticfiles import StaticFiles

# --- CONFIGURATION & PATHS ---
ROOT = Path(__file__).resolve().parents[1]
VERSION_FILE = ROOT / "VERSION"
VERSION = VERSION_FILE.read_text().strip() if VERSION_FILE.exists() else "5.30.0"
FRONTEND = ROOT / "frontend"
STORAGE = ROOT / "backend" / "storage"
DEBUG_LOG = ROOT / "debug.log"
CONFIG_FILE = ROOT / "backend" / "config" / "app.json"
DB_PATH = STORAGE / "app.db"

# Ensure storage exists
STORAGE.mkdir(parents=True, exist_ok=True)
(STORAGE / "avatars").mkdir(exist_ok=True)
(STORAGE / "audio").mkdir(exist_ok=True)

# Load Environment Variables
load_dotenv(ROOT / ".env")

# --- LOGGING SETUP ---
LOG_QUEUE = queue.Queue(maxsize=100)

class UIHandler(logging.Handler):
    def emit(self, record):
        msg = self.format(record)
        if LOG_QUEUE.full():
            try: LOG_QUEUE.get_nowait()
            except: pass
        LOG_QUEUE.put_nowait(msg)

logger = logging.getLogger("waifu")
logger.setLevel(logging.DEBUG)

# File Handler
file_handler = logging.handlers.RotatingFileHandler(DEBUG_LOG, maxBytes=1_000_000, backupCount=3)
file_handler.setFormatter(logging.Formatter('%(asctime)s [%(levelname)s] %(message)s'))
logger.addHandler(file_handler)

# UI Handler
ui_handler = UIHandler()
ui_handler.setFormatter(logging.Formatter('> %(message)s'))
logger.addHandler(ui_handler)

# Console Handler
console = logging.StreamHandler()
console.setFormatter(logging.Formatter('\033[94m%(levelname)s\033[0m: %(message)s'))
logger.addHandler(console)

logger.info(f"--- WAIFU_LINK BOOT SEQUENCE v{VERSION} ---")

# --- APP INITIALIZATION ---
app = FastAPI(title="Waifu-RT3D", version=VERSION)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- GLOBAL STATE ---
_llm_status = {"ok": False, "error": "Not Checked", "models": [], "last_check": 0}
model_manager = None
_sentiment_analyzer = None

# --- UTILITIES ---
DEFAULT_CONFIG = {
    "onboarded": False,
    "llm": {
        "provider": "local",
        "endpoint": "http://127.0.0.1:1234/v1",
        "model": "",
        "api_key": "lm-studio",
        "history_limit": 20
    },
    "tts": {
        "enabled": True,
        "provider": "local",
        "voice_id": "fox_v1",
        "auto_speak": True
    }
}

def resolve_env_vars(cfg):
    """Recursively resolve 'env:VAR_NAME' strings in config."""
    if isinstance(cfg, dict):
        return {k: resolve_env_vars(v) for k, v in cfg.items()}
    elif isinstance(cfg, list):
        return [resolve_env_vars(i) for i in cfg]
    elif isinstance(cfg, str) and cfg.startswith("env:"):
        env_key = cfg.split(":", 1)[1]
        return os.getenv(env_key, "") 
    return cfg

def load_config():
    cfg = DEFAULT_CONFIG.copy()
    if CONFIG_FILE.exists():
        try:
            saved = json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
            # Simple merge
            for k, v in saved.items():
                if isinstance(v, dict) and k in cfg:
                    cfg[k].update(v)
                else:
                    cfg[k] = v
        except Exception as e:
            logger.error(f"Config load error: {e}")
    return resolve_env_vars(cfg)

def save_config(cfg):
    CONFIG_FILE.parent.mkdir(parents=True, exist_ok=True)
    CONFIG_FILE.write_text(json.dumps(cfg, indent=2), encoding="utf-8")

def db():
    return sqlite3.connect(DB_PATH)

def get_sentiment_analyzer():
    global _sentiment_analyzer
    if _sentiment_analyzer is None:
        try:
            from backend.emotion.advanced_sentiment import AdvancedSentimentAnalyzer
            _sentiment_analyzer = AdvancedSentimentAnalyzer(use_gpu=False)
        except ImportError:
            logger.warning("AdvancedSentimentAnalyzer not found, skipping sentiment.")
            return None
    return _sentiment_analyzer

async def llm_heartbeat():
    global _llm_status
    while True:
        try:
            cfg = load_config()
            endpoint = cfg.get("llm", {}).get("endpoint", "")
            if endpoint:
                base = endpoint.rstrip('/')
                if not base.endswith('/v1'): base += '/v1'
                try:
                    r = requests.get(f"{base}/models", timeout=5)
                    if r.status_code == 200:
                        _llm_status = {"ok": True, "models": r.json().get("data", []), "last_check": time.time()}
                    else:
                        _llm_status = {"ok": False, "error": f"HTTP {r.status_code}", "last_check": time.time()}
                except Exception as e:
                    _llm_status = {"ok": False, "error": f"Conn Err: {str(e)}", "last_check": time.time()}
        except Exception as e:
            logging.error(f"Heartbeat error: {e}")
        await asyncio.sleep(60)

# --- STARTUP HANDLERS ---
@app.on_event("startup")
async def startup_event():
    # 1. Run Preflight
    try:
        from . import preflight as pf
        pf.run()
    except Exception as e:
        logger.error(f"Preflight failed: {e}")

    # 2. Start Tasks
    asyncio.create_task(llm_heartbeat())

    # 3. Initialize Model Manager
    global model_manager
    try:
        from .models.manager import ModelManager
        model_manager = ModelManager(load_config())
    except ImportError as e:
        logger.error(f"Failed to load ModelManager (missing dependency?): {e}")

# --- API ROUTES ---

@app.get("/", response_class=HTMLResponse)
def index():
    return (FRONTEND / "index.html").read_text(encoding="utf-8")

# Mount Static Files
app.mount("/assets", StaticFiles(directory=str(FRONTEND / "assets")), name="assets")
app.mount("/files", StaticFiles(directory=str(STORAGE)), name="files")
app.mount("/frontend", StaticFiles(directory=str(FRONTEND)), name="frontend")
app.mount("/js", StaticFiles(directory=str(FRONTEND / "js")), name="js")

@app.get("/api/healthcheck")
def health():
    return {
        "ok": True,
        "version": VERSION,
        "llm": _llm_status,
        "status": "nominal"
    }

@app.get("/api/logs")
def get_logs():
    logs = []
    while not LOG_QUEUE.empty():
        logs.append(LOG_QUEUE.get_nowait())
    return {"logs": logs}

@app.get("/api/config")
def get_config_route():
    return load_config()

# --- EXCEPTION HANDLERS ---
@app.exception_handler(Exception)
async def generic_exception_handler(request, exc):
    logger.error(f"Global Error: {exc}", exc_info=True)
    return JSONResponse(status_code=500, content={"ok": False, "error": str(exc)})

if __name__ == "__main__":
    import uvicorn
    # Smart Port Scan
    for port in range(8080, 8091):
        try:
            logger.info(f"Attempting to bind to port {port}...")
            uvicorn.run(app, host="0.0.0.0", port=port)
            break
        except OSError:
            logger.warning(f"Port {port} busy, trying next...")
