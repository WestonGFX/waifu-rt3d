---
name: dashboard
description: "Session-start briefing: branch, tests, progress, next tasks"
user_invocable: true
---

# Project Dashboard

One-screen overview for session startup. Reads from multiple sources and presents a summary.

## Data Sources (read in parallel)

1. `git branch --show-current` + `git log --oneline -1` (branch + last commit)
2. `git status --short` (uncommitted files)
3. `.venv/bin/python -m pytest backend/tests/ -q --tb=no 2>&1 | tail -3` (test count)
4. `cd frontends/sakura && npx tsc --project tsconfig.app.json --noEmit 2>&1 | grep -c "error TS"` (TS errors)
5. `CURRENT_STATUS.md` (phase + progress + next tasks)
6. If no CURRENT_STATUS.md: fall back to MEMORY.md

## Output Format

```
=== Project Dashboard ===

Branch:     [branch] | Last commit: [hash] [message] ([age])
Tests:      [X passed, Y failed] | TSC: [N errors]
Phase:      [current phase name]
Progress:   [last completed item]
Next tasks:
  1. [task]
  2. [task]
  3. [task]
Uncommitted: [N files] [summary]

Ready to implement. Say /go or specify a task.
```

## Rules
- Do NOT fix anything or start implementing. Just report.
- If tests are failing, note it but don't investigate.
- Keep output compact — one screen, no scrolling.
