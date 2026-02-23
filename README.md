# 🎭 Waifu-RT3D

> **AI Companion Platform** — 3D anime avatars + local/cloud LLM integration, multi-provider TTS/STT, OBS overlay, and streamer tools.

[![Version](https://img.shields.io/badge/version-6.0-blueviolet)](CHANGELOG.md)
[![Python](https://img.shields.io/badge/python-3.11%2B-blue)](requirements.txt)
[![Branch](https://img.shields.io/badge/branch-integrate%2Fmaster-orange)](#)
[![Tests](https://img.shields.io/badge/tests-31%20passed-brightgreen)](tests/)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

---

## What Is This?

Waifu-RT3D is a **full-stack AI companion platform** that:
- Renders a **3D VRM anime character** with real-time lip sync, idle/talking animations, and expression blending
- Chats with you via **local or cloud LLMs** (LM Studio, Ollama, Gemini, Claude, OpenAI)
- Speaks to you with **multi-provider TTS** (Edge TTS, Kokoro, Chatterbox, GPT-SoVITS, ElevenLabs, Fish Audio, Piper, XTTS)
- Listens via **local or cloud STT** (Faster-Whisper offline, Whisper API, browser WebSpeech)
- Exposes an **OBS Browser Source overlay** for streamers
- Tracks **relationship scores** (affinity, mood, trust) that evolve over time

---

## ✅ Implemented Features (by phase)

### Phase 0–1: Foundation
- FastAPI backend with SQLite (WAL mode, FTS5 full-text search)
- VRM / GLB / GLTF model upload and rendering (Three.js + `@pixiv/three-vrm`)
- Multi-character system — swap personas mid-session
- Session persistence — chat history survives refreshes
- Cyberpunk "Neon" UI with bento-grid layout (no framework, vanilla JS modules)

### Phase 2: LLM Integration
- LM Studio REST API adapter (local LLMs, privacy-first)
- Ollama adapter (local LLMs)
- OpenAI-compatible adapter (any OpenAI-style endpoint)
- Conversation history with configurable length limit
- System prompt per character
- History auto-summarization when limit is reached
- Per-session context injection

### Phase 3: TTS & Voice
- **Edge TTS** (Microsoft, free, 400+ neural voices)
- **Fish Audio** (cloud/self-host)
- **Piper** (fully offline, ONNX)
- **XTTS Server** (local GPU)
- **ElevenLabs** (API, premium quality)
- **Pinokio/Generic REST** (community TTS servers)
- Per-character voice settings (voice ID, rate, pitch)
- Audio file serving from `/files/audio/`

### Phase 3G: VRM Character System
- Multi-character roster with card-based UI
- Character export / import as JSON (share with others)
- Voice sample upload for voice-cloning adapters
- Relationship score tracking (affinity, mood, trust)
- Character docs (upload reference PDFs/text)

### Phase 4A: UX Polish
- Error log panel (last N server errors, copyable)
- Glow intensity slider
- FPS cap control
- Viewer ↔ chat postMessage bridge
- Screenshot capture

### Phase 5: Advanced Features
- **Kokoro TTS** adapter (local, high quality)
- **Chatterbox TTS** adapter (local, expressive)
- Per-character LLM routing (`llm_endpoint`, `llm_model`)
- Qwen3 thinking mode toggle
- Vocab manager (custom word pronunciations)
- LM Studio live model management UI
- Hotkey editor (customisable keyboard shortcuts)
- Cyberpunk iOS-inspired theme variant

### Phase 6: Lip Sync, Streaming TTS, STT, OBS (v6.0 — current)

| Sub-phase | Feature | Notes |
|---|---|---|
| **6A** | Settings dot-notation save/load fix | `llm.qwen3_thinking_mode`, `tts.exaggeration` now persist correctly |
| **6B** | Character API exposes `llm_endpoint` + `llm_model` | Per-character LLM routing fully wired end-to-end |
| **6C** | Real-time spectral centroid lip sync | WebAudio FFT → VRM mouth shapes (aa/ih/oh/ou). Works with ALL TTS providers |
| **6D** | Idle vs. talking motion split | `MOTION_IDLE` / `MOTION_TALK` constants — character visually reacts to speech |
| **6E** | `_clean_for_tts()` preprocessor | Strips `[tags]`, `(parens)`, `*actions*`, markdown before TTS; DB stores full text |
| **6G** | Sentence-chunked streaming TTS | First audio chunk in ~1–2s vs. 8–15s; AudioQueue plays chunks in order |
| **6H** | **GPT-SoVITS** TTS adapter | Local voice cloning on port 9880, anime-optimised |
| **6I** | **Faster-Whisper** local STT | `/api/asr/transcribe` endpoint; offline, GPU/CPU, VAD filter |
| **6J** | OBS streaming overlay | `overlay.html` + `/ws/overlay` WebSocket; transparent browser source |

### Phase 7A: Quick Wins (current sprint)

| Item | Feature |
|---|---|
| **#64** | GitHub Actions CI — pytest + ESLint on every PR |
| **#11** | TTS audio cache — content-addressed file cache, instant repeat phrases |
| **#32** | Markdown rendering in AI chat bubbles (marked.js) |
| **#47** | Audio chunk preloading — next chunk fetched while current plays |
| **#52** | Connection quality dot (green/yellow/red latency indicator) |
| **#51** | Backend offline banner + watchdog polling |
| **#1** | **Google Gemini** LLM adapter (Flash/Pro/2.5, OpenAI-compat + native SDK) |
| **#2** | **Anthropic Claude** LLM adapter (Haiku/Sonnet/Opus, streaming SSE) |

---

## 🚧 Planned Features (not yet implemented)

> Items marked ⭐ are high priority.

### AI / LLM
- [ ] ⭐ **#3** Per-character LLM temperature slider
- [ ] ⭐ **#4** Long-term memory via RAG (sentence-transformers embeddings)
- [ ] **#5** "Compress history" manual button
- [ ] **#6** Per-session system prompt override (inline text area)
- [ ] **#7** LLM quick-controls bar (temperature knob, max-tokens slider)
- [ ] **#8** Multi-provider model benchmarking tool

### TTS / Voice
- [ ] ⭐ **#9** Google Cloud TTS adapter (WaveNet + Journey voices)
- [ ] **#10** Azure Cognitive Services TTS (400+ neural voices)
- [ ] **#12** Voice preview button in Settings (play sample)
- [ ] **#13** Per-message TTS replay (speaker icon on each AI bubble)
- [ ] **#14** In-chat TTS speed control (0.5×–2× slider)
- [ ] **#15** Background ambient sound layer (rain, café, lo-fi)
- [ ] **#16** SSML stress/pause support (`...` → `<break>`, CAPS → `<emphasis>`)

### STT / Voice Input
- [ ] ⭐ **#17** Google Cloud Speech-to-Text adapter
- [ ] **#18** Push-to-talk hotkey (hold Space to record)
- [ ] **#19** Wake word activation ("Hey Rin") via Picovoice WASM
- [ ] **#20** ASR confidence display + minimum threshold

### VRM / 3D Character
- [ ] ⭐ **#21** Mixamo FBX body animations (dance, twerk, wave) — **BLOCKED: user must download FBX files from mixamo.com**
- [ ] **#22** Hand/finger pose presets (heart hands, peace sign, thumbs up)
- [ ] **#23** Eye contact / gaze tracking (follow camera)
- [ ] **#24** Expression blend transitions (lerp over 0.3s, no snap)
- [ ] **#25** Party/disco lighting mode (triggered by dance animation)
- [ ] **#26** Shadow quality toggle (Off / Soft / Sharp)
- [ ] **#27** Camera preset buttons (Bust / Full Body / Face Close-up)
- [ ] **#28** VRM hot-reload button (no page refresh)

### UI / UX
- [ ] **#29** Light/pastel theme option
- [ ] **#30** Font size accessibility (S/M/L)
- [ ] **#31** Chat search (Ctrl+F, highlight matches)
- [ ] **#33** Export chat to PDF or Markdown
- [ ] **#35** Message reactions (❤️ 😂 👍 — stored in DB)
- [ ] **#36** Pinned messages panel

### Desktop / Electron
- [ ] ⭐ **#37** Electron desktop shell (macOS `.app` + Windows `.exe`)
- [ ] **#38** System tray icon with quick-chat popup
- [ ] **#39** Global OS hotkey (⌘+Shift+W toggle)
- [ ] ⭐ **#40** Desktop pet mode (transparent always-on-top window)
- [ ] **#41** Auto-start on login
- [ ] **#42** OS-native notifications

### Streaming / OBS
- [ ] ⭐ **#43** Twitch chat integration (tmi.js → LLM)
- [ ] **#44** Subtitle word-by-word reveal in overlay
- [ ] **#45** Stream alert overlays (follower/sub/bit events)
- [ ] **#46** OBS scene switcher API (switch scene on speech start/stop)

### Performance & Reliability
- [ ] **#48** VRM model instance cache (Map<url, VRM>, no re-load on switch)
- [ ] **#50** LLM timeout recovery UI (30s silence → Retry/Cancel buttons)
- [ ] **#54** Daily greeting (auto-sent on first open each day)
- [ ] **#55** Birthday/special date memory
- [ ] **#56** Mood persistence between sessions

### Companion / Social
- [ ] **#57** Character diary (LLM writes 2–3 sentence entry after session)
- [ ] **#58** Companion stats page (messages, hours, emotions, topics)

### Frontend / UI Shell
- [ ] ⭐ **#65** Multi-frontend switcher (Neon / V2 React / Classic)
- [ ] ⭐ **#66** V2 React frontend activation (React 19 + Vite 7 + R3F + Tailwind v4)
- [ ] **#67** Settings panel: System Config tab
- [ ] **#68** Frontend hot-switch without page reload

### Developer & Operations
- [ ] **#59** Docker Compose setup (one-command boot)
- [ ] **#60** Live model-switching API (`POST /api/llm/switch`)
- [ ] **#61** Plugin / custom slash command system
- [ ] **#62** Webhook outbound events (Zapier/n8n integration)

---

## 🚀 Quick Start

### Prerequisites
- **Python 3.11+**
- **LM Studio** (recommended) or any OpenAI-compatible LLM endpoint
- macOS / Linux (Windows supported via WSL or native)

### Installation

```bash
# Clone
git clone https://github.com/WestonGFX/waifu-rt3d.git
cd waifu-rt3d

# Install Python deps
pip install -r requirements.txt

# Optional: install TTS engines
pip install edge-tts          # Microsoft Edge TTS (free, recommended)
pip install faster-whisper    # Local offline STT (CPU or GPU)
pip install kokoro-onnx       # Kokoro TTS (local high quality)

# Run
python backend/server.py
```

Open **http://localhost:8080** in your browser.

---

## ⚙️ Configuration

All settings are stored in `backend/storage/app.json` and editable via **Settings** (gear icon or `Ctrl+,`).

### LLM Providers

| Provider | Config `provider` | Notes |
|---|---|---|
| LM Studio | `lmstudio-rest` | Local GPU, privacy-first |
| Ollama | `ollama` | Local CPU/GPU |
| OpenAI-compatible | `local` | Any OpenAI-style endpoint |
| **Google Gemini** | `gemini` | Flash/Pro/2.5, needs `api_key` |
| **Anthropic Claude** | `claude` | Haiku/Sonnet/Opus, needs `api_key` |
| OpenAI | `local` | Set `endpoint` to `https://api.openai.com/v1` |

### TTS Providers

| Provider | `tts.provider` | Quality | Notes |
|---|---|---|---|
| Edge TTS | `edge-tts` | Good | Free, 400+ neural voices |
| Kokoro | `kokoro` | Excellent | Local, ONNX, fast |
| Chatterbox | `chatterbox` | Excellent | Local, expressive |
| GPT-SoVITS | `gptsovits` | Best | Voice cloning, needs GPU |
| ElevenLabs | `elevenlabs` | Premium | Cloud, paid |
| Fish Audio | `fish_audio` | Great | Cloud/self-host |
| Piper | `piper_local` | Good | Fully offline |
| XTTS | `xtts_server` | Good | Local server |

### STT Providers

| Provider | `asr.provider` | Notes |
|---|---|---|
| Faster-Whisper | `faster_whisper` | Local, offline, CPU/GPU |
| Whisper API | `whisper_api` | OpenAI cloud |
| Browser WebSpeech | (none) | Browser built-in, online only |

---

## 📡 OBS Streaming Overlay

Add as a **Browser Source** in OBS:

1. URL: `http://localhost:8080/viewer/overlay.html`
2. Width: `1920`, Height: `1080`
3. Enable "Shutdown source when not visible" (optional)
4. The character appears transparent over your stream with subtitle bar

The overlay receives speak/animate events from the backend via WebSocket (`/ws/overlay`).

---

## 🏗️ Architecture

```
waifu-rt3d/
├── backend/
│   ├── server.py              # FastAPI server (~3500 lines)
│   ├── preflight.py           # DB migrations (schema v10)
│   ├── llm/
│   │   ├── registry.py        # Adapter factory
│   │   └── adapters/          # openai_compat, ollama, lmstudio, gemini, claude_api
│   ├── tts/
│   │   ├── registry.py        # TTS factory
│   │   └── adapters/          # edge_tts, kokoro, chatterbox, gptsovits, elevenlabs, …
│   └── asr/
│       ├── registry.py        # STT factory
│       └── adapters/          # faster_whisper, whisper_api, whisper_local
├── frontends/
│   └── neon/                  # Cyberpunk bento-grid UI (vanilla JS modules)
│       ├── index.html
│       ├── js/
│       │   ├── core/          # StateManager, EventBus, Logger, API
│       │   ├── components/    # ChatInterface, SettingsModal, CharacterGrid, …
│       │   └── utils/         # Toast, KeyboardShortcuts
│       └── viewer/
│           ├── viewer.html    # Three.js VRM renderer with lip sync
│           └── overlay.html   # OBS transparent overlay
├── tests/
│   └── test_phase6_helpers.py # 31 unit tests (no server required)
└── .github/
    └── workflows/
        └── test.yml           # CI: pytest + ESLint on every PR
```

### Key API Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/health` | Health check (version, LLM/DB status) |
| `GET/POST` | `/api/characters` | List / create characters |
| `PUT` | `/api/characters/{id}` | Update character |
| `GET` | `/api/characters/{id}/export` | Export character as JSON |
| `POST` | `/api/characters/import` | Import character from JSON |
| `GET` | `/api/characters/{id}/relationship` | Get affinity/mood/trust scores |
| `POST` | `/api/chat` | Non-streaming chat |
| `GET` | `/api/chat/stream` | SSE streaming chat (with chunked TTS) |
| `POST` | `/api/tts` | Direct TTS synthesis |
| `POST` | `/api/asr/transcribe` | Faster-Whisper STT |
| `WS` | `/ws/overlay` | OBS overlay WebSocket |

---

## 🧪 Running Tests

```bash
pytest tests/ -v
```

All 31 tests run without a live server — they test helpers (`_clean_for_tts`, `_parse_emotion_gesture`, TTS adapter cache, etc.) directly.

---

## 🔮 Roadmap

See [Master Improvement Menu](docs/IMPROVEMENT_MENU.md) (~128 items) for the full roadmap.

**Next major milestones:**
1. **Phase 7B** — Gemini/Claude in Settings UI, relationship bond card, daily greeting
2. **Phase 8** — Electron desktop app + desktop pet mode
3. **Phase 9** — Twitch chat integration + Mixamo animations (6F)
4. **Phase 10** — V2 React frontend activation

---

## 📝 Changelog

See [CHANGELOG.md](CHANGELOG.md) for version history.

---

## 📄 License

MIT — see [LICENSE](LICENSE).
