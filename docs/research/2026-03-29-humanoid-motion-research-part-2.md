> **This is Part 2 of 4.** See also: [Part 1](2026-03-29-humanoid-motion-research-part-1.md), [Part 3](2026-03-29-humanoid-motion-research-part-3.md), [Part 4](2026-03-29-humanoid-motion-research-part-4.md)

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

See Section 2 for the full `springDamperUnder()` derivation. The under-damped spring naturally produces overshoot when `frequency^2 > (damping/2)^2`.

### Recommended Parameters by Body Part

Different body parts have different physical properties. Heavier parts (hips, torso) overshoot less and settle slower. Lighter parts (head, hands) overshoot more and settle faster.

| Body Part | Frequency (Hz) | Halflife (s) | Overshoot % | Physical Rationale |
|-----------|---------------|-------------|-------------|-------------------|
| Hips | 1.2 | 0.30 | ~5% | Heavy, pelvis has high inertia |
| Spine | 1.5 | 0.25 | ~8% | Moderately heavy, muscular control |
| Chest | 1.8 | 0.22 | ~10% | Upper torso, less mass than lower |
| Neck | 2.5 | 0.18 | ~12% | Light, muscular but flexible |
| Head | 3.0 | 0.15 | ~15% | Relatively heavy but fast reflexes |
| Shoulders | 2.0 | 0.20 | ~12% | Moderate mass, ball joint |
| Upper Arms | 3.5 | 0.14 | ~18% | Pendular, free-swinging |
| Lower Arms | 4.5 | 0.12 | ~22% | Light, high angular velocity |
| Hands | 5.0 | 0.10 | ~25% | Very light, most overshoot |
| Upper Legs | 1.0 | 0.35 | ~4% | Heaviest limbs, stabilizing |
| Lower Legs | 1.5 | 0.28 | ~6% | Moderate weight, constrained |
| Feet | 2.0 | 0.25 | ~8% | Anchored to ground usually |

**Context-dependent parameter modification:**

| Context | Frequency Mult | Halflife Mult | Effect |
|---------|---------------|-------------|--------|
| Idle -> Idle transition | 0.8x | 1.3x | Slower, gentler settling |
| Idle -> Talk transition | 1.0x | 1.0x | Normal |
| Surprise reaction | 1.5x | 0.6x | Snappy, more overshoot |
| Anger reaction | 1.3x | 0.7x | Fast, aggressive |
| Sad transition | 0.6x | 1.5x | Sluggish, heavy |
| Sleepy | 0.5x | 2.0x | Very sluggish, over-damped feel |
| Excited | 1.4x | 0.8x | Bouncy, energetic |
| Return to idle | 0.7x | 1.2x | Gentle settling |

### Architecture: SpringBone Manager for Primary Skeleton

