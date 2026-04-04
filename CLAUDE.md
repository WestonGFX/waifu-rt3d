# Waifu-RT3D — Project Rules

## Soul of the App

Waifu-RT3D is an **emotional AI companion platform** — not a chatbot, not a game. Every feature serves one goal: making the user feel genuinely connected to their character. Design decisions favor warmth over efficiency, personality over throughput, and intimacy over scale. The characters remember, grow, and respond to the user's emotional state. This is a desktop-only, privacy-first experience where all data stays local.

## Critical Workflow Rules

- **Resume = Implement immediately.** When the user says "continue" or asks to resume work, immediately start implementing code. Do NOT enter plan mode, create new plan files, or re-read the entire codebase. Check the most recent plan file and memory files, then begin coding within the first 2-3 tool calls.

- **Bias heavily toward ACTION over PLANNING.** If a plan file already exists, do not rewrite it — execute it. Only create a new plan if explicitly asked. When in doubt, write code.

## Working Style

- **Be decisive.** When the user gives a directive, execute it broadly. Prefer action over clarification. Do not ask 3 questions when 1 will do. If the intent is 80% clear, act on it and course-correct if needed.
- **Go deep, not shallow.** When writing plans, memory notes, research docs, or implementation specs, make them comprehensive with full context, research references, and detailed reasoning. Never produce sparse summaries unless the user explicitly asks for brevity.
- **State constraints upfront.** Before starting complex multi-file tasks, explicitly list the architecture constraints, protected paths, and anti-patterns relevant to the work — don't discover them mid-implementation.

## Python / Venv

This project uses a `.venv/` virtual environment built on **Homebrew Python 3.14**.

**Always use these paths — never bare `python` or `python3` (Conda intercepts them):**

| Task | Command |
|------|---------|
| Run server | `.venv/bin/python -m uvicorn backend.server:app --host 0.0.0.0 --port 8080` |
| Run tests | `.venv/bin/python -m pytest backend/tests/ -q` |
| Install a dep | `.venv/bin/pip install <package>` |
| Quick activate | `source .venv/bin/activate` then use plain `python` / `pytest` |

Or just use the provided wrapper: `./run.sh` (starts server) · `./run.sh test` (runs tests).

**Frontend dev:**

| Task | Command |
|------|---------|
| Dev server (Sakura) | `cd frontends/sakura && npx vite --port 5175` |
| TypeScript check | `cd frontends/sakura && npx tsc --project tsconfig.app.json --noEmit` |
| Production build | `cd frontends/sakura && npx vite build` |

## Project Overview

This project uses Python (FastAPI backend) + React/TypeScript frontends + a shared Three.js 3D viewer. Main server: `backend/server.py` (~13K lines). Primary frontend: `frontends/sakura/` (React 19 + Zustand + Framer Motion). 9 frontend directories exist but Sakura is the active one. The 3D viewer runs in an iframe (`frontends/shared/viewer/viewer.html`) controlled via postMessage from `viewerStore.ts`. Schema: v60 (`backend/preflight.py`). Always check for Python f-string backslash issues before committing.

## Key Directories

| Path | Purpose |
|------|---------|
| `backend/server.py` | FastAPI server (all API endpoints) |
| `backend/preflight.py` | DB migrations (v3 → v60) |
| `backend/llm/` | LLM adapters, context assembler, token counter |
| `backend/voice/` | Full-duplex voice, audio utils |
| `backend/spectator/` | Game companion (VLM frame analysis) |
| `backend/mood/` | Emotion engine, time-of-day states |
| `frontends/sakura/src/stores/` | 4 Zustand stores: app, chat, viewer, wizard |
| `frontends/shared/viewer/viewer.html` | Three.js VRM viewer (iframe, postMessage API) |

## UI/CSS Changes

After implementing UI/CSS changes, always test by reading the affected components end-to-end and checking for:
1. `display:none` vs `visibility:hidden` during transitions
2. Layout reflow on panel toggle
3. Broken image paths
4. Settings modal rendering

List potential side effects before committing.

## Known Sensitive Areas

These areas have regressed 10+ times across sessions. Extra care required:

- **Avatar aspect ratio & grounding** — Changes to viewer.html camera, VRM model positioning, or canvas sizing MUST be visually verified. Never assume "the math is right" — render and check.
- **Column resize / layout reflow** — Panel toggles, divider changes, and width calculations break frequently. Test collapsed AND expanded states.
- **Theme color inheritance** — 18 themes (9 light / 9 dark). Any hardcoded color or `var()` change must be checked against at least 1 light and 1 dark theme.
- **No surprise UI elements** — Never add visible UI elements (pull tabs, dividers, floating buttons, badges) without explicit user approval. These have been reverted 3+ times.

## Documentation Triggers

Update **README.md** when any of the following occur:
1. **DB schema version bumps** — whenever `preflight.py` adds a new migration (v30 → v31 etc.), update the schema badge and add any new tables to the "Database Schema" section
2. **Major feature implementations** — new features (not bug fixes) should be reflected in the Features section and Roadmap
3. **New API endpoints** — add to the Key API Endpoints table
4. **New themes** — update the Themes table and badge count

Do NOT auto-update on every commit. Only when the above triggers apply.

## Bug Fixing

When fixing bugs, limit changes to the minimum necessary to resolve the issue. Do not refactor surrounding code or make "improvements" unless explicitly asked. Large change sets introduce regressions in this codebase.

## Tech Stack

