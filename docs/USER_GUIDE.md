# Waifu-RT3D — User Guide

## 1. Installation

### Requirements

- **Python 3.11+**
- **LM Studio** (recommended) or any OpenAI-compatible LLM endpoint
- macOS / Linux / Windows (WSL or native)

### Setup

```bash
# Clone
git clone https://github.com/WestonGFX/waifu-rt3d.git
cd waifu-rt3d

# Install Python dependencies
pip install -r requirements.txt

# Optional: local TTS/STT engines
pip install edge-tts          # Microsoft Edge TTS (free, recommended)
pip install faster-whisper    # Offline STT (CPU or GPU)
pip install kokoro-onnx       # Kokoro TTS (local, high quality)

# Run
python backend/server.py
```

Open **http://localhost:8080** in your browser.

> **First run:** The app creates `backend/config/app.json` with defaults and initializes the SQLite database. Point your LLM settings at a running LM Studio instance and you're ready to chat.

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

## 9. Keyboard Shortcuts

Open the keyboard shortcut editor from **Settings > Shortcuts**.

Default shortcuts:
- `Ctrl+,` — Open settings
- `Enter` — Send message
- `Shift+Enter` — New line in chat input

Shortcuts are fully customizable via the in-app editor.

---

## 10. Settings Reference

Settings are stored in `backend/config/app.json` and editable via the Settings panel.

### Key Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `llm.provider` | `lmstudio` | LLM provider |
| `llm.endpoint` | `http://127.0.0.1:1234/v1` | LLM API endpoint |
| `llm.history_limit` | `30` | Max messages sent to LLM (0 = unlimited) |
| `tts.provider` | `edge-tts` | TTS provider |
| `tts.voice_id` | `en-US-AriaNeural` | Default voice |
| `stt.provider` | `browser` | STT provider |
| `vad_threshold` | `0.01` | VAD noise gate sensitivity |
| `asr_min_confidence` | `0` | Min ASR confidence (0 = accept all) |
| `shadow_quality` | `off` | Shadow quality (off/soft/sharp) |
| `font_size` | `medium` | Chat font size (small/medium/large) |

---

## 11. Troubleshooting

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

### Database issues

- The database auto-migrates on startup (currently schema v16)
- For corruption, delete `backend/storage/app.db` and restart (loses data)
- SQLite WAL mode is enabled for concurrent read/write

---

## 12. Running Tests

```bash
# Run all 98 tests
python -m pytest backend/tests/ -v

# Quick run (stop on first failure)
python -m pytest backend/tests/ -x --tb=short
```

Tests cover: API endpoints, character CRUD, agentic tool execution, capability profiles, telemetry, memory search, routing, and chat pipeline.
