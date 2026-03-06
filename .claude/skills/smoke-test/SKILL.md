---
name: smoke-test
description: Run backend pytest and frontend tsc checks, report pass/fail summary
user_invocable: true
---

# Quick Smoke Test

Read-only diagnostic. Run both checks and report results. Do NOT fix anything.

## Steps

1. **Backend tests:**
   ```
   .venv/bin/python -m pytest backend/tests/ -q --tb=line
   ```
   Record: total tests, passed, failed, errors.

2. **Frontend type check:**
   ```
   cd frontends/sakura && npx tsc --project tsconfig.app.json --noEmit --pretty
   ```
   Record: number of errors (0 = clean).

3. **Report summary:**
   ```
   Backend: X passed, Y failed (Z total)
   Frontend: N type errors
   Status: ALL GREEN / HAS FAILURES
   ```

4. **Do NOT fix anything.** Just report. If the user wants fixes, they'll ask.
