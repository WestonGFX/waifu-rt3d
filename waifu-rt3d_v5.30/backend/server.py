import logging
import logging.handlers
import queue

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

@app.put("/api/config")
async def set_config_route(req: Request):
    incoming = await req.json()
    cfg = load_config() or {}
    for k,v in (incoming or {}).items():
        if isinstance(v, dict) and isinstance(cfg.get(k), dict): cfg[k].update(v)
        else: cfg[k] = v
    save_config(cfg)
    return {"ok": True, "config": cfg}

@app.post("/api/chat")
async def chat(session_id: int = 1, req: Request = None):
    body = await req.json()
    if not body or "text" not in body: raise HTTPException(400, "missing text")
    text = body["text"]; speak = bool(body.get("speak", False))
    cfg = load_config()
    con = db(); cur = con.cursor()
    cur.execute("INSERT OR IGNORE INTO sessions(id,title) VALUES (?,?)", (session_id, f"Session {session_id}"))
    cur.execute("INSERT INTO messages(session_id,role,text) VALUES (?,?,?)", (session_id, "user", text))
    con.commit()
    cur.execute("SELECT role,text FROM messages WHERE session_id=? ORDER BY id DESC LIMIT ?",
                (session_id, cfg.get("memory",{}).get("max_history",12)))
    hist = [{"role": r, "content": t} for (r,t) in cur.fetchall()][::-1]
    messages = [{"role":"system","content":"You are a friendly anime companion."}] + hist
    try:
        from .llm.registry import get_client
        adapter = get_client(cfg)
        res = adapter.chat(messages, cfg["llm"]["model"], cfg["llm"]["endpoint"], cfg["llm"]["api_key"])
    except Exception as e:
        return {"ok": False, "error": f"Adapter error: {e}"}
    if not res.get("ok"): return {"ok": False, "error": res.get("error","adapter failed")}
    reply = res["reply"]
    cur.execute("INSERT INTO messages(session_id,role,text) VALUES (?,?,?)", (session_id, "assistant", reply))
    con.commit(); con.close()

    tts_url = None
    if speak:
        try:
            from .tts.registry import get_tts
            tts_client = get_tts(cfg)
            tts_res = tts_client.speak(reply, cfg.get("tts",{}))
            if tts_res.get("ok"): tts_url = f"/files/audio/{tts_res['filename']}"
        except Exception: tts_url = None

    return {"ok": True, "reply": reply, "audio": tts_url, "session_id": session_id}

@app.post("/api/tts")
async def api_tts(req: Request):
    body = await req.json()
    text = body.get("text","").strip()
    if not text: raise HTTPException(400, "text required")
    cfg = load_config(); cfg_tts = cfg.get("tts",{}).copy()
    for k in ("provider","endpoint","api_key","voice_id","format","sample_rate"):
        if k in body: cfg_tts[k] = body[k]
    try:
        from .tts.registry import get_tts
        tts = get_tts(cfg)
        res = tts.speak(text, cfg_tts)
        if not res.get("ok"): raise HTTPException(400, res.get("error","TTS failed"))
        return {"ok": True, "url": f"/files/audio/{res['filename']}", "meta": res.get("meta",{})}
    except Exception as e:
        raise HTTPException(500, f"TTS Error: {e}")

# ==================== SESSION MANAGEMENT ====================

