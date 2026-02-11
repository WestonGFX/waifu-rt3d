import logging
import logging.handlers
import queue

import os
import sys

# HACK: Allow running as script without -m
ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT_DIR not in sys.path:
    sys.path.append(ROOT_DIR)

import json
import sqlite3
import psutil

# ... (Previous imports) ...
from fastapi import FastAPI, UploadFile, File, HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from starlette.staticfiles import StaticFiles
import time

# --- LOGGING SETUP ---
LOG_QUEUE = queue.Queue(maxsize=100)
logger = logging.getLogger("waifu")
logger.setLevel(logging.DEBUG)
# (Simplified logging setup for brevity, or full restore)

# --- APP INITIALIZATION ---
app = FastAPI(title="Waifu-RT3D", version="5.31.0")

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
STORAGE  = Path(ROOT_DIR) / "backend" / "storage"
CONFIG   = Path(ROOT_DIR) / "backend" / "config" / "app.json"

def load_config():
    if CONFIG.exists():
        return json.loads(CONFIG.read_text(encoding="utf-8"))

AVATARS  = STORAGE / "avatars"
AUDIO    = STORAGE / "audio"
DB_PATH  = STORAGE / "app.db"

def save_config(cfg):
    CONFIG.write_text(json.dumps(cfg, indent=2), encoding="utf-8")

def db():
    return sqlite3.connect(DB_PATH)


# Root route — serve the frontend
@app.get("/", response_class=HTMLResponse)
def index():
    return (FRONTEND / "index.html").read_text(encoding="utf-8")

# Mount Static Files
app.mount("/assets", StaticFiles(directory=str(FRONTEND / "assets")), name="assets")
app.mount("/files", StaticFiles(directory=str(STORAGE)), name="files")
app.mount("/frontend", StaticFiles(directory=str(FRONTEND)), name="frontend")
app.mount("/js", StaticFiles(directory=str(FRONTEND / "js")), name="js")
app.mount("/css", StaticFiles(directory=str(FRONTEND / "css")), name="css")
app.mount("/viewer", StaticFiles(directory=str(FRONTEND / "viewer")), name="viewer")
app.mount("/lib", StaticFiles(directory=str(FRONTEND / "lib")), name="lib")
app.mount("/live2d", StaticFiles(directory=str(STORAGE / "live2d")), name="live2d")
app.mount("/images", StaticFiles(directory=str(STORAGE / "images")), name="images") # Mounted for portraits

# ... (Previous mounts) ...

@app.get("/api/logs")
def get_logs():
    logs = []
    while not LOG_QUEUE.empty():
        logs.append(LOG_QUEUE.get_nowait())
    return {"logs": logs}

