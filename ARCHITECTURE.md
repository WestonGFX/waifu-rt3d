# Waifu-RT3D — Architecture Reference

> **Current version:** 5.32.0-dev (February 2026)
> This document describes the actual runtime architecture. It supersedes the old module graph
> in the README and the abandoned React/TypeScript pivot described in the archived `GEMINI.md`.

---

## 1. Directory Layout

```text
waifu-rt3d/
├── backend/
│   ├── server.py              # FastAPI entry point (~1100 lines)
│   ├── preflight.py           # DB auto-migration + startup checks
│   ├── config/
│   │   └── app.json           # Runtime config (read/written by Settings UI)
│   ├── llm/
│   │   ├── registry.py        # get_client(cfg) → correct adapter
│   │   ├── router.py          # Multi-model routing (intent-based model selection)
│   │   └── adapters/
│   │       ├── base.py
│   │       ├── openai_compat.py  # Default: LM Studio / OpenAI API
│   │       ├── lmstudio_rest.py  # LM Studio REST v0 API (model load/unload)
│   │       └── ollama.py
│   ├── tts/
│   │   ├── registry.py        # get_tts(cfg) → correct adapter
│   │   └── adapters/
│   │       ├── base.py        # TTSAdapter ABC + _mk_name() hash helper
│   │       ├── edge_tts.py    # Microsoft Edge TTS (cloud, free)
│   │       ├── elevenlabs.py  # ElevenLabs API (paid)
│   │       ├── xtts_server.py # Coqui XTTS local server
│   │       ├── piper_local.py # Piper local TTS
│   │       └── fish_audio.py  # Fish Audio API
│   ├── asr/
│   │   └── adapters/          # Whisper, Sherpa-ONNX, browser passthrough
│   ├── memory/
│   │   └── vector_store.py    # ChromaDB vector memory (RAG)
│   ├── vocab/
│   │   ├── manager.py         # Vocab injection into system prompt
│   │   └── egirl_vocab_v3.json
│   ├── models/
│   │   └── manager.py         # LM Studio model download/load/unload
│   ├── storage/
│   │   ├── app.db             # SQLite database (schema V8)
│   │   ├── avatars/           # VRM/GLB avatar files
│   │   ├── audio/             # Generated TTS audio files
│   │   ├── images/            # Character portrait images
│   │   ├── live2d/            # Live2D model files
│   │   └── memory/            # ChromaDB persisted data
│   └── tests/                 # pytest integration suite (21 tests)
├── frontends/
│   ├── neon/                  # Main Neon UI (Vanilla JS, no framework)
│   │   ├── index.html
│   │   ├── js/
│   │   │   ├── main.js        # Boot: instantiates all components, registers shortcuts
│   │   │   ├── core/
│   │   │   │   ├── StateManager.js   # Singleton — app state + API sync
│   │   │   │   ├── API.js            # fetch wrapper (GET/POST/stream/upload)
│   │   │   │   ├── EventBus.js       # Pub/sub event system
│   │   │   │   └── Logger.js         # Filterable dev console
│   │   │   ├── components/
│   │   │   │   ├── ChatInterface.js  # Message rendering, streaming, TTS, VAD
│   │   │   │   ├── Dashboard.js      # Stats panels (CPU, RAM, GPU, FPS, TTFT)
│   │   │   │   ├── SettingsModal.js  # Full settings UI (all sliders/toggles)
│   │   │   │   ├── CharacterGrid.js  # Character selection sidebar
│   │   │   │   ├── ViewerBridge.js   # postMessage relay to viewer iframe
│   │   │   │   ├── DevConsole.js     # LOGS / ERRORS / NETWORK tabs
│   │   │   │   ├── ExpressionEditor.js
│   │   │   │   ├── ThemeEditor.js
│   │   │   │   ├── ModelManager.js   # LM Studio model download/load UI
│   │   │   │   ├── MemoryManager.js  # Vector memory browser
│   │   │   │   ├── VocabManager.js
│   │   │   │   ├── HotkeyEditor.js
│   │   │   │   └── PersonaCreator.js
│   │   │   ├── utils/
│   │   │   │   ├── Toast.js
│   │   │   │   ├── KeyboardShortcuts.js
│   │   │   │   ├── PushToTalk.js     # PTT voice input via browser ASR
│   │   │   │   └── VAD.js            # Voice Activity Detection (continuous)
│   │   │   └── live2d/
│   │   │       └── Live2DManager.js  # PIXI.js + Cubism 2 renderer
│   │   ├── viewer/
│   │   │   ├── viewer.html    # Isolated WebGL iframe
│   │   │   └── viewer.js      # Three.js + @pixiv/three-vrm, animation loop, lip sync
│   │   ├── css/               # Cyberpunk Neon stylesheet + theme variables
│   │   └── lib/               # three.js, @pixiv/three-vrm, live2d.min.js
│   └── classic/               # Legacy diagnostic dashboard (not actively maintained)
├── docs/
│   ├── CHANGELOG.md
│   └── archive/               # Stale V2 cutover planning docs
├── egirl_vocab/               # Vocabulary packs (v3 active)
├── tools/                     # Utility scripts
└── _BACKUP_ROOT/              # Archived old versions / to-delete staging area
```

