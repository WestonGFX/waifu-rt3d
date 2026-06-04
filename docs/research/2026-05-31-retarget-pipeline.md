# Retarget Pipeline — Reality Check & Findings

**Date:** 2026-05-31
**Context:** Stage 1.1 of `docs/plans/2026-05-31-avatar-motion-staged.md` — prove the clip→VRM retarget pipeline on ONE real clip before building a library or wiring on-the-fly motion.
**Status:** Sourcing solved · grounding gap identified · visual verification harness pending.

---

## TL;DR

Three plan assumptions were wrong and are now corrected:

1. **Every documented auto-download animation source is dead.** Not "mostly working" — *all* of them 404.
2. **VRMA loading is unsupported by the bundled library.** The viewer's VRMA code path is dead aspirational code; the shipped `three-vrm.module.min.js` contains zero VRMAnimation symbols.
3. **The retarget logic is insufficient for clean grounding** — it renames bone tracks but keeps every `translation` track, which stretches the VRM rig and causes foot-slide. This is the real Stage 1 work the plan predicted.

A working clip source is now wired (`threejs-mixamo` pack) and real assets are on disk.

---

## Finding 1 — All auto-download sources are dead (verified)

`tools/download_animation_packs.py` advertised six packs. Probed every URL on 2026-05-31:

| Pack | URL | Result |
|---|---|---|
| sillytavern | `github.com/SillyTavern/SillyTavern-VRM-Assets.git` | **404** — repository removed |
| vrm-expression-library | `cdn.jsdelivr.net/gh/pixiv/three-vrm@dev/.../examples/animations/` | **404** — repo restructured, path gone |
| cmu | cgspeed.com | manual only (always was) |
| 100style | ianmason.com | manual only |
| lafan1 | ubisoft releases | manual only |
| procedural-emotions | n/a | runtime-generated (motion_server) |

**Fix applied:** added a `threejs-mixamo` pack pointing at three.js's own example GLBs (verified HTTP 200, jsdelivr-backed, stable), and annotated the dead sources in the tool. Run: `.venv/bin/python tools/download_animation_packs.py --pack threejs-mixamo`.

---

## Finding 2 — VRMA is not supported by the current bundle

`frontends/shared/viewer/viewer.html`:
- Line 83–91 import map exposes only `three`.
- Line 94 imports `{ VRMLoaderPlugin, VRMUtils }` from `/shared/lib/three-vrm.module.min.js`.
- Line 2992 registers **only** `VRMLoaderPlugin` on the clip GLTFLoader.
- Lines 3000–3002 read `gltf.userData.vrmAnimations` (populated only by `VRMAnimationLoaderPlugin`, which is never registered) and fall back to `gltf.animations`.

`grep` of `three-vrm.module.min.js` (145 KB) finds **no** `VRMAnimationLoaderPlugin`, `createVRMAnimationClip`, or `VRMAnimation` — the bundle is core three-vrm only. A `.vrma` therefore can't be turned into a clip targeting the loaded VRM; it silently degrades to raw node-index tracks (broken).

**Implication:** the supported animation path *today* is **GLB with Mixamo/BVH bone names → `retargetClip`**, not VRMA. Adding VRMA support is a separate task: vendor `@pixiv/three-vrm-animation`, register the plugin, call `createVRMAnimationClip(vrmAnimation, vrm)`. Deferred — GLB-Mixamo is enough to prove Stage 1.

---

## Finding 3b — THE root-cause bug: colon-stripped bone names (found via render test)

Headless render testing (Playwright + Chromium, `tools/verify/render_clip.mjs`) exposed the
real problem, which is bigger than the translation theory below:

**`retargetClip` has always been a silent no-op for GLB Mixamo clips.** three.js's
GLTFLoader sanitizes node names in animation-track bindings and **strips the colon**:
a bone exported as `mixamorig:Hips` arrives in the clip as track `mixamorigHips.quaternion`
(no colon). But `MIXAMO_BONE_MAP` keys keep the colon (`'mixamorig:Hips'`), so the literal
lookup `MIXAMO_BONE_MAP[boneName]` matched **nothing** — every track fell through unchanged,
targeting `mixamorigHips` nodes that don't exist in the VRM → the clip played as a pure no-op
and the avatar sat in its rest pose. (The contorted first render was the *entrance* animation,
not retarget distortion — a second red herring.)

