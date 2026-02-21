# Waifu-RT3D v5.32: The Ultimate AI Companion Platform

![Status](https://img.shields.io/badge/Status-Beta_Active-brightgreen) ![Version](https://img.shields.io/badge/Version-5.32.0_dev-blueviolet) ![License](https://img.shields.io/badge/License-MIT-gray) ![Platform](https://img.shields.io/badge/Platform-Mac_Apple_Silicon_|_Windows_NVIDIA_RTX-blue)

> **"Not just a chatbot. A living, breathing digital entity."**

**Waifu-RT3D** is a commercial-grade web application that bridges the gap between static LLM
chat and immersive 3D/Live2D experiences. Built on a hybrid architecture of **FastAPI** (Python)
and **Three.js / VRM** (JavaScript), it delivers real-time, hardware-accelerated anime avatars
that listen, speak, and emote — all running locally on your hardware.

See `ARCHITECTURE.md` for the full technical reference.

---

## 📚 Table of Contents

1. [What's New in v5.32](#-whats-new-in-v532)
2. [Hardware Requirements & Tiers](#-hardware-requirements--tiers)
3. [Installation Guide](#-installation-guide)
4. [The Neon Interface](#-the-neon-interface)
5. [Configuration Manual](#-configuration-manual)
6. [System Architecture](#-system-architecture)
7. [API Documentation](#-api-documentation)
8. [Developer Guide](#-developer-guide)
9. [Troubleshooting & FAQ](#-troubleshooting--faq)

---

## 🚀 What's New in v5.32

Phases 3A–4A-2 (February 2026):

- **Animation Overhaul** (3G): Phoneme lip sync via 3-band FFT, auto-gesture triggers, PostMessage API expansion.
- **VRM Jitter & Flicker Fix** (4A-1): CSS `will-change` GPU layers eliminate canvas flicker; delta-cap smooths VRM bone jitter.
- **Live Metrics Dashboard** (4A-1): FPS counter, TTFT (Time To First Token), GPU/VRAM stats, LLM provider label.
- **DevConsole ERRORS tab** (4A-2): JS error hook + backend poll; "Open Error Log" button in Settings.
- **Glow / FPS Cap / Overlay Toggle** (4A-2): Glow intensity wired to `--glow-intensity` CSS var; FPS cap + overlay toggle persists across sessions.
- **Session Management** (3B): Pin, archive, duplicate, export sessions.
- **Memory Graph RAG** (3D): Vector store query + graph-based retrieval; `/api/chat/multi` for multi-character group chat.
- **Themes** (3F): Hacker Green, Blurple + custom Theme Editor.
- **Keyboard Shortcuts** (3F+): `Ctrl+,` Settings, `Ctrl+Shift+D` DevConsole, `Alt+1–9` quick character switch.

---

## 💻 Hardware Requirements & Tiers

### Tier 1: Apple Silicon (M1/M2/M3/M4)

| Component | Recommendation |
| :--- | :--- |
| **RAM** | 16GB Unified Memory (32GB for 12B+ models) |
| **LLM** | 4–8-bit Quantized Models (7B–12B) via LM Studio Metal backend |
| **TTS** | **Sherpa-ONNX** (CoreML) or **Edge-TTS** (cloud, free) |
| **ASR** | Whisper-Base (CoreML optimised via Sherpa) |

### Tier 2: NVIDIA Workstation (RTX 3060+)

| Component | Recommendation |
| :--- | :--- |
| **VRAM** | 12GB minimum, 24GB for 30B+ models |
| **LLM** | FP16 / 8-bit (13B–70B) via CUDA in LM Studio |
| **TTS** | **XTTS v2** (Coqui) or **ElevenLabs** |
| **ASR** | Whisper-Large-v3 (real-time) |

---

## 📦 Installation Guide

### Prerequisites

1. **Python 3.11+** — `python --version` to verify.
2. **Git** — to clone the repo.
3. **LM Studio** — download from [lmstudio.ai](https://lmstudio.ai/). Enable the Local API server (port 1234).

### Step-by-Step Setup

#### 1. Clone

```bash
git clone https://github.com/WestonGFX/waifu-rt3d.git
cd waifu-rt3d
```

#### 2. Create a Virtual Environment

```bash
python -m venv venv
source venv/bin/activate   # Mac/Linux
# venv\Scripts\activate    # Windows
```

#### 3. Install Python Dependencies

```bash
pip install -r requirements.txt
```

#### 4. Launch the Server

The backend auto-initialises the database on first run — no separate init script needed.

```bash
python backend/server.py
```

Expected output:

```text
INFO:     Application startup complete.
INFO:     Uvicorn running on http://0.0.0.0:8080
```

#### 5. Open the App

Navigate to **<http://localhost:8080>** in Chrome/Edge/Safari/Firefox.

---

## 🎮 The Neon Interface

The main UI is a cyberpunk glassmorphism layout with three panels:

- **Left Sidebar**: Character roster. Click a card to hot-swap the active persona.
- **Center Panel**: Chat interface with streaming token display, session list, and session controls (pin, archive, export).
- **Right Panel** (collapsed by default): Live stats — FPS, CPU, RAM, VRAM, TTFT, tok/s, LLM model.

### 3D Interaction Controls

| Action | Mouse / Trackpad | Keyboard |
| :--- | :--- | :--- |
| **Rotate Camera** | Left Click + Drag | — |
| **Zoom** | Scroll / Pinch | `+` / `-` |
| **Reset Camera** | Double Click | `Ctrl+0` |
| **Push-to-Talk** | Hold Mouse 4 | Hold `Spacebar` |
| **Toggle Mic** | Click mic icon | `V` |
| **Settings** | Gear icon | `Ctrl+,` |
| **DevConsole** | — | `Ctrl+Shift+D` |

---

## ⚙️ Configuration Manual

Configuration lives in `backend/config/app.json`. The Settings UI in the Neon frontend
writes directly to this file — you rarely need to edit it manually.

### Key `app.json` Fields

```json
{
  "llm": {
    "provider": "lmstudio",
    "endpoint": "http://localhost:1234/v1",
    "api_key": "lm-studio",
    "model": "gemma-3-12b-it",
    "history_limit": 0
  },
  "tts": {
    "provider": "edge-tts",
    "enabled": true
  },
  "speech_rate": 1.0,
  "pitch_shift": 0,
  "voice_stability": 0.5,
  "interrupt_mode": true,
  "glow_intensity": 50,
  "ui_border_radius": 12,
  "ui_blur": 10,
  "ui_font_size": 14,
  "theme": "Synthwave UI (Dark)",
  "bg_mode": "Bento Gradient"
}
```

**Important keys:**

| Key | Type | Default | Notes |
| :--- | :--- | :--- | :--- |
| `llm.endpoint` | string | `http://localhost:1234/v1` | OpenAI-compatible base URL |
| `llm.model` | string | `""` | Model name as shown in LM Studio |
| `llm.history_limit` | int | `0` | `0` = unlimited context |
| `speech_rate` | float | `1.0` | 0.5–2.0; multiplier → EdgeTTS `+N%` format |
| `pitch_shift` | int | `0` | −10 to +10 semitones |
| `interrupt_mode` | bool | `true` | Stop TTS when VAD detects speech |
| `glow_intensity` | int | `50` | 0–100 → CSS `--glow-intensity` |

---

## 🏗 System Architecture

See `ARCHITECTURE.md` for the complete module graph, DB schema V8, PostMessage API, and
SSE event type reference.

### Backend Topology (Summary)

```
FastAPI server.py
  ├── llm/registry.py → llm/adapters/{openai_compat, lmstudio_rest, ollama}
  ├── tts/registry.py → tts/adapters/{edge_tts, elevenlabs, xtts_server, piper_local, fish_audio}
  ├── asr/adapters/    (Whisper, Sherpa-ONNX)
  ├── memory/vector_store.py  (ChromaDB)
  ├── vocab/manager.py
  └── models/manager.py
```

### Database Schema V8

**`characters`** — `id, name, system_prompt, voice_id, tts_provider, tts_pitch, tts_rate,`
`avatar_path, vrm_model_url, live2d_model, background_url, background_mode,`
`vocab_categories, affinity, mood, trust`

**`sessions`** — `id, title, created_ts, is_pinned, is_archived`

**`messages`** — `id, session_id, role, text, emotion, char_id, audio_path,`
`token_count, input_token_count, generation_time_ms, tokens_per_second,`
`parent_id, is_active, ts`

**`character_relationships`** — `char_id, affinity, mood, trust, interactions, last_updated`

---

## 📡 API Documentation

### POST `/api/chat/stream` *(Primary)*

Streaming chat via Server-Sent Events. Returns token deltas in real time.

**Request body:**
```json
{ "text": "Hello!", "session_id": 1, "character_id": 1 }
```

**SSE events:**
| Event | Payload |
| :--- | :--- |
| `processing` | `{"input_tokens": N}` |
| `generating` | `{"status": "first_token"}` |
| `token` | `{"t": "hello"}` |
| `done` | `{"reply", "emotion", "gesture", "token_count", "tokens_per_second", ...}` |
| `error` | `{"error": "..."}` |

### POST `/api/chat`

Non-streaming chat. Returns full reply + optional TTS URL.

### GET `/api/health`

Server health check.

**Response:**
```json
{
  "ok": true,
  "version": "5.32.0",
  "services": {
    "db": "connected",
    "llm": "connected",
    "vector_store": "active"
  }
}
```

### GET `/api/characters`

List all characters.

### GET `/api/sessions` / `POST /api/sessions`

List or create sessions. Supports `?archived=true` and `?search=query`.

### GET `/api/stats`

Real-time system metrics: CPU, RAM, GPU/VRAM, LLM provider, model.

### GET `/api/config` / `PUT /api/config`

Read or update `app.json` config.

---

## 👨‍💻 Developer Guide

### Directory Structure

```text
waifu-rt3d/
├── backend/
│   ├── server.py              # FastAPI server (~1100 lines)
│   ├── preflight.py           # DB auto-migration (schema V8)
│   ├── config/app.json        # Runtime configuration
│   ├── llm/                   # LLM adapters + router
│   ├── tts/                   # TTS adapters + registry
│   ├── asr/                   # ASR adapters
│   ├── memory/vector_store.py # ChromaDB vector memory
│   ├── vocab/                 # Vocabulary injection (egirl_vocab_v3)
│   ├── models/manager.py      # LM Studio model management
│   └── storage/               # app.db, avatars/, audio/, images/
├── frontends/
│   ├── neon/                  # Main Neon UI (Vanilla JS)
│   │   ├── index.html
│   │   ├── js/
│   │   │   ├── main.js        # Boot entry point
│   │   │   ├── core/          # StateManager, API, EventBus, Logger
│   │   │   ├── components/    # ChatInterface, Dashboard, SettingsModal, ...
│   │   │   └── utils/         # Toast, KeyboardShortcuts, PushToTalk, VAD
│   │   ├── viewer/            # Isolated Three.js / VRM iframe
│   │   ├── live2d/            # Live2D manager
│   │   ├── css/
│   │   └── lib/               # Three.js, @pixiv/three-vrm, live2d.min.js
│   └── classic/               # Legacy diagnostic dashboard
├── docs/                      # CHANGELOG, ARCHITECTURE, archived docs
├── egirl_vocab/               # Vocabulary pack (v3 active)
├── tools/                     # Utility scripts
└── backend/tests/             # pytest integration tests
```

### Running Tests

```bash
python -m pytest backend/tests/ -x -q
# Expected: 21 passed, 0 failures (no LM Studio required)
```

---

## ❓ Troubleshooting & FAQ

### Q: The 3D view is just a black screen

1. Check browser console (F12) for 404 errors on VRM files.
2. Enable "Hardware Acceleration" in your browser settings.
3. Load the viewer directly: `http://localhost:8080/viewer/viewer.html?url=/files/avatars/Rin.vrm`

### Q: The AI isn't replying

1. Is LM Studio running with the Local API Server enabled?
2. Is it on port 1234? Check `backend/config/app.json` → `llm.endpoint`.
3. Check the terminal running `server.py` for error logs.
4. Call `GET /api/health` to see LLM connectivity status.

### Q: Database errors / missing tables

The database is at `backend/storage/app.db`. Schema migrations run automatically on startup
via `preflight.py`. If you see schema errors:

1. Stop the server.
2. Delete `backend/storage/app.db`.
3. Restart — the DB is recreated from scratch with all characters.

### Q: Settings I changed disappeared after refresh

Visual settings (glow, blur, font size, border radius) are now applied from config on every
page load. If you still see reset values, clear your browser cache or check that
`backend/config/app.json` was saved correctly.

---

**© 2026 WestonGFX / Waifu-RT3D Project**
*Building the interface for the future of AI.*