---

## 2. Backend Module Graph

```
server.py
│
├── startup (lifespan hook via preflight.py)
│     preflight.ensure_dirs()
│     preflight.ensure_config()
│     preflight.migrate_legacy_db_if_needed()
│     preflight.run_migrations()        ← schema V3→V8
│     models.manager.ModelManager()     ← LM Studio REST polling
│     memory.vector_store.VectorStore() ← ChromaDB init (optional)
│     vocab.manager.VocabManager()      ← loads egirl_vocab_v3.json
│
├── /api/chat  (POST)
│     llm.registry.get_client(cfg)
│       └── adapters.openai_compat.OpenAICompatAdapter.chat()
│     tts.registry.get_tts(cfg)
│       └── adapters.<provider>.speak()
│     memory.vector_store.add_memory() / query_memory()
│
├── /api/chat/stream  (POST → SSE)
│     llm.registry.get_client(cfg)
│     llm.router.get_router(cfg)        ← optional multi-model routing
│       └── adapters.<provider>.chat_stream()  [runs in thread]
│     memory.vector_store
│     vocab.manager.get_vocab_context()
│
├── /api/chat/multi  (POST)
│     [loop over character_ids]
│     adapters.openai_compat.OpenAICompatAdapter.chat()
│
└── /api/tts  (POST)
      tts.registry.get_tts(cfg)
        └── adapters.<provider>.speak()
```

---

## 3. Frontend Module Graph

```
index.html
  └── <script type="module" src="js/main.js">

main.js
  ├── imports: StateManager, EventBus, Logger, all Components, all Utils
  ├── _applyVisualConfig(cfg)   ← applies CSS vars from config on boot
  ├── applyBgMode(mode)         ← sets body[data-bg-mode]
  ├── new Dashboard()
  ├── new CharacterGrid()
  ├── new SettingsModal()
  ├── new ChatInterface()        ← core interaction loop
  │     ├── initPushToTalk()    ← PushToTalk.js (browser speech rec)
  │     └── initVAD()           ← VAD.js (continuous mic monitoring)
  ├── new ViewerBridge()         ← manages viewer iframe + postMessage relay
  ├── new DevConsole()
  ├── new ModelManager()
  ├── new MemoryManager()
  ├── new ExpressionEditor()
  ├── new ThemeEditor()
  ├── new VocabManager()
  ├── new HotkeyEditor()
  ├── new PersonaCreator()
  ├── state.init()              ← fetches /api/config, /api/characters, /api/sessions
  └── keyboard.register(...)   ← KeyboardShortcuts.js


viewer iframe (viewer/viewer.html)
  └── viewer.js
        ├── Three.js scene + renderer
        ├── @pixiv/three-vrm VRMLoaderPlugin
        ├── Animation loop: idle breathing + eye blink + mouse look
        ├── Phoneme lip sync (3-band FFT via Web Audio API)
        ├── Auto-gesture state machine
        └── postMessage API (see Section 6)
```

