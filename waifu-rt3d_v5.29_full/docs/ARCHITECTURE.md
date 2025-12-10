# 🏗️ waifu-rt3d Architecture

## Overview

waifu-rt3d is a full-stack web application built with a modern, modular architecture that emphasizes:
- **Extensibility** - Easy to add new providers and features
- **Privacy** - Local-first with optional cloud services
- **Performance** - Caching, offline support, and optimization
- **Simplicity** - Minimal dependencies, no build tools required

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         Frontend                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │   Setup     │  │   Viewer    │  │    Chat     │         │
│  │     UI      │  │  (Three.js) │  │     UI      │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
│         │                 │                 │                │
│         └─────────────────┴─────────────────┘                │
│                           │                                  │
│                      Fetch API                               │
└───────────────────────────┼──────────────────────────────────┘
                            │
                       HTTP/REST
                            │
┌───────────────────────────┼──────────────────────────────────┐
│                      FastAPI Server                          │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              API Endpoints Layer                      │   │
│  │  /api/config  /api/chat  /api/tts  /api/avatars     │   │
│  └──────────────────────────────────────────────────────┘   │
│                           │                                  │
│  ┌────────────────────┬───┴────┬────────────────┐          │
│  │                    │        │                 │          │
│  ▼                    ▼        ▼                 ▼          │
│ ┌────────┐     ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│ │Config  │     │   LLM    │  │   TTS    │  │ Storage  │   │
│ │Manager │     │ Registry │  │ Registry │  │ Manager  │   │
│ └────────┘     └──────────┘  └──────────┘  └──────────┘   │
│                      │             │                        │
│                      │             │                        │
│              ┌───────┴───────┐ ┌──┴─────────────┐          │
│              │               │ │                 │          │
│         ┌────▼────┐    ┌────▼─▼──┐    ┌────────▼─────┐    │
│         │LMStudio │    │FishAudio│    │  Piper      │    │
│         │Adapter  │    │Adapter  │    │  Adapter    │    │
│         └─────────┘    └─────────┘    └──────────────┘    │
│              │               │              │               │
│              └───────┬───────┴──────────────┘               │
│                      │                                      │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              SQLite Database                          │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────────────┐   │  │
│  │  │ sessions │  │ messages │  │ messages_fts     │   │  │
│  │  └──────────┘  └──────────┘  └──────────────────┘   │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                            │
                            │
┌───────────────────────────┼──────────────────────────────────┐
│                   External Services                          │
│                                                               │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────┐    │
│  │  LM Studio  │  │  Fish Audio  │  │  ElevenLabs     │    │
│  │  (Local)    │  │  (Cloud)     │  │  (Cloud)        │    │
│  └─────────────┘  └──────────────┘  └─────────────────┘    │
│                                                               │
│  ┌─────────────┐  ┌──────────────┐                          │
│  │    Piper    │  │ XTTS Server  │                          │
│  │   (Local)   │  │  (Local)     │                          │
│  └─────────────┘  └──────────────┘                          │
└─────────────────────────────────────────────────────────────┘
```

---

## Backend Architecture

### Core Components

#### 1. FastAPI Server (`backend/server.py`)
- **Purpose**: Main application entry point
- **Responsibilities**:
  - HTTP request routing
  - Static file serving
  - Configuration management
  - Database connection management
  - Coordination between adapters

#### 2. Preflight System (`backend/preflight.py`)
- **Purpose**: Application initialization
- **Responsibilities**:
  - Create required directories
  - Initialize default configuration
  - Set up SQLite database schema
  - Run on startup

#### 3. Adapter System

##### LLM Adapters (`backend/llm/`)
- **Base Class**: `LLMAdapter`
- **Registry**: `llm/registry.py` - Factory pattern for adapter selection
- **Current Adapters**:
  - `LMStudioAdapter` - OpenAI-compatible local server

**Adapter Interface:**
```python
class LLMAdapter:
    def chat(self, messages, model, endpoint, api_key, **kwargs) -> dict:
        # Returns: {'ok': bool, 'reply': str, 'error': str (optional)}
        pass
```

##### TTS Adapters (`backend/tts/`)
- **Base Class**: `TTSAdapter`
- **Registry**: `tts/registry.py` - Factory pattern for adapter selection
- **Current Adapters**:
  - `FishAudioAdapter` - Cloud/self-hosted Fish Audio
  - `ElevenLabsAdapter` - ElevenLabs API
  - `PiperLocalAdapter` - Local Piper CLI
  - `XTTSAdapter` - Local XTTS server

**Adapter Interface:**
```python
class TTSAdapter:
    def __init__(self, audio_dir: Path):
        self.audio_dir = audio_dir

    def speak(self, text: str, tts_cfg: dict) -> dict:
        # Returns: {'ok': bool, 'filename': str, 'meta': dict, 'error': str (optional)}
        pass

    def _mk_name(self, key: str, ext: str) -> str:
        # Generates unique filename based on hash
        pass
