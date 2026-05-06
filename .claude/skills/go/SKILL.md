---
name: go
description: Auto-continue implementation. Reads plans (or drafts one via plan mode if missing), picks the right execution strategy per task (sequential main-Claude vs MoE parallel agents) based on task shape, commits after each task, keeps going without asking.
user_invocable: true
---

# Auto-Continue with Strategy Selection

Resume work from `CURRENT_STATUS.md`, `MEMORY.md`, or the most recent plan file in `docs/plans/`, and execute tasks using whichever strategy fits the work — sequential (main Claude) for small/integration-heavy/exploratory tasks, MoE parallel agents for cleanly partitionable independent work. Reports at milestones but never stops to ask mid-task.

**If no plan file covers the requested work**, enter plan mode FIRST (Phase 0 below) to draft + save one to `docs/plans/YYYY-MM-DD-feature-name.md`, then resume normal /go execution against the new plan. /go is execution-focused but self-bootstrapping when there's nothing to execute.

**MoE is not the default. Strategy is chosen per task.** Subagents cost ~20–80k tokens of context overhead each + serialize through one return message, so they only win when (a) work is genuinely independent across files AND (b) each leaf has a clear spec. For 1–3 file tasks, integration wiring, debugging, exploratory refactors, or anything touching this repo's known sensitive areas (avatar grounding, themes, column resize, context providers, Pydantic↔TS boundary) — main Claude is faster, cheaper, and safer.

## Flags
- `--single` or `--single <task-id>`: Implement ONLY one task, then STOP.
- `--dry`: Show what would be done without executing. Lists planned strategy + dispatches.
- `--sprint`: Force maximum parallelism — dispatch up to 8 agents for all independent work. Skips Phase 2.5 strategy selection.
- `--preset=sprint`: 3-agent parallel preset — backend + frontend + docs. Use when the task has clean backend/frontend split and needs synchronized delivery. Backend agent owns `backend/`, frontend agent owns `frontends/sakura/src/`, docs agent runs after both complete. Each commits independently. (Absorbed from the former standalone `/sprint` skill.)
- `--seq`: Force sequential mode — main Claude does everything, no subagents. Skips Phase 2.5. Use when token-budget conscious or task is exploratory.
- `--ask`: Force Phase 2.5 to surface the strategy choice via `AskUserQuestion` even when the heuristics would auto-pick.

## Expert Roster

Read the agent profiles in `.claude/agents/` for full details. Summary:

| Agent | Role | Use For |
|-------|------|---------|
| `codebase-analyst` | Read-only intelligence | Understanding impact before building |
| `senior-dev` | Python + React implementation | Backend modules, API endpoints, frontend components |
| `ux-architect` | UI/UX components | Overlays, panels, theme-aware styling |
| `schema-architect` | Database layer | SQLite migrations, preflight.py, data modeling |
| `qa-hunter` | Backend testing & validation | pytest tests, edge cases, regression checks |
| `frontend-tester` | Frontend testing | Vitest + RTL tests for Sakura components/stores/hooks |
| `regression-guard` | Repeat-fix regression tests | After any fix commit in an area that's been fixed before |
| `prd-writer` | Formal feature specification | Dual-audience Why/How PRDs |
| `advisor` | Strategy + lightweight PRDs | Design critique, risk flagging, 1-page PRDs |

Note: Main-session Claude (this agent) IS the orchestrator during /go execution. No separate orchestrator agent — coordination, integration, and wave-ordering happen in-session. Agent dispatches are leaf workers, not coordinators.

## Phase 0: Plan-File Bootstrap (skip if a plan exists)

**Before Phase 1**, decide: does an existing plan file cover the requested work?