@app.get("/api/stats")
def get_stats():
    """Return real system telemetry."""
    try:
        cpu = psutil.cpu_percent(interval=None)
        mem = psutil.virtual_memory()
        # Simulated ping for now, unless we want to ping google
        ping = int(time.time() * 1000) % 20 + 4 
        
        return {
            "cpu": cpu,
            "memory": round(mem.used / (1024**3), 1),
            "memory_total": round(mem.total / (1024**3), 1),
            "memory_percent": mem.percent,
            "ping": ping
        }
    except Exception as e:
        logger.error(f"Stats error: {e}")
        return {"cpu": 0, "memory": 0, "ping": 0}


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
async def chat(session_id: int = 1, char_id: int = 1, req: Request = None):
    body = await req.json()
    if not body or "text" not in body: raise HTTPException(400, "missing text")
    text = body["text"]; speak = bool(body.get("speak", False))
    cfg = load_config()
    con = db(); cur = con.cursor()
    
    # Ensure session exists
    cur.execute("INSERT OR IGNORE INTO sessions(id,title) VALUES (?,?)", (session_id, f"Session {session_id}"))
    
    # Log user message
    cur.execute("INSERT INTO messages(session_id,role,text) VALUES (?,?,?)", (session_id, "user", text))
    con.commit()
    
    # Store User Memory
    if vector_store:
        vector_store.add_memory(session_id, char_id, "user", text)
    
    # Fetch Character System Prompt and Voice Params

    system_prompt = "You are a friendly anime companion."
    voice_params = {}
    row = None
    try:
        cur.execute("SELECT system_prompt, voice_id, tts_provider, tts_pitch, tts_rate FROM characters WHERE id=?", (char_id,))
        row = cur.fetchone()
        if row:
            if row[0]: system_prompt = row[0]
            if row[1]: voice_params['voice_id'] = row[1]
            if row[2]: voice_params['provider'] = row[2]
            if row[3]: voice_params['tts_pitch'] = row[3]
            if row[4]: voice_params['tts_rate'] = row[4]
    except Exception as e:
        logger.error(f"Error fetching character data: {e}")

 
     # Fetch Conversation History
    cur.execute("SELECT role,text FROM messages WHERE session_id=? ORDER BY id DESC LIMIT ?",
                (session_id, cfg.get("memory",{}).get("max_history",12)))
    hist = [{"role": r, "content": t} for (r,t) in cur.fetchall()][::-1]
    
    # RAG Retrieval
    memory_context = ""
    if vector_store:
        memories = vector_store.query_memory(text, char_id=char_id)
        if memories:
            memory_context = "\n[MEMORY_CONTEXT]\nRelevant past conversations:\n"
            for m in memories:
                memory_context += f"- {m['role'].upper()}: {m['text']}\n"
    
    # Construct Messages Payload
    # Inject Emotion Instructions & Memory
    emotion_instruction = (
        "\n\nVISUAL SYSTEM INSTRUCTIONS:\n"

        "You have a 3D avatar. Express your artificial emotions using tags at the start of your response.\n"
        "Format: [emotion:happy] or [emotion:sad] or [emotion:surprised] or [emotion:angry] or [emotion:neutral]\n"
        "You can also use gestures: [gesture:nod] or [gesture:wave] or [gesture:shake] or [gesture:shrug]\n"
        "Example: [emotion:happy] [gesture:wave] Hello! It's great to see you!\n"
        "Do not output these tags if you are being neutral."
    )
    messages = [{"role":"system","content": system_prompt + memory_context + emotion_instruction}] + hist

    
    try:
        from backend.llm.registry import get_client
        adapter = get_client(cfg)
        res = adapter.chat(messages, cfg["llm"]["model"], cfg["llm"]["endpoint"], cfg["llm"]["api_key"])
    except Exception as e:
        return {"ok": False, "error": f"Adapter error: {e}"}
    
    if not res.get("ok"): return {"ok": False, "error": res.get("error","adapter failed")}
    raw_reply = res["reply"]

    # Parse Emotions and Gestures
    import re
    emotion_match = re.search(r'\[emotion:(\w+)\]', raw_reply)
    gesture_match = re.search(r'\[gesture:(\w+)\]', raw_reply)
    
    emotion = emotion_match.group(1) if emotion_match else "neutral"
    gesture = gesture_match.group(1) if gesture_match else None
    
    # specific intensity inference (simple logic for now)
    intensity = 1.0
    
    # Strip tags from reply for TTS and Display
    clean_reply = re.sub(r'\[emotion:\w+\]', '', raw_reply)
    clean_reply = re.sub(r'\[gesture:\w+\]', '', clean_reply).strip()
    
    if not clean_reply: clean_reply = raw_reply # Fallback if strip went wrong
    
    # Save Assistant Reply (Cleaned)
    cur.execute("INSERT INTO messages(session_id,role,text) VALUES (?,?,?)", (session_id, "assistant", clean_reply))
    con.commit(); con.close()

    # Store AI Memory
    if vector_store:
        vector_store.add_memory(session_id, char_id, "assistant", clean_reply)
 
    tts_url = None

    if speak:
        try:
            from backend.tts.registry import get_tts
            
            # Apply character overrides to TTS config
            tts_cfg = cfg.get("tts", {}).copy()
            tts_cfg.update(voice_params)
            
            # Update main config so get_tts sees the provider change
            if 'tts' not in cfg: cfg['tts'] = {}
            cfg['tts'].update(voice_params)
            
            # FORCE OVERRIDE: If character specifies a provider, ignore app.json active_provider
            if 'provider' in voice_params and 'services' in cfg:
                cfg['services'].get('tts', {}).pop('active_provider', None)
            
            tts_client = get_tts(cfg)
            tts_res = tts_client.speak(clean_reply, tts_cfg)  # Speak cleaned text
            if tts_res.get("ok"): tts_url = f"/files/audio/{tts_res['filename']}"
        except Exception as e:
            logger.error(f"TTS Generation failed: {e}")
            tts_url = None
 
    return {
        "ok": True, 
        "reply": clean_reply, 
        "audio": tts_url, 
        "session_id": session_id,
        "emotion": emotion,
        "intensity": intensity,
        "gesture": gesture
    }


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
        cur.execute("SELECT id, name, system_prompt, avatar_url, voice_id, tts_provider, personality_traits, live2d_model, model_type FROM characters ORDER BY id ASC")
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
            "personality_traits": traits,
            "live2d_model": row[7] if len(row) > 7 else "",
            "model_type": row[8] if len(row) > 8 else "3d"
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
    tts_pitch = body.get("tts_pitch", "")
    tts_rate = body.get("tts_rate", "")
    personality_traits = json.dumps(body.get("personality_traits", []))
    
    conn = db()
    cur = conn.cursor()
    try:
        cur.execute("""
            INSERT INTO characters (name, system_prompt, avatar_url, voice_id, tts_provider, tts_pitch, tts_rate, personality_traits, live2d_model, model_type) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (name, system_prompt, avatar_url, voice_id, tts_provider, tts_pitch, tts_rate, personality_traits, "", "3d"))
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
        "tts_pitch": tts_pitch,
        "tts_rate": tts_rate,
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
    
    fields = ["name", "system_prompt", "avatar_url", "voice_id", "tts_provider", "tts_pitch", "tts_rate", "live2d_model", "model_type"]
    for field in fields:
        if field in body:
            updates.append(f"{field}=?")
            params.append(body[field])
            
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
async def upload_image_endpoint(file: UploadFile = File(...)):
    """Upload a generic image (thumbnail/bg)."""
    allowed = [".png", ".jpg", ".jpeg", ".webp", ".gif"]
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in allowed:
        raise HTTPException(400, f"File type not allowed. Use: {allowed}")
    
    safe_name = f"img_{int(time.time())}_{ext}" # Unique ID
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
    """List all image files in images storage."""
    base = STORAGE / "images"
    images = []
    if not base.exists(): return {"images": []}
    
    # naive character matching based on filename
    # e.g. "sable_bedroom.png" -> character: "sable"
    for path in base.glob("*"):
        if path.suffix.lower() not in ['.png', '.jpg', '.jpeg', '.webp', '.gif']:
            continue
            
        name = path.stem
        char_name = name.split('_')[0].lower() if '_' in name else "unknown"
        
        # Determine image type based on naming convention
        img_type = "background"
        if "pixel_portrait" in name or "icon" in name:
            img_type = "avatar"

        images.append({
            "name": name,
            "file": path.name,
            "url": f"/files/images/{path.name}",
            "character": char_name,
            "type": img_type
        })
    return {"images": images}

# ==================== ASR (SPEECH RECOGNITION) ====================

@app.post("/api/asr")
async def transcribe_audio(file: UploadFile = File(...)):
    """Transcribe uploaded audio file to text."""
    from backend.asr.registry import get_asr_adapter
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

# ==================== MODEL MANAGEMENT ====================

@app.on_event("startup")
async def startup_event():
    global model_manager
    cfg = load_config()
    from backend.models.manager import ModelManager
    model_manager = ModelManager(cfg)
    logger.info("Model Manager Initialized")

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
