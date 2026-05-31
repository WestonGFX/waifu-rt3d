# Session Handoff — 2026-05-31 (avatar realistic motion)

## Branch: `feat/avatar-motion` · 10 session commits, all LOCAL (unpushed) · HEAD `5f3f946`
## Test Status: 3104 backend pytest passed · TSC clean
## Active plan: `docs/plans/2026-05-31-avatar-motion-staged.md` → "Follow-up Execution Plan" section (Phase A first)

## TL;DR
Took "can avatar movement look real / is Three.js the only option / can Claude drive Blender + my browser" → a **working realistic-motion pipeline**. Proved clip→VRM retarget (fixed a real silent-no-op bug), built a headless Blender bake, **browser-drove Chrome over CDP to download 28/28 Mixamo clips**, and validated VRM-rig retargeting (upright walk). One depsgraph bug blocks batching the library.

## Completed This Session
- **Clip→VRM pipeline proven.** Root-cause bug: three.js strips the colon from animation-track bone names (`mixamorigHips`) but `MIXAMO_BONE_MAP` kept it (`mixamorig:Hips`) → retarget was a silent no-op. Fixed with rotation-only retarget. Xbot Y-up walk renders grounded + cycling. (`322f630`, `45cb483`)
- `loadClip` selects the requested clip from multi-clip GLBs + exposes all (`17f71e0`).
- **Step 1.2 (idle) re-scoped, NOT rewritten** — idle already uses organic `noise1D`, not raw sine; rewriting = needless churn in a sensitive area.
- **Blender FBX→GLB bake** (`tools/blender/bake_clip.py` + `tools/bake_animation.py`) — unlocks Mixamo FBX (`ec42dd6`).
- **Browser-driving:** `tools/mixamo_grab.mjs` drives a CDP-connected, user-logged-in Chrome → 28/28 companion+locomotion clips to `~/Downloads/mixamo-fbx/` (`68560d0`).
- **Headless render harness** with motion-burst (`tools/verify/render_clip.mjs --frames N`).
- **VRM-rig retarget (WIP)** `tools/blender/retarget_to_vrm.py` — rest-relative formula; validated upright walk (`a642a99`).

## Work In Progress / Known Issue (THE blocker)
`tools/blender/retarget_to_vrm.py` `_bake_rest_relative()` line ~180: reads `mix_pb[mx].matrix` after `scene.frame_set(f)` **without re-evaluating the depsgraph** → Mixamo pose reads static every frame → **every clip bakes near-identical motion** (confirmed: `idle.glb` and `walking.glb` share `J_Bip_L_UpperLeg` rotation range). Fix = evaluated-depsgraph read + `view_layer.update()`. The VRM-rig approach is validated (upright); this is the one bug + possible forearm-roll polish. Details in `docs/research/2026-05-31-retarget-pipeline.md` (Finding 5).

## Files Modified (this session's commits)
viewer.html (retarget fixes), tools/verify/render_clip.mjs, tools/mixamo_grab.mjs, tools/bake_animation.py, tools/blender/{bake_clip,retarget_to_vrm}.py, tools/download_animation_packs.py, frontends/sakura/src/test/viewer.retargetClip.test.ts, .gitignore, docs/plans/2026-05-31-avatar-motion-staged.md, docs/research/2026-05-31-retarget-pipeline.md.

## Next Session Priorities
1. **Phase A — fix the retarget depsgraph bug** (`retarget_to_vrm.py:~180`), re-verify walking/idle/waving/thinking are *distinct* + upright via the harness (gate). See plan.
2. **Phase B — batch 28 clips** → new `tools/retarget_library.py` → `vrm-baked/`, spot-verify 6.
3. **Phase C — wire Kokoro gesture→clips** in `viewerStore.ts:dispatchGesture` (line 447), augment+procedural fallback, Vitest + in-app verify.

## Context for Next Session
- Backend may still be running on :8080; Chrome may still be open on the Mixamo profile (`/tmp/mixamo-chrome-profile`, CDP :9222) — leave or kill.
- 28 Mixamo FBX are in `~/Downloads/mixamo-fbx/`. Baked GLBs go in `backend/storage/animations/` (gitignored — reproducible).
- Verify VRM = `backend/storage/avatars/Raine.vrm`. Render cmd: `node tools/verify/render_clip.mjs --vrm /files/avatars/Raine.vrm --clip /files/animations/vrm-baked/<name>.glb --name <name> --frames 4`.
- Decisions: stay Three.js (renderer ≠ bottleneck); VRM+GLB formats; Mixamo→VRM MUST retarget onto the VRM rig in Blender (runtime remap can't fix the Z-up/cm/rest-orientation mismatch); `.vrm` loads via Blender's glTF importer (no VRM addon needed; VRoid bones = `J_Bip_*`).
- **Hypothesis-limit guard** is written into Phase A — don't spiral on forearm roll.
- Nothing pushed (push is the user's call).

## Push Gate Check
No active `OPEN BUG` / `UNFIXED` / `BLOCKER` markers in tracked files. The retarget WIP is tracked as plan/research notes, not a blocker marker.