**Fix applied** (`viewer.html` `retargetClip`): build a normalization-keyed lookup
(`s.replace(/[^a-z0-9]/gi,'').toLowerCase()`) so `mixamorigHips`, `mixamorig:Hips`, and
case variants all resolve. After the fix, the same Xbot clip retargets **25 rotation/hips
tracks + drops 47 translation/scale** per clip (201→154 tracks) and the avatar renders in a
clean, grounded, undistorted pose. Visual proof:
`docs/testing/screenshots/2026-05-31-retarget-proof/clip-walk.png`.

## Finding 3 — The grounding gap (the real work)

Real clips obtained: `Xbot.glb` (agree, headShake, idle, run, sad_pose, sneak_pose, walk) and `Soldier.glb` (Idle, Walk, Run). Parsed track structure:

- Each clip animates **all ~67 bones** with **`translation` + `rotation` + `scale`** tracks (Xbot: 201 channels = 67×3).
- Hips carry **translation** including forward locomotion (root motion) on walk/run.

`ClipLayer.retargetClip()` (`viewer.html:2908–2936`) **only renames** `track.name`; it does not drop any track. `stripSpringBoneTracks()` (`:2948`) removes only spring-bone tracks. So after retarget, the VRM receives:
- **Non-hips translation tracks** → bones get pushed to Mixamo's bone *lengths/offsets*, which differ from the VRM's → **rig stretch/distortion**.
- **Hips translation with root motion** → character **drifts/foot-slides** instead of animating in place.
- **scale tracks** → usually 1.0, harmless but noise.

**Correct fix (standard three-vrm retargeting):** VRM humanoid motion is **rotation-only, plus hips translation**. `retargetClip` should drop translation tracks for every bone except hips, and drop scale tracks. For in-place looping idles/gestures, also normalize/zero hips horizontal translation (keep vertical bob) to kill foot-slide. Hip-height scaling (VRM hips height ÷ source hips height) keeps feet on the floor across differently-proportioned rigs.

This is the change that makes the difference between "robotic but grounded" and "real humanoid that stays on the floor." It is deterministic and unit-testable on the track data, but final acceptance is **visual** (no foot-slide / no stretch) and must be screenshot-verified.

---

## What's proven vs. pending

| Item | State |
|---|---|
| Live clip source wired + assets on disk | ✅ done (`threejs-mixamo`) |
| Clip track structure understood (root motion, translation tracks) | ✅ done |
| VRMA path is dead-code (documented) | ✅ done |
| `retargetClip` translation-strip + hip-height fix | ⏳ next (touches sensitive `viewer.html`) |
| Visual render proof (clip on a VRM, no foot-slide) | ⏳ needs Playwright headless harness (Chromium is installed locally) |

## Finding 4 — Blender FBX→GLB bake pipeline (Stage 1.3a, DONE)

The single biggest unlock for "realistic movement": **Mixamo** is the largest free
humanoid-mocap source, but it exports **FBX**, which three.js / the browser cannot load.
Headless Blender bridges the gap.

- `tools/blender/bake_clip.py` — bpy worker (runs as `blender --background --python`):
  imports FBX/GLB, optionally zeroes hips horizontal translation (`--in-place`, so
  locomotion loops without drifting), cleans FBX-mangled action names
  (`Armature|Armature|walk_Armature` → `walk`), and exports GLB with `mixamorig:` bone
  names preserved so the viewer's runtime retarget consumes it directly.
- `tools/bake_animation.py` — launcher that auto-locates Blender (`$BLENDER` / PATH /
  standard install dirs) and bakes one file or a whole folder of Mixamo downloads into
  `backend/storage/animations/baked/`.

Verified end-to-end with Blender 4.0: GLB→GLB and FBX→GLB both bake (7 actions, root
motion zeroed), clip names come out clean, and the baked walk clip retargets (154
tracks) and renders grounded on the VRM via the harness. The FBX path was proven by
round-tripping Xbot.glb → FBX → GLB.

**Why keep BOTH runtime retarget and the Blender bake:** runtime retarget (now fixed)
handles GLB/VRMA clips already on disk; the Blender bake unlocks the FBX-only Mixamo
library and produces cleaner in-place loops once. They share the same VRM target rig.

## Finding 5 — Mixamo→VRM needs rig retarget, not runtime bone-copy (partial)