```javascript
/**
 * Manages spring-driven settling for primary skeleton bones.
 * Distinct from VRM spring bones (which handle secondary physics).
 * This applies to the MAIN skeleton for overshoot-and-settle on pose changes.
 *
 * Architecture note: this sits between the animation layers and vrm.update().
 * Layer outputs -> SpringManager applies overshoot -> vrm.update() runs
 * constraints and spring bones on the modified pose.
 */
class PoseSpringManager {
    constructor() {
        this.springs = new Map(); // boneName -> { x, v, goal, halflife, frequency }
    }

    /**
     * Set a new target for a bone with spring settling.
     * Call this whenever an animation layer sets a bone rotation.
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
     * Springs at rest (|v| < epsilon AND |x - goal| < epsilon) are skipped
     * for performance -- typically only 3-8 springs are active at once.
     */
    update(dt) {
        const deltas = {};
        for (const [key, spring] of this.springs) {
            // Skip springs at rest
            if (Math.abs(spring.v) < 0.0001 && Math.abs(spring.x - spring.goal) < 0.0001) {
                spring.x = spring.goal;
                continue;
            }

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

- Daniel Holden, "Spring-It-On: The Game Developer's Spring-Roll-Call" -- https://daniel-holden.com/page/spring-roll-call
- Allen Chou, "Game Math: Precise Control over Numeric Springing" -- https://allenchou.net/2015/04/game-math-precise-control-over-numeric-springing/
- Alexis Bacot, "The Art of Damping" -- https://www.alexisbacot.com/blog/the-art-of-damping
- Math Proofs, "Critically Damped Spring Smoothing" -- http://mathproofs.blogspot.com/2013/07/critically-damped-spring-smoothing.html

---

## 4. Inverse Kinematics (IK)

**Priority:** HIGH for Look-At, MEDIUM for feet/hands
**Effort:** 10-20h total
**Impact:** 8/10

### A. VRMLookAt Deep Dive

@pixiv/three-vrm 3.4.1 includes a full VRMLookAt system with two applier types:

**VRMLookAtBoneApplier:** Rotates actual eye bones. More natural for 3D models with separate eye meshes. Supports range mapping per axis (horizontal inner/outer, vertical up/down) defined in the VRM file.

**VRMLookAtExpressionApplier:** Uses morph targets (lookLeft/Right/Up/Down blendshapes). Better for anime-style models where eye bones don't exist or look wrong when rotated.

```javascript
// Basic setup (already available on loaded VRM):
vrm.lookAt.target = targetObject;  // THREE.Object3D to look at
vrm.lookAt.autoUpdate = true;      // Updates in vrm.update()

// Properties for fine-tuning:
vrm.lookAt.offsetFromHeadBone;     // THREE.Vector3 offset from head bone
vrm.lookAt.applier;                // VRMLookAtBoneApplier or ExpressionApplier
vrm.lookAt.faceFront;              // THREE.Vector3 face forward direction

// The applier has configurable range maps:
// For bone type:
vrm.lookAt.applier.rangeMapHorizontalInner;  // { inputMaxValue, outputScale }
vrm.lookAt.applier.rangeMapHorizontalOuter;
vrm.lookAt.applier.rangeMapVerticalDown;
vrm.lookAt.applier.rangeMapVerticalUp;

// Manual control (bypasses target):
vrm.lookAt.lookAt(new THREE.Vector3(x, y, z));  // world-space target
```

**Enhancement -- cursor tracking with smooth pursuit:**
```javascript
/**
 * Mouse-to-world-space look target with smooth interpolation.
 * Uses spring damping so the eyes don't snap to cursor position.
 *
 * The smoothing simulates the VOR (vestibulo-ocular reflex) which
 * prevents the eyes from tracking every tiny mouse jitter.
 */
class CursorLookTarget {
    constructor(camera, vrm) {
        this.camera = camera;
        this.vrm = vrm;
        this.target = new THREE.Object3D();
        this.smoothTarget = new THREE.Vector3(0, 1.5, 0);
        this.velocity = new THREE.Vector3();

        vrm.lookAt.target = this.target;
        vrm.lookAt.autoUpdate = true;
    }

    onMouseMove(event, canvas) {
        const mouse = new THREE.Vector2(
            (event.clientX / canvas.width) * 2 - 1,
            -(event.clientY / canvas.height) * 2 + 1
        );

        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mouse, this.camera);

        // Place target 2m in front of camera along ray
        const rawTarget = new THREE.Vector3();
        raycaster.ray.at(2.0, rawTarget);

        // Spring-damped smooth pursuit (prevents jittery tracking)
        for (const axis of ['x', 'y', 'z']) {
            const result = springDamperExact(
                this.smoothTarget[axis],
                this.velocity[axis],
                rawTarget[axis],
                0.08,  // 80ms halflife = snappy but smooth
                1 / 60  // Approximate dt
            );
            this.smoothTarget[axis] = result.x;
            this.velocity[axis] = result.v;
        }

