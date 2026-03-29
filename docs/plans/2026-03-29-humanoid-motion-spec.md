# Humanoid Motion Quality — Actionable Implementation Spec

**Date:** 2026-03-29
**Research:** `docs/research/2026-03-29-humanoid-motion-research.md`
**Parent Plan:** `docs/plans/2026-03-28-animation-overhaul-mega-plan.md`
**Status:** READY TO EXECUTE
**Total Estimate:** 75-124 hours across 6 phases
**Priority:** HIGH — biggest visual quality gap in the app

---

## Relationship to Existing Animation Overhaul Plan

The mega-plan (`2026-03-28`) covers 7 phases at a high level: easing engine, pre-made animation library, library upgrade, touch interaction, animation styles, cue system, and advanced sources. This spec **replaces and deepens Phase 1 (Motion Paradigm Shift)** and adds new physics systems not covered in the mega-plan. The two documents are complementary:

| This Spec | Mega-Plan Equivalent | Overlap |
|-----------|---------------------|---------|
| Phase A (Springs/Easing) | Phase 1A (Easing Engine) | This spec supersedes with spring math |
| Phase B (Follow-Through + Idle) | Phase 1B-1C (BasePose/Idle overhaul) | This spec adds cascaded springs |
| Phase C (VRMLookAt + Bone Masks) | Phase 1E (TalkLayer) + not covered | New material |
| Phase D (Procedural Gestures + CoG) | Phase 1F (GestureLayer) | This spec adds component system + CoG |
| Phase E (Pose Library + Foot IK) | Phase 2 (Animation Library) | Complementary |
| Phase F (Neural Motion) | Phase 7 (Advanced) | Future-phase alignment |

**Rule:** Execute this spec for motion physics. Execute the mega-plan for animation library, touch interaction, and UI settings. They share the same files but different concerns.

---

## Phase A: Spring Math Foundation + Easing Upgrade

**Goal:** Replace first-order exponential decay with critically damped springs throughout the animation system
**Est:** 10-18 hours
**Impact:** 10/10 — the single biggest quality differentiator
**Prerequisite:** None

### Files to Modify

| File | Changes |
|------|---------|
| `frontends/shared/viewer/viewer.html` | Add spring functions, PoseSpringManager class, integrate into update loop |

### A1. Core Spring Functions (2-3h)

Add these functions after the existing `noise1D()` function (line ~770):

```javascript
/**
 * Critically damped spring — reaches goal ASAP without oscillation.
 * Maintains velocity continuity across target changes.
 * From Daniel Holden's Spring-Roll-Call.
 *
 * @param {number} x - Current position
 * @param {number} v - Current velocity
 * @param {number} goal - Target position
 * @param {number} halflife - Time to reduce distance by half (seconds)
 * @param {number} dt - Delta time (seconds)
 * @returns {{x: number, v: number}} New position and velocity
 */
function springDamperExact(x, v, goal, halflife, dt)

/**
 * Under-damped spring — oscillates around goal before settling.
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
function springDamperUnder(x, v, goal, frequency, halflife, dt)

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
function springDamperQuaternion(x, v, goal, halflife, dt)
```

**Implementation:** Exact code is in the research document sections 2 and 3. Copy verbatim.

### A2. PoseSpringManager Class (3-4h)

```javascript
/**
 * Manages spring-driven settling for primary skeleton bones.
 * Distinct from VRM spring bones (which handle secondary physics like hair/cloth).
 * This applies to the MAIN skeleton for overshoot-and-settle on pose changes.
 *
 * Usage:
 *   const mgr = new PoseSpringManager();
 *   mgr.setTarget('head', 'y', 0.15, 2.0, 0.2);  // turn head
 *   const deltas = mgr.update(dt);                  // get springy values
 *   head.rotation.y = deltas.head.y;                // apply
 */
class PoseSpringManager {
    constructor()
    setTarget(boneName, axis, goal, frequency = 2.0, halflife = 0.2)
    setCritical(boneName, axis, goal, halflife = 0.2)  // critically damped shortcut
    update(dt) -> { boneName: { axis: value } }
    isSettled(threshold = 0.001) -> boolean  // true when all springs at rest
    reset()
}
```

**Where:** After the spring functions, before `class AnimationLayer` (line ~482).

### A3. Integrate Springs into BasePoseLayer (3-5h)

Replace direct bone assignments with spring-driven targets in `BasePoseLayer.update()` (line ~772):

| Current Pattern | New Pattern |
|----------------|-------------|
| `head.rotation.y = noise1D(t, 1) * amp` | `this.springs.setCritical('head', 'y', noise1D(t, 1) * amp, 0.3)` |
| `chest.rotation.x = breathPhase * 0.04` | `this.springs.setCritical('chest', 'x', breathPhase * 0.04, 0.25)` |
| Direct arm drape `z = -1.4` | `this.springs.setCritical('leftUpperArm', 'z', -1.4 + drift, 0.5)` |

The springs add velocity continuity — when targets change, motion flows smoothly instead of snapping.

### A4. Integrate Springs into IdleBehaviorLayer (2-4h)

Each fidget currently sets bone rotations directly. Wrap all fidget bone writes through a shared `PoseSpringManager` instance so fidgets blend smoothly into and out of each other.

