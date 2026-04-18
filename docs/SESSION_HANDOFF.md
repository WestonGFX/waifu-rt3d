# Session Handoff — 2026-04-18

## Branch: master
## Test Status: 2678 backend passed, 0 failed | TSC: clean (exit 0) | Frontend: 160 passed, 4 pre-existing failures (unchanged from prior handoff)

## Completed This Session (session 14 — Harness Upgrades, Tier 1+2)

Meta-session: upgrades to the dev harness itself, not product features. Executed per `~/.claude/plans/tranquil-percolating-spring.md` Session 14 scope (Tier 1+2). Sessions 15 and 16 remain pending for future work.

### 14.1 — CLAUDE.md verification gates (repo-tracked, commit `0b08397`)
- New `## Verification Before Claiming Success` section — work-type → required-evidence table (curl for servers, pytest tail for tests, rebuild+import for native modules, browser exercise for UI, curl+payload for endpoints, preflight+pytest for migrations, hook-trigger+side-effect for hooks). Failure-modes subsection cites ABI-mismatch and auth-401 incidents.
- New `## Agent Dispatch Policy` section — when to parallelize (3+ independent features), qa-hunter for boundary/numeric work, contract-broker preview for session 15, upstream-agent MUST print contract at top of report.
- `## Known Sensitive Areas` expanded with 2 chronic-regression callouts: context-provider mock drift (new providers silently break test files); Pydantic↔TS type drift (TSC cannot catch wider response shapes).

### 14.2 — PostToolUse Biome hook upgrade (repo-tracked — `.claude/settings.json` predates the `.gitignore` entry, still tracked)
- Swapped `npx @biomejs/biome format --write` → `npx @biomejs/biome check --write` in project `.claude/settings.json`.
- `check` runs format + safe-autofix lint rules in one pass. Superset of `format`. Single npx spawn per edit instead of two if we'd stacked a separate `lint --write` hook.
- Plan originally proposed a new global `~/.claude/hooks/biome-autofix.sh` script. Rehomed to repo-local and reduced to a one-word edit per user's "repo-only during this session" scope preference.

### 14.3 — /verify-servers skill (repo-local, no commit)
- New `.claude/skills/verify-servers/SKILL.md`. Invocable as `/verify-servers` — skill is live; verified by presence in runtime skill list during this session.
- Probes: backend `127.0.0.1:8080` (HTML body expected), sakura `127.0.0.1:5175` (module script), dashboard `127.0.0.1:3333/dashboard.html`, viewer `127.0.0.1:5175/shared/viewer/viewer.html` (AnimationDirector string expected).
- Each probe: lsof for PID + curl with 3s timeout + body-content sanity check + log scan for `ImportError`, `Symbol not found`, `NODE_MODULE_VERSION`, `segmentation fault`, `sqlite3.OperationalError`.
- Reports a status table. Never restarts anything. Pairs with `/go` phase gates.

### 14.4 — /go phase gates (repo-tracked — `.claude/skills/go/SKILL.md` was pre-existing, tracked despite `.claude/` gitignore)
- Edited `.claude/skills/go/SKILL.md`. Added `### Phase-End Gates` subsection inside Phase 4 (Per-Task Verification), before Phase 5 (Integration).
- Rule: **advisory during mid-session iteration**, **MANDATORY before any session-end "done" claim**. Gates: relevant test subset + tail, `/verify-servers` if phase started a service, one-line plan-file status append (never rewrite), stop-and-report on gate failure (no 4th hypothesis).
- Also added a "Session-end checklist" (full pytest, full tsc, /verify-servers, plan status lines per phase).

### 14.5 — /qa-sweep chunked mode (repo-tracked — `.claude/skills/qa-sweep/SKILL.md` was pre-existing, tracked despite `.claude/` gitignore)
- Edited `.claude/skills/qa-sweep/SKILL.md`. Existing Phase 1-3 quick-check mode left intact; appended `## Chunked Mode — /qa-sweep --chunked`.
- Chunked workflow: read `docs/testing/test-scenarios.md` or questionnaire JSON → batch 50 cases → run batch → categorize P0/P1/P2 → append findings to `docs/testing/qa-findings-YYYY-MM-DD.md` → **commit the findings file before starting next batch** (context-exhaustion safety net) → repeat.
- P0 auto-fix only after user approval; P1/P2 land as followup task list. Prevents the 400-case context-blowout that happened previously.

