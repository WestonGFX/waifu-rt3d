# Waifu-RT3D — User Guide

## 1. Installation

### Requirements

- **Python 3.11+**
- **LM Studio** (recommended) or any OpenAI-compatible LLM endpoint
- macOS / Linux / Windows (WSL or native)
- **Node.js 18+** (optional, only needed to build the Sakura frontend)

### Option A: Interactive Installer (Recommended)

```bash
git clone https://github.com/WestonGFX/waifu-rt3d.git
cd waifu-rt3d
./setup.sh
```

The installer guides you through:
1. Python virtual environment creation
2. Core dependency installation
3. Optional TTS engine setup (Kokoro)
4. Optional Sakura frontend build (requires Node.js 18+)
5. Database initialization and migration

**Other installer modes:**
- `./setup.sh --repair` — Re-install deps, re-run migrations, verify config (fixes broken installs)
- `./setup.sh --minimal` — Core deps only, skip TTS extras and Sakura build

### Option B: Manual Setup

```bash
git clone https://github.com/WestonGFX/waifu-rt3d.git
cd waifu-rt3d

# Install Python dependencies
pip install -r requirements.txt

# Optional: local TTS/STT engines
pip install edge-tts          # Microsoft Edge TTS (free, recommended)
pip install faster-whisper    # Offline STT (CPU or GPU)
pip install kokoro-onnx       # Kokoro TTS (local, high quality)

# Optional: build the Sakura frontend (requires Node.js 18+)
cd frontends/sakura && npm install && npm run build && cd ../..

# Run
python backend/server.py
```

Open **http://localhost:8080** in your browser.

> **First run:** The app creates `backend/config/app.json` with defaults and initializes the SQLite database. The **Onboarding Wizard** will guide you through initial setup — hardware scan, LLM configuration, character creation, voice setup, and a feature tour. You can skip steps and return to them later via **Settings > Setup Guides**.

---

## 2. LLM Setup

The app supports 5 LLM providers. Configure in **Settings > Brain** (gear icon or `Ctrl+,`).

### LM Studio (Recommended)