### A5. Spring Halflife Parameter Table

| Context | Halflife | Behavior | Use For |
|---------|----------|----------|---------|
| 0.08s | Very snappy | Surprise reactions, blinks |
| 0.15s | Snappy, responsive | Talking head nods, gesture peaks |
| 0.20s | Natural, balanced | Default for most bone targets |
| 0.30s | Relaxed | Idle drift, breathing, body sway |
| 0.50s | Dreamy, languid | Sleepy state, sad posture shifts |
| 0.80s | Very slow | Gradual mood transitions |

### A6. Under-Damped Overshoot Parameters

| Use Case | Frequency (Hz) | Halflife (s) | Overshoot % |
|----------|----------------|--------------|-------------|
| Head turn (reaction) | 3.0 | 0.15 | ~10% |
| Body lean (gesture) | 2.0 | 0.20 | ~15% |
| Hip shift (weight) | 1.5 | 0.30 | ~8% |
| Arm gesture (expressive) | 4.0 | 0.12 | ~20% |
| Return to idle | 1.0 | 0.40 | ~5% |
| Surprise reaction | 6.0 | 0.08 | ~25% |

### Verification

- Load any VRM model in the viewer
- Head drift should be smooth with no velocity discontinuities when target changes
- Breathing should feel organic, not like a metronome
- Fidget transitions should blend smoothly — no "pop" between fidgets
- Performance: spring system <0.2ms/frame total

---

## Phase B: Follow-Through + Idle Enhancement

**Goal:** Add cascaded spring chains for overlapping action; enhance breathing and weight shift
**Est:** 16-24 hours
**Impact:** 9/10
**Prerequisite:** Phase A (spring functions)

### Files to Modify

| File | Changes |
|------|---------|
| `frontends/shared/viewer/viewer.html` | SpringChain class, FollowThroughLayer, enhanced breathing/weight |

### B1. SpringChain Class (4-6h)

```javascript
/**
 * Cascaded spring chain for follow-through animation.
 * Each bone in the chain follows its parent with increasing delay,
 * creating natural overlapping action (Disney's 12 principles).
 *
 * @example
 *   const spine = new SpringChain(
 *     ['hips', 'spine', 'chest', 'neck', 'head'],
 *     { baseHalflife: 0.06, halflifeGrowth: 1.5 }
 *   );
 */
class SpringChain {
    constructor(boneNames, opts = {})
    setTargets(targets)  // { boneName: { x, y, z } }
    update(dt) -> { boneName: { x, y, z } }  // additive rotation deltas
    reset()
}
```

**Parameters:**

| Chain | Bones | baseHalflife | halflifeGrowth | overshootRatio |
|-------|-------|-------------|----------------|----------------|
| Spine | hips -> spine -> chest -> neck -> head | 0.06 | 1.5 | 0.12 |
| Left arm | leftShoulder -> leftUpperArm -> leftLowerArm -> leftHand | 0.04 | 1.6 | 0.20 |
| Right arm | rightShoulder -> rightUpperArm -> rightLowerArm -> rightHand | 0.04 | 1.6 | 0.20 |

### B2. FollowThroughLayer — New Animation Layer (4-6h)

Insert as L2.5 (between Idle and Emotion layers), or integrate into the AnimationDirector's post-update pass:

```javascript
/**
 * Applies follow-through to all bone modifications from lower layers.
 * Runs AFTER BasePose + Idle but BEFORE vrm.update().
 * Reads current bone targets, feeds them through SpringChain,
 * and applies the cascaded result.
 */
class FollowThroughLayer extends AnimationLayer {
    constructor() {
        super('followThrough');
        this.spineChain = new SpringChain([...], {...});
        this.leftArmChain = new SpringChain([...], {...});
        this.rightArmChain = new SpringChain([...], {...});
    }

    update(dt) {
        // Read current bone rotations set by lower layers
        // Feed as targets to spring chains
        // Apply chain output (which adds lag/overshoot)
    }
}
```

**Integration point in AnimationDirector:** After all SET-mode layers write bones but before `vrm.update()` is called. The follow-through layer reads what layers 0-4 have written and smooths it.

### B3. Enhanced Multi-Bone Breathing (2-3h)

Enhance `BasePoseLayer` breathing from chest-only to 6-bone coupling:

| Bone | Effect | Phase | Amplitude |
|------|--------|-------|-----------|
| Chest/UpperChest | Expands forward (rotation.x) | Primary | 0.04 * personality |
| Spine | Sympathetic curve | Primary, slight lag | 0.015 |
| Shoulders (L/R) | Rise on inhale | Inhale phase only | 0.015 / 0.012 (asymmetric) |
| Clavicles | Spread on deep inhale | Inhale, threshold >0.7 | 0.008 |
| Neck | Micro-extend on inhale | Inhale phase | 0.008 |
| Hips | Micro-sink on exhale | Exhale phase | position.y -0.003 |

### B4. Enhanced Weight Shift (2-3h)

Replace simple hip rotation with full-body weight shift:

