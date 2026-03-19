---
description: Agent roster and workflow for the waifu-rt3d AI companion platform
globs: *
alwaysApply: true
---

# AGENTS.md — waifu-rt3d

> 8 specialized agents orchestrated via MoE for the waifu-rt3d AI companion platform.

## Strategy & Planning

| Agent | Model | Role | Codes? |
|-------|-------|------|--------|
| **advisor** | opus | Strategic partner. PRDs, architecture, risk, feature ideas. | No |
| **prd-writer** | opus | Spec author. Dual-audience Why/How format. | No |

## Implementation

| Agent | Model | Role | Codes? |
|-------|-------|------|--------|
| **orchestrator** | opus | Dispatches up to 8 agents. Independence + conflict checks. | No |
| **senior-dev** | sonnet | Full-stack Python + React. Primary implementation agent. | Yes |
| **ux-architect** | sonnet | UI/UX. CSS variables, Framer Motion, 18 themes. | Yes |
| **schema-architect** | sonnet | SQLite migrations, preflight.py, data modeling. | Yes |

## Quality & Intelligence

| Agent | Model | Role | Codes? |
|-------|-------|------|--------|
| **qa-hunter** | sonnet | Tests, edge cases, regressions. pytest + tsc. | Yes |
| **codebase-analyst** | sonnet | Read-only intelligence. Maps deps, finds reuse. | No |

## Standard Workflow

1. **Chris + advisor** scope the feature (planning window)
2. **advisor** writes PRD → plan file
3. **orchestrator** decomposes → dispatches implementation agents
4. **qa-hunter** validates (pytest + tsc --noEmit)
5. **advisor** reviews output against PRD

## Dispatch Rules

- **Small change** (< 2h): senior-dev alone
- **Medium feature** (2h-1d): senior-dev + ux-architect, sequential
- **Large feature** (1-3d): orchestrator dispatches 3-5 agents in parallel
- **New feature from scratch**: advisor → prd-writer → orchestrator → agents

## Tech Stack

- Backend: Python 3.14, FastAPI, SQLite (schema v52+), `.venv/` (Homebrew Python)
- Frontend: React 19, TypeScript, Zustand, Framer Motion, Vite
- 3D: Three.js VRM viewer (iframe + postMessage), Live2D (PIXI)
- Voice: WebSocket duplex, VAD, Kokoro TTS, 16-emotion modulator
- Testing: pytest (backend), tsc --noEmit (frontend), Playwright (e2e)

## Key References

- Plan file: `.claude/plans/replicated-foraging-nebula.md`
- Feature specs: `docs/plans/2026-03-15-actionable-implementation-specs.md`
- Competitive research: `docs/design/competitive-research-2026-03-18.md`
- Memory: `.claude/projects/-Users-chris-Code-waifu-rt3d/memory/MEMORY.md`
