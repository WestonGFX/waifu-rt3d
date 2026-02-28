# Waifu-RT3D

> **AI Companion Platform** — 3D anime avatars with personality-driven animation, local/cloud LLM integration, 9-provider TTS, offline STT, agentic tool use, and OBS streaming overlays.

[![Python](https://img.shields.io/badge/python-3.11%2B-blue)](requirements.txt)
[![Tests](https://img.shields.io/badge/tests-98%20passed-brightgreen)](backend/tests/)
[![Schema](https://img.shields.io/badge/DB%20schema-v21-purple)](#)
[![Frontends](https://img.shields.io/badge/frontends-Neon%20%7C%20Sakura-ff69b4)](#dual-frontend-architecture)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

<p align="center">
  <img src="frontends/neon/favicon.svg" alt="Waifu-RT3D" width="80" />
</p>

---

## What Is This?

Waifu-RT3D is a **full-stack AI companion platform** where 3D anime characters come alive with personality-driven animations, natural conversation, and expressive voices — all running locally on your machine with optional cloud providers.

**Key highlights:**
- **3D VRM characters** with real-time lip sync, personality-driven idle fidgets, emotion posture, and mouse gaze tracking
- **Local-first LLMs** via LM Studio, Ollama, or any OpenAI-compatible endpoint — plus Gemini and Claude cloud options
- **9 TTS providers** including fully offline options (Kokoro, Piper, Chatterbox, Edge-TTS)
- **Agentic characters** that can use tools — search memory, write diary entries, modify their own traits, generate images, and message other characters
- **OBS Browser Source overlay** for streamers with transparent background and live subtitles
- **Create-a-Waifu** full-page character creator with personality animation sliders
- **Desktop pet mode** — floating transparent window with mini-chat overlay
- **32 Sakura companion features** — Session summaries, context budget bar, mood board, branching visualizer, relationship web, character portfolio cards, session replay, ambient soundscapes, model arena, scenario library, global search, milestone celebrations, schedule editor, message reactions, incognito mode, and more
- **Remote GPU motion server** — auto-discovers and connects to an animation server over LAN for real-time GPU-accelerated motion
- **Mobile PWA** — full Sakura UI as installable Progressive Web App with bottom tab navigation

---

## Quick Start

### Prerequisites
- **Python 3.11+**
- **LM Studio** (recommended) or any OpenAI-compatible LLM endpoint
- macOS / Linux / Windows (WSL or native)

### Option A: Interactive Installer (Recommended)

```bash
git clone https://github.com/WestonGFX/waifu-rt3d.git
cd waifu-rt3d
./setup.sh
```

The installer walks you through Python venv creation, dependency installation, optional TTS/Sakura frontend setup, and database initialization. It also supports `--repair` (fix existing installs) and `--minimal` (core deps only).

### Option B: Manual Installation

```bash
git clone https://github.com/WestonGFX/waifu-rt3d.git
cd waifu-rt3d

# Install Python deps
pip install -r requirements.txt

# Optional: local TTS/STT engines
pip install edge-tts          # Microsoft Edge TTS (free, recommended)
pip install faster-whisper    # Offline STT (CPU or GPU)
pip install kokoro-onnx       # Kokoro TTS (local, high quality)

# Optional: build Sakura frontend (requires Node.js 18+)
cd frontends/sakura && npm install && npm run build && cd ../..

# Run
python backend/server.py
```

Open **http://localhost:8080** in your browser.

> **First run:** The app creates `backend/config/app.json` with defaults and initializes the SQLite database. Point your LLM settings at a running LM Studio instance and you're ready to chat.

---

## Features

### 3D Character System
- **VRM model rendering** — Three.js + `@pixiv/three-vrm`, supports VRM 0.x and 1.x
- **6-layer animation pipeline** (Phase 6F) — personality-driven movement:
  - L0 BasePose: breathing rhythm scaled by energy/nervousness
  - L1 IdleBehavior: 22 fidgets gated by personality (hair twirl, hip cock, peace sign, etc.)
  - L2 Emotion: additive posture from current mood (happy bounce, sad slouch, pouty sway)
  - L3 Talk: illustrative hand gestures and head nods during speech
  - L4 Gesture: 14 triggered animations (wave, bow, dance, clap, think, etc.)
  - L5 LookAt: mouse tracking + idle gaze wander (always additive)
- **Personality profiles** — 5 floats (energy, confidence, nervousness, expressiveness, playfulness) that scale every animation parameter
- **Multi-band lip sync** — FFT spectral analysis drives 3 visemes (aa/ou/ee) for natural mouth movement
- **Expression blending** — smooth transitions between emotions (happy, sad, angry, surprised, confused, thinking)
- **Camera presets** — Full Body / Bust / Face with smooth tween transitions
- **Disco/party lighting** — RGB point lights with hue cycling
- **Shadow quality toggle** — Off / Soft / Sharp
- **Desktop pet mode** — transparent floating window with mini chat overlay

### LLM Integration
- **LM Studio** — local GPU inference, privacy-first (recommended)
- **Ollama** — local CPU/GPU
- **OpenAI-compatible** — any endpoint (OpenAI, Together, Groq, etc.)
- **Google Gemini** — Flash/Pro/2.5 with native SDK
- **Anthropic Claude** — Haiku/Sonnet/Opus with streaming SSE
- Per-character LLM routing (different models per character)
- Per-character temperature slider
- Conversation history with configurable limit + auto-compression
- Qwen3 thinking mode toggle
- History auto-summarization at 90% of limit

### Agentic Characters (Phase 10)
Characters with agentic mode enabled can autonomously use tools during conversation:
- **Memory search** — RAG-powered retrieval from conversation history
- **Diary writing** — LLM writes session diary entries that persist
- **Self-modification** — change own greeting, traits, background
- **Relationship tracking** — check and respond to affinity/mood/trust scores
- **Image generation** — trigger AI art via ComfyUI/SD adapters
- **Voice synthesis** — generate speech with per-character voice config
- **Knowledge base** — search uploaded character documents
- **Cross-character messaging** — characters can talk to each other
- **Webhook events** — fire outbound webhooks for Zapier/n8n integration

### TTS (Text-to-Speech) — 9 Providers

| Provider | Config Key | Type | Quality | Notes |
|----------|-----------|------|---------|-------|
| Edge TTS | `edge-tts` | Cloud (free) | Good | 400+ neural voices, no API key needed |
| Kokoro | `kokoro` | Local | Excellent | ONNX, fast, 15+ voices |
| Chatterbox | `chatterbox` | Local | Excellent | Zero-shot voice cloning, expressive |
| GPT-SoVITS | `gptsovits` | Local | Best | Voice cloning, anime-optimized, needs GPU |
| Piper | `piper_local` | Local | Good | Fully offline, ONNX voice packs |
| XTTS | `xtts_server` | Local | Good | Local server, voice cloning |
| ElevenLabs | `elevenlabs` | Cloud | Premium | Paid API |
| Fish Audio | `fish_audio` | Cloud | Great | Cloud or self-hosted |
| Pinokio/Generic | `pinokio` | Local | Varies | Any REST TTS server |

Additional TTS features:
- **Sentence-chunked streaming** — first audio in ~1-2s instead of 8-15s
- **Content-addressed audio cache** — instant repeat phrases
- **Emotion-modulated speech** — rate/pitch adjust per emotion
- **Per-character voice settings** — voice ID, rate, pitch overrides
- **Voice sample upload** — for voice cloning adapters (Chatterbox, GPT-SoVITS, XTTS)
- **Voice preview button** — test voices before assigning

### STT (Speech-to-Text)

| Provider | Config Key | Notes |
|----------|-----------|-------|
| Faster-Whisper | `faster_whisper` | Local, offline, CPU or GPU, VAD filter |
| Whisper API | `whisper_api` | OpenAI cloud |
| Browser WebSpeech | `browser` | Built-in, online only |

- **VAD threshold slider** — adjust noise gate sensitivity
- **ASR confidence display** — minimum threshold to accept transcription
- **Live transcription preview** — see words as you speak

### Character Management
- **Create-a-Waifu** — full-page character creator with tabbed wizard (Identity, Appearance, Voice, Personality)
- **Personality animation sliders** — 5 sliders that control how the character moves in 3D
- **Character roster** — card-based grid with quick-edit and character switching
- **Character export/import** — share characters as JSON packages
- **Capability profiles** — per-character LLM requirements (model tier, context budget, feature flags)
- **Relationship scores** — affinity, mood, trust that evolve through conversation
- **Daily greeting injection** — auto-sent on first chat of the day
- **Mood persistence** — emotion carries between sessions
- **Character diary** — LLM-written session summaries that influence future behavior
- **Anniversary tracking** — milestone detection based on first chat date

### Dual Frontend Architecture

Two complete frontends sharing the same backend:

- **Neon** (default) — Cyberpunk bento-grid dashboard, vanilla JS, power-user focused
- **Sakura** (new) — Clean, chat-first consumer UI with visual novel dialogue. React 19 + Vite + Tailwind CSS + Framer Motion. Two theme modes: Sakura (warm rose pink) and Crystal (cool ice blue).

Switch frontends via `default_frontend` in config or visit `/neon` and `/sakura` directly. Both use the same API and share the 3D viewer iframe.

### Sakura Frontend — Feature Panels

The Sakura UI ships with 16+ companion feature panels accessible via keyboard shortcuts or the overlay system:

| Shortcut | Panel | Description |
|----------|-------|-------------|
| `alt+s` | Session Summary | Auto-generated session recap with stats and highlights |
| `alt+h` | Schedule Editor | Set character availability windows and day-off toggles |
| `alt+f` | Global Search | Full-text search across all messages (FTS5 + LIKE fallback) |
| `alt+i` | Scenario Library | Browse and load pre-written scenario prompts |
| `alt+b` | Mood Board Editor | Pin and annotate images to set visual context for conversations |
| `alt+p` | Model Arena | Compare responses from two LLM configs side by side |
| `alt+r` | Session Replay | Replay any previous session as a scrolling timeline |
| `alt+o` | Character Portfolio | Card-based portfolio view of all characters with stats |
| `alt+w` | Relationship Web | Visual graph of character affinity and trust scores |
| `alt+a` | Analytics Panel | Word frequency, emotion arc, latency sparklines, TPS |
| — | Context Budget Bar | Token usage indicator, color-coded green/yellow/red |
| — | Milestone Celebration | Full-screen confetti on affinity tier advance |
| — | Compression Preview | Preview context compression before it fires |
| — | Message Reactions | Emoji reactions on individual messages |
| — | Soundscape Player | Ambient audio loops (rain, café, forest, etc.) |
| — | Backstory Generator | AI-generated character backstory from traits |

### UI / UX
- **Cyberpunk "Neon" bento-grid layout** — no framework, vanilla JS modules
- **Sakura chat-first layout** — React 19, visual novel dialogue bubbles, progressive disclosure settings, 5-step character creation wizard
- **Markdown chat rendering** — code blocks, bold, lists in AI responses
- **Token counter** — real-time generation stats (tokens, tok/s, latency)
- **Timestamps toggle** — show/hide message timestamps
- **Font size control** — S/M/L accessibility setting
- **Keyboard shortcuts** — customizable hotkey editor
- **Connection quality indicator** — green/yellow/red latency dot
- **Backend offline banner** — auto-reconnect with watchdog polling
- **TTS audio cache widget** — view/clear synthesized audio cache
- **FPS counter** — in-viewer overlay + settings panel display
- **Screenshot capture** — export current viewport as PNG

### OBS Streaming Overlay
- Add as **Browser Source**: `http://localhost:8080/viewer/overlay.html`
- Transparent background — character floats over your stream
- Live subtitles from AI responses
- Receives speak/animate events via WebSocket (`/ws/overlay`)

---

## Configuration

Settings are stored in `backend/config/app.json` and editable via the in-app **Settings** panel (gear icon or `Ctrl+,`). See [docs/SETTINGS_REFERENCE.md](docs/SETTINGS_REFERENCE.md) for the complete reference of all 75+ configuration keys.

### LLM Setup

```json
{
  "llm": {
    "provider": "lmstudio",
    "endpoint": "http://127.0.0.1:1234/v1",
    "model": "",
    "api_key": "lm-studio"
  }
}
```

Set `provider` to: `lmstudio`, `ollama`, `local` (OpenAI-compat), `gemini`, or `claude`.

### TTS Setup

```json
{
  "tts": {
    "provider": "edge-tts",
    "voice_id": "en-US-AriaNeural"
  }
}
```

Most local TTS engines (Kokoro, Chatterbox, XTTS) require running a separate server. Edge-TTS works out of the box with just `pip install edge-tts`.

---

## Architecture

```
waifu-rt3d/
├── backend/
│   ├── server.py              # FastAPI server (main application)
│   ├── preflight.py           # DB migrations (schema v3 → v16)
│   ├── llm/
│   │   ├── registry.py        # LLM adapter factory
│   │   └── adapters/          # openai_compat, ollama, lmstudio, gemini, claude_api
│   ├── tts/
│   │   ├── registry.py        # TTS adapter factory
│   │   └── adapters/          # edge_tts, kokoro, chatterbox, gptsovits, elevenlabs, …
│   ├── asr/
│   │   ├── registry.py        # STT adapter factory
│   │   └── adapters/          # faster_whisper, whisper_api
│   ├── agent/
│   │   ├── runner.py          # Agentic loop (XML tool call parser)
│   │   ├── tools/             # 11 agent tools (voice, diary, memory, image, etc.)
│   │   └── registry.py        # Tool registry
│   ├── models/
│   │   └── manager.py         # LM Studio model manager integration
│   ├── memory/
│   │   └── vector_store.py    # RAG vector store (sentence-transformers)
│   ├── config/
│   │   └── app.json           # Runtime configuration
│   ├── storage/
│   │   ├── app.db             # SQLite database (schema v21)
│   │   ├── avatars/           # Uploaded VRM/GLB files
│   │   ├── audio/             # Generated TTS audio cache
│   │   └── images/            # AI-generated images
│   └── tests/                 # 98 pytest tests
├── frontends/
│   ├── shared/                # Assets shared between frontends
│   │   ├── viewer/            # Three.js VRM renderer + OBS overlay
│   │   │   ├── viewer.html    # 6-layer animation pipeline
│   │   │   └── overlay.html   # OBS transparent overlay
│   │   └── lib/               # Three.js, GLTFLoader, Live2D, PixiJS
│   ├── neon/                  # Cyberpunk bento-grid UI (vanilla JS)
│   │   ├── index.html
│   │   ├── js/
│   │   │   ├── core/          # StateManager, EventBus, Logger, API
│   │   │   ├── components/    # ChatInterface, SettingsModal, WaifuCreator, …
│   │   │   └── utils/         # Toast, KeyboardShortcuts, VoicePicker
│   │   └── css/               # Cyber glass theme stylesheets
│   └── sakura/                # Chat-first consumer UI (React 19 + Vite)
│       └── src/
│           ├── views/         # ChatsView, ChatThread, CreateView, SettingsView
│           ├── components/    # DialogueBubble, ModelPanel, TabBar, VoicePicker
│           ├── hooks/         # useTheme, useViewer, useProactive
│           ├── stores/        # Zustand (appStore, chatStore)
│           ├── styles/        # Sakura + Crystal CSS themes
│           └── lib/           # Typed API client, event bus
├── setup.sh                   # Interactive installer (fresh + repair modes)
└── docs/
    ├── plans/                 # Design docs and implementation plans
    ├── USER_GUIDE.md
    ├── SETTINGS_REFERENCE.md  # All 75+ configuration keys
    ├── VRM_INTEGRATION.md
    └── CHANGELOG.md
```

### Key API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | Health check (version, uptime, LLM/DB status) |
| `GET/POST` | `/api/characters` | List / create characters |
| `PUT` | `/api/characters/{id}` | Update character (all fields) |
| `GET` | `/api/characters/{id}/export` | Export character as JSON |
| `POST` | `/api/characters/import` | Import character from JSON |
| `GET` | `/api/characters/{id}/relationship` | Affinity/mood/trust scores |
| `POST` | `/api/chat` | Non-streaming chat |
| `GET` | `/api/chat/stream` | SSE streaming chat (with chunked TTS) |
| `POST` | `/api/tts` | Direct TTS synthesis |
| `POST` | `/api/asr/transcribe` | Faster-Whisper STT |
| `GET` | `/api/tts/cache` | Audio cache stats |
| `GET` | `/api/v2/telemetry/summary` | Error/latency metrics |
| `GET` | `/api/v2/memory/search` | RAG memory search |
| `WS` | `/ws/overlay` | OBS overlay WebSocket |

### Database Schema (v21)

The SQLite database (schema v21) auto-migrates on startup. Key tables:
- **sessions** — chat sessions with summary and archive support
- **messages** — chat history with emotion, branching (parent_id), token stats
- **characters** — full character profiles (34 columns including animation_profile, capability_profile, diary, voice config)
- **character_relationships** — affinity/mood/trust scores per character
- **prompt_templates** — reusable system prompt templates
- **character_docs** — uploaded reference documents
- **message_reactions** — emoji reactions per message (added v21)

---

## Running Tests

```bash
# Run all 98 tests
python -m pytest backend/tests/ -v

# Quick run (stop on first failure)
python -m pytest backend/tests/ -x --tb=short
```

Tests cover: API endpoints, character CRUD, agentic tool execution, capability profiles, telemetry, memory search, routing, and chat pipeline.

---

## Roadmap

### Recently Completed
- **Sakura Frontend** — chat-first consumer UI with visual novel dialogue, two themes, progressive disclosure settings
- **TTS Model Manager** — browse, download, and manage local TTS voice packs on-demand
- **Voice picker dropdown** — grouped voice selector replacing free-text voice ID inputs
- **Interactive installer** — `setup.sh` with fresh install, repair, and minimal modes

### Future
- Electron desktop app (macOS + Windows)
- Twitch chat integration
- Docker Compose one-command setup
- Plugin / extension system
- TTS provider health checks — verify which engines are running

---

## Changelog

See [docs/CHANGELOG.md](docs/CHANGELOG.md) for version history.

---

## License

MIT — see [LICENSE](LICENSE).
