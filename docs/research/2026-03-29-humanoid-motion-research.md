# Humanoid Motion Quality & Physics Research

**Date:** 2026-03-29
**Author:** Claude Opus 4.6 research agent
**Scope:** Making 3D anime characters MOVE LIKE REAL PEOPLE in Three.js/WebGL
**Stack:** Three.js, @pixiv/three-vrm 3.4.1, WebGL, AnimationMixer
**Target HW:** Mac M2 Pro 16GB, Win RTX 5080 16GB, Win RTX 3070 8GB
**NOT covered:** Hair/cloth spring bones (see `2026-03-29-spring-bones-3d-research.md`)

---

## Table of Contents

1. [Procedural Idle Animation System](#1-procedural-idle-animation-system) (Tier 1)
2. [Easing & Motion Blending](#2-easing--motion-blending) (Tier 1)
3. [Pose Settling / Overshoot](#3-pose-settling--overshoot) (Tier 1)
4. [Inverse Kinematics (IK)](#4-inverse-kinematics-ik) (Tier 2)
5. [Motion Layer Blending / Bone Masks](#5-motion-layer-blending--bone-masks) (Tier 2)
6. [Center of Gravity System](#6-center-of-gravity-system) (Tier 2)
7. [Motion Matching](#7-motion-matching) (Tier 3)
8. [Procedural Gesture Generation](#8-procedural-gesture-generation) (Tier 3)
9. [Neural Motion Synthesis](#9-neural-motion-synthesis) (Tier 3)
10. [Momentum and Follow-Through](#10-momentum-and-follow-through) (Tier 3)
11. [Implementation Priority Matrix](#11-implementation-priority-matrix)
12. [RIKO Reference Analysis](#12-riko-reference-analysis)

---

## 1. Procedural Idle Animation System

**Priority:** CRITICAL -- first thing users notice
**Effort:** 8-12h (enhancement of existing BasePoseLayer + IdleBehaviorLayer)
**Impact:** 9/10

### Current State in Waifu-RT3D

The project already has a sophisticated procedural idle system:

- **BasePoseLayer (L0):** Breathing via `noise1D()` (quintic smoothstep noise), chest X/Z rotation with personality-scaled amplitude, head micro-drift, arm drape at Z=1.4
- **IdleBehaviorLayer (L1):** 16+ fidgets (weight_shift, shoulder_roll, head_tilt, look_around, deep_breath, settle, bounce, foot_tap, hip_cock, etc.) with personality gating (`requires` predicates)
- **noise1D():** Custom 1D value noise with quintic smoothstep -- already superior to pure sinusoidal motion

### What's Missing / Enhancement Opportunities

#### A. Breathing Improvements

Current breathing uses noise-based chest rotation only. Real breathing involves:

```
Bones involved:         What happens:
--------------------    ------------------------------------------
Chest/UpperChest        Expands forward (rotation.x) -- primary
Spine                   Slight sympathetic curve
Shoulders               Rise on inhale, drop on exhale
Clavicles               Spread slightly on deep inhale
Neck                    Micro-extend on inhale
Hips                    Micro-sink on exhale (weight settling)
```

**Enhancement pseudocode:**
```javascript
// Multi-bone breathing with phase offsets
const breathPhase = noise1D(t * 0.8, 0);  // already exists
const inhale = Math.max(0, breathPhase);    // positive = inhale
const exhale = Math.max(0, -breathPhase);   // negative = exhale

// Shoulders rise on inhale (with slight asymmetry)
if (lShoulder) lShoulder.rotation.z += inhale * 0.015;
if (rShoulder) rShoulder.rotation.z -= inhale * 0.012; // asymmetric

// Hips micro-sink on exhale (weight settling)
if (hips) hips.position.y -= exhale * 0.003;

// Neck micro-extend on inhale
if (neck) neck.rotation.x -= inhale * 0.008;
```

#### B. Weight Shifting Enhancement

Current `weight_shift` fidget uses simple sine on hips. Real weight shifting involves:

```
1. Hip TRANSLATES laterally (not just rotates)
2. Supporting leg straightens slightly
3. Non-supporting leg relaxes
4. Spine counter-curves in S-shape
5. Head stays level (vestibulo-ocular reflex)
6. Shoulders tilt opposite to hips
```

**Enhancement pseudocode:**
```javascript
// Full weight shift with lateral translation
const phase = noise1D(t * 0.15, 20);  // very slow
const side = phase;  // -1 = left, +1 = right

if (hips) {
    hips.position.x = side * 0.025;      // lateral shift
    hips.rotation.z = side * 0.03;        // tilt toward weight
}
if (spine)  spine.rotation.z = -side * 0.02;   // counter-curve
if (chest)  chest.rotation.z = -side * 0.015;  // counter-curve
if (head)   head.rotation.z  = -side * 0.01;   // stays level

// Leg relaxation (non-weight side)
if (side > 0.3 && leftUpperLeg) {
    leftUpperLeg.rotation.z += 0.02;  // slight outward relax
    leftUpperLeg.rotation.x += 0.015; // slight forward bend
}
```

#### C. Micro-Movement Layer

Beyond the existing head micro-drift, add:

| Movement | Bones | Frequency | Amplitude | Notes |
|----------|-------|-----------|-----------|-------|
| Eye drift | Expression blendshapes | 0.3-0.8 Hz | lookLeft/Right 0.0-0.15 | Saccade-like |
| Finger curl variance | Hand bones | 0.1-0.2 Hz | rotation.x 0.0-0.1 | If hand bones exist |
| Toe grip | Foot bones | 0.05 Hz | rotation.x 0.0-0.05 | Very subtle |
| Jaw micro-open | Expression | 0.15 Hz | aa blendshape 0.0-0.03 | Breathing jaw |
| Brow micro-drift | Expression | 0.08 Hz | browUp 0.0-0.02 | Thinking |

### Open-Source References

| Project | URL | Relevance |
|---------|-----|-----------|
| three-vrm examples | https://pixiv.github.io/three-vrm/packages/three-vrm/examples/ | Official VRM idle demos |
| human-three-vrm | https://github.com/vladmandic/human-three-vrm | Realtime VRM avatar animation |
| Codrops interactive char | https://tympanus.net/codrops/2019/10/14/how-to-create-an-interactive-3d-character-with-three-js/ | Mouse-following idle |

### Performance Notes

- noise1D() is already optimized (quintic smoothstep, no trig beyond hash)
- Adding 5-8 more bone channels to BasePoseLayer: ~0.02ms/frame additional
- Expression blendshape updates: already batched in expressionManager.update()
- **Total budget:** <0.1ms/frame -- negligible on all target hardware

---

## 2. Easing & Motion Blending

**Priority:** CRITICAL -- the single biggest quality differentiator
**Effort:** 6-10h
**Impact:** 10/10

### The Problem

Linear interpolation (`lerp`) and basic sine waves create mechanical, robotic movement. The difference between "dead" and "alive" is almost entirely in the easing curves.

### RIKO's Approach (Analyzed from Source)

RIKO uses **first-order exponential decay** (a.k.a. "exponential easing"):

```javascript
// From RIKO's animationManager.js (lines 112-114)
this.headCur.x += (this.headTgt.x - this.headCur.x) * headEase;
this.headCur.y += (this.headTgt.y - this.headCur.y) * headEase;
this.headCur.z += (this.headTgt.z - this.headCur.z) * headEase;
```

Where `headEase` = 0.02 (idle) or 0.04 (talking). This is the classic:

```
current += (target - current) * alpha
```

This is equivalent to an exponential decay with halflife = `-1 / log2(1 - alpha)`:
- alpha=0.02 -> halflife ~34 frames (~0.57s at 60fps) -- slow, dreamy idle
- alpha=0.04 -> halflife ~17 frames (~0.28s at 60fps) -- responsive talking

**Why it works:** It produces natural ease-out behavior. The character accelerates instantly toward the target but decelerates smoothly as it approaches. No abrupt stops.

**Why it's not enough:** No velocity continuity. When the target changes, there's an instantaneous velocity discontinuity. The character "snaps" to a new heading then eases.

### Better: Critically Damped Spring

From Daniel Holden's Spring-Roll-Call (https://theorangeduck.com/page/spring-roll-call):

```javascript
/**
 * Critically damped spring -- reaches goal ASAP without oscillation.
 * Maintains velocity continuity across target changes.
 *
 * @param {number} x - Current position
 * @param {number} v - Current velocity
 * @param {number} goal - Target position
 * @param {number} halflife - Time to reduce distance by half (seconds)
 * @param {number} dt - Delta time (seconds)
 * @returns {{x: number, v: number}} New position and velocity
 */
function springDamperExact(x, v, goal, halflife, dt) {
    const y = (4.0 * 0.69314718056) / (halflife + 1e-5) / 2.0;
    const j0 = x - goal;
    const j1 = v + j0 * y;
    const eydt = Math.exp(-y * dt);

    return {
        x: eydt * (j0 + j1 * dt) + goal,
        v: eydt * (v - j1 * y * dt)
    };
}
```

**Parameters:**
- `halflife = 0.15` -- Snappy, responsive (talking, gestures)
- `halflife = 0.3`  -- Natural, relaxed (idle, breathing)
- `halflife = 0.5`  -- Dreamy, languid (sleepy, sad)
- `halflife = 0.08` -- Very snappy (surprise reactions)

### Quaternion Spring (for bone rotations)

Applying springs to quaternions requires converting to scaled angle-axis:

```javascript
/**
 * Critically damped spring for quaternion rotations.
 * Uses scaled angle-axis representation to avoid gimbal/flipping issues.
 *
 * @param {THREE.Quaternion} x - Current rotation
 * @param {THREE.Vector3} v - Current angular velocity (scaled axis)
 * @param {THREE.Quaternion} goal - Target rotation
 * @param {number} halflife - Seconds
 * @param {number} dt - Delta time
 * @returns {{x: THREE.Quaternion, v: THREE.Vector3}}
 */
function springDamperQuaternion(x, v, goal, halflife, dt) {
    const y = (4.0 * 0.69314718056) / (halflife + 1e-5) / 2.0;

    // Convert current-to-goal rotation to scaled angle-axis
    const diff = new THREE.Quaternion().copy(x).multiply(
        new THREE.Quaternion().copy(goal).invert()
    );

    // Ensure shortest path
    if (diff.w < 0) { diff.x = -diff.x; diff.y = -diff.y; diff.z = -diff.z; diff.w = -diff.w; }

    // Quaternion to scaled angle-axis
    const halfAngle = Math.acos(Math.min(1.0, diff.w));
    const sinHalf = Math.sin(halfAngle);
    const j0 = sinHalf < 1e-5
        ? new THREE.Vector3(0, 0, 0)
        : new THREE.Vector3(diff.x, diff.y, diff.z).multiplyScalar(2.0 * halfAngle / sinHalf);

    const j1 = new THREE.Vector3().copy(v).addScaledVector(j0, y);
    const eydt = Math.exp(-y * dt);

    // New angle-axis
    const newAxis = new THREE.Vector3()
        .copy(j0).addScaledVector(j1, dt).multiplyScalar(eydt);

    // Scaled angle-axis back to quaternion
    const angle = newAxis.length();
    const newQuat = angle < 1e-5
        ? new THREE.Quaternion().copy(goal)
        : new THREE.Quaternion().setFromAxisAngle(
            newAxis.normalize(), angle
          ).multiply(goal);

    const newV = new THREE.Vector3()
        .copy(v).addScaledVector(j1, -y * dt).multiplyScalar(eydt);

    return { x: newQuat, v: newV };
}
```

### Three.js AnimationMixer Integration

Three.js `crossFadeTo()` uses linear weight interpolation by default:

```javascript
// Current approach (linear)
oldAction.crossFadeTo(newAction, duration, true);

// The weight curve is linear: w(t) = t / duration
// This feels mechanical.
```

**Enhancement options:**

1. **Custom time scale warping:** Use `setEffectiveTimeScale()` to create non-linear blend
2. **Manual weight control:** Don't use crossFadeTo; instead manually set weights each frame with eased values:

```javascript
// In update loop:
const rawT = elapsed / duration;  // 0..1
const easedT = 1 - Math.exp(-5 * rawT);  // exponential ease-in

oldAction.setEffectiveWeight(1 - easedT);
newAction.setEffectiveWeight(easedT);
```

3. **Inertialization** (best quality): Instead of blending two animations, capture the offset between old and new poses at transition point, then decay that offset using a critically damped spring:

```javascript
// At transition moment:
for (const boneName of allBones) {
    const bone = getBone(boneName);
    const oldQuat = bone.quaternion.clone();
    // Let new animation set the bone
    newAction.play();
    mixer.update(0); // force one eval
    const newQuat = bone.quaternion.clone();

    // Store offset
    offsets[boneName] = {
        quat: new THREE.Quaternion().copy(oldQuat).multiply(newQuat.clone().invert()),
        velocity: new THREE.Vector3(0, 0, 0)
    };
}

// Each frame during transition:
for (const boneName of allBones) {
    const off = offsets[boneName];
    // Decay the offset with spring
    const result = springDamperQuaternion(
        off.quat, off.velocity, IDENTITY_QUAT, 0.15, dt
    );
    off.quat = result.x;
    off.velocity = result.v;

    // Apply decaying offset on top of new animation
    bone.quaternion.premultiply(off.quat);
}
```

### Libraries

| Library | URL | Notes |
|---------|-----|-------|
| Spring-Roll-Call (reference) | https://theorangeduck.com/page/spring-roll-call | Daniel Holden's definitive guide |
| toqoz springs | https://toqoz.fyi/springs.html | Quaternion spring with shortest-path |
| Motion (JS) | https://motion.dev/ | Spring animations for DOM/Three.js |
| Allen Chou's springs | https://allenchou.net/2015/04/game-math-precise-control-over-numeric-springing/ | Closed-form spring with frequency/damping ratio |
| Ryan Juckett's springs | https://www.ryanjuckett.com/damped-springs/ | C++ reference with all damping regimes |

### Performance

- Spring evaluation per bone: ~0.001ms (just exp + 3 multiplies)
- 50 bones * spring: ~0.05ms/frame
- Quaternion spring is heavier (~0.003ms/bone) due to angle-axis conversion
- **Total budget:** <0.2ms/frame -- negligible

---

## 3. Pose Settling / Overshoot

**Priority:** HIGH -- makes transitions feel weighted and physical
**Effort:** 4-8h
**Impact:** 8/10

### The Concept

When a character transitions from one pose to another, real bodies overshoot slightly due to momentum, then settle back. This is the difference between "puppet" and "person."

```
Without overshoot:     With overshoot:

target ─────────────   target ─ ─ ─ ─ ─ ─
      /                      /\
     /                      /  \___________
    /                      /
start                  start
```

### Implementation: Under-Damped Spring

From the Spring-Roll-Call, an under-damped spring (damping ratio < 1) naturally produces overshoot:

```javascript
/**
 * Under-damped spring -- oscillates around goal before settling.
 * Produces natural overshoot-and-settle on bone rotations.
 *
 * @param {number} x - Current value
 * @param {number} v - Current velocity
 * @param {number} goal - Target value
 * @param {number} frequency - Oscillation frequency (Hz)
 * @param {number} halflife - Decay halflife (seconds)
 * @param {number} dt - Delta time
 * @returns {{x: number, v: number}}
 */
function springDamperUnder(x, v, goal, frequency, halflife, dt) {
    const d = (4.0 * 0.69314718056) / (halflife + 1e-5);
    const s = (2.0 * Math.PI * frequency) * (2.0 * Math.PI * frequency);
    const discrim = s - (d * d / 4.0);

    // Must be positive for under-damped
    if (discrim <= 0) {
        // Fallback to critically damped
        return springDamperExact(x, v, goal, halflife, dt);
    }

    const w = Math.sqrt(discrim);
    const y = d / 2.0;

    const j = Math.sqrt(
        ((v + y * (x - goal)) / w) * ((v + y * (x - goal)) / w) +
        (x - goal) * (x - goal)
    );
    const p = Math.atan2(v + y * (x - goal), w * (x - goal));

    const eydt = Math.exp(-y * dt);

    return {
        x: j * eydt * Math.cos(w * dt + p) + goal,
        v: -y * j * eydt * Math.cos(w * dt + p)
            - w * j * eydt * Math.sin(w * dt + p)
    };
}
```

### Recommended Parameters

| Use Case | frequency | halflife | Overshoot Amount |
|----------|-----------|----------|------------------|
| Head turn (reaction) | 3.0 Hz | 0.15s | ~10% overshoot |
| Body lean (gesture) | 2.0 Hz | 0.20s | ~15% overshoot |
| Hip shift (weight) | 1.5 Hz | 0.30s | ~8% overshoot |
| Arm gesture (expressive) | 4.0 Hz | 0.12s | ~20% overshoot |
| Return to idle | 1.0 Hz | 0.40s | ~5% overshoot |
| Surprise reaction | 6.0 Hz | 0.08s | ~25% overshoot |

### Architecture: SpringBone Manager for Primary Skeleton

```javascript
/**
 * Manages spring-driven settling for primary skeleton bones.
 * Distinct from VRM spring bones (which handle secondary physics).
 * This applies to the MAIN skeleton for overshoot-and-settle on pose changes.
 */
class PoseSpringManager {
    constructor() {
        this.springs = new Map(); // boneName -> { x, v, goal, halflife, frequency }
    }

    /**
     * Set a new target for a bone with spring settling.
     */
    setTarget(boneName, axis, goal, frequency = 2.0, halflife = 0.2) {
        const key = `${boneName}.${axis}`;
        if (!this.springs.has(key)) {
            this.springs.set(key, { x: goal, v: 0, goal, frequency, halflife });
        } else {
            this.springs.get(key).goal = goal;
        }
    }

    /**
     * Update all springs and return bone deltas.
     */
    update(dt) {
        const deltas = {};
        for (const [key, spring] of this.springs) {
            const result = springDamperUnder(
                spring.x, spring.v, spring.goal,
                spring.frequency, spring.halflife, dt
            );
            spring.x = result.x;
            spring.v = result.v;

            const [boneName, axis] = key.split('.');
            if (!deltas[boneName]) deltas[boneName] = {};
            deltas[boneName][axis] = result.x;
        }
        return deltas;
    }
}
```

### Performance

- Per spring channel: ~0.003ms (exp + sin + cos + sqrt)
- 20 active spring channels: ~0.06ms/frame
- Springs at rest (|v| < epsilon) can be skipped: often only 3-5 active simultaneously
- **Total budget:** <0.1ms/frame

### References

- Daniel Holden, "Spring-It-On: The Game Developer's Spring-Roll-Call" -- https://theorangeduck.com/page/spring-roll-call
- Allen Chou, "Game Math: Precise Control over Numeric Springing" -- https://allenchou.net/2015/04/game-math-precise-control-over-numeric-springing/
- Alexis Bacot, "The Art of Damping" -- https://www.alexisbacot.com/blog/the-art-of-damping
- Math Proofs, "Critically Damped Spring Smoothing" -- http://mathproofs.blogspot.com/2013/07/critically-damped-spring-smoothing.html

---

## 4. Inverse Kinematics (IK)

**Priority:** HIGH for Look-At, MEDIUM for feet/hands
**Effort:** 10-20h total
**Impact:** 8/10

### A. VRMLookAt (Built-in -- Already Available)

@pixiv/three-vrm 3.4.1 includes a full VRMLookAt system:

```javascript
// Already available on loaded VRM:
vrm.lookAt.target = targetObject;  // THREE.Object3D to look at
vrm.lookAt.autoUpdate = true;      // Updates in vrm.update()

// Properties:
vrm.lookAt.offsetFromHeadBone;  // THREE.Vector3 offset
vrm.lookAt.applier;             // VRMLookAtBoneApplier or VRMLookAtExpressionApplier

// Manual control:
vrm.lookAt.lookAt(new THREE.Vector3(x, y, z));  // world-space target
```

**Types:**
- `bone` type: Rotates eye bones directly (more natural for 3D)
- `expression` type: Uses morph targets (lookLeft/Right/Up/Down blendshapes)

**Enhancement -- cursor tracking:**
```javascript
// In viewer.html, track mouse and convert to world space
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

canvas.addEventListener('mousemove', (e) => {
    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);

    // Place target 2m in front of camera along ray
    const target = new THREE.Vector3();
    raycaster.ray.at(2.0, target);
    vrm.lookAt.target.position.copy(target);
});
```

**Effort:** 2-4h (mostly wiring, the system exists)

### B. Foot IK (Preventing Foot Sliding)

Three.js includes `CCDIKSolver` in addons:

```javascript
import { CCDIKSolver } from 'three/addons/animation/CCDIKSolver.js';

// IK chain configuration for left foot
const iks = [{
    target: leftFootTargetBoneIndex,  // Index in skeleton.bones[]
    effector: leftFootBoneIndex,
    links: [
        { index: leftLowerLegBoneIndex },
        { index: leftUpperLegBoneIndex, limitation: new THREE.Vector3(1, 0, 0) }
    ],
    iteration: 3  // CCD iterations per frame
}];

const ikSolver = new CCDIKSolver(skinnedMesh, iks);

// In update loop:
ikSolver.update();
```

**Challenge with VRM:** VRM uses normalized bones with a different index mapping than raw skeleton. Need to resolve VRM humanoid bone names to skeleton bone indices:

```javascript
function getVRMBoneIndex(vrm, humanBoneName) {
    const node = vrm.humanoid.getNormalizedBoneNode(humanBoneName);
    return vrm.scene.getObjectByName(node.name)?.userData?.boneIndex;
    // OR traverse skeleton.bones to find matching node
}
```

**Alternative: Manual two-bone IK (simpler, more control):**
```javascript
/**
 * Analytical two-bone IK for leg/arm chains.
 * Much simpler than CCD for two-bone chains.
 *
 * @param {THREE.Bone} upper - Upper leg/arm bone
 * @param {THREE.Bone} lower - Lower leg/arm bone
 * @param {THREE.Vector3} target - World-space target position
 * @param {THREE.Vector3} pole - Pole vector for bend direction
 */
function twoBoneIK(upper, lower, target, pole) {
    const upperLen = upper.position.distanceTo(lower.position);
    const lowerLen = lower.children[0]
        ? lower.position.distanceTo(lower.children[0].position)
        : upperLen;  // fallback

    const rootPos = new THREE.Vector3();
    upper.getWorldPosition(rootPos);

    const toTarget = new THREE.Vector3().subVectors(target, rootPos);
    const dist = Math.min(toTarget.length(), upperLen + lowerLen - 0.001);

    // Law of cosines for knee angle
    const cosAngle = (upperLen * upperLen + lowerLen * lowerLen - dist * dist)
                   / (2 * upperLen * lowerLen);
    const kneeAngle = Math.acos(Math.max(-1, Math.min(1, cosAngle)));

    // Apply to lower bone (bend axis typically X for legs)
    lower.rotation.x = -(Math.PI - kneeAngle);

    // Upper bone points toward target
    upper.lookAt(target);
    // ... additional pole vector correction needed
}
```

**Effort:** 8-12h for foot IK with ground plane detection

### C. Available IK Libraries

| Library | URL | Algorithm | Notes |
|---------|-----|-----------|-------|
| CCDIKSolver (Three.js built-in) | https://threejs.org/docs/pages/CCDIKSolver.html | CCD | Iterative, works with SkinnedMesh |
| THREE.IK | https://github.com/jsantell/THREE.IK | FABRIK | Multi-chain, ball-joint constraints |
| IK-threejs (UPF) | https://github.com/upf-gti/IK-threejs | CCD + FABRIK + hybrid | Most complete, academic quality |
| closed-chain-ik-js | (Three.js forum) | Closed-chain | For parallel kinematics |
| threeZboingZboing | https://github.com/WebAR-rocks/threeZboingZboing | Spring damper | Physics-based IK alternative |

### VRM-Specific Constraints

@pixiv/three-vrm 3.4.1 includes `VRMNodeConstraintManager` which handles:
- **Aim constraints:** Point one bone at another (useful for weapon aiming, etc.)
- **Roll constraints:** Transfer rotation from one bone to another
- These are defined in the VRM file via `VRMC_node_constraint` extension
- Updated automatically in `vrm.update()` pipeline order: lookAt -> constraints -> spring bones

**What VRM does NOT have built-in:** Full IK solving. You must bring your own IK solver and apply it before `vrm.update()`.

### Performance

- CCD IK (3 iterations, 2 chains): ~0.1ms/frame
- Two-bone analytical IK (2 chains): ~0.02ms/frame
- VRMLookAt: already in the pipeline, ~0ms additional
- **Recommendation:** Two-bone analytical for legs, VRMLookAt for head/eyes

---

## 5. Motion Layer Blending / Bone Masks

**Priority:** HIGH -- enables simultaneous upper/lower body animations
**Effort:** 12-16h
**Impact:** 8/10

### The Problem

Three.js `AnimationMixer` does NOT natively support per-bone animation masks (like Unity's Avatar Mask or Unreal's Layered Blend per Bone). All `AnimationAction`s affect all bones they have keyframes for.

### Current Waifu-RT3D Architecture

The AnimationDirector already uses a layered system:
```
L0: BasePose     -- SET mode (breathing, arm drape)
L1: Idle         -- SET mode (fidgets)
L2: Emotion      -- deprecated, replaced by L4
L3: Talk         -- additive (lip sync, head nod emphasis)
L4: Gesture      -- SET mode (arm gestures from emotion)
L5: LookAt       -- always active (eye/head tracking)
L6: Clip         -- AnimationMixer clips (Mixamo, BVH)
```

State machine controls which layers are active. This is already a form of layer blending, but it's all-or-nothing per layer.

### Solution 1: AnimationAction Property Binding Filtering (Proven)

From the Three.js forum (2024), the proven workaround:

```javascript
/**
 * Apply a bone mask to an AnimationAction by filtering its property bindings.
 * Only bones whose names are in allowedBones will be affected by this action.
 *
 * WARNING: Uses Three.js internal API (_propertyBindings, _interpolants).
 * Forward-compatibility risk. Works with Three.js r160+.
 *
 * @param {THREE.AnimationAction} action - The action to mask
 * @param {Set<string>} allowedBones - Set of bone names to keep
 */
function applyBoneMask(action, allowedBones) {
    const filteredBindings = [];
    const filteredInterpolants = [];

    action._propertyBindings.forEach((binding, index) => {
        const targetObj = binding?.binding?.targetObject;
        if (targetObj && allowedBones.has(targetObj.name)) {
            filteredBindings.push(binding);
            filteredInterpolants.push(action._interpolants[index]);
        }
    });

    action._propertyBindings = filteredBindings;
    action._interpolants = filteredInterpolants;
}

// Usage:
const upperBodyBones = new Set([
    'spine', 'chest', 'upperChest', 'neck', 'head',
    'leftShoulder', 'rightShoulder',
    'leftUpperArm', 'rightUpperArm',
    'leftLowerArm', 'rightLowerArm',
    'leftHand', 'rightHand'
]);

const lowerBodyBones = new Set([
    'hips', 'leftUpperLeg', 'rightUpperLeg',
    'leftLowerLeg', 'rightLowerLeg',
    'leftFoot', 'rightFoot', 'leftToes', 'rightToes'
]);

const talkAction = mixer.clipAction(talkClip);
applyBoneMask(talkAction, upperBodyBones);  // Talk only affects upper body

const idleAction = mixer.clipAction(idleClip);
applyBoneMask(idleAction, lowerBodyBones);  // Idle stance on lower body
```

**Caveats:**
- Relies on Three.js internals (`_propertyBindings`, `_interpolants`)
- Must re-apply after action reset
- Blender export must have "Optimize Animation > Force Keeping Channels for Bones" UNCHECKED

### Solution 2: Manual Bone Control (What We Already Do)

The current AnimationDirector approach of manually setting bone rotations per-layer is effectively the same as bone masking, but with more control:

```javascript
// Each layer only touches specific bones:
class TalkLayer extends AnimationLayer {
    update(dt) {
        // Only touches: head, neck, chest (for emphasis nods)
        const head = this.getBone('head');
        const neck = this.getBone('neck');
        // ... modify only these bones
    }
}
```

**Advantage:** No internal API dependency
**Disadvantage:** Can't use pre-made AnimationClip data with bone masks

### Solution 3: Dual Mixer Architecture

Use two separate `AnimationMixer` instances for upper and lower body:

```javascript
const upperMixer = new THREE.AnimationMixer(model);
const lowerMixer = new THREE.AnimationMixer(model);

// Filter clip tracks before creating actions
function filterClipToBones(clip, allowedBones) {
    const filtered = clip.clone();
    filtered.tracks = filtered.tracks.filter(track => {
        const boneName = track.name.split('.')[0]
            .replace(/\[.*\]/, '')
            .split('/').pop();
        return allowedBones.has(boneName);
    });
    return filtered;
}

const upperClip = filterClipToBones(gestureClip, upperBodyBones);
const upperAction = upperMixer.clipAction(upperClip);
```

**Advantage:** Clean separation, no internal APIs
**Disadvantage:** Two mixers to manage, potential conflicts at spine (shared bone)

### VTuber App Patterns

VTuber applications (VSeeFace, VNyan, etc.) typically use:
1. **Face capture** -> expression blendshapes (separate from body)
2. **Upper body tracking** -> shoulders, arms, hands
3. **Base pose** -> procedural idle on lower body
4. **Lip sync** -> mouth blendshapes (independent channel)

This maps well to our existing layer architecture. The key addition needed is the ability to play Mixamo clips on a subset of bones.

### Recommended Approach

Combine Solution 2 (manual layers for procedural) with Solution 1 (property binding filtering for clip-based animations):

```
Procedural layers (L0-L5): Continue manual bone control
Clip layer (L6): Use bone mask filtering to separate upper/lower
New: Add "blend zone" for spine -- weighted blend between upper and lower
```

### Performance

- Track filtering at clip load time: one-time cost
- Runtime: no additional cost (fewer tracks = faster evaluation)
- Dual mixer: ~0.05ms additional per mixer tick

---

## 6. Center of Gravity System

**Priority:** MEDIUM -- adds weight and groundedness
**Effort:** 10-15h
**Impact:** 7/10

### Core Concept

Track a virtual Center of Gravity (CoG) based on the current pose, then apply compensating movements to maintain balance. This makes the character feel like they have WEIGHT.

### CoG Calculation

```javascript
/**
 * Approximate Center of Gravity for a VRM humanoid.
 * Uses weighted average of key bone world positions.
 *
 * Body segment mass distribution (biomechanics standard):
 *   Head: 8%, Torso: 50%, Upper Arms: 6%, Lower Arms: 4%,
 *   Upper Legs: 20%, Lower Legs: 12%
 */
const MASS_WEIGHTS = {
    head: 0.08,
    chest: 0.25,  // upper torso
    spine: 0.25,  // lower torso
    leftUpperArm: 0.03, rightUpperArm: 0.03,
    leftLowerArm: 0.02, rightLowerArm: 0.02,
    leftUpperLeg: 0.10, rightUpperLeg: 0.10,
    leftLowerLeg: 0.06, rightLowerLeg: 0.06
};

function calculateCoG(vrm) {
    const cog = new THREE.Vector3();
    let totalMass = 0;
    const worldPos = new THREE.Vector3();

    for (const [boneName, mass] of Object.entries(MASS_WEIGHTS)) {
        const bone = vrm.humanoid.getNormalizedBoneNode(boneName);
        if (bone) {
            bone.getWorldPosition(worldPos);
            cog.addScaledVector(worldPos, mass);
            totalMass += mass;
        }
    }

    cog.divideScalar(totalMass);
    return cog;
}
```

### Balance Compensation

```javascript
/**
 * Apply hip shift compensation to keep CoG above feet (base of support).
 * Called after all other layers, before vrm.update().
 */
class BalanceLayer {
    constructor(vrm) {
        this.vrm = vrm;
        this.supportCenter = new THREE.Vector3(); // midpoint between feet
        this.cogOffset = new THREE.Vector3();      // spring-driven offset
        this.cogVelocity = new THREE.Vector3();
    }

    update(dt) {
        // 1. Calculate current CoG
        const cog = calculateCoG(this.vrm);

        // 2. Calculate base of support (midpoint between feet)
        const lFoot = this.vrm.humanoid.getNormalizedBoneNode('leftFoot');
        const rFoot = this.vrm.humanoid.getNormalizedBoneNode('rightFoot');
        if (lFoot && rFoot) {
            const lPos = new THREE.Vector3();
            const rPos = new THREE.Vector3();
            lFoot.getWorldPosition(lPos);
            rFoot.getWorldPosition(rPos);
            this.supportCenter.lerpVectors(lPos, rPos, 0.5);
        }

        // 3. Calculate horizontal deviation
        const deviation = new THREE.Vector2(
            cog.x - this.supportCenter.x,
            cog.z - this.supportCenter.z
        );

        // 4. Apply compensating hip shift (spring-damped)
        const hips = this.vrm.humanoid.getNormalizedBoneNode('hips');
        if (hips && deviation.length() > 0.01) {
            // Shift hips to re-center CoG
            const correction = deviation.multiplyScalar(-0.3); // 30% correction
            hips.position.x += correction.x * dt * 2.0;
            hips.position.z += correction.y * dt * 2.0;

            // Counter-tilt spine
            const spine = this.vrm.humanoid.getNormalizedBoneNode('spine');
            if (spine) {
                spine.rotation.z += deviation.x * 0.1;
            }
        }
    }
}
```

### When CoG Matters Most

| Scenario | CoG Effect | Visual Impact |
|----------|-----------|---------------|
| Arm gesture (one arm raised) | CoG shifts to that side | Hip shifts opposite |
| Leaning forward (interested) | CoG moves forward | Slight squat/ankle bend |
| Head turn (looking aside) | Small CoG shift | Barely perceptible hip counter |
| Crossed arms | CoG slightly forward | Very subtle forward lean |
| Surprise (lean back) | CoG moves back | Weight on heels |

### Performance

- CoG calculation (10 bone world positions): ~0.05ms/frame
- Balance compensation: ~0.01ms/frame
- Could be run at half rate (30Hz) for further savings
- **Total budget:** ~0.06ms/frame

### References

- "Center of Mass: Tools and Techniques" -- https://www.gamedeveloper.com/design/center-of-mass-tools-and-techniques-for-animating-natural-human-movement
- "Physics of Balance & Weight Shift" -- http://www.algarcia.org/AnimationPhysics/BalanceTutorial.pdf
- "Interactive Character Animation using Simulated Physics" -- http://graphics.cs.cmu.edu/nsp/course/15-869/2012/papers/PhysicsAnimation_EG11.pdf

---

## 7. Motion Matching

**Priority:** MEDIUM-LOW (high effort, but massive quality ceiling)
**Effort:** 40-60h
**Impact:** 9/10 (if done well)

### What Is Motion Matching?

Instead of hand-authoring state machines and transitions, motion matching:
1. Builds a **database** of motion capture poses with feature vectors
2. Each frame, **searches** the database for the best-matching next pose
3. **Blends** from current pose to the matched pose

The result is fluid, natural transitions without manual crossfade tuning.

### Daniel Holden's Implementation

Repository: https://github.com/orangeduck/Motion-Matching

- Languages: C++ (39.3%), Python (33.9%), C (21.2%), HTML (4.3%)
- **Runs in browser** via Emscripten/WebAssembly compilation
- Animation database: binary format (`.bin` files)
- Learned Motion Matching trains 3 neural networks:
  - **Decompressor:** Reconstructs full pose from compressed features
  - **Stepper:** Predicts next frame from current state
  - **Projector:** Maps full features to search-friendly latent space

### Feasibility for Waifu-RT3D

```
                    Motion Matching Pipeline
                    ========================

    Mixamo 2500 clips          Curated 50-100 clips
    (FBX format)          -->  (idle, talk, gesture,
                                emotional states)
         |                           |
         v                           v
    Retarget to VRM            Build feature database
    bone space                 (positions, velocities,
                                trajectories)
         |                           |
         v                           v
    BVH/binary export          Motion matching search
                               (per-frame, <1ms)
         |                           |
         v                           v
    Database file              Inertialization blend
    (~50MB for 100 clips)      (spring-based transition)
```

### Challenges for Our Use Case

1. **We're mostly stationary.** Motion matching shines for locomotion (walk/run/turn). Our character stands in place. The ROI is lower.
2. **Database size.** 100 clips at 30fps, 3min average = ~540K frames. Feature vectors at 256 floats/frame = ~554MB uncompressed. Learned Motion Matching compresses this to ~10-50MB.
3. **Retargeting.** Mixamo skeleton != VRM skeleton. Need bone mapping (our MIXAMO_BONE_MAP already handles this for clip playback).
4. **Build pipeline.** Requires offline processing: download clips, retarget, extract features, train networks.

### Recommended Approach: Hybrid

Instead of full motion matching, use a **simplified "pose library" approach**:

```javascript
/**
 * Simplified motion matching for idle/talk states.
 * Instead of per-frame matching, match on state transitions.
 *
 * Database: 50-100 short clips (2-5 seconds each), tagged by:
 *   - emotion (happy, sad, angry, neutral, etc.)
 *   - intensity (low, medium, high)
 *   - body area (full, upper, gesture)
 *   - category (idle, talk, react, transition)
 */
class PoseLibrary {
    constructor() {
        this.clips = [];  // { clip, tags, features }
    }

    /**
     * Find best matching clip for current context.
     */
    findBest(emotion, intensity, category) {
        let best = null;
        let bestScore = -Infinity;

        for (const entry of this.clips) {
            let score = 0;
            if (entry.tags.emotion === emotion) score += 3;
            if (entry.tags.intensity === intensity) score += 1;
            if (entry.tags.category === category) score += 2;
            // Avoid repeating same clip
            if (entry === this.lastPlayed) score -= 5;

            if (score > bestScore) {
                bestScore = score;
                best = entry;
            }
        }

        this.lastPlayed = best;
        return best?.clip;
    }
}
```

### Curating the Clip Library (Mixamo)

Recommended 50-clip starter set:

| Category | Clips | Mixamo Names (examples) |
|----------|-------|-------------------------|
| Idle poses | 8 | Idle, Happy Idle, Sad Idle, Bored, Shy, Confident Pose, Weight Shift, Breathing Idle |
| Talk gestures | 10 | Talking, Explaining, Arguing, Whispering, Laughing, Nodding, Shaking Head, Pointing, Shrugging, Hand Wave |
| Emotional reactions | 12 | Surprised, Angry, Crying, Joyful Jump, Clapping, Face Palm, Embarrassed, Thinking, Frustrated, Relieved, Excited, Scared |
| Transitional | 5 | Stretch, Yawn, Look Around, Cross Arms, Put Hands on Hips |
| Special | 5 | Bow, Curtsy, Heart Shape, Peace Sign, Blown Kiss |

### References

- Daniel Holden, "Learned Motion Matching" (SIGGRAPH 2020) -- https://theorangeduck.com/page/spring-roll-call
- Motion Matching GitHub -- https://github.com/orangeduck/Motion-Matching
- Simon Clavet, "Motion Matching and The Road to Next-Gen Animation" (GDC 2016)

---

## 8. Procedural Gesture Generation

**Priority:** MEDIUM -- makes each response feel unique
**Effort:** 15-25h
**Impact:** 7/10

### The Vision

Instead of playing pre-canned gesture clips, generate gestures procedurally from emotion/intensity parameters. Each gesture is composed of **components** that can be mixed:

```
Emotion Tag: "excited"
Intensity: 0.8

Components:
  arm_raise:     0.7  (how high arms go)
  speed:         1.3  (faster than baseline)
  symmetry:      0.6  (somewhat asymmetric)
  follow_through: 0.9 (lots of overshoot)
  repetition:    2    (bouncy, repeating)
```

### Architecture: Component-Based Gesture System

```javascript
/**
 * Procedural gesture generator.
 * Composes gestures from parameterized components rather than fixed clips.
 */
class ProceduralGestureEngine {
    constructor(vrm) {
        this.vrm = vrm;
        this.activeGesture = null;
        this.gestureTime = 0;
    }

    /**
     * Generate a gesture from emotion parameters.
     *
     * @param {string} emotion - Emotion tag (happy, sad, angry, etc.)
     * @param {number} intensity - 0.0-1.0
     * @returns {GestureProgram} A program of bone movements
     */
    generate(emotion, intensity) {
        const template = GESTURE_TEMPLATES[emotion] || GESTURE_TEMPLATES.neutral;
        return {
            duration: template.baseDuration / (0.5 + intensity * 0.8),
            bones: template.bones.map(b => ({
                name: b.name,
                // Randomize within range for variety
                amplitude: b.baseAmplitude * intensity * (0.8 + Math.random() * 0.4),
                axis: b.axis,
                curve: b.curve,  // 'spring', 'sine', 'ease-out'
                delay: b.delay * (0.9 + Math.random() * 0.2),
                overshoot: template.overshoot * intensity
            }))
        };
    }
}

const GESTURE_TEMPLATES = {
    happy: {
        baseDuration: 1.5,
        overshoot: 0.2,
        bones: [
            { name: 'chest', axis: 'x', baseAmplitude: -0.08, curve: 'spring', delay: 0 },
            { name: 'head', axis: 'x', baseAmplitude: -0.12, curve: 'spring', delay: 0.05 },
            { name: 'leftUpperArm', axis: 'z', baseAmplitude: -0.3, curve: 'spring', delay: 0.1 },
            { name: 'rightUpperArm', axis: 'z', baseAmplitude: 0.3, curve: 'spring', delay: 0.12 },
            { name: 'leftLowerArm', axis: 'y', baseAmplitude: -0.4, curve: 'ease-out', delay: 0.15 },
            { name: 'rightLowerArm', axis: 'y', baseAmplitude: 0.4, curve: 'ease-out', delay: 0.17 },
        ]
    },
    sad: {
        baseDuration: 2.5,
        overshoot: 0.05,
        bones: [
            { name: 'spine', axis: 'x', baseAmplitude: 0.06, curve: 'ease-out', delay: 0 },
            { name: 'chest', axis: 'x', baseAmplitude: 0.04, curve: 'ease-out', delay: 0.1 },
            { name: 'head', axis: 'x', baseAmplitude: 0.1, curve: 'ease-out', delay: 0.2 },
            { name: 'leftUpperArm', axis: 'x', baseAmplitude: 0.05, curve: 'ease-out', delay: 0.1 },
            { name: 'rightUpperArm', axis: 'x', baseAmplitude: 0.05, curve: 'ease-out', delay: 0.1 },
        ]
    },
    angry: {
        baseDuration: 0.8,
        overshoot: 0.3,
        bones: [
            { name: 'chest', axis: 'x', baseAmplitude: -0.1, curve: 'spring', delay: 0 },
            { name: 'head', axis: 'x', baseAmplitude: -0.05, curve: 'spring', delay: 0 },
            { name: 'leftUpperArm', axis: 'z', baseAmplitude: -0.2, curve: 'spring', delay: 0.05 },
            { name: 'leftLowerArm', axis: 'y', baseAmplitude: -0.6, curve: 'spring', delay: 0.08 },
        ]
    },
    surprised: {
        baseDuration: 0.6,
        overshoot: 0.35,
        bones: [
            { name: 'spine', axis: 'x', baseAmplitude: -0.08, curve: 'spring', delay: 0 },
            { name: 'head', axis: 'x', baseAmplitude: -0.15, curve: 'spring', delay: 0 },
            { name: 'leftUpperArm', axis: 'z', baseAmplitude: -0.4, curve: 'spring', delay: 0 },
            { name: 'rightUpperArm', axis: 'z', baseAmplitude: 0.4, curve: 'spring', delay: 0 },
            { name: 'leftLowerArm', axis: 'y', baseAmplitude: -0.3, curve: 'spring', delay: 0.05 },
            { name: 'rightLowerArm', axis: 'y', baseAmplitude: 0.3, curve: 'spring', delay: 0.05 },
        ]
    },
    neutral: {
        baseDuration: 1.8,
        overshoot: 0.1,
        bones: [
            { name: 'head', axis: 'y', baseAmplitude: 0.1, curve: 'ease-out', delay: 0 },
            { name: 'leftUpperArm', axis: 'x', baseAmplitude: 0.08, curve: 'ease-out', delay: 0.1 },
        ]
    }
};
```

### Academic Research

| Paper | Year | Key Finding |
|-------|------|-------------|
| Llanimation (Windle et al.) | 2024 | LLama2 text embeddings produce better gestures than audio features alone |
| EMOTION (arxiv 2410.23234) | 2024 | In-context learning for expressive humanoid gestures from text |
| AMUSE (arxiv 2312.04466) | 2023 | Disentangled content/emotion/style latent diffusion for body animation |
| Generative AI for Character Animation Survey | 2025 | Comprehensive survey of LLM/diffusion approaches |

**Key insight from Llanimation:** LLM features on their own perform significantly better than audio features for gesture generation. This means our existing LLM emotion tags are a strong signal for procedural gestures.

### References

- Llanimation paper -- https://arxiv.org/abs/2405.08042
- EMOTION paper -- https://arxiv.org/html/2410.23234v1
- awesome-gesture_generation -- https://github.com/openhuman-ai/awesome-gesture_generation
- LLM_animation showroom -- https://github.com/Whalefishin/LLM_animation

---

## 9. Neural Motion Synthesis

**Priority:** LOW (research-phase, not real-time ready for WebGL)
**Effort:** 60-100h (including pipeline)
**Impact:** 10/10 (if feasible)

### State of the Art (2025-2026)

| Model | Year | Approach | Quality | Speed |
|-------|------|----------|---------|-------|
| MDM (Motion Diffusion Model) | 2023 | Diffusion on motion sequences | High | ~5s/motion (GPU) |
| T2M-GPT | 2023 | GPT on discrete motion tokens | High | ~2s/motion |
| MoMask | 2024 | Masked transformer on motion tokens | Very high | ~3s/motion |
| MotionGPT | 2023 | LLM (Llama) on motion tokens | High | ~3s/motion |
| MotionGPT-2 | 2024 | General-purpose motion-language | Very high | ~2s/motion |
| MotionGPT3 | 2025 | Continuous VAE+diffusion+MoE | State of art | ~1.5s/motion |
| GeoMotionGPT | 2026 | Geometric alignment + LLM | Cutting edge | ~1s/motion |

### The Pipeline Problem

```
Text prompt              Neural model             VRM Bones
"wave happily"    -->    MotionGPT3        -->    ???
                         (outputs SMPL              |
                          joint rotations)          |
                              |                     |
                              v                     |
                         SMPL skeleton              |
                         (24 joints,                |
                          axis-angle)               |
                              |                     |
                         Retarget to VRM            |
                         humanoid bones     --------+
                         (55+ bones,
                          quaternions)
```

### SMPL to VRM Bone Mapping

```javascript
/**
 * SMPL has 24 joints, VRM humanoid has 55+ bones.
 * Direct mapping for the 24 SMPL joints:
 */
const SMPL_TO_VRM = {
    0:  'hips',           // Pelvis
    1:  'leftUpperLeg',   // L_Hip
    2:  'rightUpperLeg',  // R_Hip
    3:  'spine',          // Spine1
    4:  'leftLowerLeg',   // L_Knee
    5:  'rightLowerLeg',  // R_Knee
    6:  'chest',          // Spine2
    7:  'leftFoot',       // L_Ankle
    8:  'rightFoot',      // R_Ankle
    9:  'upperChest',     // Spine3
    10: 'leftToes',       // L_Foot
    11: 'rightToes',      // R_Foot
    12: 'neck',           // Neck
    13: 'leftShoulder',   // L_Collar
    14: 'rightShoulder',  // R_Collar
    15: 'head',           // Head
    16: 'leftUpperArm',   // L_Shoulder
    17: 'rightUpperArm',  // R_Shoulder
    18: 'leftLowerArm',   // L_Elbow
    19: 'rightLowerArm',  // R_Elbow
    20: 'leftHand',       // L_Wrist
    21: 'rightHand',      // R_Wrist
    // 22, 23: L_Hand, R_Hand (fingertip markers, no VRM equivalent)
};

/**
 * SMPL uses axis-angle representation (3 floats per joint).
 * VRM uses quaternions.
 * Conversion: axis-angle -> quaternion
 */
function axisAngleToQuat(axisAngle) {
    const angle = Math.sqrt(
        axisAngle[0] ** 2 + axisAngle[1] ** 2 + axisAngle[2] ** 2
    );
    if (angle < 1e-6) return new THREE.Quaternion();

    const axis = new THREE.Vector3(
        axisAngle[0] / angle,
        axisAngle[1] / angle,
        axisAngle[2] / angle
    );
    return new THREE.Quaternion().setFromAxisAngle(axis, angle);
}
```

### Feasibility Assessment

| Approach | Feasibility | Notes |
|----------|-------------|-------|
| Real-time inference in browser (ONNX/WebGPU) | LOW | Models are 500MB-2GB, inference too slow for 60fps |
| Server-side inference, stream to client | MEDIUM | Add FastAPI endpoint, generate BVH, stream via WebSocket |
| Offline pre-generation, cache library | HIGH | Generate 200-500 motions offline, load as clips |
| Hybrid: pre-gen + procedural variation | HIGHEST | Best ROI -- pre-gen base motions, add procedural variation |

### Recommended Approach: Offline Pre-Generation Pipeline

```python
# Backend: Generate motion library using MotionGPT (offline)
# Store as BVH files, convert to Three.js AnimationClip at load time

MOTION_PROMPTS = [
    # Idle variations
    "standing idle, gentle breathing, slight weight shift",
    "standing idle, looking around curiously",
    "standing idle, crossing arms, confident pose",
    # Talk gestures
    "explaining something with hand gestures",
    "nodding enthusiastically while listening",
    "tilting head thoughtfully",
    # Emotional reactions
    "surprised gasp, hands to mouth",
    "laughing with whole body",
    "shy, turning away slightly, hands together",
    # ... 200-500 total
]

# Each generates a 3-5 second motion clip
# Total generation time: ~15-30 minutes on GPU
# Storage: ~50-100MB as compressed BVH
```

### Tools for Conversion

| Tool | URL | Purpose |
|------|-----|---------|
| BVH to VRMA converter | https://3dretarget.com/bvh-to-vrma | Online BVH->VRMA conversion |
| BVH2SMPL | https://github.com/EmptyBlueBox/BVH2SMPL | BVH<->SMPL retargeting |
| BVHTools (Unity) | https://github.com/emilianavt/BVHTools | BVH import/export for humanoids |
| Three.js BVHLoader | Built-in addon | `three/addons/loaders/BVHLoader.js` |
| SkeletonUtils.retargetClip | Built-in addon | Retarget clips between skeletons |

### References

- MotionGPT -- https://github.com/OpenMotionLab/MotionGPT
- MotionGPT-2 -- https://arxiv.org/html/2410.21747v1
- T2M-GPT -- https://github.com/Mael-zys/T2M-GPT
- Generative AI for Character Animation Survey -- https://github.com/llm-lab-org/Generative-AI-for-Character-Animation-Survey
- CVPR 2025 Motion Diffusion paper -- https://openaccess.thecvf.com/content/CVPR2025/papers/Meng_Rethinking_Diffusion_for_Text-Driven_Human_Motion_Generation_CVPR_2025_paper.pdf

---

## 10. Momentum and Follow-Through

**Priority:** HIGH -- classic "12 principles of animation" technique
**Effort:** 8-12h
**Impact:** 8/10

### The Principle

When the torso moves, the spine follows, then the neck, then the head. Each segment "drags" behind the one driving it. This creates overlapping action that reads as natural, weighted movement.

```
Movement order (hip turn example):
  t=0.00s  Hips START turning
  t=0.03s  Spine STARTS following (3-frame delay)
  t=0.06s  Chest STARTS following
  t=0.08s  Neck STARTS following
  t=0.10s  Head STARTS following
  t=0.15s  Hips ARRIVE at target
  t=0.20s  Spine arrives (OVERSHOOTS slightly)
  t=0.23s  Chest arrives
  t=0.28s  Neck arrives
  t=0.33s  Head arrives LAST (most overshoot)
```

### Implementation: Cascaded Spring Chain

```javascript
/**
 * Cascaded spring chain for follow-through animation.
 * Each bone in the chain follows its parent with a delay,
 * creating natural overlapping action.
 *
 * Usage:
 *   const chain = new SpringChain(['hips', 'spine', 'chest', 'neck', 'head']);
 *   // When hips move, the rest follows with cascading delay
 */
class SpringChain {
    /**
     * @param {string[]} boneNames - Bones in order from root to tip
     * @param {Object} [opts]
     * @param {number} [opts.baseHalflife=0.08] - Spring halflife for first bone
     * @param {number} [opts.halflifeGrowth=1.4] - Each subsequent bone is this much slower
     * @param {number} [opts.overshootRatio=0.15] - Under-damping for overshoot
     */
    constructor(boneNames, opts = {}) {
        this.boneNames = boneNames;
        this.baseHalflife = opts.baseHalflife ?? 0.08;
        this.halflifeGrowth = opts.halflifeGrowth ?? 1.4;
        this.overshootRatio = opts.overshootRatio ?? 0.15;

        // Per-bone spring state (3 axes each)
        this.springs = boneNames.map((name, i) => ({
            name,
            halflife: this.baseHalflife * Math.pow(this.halflifeGrowth, i),
            x: { val: 0, vel: 0 },
            y: { val: 0, vel: 0 },
            z: { val: 0, vel: 0 }
        }));
    }

    /**
     * Set the target rotation for the root bone.
     * Child bones will follow automatically via spring cascade.
     *
     * @param {Object} targets - { boneName: { x, y, z } } rotation targets
     */
    setTargets(targets) {
        for (const spring of this.springs) {
            const t = targets[spring.name];
            if (t) {
                spring.goalX = t.x ?? 0;
                spring.goalY = t.y ?? 0;
                spring.goalZ = t.z ?? 0;
            }
        }
    }

    /**
     * Update all springs and return rotation deltas.
     *
     * @param {number} dt - Delta time
     * @returns {Object} { boneName: { x, y, z } } additive rotation deltas
     */
    update(dt) {
        const result = {};
        let parentDelta = { x: 0, y: 0, z: 0 };

        for (const spring of this.springs) {
            // Each bone's effective goal includes the parent's current delta
            // This creates the cascading drag effect
            const goalX = (spring.goalX ?? 0) + parentDelta.x * 0.3;
            const goalY = (spring.goalY ?? 0) + parentDelta.y * 0.3;
            const goalZ = (spring.goalZ ?? 0) + parentDelta.z * 0.3;

            // Use under-damped spring for subtle overshoot
            const rx = springDamperExact(spring.x.val, spring.x.vel, goalX, spring.halflife, dt);
            const ry = springDamperExact(spring.y.val, spring.y.vel, goalY, spring.halflife, dt);
            const rz = springDamperExact(spring.z.val, spring.z.vel, goalZ, spring.halflife, dt);

            spring.x.val = rx.x; spring.x.vel = rx.v;
            spring.y.val = ry.x; spring.y.vel = ry.v;
            spring.z.val = rz.x; spring.z.vel = rz.v;

            result[spring.name] = {
                x: spring.x.val,
                y: spring.y.val,
                z: spring.z.val
            };

            // Pass this bone's delta to the next bone in chain
            parentDelta = {
                x: spring.x.val - goalX,
                y: spring.y.val - goalY,
                z: spring.z.val - goalZ
            };
        }

        return result;
    }
}
```

### Spine Chain Configuration

```javascript
// Primary spine chain (torso follow-through)
const spineChain = new SpringChain(
    ['hips', 'spine', 'chest', 'neck', 'head'],
    { baseHalflife: 0.06, halflifeGrowth: 1.5, overshootRatio: 0.12 }
);

// Arm chains (arms follow torso with drag)
const leftArmChain = new SpringChain(
    ['leftShoulder', 'leftUpperArm', 'leftLowerArm', 'leftHand'],
    { baseHalflife: 0.04, halflifeGrowth: 1.6, overshootRatio: 0.2 }
);

const rightArmChain = new SpringChain(
    ['rightShoulder', 'rightUpperArm', 'rightLowerArm', 'rightHand'],
    { baseHalflife: 0.04, halflifeGrowth: 1.6, overshootRatio: 0.2 }
);
```

### When to Apply Follow-Through

| Trigger | Bones Affected | Effect |
|---------|---------------|--------|
| Fidget/weight shift | Full spine chain | Hips lead, head follows |
| Head turn (lookAt) | Neck + head only | Neck leads, head follows |
| Gesture (arm raise) | Arm chain | Shoulder leads, hand drags |
| Emotional state change | Full body | Gradual posture shift with cascade |
| Clip playback end | All chains | Settling back to idle with drag |

### How It Differs from VRM Spring Bones

| Feature | VRM Spring Bones | Follow-Through Springs |
|---------|-----------------|----------------------|
| Target | Secondary physics (hair, cloth, accessories) | Primary skeleton (torso, arms, legs) |
| Driven by | Gravity + parent bone velocity | Animation layer targets |
| Direction | Always "trailing" parent | Can lead OR follow |
| Stiffness | Typically soft (dangly) | Stiffer (body has muscle) |
| Update order | After all bone updates | Between layer calc and vrm.update() |

### Performance

- 3 chains x 4-5 bones x 3 axes = ~42 spring evaluations
- ~42 * 0.001ms = ~0.04ms/frame
- **Negligible impact**

### References

- "Follow Through and Overlapping Action" (12 Principles) -- https://www.animationmentor.com/blog/follow-through-and-overlapping-action-the-12-basic-principles-of-animation/
- Spine animation tutorial -- http://en.esotericsoftware.com/blog/Follow-through-and-overlapping-action-Animating-with-Spine-8
- "The Art of Follow Through" -- https://garagefarm.net/blog/follow-through-and-overlapping-action-in-animation

---

## 11. Implementation Priority Matrix

### Effort vs Impact Chart

```
Impact
10 |  [2]Easing    .............. [7]Motion Match
   |                               [9]Neural
 9 |  [1]Idle Enh
   |
 8 |  [3]Settle   [4]IK  [5]Layers [10]Follow-thru
   |
 7 |  [8]Gestures  [6]CoG
   |
 6 |
   +--+--------+--------+--------+--------+-------
     4h       10h      20h      40h      60h+   Effort
```

### Recommended Implementation Order

| Phase | Items | Hours | Cumulative | Rationale |
|-------|-------|-------|------------|-----------|
| **Phase A** | 2 (Springs/Easing) + 3 (Settling) | 10-18h | 10-18h | Foundation. Everything else builds on spring math. |
| **Phase B** | 10 (Follow-Through) + 1 (Idle Enhancement) | 16-24h | 26-42h | Biggest visual bang. Uses springs from Phase A. |
| **Phase C** | 4a (VRMLookAt wiring) + 5 (Bone Masks) | 14-20h | 40-62h | Enables clip-based animation layers. |
| **Phase D** | 8 (Procedural Gestures) + 6 (CoG) | 25-40h | 65-102h | Unique character movement. |
| **Phase E** | 4b (Foot IK) + 7 (Pose Library) | 48-72h | 113-174h | Polish. Requires Mixamo clip curation. |
| **Phase F** | 9 (Neural Motion) | 60-100h | 173-274h | Research-grade. Offline pipeline. |

### Quick Wins (< 4h each)

1. **Replace RIKO-style exponential decay with critically damped springs** in BasePoseLayer head/body targets (2h)
2. **Wire VRMLookAt to mouse cursor** for eye/head tracking (2h)
3. **Add shoulder/hip coupling to breathing** in BasePoseLayer (1h)
4. **Add springy overshoot to fidget transitions** in IdleBehaviorLayer (3h)

---

## 12. RIKO Reference Analysis

### What RIKO Does Well

1. **Simplicity.** The entire animation system is ~140 lines. It achieves "alive" with just:
   - Random head target selection every 0.8-1.8s
   - Exponential ease toward targets
   - Body sway on spine.rotation.x
   - Blink cycle with random intervals
   - Lip sync from audio amplitude

2. **Different idle vs talk parameters.** Movement is faster and more frequent during speech:
   - Head: 0.02 ease idle -> 0.04 ease talking
   - Body: 0.01 ease idle -> 0.02 ease talking
   - Head frequency: 1.8s idle -> 0.8s talking

3. **Arm drape.** Arms locked at Z=-1.2/+1.2 (similar to our BASE_Z=1.4)

### What RIKO Lacks (Our Opportunities)

| Feature | RIKO | Waifu-RT3D Current | Gap / Opportunity |
|---------|------|--------------------|--------------------|
| Breathing | None | Multi-axis noise-based | Already ahead |
| Weight shifting | None | Fidget-based | Enhance with CoG |
| Fidgets | None | 16+ personality-gated | Already ahead |
| Easing type | First-order exponential | First-order exponential (noise1D) | Upgrade to springs |
| Follow-through | None | None | Major opportunity |
| Bone layering | None | 6-layer AnimationDirector | Already ahead |
| Gesture variety | None | Clip-based + procedural | Enhance with components |
| Look-at | None | Deprecated LookAtLayer | Re-wire VRMLookAt |
| Spring physics | None (on primary) | None (on primary) | Major opportunity |
| Emotion response | Same params always | Personality-scaled | Enhance with springs |

### Key Takeaway

RIKO proves that exponential easing + random targets + talk/idle mode switching creates a convincing baseline. Our system is already significantly more sophisticated. The biggest quality gap is **spring-based motion** (overshoot, settling, follow-through) which RIKO also lacks. Implementing springs on our existing architecture would put us well beyond RIKO quality.

---

## Summary: What Makes Characters Feel Alive

In priority order of perceptual impact:

1. **Spring-based easing** (not linear, not exponential decay) -- velocity continuity is the #1 quality signal
2. **Follow-through on the spine chain** -- head lag behind torso creates weight
3. **Breathing with multi-bone coupling** -- the foundation of "alive"
4. **Eye tracking toward camera/cursor** -- instant connection with viewer
5. **Overshoot on state transitions** -- momentum = weight = believability
6. **Varied fidgets with personality gating** -- already implemented, enhance timing
7. **Weight shift with CoG compensation** -- groundedness
8. **Layered clip playback** -- enables Mixamo clips for upper body while idle lower body
9. **Procedural gesture variety** -- each response feels unique
10. **Motion library** -- curated clips for emotional range

The math is simple. The springs are cheap. The difference is enormous.
