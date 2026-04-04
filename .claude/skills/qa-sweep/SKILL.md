---
name: qa-sweep
description: >
  Parallel QA sweep: pytest, TypeScript check, Ruff lint, and targeted
  regression hotspot scan. Report-only — does not fix anything.
  Run before commits, PRs, or after large changes.
user_invocable: true
---

# QA Sweep — Parallel Quality Check

Read-only diagnostic across 4 quality dimensions. Reports issues but
does NOT fix them. Fast enough to run frequently.

## Phase 1: Automated Checks (parallel, single message)

Run ALL four in parallel:

1. **TypeScript**: `cd frontends/sakura && npx tsc --project tsconfig.app.json --noEmit 2>&1`
   - Record: error count, first 10 errors if any

2. **Tests**: `.venv/bin/python -m pytest backend/tests/ -q --tb=line 2>&1`
   - Record: total, passed, failed, test file count

3. **Lint**: `cd /Users/chris/Code/waifu-rt3d && /opt/homebrew/bin/ruff check backend/ 2>&1 | head -30`
   - Record: error count, warning count

4. **Git diff**: `git diff --name-only HEAD~3` (or since last merge)
   - Record: list of recently changed files for Phase 2

## Phase 2: Regression Hotspot Scan

For each recently changed file from git diff, check if it touches a
known regression-prone area. Flag any matches:

### Backend Hotspots
- `backend/server.py` — API endpoint registration, route conflicts
- `backend/preflight.py` — DB migration chain integrity
- `backend/llm/context_assembler.py` — token budget, context truncation
- `backend/voice/duplex.py` — state machine transitions
- `backend/mood/engine.py` — emotion calculation, time-of-day

### Frontend Hotspots
- `frontends/sakura/src/App.tsx` — overlay rendering, imports
- `frontends/sakura/src/stores/appStore.ts` — Overlay type, state
- `frontends/sakura/src/stores/viewerStore.ts` — ViewerCommand kinds
- `frontends/sakura/src/stores/chatStore.ts` — message flow, streaming

### Viewer Hotspots
- `frontends/shared/viewer/viewer.html` — AnimationDirector, postMessage handlers
- Any file modifying VRM bone mappings or blend shapes

### Theme Hotspots
- Any file touching CSS variables or `var(--color-*)` patterns
- Theme definitions in the themes directory

## Phase 3: Report

Format results as:
```
QA Sweep Results
────────────────────────────────────────
TSC:      {N errors} {PASS/FAIL}
Tests:    {X passed, Y failed, Z total} {PASS/FAIL}
Lint:     {N errors, M warnings} {PASS/FAIL}
────────────────────────────────────────
Regression Hotspots Touched:
  {list of flagged hotspot files, or "None"}
────────────────────────────────────────
Overall: {ALL GREEN / HAS ISSUES}
```

## Rules
- Do NOT fix anything. Report only.
- Do NOT run the full build — too slow for a sweep.
- If ALL automated checks pass AND no hotspots touched: report "All green."
- If hotspots are touched: recommend manual visual verification of those areas.
