import logging, logging.handlers, queue
import psutil
from datetime import datetime
from pathlib import Path
import json, sqlite3, requests, asyncio, time
from fastapi import FastAPI, UploadFile, File, HTTPException, Request
from fastapi.responses import HTMLResponse
from starlette.staticfiles import StaticFiles

ROOT = Path(__file__).resolve().parents[1]
VERSION_FILE = ROOT / "VERSION"
VERSION = VERSION_FILE.read_text().strip() if VERSION_FILE.exists() else "5.30.0"
FRONTEND = ROOT / "frontend"
STORAGE = ROOT / "backend" / "storage"
DEBUG_LOG = ROOT / "debug.log"

# --- CORE LOGGING SYSTEM ---
# Memory buffer for the UI "Terminal"
LOG_QUEUE = queue.Queue(maxsize=100)

class UIHandler(logging.Handler):
    def emit(self, record):
        msg = self.format(record)
        if LOG_QUEUE.full():
            try: LOG_QUEUE.get_nowait()
            except: pass
        LOG_QUEUE.put_nowait(msg)

# Setup file and memory logging
logger = logging.getLogger("waifu")
logger.setLevel(logging.DEBUG)

# File handler (Rotation at 1MB)
file_handler = logging.handlers.RotatingFileHandler(DEBUG_LOG, maxBytes=1_000_000, backupCount=3)
file_handler.setFormatter(logging.Formatter('%(asctime)s [%(levelname)s] %(message)s'))
logger.addHandler(file_handler)

# UI handler (Memory Buffer)
ui_handler = UIHandler()
ui_handler.setFormatter(logging.Formatter('> %(message)s'))
logger.addHandler(ui_handler)

# Standard console handler
console = logging.StreamHandler()
console.setFormatter(logging.Formatter('\033[94m%(levelname)s\033[0m: %(message)s'))
logger.addHandler(console)

logger.info(f"--- WAIFU_LINK BOOT SEQUENCE v{VERSION} ---")
STORAGE = ROOT / "backend" / "storage"
AVATARS = STORAGE / "avatars"
AUDIO = STORAGE / "audio"
CONFIG = ROOT / "backend" / "config" / "app.json"
DB_PATH = STORAGE / "app.db"

# Global LLM Health Status
_llm_status = {"ok": False, "error": "Not Checked", "models": [], "last_check": 0}

async def llm_heartbeat():
    global _llm_status
    while True:
        try:
            cfg = load_config()
            llm_cfg = cfg.get("llm", {})
            endpoint = llm_cfg.get("endpoint", "")
            if not endpoint:
                _llm_status = {"ok": False, "error": "No endpoint configured", "last_check": time.time()}
            else:
                base = endpoint.rstrip('/')
                if not base.endswith('/v1'): base += '/v1'
                # Use a specific timeout for the heartbeat
                try:
                    r = requests.get(f"{base}/models", timeout=5)
                    if r.status_code == 200:
                        _llm_status = {
                            "ok": True, 
                            "models": r.json().get("data", []), 
                            "last_check": time.time(),
                            "endpoint": endpoint
                        }
                    else:
                        _llm_status = {"ok": False, "error": f"HTTP {r.status_code}", "last_check": time.time()}
                except Exception as e:
                    _llm_status = {"ok": False, "error": f"Connection failed: {str(e)}", "last_check": time.time()}
        except Exception as e:
            logging.error(f"Heartbeat error: {e}")
        await asyncio.sleep(60) # Check every minute

def preflight():
    from . import preflight as pf
    pf.run()

@app.on_event("startup")
async def _startup():
    preflight()
    asyncio.create_task(llm_heartbeat())
    global model_manager
    from .models.manager import ModelManager
    model_manager = ModelManager(load_config())

