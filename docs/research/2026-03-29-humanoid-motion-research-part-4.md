> **This is Part 4 of 4.** See also: [Part 1](2026-03-29-humanoid-motion-research-part-1.md), [Part 2](2026-03-29-humanoid-motion-research-part-2.md), [Part 3](2026-03-29-humanoid-motion-research-part-3.md)

## 13. Facial Micro-Expressions & FACS

**Priority:** MEDIUM-HIGH -- adds emotional depth and realism
**Effort:** 12-18h
**Impact:** 8/10

### The Facial Action Coding System (FACS)

FACS, developed by Paul Ekman and Wallace Friesen (1978), decomposes facial expressions into individual **Action Units (AUs)** -- each AU corresponds to the contraction of a specific facial muscle or muscle group.

### Core Action Units Relevant to VRM

VRM models use a subset of FACS through blendshapes. The standard VRM expressions map to FACS combinations:

| VRM Expression | FACS Action Units | Muscles Involved |
|---------------|-------------------|-----------------|
| **happy** (joy) | AU6 (cheek raise) + AU12 (lip corner pull) | Orbicularis oculi + Zygomaticus major |
| **angry** | AU4 (brow lower) + AU5 (upper lid raise) + AU23 (lip tightener) | Corrugator supercilii + Levator palpebrae + Orbicularis oris |
| **sad** (sorrow) | AU1 (inner brow raise) + AU4 (brow lower) + AU15 (lip corner depress) | Frontalis (medial) + Corrugator + Depressor anguli oris |
| **surprised** | AU1 (inner brow raise) + AU2 (outer brow raise) + AU5 (upper lid raise) + AU26 (jaw drop) | Frontalis + Levator palpebrae + Masseter (relax) |
| **relaxed** | Neutral + slight AU12 (lip corner pull) | Mild Zygomaticus |

### VRM Expression Set

**Standard VRM 1.0 Expressions:**
- Emotional: `happy`, `angry`, `sad`, `relaxed`, `surprised`
- Procedural: `blink`, `blinkLeft`, `blinkRight`
- Lip sync: `aa`, `ih`, `ou`, `ee`, `oh`
- Look direction: `lookUp`, `lookDown`, `lookLeft`, `lookRight`
- Other: `neutral`

**Perfect Sync (ARKit 52 blendshapes) -- for models that support it:**

| ARKit Shape | FACS AU | Description |
|------------|---------|-------------|
| browDownLeft/Right | AU4 | Brow lowering |
| browInnerUp | AU1 | Inner brow raise |
| browOuterUpLeft/Right | AU2 | Outer brow raise |
| cheekPuff | AU34 | Cheek puffing |
| cheekSquintLeft/Right | AU6 | Cheek raise |
| eyeBlinkLeft/Right | AU45 | Eye closure |
| eyeLookDownLeft/Right | -- | Downward gaze |
| eyeLookInLeft/Right | -- | Inward gaze |
| eyeLookOutLeft/Right | -- | Outward gaze |
| eyeLookUpLeft/Right | -- | Upward gaze |
| eyeSquintLeft/Right | AU44 | Eye squint |
| eyeWideLeft/Right | AU5 | Eye widening |
| jawForward | AU29 | Jaw thrust |
| jawLeft/Right | AU30 | Jaw sideways |
| jawOpen | AU26/27 | Jaw drop |
| mouthClose | -- | Lips together |
| mouthDimpleLeft/Right | AU14 | Dimpler |
| mouthFrownLeft/Right | AU15 | Lip corner depressor |
| mouthFunnel | AU22 | Lip funneler |
| mouthLeft/Right | -- | Mouth shift |
| mouthPressLeft/Right | AU24 | Lip pressor |
| mouthPucker | AU18 | Lip pucker |
| mouthRollLower/Upper | -- | Lip roll |
| mouthShrugLower/Upper | -- | Chin raise |
| mouthSmileLeft/Right | AU12 | Lip corner puller |
| mouthStretchLeft/Right | AU20 | Lip stretcher |
| mouthUpperUpLeft/Right | AU10 | Upper lip raiser |
| noseSneerLeft/Right | AU9 | Nose wrinkler |
| tongueOut | AU19 | Tongue show |

### Procedural Micro-Expression System

Micro-expressions are brief (40-500ms), involuntary facial expressions that reveal concealed emotions. They differ from macro-expressions in:
- Duration: 40-500ms (vs 0.5-4s for macro)
- Amplitude: Often partial, affecting only part of the face
- Involuntary: Cannot be suppressed (useful for "leaking" true emotion)

