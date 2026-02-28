# Waifu-RT3D

> **AI Companion Platform** — 3D anime avatars with personality-driven animation, local/cloud LLM integration, 9-provider TTS, offline STT, agentic tool use, mini games, lorebook, tiered memory, character moods, 18 themes, cinematic mode, and OBS streaming overlays.

[![Python](https://img.shields.io/badge/python-3.11%2B-blue)](requirements.txt)
[![Tests](https://img.shields.io/badge/tests-98%20passed-brightgreen)](backend/tests/)
[![Schema](https://img.shields.io/badge/DB%20schema-v30-purple)](#)
[![Themes](https://img.shields.io/badge/themes-18-ff69b4)](#themes)
[![Frontends](https://img.shields.io/badge/frontends-Neon%20%7C%20Sakura-ff69b4)](#dual-frontend-architecture)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

<p align="center">
  <img src="frontends/neon/favicon.svg" alt="Waifu-RT3D" width="80" />
</p>

---

## What Is This?

Waifu-RT3D is a **full-stack AI companion platform** where 3D anime characters come alive with personality-driven animations, natural conversation, and expressive voices — all running locally on your machine with optional cloud providers.

**Key highlights:**
- **3D VRM characters** with real-time lip sync, personality-driven idle fidgets, emotion-driven expressions, and mouse gaze tracking
- **Local-first LLMs** via LM Studio, Ollama, or any OpenAI-compatible endpoint — plus Gemini and Claude cloud options
- **9 TTS providers** including fully offline options (Kokoro, Piper, Chatterbox, Edge-TTS)
- **Agentic characters** that can use tools — search memory, write diary entries, modify their own traits, generate images, and message other characters
- **In-app mini games** — trivia, 20 questions, word association, riddles, tic-tac-toe, memory match with AI companions using coded game logic (not LLM)
- **Lorebook / World Info** — keyword-triggered context injection for persistent world lore, NPC definitions, and scenario rules (SillyTavern-compatible concept)
- **Tiered episodic memory** — three-tier memory (fleeting → recent → permanent) with sqlite-vec embeddings and configurable decay
- **Character moods & time-of-day states** — characters shift personality based on time of day and recent context
- **Emotion-driven VRM expressions** — every response triggers automatic facial expression blending from extracted emotion tags
- **18 built-in themes** — Sakura, Crystal, Matcha, Lavender, Peach, Midnight, Bubblegum, Blurple, Catppuccin Latte/Macchiato, Monokai, Darcula, Dracula, Tokyo Night, Pop Bubblegum, Pop Lemonade
- **Cinematic immersion mode** (Ctrl+I) — full-screen 3D viewer with floating dialogue bubbles, VN-style
- **Visual novel reader layout** — alternative chat rendering with typewriter animation and character portraits
- **SillyTavern character card import/export** — drag-drop PNG with embedded CHARA v2 JSON metadata
- **Author's note** — hidden director's note injected into context at a configurable position
- **User knowledge graph** — characters build and maintain structured knowledge about the user (name, preferences, life events)
- **Contextual opening greetings** — characters greet based on time gap, mood, recent memories, and special dates
- **Smart tool protocol detection** — auto-detects whether local LLMs support native function calling vs XML fallback
- **OBS Browser Source overlay** for streamers with transparent background and live subtitles
- **Create-a-Waifu** full-page character creator with personality animation sliders
- **Desktop pet mode** — floating transparent window with mini-chat overlay
- **50+ Sakura companion features** — session summaries, context budget bar, mood board, branching visualizer, relationship web, character portfolio cards, session replay, ambient soundscapes, model arena, scenario library, global search, milestone celebrations, schedule editor, message reactions, analytics, waveform visualizer, data export, and more
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
- **6-layer animation pipeline** — personality-driven movement:
  - L0 BasePose: breathing rhythm scaled by energy/nervousness
  - L1 IdleBehavior: 22 fidgets gated by personality (hair twirl, hip cock, peace sign, etc.)
  - L2 Emotion: additive posture from current mood (happy bounce, sad slouch, pouty sway)
  - L3 Talk: illustrative hand gestures and head nods during speech
  - L4 Gesture: 14 triggered animations (wave, bow, dance, clap, think, etc.)
  - L5 LookAt: mouse tracking + idle gaze wander (always additive)
- **Emotion-driven expressions** — every LLM response extracts an emotion tag (happy, sad, surprised, etc.) → automatic VRM blend shape morphing with smooth 300ms lerp transitions
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
- **Smart tool protocol detection** — auto-detects whether a local LLM supports OpenAI-format function calling, XML fallback, or no tools. Cached per model in SQLite so detection runs once.
- Qwen3 thinking mode toggle
- History auto-summarization at 90% of limit

### Agentic Characters
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

### In-App Mini Games

Play games WITH your AI companion using actual coded game logic (not LLM for rules). Characters provide commentary, trash talk, and emotional reactions. Scores persist in the database.

| Game | Type | Description |
|------|------|-------------|
| **Trivia** | Text/Logic | 10 rounds, LLM-generated questions, DB-tracked win/loss/score |
| **20 Questions** | Text/Logic | Character thinks of something, player guesses — coded state machine |
| **Word Association** | Text/Logic | Both respond, LLM judges creativity |
| **Riddles** | Text/Logic | Difficulty scales with relationship tier |
| **Tic-Tac-Toe** | 2D Canvas | Unbeatable AI or easy mode |
| **Memory Match** | 2D Canvas | Character-themed card art |

### Lorebook / World Info

Keyword-triggered context injection — define lore entries with trigger words, and matching lore is silently injected into the LLM's context before inference. The character "knows" these things without them being part of the visible chat.

- **Trigger keywords** — case-insensitive keyword scanning with priority ordering
- **Injection positions** — before system prompt / after system prompt / before last message / after last 2 messages
- **Per-character lore** — each character has its own lorebook
- **Enable/disable per entry** — toggle entries without deleting them
- **Use cases:** world lore for RP scenarios, NPC definitions, rules, user facts, conversation guidelines

### Tiered Episodic Memory (sqlite-vec)

Three-tier memory architecture with vector similarity search:

| Tier | Scope | Description |
|------|-------|-------------|
| **Fleeting** | Session | Everything said this session, auto-indexed |
| **Recent** | ~4 weeks | Emotionally significant moments, stated user facts |
| **Permanent** | Forever | Core memories flagged by LLM or manually by user |

- **sqlite-vec embeddings** — vector similarity inside SQLite, <1ms for 100K vectors, no separate process
- **Configurable decay** — off (all stay), keep (demote but don't delete), prune (old memories drop out)
- **Salience scoring** — emotional intensity determines tier promotion
- **User control** — manual promotion/demotion of memories via UI

### Character Moods & Time-of-Day States

Characters have a daily rhythm — their personality, energy, and conversational style shift based on time of day and recent context:

- **Morning** (6–10am): groggy/warm, coffee references
- **Afternoon** (10am–5pm): energetic, playful, curious
- **Evening** (5–9pm): relaxed, reflective, intimate
- **Night** (9pm–1am): introspective, philosophical
- **Late Night** (1–6am): surprised you're up, protective

Mood also factors in: recent affinity changes, session gap, and base personality traits. Adjustable via intensity slider (0–1). Small mood badge visible in StatusBar.

### User Knowledge Graph

Characters automatically extract and maintain structured knowledge about you:

- **Categories:** identity, preferences, history, relationship
- **Auto-detection:** LLM extracts facts after each exchange
- **Manual entries:** add/edit/delete facts you want the character to know
- **Source tracking:** auto-detected vs manually added, displayed differently
- **Context injection:** top 10 most confident facts injected into system prompt

### Contextual Opening Greetings

When you open the app and select a character, they greet you based on:
- Time since last chat ("It's been three days… I was wondering about you")
- Time of day (morning warmth vs evening intimacy)
- Current mood state (from Mood Engine)
- Recent shared memory
- Special dates (anniversary of first chat, custom dates)

### SillyTavern Character Card Import/Export

Import community character cards (PNG with embedded CHARA v2 JSON) and export your characters in the same format. Drag-drop a PNG → field preview → confirm import.

### Author's Note / Soft Prompt Injection

A hidden "director's note" silently injected into the context window at a configurable position. Steer tone, add narrative context, or set a scene without visible messages.

- **Collapsible editor** in Session Drawer
- **Injection positions:** before/after system prompt, after last 2/4 messages
- **Active badge** in StatusBar when note is set
- **Per-session** with optional per-character defaults

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
- **Emotion-modulated speech** — rate/pitch adjust per emotion via voice modulator
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
- **SillyTavern card import** — drag-drop PNG character cards with embedded CHARA v2 JSON
- **AI-generated expression portraits** — generate 6 expression variants from character description using image gen backend
- **Personality animation sliders** — 5 sliders that control how the character moves in 3D
- **Character roster** — card-based grid with quick-edit and character switching
- **Character export/import** — share characters as JSON packages or SillyTavern PNGs
- **Capability profiles** — per-character LLM requirements (model tier, context budget, feature flags)
- **Relationship scores** — affinity, mood, trust that evolve through conversation
- **Daily greeting injection** — auto-sent on first chat of the day
- **Mood persistence** — emotion carries between sessions
- **Character diary** — LLM-written session summaries that influence future behavior
- **Anniversary tracking** — milestone detection based on first chat date

### Setup Wizards & Feature Discovery

Guided onboarding and progressive feature discovery built into the Sakura frontend:

- **7-step onboarding wizard** — Welcome → Hardware Scan → LLM Setup → Character Creation → Voice Setup → Feature Tour → Done
- **5 setup wizards** — LLM, Voice, Expression Portraits, Image Generation, Character Card Import — each a multi-step modal with validation
- **Feature discovery tooltips** — contextual tips that appear based on usage patterns (message count, session count, idle time)
- **What's New modal** — shows new features after version updates with direct links to relevant wizards
- **Setup Guides in Settings** — card-based guide grid showing configuration status with pulsing dot indicators
- **Responsive variants** — fullscreen wizard on desktop, bottom-sheet drawer on mobile

### Dual Frontend Architecture

Two complete frontends sharing the same backend:

- **Neon** (default) — Cyberpunk bento-grid dashboard, vanilla JS, power-user focused
- **Sakura** (new) — Clean, chat-first consumer UI with visual novel dialogue. React 19 + Vite + Tailwind CSS + Framer Motion. 18 built-in themes.

Switch frontends via `default_frontend` in config or visit `/neon` and `/sakura` directly. Both use the same API and share the 3D viewer iframe.

### Themes

Sakura ships with **18 built-in themes** — 9 light, 9 dark — switchable in Settings or via toggle shortcut:

| Theme | Mode | Accent | Style |
|-------|------|--------|-------|
| Sakura | Light | Rose pink | Default warm aesthetic |
| Crystal | Light | Ice blue | Clean and minimal |
| Catppuccin Latte | Light | Mauve | Official Catppuccin palette |
| Matcha | Light | Sage green | Soft organic |
| Lavender | Light | Pastel violet | Gentle and calm |
| Peach | Light | Pastel coral | Warm and friendly |
| Bubblegum | Light | Hot pink | Pastel candy |
| Pop Bubblegum | Light | Hot pink | Neo-brutalist, hard shadows |
| Pop Lemonade | Light | Golden yellow | Neo-brutalist, hard shadows |
| Dark Sakura | Dark | Rose pink | Default dark |
| Dark Crystal | Dark | Slate blue | Cool dark |
| Midnight | Dark | Navy + gold | Elegant dark |
| Blurple | Dark | Discord blue | Discord-inspired |
| Catppuccin Macchiato | Dark | Lavender | Official Catppuccin palette |
| Monokai | Dark | Green | Classic editor theme |
| Darcula | Dark | Steel blue | JetBrains IDE theme |
| Dracula | Dark | Purple | Zeno Rocha's iconic theme |
| Tokyo Night | Dark | Sky blue | VS Code favorite |

### Cinematic Immersion Mode

Full-screen toggle (`Ctrl+I`) that hides all UI chrome. 3D viewer fills the screen, chat appears as translucent VN-style dialogue bubbles floating over the scene. ESC to exit.

### Visual Novel Reader Layout

Alternative chat rendering with:
- Character portrait positioned left/right with slide-in animation
- Styled text box at the bottom with typewriter animation
- Background fills the chat pane
- Toggle via button or keybind

### Sakura Frontend — Feature Panels

The Sakura UI ships with 20+ companion feature panels accessible via keyboard shortcuts or the overlay system:

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
| — | Waveform Visualizer | Live audio waveform during TTS playback |
| — | Branching Visualizer | Interactive tree view of branched conversation paths |
| — | Data Export | Export all sessions/characters/media as ZIP |

### UI / UX
- **Cyberpunk "Neon" bento-grid layout** — no framework, vanilla JS modules
- **Sakura chat-first layout** — React 19, visual novel dialogue bubbles, progressive disclosure settings, 5-step character creation wizard
- **"Intimate Luxury Digital" aesthetic** — Nunito (warm body) + Fraunces (editorial display serif), film grain overlay, blur-in entrance animations
- **Cinematic mode** (Ctrl+I) — full-screen 3D viewer with VN dialogue overlay
- **Visual novel mode** — typewriter text box with character portrait
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
│   ├── server.py              # FastAPI server (main application, ~7000+ lines)
│   ├── preflight.py           # DB migrations (schema v3 → v30)
│   ├── llm/
│   │   ├── registry.py        # LLM adapter factory
│   │   ├── capability_detector.py  # Smart tool protocol detection + cache
│   │   └── adapters/          # openai_compat, ollama, lmstudio, gemini, claude_api
│   ├── tts/
│   │   ├── registry.py        # TTS adapter factory
│   │   ├── model_manager.py   # TTS model install/delete/catalog
│   │   ├── voice_modulator.py # Emotion → TTS parameter mapping
│   │   └── adapters/          # edge_tts, kokoro, chatterbox, gptsovits, elevenlabs, …
│   ├── asr/
│   │   ├── registry.py        # STT adapter factory
│   │   └── adapters/          # faster_whisper, whisper_api
│   ├── agent/
│   │   ├── runner.py          # Agentic loop (XML tool call parser + native function calling)
│   │   ├── tools/             # 12 agent tools (voice, diary, memory, image, etc.)
│   │   └── registry.py        # Tool registry
│   ├── mood/
│   │   └── engine.py          # MoodEngine — time-of-day + affinity + personality → mood state
│   ├── lore/
│   │   └── matcher.py         # LoreMatcher — keyword-triggered context injection
│   ├── knowledge/
│   │   └── extractor.py       # FactExtractor — user fact extraction + knowledge graph
│   ├── greeting/
│   │   └── generator.py       # GreetingGenerator — contextual opening greetings
│   ├── games/
│   │   ├── trivia.py          # Trivia game engine (LLM question gen, answer validation)
│   │   └── twenty_questions.py # 20 Questions state machine
│   ├── characters/
│   │   └── chara_card.py      # SillyTavern CHARA v2 PNG reader/writer
│   ├── image_gen/
│   │   └── portrait_generator.py # AI expression portrait generation
│   ├── models/
│   │   └── manager.py         # LM Studio model manager integration
│   ├── memory/
│   │   ├── vector_store.py    # RAG vector store (sqlite-vec)
│   │   └── tiered_memory.py   # Three-tier memory manager (fleeting/recent/permanent)
│   ├── config/
│   │   ├── app.json           # Runtime configuration
│   │   ├── mood_profiles.json # Time-of-day × personality → mood descriptors
│   │   └── emotion_expressions.json # Emotion → VRM blend shape mappings
│   ├── storage/
│   │   ├── app.db             # SQLite database (schema v30)
│   │   ├── avatars/           # Uploaded VRM/GLB files
│   │   ├── audio/             # Generated TTS audio cache
│   │   └── images/            # AI-generated images
│   └── tests/                 # 98 pytest tests
├── frontends/
│   ├── shared/                # Assets shared between frontends
│   │   ├── viewer/            # Three.js VRM renderer + OBS overlay
│   │   │   ├── viewer.html    # 6-layer animation pipeline + emotion expression handler
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
│           ├── components/    # 30+ panels (DialogueBubble, GamePanel, LorePanel, …)
│           ├── hooks/         # useTheme, useViewer, useProactive, useAdaptivePacing
│           ├── stores/        # Zustand (appStore, chatStore)
│           ├── styles/        # 18 CSS themes (themes.css, base.css, components.css)
│           └── lib/           # Typed API client, event bus, types
├── setup.sh                   # Interactive installer (fresh + repair modes)
└── docs/
    ├── plans/                 # 15 design docs and implementation plans
    ├── USER_GUIDE.md
    ├── SETTINGS_REFERENCE.md  # All 75+ configuration keys
    ├── VRM_INTEGRATION.md
    ├── IMAGE_GEN_GUIDE.md
    ├── PYTHON_SETUP.md
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
| `POST` | `/api/characters/import-card` | Import SillyTavern character card (PNG) |
| `GET` | `/api/characters/{id}/export-card` | Export as SillyTavern PNG card |
| `GET` | `/api/characters/{id}/relationship` | Affinity/mood/trust scores |
| `GET` | `/api/characters/{id}/greeting` | Contextual opening greeting |
| `GET/POST/DELETE` | `/api/characters/{id}/lore` | Lorebook CRUD |
| `GET/POST/DELETE` | `/api/characters/{id}/user-facts` | User knowledge graph CRUD |
| `POST` | `/api/chat` | Non-streaming chat |
| `GET` | `/api/chat/stream` | SSE streaming chat (with chunked TTS + emotion tags) |
| `POST` | `/api/games/start` | Start a mini game session |
| `POST` | `/api/games/{id}/move` | Submit a game move |
| `GET` | `/api/games/history` | Game history with scores |
| `POST` | `/api/tts` | Direct TTS synthesis |
| `POST` | `/api/tts/preview` | Voice preview synthesis (wizard/settings) |
| `POST` | `/api/asr/transcribe` | Faster-Whisper STT |
| `GET` | `/api/tts/cache` | Audio cache stats |
| `GET` | `/api/models/capabilities` | Model capability detection (tool protocol) |
| `GET` | `/api/v2/telemetry/summary` | Error/latency metrics |
| `GET` | `/api/v2/memory/search` | RAG memory search (tiered) |
| `GET` | `/api/search/messages` | Full-text message search (FTS5) |
| `GET` | `/api/data/export` | Export all data as ZIP |
| `WS` | `/ws/overlay` | OBS overlay WebSocket |

### Database Schema (v30)

The SQLite database (schema v30) auto-migrates on startup. Key tables:
- **sessions** — chat sessions with summary, archive, tags, and author's note
- **messages** — chat history with emotion, branching (parent_id), token stats, pinning, reactions
- **characters** — full character profiles (40+ columns including animation_profile, capability_profile, diary, voice config, mood settings, greeting config)
- **character_relationships** — affinity/mood/trust scores per character
- **lore_entries** — lorebook / world info entries with keywords and injection position
- **user_facts** — user knowledge graph (structured facts per character)
- **game_sessions** — mini game results (type, score, win/loss, duration)
- **memories** + **memories_vec** — tiered episodic memory with sqlite-vec embeddings
- **model_capability_cache** — cached tool protocol detection per LLM model
- **message_reactions** — emoji reactions per message
- **prompt_templates** — reusable system prompt templates
- **character_docs** — uploaded reference documents
- **universes** — shared world builder (universe definitions)

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

### Recently Completed (v8.1.0)
- **Setup Wizards & Feature Discovery** — 7-step onboarding, 5 setup wizards, contextual feature tips, What's New modal
- **Kokoro TTS + Voice Modulation** — Kokoro adapter with speed/emotion passthrough, TTSModelsPanel browser, voice preview, 11+ voices
- **In-App Mini Games** — trivia, 20 questions, word association, riddles, tic-tac-toe, memory match
- **Lorebook / World Info** — keyword-triggered context injection (SillyTavern-compatible concept)
- **Tiered Episodic Memory** — sqlite-vec embeddings with three-tier decay system
- **Character Moods** — time-of-day behavioral states with intensity slider
- **Emotion-Driven VRM Expressions** — automatic facial expressions from every LLM response
- **Cinematic Immersion Mode** — full-screen 3D with floating dialogue
- **Visual Novel Reader Layout** — typewriter text box with character portraits
- **Author's Note** — hidden director's note injected into context
- **SillyTavern Character Card Import/Export** — PNG with CHARA v2 metadata
- **AI-Generated Expression Portraits** — 6 expressions from character description
- **Smart Tool Protocol Detection** — auto-detects LLM function calling support
- **User Knowledge Graph** — structured user facts maintained by characters
- **Contextual Opening Greetings** — characters greet based on context and mood
- **18 built-in themes** — including Catppuccin, Monokai, Dracula, Tokyo Night, Darcula, Blurple, Pop Bubblegum/Lemonade

### Planned
- **Full-Duplex Voice Conversation** — WebSocket audio, Silero VAD, faster-whisper STT, continuous voice loop
- **Live2D Runtime Support** — pixi-live2d-display for Cubism 2/3/4 models
- **Electron Desktop App** — transparent overlay, desktop pet, system tray, native OS integration
- **Emulator Gaming Integration** — PS1/PS2 emulation with AI companion co-op (EmulatorJS + PCSX2)
- Docker Compose one-command setup
- Twitch chat integration

---

## Changelog

See [docs/CHANGELOG.md](docs/CHANGELOG.md) for version history.

---

## License

MIT — see [LICENSE](LICENSE).