DEFAULT_CONFIG = {
    "onboarded": False,
    "llm": {
        "provider": "local",
        "endpoint": "http://127.0.0.1:1234/v1",
        "model": "",
        "api_key": "lm-studio",
        "temperature": 0.7,
        "history_limit": 20
    },
    "tts": {
        "enabled": True,
        "provider": "local",
        "voice_id": "fox_v1",
        "auto_speak": True
    },
    "asr": {
        "enabled": False,
        "provider": "web_speech",
        "language": "en-US"
    },
    "ui": {
        "scanline_opacity": 0.4,
        "flicker_enabled": True,
        "theme": "retro"
    }
}

def load_config():
    cfg = DEFAULT_CONFIG.copy()
    if CONFIG.exists():
        try:
            saved = json.loads(CONFIG.read_text(encoding="utf-8"))
            for k, v in saved.items():
                if isinstance(v, dict) and k in cfg:
                    cfg[k].update(v)
                else:
                    cfg[k] = v
        except:
            pass
    return cfg

def save_config(cfg):
    CONFIG.parent.mkdir(parents=True, exist_ok=True)
    CONFIG.write_text(json.dumps(cfg, indent=2), encoding="utf-8")

def db():
    return sqlite3.connect(DB_PATH)

# Global sentiment analyzer instance (lazy-loaded)
_sentiment_analyzer = None

def get_sentiment_analyzer():
    """
    Lazy-load advanced sentiment analyzer.

    Loads HuggingFace emotion detection model on first use to avoid
    slow startup. Model takes ~2-3s to load.

    Returns:
        AdvancedSentimentAnalyzer: Initialized sentiment analyzer instance

    Example:
        >>> analyzer = get_sentiment_analyzer()
        >>> result = analyzer.analyze("I love this!")
        >>> print(result["emotion"])  # "joy"
    """
    global _sentiment_analyzer
    if _sentiment_analyzer is None:
        from backend.emotion.advanced_sentiment import AdvancedSentimentAnalyzer
        _sentiment_analyzer = AdvancedSentimentAnalyzer(use_gpu=False)
    return _sentiment_analyzer

@app.get("/", response_class=HTMLResponse)
def index():
    return (FRONTEND / "index.html").read_text(encoding="utf-8")

app.mount("/assets", StaticFiles(directory=str(FRONTEND / "assets")), name="assets")
app.mount("/files", StaticFiles(directory=str(STORAGE)), name="files")
app.mount("/frontend", StaticFiles(directory=str(FRONTEND)), name="frontend")

@app.get("/api/config")
def get_config(): return load_config()

@app.put("/api/config")
async def set_config(req: Request):
    incoming = await req.json()
    cfg = load_config()
    for k, v in (incoming or {}).items():
        if isinstance(v, dict) and k in cfg and isinstance(cfg[k], dict):
            cfg[k].update(v)
        else:
            cfg[k] = v
    save_config(cfg)
    return {"ok": True, "config": cfg}

@app.post("/api/config/reset")
def reset_config():
    save_config(DEFAULT_CONFIG)
    return {"ok": True, "config": DEFAULT_CONFIG}

# --- Model Manager API ---
model_manager = None

@app.get("/api/models/search")
def search_models(q: str = "", task: str = None, sort: str = "downloads"):
    """Search HuggingFace models."""
    if not model_manager: return {"models": []}
    return {"models": model_manager.search(q, task, sort)}

@app.post("/api/models/install")
async def install_model(req: Request):
    """Install a model (async)."""
    body = await req.json()
    model_id = body.get("id")
    mtype = body.get("type", "llm")
    if not model_id: raise HTTPException(400, "Missing model id")
    
    # Run in background
    asyncio.create_task(model_manager.install(model_id, mtype))
    return {"ok": True, "status": "started", "id": model_id}

@app.get("/api/models/installed")
def list_installed_models():
    if not model_manager: return {}
    return model_manager.list_installed()

@app.delete("/api/models/{type}/{id}")
def delete_model(type: str, id: str):
    if not model_manager: return {"ok": False}
    # Reconstruct ID from safe URL param if needed, or just pass through
    # Frontend should encode / as _ or similar if needed, or we handle it
    # But for now assuming ID is passed safely
    real_id = id.replace("_", "/")
    success = model_manager.delete(real_id, type)
    return {"ok": success}

