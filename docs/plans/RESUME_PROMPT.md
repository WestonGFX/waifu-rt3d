# Resume Prompt

**Last updated:** 2026-06-20 (Stage 3 AI motion — Phase 1 env ~90% up; **blocked on user-supplied SMPL-X/H**)
**Branch:** master · local commits ahead of origin (Stage 3 plan + Phase 0/1 checkpoints + this session's docs)
**Schema:** v89 (unchanged)
**Tests:** 3,121 backend pytest + 498 sakura vitest passing, tsc clean

## RESUME HERE → Stage 3 AI Motion (Phase 1 — ONE blocker left, it's the user's)

**Plan:** `docs/plans/2026-06-14-stage3-ai-motion.md` · **Full reality report:** `docs/research/2026-06-14-dart-on-5080.md` (read this first — has exact paths, file-IDs, the pytorch3d-shim decision, and access lessons).

**Done (2026-06-20, all autonomous over SSH):** the `dart` conda env on the 5080 (torch 2.11+cu128) now has **all 25 demo pip deps importing clean**, **modern spacy 3.8.14**, a **pytorch3d transforms-only shim** (full build fails on Blackwell C++ — shim is pure-torch rotation math, all DART's rollout + Phase-2 need), and the **model checkpoints downloaded + placed + verified loadable** (denoiser 23.13 M params loads under torch 2.11). Body-model drop-in dirs pre-created.

**THE BLOCKER (user, one-time, login-gated) — do this to unblock everything:**
`utils/smpl_utils.py` loads SMPL-X **at import time**, so the demo can't even import without the body models.
1. **SMPL-X** — login at `smpl-x.is.tue.mpg.de`, get `smplx_lockedhead_20230207.zip`.
2. **SMPL-H** — login at `mano.is.tue.mpg.de`, get `smplh.tar.xz` (needs PKL conversion per DART README).
   Plan's chosen path = "Claude drives the browser download over CDP" once the user is logged into both MPI sites.
   Drop files into (dirs already exist on box):
   `/root/DART/data/smplx_lockedhead_20230207/models_lockedhead/{smplx/*.npz, smplh/*.pkl}`
   ⚠ non-commercial license = prototype-only (commercial ship needs Meshcapade SMPL + data-license review).

**Next steps once body models land:**
1. gdown `data/seq_data_zero_male` (norm stats) by file-ID from the public Drive folder (same method as the checkpoints).
2. `bash /root/DART/demos/run_demo.sh` → **measure real VRAM (`nvidia-smi` during run) + per-step latency on the 5080** → fill the unmeasured row in the research doc. (Every published number is RTX 4090 — unverified on the 5080.)
3. → **Phase 2:** SMPL-X axis-angle `.npz` → normalized-VRM GLB via `tools/dart_to_glb.py` + the Bug-2 harness (`tools/convert_to_normalized.py` + `ground_truth.mjs`), render-gated. The transforms shim already provides the rotation math.

**Access cheat-sheet:** `ssh rtx5080 "<cmd>"` (cmd shell). WSL needs the **base64-pipe with escaped double quotes**:
`ssh rtx5080 "wsl -d Ubuntu-24.04 -u root -e bash -lc \"echo <BASE64> | base64 -d | bash\""` (cmd eats `|` inside *single* quotes). Detached box jobs **must** use `nohup`. `gdown --folder` chokes on the big `policy_train/` tree → download by **file-ID** (`gdown <id> -O <path>`). conda: `source /root/miniconda3/etc/profile.d/conda.sh; conda activate dart`.

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
