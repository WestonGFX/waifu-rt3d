# Resume Prompt — Session 45+

**Last updated:** 2026-05-24 (session 44)
**Branch:** master · origin at `1fe562a` (all pushed)
**Schema:** v82 (character_physics_profiles)
**Tests:** 2,843 backend + 294 frontend passing (1 pre-existing flake), tsc clean

## What Was Done (Session 44)

Cleanup pass + first-ever regression test for the Ctrl+M Memory Browser hotkey:

- **Cleanup** (`ca274a2`): trashed abandoned Memory Browser scaffolding left by prior sessions (two variants of `useMemoryBrowserOverlay.tsx`, `useMemoryBrowser.tsx`, `MemoryBrowserOverlay.tsx`, `App.tsx.new`, `App.memory-browser-integration.patch`, stray `e2e/memory-browser/hotkey.spec.ts`, `smoke-test.spec.ts.bak`). Reverted destructive App.tsx duplicate imports. Reverted `frontends/sakura/e2e/smoke-test.spec.ts` (gutted 743→16 lines). Reverted `MemoryBrowser.tsx` (background process had stubbed 1284→25 lines). Gitignored stray runtime files (`/app.db`, `/data.db`, `/e2e/`, `*.db.bak.*`, `.claude/settings.{auto,hybrid,waifu}.json`). Dropped 2 unused portrait PNGs.
- **Regression test** (`1fe562a`): `frontends/sakura/src/test/useKeyboardShortcuts.memoryBrowser.test.tsx` — 4 cases (ctrl+m, cmd+m, in-input suppression, no-modifier). Hotkey is already wired at `App.tsx:278` → `openOverlay('memorybrowser')`. Coverage exists now; future sessions can grep for this test instead of re-implementing the hook.
- **Pushed** 18 unpushed commits (sessions 41-44) to origin/master.

## ⚠ Heads-up for next session

A background `claude --dangerously-skip-permissions` process (PID 45201, started 05:07 AM 2026-05-24) was editing files in this repo concurrently with session 44. It twice re-injected the broken scaffolding that session 44 had just removed, and once replaced the entire 1284-line `MemoryBrowser.tsx` with a 25-line stub. Each time, `git checkout` restored the legitimate file. **Before starting session 45, check `ps aux | grep claude` for stray sessions and kill any that target this repo.**

## Next 3 Tasks

1. **Memory Browser QA** — Start server (`.venv/bin/python -m uvicorn backend.server:app --host 0.0.0.0 --port 8080`), open Chrome at `http://localhost:5175` (run `cd frontends/sakura && npx vite --port 5175`), press Ctrl+M, exercise all 4 tabs (Overview, Search/Memories, Graph, Journal/Timeline) against real backend data. Ctrl+M wiring is now regression-tested at the unit level; this is real-backend integration validation.

2. **M5 AIE Phase C** — Advanced AIE tier. Requires a tier decision from user before starting. See `docs/plans/2026-05-06-opus-planning-roadmap.md` M5 section for options (LoRA-style fine-tuning vs DSPy prompt optimization vs behavioral steering). Estimated 60-100h AI-eq — largest remaining milestone.

3. **Fix pre-existing chatStore.pin flake** — `src/test/chatStore.pin.test.ts` → `togglePin > optimistically flips pinned=true, then confirms via API` is the lone failing frontend test. Mocked API returns 500. Either fix the mock or fix the optimistic-rollback logic.

## In-Flight Context

- **All previous TODO items** from earlier RESUME_PROMPTs are done. Don't re-plan them.
- **M7 Phase F (Neural Motion)**: Explicitly deferred — needs GPU server + 60-100h. Do NOT start unless user asks.
- **Schema**: v82, no migrations pending.
- **Untracked avatars** (`backend/storage/avatars/Glitch.png`, `melon_*.png`) left untracked deliberately — not referenced by any tracked code; commit when actually wired up.
- **Backend `app.db` working copy** appears in git status as modified — it's gitignored at line 35 but already tracked; git keeps showing diffs. Don't commit live DB data.