@app.get("/api/system/stats")
def get_system_stats():
    """Get real-time system resource usage."""
    return {
        "cpu": psutil.cpu_percent(interval=None),
        "ram": psutil.virtual_memory().percent,
        "gpu": 0 # Placeholder for now, requires pynvml or torch
    }

@app.get("/api/healthcheck")
def health():
    cfg = load_config()
    return {
        "ok": _llm_status["ok"],
        "version": VERSION,
        "schema_version": 5,
        "llm": _llm_status,
        "lmstudio": _llm_status["ok"], # Backwards compat for retro UI
        "ttsConfigured": bool(cfg.get("tts", {}).get("enabled") or cfg.get("tts", {}).get("api_key")),
        "issues": [_llm_status["error"]] if not _llm_status["ok"] else []
    }

    # Check LLM endpoint
    try:
        cfg = load_config()
        url = (cfg.get("llm",{}).get("endpoint","http://127.0.0.1:1234/v1")).rstrip("/") + "/models"
        r = requests.get(url, timeout=3)
        lm_ok = (r.status_code == 200)
        if not lm_ok: ok=False; issues.append(f"LLM models status: {r.status_code}")
    except Exception as e:
        ok=False; issues.append(f"LLM probe: {e}")

    return {
        "ok": ok,
        "version": VERSION,
        "schema_version": schema_version,
        "libs": libs,
        "lmstudio": lm_ok,
        "ttsConfigured": tts,
        "issues": issues
    }

@app.get("/api/avatars")
def list_avatars():
    items = [{"name": p.name, "url": f"/files/avatars/{p.name}"} for p in AVATARS.glob("*.*")]
    return {"avatars": items}

@app.post("/api/avatars/upload")
def upload_avatar(file: UploadFile = File(...)):
    name = file.filename or "upload.glb"
    lname = name.lower()
    if not (lname.endswith(".vrm") or lname.endswith(".glb") or lname.endswith(".gltf")):
        raise HTTPException(400, "Only .vrm/.glb/.gltf supported")
    safe = name.replace("..","").replace("/","").replace("\\","")
    dest = AVATARS / safe
    dest.write_bytes(file.file.read())
    return {"ok": True, "name": safe, "url": f"/files/avatars/{safe}"}

@app.delete("/api/avatars/{name}")
def delete_avatar(name: str):
    safe = name.replace("..","").replace("/","").replace("\\","")
    p = AVATARS / safe
    if p.exists(): p.unlink()
    return {"ok": True}

@app.get("/api/logs")
async def get_logs():
    """Endpoint for retrieving current log buffer for the sidebar terminal."""
    logs = []
    while not LOG_QUEUE.empty():
        logs.append(LOG_QUEUE.get_nowait())
    return {"logs": logs}