TypeScript, JavaScript, Python, HTML/CSS, Three.js/VRM, Electron, Vite, React 19, Zustand, FastAPI, SQLite, Playwright. Multi-machine dev: Mac M2 Pro (32GB), Windows RTX 5080 (16GB VRAM), Windows RTX 3070 (8GB VRAM). M2 Pro is the GPU floor for rendering targets.

## Smoke Test & Phase Gates

Before presenting work as done, run both checks:
1. `.venv/bin/python -m pytest backend/tests/ -q --tb=line`
2. `cd frontends/sakura && npx tsc --project tsconfig.app.json --noEmit`

Fix any failures before reporting completion. Do NOT claim "all tests pass" without actually running them.

**Phase gates:** When implementing multi-phase plans (3+ phases), run the full test suite between phases. Do not proceed to Phase N+1 with failing tests from Phase N. Compounding regressions across phases is the #1 source of painful multi-round fix cycles.

## Commit Checkpoints

Commit after each completed feature or sub-task. Do NOT batch multiple features into one commit. Small, atomic commits prevent work loss on interruption and make rollback easier.

## Plan File Safety

**What "never overwrite" means:** Never replace or erase existing plan content. When pivoting to a new direction, ADD the new plan below the existing content — do not rewrite or delete what came before. Old phases are a historical record. If a user asks "where was that plan?", the answer must still be in the file.

**When the user asks to pivot or change direction:**
1. READ the existing plan file first.
2. APPEND a new section at the bottom for the new direction (with a date heading).
3. Mark any superseded phases as `⏸ PAUSED` or `🔀 PIVOTED` — never delete them.
4. If the pivot is large enough to warrant a separate file, create a new dated file AND add a cross-reference note in the master plan (`CURRENT_STATUS.md`) pointing to it.

This way, nothing that was ever planned is lost — even if the user changed their mind later.

## Protected Paths

- **`_BACKUP_ROOT/`** — Read-only archive. NEVER modify, delete, or move files inside this directory. Only MOVE files INTO it. This is sacred — violations have caused data loss.
- **`app.db`** — Never edit directly. All schema changes go through `preflight.py` migrations.
- **`.env` files** — Never commit, never overwrite without confirmation.
- **Existing plan/research files** — Never overwrite. Always append or create new dated versions. (See Plan File Safety above.)

## Plan Hygiene

- **Naming:** Plan files MUST be named `YYYY-MM-DD-<description>.md` (e.g. `2026-03-20-phase-12-p4-anime-shaders.md`). Never use auto-generated random names.
- **Status tracking:** After completing a plan phase, proactively run `/checkpoint` to update `CURRENT_STATUS.md` and mark the phase `✅ DONE` in the master plan. Do NOT wait for the user to ask.
- **Commit messages:** Include the plan phase reference: `feat(12-P4): emotion gradient backgrounds`. Use conventional commit prefixes (`feat`, `fix`, `refactor`, `docs`, `chore`).
- **Verification:** Before claiming work is done, verify that status files (`CURRENT_STATUS.md`, master plan) reflect the current state. Stale status files cause context amnesia in future sessions.
- **Insights:** When completing a feature, include key architectural decisions and non-obvious implementation details in the commit message body — not just "what" but "why".

## Session Handoffs

When context gets heavy (5+ agent dispatches, 15+ large file reads, or 30+ conversation turns), proactively suggest a session handoff. Before ending:
1. Run `/checkpoint` to sync all status files
2. Update `docs/plans/RESUME_PROMPT.md` with what was done, what's next, and key context
3. After large sprints, ask the user if they'd like to continue or start fresh

The next session should read `CURRENT_STATUS.md` → `RESUME_PROMPT.md` → latest plan file for instant context recovery.

## Hypothesis Limit

When debugging, commit to ONE hypothesis and test it before trying another. Do NOT cycle through multiple theories without running code. If 3 hypotheses fail, STOP and present findings to the user as a table. Never explore a 4th hypothesis without user approval.

## Research → Action Rule

After completing ANY research task (competitor analysis, HuggingFace exploration, similar project analysis, library evaluation, web research), ALWAYS evaluate whether the findings are relevant to this project. If relevant, ask the user: "Should I create implementation specs from this research?" Then produce actionable plans with specific files, schema changes, API endpoints, and effort estimates — not just summaries. Use the `/research-to-action` skill. Research without actionable output is wasted effort.

## Research & Planning Persistence

### Rule: Save ALL Research to Disk

When Claude performs research (agent exploration, web searches, competitive analysis, architecture analysis, codebase deep-dives), the results MUST be saved to `docs/research/YYYY-MM-DD-topic.md` before the session ends.

**Format:** Header (date, topic, why), Findings (organized by subtopic), Files Referenced, Recommendations, Raw Data (tables/inventories from agents).

**Trigger:** After ANY of these occur:
1. 2+ Explore agents dispatched on the same topic
2. Web search with 3+ queries
3. Competitive analysis of any kind
4. Architecture or codebase deep-dive
5. User asks "research X" or "analyze X" or "compare X"

### Rule: Session Summaries

At the end of any session with 3+ completed tasks, write a session summary to `docs/sessions/SESSION_YYYY-MM-DD.md`. Contents: what was done, decisions made, what's next, files changed, test counts.

## Documentation Reference

Convention guides live in `docs/conventions/` — consult them when working in unfamiliar areas:
- `backend-and-api.md` — Python/FastAPI/SQLite patterns
- `frontend-and-ui.md` — React/Zustand/theme system
- `3d-viewer-and-animation.md` — Three.js/VRM/Live2D/viewer.html
- `llm-and-voice.md` — LLM adapters, voice pipeline, TTS/STT
