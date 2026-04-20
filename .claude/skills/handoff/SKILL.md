---
name: handoff
description: >
  End-of-session context save. Writes SESSION_HANDOFF.md (ephemeral, overwritten
  each session) and invokes the status-sync subset of /checkpoint. Thin wrapper
  around /checkpoint — use /handoff for fast exit, /checkpoint for full milestone
  ritual. Trigger when user says "wrap up", "I'm done", "handoff", "save state",
  or runs /handoff.
user_invocable: true
---

# Session Handoff — Fast Context Save

Fast end-of-session state save. Produces a `docs/SESSION_HANDOFF.md` that lets
the next session cold-start in under 60 seconds. Shares status-sync logic with
`/checkpoint` — see that skill for the full milestone ritual.

**When to use which:**
- `/handoff` — End of session. You want to stop working soon. ~6 steps, ~1 min.
- `/checkpoint` — Mid-session milestone. Full archive sync: FEATURE_MASTERLIST, COMPLETED_FEATURES, RESUME_PROMPT, session summary, plan-phase markers. ~11 steps, ~3 min.

## Step 1 — Gather State (parallel, single message)

Run ALL of these in parallel:

1. `cd frontends/sakura && npx tsc --project tsconfig.app.json --noEmit 2>&1 | tail -5`
2. `.venv/bin/python -m pytest backend/tests/ -q --tb=line 2>&1 | tail -5`
3. `git status && git log --oneline -10`
4. `git diff --stat`

## Step 2 — Commit Uncommitted Work (if any)

If `git status` shows modifications:
1. Stage relevant files (NOT `.env`, `app.db`, `credentials`, `__pycache__`, `node_modules`)
2. Write a detailed commit message describing ALL changes in this session
3. Commit

If no uncommitted changes, skip.

## Step 3 — Write `docs/SESSION_HANDOFF.md` (unique to /handoff)

This file is EPHEMERAL — it gets overwritten each session. Durable records live
in `CURRENT_STATUS.md`, memory files, and git history.

Structure:

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

## Step 4 — Status-sync subset (shared with /checkpoint)

Perform these /checkpoint steps (do NOT run the full /checkpoint ritual):

- **Step 3 of /checkpoint:** Update `CURRENT_STATUS.md` — timestamp, test count, schema version, "Active work" section. APPEND only; never truncate.
- **Step 5 of /checkpoint:** Update `project_session_handoff.md` memory file with date, completed items, remaining priorities, test count, branch.

Skip the /checkpoint-only steps: master plan markers, FEATURE_MASTERLIST sync, COMPLETED_FEATURES append, RESUME_PROMPT rewrite, session summary, context-health recommendation. Those are milestone-grade ritual; /handoff is a fast exit.

## Step 5 — Final Report

```
Session Handoff Complete
Branch: {branch} | Commits: {N this session}
Tests: {X passed} | TSC: {clean/errors}
Handoff: docs/SESSION_HANDOFF.md
Status: CURRENT_STATUS.md + memory updated
Next: {top priority for next session}

Run /checkpoint if you also want FEATURE_MASTERLIST / COMPLETED_FEATURES / RESUME_PROMPT updates.
```

## Rules

- Do NOT run the full /checkpoint ritual inside /handoff — Step 4 above lists the exact subset. Stay in that boundary.
- Do NOT auto-invoke `/qa-sweep` (vetoed by user for mid-flow and handoff alike — see repo CLAUDE.md Suggestion Triggers).
- Do NOT truncate or reorder existing content in CURRENT_STATUS.md or the memory file. Append/update in place.
- If this session included a schema migration, a Known Sensitive Area touch, or 3+ files across backend/frontend/viewer — proactively suggest `/qa-sweep` per the Suggestion Triggers rule. Suggest, don't run.
