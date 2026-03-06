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

## Project Overview

This project uses Python (FastAPI backend), JavaScript (frontend), CSS, and HTML. The main server file is `backend/server.py`. The frontend includes a 3D VRM viewer using Three.js (`frontends/neon/`). Always check for Python f-string backslash issues before committing.

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

TypeScript, JavaScript, Python, HTML/CSS, Three.js/VRM, Electron, Vite, React 19, Zustand, FastAPI, SQLite, Playwright. GPU: RTX 5080 16GB.

## No-Plan-Mode Rule

NEVER enter plan mode unless the user explicitly says "plan" or "design". If a plan file already exists, execute it — do not rewrite it. If no plan exists, implement directly from the request. Writing code is always the correct first action.

## Smoke Test Before Completion

Before presenting work as done, run both checks:
1. `.venv/bin/python -m pytest backend/tests/ -q --tb=line`
2. `cd frontends/sakura && npx tsc --project tsconfig.app.json --noEmit`

Fix any failures before reporting completion. Do NOT claim "all tests pass" without actually running them.

## Commit Checkpoints

Commit after each completed feature or sub-task. Do NOT batch multiple features into one commit. Small, atomic commits prevent work loss on interruption and make rollback easier.

## Plan File Safety

NEVER overwrite or replace plan files. Always READ the existing plan first, then APPEND new sections at the bottom. Completed phases should be marked done but never deleted — they serve as historical records.

## Hypothesis Limit

When debugging, commit to ONE hypothesis and test it before trying another. Do NOT cycle through multiple theories without running code. If 3 hypotheses fail, STOP and present findings to the user as a table. Never explore a 4th hypothesis without user approval.