Driving real Mixamo FBX clips through the bake exposed that a runtime bone-name remap
cannot work for Mixamo→VRM: Mixamo is Z-up + cm with different rest-pose bone
orientations/rolls than a VRoid VRM. Four runtime/bake-coordinate fixes were tried and
all failed (folded 90°, ejected ~100m off-camera via the −104cm Z hips, upside-down after
`transform_apply`, splayed limbs). The three.js **Xbot.glb** (already Y-up, authored to
match) retargets fine — confirming the *runtime* path is correct and the gap is purely the
Mixamo source frame.

**Chosen fix (user): retarget onto the VRM's own rig in Blender** —
`tools/blender/retarget_to_vrm.py`. Loads the VRM via the glTF importer (a .vrm *is* glTF;
no VRM addon needed — VRoid bones are `J_Bip_*`), imports the Mixamo FBX, and applies the
**rest-relative** retarget formula per bone:
`tgt_pose = (src_pose · src_rest⁻¹) · tgt_rest` (rotation only), baked frame-by-frame,
exported as a GLB in VRM bone-space that plays directly on any VRoid-named VRM.

**Progress (validated):** this produces an **upright, recognizable walk** — legs mid-stride,
arms down at the sides, grounded. That is a decisive step past every earlier failure mode.

**Open issues (WIP — stopped here per the hypothesis limit, needs a focused follow-up):**
1. Forearm/hand twist + mesh self-clipping (lower-arm bone-roll on the rotation-only delta).
2. Suspected bake bug: `idle.glb` and `walking.glb` came out with an identical
   `J_Bip_L_UpperLeg` rotation range — leg motion not varying per source clip. Investigate
   whether the leftover `mixamo.com` source action is bleeding into the bake, or the
   per-frame `pbone.matrix` set order is wrong, before batch-processing all 28.
3. Fingers/twist bones not mapped (left at VRM rest) — usually fine, revisit if hands read odd.

## Status
- Stage 1.1 (prove pipeline) — **DONE**, runtime retarget fixed, visual proof (Xbot).
- Stage 1.3a (Blender bake tooling) — **DONE**, FBX+GLB verified.
- Stage 1.3b (curated 20–40 clip library) — pending the user's Mixamo FBX downloads;
  drop them in a folder and run `tools/bake_animation.py --in-dir <folder> --in-place`.
- Stage 1.2 (idle easing) — re-scoped: idle already uses `noise1D` (organic), not raw
  sine; no rewrite warranted. Optional future win: a retargeted mocap idle *loop*.
- Stage 1.4 (Kokoro gesture → clip wiring) — next, once a gesture clip set is baked.

---

## Finding 6 (2026-05-31, cont.) — Arm retarget is broken for large arm rotations

After fixing the duplicate-download bug (28 distinct clips re-grabbed — see
`2026-05-31-mixamo-duplicate-downloads.md`), baked + rendered real gesture clips and found a
genuine retarget-math bug isolated to the **arms**.

**Symptom:** On arm-centric clips (waving), the arms **splay outward toward the Mixamo T-pose**
with the forearms/hands collapsed into spiky geometry — instead of following the animated wave.
This is exactly the "snapping to absolute Mixamo orientations leaves arms splayed" failure the
rest-relative formula was meant to prevent. Legs, torso, hips, and head retarget correctly; the
walk clip renders upright + grounded + mid-stride. The bug is **arm-specific.**

**Why arm-specific (hypothesis for next session, NOT yet confirmed):** Mixamo's rest is a T-pose
(arms horizontal); VRoid/Raine's rest is an A-pose (arms angled down). Legs/torso rest
orientations nearly match between the two rigs, so any formula error is invisible there; the arms
have a large rest-orientation gap that exposes it. The rendered arms sitting near the *source*
T-pose orientation suggests `want_world ≈ src_pose_world` (absolute) rather than
`delta @ tgt_rest` — i.e. `tgt_rest[vr]` or the delta is not being respected for the arm chain.

**Hypotheses tested + ruled out (hypothesis limit reached — stopped per project rule):**
1. Full 22-bone retarget → arms distorted.
2. Drop hand pairs (`J_Bip_*_Hand`) → forearms still distorted.
3. Drop forearm + hand pairs → arms *still* distorted (so the **upper arm** is the wrong part,
   not the wrist/hand — amputating the lower chain cannot fix an upper-arm orientation error).
4. Headless-harness artifact? → **No.** Rendered in real Chrome at true 60fps (spring bones allowed
   to settle); the splay persists identically. Not a frame-dt / spring-bone instability artifact.

