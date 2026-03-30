# Jiggle Physics & Soft Body Dynamics Research

> **This is Part 1 of 3.** See also: [Part 2](2026-03-29-jiggle-physics-research-part-2.md), [Part 3](2026-03-29-jiggle-physics-research-part-3.md)


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
9. [MMD Physics System Deep Dive](#9-mmd-physics-system-deep-dive)
10. [VRChat PhysBone Complete Reference](#10-vrchat-physbone-complete-reference)
11. [Breast Physics Math](#11-breast-physics-math)
12. [Butt and Thigh Physics](#12-butt-and-thigh-physics)
13. [Clothing Interaction & Layered Physics](#13-clothing-interaction--layered-physics)
14. [Body Type System](#14-body-type-system)
15. [Animation-Reactive Jiggle](#15-animation-reactive-jiggle)
16. [Comparison with Real Physics Engines](#16-comparison-with-real-physics-engines)
17. [Cultural Considerations](#17-cultural-considerations)
18. [Implementation Recommendation](#18-implementation-recommendation)

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

### Parameter Interaction Matrix

Understanding how parameters interact is critical for tuning. Each parameter does not operate in isolation:

| Stiffness | Drag | Gravity | Resulting Behavior |
|-----------|------|---------|-------------------|
| High (1.5+) | High (0.7+) | Low (0.2) | Barely moves, very firm tissue |
| High (1.5+) | Low (0.2) | High (0.8+) | Snaps back quickly after displacement, tight oscillation |
| Low (0.3) | High (0.7+) | High (0.8+) | Slow, heavy sag with minimal bounce-back |
| Low (0.3) | Low (0.2) | Low (0.3) | Floaty, weightless feel (unnatural for body) |
| Low (0.3) | Low (0.2) | High (0.8+) | Maximum jiggle — large swings with many oscillations |
| Med (0.8) | Med (0.4) | Med (0.5) | Natural balance — the sweet spot for most body types |
| Med (0.8) | High (0.6) | Med (0.5) | Slightly dampened natural — good for athletic body types |
| Low (0.5) | Low (0.3) | High (0.7) | Anime standard — noticeable bounce, quick recovery |

### How the Physics Works (Verlet Integration)

```
nextTailPosition = currentTail
    + (currentTail - prevTail) * (1.0 - dragForce)     // inertia
    + stiffnessForce * stiffness                         // return-to-rest
    + gravityDir * gravityPower                           // gravity
```

The system resolves collisions against sphere and capsule (VRM 1.0+) colliders after computing the new position.

**Verlet integration explained for body physics:**

The Verlet method is velocity-free — it tracks current and previous position rather than velocity. This has key advantages for jiggle physics:
1. **Implicit velocity:** `(currentTail - prevTail)` encodes velocity without storing it, making the system inherently stable
2. **Energy dissipation:** The `dragForce` multiplier on the inertia term ensures oscillations decay naturally
3. **Time-step independence (approximate):** Small variations in delta time don't cause explosions, critical for 60fps targets on variable hardware
4. **Collision resolution:** Post-step collision projection (push bones outside collider radius) integrates cleanly without destabilizing the simulation

**Why Verlet is ideal for breast physics specifically:**
- No velocity accumulation bugs (common in Euler integration) that cause "jello explosion"
- Natural energy loss means breasts settle to rest without requiring explicit damping curves
- Collision resolution is a simple projection — push the bone point outside the collider sphere/capsule
- Computationally trivial: 3 vector additions + 1 scalar multiply per joint per frame

### VRoid Studio Models — Pre-configured?

VRoid Studio models **can** export with breast spring bones, but:
- "Prevent excessive shaking during movement" is **ON by default** in VRoid's export settings
- This dampens physics aggressively — models may appear to have no breast physics until this is disabled
- VRoid exports breast bones under `Chest` → `Breast_L` / `Breast_R` with default spring bone parameters
- Parameters tend to be conservative (high stiffness, high drag) — need runtime adjustment for visible jiggle

**VRoid Default Spring Bone Parameters (approximate from inspection):**

| Parameter | VRoid Default | Our "Natural" Target | Notes |
|-----------|--------------|---------------------|-------|
| Stiffness | 1.5 - 2.0 | 0.8 | VRoid is very stiff by default |
| Drag | 0.6 - 0.8 | 0.4 | High drag kills bounce |
| Gravity Power | 0.1 - 0.3 | 0.5 | Very low gravity = no visible sag |
| Hit Radius | 0.02 | 0.04 - 0.05 | Small radius = frequent clipping |

**VRoid "Excessive Shaking Prevention" behavior:**
When enabled in VRoid's export dialog, this applies a `Center` bone reference that calculates spring bone movement relative to the character's center of mass rather than world space. The effect is that translational movement (walking, jumping) produces almost no spring bone response — only rotational changes trigger physics. For breast jiggle, this is undesirable because walk bounce and landing impact are key visual cues.

**Workaround:** At runtime, set the spring bone's `center` property to `null` to restore world-space physics calculation, then adjust stiffness/drag to taste.

### VRM 0.x vs 1.0 Spring Bone Differences

| Feature | VRM 0.x (`secondaryAnimation`) | VRM 1.0 (`VRMC_springBone`) |
|---------|------|------|
| Extension name | `secondaryAnimation.boneGroups` | `VRMC_springBone-1.0` |
| Collider types | Sphere only | Sphere + Capsule |
| Collider organization | Inline in bone groups | Separate `colliders` + `colliderGroups` arrays |
| Core parameters | Same (stiffness, gravity, drag, hitRadius) | Same (stiffness, gravity, drag, hitRadius) |
| Physics algorithm | Verlet integration | Verlet integration (identical) |
| three-vrm support | v2.x handles both | v3.x handles both via VRMLoaderPlugin |
| Center bone support | Yes (same behavior) | Yes (same behavior) |
| Maximum colliders | No hard limit | No hard limit |
| Joint chaining | Groups of bones share settings | Each joint has independent settings |

**VRM 0.x body spring bone support:**
VRM 0.x models CAN have breast spring bones — there is no restriction in the spec. The `secondaryAnimation.boneGroups` array can contain any bone, not just hair/cloth. However, many VRM 0.x models from 2019-2021 were created before breast physics was commonly added by VRoid Studio. These models will need runtime bone injection (Section 4).

**VRM 1.0 body spring bone support:**
VRM 1.0 is better suited for body physics because:
1. **Capsule colliders** — A single capsule from sternum to lower chest prevents clipping better than 3-4 spheres
2. **Per-joint settings** — Each joint in a chain can have independent stiffness/drag, enabling graduated softness along a bone chain
3. **Explicit collider groups** — Breast collider groups can be referenced without affecting hair/cloth colliders

**Key takeaway:** The physics parameters and behavior are identical between VRM versions. The difference is structural (JSON format). Our `VRMLoaderPlugin` handles both transparently.

### Spring Bone `Center` Property Deep Dive

The `center` property is critically important for breast physics and frequently misunderstood:

| Center Setting | Behavior | Best For |
|---------------|----------|----------|
| `null` (world space) | Bones respond to ALL motion — translation + rotation | Breast/butt physics (want bounce on walk/jump) |
| Parent bone (e.g., `Chest`) | Bones only respond to rotation of parent, ignore translation | Hair (don't want hair to fly up when jumping) |
| Hips bone | Bones respond to upper body rotation only | Cloth/skirt |

**For breast physics, always set `center` to `null`.** This ensures walking, jumping, and landing all produce physics response. Many VRoid models ship with center set to the Chest bone, which kills translational response.

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

### Wiggle Bones Deep Dive

Wiggle Bones (npm: `wiggle`, docs: [wiggle.three.tools](https://wiggle.three.tools/)) was inspired by the Blender Wiggle Bones add-on by developer Xavier Jack.

**How it works:**
- Forward Kinematics combined with a smoothing function — NOT a full physics simulation
- Static bones (moved/rotated manually) drive dynamic child bones
- Dynamic "wiggle bones" follow static bones and aim for their original transform relative to the parent
- No joints or physics engine involved, making it extremely lightweight

**API:**
```javascript
import { WiggleBone, WiggleSpring } from 'wiggle';

// Option 1: WiggleBone wraps an existing bone
const wiggle = new WiggleBone(breastBone, {
    velocity: 0.5,    // how quickly the bone responds
});

// Option 2: WiggleSpring for spring-like behavior
const spring = new WiggleSpring(breastBone, {
    stiffness: 500,   // spring stiffness coefficient (N/m equivalent)
    damping: 17,      // damping force coefficient
});

// In animation loop:
wiggle.update();  // or spring.update();
```

**Limitations for breast physics:**
- No collision detection — breast bones can clip through the torso
- No gravity simulation — sag must be manually applied
- No per-bone parameter chains — all bones in a chain share the same spring
- Better suited for secondary motion (accessories, antennas, tails) than body physics

**When to use Wiggle instead of VRM spring bone:**
- Non-VRM models (generic GLTF/FBX) that need quick jiggle
- Performance-critical scenarios where even spring bone overhead is too much
- Supplementing VRM spring bones for additional secondary motion on accessories

### threeZboingZboing Analysis

[GitHub: WebAR-rocks/threeZboingZboing](https://github.com/WebAR-rocks/threeZboingZboing)

```javascript
// Per-bone configuration with spring-damper constants
const physicsConfig = {
    'Breast_L': { damper: 0.0008, spring: 0.000004 },
    'Breast_R': { damper: 0.0008, spring: 0.000004 },
    'Butt_L':   { damper: 0.0010, spring: 0.000006 },
    'Butt_R':   { damper: 0.0010, spring: 0.000006 },
};

const zboing = new ThreeZboingZboing(skinnedMesh, physicsConfig);
// In animation loop:
zboing.update(deltaTime);
```

**Key differences from VRM spring bone:**
- Operates on bone **rotations**, not positions (spring bone uses position-based Verlet)
- Spring constant and damper coefficient are raw physics values, not normalized 0-1 ranges
- Works on ANY SkinnedMesh, not just VRM — useful for GLTF/FBX models
- No collision system — requires manual clipping prevention

**Parameter tuning guide for threeZboingZboing:**
| Body Part | Damper | Spring | Feel |
|-----------|--------|--------|------|
| Breast (subtle) | 0.0012 | 0.000008 | Firm, minimal jiggle |
| Breast (natural) | 0.0008 | 0.000004 | Noticeable, grounded |
| Breast (bouncy) | 0.0005 | 0.000002 | Anime-style bounce |
| Butt | 0.0010 | 0.000006 | Less range than breast |
| Thigh | 0.0015 | 0.000010 | Very subtle wobble |

### What Do VTuber Apps Use?

| App | Physics System | Breast Physics Details | Notable Features |
|-----|---------------|----------------------|-----------------|
| **VSeeFace** | VRM Spring Bone + VSFAvatar Dynamic Bones | Standard VRM spring bone; VSFAvatar format allows Unity DynamicBone | Free, most popular for indie VTubers |
| **VNyan** | VRM Spring Bone (built-in) | Adjustable post-load via VRMoveTime plugin; supports parameter tweaking in-app | Godot-based, extensible with plugins |
| **Warudo** | VRM Spring Bone + Dynamic Bone + Magica Cloth | Multiple physics systems layered; Magica Cloth for clothing interaction | Unity-based, most feature-rich |
| **Luppet** | VRM Spring Bone | Standard VRM physics, no custom breast layer | Simple, lightweight |
| **VRChat** | PhysBone (replaced DynamicBone 2022) | Custom spring-damper, 5-tier presets, stretch/squish, grab/pose | Most documented presets, largest community |
| **3tene** | VRM Spring Bone | Basic spring bone, limited customization | Free tier available |
| **VDRAW** | VRM Spring Bone | Standard implementation | Drawing-focused VTuber tool |
| **Animaze** | Custom physics engine | Proprietary, limited VRM support | Successor to FaceRig |
| **VTube Studio** | Live2D physics (2D only) | Not applicable to 3D | 2D only, mentioned for completeness |

**VSeeFace Physics Details:**
- Uses standard VRM spring bone handling with no custom breast physics layer
- The VRMoveTime plugin by Faxanadus adds post-load physics adjustment
- VRMoveTime features: "inertial dampening with randomization" — adds slight random variation to each frame's dampening coefficient, preventing the robotic-looking synchronized bounce that occurs when both breasts have identical physics parameters
- VRMoveTime v4.0 also supports Warudo and VNyan

**VNyan Physics Details:**
- Built on Godot engine with custom VRM loader
- Spring bone parameters adjustable via in-app sliders (no code needed)
- Plugin system allows community physics modifications
- Supports both VRM 0.x and 1.0 spring bones
- "Pendulum Physics" mode provides Live2D-style exaggerated body motion overlay

**Warudo Physics Details:**
- Unity-based with multiple physics layers:
  1. VRM Spring Bone (base layer, always active)
  2. Dynamic Bone (optional, for VSFAvatar-format models)
  3. Magica Cloth 2 (clothing simulation, interacts with spring bones)
- "Body Movement Intensity" slider controls how much head/body tracking affects spring bone excitation
- "Pendulum Physics" option adds exaggerated sway for stylized look
- Can disable specific physics systems per bone group

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

#### Extended Preset Table with Oscillation Characteristics

| Preset | Oscillation Freq (Hz) | Decay Time (s) | Max Displacement (cm) | Oscillation Count | Visual Description |
|--------|----------------------|-----------------|----------------------|-------------------|-------------------|
| **Subtle/Realistic** | ~3.5 | 0.15 | 0.3-0.5 | 1-2 | Brief wobble, barely visible |
| **Natural** | ~2.8 | 0.3 | 0.5-1.0 | 2-3 | Visible bounce, settles quickly |
| **Anime Standard** | ~2.2 | 0.5 | 1.0-2.0 | 3-4 | Clear bounce with follow-through |
| **Bouncy** | ~1.8 | 0.8 | 2.0-3.5 | 4-6 | Pronounced jiggle, playful |
| **Extreme** | ~1.2 | 1.5+ | 3.5-5.0+ | 6-10+ | Exaggerated, continuous wobble |

#### VRChat DynamicBone Reference Values (for cross-reference)

| Preset | Damping | Elasticity | Stiffness | Inert | Update Rate |
|--------|---------|------------|-----------|-------|-------------|
| Realistic Breast | 0.231 | 0.618 | 0.159 | 0.000 | 50 |
| Bouncy Breast | 0.656 | 0.285 | 0.056 | 0.281 | 90 |
| Soft Breast | 0.075 | 0.037 | 0.100 | 0.861 | 60 |
| Very Firm Breast | 0.400 | 0.800 | 0.300 | 0.000 | 60 |
| Anime Standard | 0.150 | 0.500 | 0.100 | 0.100 | 60 |

**Mapping VRChat DynamicBone → VRM Spring Bone:**
- VRChat `Damping` ≈ VRM `dragForce` (both 0-1, controls deceleration)
- VRChat `Elasticity` ≈ inverse of VRM `stiffness` (elasticity returns to rest, stiffness resists movement)
- VRChat `Stiffness` ≈ VRM `stiffness` (same concept, different scale)
- VRChat `Inert` = how much position change is ignored (no direct VRM equivalent; simulate with higher drag)
- VRChat `Update Rate` = simulation Hz (VRM runs at render framerate, typically 60Hz)

**Mapping VRChat PhysBone → VRM Spring Bone:**

| PhysBone Parameter | VRM Equivalent | Conversion Notes |
|-------------------|----------------|-----------------|
| Pull | stiffness | Similar range (0-1), pull returns to rest like stiffness |
| Momentum (Advanced) | ~inverse of dragForce | High momentum = low drag = more wobble |
| Stiffness (Advanced) | stiffness | PhysBone stiffness resists rotation; VRM stiffness resists position change |
| Spring (Simplified) | ~combination of stiffness + drag | Simplified mode merges two concepts |
| Gravity | gravityPower + gravityDir | In PhysBone 1.1, gravity is a ratio, not a force — different behavior |
| Immobile | dragForce (partial) | Immobile reduces motion from root transform; closest VRM analog is high drag |
| Stretch | No direct equivalent | Simulate via morph targets triggered by spring bone displacement |
| Squish | No direct equivalent | Simulate via morph targets |

**Important:** PhysBone v1.1 changed gravity semantics. In v1.0, gravity behaves as a force competing with other settings. In v1.1, gravity and stiffness act as ratios influencing the final resting pose. When translating v1.1 gravity values to VRM, multiply by ~0.6 to compensate for the different interpretation.

### Butt & Thigh Physics Parameters

Butt and thigh require **different tuning** than breasts because they are larger masses with less range of motion:

| Body Part | Stiffness | Drag | Gravity Power | Hit Radius | Notes |
|-----------|-----------|------|---------------|------------|-------|
| **Butt (standard)** | 1.0 | 0.5 | 0.4 | 0.06 | Less swing than breasts, more dampened |
| **Butt (bouncy)** | 0.7 | 0.3 | 0.6 | 0.07 | More pronounced, responds to walking |
| **Thigh (inner)** | 1.5 | 0.6 | 0.2 | 0.04 | Very subtle, mostly visible during walking/running |
| **Thigh (outer)** | 1.8 | 0.7 | 0.15 | 0.03 | Minimal movement, prevents stiff appearance |
| **Belly (soft)** | 1.2 | 0.5 | 0.3 | 0.05 | Optional, for curvy/voluptuous body types only |
| **Upper arm** | 1.6 | 0.6 | 0.15 | 0.03 | Very subtle, for non-athletic body types |

### Movement Response Tuning

Different character actions should produce different physics responses. This can be achieved by temporarily modifying spring bone parameters:

| Action | Stiffness Mult | Gravity Mult | Drag Mult | Duration | Notes |
|--------|---------------|-------------|-----------|----------|-------|
| **Idle/Standing** | 1.0x | 1.0x | 1.0x | Continuous | Subtle breathing sway only |
| **Idle → Shifting weight** | 0.95x | 1.05x | 0.95x | 1-2s cycle | Periodic micro-sway |
| **Walking (slow)** | 0.9x | 1.0x | 0.9x | Per step (~0.8s) | Gentle rhythmic bounce |
| **Walking (brisk)** | 0.85x | 1.1x | 0.85x | Per step (~0.6s) | More pronounced step bounce |
| **Running** | 0.6x | 1.3x | 0.7x | Per step (~0.4s) | Significant bounce, faster cycle |
| **Jumping (ascent)** | 0.7x | 0.5x | 0.8x | 0.3-0.5s | Upward motion, reduced gravity feel |
| **Jumping (landing)** | 0.5x | 1.8x | 0.6x | 0.2-0.4s | Impact bounce, maximum displacement |
| **Turning quickly** | 0.7x | 1.0x | 0.8x | 0.3s | Lateral inertia, centrifugal effect |
| **Turning slowly** | 0.9x | 1.0x | 0.9x | 0.5s | Subtle lateral shift |
| **Leaning forward** | 0.8x | 1.5x | 0.9x | While leaning | Gravity pulls forward |
| **Leaning backward** | 0.85x | 1.3x | 0.9x | While leaning | Gravity shifts, chest lifts |
| **Bending over** | 0.6x | 1.8x | 0.7x | While bent | Maximum gravity effect on hanging tissue |
| **Standing up from bent** | 0.5x | 0.8x | 0.6x | 0.3-0.5s | Upward momentum bounce |
| **Breathing (normal)** | 0.95x | 1.0x | 1.0x | Sine, 3-4s period | Very subtle chest expansion |
| **Breathing (heavy)** | 0.85x | 1.05x | 0.9x | Sine, 1.5-2s period | Visible chest heave |
| **Laughing** | 0.7x | 1.1x | 0.7x | 0.5-1s bursts | Quick successive bounces, rhythmic |
| **Crying/Sobbing** | 0.8x | 1.0x | 0.8x | 0.3-0.5s bursts | Irregular jerky motion |
| **Startled/Surprised** | 0.5x | 1.4x | 0.5x | 0.2s burst | Single sharp bounce |
| **Dancing (slow)** | 0.8x | 1.1x | 0.8x | Varies | Follows rhythm |
| **Dancing (energetic)** | 0.5x | 1.3x | 0.6x | Varies | Maximum response |
| **Stretching/Yawning** | 0.9x | 0.8x | 1.0x | 2-3s | Slow, gentle shift |
| **Sitting down** | 0.6x | 1.5x | 0.6x | 0.3-0.5s | Impact + compression (butt especially) |
| **Lying down** | 1.2x | 0.3x | 1.2x | Transition | Reduced gravity, tissue spreads |

### Collision Prevention (Anti-Clipping)

VRM spring bone colliders prevent bones from penetrating the torso mesh:

```
Collider Setup (per character):
├── Chest Sphere Collider: radius 0.08-0.12, offset (0, 0.05, 0)
│   └── Prevents breast bones from penetrating chest
├── Upper Spine Sphere: radius 0.06-0.10, offset (0, -0.05, 0)
│   └── Prevents downward penetration
├── Arm Colliders (left/right): radius 0.03-0.05
│   └── Prevents breast clipping through arms during animation
├── Hip Sphere Collider: radius 0.08-0.12, offset (0, 0, 0)
│   └── Prevents butt bones from penetrating pelvis
└── Upper Leg Capsule Colliders: radius 0.04-0.06, height 0.15
    └── Prevents thigh jiggle bones from clipping into leg
```

VRM 1.0 capsule colliders are superior for torso collision — a single capsule from upper spine to lower chest covers more area than multiple spheres.

**Collider sizing by body type:**

| Body Type | Chest Collider Radius | Hip Collider Radius | Arm Collider Radius |
|-----------|----------------------|--------------------|--------------------|
| Petite | 0.06 - 0.08 | 0.06 - 0.08 | 0.02 - 0.03 |
| Average | 0.08 - 0.10 | 0.08 - 0.10 | 0.03 - 0.04 |
| Athletic | 0.08 - 0.11 | 0.08 - 0.10 | 0.03 - 0.05 |
| Curvy | 0.10 - 0.13 | 0.10 - 0.13 | 0.04 - 0.05 |
| Voluptuous | 0.12 - 0.16 | 0.12 - 0.15 | 0.04 - 0.06 |

**Common collider issue:** VRM models from VRoid Studio often have oversized colliders (particularly head colliders) that cause hair and breast spring bones to appear stuck in mid-air. A 50% reduction in VRoid's default collider radius has been found to fix virtually all tested models. Our runtime should apply this correction automatically when detecting VRoid-origin models.

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

| Convention | Left Bone | Right Bone | Chain End (Left) | Chain End (Right) | Source |
|-----------|-----------|------------|-----------------|-------------------|--------|
| **VRM Standard** | `Breast_L` | `Breast_R` | `Breast_L_end` | `Breast_R_end` | VRM Humanoid spec |
| **VRoid Studio (Japanese)** | `J_Sec_L_Bust1` | `J_Sec_R_Bust1` | `J_Sec_L_Bust2` | `J_Sec_R_Bust2` | VRoid default export |
| **VRoid Studio (v2+)** | `J_Sec_L_Bust1` | `J_Sec_R_Bust1` | `J_Sec_L_Bust1_end` | `J_Sec_R_Bust1_end` | Newer VRoid exports |
| **Generic Blender** | `breast.L` | `breast.R` | `breast.L.001` | `breast.R.001` | Blender Rigify convention |
| **Blender (underscore)** | `breast_left` | `breast_right` | `breast_left_end` | `breast_right_end` | Blender manual export |
| **Unity Humanoid** | `Left Breast` | `Right Breast` | — | — | Unity avatar descriptor |
| **MMD-style (Japanese)** | `左胸` | `右胸` | `左胸先` | `右胸先` | Japanese MMD models |
| **MMD-style (Romaji)** | `mune_L` | `mune_R` | `mune_L_end` | `mune_R_end` | Romanized MMD |
| **Cats Blender Plugin** | `Breast_L` | `Breast_R` | `Breast_L_end` | `Breast_R_end` | After CATS rename |
| **XNALara** | `breast.l` | `breast.r` | — | — | XPS model format |
| **Mixamo** | — | — | — | — | Mixamo does NOT include breast bones |
| **ReadyPlayerMe** | — | — | — | — | RPM does NOT include breast bones |

**Bone discovery algorithm (runtime):**
```javascript
/**
 * Searches the skeleton for breast bones using all known naming conventions.
 * Returns null if no breast bones are found.
 *
 * @param skeleton - The THREE.Skeleton to search
 * @returns Object with left and right bone references, or null
 */
function discoverBreastBones(skeleton) {
    const leftNames = [
        'Breast_L', 'J_Sec_L_Bust1', 'breast.L', 'breast_left',
        'Left Breast', '左胸', 'mune_L', 'breast.l',
        'Breast_L_injected',  // our own injected bones
    ];
    const rightNames = [
        'Breast_R', 'J_Sec_R_Bust1', 'breast.R', 'breast_right',
        'Right Breast', '右胸', 'mune_R', 'breast.r',
        'Breast_R_injected',
    ];

    let left = null, right = null;
    for (const bone of skeleton.bones) {
        const name = bone.name;
        if (!left && leftNames.includes(name)) left = bone;
        if (!right && rightNames.includes(name)) right = bone;
        if (left && right) break;
    }

    return (left || right) ? { left, right } : null;
}
```

### Bone Naming Across Creation Tools

| Tool | Breast Bone Naming | Butt Bone Naming | Notes |
|------|-------------------|-----------------|-------|
| **VRoid Studio** | `J_Sec_L_Bust1/2`, `J_Sec_R_Bust1/2` | Not included | VRoid does not export butt/thigh physics bones |
| **Blender (manual rig)** | User-defined, typically `breast.L/R` | User-defined, typically `butt.L/R` | Follows Blender's `.L/.R` convention |
| **Blender + Rigify** | Not in default Rigify | Not in default Rigify | Must be added as custom bones |
| **Blender + CATS Plugin** | Renamed to `Breast_L/R` | Not handled | CATS standardizes to VRM naming |
| **Blender + VRM Add-on** | Preserved from source, or `Breast_L/R` | Preserved from source | VRM Add-on maps to VRM humanoid spec |
| **Unity + UniVRM** | `J_Sec_L_Bust1` (VRoid) or custom | Custom | UniVRM preserves source naming |
| **Unity + VRChat SDK** | Converted to PhysBone components | Converted to PhysBone components | Names preserved, physics system changes |
| **MMD PMX Editor** | `左胸` / `右胸` (Japanese) | `左尻` / `右尻` (Japanese) | Japanese naming standard |
| **Blender + mmd_tools** | `mune.L` / `mune.R` (from PMX) | `siri.L` / `siri.R` (from PMX) | Romanized from Japanese |
| **CC3/CC4 (Character Creator)** | `L_Breast` / `R_Breast` | `L_Buttock` / `R_Buttock` | Reallusion naming |
| **DAZ Studio** | `lPectoral` / `rPectoral` | `lGluteal` / `rGluteal` | DAZ Genesis figures |

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

| Chain Length | Description | Use Case | Deformation Quality |
|-------------|-------------|----------|-------------------|
| **1 bone** | Single pivot from chest | Simplest, adequate for subtle physics | Low — entire breast moves as rigid unit |
| **2 bones** | Root + tip (most common) | Good deformation, standard for VTuber models | Good — base stays anchored, tip bounces |
| **3 bones** | Root + mid + tip | Best deformation quality, rare in VRM models | Excellent — graduated softness, natural droop |
| **4+ bones** | Multi-segment chain | Overkill for real-time, used in film/offline | Diminishing returns for real-time rendering |

For 2+ bone chains, use **decreasing stiffness** along the chain:
```javascript
// 2-bone chain example
boneChain[0].settings.stiffness = 0.8;  // root: stiffer (anchored to chest)
boneChain[1].settings.stiffness = 0.4;  // tip: looser (free end bounces more)
boneChain[0].settings.dragForce = 0.4;
boneChain[1].settings.dragForce = 0.2;  // tip swings more freely

// 3-bone chain example (graduated)
boneChain[0].settings.stiffness = 1.0;  // root: firmest
boneChain[0].settings.dragForce = 0.5;
boneChain[1].settings.stiffness = 0.6;  // mid: moderate
boneChain[1].settings.dragForce = 0.3;
boneChain[2].settings.stiffness = 0.3;  // tip: loosest
boneChain[2].settings.dragForce = 0.15;
```

### Butt & Thigh Bone Names

These are **not part of the VRM humanoid spec** and must be custom bones:

| Body Part | Bone Names (Convention) | Parent Bone | Position Offset |
|-----------|------------------------|-------------|----------------|
| **Butt (left)** | `Butt_L`, `J_Sec_L_Butt1` | `Hips` | (-0.08, -0.05, -0.06) |
| **Butt (right)** | `Butt_R`, `J_Sec_R_Butt1` | `Hips` | (0.08, -0.05, -0.06) |
| **Thigh jiggle (left)** | `ThighJiggle_L` | `LeftUpperLeg` | (-0.03, -0.05, 0.03) |
| **Thigh jiggle (right)** | `ThighJiggle_R` | `RightUpperLeg` | (0.03, -0.05, 0.03) |
| **Belly (center)** | `Belly_Jiggle` | `Spine` | (0, 0, 0.08) |

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

**Bone injection vertex weight considerations:**
When injecting bones at runtime, the new bones start with zero vertex weights. To make them actually deform the mesh, you have two options:
1. **Weight transfer from existing bones:** Copy a fraction of chest bone weights to the injected breast bone for vertices in the breast region (identified by position relative to chest center)
2. **Distance-based auto-weighting:** For each vertex within a radius of the injected bone, assign weight based on distance falloff

```javascript
/**
 * Auto-assigns vertex weights to an injected bone based on proximity.
 * This allows runtime-injected bones to deform the mesh.
 *
 * @param mesh - The SkinnedMesh to modify
 * @param bone - The injected bone
 * @param boneIndex - Index of the bone in the skeleton
 * @param radius - Influence radius in model space
 * @param maxWeight - Maximum weight to assign (0-1)
 */
function autoWeightBone(mesh, bone, boneIndex, radius, maxWeight) {
    const geometry = mesh.geometry;
    const skinIndex = geometry.attributes.skinIndex;
    const skinWeight = geometry.attributes.skinWeight;
    const position = geometry.attributes.position;

    const boneWorldPos = new THREE.Vector3();
    bone.getWorldPosition(boneWorldPos);
    mesh.worldToLocal(boneWorldPos);

    for (let i = 0; i < position.count; i++) {
        const vx = position.getX(i);
        const vy = position.getY(i);
        const vz = position.getZ(i);
        const dist = boneWorldPos.distanceTo(new THREE.Vector3(vx, vy, vz));

        if (dist < radius) {
            const weight = maxWeight * (1.0 - dist / radius);
            // Find lowest existing weight slot and replace if our weight is higher
            let minSlot = 0, minVal = skinWeight.getX(i);
            if (skinWeight.getY(i) < minVal) { minSlot = 1; minVal = skinWeight.getY(i); }
            if (skinWeight.getZ(i) < minVal) { minSlot = 2; minVal = skinWeight.getZ(i); }
            if (skinWeight.getW(i) < minVal) { minSlot = 3; minVal = skinWeight.getW(i); }

            if (weight > minVal) {
                skinIndex.setComponent(i, minSlot, boneIndex);
                skinWeight.setComponent(i, minSlot, weight);
            }
        }
    }

    skinIndex.needsUpdate = true;
    skinWeight.needsUpdate = true;
    // Renormalize weights
    for (let i = 0; i < skinWeight.count; i++) {
        const sum = skinWeight.getX(i) + skinWeight.getY(i) +
                    skinWeight.getZ(i) + skinWeight.getW(i);
        if (sum > 0) {
            skinWeight.setXYZW(i,
                skinWeight.getX(i) / sum, skinWeight.getY(i) / sum,
                skinWeight.getZ(i) / sum, skinWeight.getW(i) / sum);
        }
    }
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
| + Hair + Clothes + Wind (heavy scene) | 60 | 30 | ~0.8ms | 5.0% |

### Hardware-Specific Benchmarks (Projected)

| Hardware | Full Body Jiggle (10 joints) | Full Scene (60 joints) | Headroom |
|----------|------------------------------|----------------------|----------|
| **Mac M2 Pro** | ~0.08ms | ~0.5ms | Excellent — 96.9% of 16ms free |
| **Win RTX 5080** | ~0.06ms | ~0.4ms | Excellent — CPU not GPU bound |
| **Win RTX 3070** | ~0.10ms | ~0.6ms | Excellent — still under 4% budget |
| **Low-end (i5-8400 + GTX 1060)** | ~0.15ms | ~0.9ms | Good — under 6% budget |
| **Integrated GPU (Intel UHD 630)** | ~0.20ms | ~1.2ms | Acceptable — 7.5% budget |

**Key insight:** Spring bone physics is CPU-bound, not GPU-bound. The Verlet integration runs entirely on CPU. GPU is only involved when the computed bone transforms are applied to the skinned mesh (which happens regardless of whether spring bones are enabled).

**Conclusion:** Jiggle physics adds negligible overhead. Even with full body physics AND existing hair/cloth spring bones, total spring bone cost stays under 1ms/frame on any of our target hardware.

### Running Alongside Hair/Clothing

The existing `currentVrm.update(delta)` call already processes ALL spring bone joints in one pass. Adding breast/butt/thigh joints to the same manager means zero additional overhead from the update loop — they are simply more joints in the same Verlet integration pass.

**Colliders are the bottleneck**, not joints. Each collider-joint pair requires a distance check. Keep collider count under 30 total (hair + cloth + body) for zero-impact performance.

**Collider optimization strategies:**
1. **Broadphase culling:** Only check colliders within the same body region (chest colliders only test breast joints, not hair joints)
2. **Collider merging:** Replace multiple sphere colliders with fewer capsule colliders (VRM 1.0)
3. **Distance threshold:** Skip collider checks when a joint is far from its rest position (physics already dominant)
4. **Frame skipping for distant colliders:** Colliders on distant body parts (e.g., arm colliders vs breast joints) only check every 3rd frame

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

### Memory Footprint

| Component | Memory Per Instance | Notes |
|-----------|-------------------|-------|
| VRMSpringBoneJoint | ~256 bytes | Positions, settings, references |
| VRMSpringBoneCollider (sphere) | ~64 bytes | Shape + offset |
| VRMSpringBoneCollider (capsule) | ~96 bytes | Shape + offset + tail |
| ColliderGroup | ~32 bytes + refs | Array of collider references |
| Full body jiggle setup (10 joints, 8 colliders) | ~3.5 KB | Negligible |
| JigglePhysicsManager overhead | ~2 KB | Presets, state, config |

**Total memory for jiggle physics: ~5.5 KB per character.** Completely negligible.

---

## 6. Existing Implementations to Study

### VSeeFace Breast Physics

- **System:** VRM Spring Bone (standard) + VSFAvatar (Unity DynamicBone)
- **Key insight:** VSeeFace's default spring bone handling is standard VRM — no custom breast physics layer
- **Plugin:** VRMoveTime adds post-load physics adjustment with "inertial dampening with randomization" for more realistic motion
- **VRMoveTime v4.0 features:**
  - Adjustable stiffness, drag, gravity per bone group
  - "Randomized dampening" — adds ±5-15% random variation to drag coefficient per frame
  - Prevents perfectly synchronized L/R breast bounce (looks robotic)
  - Now supports VSeeFace, VNyan, and Warudo
- **Takeaway:** Randomized dampening prevents robotic-looking synchronized bounce

### Koikatsu / Honey Select

- **System:** Unity DynamicBone with custom `BreastPhysicsController` plugin
- **Bone structure:** `Bust01`, `Bust02`, `Bust03` (3-bone chain per breast)
- **Key feature:** "Alternative update mode" where breasts run independent physics (not driven by animation)
- **Colliders:** DynamicBone colliders on torso + arms to prevent clipping
- **Plugin source:** [KK_BreastPhysicsController](https://github.com/SNW-KK/KK_BreastPhysicsController) — open source, adjustable parameters

**BreastPhysicsController Plugin Parameters (Koikatsu):**

| Parameter | Range | Default | Description |
|-----------|-------|---------|-------------|
| Damping | 0.0 - 1.0 | 0.15 | Resistance to motion |
| Elasticity | 0.0 - 1.0 | 0.30 | Force returning to rest position |
| Stiffness | 0.0 - 1.0 | 0.10 | Resistance to deformation |
| Inert | 0.0 - 1.0 | 0.00 | Portion of motion ignored |
| Gravity (breast) | -1.0 - 1.0 | -0.03 | Downward pull per frame |
| Alternative Update | bool | false | Independent physics (not animation-driven) |

**Koikatsu BPC Community Presets:**

| Preset Name | Damping | Elasticity | Stiffness | Gravity | Feel |
|-------------|---------|------------|-----------|---------|------|
| Much Jiggle (default) | 0.08 | 0.25 | 0.05 | -0.04 | Very bouncy, anime style |
| Realistic | 0.20 | 0.50 | 0.15 | -0.03 | Grounded, natural |
| Firm | 0.30 | 0.60 | 0.25 | -0.02 | Tight, minimal jiggle |
| Soft & Heavy | 0.05 | 0.15 | 0.03 | -0.06 | Maximum sag and bounce |
| Perky | 0.15 | 0.45 | 0.20 | -0.01 | Upright, quick settle |

**IllusionMods BreastPhysicsController:**
The [IllusionMods fork](https://github.com/IllusionMods/BreastPhysicsController) extends the original with:
- Support for Honey Select, AI Shoujo, and Koikatsu
- Hips (butt) physics in addition to breast
- Preset system with importable/exportable config files
- Per-character saved settings (stored in character card)

**Takeaway:** Independent physics mode (not animation-driven) produces more natural results. Our spring bone system already operates independently from animation clips.

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