        this.target.position.copy(this.smoothTarget);
    }
}
```

**Effort:** 2-4h (mostly wiring, the system exists)

### B. IK Algorithm Comparison: CCD vs FABRIK vs Analytical

| Property | CCD | FABRIK | Analytical (Two-Bone) |
|----------|-----|--------|----------------------|
| **Algorithm** | Iterates from end effector to root, rotating each joint to minimize distance to target | Forward/backward reaching: moves joints alternately from tip-to-root then root-to-tip | Closed-form trigonometric solution using law of cosines |
| **Convergence** | Slow (10-50 iterations typical) | Fast (3-10 iterations typical) | Instant (no iterations) |
| **Chain length** | Any length | Any length | Exactly 2 bones |
| **Joint limits** | Easy to add (clamp after each step) | Harder (requires projection) | Natural (pole vector controls bend) |
| **Quality** | Tends to "curl" -- proximal joints move more than distal | Natural looking -- distributes motion evenly | Perfect for legs/arms -- exactly what you want |
| **Multiple targets** | One per chain | Supports multi-end-effector | One per chain |
| **Cost per frame** | ~0.05ms (3 iter, 5 bones) | ~0.03ms (3 iter, 5 bones) | ~0.01ms (no iteration) |
| **Three.js support** | CCDIKSolver addon | THREE.IK (third-party) | Manual implementation (simple) |
| **Best for** | Tentacles, tails, spines | Full-body IK, multi-chain | Legs, arms (2-bone chains) |

**Recommendation for Waifu-RT3D:**
- **Legs:** Analytical two-bone IK (fastest, most predictable for bipedal)
- **Arms:** Analytical two-bone IK with pole vector toward elbows
- **Spine:** Skip IK, use procedural layers (already sufficient)
- **Eyes/Head:** VRMLookAt (built-in)

### C. Foot IK with Ground Detection

```javascript
/**
 * Analytical two-bone IK for leg/arm chains.
 * Uses law of cosines -- no iteration needed for 2-bone chains.
 *
 * Pole vector controls bend direction (crucial for knees/elbows):
 *   - Knee pole: slightly in front of character (prevents hyperextension)
 *   - Elbow pole: slightly behind character (natural arm bend)
 *
 * @param {THREE.Bone} upper - Upper leg/arm bone
 * @param {THREE.Bone} lower - Lower leg/arm bone
 * @param {THREE.Vector3} target - World-space target position
 * @param {THREE.Vector3} pole - Pole vector for bend direction
 * @param {number} chainLength - Optional override for total chain length
 */
function twoBoneIK(upper, lower, target, pole, chainLength) {
    const upperLen = upper.position.distanceTo(lower.position);
    const lowerLen = lower.children[0]
        ? lower.position.distanceTo(lower.children[0].position)
        : upperLen;  // fallback

    const rootPos = new THREE.Vector3();
    upper.getWorldPosition(rootPos);

    const toTarget = new THREE.Vector3().subVectors(target, rootPos);
    const dist = Math.min(toTarget.length(), upperLen + lowerLen - 0.001);

    // Law of cosines for knee/elbow angle
    const cosAngle = (upperLen * upperLen + lowerLen * lowerLen - dist * dist)
                   / (2 * upperLen * lowerLen);
    const kneeAngle = Math.acos(Math.max(-1, Math.min(1, cosAngle)));

    // Apply to lower bone (bend axis typically X for legs)
    lower.rotation.x = -(Math.PI - kneeAngle);

    // Upper bone points toward target with pole vector orientation
    const forward = toTarget.normalize();
    const toPole = new THREE.Vector3().subVectors(pole, rootPos).normalize();
    const right = new THREE.Vector3().crossVectors(forward, toPole).normalize();
    const up = new THREE.Vector3().crossVectors(right, forward);

    const mat = new THREE.Matrix4().makeBasis(right, up, forward);
    upper.quaternion.setFromRotationMatrix(mat);
}

