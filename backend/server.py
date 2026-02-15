import logging
import logging.handlers
import queue
from threading import Lock

import os
import sys

# HACK: Allow running as script without -m
ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT_DIR not in sys.path:
    sys.path.append(ROOT_DIR)

import json
import sqlite3
import psutil
from typing import Optional

# ... (Previous imports) ...
from fastapi import FastAPI, UploadFile, File, HTTPException, Request
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
FRONTEND_V2_DIST = Path(ROOT_DIR) / "frontends" / "v2" / "dist"
STORAGE  = Path(ROOT_DIR) / "backend" / "storage"
CONFIG   = Path(ROOT_DIR) / "backend" / "config" / "app.json"
DEFAULT_FRONTEND_ENV = "WAIFU_DEFAULT_FRONTEND"

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


model_manager = None
vector_store = None

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
                import re
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
if (FRONTEND_V2_DIST / "assets").exists():
    app.mount("/v2/assets", StaticFiles(directory=str(FRONTEND_V2_DIST / "assets")), name="v2-assets")

# ... (Previous mounts) ...

@app.get("/api/logs")
def get_logs():
    logs = []
    while not LOG_QUEUE.empty():
        logs.append(LOG_QUEUE.get_nowait())
    return {"logs": logs}

@app.get("/api/stats")
def get_stats():
    """Return real system telemetry.

    Returns:
        CPU usage percentage, RAM used/total in GB, and memory percent.
        LLM response time is tracked client-side via performance.now().
    """
    try:
        cpu = psutil.cpu_percent(interval=None)
        mem = psutil.virtual_memory()

        return {
            "cpu": cpu,
            "memory": round(mem.used / (1024**3), 1),
            "memory_total": round(mem.total / (1024**3), 1),
            "memory_percent": mem.percent
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
        "save_logs_auto": False
    }
    save_config(default_cfg)
    logger.info("Config reset to factory defaults")
    return {"ok": True, "config": default_cfg, "message": "Configuration reset to defaults"}

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
        try:
            cur.execute(
                "SELECT system_prompt, voice_id, tts_provider, tts_pitch, tts_rate FROM characters WHERE id=?",
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
        except Exception as e:
            logger.error(f"Error fetching character data: {e}")

        # History limit: 0 = unlimited (fetch all messages for session)
        # Check both nested (llm.history_limit) and top-level (history_limit) for compat
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

        memories = []
        memory_context = ""
        if vector_store:
            memories = vector_store.query_memory(text, char_id=char_id)
            if memories:
                memory_context = "\n[MEMORY_CONTEXT]\nRelevant past conversations:\n"
                for memory in memories:
                    memory_context += f"- {memory['role'].upper()}: {memory['text']}\n"

        emotion_instruction = (
            "\n\nVISUAL SYSTEM INSTRUCTIONS:\n"
            "You have a 3D avatar. Express your artificial emotions using tags at the start of your response.\n"
            "Format: [emotion:happy] or [emotion:sad] or [emotion:surprised] or [emotion:angry] or [emotion:neutral]\n"
            "You can also use gestures: [gesture:nod] or [gesture:wave] or [gesture:shake] or [gesture:shrug]\n"
            "Example: [emotion:happy] [gesture:wave] Hello! It's great to see you!\n"
            "Do not output these tags if you are being neutral."
        )

        messages = [{"role": "system", "content": system_prompt + memory_context + emotion_instruction}] + hist

        try:
            from backend.llm.registry import get_client
            adapter = get_client(cfg)
            res = await run_in_threadpool(
                adapter.chat,
                messages,
                cfg["llm"]["model"],
                cfg["llm"]["endpoint"],
                cfg["llm"]["api_key"],
                temperature=cfg.get("temperature", 0.7),
                max_tokens=-1,  # -1 = unlimited output (LM Studio default)
            )
        except Exception as e:
            _telemetry_inc("chat.failures_total")
            return {"ok": False, "status": "error", "error": f"Adapter error: {e}"}

        if not res.get("ok"):
            _telemetry_inc("chat.failures_total")
            return {"ok": False, "status": "error", "error": res.get("error", "adapter failed")}

        raw_reply = res["reply"]
        import re

        emotion_match = re.search(r'\[emotion:(\w+)\]', raw_reply)
        gesture_match = re.search(r'\[gesture:(\w+)\]', raw_reply)
        emotion = emotion_match.group(1) if emotion_match else "neutral"
        gesture = gesture_match.group(1) if gesture_match else None
        intensity = 1.0

        clean_reply = re.sub(r'\[emotion:\w+\]', '', raw_reply)
        clean_reply = re.sub(r'\[gesture:\w+\]', '', clean_reply).strip()
        if not clean_reply:
            clean_reply = raw_reply

        cur.execute(
            "INSERT INTO messages(session_id, role, text, emotion, char_id) VALUES (?,?,?,?,?)",
            (session_id, "assistant", clean_reply, emotion, char_id)
        )
        assistant_message_id = cur.lastrowid
        con.commit()

        # Update relationship scores based on detected emotion
        _update_relationship(con, char_id, emotion)

        if vector_store:
            vector_store.add_memory(session_id, char_id, "assistant", clean_reply)

        tts_url = None
        if speak:
            try:
                from backend.tts.registry import get_tts

                tts_cfg = cfg.get("tts", {}).copy()
                tts_cfg.update(voice_params)

                if 'tts' not in cfg:
                    cfg['tts'] = {}
                cfg['tts'].update(voice_params)

                if 'provider' in voice_params and 'services' in cfg:
                    cfg['services'].get('tts', {}).pop('active_provider', None)

                tts_client = get_tts(cfg)
                tts_res = await run_in_threadpool(tts_client.speak, clean_reply, tts_cfg)
                if tts_res.get("ok"):
                    tts_url = f"/files/audio/{tts_res['filename']}"
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
            "memory_hits": memory_hits
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

            # Build history
            history_limit = cfg.get("llm", {}).get("history_limit", 20)
            if history_limit == 0:
                history_limit = 9999
            rows = cur.execute(
                "SELECT role, text FROM messages WHERE session_id=? AND is_active=1 ORDER BY id DESC LIMIT ?",
                (session_id, history_limit)
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

            llm_messages = [{"role": "system", "content": system_prompt + memory_context}] + hist

            # Call LLM
            endpoint = cfg.get("llm", {}).get("endpoint", "http://localhost:1234/v1")
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
    import re
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

    cfg = load_config() or {}

    # Pre-compute all DB reads and prompt construction BEFORE the generator
    # so the streaming part only handles the LLM stream + DB writes.
    con = db()
    cur = con.cursor()

    cur.execute("INSERT OR IGNORE INTO sessions(id,title) VALUES (?,?)",
                (session_id, f"Session {session_id}"))
    cur.execute("INSERT INTO messages(session_id, role, text, char_id) VALUES (?,?,?,?)",
                (session_id, "user", text, char_id))
    user_message_id = cur.lastrowid
    con.commit()

    if vector_store:
        vector_store.add_memory(session_id, char_id, "user", text)

    system_prompt = "You are a friendly anime companion."
    voice_params = {}
    try:
        cur.execute("SELECT system_prompt FROM characters WHERE id=?", (char_id,))
        row = cur.fetchone()
        if row and row[0]:
            system_prompt = row[0]
    except Exception as e:
        logger.error(f"Error fetching character data: {e}")

    max_history = cfg.get("llm", {}).get("history_limit", cfg.get("history_limit", 0))
    if max_history > 0:
        cur.execute("SELECT role,text FROM messages WHERE session_id=? ORDER BY id DESC LIMIT ?",
                    (session_id, max_history))
    else:
        cur.execute("SELECT role,text FROM messages WHERE session_id=? ORDER BY id DESC",
                    (session_id,))
    hist = [{"role": r, "content": t} for (r, t) in cur.fetchall()][::-1]

    memories = []
    memory_context = ""
    if vector_store:
        memories = vector_store.query_memory(text, char_id=char_id)
        if memories:
            memory_context = "\n[MEMORY_CONTEXT]\nRelevant past conversations:\n"
            for memory in memories:
                memory_context += f"- {memory['role'].upper()}: {memory['text']}\n"

    emotion_instruction = (
        "\n\nVISUAL SYSTEM INSTRUCTIONS:\n"
        "You have a 3D avatar. Express your artificial emotions using tags at the start of your response.\n"
        "Format: [emotion:happy] or [emotion:sad] or [emotion:surprised] or [emotion:angry] or [emotion:neutral]\n"
        "You can also use gestures: [gesture:nod] or [gesture:wave] or [gesture:shake] or [gesture:shrug]\n"
        "Example: [emotion:happy] [gesture:wave] Hello! It's great to see you!\n"
        "Do not output these tags if you are being neutral."
    )

    # Inject vocabulary context if enabled
    vocab_context = ""
    vocab_cfg = cfg.get("vocab", {})
    if vocab_cfg.get("enabled", True) and vocab_manager._loaded:
        # Per-character category filter (if character has vocab_categories set)
        char_vocab_cats = None
        try:
            row_vc = cur.execute(
                "SELECT vocab_categories FROM characters WHERE id=?", (char_id,)
            ).fetchone()
            if row_vc and row_vc[0]:
                char_vocab_cats = json.loads(row_vc[0]) if isinstance(row_vc[0], str) else row_vc[0]
        except Exception:
            pass  # Column may not exist yet
        vocab_limit = vocab_cfg.get("limit", 40)
        vocab_context = vocab_manager.get_vocab_context(
            categories=char_vocab_cats, limit=vocab_limit
        )

    llm_messages = [{"role": "system", "content": system_prompt + memory_context + vocab_context + emotion_instruction}] + hist

    from backend.llm.registry import get_client
    from backend.llm.router import get_router
    adapter = get_client(cfg)

    # Multi-model routing: select the best model for this request
    router = get_router(cfg)
    routed_model = router.route(text) if router else cfg["llm"]["model"]

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
                max_tokens=-1,
            ):
                if first_token:
                    # Signal that prefill is complete and generation has begun
                    loop.call_soon_threadsafe(token_q.put_nowait, ("generating", None))
                    first_token = False
                loop.call_soon_threadsafe(token_q.put_nowait, ("token", token))
            loop.call_soon_threadsafe(token_q.put_nowait, ("end", None))
        except Exception as e:
            loop.call_soon_threadsafe(token_q.put_nowait, ("error", str(e)))

    # Count input tokens (rough estimate: ~4 chars per token for English text)
    input_char_count = sum(len(m.get("content", "")) for m in llm_messages)
    est_input_tokens = input_char_count // 4

    async def event_generator():
        """Async generator yielding SSE events as tokens arrive from the LLM."""
        full_reply = ""
        token_count = 0

        # Emit processing event so frontend shows "PROCESSING INPUT..."
        yield f"event: processing\ndata: {json.dumps({'input_tokens': est_input_tokens})}\n\n"

        # Start the sync streaming thread
        thread = threading.Thread(target=_stream_thread, daemon=True)
        thread.start()

        try:
            while True:
                msg_type, payload = await token_q.get()

                if msg_type == "generating":
                    yield f"event: generating\ndata: {json.dumps({'status': 'first_token'})}\n\n"

                elif msg_type == "token":
                    full_reply += payload
                    token_count += 1
                    yield f"event: token\ndata: {json.dumps({'t': payload})}\n\n"

                elif msg_type == "end":
                    break

                elif msg_type == "error":
                    _telemetry_inc("chat.failures_total")
                    yield f"event: error\ndata: {json.dumps({'error': payload})}\n\n"
                    return

            # Stream complete — parse emotion/gesture, save to DB, emit done event
            emotion_match = re.search(r'\[emotion:(\w+)\]', full_reply)
            gesture_match = re.search(r'\[gesture:(\w+)\]', full_reply)
            emotion = emotion_match.group(1) if emotion_match else "neutral"
            gesture = gesture_match.group(1) if gesture_match else None

            clean_reply = re.sub(r'\[emotion:\w+\]', '', full_reply)
            clean_reply = re.sub(r'\[gesture:\w+\]', '', clean_reply).strip()
            if not clean_reply:
                clean_reply = full_reply

            cur.execute(
                "INSERT INTO messages(session_id, role, text, emotion, char_id) VALUES (?,?,?,?,?)",
                (session_id, "assistant", clean_reply, emotion, char_id)
            )
            assistant_message_id = cur.lastrowid
            con.commit()

            # Update relationship scores based on detected emotion
            _update_relationship(con, char_id, emotion)

            if vector_store:
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
            }
            yield f"event: done\ndata: {json.dumps(done_data)}\n\n"

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
        res = tts.speak(text, cfg_tts)
        if not res.get("ok"): raise HTTPException(400, res.get("error","TTS failed"))
        return {"ok": True, "url": f"/files/audio/{res['filename']}", "meta": res.get("meta",{})}
    except Exception as e:
        raise HTTPException(500, f"TTS Error: {e}")

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
        dict: {"messages": [{id, role, text, ts, parent_id, is_active, emotion, char_id}, ...]}
    """
    conn = db()
    cur = conn.cursor()
    try:
        if include_branches:
            cur.execute(
                "SELECT id, role, text, ts, parent_id, is_active, emotion, char_id "
                "FROM messages WHERE session_id=? ORDER BY id ASC",
                (session_id,)
            )
        else:
            # Filter to active path only; fall back gracefully if is_active column missing
            try:
                cur.execute(
                    "SELECT id, role, text, ts, parent_id, is_active, emotion, char_id "
                    "FROM messages WHERE session_id=? AND (is_active=1 OR is_active IS NULL) ORDER BY id ASC",
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
            messages.append({
                "id": r[0], "role": r[1], "text": r[2], "ts": r[3],
                "parent_id": r[4] if len(r) > 4 else None,
                "is_active": r[5] if len(r) > 5 else 1,
                "emotion": r[6] if len(r) > 6 else None,
                "char_id": r[7] if len(r) > 7 else None,
            })
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

        # Build emotion instruction (same as chat endpoint)
        emotion_instruction = (
            "\n\nVISUAL SYSTEM INSTRUCTIONS:\n"
            "You have a 3D avatar. Express your artificial emotions using tags at the start of your response.\n"
            "Format: [emotion:happy] or [emotion:sad] or [emotion:surprised] or [emotion:angry] or [emotion:neutral]\n"
            "You can also use gestures: [gesture:nod] or [gesture:wave] or [gesture:shake] or [gesture:shrug]\n"
            "Example: [emotion:happy] [gesture:wave] Hello! It's great to see you!\n"
            "Do not output these tags if you are being neutral."
        )

        messages = [{"role": "system", "content": system_prompt + emotion_instruction}] + hist

        # Call LLM
        from backend.llm.registry import get_client
        adapter = get_client(cfg)
        res = await run_in_threadpool(
            adapter.chat, messages, cfg["llm"]["model"],
            cfg["llm"]["endpoint"], cfg["llm"]["api_key"],
            temperature=cfg.get("temperature", 0.7), max_tokens=-1,
        )

        if not res.get("ok"):
            raise HTTPException(502, res.get("error", "LLM failed"))

        import re
        raw_reply = res["reply"]
        emotion_match = re.search(r'\[emotion:(\w+)\]', raw_reply)
        gesture_match = re.search(r'\[gesture:(\w+)\]', raw_reply)
        emotion = emotion_match.group(1) if emotion_match else "neutral"
        gesture = gesture_match.group(1) if gesture_match else None

        clean_reply = re.sub(r'\[emotion:\w+\]', '', raw_reply)
        clean_reply = re.sub(r'\[gesture:\w+\]', '', clean_reply).strip()
        if not clean_reply:
            clean_reply = raw_reply

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

    db = db()
    rows = db.execute(
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
    db.execute("UPDATE sessions SET summary = ? WHERE id = ?", (summary, session_id))
    db.commit()

    return {"ok": True, "summary": summary}


@app.get("/api/sessions/{session_id}/summary")
def get_session_summary(session_id: int):
    """Get the stored summary for a session (if previously generated).

    Args:
        session_id: Session ID.

    Returns:
        {"ok": True, "summary": "..." or null}
    """
    db = db()
    row = db.execute("SELECT summary FROM sessions WHERE id = ?", (session_id,)).fetchone()
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
                   greeting_text, greeting_animation, background_url, background_mode, voice_sample_path
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
        }
        characters.append(char)
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
    
    fields = [
        "name", "system_prompt", "avatar_url", "voice_id", "tts_provider",
        "tts_pitch", "tts_rate", "live2d_model", "model_type", "avatar_2d_url",
        "vrm_model_url", "greeting_text", "greeting_animation", "background_url",
        "background_mode", "voice_sample_path", "vocab_categories"
    ]
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
            'greeting_animation', 'background_url', 'background_mode', 'voice_sample_path'
        ]
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
        db = db()
        db.execute("UPDATE characters SET voice_sample_path = ? WHERE id = ?", (rel_path, char_id))
        db.commit()

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
    db = db()
    row = db.execute("SELECT voice_sample_path FROM characters WHERE id = ?", (char_id,)).fetchone()
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

    db.execute("UPDATE characters SET voice_sample_path = NULL WHERE id = ?", (char_id,))
    db.commit()
    return {"ok": True}


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
    db = db()
    # Ensure row exists
    db.execute("INSERT OR IGNORE INTO character_relationships (char_id) VALUES (?)", (char_id,))
    db.commit()

    row = db.execute(
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
    db = db()
    db.execute("""
        UPDATE character_relationships SET
            affinity = 0.5, mood = 0.5, trust = 0.5,
            interactions = 0, last_updated = strftime('%s','now')
        WHERE char_id = ?
    """, (char_id,))
    if db.execute("SELECT changes()").fetchone()[0] == 0:
        db.execute(
            "INSERT INTO character_relationships (char_id) VALUES (?)", (char_id,)
        )
    db.commit()
    return {"ok": True}


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
    db = db()
    rows = db.execute(
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

    endpoint = cfg.get("llm", {}).get("endpoint", "http://localhost:1234/v1")
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
    for i in range(15):
        try:
            r = _req.get(f"{base_url}/api/v0/models", timeout=2)
            if r.status_code == 200:
                logger.info(f"LM Studio headless server is up (took ~{i+1}s)")
                return
        except Exception:
            pass
        import time as _time
        _time.sleep(1)

    logger.warning("LM Studio auto-start: server did not become reachable within 15 seconds")


@app.on_event("startup")
async def startup_event():
    """Application startup: run preflight, init vector store, auto-start LM Studio, init ModelManager."""
    global model_manager, vector_store

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
            logger.info("Vector Store Initialized")
        except Exception as e:
            vector_store = None
            logger.warning(f"Vector Store unavailable, session-only memory mode active: {e}")

    cfg = load_config()

    # Auto-start LM Studio headless if configured and unreachable
    _try_auto_start_lmstudio(cfg)

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
    endpoint = cfg.get("llm", {}).get("endpoint", "http://localhost:1234/v1")
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
