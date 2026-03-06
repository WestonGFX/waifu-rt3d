---
name: go
description: Continue previous work — resume implementation from plan files or MEMORY.md
user_invocable: true
---

# Continue Previous Work

## Flags
- `--single` or `--single <task-id>`: Implement ONLY one task, test, commit, then STOP. Do not continue to next task.

## Steps

1. **Gather context (parallel reads):**
   - Read `CURRENT_STATUS.md` (primary source of truth for session state)
   - Read `MEMORY.md` for project context
   - Read the most recent plan file in `.claude/plans/`
   - Run `git status` and `git log --oneline -5`

2. **Identify next work:**
   - If `CURRENT_STATUS.md` exists, use its "Next tasks" list
   - If a plan file exists, find the first item marked TODO or unchecked
   - If neither exists, fall back to MEMORY.md "NEXT SESSION TASKS"
   - If `--single <task-id>` was given, find that specific task

3. **Run baseline tests:**
   - `.venv/bin/python -m pytest backend/tests/ -q --tb=line` (record pass count)
   - `cd frontends/sakura && npx tsc --project tsconfig.app.json --noEmit 2>&1 | tail -5`
   - Note any pre-existing failures (do not fix them unless they're part of the task)

4. **Implement the next task:**
   - Write code immediately — do NOT enter plan mode, do NOT create new plan files
   - Follow the project's existing patterns and conventions

5. **After each sub-task completes:**
   - Run tests: `pytest` + `tsc`
   - If tests pass: commit with a descriptive message (e.g., `feat: add WebSocket heartbeat`)
   - If tests fail: fix the failures before committing
   - If `--single` flag was used: STOP here. Report what was done and exit.

6. **Continue to next task** (unless `--single` was used):
   - Move to the next unchecked item in the plan
   - Repeat steps 4-5
   - Continue until the user interrupts or the plan is complete

## Hard Rules

- **NEVER enter plan mode.** Not even "just to organize thoughts." Implement directly.
- **NEVER batch commits.** One commit per completed sub-task. Small, atomic commits.
- **NEVER rewrite or overwrite plan files.** Read them, execute them, mark items done.
- **NEVER ask "should I continue?" between sub-tasks** unless `--single` was used. Just keep going.
- If you catch yourself typing "Let me create a plan..." — STOP. Delete that text. Write code instead.
