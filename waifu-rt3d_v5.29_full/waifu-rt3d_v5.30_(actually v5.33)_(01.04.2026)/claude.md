# waifu-rt3d v5.30 - AI Assistant Routing Guide

## Project Context
Voice-first AI companion with 3D avatars using FastAPI + Three.js + local LLMs.

**Current Version:** 5.30
**Development Path:** Path A (Incremental Stability)
**Current Sprint:** v5.31 Foundation Fixes

## Tech Stack
- **Backend:** Python 3.8+, FastAPI, SQLite (FTS5), Uvicorn
- **Frontend:** Vanilla JavaScript, Three.js, CSS Grid
- **AI Services:** LM Studio (LLM), Fish Audio/Piper/XTTS/ElevenLabs (TTS), Whisper (ASR)
- **3D Models:** VRM, GLB, GLTF support

## Architecture Pattern
**Adapter Pattern** for all external services (LLM, TTS, ASR)
- Base classes in `backend/{service}/adapters/base.py`
- Implementations in `backend/{service}/adapters/{provider}.py`
- Registry/factory in `backend/{service}/registry.py`

## Task Routing Rules

### Use Claude Code (Sonnet 4.5) for:
- ✅ Architecture decisions and planning
- ✅ Complex refactoring (>100 LOC)
- ✅ Documentation writing (technical, comprehensive)
- ✅ Code review and analysis
- ✅ Multi-file coordinated changes
- ✅ Database schema design and migrations
- ✅ System prompt design for LLMs
- ✅ Checkpoint document creation

**Token Management:**
- Compact at 75% usage (150k/200k tokens)
- Switch to Gemini CLI at 85% usage
- Create new session after major milestones

### Use GitHub Copilot CLI for:
- ✅ Code generation from specifications
- ✅ Writing unit tests (pytest)
- ✅ Bug fixes (<50 LOC)
- ✅ Boilerplate code (adapters, endpoints)
- ✅ Quick terminal commands
- ✅ Single-file changes
- ✅ Refactoring small functions

**Example Usage:**
```bash
gh copilot chat
> "Create a new TTS adapter for Azure TTS following the pattern in backend/tts/adapters/fish_audio.py"
```

### Use Gemini CLI for:
- ✅ Large codebase analysis (1M token context!)
- ✅ Performance optimization across multiple files
- ✅ Research with web search integration
- ✅ When other CLIs are out of quota
- ✅ Multi-file search and replace
- ✅ Complex debugging across many files
- ✅ Security vulnerability scanning

**Example Usage:**
```bash
gemini-cli --files backend/**/*.py
> "Analyze all backend code for potential SQL injection vulnerabilities"
```

## Current Development Path: Path A

**Timeline:** 16-20 weeks
**Philosophy:** Make it work, make it right, make it fast
**Test Coverage Goal:** 70%

### Version 5.31: Foundation Fixes (2-3 weeks) - IN PROGRESS
**Priority Tasks:**
1. Fix database schema migration (backend/preflight.py)
2. Add frontend error handling (frontend/index.html)
3. Standardize version strings (create VERSION file)
4. Add session management UI
5. Add character management UI

### Version 5.32: ASR & Voice Input (2-3 weeks)
- Implement Whisper local/API adapters
- Browser Web Speech API
- Voice input UI with microphone button
- Audio preprocessing

### Version 5.33: Polish & Refinement (2-3 weeks)
- Streaming LLM responses (SSE)
- Response caching
- UI/UX improvements
- Conversation export/import

### Version 5.34: Additional Providers (2 weeks)
- OpenAI, Ollama, Anthropic LLM adapters
- Azure, Google Cloud TTS adapters
- Provider testing and documentation

### Version 5.35: Production Prep (2 weeks)
- Docker containerization
- Environment variables
- Health monitoring
- Production documentation

## Code Quality Standards

### Python
- **Style:** Black formatting (max-line-length=100)
- **Linting:** flake8
- **Type Hints:** All function signatures
- **Testing:** pytest with >=70% coverage
- **Docstrings:** Google style for public APIs