### 14.6 — regression-guard agent (repo-local, no commit)
- New `.claude/agents/regression-guard.md`. Read-only on production code; writes only new test files.
- Mines `git log --all --grep='fix'` for repeat-fix patterns (>=2 distinct fix commits on the same keyword). Seed keywords: avatar aspect, aspect ratio, grounding, XP curve, bond curve, tier threshold, row_factory, sqlite row, SettingsContext, column resize, panel collapse, theme color, var(--color, VRM bone, MIXAMO_BONE_MAP, token budget, voice duplex.
- For each gap: reads most recent fix commit, writes locked-in regression test citing all fix-commit hashes in the docstring, commits as `test(regression): lock in <pattern> (fixed Nx since <date>)`. One commit per test.

### 14.7 — Verification (repo-tracked, committed with handoff)
- pytest: 2678 passed, 0 failed (baseline preserved)
- tsc: exit 0, 0 errors, clean
- vitest: 160 passed, 4 failed — all 4 are pre-existing (OnboardingWizard × 1, SettingsView.exportImport × 3), unchanged from 2026-04-16 handoff
- `CURRENT_STATUS.md` bumped: Last updated → 2026-04-18, agent count 11→12, skill count 24→25
- Plan file `~/.claude/plans/tranquil-percolating-spring.md` appended with per-phase status lines (dogfooding 14.4's new rule)

## New Feedback Memory (session 14)

Scope-confusion mid-session produced 3 new behavioral memories for future sessions. All in `~/.claude/projects/-Users-chris-Code-waifu-rt3d/memory/`:

- `feedback_batch_work_prefer_momentum.md` — User prefers momentum over stop-and-ask gates. Batch work, consolidate questions, only halt on genuine blockers.
- `feedback_no_global_config_changes.md` — Default repo-scope; NEVER touch `~/.claude/` (CLAUDE.md, settings.json, hooks, skills, agents) without explicit per-item permission. Revert any accidental global edits.
- `feedback_scope_definitions.md` — Use precise vocabulary: "repo-tracked" (in git), "repo-local" (in repo but gitignored), "user-global" (under `~/.claude/`). Don't conflate them.

## Known Issues (pre-existing, unchanged from prior handoff)
- `frontends/sakura/src/test/OnboardingWizard.test.tsx` × 1 failure ("Get started" advance step)
- `frontends/sakura/src/test/SettingsView.exportImport.test.tsx` × 3 failures (export blob, import createCharacter, import missing fields)
- `.codex/` untracked directory — decide to ignore or archive
- `backend/storage/app.db` dirty (runtime state, expected)

## Files Changed

### Repo-tracked — included in the session 14 commits
- `CLAUDE.md` — 14.1 additions (commit `0b08397`)
- `.claude/settings.json` — Biome `format` → `check` swap (14.2). Tracked despite `.gitignore:121` (the file predates the ignore line; new files in `.claude/` are blocked, but pre-existing tracked files stay tracked).
- `.claude/skills/go/SKILL.md` — Phase-End Gates added (14.4). Same deal: pre-existing tracked file.
- `.claude/skills/qa-sweep/SKILL.md` — Chunked Mode appended (14.5). Same deal.
- `CURRENT_STATUS.md` — session 14 block + header bumps (14.7)
- `docs/SESSION_HANDOFF.md` — this file (14.7)

### Repo-local, untracked (new files in `.claude/` are blocked by `.gitignore:121`)
- `.claude/skills/verify-servers/SKILL.md` — new (14.3). On disk, active at runtime, but git refuses to track it.
- `.claude/agents/regression-guard.md` — new (14.6). Same.

**Note for next session:** `.gitignore:121` has a non-obvious quirk. `.claude/` in gitignore blocks *new* files but doesn't retroactively untrack *existing* ones. So about 80% of the automation tree is actually version-controlled — the regression-prone modifications land in git, but new additions (skills, agents) are invisible to it. If you want the session 14 additions to travel across machines, `git add -f .claude/skills/verify-servers/ .claude/agents/regression-guard.md` would force-add them; otherwise they stay local-only. Decision deferred to the user.

## Next Session Priorities

### Option A: Continue tooling track — Session 15 (Tier 3)
Per `~/.claude/plans/tranquil-percolating-spring.md` Session 15 section: self-healing TDD loop, parallel agent swarm with contract-broker, manual `/curate-roadmap` skill. ~8-10hr, medium risk. Only makes sense if user wants more harness investment before product features.

### Option B: Return to product backlog
1. **Memory Browser UI (P5) — ~4hr.** Backend ready in `backend/memory/tiered_memory.py`. Needs React component to list/filter/edit/delete memories by tier (short/medium/long), search, confidence adjustment.
2. **Visual Content in Chat — ~6hr.** "Character sends you a picture" UX. Image gen pipeline exists; needs inline image message type, intent recognition for "send me a pic" requests, optional gallery attach.

### Option C: Pre-existing test cleanup (low priority)
Fix the 4 OnboardingWizard + SettingsView.exportImport failures.

## Context for Next Session

- **Schema v70** is the floor. Next migration = v71.
- **2678 backend tests** is the baseline. 160 frontend tests is the baseline; 4 pre-existing fails remain out of scope.
- **Bond is complete** — don't propose more bond phases. Push Memory Browser or Visual Content if user wants retention work.
- **`/verify-servers` is now available** — use it before claiming "servers running." Especially useful after ABI-risk changes (native module rebuilds, Python/Node version bumps).
- **`/qa-sweep --chunked` is now available** — use for multi-batch Playwright runs to avoid context exhaustion.
- **`regression-guard` agent is now available** — dispatch after every fix commit to lock in a regression test, or run `/checkpoint`-time for a batch audit.
- **Phase-End Gates rule now in `/go`** — advisory mid-session, mandatory at session-end "done" claim. Don't skip the gates even if the user is waiting.
- **No global `~/.claude/` edits** unless user explicitly authorizes the specific item (new rule, saved in memory).
- **Caveman mode was active this session** — toggle with `/caveman` or say "stop caveman".
- **Explanatory output style active** via `outputStyle: "Explanatory"` — agent output includes `★ Insight` blocks.
