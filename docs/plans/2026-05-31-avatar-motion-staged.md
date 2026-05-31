# Plan: Realistic Avatar Movement → On-the-Fly Animation (Staged)

**Date:** 2026-05-31
**Branch off:** `feat/psych-memory-engine` (or fresh `feat/avatar-motion`)
**Author intent:** "movement that looks REAL — not dumb algorithmic repetitive movements. Rigged humanoid motion, animate on the fly, eventually avatar in a real 3D location, Claude-driven Blender for assets."

---

## Context

The user wants the avatar to move like a real humanoid — and asked whether Three.js is the only option, whether to use Blender/Unity/MDM, what model format is best, and whether to generate animation on the fly (their own answer: **YES**).

**Key finding from exploration:** most of this vision is **already scaffolded in the repo but never wired or proven.** The gap is not architecture — it's execution and one unproven pipeline.

What exists today:
- Three.js + `@pixiv/three-vrm` renderer with an **8-layer AnimationDirector** state machine, spring-bone physics, FFT lipsync, Poisson blink, gaze IK, expression controller — all working (`frontends/shared/viewer/viewer.html`).
- A **runtime retarget pipeline** already coded but never exercised: `ClipLayer.retargetClip()`, `loadClip(url, name, {retarget})`, `stripSpringBoneTracks()`, BVH support (`viewer.html:2908–3019`), `MIXAMO_BONE_MAP` / `BVH_BONE_MAP` (`viewer.html:2611–2669`).
- **Kokoro psychology → embodiment vocabulary** wired: 8 gestures, 9 expressions, 5 gaze targets (`backend/kokoro/response_parser.py:26–39`).
- A standalone **GPU motion server** with UDP auto-discovery (`backend/motion/motion_server.py`, `backend/motion/beacon.py`) — procedural sine-wave only; MotionLCM/MoMask hookpoints are stubbed.
- **Zero animation clip files on disk.** `backend/data/animation_manifest.json` lists 36 clips; the directories (`backend/storage/animations/{bvh,fbx,glb,vrma}/`) are empty. `tools/download_animation_packs.py` works only for the SillyTavern git repo + 4 jsdelivr VRMA files; CMU/100STYLE/LaFAN1 URLs are dead; Mixamo is manual.
- Procedural idle uses **sine waves** (known-robotic). The RIKO gold-standard uses exponential easing (`docs/research/2026-03-28-animation-overhaul-research.md`).

### Decisions locked (this planning session)
1. **Renderer: stay Three.js/WebGL.** The renderer is not the realism bottleneck — animation data is. Unity (exists as alt-renderer) doubles maintenance; WebGPU is a 2–3 week rewrite for marginal gain. Revisit only if Three.js proves insufficient *after* Stage 1.
2. **Formats: VRM for characters, GLB for environments.** `.blend` is an authoring format, not runtime — model/rig in Blender, export VRM/GLB. VRoid for character base → Blender for refinement (full anime-girl modeling from scratch is out of scope).
3. **Stage 1 = realistic movement via clips** (user pick). Works on the M2 Pro now, no extra GPU, and is the prerequisite for on-the-fly AI motion — the retarget pipeline is shared whether the source clip is human mocap or MDM output.
4. **Pipeline: runtime-retarget first, Blender bake later** (user pick). Prove the path fast in-viewer on ONE clip; add the offline Blender bake for the shipped library once the path is proven.

### Non-negotiable constraints
- **Avatar grounding / foot-slide / camera framing is a Known Sensitive Area** (regressed 10+ times). Every clip change MUST be visually verified — render and watch, never "the math is right."
- **Never edit `viewer.html` and `viewerStore.ts` in parallel** (tightly coupled — merge pain). Sequence them.
- **No new visible UI chrome** without explicit approval.
- One commit per sub-step; pytest + tsc green between steps.

---

## STAGE 1 — Animation Realism Foundation (executable now)

**Outcome:** the avatar plays real human-mocap clips driven by Kokoro psychology, with natural easing instead of robotic sine waves, on the M2 Pro. This is the foundation; later stages ride on it.

**The gate that controls everything:** before building a library or touching AI motion, **prove the retarget pipeline end-to-end on ONE real clip** — clean grounding, no foot-slide, no float, blends with the idle layer. Until this works, "clip library" and "MDM on the fly" are hand-waving.

