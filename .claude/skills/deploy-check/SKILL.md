---
name: deploy-check
description: Full pre-merge verification — backend tests, frontend types, bundle sizes, git status. Run before any merge or PR.
---

# Pre-Merge Verification

Run all checks in parallel to validate the codebase is ready for merge.

## Steps

1. **Run all checks in parallel** using the Bash tool:

   **Backend tests:**
   ```bash
   cd /Users/chris/Code/waifu-rt3d && .venv/bin/python -m pytest backend/tests/ -q --tb=line 2>&1 | tail -10
   ```

   **Sakura TypeScript check:**
   ```bash
   cd /Users/chris/Code/waifu-rt3d/frontends/sakura && npx tsc --project tsconfig.app.json --noEmit 2>&1 | tail -10
   ```

   **Nova TypeScript check (if on nova branch):**
   ```bash
   cd /Users/chris/Code/waifu-rt3d/frontends/nova && npx tsc --project tsconfig.app.json --noEmit 2>&1 | tail -10
   ```

   **Vite bundle size check:**
   ```bash
   cd /Users/chris/Code/waifu-rt3d/frontends/sakura && npx vite build --mode production 2>&1 | grep -E 'dist/|chunk|KB|MB' | head -20
   ```

   **Git status:**
   ```bash
   cd /Users/chris/Code/waifu-rt3d && git status --short && echo "---" && git log --oneline -3
   ```

2. **Report results as a table:**

   | Check | Status | Details |
   |-------|--------|---------|
   | Backend tests | PASS/FAIL | N passed, N failed |
   | Sakura TSC | PASS/FAIL | N errors |
   | Nova TSC | PASS/FAIL/SKIP | N errors |
   | Bundle size | OK/WARN | Main chunk size |
   | Git clean | YES/NO | N uncommitted files |

3. **If any check fails**, list the specific failures and suggest fixes.

4. **If all pass**, report "Ready to merge" with the commit count and branch name.