```javascript
/**
 * Procedural facial micro-expression system.
 *
 * Runs independently from the main emotion expression system.
 * Adds subtle, fleeting expression changes that create the impression
 * of a complex inner emotional life.
 *
 * Architecture: a "thought stream" generates random micro-expression
 * events at irregular intervals. Each event briefly activates a
 * combination of expression blendshapes, then fades.
 */
class MicroExpressionSystem {
    constructor(vrm) {
        this.vrm = vrm;
        this.activeExpressions = []; // { shapes, startTime, duration, peakTime }
        this.nextEventTime = 2 + Math.random() * 5;
        this.timer = 0;
        this.baseEmotion = 'neutral';
    }

    setEmotion(emotion) {
        this.baseEmotion = emotion;
    }

    update(dt) {
        this.timer += dt;

        // Spawn new micro-expression events
        if (this.timer >= this.nextEventTime) {
            this._spawnEvent();
            this.timer = 0;
            this.nextEventTime = 1.5 + Math.random() * 6; // Every 1.5-7.5s
        }

        // Update active expressions
        const now = performance.now() / 1000;
        const expr = this.vrm.expressionManager;
        if (!expr) return;

        for (let i = this.activeExpressions.length - 1; i >= 0; i--) {
            const event = this.activeExpressions[i];
            const elapsed = now - event.startTime;

            if (elapsed >= event.duration) {
                // Expired -- remove and zero out
                this.activeExpressions.splice(i, 1);
                continue;
            }

            // Envelope: quick rise, hold, slow fade
            const t = elapsed / event.duration;
            let intensity;
            if (t < 0.15) {
                intensity = t / 0.15; // Fast rise (15% of duration)
            } else if (t < 0.4) {
                intensity = 1.0; // Hold at peak
            } else {
                intensity = 1.0 - (t - 0.4) / 0.6; // Slow fade
            }

            // Apply each shape in the event
            for (const [shape, amplitude] of Object.entries(event.shapes)) {
                const current = expr.getValue(shape) || 0;
                expr.setValue(shape, current + amplitude * intensity * event.maxIntensity);
            }
        }
    }

    _spawnEvent() {
        // Select micro-expression based on base emotion with some randomness
        const eventTypes = MICRO_EXPRESSION_LIBRARY[this.baseEmotion]
            || MICRO_EXPRESSION_LIBRARY.neutral;

        const event = eventTypes[Math.floor(Math.random() * eventTypes.length)];
        this.activeExpressions.push({
            shapes: event.shapes,
            startTime: performance.now() / 1000,
            duration: 0.2 + Math.random() * 0.5, // 200-700ms
            maxIntensity: 0.1 + Math.random() * 0.3 // Subtle: 10-40% intensity
        });
    }
}

/**
 * Micro-expression library organized by base emotion.
 * Each entry is a set of blendshape weights that briefly flash.
 * Using VRM standard expression names.
 */
const MICRO_EXPRESSION_LIBRARY = {
    neutral: [
        { shapes: { happy: 0.15 } },                    // Fleeting smile
        { shapes: { sad: 0.1 } },                       // Brief sadness
        { shapes: { surprised: 0.08 } },                // Mild surprise
    ],
    happy: [
        { shapes: { happy: 0.3, surprised: 0.1 } },     // Joy flash
        { shapes: { relaxed: 0.2 } },                   // Contentment
        { shapes: { happy: -0.1, neutral: 0.1 } },      // Brief composure
    ],
    sad: [
        { shapes: { angry: 0.1 } },                     // Flash of frustration
        { shapes: { sad: 0.2, relaxed: 0.05 } },        // Deeper sadness
        { shapes: { happy: 0.08 } },                     // Brave face attempt
        { shapes: { surprised: 0.05 } },                 // Vulnerability
    ],
    angry: [
        { shapes: { angry: 0.3 } },                     // Rage flash
        { shapes: { sad: 0.1 } },                        // Hurt beneath anger
        { shapes: { surprised: 0.05, angry: 0.1 } },    // Indignation
    ],
    // ... more emotions
};
```

### Performance

- Expression setValue calls: 2-4 per micro-expression event
- Event spawning: rare (every 1.5-7.5s)
- Envelope computation: trivial
- **Total budget:** <0.01ms/frame

### References

- Ekman & Friesen, "Facial Action Coding System" (1978)
- ARKit 52 blendshapes guide -- https://pooyadeperson.com/the-ultimate-guide-to-creating-arkits-52-facial-blendshapes/
- OpenFace FACS Unity -- https://github.com/alexismorin/OpenFace-FACS-Unity-Facial-Animator
- VRM BlendShape documentation -- https://vrm.dev/en/univrm/blendshape/univrm_blendshape/
- Warudo character docs -- https://docs.warudo.app/docs/assets/character