### EventBus Key Events

| Event | Emitter | Listeners |
| :--- | :--- | :--- |
| `character:selected` | CharacterGrid | ChatInterface, ViewerBridge |
| `session:selected` | ChatInterface | ChatInterface (loads history) |
| `sessions:updated` | StateManager | ChatInterface (renders list) |
| `config:updated` | SettingsModal | main.js (CSS vars, bgMode) |
| `chat:audioPlay` | ChatInterface | ViewerBridge (lip sync) |
| `multi-chat:start` | SettingsModal | ChatInterface |

---

## 4. Database Schema V8

All tables are in `backend/storage/app.db` (SQLite).

### `sessions`
```sql
id          INTEGER PRIMARY KEY AUTOINCREMENT,
title       TEXT,
created_ts  TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
is_pinned   INTEGER DEFAULT 0,
is_archived INTEGER DEFAULT 0
```

### `messages`
```sql
id                 INTEGER PRIMARY KEY AUTOINCREMENT,
session_id         INTEGER,
role               TEXT,                  -- 'user' | 'assistant' | 'system'
text               TEXT,
emotion            TEXT,
char_id            INTEGER,
audio_path         TEXT,
ts                 TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
token_count        INTEGER,               -- output tokens (V8)
input_token_count  INTEGER,               -- input tokens (V8)
generation_time_ms INTEGER,               -- wall-clock ms from first→last token (V8)
tokens_per_second  REAL,                  -- token_count / (generation_time_ms/1000) (V8)
parent_id          INTEGER,               -- for branching conversations
is_active          INTEGER DEFAULT 1,
client_message_id  TEXT                   -- dedup key from frontend
```

### `characters`
```sql
id               INTEGER PRIMARY KEY AUTOINCREMENT,
name             TEXT,
system_prompt    TEXT,
voice_id         TEXT,
tts_provider     TEXT,
tts_pitch        TEXT,
tts_rate         TEXT,
avatar_path      TEXT,
vrm_model_url    TEXT,
live2d_model     TEXT,
background_url   TEXT,
background_mode  TEXT,
vocab_categories TEXT,  -- JSON array
affinity         REAL DEFAULT 0.5,
mood             REAL DEFAULT 0.5,
trust            REAL DEFAULT 0.5
```

### `character_relationships`
```sql
char_id       INTEGER PRIMARY KEY,
affinity      REAL DEFAULT 0.5,
mood          REAL DEFAULT 0.5,
trust         REAL DEFAULT 0.5,
interactions  INTEGER DEFAULT 0,
last_updated  INTEGER
```

### `schema_version`
```sql
version  INTEGER
```
Current value: **8**

---

## 5. Config Keys Reference (`backend/config/app.json`)

| Key | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `llm.provider` | string | `"lmstudio"` | Adapter key: `lmstudio`, `openai`, `ollama`, `anthropic` |
| `llm.endpoint` | string | `"http://127.0.0.1:1234/v1"` | OpenAI-compat base URL |
| `llm.api_key` | string | `"lm-studio"` | API key (or `"lm-studio"` for local) |
| `llm.model` | string | `""` | Model name (must match LM Studio loaded model) |
| `llm.history_limit` | int | `0` | `0` = unlimited; N = last N messages |
| `context_limit` | int | `131072` | Max context tokens (Gemma3-12b default) |
| `temperature` | float | `0.7` | LLM sampling temperature |
| `repeat_penalty` | float | `1.1` | LLM repetition penalty |
| `tts.provider` | string | `"edge-tts"` | TTS adapter key |
| `tts.enabled` | bool | `true` | Master TTS on/off |
| `speech_rate` | float | `1.0` | 0.5–2.0; converted to EdgeTTS `+N%` format |
| `pitch_shift` | int | `0` | −10 to +10 semitones → `+NHz` |
| `voice_stability` | float | `0.5` | ElevenLabs `stability` (0–1) |
| `interrupt_mode` | bool | `true` | Stop TTS on VAD speech start |
| `thinking_visible` | bool | `true` | Show `<think>...</think>` blocks in chat |
| `visual_mode` | string | `"3D (VRM)"` | `"3D (VRM)"` \| `"Live2D"` \| `"2D Portrait"` |
| `theme` | string | `"Synthwave UI (Dark)"` | CSS theme name |
| `bg_mode` | string | `"Bento Gradient"` | Background mode (`body[data-bg-mode]`) |
| `glow_intensity` | int | `50` | 0–100 → `--glow-intensity` CSS var (÷100) |
| `ui_border_radius` | int | `12` | `--radius-panel` in px |
| `ui_blur` | int | `10` | `--glass-blur` in px |
| `ui_font_size` | int | `14` | `body.fontSize` in px |
| `layout_show_left` | bool | `true` | Show left sidebar |
| `layout_show_right` | bool | `true` | Show right panel |
| `fps_cap` | int | `60` | Viewer target FPS |
| `fps_overlay` | bool | `true` | Show FPS counter in viewer |
| `dev_mode` | bool | `false` | Verbose Logger + no-cache headers |

