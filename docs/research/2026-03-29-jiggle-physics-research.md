# Jiggle Physics & Soft Body Dynamics Research

**Date:** 2026-03-29
**Topic:** Breast, butt, and thigh jiggle physics for anime-style 3D characters
**Tech Stack:** Three.js, @pixiv/three-vrm (currently v2.0.6, target v3.4.1), WebGL
**Target Hardware:** Mac M2 Pro 16GB, Win RTX 5080 16GB, Win RTX 3070 8GB
**Viewer:** `frontends/shared/viewer/viewer.html`

---

## Table of Contents

1. [VRM Spring Bone for Jiggle Physics](#1-vrm-spring-bone-for-jiggle-physics)
2. [Dedicated Jiggle Physics Libraries for Three.js](#2-dedicated-jiggle-physics-libraries-for-threejs)
3. [Physics Parameters & Tuning](#3-physics-parameters--tuning)
4. [Bone Setup Requirements](#4-bone-setup-requirements)
5. [Performance Considerations](#5-performance-considerations)
6. [Existing Implementations to Study](#6-existing-implementations-to-study)
7. [Content Controls](#7-content-controls)
8. [Advanced: Vertex-Level Soft Body](#8-advanced-vertex-level-soft-body)
9. [Implementation Recommendation](#9-implementation-recommendation)

---

## 1. VRM Spring Bone for Jiggle Physics

### Can @pixiv/three-vrm's Spring Bone Handle Breast/Butt/Thigh Jiggle?

**Yes.** The VRM spring bone system is the primary mechanism used across VTuber apps (VSeeFace, VNyan, Warudo) for breast physics. It uses Verlet integration to simulate physics on bone chains, and the same system that handles hair and cloth dynamics works for body jiggle when configured with appropriate parameters.

The spring bone system is available as `@pixiv/three-vrm-springbone` (npm, currently at v3.4.4). Our viewer already has full spring bone integration:

- **Read/write API via postMessage:** `getSpringBoneInfo`, `setSpringBoneParams` (lines 7599-7636 of viewer.html)
- **Wind force system:** Already applies dynamic gravity modifications to spring bone joints (lines 5997-6023)
- **Collider debug visualization:** Toggle wireframe spheres for spring bone colliders (line 7656+)
- **Per-frame update:** `currentVrm.update(delta)` in the render loop (line 6026)

### Spring Bone Parameters (VRMSpringBoneJoint.settings)

| Parameter | Type | Range | Description |
|-----------|------|-------|-------------|
| `stiffness` | float | 0.0 - 4.0+ | Force returning bone to rest position. Higher = more rigid. |
| `gravityPower` | float | 0.0 - 2.0+ | Magnitude of gravity force applied each frame. |
| `gravityDir` | Vector3 | normalized | Direction of gravity. Default: `(0, -1, 0)`. |
| `dragForce` | float | 0.0 - 1.0 | Deceleration/air resistance. Higher = less swing. |
| `hitRadius` | float | meters | Collision sphere radius for collider interaction. |

### How the Physics Works (Verlet Integration)

```
nextTailPosition = currentTail
    + (currentTail - prevTail) * (1.0 - dragForce)     // inertia
    + stiffnessForce * stiffness                         // return-to-rest
    + gravityDir * gravityPower                           // gravity
```

The system resolves collisions against sphere and capsule (VRM 1.0+) colliders after computing the new position.

### VRoid Studio Models — Pre-configured?

VRoid Studio models **can** export with breast spring bones, but:
- "Prevent excessive shaking during movement" is **ON by default** in VRoid's export settings
- This dampens physics aggressively — models may appear to have no breast physics until this is disabled
- VRoid exports breast bones under `Chest` → `Breast_L` / `Breast_R` with default spring bone parameters
- Parameters tend to be conservative (high stiffness, high drag) — need runtime adjustment for visible jiggle

### VRM 0.x vs 1.0 Spring Bone Differences

| Feature | VRM 0.x (`secondaryAnimation`) | VRM 1.0 (`VRMC_springBone`) |
|---------|------|------|
| Extension name | `secondaryAnimation.boneGroups` | `VRMC_springBone-1.0` |
| Collider types | Sphere only | Sphere + Capsule |
| Collider organization | Inline in bone groups | Separate `colliders` + `colliderGroups` arrays |
| Core parameters | Same (stiffness, gravity, drag, hitRadius) | Same (stiffness, gravity, drag, hitRadius) |
| Physics algorithm | Verlet integration | Verlet integration (identical) |
| three-vrm support | v2.x handles both | v3.x handles both via VRMLoaderPlugin |

**Key takeaway:** The physics parameters and behavior are identical between VRM versions. The difference is structural (JSON format). Our `VRMLoaderPlugin` handles both transparently.

---

## 2. Dedicated Jiggle Physics Libraries for Three.js

### Library Comparison

| Library | NPM | Approach | Pros | Cons | Suitability |
|---------|-----|----------|------|------|-------------|
| **@pixiv/three-vrm-springbone** | `@pixiv/three-vrm-springbone` | VRM spring bone Verlet physics | Already integrated, VRM-native, colliders, well-maintained | VRM-specific bone names, limited to bone chains | **Best choice** — already in our stack |
| **Wiggle (Wiggle Bones)** | `wiggle` | FK + smoothing function on skeleton hierarchy | Simple API, no physics engine needed, lightweight | No collision detection, no gravity, no per-bone settings exposed | Good for supplemental secondary motion |
| **threeZboingZboing** | N/A (GitHub) | Spring-damper on bone rotations | Per-bone damper/spring tuning, works on any SkinnedMesh | No npm, limited maintenance, no colliders | Interesting for custom bones outside VRM |
| **Ammo.js (Bullet WASM)** | `ammo.js` | Full rigid/soft body physics engine | True soft body simulation, Bullet-quality physics | Heavy (300KB+ WASM), overkill for bone jiggle, complex API | Overkill — use only if vertex-level deformation needed |
| **Cannon.js / cannon-es** | `cannon-es` | Constraint-based physics | Easier API than Ammo, decent soft body | No native bone integration, needs custom bridging | Not recommended for this use case |
| **Rapier** | `@dimforge/rapier3d` | Rust→WASM physics engine | Fast, modern, WASM | No bone integration, overkill | Not recommended |

### What Do VTuber Apps Use?

| App | Physics System | Notes |
|-----|---------------|-------|
| **VSeeFace** | VRM Spring Bone + VSFAvatar Dynamic Bones | VSFAvatar format allows Unity DynamicBone components |
| **VNyan** | VRM Spring Bone (built-in) | Adjustable physics post-load via VRMoveTime plugin |
| **Warudo** | VRM Spring Bone + Dynamic Bone + Magica Cloth | Unity-based, uses multiple physics systems |
| **Luppet** | VRM Spring Bone | Standard VRM physics implementation |
| **VRChat** | PhysBone (replaced DynamicBone) | Custom spring-damper system, most documented presets |

### MMD (MikuMikuDance) Physics

MMD uses Bullet Physics for breast simulation:
- Breast physics = 2 rigid body spheres + 4 constraint rods per breast
- Three.js has `MMDPhysics.js` in its examples that wraps Ammo.js for PMX/PMD models
- The Babylon.js `babylon-mmd` project has a full MMD physics runtime
- **Not directly portable** to VRM — different bone structure and physics model
- However, the parameter tuning concepts (stiffness, damping, collision) are transferable

### Recommendation

**Use the existing VRM spring bone system.** It is already integrated in our viewer, handles collisions, supports per-bone parameter tuning, and is the standard across the VTuber ecosystem. Supplement with a custom `JigglePhysicsManager` class that wraps spring bone configuration with presets and user-facing controls.

---

## 3. Physics Parameters & Tuning

### Parameter Presets for Breast Physics

These are translated from VRChat DynamicBone/PhysBone community presets into VRM spring bone parameters:

#### Preset Table (VRM Spring Bone Values)

| Preset | Stiffness | Drag | Gravity Power | Gravity Dir | Hit Radius | Feel |
|--------|-----------|------|---------------|-------------|------------|------|
| **Subtle/Realistic** | 1.2 | 0.6 | 0.3 | (0,-1,0) | 0.03 | Firm, slight movement on fast actions |
| **Natural** | 0.8 | 0.4 | 0.5 | (0,-1,0) | 0.04 | Noticeable but grounded movement |
| **Anime Standard** | 0.5 | 0.3 | 0.6 | (0,-1,0) | 0.05 | Classic anime-style bounce |
| **Bouncy** | 0.3 | 0.2 | 0.7 | (0,-1,0) | 0.06 | Exaggerated, playful jiggle |
| **Extreme** | 0.15 | 0.1 | 0.8 | (0,-1,0) | 0.07 | Maximum jiggle, comedy-level |

#### VRChat DynamicBone Reference Values (for cross-reference)

| Preset | Damping | Elasticity | Stiffness | Inert |
|--------|---------|------------|-----------|-------|
| Realistic Breast | 0.231 | 0.618 | 0.159 | 0.0 |
| Bouncy Breast | 0.656 | 0.285 | 0.056 | 0.281 |
| Soft Breast | 0.075 | 0.037 | 0.100 | 0.861 |

**Mapping VRChat → VRM Spring Bone:**
- VRChat `Damping` ≈ VRM `dragForce` (both 0-1, controls deceleration)
- VRChat `Elasticity` ≈ inverse of VRM `stiffness` (elasticity returns to rest, stiffness resists movement)
- VRChat `Stiffness` ≈ VRM `stiffness` (same concept, different scale)
- VRChat `Inert` = how much position change is ignored (no direct VRM equivalent; simulate with higher drag)

### Butt & Thigh Physics Parameters

Butt and thigh require **different tuning** than breasts because they are larger masses with less range of motion:

| Body Part | Stiffness | Drag | Gravity Power | Notes |
|-----------|-----------|------|---------------|-------|
| **Butt** | 1.0 | 0.5 | 0.4 | Less swing than breasts, more dampened. Responds to sitting, walking. |
| **Thigh (inner)** | 1.5 | 0.6 | 0.2 | Very subtle, mostly visible during walking/running. High stiffness. |
| **Thigh (outer)** | 1.8 | 0.7 | 0.15 | Minimal movement, just enough to prevent stiff appearance. |

### Movement Response Tuning

Different character actions should produce different physics responses. This can be achieved by temporarily modifying spring bone parameters:

| Action | Stiffness Multiplier | Gravity Multiplier | Duration | Notes |
|--------|---------------------|-------------------|----------|-------|
| **Idle/Standing** | 1.0x | 1.0x | Continuous | Subtle breathing sway only |
| **Walking** | 0.9x | 1.0x | Per step | Rhythmic gentle bounce |
| **Running/Jumping** | 0.6x | 1.3x | On impact | Significant bounce on landing |
| **Turning quickly** | 0.7x | 1.0x | 0.3s | Lateral inertia |
| **Leaning forward** | 0.8x | 1.5x | While leaning | Gravity pulls forward |
| **Breathing** | 0.95x | 1.0x | Sine wave, 3-4s period | Very subtle chest expansion |
| **Laughing/Emotional** | 0.7x | 1.1x | 0.5-1s bursts | Quick successive bounces |

### Collision Prevention (Anti-Clipping)

VRM spring bone colliders prevent bones from penetrating the torso mesh:

```
Collider Setup (per character):
├── Chest Sphere Collider: radius 0.08-0.12, offset (0, 0.05, 0)
│   └── Prevents breast bones from penetrating chest
├── Upper Spine Sphere: radius 0.06-0.10, offset (0, -0.05, 0)
│   └── Prevents downward penetration
└── Optional: Arm Colliders (radius 0.03-0.05)
    └── Prevents breast clipping through arms during animation
```

VRM 1.0 capsule colliders are superior for torso collision — a single capsule from upper spine to lower chest covers more area than multiple spheres.

### Per-Character Scaling

Physics parameters should scale based on character body type. A `physicsScale` multiplier system:

```javascript
// Character body type affects physics
const bodyTypeMultipliers = {
    petite:    { stiffness: 1.3, gravity: 0.7, drag: 0.5 },  // smaller = firmer
    average:   { stiffness: 1.0, gravity: 1.0, drag: 0.4 },  // baseline
    athletic:  { stiffness: 1.2, gravity: 0.8, drag: 0.5 },  // firmer but responsive
    curvy:     { stiffness: 0.7, gravity: 1.2, drag: 0.3 },  // more mass = more swing
    voluptuous:{ stiffness: 0.5, gravity: 1.4, drag: 0.25 }, // maximum physics response
};
```

---

## 4. Bone Setup Requirements

### Standard VRM Breast Bone Names

VRM models use these bone naming conventions for breast physics:

| Convention | Left Bone | Right Bone | Source |
|-----------|-----------|------------|--------|
| **VRM Standard** | `Breast_L` | `Breast_R` | VRM Humanoid spec |
| **VRoid Studio (Japanese)** | `J_Sec_L_Bust1` | `J_Sec_R_Bust1` | VRoid default export |
| **VRoid Studio (chain)** | `J_Sec_L_Bust2` | `J_Sec_R_Bust2` | VRoid chain end bone |
| **Generic** | `breast.L` / `breast_left` | `breast.R` / `breast_right` | Blender exports |
| **MMD-style** | `左胸` | `右胸` | Japanese MMD models |

### Bone Hierarchy for Breast Physics

```
Armature
└── Hips
    └── Spine
        └── Chest
            ├── UpperChest (optional)
            │   ├── Breast_L          ← Spring bone root (LEFT)
            │   │   └── Breast_L_end  ← Spring bone tail (optional, for chain)
            │   ├── Breast_R          ← Spring bone root (RIGHT)
            │   │   └── Breast_R_end  ← Spring bone tail
            │   ├── Neck → Head
            │   ├── LeftShoulder → ...
            │   └── RightShoulder → ...
            └── (if no UpperChest, breasts parent to Chest directly)
```

### Multi-Joint Bone Chains

| Chain Length | Description | Use Case |
|-------------|-------------|----------|
| **1 bone** | Single pivot from chest | Simplest, adequate for subtle physics |
| **2 bones** | Root + tip (most common) | Good deformation, standard for VTuber models |
| **3 bones** | Root + mid + tip | Best deformation quality, rare in VRM models |

For 2+ bone chains, use **decreasing stiffness** along the chain:
```javascript
// 2-bone chain example
boneChain[0].settings.stiffness = 0.8;  // root: stiffer (anchored to chest)
boneChain[1].settings.stiffness = 0.4;  // tip: looser (free end bounces more)
boneChain[0].settings.dragForce = 0.4;
boneChain[1].settings.dragForce = 0.2;  // tip swings more freely
```

### Butt & Thigh Bone Names

These are **not part of the VRM humanoid spec** and must be custom bones:

| Body Part | Bone Names (Convention) | Parent Bone |
|-----------|------------------------|-------------|
| **Butt (left)** | `Butt_L`, `J_Sec_L_Butt1` | `Hips` |
| **Butt (right)** | `Butt_R`, `J_Sec_R_Butt1` | `Hips` |
| **Thigh jiggle (left)** | `ThighJiggle_L` | `LeftUpperLeg` |
| **Thigh jiggle (right)** | `ThighJiggle_R` | `RightUpperLeg` |

### What If the Model Lacks Breast Bones?

**Option A: Runtime bone injection (recommended)**
```javascript
/**
 * Programmatically add breast bones to a VRM model that lacks them.
 * Creates bones as children of the chest/upperChest bone and registers
 * them as spring bone joints with the VRMSpringBoneManager.
 */
function injectBreastBones(vrm) {
    const chest = vrm.humanoid.getNormalizedBoneNode('upperChest')
                || vrm.humanoid.getNormalizedBoneNode('chest');
    if (!chest) return null;

    const sbm = vrm.springBoneManager;

    // Create left breast bone
    const breastL = new THREE.Bone();
    breastL.name = 'Breast_L_injected';
    breastL.position.set(0.08, 0.0, 0.04);  // offset from chest center
    chest.add(breastL);

    // Create tail bone (end of chain)
    const breastLEnd = new THREE.Bone();
    breastLEnd.name = 'Breast_L_end';
    breastLEnd.position.set(0.0, -0.05, 0.05);  // extends forward-down
    breastL.add(breastLEnd);

    // Create spring bone joint
    const joint = new VRMSpringBoneJoint(breastL, breastLEnd, {
        stiffness: 0.5,
        gravityPower: 0.6,
        gravityDir: new THREE.Vector3(0, -1, 0),
        dragForce: 0.3,
        hitRadius: 0.05,
    });

    // Add chest collider to prevent clipping
    const collider = new VRMSpringBoneCollider(chest,
        new VRMSpringBoneColliderShapeSphere({ radius: 0.10, offset: new THREE.Vector3(0, 0, 0) })
    );
    const colliderGroup = new VRMSpringBoneColliderGroup([collider]);
    joint.colliderGroups = [colliderGroup];

    sbm.addSpringBone(joint);
    // Repeat for right side with mirrored x offset (-0.08)

    sbm.setInitState();
    return { breastL, breastLEnd };
}
```

**Option B: Vertex shader displacement (fallback)**
If bone injection causes skinning artifacts, use morph targets or vertex shader displacement instead (see Section 8).

**Option C: Require models to have breast bones**
Document in model requirements that uploaded VRM models should include breast bones for physics support. Models without them get a "No physics bones detected" warning in the UI.

---

## 5. Performance Considerations

### CPU Cost per Frame

Spring bone physics is **very lightweight** compared to full rigid body physics:

| Component | Per-Joint Cost | Notes |
|-----------|---------------|-------|
| Verlet integration | ~0.001ms | Simple vector math |
| Collider resolution (sphere) | ~0.002ms per collider pair | Distance check + projection |
| Collider resolution (capsule) | ~0.005ms per collider pair | More complex than sphere |
| Bone transform update | ~0.001ms | Matrix composition |

**Estimated total cost for breast + butt + thigh physics:**

| Configuration | Joints | Colliders | Est. Cost/Frame | % of 16ms Budget |
|---------------|--------|-----------|-----------------|-------------------|
| Breasts only (2 bones) | 2 | 2 | ~0.02ms | 0.1% |
| Breasts (4-bone chains) | 4 | 4 | ~0.05ms | 0.3% |
| Breasts + Butt (6 bones) | 6 | 6 | ~0.08ms | 0.5% |
| Full body (breasts + butt + thighs, 10 bones) | 10 | 8 | ~0.12ms | 0.75% |
| + Hair + Clothes (typical VRM, ~40 joints) | 50 | 20 | ~0.5ms | 3.1% |

**Conclusion:** Jiggle physics adds negligible overhead. Even with full body physics AND existing hair/cloth spring bones, total spring bone cost stays under 1ms/frame on any of our target hardware.

### Running Alongside Hair/Clothing

The existing `currentVrm.update(delta)` call already processes ALL spring bone joints in one pass. Adding breast/butt/thigh joints to the same manager means zero additional overhead from the update loop — they are simply more joints in the same Verlet integration pass.

**Colliders are the bottleneck**, not joints. Each collider-joint pair requires a distance check. Keep collider count under 30 total (hair + cloth + body) for zero-impact performance.

### LOD Approach

```javascript
/**
 * Reduce physics quality based on visibility and scene load.
 */
class PhysicsLOD {
    update(camera, vrm, sceneLoad) {
        const isOnScreen = this.isModelVisible(camera, vrm);
        const sbm = vrm.springBoneManager;

        if (!isOnScreen) {
            // Off-screen: freeze physics (skip update entirely)
            return false;  // caller skips vrm.update()
        }

        if (sceneLoad > 0.8) {
            // Heavy scene: reduce to every-other-frame update
            this.frameSkip = !this.frameSkip;
            if (this.frameSkip) return false;
        }

        // On-screen, normal load: full physics
        return true;
    }
}
```

Note: three-vrm issue #603 discusses frustum culling for spring bones — when the model is outside the camera frustum, spring bone calculations can be skipped entirely.

---

## 6. Existing Implementations to Study

### VSeeFace Breast Physics

- **System:** VRM Spring Bone (standard) + VSFAvatar (Unity DynamicBone)
- **Key insight:** VSeeFace's default spring bone handling is standard VRM — no custom breast physics layer
- **Plugin:** VRMoveTime adds post-load physics adjustment with "inertial dampening with randomization" for more realistic motion
- **Takeaway:** Randomized dampening prevents robotic-looking synchronized bounce

### Koikatsu / Honey Select

- **System:** Unity DynamicBone with custom `BreastPhysicsController` plugin
- **Bone structure:** `Bust01`, `Bust02`, `Bust03` (3-bone chain per breast)
- **Key feature:** "Alternative update mode" where breasts run independent physics (not driven by animation)
- **Colliders:** DynamicBone colliders on torso + arms to prevent clipping
- **Plugin source:** [KK_BreastPhysicsController](https://github.com/SNW-KK/KK_BreastPhysicsController) — open source, adjustable parameters
- **Takeaway:** Independent physics mode (not animation-driven) produces more natural results. Our spring bone system already operates independently from animation clips.

### VRChat PhysBone

- **System:** Custom spring-damper, replaced DynamicBone in 2022
- **Parameters:** Pull, Spring (simplified) or Momentum + Stiffness (advanced), Gravity, Immobile
- **Breast presets (PhysBone):**
  - Very Soft / Soft / Normal / Firm / Very Firm (5 tiers)
  - End Offset for breasts: `(0, 0.12, 0)` — extends influence below bone
- **Key feature:** Stretch/Squish (v1.1) — bones can elongate and compress, not just rotate
- **Collision:** Capsule + sphere colliders, with contact receiver/sender for haptic feedback
- **Takeaway:** Stretch/Squish adds realism. Could be simulated in VRM via morph targets triggered by physics state.

### VRChat Dynamic Bone (Legacy, Well-Documented)

Community-maintained preset repository: [Z-ANESaber/DynamicBones-Configs](https://github.com/Z-ANESaber/DynamicBones-Configs)

Well-documented config gist with breast values: [SrPhilippe/43c1bad021fab173d3ef1d5255d53f53](https://gist.github.com/SrPhilippe/43c1bad021fab173d3ef1d5255d53f53)

| Preset | Update Rate | Damping | Elasticity | Stiffness | Inert |
|--------|-------------|---------|------------|-----------|-------|
| Realistic Breast | 50 | 0.231 | 0.618 | 0.159 | 0.000 |
| Bouncy Breast | 90 | 0.656 | 0.285 | 0.056 | 0.281 |

### Unity JiggleBone (Unify Wiki)

- Simple single-script approach: one `JiggleBone.cs` per bone
- Uses spring-damper formula: `F = -kx - bv` (Hooke's law + velocity damping)
- Parameters: `boneAxis`, `targetDistance`, `boneStiffness`, `bounceIntensity`, `SquashAndStretch`
- **Takeaway:** The simplest possible jiggle implementation. Good reference for a minimal custom implementation if VRM spring bones prove inadequate.

### Three.js Specific Libraries

**threeZboingZboing** ([GitHub](https://github.com/WebAR-rocks/threeZboingZboing)):
```javascript
// Per-bone configuration
const physicsConfig = {
    'Breast_L': { damper: 0.0008, spring: 0.000004 },
    'Breast_R': { damper: 0.0008, spring: 0.000004 },
};
// Apply to SkinnedMesh
const zboing = new ThreeZboingZboing(skinnedMesh, physicsConfig);
// In animation loop:
zboing.update(deltaTime);
```

**Wiggle Bones** ([npm: wiggle](https://www.npmjs.com/package/wiggle), [docs](https://wiggle.three.tools/)):
```javascript
import { WiggleSpring } from 'wiggle';

// Create spring on breast bone
const breastSpring = new WiggleSpring(breastBone, {
    stiffness: 500,  // spring stiffness coefficient
    damping: 17,     // damping force
});

// In animation loop:
breastSpring.update();
```

---

## 7. Content Controls

### User-Facing Configuration UI

```
┌─── Jiggle Physics Settings ──────────────────────┐
│                                                    │
│  ☑ Enable Jiggle Physics          [Master Toggle]  │
│                                                    │
│  Intensity: ──●────────────── [Natural]            │
│              Subtle  Natural  Bouncy  Extreme      │
│                                                    │
│  ▸ Advanced Settings                               │
│    ├── Breast Physics   ──●──────── [0.65]         │
│    ├── Butt Physics     ──●──────── [0.40]         │
│    └── Thigh Physics    ────●────── [0.20]         │
│                                                    │
│  ▸ Per-Character Override                          │
│    ├── [Dae]    Use Global ▼                       │
│    ├── [Alana]  Custom: Subtle ▼                   │
│    └── [Luna]   Custom: Bouncy ▼                   │
│                                                    │
│  ▸ Behavior                                        │
│    ├── ☑ Respond to movement                       │
│    ├── ☑ Respond to breathing                      │
│    ├── ☑ Respond to emotions                       │
│    └── ☐ Respond to touch (requires touch module)  │
│                                                    │
│  [Reset to Defaults]              [Apply]          │
└────────────────────────────────────────────────────┘
```

### Intensity Slider Mapping

The master intensity slider maps to parameter multipliers:

```javascript
/**
 * Maps a 0-1 intensity value to spring bone parameter multipliers.
 *
 * @param intensity - User-selected intensity (0 = off, 0.25 = subtle,
 *                    0.5 = natural, 0.75 = bouncy, 1.0 = extreme)
 * @returns Parameter multipliers for stiffness, gravity, and drag
 */
function intensityToParams(intensity) {
    return {
        stiffnessMultiplier: 1.0 + (1.0 - intensity) * 1.5,   // 0→2.5, 1→1.0
        gravityMultiplier:   0.1 + intensity * 0.9,             // 0→0.1, 1→1.0
        dragMultiplier:      0.8 - intensity * 0.6,             // 0→0.8, 1→0.2
    };
}
```

### Per-Character Physics Profiles

Stored in the character's config or a dedicated `jiggle_profiles` DB table:

```javascript
const characterPhysicsProfiles = {
    dae: {
        bodyType: 'athletic',
        breastPhysics: { stiffness: 1.0, gravity: 0.5, drag: 0.4 },
        buttPhysics:   { stiffness: 1.2, gravity: 0.3, drag: 0.5 },
        thighPhysics:  { stiffness: 1.5, gravity: 0.2, drag: 0.6 },
    },
    alana: {
        bodyType: 'curvy',
        breastPhysics: { stiffness: 0.6, gravity: 0.8, drag: 0.3 },
        buttPhysics:   { stiffness: 0.8, gravity: 0.5, drag: 0.4 },
        thighPhysics:  { stiffness: 1.2, gravity: 0.3, drag: 0.5 },
    },
    // ...
};
```

### Linking Physics to Emotional State

Physics intensity can subtly shift based on the character's current emotional state or activity:

| Emotional State | Physics Modifier | Rationale |
|----------------|-----------------|-----------|
| **Calm/Relaxed** | 0.8x intensity | Slower, gentler movements |
| **Excited/Happy** | 1.2x intensity | More energetic body language |
| **Embarrassed** | 0.6x intensity | Tends to hold still, arms crossed |
| **Laughing** | 1.4x intensity, burst mode | Rhythmic body shaking |
| **Angry** | 1.1x intensity, sharp | Quick, aggressive movements |
| **Sleepy** | 0.5x intensity | Minimal movement |
| **Flirty** | 1.3x intensity, slow drag | Deliberate, exaggerated sway |

This integrates naturally with our existing `MoodEngine` — the mood state can feed a multiplier into the jiggle physics system each frame.

---

## 8. Advanced: Vertex-Level Soft Body

### Beyond Bone-Based: Actual Mesh Deformation

Bone-based jiggle has limitations: the deformation follows rigid bone transforms weighted by vertex skinning. For truly "soft" results (flesh-like wobble, ripple effects, localized deformation), vertex-level approaches are superior.

### Approach A: Morph Target Blending (Recommended for Phase 1)

Use pre-authored morph targets (blend shapes) that represent different jiggle states:

```
Morph Targets for Breast Physics:
├── breast_bounce_up_L    (upward displacement)
├── breast_bounce_down_L  (downward displacement, gravity sag)
├── breast_bounce_left_L  (lateral)
├── breast_bounce_right_L (lateral)
├── breast_squish_L       (compression against body)
└── (mirror for R)
```

**Blend driven by spring bone state:**
```javascript
/**
 * Drives morph target blend shapes from spring bone joint state.
 * The delta between the joint's current position and rest position
 * determines which morph targets to activate and by how much.
 */
function updateMorphFromSpringBone(mesh, joint, restPosition) {
    const delta = joint.bone.getWorldPosition(new THREE.Vector3())
                    .sub(restPosition);

    // Map vertical displacement to up/down morphs
    const downAmount = Math.max(0, -delta.y) * 10;  // scale to 0-1
    const upAmount = Math.max(0, delta.y) * 10;

    mesh.morphTargetInfluences[morphIndex.bounce_down_L] =
        THREE.MathUtils.clamp(downAmount, 0, 1);
    mesh.morphTargetInfluences[morphIndex.bounce_up_L] =
        THREE.MathUtils.clamp(upAmount, 0, 1);

    // Map lateral displacement to left/right morphs
    const leftAmount = Math.max(0, -delta.x) * 10;
    const rightAmount = Math.max(0, delta.x) * 10;

    mesh.morphTargetInfluences[morphIndex.bounce_left_L] =
        THREE.MathUtils.clamp(leftAmount, 0, 1);
    mesh.morphTargetInfluences[morphIndex.bounce_right_L] =
        THREE.MathUtils.clamp(rightAmount, 0, 1);
}
```

**Pros:** GPU-accelerated, smooth deformation, no bone artifacts, works within Three.js morph target limit (8 GPU targets per mesh in WebGL, but can use texture-based approach for more)

**Cons:** Requires morph targets in the model (must be authored in Blender/VRoid), VRM models typically only have facial blend shapes

**Three.js morph target limit:** WebGL allows 8 morph targets on GPU (4 if normals included). Since facial expressions already use several, breast morphs may need to share the budget or use texture-based morphs.

### Approach B: Vertex Shader Displacement (GPU, No Model Changes)

Apply jiggle deformation entirely in the vertex shader using a custom `ShaderMaterial`:

```glsl
// Vertex shader snippet for breast jiggle
uniform float u_jiggleAmount;    // 0-1 from spring bone state
uniform vec3 u_jiggleDirection;  // normalized displacement direction
uniform vec3 u_breastCenter_L;   // world-space center of left breast
uniform vec3 u_breastCenter_R;   // world-space center of right breast
uniform float u_breastRadius;    // influence radius

varying vec3 vNormal;

void main() {
    vec3 pos = position;

    // Calculate influence weight based on distance from breast center
    float distL = distance(pos, u_breastCenter_L);
    float distR = distance(pos, u_breastCenter_R);
    float weightL = smoothstep(u_breastRadius, 0.0, distL);
    float weightR = smoothstep(u_breastRadius, 0.0, distR);
    float weight = max(weightL, weightR);

    // Apply displacement
    pos += u_jiggleDirection * u_jiggleAmount * weight;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
```

**Pros:** Works on ANY model (no bone requirements), GPU-computed, smooth falloff, can create ripple effects

**Cons:** Requires custom shader material (breaks VRM's default MToon shader unless patched), normal recalculation needed, harder to debug

### Approach C: GPU Compute Shader Soft Body (WebGPU Future)

Full soft body simulation on the GPU using compute shaders:

```javascript
// WebGPU compute shader approach (Three.js WebGPU renderer)
// NOT available in WebGL — requires WebGPU migration
const computeShader = `
@group(0) @binding(0) var<storage, read_write> positions: array<vec4f>;
@group(0) @binding(1) var<storage, read> restPositions: array<vec4f>;
@group(0) @binding(2) var<uniform> params: PhysicsParams;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
    let idx = id.x;
    let pos = positions[idx];
    let rest = restPositions[idx];

    // Spring force toward rest position
    let spring = (rest - pos) * params.stiffness;
    // Gravity
    let gravity = vec4f(0.0, -params.gravityPower, 0.0, 0.0);
    // Damping
    let velocity = (pos - positions[idx + params.vertexCount]) * (1.0 - params.drag);

    positions[idx] = pos + velocity + spring + gravity;
}
`;
```

**Pros:** Massively parallel (thousands of vertices), true soft body, wave propagation effects

**Cons:** Requires WebGPU (not WebGL), browser support still evolving, complex implementation, overkill for our use case

### Feasibility Summary

| Approach | Feasibility | Quality | Performance | Model Requirements | Recommendation |
|----------|-------------|---------|-------------|-------------------|----------------|
| **Bone-based (VRM spring bone)** | Immediate | Good | Excellent | Needs breast bones | **Phase 1: Use this** |
| **Morph target blend** | Medium | Very Good | Good | Needs custom morphs | **Phase 2: Add as enhancement** |
| **Vertex shader** | Medium-Hard | Excellent | Good | None (universal) | **Phase 3: For advanced users** |
| **GPU compute (WebGPU)** | Future | Best | Depends | None | **Phase 4+: When WebGPU matures** |

---

## 9. Implementation Recommendation

### Architecture: `JigglePhysicsManager`

A new class in the viewer that wraps VRM spring bone configuration with jiggle-specific logic:

```
┌──────────────────────────────────────────────────┐
│                   viewer.html                     │
│                                                   │
│  ┌─────────────────────────────────────────────┐  │
│  │          JigglePhysicsManager               │  │
│  │                                             │  │
│  │  ┌───────────┐  ┌───────────┐  ┌────────┐  │  │
│  │  │ Breast    │  │ Butt      │  │ Thigh  │  │  │
│  │  │ Controller│  │ Controller│  │ Ctrl   │  │  │
│  │  └─────┬─────┘  └─────┬─────┘  └───┬────┘  │  │
│  │        │              │             │       │  │
│  │        ▼              ▼             ▼       │  │
│  │  ┌─────────────────────────────────────┐    │  │
│  │  │   VRM SpringBoneManager (existing)  │    │  │
│  │  │   - joints[]                        │    │  │
│  │  │   - colliderGroups[]                │    │  │
│  │  │   - update(delta)                   │    │  │
│  │  └─────────────────────────────────────┘    │  │
│  │                                             │  │
│  │  Inputs:                                    │  │
│  │  - User intensity slider (0-1)              │  │
│  │  - Character body type profile              │  │
│  │  - Emotional state multiplier               │  │
│  │  - Movement state (idle/walk/run/jump)      │  │
│  │                                             │  │
│  │  postMessage API:                           │  │
│  │  - setJiggleIntensity { intensity: 0.65 }   │  │
│  │  - setJiggleProfile { preset: 'natural' }   │  │
│  │  - setJiggleEnabled { enabled: true }       │  │
│  │  - getJiggleInfo → bone discovery results   │  │
│  └─────────────────────────────────────────────┘  │
│                                                   │
│  ┌──────────────────────────────┐                 │
│  │ React UI (Sakura frontend)  │                 │
│  │ JigglePhysicsPanel.tsx      │                 │
│  │ - Master toggle             │                 │
│  │ - Intensity slider          │                 │
│  │ - Per-body-part sliders     │                 │
│  │ - Preset selector           │                 │
│  │ - Per-character overrides   │                 │
│  └──────────────────────────────┘                 │
└──────────────────────────────────────────────────┘
```

### Implementation Phases

| Phase | Scope | Effort | Dependencies |
|-------|-------|--------|--------------|
| **Phase 1:** Spring Bone Jiggle | Detect breast bones, apply presets, intensity slider, master toggle | 4-6h | None — viewer already has spring bone API |
| **Phase 2:** Body Part Controllers | Butt + thigh physics, per-body-part sliders, collider setup | 3-4h | Phase 1 |
| **Phase 3:** Character Profiles | Per-character physics profiles, body type scaling, emotional state integration | 3-4h | Phase 2, MoodEngine |
| **Phase 4:** Bone Injection | Programmatic breast bone addition for models without them | 4-6h | Phase 1 |
| **Phase 5:** Morph Target Enhancement | Blend shape driven jiggle for models with custom morphs | 6-8h | Phase 1, model authoring |
| **Phase 6:** Movement Response | Walk/run/jump detection, dynamic parameter modulation | 4-6h | Phase 3, AnimationDirector |

**Total estimated effort:** 24-34 hours (AI-assisted: ~2-3 hours)

### Immediate Next Steps

1. **Bone discovery:** Scan loaded VRM models for breast bone names (check all naming conventions from Section 4)
2. **Apply presets:** When breast bones found, apply "Natural" preset parameters via existing `setSpringBoneParams` API
3. **Add postMessage API:** `setJiggleIntensity`, `setJiggleEnabled`, `setJiggleProfile`
4. **Build UI:** Simple toggle + slider in Sakura settings panel
5. **Test with VRoid models:** Verify physics behavior with default VRoid Studio exports

---

## Sources

### VRM Spring Bone
- [VRM Spring Bone Settings (VirtualCast Wiki)](https://wiki.virtualcast.jp/wiki/en/vrm/setting/spring)
- [VRMSpringBone Documentation](https://vrm.dev/en/univrm/springbone/univrm_secondary/)
- [VRMC_springBone-1.0 Specification](https://github.com/vrm-c/vrm-specification/blob/master/specification/VRMC_springBone-1.0/README.md)
- [VRM 0.x Specification](https://github.com/vrm-c/vrm-specification/blob/master/specification/0.0/README.md)
- [Spring Bones on Scaled Models (@pixiv/three-vrm)](https://pixiv.github.io/three-vrm/docs/documents/spring-bones-on-scaled-models.html)
- [@pixiv/three-vrm-springbone (npm)](https://www.npmjs.com/package/@pixiv/three-vrm-springbone)
- [SpringBone Physics System (DeepWiki)](https://deepwiki.com/vrm-c/UniVRM/4-springbone-physics-system)
- [pixiv/three-vrm (DeepWiki)](https://deepwiki.com/pixiv/three-vrm)

### Three.js Jiggle/Physics Libraries
- [Wiggle Bones for Three.js](https://wiggle.three.tools/)
- [Wiggle (npm)](https://www.npmjs.com/package/wiggle)
- [threeZboingZboing (GitHub)](https://github.com/WebAR-rocks/threeZboingZboing)
- [Jiggle Bone Physics Spring Damper (Three.js Forum)](https://discourse.threejs.org/t/jiggle-bone-physics-spring-damper/57783)
- [Soft Body Physics in Three.js (Forum)](https://discourse.threejs.org/t/soft-body-physics-in-3d-on-three-js/84116)
- [JiggleEngine (GitHub)](https://github.com/obinexus/jiggleengine)

### VTuber App Physics
- [VSeeFace](https://www.vseeface.icu/)
- [VNyan](https://suvidriel.itch.io/vnyan)
- [Warudo Character Mod Docs](https://docs.warudo.app/docs/modding/character-mod)
- [VRMoveTime (VSeeFace/VNyan plugin)](https://faxanadus.itch.io/vrmovetime)

### VRChat PhysBone / DynamicBone
- [PhysBones Documentation (VRChat)](https://creators.vrchat.com/common-components/physbones/)
- [PhysBone Settings Presets (GitHub)](https://github.com/Z-ANESaber/Phys-Bone-Settings)
- [DynamicBone Configs (GitHub)](https://github.com/Z-ANESaber/DynamicBones-Configs)
- [DynamicBone Breast Preset Values (Gist)](https://gist.github.com/SrPhilippe/43c1bad021fab173d3ef1d5255d53f53)
- [Dynamic Bone Parameter Reference](http://stefanekren.com/vr/dynamicbones.html)
- [VRM to VRChat Import Guide (Siren Watcher)](https://sirenwatcher.com/importing-vrm-to-vrchat-guide/)
- [Phys Bones (VRC School)](https://vrc.school/docs/Avatars/PhysBones/)

### Koikatsu / Game Physics
- [KK_BreastPhysicsController (GitHub)](https://github.com/SNW-KK/KK_BreastPhysicsController)
- [BPC Presets (Patreon)](https://www.patreon.com/posts/free-bpc-presets-106722296)
- [Unity JiggleBone (Unify Wiki)](https://wiki.unity3d.com/index.php/JiggleBone)
- [Unity Dynamic Bone Guide](https://vionixstudio.com/2020/07/12/unity-dynamic-bone-read-this-before-buying/)

### Vertex/Shader Approaches
- [Vertex Displacement with GLSL (Clicktorelease)](https://www.clicktorelease.com/blog/vertex-displacement-noise-3d-webgl-glsl-three-js/)
- [Three.js Morph Targets Example](https://threejs.org/examples/webgl_morphtargets.html)
- [Morph Target GPU Limit Discussion (Three.js #14441)](https://github.com/mrdoob/three.js/issues/14441)
- [64 Blendshapes Request (Three.js #21636)](https://github.com/mrdoob/three.js/issues/21636)

### VRoid Studio
- [VRoid Spring Bone Export FAQ](https://vroid.pixiv.help/hc/en-us/articles/44377205985177)
- [Spring Bones Excessive Shaking FAQ](https://vroid.pixiv.help/hc/en-us/articles/900001027903)

### MMD
- [MMD.js (WebGL)](https://github.com/edvakf/MMD.js)
- [babylon-mmd (GitHub)](https://github.com/noname0310/babylon-mmd)
- [Soft Body Simulation with Ammo.js (GitHub)](https://github.com/philsawicki/soft-body-simulation)
