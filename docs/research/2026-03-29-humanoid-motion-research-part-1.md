# Humanoid Motion Quality & Physics Research

> **This is Part 1 of 4.** See also: [Part 2](2026-03-29-humanoid-motion-research-part-2.md), [Part 3](2026-03-29-humanoid-motion-research-part-3.md), [Part 4](2026-03-29-humanoid-motion-research-part-4.md)


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
11. [Breathing System Deep Dive](#11-breathing-system-deep-dive) (Tier 1)
12. [Eye Animation System](#12-eye-animation-system) (Tier 1)
13. [Facial Micro-Expressions & FACS](#13-facial-micro-expressions--facs) (Tier 2)
14. [Hand and Finger Animation](#14-hand-and-finger-animation) (Tier 2)
15. [Animation State Machines](#15-animation-state-machines) (Tier 2)
16. [Performance Profiling Methodology](#16-performance-profiling-methodology) (Tier 1)
17. [Implementation Priority Matrix](#17-implementation-priority-matrix)
18. [RIKO Reference Analysis](#18-riko-reference-analysis)

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

#### A. Breathing Parameter Tables by Emotion

Current breathing uses a single noise frequency. Real breathing varies dramatically with emotional state:

| Emotion | Rate (Hz) | Chest Amp | Shoulder Amp | Hip Sink | Inhale:Exhale Ratio | Pattern |
|---------|-----------|-----------|-------------|----------|-------------------|---------|
| Calm/Neutral | 0.25 | 0.020 | 0.010 | 0.002 | 1:1.5 | Smooth sinusoidal |
| Happy/Excited | 0.35 | 0.030 | 0.018 | 0.003 | 1:1 | Quick inhale, bouncy |
| Sad/Depressed | 0.18 | 0.035 | 0.008 | 0.004 | 1:2.5 | Long exhale, sighing |
| Angry | 0.40 | 0.040 | 0.025 | 0.005 | 1:0.8 | Sharp inhale, forced exhale |
| Anxious | 0.50 | 0.025 | 0.020 | 0.002 | 1:0.6 | Rapid, shallow, chest-dominant |
| Sleepy | 0.15 | 0.040 | 0.005 | 0.006 | 1:3.0 | Deep, very slow, belly-dominant |
| Surprised | 0.60* | 0.050 | 0.030 | 0.005 | gasp | Sharp inhale, hold, slow release |
| Embarrassed | 0.38 | 0.028 | 0.015 | 0.003 | 1:1.2 | Slightly rapid, uneven |
| Loving | 0.22 | 0.032 | 0.012 | 0.003 | 1:2.0 | Deep, contented sighs |

*Surprised: initial 0.6Hz gasp then settling to 0.3Hz over 2 seconds

**Implementation with smooth transitions:**
```javascript
// Emotion-driven breathing parameter interpolation
const BREATH_PARAMS = {
    calm:      { rate: 0.25, chestAmp: 0.020, shoulderAmp: 0.010, hipSink: 0.002, ratio: 1.5 },
    happy:     { rate: 0.35, chestAmp: 0.030, shoulderAmp: 0.018, hipSink: 0.003, ratio: 1.0 },
    sad:       { rate: 0.18, chestAmp: 0.035, shoulderAmp: 0.008, hipSink: 0.004, ratio: 2.5 },
    angry:     { rate: 0.40, chestAmp: 0.040, shoulderAmp: 0.025, hipSink: 0.005, ratio: 0.8 },
    anxious:   { rate: 0.50, chestAmp: 0.025, shoulderAmp: 0.020, hipSink: 0.002, ratio: 0.6 },
    sleepy:    { rate: 0.15, chestAmp: 0.040, shoulderAmp: 0.005, hipSink: 0.006, ratio: 3.0 },
    surprised: { rate: 0.60, chestAmp: 0.050, shoulderAmp: 0.030, hipSink: 0.005, ratio: 0.3 },
    loving:    { rate: 0.22, chestAmp: 0.032, shoulderAmp: 0.012, hipSink: 0.003, ratio: 2.0 },
};

class BreathingSystem {
    constructor() {
        this.currentParams = { ...BREATH_PARAMS.calm };
        this.targetParams = { ...BREATH_PARAMS.calm };
        this.phase = 0; // 0..2*PI breathing cycle
        this.transitionSpeed = 2.0; // seconds to transition between emotions
    }

    setEmotion(emotion) {
        this.targetParams = BREATH_PARAMS[emotion] || BREATH_PARAMS.calm;
    }

    update(dt) {
        // Smoothly interpolate all breathing parameters
        for (const key of Object.keys(this.currentParams)) {
            this.currentParams[key] += (this.targetParams[key] - this.currentParams[key])
                * (1 - Math.exp(-dt / this.transitionSpeed));
        }

        // Asymmetric breathing waveform: inhale shorter than exhale
        const ratio = this.currentParams.ratio;
        this.phase += dt * this.currentParams.rate * Math.PI * 2;
        if (this.phase > Math.PI * 2) this.phase -= Math.PI * 2;

        // Asymmetric waveform using power curve
        // ratio > 1 = longer exhale, ratio < 1 = longer inhale
        const rawBreath = Math.sin(this.phase);
        const breath = rawBreath >= 0
            ? Math.pow(rawBreath, 1.0 / ratio)   // inhale: faster rise
            : -Math.pow(-rawBreath, ratio);        // exhale: slower fall

        return {
            chest:    breath * this.currentParams.chestAmp,
            shoulder: breath * this.currentParams.shoulderAmp,
            hipSink:  Math.max(0, -breath) * this.currentParams.hipSink,
            isInhale: breath > 0,
            intensity: Math.abs(breath)
        };
    }
}
```

#### B. Weight Shifting with Biomechanical Math

Current `weight_shift` fidget uses simple sine on hips. Real weight shifting is a complex kinematic chain:

```
Biomechanical weight shift sequence:
1. Hip TRANSLATES laterally (not just rotates)
2. Supporting leg straightens slightly
3. Non-supporting leg relaxes (knee bends)
4. Spine counter-curves in S-shape (contrapossto)
5. Head stays level (vestibulo-ocular reflex)
6. Shoulders tilt opposite to hips (counter-rotation)
7. Arms swing/hang differently per side
```

**Full weight shift with lateral translation and contraposto:**
```javascript
/**
 * Biomechanically accurate weight shift.
 * Models the full kinematic chain from feet through spine to head.
 *
 * The contraposto (S-curve) is the key to natural standing poses --
 * every Renaissance sculptor knew this. The hips and shoulders
 * tilt in OPPOSITE directions, with the spine creating an S-curve.
 *
 * @param {number} t - Current time
 * @param {number} seed - Noise seed for this character
 * @returns {Object} Bone rotation/position deltas
 */
function calculateWeightShift(t, seed) {
    // Very slow oscillation -- humans shift weight every 5-15 seconds
    const phase = noise1D(t * 0.12, seed + 20);
    const side = phase;  // -1 = weight left, +1 = weight right

    // Lateral hip translation: ~2-4cm in real humans, scaled to model units
    const hipLateral = side * 0.030;

    // Hip tilt: weight-bearing side drops slightly
    const hipTilt = side * 0.035;

    // Spine S-curve: each vertebral segment counter-rotates
    // The math: each segment rotates proportional to its distance from hips
    // but in the OPPOSITE direction, creating the S-curve
    const spineCounter = -side * 0.025;
    const chestCounter = -side * 0.020;
    const neckCompensate = -side * 0.015;

    // Head levels out (vestibulo-ocular reflex)
    // The head rotation cancels ALL the accumulated tilt below it
    const accumulatedTilt = hipTilt + spineCounter + chestCounter + neckCompensate;
    const headLevel = -accumulatedTilt * 0.85; // 85% compensation (not perfect = more natural)

    // Shoulder counter-tilt (opposite to hips)
    const shoulderTilt = -side * 0.020;

    // Leg relaxation: non-weight-bearing leg bends at knee
    const leftLegRelax = side > 0.2 ? (side - 0.2) * 0.06 : 0;
    const rightLegRelax = side < -0.2 ? (-side - 0.2) * 0.06 : 0;

    // Foot: non-weight foot rotates outward slightly
    const leftFootOut = side > 0.2 ? (side - 0.2) * 0.04 : 0;
    const rightFootOut = side < -0.2 ? (-side - 0.2) * 0.04 : 0;

    return {
        hips: { px: hipLateral, rz: hipTilt },
        spine: { rz: spineCounter },
        chest: { rz: chestCounter },
        neck: { rz: neckCompensate },
        head: { rz: headLevel },
        leftShoulder: { rz: shoulderTilt },
        rightShoulder: { rz: -shoulderTilt },
        leftUpperLeg: { rx: leftLegRelax, rz: leftFootOut },
        rightUpperLeg: { rx: rightLegRelax, rz: -rightFootOut },
        leftFoot: { ry: leftFootOut },
        rightFoot: { ry: -rightFootOut }
    };
}
```

#### C. Micro-Movement Noise Functions

Beyond the existing head micro-drift, a full micro-movement system uses layered noise at different frequencies to create organic, non-repeating motion. The key insight is that biological systems exhibit **1/f noise** (pink noise) -- lower frequencies have higher amplitude, higher frequencies have lower amplitude.

```javascript
/**
 * Multi-octave 1/f noise for organic micro-movements.
 * Combines multiple noise frequencies where amplitude scales inversely
 * with frequency, producing biologically realistic motion.
 *
 * Pink noise (1/f) is found in heart rate variability, neural firing,
 * postural sway, and eye movement -- it's the signature of living systems.
 *
 * @param {number} t - Time
 * @param {number} seed - Per-bone seed
 * @param {number} octaves - Number of noise layers (3-5 recommended)
 * @param {number} persistence - Amplitude falloff per octave (0.4-0.6 for pink)
 * @returns {number} Noise value in approximately [-1, 1]
 */
function pinkNoise1D(t, seed, octaves = 4, persistence = 0.5) {
    let value = 0;
    let amplitude = 1.0;
    let frequency = 1.0;
    let maxValue = 0;

    for (let i = 0; i < octaves; i++) {
        value += noise1D(t * frequency, seed + i * 100) * amplitude;
        maxValue += amplitude;
        amplitude *= persistence;
        frequency *= 2.0;
    }

    return value / maxValue;
}

/**
 * Micro-movement configuration per body part.
 * Each entry defines the noise characteristics for one bone channel.
 *
 * Design principle: distal bones (fingers, head) have higher frequency
 * micro-movements than proximal bones (hips, spine). This matches
 * biological observation -- extremities have more neural noise.
 */
const MICRO_MOVEMENTS = {
    // Head: most visible, highest priority
    head: {
        rx: { baseFreq: 0.3, amplitude: 0.008, octaves: 4 },  // Nod
        ry: { baseFreq: 0.25, amplitude: 0.012, octaves: 4 },  // Turn
        rz: { baseFreq: 0.15, amplitude: 0.005, octaves: 3 },  // Tilt
    },
    // Spine: slow, subtle
    spine: {
        rx: { baseFreq: 0.08, amplitude: 0.004, octaves: 3 },
        rz: { baseFreq: 0.06, amplitude: 0.003, octaves: 3 },
    },
    // Chest: breathing + micro sway
    chest: {
        rx: { baseFreq: 0.10, amplitude: 0.005, octaves: 3 },
        rz: { baseFreq: 0.07, amplitude: 0.003, octaves: 3 },
    },
    // Shoulders: asymmetric, independent
    leftShoulder: {
        rz: { baseFreq: 0.12, amplitude: 0.006, octaves: 3 },
    },
    rightShoulder: {
        rz: { baseFreq: 0.11, amplitude: 0.005, octaves: 3 }, // Slightly different = asymmetry
    },
    // Neck
    neck: {
        rx: { baseFreq: 0.20, amplitude: 0.006, octaves: 3 },
        ry: { baseFreq: 0.18, amplitude: 0.008, octaves: 3 },
    },
};

/**
 * Apply all micro-movements to the skeleton.
 * Call once per frame after other layers but before spring settling.
 */
function applyMicroMovements(vrm, t) {
    for (const [boneName, channels] of Object.entries(MICRO_MOVEMENTS)) {
        const bone = vrm.humanoid.getNormalizedBoneNode(boneName);
        if (!bone) continue;

        for (const [axis, cfg] of Object.entries(channels)) {
            const noise = pinkNoise1D(
                t * cfg.baseFreq,
                hashString(boneName + axis),
                cfg.octaves
            );
            // Apply as additive rotation
            bone.rotation[axis.slice(1)] += noise * cfg.amplitude;
        }
    }
}
```

| Movement | Bones | Frequency | Amplitude | Notes |
|----------|-------|-----------|-----------|-------|
| Eye drift | Expression blendshapes | 0.3-0.8 Hz | lookLeft/Right 0.0-0.15 | Saccade-like (see Section 12) |
| Finger curl variance | Hand bones | 0.1-0.2 Hz | rotation.x 0.0-0.1 | If hand bones exist |
| Toe grip | Foot bones | 0.05 Hz | rotation.x 0.0-0.05 | Very subtle |
| Jaw micro-open | Expression | 0.15 Hz | aa blendshape 0.0-0.03 | Breathing jaw |
| Brow micro-drift | Expression | 0.08 Hz | browUp 0.0-0.02 | Thinking |
| Postural sway | Hips position | 0.05-0.1 Hz | position.x/z 0.001-0.005 | Standing balance |
| Wrist rotation | Hand bones | 0.08 Hz | rotation.y 0.0-0.03 | Relaxed wrist drift |

### Open-Source References

| Project | URL | Relevance |
|---------|-----|-----------|
| three-vrm examples | https://pixiv.github.io/three-vrm/packages/three-vrm/examples/ | Official VRM idle demos |
| human-three-vrm | https://github.com/vladmandic/human-three-vrm | Realtime VRM avatar animation |
| Codrops interactive char | https://tympanus.net/codrops/2019/10/14/how-to-create-an-interactive-3d-character-with-three-js/ | Mouse-following idle |

### Performance Notes

- noise1D() is already optimized (quintic smoothstep, no trig beyond hash)
- pinkNoise1D() with 4 octaves: ~4x cost of noise1D() but still <0.001ms per call
- Adding 8-12 more bone channels to BasePoseLayer: ~0.03ms/frame additional
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

### Mathematical Foundation: Spring-Damper Systems

A spring-damper system is described by the second-order ODE:

```
m*x'' + d*x' + s*(x - g) = 0
```

Where:
- `m` = mass (usually normalized to 1)
- `d` = damping coefficient
- `s` = stiffness (spring constant)
- `g` = goal position
- `x` = current position
- `x'` = velocity
- `x''` = acceleration

Substituting `y = d/(2m)` (damping ratio) and `w = sqrt(s/m)` (natural frequency):

```
x'' + 2*y*x' + w^2*(x - g) = 0
```

The behavior depends on the discriminant `w^2 - y^2`:
- **Over-damped** (`y > w`): Exponential decay, no oscillation, slow approach
- **Critically damped** (`y = w`): Fastest approach without oscillation
- **Under-damped** (`y < w`): Oscillates around goal before settling

### Critically Damped Spring: Full Derivation

For the critically damped case (`y = w`), the characteristic equation has a repeated root `r = -y`, giving the general solution:

```
x(t) = (C1 + C2*t) * e^(-y*t) + goal
```

With initial conditions x(0) = x0, v(0) = v0:
```
C1 = x0 - goal
C2 = v0 + y*(x0 - goal)
```

Therefore:
```
x(t) = e^(-y*t) * ((x0 - goal) + (v0 + y*(x0 - goal))*t) + goal
v(t) = e^(-y*t) * (v0 - (v0 + y*(x0 - goal))*y*t)
```

Daniel Holden's insight (from Spring-Roll-Call) is to parameterize by **halflife** rather than damping/stiffness, because halflife has intuitive meaning ("how many seconds to reduce distance by half"):

```
y = (4 * ln(2)) / halflife
```

The factor of 4 comes from the fact that for a critically damped spring with no initial velocity, the envelope `e^(-y*t)` reaches half its initial value when `y*t = ln(2)`, but the `(1 + y*t)` term means the actual halflife is longer. The factor 4 corrects for this, giving a true perceptual halflife.

```javascript
/**
 * Critically damped spring -- reaches goal ASAP without oscillation.
 * Maintains velocity continuity across target changes.
 *
 * Mathematical basis:
 *   x'' + 2*y*x' + y^2*(x - g) = 0  (critically damped: w = y)
 *   Solution: x(t) = e^(-y*t) * (j0 + j1*t) + goal
 *   where j0 = x - goal, j1 = v + j0*y
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

### Under-Damped Spring: Full Derivation

For the under-damped case (`y < w`), the characteristic equation has complex roots `r = -y +/- i*wd` where `wd = sqrt(w^2 - y^2)` is the damped natural frequency. The solution is:

```
x(t) = e^(-y*t) * (A*cos(wd*t) + B*sin(wd*t)) + goal
```

With initial conditions:
```
A = x0 - goal
B = (v0 + y*A) / wd
```

This can be written in amplitude-phase form:
```
x(t) = J * e^(-y*t) * cos(wd*t + phi) + goal
where J = sqrt(A^2 + B^2), phi = atan2(-B, A)
```

```javascript
/**
 * Under-damped spring -- oscillates around goal before settling.
 * Produces natural overshoot-and-settle on transitions.
 *
 * Mathematical basis:
 *   x'' + d*x' + s*(x - g) = 0  where d^2/4 < s (under-damped)
 *   Solution: x(t) = J * e^(-y*t) * cos(wd*t + phi) + goal
 *
 * @param {number} x - Current value
 * @param {number} v - Current velocity
 * @param {number} goal - Target value
 * @param {number} frequency - Natural frequency (Hz, controls oscillation speed)
 * @param {number} halflife - Decay halflife (seconds, controls how fast oscillation dies)
 * @param {number} dt - Delta time
 * @returns {{x: number, v: number}}
 */
function springDamperUnder(x, v, goal, frequency, halflife, dt) {
    const d = (4.0 * 0.69314718056) / (halflife + 1e-5);
    const s = (2.0 * Math.PI * frequency) * (2.0 * Math.PI * frequency);
    const discrim = s - (d * d / 4.0);

    // Must be positive for under-damped
    if (discrim <= 0) {
        return springDamperExact(x, v, goal, halflife, dt);
    }

    const w = Math.sqrt(discrim);  // Damped natural frequency
    const y = d / 2.0;             // Decay rate

    // Convert to amplitude-phase form
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

### Over-Damped Spring: Completion for Reference

For completeness, the over-damped case (`y > w`):

```javascript
/**
 * Over-damped spring -- approaches goal without oscillation, slower than critical.
 * Useful for heavy, sluggish movements (sleepy, exhausted states).
 *
 * Solution has two real exponential terms with different decay rates.
 */
function springDamperOver(x, v, goal, frequency, halflife, dt) {
    const d = (4.0 * 0.69314718056) / (halflife + 1e-5);
    const s = (2.0 * Math.PI * frequency) * (2.0 * Math.PI * frequency);
    const y = d / 2.0;
    const discrim = y * y - s;

    if (discrim <= 0) {
        return springDamperExact(x, v, goal, halflife, dt);
    }

    const sqrtD = Math.sqrt(discrim);
    const r1 = -y + sqrtD;  // Slower decay
    const r2 = -y - sqrtD;  // Faster decay

    const j0 = x - goal;
    const C2 = (v - r1 * j0) / (r2 - r1);
    const C1 = j0 - C2;

    return {
        x: C1 * Math.exp(r1 * dt) + C2 * Math.exp(r2 * dt) + goal,
        v: C1 * r1 * Math.exp(r1 * dt) + C2 * r2 * Math.exp(r2 * dt)
    };
}
```

### Easing Curve Comparison

Visual description of how each easing method behaves when jumping from 0 to 1:

```
Position vs Time for "jump to target":

Linear:          /                Constant speed. Robotic. Abrupt start/stop.
                /
              /

Ease-Out:        ___________     Fast start, gentle landing. Like a ball
              /                   thrown upward. Most natural for "arriving."
             /
            /

Ease-In:                  /      Slow start, fast finish. Like a ball
                        /         dropping. Rarely natural for characters.
                      /
         ___________/

Ease-In-Out:     ____            Slow start, fast middle, slow end. Smooth
              /      \____        but feels "planned" -- less organic than
            /                     springs for character animation.

Exp Decay:       _____________   Instant response, infinite ease-out.
              /                   Never truly arrives (asymptotic). RIKO uses
             /                    this. Good but no velocity continuity.

Critical       _____________     Like exp decay but with velocity tracking.
Spring:     /                     No overshoot. Smooth target changes.
           /                      THE BEST general-purpose character easing.

Under-       _______________     Overshoots, oscillates, settles. Creates
Damped:   /\                      sense of WEIGHT and MOMENTUM. Best for
         /  \_/                   reactions and transitions.
        /

Over-         _______________    Slower than critical. Heavy, sluggish feel.
Damped:    /                      Good for exhausted/sleepy characters.
          /
         /
```

### Comparison Table

| Method | Velocity Continuity | Overshoot | Parameterization | Best For |
|--------|-------------------|-----------|-----------------|----------|
| Linear lerp | None | None | Duration | UI elements, NOT characters |
| CSS ease-out | None | None | Duration + curve | Web animations |
| Exp decay (`alpha`) | None (discontinuity) | None | Alpha (framerate-dependent!) | Simple prototypes |
| Exp decay (halflife) | None (discontinuity) | None | Halflife (framerate-independent) | RIKO-style quick & dirty |
| Critical spring | Yes | None | Halflife | Default character motion |
| Under-damped spring | Yes | Tunable | Frequency + halflife | Reactions, weight, settling |
| Over-damped spring | Yes | None | Frequency + halflife | Heavy/sluggish characters |

### Quaternion Spring (for bone rotations)

Applying springs to quaternions requires converting to scaled angle-axis:

```javascript
/**
 * Critically damped spring for quaternion rotations.
 * Uses scaled angle-axis representation to avoid gimbal/flipping issues.
 *
 * The key insight: you can't spring directly on quaternion components (w,x,y,z)
 * because they live on a 4D hypersphere. Instead, compute the "error" quaternion
 * (current * goal^-1), convert that to an angle-axis vector (which lives in
 * a tangent space), apply the spring there, then convert back.
 *
 * The scaled angle-axis representation encodes both the rotation axis and angle
 * in a single Vector3 where the magnitude IS the angle. This is equivalent to
 * the logarithmic map of SO(3).
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

    // Ensure shortest path (avoid spinning the long way around)
    if (diff.w < 0) { diff.x = -diff.x; diff.y = -diff.y; diff.z = -diff.z; diff.w = -diff.w; }

    // Quaternion to scaled angle-axis (logarithmic map)
    const halfAngle = Math.acos(Math.min(1.0, diff.w));
    const sinHalf = Math.sin(halfAngle);
    const j0 = sinHalf < 1e-5
        ? new THREE.Vector3(0, 0, 0)
        : new THREE.Vector3(diff.x, diff.y, diff.z).multiplyScalar(2.0 * halfAngle / sinHalf);

    const j1 = new THREE.Vector3().copy(v).addScaledVector(j0, y);
    const eydt = Math.exp(-y * dt);

    // New angle-axis (spring applied in tangent space)
    const newAxis = new THREE.Vector3()
        .copy(j0).addScaledVector(j1, dt).multiplyScalar(eydt);

    // Scaled angle-axis back to quaternion (exponential map)
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
/**
 * Inertialization: the gold standard for animation transitions.
 *
 * Traditional blending evaluates BOTH animations during the transition.
 * Inertialization evaluates ONLY the new animation and adds a decaying
 * offset -- it's cheaper AND looks better because it preserves the
 * character's momentum from the old animation.
 *
 * From: David Bollo, "Inertialization: High-Performance Animation
 * Transitions in 'Gears of War'" (GDC 2018)
 */
class InertializationBlender {
    constructor(allBoneNames) {
        this.boneNames = allBoneNames;
        this.offsets = new Map();
        this.active = false;
    }

    /**
     * Begin inertialization transition.
     * Captures the pose difference between old and new animations
     * at the exact moment of transition.
     */
    begin(mixer, oldAction, newAction, halflife = 0.15) {
        // Snapshot current pose (from old animation)
        const oldPose = this._capturePose(mixer);

        // Switch to new animation
        oldAction.stop();
        newAction.play();
        mixer.update(0); // Force one evaluation of new animation

        // Snapshot new pose
        const newPose = this._capturePose(mixer);

        // Store offsets: old - new (will be decayed to zero)
        for (const boneName of this.boneNames) {
            const oldQ = oldPose.get(boneName);
            const newQ = newPose.get(boneName);
            if (oldQ && newQ) {
                this.offsets.set(boneName, {
                    quat: new THREE.Quaternion().copy(oldQ)
                        .multiply(newQ.clone().invert()),
                    velocity: new THREE.Vector3(0, 0, 0),
                    halflife
                });
            }
        }
        this.active = true;
    }

    /**
     * Apply decaying offsets each frame.
     * Call AFTER mixer.update() but BEFORE vrm.update().
     */
    update(dt, vrm) {
        if (!this.active) return;

        let anyActive = false;
        const identityQuat = new THREE.Quaternion();

        for (const [boneName, offset] of this.offsets) {
            const result = springDamperQuaternion(
                offset.quat, offset.velocity, identityQuat,
                offset.halflife, dt
            );
            offset.quat = result.x;
            offset.velocity = result.v;

            // Apply decaying offset on top of new animation
            const bone = vrm.humanoid.getNormalizedBoneNode(boneName);
            if (bone) {
                bone.quaternion.premultiply(offset.quat);
            }

            // Check if this offset has decayed enough to stop
            const angle = 2 * Math.acos(Math.min(1, Math.abs(offset.quat.w)));
            if (angle > 0.001 || offset.velocity.length() > 0.001) {
                anyActive = true;
            }
        }

        if (!anyActive) {
            this.active = false;
            this.offsets.clear();
        }
    }

    _capturePose(mixer) {
        const pose = new Map();
        for (const boneName of this.boneNames) {
            // Find bone in scene graph
            const bone = mixer.getRoot().getObjectByName(boneName);
            if (bone) {
                pose.set(boneName, bone.quaternion.clone());
            }
        }
        return pose;
    }
}
```

### Allen Chou's Alternative Parameterization

Allen Chou (Game Math: Precise Control over Numeric Springing) parameterizes by **angular frequency** (omega) and **damping ratio** (zeta) instead of halflife:

```javascript
/**
 * Allen Chou's spring parameterization.
 * omega = angular frequency (radians/sec) -- controls speed
 * zeta = damping ratio -- 0=undamped, <1=underdamped, 1=critical, >1=overdamped
 *
 * Relationship to Holden's parameterization:
 *   halflife = ln(2) / (zeta * omega)  (for critical: zeta=1)
 *   omega = (4 * ln(2)) / halflife     (for critical: zeta=1)
 */
function springChou(x, v, goal, omega, zeta, dt) {
    const xDiff = x - goal;
    const exp = Math.exp(-zeta * omega * dt);

    if (zeta > 1.0) {
        // Over-damped
        const za = -omega * (zeta + Math.sqrt(zeta * zeta - 1));
        const zb = -omega * (zeta - Math.sqrt(zeta * zeta - 1));
        const ea = Math.exp(za * dt);
        const eb = Math.exp(zb * dt);
        const c1 = (v - xDiff * zb) / (za - zb);
        const c2 = xDiff - c1;
        return {
            x: goal + c1 * ea + c2 * eb,
            v: c1 * za * ea + c2 * zb * eb
        };
    } else if (zeta < 1.0) {
        // Under-damped
        const wd = omega * Math.sqrt(1 - zeta * zeta);
        const c = (v + zeta * omega * xDiff) / wd;
        return {
            x: goal + exp * (xDiff * Math.cos(wd * dt) + c * Math.sin(wd * dt)),
            v: -exp * ((xDiff * omega * zeta - c * wd) * Math.cos(wd * dt)
                     + (xDiff * wd + c * omega * zeta) * Math.sin(wd * dt))
        };
    } else {
        // Critically damped (zeta == 1)
        return {
            x: goal + exp * (xDiff + (v + omega * xDiff) * dt),
            v: exp * (v * (1 - omega * dt) - xDiff * omega * omega * dt)
        };
    }
}
```

### Ryan Juckett's Closed-Form Reference

Ryan Juckett (ryanjuckett.com/damped-springs) provides the most complete treatment, including:
- Semi-implicit Euler integration (for when exact solution has numerical issues)
- Per-frame damping ratio adaptation
- Clamped spring (with max velocity/displacement limits)
- Multi-dimensional spring with coupled axes

His key contribution is showing that the exact solution can have numerical precision issues when `y*dt` is very large (e.g., during frame spikes), and providing a stable fallback.

### Libraries

| Library | URL | Notes |
|---------|-----|-------|
| Spring-Roll-Call (reference) | https://daniel-holden.com/page/spring-roll-call | Daniel Holden's definitive guide |
| toqoz springs | https://toqoz.fyi/springs.html | Quaternion spring with shortest-path |
| Motion (JS) | https://motion.dev/ | Spring animations for DOM/Three.js |
| Allen Chou's springs | https://allenchou.net/2015/04/game-math-precise-control-over-numeric-springing/ | Closed-form spring with frequency/damping ratio |
| Ryan Juckett's springs | https://www.ryanjuckett.com/damped-springs/ | C++ reference with all damping regimes |
| The Art of Damping | https://www.alexisbacot.com/blog/the-art-of-damping | Practical guide with interactive demos |

### Performance

- Spring evaluation per bone: ~0.001ms (just exp + 3 multiplies)
- 50 bones * spring: ~0.05ms/frame
- Quaternion spring is heavier (~0.003ms/bone) due to angle-axis conversion
- Inertialization adds ~0.002ms/bone during transitions (typically 0.1-0.3s)
- **Total budget:** <0.2ms/frame -- negligible

---