**Screenshots:** `docs/testing/screenshots/2026-05-31-vrm-retarget/`
(`clip-waving*` headless, `realchrome-waving-*` real Chrome, `baseline-idle` = clean rest pose).

**Next session (focused, single hypothesis):** pick the L/R UpperArm at one wave frame, hand-compute
the expected VRoid-space rotation from the source delta, and compare to what
`_bake_rest_relative` produces — isolate whether the bug is in `delta`, `tgt_rest`, or the
armature-space conversion (`vrm_world_inv @ want_world`). Likely a rest-frame / basis issue that
only manifests when the rest-orientation gap is large. Candidate fixes: compute the target's local
rotation relative to its parent's posed frame directly, or use a Copy-Rotation constraint bake
(`bpy.ops.nla.bake(visual_keying=True)`) which resolves cross-rig frames natively.

**Pipeline status:** the clip→VRM→GLB→viewer path is fully proven end-to-end. Locomotion/idle
(leg+torso-dominant) clips are shippable now. **Arm-dominant gesture clips are blocked on the
arm-retarget fix** — do NOT wire arm gestures (wave/point/thinking/heart/clap) to baked clips until
this is resolved. `SKIP_TARGET_BONES` in `retarget_to_vrm.py` is left empty (amputation rejected).

### Finding 6b (2026-05-31, cont.) — formula A vs B both fail; needs a constraint bake

Derived and tested the two candidate rotation-retarget formulas on the now-distinct clips
(rendered in real Chrome + headless; `fixB_*` screenshots):

- **Formula A** (committed) — world-space pre-multiplied delta: `want = src_pose @ src_rest⁻¹ @ tgt_rest`.
  Waving → arms splay outward toward the Mixamo T-pose (catastrophic). Legs/torso fine.
- **Formula B** — rest-offset / local-frame: `want = tgt_rest @ src_rest⁻¹ @ src_pose` (= `C @ src_pose`,
  `C = tgt_rest @ src_rest⁻¹`). Waving → arms correctly raise (FIXED). Thinking → ok. **But**
  pointing → legs bend up; walking → arms overhead. Trades the wave-splay for other-clip breakage.

Why neither works: Mixamo and VRoid differ in BOTH rest pose (T vs A) AND per-bone local axis
convention (roll). A pure rotation copy can correct for one rig-difference but not both at once
across all clips. The tell: **every animated clip shows dark-red shading on the distal limbs
(forearms, shins)** — backfaces/inverted normals from the skin deforming past what its weights
support, i.e. the bone orientations are wrong enough to evert the mesh. The baseline rest pose is
clean, so it is purely a retarget-orientation artifact, not the model.

**Hypothesis limit reached** (formula A, formula B, bone-amputation = 3 approaches). Stopping per
project rule rather than trying a 4th hand-rolled variant.

**Recommendation — switch to a constraint-based bake (the module's original stated intent).**
Replace the manual matrix math in `_bake_rest_relative` with: add **Copy Rotation** constraints
from each VRoid bone to its Mixamo counterpart (with the correct target/owner space + per-bone
rest-offset that Blender computes natively), then `bpy.ops.nla.bake(visual_keying=True,
clear_constraints=True, bake_types={'POSE'})`. Blender's constraint system resolves cross-rig
rest + roll differences that the closed-form rotation copy keeps getting wrong. This is a focused
single-session rewrite of one function — NOT more formula tweaking. Alternative: an established
retarget addon (Rokoko / Auto-Rig-Pro) if constraint tuning proves fiddly.

**Code left at committed baseline (formula A).** Formula B was reverted — it is more principled and
fixes waving, but introduces walking/pointing regressions, so it is not a clean win to commit.
Both formulas are captured here for the next session.

## Finding 7 (2026-06-03) — The bake had a stale-parent chain bug; the *render* break is a SEPARATE viewer-runtime bug

Two bugs were conflated under "arm splay." Deterministic Blender probes (`tools/blender/_probe_chain.py`,
`_probe_exported.py`) separated them.

### Bug 1 (FIXED) — bake loop posed children against stale parents
`_bake_rest_relative` set every mapped bone's `pose_bone.matrix` in one pass, then keyframed in a
second pass, with **no `view_layer.update()` between bone sets**. `pose_bone.matrix` is a world-space
setter that back-solves the bone's *local* rotation against its parent's **current** matrix. With no
update between sets, each child solved against its parent's **rest** (stale) matrix and absorbed the
parent's rotation on top of its own. Error compounds down the chain.

Measured at the extreme wave frame (`_probe_chain.py`, L-arm chain, source upper-arm delta 82.7°):

| bone | world-delta err, no update (old) | with per-bone update (fix) |
|---|---|---|
| L_Shoulder | 0.04° | 0.04° |
| L_UpperArm | **71.60°** | **0.00°** |
| L_LowerArm | **118.91°** | **0.00°** |
| L_Hand | **145.01°** | **0.00°** |

Invisible on legs (hips barely rotate → tiny stale-parent error) — which is why "formula A passed
legs / failed arms." It was never a formula problem: single-bone formula A is exact (`_probe_arm`
earlier: 0.000° invariant error). The earlier "A2 view_layer.update gives no benefit → reverted"
conclusion was drawn on the **duplicate-clip** data (all 28 FBX identical near-static idle, arms barely
moving) so the benefit was below the noise floor.