---

## 6. PostMessage API (viewer iframe ↔ parent)

### Parent → Viewer (commands sent TO `viewer.html`)

| `type` | Payload | Effect |
| :--- | :--- | :--- |
| `loadModel` | `{url, mode}` | Load VRM or Live2D model |
| `setExpression` | `{expression, intensity}` | Set VRM blendshape |
| `playGesture` | `{gesture}` | Trigger named gesture animation |
| `setBackground` | `{mode, url?}` | Change background (void/city/color/image) |
| `startLipSync` | `{audioUrl}` | Analyse audio file + drive phoneme blendshapes |
| `stopLipSync` | — | Stop lip sync |
| `captureScreenshot` | — | Request PNG data URL |
| `setGlowIntensity` | `{value}` | Set bloom post-process intensity |
| `setFPSCap` | `{fps}` | Set renderer target frame rate |
| `toggleFPSOverlay` | `{visible}` | Show/hide FPS counter overlay |
| `resetCamera` | — | Restore default camera position |
| `setMouseTracking` | `{enabled}` | Enable/disable head mouse-follow |

### Viewer → Parent (events sent FROM `viewer.html`)

| `type` | Payload | Meaning |
| :--- | :--- | :--- |
| `modelLoaded` | `{url}` | VRM successfully loaded |
| `modelFailed` | `{error}` | VRM load error |
| `screenshotCapture` | `{dataUrl}` | Screenshot PNG data URL response |
| `fpsUpdate` | `{fps}` | Current measured FPS (emitted ~1Hz) |

---

## 7. SSE Event Types (`/api/chat/stream`)

The streaming chat endpoint uses Server-Sent Events. Each line is
`event: <type>\ndata: <json>\n\n`.

| Event | JSON Keys | Timing |
| :--- | :--- | :--- |
| `processing` | `{input_tokens}` | Sent immediately; LLM prefill begins |
| `generating` | `{status: "first_token"}` | First token received from LLM |
| `token` | `{t: "<delta>"}` | Each token as it streams |
| `done` | `{reply, emotion, gesture, session_id, user_message_id, assistant_message_id, token_count, input_tokens, generation_time_ms, tokens_per_second, memory_hits}` | Stream complete |
| `error` | `{error: "<message>"}` | LLM or server error |

---

## 8. LM Studio REST v0 API (used by `ModelManager`)

| Method | Endpoint | Purpose |
| :--- | :--- | :--- |
| `GET` | `/api/v0/models` | List all downloaded + loaded models |
| `POST` | `/api/v0/load` | Load model into VRAM |
| `POST` | `/api/v0/unload` | Unload model from VRAM |
| `POST` | `/api/v0/download` | Download model by ID |
| `GET` | `/api/v0/download-status` | Poll download progress |

Base URL: strip `/v1` from the configured `llm.endpoint` (e.g. `http://127.0.0.1:1234`).