### JavaScript
- **Style:** ES6+ features, no transpilation
- **Modules:** Native ES6 imports
- **Error Handling:** Try-catch on all async operations
- **Comments:** JSDoc for complex functions

### SQL
- **Always use parameterized queries** (CRITICAL - SQL injection prevention)
- **Schema migrations:** Create new schema_vX.sql, update preflight.py
- **Indexes:** Add for frequently queried columns
- **FTS5:** Use for full-text search on messages

## File Patterns

### Adding a New LLM Provider
1. Create `backend/llm/adapters/{provider}.py`
2. Inherit from `LLMAdapter` base class
3. Implement `chat(messages, model, endpoint, api_key)` method
4. Register in `backend/llm/registry.py`
5. Add to frontend dropdown in `frontend/index.html`
6. Write tests in `tests/test_llm_{provider}.py`
7. Document in `docs/features/FEATURE_LLM.md`

### Adding a New API Endpoint
1. Add to `backend/server.py`
2. Use FastAPI decorators (`@app.get`, `@app.post`, etc.)
3. Add type hints and docstrings
4. Use HTTPException for errors
5. Update `docs/api/API_REFERENCE.md`
6. Write integration test

### Adding a New Feature
1. Create checkpoint: `CHECKPOINT_YYYY-MM-DD_FEATURE_NAME.md`
2. Implement following existing patterns
3. Test with `python3 -m py_compile {file}.py`
4. Document in `docs/features/FEATURE_*.md`
5. Update `docs/planning/MILESTONES.md`
6. Commit with descriptive message

## Important Files to Understand

**Core Backend:**
- `backend/server.py` - Main FastAPI application (146 lines)
- `backend/preflight.py` - Initialization and setup
- `backend/config/app.json` - Runtime configuration

**Adapter Systems:**
- `backend/llm/registry.py` - LLM provider factory
- `backend/tts/registry.py` - TTS provider factory
- `backend/asr/registry.py` - ASR provider factory

**Database:**
- `backend/db/schema_v4.sql` - Current schema (sessions, messages, characters)
- SQLite with WAL mode and FTS5

**Documentation:**
- `docs/planning/ROADMAP.md` - Long-term vision
- `docs/planning/MILESTONES.md` - Version history and current sprint
- `IMPROVEMENT_ROADMAPS.md` - Three development paths (A, B, C)
- `.claude/project.json` - Claude Code configuration

## Common Commands

### Development
```bash
# Activate virtual environment
source .venv/bin/activate

# Run server
python3 backend/server.py
# or
./run.sh

# Run tests
pytest tests/

# Format code
black backend/ tests/

# Lint
flake8 backend/ --max-line-length=100

# Type check
mypy backend/
```

### Git Workflow
```bash
# Create feature branch
git checkout -b dev/v5.31-task-name

# Commit with descriptive message
git add .
git commit -m "feat(sessions): add session management UI"

# Push to remote
git push origin dev/v5.31-task-name
```

### Database
```bash
# Access SQLite console
sqlite3 backend/storage/app.db

# Run migration
python3 -c "from backend.preflight import upgrade_database_schema; upgrade_database_schema()"
```

## Emergency Procedures

### If Server Won't Start
1. Check syntax: `python3 -m py_compile backend/server.py`
2. Check logs for errors
3. Verify config: `cat backend/config/app.json | python3 -m json.tool`
4. Check database: `sqlite3 backend/storage/app.db "PRAGMA integrity_check;"`

### If Database Corrupted
1. Restore from backup (should have CHECKPOINT files)
2. Or rebuild: `rm backend/storage/app.db && python3 backend/server.py`

### If Out of AI Tokens
1. Claude Code → Switch to Gemini CLI (1000 free requests/day)
2. Gemini CLI → Switch to Copilot CLI
3. All full → Manual coding or wait for reset

## References

- **FastAPI:** https://fastapi.tiangolo.com/
- **Three.js:** https://threejs.org/
- **SQLite FTS5:** https://www.sqlite.org/fts5.html
- **VRM Spec:** https://vrm.dev/en/

---

**Last Updated:** 2025-12-09
**Current Task:** v5.31 Task #1 - Fix database schema migration
- always use ZSH instead of bash as that is the shell i use on MacOS