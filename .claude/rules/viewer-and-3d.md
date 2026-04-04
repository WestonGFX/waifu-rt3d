---
paths:
  - "frontends/shared/viewer/**"
  - "frontends/sakura/src/stores/viewerStore*"
---

# 3D Viewer & Animation Rules

## Architecture
- `viewer.html` is a self-contained iframe (~5,700 lines). Controlled via `postMessage` from `viewerStore.ts`.
- NEVER modify `viewer.html` and `viewerStore.ts` in parallel — tightly coupled, merge conflicts are painful.
- VRM models: three-vrm. Live2D: pixi-live2d-display in separate `<canvas>`.

## AnimationDirector
- State machine: `idle`, `talk`, `gesture`, `clip`, `mocap`.
- Priority-based transitions — `clip`/`mocap` override `talk`/`gesture`.
- Idle resumes automatically when higher-priority states end.

## Animation & Retargeting
- `MIXAMO_BONE_MAP` retargets Mixamo → VRM bones. Always use this map.
- `AnimationSequencer` chains clips with blend transitions. Use it instead of `setTimeout`.
- Animation library: `backend/data/animation_library.json`.

## Post-Processing
- `EffectComposer`: bloom, color grading, outline effects.
- `ParticleSystem`: ambient particles (sakura petals, fireflies).
- Params come via postMessage — don't hardcode in viewer.html.

## Performance
- Target 60fps on M2 Pro (GPU floor).
- Dispose geometries, materials, textures explicitly — no GC for GPU resources.
- `requestAnimationFrame` for render loop, never `setInterval`.
- No `new Vector3/Quaternion/Matrix4` inside animation loops — pre-allocate.
