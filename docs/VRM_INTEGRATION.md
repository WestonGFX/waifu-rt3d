# VRM Integration Guide

## Overview

Waifu-RT3D renders 3D VRM anime avatars using Three.js and `@pixiv/three-vrm` inside an iframe-based viewer (`frontends/neon/viewer/viewer.html`). The viewer communicates with the main UI via `postMessage` — the frontend never touches Three.js directly.

---

## Supported Formats

- **VRM 0.x** — legacy format, auto-detected
- **VRM 1.x** — current standard, recommended
- **GLB / GLTF** — basic mesh rendering (no VRM-specific features)

Place model files in `backend/storage/avatars/`. They appear automatically in the character creator's model dropdown.

---

## Architecture

```
Main UI (index.html)
    │
    │  postMessage({ type: 'loadModel', url: '/api/avatars/file.vrm' })
    │  postMessage({ type: 'setExpression', expression: 'happy', weight: 0.8 })
    │  postMessage({ type: 'playGesture', gesture: 'wave' })
    │  postMessage({ type: 'setPersonality', payload: { energy: 0.8, ... } })
    ▼
Viewer iframe (viewer.html)
    │
    ├── Three.js scene (WebGL renderer, camera, lighting)
    ├── VRM model (loaded via GLTFLoader + VRMLoaderPlugin)
    ├── AnimationDirector (6-layer procedural animation pipeline)
    ├── AudioLipSync (FFT-based multi-band viseme driver)
    ├── ExpressionController (emotion blend shape manager)
    └── BlinkController (automatic blink timing)
```

### PostMessage API

The viewer iframe accepts commands via `window.postMessage()`. The `ViewerBridge` component (`frontends/neon/js/components/ViewerBridge.js`) wraps these calls.

| Message Type | Payload | Description |
|-------------|---------|-------------|
| `loadModel` | `{ url }` | Load a VRM/GLB model |
| `setExpression` | `{ expression, weight, duration }` | Set facial expression |
| `playGesture` | `{ gesture }` | Play a triggered animation |
| `playGestureSequence` | `{ gestures }` | Play multiple gestures in sequence |
| `setPersonality` | `{ energy, confidence, nervousness, expressiveness, playfulness }` | Set personality profile for animation |
| `setBackground` | `{ mode, value }` | Change background (color/image/transparent) |
| `captureScreenshot` | — | Export current viewport as PNG |
| `setGlowIntensity` | `{ value }` | Set glow effect intensity |
| `setFPSCap` | `{ value }` | Set max frame rate |
| `toggleFPSOverlay` | `{ visible }` | Show/hide FPS counter |

---

## 6-Layer Animation Pipeline

The `AnimationDirector` orchestrates 6 procedural animation layers per frame. Each layer either **sets** bone rotations or **adds** to them, with suppression rules preventing conflicts.

### Layer Stack

| Layer | Name | Blend Mode | Suppression |
|-------|------|-----------|-------------|
| L0 | BasePose | SET | Never suppressed |
| L1 | IdleBehavior | SET | Suppressed by L3 (Talk) and L4 (Gesture) |
| L2 | Emotion | ADDITIVE | Never suppressed |
| L3 | Talk | SET | Suppressed by L4 (Gesture) |
| L4 | Gesture | SET | Never suppressed (highest priority SET) |
| L5 | LookAt | ADDITIVE | Never suppressed (always applied) |

### Personality Profiles

Each character has 5 personality floats (0–1) that scale animation parameters:

- **Energy**: movement speed, breathing rate, fidget frequency
- **Confidence**: posture straightness, gesture width, forward lean
- **Nervousness**: breathing irregularity, hand closeness, fidget rate
- **Expressiveness**: emotion amplitude, gesture scale, head movement range
- **Playfulness**: unlocks fun fidgets (peace sign, hair twirl, hip cock), transforms anger → pout

Default profile: `{ energy: 0.5, confidence: 0.5, nervousness: 0.3, expressiveness: 0.5, playfulness: 0.5 }`

### L0 BasePose

Continuous breathing animation. Personality scales:
- `energy` → breathing rate (faster when high)
- `nervousness` → breathing irregularity
- `confidence` → spine straightness and shoulder width

### L1 IdleBehavior