| Bone | Effect | Formula |
|------|--------|---------|
| Hips | Lateral translation + tilt | position.x = side * 0.025, rotation.z = side * 0.03 |
| Spine | S-curve counter | rotation.z = -side * 0.02 |
| Chest | Counter-tilt | rotation.z = -side * 0.015 |
| Head | Stays level (VOR reflex) | rotation.z = -side * 0.01 |
| Non-weight leg | Relaxes outward | rotation.z += 0.02 when side > 0.3 |

### B5. Micro-Movement Channels (2-3h)

Add to BasePoseLayer, below existing head micro-drift:

| Movement | Target | Frequency | Amplitude | Notes |
|----------|--------|-----------|-----------|-------|
| Eye saccade | lookLeft/lookRight blendshapes | 0.3-0.8 Hz | 0.0-0.15 | Random jumps via noise |
| Jaw micro-open | `aa` blendshape | 0.15 Hz | 0.0-0.03 | Synced with breath exhale |
| Brow drift | `browUp` blendshape | 0.08 Hz | 0.0-0.02 | Thinking micro-expression |
| Finger curl | Hand bone rotation.x (if available) | 0.1-0.2 Hz | 0.0-0.1 | Very subtle |

### B6. Emotion-Specific Spring Profiles (2-3h)

Each emotion modifies spring parameters to change motion quality:

| Emotion | Halflife Multiplier | Overshoot Multiplier | Fidget Frequency | Notes |
|---------|--------------------|--------------------|-----------------|-------|
| happy | 0.7x (snappier) | 1.5x (bouncier) | 1.3x more frequent | Energetic feel |
| sad | 1.8x (slower) | 0.3x (minimal) | 0.5x less frequent | Heavy, weighted |
| angry | 0.5x (very snappy) | 2.0x (jerky) | 1.5x | Tense, sharp |
| surprised | 0.4x (instant) | 2.5x (dramatic) | 0.8x | Reactive |
| neutral | 1.0x (baseline) | 1.0x | 1.0x | Default |
| sleepy | 2.5x (very slow) | 0.2x (almost none) | 0.3x | Drowsy, languid |
| embarrassed | 1.3x (hesitant) | 0.8x | 0.7x | Small, contained |
| excited | 0.6x (fast) | 1.8x (bouncy) | 2.0x | Animated, lively |

**Integration with MoodEngine:** The backend's `/api/characters/{id}/mood` returns an emotion tag. The viewer receives this via `postMessage` (already wired). The FollowThroughLayer reads the current emotion and multiplies its spring parameters accordingly.

### Verification

- Hip turn: watch spine, neck, and head follow with visible but subtle cascade lag
- Arms should trail slightly behind torso motion
- Breathing involves visible shoulder rise (subtle)
- Weight shifts produce S-curve counter in spine
- Different emotions produce visibly different motion quality (happy = bouncy, sad = heavy)
- Performance: all chains <0.1ms/frame total

---

## Phase C: VRMLookAt + Bone Masks

**Goal:** Wire VRM's built-in eye/head tracking to cursor; enable upper/lower body animation separation
**Est:** 14-20 hours
**Impact:** 8/10
**Prerequisite:** Phase A

### Files to Modify

| File | Changes |
|------|---------|
| `frontends/shared/viewer/viewer.html` | VRMLookAt wiring, BoneMaskManager, dual-track ClipLayer |
| `frontends/sakura/src/stores/viewerStore.ts` | Add lookAt target postMessage API |

### C1. VRMLookAt Cursor Tracking (2-4h)

The VRM model already has a `vrm.lookAt` system. Wire it:

```javascript
/**
 * Wire VRMLookAt to mouse cursor position.
 * Creates a THREE.Object3D as the lookAt target and positions it
 * along a ray from the camera through the mouse cursor.
 *
 * The target uses spring smoothing to avoid jittery eye movement.
 */
class CursorLookAtController {
    constructor(vrm, camera, canvas)

    /**
     * Enable/disable cursor tracking.
     * When disabled, eyes return to default forward gaze.
     */
    setEnabled(enabled)

    /**
     * Set a world-space position to look at (overrides cursor).
     * Used for: looking at chat bubbles, looking at UI elements, etc.
     */
    setWorldTarget(position)

    /**
     * Update loop — call each frame.
     * Smoothly interpolates lookAt target using critically damped spring.
     */
    update(dt)
}
```

**Integration:**
- Instantiate after VRM load (around line ~6085 in the render setup)
- Call `controller.update(dt)` before `vrm.update()` in the render loop
- The existing `LookAtLayer` (line 2608) can be deprecated or repurposed as a fallback

**postMessage API additions:**
```javascript
// From viewerStore.ts -> iframe
{ type: 'lookAt', target: { x, y, z } }      // world-space target
{ type: 'lookAt', enabled: false }             // disable tracking
{ type: 'lookAt', mode: 'cursor' | 'point' }  // tracking mode
```

### C2. Bone Mask System for Clips (6-8h)

Enable Mixamo/BVH clips to play on subsets of bones (upper body only, lower body only):

