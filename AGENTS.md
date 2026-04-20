---
description: Agent roster and workflow for the waifu-rt3d AI companion platform
globs: *
alwaysApply: true
---

# AGENTS.md — waifu-rt3d

> 12 specialized agents for the waifu-rt3d AI companion platform. Main-session Claude coordinates — there is no separate "orchestrator" agent (deprecated 2026-04-19 as a phantom role; main-session Claude performs coordination during `/go` execution).

## Strategy & Planning

| Agent | Model | Role | Codes? |
|-------|-------|------|--------|
| **advisor** | opus | Strategic partner. Risk flagging, architecture critique, lightweight 1-page PRDs, feature ideas. | No |
| **prd-writer** | opus | Formal dual-audience (Why/How) PRD author with file plans, UI mockups, implementation order. | No |

`advisor` vs `prd-writer`: use `advisor` for strategy/critique/light PRDs; `prd-writer` for full formal specs.

## Implementation

| Agent | Model | Role | Codes? |
|-------|-------|------|--------|
| **senior-dev** | sonnet | Full-stack Python + React. Primary implementation agent. | Yes |
| **ux-architect** | sonnet | UI/UX. CSS variables, Framer Motion, 18 themes. | Yes |
| **schema-architect** | sonnet | SQLite migrations, preflight.py, data modeling. | Yes |

## Quality & Intelligence

| Agent | Model | Role | Codes? |
|-------|-------|------|--------|
| **qa-hunter** | sonnet | Backend pytest tests, edge cases, regressions. Python-scoped. | Yes (tests only) |
| **frontend-tester** | sonnet | Vitest + React Testing Library for Sakura components/stores/hooks. | Yes (tests only) |
| **codebase-analyst** | sonnet | Read-only intelligence. Maps deps, finds reuse. | No |
| **regression-guard** | sonnet | Scans git log for repeat-fix patterns, locks in regression tests for uncovered bugs. | Yes (tests only) |
| **perf-reviewer** | sonnet | Three.js/VRM rendering, Python backend endpoint perf, React re-render audit. | No |
| **theme-auditor** | sonnet | CSS variable audit across 18 themes, hardcoded color detection. | No |
| **production-readiness-auditor** | sonnet | Full codebase audit for placeholders, TODOs, incomplete implementations. Repo-local since 2026-04-19 (was user-global). | No |

`qa-hunter` vs `frontend-tester`: `qa-hunter` is backend-pytest-only; frontend Vitest/RTL routes to `frontend-tester`.

## Standard Workflow

1. **Chris + advisor** scope the feature (planning window)
2. **advisor** sketches → OR **prd-writer** writes formal PRD → plan file
3. **Main-session Claude** decomposes the plan inside `/go` and dispatches implementation agents
4. **qa-hunter** / **frontend-tester** validate per-domain (pytest / vitest + tsc)
5. **advisor** reviews output against PRD

## Dispatch Rules

- **Small change** (< 2h): `senior-dev` alone, or inline by main Claude
- **Medium feature** (2h-1d): `senior-dev` + `ux-architect`, sequential
- **Large feature** (1-3d): `/go` dispatches 3-5 agents in parallel across waves
- **Sprint-shape feature** (clean backend/frontend/docs split): `/go --preset=sprint` (3-agent lockstep — absorbed the former `/sprint` skill on 2026-04-19)
- **New feature from scratch**: `advisor` (or `prd-writer`) → plan file → `/go`

## Tech Stack

- Backend: Python 3.14, FastAPI, SQLite (schema v70+), `.venv/` (Homebrew Python)
- Frontend: React 19, TypeScript, Zustand, Framer Motion, Vite
- 3D: Three.js VRM viewer (iframe + postMessage), Live2D (PIXI)
- Voice: WebSocket duplex, VAD, Kokoro TTS, 16-emotion modulator
- Testing: pytest (backend), tsc --noEmit (frontend), Vitest + RTL (frontend tests), Playwright (e2e)

## Key References

- Plan file: `.claude/plans/replicated-foraging-nebula.md`
- Feature specs: `docs/plans/2026-03-15-actionable-implementation-specs.md`
- Competitive research: `docs/design/competitive-research-2026-03-18.md`
- Memory: `.claude/projects/-Users-chris-Code-waifu-rt3d/memory/MEMORY.md`