@app.get("/api/sessions")
def list_sessions(archived: bool = False):
    """List all chat sessions."""
    conn = db()
    cur = conn.cursor()
    # Handle archived filtering if column exists, else ignore
    try:
        if archived:
            cur.execute("SELECT id, title, created_ts, (SELECT COUNT(id) FROM messages WHERE session_id=s.id) FROM sessions s WHERE archived=1 ORDER BY created_ts DESC")
        else:
            cur.execute("SELECT id, title, created_ts, (SELECT COUNT(id) FROM messages WHERE session_id=s.id) FROM sessions s WHERE (archived=0 OR archived IS NULL) ORDER BY created_ts DESC")
    except:
        # Fallback for v4 schema (no archived col)
        cur.execute("SELECT id, title, created_ts, (SELECT COUNT(id) FROM messages WHERE session_id=s.id) FROM sessions s ORDER BY created_ts DESC")
        
    sessions = []
    for row in cur.fetchall():
        sessions.append({
            "id": row[0],
            "title": row[1] or f"Session {row[0]}",
            "created_ts": row[2],
            "message_count": row[3],
            "archived": False # Default
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
    """Update session title or archive status."""
    body = await req.json()
    updates = []
    params = []
    if "title" in body:
        updates.append("title=?")
        params.append(body["title"])
    if "archived" in body:
        updates.append("archived=?")
        params.append(1 if body["archived"] else 0)
    
    if not updates: return {"ok": True}
    
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

@app.get("/api/sessions/{session_id}/messages")
def get_session_messages(session_id: int):
    """Get all messages for a session."""
    conn = db()
    cur = conn.cursor()
    cur.execute("SELECT id, role, text, ts FROM messages WHERE session_id=? ORDER BY id ASC", (session_id,))
    messages = [{"id": r[0], "role": r[1], "text": r[2], "ts": r[3]} for r in cur.fetchall()]
    conn.close()
    return {"messages": messages}


# ==================== CHARACTER MANAGEMENT ====================

@app.get("/api/characters")
def list_characters():
    """List all characters."""
    conn = db()
    cur = conn.cursor()
    # Check if table exists/has correct columns by trying select
    try:
        cur.execute("SELECT id, name, system_prompt, avatar_url, voice_id, tts_provider, personality_traits FROM characters ORDER BY id ASC")
    except:
        # Fallback if schema is old or columns missing
        conn.close()
        return {"characters": [{"id": 1, "name": "Default", "system_prompt": "You are a helpful AI.", "avatar_url": ""}]}
        
    characters = []
    for row in cur.fetchall():
        traits = []
        try:
            if row[6]:
                traits = json.loads(row[6])
        except:
            pass
        characters.append({
            "id": row[0],
            "name": row[1],
            "system_prompt": row[2],
            "avatar_url": row[3],
            "voice_id": row[4],
            "tts_provider": row[5],
            "personality_traits": traits
        })
    conn.close()
    return {"characters": characters}

@app.post("/api/characters")
async def create_character(req: Request):
    """Create a new character."""
    body = await req.json()
    name = body.get("name", "")
    system_prompt = body.get("system_prompt", "")
    if not name or not system_prompt:
        raise HTTPException(400, "name and system_prompt required")
    avatar_url = body.get("avatar_url", "")
    voice_id = body.get("voice_id", "")
    tts_provider = body.get("tts_provider", "")
    personality_traits = json.dumps(body.get("personality_traits", []))
    conn = db()
    cur = conn.cursor()
    try:
        cur.execute("INSERT INTO characters (name, system_prompt, avatar_url, voice_id, tts_provider, personality_traits) VALUES (?, ?, ?, ?, ?, ?)", 
                    (name, system_prompt, avatar_url, voice_id, tts_provider, personality_traits))
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
        "avatar_url": avatar_url,
        "voice_id": voice_id,
        "tts_provider": tts_provider,
        "personality_traits": json.loads(personality_traits)
    }

@app.put("/api/characters/{character_id}")
async def update_character(character_id: int, req: Request):
    """Update character details."""
    body = await req.json()
    conn = db()
    cur = conn.cursor()
    updates = []
    params = []
    if "name" in body:
        updates.append("name=?")
        params.append(body["name"])
    if "system_prompt" in body:
        updates.append("system_prompt=?")
        params.append(body["system_prompt"])
    if "avatar_url" in body:
        updates.append("avatar_url=?")
        params.append(body["avatar_url"])
    if "voice_id" in body:
        updates.append("voice_id=?")
        params.append(body["voice_id"])
    if "tts_provider" in body:
        updates.append("tts_provider=?")
        params.append(body["tts_provider"])
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

# ==================== ASR (SPEECH RECOGNITION) ====================

@app.post("/api/asr")
async def transcribe_audio(file: UploadFile = File(...)):
    """Transcribe uploaded audio file to text."""
    from .asr.registry import get_asr_adapter
    cfg = load_config()
    asr_config = cfg.get("asr", {})
    if not asr_config.get("enabled", False):
        # Auto-enable if not set? Or fail? Let's just try to proceed or fail.
        # Ideally we check enabled.
        pass
        
    try:
        adapter = get_asr_adapter(asr_config)
        if not adapter:
            raise HTTPException(500, "ASR adapter not available")
        audio_bytes = await file.read()
        result = await adapter.transcribe(audio_bytes)
        return {
            "text": result["text"],
            "language": result.get("language", "unknown"),
            "confidence": result.get("confidence", 0.0)
        }
    except Exception as e:
        # Log it
        logger.error(f"ASR Fail: {e}")
        raise HTTPException(500, f"Transcription failed: {str(e)}")

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