```javascript
/**
 * Manages bone masks for AnimationAction filtering.
 * Allows clip-based animations to affect only a subset of bones.
 *
 * @example
 *   const mask = BoneMaskManager.UPPER_BODY;
 *   clipLayer.playClip('talking_gesture', { mask });
 *   // Gesture plays on upper body while idle plays on lower body
 */
class BoneMaskManager {
    static UPPER_BODY = new Set([
        'spine', 'chest', 'upperChest', 'neck', 'head',
        'leftShoulder', 'rightShoulder',
        'leftUpperArm', 'rightUpperArm',
        'leftLowerArm', 'rightLowerArm',
        'leftHand', 'rightHand'
    ]);

    static LOWER_BODY = new Set([
        'hips',
        'leftUpperLeg', 'rightUpperLeg',
        'leftLowerLeg', 'rightLowerLeg',
        'leftFoot', 'rightFoot',
        'leftToes', 'rightToes'
    ]);

    static FULL_BODY = null;  // no mask = all bones

    /**
     * Filter an AnimationClip to only include tracks for specified bones.
     * Returns a new clip; does not modify the original.
     *
     * @param {THREE.AnimationClip} clip - Source clip
     * @param {Set<string>} allowedBones - Bone names to keep
     * @returns {THREE.AnimationClip} Filtered clip
     */
    static filterClip(clip, allowedBones)

    /**
     * Apply bone mask to an existing AnimationAction (post-creation).
     * Uses Three.js internal _propertyBindings filtering.
     * WARNING: Forward-compatibility risk with Three.js updates.
     *
     * @param {THREE.AnimationAction} action - Action to mask
     * @param {Set<string>} allowedBones - Bone names to keep
     */
    static applyMask(action, allowedBones)
}
```

### C3. ClipLayer Enhancement (4-6h)

Modify existing `ClipLayer` (line ~2016) to support bone masks:

```javascript
// Existing API (unchanged):
clipLayer.playClip(clipName, options);

// New options:
clipLayer.playClip('gesture_wave', {
    mask: BoneMaskManager.UPPER_BODY,  // only upper body
    weight: 0.8,                        // blend weight
    crossfade: 0.3,                     // transition duration
    easingFn: 'spring'                  // 'linear' | 'spring' | 'exponential'
});
```

**Crossfade enhancement:** Replace Three.js default linear crossfade with spring-based weight interpolation:

```javascript
// In ClipLayer.update():
// Instead of linear weight ramp:
const rawT = elapsed / crossfadeDuration;
// Use exponential ease:
const easedT = 1 - Math.exp(-5 * rawT);
oldAction.setEffectiveWeight(1 - easedT);
newAction.setEffectiveWeight(easedT);
```

### C4. Inertialization Blending (2-4h)

For highest-quality transitions between clips, implement inertialization:

```javascript
/**
 * Inertialization-based animation transition.
 * At the transition moment, captures the offset between old and new poses,
 * then decays that offset using a critically damped spring.
 * Produces the smoothest possible transitions with zero blending artifacts.
 *
 * @param {THREE.SkinnedMesh} mesh - The skinned mesh
 * @param {THREE.AnimationAction} oldAction - Outgoing action
 * @param {THREE.AnimationAction} newAction - Incoming action
 * @param {number} halflife - Spring halflife for offset decay (0.1-0.3s typical)
 */
class InertializationBlend {
    constructor(mesh, oldAction, newAction, halflife = 0.15)
    update(dt) -> boolean  // returns false when blend is complete
    apply()  // apply decaying offsets to bones
}
```

### Verification

- Move mouse cursor across screen: avatar eyes and head should follow smoothly
- Eyes should lead head (faster response)
- Play an upper-body clip: lower body continues idle animation undisturbed
- Clip transitions should be smooth with no visible "pop"
- No regression on existing gesture/clip playback

---

## Phase D: Procedural Gestures + Center of Gravity

**Goal:** Component-based gesture generation from emotion tags; CoG balance compensation
**Est:** 25-40 hours
**Impact:** 7/10
**Prerequisite:** Phase A (springs), Phase B (follow-through)

### Files to Modify

| File | Changes |
|------|---------|
| `frontends/shared/viewer/viewer.html` | ProceduralGestureEngine, BalanceLayer, gesture templates |
| `frontends/sakura/src/stores/viewerStore.ts` | Gesture trigger from chat response |
| `frontends/sakura/src/stores/chatStore.ts` | Extract emotion/intensity from LLM response, forward to viewer |

### D1. ProceduralGestureEngine (8-12h)

```javascript
/**
 * Generates gestures procedurally from emotion and intensity parameters.
 * Each gesture is composed of parameterized bone movement components,
 * producing variety — the same emotion never looks identical twice.
 *
 * @example
 *   const engine = new ProceduralGestureEngine(vrm);
 *   const program = engine.generate('excited', 0.8);
 *   engine.play(program);  // runs over ~1.5s
 */
class ProceduralGestureEngine {
    constructor(vrm)

    /**
     * Generate a gesture program from emotion parameters.
     *
     * @param {string} emotion - Emotion tag from MoodEngine
     * @param {number} intensity - 0.0-1.0
     * @returns {GestureProgram} Playable program of bone movements
     */
    generate(emotion, intensity) -> GestureProgram

    /**
     * Play a generated gesture program.
     * Bones are driven through springs for natural motion.
     *
     * @param {GestureProgram} program
     * @param {Object} [opts] - { interrupt: boolean, blendWeight: number }
     */
    play(program, opts)

    /**
     * Update active gesture. Call each frame.
     */
    update(dt) -> { boneName: { x, y, z } }  // rotation deltas

    isPlaying() -> boolean
}
```

