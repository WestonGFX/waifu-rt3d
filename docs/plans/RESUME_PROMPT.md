# Resume Prompt

**Last updated:** 2026-06-14 (Stage 3 AI motion — Phase 0 done, Phase 1 in progress)
**Branch:** master · 4 local commits ahead of origin (Stage 3 plan + Phase 0/1 checkpoints)
**Schema:** v89 (unchanged)
**Tests:** 3,121 backend pytest + 498 sakura vitest passing, tsc clean

## RESUME HERE → Stage 3 AI Motion (Phase 1 continuation)

**Plan:** `docs/plans/2026-06-14-stage3-ai-motion.md` (read its status log — has full detail + the agentic-access runbook).

**Done:** Phase 0 (agentic SSH to the RTX 5080 — `ssh rtx5080` works) + Phase 1 Blackwell de-risk (WSL2 Ubuntu, conda env `dart`, **torch 2.11.0+cu128 runs GPU matmul on the 5080, sm_120**). DART cloned at WSL `/root/DART`.

**Next steps (in order):**
1. **Get SMPL-X + SMPL-H body models** (the blocker). Gated behind MPI account login at `smpl-x.is.tue.mpg.de` + `mano.is.tue.mpg.de` (license accept). User chose "Claude drives the download via browser" — needs the user logged into those MPI sites (or creds). Place per DART README under `/root/DART/data/`. ⚠ non-commercial license = prototype-only.
2. **gdown the DART checkpoints** (Google Drive link in DART README) into `/root/DART`.
3. **Install DART deps** in the `dart` conda env: `pytorch3d` (easy on Linux) + the env.yml pip list, MINUS the CUDA-11.8 torch pins (keep the working cu128 torch). Adapt any torch-2.0→2.11 API breaks.
4. **Run a DART demo** (`/root/DART/demos/run_demo.sh` etc.) → measure VRAM + latency on the 5080. Write `docs/research/2026-06-14-dart-on-5080.md`.
5. → **Phase 2:** SMPL-X axis-angle → normalized-VRM via the Bug-2 harness (`tools/convert_to_normalized.py` + `ground_truth.mjs`). New `tools/dart_to_glb.py`. Render-gate it.

**Access cheat-sheet:** `ssh rtx5080 "<cmd>"` (cmd shell; use `&` separators). WSL: `ssh rtx5080 "wsl -d Ubuntu-24.04 -u root -e bash -c \"...\""` (base64-pipe complex scripts to dodge quoting). conda env: `source /root/miniconda3/etc/profile.d/conda.sh; conda activate dart`.

---

## Earlier this session (2026-06-14): Stage 2b Phase 1 shipped + pushed

Planned + shipped **Stage 2b Phase 1: click-to-walk navigation** — the avatar can now walk
around her loaded 3D room. Plan: `docs/plans/2026-06-14-stage2b-p1-click-to-walk.md`. (Pushed `cd27227..140c3f8`.)

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

1. ~~**Push when ready**~~ ✅ DONE 2026-06-14 — Stage 2b P1 pushed `cd27227..140c3f8`, origin synced.
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
