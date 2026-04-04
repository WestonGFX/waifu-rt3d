---
name: pre-session
description: >
  Session-start health check. Reads CURRENT_STATUS.md, RESUME_PROMPT.md,
  verifies plan files, checks branch state, runs pytest + tsc, reports in
  one screen. Run at the start of every new session for instant context.
user_invocable: true
---

# Pre-Session Health Check

Cold-start context restoration and project health verification.
Run this first in every new session.

## Step 1: Restore Context (parallel reads)

Read ALL of these in parallel:

1. `CURRENT_STATUS.md` — primary handoff document
2. `docs/SESSION_HANDOFF.md` — previous session's ephemeral handoff
   - If missing: note "No handoff file found — fresh start"
3. `docs/plans/RESUME_PROMPT.md` — resume instructions
4. Latest plan file in `docs/plans/` (most recently modified .md file)
5. Memory file `MEMORY.md` in the auto-memory directory

## Step 2: Verify Integrity

Check that key referenced files exist:
1. Every plan file mentioned in CURRENT_STATUS.md — verify it exists on disk
2. Key file paths mentioned in SESSION_HANDOFF.md — spot-check existence
3. `backend/server.py` and `backend/preflight.py` — core backend files
4. `frontends/sakura/package.json` — frontend package manifest

Report any missing files or broken references.

## Step 3: Health Checks (parallel)

Run ALL in parallel:
1. `git status && git branch --show-current` — branch and clean state
2. `cd frontends/sakura && npx tsc --project tsconfig.app.json --noEmit 2>&1 | tail -5` — type check
3. `.venv/bin/python -m pytest backend/tests/ -q --tb=line 2>&1 | tail -5` — test suite
4. `curl -s http://localhost:8080/api/health 2>&1 || echo "Server not running"`

## Step 4: Report

Keep output to ONE SCREEN (under 30 lines):

```
Pre-Session Health Check
────────────────────────────────────────
Branch:       {name} ({clean/dirty})
Last Handoff: {date from SESSION_HANDOFF.md or "none"}
Schema:       v{N} (from CURRENT_STATUS.md)
────────────────────────────────────────
TSC:          {clean / N errors}
Tests:        {X passed, Y failed}
Server:       {running / not running}
────────────────────────────────────────
Missing Files: {list or "none"}
────────────────────────────────────────
Previous Session Summary:
  {2-3 line summary from SESSION_HANDOFF.md}

Next Priorities:
  1. {from CURRENT_STATUS.md or RESUME_PROMPT.md}
  2. {from above}
  3. {from above}
────────────────────────────────────────
```

If server is not running, suggest:
`.venv/bin/python -m uvicorn backend.server:app --host 0.0.0.0 --port 8080`

## Rules
- Do NOT fix anything. Report only.
- Do NOT start working on priorities — just report them.
- Keep output to ONE SCREEN (under 30 lines).
- If no handoff file exists, note it and still run health checks.
