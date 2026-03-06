---
name: sprint
description: "Parallel 3-agent sprint: backend + frontend + docs agents working simultaneously"
user_invocable: true
---

# Parallel Sprint

Split work across 3 specialized agents for maximum throughput. User provides the task description as argument (e.g., `/sprint Add WebSocket heartbeat monitoring`).

## Agent Split

### Agent 1 — Backend
- **Scope:** `backend/` — migrations, API endpoints, models, tests
- **Commit prefix:** `feat(backend):` or `fix(backend):`
- **Must:** Run `pytest` before committing
- **Boundaries:** Do NOT touch frontend files

### Agent 2 — Frontend
- **Scope:** `frontends/sakura/src/` — components, hooks, stores, types
- **Commit prefix:** `feat(frontend):` or `fix(frontend):`
- **Must:** Run `tsc --noEmit` before committing
- **Boundaries:** Do NOT touch backend files

### Agent 3 — Docs (runs AFTER agents 1+2 complete)
- **Scope:** `README.md`, `docs/`, inline JSDoc/docstrings in changed files
- **Commit prefix:** `docs:`
- **Must:** Only document what agents 1+2 actually built
- **Boundaries:** Do NOT change logic code

## Execution

1. Parse the user's task description
2. Break it into backend vs frontend work items
3. Launch Agent 1 and Agent 2 in parallel using the Agent tool
4. Wait for both to complete
5. Launch Agent 3 for documentation
6. **Integration check:** Run full smoke test (pytest + tsc)
7. If cross-boundary issues found (e.g., API contract mismatch), fix and commit as `fix: integration alignment`

## Rules

- Each agent commits independently after its sub-tasks
- If one agent's work depends on the other (e.g., frontend needs a new API), the dependent agent should create a stub/interface and note the dependency
- NEVER enter plan mode within agents — implement directly
