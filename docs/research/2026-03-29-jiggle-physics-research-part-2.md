> **This is Part 2 of 3.** See also: [Part 1](2026-03-29-jiggle-physics-research-part-1.md), [Part 3](2026-03-29-jiggle-physics-research-part-3.md)

## 7. Content Controls

### User-Facing Configuration UI

```
┌─── Jiggle Physics Settings ──────────────────────┐
│                                                    │
│  [ ] Enable Jiggle Physics          [Master Toggle]│
│                                                    │
│  Intensity: ──*────────────── [Natural]            │
│              Subtle  Natural  Bouncy  Extreme      │
│                                                    │
│  > Advanced Settings                               │
│    |-- Breast Physics   ──*──────── [0.65]         │
│    |-- Butt Physics     ──*──────── [0.40]         │
│    +-- Thigh Physics    ────*────── [0.20]         │
│                                                    │
│  > Per-Character Override                          │
│    |-- [Dae]    Use Global v                       │
│    |-- [Alana]  Custom: Subtle v                   │
│    +-- [Luna]   Custom: Bouncy v                   │
│                                                    │
│  > Behavior                                        │
│    |-- [ ] Respond to movement                     │
│    |-- [ ] Respond to breathing                    │
│    |-- [ ] Respond to emotions                     │
│    +-- [ ] Respond to touch (requires touch module)│
│                                                    │
│  > Physics Quality                                 │
│    |-- Update Rate: [60Hz v]                       │
│    |-- Collider Detail: [Normal v]                 │
│    +-- [ ] Enable asymmetric L/R randomization     │
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
        stiffnessMultiplier: 1.0 + (1.0 - intensity) * 1.5,   // 0->2.5, 1->1.0
        gravityMultiplier:   0.1 + intensity * 0.9,             // 0->0.1, 1->1.0
        dragMultiplier:      0.8 - intensity * 0.6,             // 0->0.8, 1->0.2
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
| **Aroused** | 1.3x intensity, heavy breathing | Amplified breathing cycle |
| **Nervous** | 0.9x intensity, jittery | Small, quick, irregular motions |
| **Confident** | 1.1x intensity, deliberate | Controlled but visible |
| **Sad/Crying** | 0.7x intensity, sobbing bursts | Periodic sharp jolts from sobs |

This integrates naturally with our existing `MoodEngine` — the mood state can feed a multiplier into the jiggle physics system each frame.

### Settings Persistence

```sql
-- Schema addition for jiggle physics settings
CREATE TABLE IF NOT EXISTS jiggle_settings (
    id INTEGER PRIMARY KEY,
    character_id INTEGER REFERENCES characters(id),
    enabled INTEGER DEFAULT 1,
    intensity REAL DEFAULT 0.5,
    breast_intensity REAL DEFAULT 0.65,
    butt_intensity REAL DEFAULT 0.40,
    thigh_intensity REAL DEFAULT 0.20,
    respond_to_movement INTEGER DEFAULT 1,
    respond_to_breathing INTEGER DEFAULT 1,
    respond_to_emotions INTEGER DEFAULT 1,
    respond_to_touch INTEGER DEFAULT 0,
    asymmetric_randomization INTEGER DEFAULT 1,
    preset TEXT DEFAULT 'natural',
    update_rate INTEGER DEFAULT 60,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

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

## 9. MMD Physics System Deep Dive

### How MikuMikuDance Handles Breast Physics

MMD (MikuMikuDance) uses the **Bullet Physics Engine** for all secondary motion, including breast physics. Unlike VRM's spring bone system (which is a simplified Verlet integrator), MMD uses full rigid body dynamics with joints (constraints) — a fundamentally different approach.

### PMX Rigid Body System

Each "physics object" in an MMD model is a rigid body with these properties:

| Property | Type | Description |
|----------|------|-------------|
| **Name** | string | e.g., `左胸` (left breast), `右胸` (right breast) |
| **Related Bone** | reference | The bone this rigid body follows/drives |
| **Shape** | enum | Sphere, Box, or Capsule |
| **Size** | vec3 | Dimensions of the collision shape |
| **Position** | vec3 | Offset from the related bone |
| **Rotation** | vec3 | Euler rotation offset |
| **Mass** | float | In kg-equivalent (affects inertia) |
| **Move Attenuation** | float | Linear damping (0-1) |
| **Rotation Attenuation** | float | Angular damping (0-1) |
| **Repel** (Restitution) | float | Bounciness on collision (keep < 0.05 for breasts) |
| **Friction** | float | Surface friction (0-1) |
| **Type** | enum | Bone (kinematic), Physics (dynamic), Physics+Bone (driven) |
| **Group** | int | Collision group number (1-16) |
| **Non-collision Group Mask** | bitmask | Which groups this body does NOT collide with |

### Breast Physics Setup in PMX

A standard MMD breast physics setup consists of:

```
Per breast:
├── 1 "Bone" type rigid body (attached to chest bone, kinematic anchor)
│   └── Shape: Sphere, radius ~0.3-0.5
│       Mass: 1.0 (irrelevant for kinematic)
│
├── 1 "Physics" type rigid body (the actual breast mass)
│   └── Shape: Sphere, radius ~0.5-0.8
│       Mass: 0.8 - 1.5
│       Move Attenuation: 0.85 - 0.95
│       Rotation Attenuation: 0.85 - 0.95
│       Repel: 0.0 - 0.05
│       Friction: 0.5
│
└── 1 Joint (constraint) connecting the two rigid bodies
    └── Rotation limits: X: -15 to 15 deg, Y: -10 to 10 deg, Z: -10 to 10 deg
        Position limits: all zero (no sliding, only rotation)
        Spring constants (rotation): 50 - 200 on each axis
        Spring constants (position): 0 on each axis
```

### PMX Joint (Constraint) Parameters

| Parameter | Range | Breast Typical | Description |
|-----------|-------|---------------|-------------|
| **Position Lower Limit** | vec3 | (0, 0, 0) | Minimum translation on each axis |
| **Position Upper Limit** | vec3 | (0, 0, 0) | Maximum translation (0 = locked) |
| **Rotation Lower Limit** | vec3 (degrees) | (-15, -10, -10) | Minimum rotation per axis |
| **Rotation Upper Limit** | vec3 (degrees) | (15, 10, 10) | Maximum rotation per axis |
| **Position Spring** | vec3 | (0, 0, 0) | Spring force for translation (usually 0 for breasts) |
| **Rotation Spring** | vec3 | (100, 100, 100) | Spring force pulling back to rest rotation |

**Critical tuning notes from MMD community:**
- **Repel (Restitution) is extremely sensitive.** Values above 0.05 cause violent oscillation. For breast physics, keep at 0.0-0.02.
- **Rotation spring constants** are the primary "jiggle feel" control. Higher = firmer, quicker settle. Lower = more wobble, slower settle.
  - Firm breasts: Spring 150-300
  - Natural breasts: Spring 50-150
  - Soft/bouncy breasts: Spring 10-50
- **Mass affects inertia** — heavier breasts swing more slowly but with more momentum. Typical range: 0.5-2.0.
- **Joint rotation limits** define the maximum displacement. For breasts:
  - Subtle: ±5-8 degrees
  - Normal: ±10-15 degrees
  - Extreme: ±20-30 degrees

### MMD vs VRM Physics: Architecture Comparison

| Aspect | MMD (Bullet) | VRM (Verlet Spring Bone) |
|--------|-------------|-------------------------|
| **Physics engine** | Full Bullet rigid body simulation | Simplified Verlet integration |
| **Collision detection** | GJK/EPA (convex shapes) | Sphere/capsule distance check |
| **Constraint solver** | Sequential impulse (multi-iteration) | None (direct position correction) |
| **Energy conservation** | Physics-accurate | Approximate (drag-based dissipation) |
| **Breast representation** | Rigid bodies + constraint joints | Bone chain with spring parameters |
| **Parameter count per breast** | ~20+ (mass, friction, restitution, limits, springs) | 5 (stiffness, gravity, drag, hitRadius, gravityDir) |
| **Setup complexity** | High (PMX Editor, per-body tuning) | Low (5 sliders per bone) |
| **Runtime cost** | High (Bullet solver iterations) | Very low (single Verlet step) |
| **Quality ceiling** | Higher (true physics) | Good enough for real-time 3D |
| **Web runtime** | Requires Ammo.js WASM (~300KB) | Built into @pixiv/three-vrm (~0KB extra) |

### Parameter Sharing Sites and Resources

The MMD community has extensive parameter databases:
- **BowlRoll** (bowlroll.net) — Japanese model sharing, many include physics presets
- **DeviantArt MMD community** — Tutorials on physics setup (Amenrenet's series is the most comprehensive)
- **Nico Nico Douga** — Video tutorials with downloadable presets
- **PMX Editor** built-in presets — Default physics templates for common body parts

### Three.js MMD Physics Runtime

Three.js includes `MMDPhysics.js` in its examples folder that wraps Ammo.js:
```javascript
import { MMDPhysics } from 'three/examples/jsm/animation/MMDPhysics.js';

const physics = new MMDPhysics(mesh, rigidBodies, constraints, {
    unitStep: 1 / 65,     // physics timestep
    maxStepNum: 3,         // max substeps per frame
    gravity: new THREE.Vector3(0, -9.8 * 10, 0),
});

// In animation loop:
physics.update(deltaTime);
```

**Why we do NOT use MMD physics:** It requires Ammo.js (300KB+ WASM), adds significant complexity, and VRM spring bones achieve 90% of the visual quality at 1% of the runtime cost. MMD physics is only relevant if we need to load PMX/PMD models directly.

---

## 10. VRChat PhysBone Complete Reference

### Overview

VRChat PhysBone is a custom spring-damper physics system that replaced Unity's DynamicBone in 2022. It is the most widely-used and best-documented character physics system in the VR avatar community. Understanding PhysBone deeply helps us translate community presets to VRM spring bone parameters.

### PhysBone Versions

| Version | Key Features |
|---------|-------------|
| **1.0** | Base system: Pull, Spring/Momentum+Stiffness, Gravity, Immobile, Colliders |
| **1.1** | Added Stretch & Squish: bones can elongate/compress based on motion or interaction |

### Integration Types

| Type | Parameters Exposed | Use Case |
|------|-------------------|----------|
| **Simplified** | Pull, Spring | Quick setup, fewer knobs |
| **Advanced** | Pull, Momentum, Stiffness | Fine control over oscillation behavior |

### Complete Parameter Reference

#### Forces

| Parameter | Range | Default | Description |
|-----------|-------|---------|-------------|
| **Pull** | 0.0 - 1.0 | 0.2 | Force returning bones to rest. 0 = no return force, 1 = instant snap-back |
| **Momentum** (Advanced) | 0.0 - 1.0 | 0.2 | Amount of wobble/overshoot when reaching rest. Higher = more oscillation |
| **Stiffness** (Advanced) | 0.0 - 1.0 | 0.2 | Resistance to staying at current orientation. Higher = less movement |
| **Spring** (Simplified) | 0.0 - 1.0 | 0.2 | Combined momentum+stiffness in one slider |
| **Gravity** | -1.0 - 1.0 | 0.0 | Gravity influence. In v1.0: force competing with other settings. In v1.1: ratio of final rest angle |
| **Gravity Falloff** | 0.0 - 1.0 | — | How quickly gravity diminishes along the chain |

#### Immobile

| Parameter | Options | Description |
|-----------|---------|-------------|
| **Immobile Type** | All Motion / World | All Motion: reduces all detected motion. World: only reduces motion detected in world space |
| **Immobile** | 0.0 - 1.0 | How much motion is reduced. 1.0 = bone doesn't respond to body movement at all |

#### Limits

| Parameter | Description |
|-----------|-------------|
| **Limit Type** | None / Angle / Hinge / Polar |
| **Max Angle (Angle)** | Maximum angle from rest, in degrees (0-180) |
| **Max Angle (Hinge)** | Maximum hinge rotation |
| **Max Pitch/Yaw (Polar)** | Separate pitch and yaw limits |

#### Stretch & Squish (v1.1)

| Parameter | Range | Description |
|-----------|-------|-------------|
| **Stretch Motion** | 0.0 - 1.0 | How much motion affects stretch/squish calculation. 0 = only grab/collision, 1 = all motion |
| **Max Stretch** | 0.0+ | Maximum bone elongation as multiple of original length (e.g., 0.5 = 50% longer) |
| **Max Squish** | 0.0 - 1.0 | Maximum bone compression as multiple of original length (1.0 = can compress to zero) |

#### Grab & Pose

| Parameter | Description |
|-----------|-------------|
| **Allow Grabbing** | Players can grab and move the bone chain |
| **Allow Posing** | Grabbed bones stay in place when released |
| **Grab Movement** | How easily grabbed bones move (0 = rigid, 1 = fully follows hand) |
| **Snap To Hand** | Whether grabbed bone snaps to hand position |

#### Collision

| Parameter | Description |
|-----------|-------------|
| **Radius** | Collision sphere radius around the bone |
| **Radius Curve** | Modifies radius along the bone chain (AnimationCurve) |
| **Colliders** | List of PhysBone Colliders that interact with this chain |
| **Endpoint Position** | Offset for creating an invisible end bone |

#### Animator Parameters

When the `Parameter` field is set, VRChat exposes these animator parameters:

| Suffix | Type | Description |
|--------|------|-------------|
| `_IsGrabbed` | Bool | Currently being grabbed by a player |
| `_IsPosed` | Bool | Currently in a posed (frozen) state |
| `_Angle` | Float (0-1) | Normalized angle from rest position (0 = rest, 1 = max limit) |
| `_Stretch` | Float (0-1) | Normalized stretch amount (0 = default or shorter, 1 = Max Stretch) |
| `_Squish` | Float (0-1) | Normalized squish amount (0 = default or longer, 1 = zero length) |

### Community Breast Presets (PhysBone)

| Preset | Pull | Momentum | Stiffness | Gravity | Limit Type | Max Angle | Stretch | Squish |
|--------|------|----------|-----------|---------|------------|-----------|---------|--------|
| **Very Soft** | 0.05 | 0.50 | 0.05 | 0.30 | Angle | 45 | 0.3 | 0.2 |
| **Soft** | 0.10 | 0.35 | 0.10 | 0.20 | Angle | 35 | 0.2 | 0.15 |
| **Normal** | 0.20 | 0.20 | 0.20 | 0.10 | Angle | 25 | 0.1 | 0.1 |
| **Firm** | 0.35 | 0.15 | 0.35 | 0.05 | Angle | 15 | 0.05 | 0.05 |
| **Very Firm** | 0.50 | 0.10 | 0.50 | 0.02 | Angle | 10 | 0.02 | 0.02 |

### PhysBone → VRM Spring Bone Translation Table

| Preset | PB Pull | PB Momentum | PB Stiffness | PB Gravity | → VRM Stiffness | → VRM Drag | → VRM Gravity |
|--------|---------|-------------|-------------|------------|-----------------|-----------|---------------|
| Very Soft | 0.05 | 0.50 | 0.05 | 0.30 | 0.15 | 0.10 | 0.80 |
| Soft | 0.10 | 0.35 | 0.10 | 0.20 | 0.30 | 0.20 | 0.65 |
| Normal | 0.20 | 0.20 | 0.20 | 0.10 | 0.50 | 0.30 | 0.50 |
| Firm | 0.35 | 0.15 | 0.35 | 0.05 | 0.80 | 0.45 | 0.35 |
| Very Firm | 0.50 | 0.10 | 0.50 | 0.02 | 1.20 | 0.60 | 0.20 |

**Conversion formula (approximate):**
```javascript
/**
 * Converts VRChat PhysBone parameters to VRM Spring Bone parameters.
 * This is an empirical approximation — visual tuning may be needed.
 *
 * @param pb - PhysBone parameters object
 * @returns VRM Spring Bone settings object
 */
function physBoneToVRM(pb) {
    return {
        stiffness: (pb.pull + pb.stiffness) * 1.2,
        dragForce: pb.pull * 0.8 + (1.0 - pb.momentum) * 0.3,
        gravityPower: pb.gravity * 2.5 + 0.1,
        gravityDir: new THREE.Vector3(0, -1, 0),
        hitRadius: 0.04,
    };
}
```

### Marshmallow PB (Community Tool)

[Marshmallow PB](https://wataame89.github.io/documents-marshmallowPB/en/setup/) is a popular community tool for VRChat that auto-configures PhysBone settings. Its approach to breast physics:
- Auto-detects breast bones by name pattern
- Applies presets based on bone chain length
- Adds appropriate colliders on torso
- Supports per-avatar adjustment via in-game menu
- "How to adjust" guide provides visual feedback for tuning

---

## 11. Breast Physics Math

### Spring-Mass-Damper Model

The fundamental mathematical model for breast jiggle is a **damped harmonic oscillator** (spring-mass-damper system):

```
F = -kx - bv + Fg + Fext

Where:
  F    = net force on the breast mass
  k    = spring constant (stiffness, N/m)
  x    = displacement from rest position (m)
  b    = damping coefficient (Ns/m)
  v    = velocity (m/s)
  Fg   = gravitational force component
  Fext = external forces (motion, impact, touch)
```

The second-order ODE:
```
m * x'' + b * x' + k * x = Fg + Fext

Where:
  m    = effective mass of the breast
  x''  = acceleration
  x'   = velocity
  x    = displacement
```

### Natural Frequency and Damping Ratio

The natural frequency (undamped) of the oscillator:
```
omega_n = sqrt(k / m)
f_n = omega_n / (2 * pi)
```

The damping ratio:
```
zeta = b / (2 * sqrt(k * m))

zeta < 1: underdamped (oscillates) — this is what we want for jiggle
zeta = 1: critically damped (no oscillation, quickest return to rest)
zeta > 1: overdamped (slow return, no oscillation)
```

**Target damping ratios for breast physics:**

| Style | Damping Ratio (zeta) | Oscillation Count | Feel |
|-------|---------------------|-------------------|------|
| Realistic | 0.3 - 0.5 | 2-3 | Quick settle, subtle |
| Anime Natural | 0.15 - 0.3 | 3-5 | Visible bounce, grounded |
| Anime Bouncy | 0.08 - 0.15 | 5-8 | Pronounced jiggle |
| Extreme | 0.03 - 0.08 | 8-15+ | Maximum wobble |

### Multi-Joint Chain Dynamics

For a 2-bone breast chain, the system becomes two coupled oscillators:

```
Joint 0 (root):
  m0 * x0'' + b0 * x0' + k0 * x0 - k1 * (x1 - x0) = F_ext0

Joint 1 (tip):
  m1 * x1'' + b1 * x1' + k1 * (x1 - x0) = Fg1 + F_ext1
```

This produces **two natural frequencies** (normal modes):
1. **In-phase mode:** Both joints move together (lower frequency, larger motion)
2. **Out-of-phase mode:** Joints move opposite (higher frequency, smaller motion)

The combination of these modes creates the characteristic "wave" motion of a jiggling breast — the base moves less and recovers first, while the tip continues oscillating.

**Mapping to VRM spring bone chain:**
- Joint 0 stiffness ≈ `k0` — controls the in-phase mode
- Joint 1 stiffness ≈ `k1` — controls the out-of-phase (tip wobble) mode
- Joint 0 drag ≈ `b0 / (2 * sqrt(k0 * m0))` — normalized damping ratio
- Joint 1 drag ≈ `b1 / (2 * sqrt(k1 * m1))` — normalized damping ratio

### Inertia Considerations for Soft Body

Real breast tissue is not a point mass — it has distributed mass and an inertia tensor. For a simplified ellipsoid model:

```
Breast modeled as half-ellipsoid:
  a = horizontal radius (e.g., 0.06m)
  b = vertical radius (e.g., 0.08m)
  c = depth (e.g., 0.07m)
  mass = density * (2/3) * pi * a * b * c

Inertia tensor (principal axes):
  Ixx = (1/5) * m * (b^2 + c^2)   // rotation around horizontal axis (bounce)
  Iyy = (1/5) * m * (a^2 + c^2)   // rotation around vertical axis (sway)
  Izz = (1/5) * m * (a^2 + b^2)   // rotation around depth axis (twist)
```

**For a "natural" breast size (approximately B-C cup):**
```
  a = 0.06m, b = 0.07m, c = 0.06m
  mass ≈ 0.4 kg (average single breast mass)
  Ixx ≈ 0.000680 kg*m^2
  Iyy ≈ 0.000576 kg*m^2
  Izz ≈ 0.000544 kg*m^2
```

The anisotropic inertia means the breast naturally oscillates at different frequencies in different directions:
- **Vertical bounce** (Ixx): Fastest axis (highest frequency) — ~2.5-3.5 Hz
- **Horizontal sway** (Iyy): Medium axis — ~3.0-4.0 Hz
- **Twist** (Izz): Fastest but smallest amplitude

### Gravity Projection onto Chest Normal

For realistic breast sag, gravity should be projected onto the chest surface normal, not just applied as a downward force:

```javascript
/**
 * Calculates the effective gravity vector for breast physics based on
 * the character's current chest orientation.
 *
 * When the character leans forward, breasts should hang forward (more gravity).
 * When lying on back, breasts should splay to the sides (less downward gravity).
 *
 * @param chestBone - Reference to the chest/upperChest bone
 * @returns Effective gravity direction vector (not normalized)
 */
function calculateBreastGravity(chestBone) {
    const worldGravity = new THREE.Vector3(0, -1, 0);

    // Get chest forward direction (normal to chest surface)
    const chestForward = new THREE.Vector3(0, 0, 1);
    chestForward.applyQuaternion(chestBone.getWorldQuaternion(new THREE.Quaternion()));

    // Project gravity onto chest tangent plane
    // This gives the "sliding" component of gravity along the chest
    const gravityOnChest = worldGravity.clone();
    const normalComponent = chestForward.clone().multiplyScalar(
        worldGravity.dot(chestForward)
    );
    gravityOnChest.sub(normalComponent);

    // Add a fraction of the normal component (tissue doesn't slide freely)
    gravityOnChest.add(normalComponent.multiplyScalar(0.3));

    return gravityOnChest;
}
```

### Biomechanical Reference Data

Research from biomechanics papers provides real-world breast oscillation data:

| Metric | Value | Source |
|--------|-------|--------|
| Natural frequency (free oscillation) | 2.5 - 4.5 Hz | Mills et al., 2015 |
| First 10 natural frequencies | 1.2 - 12.8 Hz | FEM models (ResearchGate) |
| Damping ratio (natural tissue) | 0.2 - 0.4 | Piecewise MSD model (2017) |
| Peak displacement during running | 5-15 cm (unsupported) | Biomechanics studies |
| Oscillation asymmetry (L vs R) | 5-20% difference typical | Motion capture studies |
| Settling time (after impact) | 0.3 - 0.8s | Depends on size/support |

**Key biomechanical insight:** Real breast tissue exhibits **piecewise** spring-damper behavior — the spring constant is different in compression vs extension. The spring constant above the equilibrium position (extension) is significantly smaller than below (compression). This means breasts bounce higher than they sag — and settle faster from compression.

To approximate this in VRM spring bone:
```javascript
/**
 * Applies asymmetric stiffness based on displacement direction.
 * Breasts bounce higher (lower stiffness upward) than they compress (higher stiffness downward).
 *
 * @param joint - VRM spring bone joint
 * @param displacement - Current displacement from rest (negative = below rest)
 */
function applyAsymmetricStiffness(joint, displacement) {
    const baseStiffness = joint.settings.stiffness;
    if (displacement < 0) {
        // Below rest position (compressed): stiffer
        joint.settings.stiffness = baseStiffness * 1.3;
    } else {
        // Above rest position (extended/bouncing up): softer
        joint.settings.stiffness = baseStiffness * 0.7;
    }
}
```

---

## 12. Butt and Thigh Physics

### Bone Setup Requirements

Butt and thigh physics bones are **not part of the standard VRM humanoid skeleton**. They must be:
1. Custom bones in the model (authored in Blender/VRoid)
2. Runtime-injected (like breast bone injection in Section 4)

### Butt Bone Hierarchy

```
Armature
└── Hips
    ├── Butt_L                    ← Spring bone root (left cheek)
    │   └── Butt_L_end            ← Spring bone tail
    ├── Butt_R                    ← Spring bone root (right cheek)
    │   └── Butt_R_end            ← Spring bone tail
    ├── Spine → Chest → ...
    ├── LeftUpperLeg
    │   ├── ThighJiggle_L         ← Spring bone root (left thigh)
    │   │   └── ThighJiggle_L_end ← Spring bone tail
    │   └── LeftLowerLeg → ...
    └── RightUpperLeg
        ├── ThighJiggle_R         ← Spring bone root (right thigh)
        │   └── ThighJiggle_R_end ← Spring bone tail
        └── RightLowerLeg → ...
```

### Butt Physics Characteristics

Butt physics differs from breast physics in several important ways:

| Characteristic | Breast | Butt |
|---------------|--------|------|
| **Range of motion** | Large (30-45 degrees) | Small (5-15 degrees) |
| **Primary axis** | Vertical (bounce) | Vertical + lateral (bounce + sway) |
| **Mass distribution** | Concentrated, pendular | Spread, cushion-like |
| **Gravity response** | Strong (hanging tissue) | Moderate (supported by pelvis) |
| **Movement trigger** | Any upper body motion | Walking, sitting, hip movement |
| **Collision concern** | Chest/arms | Legs (inner thigh), chair/surface |
| **Bone chain length** | 1-3 | 1 (sufficient for range) |

### Butt Physics Parameter Table

| Preset | Stiffness | Drag | Gravity | Hit Radius | Max Displacement (deg) |
|--------|-----------|------|---------|------------|----------------------|
| **Subtle** | 1.5 | 0.7 | 0.2 | 0.05 | 5 |
| **Natural** | 1.0 | 0.5 | 0.4 | 0.06 | 10 |
| **Bouncy** | 0.7 | 0.3 | 0.6 | 0.07 | 15 |
| **Extreme** | 0.4 | 0.2 | 0.7 | 0.08 | 20 |

### Sitting Detection

When a character sits, butt physics should change dramatically:

```javascript
/**
 * Adjusts butt physics parameters based on sitting state.
 * When sitting, butt cheeks compress and splay — physics should
 * be stiffer (less bounce) with outward gravity (spreading).
 *
 * @param isSitting - Whether the character is currently in a sitting pose
 * @param buttJointL - Left butt spring bone joint
 * @param buttJointR - Right butt spring bone joint
 */
function updateButtForSitting(isSitting, buttJointL, buttJointR) {
    if (isSitting) {
        // Sitting: stiffer, less gravity, slight outward spread
        buttJointL.settings.stiffness = 1.8;
        buttJointL.settings.gravityPower = 0.1;
        buttJointL.settings.gravityDir.set(-0.3, -0.2, -0.5);  // outward + back
        buttJointL.settings.dragForce = 0.7;

        buttJointR.settings.stiffness = 1.8;
        buttJointR.settings.gravityPower = 0.1;
        buttJointR.settings.gravityDir.set(0.3, -0.2, -0.5);   // mirror
        buttJointR.settings.dragForce = 0.7;
    } else {
        // Standing: normal butt physics
        buttJointL.settings.stiffness = 1.0;
        buttJointL.settings.gravityPower = 0.4;
        buttJointL.settings.gravityDir.set(0, -1, 0);
        buttJointL.settings.dragForce = 0.5;

        buttJointR.settings.stiffness = 1.0;
        buttJointR.settings.gravityPower = 0.4;
        buttJointR.settings.gravityDir.set(0, -1, 0);
        buttJointR.settings.dragForce = 0.5;
    }
}
```

**Sitting detection methods:**
1. **Animation name matching:** Check if current animation clip contains "sit", "chair", "bench", "couch"
2. **Hip height threshold:** If hips bone Y position drops below a threshold relative to feet, character is sitting
3. **Knee angle:** If both knee angles exceed 70 degrees, likely sitting
4. **Explicit state:** AnimationDirector can set a `isSitting` flag when playing sitting animations

### Walking Response (Butt)

During walking, butt cheeks alternate in a characteristic pattern:

```javascript
/**
 * Applies alternating butt physics response synchronized with walk cycle.
 * During a walk, the trailing leg's butt cheek lifts while the leading
 * leg's cheek drops — creating a natural swaying motion.
 *
 * @param walkPhase - Current walk cycle phase (0-1, 0.5 = mid-stride)
 * @param buttJointL - Left butt spring bone joint
 * @param buttJointR - Right butt spring bone joint
 */
function updateButtForWalking(walkPhase, buttJointL, buttJointR) {
    const leftPhase = Math.sin(walkPhase * Math.PI * 2);
    const rightPhase = Math.sin((walkPhase + 0.5) * Math.PI * 2);

    // Modulate gravity power based on which leg is stepping
    buttJointL.settings.gravityPower = 0.4 + leftPhase * 0.2;
    buttJointR.settings.gravityPower = 0.4 + rightPhase * 0.2;

    // Slight lateral sway
    buttJointL.settings.gravityDir.set(leftPhase * 0.1, -1, 0).normalize();
    buttJointR.settings.gravityDir.set(rightPhase * 0.1, -1, 0).normalize();
}
```

### Thigh Physics

Thigh jiggle is the most subtle of all body physics areas. It primarily responds to:
- Walking/running (rhythmic wobble on inner thigh)
- Sudden stops (inertial jiggle)
- Sitting/standing transitions (compression/expansion)

| Thigh Region | Stiffness | Drag | Gravity | Notes |
|-------------|-----------|------|---------|-------|
| **Inner thigh** | 1.5 | 0.6 | 0.20 | Most visible during walk |
| **Outer thigh** | 1.8 | 0.7 | 0.15 | Very subtle, prevents rigidity |
| **Front thigh** | 2.0 | 0.8 | 0.10 | Barely visible, muscle mass |
| **Back thigh** | 1.6 | 0.6 | 0.20 | Visible from behind |

### Collider Setup for Butt/Thigh

```
Collider Setup (butt + thigh):
├── Hip Center Sphere: radius 0.08-0.10
│   └── Prevents butt bones from clipping into pelvis
├── Left Upper Leg Capsule: radius 0.04, height 0.15
│   └── Prevents left thigh jiggle from clipping into leg
├── Right Upper Leg Capsule: radius 0.04, height 0.15
│   └── Prevents right thigh jiggle from clipping into leg
├── Left Inner Thigh Sphere: radius 0.03
│   └── Prevents L/R thigh bones from crossing midline
└── Right Inner Thigh Sphere: radius 0.03
    └── Mirror of left inner thigh
```

---

