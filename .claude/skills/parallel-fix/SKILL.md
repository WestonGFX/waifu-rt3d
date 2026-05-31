---
name: parallel-fix
description: Fix multiple independent issues simultaneously using parallel agents. Give it a list of bugs/tasks and it dispatches one agent per fix.
---

# Parallel Fix — Multi-Agent Bug Swarm

Fix N independent issues simultaneously by dispatching one agent per issue.

## Usage

`/parallel-fix` then describe the issues, OR provide a list like:
- Fix the TypeScript error in SettingsPanel.tsx
- Add missing null check in server.py line 450
- Update the API response type in types.ts

## Steps

1. **Parse the issue list** from the user's message. Each issue should be independent (no shared state).

2. **For each issue**, launch an Agent tool call with `subagent_type: "general-purpose"` and `isolation: "worktree"`:
   - Include the specific file path and issue description
   - Tell the agent to: read the file, fix the issue, run relevant tests, and report what changed
   - All agents launch in a SINGLE message (parallel execution)

3. **Collect results** from all agents. For each:
   - What file was changed
   - What the fix was
   - Whether tests pass

4. **Report a summary table:**

   | # | Issue | File | Fix | Tests |
   |---|-------|------|-----|-------|
   | 1 | TS error | SettingsPanel.tsx | Added null check | PASS |
   | 2 | Missing check | server.py:450 | Guard clause | PASS |

5. If any agent's fix conflicts with another, flag it and ask the user how to resolve.

## Escalation — Flat Swarm vs Agent Team

Pick the shape by issue count:

| Count | Shape | How |
|-------|-------|-----|
| 1 | Just fix it | No agents. Main Claude edits directly. |
| 2–8 | **Flat swarm** | One worktree agent per issue, single parallel message (the steps above). |
| 9+ | **Agent team** | Don't raw-fan-out. Build a structured team via the `Workflow` tool — needs explicit user opt-in (the word "workflow" or a direct ask). |

**Why a team past 8:** a flat swarm has no coordinator, no verification pass, and no conflict resolution — it just fixes and hopes. At scale that breaks. An agent team adds roles:
- **Fix agents** (one per issue, worktree-isolated) — same as the swarm.
- **Verify agents** — adversarially re-check each fix actually resolves the issue + passes tests, before merge.
- **Synthesizer** — dedup overlapping edits, flag cross-issue conflicts, merge in dependency order, run the full smoke suite once at the end.

Encode it as a `pipeline()`: `fix → verify → merge`, so each issue verifies as soon as its fix lands (no barrier). Batch fix agents to the 8-concurrency cap; the queue drains automatically.

## Rules
- Maximum 8 concurrent fix agents (2–8 = flat swarm; 9+ = team mode, batched to 8 at a time)
- Each agent runs in a worktree for isolation
- If issues are NOT independent (they touch the same function), run them sequentially instead
- Always run smoke tests after merging fixes back
- Team mode (`Workflow`) requires explicit user opt-in per the harness rules — if 9+ issues arrive without it, ask once before launching
