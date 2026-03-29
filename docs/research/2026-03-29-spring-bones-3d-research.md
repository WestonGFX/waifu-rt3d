# VRM Spring Bone Physics Research

**Date:** 2026-03-29
**Topic:** Spring bone system for 3D VRM models in waifu-rt3d
**Why:** Animation quality crisis -- need physics-based secondary motion (hair, clothes, accessories) instead of hardcoded bone values. The app uses `@pixiv/three-vrm` 3.4.1 with Three.js. Live2D physics is out of scope.

---

## 1. How VRM Spring Bones Work

### Architecture

VRM spring bones are a **built-in** part of the VRM specification and `@pixiv/three-vrm`. They are NOT optional plugins -- they load automatically when a VRM file is parsed by `VRMLoaderPlugin`. The system is a simple **Verlet integration** chain simulation: each "joint" is a point mass on a chain attached to a parent bone, subject to stiffness (return-to-rest force), drag (damping), and gravity.

```
VRM file loaded via GLTFLoader + VRMLoaderPlugin
  -> vrm.springBoneManager created automatically
  -> vrm.springBoneManager.joints[] = all spring bone joints
  -> vrm.springBoneManager.colliders[] = all colliders
  -> vrm.springBoneManager.colliderGroups[] = collider groups
  -> vrm.update(deltaTime) ticks the simulation each frame
```

**Key insight:** Spring bones are defined IN the VRM file by the model creator (in VRoid Studio, UniVRM/Unity, or Blender). The runtime (`three-vrm`) simply reads and simulates them. You don't "add" spring bones in code -- you configure and tune them.

### VRM 0.x vs VRM 1.0 Spring Bone Differences

| Feature | VRM 0.x | VRM 1.0 (VRMC_springBone) |
|---------|---------|---------------------------|
| Collider shapes | Sphere only | Sphere + Capsule |
| Extended colliders | N/A | Inside sphere, inside capsule, plane (via `VRMC_springBone_extended_collider-1.0`) |
| Joint config | Per-group settings | Per-joint individual settings |
| Bone chain definition | `boneGroup` arrays | Explicit joint chain with per-joint params |
| Center bone | Optional center space | Explicit center bone per spring |

`three-vrm` 3.4.x supports **both** VRM 0.x and 1.0 formats transparently. The `VRMLoaderPlugin` auto-detects the format and creates the same `VRMSpringBoneManager` interface regardless.

---

## 2. Spring Bone API in @pixiv/three-vrm

### Accessing the Manager

```javascript
const sbm = vrm.springBoneManager;  // VRMSpringBoneManager

sbm.joints       // VRMSpringBoneJoint[] - all spring bone joints
sbm.colliders    // VRMSpringBoneCollider[] - all colliders
sbm.colliderGroups // VRMSpringBoneColliderGroup[]
```

### Joint Settings (per-joint)

Each `VRMSpringBoneJoint` has a `settings` object:

| Parameter | Type | Range | Description |
|-----------|------|-------|-------------|
| `stiffness` | number | 0.0 - 4.0+ | Return-to-rest force. Higher = stiffer, snaps back faster. |
| `dragForce` | number | 0.0 - 1.0 | Damping. 0 = swings freely, 1 = barely moves. |
| `gravityPower` | number | 0.0 - 2.0+ | Gravity strength multiplier. |
| `gravityDir` | Vector3 | normalized | Direction of gravity (default: {x:0, y:-1, z:0}). |
| `hitRadius` | number | 0.0 - 0.5+ | Collision detection radius around the joint (meters). |

### Collider Shapes

```javascript
// Sphere collider
collider.shape  // VRMSpringBoneColliderShapeSphere
  .radius       // number (meters)
  .offset       // Vector3 (offset from parent bone)

// Capsule collider (VRM 1.0 only)
collider.shape  // VRMSpringBoneColliderShapeCapsule
  .radius       // number
  .offset       // Vector3 (head position)
  .tail         // Vector3 (tail position relative to head)
```