/**
 * Ground plane detection for foot IK.
 * Casts rays from hip bones downward to find ground height,
 * then adjusts foot targets to prevent floating/clipping.
 *
 * @param {THREE.Object3D} vrm - The VRM model
 * @param {THREE.Mesh} ground - Ground plane mesh
 * @returns {{ left: THREE.Vector3, right: THREE.Vector3 }} Foot targets
 */
function detectGroundContacts(vrm, ground) {
    const raycaster = new THREE.Raycaster();
    const downDir = new THREE.Vector3(0, -1, 0);
    const results = { left: null, right: null };

    for (const side of ['left', 'right']) {
        const footBone = vrm.humanoid.getNormalizedBoneNode(
            side === 'left' ? 'leftFoot' : 'rightFoot'
        );
        if (!footBone) continue;

        const footPos = new THREE.Vector3();
        footBone.getWorldPosition(footPos);

        // Cast ray from slightly above foot
        raycaster.set(
            new THREE.Vector3(footPos.x, footPos.y + 0.5, footPos.z),
            downDir
        );

        const hits = raycaster.intersectObject(ground, true);
        if (hits.length > 0) {
            results[side] = hits[0].point.clone();
            results[side].y += 0.02; // Small offset to prevent z-fighting
        }
    }

    return results;
}
```

**Effort:** 8-12h for foot IK with ground plane detection

### D. Available IK Libraries

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
- FABRIK (3 iterations, 2 chains): ~0.06ms/frame
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
 * The technique: AnimationAction stores parallel arrays of property bindings
 * and interpolants. By filtering both arrays to only include bones in our
 * mask, the action simply doesn't touch the excluded bones.
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

// Standard VRM humanoid bone sets for masking:
const UPPER_BODY_BONES = new Set([
    'spine', 'chest', 'upperChest', 'neck', 'head',
    'leftShoulder', 'rightShoulder',
    'leftUpperArm', 'rightUpperArm',
    'leftLowerArm', 'rightLowerArm',
    'leftHand', 'rightHand'
]);

const LOWER_BODY_BONES = new Set([
    'hips', 'leftUpperLeg', 'rightUpperLeg',
    'leftLowerLeg', 'rightLowerLeg',
    'leftFoot', 'rightFoot', 'leftToes', 'rightToes'
]);

const FACE_BONES = new Set(['head', 'neck', 'leftEye', 'rightEye', 'jaw']);

const ARM_BONES_LEFT = new Set([
    'leftShoulder', 'leftUpperArm', 'leftLowerArm', 'leftHand'
]);

const ARM_BONES_RIGHT = new Set([
    'rightShoulder', 'rightUpperArm', 'rightLowerArm', 'rightHand'
]);
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
/**
 * Dual-mixer architecture for bone-masked clip playback.
 *
 * Instead of one mixer with masked actions, use two mixers each operating
 * on a filtered subset of animation tracks. This avoids internal API
 * dependencies and gives clean separation.
 *
 * The spine (specifically "chest") is the blend zone -- both mixers
 * contribute to it with weighted blending.
 */
class DualMixerSystem {
    constructor(model) {
        this.upperMixer = new THREE.AnimationMixer(model);
        this.lowerMixer = new THREE.AnimationMixer(model);
        this.blendBones = new Set(['spine', 'chest']); // Shared zone
        this.upperWeight = 0.7; // How much upper mixer affects blend zone
    }

    playUpper(clip) {
        const filtered = this._filterClip(clip, UPPER_BODY_BONES);
        return this.upperMixer.clipAction(filtered);
    }

    playLower(clip) {
        const filtered = this._filterClip(clip, LOWER_BODY_BONES);
        return this.lowerMixer.clipAction(filtered);
    }

    update(dt) {
        this.upperMixer.update(dt);
        this.lowerMixer.update(dt);
    }

    _filterClip(clip, allowedBones) {
        const filtered = clip.clone();
        filtered.tracks = filtered.tracks.filter(track => {
            const boneName = track.name.split('.')[0]
                .replace(/\[.*\]/, '')
                .split('/').pop();
            return allowedBones.has(boneName);
        });
        return filtered;
    }
}
```