### D2. Gesture Templates (4-6h)

Pre-defined per emotion with randomization ranges:

| Emotion | Duration | Overshoot | Primary Bones | Character |
|---------|----------|-----------|---------------|-----------|
| happy | 1.5s | 0.20 | chest lift, arms spread, head up | Bouncy, open |
| sad | 2.5s | 0.05 | spine curl, head drop, arms close | Heavy, folded |
| angry | 0.8s | 0.30 | chest thrust, fists clench, head forward | Sharp, aggressive |
| surprised | 0.6s | 0.35 | full lean back, arms up, eyes wide | Explosive, recoil |
| neutral | 1.8s | 0.10 | head tilt, single arm micro-gesture | Subtle, conversational |
| embarrassed | 1.2s | 0.08 | head turn away, hands together, shoulders up | Shrinking, shy |
| excited | 1.0s | 0.25 | bounce, arms up, lean forward | Energetic, bouncy |
| thinking | 2.0s | 0.05 | head tilt, hand to chin, eyes up | Contemplative |
| flirty | 1.5s | 0.12 | hip cock, head tilt, hair touch | Playful, coy |
| sleepy | 3.0s | 0.03 | head drop, body slump, eyes half | Slow, heavy |

Each template includes 4-6 bone entries with `{ name, axis, baseAmplitude, curve, delay }`. All amplitudes get `* (0.8 + Math.random() * 0.4)` for per-play variation.

### D3. BalanceLayer — Center of Gravity (6-10h)

```javascript
/**
 * Tracks virtual Center of Gravity and applies compensating hip shifts.
 * Makes the character feel like they have WEIGHT and physical presence.
 * Runs after all other layers, before vrm.update().
 *
 * Uses biomechanics-standard mass distribution:
 *   Head: 8%, Torso: 50%, Arms: 10%, Legs: 32%
 */
class BalanceLayer extends AnimationLayer {
    constructor(vrm)

    /**
     * Calculate approximate CoG from weighted bone world positions.
     */
    calculateCoG() -> THREE.Vector3

    /**
     * Apply compensating hip shift to keep CoG above base of support.
     * Uses spring-damped correction to avoid jittery adjustments.
     */
    update(dt)
}
```

**Mass weights (biomechanics standard):**

| Bone | Mass % | Role |
|------|--------|------|
| head | 8% | Drives tilt compensation |
| chest | 25% | Primary torso mass |
| spine | 25% | Lower torso mass |
| leftUpperArm / rightUpperArm | 3% each | Arm raise shifts CoG |
| leftLowerArm / rightLowerArm | 2% each | Extended arms shift more |
| leftUpperLeg / rightUpperLeg | 10% each | Weight-bearing |
| leftLowerLeg / rightLowerLeg | 6% each | Ankle/balance |

**CoG effects by scenario:**

| Scenario | CoG Shift | Compensation |
|----------|-----------|--------------|
| One arm raised | Shift to that side | Hip shifts opposite, spine counter-curves |
| Lean forward | CoG moves forward | Subtle squat/ankle bend |
| Head turn | Small lateral shift | Barely perceptible hip counter |
| Crossed arms | Slightly forward | Very subtle forward lean |
| Surprise lean-back | CoG moves back | Weight on heels |

### D4. Chat Response -> Gesture Pipeline (3-4h)

Wire the LLM response emotion tags through to the gesture engine:

```
chatStore.ts                viewerStore.ts              viewer.html
─────────────              ────────────────            ────────────
LLM response               postMessage to              ProceduralGestureEngine
  → extract emotion tag       iframe:                    .generate(emotion, intensity)
  → extract intensity         { type: 'gesture',         .play(program)
                                emotion, intensity }
```

**viewerStore.ts additions:**
```typescript
/** Trigger a procedural gesture from emotion context. */
triggerEmotionGesture(emotion: string, intensity: number): void
```

**postMessage API:**
```javascript
{ type: 'proceduralGesture', emotion: 'happy', intensity: 0.8 }
```

### Verification

- Send a happy message: avatar performs a visibly different gesture each time (randomization works)
- Sad messages: gestures are slow, heavy, small
- Excited messages: gestures are big, fast, bouncy
- One-arm gestures cause visible (but subtle) hip counter-shift from BalanceLayer
- Performance: gesture engine + CoG <0.15ms/frame

---

## Phase E: Pose Library + Foot IK

**Goal:** Curated Mixamo clip library with tag-based selection; analytical foot IK for grounding
**Est:** 18-28 hours
**Impact:** 8/10
**Prerequisite:** Phase C (bone masks for clip playback)

### Files to Modify

| File | Changes |
|------|---------|
| `frontends/shared/viewer/viewer.html` | PoseLibrary class, TwoBoneIK solver |
| `frontends/shared/animations/` | New directory for clip files |
| `frontends/shared/animations/manifest.json` | Clip metadata |
| `backend/server.py` | `GET /api/animations/manifest` endpoint |

