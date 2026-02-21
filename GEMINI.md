# GEMINI.md — Context for AI Assistants

This file previously described a React 19 + TypeScript + React Three Fiber architecture
that was **evaluated and abandoned** in favour of the current Vanilla JS / FastAPI stack.

The archived pivot notes have been moved to:
→ `docs/archive/GEMINI_REACT_PIVOT_NOTES.md`

**For the current technical architecture, see: `ARCHITECTURE.md`**

Key facts for AI assistants working in this repo:

- Frontend: **Vanilla JavaScript** (ES modules, no framework, no TypeScript)
- Backend: **FastAPI** (Python 3.11+, SQLite, ChromaDB)
- 3D rendering: **Three.js r160+ + @pixiv/three-vrm** (VRM 1.0)
- 2D rendering: **PIXI.js + Cubism 2 Live2D** (legacy `live2d.min.js`)
- State management: custom `StateManager.js` singleton + `EventBus.js` pub/sub
- UI framework: custom CSS with `--neon-*` CSS custom properties (cyberpunk theme)
- Entry point: `python backend/server.py` → serves `frontends/neon/` at `localhost:8080`
