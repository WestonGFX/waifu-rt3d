# 3D Viewer & Animation Conventions

## Architecture

- `viewer.html` is a self-contained iframe (~5,700 lines). The Sakura frontend controls it via `postMessage` from `viewerStore.ts`.
- Never modify `viewer.html` and `viewerStore.ts` in parallel — they are a tightly coupled pair and merge conflicts are painful.
- VRM models load via three-vrm. Live2D models load via pixi-live2d-display in a separate `<canvas>`.

## AnimationDirector

- State machine with 5 states: `idle`, `talk`, `gesture`, `clip`, `mocap`.
- Transitions are priority-based — `clip` and `mocap` override `talk` and `gesture`.
- Idle animations resume automatically when higher-priority states end.

## Animation & Retargeting

- `MIXAMO_BONE_MAP` retargets Mixamo animations to VRM bone names. Always use this map — never assume bone names match.
- The animation sequencer (`AnimationSequencer`) chains clips with blend transitions. Use it for multi-step sequences instead of manual `setTimeout`.
- Animation library entries are in `backend/data/animation_library.json`.

## Post-Processing

- `EffectComposer` handles bloom, color grading, and outline effects.
- `ParticleSystem` manages ambient particles (sakura petals, fireflies, etc.).
- Post-processing params come from the frontend via postMessage — don't hardcode values in viewer.html.

## Performance

- Target 60fps on M2 Pro (GPU floor). Test with complex scenes (VRM + particles + bloom).
- Dispose Three.js geometries, materials, and textures explicitly — no garbage collector for GPU resources.
- Use `requestAnimationFrame` for the render loop, never `setInterval`.