```

**Key Features:**
- Automatic filename generation with content hashing
- Caching support - same text/voice generates same filename
- Error handling with descriptive messages
- Metadata tracking

#### 4. Database Layer

**Schema** (`backend/db/schema_v3.sql`):

```sql
-- Sessions table
sessions(
  id INTEGER PRIMARY KEY,
  title TEXT,
  created_ts REAL
)

-- Messages table
messages(
  id INTEGER PRIMARY KEY,
  session_id INTEGER,
  role TEXT, -- 'user', 'assistant', 'system'
  text TEXT,
  ts REAL
)

-- Full-text search
messages_fts (
  -- FTS5 virtual table
  -- Automatically synced via triggers
)
```

**Features:**
- WAL mode for better concurrency
- FTS5 for fast text search
- Automatic triggers for FTS sync
- Timestamp tracking

#### 5. Storage System

```
backend/storage/
├── avatars/          # Uploaded 3D models (.vrm, .glb, .gltf)
├── audio/            # Generated TTS audio files
└── app.db            # SQLite database file
```

**Audio File Naming:**
```
{timestamp}_{hash}.{ext}
```
- `timestamp`: Unix timestamp for uniqueness
- `hash`: SHA1 hash of key (provider|voice|text) for caching
- `ext`: File extension (mp3, wav, opus)

---

## Frontend Architecture

### Technology Stack
- **Vanilla JavaScript** - No framework, no build step
- **ES6 Modules** - Native browser imports
- **Three.js** - 3D rendering engine
- **CSS Grid/Flexbox** - Modern layouts

### Component Structure

#### 1. Main UI (`frontend/index.html`)
Single-page application with tab-based navigation:

**Tabs:**
- **Setup** - Configuration management
- **Viewer** - 3D avatar model management
- **Chat** - Conversation interface
- **System** - Health checks and diagnostics

**Key Features:**
- Inline JavaScript (no build step)
- Event-driven architecture
- Fetch API for HTTP requests
- Audio playback with Web Audio API

#### 2. 3D Viewer (`frontend/viewer/`)

**viewer.html:**
- Standalone 3D model viewer
- URL parameter: `?url=/files/avatars/model.vrm`
- Automatic VRM support detection
- Fallback to simple cube if no model

**loader.js:**
```javascript
export async function loadLib(localPath, cdn) {
  // Try local first, fallback to CDN
  try {
    return await import(localPath);
  } catch {
    return await import(cdn);
  }
}
```

**Three.js Integration:**
- Dynamic CDN fallback
- WebGL rendering
- Perspective camera
- Directional + ambient lighting

#### 3. Styling (`frontend/assets/css/theme.css`)

**Design System:**
```css
:root {
  --bg: #0b0c10;        /* Dark background */
  --fg: #e6e6e6;        /* Light foreground */
  --muted: #9aa0a6;     /* Muted text */
  --ac: #6aa9ff;        /* Accent blue */
  --card: #121418;      /* Card background */
  --border: #1e2128;    /* Border color */
}
```

**Features:**
- Dark theme optimized
- CSS Grid for responsive layouts
- Smooth animations
- Glassmorphism effects on topbar

---

## Data Flow

### Chat Request Flow

```
User Input (Frontend)
    │
    ▼
POST /api/chat
  {text: "Hello", speak: true}
    │
    ▼
Server validates & stores user message
    │
    ▼
Fetch conversation history from DB
    │
    ▼
LLM Registry → Select adapter
    │
    ▼
LMStudio Adapter → POST to LM Studio
    │
    ▼
Receive AI response
    │
    ▼
Store assistant message in DB
    │
    ├─ If speak=false ───────────────┐
    │                                 │
    ▼                                 │
TTS Registry → Select adapter        │
    │                                 │
    ▼                                 │
Generate audio file                  │
    │                                 │
    ▼                                 │
Return response ◄────────────────────┘
  {ok: true, reply: "...", audio: "..."}
    │
    ▼
Frontend displays reply
    │
    ▼
If audio URL exists → Play audio
```

### TTS Generation Flow

```
Text Input
    │
    ▼
