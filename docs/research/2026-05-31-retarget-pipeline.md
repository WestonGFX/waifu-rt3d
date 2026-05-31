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

## Next actions
1. Build a Playwright headless harness that serves `viewer.html`, loads a VRM (e.g. `backend/storage/avatars/Raine.vrm`) + an Xbot clip, and screenshots the canvas → real visual evidence for the gate.
2. Implement the `retargetClip` rotation-only + hips-height fix; verify before/after with the harness.
3. Only then scale to the offline Blender bake (Step 1.3).