@app.post("/api/chat")
async def chat(session_id: int = 1, char_id: int = None, req: Request = None):
    body = await req.json()
    if not body or "text" not in body:
        logger.warning("Chat request missing text body")
        raise HTTPException(400, "missing text")
    
    text = body["text"]; speak = bool(body.get("speak", False))
    if char_id is None: char_id = body.get("character_id", 1)

    logger.info(f"USER: {text[:50]}...")

    cfg = load_config()
    con = db(); cur = con.cursor()
    try:
        cur.execute("INSERT OR IGNORE INTO sessions(id,title) VALUES (?,?)", (session_id, f"Session {session_id}"))
        cur.execute("INSERT INTO messages(session_id,role,text) VALUES (?,?,?)", (session_id, "user", text))
        con.commit()
        cur.execute("SELECT role,text FROM messages WHERE session_id=? ORDER BY id DESC LIMIT ?",
                    (session_id, cfg.get("memory",{}).get("max_history",12)))
        hist = [{"role": r, "content": t} for (r,t) in cur.fetchall()][::-1]
        
        cur.execute("SELECT system_prompt, voice_id, tts_provider FROM characters WHERE id=?", (char_id,))
        char_row = cur.fetchone()
        if char_row:
            sys_prompt, char_voice, char_prov = char_row
        else:
            cur.execute("SELECT system_prompt, voice_id, tts_provider FROM characters WHERE id=1")
            char_row = cur.fetchone()
            if char_row:
                sys_prompt, char_voice, char_prov = char_row
            else:
                sys_prompt = "You are a friendly anime companion."
                char_voice, char_prov = None, None

        messages = [{"role":"system","content": sys_prompt}] + hist
        
        try:
            from .llm.registry import get_client
            adapter = get_client(cfg)
            llm_model = cfg["llm"].get("model") or "local-model"
            res = adapter.chat(messages, llm_model, cfg["llm"]["endpoint"], cfg["llm"]["api_key"])
        except Exception as e:
            return {"ok": False, "error": f"ADAPTER_ERR: {e}", "code": "ERR_ADAPTER"}
            
        if not res.get("ok"): 
            err_msg = res.get("error","adapter failed")
            code = "ERR_LLM_DISCONNECT" if "failed" in err_msg.lower() or "connection" in err_msg.lower() else "ERR_LLM_GENERIC"
            return {"ok": False, "error": err_msg, "code": code}
            
        reply = res["reply"]
        cur.execute("INSERT INTO messages(session_id,role,text) VALUES (?,?,?)", (session_id, "assistant", reply))
        con.commit()

        # Analyze sentiment/emotion from reply using advanced HuggingFace model
        analyzer = get_sentiment_analyzer()
        sentiment = analyzer.analyze(reply, min_confidence=0.3)

        tts_url = None
        if speak:
            try:
                from .tts.registry import get_tts
                tts_client = get_tts(cfg)
                tts_opts = cfg.get("tts",{}).copy()
                if char_voice: tts_opts['voice_id'] = char_voice
                if char_prov: tts_opts['provider'] = char_prov
                tts_res = tts_client.speak(reply, tts_opts)
                if tts_res.get("ok"): tts_url = f"/files/audio/{tts_res['filename']}"
            except Exception: tts_url = None

        # Build emotion confidence scores (top 3 emotions)
        emotion_confidence = {}
        if "all_emotions" in sentiment:
            for pred in sentiment["all_emotions"][:3]:
                emotion_confidence[pred["label"]] = round(pred["score"], 3)

        return {
            "ok": True,
            "reply": reply,
            "audio": tts_url,
            "session_id": session_id,
            "emotion": sentiment["emotion"],
            "intensity": sentiment["intensity"],
            "gesture": sentiment["gesture"],
            "secondary_emotion": sentiment.get("secondary_emotion"),
            "emotion_confidence": emotion_confidence
        }
    finally:
        con.close()

@app.get("/api/sessions")
def list_sessions(archived: bool = False):
    conn = db(); cur = conn.cursor()
    is_archived = 1 if archived else 0
    cur.execute("""
        SELECT s.id, s.title, s.created_ts, COUNT(m.id) as msg_count, s.archived
        FROM sessions s
        LEFT JOIN messages m ON s.id = m.session_id
        WHERE COALESCE(s.archived, 0) = ?
        GROUP BY s.id
        ORDER BY s.created_ts DESC
    """, (is_archived,))
    sessions = [{"id": row[0], "title": row[1] or f"Session {row[0]}", "created_ts": row[2], "message_count": row[3], "archived": bool(row[4])} for row in cur.fetchall()]
    conn.close()
    return {"sessions": sessions}

# Global Exception Handler
@app.middleware("http")
async def global_exception_handler(request: Request, call_next):
    try:
        return await call_next(request)
    except Exception as e:
        logger.error(f"Global Exception: {e}", exc_info=True)
        return JSONResponse(
            status_code=500,
            content={"ok": False, "error": "Internal Server Error", "details": str(e)}
        )

# 10+ Common Error Handlers
@app.exception_handler(HTTPException)
async def http_exception_handler(request, exc):
    return JSONResponse(status_code=exc.status_code, content={"ok": False, "error": exc.detail})