---

## 14. Hand and Finger Animation

**Priority:** MEDIUM -- significant if the model has hand bones
**Effort:** 8-12h
**Impact:** 6/10 (depends on model hand quality)

### VRM Hand Bone Structure

VRM humanoid defines these hand bones (optional -- many models lack finger bones):

```
Per hand (left/right):
  thumb:   thumbProximal, thumbIntermediate, thumbDistal
  index:   indexProximal, indexIntermediate, indexDistal
  middle:  middleProximal, middleIntermediate, middleDistal
  ring:    ringProximal, ringIntermediate, ringDistal
  little:  littleProximal, littleIntermediate, littleDistal
```

That's 15 bones per hand, 30 total for both hands. Many VRM models have simplified hands with fewer bones or none at all.

### Rest Poses by Emotional State

The default hand pose (rest pose) should vary with emotion. Real humans' hand tension reflects their emotional state:

| Emotion | Rest Pose | Finger Curl (0-1) | Thumb Position | Wrist Angle |
|---------|-----------|-------------------|---------------|-------------|
| Neutral | Relaxed drape | 0.3 | Slightly tucked | Neutral |
| Happy | Open, fingers spread | 0.1 | Extended | Slight extension |
| Sad | Loosely curled | 0.5 | Tucked in | Slight flexion |
| Angry | Tight fist | 0.9 | Clenched over fingers | Flexion |
| Nervous | Fidgeting, rubbing | 0.4-0.6 (variable) | Touching other fingers | Variable |
| Confident | Open, relaxed | 0.2 | Slightly out | Neutral-extension |
| Shy | Hands together | 0.4 | Interlocked | Flexion (clasped) |
| Sleepy | Very relaxed drape | 0.6 | Loose | Drop/flexion |
| Surprised | Splayed open | 0.0 | Extended wide | Hyperextension |

### Procedural Hand Animation

```javascript
/**
 * Procedural hand pose system.
 * Sets finger curl, spread, and thumb position based on emotional state.
 *
 * Only activates if the VRM model has finger bones.
 * Falls back gracefully (no-op) for models without hand bones.
 */
class HandPoseSystem {
    constructor(vrm) {
        this.vrm = vrm;
        this.hasFingers = this._checkFingerBones();
        this.currentCurl = { left: 0.3, right: 0.3 };
        this.targetCurl = { left: 0.3, right: 0.3 };
        this.curlVelocity = { left: 0, right: 0 };
    }

    _checkFingerBones() {
        return !!this.vrm.humanoid.getNormalizedBoneNode('leftIndexProximal');
    }

    setEmotion(emotion) {
        if (!this.hasFingers) return;

        const poses = {
            neutral:   { curl: 0.3, spread: 0.0 },
            happy:     { curl: 0.1, spread: 0.15 },
            sad:       { curl: 0.5, spread: -0.05 },
            angry:     { curl: 0.9, spread: -0.1 },
            surprised: { curl: 0.0, spread: 0.2 },
            nervous:   { curl: 0.45, spread: 0.0 },
            sleepy:    { curl: 0.6, spread: -0.05 },
            loving:    { curl: 0.2, spread: 0.05 },
        };

        const pose = poses[emotion] || poses.neutral;
        this.targetCurl.left = pose.curl;
        this.targetCurl.right = pose.curl;
    }

    update(dt) {
        if (!this.hasFingers) return;

        // Spring-damped curl transition
        for (const side of ['left', 'right']) {
            const result = springDamperExact(
                this.currentCurl[side], this.curlVelocity[side],
                this.targetCurl[side], 0.3, dt
            );
            this.currentCurl[side] = result.x;
            this.curlVelocity[side] = result.v;

            // Apply curl to all finger bones
            this._applyFingerCurl(side, result.x);
        }
    }

    _applyFingerCurl(side, curl) {
        const prefix = side === 'left' ? 'left' : 'right';
        const fingers = ['index', 'middle', 'ring', 'little'];

        for (const finger of fingers) {
            const proximal = this.vrm.humanoid.getNormalizedBoneNode(
                `${prefix}${finger.charAt(0).toUpperCase() + finger.slice(1)}Proximal`
            );
            const intermediate = this.vrm.humanoid.getNormalizedBoneNode(
                `${prefix}${finger.charAt(0).toUpperCase() + finger.slice(1)}Intermediate`
            );
            const distal = this.vrm.humanoid.getNormalizedBoneNode(
                `${prefix}${finger.charAt(0).toUpperCase() + finger.slice(1)}Distal`
            );

            // Proximal: most curl, intermediate: moderate, distal: least
            if (proximal) proximal.rotation.x = curl * 1.2;
            if (intermediate) intermediate.rotation.x = curl * 0.9;
            if (distal) distal.rotation.x = curl * 0.6;
        }

        // Thumb curls differently (opposition)
        const thumbProx = this.vrm.humanoid.getNormalizedBoneNode(`${prefix}ThumbProximal`);
        const thumbInter = this.vrm.humanoid.getNormalizedBoneNode(`${prefix}ThumbIntermediate`);
        if (thumbProx) {
            thumbProx.rotation.x = curl * 0.5;
            thumbProx.rotation.z = curl * 0.3 * (side === 'left' ? 1 : -1);
        }
        if (thumbInter) thumbInter.rotation.x = curl * 0.4;
    }
}
```

