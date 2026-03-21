# Waifu-RT3D — Project Rules

## Critical Workflow Rules

- **Resume = Implement immediately.** When the user says "continue" or asks to resume work, immediately start implementing code. Do NOT enter plan mode, create new plan files, or re-read the entire codebase. Check the most recent plan file and memory files, then begin coding within the first 2-3 tool calls.

- **Bias heavily toward ACTION over PLANNING.** If a plan file already exists, do not rewrite it — execute it. Only create a new plan if explicitly asked. When in doubt, write code.

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

This project uses Python (FastAPI backend) + React/TypeScript frontends + a shared Three.js 3D viewer. Main server: `backend/server.py` (~13K lines). Primary frontend: `frontends/sakura/` (React 19 + Zustand + Framer Motion). 9 frontend directories exist but Sakura is the active one. The 3D viewer runs in an iframe (`frontends/shared/viewer/viewer.html`) controlled via postMessage from `viewerStore.ts`. Schema: v51 (`backend/preflight.py`). Always check for Python f-string backslash issues before committing.

## Key Directories

| Path | Purpose |
|------|---------|
| `backend/server.py` | FastAPI server (all API endpoints) |
| `backend/preflight.py` | DB migrations (v3 → v51) |
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

## Smoke Test Before Completion

Before presenting work as done, run both checks:
1. `.venv/bin/python -m pytest backend/tests/ -q --tb=line`
2. `cd frontends/sakura && npx tsc --project tsconfig.app.json --noEmit`

Fix any failures before reporting completion. Do NOT claim "all tests pass" without actually running them.

## Commit Checkpoints

Commit after each completed feature or sub-task. Do NOT batch multiple features into one commit. Small, atomic commits prevent work loss on interruption and make rollback easier.

## Plan File Safety

NEVER overwrite or replace plan files. Always READ the existing plan first, then APPEND new sections at the bottom. Completed phases should be marked done but never deleted — they serve as historical records.

## Plan Hygiene

- **Naming:** Plan files MUST be named `YYYY-MM-DD-<description>.md` (e.g. `2026-03-20-phase-12-p4-anime-shaders.md`). Never use auto-generated random names.
- **Status tracking:** After completing a plan phase, proactively run `/checkpoint` to update `CURRENT_STATUS.md` and mark the phase `✅ DONE` in the master plan. Do NOT wait for the user to ask.
- **Commit messages:** Include the plan phase reference: `feat(12-P4): emotion gradient backgrounds`. Use conventional commit prefixes (`feat`, `fix`, `refactor`, `docs`, `chore`).
- **Verification:** Before claiming work is done, verify that status files (`CURRENT_STATUS.md`, master plan) reflect the current state. Stale status files cause context amnesia in future sessions.
- **Insights:** When completing a feature, include key architectural decisions and non-obvious implementation details in the commit message body — not just "what" but "why".

## Hypothesis Limit

When debugging, commit to ONE hypothesis and test it before trying another. Do NOT cycle through multiple theories without running code. If 3 hypotheses fail, STOP and present findings to the user as a table. Never explore a 4th hypothesis without user approval.

## Research → Action Rule

After completing ANY research task (competitor analysis, HuggingFace exploration, similar project analysis, library evaluation, web research), ALWAYS evaluate whether the findings are relevant to this project. If relevant, ask the user: "Should I create implementation specs from this research?" Then produce actionable plans with specific files, schema changes, API endpoints, and effort estimates — not just summaries. Use the `/research-to-action` skill. Research without actionable output is wasted effort.
