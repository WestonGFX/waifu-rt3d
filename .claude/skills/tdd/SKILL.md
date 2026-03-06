---
name: tdd
description: "Test-driven development: write tests first, confirm they fail, then implement"
user_invocable: true
---

# Test-Driven Development Loop

Strict red-green-refactor cycle. User provides the feature/fix as argument (e.g., `/tdd Add rate limiting to /api/chat`).

## Cycle

### 1. RED — Write failing tests
- Backend: add test file or test functions in `backend/tests/`
- Frontend: add test alongside component (`.test.ts` / `.test.tsx`)
- Tests should describe the DESIRED behavior, not the current behavior

### 2. Confirm FAIL
- Run the tests: `.venv/bin/python -m pytest backend/tests/ -q --tb=short -x`
- Verify tests fail for the RIGHT reason (missing function, wrong return value)
- NOT for the wrong reason (import error, syntax error, test setup bug)
- If failing for wrong reason: fix the test first, re-run

### 3. GREEN — Implement minimum code
- Write the simplest implementation that makes ALL new tests pass
- Do not over-engineer. Do not add features beyond what tests require.

### 4. Verify GREEN
- Run tests again — all new tests must pass
- Run full test suite to check for regressions: `.venv/bin/python -m pytest backend/tests/ -q`

### 5. REFACTOR (optional)
- If code is messy, clean it up
- Re-run tests after refactoring — must stay green

### 6. Commit
- `git add` the test files AND implementation files
- Commit with descriptive message

### 7. Repeat
- Move to next piece of the feature
- Go back to step 1

## Hard Rules

- **NEVER write implementation before tests.** The test file comes first. Always.
- **NEVER skip the "confirm fail" step.** A test that passes before implementation is a useless test.
- **NEVER enter plan mode.** TDD IS the plan — each test describes the next step.
- **NEVER commit red tests.** Every commit must be green.
