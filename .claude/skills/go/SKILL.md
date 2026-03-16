---
name: go
description: Auto-continue implementation using MoE agent system. Reads plans, dispatches up to 8 specialized agents in parallel, commits after each task, keeps going without asking.
user_invocable: true
---

# Auto-Continue with Mixture-of-Experts

Resume work from plan files or MEMORY.md and execute tasks using specialized agents for maximum throughput. Reports at milestones but never stops to ask permission.

## Flags
- `--single` or `--single <task-id>`: Implement ONLY one task, then STOP.
- `--dry`: Show what would be done without executing. Lists planned agent dispatches.
- `--sprint`: Maximum parallelism — dispatch up to 8 agents for all independent work.

## Expert Roster

Read the agent profiles in `.claude/agents/` for full details. Summary:

| Agent | Role | Use For |
|-------|------|---------|
| `codebase-analyst` | Read-only intelligence | Understanding impact before building |
| `senior-dev` | Python + React implementation | Backend modules, API endpoints, frontend components |
| `ux-architect` | UI/UX components | Overlays, panels, theme-aware styling |
| `schema-architect` | Database layer | SQLite migrations, preflight.py, data modeling |
| `qa-hunter` | Testing & validation | pytest tests, edge cases, regression checks |
| `prd-writer` | Feature specification | PRDs in Why/How dual-audience format |
| `orchestrator` | Multi-agent coordination | Complex features needing decomposition |

## Phase 1: Context Gathering (Max 3 Tool Calls)

Launch ALL of these in parallel in a single message:

1. Read `CURRENT_STATUS.md` (primary) + `MEMORY.md` (fallback) + most recent plan file in `.claude/plans/`
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
| New test file | `qa-hunter` | Yes (independent file) |
| DB migration | `schema-architect` | Yes (if no other agent touches preflight.py) |
| API endpoints in server.py | `senior-dev` | No — shared file, do yourself or single agent |
| App.tsx / store wiring | Self (orchestrator) | No — integration point |
| viewer.html handlers | `senior-dev` | No — shared file, single agent |

### Independence Check
Before dispatching parallel agents, verify NO two agents touch the same file:
```
✅ Agent A creates backend/gallery/manager.py + Agent B creates frontends/sakura/src/components/Gallery.tsx
❌ Agent A modifies server.py + Agent B modifies server.py
```

## Phase 3: Agent Dispatch

### Dispatch up to 8 agents in a single message

For each agent, provide in the prompt:
1. **Task**: What to build (copy from plan)
2. **Files**: Exact paths to create or modify
3. **Pattern**: "Follow the pattern in [existing file]"
4. **Verify**: "Run pytest + tsc when done"
5. **Boundaries**: "Do NOT modify files outside [scope]"

### Dispatch Playbook

**Small task (1-2 files)**: Do it yourself. Don't waste agent overhead.

**Medium task (3-6 independent files)**:
```
Dispatch 3-4 agents in parallel:
  senior-dev → backend module + types
  ux-architect → UI component
  qa-hunter → tests
Then: wire integration yourself (App.tsx, server.py, stores)
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
  qa-hunter B → migration tests

Wave 3 (sequential, self):
  Integration: App.tsx, appStore, viewerStore, keyboard shortcuts

Wave 4 (parallel, 2 agents):
  qa-hunter → full regression check
  ux-architect → theme consistency review
```

**Feature from scratch (PRD → implementation)**:
```
Step 1: prd-writer → create PRD (if none exists)
Step 2: codebase-analyst → map existing code to reuse
Step 3: Execute waves 1-4 above using the PRD as the plan
```

## Phase 4: Per-Task Verification

After each agent batch:
1. `.venv/bin/python -m pytest backend/tests/ -q --tb=line` — must pass
2. `cd frontends/sakura && npx tsc --project tsconfig.app.json --noEmit` — must be clean
3. If both pass → commit (one commit per logical unit, not per agent)
4. If either fails → fix before continuing

## Phase 5: Integration (Always Sequential)

Integration tasks touch shared files — NEVER parallelize these:
- `backend/server.py` — API endpoint registration
- `frontends/sakura/src/App.tsx` — overlay rendering, imports
- `frontends/sakura/src/stores/appStore.ts` — Overlay type, state
- `frontends/sakura/src/stores/viewerStore.ts` — ViewerCommand kinds
- `frontends/shared/viewer/viewer.html` — postMessage handlers

Do these yourself after all independent work lands.

## Phase 6: Continue or Report

**Default: keep going.** Move to next task. Repeat phases 3-5.

**Report at these milestones** (brief, 3-5 lines max):
- After a parallel agent batch completes
- After completing a numbered phase in the plan
- When switching from independent work to integration
- When the entire plan is complete

**Format**:
```
--- Milestone: [Phase N complete] ---
Agents dispatched: 4 (senior-dev ×2, ux-architect ×1, qa-hunter ×1)
Files created: backend/feature/module.py, components/Panel.tsx, test_feature.py
Tests: 302 → 318 (+16)
Next: Integration wiring into server.py + App.tsx
---
```

**Never**:
- Ask "should I continue?" between tasks
- Summarize what you're about to do (just do it)
- Report on individual sub-tasks within a phase

## Hard Rules

- **NEVER enter plan mode.** Implement directly.
- **NEVER batch commits.** One commit per completed sub-task or agent wave.
- **NEVER rewrite plan files.** Read them, execute them.
- **NEVER ask "should I continue?"** Just keep going.
- **NEVER dispatch agents that touch the same file in parallel.**
- **ALWAYS read the plan file first.** It's the source of truth.
- **ALWAYS run pytest + tsc before committing.**
- **ALWAYS do integration wiring yourself** (server.py, App.tsx, stores).
- **MAX 8 parallel agents** per dispatch.
- **Prefer 4-5 focused agents over 8 vague ones.** Quality > quantity.
- If you catch yourself typing "Let me create a plan..." — STOP. Write code instead.

## Error Recovery

| Problem | Action |
|---------|--------|
| Agent returns errors | Read the error, fix it yourself, commit |
| Type check fails after merge | Fix type errors yourself — agents may not see cross-file dependencies |
| Tests regress | Run failing test in isolation, fix regression, commit |
| No plan file exists | Check MEMORY.md "NEXT SESSION TASKS" → pick next item → implement directly |
| Agent conflict on same file | Should never happen (independence check). If it does: take the more complete version, manually merge the other |
| Agent produces wrong pattern | Re-dispatch with more specific instructions including a pattern reference file |
