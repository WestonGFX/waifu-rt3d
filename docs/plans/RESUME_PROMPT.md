# Resume Prompt

**Last updated:** 2026-06-14 (Stage 2b Phase 1 — click-to-walk navigation)
**Branch:** master · HEAD = `b5c8857` · **13 commits LOCAL/unpushed** (`4838386`→`b5c8857`)
**Schema:** v89 (unchanged this session)
**Tests:** 3,121 backend pytest + 498 sakura vitest passing, tsc clean

## What Was Done (2026-06-14)

Planned + shipped **Stage 2b Phase 1: click-to-walk navigation** — the avatar can now walk
around her loaded 3D room. Plan: `docs/plans/2026-06-14-stage2b-p1-click-to-walk.md`.

- `df6e99f` — WalkController in `viewer.html` (turn → `walking` clip → root translate at
  1.1 m/s with y glued to floor → real `THREE.Raycaster` collision: floor-pick on click +
  forward capsule sweep that stops short of walls/props → idle, camera-target follow).
  postMessage: `setWalkMode`/`walkTo`/`stopWalk`/`getAvatarPose` + drag-vs-click guard.
  `viewerStore.ts` dispatch trio. `ModelPanel.tsx` dev-mode-only 🚶 Walk toggle beside the
  environment picker. Render-gate `tools/verify/render_walk.mjs` PASS. +11 vitest.
  Caught + fixed a TDZ crash (`_walk` declared after the animate loop → hoisted to module scope).
- `b5c8857` — posture investigation: the headless hunch is a **swiftshader artifact** (upright
  at 60fps via `render_walk_headed.mjs`, real GPU). Kept a real fix: `BalanceLayer.calculateCoG()`
  now root-relative (was absolute world space → bogus ~9cm hip shift once walking).

**Scope deliberately bounded:** straight-line walk only. No pathfinding-around-obstacles, no
AI-driven movement, no run/turn clips — those are Phase 2 (see below).

## Next Tasks

1. **Push when ready** — 13 local commits (`4838386`→`b5c8857`). Push gate clear (no active
   OPEN BUG/UNFIXED/BLOCKER). Scan `docs/SESSION_HANDOFF.md` + `CURRENT_STATUS.md` first per rule.
2. **Stage 2b Phase 2** (separate future plan, when the user wants it): pathfinding AROUND
   obstacles (navmesh/A*), run/turn-in-place clips, camera follow-distance clamp (walking toward
   the camera currently near-plane clips — minor), then Kokoro-driven destinations (embodiment seam).
3. **Stage 3 (AI motion)** — needs an RTX box, not the M2 Pro. Gated.

## Key Files to Read First (cold start)

1. `CURRENT_STATUS.md` — top block reflects 2026-06-14 state.
2. `docs/plans/2026-06-14-stage2b-p1-click-to-walk.md` — the Phase 1 plan + execution + posture
   investigation table.
3. `frontends/shared/viewer/viewer.html` — WalkController (search `_walk`, `_tickWalkController`,
   `_onWalkClick`, `BalanceLayer`).
4. `frontends/sakura/src/stores/viewerStore.ts` — `dispatchSetWalkMode`/`dispatchWalkTo`/`dispatchStopWalk`.
5. `docs/plans/2026-05-31-avatar-motion-staged.md` — parent staged plan (Stages 1–4).

## Context / Gotchas

- **Backend may be on OLD code** — restart to serve v89 + environment endpoints if testing live.
- **viewer.html is served as a static file** from disk, so viewer edits take effect without a
  backend restart (render harnesses pick them up immediately).
- **Runtime drift** in working tree (`backend/config/app.json`, `backend/storage/app.db`) — the
  user routinely reverts these; never commit them.
- **Headless swiftshader distorts spring/follow-through physics** at its low framerate — verify
  posture/motion with `render_walk_headed.mjs` (headed, real GPU) before trusting a hunch/whip.