### Gesture Vocabulary for Hands

| Gesture | Description | Finger Config | Use Case |
|---------|-------------|--------------|----------|
| Open palm | All fingers extended, palm forward | Curl 0.0, spread 0.15 | Surprise, greeting, "stop" |
| Pointing | Index extended, others curled | Index 0.0, others 0.85 | Indicating, explaining |
| Fist | All curled tight | Curl 0.95 | Anger, determination |
| Peace sign | Index + middle up, others curled | Index/middle 0.0, others 0.85 | Cute pose, greeting |
| Heart shape | Thumbs + index fingers form heart | Complex multi-bone pose | Love, affection |
| Wave | Open hand, wrist oscillation | Curl 0.1, wrist rotation animated | Greeting, goodbye |
| Chin rest | Fingers under chin | Curl 0.4, wrist flexion | Thinking, bored |
| Hair touch | Fingers near temple | Curl 0.3, arm raised | Shy, nervous |

### Performance

- 30 finger bones * rotation set: ~0.03ms/frame
- Spring evaluation for curl: ~0.002ms
- Only runs if finger bones exist (model-dependent)
- **Total budget:** <0.05ms/frame (when active)

### References

- UC Davis "Hand Gesture Synthesis for Conversational Characters" -- https://www.cs.ucdavis.edu/~neff/papers/HandGestureSynthesisForConversationalCharacters_PREPRINT.pdf
- AnimSchool "Handling Hands in Animation" -- https://blog.animschool.edu/2025/01/10/handling-hands-in-animation/
- Animation Mentor hand gestures tutorial -- https://www.animationmentor.com/blog/tutorial-how-to-animate-hand-gestures/

---

## 15. Animation State Machines

**Priority:** MEDIUM-HIGH -- structural foundation for complex animation
**Effort:** 15-25h
**Impact:** 8/10

### How AAA Games Structure Animation

Modern game animation systems use a layered architecture:

```
┌─────────────────────────────────────────────────┐
│                  Gameplay Logic                    │
│         (AI, player input, game state)            │
├─────────────────────────────────────────────────┤
│              Animation Controller                  │
│    (parameters, state requests, events)           │
├─────────────────────────────────────────────────┤
│           Hierarchical State Machine              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐      │
│  │  Idle    │  │ Locomotion│  │  Combat  │      │
│  │ Machine  │  │  Machine  │  │  Machine │      │
│  │          │  │           │  │          │      │
│  │ Standing │  │ Walk      │  │ Idle     │      │
│  │ Sitting  │  │ Run       │  │ Attack   │      │
│  │ Crouching│  │ Sprint    │  │ Block    │      │
│  └──────────┘  └──────────┘  └──────────┘      │
├─────────────────────────────────────────────────┤
│                Blend Trees                         │
│  ┌───────────────────────────────────────┐       │
│  │  1D Blend: Walk <-> Run (by speed)    │       │
│  │  2D Blend: Strafe (by direction+speed)│       │
│  │  Additive: Hit reactions on top       │       │
│  └───────────────────────────────────────┘       │
├─────────────────────────────────────────────────┤
│              Animation Layers                      │
│  Layer 0 (Override): Body (from state machine)    │
│  Layer 1 (Additive): Breathing                    │
│  Layer 2 (Override): Upper body (gestures)        │
│  Layer 3 (Additive): Face (expressions)           │
│  Layer 4 (Additive): Look-at (IK)                │
├─────────────────────────────────────────────────┤
│            Final Pose + Post-Process              │
│    (IK, ragdoll blend, spring bones, etc.)        │
└─────────────────────────────────────────────────┘
```

### State Machine Concepts

**States:** Each state produces a pose output. Can be:
- Single animation clip
- Blend tree (parametric blend of multiple clips)
- Sub-state machine (nested HSM)
- Procedural pose generator

**Transitions:** Rules for moving between states:

