# Quickstart Cheatsheet

> One-page reference for launching, testing, and working with Waifu-RT3D.
> **Last updated:** 2026-03-28 · **Schema:** v61 · **Tests:** 1532

---

## TL;DR — Just Run This

```bash
# Start the whole app (backend + frontend, one terminal):
./run.sh both

# Then open: http://localhost:8080
```

That's it. Backend starts on port 8080, Sakura frontend dev server on 5173. The browser hits 8080 which serves the built frontend. If you're actively developing the frontend, visit http://localhost:5173 for hot-reload.

---

## All Launch Commands

| What | Command | Notes |
|------|---------|-------|
| **Start everything** | `./run.sh both` | Backend + Sakura frontend, one terminal |
| **Start server only** | `./run.sh` | Backend on http://localhost:8080 |
| **Start with hot-reload** | `./run.sh dev` | Auto-restarts on Python changes |
| **Start frontend only** | `./run.sh frontend` | Sakura on http://localhost:5173 |
| **Run all checks** | `./run.sh check` | pytest + tsc, opens HTML dashboard |
| **Run backend tests only** | `./run.sh test` | Verbose pytest output |

### Quick Test (copy-paste)

```bash
./run.sh check
```

One command. Runs backend pytest (1532 tests) + frontend TypeScript check. Auto-opens a color-coded results dashboard in your browser when done.

---

## Keyboard Shortcuts (Sakura Frontend)

| Shortcut | Action |
|----------|--------|
| `Ctrl+,` | Settings |
| `Ctrl+M` | Memory Browser |
| `Alt+C` | Context Viewer (debug) |
| `Alt+Shift+B` | Boundaries Panel |
| `Alt+Shift+V` | Private Vocabulary |
| `Alt+V` | Vocabulary Manager |
| `Alt+A` | Analytics |
| `Alt+S` | Session Summary |
| `Alt+G` | Games |
| `Alt+L` | Lorebook |
| `Alt+K` | User Knowledge |
| `Alt+D` | Diary |
| `Ctrl+I` | Cinematic Mode |
| `Escape` | Close any overlay |
| `?` | Show all shortcuts |

---

## URLs (when running)

| What | URL |
|------|-----|
| **Sakura UI** | http://localhost:8080/sakura |
| **Neon UI** | http://localhost:8080/neon |
| **Nova UI** | http://localhost:8080/nova |
| **Health check** | http://localhost:8080/api/health |
| **OBS overlay** | http://localhost:8080/viewer/overlay.html |
| **3D viewer** | http://localhost:8080/viewer/viewer.html |
| **Sakura dev** | http://localhost:5173 (when using `./run.sh frontend`) |

---

## Project Layout (the files you touch most)

```
backend/server.py          ← API endpoints (~15K lines, the monolith)
backend/preflight.py       ← DB migrations (v3 → v61)
backend/config/app.json    ← Runtime config (LLM, TTS, etc.)
backend/storage/app.db     ← SQLite database
backend/tests/             ← 1532 pytest tests

frontends/sakura/src/
  App.tsx                  ← Main app shell, overlay wiring
  stores/appStore.ts       ← Zustand state (overlays, sidebar, etc.)
  stores/chatStore.ts      ← Chat messages, sessions, characters
  components/              ← 35+ panels and components
  lib/api.ts               ← Typed API client
  lib/types.ts             ← Shared TypeScript types

CURRENT_STATUS.md          ← What's done, what's next (read this first)
docs/plans/RESUME_PROMPT.md ← Session handoff context
```

---

## Common Tasks

### Add a new API endpoint
1. Add route in `backend/server.py` (before the exception handlers section)
2. Run `./run.sh check` to verify

### Add a new overlay panel
1. Create component in `frontends/sakura/src/components/`
2. Add overlay type to `type Overlay` in `stores/appStore.ts`
3. Wire in `App.tsx` (import + render + keyboard shortcut)
4. Run `./run.sh check`

### Add a DB migration
1. Add `migrate_to_vXX()` function in `backend/preflight.py`
2. Update the version check chain in `ensure_db()`
3. Update version assertions (final check + log message)
4. Run `./run.sh check`

---

## Current Sprint Status

### NSFW Phase 1: Foundation ✅ COMPLETE
- F40 Boundaries — backend + API + frontend
- F13 Writing Styles — backend + API + picker
- F15 Sensory Profiles — backend + API (invisible)
- F30 Pet Names — backend + API + frontend

### Up Next: NSFW Phase 2: State Machines
- F17 Arousal State Machine — hidden 0-10 internal state
- F16 Intimacy Phases — scene progression (flirting → foreplay → climax → aftercare)
- F6 Scene Pacing — intelligent pacing engine
- F10 Consent System — in-character check-in system

Plan file: `docs/plans/2026-03-27-nsfw-mega-sprint-enhanced.md` (line ~2292)

---

## Git Workflow

```bash
# Check status
git status

# Push to remote
git push origin master

# View recent commits
git log --oneline -10
```

We work directly on `master`. No feature branches (solo dev project).
