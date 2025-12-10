## v5.30 (2025-11-20)

### ✨ Major Features
- **Session Management System**
  - Complete sessions UI with sidebar in `index_v2.html`
  - Create, switch, rename, and delete sessions
  - Auto-load message history on switch
  - Responsive mobile-friendly design
  - 5 new API endpoints for session CRUD

- **Voice Input (ASR - Automatic Speech Recognition)**
  - Browser-based speech recognition (Web Speech API)
  - Microphone button with visual feedback and recording animation
  - Whisper API adapter (OpenAI compatible endpoints)
  - Local Whisper.cpp adapter for fully offline transcription
  - `/api/asr` endpoint for audio file transcription
  - Configurable ASR providers in settings

- **Character Profile System**
  - Complete character management with database schema v4
  - Custom system prompts per character (personality/behavior)
  - Character-specific voice settings (voice_id and TTS provider)
  - Personality traits support (JSON array)
  - Characters table with foreign key to sessions
  - 4 new API endpoints: list, create, update, delete characters
  - Chat automatically uses character system prompt and voice
  - Default character provided (ID: 1)

- **Avatar Lip Sync Foundation**
  - Volume-based lip sync system (`LipSyncController` class)
  - Phoneme-based lip sync (`PhonemeLipSync` class)
  - VRM blend shape animation (supports VRM 0.x and 1.0)
  - Web Audio API integration for real-time analysis
  - Smooth mouth animations synced to audio
  - New module: `frontend/viewer/lipsync.js`

### 🎨 Frontend Improvements
- Created `frontend/index_v2.html` with all new features
- Sessions sidebar panel with visual session list
- Microphone button with pulsing animation when recording
- Voice activity indicator ("Listening..." feedback)
- Enter key sends message (Shift+Enter for newline)
- Mobile-optimized responsive grid layouts
- Improved chat UX with better feedback

### 🔧 Backend Improvements
- Database schema v4 with character profiles table
- Complete ASR module structure (`backend/asr/`)
- Character-aware chat responses using character system prompts
- Automatic character-specific TTS voice selection
- 10 new API endpoints total across features
- Enhanced chat endpoint with character integration
- Improved error handling for new endpoints

### 📦 New Files Created
**Backend:**
- `backend/asr/__init__.py`
- `backend/asr/registry.py`
- `backend/asr/adapters/__init__.py`
- `backend/asr/adapters/base.py`
- `backend/asr/adapters/whisper_api.py`
- `backend/asr/adapters/whisper_local.py`
- `backend/db/schema_v4.sql`

**Frontend:**
- `frontend/index_v2.html`
- `frontend/viewer/lipsync.js`

**Documentation:**
- `V5.30_RELEASE_NOTES.md`

### 📊 Statistics
- **Code added:** ~1,240 lines across 11 files
- **New API endpoints:** 10 (sessions: 5, characters: 4, ASR: 1)
- **New database tables:** 1 (characters)
- **New adapter types:** 1 (ASR)
- **Roadmap versions completed:** 4 (v5.30, v5.31, v5.32, v5.33)

### 🔄 Migration Notes
- Database auto-upgrades to v4 on startup
- No breaking changes - fully backward compatible
- Old frontend (`index.html`) still works
- New frontend (`index_v2.html`) recommended for new features
- Existing sessions and messages preserved

---

## v5.29.1 (2025-11-20)

### 🐛 Bug Fixes
- **CRITICAL:** Fixed syntax error in `server.py` (backslash escaping in sanitization)
  - Lines 86, 93: Changed `replace("\","")` to `replace("\\","")`
  - Application couldn't start without this fix

### ✨ New Features
- **Session Management API**
  - `GET /api/sessions` - List all sessions
  - `POST /api/sessions` - Create new session
  - `PUT /api/sessions/{id}` - Update session title
  - `DELETE /api/sessions/{id}` - Delete session
  - `GET /api/sessions/{id}/messages` - Get session messages

### 🔧 Improvements
- **Middleware System**
  - Added `ErrorHandlingMiddleware` for global exception handling
  - Added `RequestLoggingMiddleware` for request/response logging
  - Improved error responses with structured JSON

### 📚 Documentation
- Created comprehensive `README.md` with:
  - Feature overview
  - Installation instructions
  - API documentation
  - Architecture explanation
  - Development guide
- Created `ROADMAP.md` with detailed development plan
- Created `docs/ARCHITECTURE.md` with system architecture diagrams

### 🧪 Testing
- Created unit test suite in `tests/`
  - `test_adapters.py` - Tests for LLM and TTS adapters
  - `test_server.py` - Integration tests for API endpoints
- Added pytest and httpx to requirements

### 📦 Dependencies
- Added `pytest==8.*` for testing
- Added `httpx==0.27.*` for test client

---

## v5.29 (2025-10-18)
- Multi-provider TTS adapters; UI + caching.
