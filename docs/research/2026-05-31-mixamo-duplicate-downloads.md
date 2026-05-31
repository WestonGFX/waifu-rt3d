# Mixamo Grab — All 28 FBX Are the Same Animation (Duplicate Downloads)

**Date:** 2026-05-31
**Why:** Phase A of `docs/plans/2026-05-31-avatar-motion-staged.md` set out to fix a documented
"depsgraph bake bug" (`retarget_to_vrm.py` allegedly baking every clip near-identical because
the per-frame source pose read was stale). While verifying the fix, the bake produced four
*byte-identical* clips — which forced a re-examination of the premise.

## TL;DR

The "depsgraph bug" was a **misdiagnosis**. The bake pipeline was never broken. The real
root cause: **all 28 FBX in `~/Downloads/mixamo-fbx/` contain the same animation** — the
CDP browser-grab (`tools/mixamo_grab.mjs`) downloaded one clip 28 times under 28 different
filenames. "idle == walking" was true because `idle.fbx` *is* `walking.fbx`'s motion.

## Evidence (each step independent of the last)

1. **Baked output is byte-identical across clips.** Re-baked `walking/idle/waving/thinking`
   → extracted `J_Bip_L_UpperLeg` rotation keyframes from each GLB → `walking` vs `idle`
   `maxDiff = 0.00000` over 548 float values. Same for arm/head/hand bones. Spread metric
   identical to 3 decimals across all four.

2. **The bake itself is correct.** Instrumented `_bake_rest_relative` to print the target
   `L_UpperLeg` rotation during the walking bake: `f=1 (0.945,-0.284,…)`, `f=69
   (0.823,-0.484,…)`, `f=137 (0.943,-0.165,…)` — the target pose **varies per frame**, so
   the bake transfers motion fine. The export is clean (`anims=1`, 363 channels, 137 keys).

3. **The source read was never stale (A1 hypothesis disproved).** A standalone probe read
   `mixamorig:LeftUpLeg` at frames 1/30/60/90 via three methods — (A) original datablock
   `pose.bones[b].matrix`, (B) evaluated depsgraph, (C) after `view_layer.update()`. **All
   three return identical, animated values.** `scene.frame_set(f)` already syncs the
   original datablock pose. The "evaluated-depsgraph dance" in the plan fixes nothing.

4. **The source FBX are the same motion.** Ran the same probe on `idle.fbx`, `jumping.fbx`,
   `sitting.fbx` → **all return byte-identical `LeftUpLeg` quaternions to `walking.fbx`**,
   all `frame_range 1..137`, all `n_fcurves=520`, all action `Armature|mixamo.com|Layer0`.
   Jumping and sitting should look nothing like walking — yet the source curves are identical.

5. **The md5-differs-but-motion-identical wrinkle, explained.** `cmp -l walking.fbx idle.fbx`
   → only **5,244 of 558,752 bytes differ** (~0.9%), and every file is *exactly* 558,752
   bytes. The differing bytes are FBX metadata (embedded take name, creation timestamp,
   filename string `walking`/`idle`) — not curve data. Confirmed by #4: Blender import
   yields identical poses. Different labels, same animation.

## Root cause in `tools/mixamo_grab.mjs`

Every download exports the animation **currently applied to the Mixamo character preview**.
The loop searches a term, clicks the first result tile (`tile.dispatchEvent('click')`,
line ~100), waits, and downloads. One of these never actually changes the applied animation,
so the character keeps whatever loaded first and all 28 downloads are that clip.

### RESOLVED 2026-05-31 — H1 confirmed, fixed

Re-launched the logged-in Chrome profile (`/tmp/mixamo-chrome-profile`, still authenticated
as "Chris") and inspected the live DOM via Playwright/CDP:

- **H1 confirmed.** Typing "Walking" into `input[placeholder="Search"]` (the selector IS
  correct) did **not** change the grid — it stayed on the unfiltered default tiles (Body
  Block, Double Dagger Stab, Zombie Stand Up, …). So every term clicked the same first
  default tile → 28 copies of one clip. **Fix: `await search.press('Enter')` after typing.**
  Verified live: type+Enter → "Waving" filters to Waving Gesture/Waving/…, "Jumping" →
  Jumping Jacks/Jumping Down/… The grid filters correctly.
- **H2 refuted.** The `dispatchEvent('click')` tile selection works fine (`anySelected:1`
  after the click). It was never the problem.
- **Re-grab succeeded:** 28/28 with the fix; clips are now distinct (27 distinct byte sizes,
  383KB idle → 927KB sitting, 28 distinct md5). Old dupes archived at
  `/tmp/mixamo-fbx-dupes-backup/`.

## Recommendation (next session — needs the user)

1. **Relaunch Chrome headed + logged into Mixamo** with `--remote-debugging-port=9222
   --user-data-dir=/tmp/mixamo-chrome-profile`, on the animation grid.
2. **Re-run the grab with the browser visible** and watch the first 3 terms: does the search
   box filter? does the clicked tile change the character's motion before download? That
   single observation picks H1 vs H2.
3. Apply the fix, **re-grab**, then run the new duplicate-size guard (added to
   `mixamo_grab.mjs` end-of-run summary) — it flags when many downloads share an exact byte
   size, which is the signature of this bug.
4. Only then is **Phase B** (batch-retarget the library) meaningful, and **Phase C** (Kokoro
   gesture → clip wiring) after that.

## Validated this session (independent of the data problem)

- **Bake pipeline proven on the one real clip.** `walking.glb` baked onto Raine's VRM rig
  renders **upright, grounded, recognizably mid-stride** (headless harness, 5/5 distinct
  frames). Screenshots: `docs/testing/screenshots/2026-05-31-vrm-retarget/`.
- **Known remaining bake issue (pre-existing, NOT introduced here):** forearm/hand geometry
  is distorted/twisted (the dark shapes at the hips in the render). This is the
  "forearm-roll clipping + unmapped fingers" already noted in the session handoff. Defer per
  the plan's hypothesis-limit guard until distinct clips exist to evaluate against.
- **Code changes kept:** `retarget_to_vrm.py` — A3 only (purge stray Mixamo source action so
  the glTF ACTIONS exporter ships a single clean clip). `render_clip.mjs` — `--retarget`
  flag so already-baked (J_Bip-space) clips load without a no-op re-retarget. The A1
  (evaluated-read) and A2 (per-bone `view_layer.update`) edits were **reverted** — they
  "fixed" a non-bug, added per-frame cost, and showed no benefit in the render.

## Files referenced

- `tools/mixamo_grab.mjs` — the broken grab (lines 87–113: search + tile-click + download)
- `tools/blender/retarget_to_vrm.py` — the (working) VRM-rig retarget bake
- `tools/verify/render_clip.mjs` — headless render harness (now `--retarget false` for baked)
- `~/Downloads/mixamo-fbx/*.fbx` — 28 files, all the same animation
- `docs/plans/2026-05-31-avatar-motion-staged.md` — the plan whose Phase A premise this corrects
