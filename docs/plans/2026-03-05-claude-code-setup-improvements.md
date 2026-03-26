# Plan: Claude Code Setup Improvements (from /insights report)

## Context

The `/insights` report across 51 sessions identified recurring friction patterns:
1. Claude falling into plan mode instead of coding (~10 wrong-approach incidents)
2. Introduced regressions with no automated catching (6 buggy-code instances)
3. Batched commits losing work on interruption (12 commits across 51 sessions)
4. No parallel agent workflow despite proven success with it

This plan implements 8 targeted improvements to the project's Claude Code setup.

## Changes Summary

| # | File | Action | What |
|---|------|--------|------|
| 1 | `.claude/skills/go/SKILL.md` | Overwrite | Enhanced resume skill |
| 2 | `.claude/settings.json` | Overwrite | Add TS hook + fix Python hook venv path |
| 3 | `CLAUDE.md` | Append | 5 new rule sections after line 51 |
| 4 | `.claude/skills/smoke-test/SKILL.md` | Create | Quick pytest + tsc validation |
| 5 | `.claude/skills/sprint/SKILL.md` | Create | 3-agent parallel sprint |
| 6 | `.claude/skills/tdd/SKILL.md` | Create | Test-driven development loop |
| 7 | `CURRENT_STATUS.md` + SessionEnd hook | Create | Auto-maintained session state tracker |
| 8 | `~/.zshrc` additions | Append | Headless mode shell aliases |

---

## 1. Upgrade `/go` skill

**File:** `.claude/skills/go/SKILL.md` — full overwrite

Add frontmatter, git status check, baseline test run, commit-per-subtask, MEMORY.md fallback, anti-plan-mode enforcement, and a `--single` flag. Key additions:
- Parallel reads of MEMORY.md + latest plan file + git status
- Baseline pytest run before implementation
- After each sub-task: run tests → commit → continue
- If no plan file: fall back to MEMORY.md "NEXT SESSION TASKS"
- Hard rule: NEVER enter plan mode, NEVER batch commits
- **`--single` flag:** When user says `/go --single` or `/go --single 3.2`, implement ONLY that one task, test, commit, then STOP. Do not continue to next task. Addresses the "mega-session" friction pattern where sessions try to cover too much scope.

## 2. Add TypeScript PostToolUse hook

**File:** `.claude/settings.json` — full overwrite

Add a second hook under the same `Edit|Write` matcher:
- Checks if edited file is `.ts` or `.tsx`
- Runs `cd frontends/sakura && npx tsc --project tsconfig.app.json --noEmit --pretty 2>&1 | tail -20`
- Uses `break` after first TS match (tsc checks whole project anyway)

**Bug fix included:** Change existing Python hook from bare `python` → `.venv/bin/python` (Conda intercepts bare python).

**Why `tsconfig.app.json`:** Root `tsconfig.json` in sakura uses project references with `"files": []` — plain `tsc --noEmit` produces no output. `tsconfig.app.json` is what includes `src/`.

## 3. Strengthen CLAUDE.md

**File:** `CLAUDE.md` — append 5 new sections after existing line 51

### Sections to add:
1. **Tech Stack** — "TypeScript, JavaScript, Python, HTML/CSS, Three.js/VRM, Electron, Vite, React 19, Zustand, FastAPI, SQLite, Playwright. GPU: RTX 5080 16GB."
2. **No-Plan-Mode Rule** — "NEVER enter plan mode unless user explicitly says 'plan' or 'design'. Just implement."
3. **Smoke Test Before Completion** — "Run pytest + tsc before presenting work as done. Fix failures before reporting."
4. **Commit Checkpoints** — "Commit after each completed feature/sub-task. Do NOT batch."
5. **Plan File Safety** — "NEVER overwrite plan files. Always READ first, then APPEND."

## 4. New `/smoke-test` skill

**File:** `.claude/skills/smoke-test/SKILL.md` — create

Read-only diagnostic that runs:
1. `.venv/bin/python -m pytest backend/tests/ -q --tb=line`
2. `cd frontends/sakura && npx tsc --project tsconfig.app.json --noEmit`
3. Reports pass/fail summary — does NOT fix anything

## 5. New `/sprint` skill

**File:** `.claude/skills/sprint/SKILL.md` — create

Fixed 3-agent parallel split:
- **Agent 1 (Backend):** `backend/` — migrations, API, tests. Commits with `feat(backend):`
- **Agent 2 (Frontend):** `frontends/sakura/src/` — components, hooks, stores. Commits with `feat(frontend):`
- **Agent 3 (Docs):** README, docs/, inline docs. Runs AFTER agents 1+2 complete.
- **Integration step:** Full smoke test, verify no cross-boundary mismatches, final commit if needed
- User provides phase description as argument: `/sprint Add WebSocket heartbeat monitoring`

## 6. New `/tdd` skill

**File:** `.claude/skills/tdd/SKILL.md` — create

Strict red-green-refactor loop:
1. Write tests FIRST (backend: `backend/tests/`, frontend: alongside component)
2. Confirm tests FAIL for the right reason (not import errors)
3. Implement minimum code to pass
4. Run tests — must be all green
5. Refactor if needed, re-run tests
6. Check full test suite for regressions
7. Commit
8. Repeat for next piece

Hard rules: never write implementation before tests, never skip "confirm fail" step, never enter plan mode.

## 7. CURRENT_STATUS.md auto-tracking

**Files:**
- `CURRENT_STATUS.md` in project root — create initial version
- `.claude/settings.json` — add SessionEnd hook to auto-update it