**Advantage:** Clean separation, no internal APIs
**Disadvantage:** Two mixers to manage, potential conflicts at spine (shared bone)

### VTuber App Patterns

VTuber applications (VSeeFace, VNyan, Warudo) typically use:
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

### Biomechanical Mass Distribution Research

Body segment mass data from Winter (1990) and de Leva (1996) anthropometric studies. These are the gold-standard values used in biomechanics research, sports science, and animation:

**Winter (1990) -- Male Reference Values:**

| Segment | % Total Body Mass | CoM Position (% from proximal) |
|---------|-------------------|-------------------------------|
| Head | 8.1% | 50.0% (center of head) |
| Trunk (full) | 49.7% | 44.9% (from hip to shoulder) |
| Upper Arm | 2.8% each | 43.6% (from shoulder) |
| Forearm | 1.6% each | 43.0% (from elbow) |
| Hand | 0.6% each | 50.6% (from wrist) |
| Thigh | 10.0% each | 43.3% (from hip joint) |
| Shank (lower leg) | 4.7% each | 43.3% (from knee) |
| Foot | 1.4% each | 50.0% (from ankle) |

**de Leva (1996) -- Female Reference Values (relevant for anime characters):**

| Segment | % Total Body Mass | CoM Position (% from proximal) |
|---------|-------------------|-------------------------------|
| Head | 6.7% | 48.4% |
| Trunk (upper) | 15.5% | 50.7% |
| Trunk (middle) | 14.7% | 45.0% |
| Trunk (lower) | 12.5% | 49.2% |
| Upper Arm | 2.6% each | 57.5% |
| Forearm | 1.4% each | 52.6% |
| Hand | 0.6% each | 74.7% |
| Thigh | 14.8% each | 36.9% |
| Shank | 4.8% each | 43.5% |
| Foot | 1.3% each | 40.1% |

**Simplified VRM bone mapping (what we use in-engine):**