| Property | Description | Typical Value |
|----------|-------------|--------------|
| Condition | Boolean/threshold trigger | `speed > 0.1`, `isTalking == true` |
| Duration | Crossfade time | 0.1-0.5 seconds |
| Offset | Start time in destination clip | 0.0-1.0 (normalized) |
| Interruption | Can another transition interrupt? | Source/Destination/Both/None |
| Exit time | Wait for source to reach this point | 0.0-1.0 (normalized) |
| Has exit time | Transition only after exit time? | true/false |

**Blend Trees:** Parametric blending of multiple animations:

```
1D Blend Tree (by speed parameter):
  speed=0.0 -> Idle (100%)
  speed=0.5 -> Walk (100%)
  speed=1.0 -> Run (100%)
  speed=0.3 -> Idle (40%) + Walk (60%)  [interpolated]

2D Blend Tree (by direction + speed):
              Forward
                 |
         FL --- Walk --- FR
          |      |      |
  Left --Strafe--+--Strafe-- Right
          |      |      |
         BL --- Back --- BR
                 |
              Backward
```

### Application to Waifu-RT3D

Our character doesn't locomote, but the state machine pattern is still valuable:

```javascript
/**
 * Simplified animation state machine for a stationary companion.
 *
 * States correspond to the character's activity, not locomotion:
 *   Idle -> Talk -> React -> Gesture -> Idle
 *
 * This replaces ad-hoc layer enable/disable logic with a formal
 * state machine that enforces valid transitions.
 */
class CompanionAnimationFSM {
    constructor() {
        this.states = {
            idle: {
                layers: ['basePose', 'idle', 'breathing', 'lookAt'],
                transitions: [
                    { to: 'talking', condition: () => this.params.isTalking, duration: 0.3 },
                    { to: 'reacting', condition: () => this.params.reactionPending, duration: 0.15 },
                    { to: 'gesture', condition: () => this.params.gesturePending, duration: 0.2 },
                ]
            },
            talking: {
                layers: ['basePose', 'talk', 'breathing', 'lookAt', 'lipSync'],
                transitions: [
                    { to: 'idle', condition: () => !this.params.isTalking, duration: 0.4 },
                    { to: 'reacting', condition: () => this.params.reactionPending, duration: 0.15 },
                ]
            },
            reacting: {
                layers: ['basePose', 'reaction', 'breathing', 'lookAt'],
                transitions: [
                    { to: 'idle', condition: () => this.params.reactionComplete, duration: 0.3 },
                    { to: 'talking', condition: () => this.params.isTalking, duration: 0.25 },
                ],
                // Auto-exit after reaction clip finishes
                autoExit: { to: 'idle', after: 'clipDuration' }
            },
            gesture: {
                layers: ['basePose', 'gesture', 'breathing', 'lookAt'],
                transitions: [
                    { to: 'idle', condition: () => this.params.gestureComplete, duration: 0.3 },
                    { to: 'talking', condition: () => this.params.isTalking, duration: 0.2 },
                ]
            },
            sleeping: {
                layers: ['basePose', 'sleep', 'breathingSleep'],
                transitions: [
                    { to: 'idle', condition: () => !this.params.isSleeping, duration: 1.0 },
                ]
            }
        };

        this.currentState = 'idle';
        this.params = {};
        this.transitionProgress = -1; // -1 = no transition active
        this.transitionDuration = 0;
        this.transitionTarget = null;
    }

    setParam(key, value) {
        this.params[key] = value;
    }

    update(dt) {
        // Check transitions from current state
        const state = this.states[this.currentState];
        if (this.transitionProgress < 0) {
            for (const trans of state.transitions) {
                if (trans.condition()) {
                    this._beginTransition(trans.to, trans.duration);
                    break;
                }
            }
        }

        // Update transition blend
        if (this.transitionProgress >= 0) {
            this.transitionProgress += dt / this.transitionDuration;
            if (this.transitionProgress >= 1.0) {
                this.currentState = this.transitionTarget;
                this.transitionProgress = -1;
            }
        }

        return this._getActiveLayers();
    }

    _beginTransition(target, duration) {
        this.transitionTarget = target;
        this.transitionDuration = duration;
        this.transitionProgress = 0;
    }

    _getActiveLayers() {
        const currentLayers = this.states[this.currentState].layers;
        if (this.transitionProgress < 0) {
            return currentLayers.map(l => ({ name: l, weight: 1.0 }));
        }

        // Blend between current and target state layers
        const targetLayers = this.states[this.transitionTarget].layers;
        const t = this.transitionProgress;
        const eased = 1 - Math.exp(-5 * t); // Exponential ease

        const result = [];
        const allLayers = new Set([...currentLayers, ...targetLayers]);
        for (const layer of allLayers) {
            const inCurrent = currentLayers.includes(layer);
            const inTarget = targetLayers.includes(layer);
            if (inCurrent && inTarget) {
                result.push({ name: layer, weight: 1.0 });
            } else if (inCurrent) {
                result.push({ name: layer, weight: 1.0 - eased });
            } else {
                result.push({ name: layer, weight: eased });
            }
        }
        return result;
    }
}
```

