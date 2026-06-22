# Resume Prompt

**Last updated:** 2026-06-22 (Stage 3 AI motion — **✅ PHASE 1 COMPLETE: DART runs on the 5080**)
**Branch:** master · local commits ahead of origin (Stage 3 plan + Phase 0/1 + Phase-1-complete docs)
**Schema:** v89 (unchanged)
**Tests:** 3,121 backend pytest + 498 sakura vitest passing, tsc clean

## Two open threads (pick either)

1. **Stage 3 DART Phase 2** — convert generated motion → normalized-VRM GLB (details below).
2. **Build `ds_dispatch`** in `~/Code/lm-mcp/` (TS/Bun) — privacy-gated DeepSeek dispatch tool. Plan: `docs/plans/2026-06-22-lm-mcp-ds-dispatch.md`; routing policy: global `~/.claude/rules/model-routing.md`; council research: `docs/research/2026-06-22-claude-code-model-routing.md`. (Open in the lm-mcp repo, say "build ds_dispatch from the plan".)

**Session 2026-06-22 also added global behavior rules** (`~/.claude/CLAUDE.md`): generality meta-principle (+ point 6: don't assume mutable refs stay fixed), auto-scale review rigor, actor-naming (Chris/Claude), Chrome-tab-not-new-browser, honest-objective-not-sycophant, model-routing, offer-to-make-free-accounts. Untracked `tools/smplx_grab.mjs` left in place (unused MPI CDP downloader).

## RESUME HERE → Stage 3 AI Motion — Phase 1 DONE, start **Phase 2**

**Plan:** `docs/plans/2026-06-14-stage3-ai-motion.md` · **Full results:** `docs/research/2026-06-14-dart-on-5080.md` (read first — exact paths, file-IDs, measured numbers, access lessons).

**✅ Phase 1 complete (2026-06-22): DART generates text→motion on the RTX 5080.**
- **Measured:** peak VRAM **2.8 GB / 16** (fits easily), 20-primitive rollout **~1.3 s (~17 it/s)**, Blackwell sm_120 + torch 2.11 cu128 end-to-end. Output `sample_0_smplx.npz` = `poses (162,165)` axis-angle + `trans (162,3)`, 30 fps, no NaN.
- **Env on the box (WSL `dart` conda):** all deps + spacy 3.8.14 + **pytorch3d transforms-shim** (full build fails on Blackwell C++; shim = pure-torch rotation math, sufficient for rollout + Phase 2) + **numpy-2 patch** (DART's `np.float`/etc → builtins, 6 files). Checkpoints at `/root/DART/mld_denoiser/...` + `/root/DART/mvae/...`; SMPL-X at `data/smplx_lockedhead_20230207/models_lockedhead/smplx/`; norm stats at `data/seq_data_zero_male/`.
- **SMPL-X** supplied by Chris (`smplx_lockedhead_20230207.zip` — the "removed head bun / locked head" NPZ). **SMPL-H NOT needed** for the default BABEL/SMPL-X demo (HML3D-only).
- **Re-run the demo:** `ssh rtx5080`, WSL, `conda activate dart`, `cd /root/DART`, `bash demos/run_demo.sh` (interactive viz — needs display) **or** the headless `mld.rollout_mld` line in the research doc (exports `.npz`).

**→ Phase 2 (next): SMPL-X `.npz` → normalized-VRM GLB.**
- Build `tools/dart_to_glb.py`: read DART's `sample_0_smplx.npz` (`poses` axis-angle 165-dim + `trans`) → per-bone local quaternions → the **proven Bug-2 normalized conversion** (`tools/convert_to_normalized.py` algebra / `VRM_BONE_MAP`) → GLB with normalized `J_Bip_*` tracks, non-humanoid channels stripped, root y glued to floor.
- **Render-gate it** (`tools/verify/render_clip.mjs --frames N`): distinct frames, upright, grounded, arms track, **zero red-backface eversion**. Don't guess the normalized constant — reuse Bug-2 (`ground_truth.mjs`). Screenshots → `docs/testing/screenshots/2026-06-22-stage3-dart/`.
- The transforms-shim on the box provides the axis-angle→quat math; the Mac side reuses the Stage-1 normalized pipeline.

**Access cheat-sheet:** `ssh rtx5080 "<cmd>"` (cmd shell). WSL needs the **base64-pipe with escaped double quotes**:
`ssh rtx5080 "wsl -d Ubuntu-24.04 -u root -e bash -lc \"echo <BASE64> | base64 -d | bash\""`. Detached box jobs **must** use `nohup`. conda: `source /root/miniconda3/etc/profile.d/conda.sh; conda activate dart`.

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
