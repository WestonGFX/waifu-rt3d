---
name: audit
description: "Parallel code review: bug detection, security, and code quality agents"
user_invocable: true
---

# Code Audit

Parallel review using specialized agents. Takes a scope argument:
- `/audit last 3 commits` — review the last 3 commits
- `/audit unstaged` — review uncommitted changes
- `/audit backend/server.py` — review a specific file
- `/audit` (no args) — review all uncommitted + staged changes

## Agents

Launch all 3 in parallel using the Agent tool:

### Agent 1 — Bug Detection
- Look for: logic errors, off-by-one, null/undefined access, race conditions, missing error handling at boundaries, incorrect async/await patterns
- Classify each finding: **P0** (will crash/corrupt), **P1** (likely bug), **P2** (code smell)

### Agent 2 — Security
- Check OWASP top 10: injection, XSS, CSRF, auth bypass, sensitive data exposure
- Check: hardcoded secrets, unsafe eval/exec, path traversal, SQL injection in raw queries
- Classify: **P0** (exploitable), **P1** (potential risk), **P2** (hardening suggestion)

### Agent 3 — Code Quality
- Check: project convention adherence (CLAUDE.md rules), dead code, missing types, inconsistent naming, duplicated logic
- Classify: **P0** (breaks conventions badly), **P1** (should fix), **P2** (nice to have)

## Output

Merge all findings into a single triage report sorted by priority:

```
## Audit Report — [scope]

### P0 Critical
- [file:line] Description (Agent: Bug/Security/Quality)

### P1 High
- [file:line] Description (Agent: Bug/Security/Quality)

### P2 Nice-to-Fix
- [file:line] Description (Agent: Bug/Security/Quality)

**Summary:** X findings (Y P0, Z P1, W P2)
```

## Rules
- Do NOT fix anything. Report only.
- If no findings at a priority level, omit that section.
- Each agent should read the actual diff/code, not guess from filenames.