### Common Pitfalls in Animation State Machines

| Pitfall | Symptom | Prevention |
|---------|---------|-----------|
| **Infinite loops** | Character oscillates between two states | Add hysteresis (different enter/exit thresholds) |
| **Unreachable states** | Character gets stuck | Ensure every state has at least one exit transition |
| **Conflicting transitions** | Unpredictable state changes | Priority ordering on transitions |
| **Missing blends** | Popping between poses | Always specify transition duration > 0 |
| **State explosion** | Too many states to manage | Use hierarchical sub-machines |
| **Boolean soup** | Hundreds of boolean params | Use enum states + numeric params |

### References

- Unity Animation State Machine docs -- https://docs.unity3d.com/Manual/AnimationStateMachines.html
- Bobby Anguelov, "Separation of Concerns Architecture for AI and Animation" -- http://www.gameaipro.com/GameAIPro2/GameAIPro2_Chapter12_Separation_of_Concerns_Architecture_for_AI_and_Animation.pdf
- Unreal Engine Animation Blueprint -- https://uhiyama-lab.com/en/notes/ue/animbp-state-machine-blend-space-basic/
- "Advanced State Machines for Game Animation" -- https://www.numberanalytics.com/blog/advanced-state-machines-game-animation

---

## 16. Performance Profiling Methodology

**Priority:** CRITICAL -- must verify all systems stay within budget
**Effort:** 4-6h (setup), ongoing
**Impact:** Foundation for all other sections

### WebGL Animation Performance Budget

For our target hardware (Mac M2 Pro, RTX 5080, RTX 3070), the total frame budget at 60fps is 16.67ms. Animation should use no more than **2ms** of this:

| System | Budget | Typical | Notes |
|--------|--------|---------|-------|
| Procedural idle + breathing | 0.15ms | 0.08ms | noise1D + bone sets |
| Spring system (all springs) | 0.30ms | 0.15ms | 50-80 spring channels |
| Follow-through chains | 0.10ms | 0.04ms | 3 chains, ~42 springs |
| Eye animation + blinks | 0.05ms | 0.02ms | Noise + state machine |
| Micro-expressions | 0.02ms | 0.01ms | Rare events |
| Hand poses | 0.05ms | 0.03ms | 30 bones (if present) |
| IK (analytical, 2 chains) | 0.05ms | 0.02ms | Two-bone leg IK |
| State machine | 0.02ms | 0.01ms | Logic only |
| Bone mask filtering | 0.00ms | 0.00ms | One-time at clip load |
| CoG calculation | 0.10ms | 0.05ms | 10 getWorldPosition calls |
| **Animation subtotal** | **0.84ms** | **0.41ms** | Well within 2ms budget |
| AnimationMixer.update() | 0.30ms | 0.15ms | Three.js internal |
| vrm.update() | 0.50ms | 0.30ms | Constraints + spring bones |
| **Total animation pipeline** | **1.64ms** | **0.86ms** | Comfortable margin |

### GPU Skinning Constraints

Three.js performs GPU skinning via vertex shader uniforms or bone textures:

| Method | Bone Limit | Performance | Triggered When |
|--------|-----------|-------------|---------------|
| Uniform-based | ~27-59 bones* | Fastest | Default (small skeletons) |
| Bone texture | Unlimited | Slightly slower | Automatic when bone count > uniform limit |
| CPU skinning | Unlimited | Slowest (fallback) | Manual opt-in or WebGL1 on old devices |

*Depends on device: WebGL guarantees minimum 128 vec4 uniforms. Each bone = 4 vec4 (mat4). With other shader uniforms consuming ~20 vec4s, that leaves ~27 bones. Most desktop GPUs support 256+ vec4s (~59 bones). VRM models typically have 50-80 bones.

Three.js automatically creates a bone texture when `skeleton.update()` detects the bone count exceeds the uniform limit. This is seamless -- no code changes needed.

**Vertex weight limit:** Three.js limits each vertex to 4 bone influences. This is sufficient for VRM models but means high-deformation areas (shoulders, hips) may show artifacts if the source model relied on 8+ influences.

### Profiling Tools

