> **This is Part 3 of 4.** See also: [Part 1](2026-03-29-humanoid-motion-research-part-1.md), [Part 2](2026-03-29-humanoid-motion-research-part-2.md), [Part 4](2026-03-29-humanoid-motion-research-part-4.md)

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

### Gesture Component Taxonomy

Based on McNeill's gesture classification (1992) and the Llanimation paper findings:

| Type | Description | Bones Involved | Example |
|------|-------------|---------------|---------|
| **Beat** | Rhythmic hand/arm movements synchronized with speech prosody | Hands, forearms, shoulders | Small up/down hand motions while talking |
| **Iconic** | Depict concrete objects or actions being described | Arms, hands, fingers | Drawing a "big" circle with hands |
| **Metaphoric** | Represent abstract concepts through spatial metaphor | Arms, upper body | Pushing hands away for "reject" |
| **Deictic** | Pointing/indicating direction or objects | One arm, index finger | Pointing up for "over there" |
| **Emblem** | Culturally specific symbolic gestures | Hands | Thumbs up, peace sign, wave |
| **Adaptor** | Self-touching, comfort gestures (not communicative) | Hands to face/body | Touching hair, rubbing neck |
| **Postural** | Whole-body shifts conveying attitude | Full body | Lean forward (interest), cross arms (defensive) |

### Architecture: Component-Based Gesture System