### Runtime Modification (already implemented in viewer.html)

Our `viewer.html` already exposes:
- `getSpringBoneInfo` -- returns all joint params + collider groups
- `setSpringBoneParams` -- modify stiffness/drag/gravityPower per joint
- `setWind` -- apply wind force vector to all spring bone gravity
- `toggleColliderDebug` -- wireframe visualization of colliders

### Scaling Gotcha

When scaling VRM models, spring bone parameters must be adjusted proportionally:

```javascript
const scale = 2.0;
vrm.scene.scale.setScalar(scale);

for (const joint of vrm.springBoneManager.joints) {
  joint.settings.stiffness *= scale;
  joint.settings.hitRadius *= scale;
}
for (const collider of vrm.springBoneManager.colliders) {
  if (collider.shape instanceof VRMSpringBoneColliderShapeCapsule) {
    collider.shape.radius *= scale;
    collider.shape.tail.multiplyScalar(scale);
  } else {
    collider.shape.radius *= scale;
  }
}
```

### Delta Time Clamping (CRITICAL)

`vrm.update(delta)` expects delta **in seconds**. If delta is too large (e.g., after tab switch or lag spike), the physics simulation **explodes** -- bones fly to infinity. Always clamp:

```javascript
const delta = Math.min(clock.getDelta(), 0.05); // max 50ms
vrm.update(delta);
```

---

## 3. Pre-made Animations + Spring Bones Interaction

### How It Works

Spring bones react **automatically** to the movement of their parent bones in the skeleton hierarchy. When a Mixamo animation moves the head, torso, or hips, the spring bone chains attached to those bones (hair, clothing, accessories) will naturally swing, bounce, and settle.

**Update order matters:**

```
1. mixer.update(delta)        // Apply skeletal animation (Mixamo)
2. vrm.update(delta)          // Tick spring bone physics
3. renderer.render(scene, cam) // Render
```

Our viewer.html does this correctly -- `currentVrm.update(delta)` is called after the animation director updates.

### The "Frozen Spring Bones" Problem

If a Mixamo animation includes keyframes for spring bone joints (e.g., hair bones), those keyframes **override** the physics simulation, making the hair rigid. The fix: **strip spring bone tracks from animation clips before applying them**.

```javascript
// Remove animation tracks that target spring bone joints
const springBoneNames = new Set(
  vrm.springBoneManager.joints.map(j => j.bone.name)
);
clip.tracks = clip.tracks.filter(track => {
  const boneName = track.name.split('.')[0];
  return !springBoneNames.has(boneName);
});
```

This is not currently implemented in our viewer and is a **recommended improvement**.

### What You Get For Free

With properly set up VRM models (from VRoid Studio):
- Hair bounces when the character nods, turns head, or leans
- Clothing sways when the character gestures or shifts weight
- Accessories (ribbons, earrings, tails) swing with body movement
- All of this is automatic -- no per-animation setup needed

---

## 4. Performance

### CPU Cost Model

Spring bone simulation is **O(n)** per joint per frame -- each joint does:
1. Calculate verlet position update
2. Apply stiffness/drag/gravity forces
3. Constrain to bone length
4. Check collisions against assigned collider groups

Collision checks are **O(j * c)** where j = joints and c = colliders in assigned groups.

### Real-World Performance

| Joint Count | Colliders | Target | Expected Performance (M2 Pro) |
|------------|-----------|--------|-------------------------------|
| 20-30 | 3-5 | 60fps | Trivial, <0.5ms per frame |
| 50-80 | 5-10 | 60fps | Easy, ~1-2ms per frame |
| 100-150 | 10-20 | 60fps | Fine, ~2-4ms per frame |
| 200+ | 20+ | 60fps | May need optimization |