22 personality-gated fidgets on random timers (3–8 seconds, scaled by energy):

- Hair twirl (playfulness > 0.5)
- Hip cock (confidence > 0.6)
- Peace sign (playfulness > 0.7)
- Head tilt, shoulder roll, arm cross, etc.
- Each fidget has personality gates — it only fires if the character's traits allow it

### L2 Emotion

Additive posture modifiers based on current emotion:

| Emotion | Posture Effect |
|---------|---------------|
| Happy | Slight bounce, head up, chest forward |
| Sad | Slouch, head down, shoulders inward |
| Angry | Tense posture, slight forward lean (or pouty sway if playfulness > 0.6) |
| Surprised | Lean back, head up |
| Confused | Head tilt, asymmetric shoulders |
| Thinking | Hand near chin, head tilt |

### L3 Talk

Active during speech. Adds illustrative hand movements and periodic head nods:
- `confidence` → wider hand gestures
- `nervousness` → hands stay closer to body
- `expressiveness` → more dramatic head movement

### L4 Gesture

14 triggered animations with 3-phase blend envelope (attack → sustain → release):
- wave, bow, dance, clap, think, nod, shrug, point, peace, heart, fist pump, spin, salute, laugh
- `expressiveness` scales amplitude

### L5 LookAt

Always active, always additive:
- **Mouse active**: VRM head/eyes track cursor position
- **Mouse idle**: gaze wanders with natural saccades
- Smoothly blends between mouse tracking and idle wander

---

## Lip Sync

The `AudioLipSync` class performs real-time FFT analysis on TTS audio to drive mouth visemes:

1. Audio buffer → Web Audio API AnalyserNode
2. FFT frequency data split into 3 bands:
   - **Low band** (< 500 Hz) → `aa` viseme (open mouth)
   - **Mid band** (500–2000 Hz) → `ou` viseme (rounded mouth)
   - **High band** (> 2000 Hz) → `ee` viseme (wide mouth)
3. Smoothed amplitude values drive VRM blend shapes each frame

---

## Expression System

The `ExpressionController` manages emotion blend shapes with smooth transitions:

- Supported emotions: `happy`, `sad`, `angry`, `surprised`, `confused`, `thinking`, `neutral`
- Transitions use configurable duration (default 300ms)
- Multiple expressions can blend (e.g., 70% happy + 30% surprised)
- The LLM's emotion tag in each response triggers expression changes

---

## Camera Presets

Three built-in camera positions with smooth tween transitions:

| Preset | Camera Y | Camera Z | Look-at Y | Use Case |
|--------|----------|----------|-----------|----------|
| Full Body | 1.0 | 3.5 | 0.9 | See full character |
| Bust | 1.3 | 2.0 | 1.2 | Conversation view |
| Face | 1.5 | 1.2 | 1.45 | Close-up portrait |

---

## Adding Custom VRM Models

### Requirements

- VRM 0.x or 1.x format
- Humanoid rig with standard bone names
- Recommended blend shapes: `happy`, `sad`, `angry`, `surprised`, `neutral`, `blink`, `a`, `i`, `u`, `e`, `o`

### Steps

1. Place the `.vrm` file in `backend/storage/avatars/`
2. Open the character creator or settings
3. Select the model from the dropdown
4. The viewer auto-applies A-pose correction on load

### A-Pose Correction

VRM models typically load in T-pose. The viewer automatically rotates arms down to a natural A-pose:
- Left arm: `z = -0.7` radians
- Right arm: `z = +0.7` radians
- Positive Z rotation raises the arm (right-hand rule)

---

## Lighting

Default 3-point lighting setup:

- **Key light**: DirectionalLight from upper-right
- **Fill light**: DirectionalLight from left
- **Ambient**: soft global illumination

Optional disco/party mode adds 3 RGB PointLights with hue cycling.

Shadow quality is configurable: Off (default for performance), Soft (PCF), or Sharp.

---

## Performance Tips

- Use VRM models under 20MB for best load times
- The FPS cap setting prevents unnecessary GPU usage (default: uncapped)
- Shadow quality "off" gives the best frame rate
- The `will-change: transform` CSS fix prevents flickering on Apple Silicon
- Bone rotation deltas are capped at 0.1 rad/frame to prevent jitter