```javascript
/**
 * Approximate Center of Gravity for a VRM humanoid.
 * Uses weighted average of key bone world positions.
 *
 * Values adapted from de Leva (1996) female dataset, simplified
 * to VRM bone structure. The trunk is split between spine/chest
 * rather than Winter's single "trunk" segment.
 *
 * Note: Anime characters have disproportionate heads (larger) and
 * thinner limbs than real humans. For maximum accuracy, the head
 * mass should be slightly increased (~10% instead of 6.7%) and
 * limb masses slightly decreased.
 */
const MASS_WEIGHTS = {
    head: 0.10,       // Anime head is larger (6.7% -> 10%)
    chest: 0.20,      // Upper torso
    spine: 0.22,      // Lower torso
    leftUpperArm: 0.025, rightUpperArm: 0.025,
    leftLowerArm: 0.014, rightLowerArm: 0.014,
    leftHand: 0.006,     rightHand: 0.006,
    leftUpperLeg: 0.10,  rightUpperLeg: 0.10,
    leftLowerLeg: 0.048, rightLowerLeg: 0.048,
    leftFoot: 0.013,     rightFoot: 0.013
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
 *
 * The base of support (BoS) is the polygon formed by the feet on the
 * ground. For a standing character, this is roughly the rectangle
 * between the two feet. The CoG must stay within this polygon for
 * the character to appear balanced.
 *
 * When the CoG drifts outside the BoS (e.g., during a large arm gesture),
 * this layer shifts the hips to compensate, creating the impression of
 * active balance maintenance.
 */
class BalanceLayer {
    constructor(vrm) {
        this.vrm = vrm;
        this.supportCenter = new THREE.Vector3();
        this.cogOffset = new THREE.Vector3();
        this.cogVelocity = new THREE.Vector3();
    }

    update(dt) {
        const cog = calculateCoG(this.vrm);

        const lFoot = this.vrm.humanoid.getNormalizedBoneNode('leftFoot');
        const rFoot = this.vrm.humanoid.getNormalizedBoneNode('rightFoot');
        if (lFoot && rFoot) {
            const lPos = new THREE.Vector3();
            const rPos = new THREE.Vector3();
            lFoot.getWorldPosition(lPos);
            rFoot.getWorldPosition(rPos);
            this.supportCenter.lerpVectors(lPos, rPos, 0.5);
        }

        const deviation = new THREE.Vector2(
            cog.x - this.supportCenter.x,
            cog.z - this.supportCenter.z
        );

        const hips = this.vrm.humanoid.getNormalizedBoneNode('hips');
        if (hips && deviation.length() > 0.01) {
            const correction = deviation.multiplyScalar(-0.3);
            hips.position.x += correction.x * dt * 2.0;
            hips.position.z += correction.y * dt * 2.0;

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

- Winter, D.A. "Biomechanics and Motor Control of Human Movement" 4th ed. (2009)
- de Leva, P. "Adjustments to Zatsiorsky-Seluyanov's segment inertia parameters" (1996)
- "Center of Mass: Tools and Techniques" -- https://www.gamedeveloper.com/design/center-of-mass-tools-and-techniques-for-animating-natural-human-movement
- "Physics of Balance & Weight Shift" -- http://www.algarcia.org/AnimationPhysics/BalanceTutorial.pdf

---

## 7. Motion Matching

**Priority:** MEDIUM-LOW (high effort, but massive quality ceiling)
**Effort:** 40-60h
**Impact:** 9/10 (if done well)

### What Is Motion Matching?

Instead of hand-authoring state machines and transitions, motion matching:
1. Builds a **database** of motion capture poses with feature vectors
2. Each frame, **searches** the database for the best-matching next pose
3. **Blends** from current pose to the matched pose using inertialization

The result is fluid, natural transitions without manual crossfade tuning.

### Daniel Holden's Motion Matching: Deep Dive

Repository: https://github.com/orangeduck/Motion-Matching

#### Pose Feature Vectors

Each frame in the database is represented by a **feature vector** -- a flat array of floats that captures the "essential character" of that pose. The matching algorithm compares feature vectors, not raw bone data.

Feature vectors typically contain three categories:

**1. Pose Features (body state):**
```
- Local velocity of root joint (3 floats: vx, vy, vz)
- Local angular velocity around vertical axis (1 float: yaw_speed)
- Bone positions relative to root for key joints (N * 3 floats)
  Typical key joints: left foot, right foot, left hand, right hand, head
- Bone velocities for key joints (N * 3 floats)
```

**2. Trajectory Features (desired future path):**
```
- Future root positions at t+0.33s, t+0.66s, t+1.0s (3 * 2 floats: x,z)
- Future root facing directions at same timestamps (3 * 2 floats: fx,fz)
- These come from the gameplay/AI system's desired trajectory
```

**3. Contact Features (ground/environment):**
```
- Left foot contact (1 float: 0 or 1)
- Right foot contact (1 float: 0 or 1)
```

Total feature vector size: typically 27-60 floats per frame.

#### Cost Function

The matching cost between the current state and a database frame is:

```
cost = SUM_i( weight_i * (query_feature_i - db_feature_i)^2 )
```

Where `weight_i` controls the relative importance of each feature:

| Feature | Typical Weight | Rationale |
|---------|---------------|-----------|
| Foot positions | 1.0 | Prevents foot sliding |
| Foot velocities | 0.75 | Smooth foot transitions |
| Hip velocity | 1.0 | Responsiveness |
| Trajectory positions | 1.5 | Path following accuracy |
| Trajectory facing | 1.2 | Turning responsiveness |
| Hand positions | 0.5 | Upper body continuity |
| Contact labels | 2.0 | Prevents ground penetration |

The search finds the frame with minimum cost. Typically uses a KD-tree or brute-force with SIMD for speed.

#### Learned Motion Matching (Holden, SIGGRAPH 2020)

The "Learned" variant replaces the database search with three neural networks:

```
Traditional:  query -> [search database] -> best frame -> full pose
Learned:      query -> [Projector NN] -> compressed feature
                     -> [Stepper NN] -> next compressed feature
                     -> [Decompressor NN] -> full pose