### E1. Mixamo Clip Curation List (4-6h for download/conversion)

**50 recommended starter clips:**

#### Idle Poses (8 clips)
| # | Mixamo Name | Tag: emotion | Tag: intensity | Loop | Duration |
|---|-------------|-------------|----------------|------|----------|
| 1 | Breathing Idle | neutral | low | yes | 4s |
| 2 | Happy Idle | happy | medium | yes | 5s |
| 3 | Sad Idle | sad | medium | yes | 5s |
| 4 | Weight Shift | neutral | low | yes | 4s |
| 5 | Bored | bored | low | yes | 6s |
| 6 | Standing Looking Around | curious | low | yes | 6s |
| 7 | Confident Idle | confident | medium | yes | 4s |
| 8 | Shy Idle | embarrassed | low | yes | 5s |

#### Talk Gestures (10 clips)
| # | Mixamo Name | Tag: emotion | Tag: intensity | Loop | Duration |
|---|-------------|-------------|----------------|------|----------|
| 9 | Talking | neutral | medium | yes | 3s |
| 10 | Explaining | neutral | high | no | 4s |
| 11 | Arguing | angry | high | no | 3s |
| 12 | Whispering | shy | low | no | 3s |
| 13 | Laughing | happy | high | no | 3s |
| 14 | Nodding | agreeable | medium | no | 2s |
| 15 | Shaking Head | disagreeing | medium | no | 2s |
| 16 | Pointing (Right Hand) | assertive | medium | no | 2s |
| 17 | Shrugging | confused | medium | no | 2s |
| 18 | Hand Wave (Greeting) | happy | medium | no | 2s |

#### Emotional Reactions (12 clips)
| # | Mixamo Name | Tag: emotion | Tag: intensity | Loop | Duration |
|---|-------------|-------------|----------------|------|----------|
| 19 | Surprised | surprised | high | no | 2s |
| 20 | Angry Gesture | angry | high | no | 3s |
| 21 | Crying | sad | high | no | 4s |
| 22 | Joyful Jump | excited | high | no | 2s |
| 23 | Clapping | happy | high | no | 3s |
| 24 | Face Palm | frustrated | medium | no | 3s |
| 25 | Embarrassed | embarrassed | medium | no | 3s |
| 26 | Thinking | thinking | medium | no | 3s |
| 27 | Frustrated | angry | medium | no | 3s |
| 28 | Relieved Sigh | relieved | medium | no | 3s |
| 29 | Excited Reaction | excited | high | no | 2s |
| 30 | Scared Reaction | scared | high | no | 2s |

#### Transitional (5 clips)
| # | Mixamo Name | Tag: emotion | Tag: intensity | Loop | Duration |
|---|-------------|-------------|----------------|------|----------|
| 31 | Stretching | neutral | low | no | 4s |
| 32 | Yawning | sleepy | low | no | 3s |
| 33 | Look Left-Right | curious | low | no | 3s |
| 34 | Cross Arms | defensive | medium | no | 2s |
| 35 | Hands on Hips | assertive | medium | no | 2s |

#### Special/Affectionate (10 clips)
| # | Mixamo Name | Tag: emotion | Tag: intensity | Loop | Duration |
|---|-------------|-------------|----------------|------|----------|
| 36 | Bow | respectful | medium | no | 3s |
| 37 | Curtsy | respectful | medium | no | 3s |
| 38 | Heart Shape (Hands) | loving | high | no | 3s |
| 39 | Peace Sign | playful | medium | no | 2s |
| 40 | Blown Kiss | flirty | high | no | 2s |
| 41 | Waving Goodbye | happy | medium | no | 3s |
| 42 | Beckoning | flirty | medium | no | 2s |
| 43 | Hair Tuck | shy | low | no | 2s |
| 44 | Hands Together (Prayer) | grateful | medium | no | 2s |
| 45 | Dance Move (Simple) | happy | high | yes | 4s |

#### Additional Idle Fidgets (5 clips)
| # | Mixamo Name | Tag: emotion | Tag: intensity | Loop | Duration |
|---|-------------|-------------|----------------|------|----------|
| 46 | Head Scratch | confused | low | no | 2s |
| 47 | Neck Rub | tired | low | no | 2s |
| 48 | Foot Tap | impatient | low | yes | 3s |
| 49 | Playing with Hair | idle | low | no | 3s |
| 50 | Adjusting Glasses | neutral | low | no | 2s |

**Download format:** FBX, "In Place" (no root motion), 30fps, without skin
**Conversion:** FBX -> GLB via Blender CLI batch script, then load via Three.js GLTFLoader
**Storage:** `frontends/shared/animations/clips/` (~50-100KB per clip GLB = ~5MB total)

### E2. PoseLibrary Class (4-6h)

```javascript
/**
 * Tag-based animation clip library.
 * Selects best-matching clip for current emotion/context.
 * Avoids repeating the same clip consecutively.
 *
 * @example
 *   const lib = new PoseLibrary();
 *   await lib.loadManifest('/shared/animations/manifest.json');
 *   const clip = lib.findBest('happy', 'high', 'reaction');
 *   clipLayer.playClip(clip, { mask: BoneMaskManager.UPPER_BODY });
 */
class PoseLibrary {
    constructor()
    async loadManifest(url)
    async loadClip(id) -> THREE.AnimationClip  // lazy-loads on first use
    findBest(emotion, intensity, category) -> { id, clip, tags }
    getRandomIdle() -> { id, clip, tags }
    getReaction(emotion) -> { id, clip, tags }
    preloadCategory(category)  // warm cache
}
```