- Check `docs/plans/` for a file matching the user's ask (most recent first, or by name match). Also check `CURRENT_STATUS.md` "Active Work" section for an in-progress thread.
- If found → skip Phase 0, proceed to Phase 1.
- If not found AND the work is non-trivial (net-new feature, refactor, cross-cutting change touching 2+ files) → **enter plan mode** (`EnterPlanMode`), draft a plan covering scope/phases/file ownership/risks, surface forks via `AskUserQuestion` if any exist, then `ExitPlanMode` to present the plan to the user. After the user approves and plan mode exits (Write tool isn't available inside plan mode), save the plan to `docs/plans/YYYY-MM-DD-feature-name.md` (per the project Plan Hygiene rule — no auto-numbered NNN names) using the Write tool, then proceed to Phase 1 against the saved plan.
- If not found AND the work is trivial (single-file edit < 50 LOC, obvious bug fix) → skip plan mode, proceed directly to Phase 3 sequential dispatch.

This restores plan mode as a tool /go can use when bootstrapping. The old "NEVER plan mode" rule was scoped wrong — it meant "don't re-plan when a plan exists", not "never plan." During plan-file bootstrap, planning IS the work.

## Phase 1: Context Gathering (Max 3 Tool Calls)

Launch ALL of these in parallel in a single message:

1. Read `CURRENT_STATUS.md` (primary) + `MEMORY.md` (fallback) + most recent plan file in `docs/plans/`
2. Run `git status && git log --oneline -5`
3. Run `.venv/bin/python -m pytest backend/tests/ -q --tb=line 2>&1 | tail -3 && echo "---" && cd frontends/sakura && npx tsc --project tsconfig.app.json --noEmit 2>&1 | tail -3`

**If context takes more than 3 tool calls, you're stalling. Start coding.**

## Phase 2: Task Decomposition

Read the plan and decompose remaining tasks into agent assignments:

### Classification Matrix

| Task Type | Agent(s) | Parallel? |
|-----------|----------|-----------|
| New Python module | `senior-dev` | Yes (independent file) |
| New React component | `ux-architect` or `senior-dev` | Yes (independent file) |
| New hook file | `senior-dev` | Yes (independent file) |
| New backend test file | `qa-hunter` | Yes (independent file) |
| New frontend test file | `frontend-tester` | Yes (independent file) |
| DB migration | `schema-architect` | Yes (if no other agent touches preflight.py) |
| API endpoints in server.py | `senior-dev` | No — shared file, do yourself or single agent |
| App.tsx / store wiring | Self (orchestrator) | No — integration point |
| viewer.html handlers | `senior-dev` | No — shared file, single agent |
| Pydantic response model + api.ts mirror | Self | No — cross-language drift point |

### Independence Check
Before dispatching parallel agents, verify NO two agents touch the same file:
```
✅ Agent A creates backend/gallery/manager.py + Agent B creates frontends/sakura/src/components/Gallery.tsx
❌ Agent A modifies server.py + Agent B modifies server.py
```

## Phase 2.5: Strategy Selection (THINK BEFORE DISPATCHING)

**Stop. Before any Agent tool call, decide the execution strategy.** MoE parallel is one option, not the default. Subagents cost real tokens (~20–80k context overhead each) and add latency on the return path; they only pay back when the leaf work is genuinely independent and clearly specified.

### Step 1 — Score the next task on these axes

| Signal | Sequential better | MoE parallel better |
|---|---|---|
| **File count** | 1–3 files | 4+ truly independent files |
| **Total LOC est.** | < 300 lines | > 500 lines |
| **Spec clarity** | Vague / exploratory / "figure out" | Each file has clear pattern + interface |
| **File overlap** | Heavy shared-file edits (server.py, App.tsx, stores, viewer.html) | Clean partition — no two leaves touch same file |
| **Cross-file pattern matching** | Required (refactor, debug, multi-file invariant) | Not required (each file stands alone) |
| **Iteration likelihood** | High (exploring, prototyping) | Low (spec is final) |
| **Integration weight** | Mostly integration | Mostly leaf creation |
| **Sensitive area touched?** (waifu-specific) | Avatar grounding, themes, column resize, context providers, Pydantic↔TS — pulls sequential. Those areas have regressed 10+ times; parallel edits make it worse. | Wholly outside sensitive areas |
| **Token sensitivity** | User flagged token budget concern this session | Fresh budget, throughput priority |

### Step 2 — Auto-pick when one strategy clearly wins

| Decision | Pick |
|---|---|
| 4+ rows favor sequential | **Sequential** — main Claude does it. State the choice in 1 line, proceed to Phase 3-seq. |
| 4+ rows favor parallel + zero file-ownership conflicts + zero sensitive areas | **MoE parallel** — proceed to Phase 3-MoE. State the choice in 1 line. |
| Mixed (2–3 each side, OR partition unclear, OR ambiguity in spec, OR sensitive area touched) | **Ask** — Phase 2.5 Step 3. |
| `--seq` flag | Sequential, no questions. |
| `--sprint` flag | MoE parallel, no questions. |
| `--ask` flag | Always ask, even if heuristics auto-pick. |

### Step 3 — Ambiguous? Use AskUserQuestion

When auto-pick can't resolve cleanly, surface the choice via the **AskUserQuestion** tool. This is the ONE place /go is allowed to ask the user — pick once at task start, then execute without further interruption. Format:

```
question: "How should I execute [task name from plan]?"
options:
  - label: "Sequential (main Claude)"
    description: "[N] files, ~[LOC] lines, [reason sequential might fit]. Saves ~[Xk] tokens vs parallel. Recommended when: [specific signals matched]."
  - label: "MoE parallel ([N] agents)"
    description: "Dispatch [agent A], [agent B], [agent C] — each owns [files]. Faster wall-clock if leaves are clean. Recommended when: [specific signals matched]."
  - label: "Hybrid"
    description: "I do [integration / shared files / exploratory part], dispatch [N] agents for [the clean leaves]."
  - label: "Skip — defer task"
    description: "Move to next task in plan instead."
```

Mark one option `(Recommended)` based on heuristic lean. **Multiple AskUserQuestion calls per task are fine** when a task contains more than one genuine fork — don't cram unrelated decisions into one question, don't spam either. Soft cap: ≤3 strategic questions per task before just picking and proceeding. After a fork is answered, don't re-ask the same fork in the same task.

### Step 4 — Preference forks: ALWAYS ask before locking in code

Independent of the strategy choice above. Whenever the next sub-task involves a **user-preference decision** that will be baked into code, config, copy, or docs, surface it via `AskUserQuestion` BEFORE writing — even mid-task, even if you already asked a strategy question earlier. These are not "should I continue?" interruptions; they're preference forks where no option is objectively correct and the user has taste.

Trigger categories (any of):
- Visual / layout / spacing / padding / divider / color choices
- Theme palette picks (waifu has 18 themes — when adding a new color slot, ask for the values, don't guess)
- Naming conventions when the project has no precedent for this thing
- Verbosity / tone of generated copy, error messages, comments, commit messages
- Workflow choices baked into config (auto-trigger vs manual, default flag values, hook firing conditions)
- Structural choices with no objectively-best answer (composed vs flat, co-located tests vs `frontends/sakura/src/test/`, file grouping by domain vs by layer)
- Default thresholds, intervals, or magic numbers that affect feel (animation durations, debounce ms, scroll snap distance, XP curves, mood decay rates)
- Anything where a reviewer would say "this is taste, not correctness"

Format: 2–4 concrete options, mark one `(Recommended)`, use the `preview` field for visual/layout options so the user sees side-by-side. Mention swap-by-one-line tunables (CSS var, config flag) when applicable so the user knows the choice is reversible.

Skip the ask only if:
- User stated a preference for this exact decision earlier this session
- CLAUDE.md / memory / a recent commit message has the preference recorded
- The choice sits behind a tunable the user can flip in one line — pick a reasonable default and call out the tunable in the report
- The decision is objectively determined by an existing pattern in the codebase (matching what's already there isn't a preference, it's consistency)

### Step 5 — Hybrid pattern

Many real tasks split cleanly: **shared/integration work + a few independent leaves.** Default hybrid recipe:

1. Main Claude handles: server.py endpoint registration, App.tsx wiring, store extensions (appStore/chatStore/viewerStore/wizardStore), prompt assembly, settings registration, anything in a sensitive area, anything < 100 lines.
2. Dispatch 1–3 agents in parallel only for clean leaves (new isolated files with clear specs).
3. No more than 3 leaf agents in hybrid — if you'd want 4+, the task is parallel-mode, not hybrid.

This is often the right answer when the heuristic is mixed.

### Token budget rule of thumb

Approximate cost per dispatched agent (round-trip): 20k (haiku) / 40k (sonnet) / 80k (opus) tokens. Sequential equivalent: ~½ of that for the same code change since main Claude already has the context cached. **If you'd dispatch 1 agent for < 200 LOC of work, you're losing on tokens — do it yourself.**

## Phase 3: Agent Dispatch

### Model Routing — Match Claude Model to Task Complexity

Specialized agents (senior-dev, ux-architect, qa-hunter, etc.) keep their roles, personas, and custom instructions unchanged. The `model` parameter on the Agent tool call controls which Claude model **powers** that agent for a specific task.

**Same agent, different engine depending on the task:**

| Task Complexity | Model | Prompt Style | Example |
|----------------|-------|-------------|---------|
| **Clear spec** — exact files, patterns, line numbers given | `model: "sonnet"` | Prescriptive | `senior-dev`: "Create `backend/gallery/manager.py` with these 3 functions, follow the pattern in `backend/mood/engine.py`" |
| **Guided** — goals + constraints, agent finds approach | `model: "sonnet"` | Goal-oriented | `ux-architect`: "Add a collapse toggle to the right panel in ChatPanel, persist to appStore" |
| **Ambiguous** — agent must explore, decide, and build | Default (Opus) | High-autonomy | `senior-dev`: "Refactor context_assembler to support dynamic section priorities" |
| **Research** — reading, summarizing, analyzing | `model: "sonnet"` | What to find + where | `codebase-analyst`: "Map all files that import appStore and what they use from it" |
| **Trivial** — number changes, 2-line fixes | `model: "haiku"` | Exact diff | `senior-dev`: "Change `0.4` to `0.32` on line 71 of chatStore.ts" |

**Decision flow per dispatched agent:**
1. Can I describe the exact change (line numbers, old→new)? → **Haiku**
2. Can I describe the goal + files + pattern to follow? → **Sonnet**
3. Does the agent need to explore, reason about tradeoffs, or touch large shared files? → **Opus** (default)

**Integration wiring** (server.py, App.tsx, stores, viewer.html, Pydantic↔TS mirroring) is always done by self (orchestrator at Opus) — never delegated, regardless of model.

### Dispatch up to 8 agents in a single message

For each agent, provide in the prompt:
1. **Task**: What to build (copy from plan)
2. **Files**: Exact paths to create or modify
3. **Pattern**: "Follow the pattern in [existing file]"
4. **Verify**: "Run pytest + tsc when done"
5. **Boundaries**: "Do NOT modify files outside [scope]"
6. **Model**: Set `model: "sonnet"` for scoped tasks (default for subagents)

### Dispatch Playbook

**Small task (1-2 files)**: Do it yourself. Don't waste agent overhead.

**Medium task (3-6 independent files)**:
```
Dispatch 3-4 agents in parallel:
  senior-dev → backend module + types
  ux-architect → UI component
  qa-hunter → backend tests
  frontend-tester → frontend tests (if a new component or store)
Then: wire integration yourself (server.py, App.tsx, stores)
```

**Large task (7+ files, clear phases)**:
```
Wave 1 (parallel, up to 5 agents):
  codebase-analyst → impact report (background)
  senior-dev A → backend module
  senior-dev B → frontend hook/util
  ux-architect → overlay component
  schema-architect → DB migration

Wave 2 (parallel, up to 4 agents):
  senior-dev C → API endpoints (server.py — single agent only)
  ux-architect B → second UI component
  qa-hunter A → backend tests
  frontend-tester → frontend tests

Wave 3 (sequential, self):
  Integration: App.tsx, appStore, viewerStore, keyboard shortcuts,
  Pydantic→TS api.ts mirror

Wave 4 (parallel, 2 agents):
  qa-hunter → full regression check
  ux-architect → theme consistency review across 18 themes
```

**Feature from scratch (PRD → implementation)**:
```
Step 1: prd-writer → create PRD (if none exists)
Step 2: codebase-analyst → map existing code to reuse
Step 3: Execute waves 1-4 above using the PRD as the plan
```

### File Ownership Declaration (MANDATORY for parallel dispatch)

Every parallel agent prompt MUST include an ownership block:

```
OWNS: [files this agent may create or modify — exclusive]
READS: [files this agent may read but NOT modify]
```

Before dispatching, verify:
- No file appears in OWNS for more than one agent
- Shared integration files (server.py, App.tsx, stores, viewer.html) are listed as READS only
- After all agents complete, handle SHARED files yourself sequentially

If you cannot cleanly partition file ownership, reduce parallelism — run conflicting agents sequentially instead.

## Phase 4: Per-Task Verification

After each agent batch:
1. `.venv/bin/python -m pytest backend/tests/ -q --tb=line` — must pass
2. `cd frontends/sakura && npx tsc --project tsconfig.app.json --noEmit` — must be clean
3. If both pass → commit (one commit per logical unit, not per agent)
4. If either fails → fix before continuing

### Self-Healing Mode (default behavior)

When tests fail after an agent batch:
1. Read the failing test output carefully
2. Diagnose the root cause (don't guess — read the code)
3. Fix the issue yourself (don't re-dispatch an agent for small fixes)
4. Re-run tests
5. Repeat up to 3 times per failure

If 3 consecutive fix attempts fail on the same issue:
- Write a diagnosis to a `BLOCKED.md` note (file path, error, what was tried)
- Skip the failing area and continue with independent tasks
- Report the blocker at the next milestone

**Never ask the user for help with test failures** unless explicitly stuck after 3 attempts (the hypothesis limit applies here too).

### Phase-End Gates (advisory mid-session, MANDATORY before session-end "done" claim)

Before advancing from one numbered plan phase to the next, run these gates. Gates are **advisory** during same-session iteration (don't block flow on every small edit) but **MANDATORY** before any session-end claim of "this phase is done."

1. **Relevant test subset** — run pytest + tsc on the slice that phase touched. Paste the tail of the output with pass/fail counts. "It probably passes" is not evidence.
2. **Service liveness** — if the phase started or restarted a dev service, invoke `/verify-servers` and confirm its probe table shows OK for every expected service. Catches the "server bound the port but handler is 500-ing silently" class of bug that has bitten us before (ABI mismatch session, auth 401 session).
3. **Plan status line** — append ONE line to the bottom of the plan file (never rewrite existing content, never reorder phases). Format: `- YYYY-MM-DD Phase N: ✓ <short note>` on success, `- YYYY-MM-DD Phase N: ✗ <reason>` on failure. Next session inherits a breadcrumb trail without re-reading the whole plan.
4. **Gate failure handling** — if ANY gate fails, STOP. Produce a failure table (gate name, expected, actual, probable cause) and wait for user direction. Do NOT loop into a 4th-hypothesis spiral (see Hypothesis Limit in project CLAUDE.md).

**Why gates are advisory mid-session:** Running a full test sweep after every small edit wastes context and time when you're still iterating within a single feature. But the session-end "done" claim is a contract with the user — violating it erodes trust. So gates harden from advisory to mandatory at the session boundary.

**Session-end checklist (before any /handoff or /checkpoint):**
- [ ] Full `pytest backend/tests/ -q` pass, tail cited
- [ ] Full `tsc --noEmit` clean, 0 errors cited
- [ ] `/verify-servers` OK for every service the session started
- [ ] Plan file has status line for each phase attempted

## Phase 5: Integration (Always Sequential)

Integration tasks touch shared files — NEVER parallelize these:
- `backend/server.py` — API endpoint registration
- `frontends/sakura/src/App.tsx` — overlay rendering, imports
- `frontends/sakura/src/stores/appStore.ts` — Overlay type, state
- `frontends/sakura/src/stores/viewerStore.ts` — ViewerCommand kinds
- `frontends/shared/viewer/viewer.html` — postMessage handlers
- `frontends/sakura/src/lib/api.ts` — TypeScript mirror of any Pydantic response model touched by this task

**Pydantic↔TypeScript drift trap:** Adding or changing a FastAPI response model on the backend without updating `api.ts` produces runtime-only failures TSC won't catch (the old narrower TS type is still technically valid). Treat the api.ts mirror as part of the backend change, not a follow-up. Search `api.ts` and adjacent tests in the same edit pass that touches any Pydantic model.

**Context-provider expansion gotcha:** When this task adds a new context provider (SettingsContext, CharacterProvider, or any other) or expands an existing one, every test file that mounts a consumer breaks silently. Update all affected test files in the same commit that adds the provider — search `frontends/sakura/src/test/` for every file importing from the provider path.

Do all of these yourself after all independent work lands.

## Phase 6: Continue or Report

**Default: keep going.** Move to next task. Repeat phases 2.5–5 (re-select strategy per task — small follow-ups often want sequential even if the prior task ran MoE).

**Report at these milestones** (brief, 3-5 lines max):
- After a parallel agent batch completes
- After completing a numbered phase in the plan
- When switching from independent work to integration
- When the entire plan is complete

**Format**:
```
--- Milestone: [Phase N complete] ---
Strategy: [Sequential / MoE / Hybrid] (reason: [1 line])
Agents dispatched: 4 (senior-dev ×2, ux-architect ×1, qa-hunter ×1)
Files created: backend/feature/module.py, components/Panel.tsx, test_feature.py
Tests: 302 → 318 (+16)
Next: Integration wiring into server.py + App.tsx
---
```

**Push gate (before any `git push` or `gh pr` action):** scan `docs/SESSION_HANDOFF.md` and `CURRENT_STATUS.md` for `OPEN BUG`, `UNFIXED`, or `⚠ BLOCKER` markers that are NOT wrapped in `~~strikethrough~~`. If any are active, STOP and ask the user before pushing — see project CLAUDE.md "Push & PR Discipline" for the full rule. Local commits are fine; the line is at externally-visible publication.

**Never**:
- Ask "should I continue?" between tasks
- Summarize what you're about to do (just do it)
- Report on individual sub-tasks within a phase

## Hard Rules

- **Plan mode is conditional, not banned.** Skip plan mode if a `docs/plans/YYYY-MM-DD-*.md` file already covers the work — read it and execute. Enter plan mode in Phase 0 ONLY when no plan file exists for non-trivial work, draft + save the plan, then exit plan mode and execute. The old "NEVER plan mode" hard rule was scoped wrong (it meant "don't re-plan when a plan exists") and discouraged a real Claude Code feature; this replaces it.
- **NEVER batch commits.** One commit per completed sub-task or agent wave.
- **NEVER rewrite plan files.** Read them, append phase status lines, never reorder or delete prior content.
- **NEVER ask "should I continue?"** Just keep going. Strategy + preference forks (Phase 2.5 Steps 3 + 4) are NOT this — those are explicitly allowed.
- **NEVER dispatch agents that touch the same file in parallel.**
- **NEVER auto-pick MoE for tasks under 300 LOC / 3 files.** That's sequential by default.
- **NEVER auto-pick MoE when a sensitive area is touched.** Avatar grounding, themes, column resize, context providers, Pydantic↔TS boundary — those areas have regressed 10+ times and parallel edits compound the problem. Force `--ask` or sequential.
- **NEVER invoke `/qa-sweep` inside `/go`.** pytest + tsc after each wave is sufficient. User explicitly vetoed mid-flow full sweeps — friction too high for their workflow.
- **NEVER add Co-Authored-By tags** to commits or PRs. Project rule, all repos.
- **ALWAYS run Phase 2.5 before Phase 3.** Even on familiar work — re-score per task, don't carry the prior task's strategy.
- **ALWAYS ask preference forks via `AskUserQuestion` BEFORE writing the code** that bakes them in (visual, naming, tone, default thresholds, structural taste calls). Skip only if a prior preference is documented in CLAUDE.md / memory / this session, or the choice sits behind a one-line tunable.
- **ALWAYS read the plan file first.** It's the source of truth.
- **ALWAYS run pytest + tsc before committing.**
- **ALWAYS run `/checkpoint` between waves** (not between tasks). One checkpoint per completed wave keeps `CURRENT_STATUS.md` fresh for mid-session crash recovery without inflating token cost.
- **ALWAYS do integration wiring yourself** (server.py, App.tsx, stores, viewer.html, Pydantic↔TS api.ts mirror).
- **ALWAYS scan the push gate** before any externally-visible publication (`git push`, `gh pr create`, `gh pr merge`).
- **MAX 8 parallel agents** per dispatch.
- **Prefer 4-5 focused agents over 8 vague ones.** Quality > quantity.
- **Soft cap ≤3 strategic AskUserQuestion calls per task.** Multiple forks per task are fine; spam isn't. Group related questions, separate genuinely different decisions.
- If you catch yourself typing "Let me create a plan..." outside Phase 0 — STOP. Write code instead.

## Error Recovery

| Problem | Action |
|---------|--------|
| Agent returns errors | Read the error, fix it yourself, commit |
| Type check fails after merge | Fix type errors yourself — agents may not see cross-file dependencies |
| Tests regress | Run failing test in isolation, fix regression, commit |
| No plan file exists | Phase 0 — enter plan mode, draft + save, then execute. Or check `MEMORY.md` "NEXT SESSION TASKS" for a trivial pickup. |
| Agent conflict on same file | Should never happen (independence check). If it does: take the more complete version, manually merge the other |
| Agent produces wrong pattern | Re-dispatch with more specific instructions including a pattern reference file |
| Pydantic response model changed but tests pass | Search `frontends/sakura/src/lib/api.ts` for the response shape — TSC won't catch a stale narrower mirror. Add or update the mirror in the same commit. |
| Test mock breaks after a context provider change | Search `frontends/sakura/src/test/` for every file mounting a consumer of the provider — update all affected test files in the same commit. |