```

- **Projector:** Maps the high-dimensional feature vector to a low-dimensional latent space (~32 dims). This is what gets searched.
- **Stepper:** Given current latent state + desired trajectory, predicts next latent state. Replaces the database search entirely.
- **Decompressor:** Reconstructs full pose (all bone rotations + positions) from latent space.

**Advantages over traditional:**
- Database size: 500MB -> 5MB (just the neural network weights)
- Search cost: O(n) database scan -> O(1) network forward pass
- Scales to millions of frames without memory issues

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

### Recommended Approach: Hybrid Pose Library

Instead of full motion matching, use a **simplified "pose library" approach** -- essentially motion matching with a very small database and coarse matching:

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
 *
 * Matching: scored by tag overlap + pose similarity.
 * Transition: inertialization blend (from Section 2).
 */
class PoseLibrary {
    constructor() {
        this.clips = [];  // { clip, tags, features, lastUsedTime }
        this.lastPlayed = null;
    }

    /**
     * Find best matching clip for current context.
     * Uses a weighted scoring system similar to motion matching cost function.
     */
    findBest(emotion, intensity, category, currentPose) {
        let best = null;
        let bestScore = -Infinity;

        for (const entry of this.clips) {
            let score = 0;

            // Tag matching (coarse)
            if (entry.tags.emotion === emotion) score += 3;
            if (entry.tags.intensity === intensity) score += 1;
            if (entry.tags.category === category) score += 2;

            // Pose similarity (if features available)
            if (currentPose && entry.features) {
                const similarity = this._poseSimilarity(currentPose, entry.features);
                score += similarity * 2; // Weight pose continuity
            }

            // Avoid repeating same clip (cooldown)
            if (entry === this.lastPlayed) score -= 5;
            const timeSinceUse = Date.now() - (entry.lastUsedTime || 0);
            if (timeSinceUse < 10000) score -= 3; // 10s cooldown

            // Small random variation for naturalness
            score += Math.random() * 0.5;

            if (score > bestScore) {
                bestScore = score;
                best = entry;
            }
        }

        if (best) {
            best.lastUsedTime = Date.now();
            this.lastPlayed = best;
        }
        return best?.clip;
    }

    _poseSimilarity(poseA, poseB) {
        // Simple dot product of normalized feature vectors
        let dot = 0, magA = 0, magB = 0;
        for (let i = 0; i < poseA.length; i++) {
            dot += poseA[i] * poseB[i];
            magA += poseA[i] * poseA[i];
            magB += poseB[i] * poseB[i];
        }
        return dot / (Math.sqrt(magA) * Math.sqrt(magB) + 1e-8);
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

- Daniel Holden, "Learned Motion Matching" (SIGGRAPH 2020) -- https://dl.acm.org/doi/10.1145/3386569.3392440
- Motion Matching GitHub -- https://github.com/orangeduck/Motion-Matching
- Simon Clavet, "Motion Matching and The Road to Next-Gen Animation" (GDC 2016)
- O3DE Motion Matching docs -- https://docs.o3de.org/blog/posts/blog-motionmatching/
- Motion Symphony wiki -- https://www.wikiful.com/@AnimationUprising/motion-symphony/motion-matching/understanding-motion-matching

---