```javascript
/**
 * Lightweight animation performance monitor.
 * Measures time spent in each animation subsystem per frame.
 *
 * Usage:
 *   const monitor = new AnimPerfMonitor();
 *   monitor.begin('springs');
 *   springManager.update(dt);
 *   monitor.end('springs');
 *   // ... repeat for each system
 *   monitor.report(); // Logs average times
 */
class AnimPerfMonitor {
    constructor() {
        this.timings = {};
        this.frameCount = 0;
        this.reportInterval = 300; // Report every 300 frames (5 seconds at 60fps)
    }

    begin(label) {
        if (!this.timings[label]) {
            this.timings[label] = { total: 0, max: 0, current: 0 };
        }
        this.timings[label].current = performance.now();
    }

    end(label) {
        const entry = this.timings[label];
        if (!entry) return;
        const elapsed = performance.now() - entry.current;
        entry.total += elapsed;
        entry.max = Math.max(entry.max, elapsed);
    }

    report() {
        this.frameCount++;
        if (this.frameCount % this.reportInterval !== 0) return;

        console.group('Animation Performance (avg ms/frame)');
        let totalAvg = 0;
        for (const [label, entry] of Object.entries(this.timings)) {
            const avg = entry.total / this.reportInterval;
            totalAvg += avg;
            console.log(`  ${label}: ${avg.toFixed(3)}ms avg, ${entry.max.toFixed(3)}ms max`);
            entry.total = 0;
            entry.max = 0;
        }
        console.log(`  TOTAL: ${totalAvg.toFixed(3)}ms avg`);
        console.groupEnd();
    }
}
```

### External Profiling Tools

| Tool | Purpose | How to Use |
|------|---------|-----------|
| **stats-gl** | Frame time, GPU time, memory | `import Stats from 'stats-gl'; stats.init(renderer);` |
| **Spector.js** | WebGL draw call inspector | Browser extension, captures frame |
| **Chrome DevTools Performance** | CPU profiling, flame graph | F12 -> Performance -> Record |
| **renderer.info** | Three.js render stats | Log `renderer.info.render.calls`, `.triangles` |
| **EXT_disjoint_timer_query** | GPU timing queries | Via WebGL extension (limited browser support) |

### Key Metrics to Watch

```javascript
// Log these periodically to detect performance regressions:
function logAnimationMetrics(renderer, mixer) {
    console.table({
        'Draw calls': renderer.info.render.calls,
        'Triangles': renderer.info.render.triangles,
        'Geometries': renderer.info.memory.geometries,
        'Textures': renderer.info.memory.textures,
        'Mixer actions': mixer._actions.length,
        'Active actions': mixer._actions.filter(a => a.isRunning()).length,
    });
}
```

### Performance Red Flags

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| Gradual FPS drop over time | Memory leak (growing arrays, uncleaned springs) | Check array lengths, remove expired springs |
| Stutter every few seconds | GC pressure from object allocation | Pre-allocate Vector3/Quaternion, reuse |
| Constant low FPS | Too many bones or IK iterations | Reduce IK iterations, skip inactive springs |
| GPU bottleneck (CPU idle) | Too many draw calls or overdraw | Check renderer.info, optimize materials |
| Spikes on state transitions | Inertialization capturing all bone poses | Lazy capture (only changed bones) |

### References

- Wonderland Engine profiling guide -- https://wonderlandengine.com/news/profiling-webxr-applications/
- Three.js Performance Tips -- https://threejs-journey.com/lessons/performance-tips
- "100 Three.js Tips" -- https://www.utsubo.com/blog/threejs-best-practices-100-tips
- WebGL Skinning fundamentals -- https://webglfundamentals.org/webgl/lessons/webgl-skinning.html

---

## 17. Implementation Priority Matrix

### Effort vs Impact Chart

```
Impact
10 |  [2]Easing    [12]Eyes .......... [7]Motion Match
   |                                    [9]Neural
 9 |  [1]Idle Enh  [11]Breathing
   |
 8 |  [3]Settle   [4]IK  [5]Layers [10]Follow-thru
   |  [13]Face    [15]StateMachine
 7 |  [8]Gestures  [6]CoG
   |
 6 |  [14]Hands
   |
   +--+--------+--------+--------+--------+-------
     4h       10h      20h      40h      60h+   Effort
```

### Recommended Implementation Order

