# Waifu-RT3D

> **AI Companion Platform** — 3D anime avatars with personality-driven animation, local/cloud LLM integration, 45-model catalog with hardware-aware recommendations, director mode, daily streaks, full-duplex voice conversation, 9-provider TTS, offline STT, agentic tool use, mini games, lorebook, tiered memory, character moods, 18 themes, cinematic mode, and OBS streaming overlays.

[![Python](https://img.shields.io/badge/python-3.12%2B-blue)](requirements.txt)
[![Tests](https://img.shields.io/badge/tests-2703%20passed-brightgreen)](backend/tests/)
[![Schema](https://img.shields.io/badge/DB%20schema-v71-purple)](#)
[![Themes](https://img.shields.io/badge/themes-18-ff69b4)](#themes)
[![Frontends](https://img.shields.io/badge/frontends-Neon%20%7C%20Sakura%20%7C%20Nova-ff69b4)](#dual-frontend-architecture)
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
- **Relationship boundaries** — per-character comfort levels (hard/soft constraints) injected as negative rules into the LLM prompt, with in-character negotiation mode
- **Writing style presets** — four distinct narrative voices (romantic, literary, direct, suggestive) with per-character defaults and per-session override
- **Per-character sensory profiles** — 13 characters with unique sensory emphasis (Dae sees, Luna hears, Genki touches) that auto-activate with intimacy
- **Private vocabulary & pet names** — organically-grown relationship language tracked and injected into prompts (pet names, inside jokes, code words)
- **50+ Sakura companion features** — session summaries, context budget bar, mood board, branching visualizer, relationship web, character portfolio cards, session replay, ambient soundscapes, model arena, scenario library, global search, milestone celebrations, schedule editor, message reactions, analytics, waveform visualizer, data export, and more
- **Remote GPU motion server** — auto-discovers and connects to an animation server over LAN for real-time GPU-accelerated motion
- **Mobile PWA** — full Sakura UI as installable Progressive Web App with bottom tab navigation

---

## Quick Start

### Prerequisites
- **Python 3.12+** (recommend 3.14)
- **LM Studio** (recommended) or any OpenAI-compatible LLM endpoint
- macOS / Linux / Windows (WSL or native)

> **Homebrew Python users:** Use `.venv/bin/python` instead of bare `python` or `python3` to avoid Conda/system Python conflicts. The project venv is built on Homebrew Python 3.14.

### Option A: One-Click Launcher (Easiest)

After running setup once, use a launcher to start everything with a single click:

- **macOS** — Double-click `launchers/Waifu RT3D.app` in Finder. The backend starts automatically and your browser opens to the Sakura frontend.
- **Electron** — Run `cd electron && npm start`. A native window opens with the backend managed for you, plus desktop pet mode (Ctrl+Shift+P).

See [docs/LAUNCHER_GUIDE.md](docs/LAUNCHER_GUIDE.md) for detailed instructions, troubleshooting, and first-time setup steps.

### Option B: Interactive Installer (Recommended for first-time setup)

```bash
git clone https://github.com/WestonGFX/waifu-rt3d.git
cd waifu-rt3d
./setup.sh
```

The installer walks you through Python venv creation, dependency installation, optional TTS/Sakura frontend setup, and database initialization. It also supports `--repair` (fix existing installs) and `--minimal` (core deps only).

### Option C: Manual Installation

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
- **Image generation** — trigger AI art via ComfyUI/SD adapters; per-character `image_style` (positive/negative prompt prefixes, optional LoRA) auto-applied so generated images stay on-model across sessions
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

### Groq ASR (Cloud Whisper)
- **Free cloud ASR** via Groq's Whisper large-v3 endpoint
- Near-instant transcription with no local resources
- Requires free API key from console.groq.com

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

### Director Mode
Out-of-character stage directions that steer AI behavior without appearing as dialogue:
- **Cumulative notes** persist across the conversation ("she should be shy now")
- **Immediate notes** apply to the next reply only ("describe the rain outside")
- Amber-gold card styling distinguishes director notes from chat messages
- Toggle via the director button in the chat input bar

### Daily Interaction Rewards
Streak tracking and XP system that deepens character relationships over time:
- **Daily streaks** -- consecutive day counter with fire badge in status bar
- **XP accumulation** -- earn XP per interaction (bonus for streaks)
- **Relationship tiers** -- Stranger -> Acquaintance -> Friend -> Close Friend -> Best Friend -> Soulmate
- Streak badge shows current count + tier info on hover

### Output Format Rules
Per-character regex rules that clean up LLM output before display:
- **Pattern matching** -- regex-based find-and-replace on AI responses
- **Built-in presets** -- Strip OOC markers, remove narrator text, clean double asterisks
- **Live test preview** -- paste sample text to see rules applied in real-time
- **Toggle/reorder** -- enable/disable individual rules without deleting

### Hardware-Aware Model Catalog
45 curated RP/anime models with intelligent hardware recommendations:
- **Auto-detects GPU** -- NVIDIA (GGUF), Apple Silicon (MLX), AMD (ROCm)
- **VRAM fit scoring** -- green/yellow/orange/red compatibility indicators
- **Quant suggestions** -- recommends Q4_K_M, Q5_K_M, etc. based on available VRAM
- **CPU offload warnings** -- flags models that would need slow CPU offload
- **HuggingFace links** -- click model names to view/download from HF
- Users install models via LM Studio or Ollama; this panel is for discovery

### Message Branching
Regenerate AI responses and browse alternatives:
- **Regenerate** -- create a new response branch for any assistant message
- **Arrow navigation** -- browse between response variants with left/right arrows
- **Branch history** -- all alternatives preserved, switch between them anytime

### Prompt Template Macros
Variable substitution in system prompts and templates:
- `{{char}}` -- character name
- `{{user}}` -- user display name
- `{{time}}` -- current time
- `{{date}}` -- current date
- `{{persona}}` -- character personality summary

### Setup Wizards & Feature Discovery

Guided onboarding and progressive feature discovery built into the Sakura frontend:

- **7-step onboarding wizard** — Welcome → Hardware Scan → LLM Setup → Character Creation → Voice Setup → Feature Tour → Done
- **5 setup wizards** — LLM, Voice, Expression Portraits, Image Generation, Character Card Import — each a multi-step modal with validation
- **Feature discovery tooltips** — contextual tips that appear based on usage patterns (message count, session count, idle time)
- **What's New modal** — shows new features after version updates with direct links to relevant wizards
- **Setup Guides in Settings** — card-based guide grid showing configuration status with pulsing dot indicators
- **Responsive variants** — fullscreen wizard on desktop, bottom-sheet drawer on mobile

### Dual Frontend Architecture

Three complete frontends sharing the same backend:

- **Neon** (default) — Cyberpunk bento-grid dashboard, vanilla JS, power-user focused
- **Sakura** — Clean, chat-first consumer UI with visual novel dialogue. React 19 + Vite + Tailwind CSS + Framer Motion. 18 built-in themes.
- **Nova** — Glassmorphic companion-focused UI with ambient lighting, emotion orb, command palette, and focused/companion view modes. React 19 + Vite + Zustand + CSS Modules.

Switch frontends via `default_frontend` in config or visit `/neon`, `/sakura`, and `/nova` directly. All three use the same API and share the 3D viewer iframe.

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
| `alt+shift+b` | Boundaries Panel | View/edit per-character relationship comfort levels |
| `alt+shift+v` | Private Vocabulary | View pet names, inside jokes, and shared language |
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
│   ├── server.py              # FastAPI server (main application, ~13K lines)
│   ├── preflight.py           # DB migrations (schema v3 → v61)
│   ├── llm/
│   │   ├── registry.py        # LLM adapter factory
│   │   ├── capability_detector.py  # Smart tool protocol detection + cache
│   │   ├── context_assembler.py   # Token-budget-aware context assembly
│   │   ├── link_manager.py        # Multi-machine LM Studio Link routing
│   │   ├── token_counter.py       # tiktoken wrapper with fallback
│   │   └── adapters/          # openai_compat, ollama, lmstudio, gemini, claude_api
│   ├── tts/
│   │   ├── registry.py        # TTS adapter factory
│   │   ├── model_manager.py   # TTS model install/delete/catalog
│   │   ├── voice_modulator.py # Emotion → TTS parameter mapping
│   │   └── adapters/          # edge_tts, kokoro, chatterbox, gptsovits, elevenlabs, …
│   ├── asr/
│   │   ├── registry.py        # STT adapter factory
│   │   └── adapters/          # faster_whisper, whisper_api, groq_whisper
│   ├── voice/
│   │   ├── duplex.py          # Full-duplex voice conversation state machine
│   │   └── audio_utils.py     # Audio format conversion (WebM/Opus → PCM)
│   ├── spectator/             # Browser game companion
│   │   ├── analyzer.py        # VLM game frame analysis
│   │   ├── throttle.py        # Reaction frequency presets
│   │   └── memory.py          # Game session history + context injection
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
│   │   ├── manager.py         # LM Studio model manager integration
│   │   └── avatar_browser.py  # CC0 model catalog + Sketchfab search
│   ├── memory/
│   │   ├── vector_store.py    # RAG vector store (sqlite-vec)
│   │   └── tiered_memory.py   # Three-tier memory manager (fleeting/recent/permanent)
│   ├── config/
│   │   ├── app.json           # Runtime configuration
│   │   ├── mood_profiles.json # Time-of-day x personality → mood descriptors
│   │   └── emotion_expressions.json # Emotion → VRM blend shape mappings
│   ├── data/
│   │   ├── model_catalog.json      # 40-model curated catalog (24 LLM, 10 TTS, 6 STT)
│   │   └── model_recommendations.json # Legacy 45-model RP/anime catalog
│   ├── storage/
│   │   ├── app.db             # SQLite database (schema v61)
│   │   ├── avatars/           # Uploaded VRM/GLB files
│   │   ├── audio/             # Generated TTS audio cache
│   │   └── images/            # AI-generated images
│   ├── embeddings/            # Embedding provider abstraction (MiniLM + Gemma)
│   ├── content/               # Content gating + NSFW Phase 1 (boundaries, writing styles, sensory profiles)
│   ├── relationship/          # Relationship state injection + private vocabulary/pet names
│   ├── adaptive/              # Adaptive intelligence (reflector, tuner, journal)
│   ├── bond/                  # Bond progression (levels, gifts, story scenes)
│   ├── proactive/             # Proactive AI messages (scheduler, triggers)
│   └── tests/                 # 1532 pytest tests
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
│   ├── nova/                  # Glassmorphic companion UI (React 19 + Vite)
│   │   └── src/
│   │       ├── components/    # CompanionView, FocusedView, EmotionOrb, CommandPalette, …
│   │       ├── stores/        # Zustand chat store
│   │       ├── styles/        # CSS Modules, glass effects, animations
│   │       └── lib/           # Types, character tints
│   └── sakura/                # Chat-first consumer UI (React 19 + Vite)
│       └── src/
│           ├── views/         # ChatsView, ChatThread, CreateView, SettingsView
│           ├── components/    # 35+ panels (DialogueBubble, GamePanel, LorePanel, BoundaryPanel, VocabularyPanel, WritingStylePicker, …)
│           ├── hooks/         # useTheme, useViewer, useProactive, useAdaptivePacing
│           ├── stores/        # Zustand (appStore, chatStore)
│           ├── styles/        # 18 CSS themes (themes.css, base.css, components.css)
│           └── lib/           # Typed API client, event bus, types
├── launchers/
│   ├── Waifu RT3D.app/        # macOS one-click launcher bundle
│   └── build-launcher.sh      # Script to rebuild the .app bundle
├── electron/
│   ├── main.js                # Electron main process (app + pet windows, tray, IPC)
│   ├── preload.js             # Context bridge API for renderer
│   ├── backend-launcher.js    # Backend lifecycle manager (spawn, health, crash recovery)
│   ├── splash.html            # Startup splash screen with progress bar
│   └── assets/                # App icons (icon.png, tray-icon.png)
├── setup.sh                   # Interactive installer (fresh + repair modes)
└── docs/
    ├── plans/                 # Plan index, resume prompt, naming convention
    ├── conventions/           # Domain convention guides (backend, frontend, 3D, LLM)
    ├── research/              # Dated research findings
    ├── sessions/              # Session summaries
    ├── specs/                 # Feature PRDs
    ├── decisions/             # Architecture Decision Records
    ├── FEATURE_MASTERLIST.md  # 56 features across 6 tiers
    ├── COMPLETED_FEATURES.md  # Historical archive of all completed features
    ├── STATUS_HISTORY.md      # Archived status snapshots
    ├── DOCUMENT_LIFECYCLE.md  # Artifact map + directory structure
    ├── USER_GUIDE.md
    ├── LAUNCHER_GUIDE.md      # macOS .app + Electron launcher walkthrough
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
| `GET` | `/api/characters/{id}/streak` | Daily streak + XP + relationship tier |
| `GET/POST/PATCH/DELETE` | `/api/characters/{id}/format-rules` | Output format rules CRUD |
| `POST` | `/api/messages/{id}/regenerate` | Regenerate assistant message (new branch) |
| `POST` | `/api/messages/{id}/activate` | Switch to a branched response |
| `GET` | `/api/messages/{id}/branches` | List branch siblings |
| `WS` | `/ws/voice` | Full-duplex voice conversation |
| `GET` | `/api/hardware` | GPU/VRAM/platform detection |
| `GET` | `/api/link/devices` | LM Studio Link device discovery |
| `GET` | `/api/context-budget/{session_id}` | Token usage breakdown |
| `GET/POST` | `/api/characters/{id}/bond` | Bond level, XP, gifts, story scenes |
| `POST` | `/api/characters/{id}/bond/gift` | Give a gift to a character |
| `GET` | `/api/characters/{id}/content-gate` | Content gating level + intimacy score |
| `GET/PUT/DELETE` | `/api/characters/{id}/boundaries` | Relationship boundaries CRUD + export/import |
| `GET` | `/api/writing-styles` | List writing style presets |
| `PUT` | `/api/sessions/{id}/writing-style` | Set session writing style override |
| `GET/PUT` | `/api/characters/{id}/sensory-profile` | Per-character sensory emphasis |
| `GET/DELETE` | `/api/characters/{id}/vocabulary` | Private vocabulary & pet names |
| `GET` | `/api/characters/{id}/journal` | Character's self-reflection journal |
| `GET` | `/api/adaptive/signals` | On-device learning signal history |
| `GET` | `/api/embeddings/providers` | Available embedding providers |
| `GET` | `/api/models/catalog` | Full model catalog (LLM + TTS + STT) |
| `GET` | `/api/models/recommend` | Hardware-aware model recommendations |
| `WS` | `/ws/spectator` | Game companion screen analysis |
| `WS` | `/ws/overlay` | OBS overlay WebSocket |
| `GET` | `/api/scenarios/templates` | List all scenario templates (builtin + custom) |
| `GET` | `/api/scenarios/templates/active` | Get the currently active scenario template |
| `POST` | `/api/scenarios/templates` | Create a custom scenario template |
| `PUT` | `/api/scenarios/templates/{id}` | Update a scenario template (custom only) |
| `DELETE` | `/api/scenarios/templates/{id}` | Delete a custom template (403 on builtins) |
| `POST` | `/api/scenarios/templates/activate` | Activate a scenario template (id=0 to deactivate) |
| `GET` | `/api/characters/{id}/bond/memorial-scene` | Get next unplayed memorial scene for a tier transition |
| `POST` | `/api/characters/{id}/bond/memorial-scene/complete` | Mark a memorial scene as seen |
| `GET` | `/api/characters/{id}/bond/first-memory` | Get the user's first memory with this character |
| `GET` | `/api/characters/{id}/bond/analytics` | XP source breakdown, session stats, tier history |

### Database Schema (v70)

The SQLite database (schema v70) auto-migrates on startup. Key tables:
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
- **interaction_rewards** — daily streaks, XP, relationship tiers
- **format_rules** — per-character regex output formatting
- **game_companion_sessions** — browser game spectator sessions
- **game_companion_reactions** — AI reactions to game events
- **embedding_cache** — cached embeddings for semantic search (MiniLM/Gemma)
- **content_ratings** — content gating levels per character per session
- **intimacy_scores** — per-turn intimacy tracking for content ceiling
- **bond_levels** — 0→100 bond progression with story scene unlocks
- **bond_gifts** — gift inventory and exchange history
- **adaptive_signals** — on-device learning signals (user behavior patterns)
- **adaptive_journal** — AI self-reflection journal entries
- **animation_sequences** — stored animation clip sequences for the sequencer
- **relationship_boundaries** — per-character comfort-level constraints (hard/soft) for content gating
- **private_vocabulary** — pet names, inside jokes, code words, shared references per character
- **scenario_templates** — 65 builtin + custom scenario templates (13 chars × 5, mood-tagged, activation state)
- **bond_scenes_seen** — tracks which memorial scenes (tier-transition vignettes) each character has already shown the user

---

## Running Tests

```bash
# One command — runs both backend pytest AND frontend tsc, opens HTML dashboard
./run.sh check

# Run just backend tests
.venv/bin/python -m pytest backend/tests/ -v

# Quick run (stop on first failure)
.venv/bin/python -m pytest backend/tests/ -x --tb=short
```

**2678 backend tests + 160 frontend (Vitest) tests** covering API endpoints, CRUD, agents, voice module, memory, spectator, link manager, context assembler, embeddings, content gating, adaptive intelligence, bond progression (all 6 phases), memorial scenes, analytics, animation sequencer, boundaries, writing styles, sensory profiles, vocabulary, scenario templates, and more. Plus 26 Playwright E2E tests.

---

## Roadmap

### Recently Completed (v14 — schema v70)
- **Bond Progression Phases 5+6 (ALL 6 PHASES COMPLETE)** — 39 tier-transition memorial scenes (13 characters × 3 tier boundaries), `bond_scenes_seen` tracking (schema v70), `MemorialScene.tsx` + `useMemorialScene` hook, DevConsole Bond analytics tab, XP source breakdown endpoint, 32 new tests (22 backend + 10 frontend)
- **Per-Character Scenario Templates** — 65 builtin scenarios (13 characters × 5 moods), custom template creation, mood-grouped ScenarioPicker UI with random and activate controls, 6 REST endpoints, 46 new tests (29 backend + 17 frontend)
- **Bond Progression Phases 3+4** — dialogue-gated system prompt injection per bond tier, BondPanel/BondTimeline/BondStoryViewer frontend components
- **AI Quick Replies + CHARA V2 Compliance** — two-phase heuristic→LLM chip system, schema v68 with lossless SillyTavern card import/export
- **Message Swipe / Regeneration** — branch navigation with always-visible controls, Ctrl+Shift+R, in-place updates

### Previously Completed (v12 — schema v61)
- **NSFW Phase 1: Foundation Layer** — four features that compose into the intimate content system:
  - **Relationship Boundaries (F40)** — per-character hard/soft comfort constraints, in-character negotiation prompts, export/import across characters
  - **Writing Style Presets (F13)** — four narrative voices (romantic, literary, direct, suggestive) with per-character defaults for all 13 characters
  - **Per-Character Sensory Profiles (F15)** — 13 unique profiles (Dae sees, Luna hears, Genki touches), intimacy-gated intensity scaling
  - **Private Vocabulary & Pet Names (F30)** — organic relationship language tracking with frequency scaling and 5 character proposal templates
- **Unified Memory Browser (P5)** — 4-tab panel replacing 3 separate overlays (Overview, About You, Memories, Journal)
- **Context Assembly Viewer (P2)** — debug panel showing LLM prompt construction with per-section token counts
- **One-Command Smoke Test** — `./run.sh check` runs backend + frontend checks with auto-opening HTML dashboard

### Previously Completed (v11 — schema v60)
- **Adaptive Intelligence Engine** — on-device learning signals, behavior adaptation, trust/mood updates, topic steering, AI self-reflection journal
- **Bond Progression System** — 0→100 levels with story scene unlocks, gift exchange, relationship milestones
- **Content Gating** — age-appropriate content ceiling, intimacy tracking per turn, frontend gate UI, legacy migration
- **Embedding Provider Abstraction** — MiniLM + embeddinggemma support, semantic lore matching, topic-shift detection
- **Animation Library Expansion** — 40+ animations, sequencer for multi-clip chains, state machine v2
- **Model Catalog** — 40 curated models (24 LLM, 10 TTS, 6 STT) with VRAM/tier data and hardware-aware recommendations
- **Proactive AI Messages** — scheduler-driven character-initiated messages based on time, mood, and context
- **Character Journal + Memory Transparency** — characters write journals, users see what characters remember

### Previously Completed (v10.0.0)
- **Director Mode** — dual-layer OOC stage directions (cumulative + immediate notes)
- **Daily Interaction Rewards** — streaks, XP, relationship tiers (Stranger to Soulmate)
- **Output Format Rules** — per-character regex-based LLM output cleanup
- **Groq ASR** — free cloud Whisper STT via Groq's large-v3 endpoint
- **Message Branching** — regenerate + navigate response alternatives with arrow keys
- **Hardware-Aware Model Catalog** — 45 curated RP/anime models with GPU/VRAM recommendations
- **LM Studio Link** — multi-machine device discovery + smart routing
- **Browser Game Companion** — VLM screen analysis with AI commentary
- **Context Assembler** — token-budget-aware prompt assembly with tiktoken
- **Portfolio Card Export** — CHARA v2 PNG sharing from portfolio overlay
- **Prompt Template Macros** — variable substitution (char, user, time, date, persona)

### Previously Completed (v9.0.0)
- **Full-Duplex Voice Conversation** — WebSocket duplex audio, Silero VAD, barge-in interrupt, VoiceOrb UI, echo gating
- **Live2D Runtime** — pixi-live2d-display with viewerStore mediator, expression/gesture routing, lip sync, transparent PIXI canvas
- **Desktop Pet (Electron)** — transparent always-on-top overlay, click-through hit testing, drag-to-move, speech bubble, system tray, global shortcut
- **Opus Code Review** — 15 P0/P1 fixes across C1 + A1 (AudioContext, race conditions, barge-in, reconnection)
- **54 voice module tests** — VAD, audio utils, duplex state machine
- **26 Playwright E2E tests** — onboarding, settings, wizards, what's-new

### Previously Completed (v8.1.0)
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
- **Desktop Pet Phase 3** — right-click context menu, compact sidebar mode, edge docking, idle behaviors
- Docker Compose one-command setup
- Twitch chat integration

---

## Changelog

See [docs/CHANGELOG.md](docs/CHANGELOG.md) for version history.

---

## License

MIT — see [LICENSE](LICENSE).