**Verdict: 50+ spring bones at 60fps on M2 Pro is absolutely no problem.** The simulation is simple math -- no GPU involvement. The bottleneck for VRM rendering is typically the draw calls and material complexity, not spring bones.

### Optimization Techniques (if ever needed)

1. **Reduce collider groups** -- each group check is expensive relative to the joint update. 1-2 collider groups per chain is optimal.
2. **LOD spring bones** -- disable distant or off-screen spring bone chains by setting `stiffness` to a very high value (effectively rigid).
3. **Skip frames** -- update spring bones at 30fps while rendering at 60fps (half-rate updates). Not recommended for desktop but useful for mobile.
4. **Merge short chains** -- VRoid sometimes creates 8-16 bone chains where 4-6 would suffice. Reducing chain length in the model improves perf.

### Delta Time Stability

The academic paper "A Method to Optimize the Performance of Three-VRM" (2022) identified `projectObject` as the main bottleneck (~70% of frame time) in three-vrm rendering, NOT spring bones. Spring bone computation is a small fraction of the total frame budget.

---

## 5. Collision Detection

### Collider Types

| Shape | VRM 0.x | VRM 1.0 | Use Case |
|-------|---------|---------|----------|
| Sphere | Yes | Yes | Head, chest, individual body parts |
| Capsule | No | Yes | Arms, legs, torso (elongated shapes) |
| Inside Sphere | No | Extended | Constrain bones to stay INSIDE a volume |
| Inside Capsule | No | Extended | Constrain bones inside elongated volumes |
| Plane | No | Extended | Floor/wall constraints |

### Standard Collider Placement for Anti-Clipping

```
Recommended minimum collider setup:
  Head        -> 1 sphere (radius ~0.08-0.12)
  Chest/Spine -> 1 capsule or 2 spheres
  Hips        -> 1 sphere (for long hair / skirts)

Enhanced setup (for long hair + flowing clothes):
  Head        -> 1 sphere
  Upper Chest -> 1 capsule (collarbone to mid-chest)
  Lower Chest -> 1 capsule (mid-chest to waist)
  Upper Arms  -> 1 capsule each (shoulder to elbow)
  Hips/Thighs -> 1 capsule each (for skirts)
```

### How Colliders Work at Runtime

Colliders are attached to skeleton bones (head, spine, etc.) and move with the animation. When a spring bone joint's position + hitRadius intersects a collider, the joint is pushed to the surface of the collider. This prevents hair from going through the head/body.

### Our Current Implementation

`viewer.html` already has `toggleColliderDebug` which renders wireframe spheres at collider positions. This is useful for verifying that a model's colliders are correctly placed. However, it only renders spheres -- capsule colliders are not visualized yet.

**Recommended improvement:** Add capsule wireframe rendering for VRM 1.0 models.

---

## 6. VRoid Studio Spring Bone Defaults

### What VRoid Exports

VRoid Studio **automatically generates** spring bones for:
- All hair groups (each "hair bone group" gets spring bones)
- Clothing pieces marked as "swayable"
- Accessories with physics enabled

### Default Quality Assessment

| Aspect | Quality | Notes |
|--------|---------|-------|
| Hair spring bones | Good | Auto-grouped, reasonable stiffness/drag defaults |
| Hair colliders | Decent | Head sphere + basic body colliders included |
| Clothing physics | Basic | Simple chains, may need tuning |
| Bone count per chain | Often excessive | VRoid creates 8-16 bones per hair strand where 4-8 suffices |
| Collider coverage | Minimal | Only head + maybe chest. Arms/legs usually missing. |

### VRoid Spring Bone Parameters

VRoid Studio exposes per-group:
- **Bone count** (1-16): More bones = smoother curve but higher cost
- **Fixed point**: Where the first bone starts (higher = stiffer base)
- **Stiffness** (0-1): Hair rigidity
- **Gravity** (0-1): Downward pull strength
- **Collider size**: Prevents intersection with face/body