@app.exception_handler(sqlite3.Error)
async def db_exception_handler(request, exc):
    logger.error(f"Database Error: {exc}")
    return JSONResponse(status_code=500, content={"ok": False, "error": "Database Error", "details": str(exc)})

@app.exception_handler(requests.RequestException)
async def network_exception_handler(request, exc):
    logger.error(f"Network Error: {exc}")
    return JSONResponse(status_code=503, content={"ok": False, "error": "External Service Unavailable", "details": str(exc)})

@app.post("/api/sessions")
async def create_session(req: Request):
    """Create a new chat session.

    Args:
        req: FastAPI Request with JSON body containing optional "title"

    Returns:
        dict: {
            "id": int - Session ID
            "session_id": int - Session ID (duplicate for compatibility)
            "title": str - Session title
            "created_ts": float - Creation timestamp
        }

    Example:
        >>> POST /api/sessions
        >>> {"title": "My Chat"}
        >>> {"id": 1, "session_id": 1, "title": "My Chat", "created_ts": 1234567890.0}
    """
    body = await req.json(); title = body.get("title", "New Session")
    conn = db(); cur = conn.cursor()
    cur.execute("INSERT INTO sessions (title) VALUES (?)", (title,))
    sid = cur.lastrowid
    cur.execute("SELECT created_ts FROM sessions WHERE id=?", (sid,))
    ts = cur.fetchone()[0]
    conn.commit(); conn.close()
    return {"id": sid, "session_id": sid, "title": title, "created_ts": ts}

@app.put("/api/sessions/{session_id}")
async def update_session(session_id: int, req: Request):
    """Update session title or archive status.

    Args:
        session_id: Session ID to update
        req: Request with JSON: {"title": str, "archived": bool}

    Returns:
        dict: {
            "ok": bool - Success status
            "session": dict - Updated session object
        }

    Raises:
        HTTPException: 400 if request body is empty
        HTTPException: 404 if session not found

    Example:
        >>> PUT /api/sessions/1
        >>> {"title": "Renamed Session", "archived": false}
        >>> {"ok": true, "session": {"id": 1, "title": "Renamed Session", ...}}
    """
    body = await req.json()
    if not body:
        raise HTTPException(400, "Empty request body")

    conn = db(); cur = conn.cursor()

    # Validate session exists
    cur.execute("SELECT id FROM sessions WHERE id=?", (session_id,))
    if not cur.fetchone():
        conn.close()
        raise HTTPException(404, f"Session {session_id} not found")

    # Update fields
    updates, params = [], []
    if "title" in body:
        updates.append("title=?")
        params.append(body["title"])
    if "archived" in body:
        updates.append("archived=?")
        params.append(1 if body["archived"] else 0)

    if updates:
        params.append(session_id)
        cur.execute(f"UPDATE sessions SET {', '.join(updates)} WHERE id=?", params)
        conn.commit()

    # Fetch updated session
    cur.execute("SELECT id, title, created_ts, archived FROM sessions WHERE id=?", (session_id,))
    row = cur.fetchone()
    conn.close()

    return {"ok": True, "session": {"id": row[0], "title": row[1], "created_ts": row[2], "archived": bool(row[3])}}

@app.delete("/api/sessions/{session_id}")
def delete_session(session_id: int):
    """Delete session and all associated messages.

    Args:
        session_id: Session ID to delete

    Returns:
        dict: {
            "ok": bool - Success status
            "deleted_messages": int - Number of messages deleted
        }

    Raises:
        HTTPException: 404 if session not found

    Example:
        >>> DELETE /api/sessions/1
        >>> {"ok": true, "deleted_messages": 15}
    """
    conn = db(); cur = conn.cursor()

    cur.execute("SELECT id FROM sessions WHERE id=?", (session_id,))
    if not cur.fetchone():
        conn.close()
        raise HTTPException(404, f"Session {session_id} not found")

    cur.execute("SELECT COUNT(*) FROM messages WHERE session_id=?", (session_id,))
    msg_count = cur.fetchone()[0]

    cur.execute("DELETE FROM sessions WHERE id=?", (session_id,))
    conn.commit(); conn.close()

    return {"ok": True, "deleted_messages": msg_count}