1. Download and install [LM Studio](https://lmstudio.ai/)
2. Load a model (e.g., Qwen3-8B, Gemma3-12B, or any chat model)
3. Start the local server in LM Studio
4. In Waifu-RT3D settings, set:
   - **Provider**: `lmstudio`
   - **Endpoint**: `http://127.0.0.1:1234/v1`
   - **API Key**: `lm-studio`

### Ollama

1. Install [Ollama](https://ollama.ai/) and pull a model
2. Set **Provider**: `ollama`, **Endpoint**: `http://127.0.0.1:11434`

### OpenAI-Compatible

Works with any OpenAI-style endpoint (OpenAI, Together, Groq, etc.).

- Set **Provider**: `local`, **Endpoint**: your API URL, **API Key**: your key

### Google Gemini

- Set **Provider**: `gemini`, **API Key**: your Gemini API key
- Supports Flash, Pro, and 2.5 models via native SDK

### Anthropic Claude

- Set **Provider**: `claude`, **API Key**: your Anthropic API key
- Supports Haiku, Sonnet, and Opus with streaming SSE

### Per-Character LLM Routing

Each character can use a different LLM. In the character editor, set:
- **LLM Endpoint** — override the global endpoint
- **LLM Model** — override the global model
- **Temperature** — per-character creativity slider

---

## 3. Text-to-Speech (TTS)

The app supports 9 TTS providers. Configure the global default in **Settings > Voice**.

### Quick Start: Edge-TTS

The easiest option — no server needed, 400+ neural voices:

```bash
pip install edge-tts
```

Set **Provider**: `edge-tts`, **Voice ID**: `en-US-AriaNeural` (or any Edge voice).

### Local TTS Engines

| Engine | Install | Notes |
|--------|---------|-------|
| **Kokoro** | `pip install kokoro-onnx` | Fast local ONNX inference, 15+ voices |
| **Piper** | Download voice packs | Fully offline ONNX, many languages |
| **Chatterbox** | Requires server | Zero-shot voice cloning |
| **GPT-SoVITS** | Requires server + GPU | Anime-optimized voice cloning |
| **XTTS** | Requires server | Local voice cloning |

### Cloud TTS Engines

| Engine | Notes |
|--------|-------|
| **ElevenLabs** | Premium cloud, requires API key |
| **Fish Audio** | Cloud or self-hosted |
| **Pinokio/Generic** | Any REST TTS server |

### TTS Features

- **Sentence-chunked streaming**: first audio plays in ~1–2 seconds
- **Audio cache**: repeated phrases play instantly from cache
- **Emotion-modulated speech**: rate/pitch adjust per detected emotion
- **Per-character voice**: each character can have its own voice ID, rate, and pitch
- **Voice sample upload**: for voice cloning adapters (Chatterbox, GPT-SoVITS, XTTS)
- **Voice preview**: test voices before assigning via the preview button

---

## 4. Speech-to-Text (STT)

### Faster-Whisper (Recommended for Offline)

```bash
pip install faster-whisper
```

Set **STT Provider**: `faster_whisper`. Works fully offline, supports CPU and GPU.

### Whisper API

Set **STT Provider**: `whisper_api`. Uses OpenAI's cloud Whisper endpoint.

### Browser WebSpeech

Set **STT Provider**: `browser`. Uses the browser's built-in speech recognition (requires internet).

### STT Controls

- **VAD threshold slider**: adjust noise gate sensitivity
- **ASR confidence threshold**: minimum confidence to accept transcription
- **Live transcription preview**: see words appearing as you speak

---

## 5. Characters

### Creating a Character

Click the **"+"** button in the character grid or use the **Create-a-Waifu** full-page creator.

The creator has 4 tabs:

1. **Identity** — name, greeting, system prompt, personality traits, background story
2. **Appearance** — VRM model selection, background mode (solid color / image / transparent), portrait
3. **Voice** — TTS provider, voice ID, rate, pitch, voice sample upload
4. **Personality** — 5 animation sliders that control how the character moves in 3D:
   - **Energy** (0–1): movement speed and breathing rate
   - **Confidence** (0–1): posture straightness and gesture width
   - **Nervousness** (0–1): fidget frequency and hand closeness
   - **Expressiveness** (0–1): emotion amplitude and gesture scale
   - **Playfulness** (0–1): unlocks fun fidgets (peace sign, hip cock, etc.)

### Character Features

- **Relationship scores**: affinity, mood, and trust evolve through conversation
- **Mood persistence**: emotional state carries between sessions
- **Daily greeting**: auto-sent on first chat of the day
- **Character diary**: LLM writes first-person session summaries that influence future behavior
- **Anniversary tracking**: milestone detection based on first chat date
- **Export/Import**: share characters as JSON packages

### Adding VRM Models

Drop `.vrm` files into `backend/storage/avatars/`. They appear in the character creator's model dropdown.

### Adding Live2D Models

Live2D Cubism models (`.model3.json` + textures) are an alternative to VRM for 2D anime-style characters.

1. Place your Live2D model folder in `backend/storage/live2d/` (e.g., `backend/storage/live2d/ariu/ariu.model3.json`)
2. Or use the **Upload** button in Settings > Character > Live2D Model to upload a `.zip` archive
3. Click **Scan** to detect available models
4. Select a model from the dropdown — this sets `live2d_model` on the character and switches the viewer from VRM (iframe) to Live2D (PIXI canvas)

Live2D and VRM are mutually exclusive per character. Selecting a Live2D model clears the VRM assignment, and vice versa.

**Supported features:**
- Expression routing (emotion → Live2D expression names)
- Gesture/motion playback (idle, tap_body, flick_head groups)
- Volume-based lip sync via AudioContext + AnalyserNode
- Transparent PIXI background (for OBS and desktop pet)

> **Note:** Live2D requires the Cubism Core WASM library, which is loaded lazily on first use. Cubism 4 (model3.json) is supported; legacy Cubism 2 models may show console warnings but still render.

---

## 6. Agentic Characters

Characters with agentic mode enabled can use tools autonomously during conversation.

### Available Tools

| Tool | What It Does |
|------|-------------|
| **Memory Search** | RAG-powered retrieval from conversation history |
| **Diary Writing** | Writes session diary entries that persist |
| **Self-Modification** | Changes own greeting, traits, background |
| **Relationship Check** | Reads affinity/mood/trust scores |
| **Image Generation** | Triggers AI art via ComfyUI/SD adapters |
| **Voice Synthesis** | Generates speech with per-character voice |
| **Knowledge Base** | Searches uploaded character documents |
| **Cross-Character Messaging** | Characters can talk to each other |
| **Webhook Events** | Fires outbound webhooks for Zapier/n8n |
| **Web Search** | Searches the web for information |
| **Scene Control** | Changes background, camera angle |
| **Mood Analysis** | Analyzes conversation sentiment |

### How It Works

When agentic mode is enabled for a character, the LLM receives tool descriptions alongside the conversation. It can decide to call tools by emitting XML tool calls (for local models) or native function calls (for Claude/Gemini). The AgentRunner handles the tool execution loop and streams results back to the chat.

Tool calls appear in chat as styled cards showing the tool name, arguments, and result.

---

## 7. 3D Viewer

### Animation System

The viewer uses a 6-layer procedural animation pipeline driven by personality:

- **L0 BasePose**: breathing rhythm
- **L1 IdleBehavior**: 22 personality-gated fidgets
- **L2 Emotion**: additive posture from current mood
- **L3 Talk**: hand gestures during speech
- **L4 Gesture**: triggered animations (wave, bow, dance, etc.)
- **L5 LookAt**: mouse tracking + idle gaze wander

### Camera Controls

Three preset views available via buttons or keyboard shortcuts:
- **Full Body** — sees the entire character
- **Bust** — waist up
- **Face** — close-up portrait

### Visual Options

- **Shadow quality**: Off / Soft / Sharp
- **Disco/party lighting**: RGB point lights with hue cycling
- **Background**: solid color, custom image, or transparent (for OBS)
- **Screenshot**: capture current viewport as PNG

---

## 8. OBS Streaming Overlay

Add the overlay as a **Browser Source** in OBS:

```
URL: http://localhost:8080/viewer/overlay.html
Width: 1920
Height: 1080
```

- Transparent background — character floats over your stream
- Live subtitles from AI responses
- Receives speak/animate events via WebSocket (`/ws/overlay`)

---

## 9. Voice Conversation (Full-Duplex)

Voice Conversation mode enables real-time spoken dialogue with your character — you speak, the AI responds with speech, and you can interrupt at any time.

### Starting a Voice Conversation

1. Open a chat with any character
2. Click the **microphone icon** in the chat composer bar to enter voice mode
3. The **VoiceOrb** appears — an animated indicator showing the current state:
   - **Idle** (gentle pulse): waiting for you to speak
   - **Listening** (reactive rings): detecting your voice
   - **Processing** (morphing): AI is thinking
   - **Speaking** (output-reactive): AI is responding with audio

### How It Works

Voice mode uses a WebSocket connection (`/ws/voice`) for bidirectional audio:

1. **Your speech** → captured via MediaRecorder → sent as binary audio chunks to the server
2. **Server pipeline**: VAD (voice activity detection) → silence detection → Faster-Whisper ASR → LLM → sentence-chunked TTS
3. **AI speech** → TTS audio chunks streamed back to you via WebSocket → Web Audio API playback

### Barge-In (Interrupting the AI)

If the AI is speaking and you start talking, **barge-in** activates:
- The AI's audio stops immediately (current AudioBufferSourceNode is halted)
- The server transitions to LISTENING state
- Your new speech is transcribed and processed

### Voice Settings

Configure in **Settings > Voice > Voice Conversation**:

| Setting | Default | Description |
|---------|---------|-------------|
| **VAD Sensitivity** | 0.015 | Voice activity detection threshold (lower = more sensitive) |
| **Silence Timeout** | 1500ms | How long to wait after you stop speaking before processing |
| **Auto-Interrupt** | On | Whether your speech automatically interrupts AI responses |
| **Echo Cancellation** | On | Browser-native echo cancellation on microphone input |

### Requirements

- A working STT provider (Faster-Whisper recommended for offline use)
- A working TTS provider (any of the 9 supported engines)
- Microphone access (browser will prompt for permission)

---

## 10. Sakura Frontend

Sakura is a chat-first consumer UI built with React 19, designed as an alternative to the Neon cyberpunk dashboard. It emphasizes conversation over configuration.

### Accessing Sakura

- Visit **http://localhost:8080/sakura** directly
- Or set `"default_frontend": "sakura"` in `backend/config/app.json` to make it the default at `/`
- The Neon frontend remains available at `/neon` regardless of the default setting

### Theme Modes

Sakura ships with **18 built-in themes** (9 light, 9 dark), switchable in Settings:

**Light themes:**
- **Sakura** (default) — Warm rose-pink palette, cherry blossom aesthetic
- **Crystal** — Cool ice-blue, clean and minimal
- **Pop Bubblegum** — Vibrant pink/magenta
- **Pop Lemonade** — Bright yellow/citrus
- **Catppuccin Latte** — Pastel warm, community favorite

**Dark themes:**
- **Sakura Dark** / **Crystal Dark** — Dark variants of the defaults
- **Hacker Green** — Terminal-style green-on-black
- **Monokai** — Classic Monokai editor colors
- **Darcula** / **Dracula** — JetBrains and Dracula theme ports
- **Tokyo Night** — Soft blue/purple dark theme
- **Catppuccin Macchiato** — Pastel dark variant
- **Blurple** — Discord-inspired purple

All themes include a subtle film grain overlay, consistent CSS custom properties, and font integration (Nunito + Fraunces).

### Navigation

A bottom tab bar provides access to five sections:

| Tab | Shortcut | Description |
|-----|----------|-------------|
| **Chats** | `Ctrl+1` | Character list sorted by recent activity. Tap a character to open the chat thread. |
| **Discover** | `Ctrl+2` | Placeholder for future community character browsing. |
| **Create** | `Ctrl+3` | 5-step character creation wizard (Identity, Appearance, Voice, Personality, Review). |
| **Memory** | `Ctrl+4` | Slide-out panel showing context budget, RAG status, and session stats. |
| **Settings** | `Ctrl+5` | Progressive disclosure settings with Advanced and Compact mode toggles. |

### Chat Thread

The chat uses a visual novel dialogue style:
- **Her messages** — Full-width card with character name, dialogue text, and small audio/info icons
- **Your messages** — Right-aligned accent-colored bubbles

The chat header shows the character's name, online status, and an ambient idle phrase (e.g., "daydreaming...", "humming a song~"). Click the **eye icon** to toggle the 3D model panel (slides in from the right, 40% width).

### Character Creation Wizard

The 5-step wizard guides you through:

1. **Identity** — Name, greeting message, system prompt
2. **Appearance** — VRM model selection from server
3. **Voice** — TTS provider and voice picker with test button
4. **Personality** — 5 animation sliders (energy, confidence, nervousness, expressiveness, playfulness)
5. **Review** — Summary of all settings before creation

### Settings

Sakura's settings use progressive disclosure:
- **Standard mode** (default) — Shows only essential settings: theme, voice, AI model, behavior
- **Advanced mode** (toggle) — Reveals all settings including temperature, history limit, developer options
- **Compact mode** (toggle) — Hides inline descriptions for a tighter layout, keeps hover tooltips

---

## 11. Keyboard Shortcuts

Open the keyboard shortcut editor from **Settings > Shortcuts**.

Default shortcuts:
- `Ctrl+,` — Open settings
- `Enter` — Send message
- `Shift+Enter` — New line in chat input

Shortcuts are fully customizable via the in-app editor.

### Sakura Panel Shortcuts

All overlay panels in the Sakura frontend are accessible via `alt+` shortcuts:

| Shortcut | Panel |
|----------|-------|
| `alt+s` | Session Summary Panel |
| `alt+h` | Schedule Editor |
| `alt+f` | Global Search |
| `alt+i` | Scenario Library |
| `alt+b` | Mood Board Editor |
| `alt+p` | Model Arena (LLM comparison) |
| `alt+r` | Session Replay |
| `alt+o` | Character Portfolio |
| `alt+w` | Relationship Web |
| `alt+a` | Analytics Panel |

These shortcuts fire regardless of focus and are not remappable in the current release.

---

## 12. Settings Reference

Settings are stored in `backend/config/app.json` and editable via the Settings panel in both Neon and Sakura frontends.

For the complete reference of all 75+ configuration keys with types, defaults, valid values, and descriptions, see **[SETTINGS_REFERENCE.md](SETTINGS_REFERENCE.md)**.

### Quick Reference (Most Common)

| Setting | Default | Description |
|---------|---------|-------------|
| `llm.provider` | `lmstudio` | LLM provider (`lmstudio`, `ollama`, `local`, `gemini`, `claude`) |
| `llm.endpoint` | `http://127.0.0.1:1234/v1` | LLM API endpoint |
| `llm.history_limit` | `30` | Max messages sent to LLM (0 = unlimited) |
| `temperature` | `0.7` | LLM creativity (0.1–2.0) |
| `context_limit` | `131072` | Max token context window |
| `tts.provider` | `edge-tts` | TTS provider |
| `tts.voice_id` | `en-US-AriaNeural` | Default voice |
| `tts.auto_speak` | `true` | Auto-play TTS after each response |
| `asr.provider` | `browser` | STT provider |
| `vad_threshold` | `0.015` | VAD noise gate sensitivity (0.001–0.05) |
| `shadow_quality` | `off` | 3D shadow quality (off/soft/sharp) |
| `default_frontend` | `neon` | Which frontend to serve at `/` (`neon` or `sakura`) |
| `content_filter_level` | `1` | Content safety (-1=NSFW, 0=model defaults, 1–3=filtered) |

---

## 13. Troubleshooting

### Backend won't start

- Check that Python 3.11+ is installed: `python --version`
- Check that all requirements are installed: `pip install -r requirements.txt`
- Port 8080 may be in use — check with `lsof -i :8080`

### LLM not responding

- Verify your LLM server is running (LM Studio, Ollama, etc.)
- Check the endpoint URL in settings
- The connection indicator (green/yellow/red dot) shows LLM status
- Try the `/api/health` endpoint to see backend status

### No audio / TTS not working

- For Edge-TTS: ensure `pip install edge-tts` is done
- For local engines: verify the TTS server is running
- Check the TTS provider setting matches an installed engine
- Use the voice preview button to test the configuration

### VRM model not loading

- Ensure the `.vrm` file is in `backend/storage/avatars/`
- Check browser console (F12) for loading errors
- VRM 0.x and 1.x formats are both supported

### Sakura frontend not loading

- Ensure the frontend has been built: `cd frontends/sakura && npm install && npm run build`
- Visit `/sakura` directly — it requires a production build (the dev server is separate)
- For development: `cd frontends/sakura && npm run dev` (serves on port 5175 with hot reload)
- Check that `frontends/sakura/dist/` exists and contains `index.html`

### Database issues

- The database auto-migrates on startup (currently schema v30)
- For corruption, delete `backend/storage/app.db` and restart (loses data)
- You can also run `./setup.sh --repair` to re-run migrations and verify config
- SQLite WAL mode is enabled for concurrent read/write

---

## 14. Sakura Mobile PWA

The Sakura frontend ships as a Progressive Web App (PWA) — installable to your home screen on iPhone, iPad, and Android, with a native-app feel.

### Installing on iOS (Safari)

1. Open **http://localhost:8080/sakura** in Safari on iPhone or iPad
2. Tap the **Share** button (box with arrow icon) in the toolbar
3. Tap **"Add to Home Screen"**
4. Tap **"Add"** — the Waifu.EXE icon appears on your home screen

### Installing on Android (Chrome)

1. Open **http://localhost:8080/sakura** in Chrome on Android
2. Chrome shows an **"Add to Home Screen"** banner automatically, or:
3. Tap the **⋮ menu → "Add to Home Screen"**

### Mobile UI Differences

When accessed from a mobile device, the app switches to **MobileApp** layout:
- **Bottom tab bar** with 5 tabs: Chats, Discover, Create, Memory, Settings
- Swipe-friendly list views optimized for small screens
- Same API and character data as the desktop experience

> **Note:** The PWA requires your server to be reachable from the mobile device. On a LAN, use your Mac's local IP (e.g. `http://192.168.1.x:8080/sakura`) instead of `localhost`.

---

## 15. Remote GPU Motion Server

The 3D viewer supports offloading animation generation to a Windows PC with an NVIDIA GPU on your local network, enabling higher-quality physics-based motion.

### Setting Up

1. On your Windows GPU machine, run the Waifu-RT3D motion server (see `backend/motion/README.md`)
2. Ensure both machines are on the same WiFi network
3. In the Sakura 3D viewer panel, click the **"Proc. Motion"** badge in the bottom bar to open the wizard

### Wizard States

The GPU wizard walks through 7 states:

| State | Description |
|-------|-------------|
| **Idle** | Choose "Scan for GPU Server" or "Enter IP" manually |
| **Scanning** | LAN subnet scan (~8 seconds) |
| **Found** | Lists discovered servers — click "Connect" |
| **Not Found** | Enter a server URL manually |
| **Connecting** | Testing the connection |
| **Connected** | Badge turns green, shows "GPU Remote" |
| **Error** | Connection failed — shows error message |

### Disconnecting

Click the green **"GPU Remote"** badge and confirm to disconnect. The app falls back to local procedural generation immediately.

---

## 16. Desktop Pet (Electron)

The Desktop Pet wraps the Sakura frontend in an Electron shell, adding a transparent always-on-top character overlay that floats on your desktop.

### Requirements

- **Node.js 18+**
- A running backend (`python backend/server.py` or `./run.sh`)

### Running the Electron App

```bash
cd electron
npm install          # First time only
npm start            # Normal mode
npm start -- --dev   # With DevTools open
```

The app opens two windows:
1. **Full App Window** — standard maximized window loading `http://localhost:8080`
2. **Desktop Pet Window** — transparent frameless overlay showing only the character

### Desktop Pet Features

- **Transparent overlay**: only the character is visible — transparent areas pass clicks to apps below
- **Click-through hit testing**: WebGL pixel reads determine if the cursor is over the character or empty space
- **Drag-to-move**: click and drag on the character body to reposition the pet
- **Speech bubble**: click the character to see the latest AI message with action buttons
- **System tray**: right-click the tray icon for quick access to Show App, Toggle Pet, Mute, Quit
- **Global shortcut**: `Ctrl+Shift+P` (or `Cmd+Shift+P` on macOS) toggles pet visibility
- **Window memory**: position and size are saved across sessions via `electron-store`
- **Single instance**: only one Electron process runs at a time

### VRM + Live2D Support

The pet window supports both model types:
- **VRM**: rendered via iframe loading `viewer.html` with `?pet=1&noChatOverlay=1`
- **Live2D**: rendered via PIXI.Application with transparent background (`backgroundAlpha: 0`)

The active model type is determined by the character's `live2d_model` field.

---

## 17. Running Tests

```bash
# Backend tests (152 tests)
python -m pytest backend/tests/ -v

# Quick run (stop on first failure)
python -m pytest backend/tests/ -x --tb=short

# Frontend unit tests (80 tests)
cd frontends/sakura && npx vitest run

# E2E browser tests (26 tests, requires running dev server)
cd frontends/sakura && npx playwright test
```

**Backend tests (152):** API endpoints, character CRUD, agentic tool execution, capability profiles, telemetry, memory search, routing, chat pipeline, voice module (VAD, audio utils, duplex state machine).

**Frontend tests (80):** wizard store, wizard shell, feature discovery, what's-new modal, settings, onboarding.

**E2E tests (26):** onboarding wizard flow, settings navigation, setup wizard modals, version update modal.
