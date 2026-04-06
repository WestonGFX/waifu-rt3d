---
name: vrm-animation
description: >
  Three.js/VRM constraint knowledge base for viewer.html work. Loaded when
  editing 3D viewer code. Contains bone mapping, AnimationDirector patterns,
  spring bone rules, and the 10+ historical regression list.
user_invocable: true
---

# VRM Animation & Three.js Constraint Guide

Load this when working on `frontends/shared/viewer/viewer.html` or `viewerStore.ts`.

## Architecture

```
viewer.html (5,700 lines, self-contained iframe)
├── AnimationDirector — state machine: idle → talk → gesture → clip → mocap
├── AnimationSequencer — chains clips (NEVER use setTimeout)
├── EffectComposer — bloom, color grading, outline post-processing
├── ParticleSystem — sakura petals, fireflies (params via postMessage)
└── MIXAMO_BONE_MAP — Mixamo→VRM bone retargeting
```

Communication: `viewerStore.ts` sends `postMessage` to the iframe. The iframe sends events back. These two files are tightly coupled — NEVER modify both in parallel.

## MIXAMO_BONE_MAP

When retargeting Mixamo animations to VRM models, ALWAYS use the bone map defined in viewer.html. Never hardcode bone names. The map translates:

```
mixamorig:Hips        → hips
mixamorig:Spine        → spine
mixamorig:Spine1       → chest
mixamorig:Spine2       → upperChest
mixamorig:Neck         → neck
mixamorig:Head         → head
mixamorig:LeftShoulder → leftShoulder
mixamorig:LeftArm      → leftUpperArm
mixamorig:LeftForeArm  → leftLowerArm
mixamorig:LeftHand     → leftHand
mixamorig:RightShoulder → rightShoulder
... (full map in viewer.html)
```

## AnimationDirector State Machine

```
Priority (highest first):
  1. mocap   — live motion capture input
  2. clip    — full-body animation clip from library
  3. gesture — upper-body gesture overlay
  4. talk    — lip sync + head movement
  5. idle    — breathing, subtle sway, blink cycle
```

Rules:
- Higher priority states override lower ones
- `idle` always runs as the base layer
- `talk` blends with `idle` (doesn't replace it)
- `gesture` applies to upper body only (uses bone mask)
- `clip` takes full control for its duration, then returns to previous state
- Use `AnimationSequencer.chain([clipA, clipB])` for sequences — NEVER setTimeout

## Spring Bone Physics

VRM spring bones (hair, clothes, accessories) use a verlet integration system:
- `stiffness`: 0.0-1.0 (how quickly bone returns to rest, default 0.5)
- `gravityPower`: 0.0-1.0 (gravity influence, default 0.1)
- `dragForce`: 0.0-1.0 (air resistance, default 0.4)
- `hitRadius`: collision sphere radius

**NEVER hardcode spring bone values.** Read from VRM model metadata. If values need adjustment, expose them via postMessage parameters.

## Performance Budget

Target: **60fps (16.6ms per frame)** on M2 Pro (GPU floor).

### Allocation:
| Phase | Budget |
|-------|--------|
| Animation update | 2ms |
| Spring bone simulation | 2ms |
| Scene render | 6ms |
| Post-processing (EffectComposer) | 4ms |
| Headroom | 2.6ms |

### Hard Rules:
- **NO `new` inside `requestAnimationFrame`** — pre-allocate all Vector3, Quaternion, Matrix4
- **Reuse temp variables**: `_tempVec3`, `_tempQuat`, `_tempMat4` at module scope
- **Dispose on model swap**: traverse scene graph, dispose geometries/materials/textures
- **Pause when hidden**: stop rendering when `document.hidden === true`
- **Batch blend shape updates**: set all expression weights, then update once per frame

## 10+ Historical Regressions (EXTRA CARE)

These have broken repeatedly. Test after ANY change:

1. **Avatar aspect ratio** — model looks squished or stretched after camera/canvas changes
2. **Avatar grounding** — model floats above or sinks below the ground plane
3. **Camera reset** — orbit controls don't return to default position
4. **Spring bone jitter** — hair/clothes vibrate at high frequency instead of flowing
5. **Blend shape conflicts** — two expressions applied simultaneously cause flickering
6. **Animation stuck** — AnimationDirector doesn't return to idle after clip ends
7. **Model swap memory leak** — old model's GPU resources not freed
8. **postMessage desync** — viewerStore sends command, iframe doesn't respond
9. **Particle z-fighting** — sakura petals flicker against the model surface
10. **Canvas resize** — aspect ratio breaks when panels are toggled

## Pre-Flight Checklist (before committing viewer.html changes)

- [ ] No `new THREE.Vector3()` (or Quaternion/Matrix4) inside animation loop
- [ ] No hardcoded bone names — all go through MIXAMO_BONE_MAP
- [ ] No hardcoded spring bone values — read from model or postMessage
- [ ] AnimationSequencer used for sequences (not setTimeout)
- [ ] Dispose called on all replaced materials/geometries/textures
- [ ] `document.hidden` check in render loop
- [ ] Expression weights batched per frame
- [ ] Tested: model loads, animation plays, camera controls work, panels toggle cleanly
