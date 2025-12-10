from fastapi import FastAPI, UploadFile, File, HTTPException, Request
from fastapi.responses import HTMLResponse
from starlette.staticfiles import StaticFiles
from pathlib import Path
import json, sqlite3, requests

ROOT = Path(__file__).resolve().parents[1]
FRONTEND = ROOT / "frontend"
STORAGE = ROOT / "backend" / "storage"
AVATARS = STORAGE / "avatars"
AUDIO = STORAGE / "audio"
CONFIG = ROOT / "backend" / "config" / "app.json"
DB_PATH = STORAGE / "app.db"

app = FastAPI(title="waifu-rt3d", version="5.30")

def preflight():
    from . import preflight as pf
    pf.run()

@app.on_event("startup")
def _startup():
    preflight()

def load_config():
    if CONFIG.exists():
        return json.loads(CONFIG.read_text(encoding="utf-8"))
    return {}

def save_config(cfg):
    CONFIG.write_text(json.dumps(cfg, indent=2), encoding="utf-8")

def db():
    return sqlite3.connect(DB_PATH)

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
    cfg = load_config() or {}
    for k,v in (incoming or {}).items():
        if isinstance(v, dict) and isinstance(cfg.get(k), dict): cfg[k].update(v)
        else: cfg[k] = v
    save_config(cfg)
    return {"ok": True, "config": cfg}

@app.get("/api/healthcheck")
def health():
    libs = {
        "three_local": (FRONTEND/'lib'/'three.module.js').exists(),
        "gltf_loader_local": (FRONTEND/'lib'/'GLTFLoader.js').exists(),
        "three_vrm_local": (FRONTEND/'lib'/'three-vrm.module.min.js').exists()
    }
    issues = []; ok = True; lm_ok=False; tts=True
    try:
        cfg = load_config()
        url = (cfg.get("llm",{}).get("endpoint","http://127.0.0.1:1234/v1")).rstrip("/") + "/models"
        r = requests.get(url, timeout=3)
        lm_ok = (r.status_code == 200)
        if not lm_ok: ok=False; issues.append(f"LLM models status: {r.status_code}")
    except Exception as e:
        ok=False; issues.append(f"LLM probe: {e}")
    return {"ok": ok, "libs": libs, "lmstudio": lm_ok, "ttsConfigured": tts, "issues": issues}

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
    from .tts.registry import get_tts
    tts = get_tts(cfg)
    res = tts.speak(text, cfg_tts)
    if not res.get("ok"): raise HTTPException(400, res.get("error","TTS failed"))
    return {"ok": True, "url": f"/files/audio/{res['filename']}", "meta": res.get("meta",{})}

# ==================== SESSION MANAGEMENT ====================

@app.get("/api/sessions")
def list_sessions():
    """List all chat sessions."""
    conn = db()
    cur = conn.cursor()
    cur.execute("""
        SELECT s.id, s.title, s.created_ts, COUNT(m.id) as msg_count
        FROM sessions s
        LEFT JOIN messages m ON s.id = m.session_id
        GROUP BY s.id
        ORDER BY s.created_ts DESC
    """)
    sessions = [
        {
            "id": row[0],
            "title": row[1] or f"Session {row[0]}",
            "created_ts": row[2],
            "message_count": row[3]
        }
        for row in cur.fetchall()
    ]
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
    cur.execute("SELECT created_ts FROM sessions WHERE id=?", (session_id,))
    created_ts = cur.fetchone()[0]
    conn.commit()
    conn.close()
    return {"id": session_id, "title": title, "created_ts": created_ts}

@app.put("/api/sessions/{session_id}")
async def update_session(session_id: int, req: Request):
    """Update session title."""
    body = await req.json()
    title = body.get("title", "")
    if not title:
        raise HTTPException(400, "Title required")
    conn = db()
    cur = conn.cursor()
    cur.execute("UPDATE sessions SET title=? WHERE id=?", (title, session_id))
    conn.commit()
    conn.close()
    return {"ok": True}

@app.delete("/api/sessions/{session_id}")
def delete_session(session_id: int):
    """Delete session and all its messages."""
    conn = db()
    cur = conn.cursor()
    cur.execute("DELETE FROM messages WHERE session_id=?", (session_id,))
    cur.execute("DELETE FROM sessions WHERE id=?", (session_id,))
    conn.commit()
    conn.close()
    return {"ok": True}

@app.get("/api/sessions/{session_id}/messages")
def get_session_messages(session_id: int):
    """Get all messages for a session."""
    conn = db()
    cur = conn.cursor()
    cur.execute("""
        SELECT id, role, text, ts
        FROM messages
        WHERE session_id=?
        ORDER BY id ASC
    """, (session_id,))
    messages = [
        {"id": row[0], "role": row[1], "text": row[2], "ts": row[3]}
        for row in cur.fetchall()
    ]
    conn.close()
    return {"messages": messages}

# ==================== CHARACTER MANAGEMENT ====================

@app.get("/api/characters")
def list_characters():
    """List all characters."""
    conn = db()
    cur = conn.cursor()
    cur.execute("""
        SELECT id, name, system_prompt, avatar_url, voice_id, tts_provider, personality_traits
        FROM characters
        ORDER BY id ASC
    """)
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
    cur.execute("""
        INSERT INTO characters (name, system_prompt, avatar_url, voice_id, tts_provider, personality_traits)
        VALUES (?, ?, ?, ?, ?, ?)
    """, (name, system_prompt, avatar_url, voice_id, tts_provider, personality_traits))
    char_id = cur.lastrowid
    conn.commit()
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
        raise HTTPException(400, "No fields to update")
    params.append(character_id)
    query = f"UPDATE characters SET {', '.join(updates)} WHERE id=?"
    cur.execute(query, params)
    conn.commit()
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
        raise HTTPException(400, "ASR not enabled in configuration")
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
        raise HTTPException(500, f"Transcription failed: {str(e)}")