| Phase | Items | Hours | Cumulative | Rationale |
|-------|-------|-------|------------|-----------|
| **Phase A** | 2 (Springs/Easing) + 3 (Settling) | 10-18h | 10-18h | Foundation. Everything else builds on spring math. |
| **Phase A+** | 12 (Eye Animation) + 11 (Breathing Enhancement) | 14-21h | 24-39h | Highest impact per hour. Eyes + breathing = "alive." |
| **Phase B** | 10 (Follow-Through) + 1 (Idle Enhancement) | 16-24h | 40-63h | Biggest visual bang. Uses springs from Phase A. |
| **Phase C** | 4a (VRMLookAt wiring) + 5 (Bone Masks) + 15 (State Machine) | 29-41h | 69-104h | Structural foundation for clip animation. |
| **Phase D** | 13 (Micro-Expressions) + 8 (Procedural Gestures) + 6 (CoG) | 30-48h | 99-152h | Emotional depth + unique character movement. |
| **Phase E** | 14 (Hands) + 4b (Foot IK) + 7 (Pose Library) | 56-84h | 155-236h | Polish. Requires Mixamo clip curation. |
| **Phase F** | 9 (Neural Motion) + 16 (Profiling) | 64-106h | 219-342h | Research-grade + ongoing measurement. |

### Quick Wins (< 4h each)

1. **Replace RIKO-style exponential decay with critically damped springs** in BasePoseLayer head/body targets (2h)
2. **Wire VRMLookAt to mouse cursor** for eye/head tracking (2h)
3. **Add shoulder/hip coupling to breathing** in BasePoseLayer (1h)
4. **Add springy overshoot to fidget transitions** in IdleBehaviorLayer (3h)
5. **Add microsaccadic eye jitter** via pink noise on lookLeft/lookRight expressions (2h)
6. **Add asymmetric blink curve** replacing current linear blink (1h)
7. **Emotion-driven blink rate** variation in existing blink system (2h)
8. **Add AnimPerfMonitor** to existing update loop for baseline measurement (1h)

---

## 18. RIKO Reference Analysis

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
| Breathing | None | Multi-axis noise-based | Already ahead; enhance with Section 11 |
| Weight shifting | None | Fidget-based | Enhance with CoG (Section 6) |
| Fidgets | None | 16+ personality-gated | Already ahead |
| Easing type | First-order exponential | First-order exponential (noise1D) | Upgrade to springs (Section 2) |
| Follow-through | None | None | Major opportunity (Section 10) |
| Bone layering | None | 6-layer AnimationDirector | Already ahead |
| Gesture variety | None | Clip-based + procedural | Enhance with components (Section 8) |
| Look-at | None | Deprecated LookAtLayer | Re-wire VRMLookAt (Section 4) |
| Spring physics | None (on primary) | None (on primary) | Major opportunity (Sections 2, 3) |
| Emotion response | Same params always | Personality-scaled | Enhance with springs |
| Eye animation | Simple blink cycle | Simple blink cycle | Major opportunity (Section 12) |
| Micro-expressions | None | None | Major opportunity (Section 13) |
| Hand poses | None | None | Opportunity if model supports (Section 14) |
| State machine | None (implicit) | Layer state machine | Formalize (Section 15) |
| Performance monitoring | None | None | Add profiling (Section 16) |

### Key Takeaway

RIKO proves that exponential easing + random targets + talk/idle mode switching creates a convincing baseline. Our system is already significantly more sophisticated. The biggest quality gaps are:

1. **Spring-based motion** (overshoot, settling, follow-through) which RIKO also lacks
2. **Eye animation** (saccades, microsaccades, asymmetric blinks)
3. **Breathing sophistication** (emotion-driven, multi-bone, asymmetric timing)

Implementing these three systems on our existing architecture would put us dramatically beyond RIKO quality and into territory comparable with commercial VTuber applications like VSeeFace and Warudo.

---

## Summary: What Makes Characters Feel Alive

In priority order of perceptual impact:

1. **Eye animation** (saccades, microsaccades, blinks, pupil) -- the absolute #1 connection signal
2. **Spring-based easing** (not linear, not exponential decay) -- velocity continuity is the quality floor
3. **Follow-through on the spine chain** -- head lag behind torso creates weight
4. **Breathing with multi-bone coupling** -- the foundation of "alive"
5. **Asymmetric blink curve + emotion-driven rate** -- dead eyes vs living eyes
6. **Overshoot on state transitions** -- momentum = weight = believability
7. **Eye tracking toward camera/cursor** -- instant connection with viewer
8. **Varied fidgets with personality gating** -- already implemented, enhance timing
9. **Weight shift with CoG compensation** -- groundedness
10. **Micro-expressions** -- fleeting emotional leaks create depth
11. **Layered clip playback** -- enables Mixamo clips for upper body while idle lower body
12. **Procedural gesture variety** -- each response feels unique
13. **Hand poses by emotion** -- tension reflects inner state
14. **Animation state machine** -- clean transitions, no popping
15. **Motion library** -- curated clips for emotional range

The math is simple. The springs are cheap. The eyes are everything. The difference is enormous.