Provider-specific config
    │
    ├─ Fish Audio: API request → Base64 decode
    ├─ ElevenLabs: API request → Binary download
    ├─ Piper: CLI subprocess → File output
    └─ XTTS: HTTP request → Binary download
    │
    ▼
Generate unique filename
    │
    ▼
Save to backend/storage/audio/
    │
    ▼
Return filename
```

### Avatar Upload Flow

```
File Select (Frontend)
    │
    ▼
Validate file extension (.vrm/.glb/.gltf)
    │
    ▼
POST /api/avatars/upload (multipart/form-data)
    │
    ▼
Server sanitizes filename
    │
    ▼
Save to backend/storage/avatars/
    │
    ▼
Return file URL
    │
    ▼
Frontend refreshes avatar list
```

---

## Configuration System

### Configuration File (`backend/config/app.json`)

```json
{
  "profile": "auto",
  "input_mode": "text",
  "output_mode": "text+voice",
  "llm": {
    "provider": "lmstudio",
    "endpoint": "http://127.0.0.1:1234/v1",
    "api_key": "lm-studio",
    "model": "model-name"
  },
  "tts": {
    "provider": "fish_audio",
    "endpoint": "https://api.fish.audio/v1",
    "api_key": "",
    "voice_id": "8ef4a238714b45718ce04243307c57a7",
    "format": "mp3",
    "sample_rate": 24000,
    "fallback_chain": ["piper_local", "xtts_server", "elevenlabs"]
  },
  "asr": {
    "provider": "disabled",
    "endpoint": "",
    "api_key": "",
    "model": ""
  },
  "memory": {
    "max_history": 12
  }
}
```

**Merge Strategy:**
- PUT /api/config performs deep merge
- Nested objects are updated, not replaced
- Preserves unmodified fields

---

## Security Considerations

### Current Implementation
- ✅ Path traversal protection (sanitized filenames)
- ✅ File type validation for uploads
- ✅ Local-only server binding (127.0.0.1)
- ✅ SQLite prepared statements (SQL injection safe)

### Missing (Future Work)
- ⚠️ No authentication/authorization
- ⚠️ No rate limiting
- ⚠️ No CORS configuration
- ⚠️ No input validation middleware
- ⚠️ No API key encryption

---

## Performance Optimizations

### Current
- WAL mode for SQLite (concurrent reads)
- Static file serving with FastAPI StaticFiles
- Content-based caching for TTS audio
- CDN fallback reduces server load

### Future
- Response caching
- Database connection pooling
- Streaming responses (SSE)
- Audio compression
- Lazy loading of UI components

---

## Extensibility Points

### Adding New Providers

1. **LLM Provider:**
   - Create adapter in `backend/llm/adapters/`
   - Implement `LLMAdapter` interface
   - Register in `backend/llm/registry.py`
   - Add to UI dropdown

2. **TTS Provider:**
   - Create adapter in `backend/tts/adapters/`
   - Implement `TTSAdapter` interface
   - Register in `backend/tts/registry.py`
   - Add to UI dropdown

3. **ASR Provider (Future):**
   - Create adapter in `backend/asr/adapters/`
   - Implement `ASRAdapter` interface
   - Register in `backend/asr/registry.py`

### Plugin System (Future)
- Plugin manifest format
- Sandboxed execution
- Plugin API hooks
- Discovery mechanism

---

## Deployment Architectures

### Local Development
```
Python venv → Uvicorn → FastAPI
Browser ← HTTP ← localhost:8000
```

### Docker (Future)
```
Docker Container
├── Python + Dependencies
├── FastAPI Server
└── Volume Mounts
    ├── /storage (persistent)
    └── /config (persistent)
```

### Cloud (Future)
```
Load Balancer
    ↓
Multiple FastAPI Instances
    ↓
Shared Storage (S3/GCS)
    ↓
Database (PostgreSQL)
```

---

## Testing Strategy

### Unit Tests (Future)
- Adapter tests (mock external APIs)
- Utility function tests
- Database query tests

### Integration Tests (Future)
- End-to-end API tests
- Provider integration tests
- Database integration tests

### UI Tests (Future)
- Browser automation tests
- Cross-browser compatibility
- Responsive design tests

---

## Monitoring & Observability (Future)

- Application logging (structured logs)
- Error tracking (Sentry integration)
- Performance monitoring (response times)
- Usage analytics (privacy-respecting)
- Health check endpoint (already exists)

---

## References

- FastAPI: https://fastapi.tiangolo.com/
- Three.js: https://threejs.org/
- SQLite FTS5: https://www.sqlite.org/fts5.html
- VRM Specification: https://vrm.dev/en/

---

This architecture document will be updated as the project evolves.
