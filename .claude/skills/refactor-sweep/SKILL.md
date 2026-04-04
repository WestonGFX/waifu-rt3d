---
name: refactor-sweep
description: Parallel rename/refactor across the codebase — dispatches agents per directory to find-and-replace a symbol, function, or pattern safely.
---

# Refactor Sweep — Parallel Codebase Rename

Safely rename or refactor a symbol across the entire codebase using parallel agents, each handling one directory.

## Usage

`/refactor-sweep oldName newName` or describe the refactor:
- "Rename `fetchConfig` to `loadConfig` everywhere"
- "Change all `var(--color-primary)` to `var(--nova-accent-primary)`"

## Steps

1. **Identify scope**: Use Grep to find all occurrences of the target pattern. Group by directory.

2. **Assess independence**: Files in different directories are usually independent. Files importing from each other need sequential handling.

3. **Dispatch parallel agents** (one per directory group):
   - Each agent gets: the list of files in its directory, the old pattern, the new pattern
   - Agent reads each file, applies the rename using Edit tool, verifies the change compiles
   - Agent reports: files changed, lines modified, any compilation errors

4. **Merge and verify**:
   - Run full TypeScript check: `npx tsc --noEmit`
   - Run backend tests: `pytest backend/tests/ -q`
   - Run Grep again to confirm zero remaining occurrences of the old name

5. **Report:**

   | Directory | Files Changed | Lines Modified | Status |
   |-----------|--------------|----------------|--------|
   | frontend/src/components/ | 4 | 12 | CLEAN |
   | frontend/src/stores/ | 2 | 6 | CLEAN |
   | backend/ | 1 | 3 | CLEAN |

## Rules
- Never rename across a boundary without checking both sides (e.g., API field names need backend + frontend alignment)
- If >20 files are affected, ask the user to confirm before proceeding
- Always check for string literals (API routes, config keys) not just code references
