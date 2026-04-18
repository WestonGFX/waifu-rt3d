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

## Chunked Mode — `/qa-sweep --chunked`

Use this for long Playwright/browser-based QA runs that would exhaust context as a single sweep. Background lesson: the 400-case sweep session blew past the compaction threshold and lost state mid-run. Chunking keeps each batch self-contained.

### When to use chunked mode

- Running `docs/testing/qa-questionnaire.html` scenarios end-to-end (50+ cases)
- Pre-release regression testing with Chrome/Playwright tools
- Any sweep expected to exceed 50 individual test assertions

Not for the quick sanity check above — use the default mode for that.

### Chunked execution loop

1. **Load test scenarios** — read `docs/testing/test-scenarios.md` (or the QA questionnaire JSON). If missing, stop and ask the user to generate scenarios first — do NOT invent scenarios on the fly.

2. **Partition into batches of 50** cases. Batches are self-contained; a batch must never depend on state from a prior batch.

3. **Per-batch loop:**
   - Run the 50 cases (Playwright, Chrome tools, or curl probes as appropriate)
   - Categorize each failure: **P0** (blocks shipping — crash, data loss, auth failure), **P1** (broken feature, visible bug), **P2** (polish — copy, alignment, minor UX)
   - Append findings to `docs/testing/qa-findings-YYYY-MM-DD.md` using the schema below
   - Commit that file with message `test(qa-sweep): batch N findings (P0:x P1:y P2:z)`
   - Clear local state/context from the batch (close tabs, drop in-memory refs) before starting the next batch

4. **Final summary** — after all batches complete, append a summary table at the bottom of the findings doc:
   | Batch | P0 | P1 | P2 | Cases | Notes |
   |---|---|---|---|---|---|
   | 1 | 0 | 2 | 5 | 50 | All auth cases pass |
   | ... | ... | ... | ... | ... | ... |
   | **Total** | **1** | **7** | **23** | **400** | See per-batch notes |

### Findings doc schema

```markdown
## Batch N (cases X–Y, YYYY-MM-DD HH:MM)

### P0 — blocks shipping
- **[case-id]** Title. Expected: ... Actual: ... Repro: ... File: path:line
  - Screenshot: docs/testing/screenshots/case-id.png (if browser-tooled)

### P1 — broken feature
- ...

### P2 — polish
- ...
```

### Auto-fix policy

- **P0 only, and only after user approval.** Present the P0 list after a batch; if the user green-lights, fix, re-run the case, confirm pass, continue to next batch.
- **P1 and P2 are never auto-fixed.** They land as a followup task list in `docs/plans/` at session end.

## Rules
- Do NOT fix anything. Report only. (Exception: chunked mode P0 auto-fix with explicit user approval.)
- Do NOT run the full build — too slow for a sweep.
- If ALL automated checks pass AND no hotspots touched: report "All green."
- If hotspots are touched: recommend manual visual verification of those areas.
- In chunked mode: NEVER proceed past a batch without committing its findings file. The commit is the safety net if context runs out mid-sweep.
