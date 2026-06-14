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

- **2026-05-31 (cont.) — re-grab DONE; arm-retarget bug now the blocker.** User said "do it all
  agentially." Re-launched the still-logged-in Chrome profile over CDP, inspected the live DOM:
  the search box selector was correct but Mixamo **does not filter without an Enter keypress**
  (H1 confirmed, H2 refuted). Fixed (`mixamo_grab.mjs` + `search.press('Enter')`, commit
  `f38db03`) and re-grabbed **28 distinct clips** (27 distinct sizes, 28 md5; old dupes at
  `/tmp/mixamo-fbx-dupes-backup/`).
  - **New blocker — arm retarget is broken for large arm rotations.** Baked + rendered real
    gesture clips: arms splay toward the Mixamo T-pose with spiky forearms/hands; legs+torso+walk
    are perfect. Confirmed a real retarget-math bug (persists in real Chrome at 60fps — not a
    harness artifact) and isolated to the **upper-arm** chain (dropping forearm/hand didn't fix
    it). Hypothesis limit reached — stopped. Full evidence + next-session debug plan in
    `docs/research/2026-05-31-retarget-pipeline.md` (Finding 6).
  - **Phase B (batch 28):** deferred — batching now produces 28 clips with broken arms. Locomotion/
    idle clips (walk/run/idle) are usable; arm-gesture clips are not.
  - **Phase C (Kokoro gesture→clip wiring):** deferred — most Kokoro gestures are arm-centric
    (wave/point/thinking/heart/clap), so wiring them to broken-arm clips would regress the avatar.
    Wire only after the arm-retarget fix lands. Procedural gestures remain the live path meanwhile.
  - **AIE rethink (parallel track):** done as analysis → `docs/research/2026-05-31-aie-12-module-consolidation.md`.
    Answer: don't consolidate; the AIE's dead modules are a 3-missing-wires problem. Spec written;
    NOT implemented (per-turn sensitive path + AIE is OFF by default under v1-Lite — product call).