**Manifest format (`manifest.json`):**
```json
[
    {
        "id": "idle_breathing",
        "file": "clips/idle_breathing.glb",
        "emotion": "neutral",
        "intensity": "low",
        "category": "idle",
        "loop": true,
        "duration": 4.0,
        "tags": ["breathing", "calm", "default"]
    }
]
```

### E3. Two-Bone Analytical Foot IK (6-8h)

```javascript
/**
 * Analytical two-bone IK for leg chains.
 * Prevents foot sliding during weight shifts and clips.
 * Uses law of cosines for knee angle calculation.
 *
 * @param {THREE.Bone} upper - Upper leg bone
 * @param {THREE.Bone} lower - Lower leg bone
 * @param {THREE.Vector3} target - World-space foot target
 * @param {THREE.Vector3} pole - Knee bend direction hint
 */
function twoBoneIK(upper, lower, target, pole)

/**
 * Foot ground plane detector.
 * Keeps feet planted on the ground plane during idle/gesture animations.
 * Samples foot bone world position and corrects with IK if above/below ground.
 */
class FootPlantController {
    constructor(vrm, groundY = 0)
    update(dt)
    setGroundPlane(y)
}
```

### E4. Backend Animation Manifest Endpoint (2-3h)

```python
@app.get("/api/animations/manifest")
async def get_animation_manifest() -> list[dict]:
    """
    Return metadata for all available animation clips.

    Returns:
        List of clip metadata dicts with id, file, emotion, intensity,
        category, loop, duration, and tags fields.

    Example:
        >>> resp = await client.get("/api/animations/manifest")
        >>> len(resp.json())  # 50+ clips
    """
```

### Verification

- `GET /api/animations/manifest` returns 50 entries
- Each clip loads and plays on VRM model without bone mapping errors
- `PoseLibrary.findBest('happy', 'high', 'reaction')` returns a clapping/joyful clip
- Upper-body clips play while lower body maintains idle
- Feet stay planted during all animations (no sliding)

---

## Phase F: Neural Motion Synthesis (Future)

**Goal:** Offline pipeline to generate 200-500 motion clips via MotionGPT
**Est:** 60-100 hours
**Impact:** 10/10 (if feasible)
**Prerequisite:** Phases A-E complete, GPU server available
**Status:** RESEARCH PHASE — do not execute until Phases A-E are verified

### Files to Modify

| File | Changes |
|------|---------|
| `backend/motion/generator.py` | New: MotionGPT inference pipeline |
| `backend/motion/retarget.py` | New: SMPL -> VRM bone retargeting |
| `backend/motion/prompts.py` | New: 200-500 motion generation prompts |
| `frontends/shared/animations/generated/` | New: AI-generated clip storage |

### F1. SMPL to VRM Retargeting Map

| SMPL Joint | Index | VRM Bone |
|------------|-------|----------|
| Pelvis | 0 | hips |
| L_Hip | 1 | leftUpperLeg |
| R_Hip | 2 | rightUpperLeg |
| Spine1 | 3 | spine |
| L_Knee | 4 | leftLowerLeg |
| R_Knee | 5 | rightLowerLeg |
| Spine2 | 6 | chest |
| L_Ankle | 7 | leftFoot |
| R_Ankle | 8 | rightFoot |
| Spine3 | 9 | upperChest |
| L_Foot | 10 | leftToes |
| R_Foot | 11 | rightToes |
| Neck | 12 | neck |
| L_Collar | 13 | leftShoulder |
| R_Collar | 14 | rightShoulder |
| Head | 15 | head |
| L_Shoulder | 16 | leftUpperArm |
| R_Shoulder | 17 | rightUpperArm |
| L_Elbow | 18 | leftLowerArm |
| R_Elbow | 19 | rightLowerArm |
| L_Wrist | 20 | leftHand |
| R_Wrist | 21 | rightHand |

### F2. Recommended Approach

**Offline pre-generation + cache** (highest feasibility):
1. Generate 200-500 motions offline using MotionGPT on GPU server
2. Convert SMPL axis-angle output to VRM quaternions
3. Store as BVH -> convert to GLB AnimationClips
4. Add to PoseLibrary manifest
5. Total generation time: ~15-30 minutes on GPU
6. Storage: ~50-100MB compressed

### Not Recommended (Yet)

- Real-time inference in browser (models 500MB-2GB, too slow for 60fps)
- Server-side real-time (adds latency, complexity, GPU dependency)

---

## Integration Architecture

### How New Systems Fit Into AnimationDirector