### Tuning Recommendations for VRoid Models

VRoid defaults are designed for VRChat/VTubing (upper-body only, minimal movement). For our app with full-body Mixamo animations:

```
Hair (long, flowing):
  stiffness: 0.3 - 0.5  (VRoid default ~0.5-0.7, too stiff for our use)
  dragForce: 0.3 - 0.5   (VRoid default ~0.4)
  gravityPower: 0.8 - 1.2 (increase from VRoid default ~0.5)
  hitRadius: 0.02 - 0.04

Hair (short, bouncy):
  stiffness: 0.8 - 1.2
  dragForce: 0.4 - 0.6
  gravityPower: 0.3 - 0.5
  hitRadius: 0.01 - 0.02

Skirt / long clothing:
  stiffness: 0.2 - 0.4
  dragForce: 0.4 - 0.6
  gravityPower: 1.0 - 1.5
  hitRadius: 0.03 - 0.06

Ribbons / thin accessories:
  stiffness: 0.1 - 0.3
  dragForce: 0.2 - 0.3
  gravityPower: 0.5 - 0.8
  hitRadius: 0.01

Ears (animal/cat):
  stiffness: 1.0 - 2.0
  dragForce: 0.5 - 0.7
  gravityPower: 0.1 - 0.3
  hitRadius: 0.02
```

---

## 7. Community Resources & References