- **2026-06-03 Phase A: bake bug FIXED (real root cause found) — render still blocked on a SEPARATE viewer bug.**
  Deterministic Blender probes split the conflated "arm splay" into two bugs. (1) The bake posed child
  bones against stale parents (no `view_layer.update()` between `pose_bone.matrix` sets) → chain error
  compounded 0°→72°→119°→145° down the arm; invisible on legs (hips barely rotate). One-line fix
  (per-bone `view_layer.update()`); bake AND export now provably correct (upper-arm peaks 82.7°,
  matching source, in both Blender and the exported GLB). NOT formula A/B — both were red herrings.
  (2) The render is STILL distorted because the viewer applies the baked clip's **raw** `J_Bip_*` local
  rotations where `@pixiv/three-vrm` expects **normalized**-space rotations (rest-offset eversion = the
  dark-red distal-limb backfaces). Confirmed read-only in `viewer.html` (mixer on `vrm.scene`:2854;
  retarget path renames to normalized nodes:2881). Bug 2 needs a rest-space conversion in viewer.html
  (#1 sensitive area) — deferred to a focused session per hypothesis limit. Full evidence:
  `docs/research/2026-05-31-retarget-pipeline.md` Finding 7. Probes kept: `tools/blender/_probe_chain.py`,
  `_probe_exported.py`. Phase B unblocked on bake side; Phase C still blocked on Bug 2.

- **2026-06-08 Bug 2 lanes explored — Lane 1 abandoned, Lane 2 scoped (not shipped), AI-motion research dispatched.**
  User picked Lane 1 (route baked clips via the proven runtime retargetClip path). On implementation it
  collapsed: retargetClip applies clip local quaternions AS-IS to normalized VRM bones, so it needs
  Xbot-style identity bone rests; Mixamo rests (UpLeg 180°, shoulders 120°) are intrinsic and no import
  flag neutralizes them (GLB node-rotation dump proved it). So "fix the root axis" = full rest surgery,
  not a flag → abandoned honestly (Finding 8). Traced Lane 2 (normalized bake): needs BOTH normalized
  track names AND normalized-space values; the canonical-frame constant must be measured via a three-vrm
  ground-truth harness, not guessed (Finding 9) → scoped with a spiral-proof next-session recipe, NOT
  shipped (a guessed conversion = broken bake #3). Bug 1 (bake chain) remains fixed + committed (49d9011).
  Commits this session: 49d9011, f331be4, 3040f33. AI-motion-model research (Stage 3 refresh) dispatched
  to a background agent → docs/research/2026-06-08-ai-motion-models.md. NET: bake pipeline correct; Bug 2
  is the sole remaining blocker for arm-gesture clips, fully scoped; Phase B/C still gated on it.

- **2026-06-08 Stage 3 (AI motion) picks refreshed from research** — see `docs/research/2026-06-08-ai-motion-models.md` (+ deep/wide Addendum). Replaces the stale MotionLCM/MoMask plan picks:
  - **General motion (text→motion): DART** (Apache-2.0, real-time streaming, outputs SMPL rotations → no IK). Prototype first on the RTX 5080. Same-lineage complements: CAMDM (60+FPS, the only one with an Apple-Silicon claim), CLoSD (streaming, but needs a physics sim in the loop). MLD = portable fallback.
  - **Co-speech gesture (gesture WHILE talking): EMAGE** — best fit for us as a voice companion (body language synced to speech, outputs SMPL-X+FLAME rotations). ⚠ **trained on non-commercial BEAT2 data → prototype-only until retrained on a commercial corpus.** Real-time sibling: DiffSHEG.
  - **Not usable:** Bernini (ByteDance, the video's "full body waifus") + StreamChar (Alibaba) are **2D reference→video** generators, NOT 3D skeletal motion — cannot drive the three-vrm rig. Marketing-clip value only.
  - **No model runs in-browser today** (no ONNX/WebGPU/transformers.js packaging) → motion generation stays server-side. All benchmarks are CUDA; Apple-Silicon/MPS perf unverified.
  - **Shared prerequisite:** all of the above output bone rotations that must be injected onto the VRM normalized rig — i.e. they ALL depend on the same Bug-2 rotation-injection harness scoped today (Findings 7–9). Solve Bug 2 once → unblocks both Mixamo clips AND AI motion.

- **2026-06-11 — Bug 2 CLOSED (Lane 2 via GLB post-process); Phase B/C UNBLOCKED.** Followed
  Finding 9's recipe exactly: (1) built `tools/verify/ground_truth.mjs` — measured three-vrm's
  normalized↔raw contract in the real viewer with 0° error (bind == T-pose, Probe D = keystone);
  (2) the conversion algebra collapses to a constant per-bone sandwich entirely in glTF space —
  no Blender frame constant exists to guess; (3) shipped `tools/convert_to_normalized.py`
  (pure-Python GLB post-converter, 10 pytest) + additive `VRM_BONE_MAP` in viewer.html;
  (4) render gate PASSED on waving/walking/pointing — arms track the motion, grounded, zero
  eversion (`docs/testing/screenshots/2026-06-11-normalized-gate/`). Commit `7885320`. Full
  evidence: retarget-pipeline.md Finding 10. NEXT: Phase B batch (re-bake stale idle/thinking +
  25 more via `tools/retarget_library.py`, convert, spot-verify 6) → Phase C Kokoro wiring
  (C1 map, C2 store dispatch — separate commits from viewer.html).
- **2026-06-13 Phase B: ✓ DONE — full 28-clip normalized library built; closes the Phase C 404 gap.**
  Discovered Phase C (`f88fa90`) wired `KOKORO_GESTURE_CLIPS` to fetch
  `/files/animations/vrm-baked/<stem>.normalized.glb` (retarget:true), but only 5 stale
  normalized clips existed on disk (01:54 pre-chain-fix bake) and 3 of the 6 mapped gestures
  (`hands_forward_gesture`, `blow_a_kiss`, `head_nod_yes`) had NO normalized file — so half of
  Kokoro's gestures 404'd. The 28 RAW bakes (02:0X Jun 11) were already present; ran
  `tools/convert_to_normalized.py --in-dir backend/storage/animations/vrm-baked` → 28/28
  normalized clips (22 humanoid nodes each, non-humanoid channels stripped), overwriting the
  stale 5 with fresh conversions from the current raws. Render gate PASSED on the 3
  previously-missing gestures: 22/22 tracks retargeted, 4/4 distinct frames, arms track the
  gesture, upright, grounded, zero eversion (`docs/testing/screenshots/2026-06-13-phaseB-gestures/`).
  convert pytest 10/10. Clips are gitignored (per-machine runtime assets — regenerate on other
  boxes via the same two-step bake→convert). NEXT: re-bake idle/thinking from fresh source if a
  visual idle-drift shows; Stage 2 (real 3D location) or Stage 3 (AI motion) per user priority.

---

# Stage 2a Execution Plan (2026-06-13) — Avatar in a Real 3D Location (static environment backdrop)

**Decision (2026-06-13, user):** proceed with Stage 2a. Environment source = **download a CC-licensed GLB scene** (room/cafe), not procedural or Blender-generated. Stage 2b (character navigation) stays out — separate future plan.

## Why / Soul
Replace the transparent void behind the avatar with a real 3D location so the companion feels *somewhere* — a bedroom/cafe she lives in. Warmth over efficiency (project soul). Desktop-only, local assets.

## Current state (measured this session)
- `viewer.html`: `scene.background` is **transparent**; there is **no floor plane, no GridHelper, no environment**. The avatar is grounded purely by its VRM rest pose (`viewer.html:~2977`). A CSS "video background layer" exists behind the canvas but no 3D environment.
- No `environment_url` column on `characters` (schema v88). Needs v89.
- Clip/grounding pipeline (Stage 1) is proven and must not regress — adding a floor/scene lands on the **#1 regression hotspot (grounding + camera framing)**. Visual verification mandatory at every step.

## Constraints
- **viewer.html is sacred** (10+ regressions). Sequential only, no parallel edits. Never commit viewer.html and viewerStore.ts in the same commit (repo rule).
- Grounding: the scene's floor must sit at the avatar's foot level (avatar feet at world y≈0 in VRM rest). Align the GLB so its floor = y0, OR offset the loaded environment so its floor meets y0. Verify feet-on-floor, no float, no penetration.
- One environment at a time. Light + dark theme both checked. 60fps on M2 Pro preserved. Spring-bone hair/cloth must still simulate (environment must not steal the render budget or freeze physics).
- Asset licensing: only CC0 / CC-BY (with attribution recorded). No unlicensed art.

## Phases (each its own commit)
- **P1 — Schema v89:** `characters.environment_url TEXT DEFAULT NULL`. Append-only migrate_to_v89 + dispatch + ceiling bump. pytest test_preflight. *(self / schema-architect)*
- **P2 — viewer.html `loadEnvironment` handler:** postMessage `{type:'loadEnvironment', payload:{url}}` → GLTFLoader the scene, add to scene graph, add a real floor (shadow-receiving), set a soft backdrop, frame camera. `clearEnvironment` to remove. Guard: dispose old environment on reload (no GPU leak). Render-verify grounding. *(self — sacred file, sequential)*
- **P3 — viewerStore `loadEnvironment` command + types:** mirror the existing `loadAnimation` command plumbing (ViewerCommand kind, action, postToIframe). Vitest. *(separate commit from P2)*
- **P4 — backend endpoint + api.ts mirror:** `PUT /api/characters/{id}/environment` (set environment_url) + serve GLB under `/files/environments/`. Mirror the Pydantic response shape into `api.ts`. pytest. *(self — server.py + api.ts together, Pydantic↔TS drift trap)*
- **P5 — source + drop in the art asset:** present 2–3 sourced CC0/CC-BY room GLB candidates (URL + license) for user pick (visual identity = user taste). Place under `backend/storage/environments/`, set on a test character, align floor, full visual gate (light/dark, 60fps, spring bones, grounding). Screenshots committed.
- **P6 — Settings UI:** environment picker in the character/appearance settings (set/clear environment_url). *(ux-architect or self)*

## Open risks
- **Floor alignment** is the make-or-break (mirrors Stage 1 grounding). An arbitrary GLB's floor height is unknown — may need a per-environment y-offset field or auto-detect via bounding box min-y.
- **Render budget:** a heavy room GLB could drop FPS below 60 on M2 Pro. Pick low-poly assets; measure FPS overlay before/after.
- **Camera framing:** adding a room changes what's visible; the existing camera presets may need an environment-aware default. Don't auto-add new UI chrome (repo rule).

## Status log
- **2026-06-13 — Stage 2a planned + approach chosen (download GLB scene). Starting P1 (schema v89).**
- **2026-06-14 — P1–P4 DONE; full pipeline wired + verified end-to-end.**
  - **P1** (`61f0eea`): schema v89, `characters.environment_url`. Idempotent, 187 DB tests pass.
  - **P2** (`c8bb009`): viewer.html `loadEnvironment`/`clearEnvironment` — room GLB behind avatar +
    invisible ShadowMaterial floor at y=0 (grounding anchor) + bbox floor-alignment + leak-safe
    dispose. Camera deliberately NOT reframed (stays on avatar). Visually verified via new
    `tools/verify/render_environment.mjs`: avatar grounds on the room floor with contact shadow,
    room renders behind, clear restores the void. Screenshots `docs/testing/screenshots/2026-06-14-stage2a-environment/`.
  - **P3** (`6c7a634`): `viewerStore.dispatchLoadEnvironment(url|null)` + ViewerCommand kinds. 3 vitest.
  - **P4** (`f652f1b`): `GET`/`PUT /api/characters/{id}/environment` (Pydantic `EnvironmentUpdate`) +
    `api.getCharacterEnvironment`/`setCharacterEnvironment` + `Character.environment_url` mirror + 6 pytest.
    Added `environment_url` to conftest character DDL (test-schema drift). 3120 backend pass, tsc clean.
  - Test asset `backend/storage/environments/test_room.glb` (Blender floor+2 walls) — placeholder; real
    art lands in P5. NOTE: floor reads dark under the 3-point rig (test asset only — real textured room
    will light correctly); watch env lighting in P5.
  - **NEXT — P5:** source 2–3 CC0/CC-BY room GLBs, present for user visual pick, drop in, full gate
    (light/dark theme, 60fps, spring bones, grounding). Then **P6:** Settings environment picker UI.
- **2026-06-14 — P5 DONE (asset sourced + verified); P2 hardened (X/Z centring).**
  - User chose the "lofi cozy" aesthetic. First pick (Chilled Cow Apt) was an EXTERIOR building
    diorama — sealed box, avatar trapped inside → solid-brown render. Diagnosed via wide pullback
    (`screenshots/2026-06-14-stage2a-lofi/wide-pullback.png`). Lesson: preview the thumbnail
    (`static.poly.pizza/<uuid>.jpg`) before downloading — exterior dioramas vs open interiors are
    indistinguishable by name.
  - Hardened `loadEnvironment` (`26a62c0`): centre the room on the avatar in X/Z (bbox centre), not
    just floor-align Y — otherwise the avatar lands in a corner and the camera buries in a wall.
  - Shipped asset: **"Living Room" by Alex Safayan, CC-BY 3.0** (`backend/storage/environments/lofi_room.glb`,
    open-front lofi interior — speakers, couch, plant, rug). Render gate PASSED: avatar grounded on
    the rug with contact shadow, room renders around her, camera framed on avatar, clear/dispose
    restores the void. Proof: `screenshots/2026-06-14-stage2a-lofiroom/`. Attribution recorded in
    `backend/storage/environments/CREDITS.md` (CC-BY — surface in an in-app credits screen at ship).
  - To see it live: restart the backend (picks up P1–P4 code), then set via P6 UI or
    `PUT /api/characters/{id}/environment {"environment_url":"/files/environments/lofi_room.glb"}`.
  - **NEXT — P6:** Settings environment picker (list `/files/environments/*.glb`, set/clear per
    character via `api.setCharacterEnvironment`, call `dispatchLoadEnvironment` on character load).
- **2026-06-14 — P6 DONE + browser-verified; Stage 2a COMPLETE.** 🏠 picker in Model-panel toolbar (user chose Model panel). Live app verification (backend restart + Vite + headless Chrome): dropdown renders, lists No room/lofi room/test room, selecting lofi room loads it, Raine renders in the room. All 11 Stage 2a commits pushed (`61f0eea`→`eeffa9c`). NEXT (future): Stage 2b (navigation, separate plan) or Stage 3 (AI motion, RTX box).
- **2026-06-14 — Stage 2b Phase 1 DONE (separate plan: `docs/plans/2026-06-14-stage2b-p1-click-to-walk.md`).** ✅ Click-to-walk: dev-gated floor-click → turn → walk clip → root translate (1.1 m/s, y grounded) → real raycast collision (floor-pick + forward capsule, stop short of walls) → idle, camera follows. Commits `df6e99f` + `b5c8857` (LOCAL). Render-gate `tools/verify/render_walk.mjs` PASS. Posture hunch was a headless-renderer artifact (upright at 60fps, `render_walk_headed.mjs`). BalanceLayer world-space→root-relative CoG fix. **Phase 2 (deferred):** pathfinding AROUND obstacles (navmesh/A*), run/turn clips, camera follow-distance clamp, then Kokoro-driven destinations.
