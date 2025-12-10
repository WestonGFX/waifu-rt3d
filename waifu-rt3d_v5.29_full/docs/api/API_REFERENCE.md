# API Reference - Complete Endpoint Documentation

**Version:** v5.30
**Base URL:** `http://localhost:8000`
**Total Endpoints:** 19

---

## Table of Contents

1. [Configuration](#configuration)
2. [Health & Status](#health--status)
3. [Avatar Management](#avatar-management)
4. [Chat & LLM](#chat--llm)
5. [Text-to-Speech](#text-to-speech)
6. [Session Management](#session-management-v530)
7. [Character Management](#character-management-v530)
8. [Speech Recognition](#speech-recognition-v530)

---

## Configuration

### GET /api/config

Get application configuration.

**Response:**
```json
{
  "llm": {
    "provider": "lmstudio",
    "endpoint": "http://127.0.0.1:1234/v1",
    "api_key": "lm-studio",
    "model": ""
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
    "enabled": false,
    "provider": "browser",
    "endpoint": "",
    "api_key": "",
    "model": "whisper-1",
    "language": "en"
  },
  "memory": {
    "max_history": 12
  }
}
```

---

### PUT /api/config

Update configuration (partial updates supported).

**Request:**
```json
{
  "llm": {
    "model": "mistral-7b"
  },
  "memory": {
    "max_history": 20
  }
}
```

**Response:**
```json
{
  "ok": true,
  "config": {
    // Full updated config
  }
}
```

---

## Health & Status

### GET /api/healthcheck

Check system health and dependencies.

**Response:**
```json
{
  "ok": true,
  "libs": {
    "three_local": true,
    "gltf_loader_local": true,
    "three_vrm_local": false
  },
  "lmstudio": true,
  "ttsConfigured": true,
  "issues": []
}
```

**Status Codes:**
- `ok: true` - All systems operational
- `ok: false` - Issues detected (see `issues` array)

---

## Avatar Management

### GET /api/avatars

List all uploaded avatar files.

**Response:**
```json
{
  "avatars": [
    {
      "name": "Panicandy.vrm",
      "url": "/files/avatars/Panicandy.vrm"
    },
    {
      "name": "Tsuki.vrm",
      "url": "/files/avatars/Tsuki.vrm"
    }
  ]
}
```

---

### POST /api/avatars/upload

Upload new avatar file (.vrm, .glb, or .gltf).

**Request:** `multipart/form-data`
```
file: <binary data>
```

**Response:**
```json
{
  "ok": true,
  "name": "MyAvatar.vrm",
  "url": "/files/avatars/MyAvatar.vrm"
}
```

**Error (400):**
```json
{
  "detail": "Only .vrm/.glb/.gltf supported"
}
```

---

### DELETE /api/avatars/{name}

Delete avatar file.

**Example:** `DELETE /api/avatars/OldAvatar.vrm`

**Response:**
```json
{
  "ok": true
}
```

---

## Chat & LLM

### POST /api/chat

Send message and get AI response.

**Query Parameters:**
- `session_id` (int, default: 1) - Chat session ID
- `character_id` (int, default: 1, v5.30+) - Character to use

**Request:**
```json
{
  "text": "Hello! How are you today?",
  "speak": false
}
```

**Response:**
```json
{
  "ok": true,
  "reply": "Hi! I'm doing great, thanks for asking! How can I help you today?",
  "audio": null,
  "session_id": 1
}
```

**With TTS (`speak: true`):**
```json
{
  "ok": true,
  "reply": "Hi! I'm doing great!",
  "audio": "/files/audio/response_1732425678.mp3",
  "session_id": 1
}
```

**Error:**
```json
{
  "ok": false,
  "error": "Adapter error: Connection refused"
}
```

**cURL Example:**
```bash
curl -X POST "http://localhost:8000/api/chat?session_id=1" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Tell me a joke",
    "speak": true
  }'
```

---

## Text-to-Speech

### POST /api/tts

Generate speech from text (standalone, not chat).

**Request:**
```json
{
  "text": "Hello world! This is a test.",
  "provider": "fish_audio",
  "voice_id": "custom-voice-id",
  "format": "mp3",
  "sample_rate": 24000
}
```

**Optional Fields:** All except `text` are optional (uses config defaults)

**Response:**
```json
{
  "ok": true,
  "url": "/files/audio/tts_1732425690.mp3",
  "meta": {
    "provider": "fish_audio",
    "duration": 2.3,
    "size": 54720
  }
}
```

**Error (400):**
```json
{
  "detail": "text required"
}
```

---

## Session Management (v5.30)

### GET /api/sessions

List all chat sessions with message counts.

**Response:**
```json
{
  "sessions": [
    {
      "id": 1,
      "title": "My First Chat",
      "created_ts": 1732425678.0,
      "message_count": 24
    },
    {
      "id": 2,
      "title": "Session 2",
      "created_ts": 1732425690.0,
      "message_count": 5
    }
  ]
}
```

---

### POST /api/sessions

Create new chat session.

**Request:**
```json
{
  "title": "Planning My Project"
}
```

**Optional:** `title` defaults to "New Session"

**Response:**
```json
{
  "id": 3,
  "title": "Planning My Project",
  "created_ts": 1732425700.0
}
```

---

### PUT /api/sessions/{session_id}

Update session title.

**Example:** `PUT /api/sessions/3`

**Request:**
```json
{
  "title": "My Renamed Session"
}
```

**Response:**
```json
{
  "ok": true
}
```

**Error (400):**
```json
{
  "detail": "Title required"
}
```

---

### DELETE /api/sessions/{session_id}

Delete session and all its messages.

**Example:** `DELETE /api/sessions/3`

**Response:**
```json
{
  "ok": true
}
```

**Note:** This is permanent and cannot be undone!

---

### GET /api/sessions/{session_id}/messages

Get full message history for a session.

**Example:** `GET /api/sessions/1/messages`

**Response:**
```json
{
  "messages": [
    {
      "id": 1,
      "role": "user",
      "text": "Hello!",
      "ts": 1732425678.0
    },
    {
      "id": 2,
      "role": "assistant",
      "text": "Hi! How can I help?",
      "ts": 1732425679.5
    },
    {
      "id": 3,
      "role": "user",
      "text": "Tell me about AI.",
      "ts": 1732425690.0
    }
  ]
}
```

---

## Character Management (v5.30)

### GET /api/characters

List all character profiles.

**Response:**
```json
{
  "characters": [
    {
      "id": 1,
      "name": "Friendly Assistant",
      "system_prompt": "You are a friendly and helpful AI assistant...",
      "avatar_url": "/files/avatars/default.vrm",
      "voice_id": null,
      "tts_provider": null,
      "personality_traits": ["friendly", "helpful", "enthusiastic"]
    },
    {
      "id": 2,
      "name": "Tsundere Girl",
      "system_prompt": "You are a tsundere anime girl. You act tough but care deeply...",
      "avatar_url": "/files/avatars/Panicandy.vrm",
      "voice_id": "8ef4a238714b45718ce04243307c57a7",
      "tts_provider": "fish_audio",
      "personality_traits": ["tsundere", "caring", "competitive"]
    }
  ]
}
```

---

### POST /api/characters

Create new character profile.

**Request:**
```json
{
  "name": "Shy Student",
  "system_prompt": "You are a shy but intelligent student who loves learning. You speak softly and get flustered easily.",
  "avatar_url": "/files/avatars/Tsuki.vrm",
  "voice_id": "soft-female-voice",
  "tts_provider": "fish_audio",
  "personality_traits": ["shy", "intelligent", "curious"]
}
```

**Required:** `name`, `system_prompt`
**Optional:** `avatar_url`, `voice_id`, `tts_provider`, `personality_traits`

**Response:**
```json
{
  "id": 3,
  "name": "Shy Student",
  "system_prompt": "You are a shy but intelligent student...",
  "avatar_url": "/files/avatars/Tsuki.vrm",
  "voice_id": "soft-female-voice",
  "tts_provider": "fish_audio",
  "personality_traits": ["shy", "intelligent", "curious"]
}
```

**Error (400):**
```json
{
  "detail": "name and system_prompt required"
}
```

---

### PUT /api/characters/{character_id}

Update character profile (partial updates supported).

**Example:** `PUT /api/characters/2`

**Request:**
```json
{
  "name": "Updated Name",
  "voice_id": "new-voice-id",
  "personality_traits": ["updated", "traits"]
}
```

**Response:**
```json
{
  "ok": true
}
```

**Error (400):**
```json
{
  "detail": "No fields to update"
}
```

---

### DELETE /api/characters/{character_id}

Delete character profile.

**Example:** `DELETE /api/characters/3`

**Response:**
```json
{
  "ok": true
}
```

**Error (400 - Protected):**
```json
{
  "detail": "Cannot delete default character"
}
```

**Note:** Character ID 1 (default) cannot be deleted.

---

## Speech Recognition (v5.30)

### POST /api/asr

Transcribe audio file to text.

**Request:** `multipart/form-data`
```
file: <audio binary data>
language: "en" (optional)
```

**Supported Formats:** mp3, wav, webm, m4a, ogg

**Response:**
```json
{
  "text": "Hello, this is a test of the speech recognition system.",
  "language": "en",
  "confidence": 0.95
}
```

**Error (400 - Not Enabled):**
```json
{
  "detail": "ASR not enabled in configuration"
}
```

**Error (500 - Failed):**
```json
{
  "detail": "Transcription failed: Connection refused"
}
```

**cURL Example:**
```bash
curl -X POST "http://localhost:8000/api/asr" \
  -F "file=@recording.webm"
```

**Configuration Required:**
```json
{
  "asr": {
    "enabled": true,
    "provider": "whisper_api",
    "endpoint": "https://api.openai.com/v1",
    "api_key": "sk-...",
    "model": "whisper-1",
    "language": "en"
  }
}
```

---

## Error Responses

### Common HTTP Status Codes

- `200 OK` - Success
- `400 Bad Request` - Invalid input
- `404 Not Found` - Resource not found
- `500 Internal Server Error` - Server error

### Error Format

```json
{
  "detail": "Error message here"
}
```

Or (for chat/TTS):
```json
{
  "ok": false,
  "error": "Error message here"
}
```

---

## Rate Limiting

**Current:** None (local development)

**Production Recommendation:**
- Implement rate limiting
- 10-60 requests/minute per IP
- Higher limits for authenticated users

---

## Authentication

**Current:** None (all endpoints public)

**Future Plans:**
- API key authentication
- User accounts
- Session tokens
- OAuth support

---

## Pagination

**Current:** Not implemented

**Endpoints That May Need It:**
- `GET /api/sessions` (if >100 sessions)
- `GET /api/sessions/{id}/messages` (if >1000 messages)
- `GET /api/avatars` (if >50 avatars)

**Planned Format:**
```
GET /api/sessions?page=1&limit=20
```

---

## WebSocket Support

**Current:** Not implemented

**Planned (v5.35+):**
- Real-time chat streaming
- Live TTS generation
- Voice activity detection
- Multi-user chat rooms

---

## Quick Reference Card

### GET Endpoints (Read)
```
GET  /api/config
GET  /api/healthcheck
GET  /api/avatars
GET  /api/sessions
GET  /api/sessions/{id}/messages
GET  /api/characters
```

### POST Endpoints (Create)
```
POST /api/chat
POST /api/tts
POST /api/asr
POST /api/sessions
POST /api/characters
POST /api/avatars/upload
```

### PUT Endpoints (Update)
```
PUT  /api/config
PUT  /api/sessions/{id}
PUT  /api/characters/{id}
```

### DELETE Endpoints (Remove)
```
DELETE /api/avatars/{name}
DELETE /api/sessions/{id}
DELETE /api/characters/{id}
```

---

## Testing Tips

### Using cURL

**Chat:**
```bash
curl -X POST http://localhost:8000/api/chat?session_id=1 \
  -H "Content-Type: application/json" \
  -d '{"text":"Hi","speak":false}'
```

**Create Session:**
```bash
curl -X POST http://localhost:8000/api/sessions \
  -H "Content-Type: application/json" \
  -d '{"title":"Test Session"}'
```

**Upload Avatar:**
```bash
curl -X POST http://localhost:8000/api/avatars/upload \
  -F "file=@MyAvatar.vrm"
```

### Using JavaScript

```javascript
// Chat
const response = await fetch('http://localhost:8000/api/chat?session_id=1', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({text: 'Hello!', speak: true})
});
const data = await response.json();
console.log(data.reply);

// Get sessions
const sessions = await fetch('http://localhost:8000/api/sessions');
const data = await sessions.json();
console.log(data.sessions);
```

---

## Version History

### v5.30 (2025-11-24)
**Added:**
- 10 new endpoints (sessions, characters, ASR)
- Session management (5 endpoints)
- Character profiles (4 endpoints)
- Speech recognition (1 endpoint)

### v5.29 (2025-11-20)
**Initial:**
- 9 endpoints (config, health, avatars, chat, TTS)
- Basic functionality

---

## Related Documentation

- **LLM Integration:** `docs/features/FEATURE_LLM.md`
- **TTS Integration:** `docs/features/FEATURE_TTS.md`
- **Character System:** `docs/features/FEATURE_CHARACTERS.md`
- **Session Management:** `docs/features/FEATURE_SESSIONS.md`
- **Troubleshooting:** `docs/guides/TROUBLESHOOTING.md`

---

**Last Updated:** 2025-11-24
**Version:** v5.30
**Total Endpoints:** 19
**Status:** Complete ✅
