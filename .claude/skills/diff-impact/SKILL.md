---
name: diff-impact
description: >
  Analyze uncommitted changes to identify affected features, test coverage gaps,
  and regression risk. Maps git diff to feature areas and suggests verification steps.
user_invocable: true
---

# Change Impact Analysis

Maps your current changes to affected features, tests, and risk areas.

## Usage

`/diff-impact` — analyze uncommitted changes (default)
`/diff-impact HEAD~3` — analyze last 3 commits

## Step 1: Identify Changed Files

```bash
git diff --name-only          # Unstaged
git diff --cached --name-only # Staged
```

Or for commit range: `git diff --name-only <ref>`

## Step 2: Map Files to Feature Areas

| Changed File Pattern | Feature Area | Risk Level |
|---------------------|-------------|------------|
| `backend/server.py` | ALL API endpoints | HIGH — 17K lines, shared file |
| `backend/preflight.py` | Database schema | CRITICAL — migration chain |
| `backend/llm/context_assembler.py` | Chat quality, context | HIGH — token budget |
| `backend/llm/adapters/*` | LLM provider integration | MEDIUM |
| `backend/voice/duplex.py` | Voice pipeline | HIGH — state machine |
| `backend/mood/engine.py` | Character mood | MEDIUM |
| `backend/adaptive/*` | AIE modules | MEDIUM |
| `backend/memory/*` | Memory system | MEDIUM |
| `backend/tts/*` | Text-to-speech | LOW |
| `frontends/sakura/src/stores/appStore.ts` | App state, overlays | HIGH — shared state |
| `frontends/sakura/src/stores/chatStore.ts` | Chat flow, streaming | HIGH — core feature |
| `frontends/sakura/src/stores/viewerStore.ts` | 3D viewer bridge | HIGH — tightly coupled |
| `frontends/sakura/src/stores/wizardStore.ts` | Onboarding | LOW |
| `frontends/sakura/src/views/ChatThread.tsx` | Chat UI | HIGH — 1,382 lines |
| `frontends/sakura/src/views/SettingsView.tsx` | Settings modal | MEDIUM — 4,857 lines |
| `frontends/sakura/src/components/Sidebar.tsx` | Navigation | MEDIUM |
| `frontends/sakura/src/components/*Overlay*` | Overlay panels | LOW-MEDIUM |
| `frontends/shared/viewer/viewer.html` | 3D rendering | HIGH — regressions |
| Any CSS/theme file | Visual consistency | MEDIUM — 18 themes |
| `CLAUDE.md` or `.claude/*` | Tooling/workflow | LOW |

## Step 3: Check Test Coverage

For each changed file, check if tests exist:

```bash
# Backend
grep -rl "import.*{changed_module}" backend/tests/ 2>/dev/null
# Frontend
grep -rl "import.*{changed_component}" frontends/sakura/src/test/ 2>/dev/null
```

Flag files with **no test coverage** as higher risk.

## Step 4: Check Known Sensitive Areas

Cross-reference against CLAUDE.md "Known Sensitive Areas":
- Avatar aspect ratio & grounding
- Column resize / layout reflow
- Theme color inheritance
- Chat input width (regressed to 40px before)
- Help dropdown soft-lock
- Focus traps in overlays

## Step 5: Output Report

```
Change Impact Analysis
────────────────────────────────────────
Files changed: N (M backend, K frontend)
────────────────────────────────────────
Feature Areas Affected:
  [HIGH]     Chat flow — chatStore.ts modified
  [MEDIUM]   Settings — SettingsView.tsx modified
  [LOW]      Tooling — CLAUDE.md updated
────────────────────────────────────────
Test Coverage:
  Covered:   file_a.py (test_file_a.py exists)
  UNCOVERED: file_b.tsx (no test file found)
────────────────────────────────────────
Sensitive Area Hits:
  ⚠ Theme color inheritance — CSS variables modified
  ⚠ Chat input width — ChatThread.tsx modified
────────────────────────────────────────
Suggested Verification:
  1. Run: .venv/bin/python -m pytest backend/tests/ -q
  2. Run: cd frontends/sakura && npx tsc --noEmit
  3. Visual: Check chat input width at different window sizes
  4. Visual: Toggle 1 light + 1 dark theme
────────────────────────────────────────
Risk Level: MEDIUM (N sensitive areas touched)
```

## Rules

- Do NOT fix anything. Report only.
- Do NOT run tests — just identify what SHOULD be tested.
- Flag any change to a sensitive area.
- Flag any change to a file with no test coverage.