### Step 1.1 — Source & prove ONE clip (de-risk first)
- Pull a single locomotion/gesture clip through the **working** sources only: SillyTavern VRM-Assets git clone (`tools/download_animation_packs.py --pack sillytavern`) or one Mixamo FBX→GLB manual export. Pick a clip with foot contact (e.g. a weight-shift idle or a wave) so grounding is actually tested.
- Load via the existing runtime path: `clipLayer.loadClip(url, name, { retarget: true })` (`viewer.html:2980`). Confirm `retargetClip` remaps tracks (console logs `Retargeted N/M tracks`) and `stripSpringBoneTracks` frees hair/cloth.
- **Visual verification (required):** render in-app, watch for foot-slide, ground penetration, hip float, jitter at loop seam, spring-bone explosion. Capture before/after screenshots to `docs/testing/screenshots/2026-05-31-retarget-proof/`.
- If grounding is wrong: this is the real work. Likely fixes — hip-height normalization, foot-IK lock, or root-motion stripping. Document what it took in `docs/research/2026-05-31-retarget-pipeline.md`.
- **Gate:** do not proceed to 1.3 until one clip looks right. If runtime retarget can't get clean grounding, that's the signal to jump the Blender bake forward (Step 1.5).

### Step 1.2 — Replace sine-wave idle with exponential easing
- In `viewer.html` IdleBehaviorLayer / BasePoseLayer, swap `sin(t*…)` drivers for RIKO-style `current += (target - current) * ease` critically-damped approach (the file already has `springDamperExact` / `springDamperQuaternion` at ~`viewer.html:802–879` — reuse, don't reinvent).
- Keep personality scaling (energy/confidence/nervousness/expressiveness/playfulness) as amplitude/rate inputs.
- Visual-verify idle on at least one VRM at light + dark theme. Per the viewer rule: no `new Vector3/Quaternion` inside the loop — pre-allocate.

### Step 1.3 — Build the shipped clip library (offline Blender bake)
- Once the path is proven, switch the *library* to the cleaner offline route: Claude Code drives **headless Blender** (`blender --background --python retarget.py`) to import source mocap, retarget onto the VRM humanoid rig, normalize hip height + foot contact, bake, and export VRM-compatible GLB/VRMA.
- New tool: `tools/blender/retarget_clip.py` (bpy). New orchestrator: `tools/build_animation_library.py` (batch over a source manifest → `backend/storage/animations/glb/`).
- Curate ~20–40 clips first (not 100): idles (calm/alert/tired), gestures matching the Kokoro vocab, a few full-body (sit, lean, stretch). Tag each with `{tags, mood}` for the existing cycling filter (`loadClip` opts).
- Update `backend/data/animation_manifest.json` (or `animation_library.json` per viewer rule — reconcile the two filenames) with real on-disk entries. Fix `tools/download_animation_packs.py` to drop dead sources and document the manual-Mixamo step.

### Step 1.4 — Drive clips from Kokoro psychology
- Map the 8-value gesture vocab (`response_parser.py:34`) → library clip names, with a mood-aware idle selector (Tier A dials → idle variant). Extend the vocab cautiously only if a needed motion is missing — each new value needs a clip + parser update + frontend dispatch.
- Wire through the existing seam: Kokoro emits `gesture` → `viewerStore` `trigger_gesture` → AnimationDirector `gesture` state → ClipLayer plays the mapped clip, auto-returns to idle. **Do not** touch `viewer.html` and `viewerStore.ts` in the same commit.
- Backend tests for the gesture→clip map; frontend test for the dispatch.

### Step 1.5 — (conditional) Blender bake pulled forward
- Only if Step 1.1 shows runtime retarget can't achieve clean grounding. Otherwise this is just the Step 1.3 mechanism.

### Status log
- **2026-05-31 — Step 1.1 DONE.** Gate passed with headless visual proof.
  - All advertised auto-download sources dead; added live `threejs-mixamo` pack (Xbot/Soldier GLBs). Commit `68ab038`.
  - Root-cause bug found via render test: `retargetClip` was a silent no-op — three.js strips the colon from track bone names (`mixamorigHips`) but `MIXAMO_BONE_MAP` keys kept it (`mixamorig:Hips`). Fixed with normalized lookup + rotation-only/hips-translation strip. Avatar now renders upright + grounded + undistorted. Commit `322f630`.
  - Reusable headless harness `tools/verify/render_clip.mjs` (Playwright + Chromium) → screenshots in `docs/testing/screenshots/2026-05-31-retarget-proof/`. Structural regression test added.
  - Runtime retarget achieves clean grounding → Step 1.5 NOT triggered; offline Blender bake stays the Step 1.3 library mechanism.
  - **Follow-ups surfaced:** (a) `loadClip` always stores `animations[0]` under the requested name — needs find-by-name. (b) Walk *stride* — turned out to be (a): I was rendering `agree`, not `walk`. (c) VRMA unsupported by bundled lib (separate task).
- **2026-05-31 — find-by-name fix DONE.** `loadClip` now selects the embedded clip whose name matches the request + exposes all clips of a multi-clip GLB. Real walk renders: 4/4 distinct frames (cycling), mid-stride, grounded. Commit `17f71e0`.
- **2026-05-31 — Step 1.2 RE-SCOPED (not a rewrite).** Idle already uses `noise1D` hash-noise for breathing/sway/head-drift (`viewer.html:1100-1160`), not raw sine; idle render burst = 6/6 distinct organic frames. Rewriting working code = churn in a sensitive area for no visible gain → skipped. Optional future win: a retargeted mocap idle *loop*.
- **2026-05-31 — Step 1.3a DONE.** Blender headless FBX→GLB bake pipeline. `tools/blender/bake_clip.py` (bpy worker: import FBX/GLB, `--in-place` root-motion strip, name cleanup, mixamorig-preserving GLB export) + `tools/bake_animation.py` (Blender-locating launcher, single/batch). Unlocks the Mixamo FBX library. Verified FBX+GLB → retarget → grounded render. Commit `ec42dd6`.
  - **Step 1.3b (curated 20-40 clip library) — awaits user Mixamo FBX downloads:** drop them in a folder, run `tools/bake_animation.py --in-dir <folder> --in-place`.
- **2026-05-31 — Mixamo asset acquisition DONE.** Browser-drove the user's logged-in Chrome over CDP (`tools/mixamo_grab.mjs`) and downloaded 28/28 companion+locomotion clips as FBX (Without Skin, 30fps) to `~/Downloads/mixamo-fbx/`. Commit `68560d0`.
- **2026-05-31 — Mixamo→VRM frame: runtime remap fails, pivoted to VRM-rig retarget (WIP).** Mixamo is Z-up/cm with different rest orientations; a runtime bone-name remap can't work (4 fixes failed: fold / 100m off-camera / upside-down / splay). `tools/blender/retarget_to_vrm.py` retargets onto the VRM's own rig (rest-relative formula, no VRM addon needed). **Validated: upright recognizable walk.** WIP polish: forearm-roll clipping + suspected per-clip bake bug (idle/walking share leg motion) + unmapped fingers. Commit `a642a99`. **Stopped per hypothesis limit — needs a focused follow-up session.**

**Stage 1 verification:** `.venv/bin/python -m pytest backend/tests/ -q` green · `npx tsc` clean · in-app visual check of ≥3 clips + idle at 1 light + 1 dark theme, 60fps on M2 Pro, no foot-slide. Screenshots committed.

**Files touched:** `viewer.html` (idle easing, clip wiring — sensitive), `viewerStore.ts` (gesture dispatch — separate commit), `backend/kokoro/` (gesture→clip map), `tools/blender/retarget_clip.py` (new), `tools/build_animation_library.py` (new), `backend/data/animation_manifest.json`, `backend/storage/animations/glb/` (assets).

---

## STAGE 2 — Avatar in a Real 3D Location *(gated: only if Stage 1 judged sufficient)*

Split hard — these are different-sized problems:

- **2a. Static environment backdrop (achievable):** load a GLB scene (bedroom/cafe) behind the avatar with a real floor plane for correct grounding, replacing the blank backdrop. **This directly changes grounding + camera framing — the #1 regression hotspot.** Visual verification mandatory; one environment at a time. Source: Sketchfab CC / Poly Haven, or Blender-generated (Stage 4). DB: reuse/extend an `environment_url` column on characters; load via a new viewer `loadEnvironment` postMessage.
- **2b. Character moves around / interacts (multi-month — separate plan):** navmesh or scripted waypoints, root-motion locomotion clips, collision, dynamic camera re-framing. Do **not** start this inside Stage 2 — it earns its own dated plan. This is the most seductive part of the vision and the easiest to over-commit.

---

## STAGE 3 — On-the-Fly AI Motion *(gated: needs RTX box + proven retarget)*

- Wire **MotionLCM** (~30ms/seq, the only model fast enough to feel continuous) into the existing `backend/motion/motion_server.py` MotionLCM stub. MoMask (~0.18s/seq, CPU) is a generate-then-play fallback for non-GPU machines, not "live."
- Output is SMPL/HumanML3D joints → `smpl2bvh` → the **same retarget pipeline proven in Stage 1** → AnimationDirector. The retarget+grounding work is reused, not redone.
- **Hardware tiering** (detection exists at `backend/server.py:1710–1753`, `/api/hardware`; tier-matching logic does not): RTX → MotionLCM live; mid GPU → MoMask generate-and-cache; M2 Pro / no GPU → Stage 1 clip library. Condition motion on Kokoro dials (energy → amplitude/speed, arousal → gesture reach).

---

## STAGE 4 — Blender as Full Asset Pipeline *(gated: as needed by Stages 1–2)*

Claude Code drives headless Blender (`bpy`) beyond retargeting: generate/modify GLB environments (Stage 2a), procedural props, expression/blendshape touch-ups, batch VRM cleanup. Character *creation* stays VRoid-base → Blender-refine, not from-scratch. Optionally expose via a Blender MCP server for interactive iteration.

---

## Verification (Stage 1, end-to-end)
1. `.venv/bin/python -m pytest backend/tests/ -q --tb=line` — green.
2. `cd frontends/sakura && npx tsc --project tsconfig.app.json --noEmit` — clean.
3. Start backend + frontend, load a VRM character, trigger gestures via chat (Kokoro), watch idle:
   - No foot-slide / ground penetration / hip float / loop-seam jitter.
   - 60fps on M2 Pro (FPS overlay).
   - Spring-bone hair/cloth still simulates (not frozen by clip tracks).
   - Light + dark theme both correct.
4. Before/after screenshots committed to `docs/testing/screenshots/2026-05-31-retarget-proof/`.
5. Retarget findings written to `docs/research/2026-05-31-retarget-pipeline.md`.

## Open risks
- **Grounding/foot-slide** is the make-or-break of Stage 1 and historically fragile — budget real time for it, verify visually every step.
- **Clip sourcing** is thin: only SillyTavern git + jsdelivr VRMA auto-download; Mixamo is manual; CMU/100STYLE/LaFAN1 dead. Curate a small proven set, don't chase "100 clips."
- **Two filenames** for the library (`animation_manifest.json` vs `animation_library.json`) — reconcile to one in Step 1.3.

---

# Follow-up Execution Plan (2026-05-31 cont.) — Finish VRM Retarget → Library → Kokoro Wiring

## Where we are now (this session's outcome)

Stage 1 is largely done and committed on `feat/avatar-motion` (10 commits): the clip→VRM pipeline is **proven** (fixed the colon-stripped-bone-name no-op; Xbot Y-up walk renders grounded + cycling), `loadClip` selects by name, the Blender FBX→GLB bake infra works, and **28/28 Mixamo clips were browser-downloaded** (`tools/mixamo_grab.mjs` → `~/Downloads/mixamo-fbx/`).

The remaining blocker is the **Mixamo→VRM retarget**. A runtime bone-name remap can't work (Mixamo is Z-up/cm with different rest orientations — 4 coordinate fixes all failed). Pivoted to retargeting onto the VRM's own rig in Blender (`tools/blender/retarget_to_vrm.py`, rest-relative formula). That **validated the approach — produced an upright, recognizable walk** — but has two WIP bugs that block batching.

This follow-up fixes those bugs, batches the library, and wires it into Kokoro. **Three phases; Phase C is gated on Phase B looking good visually.**

## Constraints (unchanged)
- Avatar grounding is a Known Sensitive Area — **visually verify every clip** via `tools/verify/render_clip.mjs --frames 4`, never trust the math.
- **Never edit `viewer.html` and `viewerStore.ts` in the same commit** (tightly coupled).
- One commit per sub-step; pytest + tsc green between steps.

## Phase A — Fix the VRM-rig retarget bake (the blocker)
All in `tools/blender/retarget_to_vrm.py` `_bake_rest_relative()` (~lines 177–193).
- **A1 — Stale per-frame source read (root cause of "idle == walking").** After `scene.frame_set(f)` the Mixamo pose isn't re-evaluated, so `mix_pb[mx].matrix` (line 180) returns the rest pose every frame → every clip bakes near-identical motion. Fix: read from the **evaluated depsgraph** — `deg = bpy.context.evaluated_depsgraph_get(); mev = mix_arm.evaluated_get(deg); src = mev.matrix_world @ mev.pose.bones[mx].matrix` — and/or `bpy.context.view_layer.update()`. Likely also resolves most forearm/limb weirdness.
- **A2 — Parent→child propagation.** Setting `pbone.matrix` parent-first (line 187) needs the parent's new matrix live before the child; add `view_layer.update()` between sets, or compute the child's local `rotation_quaternion` directly from the parent's posed world matrix. Rotation-only; preserve rest translation.
- **A3 — Drop the leftover source action + mesh** (stray `Armature.001|mixamo.com|Layer0`) so only the named action exports; optionally export armature-only to shrink files.
- **A4 — Re-verify (gate).** Re-bake `walking`/`idle`/`waving`/`thinking`, render each `--frames 4`: distinct motion (hash + visible), upright, grounded, no gross clipping. If forearm twist persists after A1–A2, drop the lower-arm/hand pairs or surface it — **do NOT spiral (hypothesis limit)**.

## Phase B — Batch the library
- **B1** — `tools/retarget_library.py` (mirror `tools/bake_animation.py`): locate Blender, run `retarget_to_vrm.py` per FBX in `~/Downloads/mixamo-fbx/` against `backend/storage/avatars/Raine.vrm` → `backend/storage/animations/vrm-baked/<slug>.glb`.
- **B2** — Batch 28, spot-verify 6 (`idle`, `walking`, `waving`, `thinking`, `sitting`, `pointing`).
- **B3** — Baked clips are VRoid `J_Bip_*` space → play on any VRoid VRM; procedural is the fallback for non-VRoid rigs.

## Phase C — Wire Kokoro gesture → baked clips (Step 1.4) *(gated on B2)*
Integration: `viewerStore.ts` `dispatchKokoroEmbodiment` (line 469) → `dispatchGesture` (line 447), currently posts `trigger_gesture` (procedural). Viewer exposes `loadAnimation`/`playAnimation` (`viewer.html:9134/9157`).
- **C1** — Gesture→clip map: 8 Kokoro gestures (`response_parser.py:34`) → baked names (wave→waving, thinking→thinking, point→pointing, hands_clasped→hands_forward_gesture, heart→blow_a_kiss, small_nod→head_nod_yes; tilt_head → procedural fallback).
- **C2** (separate store vs viewer commits) — in `dispatchGesture`, if mapped, post `loadAnimation` (cache in a `Set`) + `playAnimation` of `/files/animations/vrm-baked/<clip>.glb`; else fall back to `trigger_gesture`. **Default: augment + procedural fallback**, not replacement.
- **C3** — Keep procedural `noise1D` idle (already organic); don't override idle this pass.
- **C4** — Vitest: mapped gesture loads+plays clip; unmapped fires `trigger_gesture`.
- **C5** — In-app: chat-trigger gestures → real mocap clips play, idle resumes.

## Open risks / decisions
- Forearm-roll clipping may survive A1–A2 → drop lower-arm/hand pairs or defer.
- Per-VRM baking: clips are Raine-baked (VRoid space); revisit for non-VRoid VRMs.
- Augment-vs-replace gestures (C2): defaulting to clip-with-fallback; reversible via the map (`null` forces procedural).

## Follow-up status log

- **2026-05-31 Phase A: ✗ premise was a MISDIAGNOSIS — real blocker is upstream.** The
  documented "depsgraph bake bug" (A1) does not exist: `scene.frame_set(f)` already syncs the
  source datablock pose (probed — original == evaluated-depsgraph read, identical per frame).
  The bake itself is correct (target pose varies per frame; clean `anims=1` export). The
  reason "idle == walking" is that **all 28 FBX in `~/Downloads/mixamo-fbx/` are the SAME
  animation** — `tools/mixamo_grab.mjs` downloaded one clip 28× under 28 names (proved:
  `idle/jumping/sitting` source curves byte-identical to `walking`; files differ only in
  ~0.9% metadata bytes). Full evidence + grab-bug hypotheses (H1 search-not-filtering /
  H2 tile-click-not-registering) in `docs/research/2026-05-31-mixamo-duplicate-downloads.md`.
  - **Kept:** A3 (purge stray Mixamo source action → single clean exported clip) + a
    `--retarget` flag on `render_clip.mjs` (baked J_Bip-space clips must skip re-retarget).
  - **Reverted:** A1 (evaluated-read) + A2 (per-bone `view_layer.update`) — fixed a non-bug,
    added cost, no render benefit. Bake loop is back to its known-good form.
  - **Validated:** `walking.glb` renders upright + grounded + mid-stride (5/5 distinct frames,
    `docs/testing/screenshots/2026-05-31-vrm-retarget/`). Pre-existing forearm/hand distortion
    remains (deferred per hypothesis limit — needs distinct clips to evaluate against).
  - **Phase B is BLOCKED** until distinct clips exist. **Next action (needs user):** relaunch
    a headed Chrome logged into Mixamo (CDP :9222), re-run the grab watching the first terms to
    pick H1 vs H2, fix, re-grab (the new duplicate-size guard will flag recurrence). Then B → C.