```javascript
/**
 * Procedural gesture generator.
 * Composes gestures from parameterized components rather than fixed clips.
 *
 * Key insight from Llanimation (Windle et al., 2024):
 * LLM text embeddings produce better gestures than audio features alone.
 * Our LLM emotion tags are therefore a strong signal for gesture selection.
 *
 * Architecture: each gesture is a "program" -- a list of bone movements
 * with timing, easing, and amplitude parameters. The program is generated
 * from templates with random variation, so the same emotion never produces
 * exactly the same gesture twice.
 */
class ProceduralGestureEngine {
    constructor(vrm) {
        this.vrm = vrm;
        this.activeGesture = null;
        this.gestureTime = 0;
        this.springManager = new PoseSpringManager(); // From Section 3
    }

    /**
     * Generate a gesture from emotion parameters.
     *
     * @param {string} emotion - Emotion tag (happy, sad, angry, etc.)
     * @param {number} intensity - 0.0-1.0
     * @param {string} [gestureType] - Optional type override (beat, iconic, etc.)
     * @returns {GestureProgram} A program of bone movements
     */
    generate(emotion, intensity, gestureType) {
        const template = GESTURE_TEMPLATES[emotion] || GESTURE_TEMPLATES.neutral;

        // Select appropriate gesture type based on context
        const type = gestureType || this._selectGestureType(emotion, intensity);

        return {
            type,
            duration: template.baseDuration / (0.5 + intensity * 0.8),
            bones: template.bones.map(b => ({
                name: b.name,
                amplitude: b.baseAmplitude * intensity * (0.8 + Math.random() * 0.4),
                axis: b.axis,
                curve: b.curve,
                delay: b.delay * (0.9 + Math.random() * 0.2),
                overshoot: template.overshoot * intensity
            })),
            // Add beat gestures if talking
            beats: type === 'beat' ? this._generateBeatPattern(intensity) : null
        };
    }

    _selectGestureType(emotion, intensity) {
        // Higher intensity -> more expressive gesture types
        if (intensity > 0.7) return Math.random() > 0.5 ? 'iconic' : 'metaphoric';
        if (intensity > 0.4) return 'beat';
        return 'postural'; // Low intensity -> subtle postural shift
    }

    _generateBeatPattern(intensity) {
        // Beat gestures: small rhythmic hand movements
        // Frequency correlates with speech rate and excitement
        const beatsPerSecond = 1.5 + intensity * 2.0; // 1.5-3.5 Hz
        const amplitude = 0.03 + intensity * 0.05;
        return { frequency: beatsPerSecond, amplitude, axis: 'y' };
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
| Llanimation (Windle et al.) | 2024 | LLama2 text embeddings produce better gestures than audio features alone. Uses Transformer-XL architecture with PASE+ audio features. |
| LLM Gesticulator (arxiv 2410.10851) | 2024 | Leverages LLMs for scalable and controllable co-speech gesture synthesis |
| EMOTION (arxiv 2410.23234) | 2024 | In-context learning for expressive humanoid gestures from text |
| AMUSE (arxiv 2312.04466) | 2023 | Disentangled content/emotion/style latent diffusion for body animation |
| LLMs for Virtual Human Gesture Selection | 2025 | LLMs select from gesture library rather than generate end-to-end |
| Generative AI for Character Animation Survey | 2025 | Comprehensive survey of LLM/diffusion approaches |

**Key insight from Llanimation:** LLM features on their own perform significantly better than audio features for gesture generation. The results show no significant difference when audio and LLM features are combined vs. LLM alone. This means our existing LLM emotion tags are a strong signal for procedural gestures -- we don't need audio analysis.

### References

- Llanimation paper -- https://arxiv.org/abs/2405.08042
- EMOTION paper -- https://arxiv.org/html/2410.23234v1
- LLM Gesticulator -- https://arxiv.org/html/2410.10851
- awesome-gesture_generation -- https://github.com/openhuman-ai/awesome-gesture_generation
- LLM_animation showroom -- https://github.com/Whalefishin/LLM_animation
- McNeill, D. "Hand and Mind: What Gestures Reveal about Thought" (1992)

---

## 9. Neural Motion Synthesis

**Priority:** LOW (research-phase, not real-time ready for WebGL)
**Effort:** 60-100h (including pipeline)
**Impact:** 10/10 (if feasible)

### State of the Art (2024-2026)

| Model | Year | Approach | Quality | Speed | Output Format |
|-------|------|----------|---------|-------|--------------|
| MDM (Motion Diffusion Model) | 2023 | Diffusion on motion sequences | High | ~5s/motion (GPU) | SMPL joints |
| T2M-GPT | 2023 | GPT on discrete motion tokens | High | ~2s/motion | SMPL joints |
| MoMask | 2024 | Masked transformer on multi-layer discrete tokens | Very high (FID 0.045 on HumanML3D) | ~3s/motion | SMPL joints |
| MotionGPT | 2023 | LLM (Llama) on discrete motion tokens via VQ-VAE | High | ~3s/motion | SMPL joints |
| MotionGPT-2 | 2024 | General-purpose motion-language, unified generation + understanding | Very high | ~2s/motion | SMPL joints |
| MotionGPT3 | 2025 | Continuous VAE+diffusion, Mixture-of-Experts (MoE) architecture | State of art | ~1.5s/motion | SMPL joints |
| GeoMotionGPT | 2026 | Geometric alignment with orthogonal codebooks, Gumbel-Softmax | Cutting edge | ~1s/motion | SMPL joints |
| OmniMotion-X | 2025 | Versatile multimodal whole-body generation | State of art | ~2s/motion | SMPL-X (body+hands+face) |

### Architecture Details

**MoMask (CVPR 2024):**
- Uses a **hierarchical quantization scheme**: base layer captures coarse motion, residual layers add fine detail
- Two-stage generation: (1) Masked transformer generates base motion tokens from text, (2) Residual transformer refines with multi-layer detail
- Key innovation: the masking strategy allows iterative refinement -- tokens are generated, then some are masked and re-predicted for quality improvement
- Achieves FID 0.045 on HumanML3D (previous SOTA was ~0.14)

**MotionGPT3 (2025):**
- Replaces discrete VQ-VAE tokenization with **continuous latent space** (VAE + diffusion)
- MoE architecture decouples language pathways from motion pathways -- language experts handle text understanding while motion experts handle generation
- Diffusion-based decoder generates high-fidelity motion from the continuous latent
- Key advantage: avoids information loss from discretization

**GeoMotionGPT (2026):**
- Core innovation: **geometric alignment** between motion codebooks and LLM embedding space
- Enforces orthogonality between modalities to preserve both semantic structure (from LLM) and geometric structure (from motion)
- Uses Gumbel-Softmax for differentiable codebook selection, enabling end-to-end training
- Dramatically improves motion retrieval and cross-modal reasoning

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
 * Direct mapping for the 24 SMPL joints.
 *
 * SMPL-X extends this to 55 joints (adding jaw, eyes, fingers).
 * Models like OmniMotion-X output SMPL-X, giving us finger data.
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
 * VRM uses quaternions. This converts between them.
 *
 * Axis-angle: the direction of the vector IS the rotation axis,
 * and the magnitude IS the rotation angle (in radians).
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
- MotionGPT3 -- https://www.emergentmind.com/topics/motiongpt
- GeoMotionGPT -- (2026, geometric alignment paradigm)
- MoMask -- https://ericguo5513.github.io/momask/
- T2M-GPT -- https://github.com/Mael-zys/T2M-GPT
- OmniMotion-X -- https://arxiv.org/pdf/2510.19789
- CVPR 2025 Motion Diffusion paper -- https://openaccess.thecvf.com/content/CVPR2025/papers/Meng_Rethinking_Diffusion_for_Text-Driven_Human_Motion_Generation_CVPR_2025_paper.pdf

---

## 10. Momentum and Follow-Through

**Priority:** HIGH -- classic "12 principles of animation" technique
**Effort:** 8-12h
**Impact:** 8/10

### The Principle

Disney's 12 Principles of Animation (Johnston & Thomas, 1981) include **Follow Through** and **Overlapping Action** as principle #5:

- **Follow Through:** When the main body stops, loosely attached parts continue moving. Applied to the primary skeleton, this means when the hips stop turning, the spine, chest, neck, and head continue and overshoot.

- **Overlapping Action:** Different body parts move at different rates. The hips lead, the spine follows a few frames later, then the chest, then the neck, then the head. This temporal offset creates a "wave" of motion through the body.

- **Drag:** The tendency of loosely connected parts to lag behind the driving force. Hands drag behind arm movement, head drags behind neck movement.

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

### Mathematical Model: Cascaded Spring Chain

The follow-through effect can be modeled as a chain of springs where each bone is driven by its parent's current position (not target). This creates natural cascading delay.

The key equation for each bone in the chain:

```
bone[i].goal = bone[i].target + (bone[i-1].current - bone[i-1].goal) * coupling
```

Where `coupling` (0-1) controls how much the parent's residual motion affects this bone. Higher coupling = more drag. The chain naturally produces:
- **Temporal offset** (from spring halflives increasing along the chain)
- **Amplitude amplification** (distal bones overshoot more)
- **Wave propagation** (motion ripples from root to tip)

### Implementation: Cascaded Spring Chain

```javascript
/**
 * Cascaded spring chain for follow-through animation.
 * Each bone in the chain follows its parent with a delay,
 * creating natural overlapping action.
 *
 * The chain produces Disney's "successive breaking of joints" --
 * the spine leads, and the motion ripples outward like a whip.
 *
 * Physics: Each bone has an independent spring with increasing
 * halflife. The parent's RESIDUAL error (current - goal) is
 * coupled into the child's goal, creating drag.
 */
