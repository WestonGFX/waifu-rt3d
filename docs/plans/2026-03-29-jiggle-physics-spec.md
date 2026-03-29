# Jiggle Physics Implementation Spec

**Date:** 2026-03-29
**Research:** `docs/research/2026-03-29-jiggle-physics-research.md`
**Schema Migration:** v61 → v62

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Phase 1: Core Spring Bone Jiggle (Quick Win)](#2-phase-1-core-spring-bone-jiggle)
3. [Phase 2: UI Controls + Backend Persistence](#3-phase-2-ui-controls--backend-persistence)
4. [Phase 3: Per-Character Profiles + Body Part Controls](#4-phase-3-per-character-profiles--body-part-controls)
5. [Phase 4: Animation State + Emotion Integration](#5-phase-4-animation-state--emotion-integration)
6. [Phase 5: Bone Injection for Missing Models](#6-phase-5-bone-injection-for-missing-models)
7. [Phase 6: Advanced — Morph Target Enhancement](#7-phase-6-advanced--morph-target-enhancement)
8. [Bone Detection Code](#8-bone-detection-code)
9. [Parameter Presets](#9-parameter-presets)
10. [Schema Changes](#10-schema-changes)
11. [Content Controls](#11-content-controls)
12. [Effort Summary](#12-effort-summary)

---

## 1. Architecture Overview

```
┌───────────────────────────────────────────────────────────────┐
│                      viewer.html                              │
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │              JigglePhysicsManager (new class)           │  │
│  │                                                         │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │  │
│  │  │ BreastCtrl   │  │ ButtCtrl     │  │ ThighCtrl    │  │  │
│  │  │ - jointIdxs  │  │ - jointIdxs  │  │ - jointIdxs  │  │  │
│  │  │ - baseParams │  │ - baseParams │  │ - baseParams │  │  │
│  │  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  │  │
│  │         │                 │                  │          │  │
│  │         ▼                 ▼                  ▼          │  │
│  │  ┌──────────────────────────────────────────────────┐   │  │
│  │  │     VRM SpringBoneManager (existing, lines       │   │  │
│  │  │     5997-6026 of viewer.html)                    │   │  │
│  │  │     - joints[]  - colliderGroups[]               │   │  │
│  │  │     - update(delta) called at line 6026          │   │  │
│  │  └──────────────────────────────────────────────────┘   │  │
│  │                                                         │  │
│  │  postMessage API (new commands):                        │  │
│  │  - setJiggleEnabled   { enabled: bool }                 │  │
│  │  - setJiggleIntensity { intensity: 0-1, bodyPart? }     │  │
│  │  - setJigglePreset    { preset: 'subtle'|...|'extreme' }│  │
│  │  - setJiggleProfile   { breast:{}, butt:{}, thigh:{} }  │  │
│  │  - getJiggleInfo      → { detected: {...}, active }     │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                               │
│  ┌────────────────────────────────┐  ┌─────────────────────┐  │
│  │  viewerStore.ts (mediator)    │  │  Backend API         │  │
│  │  - setJiggleEnabled()         │  │  GET/PUT /api/chars/ │  │
│  │  - setJiggleIntensity()       │  │    {id}/physics      │  │
│  │  - setJigglePreset()          │  │  GET /api/config/    │  │
│  │  - jiggleInfo (state)         │  │    jiggle_defaults   │  │
│  └────────────────────────────────┘  └─────────────────────┘  │
│                                                               │
│  ┌────────────────────────────────────────────────────────┐   │
│  │  JigglePhysicsPanel.tsx (new, inside SettingsView)     │   │
│  │  - Master toggle + intensity slider                    │   │
│  │  - Per-body-part sliders (breast/butt/thigh)           │   │
│  │  - Per-character override dropdown                     │   │
│  │  - Preset selector (5 tiers)                           │   │
│  │  - Behavior checkboxes (movement, breathing, emotion)  │   │
│  └────────────────────────────────────────────────────────┘   │
└───────────────────────────────────────────────────────────────┘
```

---

## 2. Phase 1: Core Spring Bone Jiggle

**Goal:** Detect breast bones on model load, apply physics presets, expose postMessage API.
**Effort:** 2-3 hours (AI-assisted)

### Files to Modify

| File | Change |
|------|--------|
| `frontends/shared/viewer/viewer.html` | Add `JigglePhysicsManager` class (~200 lines), bone detection, postMessage handlers |

### 2.1 JigglePhysicsManager Class

Add after the existing spring bone API section (~line 7690 in viewer.html), inside the `<script type="module">` block:

```javascript
/**
 * Manages jiggle physics for breast, butt, and thigh bones by wrapping
 * the VRM SpringBoneManager with presets, intensity scaling, and
 * per-body-part controls.
 *
 * Integrates with the existing spring bone API (getSpringBoneInfo,
 * setSpringBoneParams) — does NOT replace it, just adds a higher-level
 * abstraction on top.
 */
class JigglePhysicsManager {
    constructor() {
        /** @type {boolean} */
        this.enabled = false;
        /** @type {string} Current preset name */
        this.preset = 'natural';
        /** @type {number} Master intensity 0-1 */
        this.intensity = 0.5;
        /** @type {{ breast: number[], butt: number[], thigh: number[] }} Joint indices by body part */
        this.bodyPartJoints = { breast: [], butt: [], thigh: [] };
        /** @type {{ breast: number, butt: number, thigh: number }} Per-body-part intensity 0-1 */
        this.bodyPartIntensity = { breast: 0.65, butt: 0.40, thigh: 0.20 };
        /** @type {Map<number, {stiffness:number,drag:number,gravityPower:number}>} Original params before jiggle override */
        this._originalParams = new Map();
        /** @type {number} Emotion multiplier from MoodEngine (1.0 = neutral) */
        this.emotionMultiplier = 1.0;
        /** @type {number} Movement multiplier from AnimationDirector state */
        this.movementMultiplier = 1.0;
    }

    /**
     * Scan the VRM's spring bone joints for breast/butt/thigh bones.
     * Must be called after model load.
     *
     * @param {object} vrm - The loaded VRM instance
     * @returns {{ breast: string[], butt: string[], thigh: string[] }} Detected bone names by body part
     */
    detectBones(vrm) { /* ... see Section 8 ... */ }

    /**
     * Apply the current preset + intensity to all detected jiggle bones.
     *
     * @param {object} vrm - The loaded VRM instance
     */
    applyParams(vrm) { /* ... */ }

    /**
     * Store original spring bone params so they can be restored on disable.
     *
     * @param {object} vrm - The loaded VRM instance
     */
    saveOriginalParams(vrm) { /* ... */ }

    /**
     * Restore original spring bone params (undo jiggle overrides).
     *
     * @param {object} vrm - The loaded VRM instance
     */
    restoreOriginalParams(vrm) { /* ... */ }
}

let jiggleManager = new JigglePhysicsManager();
```

### 2.2 Hook into Model Load

In the existing `loadVRM()` or model-load handler in viewer.html, after `currentVrm` is set and `vrm.update()` is first called:

```javascript
// After VRM model is fully loaded and spring bones initialized:
jiggleManager = new JigglePhysicsManager();
const detected = jiggleManager.detectBones(currentVrm);
console.log('[Viewer] Jiggle bone detection:', detected);

// Auto-enable if breast bones found and user has jiggle enabled
if (detected.breast.length > 0 && jiggleManager.enabled) {
    jiggleManager.saveOriginalParams(currentVrm);
    jiggleManager.applyParams(currentVrm);
}

// Report detection to parent frame
window.parent.postMessage({
    type: 'jiggleDetection',
    detected,
    jointCount: {
        breast: jiggleManager.bodyPartJoints.breast.length,
        butt: jiggleManager.bodyPartJoints.butt.length,
        thigh: jiggleManager.bodyPartJoints.thigh.length,
    }
}, '*');
```

### 2.3 postMessage API Handlers

Add to the existing `window.addEventListener('message', ...)` handler chain:

```javascript
// ── Jiggle Physics API ──────────────────────────
else if (type === 'setJiggleEnabled') {
    jiggleManager.enabled = !!payload?.enabled;
    if (currentVrm) {
        if (jiggleManager.enabled) {
            jiggleManager.saveOriginalParams(currentVrm);
            jiggleManager.applyParams(currentVrm);
        } else {
            jiggleManager.restoreOriginalParams(currentVrm);
        }
    }
}
else if (type === 'setJiggleIntensity') {
    // payload: { intensity: 0-1, bodyPart?: 'breast'|'butt'|'thigh' }
    if (payload?.bodyPart && payload.bodyPart in jiggleManager.bodyPartIntensity) {
        jiggleManager.bodyPartIntensity[payload.bodyPart] = payload.intensity;
    } else {
        jiggleManager.intensity = payload?.intensity ?? 0.5;
    }
    if (jiggleManager.enabled && currentVrm) {
        jiggleManager.applyParams(currentVrm);
    }
}
else if (type === 'setJigglePreset') {
    // payload: { preset: 'subtle'|'natural'|'anime'|'bouncy'|'extreme' }
    jiggleManager.preset = payload?.preset || 'natural';
    if (jiggleManager.enabled && currentVrm) {
        jiggleManager.applyParams(currentVrm);
    }
}
else if (type === 'setJiggleProfile') {
    // payload: { breast?: {stiffness,drag,gravityPower}, butt?: {...}, thigh?: {...} }
    // Direct parameter override (for per-character profiles)
    if (payload?.breast) jiggleManager._customBreast = payload.breast;
    if (payload?.butt) jiggleManager._customButt = payload.butt;
    if (payload?.thigh) jiggleManager._customThigh = payload.thigh;
    if (jiggleManager.enabled && currentVrm) {
        jiggleManager.applyParams(currentVrm);
    }
}
else if (type === 'getJiggleInfo') {
    window.parent.postMessage({
        type: 'jiggleInfo',
        enabled: jiggleManager.enabled,
        preset: jiggleManager.preset,
        intensity: jiggleManager.intensity,
        bodyPartIntensity: { ...jiggleManager.bodyPartIntensity },
        detected: {
            breast: jiggleManager.bodyPartJoints.breast.length,
            butt: jiggleManager.bodyPartJoints.butt.length,
            thigh: jiggleManager.bodyPartJoints.thigh.length,
        },
    }, '*');
}
else if (type === 'setJiggleEmotionMultiplier') {
    // payload: { multiplier: number } — from MoodEngine via viewerStore
    jiggleManager.emotionMultiplier = payload?.multiplier ?? 1.0;
    if (jiggleManager.enabled && currentVrm) {
        jiggleManager.applyParams(currentVrm);
    }
}
else if (type === 'setJiggleMovementMultiplier') {
    // payload: { multiplier: number } — from AnimationDirector state
    jiggleManager.movementMultiplier = payload?.multiplier ?? 1.0;
    if (jiggleManager.enabled && currentVrm) {
        jiggleManager.applyParams(currentVrm);
    }
}
```

---

## 3. Phase 2: UI Controls + Backend Persistence

**Goal:** Settings panel with master toggle, intensity slider, preset selector. Persist global jiggle settings in `app.json` config.
**Effort:** 2-3 hours (AI-assisted)

### Files to Modify

| File | Change |
|------|--------|
| `frontends/sakura/src/components/JigglePhysicsPanel.tsx` | **NEW** — UI component |
| `frontends/sakura/src/views/SettingsView.tsx` | Add 'physics' tab to `TABS` array, render `JigglePhysicsPanel` |
| `frontends/sakura/src/stores/viewerStore.ts` | Add jiggle postMessage wrappers |
| `backend/config/app.json` | Add `jiggle` config section with defaults |
| `backend/server.py` | Serve/save jiggle config via existing config endpoints |

### 3.1 SettingsView Tab Addition

In `frontends/sakura/src/views/SettingsView.tsx`:

```typescript
// Line 64: Add 'physics' to the union type
type SettingsTab = 'general' | 'character' | 'brain' | 'voice' | 'safety'
                 | 'aiart' | 'system' | 'tts_models' | 'lm_models' | 'physics';

// Line 72-82: Add to TABS array (after 'system', before 'tts_models')
{ id: 'physics', label: 'Physics', icon: <Zap size={15} /> },
```

### 3.2 JigglePhysicsPanel Component

New file: `frontends/sakura/src/components/JigglePhysicsPanel.tsx`

```
┌─── Jiggle Physics ─────────────────────────────────┐
│                                                      │
│  ☑ Enable Jiggle Physics            [Master Toggle]  │
│                                                      │
│  Preset: [ Subtle | Natural | Anime | Bouncy | Max ] │
│          (segmented button group, Natural selected)   │
│                                                      │
│  Intensity: ──────●────────────── 0.50               │
│            (range slider, 0.0 to 1.0, step 0.05)     │
│                                                      │
│  ▸ Per-Body-Part                                     │
│  │  Breast: ────────●────────── 0.65                 │
│  │  Butt:   ──────●──────────── 0.40                 │
│  │  Thigh:  ────●──────────────  0.20                │
│                                                      │
│  ▸ Behavior                                          │
│  │  ☑ Respond to movement (walk/run/jump)            │
│  │  ☑ Respond to breathing                           │
│  │  ☑ Respond to character emotions                  │
│  │  ☐ Respond to touch (requires touch module)       │
│                                                      │
│  ⓘ No breast bones detected on current model.       │
│    Physics will auto-activate when a compatible      │
│    model is loaded.                                  │
│                                                      │
│  [Reset to Defaults]                                 │
└──────────────────────────────────────────────────────┘
```

Key behaviors:
- On mount, send `getJiggleInfo` to viewer iframe and listen for `jiggleInfo` response
- Toggle/slider changes send `setJiggleEnabled`, `setJiggleIntensity`, `setJigglePreset` to viewer
- Settings saved to backend via `PUT /api/config` under `jiggle` key
- Show bone detection status ("2 breast bones detected" or warning if none)

### 3.3 viewerStore Wrappers

Add to `frontends/sakura/src/stores/viewerStore.ts`:

```typescript
/**
 * Enable or disable jiggle physics in the 3D viewer.
 *
 * @param enabled - Whether jiggle physics should be active.
 */
setJiggleEnabled: (enabled: boolean) => void;

/**
 * Set jiggle intensity (master or per-body-part).
 *
 * @param intensity - Value from 0.0 (off) to 1.0 (maximum).
 * @param bodyPart - Optional: 'breast', 'butt', or 'thigh' for per-part control.
 */
setJiggleIntensity: (intensity: number, bodyPart?: 'breast' | 'butt' | 'thigh') => void;

/**
 * Apply a named jiggle preset.
 *
 * @param preset - One of: 'subtle', 'natural', 'anime', 'bouncy', 'extreme'.
 */
setJigglePreset: (preset: string) => void;
```

Implementation: each method does `postToViewer({ type: 'setJiggle...', ...payload })`.

### 3.4 app.json Config Defaults

Add to `backend/config/app.json`:

```json
{
  "jiggle": {
    "enabled": false,
    "preset": "natural",
    "intensity": 0.5,
    "body_parts": {
      "breast": 0.65,
      "butt": 0.40,
      "thigh": 0.20
    },
    "behavior": {
      "respond_to_movement": true,
      "respond_to_breathing": true,
      "respond_to_emotions": true,
      "respond_to_touch": false
    }
  }
}
```

---

## 4. Phase 3: Per-Character Profiles + Body Part Controls

**Goal:** Store per-character physics profiles in SQLite. Characters can override global settings based on body type.
**Effort:** 2-3 hours (AI-assisted)

### Files to Modify

| File | Change |
|------|--------|
| `backend/preflight.py` | v62 migration — `character_physics_profiles` table |
| `backend/server.py` | `GET/PUT /api/characters/{id}/physics` endpoints |
| `frontends/sakura/src/components/JigglePhysicsPanel.tsx` | Per-character override dropdown |
| `frontends/sakura/src/views/SettingsView.tsx` | Wire character selector to physics panel |

### 4.1 Per-Character Override UI

Added to the bottom of `JigglePhysicsPanel.tsx`:

```
┌─── Per-Character Overrides ────────────────────────┐
│                                                      │
│  Character: [Dae         ▼]                          │
│  Override:  ( ) Use Global  (●) Custom               │
│                                                      │
│  Body Type: [ Athletic   ▼]                          │
│    (petite / average / athletic / curvy / voluptuous) │
│                                                      │
│  Breast:  ────────●────────── 0.50                   │
│  Butt:    ──────●──────────── 0.40                   │
│  Thigh:   ──●──────────────── 0.20                   │
│                                                      │
│  [Save Override]  [Clear Override]                    │
└──────────────────────────────────────────────────────┘
```

### 4.2 Body Type Multipliers

Applied on top of the preset base values. See Section 9 for the full table.

```javascript
const BODY_TYPE_MULTIPLIERS = {
    petite:     { stiffness: 1.3, gravity: 0.7, drag: 1.25 },
    average:    { stiffness: 1.0, gravity: 1.0, drag: 1.0  },
    athletic:   { stiffness: 1.2, gravity: 0.8, drag: 1.25 },
    curvy:      { stiffness: 0.7, gravity: 1.2, drag: 0.75 },
    voluptuous: { stiffness: 0.5, gravity: 1.4, drag: 0.625 },
};
```

---

## 5. Phase 4: Animation State + Emotion Integration

**Goal:** Jiggle physics responds dynamically to AnimationDirector state and MoodEngine emotion.
**Effort:** 2-3 hours (AI-assisted)

### Files to Modify

| File | Change |
|------|--------|
| `frontends/shared/viewer/viewer.html` | Hook `AnimationDirector.state` changes into `jiggleManager.movementMultiplier` |
| `frontends/sakura/src/stores/viewerStore.ts` | Forward `emotionState` from chat/mood to viewer jiggle |
| `frontends/sakura/src/stores/chatStore.ts` | On mood change, send `setJiggleEmotionMultiplier` |

### 5.1 AnimationDirector State → Movement Multiplier

In the `AnimationDirector.update()` method or state transition handler in viewer.html:

```javascript
/**
 * Maps the current AnimationDirector state to a jiggle physics
 * movement multiplier. Called on each state transition.
 *
 * @param {string} state - Current animation state name
 * @returns {{ stiffness: number, gravity: number, duration: number }}
 */
const MOVEMENT_MULTIPLIERS = {
    idle:    { stiffnessMul: 1.0, gravityMul: 1.0  },
    talk:    { stiffnessMul: 0.9, gravityMul: 1.05 },
    gesture: { stiffnessMul: 0.7, gravityMul: 1.1  },
    clip:    { stiffnessMul: 0.6, gravityMul: 1.3  },  // active animation
    mocap:   { stiffnessMul: 0.8, gravityMul: 1.0  },
};

// In AnimationDirector state transition:
if (jiggleManager.enabled) {
    const mul = MOVEMENT_MULTIPLIERS[newState] || MOVEMENT_MULTIPLIERS.idle;
    jiggleManager.movementMultiplier = mul.stiffnessMul;
    // Gravity handled separately to allow smooth transition
    jiggleManager._gravityMovementMul = mul.gravityMul;
    jiggleManager.applyParams(currentVrm);
}
```

### 5.2 MoodEngine Emotion → Emotion Multiplier

Emotion state flows: `chatStore` receives mood from backend → sends to `viewerStore` → viewer iframe.

| Emotion State | Intensity Multiplier | Notes |
|--------------|---------------------|-------|
| `calm` | 0.8 | Slower, gentler movements |
| `happy` / `excited` | 1.2 | More energetic body language |
| `embarrassed` | 0.6 | Tends to hold still |
| `laughing` | 1.4 | Rhythmic body shaking — uses burst mode |
| `angry` | 1.1 | Quick, sharp movements |
| `sleepy` | 0.5 | Minimal movement |
| `flirty` | 1.3 | Deliberate, exaggerated sway — increase drag slightly |
| `neutral` | 1.0 | Baseline |

In `chatStore.ts`, when processing mood response from backend:

```typescript
// After updating character mood state:
const emotionMultiplier = EMOTION_JIGGLE_MAP[moodState] ?? 1.0;
useViewerStore.getState().postToViewer({
    type: 'setJiggleEmotionMultiplier',
    multiplier: emotionMultiplier,
});
```

---

## 6. Phase 5: Bone Injection for Missing Models

**Goal:** Programmatically add breast spring bones to VRM models that lack them.
**Effort:** 3-4 hours (AI-assisted)

### Files to Modify

| File | Change |
|------|--------|
| `frontends/shared/viewer/viewer.html` | `injectBreastBones()` function, collider setup, registration with SpringBoneManager |

### 6.1 Bone Injection Logic

Called when `detectBones()` finds zero breast bones but user has jiggle enabled:

```javascript
/**
 * Programmatically add breast bones to a VRM model that lacks them.
 * Creates L/R bone chains as children of the chest/upperChest bone,
 * registers them with the SpringBoneManager, and adds a chest collider
 * to prevent clipping.
 *
 * @param {object} vrm - The loaded VRM instance
 * @returns {{ breastL: THREE.Bone, breastR: THREE.Bone } | null} Created bones, or null if injection failed
 */
function injectBreastBones(vrm) {
    const chest = vrm.humanoid.getNormalizedBoneNode('upperChest')
                || vrm.humanoid.getNormalizedBoneNode('chest');
    if (!chest) return null;

    const sbm = vrm.springBoneManager;
    if (!sbm) return null;

    // Left breast chain
    const breastL = new THREE.Bone();
    breastL.name = 'Breast_L_injected';
    breastL.position.set(0.08, 0.0, 0.04);
    chest.add(breastL);

    const breastLEnd = new THREE.Bone();
    breastLEnd.name = 'Breast_L_end';
    breastLEnd.position.set(0.0, -0.05, 0.05);
    breastL.add(breastLEnd);

    // Right breast chain (mirrored)
    const breastR = new THREE.Bone();
    breastR.name = 'Breast_R_injected';
    breastR.position.set(-0.08, 0.0, 0.04);
    chest.add(breastR);

    const breastREnd = new THREE.Bone();
    breastREnd.name = 'Breast_R_end';
    breastREnd.position.set(0.0, -0.05, 0.05);
    breastR.add(breastREnd);

    // Create spring bone joints with natural preset defaults
    const jointSettings = {
        stiffness: 0.8,
        gravityPower: 0.5,
        gravityDir: new THREE.Vector3(0, -1, 0),
        dragForce: 0.4,
        hitRadius: 0.04,
    };

    // Add chest collider to prevent clipping
    // (Uses VRM 1.0 sphere collider shape)
    // ... register joints + collider with sbm ...

    sbm.setInitState();
    console.log('[Viewer] Injected breast bones on model without them');
    return { breastL, breastR };
}
```

### 6.2 UI Feedback

When bones are injected, the `jiggleDetection` postMessage includes `injected: true` so the UI can show:

> "Breast bones were added automatically. Physics quality may vary — models with native breast bones work best."

---

## 7. Phase 6: Advanced — Morph Target Enhancement

**Goal:** Supplement bone-based jiggle with morph target blending for models that have breast blend shapes.
**Effort:** 4-5 hours (AI-assisted)

### Files to Modify

| File | Change |
|------|--------|
| `frontends/shared/viewer/viewer.html` | `MorphJiggleDriver` class, morph target detection, blend weight calculation |

### Approach

After spring bone physics runs, sample the bone displacement from rest position and map it to morph target blend weights. This produces smoother, more natural mesh deformation than bones alone.

```
Spring Bone Position Delta → Morph Target Weights
    delta.y < 0  →  breast_bounce_down_L: clamp(|delta.y| * 10, 0, 1)
    delta.y > 0  →  breast_bounce_up_L:   clamp(delta.y * 10, 0, 1)
    delta.x < 0  →  breast_bounce_left_L: clamp(|delta.x| * 10, 0, 1)
    delta.x > 0  →  breast_bounce_right_L: clamp(delta.x * 10, 0, 1)
```

This phase is model-dependent — only activates when morph targets are detected. Most VRoid models only have facial blend shapes, so this is opt-in for custom models.

---

## 8. Bone Detection Code

This is the core detection algorithm used by `JigglePhysicsManager.detectBones()`. It scans all spring bone joints by bone name and categorizes them.

```javascript
/**
 * Comprehensive bone name patterns for body jiggle physics.
 * Covers VRM standard, VRoid Studio (JP + EN), Blender conventions,
 * and MMD-style Japanese names.
 *
 * Each pattern is a case-insensitive regex tested against joint.bone.name.
 */
const JIGGLE_BONE_PATTERNS = {
    breast: [
        // VRM standard
        /^Breast[_.]?[LR]$/i,
        /^Breast[_.]?(Left|Right)$/i,
        // VRoid Studio (Japanese naming)
        /^J_Sec_[LR]_Bust\d?$/i,
        // VRoid Studio (English naming)
        /^J_Sec_(Left|Right)_Bust\d?$/i,
        // Blender exports
        /^breast[_.]?[lr]$/i,
        /^breast[_.]?(left|right)$/i,
        // MMD / Japanese
        /^[左右]胸$/,
        // Generic patterns (loose match)
        /bust[_.]?[lr]\d?$/i,
        /boob[_.]?[lr]\d?$/i,
        /chest[_.]?jiggle[_.]?[lr]$/i,
        // Injected by our bone injection system
        /^Breast_[LR]_injected$/i,
    ],
    butt: [
        /^Butt[_.]?[LR]$/i,
        /^Butt[_.]?(Left|Right)$/i,
        /^J_Sec_[LR]_Butt\d?$/i,
        /^hip[_.]?jiggle[_.]?[lr]$/i,
        /^ass[_.]?[lr]$/i,
        /^glute[_.]?[lr]$/i,
    ],
    thigh: [
        /^ThighJiggle[_.]?[LR]$/i,
        /^ThighJiggle[_.]?(Left|Right)$/i,
        /^J_Sec_[LR]_Thigh\d?$/i,
        /^leg[_.]?jiggle[_.]?[lr]$/i,
        /^upper[_.]?leg[_.]?jiggle[_.]?[lr]$/i,
    ],
};

/**
 * Scan the VRM's spring bone joints to categorize which ones control
 * breast, butt, and thigh jiggle. Stores joint indices in
 * this.bodyPartJoints for later parameter application.
 *
 * @param {object} vrm - The loaded VRM instance with springBoneManager
 * @returns {{ breast: string[], butt: string[], thigh: string[] }}
 *          Detected bone names by body part (for UI display)
 */
detectBones(vrm) {
    const sbm = vrm?.springBoneManager;
    if (!sbm?.joints) {
        return { breast: [], butt: [], thigh: [] };
    }

    const result = { breast: [], butt: [], thigh: [] };
    this.bodyPartJoints = { breast: [], butt: [], thigh: [] };

    sbm.joints.forEach((joint, index) => {
        const name = joint.bone?.name || '';
        if (!name) return;

        for (const [part, patterns] of Object.entries(JIGGLE_BONE_PATTERNS)) {
            for (const pattern of patterns) {
                if (pattern.test(name)) {
                    this.bodyPartJoints[part].push(index);
                    result[part].push(name);
                    return; // Stop after first match for this joint
                }
            }
        }
    });

    console.log('[JigglePhysics] Detected bones:', {
        breast: result.breast,
        butt: result.butt,
        thigh: result.thigh,
    });

    return result;
}
```

### Fallback: Hierarchy-Based Detection

If regex matching finds zero breast bones, try hierarchy-based detection:

```javascript
/**
 * Fallback: detect breast bones by parent hierarchy rather than name.
 * Looks for spring bone joints whose bone is a direct child of
 * chest or upperChest, with roughly horizontal offset from center.
 *
 * @param {object} vrm - The loaded VRM instance
 * @returns {number[]} Joint indices that are likely breast bones
 */
detectBreastByHierarchy(vrm) {
    const chest = vrm.humanoid.getNormalizedBoneNode('upperChest')
                || vrm.humanoid.getNormalizedBoneNode('chest');
    if (!chest) return [];

    const sbm = vrm.springBoneManager;
    const candidates = [];

    sbm.joints.forEach((joint, index) => {
        const bone = joint.bone;
        if (!bone?.parent) return;

        // Is this bone a child of chest/upperChest?
        if (bone.parent === chest || bone.parent.parent === chest) {
            // Check if it's offset horizontally (not a neck/head bone)
            const pos = bone.position;
            if (Math.abs(pos.x) > 0.03 && Math.abs(pos.z) > 0.01) {
                candidates.push(index);
            }
        }
    });

    return candidates;
}
```

---

## 9. Parameter Presets

### 9.1 Five Intensity Tiers

These are the base spring bone parameter values for each preset tier. Applied via `JigglePhysicsManager.applyParams()`.

| Preset | Stiffness | Drag | Gravity Power | Gravity Dir | Hit Radius | Feel Description |
|--------|-----------|------|---------------|-------------|------------|------------------|
| **Subtle** | 1.2 | 0.6 | 0.3 | (0, -1, 0) | 0.03 | Firm, barely visible. Only moves on fast actions. Realistic/grounded. |
| **Natural** | 0.8 | 0.4 | 0.5 | (0, -1, 0) | 0.04 | Noticeable but tasteful. Default preset. Resembles real physics. |
| **Anime** | 0.5 | 0.3 | 0.6 | (0, -1, 0) | 0.05 | Classic anime-style bounce. The "fun" tier. Clearly stylized. |
| **Bouncy** | 0.3 | 0.2 | 0.7 | (0, -1, 0) | 0.06 | Exaggerated, playful jiggle. Visible on small movements. |
| **Extreme** | 0.15 | 0.1 | 0.8 | (0, -1, 0) | 0.07 | Maximum jiggle, comedy/fan-service level. Everything bounces. |

### 9.2 Butt & Thigh Base Values

Different tuning for lower body — larger mass, less range of motion:

| Body Part | Stiffness | Drag | Gravity Power | Notes |
|-----------|-----------|------|---------------|-------|
| **Butt** | 1.0 | 0.5 | 0.4 | Less swing than breasts, more dampened |
| **Thigh (inner)** | 1.5 | 0.6 | 0.2 | Very subtle, mostly visible during walking |
| **Thigh (outer)** | 1.8 | 0.7 | 0.15 | Minimal movement, prevents stiff appearance |

### 9.3 Body Type Multipliers

Applied on top of preset base values (multiplicative):

| Body Type | Stiffness x | Gravity x | Drag x | Description |
|-----------|------------|-----------|--------|-------------|
| **Petite** | 1.3 | 0.7 | 1.25 | Smaller mass = firmer, less swing |
| **Average** | 1.0 | 1.0 | 1.0 | Baseline, no modification |
| **Athletic** | 1.2 | 0.8 | 1.25 | Firm but responsive |
| **Curvy** | 0.7 | 1.2 | 0.75 | More mass = more swing, lower drag |
| **Voluptuous** | 0.5 | 1.4 | 0.625 | Maximum physics response |

### 9.4 Final Parameter Formula

```javascript
/**
 * Calculate final spring bone parameters for a specific joint.
 *
 * Formula:
 *   finalStiffness = presetBase.stiffness * bodyType.stiffnessMul
 *                    * (2.0 - intensity)  // intensity inverts stiffness
 *                    * emotionMul * movementMul
 *
 *   finalGravity   = presetBase.gravityPower * bodyType.gravityMul
 *                    * intensity * emotionMul * movementGravityMul
 *
 *   finalDrag      = presetBase.drag * bodyType.dragMul
 *                    * (1.0 - intensity * 0.5)  // higher intensity = less drag
 *
 * @param {string} preset - Preset tier name
 * @param {string} bodyType - Character body type
 * @param {number} intensity - Master intensity 0-1
 * @param {number} emotionMul - Emotion state multiplier
 * @param {number} movementMul - Animation state multiplier
 * @returns {{ stiffness: number, dragForce: number, gravityPower: number }}
 */
function calculateJiggleParams(preset, bodyType, intensity, emotionMul, movementMul) {
    const base = JIGGLE_PRESETS[preset];
    const body = BODY_TYPE_MULTIPLIERS[bodyType];

    return {
        stiffness:    base.stiffness * body.stiffness * (2.0 - intensity) * movementMul,
        dragForce:    base.drag * body.drag * (1.0 - intensity * 0.5),
        gravityPower: base.gravityPower * body.gravity * intensity * emotionMul,
    };
}
```

### 9.5 Multi-Bone Chain Decay

For models with 2-3 bone breast chains, apply decreasing stiffness along the chain:

```javascript
/**
 * Apply stiffness decay along a multi-bone chain.
 * Root bone is stiffest (anchored to chest), tip is loosest.
 *
 * @param {object} params - Base parameters for the root bone
 * @param {number} chainPosition - 0 = root, 1 = second bone, 2 = third bone
 * @returns {object} Modified parameters with chain decay applied
 */
function chainDecay(params, chainPosition) {
    const decay = Math.pow(0.6, chainPosition);  // 1.0, 0.6, 0.36
    return {
        stiffness:    params.stiffness * decay,
        dragForce:    params.dragForce * (1.0 - chainPosition * 0.2),
        gravityPower: params.gravityPower * (1.0 + chainPosition * 0.15),
    };
}
```

---

## 10. Schema Changes

### v61 → v62: Character Physics Profiles

Add to `backend/preflight.py` as migration v62:

```python
def migrate_v61_to_v62(con: sqlite3.Connection) -> None:
    """v61 → v62: Character physics profiles for jiggle physics.

    Creates the character_physics_profiles table for storing per-character
    jiggle physics overrides (body type, per-body-part parameters).
    Also adds a physics_profile_id column to characters for linking.

    Tables created:
        character_physics_profiles:
            - id (INTEGER PRIMARY KEY)
            - character_id (INTEGER FK → characters.id, UNIQUE)
            - body_type (TEXT) — 'petite'|'average'|'athletic'|'curvy'|'voluptuous'
            - breast_stiffness (REAL) — override, NULL = use global
            - breast_drag (REAL)
            - breast_gravity (REAL)
            - butt_stiffness (REAL)
            - butt_drag (REAL)
            - butt_gravity (REAL)
            - thigh_stiffness (REAL)
            - thigh_drag (REAL)
            - thigh_gravity (REAL)
            - preset_override (TEXT) — NULL = use global, or preset name
            - intensity_override (REAL) — NULL = use global, or 0.0-1.0
            - enabled (INTEGER) — NULL = use global, 0 = disabled, 1 = enabled
            - created_at (TEXT)
            - updated_at (TEXT)

    Args:
        con: SQLite database connection.
    """
    cur_ver = get_schema_version(con)
    if cur_ver >= 62:
        logger.info("Schema v62 already applied (character_physics_profiles).")
        return

    logger.info("Migrating v61 → v62: character physics profiles...")

    con.execute("""
        CREATE TABLE IF NOT EXISTS character_physics_profiles (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            character_id    INTEGER NOT NULL UNIQUE,
            body_type       TEXT    DEFAULT 'average',
            breast_stiffness REAL,
            breast_drag      REAL,
            breast_gravity   REAL,
            butt_stiffness   REAL,
            butt_drag        REAL,
            butt_gravity     REAL,
            thigh_stiffness  REAL,
            thigh_drag       REAL,
            thigh_gravity    REAL,
            preset_override  TEXT,
            intensity_override REAL,
            enabled          INTEGER,
            created_at       TEXT DEFAULT (datetime('now')),
            updated_at       TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
        )
    """)

    con.execute("INSERT OR REPLACE INTO schema_version (version) VALUES (62)")
    con.commit()
    logger.info("✅ Schema v62 migration complete (character_physics_profiles)")
```

### API Endpoints

Add to `backend/server.py`:

```python
@app.get("/api/characters/{character_id}/physics")
async def get_character_physics(character_id: int):
    """
    Get the jiggle physics profile for a character.

    Returns the per-character physics overrides, or defaults if no
    profile exists. Used by the frontend to configure the viewer's
    JigglePhysicsManager when switching characters.

    Args:
        character_id: The character's database ID.

    Returns:
        Physics profile dict with body_type, per-body-part params,
        preset_override, intensity_override, and enabled state.
        All NULL fields mean "use global setting".
    """
    # ... query character_physics_profiles ...


@app.put("/api/characters/{character_id}/physics")
async def update_character_physics(character_id: int, body: dict):
    """
    Create or update a character's jiggle physics profile.

    Upserts into character_physics_profiles. NULL values in the body
    are interpreted as "use global setting" (no override).

    Args:
        character_id: The character's database ID.
        body: Physics profile fields to update.

    Returns:
        Updated physics profile.
    """
    # ... upsert character_physics_profiles ...
```

---

## 11. Content Controls

### 11.1 Master Enable/Disable

- **Global toggle** in Settings > Physics tab (stored in `app.json` config)
- **Per-character toggle** via physics profile (overrides global)
- Disabled by default — user must opt-in
- When disabled, no spring bone parameters are modified (original model physics preserved)

### 11.2 Intensity Levels

The 5-tier preset system (Subtle → Extreme) provides safe defaults. Users can further adjust with the 0-1 intensity slider. Per-body-part sliders allow disabling specific areas (set to 0).

### 11.3 Per-Character Overrides

Stored in `character_physics_profiles` table. Each character can:
- Use global settings (default)
- Override preset/intensity
- Override body type
- Override per-body-part parameters
- Be disabled individually (even if global is enabled)

### 11.4 Content Gating Integration

The existing content gate system (`content_gate_config` table, schema v58) should control jiggle physics visibility:

| Gate Level | Jiggle Available | Max Preset | Notes |
|-----------|-----------------|------------|-------|
| `sfw` | No | N/A | Physics tab hidden entirely |
| `suggestive` | Yes | Natural | Capped at moderate |
| `nsfw` | Yes | Extreme | Full range available |
| `explicit` | Yes | Extreme | Full range + touch response |

Implementation: The `JigglePhysicsPanel` component reads `content_gate_config` and conditionally renders. In `sfw` mode, the Physics tab is not shown in `TABS`.

```typescript
// In SettingsView.tsx, filter TABS based on content gate:
const visibleTabs = TABS.filter(tab => {
    if (tab.id === 'physics') {
        return contentGateLevel !== 'sfw';
    }
    return true;
});
```

### 11.5 Reset to Defaults

Each level of customization can be reset independently:
- **Reset Global** → restores `app.json` jiggle defaults
- **Clear Character Override** → deletes the character's physics profile row
- **Reset to Preset** → clears per-body-part custom values, keeps preset selection

---

## 12. Effort Summary

| Phase | Scope | Files Modified | New Files | Effort (AI-assisted) |
|-------|-------|---------------|-----------|---------------------|
| **Phase 1** | Core spring bone jiggle: bone detection, presets, postMessage API | `viewer.html` | — | 2-3h |
| **Phase 2** | UI controls + config persistence: toggle, slider, preset picker | `SettingsView.tsx`, `viewerStore.ts`, `app.json`, `server.py` | `JigglePhysicsPanel.tsx` | 2-3h |
| **Phase 3** | Per-character profiles: body types, overrides, DB schema | `preflight.py`, `server.py`, `JigglePhysicsPanel.tsx` | — | 2-3h |
| **Phase 4** | Animation + emotion integration: movement/mood multipliers | `viewer.html`, `viewerStore.ts`, `chatStore.ts` | — | 2-3h |
| **Phase 5** | Bone injection: add breast bones to models missing them | `viewer.html` | — | 3-4h |
| **Phase 6** | Morph target enhancement: blend shape-driven supplemental jiggle | `viewer.html` | — | 4-5h |
| | | | **Total** | **15-21h** |

### Recommended Execution Order

1. **Phase 1** (quick win) — immediately testable with any VRoid model
2. **Phase 2** (UI) — makes Phase 1 user-controllable
3. **Phase 3** (profiles) — per-character customization
4. **Phase 4** (integration) — dynamic responses to emotion/movement
5. **Phase 5** (injection) — compatibility for bone-less models
6. **Phase 6** (morph) — advanced, only for custom models with blend shapes

Phases 1-2 can ship as an MVP. Phases 3-4 add polish. Phases 5-6 are advanced and can be deferred.

---

## Appendix: File Reference

| File | Purpose |
|------|---------|
| `frontends/shared/viewer/viewer.html` | 3D viewer — spring bone API at lines 7598-7690, wind at 5997-6023, render loop at 6025-6040, AnimationDirector at 595+ |
| `frontends/sakura/src/stores/viewerStore.ts` | Mediator between React UI and viewer iframe (postMessage) |
| `frontends/sakura/src/views/SettingsView.tsx` | Settings tabs — TABS array at line 72, tab type at line 64 |
| `frontends/sakura/src/components/EffectsPanel.tsx` | Existing effects UI (bloom, particles) — reference for slider patterns |
| `backend/preflight.py` | DB migrations — current latest is v61 (line 3790), v62 for physics profiles |
| `backend/server.py` | API endpoints — character CRUD around line 6676 |
| `backend/config/app.json` | Global app config — add `jiggle` section |
| `backend/mood/engine.py` | MoodEngine — emotion state source for multipliers |