**Fix:** one `bpy.context.view_layer.update()` after each `pose_bone.matrix` set in the bake loop.
Bake cost ~4–6s/clip (22 bones × ~45 frames). `_probe_exported.py` confirms the **exported GLB** also
carries the correct motion (J_Bip_L_UpperArm peaks 82.7° about axis (+0.97,+0.23,+0.07) = arm-raise).
So **bake ✓ and export ✓, both proven numerically.**

### Bug 2 (OPEN — the actual render blocker) — raw vs normalized VRM bone space in the viewer
With the bake provably correct, the **rendered** clip is still distorted: arms spiky, dark-red
backface eversion on distal limbs (forearms/shins). Crucially, the OLD formula-A walking render
(`docs/testing/screenshots/2026-05-31-vrm-retarget/clip-walking-f2.png`) shows the **same** distortion
— the "grounded mid-stride" claim only ever described the legs being roughly upright; the arms were
always broken. So the render break is independent of the bake fix and lives in the three.js viewer.

Mechanism (read-only confirmed in `frontends/shared/viewer/viewer.html`):
- The clip mixer binds to `vrm.scene` (`viewer.html:2854`).
- The runtime retarget path renames tracks to **normalized** bone nodes via
  `humanoid.getNormalizedBoneNode(...)` (`viewer.html:2881–2886`).
- A **baked** clip loaded with `retarget:false` keeps **raw** glTF-node names (`J_Bip_*`). Those are
  raw-space local rotations applied where `@pixiv/three-vrm` expects **normalized**-space rotations
  (normalized bones have identity world rest; VRoid raw bones have the A-pose rest). The per-bone rest
  offset is exactly what everts the mesh.

**Why a pure track-name rename (J_Bip_* → normalized node) is NOT enough:** raw-local and
normalized-local rotations differ by each bone's rest orientation, so the rename needs an accompanying
**rest-space conversion** (`q_normalized = R_rest⁻¹ · q_raw · R_rest`-style, per bone), or the clip
must be baked directly in normalized space. This is a viewer.html change in the #1 regression hotspot
(avatar grounding/animation) and was deliberately **not** attempted this session (one-attempt /
hypothesis-limit discipline; needs its own focused session).

### Status after this session
- **Bake pipeline: FIXED and proven** (`tools/blender/retarget_to_vrm.py`). Re-baking any of the 28
  distinct Mixamo clips now produces a correct VRoid-space GLB.
- **Phase B (batch 28): unblocked on the bake side** but pointless to ship until the clips render
  correctly.
- **Phase C (Kokoro gesture→clip): still blocked** on Bug 2 (the viewer raw/normalized fix).
- **Next session, single focused hypothesis:** add a normalized-space conversion to the baked-clip
  load path in `viewer.html` (new `vrmBaked` load mode that maps J_Bip_* raw tracks → normalized bone
  nodes WITH per-bone rest conversion), OR bake directly into normalized space in
  `retarget_to_vrm.py`. Verify with `tools/verify/render_clip.mjs --retarget false` on waving (arm)
  + walking (leg) + pointing. Pass = no dark-red eversion, arms follow the wave.
- Evidence screenshots: `docs/testing/screenshots/2026-06-03-arm-fix/` (post-bake-fix renders, still
  showing Bug 2). Probes: `tools/blender/_probe_chain.py`, `_probe_exported.py`.