```
┌─────────────────────────────────────────────────┐
│                AnimationDirector                 │
│                                                  │
│  L0: BasePoseLayer          (spring-driven)      │  Phase A
│  L1: IdleBehaviorLayer      (spring-driven)      │  Phase A
│  L2: EmotionLayer           (deprecated)         │
│  L3: TalkLayer              (spring-driven)      │  Phase A
│  L4: GestureLayer           (spring-driven)      │  Phase A
│  L5: LookAtLayer            → CursorLookAtCtrl   │  Phase C
│  L6: ClipLayer              (bone-masked)         │  Phase C
│  L7: ProceduralGestureEngine (new)               │  Phase D
│                                                  │
│  ── Post-layer pass ──                           │
│  FollowThroughLayer (cascaded springs)           │  Phase B
│  BalanceLayer (CoG compensation)                 │  Phase D
│                                                  │
│  ── vrm.update() ──                              │
│  (VRMLookAt, constraints, spring bones)          │
└─────────────────────────────────────────────────┘
```

### Data Flow: Chat -> Motion

```
Backend (MoodEngine)           Frontend (chatStore)         Viewer (iframe)
────────────────────          ──────────────────          ────────────────
/api/chat response      →     emotion: "happy"      →     postMessage:
  emotion_tag: "happy"        intensity: 0.8               { type: 'proceduralGesture',
  intensity: 0.8                                             emotion: 'happy',
                                                             intensity: 0.8 }

                                                           ProceduralGestureEngine
                                                             .generate('happy', 0.8)
                                                             → SpringChain bones
                                                             → BalanceLayer CoG
                                                             → FollowThrough cascade
```

### Performance Budget

| System | Cost/Frame | Phase |
|--------|-----------|-------|
| Spring functions (50 bones) | 0.05ms | A |
| PoseSpringManager (20 channels) | 0.06ms | A |
| SpringChain (3 chains, 13 bones) | 0.04ms | B |
| Breathing enhancement (6 bones) | 0.02ms | B |
| CursorLookAtController | 0.01ms | C |
| BoneMask clip filtering | 0.00ms (one-time) | C |
| ProceduralGestureEngine | 0.05ms | D |
| BalanceLayer (CoG calc) | 0.06ms | D |
| FootPlantController (2-bone IK) | 0.02ms | E |
| **Total** | **~0.31ms** | |

**Budget:** <2ms/frame for entire animation system. We are at ~0.31ms for new systems, well within budget on all target hardware (M2 Pro, RTX 5080, RTX 3070).

---

## Effort Summary

| Phase | Description | Hours | Cumulative | Dependencies |
|-------|-------------|-------|------------|--------------|
| **A** | Spring Math + Easing Upgrade | 10-18h | 10-18h | None |
| **B** | Follow-Through + Idle Enhancement | 16-24h | 26-42h | Phase A |
| **C** | VRMLookAt + Bone Masks | 14-20h | 40-62h | Phase A |
| **D** | Procedural Gestures + CoG | 25-40h | 65-102h | Phase A, B |
| **E** | Pose Library + Foot IK | 18-28h | 83-130h | Phase C |
| **F** | Neural Motion (Future) | 60-100h | 143-230h | All above |

**Phases A-E total: 83-130 hours (without neural motion)**
**AI-assisted estimate (12x factor): 7-11 hours wall-clock**

### Recommended Session Plan

| Session | Work | Hours |
|---------|------|-------|
| Session 1 | Phase A: spring functions + PoseSpringManager + BasePose integration | 3-4h |
| Session 2 | Phase A finish (Idle integration) + Phase B start (SpringChain) | 3-4h |
| Session 3 | Phase B: FollowThrough layer + enhanced breathing/weight | 3-4h |
| Session 4 | Phase B finish (emotion profiles) + Phase C start (VRMLookAt) | 3-4h |
| Session 5 | Phase C: bone masks + ClipLayer enhancement | 3-4h |
| Session 6 | Phase D: ProceduralGestureEngine + templates | 3-4h |
| Session 7 | Phase D: BalanceLayer + chat->gesture wiring | 3-4h |
| Session 8 | Phase E: Mixamo download/conversion + PoseLibrary | 3-4h |
| Session 9 | Phase E: Foot IK + backend endpoint + integration testing | 3-4h |

---

## References

All references from the research document:

- Daniel Holden, "Spring-Roll-Call" — https://theorangeduck.com/page/spring-roll-call
- Allen Chou, "Precise Control over Numeric Springing" — https://allenchou.net/2015/04/game-math-precise-control-over-numeric-springing/
- Alexis Bacot, "The Art of Damping" — https://www.alexisbacot.com/blog/the-art-of-damping
- toqoz springs (quaternion) — https://toqoz.fyi/springs.html
- Ryan Juckett's damped springs — https://www.ryanjuckett.com/damped-springs/
- Three.js CCDIKSolver — https://threejs.org/docs/pages/CCDIKSolver.html
- THREE.IK (FABRIK) — https://github.com/jsantell/THREE.IK
- IK-threejs (UPF) — https://github.com/upf-gti/IK-threejs
- Llanimation (gesture from LLM) — https://arxiv.org/abs/2405.08042
- EMOTION (expressive gestures) — https://arxiv.org/html/2410.23234v1
- MotionGPT — https://github.com/OpenMotionLab/MotionGPT
- Motion Matching — https://github.com/orangeduck/Motion-Matching
- RIKO project (local reference) — `/Users/chris/Code/riko-project/`