@app.get("/api/sessions/search")
def search_sessions(q: str = ""):
    """Search sessions using FTS5 full-text search on messages.

    Args:
        q: Search query string (searches message content)

    Returns:
        dict: {
            "sessions": list - Matching sessions with metadata
            "total": int - Total number of results
        }

    Example:
        >>> GET /api/sessions/search?q=hello
        >>> {"sessions": [{"id": 1, "title": "...", ...}], "total": 1}
    """
    conn = db(); cur = conn.cursor()

    if not q:
        # No query - return all sessions
        cur.execute("SELECT id, title, created_ts, archived FROM sessions ORDER BY created_ts DESC")
    else:
        # FTS5 search on messages
        cur.execute("""
            SELECT DISTINCT s.id, s.title, s.created_ts, s.archived
            FROM sessions s
            INNER JOIN messages m ON s.id = m.session_id
            INNER JOIN messages_fts fts ON m.id = fts.rowid
            WHERE messages_fts MATCH ?
            ORDER BY s.created_ts DESC
        """, (q,))

    sessions = [{"id": r[0], "title": r[1], "created_ts": r[2], "archived": bool(r[3])} for r in cur.fetchall()]
    conn.close()
    return {"sessions": sessions, "total": len(sessions)}

@app.get("/api/sessions/{session_id}/messages")
def get_session_messages(session_id: int):
    conn = db(); cur = conn.cursor()
    cur.execute("SELECT id, role, text, ts FROM messages WHERE session_id=? ORDER BY id ASC", (session_id,))
    msgs = [{"id": row[0], "role": row[1], "text": row[2], "ts": row[3]} for row in cur.fetchall()]
    conn.close()
    return {"messages": msgs}

@app.get("/api/characters")
def list_characters():
    """List all available characters.

    Returns:
        dict: {
            "characters": list - Array of character objects with full details
        }

    Example:
        >>> GET /api/characters
        >>> {"characters": [{"id": 1, "name": "Default", ...}, ...]}
    """
    conn = db(); cur = conn.cursor()
    cur.execute("SELECT id, name, system_prompt, avatar_url, voice_id, tts_provider, personality_traits FROM characters ORDER BY id ASC")
    chars = []
    for row in cur.fetchall():
        chars.append({"id": row[0], "name": row[1], "system_prompt": row[2], "avatar_url": row[3], "voice_id": row[4], "tts_provider": row[5], "personality_traits": json.loads(row[6]) if row[6] else []})
    conn.close()
    return {"characters": chars}

@app.post("/api/characters")
async def create_character(req: Request):
    """Create a new character.

    Args:
        req: Request with JSON body containing:
            - name: str (required)
            - system_prompt: str (required)
            - avatar_url: str (optional)
            - voice_id: str (optional)
            - tts_provider: str (optional)
            - personality_traits: list (optional)

    Returns:
        dict: {
            "ok": bool - Success status
            "character": dict - Created character object
        }

    Raises:
        HTTPException: 400 if name or system_prompt missing

    Example:
        >>> POST /api/characters
        >>> {"name": "Tsuki", "system_prompt": "You are Tsuki..."}
        >>> {"ok": true, "character": {"id": 2, "name": "Tsuki", ...}}
    """
    body = await req.json()
    if not body or "name" not in body or "system_prompt" not in body:
        raise HTTPException(400, "Missing name or system_prompt")

    conn = db(); cur = conn.cursor()
    traits_json = json.dumps(body.get("personality_traits", []))

    cur.execute("""
        INSERT INTO characters (name, system_prompt, avatar_url, voice_id, tts_provider, personality_traits)
        VALUES (?, ?, ?, ?, ?, ?)
    """, (body["name"], body["system_prompt"], body.get("avatar_url"),
          body.get("voice_id"), body.get("tts_provider"), traits_json))

    char_id = cur.lastrowid
    conn.commit()

    cur.execute("SELECT id, name, system_prompt, avatar_url, voice_id, tts_provider, personality_traits FROM characters WHERE id=?", (char_id,))
    row = cur.fetchone()
    conn.close()

    return {"ok": True, "character": {"id": row[0], "name": row[1], "system_prompt": row[2],
                                       "avatar_url": row[3], "voice_id": row[4],
                                       "tts_provider": row[5],
                                       "personality_traits": json.loads(row[6]) if row[6] else []}}

