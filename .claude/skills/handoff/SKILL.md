---
name: handoff
description: >
  End-of-session duties: write summary to disk, update CURRENT_STATUS.md,
  update handoff memory. Fast alternative to /checkpoint — focused on context
  preservation for the next session. Trigger when user says "wrap up",
  "I'm done", "handoff", "save state", or runs /handoff.
user_invocable: true
---

# Session Handoff — Fast Context Save

Quick, focused end-of-session state save. Produces a SESSION_HANDOFF.md
that lets the next session cold-start in under 60 seconds.

Use `/checkpoint` for full documentation. Use `/handoff` for fast exit.

## Step 1: Gather State (parallel, single message)

Run ALL of these in parallel:
1. `cd frontends/sakura && npx tsc --project tsconfig.app.json --noEmit 2>&1 | tail -5` — type check status
2. `.venv/bin/python -m pytest backend/tests/ -q --tb=line 2>&1 | tail -5` — test count and status
3. `git status && git log --oneline -10` — branch state
4. `git diff --stat` — uncommitted changes summary

Hold all results in working memory for the next steps.

## Step 2: Commit Any Uncommitted Work

If there are uncommitted changes:
1. Stage relevant files (NOT .env, app.db, credentials, __pycache__, node_modules)
2. Write a detailed commit message describing ALL changes
3. Commit and push

If no uncommitted changes, skip to Step 3.

## Step 3: Write SESSION_HANDOFF.md

Create or OVERWRITE `docs/SESSION_HANDOFF.md` with this structure:

```markdown
# Session Handoff — {YYYY-MM-DD}

## Branch: {current branch}
## Test Status: {X passed, Y failed} | TSC: {clean/N errors}

## Completed This Session
- {Bulleted list of what was done, grouped by feature area}

## Work In Progress
- {Anything started but not finished, with file paths}

## Known Issues / Bugs
- {Bugs found but not fixed, with reproduction steps if known}

## Files Modified
{Output of git diff --stat for this session's commits}

## Next Session Priorities
1. {Highest priority with context and file paths}
2. {Second priority}
3. {Third priority}

## Context for Next Session
- {Non-obvious state: environment setup needed, server status, etc.}
- {Active plan file and which phase/task is next}
- {Any decisions that were made and WHY}
```

This file is EPHEMERAL — it gets overwritten each session. The durable
record lives in CURRENT_STATUS.md, memory files, and git history.

## Step 4: Update CURRENT_STATUS.md

Update the "Last updated" timestamp and any section that changed this session:
- Test count if it changed
- Schema version if it changed
- Feature completion status
- Active work section

IMPORTANT: APPEND or update in-place. NEVER truncate or delete existing sections.

## Step 5: Update Memory

Update the `project_session_handoff.md` memory file in the auto-memory
directory:
- Set date to today's absolute date (YYYY-MM-DD)
- List completed items from this session
- List remaining items with priorities
- Include test count and branch name

## Step 6: Final Report

Print a concise summary:
```
Session Handoff Complete
Branch: {branch} | Commits: {N this session}
Tests: {X passed} | TSC: {clean/errors}
Handoff: docs/SESSION_HANDOFF.md
Status: CURRENT_STATUS.md updated
Next: {top priority for next session}
```
