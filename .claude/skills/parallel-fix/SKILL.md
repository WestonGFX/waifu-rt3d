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

## Rules
- Maximum 5 parallel agents (to avoid overwhelming the system)
- Each agent runs in a worktree for isolation
- If issues are NOT independent (they touch the same function), run them sequentially instead
- Always run smoke tests after merging fixes back
