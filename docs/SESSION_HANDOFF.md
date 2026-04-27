# Session Handoff — 2026-04-26 (Session 17)

## Branch: master
## Test Status: 2,678 backend passed · 200 frontend passed (was 196) · TSC clean · 0 pre-existing failures remaining
## Session Commits: `bc71397`, `9c17540` (both unpushed — `git push` pending user decision)

## Completed This Session (Session 17 — MemoryBrowser test closeout + clearing the long-standing 4 failures)

### 1. MemoryBrowser Memories + Journal + integration coverage (`bc71397`)

Closed out the 4-tab Vitest matrix that session 16 started. **+16 cases** in `frontends/sakura/src/test/MemoryBrowser.test.tsx`.

- **Memories tab (7 cases)**: list fetch with `char_id` query param, role/tier badges (T1 Fleeting / T2 Recent / T3 Permanent), empty state, 500 error fallback, search-mode + Go button switches to `/api/v2/memory/search`, DELETE on row, PATCH `/promote` (gated to tier<3), pagination footer.
- **Journal tab (5 cases)**: entries render via `api.getMemoryOverview`, count heading singularization (1 entry → "1 entry written"), empty state, expand/collapse for >120-char entries, session-number display.
- **Top-level integration (3 cases)**: close button clears `activeOverlay`, tab selection persists across switches without refetch, tab resets to Overview when overlay is closed and reopened.

**Notable mechanic** — the Memories tab uses raw `fetch()` against four different endpoints. Tests use a per-suite `makeFetchStub()` factory that routes by URL substring + method (`list` / `search` / DELETE-by-id / PATCH `/promote`). When session 18 unifies these into the `api.*` client (priority below), this whole stub-router can be deleted in favor of Pattern 2.

**Notable mechanic** — the "tab reset on reopen" test required `act()` boundaries between two consecutive `useAppStore.setState()` calls. Without them, zustand's setState pair gets batched into one React render tick and the `open` boolean never transitions true→false→true, so the reset effect's dep doesn't re-fire. Single `act()` wrapping both calls would also fail.

### 2. Cleared 4 pre-existing frontend test failures (`9c17540`)

These had been flagged as "pre-existing, defer" across sessions 13–16. Both root causes were environmental drift around the tests, not regressions in production code.

- **OnboardingWizard "Get started advances to System Scan"** — once the wizard reaches step 2, "System Scan" appears in two DOM nodes: the `StepHardwareScan` `<h2>` heading AND the `WizardProgress` bar text "Step 2 of 7: System Scan". `getByText` throws on multi-match. Fixed by scoping to `getByRole('heading', { level: 2, name: /System Scan/i })`.
- **SettingsView export/import × 3** — `SettingsView`'s Character tab mounts `FormatRulesEditor`, which fetches via `api.getFormatRules` on mount. The test's api mock predates that component and didn't stub it, so the editor threw `is not a function` and crashed the SettingsView subtree before Export/Import controls could render. Added `getFormatRules` + the four CRUD methods (`createFormatRule`, `updateFormatRule`, `deleteFormatRule`) as resolved-noop stubs.

**Net result:** the "4 pre-existing failures unchanged" footnote that has been carried forward since session 13 is now retired. Frontend baseline is 200/200 passing.

## Files changed this session

```
frontends/sakura/src/test/MemoryBrowser.test.tsx          | 339 ++++++++++++++++-
frontends/sakura/src/test/OnboardingWizard.test.tsx       |   7 +-
frontends/sakura/src/test/SettingsView.exportImport.test.tsx |   7 +
```

Test-only diff. Zero production code changes. Backend untouched.

## Not yet committed (intentional, carried over)

- `.claude/settings.json` + `.claude/settings.local.json` — harness drift from earlier sessions
- `CURRENT_STATUS.md` — about to be updated by this handoff
- `backend/config/app.json` + `backend/storage/app.db` — runtime drift, never commit
- `docs/ROADMAP.md` — still pending user review (carried from session 15)
- `docs/decisions/2026-04-24-claude-code-harness-cleanup.md` — new, untracked, hasn't been reviewed
- `.codex/`, `.mcp.json.bak-20260424`, `.mcp.md` — other tools' artifacts, untracked

## Work In Progress

- None. Both targeted priorities for session 17 are committed and verified.

## Known Issues / Bugs

- None new. The Memory Browser tab raw-fetch vs `api.*` inconsistency is captured for session 18 polish (priority below); not a bug, just a refactor opportunity.

## Next Session (18) Priorities — in order

1. **Memory Browser browser QA** *(priority #2 from session 16 handoff, now next-up)* — start backend (`./run.sh`) + Sakura (`cd frontends/sakura && npx vite --port 5175`), open Ctrl+M overlay against real data. Exercise all 4 tabs, file bugs as `docs/bugs/2026-04-<date>-memory-browser-<symptom>.md`. ~1–2h. Requires hand-on Chrome interaction — not autonomous.
2. **Memory Browser API unification refactor** *(priority #3 from session 16)* — move Memories tab raw `fetch()` calls into `api.*` client. Adds `listMemories`, `searchMemories`, `deleteMemory`, `promoteMemory` to `api.ts`. Once landed, the `makeFetchStub()` router in `MemoryBrowser.test.tsx` can be deleted and the 7 Memories cases collapsed onto Pattern 2. ~2–4h.
3. **Visual Content in Chat** *(Track A #2)* — "Character sends you a picture" UX. Image-gen pipeline already exists in backend. ~4–8h.
4. **Humanoid Motion Quality / Spring Bones / Jiggle Physics** — heavier Track-B specs already written in `docs/plans/2026-03-29-*.md`. Pick one when ready for a multi-session feature push.
5. **AIE Phase C** — LoRA training pipeline, DSPy prompt optimization. Heavy, independent.

## Context for Next Session

- **Test baseline is now genuinely clean:** 200 frontend / 2,678 backend / tsc clean / 0 known failures. Session 18 should preserve this — any new test that lands red is a real regression, not noise.
- **MemoryBrowser test fixture pattern** — the `OVERVIEW_RESPONSE` constant + `openBrowser()` helper at the top of `MemoryBrowser.test.tsx` is the canonical fixture for any further memory-related test. The `makeFetchStub()` factory (Memories describe block) is the canonical fetch-router pattern; reusable elsewhere if any other component still talks to raw `fetch`.
- **`act()` interleave for store transitions** — if you write a future test that needs to verify behavior across a close→reopen cycle of any zustand-backed overlay, follow the pattern in the "resets to Overview tab" case: separate `act()` blocks + intermediate `waitFor` to confirm unmount before reopening.
- **Token budget** — `CURRENT_STATUS.md` was pruned to 153 lines in session 16. This handoff appends one row to the "Active Work" / "Completed" sections without growing the body of the file. If session 18 lands more, follow the same add-and-trim policy from `feedback_pre_session_token_budget.md`.
- **No suggestion triggers fired this session** — test-only changes, no schema migration, no Known Sensitive Area edits, no native module changes, no server-start claim. `/qa-sweep` and `/verify-servers` not warranted.

## Quick resume

```
/pre-session
# Then either start Session 18 Priority #1 (browser QA — needs you driving Chrome)
# or kick off Priority #2 (api unification refactor — autonomous)
```