### Official Documentation
- [three-vrm Spring Bones on Scaled Models](https://pixiv.github.io/three-vrm/docs/documents/spring-bones-on-scaled-models.html)
- [VRMSpringBoneManager API Reference](https://pixiv.github.io/three-vrm/docs/classes/three-vrm-springbone.VRMSpringBoneManager.html)
- [VRMC_springBone-1.0 Specification](https://github.com/vrm-c/vrm-specification/blob/master/specification/VRMC_springBone-1.0/README.md)
- [VRMC_springBone_extended_collider-1.0](https://github.com/vrm-c/vrm-specification/blob/master/specification/VRMC_springBone_extended_collider-1.0/README.md)
- [VRoid Studio FAQ: Hair Bounce](https://vroid.pixiv.help/hc/en-us/articles/900006910023-I-want-to-edit-hair-bounce)

### Practical Tutorials
- [VirtualCast: Configure Swingable Parts in VRM](https://wiki.virtualcast.jp/wiki/en/vrm/setting/spring) -- best parameter reference
- [Mona Docs: Adding Spring Bones in UniVRM](https://docs.monaverse.com/create/creating-avatars/creating-your-avatar-using-univrm/adding-spring-bones-in-univrm-optional)
- [VRM-Spacing-Animation-Baking (Blender addon)](https://github.com/Meringue-Rouge/VRM-Spacing-Animation-Baking) -- bake spring bone physics into animation clips
- [V-Sekai/three-vrm-1-sandbox-mixamo](https://github.com/V-Sekai/three-vrm-1-sandbox-mixamo) -- example of Mixamo + three-vrm 1.0

### VRM4U (Unreal Engine reference)
- [Spring Bone Physics in VRM4U (DeepWiki)](https://deepwiki.com/ruyo/VRM4U/3.1-spring-bone-physics) -- good conceptual reference even though it targets UE

### SillyTavern Extension-VRM
- [SillyTavern VRM Extension](https://github.com/SillyTavern/Extension-VRM) -- similar use case (AI companion + VRM), worth studying their spring bone handling

---

## 8. AI-Driven Secondary Motion

### Current State of Research (2025-2026)

Neural physics for hair and cloth simulation is an **active research area** but NOT practical for real-time web apps yet.

| Paper/Project | Date | What It Does | Practical? |
|--------------|------|-------------|-----------|
| **HairFormer** (Transformer-based) | Jul 2025 | Generalizes dynamic hair simulation to unseen hairstyles | No -- requires GPU inference, offline quality |
| **Neuralocks** | Jul 2025 | Real-time neural hair simulation | Experimental -- targets native/GPU, not WebGL |
| **Quaffure** (CVPR 2025) | Dec 2024 | Physics-supervised neural hair with collision | Research only -- not deployable |
| **GraphNeuralCloth** | Feb 2026 | GNN-based cloth simulation | Research only |
| **SimAvatar** (CVPR 2025) | 2025 | Simulation-ready avatars with layered hair/clothing | Training pipeline, not runtime |

### Assessment for Waifu-RT3D

**Verdict: VRM spring bones are the right approach. Neural physics is 2-4 years from being practical in WebGL.**

Reasons:
1. All neural approaches require **GPU compute** (PyTorch/CUDA) -- not available in browser WebGL
2. VRM spring bones are **good enough** for anime-style secondary motion -- they're the standard across VRChat, VTubing, and companion apps
3. The quality gap is in **tuning and collider setup**, not in the simulation algorithm
4. Wind effects (already implemented) add significant realism on top of basic spring bones
5. WebGPU compute shaders *might* enable lightweight neural physics in 2027-2028, but that's speculative

### What WOULD Be Practical Now

Instead of neural physics, these approaches add realism within the current spring bone framework:

1. **Per-model spring bone presets** -- store tuned stiffness/drag/gravity values per character and auto-apply on load
2. **Emotion-reactive spring bone modulation** -- lower stiffness when sad (droopy hair), increase when excited (bouncy)
3. **Movement-reactive wind** -- apply wind force proportional to character movement speed (walking = light breeze, running = strong wind)
4. **Procedural micro-perturbation** -- add tiny random forces to spring bones during idle to prevent perfectly static hair

---

## 9. Current State in Our Codebase

### What We Already Have (viewer.html)

| Feature | Status | Location |
|---------|--------|----------|
| Spring bone auto-loading | Working | `VRMLoaderPlugin` handles this |
| `vrm.update(delta)` in render loop | Working | Line ~6026 |
| Wind force on spring bones | Working | Lines 5997-6023 |
| `getSpringBoneInfo` API | Working | Lines 7599-7624 |
| `setSpringBoneParams` API | Working | Lines 7626-7636 |
| `setWind` API | Working | Lines 7637-7655 |
| Collider debug visualization | Working (spheres only) | Lines 7656-7696 |

### What We're Missing

| Feature | Priority | Effort |
|---------|----------|--------|
| Strip spring bone tracks from Mixamo clips | High | 2h |
| Delta time clamping (prevent explosion) | High | 15min |
| Per-character spring bone presets (save/load) | Medium | 4h |
| Capsule collider debug visualization | Medium | 2h |
| Emotion-reactive spring bone modulation | Medium | 3h |
| Movement-proportional wind | Low | 2h |
| Spring bone parameter UI in settings | Low | 6h |
| Model-scaling spring bone adjustment | Low | 1h (code exists in docs, just needs wiring) |

### Recommended Next Steps (Priority Order)

1. **Delta time clamping** -- One line fix. Prevents physics explosion on tab switch.
2. **Strip spring bone tracks from Mixamo animations** -- Critical for animation quality. Without this, Mixamo clips that include hair/clothing bone data will freeze the spring bone simulation.
3. **Per-character spring bone presets** -- Allow saving tuned spring bone parameters and auto-applying them when a character loads. This makes the tuning work persistent.
4. **Emotion-reactive spring bone modulation** -- Small stiffness/drag adjustments based on the character's current emotion state. Adds personality to the physics.

---

## Files Referenced

- `/Users/chris/Code/waifu-rt3d/frontends/shared/viewer/viewer.html` -- main 3D viewer with existing spring bone integration
- `/Users/chris/Code/waifu-rt3d/frontends/shared/lib/three-vrm.module.min.js` -- three-vrm 2.0.6 (bundled copy; shared viewer uses v3.4.1 via imports)