A machine-readable status file that Claude maintains automatically. Updated via a SessionEnd hook that prompts Claude to write current state before the session closes.

### Contents:
```markdown
# Current Status
- **Phase:** [current phase name]
- **Last completed:** [description of last finished item]
- **Next tasks:** [ordered list of next 3 items]
- **Failing tests:** [any known failures, or "none"]
- **Branch:** [current git branch]
- **Updated:** [timestamp]
```

### SessionEnd hook:
Add to `.claude/settings.json`:
```json
{
  "event": "SessionEnd",
  "hooks": [{
    "type": "prompt",
    "prompt": "Before ending, update CURRENT_STATUS.md with: current phase, last completed item, next 3 tasks, any failing tests, current branch, and timestamp."
  }]
}
```

This replaces the need to grep through MEMORY.md on resume — `/go` skill can read `CURRENT_STATUS.md` directly for instant context.

## 8. Headless mode shell aliases

**File:** `~/.zshrc` — append aliases

Add convenience aliases for running Claude Code in headless/non-interactive mode:

```bash
# Claude Code headless aliases
alias cc-batch='claude -p --allowedTools "Read,Edit,Write,Bash,Grep,Glob"'
alias cc-plan='claude -p "Read the most recent plan file in .claude/plans/ and implement all items marked TODO. Run tests after each change. Commit when all pass." --allowedTools "Read,Edit,Write,Bash,Grep,Glob"'
alias cc-test='claude -p "Run .venv/bin/python -m pytest backend/tests/ -q and report results" --allowedTools "Read,Bash"'
```

Usage: `cc-batch "Fix the auth bug in server.py"` or just `cc-plan` to auto-execute the current plan.

**Note:** Will confirm with user before modifying ~/.zshrc since it affects the global shell environment.

---

## 9. New `/audit` skill

**File:** `.claude/skills/audit/SKILL.md` — create

Parallel code review that formalizes the Phase 10 pattern:
- Takes a scope argument (e.g., `/audit last 3 commits` or `/audit unstaged`)
- Spawns 2-3 parallel review agents:
  - **Agent 1:** Bug detection + logic errors
  - **Agent 2:** Security + OWASP top 10
  - **Agent 3:** Code quality + project convention adherence
- Each produces a prioritized list (P0 critical / P1 high / P2 nice-to-fix)
- Merges into a single triage report sorted by priority

## 10. New `/dashboard` skill

**File:** `.claude/skills/dashboard/SKILL.md` — create

Session-start briefing that reads from multiple sources and presents a one-screen overview:
- Branch + last commit age
- Test status (pytest count + tsc errors)
- Current phase + progress (from `CURRENT_STATUS.md`)
- Next 3 tasks
- Uncommitted files
- Ends with "Ready to implement. Say /go or specify a task."

Reads from: `CURRENT_STATUS.md` (item 7), git status, pytest, tsc.

## 11. Hypothesis Limit rule in CLAUDE.md

**File:** `CLAUDE.md` — append as 6th new section

> **Hypothesis Limit:** When debugging, commit to ONE hypothesis and test it before trying another. Do NOT cycle through multiple theories without running code. If 3 hypotheses fail, STOP and present findings to the user. Never explore a 4th hypothesis without user approval.

Addresses the "excessive exploration" friction (VRM arm rotation debugging, Chrome automation crash).

## 12. New `/investigate` skill

**File:** `.claude/skills/investigate/SKILL.md` — create

Structured debugging workflow with circuit breaker:
1. Reproduce the bug (run the failing code/test)
2. State ONE hypothesis clearly
3. Test it (add logging, write minimal test, or inspect state)
4. If it fails: record what was ruled out, form next hypothesis
5. After 3 failed hypotheses: STOP. Present findings table to user:
   | # | Hypothesis | Test | Result |
   |---|---|---|---|
   | 1 | ... | ... | Ruled out because... |
   | 2 | ... | ... | Ruled out because... |
   | 3 | ... | ... | Ruled out because... |
6. Ask user which direction to pursue before continuing
7. Never explore without testing, never test without a clear hypothesis

---

---

## Phase 2: Dae Character Integration + File Organization (DEFERRED)

**Status:** Waiting on additional Dae materials from user. Will be planned after CC setup items 1-12 are implemented.

**Known scope:**
- Integrate Dae (Neciridae) as character #13 using files from `dae_docs_v3.zip`
- User has additional files to share beyond the zip
- Reorganize `docs/characters/` folder structure
- Possibly rename files/folders for better organization
- Archetype: Kuudere/Erodere hybrid (pending user confirmation after sharing more info)

**Reference files read:**
- `dae_psychological_model_v2_1.md` — full behavioral blueprint, state machine, scenario table
- `dae_docs_v3.zip` — 6 files: blueprint, appearance, config JSON, image prompts, bible patch, integration checklist
- `neciridae_deviant_journal_quizzes.md` — personality synthesis (read in prior session)

---

## Verification (CC Setup — Items 1-12)

After all 12 items are implemented:
1. Push 46 local commits to origin: `git push origin master`
2. Run `/smoke-test` to verify both backend and frontend checks work
3. Edit a `.py` file — confirm py_compile hook fires with `.venv/bin/python`
4. Edit a `.tsx` file — confirm tsc hook fires against `tsconfig.app.json`
5. Run `/go` and verify it reads context + finds next task without entering plan mode
6. Run `/dashboard` and verify it shows project status
7. Verify `CURRENT_STATUS.md` exists after session (SessionEnd hook)
8. Verify shell aliases work: `which cc-batch` after sourcing `.zshrc`
9. Verify `git log --oneline -5` shows implementation commits