class SpringChain {
    /**
     * @param {string[]} boneNames - Bones in order from root to tip
     * @param {Object} [opts]
     * @param {number} [opts.baseHalflife=0.08] - Spring halflife for first bone
     * @param {number} [opts.halflifeGrowth=1.4] - Each subsequent bone is this much slower
     * @param {number} [opts.coupling=0.3] - How much parent drag affects child (0-1)
     * @param {number} [opts.overshootRatio=0.15] - Under-damping for overshoot
     */
    constructor(boneNames, opts = {}) {
        this.boneNames = boneNames;
        this.baseHalflife = opts.baseHalflife ?? 0.08;
        this.halflifeGrowth = opts.halflifeGrowth ?? 1.4;
        this.coupling = opts.coupling ?? 0.3;
        this.overshootRatio = opts.overshootRatio ?? 0.15;

        this.springs = boneNames.map((name, i) => ({
            name,
            halflife: this.baseHalflife * Math.pow(this.halflifeGrowth, i),
            x: { val: 0, vel: 0 },
            y: { val: 0, vel: 0 },
            z: { val: 0, vel: 0 }
        }));
    }

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

    update(dt) {
        const result = {};
        let parentDelta = { x: 0, y: 0, z: 0 };

        for (const spring of this.springs) {
            // Each bone's effective goal includes parent's residual drag
            const goalX = (spring.goalX ?? 0) + parentDelta.x * this.coupling;
            const goalY = (spring.goalY ?? 0) + parentDelta.y * this.coupling;
            const goalZ = (spring.goalZ ?? 0) + parentDelta.z * this.coupling;

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

            // Pass this bone's residual error to next bone
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

### Chain Configurations

```javascript
// Primary spine chain (torso follow-through)
const spineChain = new SpringChain(
    ['hips', 'spine', 'chest', 'neck', 'head'],
    { baseHalflife: 0.06, halflifeGrowth: 1.5, coupling: 0.3, overshootRatio: 0.12 }
);

// Arm chains (arms follow torso with drag)
const leftArmChain = new SpringChain(
    ['leftShoulder', 'leftUpperArm', 'leftLowerArm', 'leftHand'],
    { baseHalflife: 0.04, halflifeGrowth: 1.6, coupling: 0.4, overshootRatio: 0.2 }
);

const rightArmChain = new SpringChain(
    ['rightShoulder', 'rightUpperArm', 'rightLowerArm', 'rightHand'],
    { baseHalflife: 0.04, halflifeGrowth: 1.6, coupling: 0.4, overshootRatio: 0.2 }
);

// Resulting delay cascade (approximate):
// Spine chain:
//   hips:  halflife=0.06s, delay=0ms
//   spine: halflife=0.09s, delay=~30ms
//   chest: halflife=0.135s, delay=~60ms
//   neck:  halflife=0.20s, delay=~90ms
//   head:  halflife=0.30s, delay=~120ms
// Arm chain:
//   shoulder: halflife=0.04s, delay=0ms
//   upperArm: halflife=0.064s, delay=~20ms
//   lowerArm: halflife=0.10s, delay=~50ms
//   hand:     halflife=0.16s, delay=~90ms
```

### Relationship to Other Disney Principles

Follow-through connects to several other animation principles:

| Principle | How It Relates | Implementation |
|-----------|---------------|----------------|
| **Slow In / Slow Out** | Spring easing naturally produces this | Critical/under-damped springs |
| **Arcs** | Body parts move in arcs, not straight lines | Quaternion springs preserve arcs |
| **Secondary Action** | Small movements that support the main action | Arm chain follow-through during body turns |
| **Timing** | Spacing of frames determines weight/feel | Spring halflife controls timing |
| **Exaggeration** | Amplify for anime style | Increase coupling and reduce halflife |
| **Squash & Stretch** | Not directly applicable to skeleton, but... | Blendshape scaling on face during fast movement |

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

- Johnston & Thomas, "The Illusion of Life: Disney Animation" (1981)
- "Follow Through and Overlapping Action" -- https://www.animationmentor.com/blog/follow-through-and-overlapping-action-the-12-basic-principles-of-animation/
- "The Art of Follow Through" -- https://garagefarm.net/blog/follow-through-and-overlapping-action-in-animation

---

## 11. Breathing System Deep Dive

**Priority:** CRITICAL -- the most fundamental sign of life
**Effort:** 4-6h (enhancement of existing system)
**Impact:** 9/10

### Respiratory Biomechanics for Animators

Human breathing involves two primary mechanisms:

**1. Diaphragmatic (Belly) Breathing:**
- The diaphragm contracts and moves downward ~1-10cm depending on depth
- Abdomen pushes outward (belly expansion)
- Lower ribs flare slightly
- Dominant in relaxed, calm states
- Rate: 12-20 breaths/minute (0.2-0.33 Hz) at rest

**2. Thoracic (Chest) Breathing:**
- Intercostal muscles lift and expand the rib cage
- Chest rises and expands forward and laterally
- Shoulders rise slightly
- Dominant in active, stressed, or anxious states
- Can reach 30-50 breaths/minute during extreme exertion

**3. Combined (Normal) Breathing:**
- Most breathing uses both mechanisms
- Roughly 60% diaphragmatic, 40% thoracic at rest
- Shifts toward thoracic under stress/exertion

### Key Biomechanical Parameters

| Parameter | Rest Value | Exertion Value | Unit |
|-----------|-----------|---------------|------|
| Respiratory rate | 12-20 | 30-50 | breaths/min |
| Tidal volume | 500 mL | 2000-3000 mL | mL |
| Chest expansion (AP diameter) | 1-2 cm | 3-5 cm | cm |
| Chest expansion (lateral) | 1-3 cm | 3-6 cm | cm |
| Diaphragm excursion | 1-2 cm | 6-10 cm | cm |
| Shoulder rise | 0-2 mm | 5-15 mm | mm |
| Inhale:Exhale time ratio | 1:1.5 to 1:2 | 1:1 | ratio |
| Inspiratory pause | 0-0.5s | 0s | seconds |

### How Anime Characters Breathe Differently

Anime breathing is **stylized and exaggerated** compared to reality:

1. **Exaggerated chest movement:** Anime typically shows 2-5x the real chest expansion, especially for female characters. This is a deliberate style choice for visual readability.

2. **Shoulder dominance:** Real quiet breathing barely moves the shoulders. Anime breathing almost always includes visible shoulder rise/fall -- it's a visual shorthand for "breathing."

3. **Belly breathing is invisible:** In most anime, abdominal breathing is not depicted (the belly area is usually a flat texture/mesh). All breathing is shown through chest and shoulder movement.

4. **Emotional amplification:** Anime breathing exaggeration scales dramatically with emotion. A sigh might have 10x normal chest movement. Heavy panting after running has entire upper body involvement.

5. **Asymmetric timing:** Anime often uses faster inhale + slower exhale for emotional effect (sighs, exhaustion), or very fast shallow breathing for anxiety/fear.

**For our VRM characters, the recommended approach:**
- 2-3x real-world amplitudes for chest/shoulders (anime style)
- Skip belly/diaphragm (VRM meshes typically don't deform there)
- Use shoulders as primary breathing indicator (most readable at viewing distance)
- Exaggerate timing asymmetry for emotional states

### Multi-Bone Breathing Implementation

```javascript
/**
 * Full multi-bone breathing system with emotion-driven parameters.
 *
 * Bones involved and their roles:
 *   Chest/UpperChest: Primary -- expands forward (rotation.x)
 *   Spine:            Sympathetic curve -- slight forward lean on inhale
 *   Shoulders:        Rise on inhale, drop on exhale (rotation.z)
 *   Clavicles:        Spread slightly on deep inhale
 *   Neck:             Micro-extend on inhale (chin lifts slightly)
 *   Hips:             Micro-sink on exhale (weight settling)
 *   Head:             Micro-nod following neck
 *
 * Phase offsets create the wave of motion through the body:
 *   Diaphragm/spine leads -> chest follows -> shoulders follow -> neck last
 *   This mirrors real respiratory biomechanics where the diaphragm
 *   initiates and the chest wall responds with a slight delay.
 */
class AdvancedBreathingSystem {
    constructor() {
        this.phase = 0;
        this.params = { ...BREATH_PARAMS.calm };
        this.targetParams = { ...BREATH_PARAMS.calm };
    }

    setEmotion(emotion) {
        this.targetParams = BREATH_PARAMS[emotion] || BREATH_PARAMS.calm;
    }

    update(dt) {
        // Smooth parameter transition
        for (const key of Object.keys(this.params)) {
            this.params[key] += (this.targetParams[key] - this.params[key])
                * (1 - Math.exp(-dt * 2.0));
        }

        this.phase += dt * this.params.rate * Math.PI * 2;
        if (this.phase > Math.PI * 2) this.phase -= Math.PI * 2;

        // Asymmetric waveform
        const ratio = this.params.ratio;
        const raw = Math.sin(this.phase);
        const breath = raw >= 0
            ? Math.pow(raw, 1.0 / Math.max(0.3, ratio))
            : -Math.pow(-raw, Math.max(0.3, ratio));

        // Phase offsets for wave propagation (in radians)
        const spinePhase = this.phase - 0.1;
        const chestPhase = this.phase;
        const shoulderPhase = this.phase + 0.15;
        const neckPhase = this.phase + 0.25;

        const spineBreath = Math.sin(spinePhase);
        const chestBreath = breath;
        const shoulderBreath = Math.sin(shoulderPhase);
        const neckBreath = Math.sin(neckPhase);

        return {
            spine:    { rx: spineBreath * this.params.chestAmp * 0.3 },
            chest:    { rx: chestBreath * this.params.chestAmp },
            upperChest: { rx: chestBreath * this.params.chestAmp * 0.7 },
            leftShoulder:  { rz: shoulderBreath * this.params.shoulderAmp },
            rightShoulder: { rz: -shoulderBreath * this.params.shoulderAmp * 0.85 }, // Asymmetric
            neck:     { rx: -neckBreath * this.params.chestAmp * 0.3 },
            head:     { rx: -neckBreath * this.params.chestAmp * 0.15 },
            hips:     { py: -Math.max(0, -breath) * this.params.hipSink },
        };
    }
}
```

### Breathing Parameter Presets by Activity

| Activity State | Rate (Hz) | Chest Amp | Shoulder Amp | Style | Notes |
|---------------|-----------|-----------|-------------|-------|-------|
| Idle standing | 0.25 | 0.020 | 0.010 | 60/40 diaphragm/chest | Default state |
| Talking (calm) | 0.28 | 0.022 | 0.012 | 50/50 | Slightly elevated |
| Talking (animated) | 0.33 | 0.028 | 0.016 | 40/60 chest dominant | More visible |
| Laughing | 0.5-2.0* | 0.040 | 0.025 | Staccato bursts | *Irregular rhythm |
| Sighing | 0.12 | 0.050 | 0.020 | Single deep cycle | 1 deep inhale + long exhale |
| Post-exercise | 0.50 | 0.045 | 0.030 | 30/70 chest dominant | Gradually slowing |
| Sleeping | 0.13 | 0.035 | 0.005 | 80/20 diaphragm | Deep, very regular |
| Startled | gasp | 0.060 | 0.035 | Sharp inhale + hold | Held breath 1-2s |
| Crying | 0.40* | 0.035 | 0.020 | Irregular, hitching | *Interrupted by sobs |

### References

- "Respiratory Mechanics" -- https://pmc.ncbi.nlm.nih.gov/articles/PMC8360707/
- "Respiratory Rate and Pattern" -- https://www.ncbi.nlm.nih.gov/books/NBK365/
- AnimSchool "Breathing Life Into Your Animation" -- https://blog.animschool.edu/2024/11/15/breathing-life-into-your-animation/
- Animation Mentor breathing tutorial -- https://www.animationmentor.com/blog/tutorial-animate-natural-breathing-loops/

---

## 12. Eye Animation System

**Priority:** CRITICAL -- eyes are the first thing humans look at
**Effort:** 10-15h
**Impact:** 10/10

### Why Eyes Matter

Eye contact is the primary mechanism for perceived "connection" between a user and a virtual character. Research consistently shows that unrealistic eye movement is one of the strongest triggers for the uncanny valley effect. The eyes are where believability lives or dies.

### Anatomy of Eye Movement

Human eyes perform several distinct types of movement, each with different characteristics:

**1. Saccades (rapid gaze shifts):**
- Duration: 20-200ms depending on amplitude
- Speed: 300-900 degrees/second (follows "main sequence" -- larger saccades are faster)
- Frequency: 2-5 per second during active looking
- Character: Ballistic (cannot be redirected mid-saccade)
- Post-saccadic suppression: Vision is suppressed during saccade (~50ms)

**2. Smooth Pursuit:**
- Speed: up to ~30 degrees/second (beyond this, saccades compensate)
- Used for tracking moving objects
- Requires a moving target (cannot be performed voluntarily on a static scene)

**3. Microsaccades (fixational eye movements):**
- Amplitude: 1-120 arcminutes (0.017-2.0 degrees)
- Duration: 8-30ms
- Frequency: 1-3 Hz during fixation
- Direction: Biased toward fixation target but with random jitter
- **Critical for aliveness:** Eyes that are perfectly still look dead

**4. Drift (fixational):**
- Slow, random-walk movement between microsaccades
- Amplitude: < 0.1 degrees
- Speed: < 0.5 degrees/second

**5. Vergence:**
- Inward/outward rotation to focus at different distances
- Slow (takes 0.5-1.0s for large distance changes)
- Coupled with pupil dilation (near triad)

### Blink System

**Spontaneous blink parameters:**

| Context | Rate (blinks/min) | Duration (ms) | Notes |
|---------|-------------------|--------------|-------|
| Relaxed/idle | 15-20 | 150-400 | Regular with random variation |
| Conversation (listening) | 20-26 | 100-300 | Higher when processing info |
| Conversation (speaking) | 26-32 | 100-200 | Even higher during speech |
| Focused/reading | 3-8 | 150-300 | Suppressed during engagement |
| Tired | 8-12 | 300-600 | Slower, longer blinks |
| Nervous/anxious | 30-50 | 80-150 | Rapid, shallow blinks |
| Flirting | 15-25 | 200-500 | Slower, more deliberate |

**Blink anatomy:** A blink is NOT symmetric. The closing phase (~75-100ms) is MUCH faster than the opening phase (~150-300ms). Implementation should reflect this:

```javascript
/**
 * Asymmetric blink curve.
 * Close phase is fast (reflex), open phase is slower (voluntary).
 *
 * @param {number} t - Time into blink (0..1)
 * @returns {number} Eye openness (1=open, 0=closed)
 */
function blinkCurve(t) {
    // Close phase: first 30% of duration
    if (t < 0.3) {
        return 1.0 - Math.pow(t / 0.3, 0.5); // Fast close (sqrt curve)
    }
    // Closed hold: 30-40% of duration
    if (t < 0.4) {
        return 0.0;
    }
    // Open phase: last 60% of duration
    const openT = (t - 0.4) / 0.6;
    return Math.pow(openT, 2.0); // Slow open (squared curve)
}
```

### Procedural Eye Animation Implementation

```javascript
/**
 * Complete eye animation system with saccades, microsaccades,
 * blinks, and pupil dilation.
 *
 * Uses VRM expressions for eye control:
 *   - lookLeft/lookRight/lookUp/lookDown for gaze direction
 *   - blink/blinkLeft/blinkRight for blinks
 *   - (pupil dilation requires custom blendshape if available)
 *
 * Architecture: runs independently from VRMLookAt. VRMLookAt handles
 * the coarse gaze direction (where to look), this system adds
 * micro-movements, blinks, and saccadic detail on top.
 */
class EyeAnimationSystem {
    constructor(vrm) {
        this.vrm = vrm;
        this.gazeOffset = { x: 0, y: 0 }; // Microsaccade offset
        this.gazeVelocity = { x: 0, y: 0 };
        this.blinkTimer = 0;
        this.blinkDuration = 0.25;
        this.blinkProgress = -1; // -1 = not blinking
        this.nextBlinkTime = this._randomBlinkInterval();
        this.saccadeTarget = { x: 0, y: 0 };
        this.saccadeTimer = 0;
        this.nextSaccadeTime = 0.3;
        this.pupilDilation = 0.5; // 0=constricted, 1=dilated
        this.targetPupilDilation = 0.5;
        this.emotion = 'neutral';
    }

    setEmotion(emotion) {
        this.emotion = emotion;
        // Pupil dilation responds to emotional arousal
        const arousalMap = {
            neutral: 0.5, calm: 0.4, happy: 0.6, excited: 0.8,
            sad: 0.45, angry: 0.7, surprised: 0.9, scared: 0.85,
            loving: 0.75, embarrassed: 0.6, sleepy: 0.3
        };
        this.targetPupilDilation = arousalMap[emotion] ?? 0.5;
    }

    update(dt) {
        this._updateMicrosaccades(dt);
        this._updateBlinks(dt);
        this._updateSaccades(dt);
        this._updatePupilDilation(dt);
        this._applyToVRM();
    }

    _updateMicrosaccades(dt) {
        // 1/f (pink) noise for microsaccadic jitter
        // This is what makes eyes look ALIVE
        const t = performance.now() / 1000;
        const noiseX = pinkNoise1D(t * 1.5, 500, 3, 0.5) * 0.02;
        const noiseY = pinkNoise1D(t * 1.2, 501, 3, 0.5) * 0.015;

        // Spring-damped application (prevents jerkiness)
        const rx = springDamperExact(this.gazeOffset.x, this.gazeVelocity.x, noiseX, 0.05, dt);
        const ry = springDamperExact(this.gazeOffset.y, this.gazeVelocity.y, noiseY, 0.05, dt);
        this.gazeOffset.x = rx.x; this.gazeVelocity.x = rx.v;
        this.gazeOffset.y = ry.x; this.gazeVelocity.y = ry.v;
    }

    _updateSaccades(dt) {
        this.saccadeTimer -= dt;
        if (this.saccadeTimer <= 0) {
            // Generate new saccade target (small random gaze shift)
            this.saccadeTarget.x = (Math.random() - 0.5) * 0.1;
            this.saccadeTarget.y = (Math.random() - 0.5) * 0.06;
            this.nextSaccadeTime = 0.2 + Math.random() * 1.5; // 0.2-1.7s between saccades
            this.saccadeTimer = this.nextSaccadeTime;
        }
    }

    _updateBlinks(dt) {
        if (this.blinkProgress >= 0) {
            // Blink in progress
            this.blinkProgress += dt / this.blinkDuration;
            if (this.blinkProgress >= 1.0) {
                this.blinkProgress = -1;
            }
        } else {
            // Count down to next blink
            this.blinkTimer += dt;
            if (this.blinkTimer >= this.nextBlinkTime) {
                this.blinkProgress = 0;
                this.blinkTimer = 0;
                this.nextBlinkTime = this._randomBlinkInterval();
                this.blinkDuration = 0.15 + Math.random() * 0.15; // 150-300ms

                // Emotional blink duration modification
                if (this.emotion === 'sleepy') this.blinkDuration *= 2.0;
                if (this.emotion === 'nervous') this.blinkDuration *= 0.6;
            }
        }
    }

    _updatePupilDilation(dt) {
        // Pupil dilation changes slowly (autonomic response, 1-3 second timescale)
        this.pupilDilation += (this.targetPupilDilation - this.pupilDilation)
            * (1 - Math.exp(-dt * 0.5));
    }

    _randomBlinkInterval() {
        // Base: 3-5 seconds between blinks (15-20 blinks/min)
        const emotionRates = {
            neutral: 4.0, calm: 5.0, happy: 3.5, excited: 2.5,
            sad: 4.5, angry: 2.8, surprised: 6.0, // Suppressed after surprise
            scared: 2.0, nervous: 1.5, sleepy: 3.0, loving: 4.0
        };
        const base = emotionRates[this.emotion] ?? 4.0;
        return base + (Math.random() - 0.5) * base * 0.5; // +/- 25% variation
    }

    _applyToVRM() {
        const expr = this.vrm.expressionManager;
        if (!expr) return;

        // Apply gaze offset + saccade as expression weights
        const totalX = this.gazeOffset.x + this.saccadeTarget.x;
        const totalY = this.gazeOffset.y + this.saccadeTarget.y;

        // Convert to VRM lookLeft/lookRight/lookUp/lookDown
        // These are 0-1 weights, not angles
        if (totalX > 0) {
            expr.setValue('lookRight', Math.min(1, totalX));
            expr.setValue('lookLeft', 0);
        } else {
            expr.setValue('lookLeft', Math.min(1, -totalX));
            expr.setValue('lookRight', 0);
        }
        if (totalY > 0) {
            expr.setValue('lookUp', Math.min(1, totalY));
            expr.setValue('lookDown', 0);
        } else {
            expr.setValue('lookDown', Math.min(1, -totalY));
            expr.setValue('lookUp', 0);
        }

        // Apply blink
        if (this.blinkProgress >= 0) {
            const openness = blinkCurve(this.blinkProgress);
            expr.setValue('blink', 1.0 - openness);
        } else {
            expr.setValue('blink', 0);
        }
    }
}
```

### The Uncanny Valley of Eye Movement

Research (NSF Award #1423189, "Looking Across the Uncanny Valley") identifies these specific failures that trigger uncanniness:

| Failure | Uncanny Effect | Fix |
|---------|---------------|-----|
| Perfectly still eyes during fixation | "Dead stare" | Add microsaccadic jitter (1-3 Hz pink noise) |
| Linear interpolation for gaze shift | "Robotic tracking" | Use ballistic saccade profile (fast start, abrupt stop) |
| Symmetric blinks | "Mechanical" | Asymmetric blink curve (fast close, slow open) |
| No blink rate variation | "Automaton" | Emotion-modulated blink intervals |
| Eyes move independently of head | "Uncoupled doll" | Coordinate with VRMLookAt (eyes lead, head follows) |
| Same pupil size always | "Lifeless" | Emotion-driven pupil dilation |
| No vergence on near objects | "Cross-eyed or wall-eyed" | Minor inward rotation for near focus |

### Pupil Dilation Research

Pupil dilation is controlled by the autonomic nervous system:
- **Sympathetic activation** (arousal, fight-or-flight) -> dilation (mydriasis)
- **Parasympathetic activation** (rest, calm) -> constriction (miosis)

Changes are small (0.5-1.5mm from a baseline of ~3-4mm diameter) but measurable with pupillometry. In animation, we exaggerate for readability:

| Emotional State | Pupil Size (relative) | Mechanism |
|----------------|----------------------|-----------|
| Calm/neutral | 0.5 (baseline) | Parasympathetic dominant |
| Interest/attraction | 0.65-0.75 | Sympathetic arousal |
| Love/desire | 0.7-0.8 | Strong sympathetic response |
| Fear/surprise | 0.8-0.9 | Fight-or-flight activation |
| Anger | 0.65-0.75 | Moderate sympathetic |
| Sadness | 0.4-0.5 | Mixed autonomic state |
| Drowsiness | 0.3-0.4 | Parasympathetic dominant, reduced alertness |
| Excitement | 0.7-0.85 | High sympathetic activation |
| Darkness (environmental) | 0.8-0.9 | Light reflex (separate system) |

### Performance

- Microsaccade noise: ~0.01ms/frame (reuses pinkNoise1D)
- Blink state machine: ~0.001ms/frame
- Expression setValue calls: 6 per frame (already batched)
- **Total budget:** <0.02ms/frame

### References

- NSF "Looking Across the Uncanny Valley" -- https://www.nsf.gov/awardsearch/showAward?AWD_ID=1423189
- Springer "Eye Animation" -- https://link.springer.com/10.1007/978-3-319-30808-1_3-1
- Tobii "Types of Eye Movements" -- https://www.tobii.com/resource-center/learn-articles/types-of-eye-movements
- Keith Lango "Saccadic Eye Movement" -- http://keithlango.blogspot.com/2005/12/saccadic-eye-movement.html
- PMC "Microsaccade Characteristics" -- https://pmc.ncbi.nlm.nih.gov/articles/PMC5859063/
- PMC "Pupil as Measure of Emotional Arousal" -- https://pmc.ncbi.nlm.nih.gov/articles/PMC3612940/
- Tobii "Blinks in Eye Tracking" -- https://www.tobii.com/resource-center/learn-articles/blinks-a-hidden-gem-in-eye-tracking-research
- Scientific American "Eye-Opener: Pupils and Emotions" -- https://www.scientificamerican.com/article/eye-opener-why-do-pupils-dialate/

---

