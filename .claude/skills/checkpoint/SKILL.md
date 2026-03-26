---
name: checkpoint
description: "Milestone status update: sync CURRENT_STATUS.md, mark plan phases done, format commit message"
user_invocable: true
---

# Checkpoint — Milestone Status Update

Update project status files after completing a feature or plan phase. Run proactively at milestones or manually for ad-hoc status sync.

## Steps

### 1. Pre-Flight Data Collection (parallel)

Run all of these simultaneously:
```
git log --oneline -5
git diff --stat HEAD~1
.venv/bin/python -m pytest backend/tests/ -q --tb=no 2>&1 | tail -1
cd frontends/sakura && npx tsc --project tsconfig.app.json --noEmit 2>&1 | tail -3
```
Read `CURRENT_STATUS.md` and the most recent plan file.

### 2. Identify Completions

- Compare git commits since last checkpoint against plan phases
- Note which phases/tasks transitioned to done
- Check if schema version changed (grep `SCHEMA_VERSION` in preflight.py)

### 3. Update `CURRENT_STATUS.md`

- Update the "Completed This Session" table with new commits
- Update test count from pre-flight data
- Update schema version if changed
- Refresh the "Next 3 Tasks" section
- Update the "Last updated" timestamp
- **Rolling window rule:** CURRENT_STATUS.md must stay under 50 lines. If it exceeds this after updates, move completed session tables and any historical data to `docs/STATUS_HISTORY.md` (append at top of the relevant section). CURRENT_STATUS.md should only contain: header stats, active work, current session commits, next 3 tasks, and the quick reference table.

### 4. Update Master Plan File

Update `.claude/plans/2026-03-19-master-plan-phases-1-20.md` (or current active plan):
- Mark completed phases with `✅ DONE` prefix
- Do NOT delete any content — only add status markers

### 5. Sync Feature Masterlist

Update `docs/FEATURE_MASTERLIST.md`:
- Mark newly completed features as ✅ with commit hash
- Add any new features that were implemented but not yet tracked
- Update the "Last updated" date

### 6. Update Completed Features Archive

Append to `docs/COMPLETED_FEATURES.md`:
- Add entries for newly completed features under the current month
- Include: phase name, 1-2 line description, schema version, commit hash

### 7. Format Commit Message Template

Output a commit message following the convention:
```
feat(<phase>): <short description>

<body: what was built, key decisions, non-obvious details>
```

### 8. Create/Update Session Summary

If 3+ tasks completed this session, write `docs/sessions/SESSION_YYYY-MM-DD.md`:
- What was done (phases, features)
- Key decisions made
- Files changed (grouped by area)
- Test counts (before → after)
- What's next

### 9. Update Resume Prompt

Write/update `docs/plans/RESUME_PROMPT.md`:
- Last completed work (phase, commits, files touched)
- Next 3 tasks from the plan
- In-flight decisions, blockers, or context for next session
- Key files to read first
- Actual time spent (for estimate calibration)

### 10. Context Health Check

Estimate context usage based on session activity:
- Count: agent dispatches, large file reads, conversation turns
- If heavy (5+ agents, 15+ large reads, 30+ turns): recommend handoff
- Report: `Context: [light/moderate/heavy] — [recommendation]`

### 11. Report Summary

```
=== Checkpoint ===
Completed: [phase/task names]
Tests: [X passed] | tsc: [clean/N errors]
Schema: v[N]
Status files: CURRENT_STATUS.md, FEATURE_MASTERLIST.md, COMPLETED_FEATURES.md updated
Context: [light/moderate/heavy]
Next: [top 3 tasks from plan]
===
```

## Rules

- Do NOT start implementing anything. This is a status-update-only skill.
- Do NOT delete plan content. Only add `✅ DONE` markers.
- If no changes detected since last checkpoint, report "Nothing new to checkpoint" and stop.
- Always include actual elapsed time in the report for estimate calibration.
- If context is heavy, proactively recommend a session handoff BEFORE the user asks.
