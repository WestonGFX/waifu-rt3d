# 🎭 waifu-rt3d v5.29

> Voice-First AI Companion with 3D Avatar Visualization

A full-stack web application that brings AI companions to life with voice synthesis and 3D avatar visualization. Chat with your AI companion using local LLMs, hear them speak with multiple TTS providers, and see them in beautiful 3D.

![Version](https://img.shields.io/badge/version-5.29-blue)
![Python](https://img.shields.io/badge/python-3.8%2B-blue)
![License](https://img.shields.io/badge/license-MIT-green)

## ✨ Features

### 🤖 AI Integration
- **Local LLM Support** via LM Studio (privacy-first, no API costs)
- **Conversation Memory** with configurable history length
- **Persistent Chat History** stored in SQLite with full-text search

### 🎤 Multi-Provider TTS
- **Fish Audio** (cloud/self-host) - Default provider with E-girl voice
- **Piper** (local CLI) - Fully offline, ONNX models
- **XTTS Server** (local) - Community server support
- **ElevenLabs** (API) - Premium quality with paid keys

### 🎨 3D Avatar Viewer
- Support for **VRM**, **GLB**, and **GLTF** models
- Upload and manage multiple avatars
- Real-time 3D rendering with Three.js
- Automatic CDN fallback for offline libraries

### 💾 Storage & Caching
- Audio files cached in `backend/storage/audio/`
- SQLite database with WAL mode for performance
- FTS5 full-text search on conversations

## 🚀 Quick Start

### Prerequisites
- **Python 3.8+**
- **LM Studio** running locally (or compatible OpenAI API endpoint)
- Optional: Piper TTS for offline voices

### Installation

#### Windows
```cmd
install.bat
run.bat
```

#### macOS/Linux
```bash
chmod +x install.sh run.sh
./install.sh
./run.sh
```

Then open: **http://127.0.0.1:8000**

### Configuration

1. Go to the **Setup** tab
2. Configure your LLM:
   - Provider: `lmstudio`
   - Endpoint: `http://127.0.0.1:1234/v1`
   - Model: Paste exact model name from LM Studio
3. Configure TTS:
   - Choose your provider (Fish Audio recommended)
   - Add API key if using cloud providers
   - Set voice ID or model path
4. Click **Save**

## 📁 Project Structure

```
waifu-rt3d_v5.29_full/
├── backend/
│   ├── server.py              # FastAPI application
│   ├── preflight.py           # Initialization & setup
│   ├── config/                # App configuration
│   ├── db/                    # SQLite schema
│   ├── llm/                   # LLM adapters
│   │   ├── registry.py
│   │   └── adapters/
│   │       ├── base.py
│   │       └── lmstudio.py
│   ├── tts/                   # TTS adapters
│   │   ├── registry.py
│   │   └── adapters/
│   │       ├── base.py
│   │       ├── fish_audio.py
│   │       ├── elevenlabs.py
│   │       ├── piper_local.py
│   │       └── xtts_server.py
│   └── storage/               # Runtime data
│       ├── avatars/           # Uploaded 3D models
│       ├── audio/             # TTS cache
│       └── app.db             # SQLite database
├── frontend/
│   ├── index.html             # Main UI
│   ├── assets/css/theme.css   # Styling
│   ├── lib/                   # Three.js libraries
│   └── viewer/
│       ├── viewer.html        # 3D viewer
│       └── loader.js          # Library loader
├── docs/                      # Documentation
├── tests/                     # Tests (to be added)
├── tools/                     # Utility scripts
├── requirements.txt           # Python dependencies
└── install.sh / run.sh        # Setup scripts
```

## 🔧 API Endpoints

### Configuration
- `GET /api/config` - Get current configuration
- `PUT /api/config` - Update configuration

### Avatar Management
- `GET /api/avatars` - List uploaded avatars
- `POST /api/avatars/upload` - Upload new avatar (.vrm/.glb/.gltf)
- `DELETE /api/avatars/{name}` - Delete avatar

### Chat
- `POST /api/chat` - Send message and get AI response
  - Query param: `session_id` (default: 1)
  - Body: `{"text": "message", "speak": true/false}`
  - Returns: `{"ok": true, "reply": "...", "audio": "/files/audio/..."}`

### TTS
- `POST /api/tts` - Generate TTS audio
  - Body: `{"text": "...", "provider": "...", "voice_id": "..."}`

### System
- `GET /api/healthcheck` - Check system status (LLM, libraries, etc.)

## 🎯 Architecture

### Adapter Pattern
The project uses a flexible adapter pattern for extensibility:

- **LLM Adapters** (`backend/llm/adapters/`)
  - `LLMAdapter` base class
  - Easy to add OpenAI, Anthropic, etc.

- **TTS Adapters** (`backend/tts/adapters/`)
  - `TTSAdapter` base class
  - Automatic audio file caching with hashed filenames
  - Error handling and fallback support

### Frontend Architecture
- **Vanilla JavaScript** - No build step required
- **Single-page tabs** - Setup, Viewer, Chat, System
- **Dynamic module imports** - Three.js loaded on-demand
- **CDN fallback** - Local files preferred, CDN as backup

## 🛠️ Development

### Adding a New TTS Provider

1. Create `backend/tts/adapters/myprovider.py`:
```python
from .base import TTSAdapter

class MyProviderAdapter(TTSAdapter):
    def speak(self, text: str, tts_cfg: dict) -> dict:
        # Your implementation
        # Generate audio, save with self._mk_name()
        return {'ok': True, 'filename': name, 'meta': {...}}
```

2. Register in `backend/tts/registry.py`:
```python
from .adapters.myprovider import MyProviderAdapter

def get_tts(cfg):
    prov = cfg.get('tts', {}).get('provider', 'fish_audio')
    if prov == 'myprovider':
        return MyProviderAdapter(audio_dir)
    # ... existing providers
```

3. Add to frontend dropdown in `frontend/index.html`

### Adding a New LLM Provider

Similar process - create adapter in `backend/llm/adapters/` and register in `registry.py`.

## 🐛 Known Issues

- Session management is hardcoded to session_id=1
- No authentication/authorization
- No rate limiting on API endpoints
- Tests directory is empty
- ASR (speech recognition) mentioned in config but not implemented

## 📝 TODO / Roadmap

See [ROADMAP.md](ROADMAP.md) for detailed development plans.

### High Priority
- [ ] Add session management UI
- [ ] Implement error handling in UI
- [ ] Add unit tests
- [ ] Add API documentation (OpenAPI/Swagger)
- [ ] Implement ASR (speech-to-text input)

### Medium Priority
- [ ] Avatar animation sync with TTS
- [ ] Character profiles/personalities
- [ ] Export/import conversations
- [ ] Streaming LLM responses
- [ ] Voice activity detection

### Low Priority
- [ ] Multi-user support
- [ ] Cloud deployment guide
- [ ] Docker containerization
- [ ] Plugin system

## 🤝 Contributing

Contributions welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Add tests for new features
4. Submit a pull request

## 📄 License

MIT License - See LICENSE file for details

## 🙏 Credits

Built with:
- [FastAPI](https://fastapi.tiangolo.com/) - Web framework
- [Three.js](https://threejs.org/) - 3D rendering
- [SQLite](https://www.sqlite.org/) - Database
- [Uvicorn](https://www.uvicorn.org/) - ASGI server

TTS Providers:
- [Fish Audio](https://fish.audio/)
- [Piper TTS](https://github.com/rhasspy/piper)
- [Coqui XTTS](https://github.com/coqui-ai/TTS)
- [ElevenLabs](https://elevenlabs.io/)

## 📧 Support

For issues and questions:
- Open an issue on GitHub
- Check existing documentation in `/docs`

---

Made with ❤️ for the AI companion community