@app.put("/api/characters/{char_id}")
async def update_character(char_id: int, req: Request):
    """Update existing character.

    Args:
        char_id: Character ID to update
        req: Request with JSON containing fields to update

    Returns:
        dict: {
            "ok": bool - Success status
            "character": dict - Updated character object
        }

    Raises:
        HTTPException: 400 if request body is empty
        HTTPException: 404 if character not found

    Example:
        >>> PUT /api/characters/2
        >>> {"name": "Tsuki Updated", "voice_id": "tsuki_v2"}
        >>> {"ok": true, "character": {"id": 2, ...}}
    """
    body = await req.json()
    if not body:
        raise HTTPException(400, "Empty request body")

    conn = db(); cur = conn.cursor()

    cur.execute("SELECT id FROM characters WHERE id=?", (char_id,))
    if not cur.fetchone():
        conn.close()
        raise HTTPException(404, f"Character {char_id} not found")

    updates, params = [], []
    for field in ["name", "system_prompt", "avatar_url", "voice_id", "tts_provider"]:
        if field in body:
            updates.append(f"{field}=?")
            params.append(body[field])

    if "personality_traits" in body:
        updates.append("personality_traits=?")
        params.append(json.dumps(body["personality_traits"]))

    if updates:
        params.append(char_id)
        cur.execute(f"UPDATE characters SET {', '.join(updates)} WHERE id=?", params)
        conn.commit()

    cur.execute("SELECT id, name, system_prompt, avatar_url, voice_id, tts_provider, personality_traits FROM characters WHERE id=?", (char_id,))
    row = cur.fetchone()
    conn.close()

    return {"ok": True, "character": {"id": row[0], "name": row[1], "system_prompt": row[2],
                                       "avatar_url": row[3], "voice_id": row[4],
                                       "tts_provider": row[5],
                                       "personality_traits": json.loads(row[6]) if row[6] else []}}

@app.delete("/api/characters/{char_id}")
def delete_character(char_id: int):
    """Delete a character.

    Args:
        char_id: Character ID to delete

    Returns:
        dict: {
            "ok": bool - Success status
        }

    Raises:
        HTTPException: 400 if attempting to delete default character (id=1)
        HTTPException: 404 if character not found

    Example:
        >>> DELETE /api/characters/2
        >>> {"ok": true}
    """
    if char_id == 1:
        raise HTTPException(400, "Cannot delete default character")

    conn = db(); cur = conn.cursor()
    cur.execute("SELECT id FROM characters WHERE id=?", (char_id,))
    if not cur.fetchone():
        conn.close()
        raise HTTPException(404, f"Character {char_id} not found")

    cur.execute("DELETE FROM characters WHERE id=?", (char_id,))
    conn.commit(); conn.close()
    return {"ok": True}

if __name__ == "__main__":
    import uvicorn
    import sys
    
    # Smart Port Scanning (8080 -> 8090)
    port = 8080
    max_port = 8090
    
    while port <= max_port:
        try:
            logger.info(f"Attempting to bind to port {port}...")
            # We don't actually bind here, just rely on Uvicorn. 
            # If Uvicorn fails, we catch it? No, uvicorn.run blocks.
            # So checking port beforehand is safer.
            import socket
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                if s.connect_ex(('0.0.0.0', port)) != 0:
                    # Port is free
                    break
                else:
                    logger.warning(f"Port {port} is busy.")
        except:
            pass
        port += 1
    
    if port > max_port:
        logger.error("No free ports found between 8080-8090!")
        sys.exit(1)
        
    logger.info(f"Starting Waifu-RT3D on http://localhost:{port}")
    uvicorn.run("backend.server:app", host="0.0.0.0", port=port, reload=False)
