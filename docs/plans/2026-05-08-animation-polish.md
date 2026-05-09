# Animation Polish Plan

**Date:** 2026-05-08
**Status:** Draft — ready to execute
**Schema reservation:** v81 (`characters.spring_bone_presets` column) — Phase 3 only; no new tables
**Effort:** ~34h AI-assisted wall-clock (≈408h human-equivalent at 12× factor)
**Priority:** High — daily-driver pain, "alive feeling" is the core product value proposition
**Depends on:** None (all infra is in place)

---

## 1. Context

### Why this matters

The avatar feels stiff and dead. That phrase is unusually blunt for project memory — `feedback_animation_quality_crisis.md` uses the word "crisis." For a product whose entire value proposition is emotional connection to a character, a stiff avatar is an existential UX failure. Every day the user opens the app and sees Melon standing there like a cardboard cutout is a day the product fails at its primary job.

### Current state (verified by code audit, 2026-05-08)

The animation system is more capable than it looks from the outside. `viewer.html` has:

- `AnimationDirector` state machine: 5 states (`idle`, `talk`, `gesture`, `clip`, `mocap`) with priority-based transitions (line 595)
- `BasePoseLayer`: breath cycle via `noise1D()`, weight-shift, shoulder-roll, look-around fidgets (line 772)
- `IdleLayer`: personality-driven fidget library with 10+ micro-animations (line 839)
- `BlinkController`: Poisson-distributed blinks with emotion modulation (line 3849)
- `SaccadeController`: random eye gaze targets, narrowed during speech (line 3939)
- `LookAtLayer`: VRM lookAt target driven by mouse, eye gaze IK (line 2618)
- Spring bone API: `getSpringBoneInfo`, `setSpringBoneParams`, `setWind`, `toggleColliderDebug` (line 7619)
- Wind system: Perlin-ish noise on spring bone gravity (line 6009)

What is **not** in place:

- Delta time is capped at 100ms (line 5996) — spring bones need 50ms max or they explode on tab-switch resume
- Mixamo clips override spring bone joints (no track stripping) — hair goes rigid during animations
- `SaccadeController` uses linear lerp (not a proper velocity-preserving spring) — eye movement feels mechanical
- No critically damped spring math anywhere (`noise1D` is used, not damped springs)
- Jiggle physics (`JigglePhysicsManager`) from the spec does not exist yet
- No per-character spring bone presets (tuned params are lost on reload)
- No mood-driven idle state variation (same fidgets regardless of whether she's sad or excited)
- No spring bone track stripping on Mixamo clip load

### Daily pain breakdown

| Pain point | Root cause | Phase that fixes it |
|---|---|---|
| Hair frozen during Mixamo animations | No spring bone track stripping in `loadClip()` | Phase 1 |
| Physics explosion after tab switch | Delta cap 100ms, needs 50ms | Phase 1 |
| Eye movement feels robotic | Linear lerp saccade, constant 2-3s interval | Phase 3 |
| Avatar feels same regardless of mood | No mood-driven idle variation | Phase 3 |
| Hair/clothing feels weightless at rest | Jiggle physics not implemented | Phase 2 |
| Physics params tuned wrong per character | No per-character presets | Phase 3 |

---

## 2. Locked Decisions

| Decision | Resolution | Rationale |
|---|---|---|
| Spring solver choice | **@pixiv/three-vrm built-in VRMSpringBoneManager** — extend, do not replace | Already loaded, already runs. Replacing it requires re-testing every VRM model. |
| Custom spring math | **Add critically-damped spring functions** (`springDamperExact`, `springDamperQuaternion`) for saccade + pose smoothing only | Distinct from VRM spring bones (which handle hair/cloth). See Humanoid Motion spec. |
| Jiggle scope | **Phases 1–2 of jiggle spec** (detection, presets, postMessage API, UI toggle) — Phase 5 bone injection deferred | Injection is high-risk on diverse models; native bone detection covers VRoid models. |
| Mood → idle coupling | **Yes, wire `backend/mood/engine.py` emotion to idle** via existing postMessage personality API | `animationDirector.setPersonality()` already accepts energy/nervousness params (line 7601). Wire it. |
| Animation intensity settings | **Yes, add Settings > Animation tab** with master intensity toggle (off / subtle / lively) | One of the highest user-control ROI decisions. Uses existing SettingsView tab pattern. |
| Debug overlay / bone stiffness sliders | **Dev-mode only** (gated behind `devMode` flag) | Full tuning UI adds scope; expose via DevConsole tab only, not Settings for regular users. |
| VRMA vs Mixamo | **Both** — keep existing Mixamo retargeting, add VRMA support in Phase 4 | `ClipLayer.loadClip()` already handles GLB; VRMA is structurally the same. |
| Pre-baked vs runtime physics | **Runtime** for spring bones (already the case); jiggle is runtime on top of spring bones | Pre-baked would require per-character authored files. |
| Saccade on user-typing event | **Yes** — "user typing" triggers eyes to flick toward keyboard area | Small, high-impact, already have the postMessage channel. Phase 3. |
| Schema migration | **v81** — `spring_bone_presets` TEXT column on `characters` table | Avoids a new table; keeps preset data with the character. |

---

## 3. Phase 1 — Critical Physics Fixes (highest ROI, lowest risk)

**Goal:** Fix the two physics bugs that make hair look broken today. Each fix is a single-digit line change. Ship these first — they make every other animation improvement visible.

**Effort:** 2h AI-assisted (≈24h human-equivalent)

### 3.1 Delta time clamp: 100ms → 50ms

**Why:** When the browser tab loses focus, `rAF` throttles to ~1fps. On resume, `clock.getDelta()` returns the full elapsed time. Spring bone Verlet integration diverges above ~50ms — joints fly to infinity. The current 100ms cap was chosen for animation smoothness (skeletal animations handle large deltas fine by jumping); spring bones do not.

**How:**

File: `frontends/shared/viewer/viewer.html`, line 5996

Current:
```javascript
const delta = Math.min(clock.getDelta(), 0.1);
```

Replace with:
```javascript
// Cap at 50ms — spring bone Verlet integration explodes above this threshold.
// Skeletal animations handle larger deltas by jumping; spring bones do not.
// See: docs/plans/2026-03-29-spring-bones-spec.md Phase 1A
const delta = Math.min(clock.getDelta(), 0.05);
```

### 3.2 Strip spring bone tracks from Mixamo clips

**Why:** Mixamo FBX-to-GLB exports sometimes include keyframe tracks for bones VRM uses as spring joints (e.g., `J_Sec_Hair1_01`). When `AnimationMixer` plays these tracks they override the Verlet simulation — hair goes rigid. Stripping them before the clip is stored in `clipLibrary` lets physics run freely on those bones.

**How:**

File: `frontends/shared/viewer/viewer.html`, inside `class ClipLayer` (after `retargetClip()` definition, ~line 2080)

Add method:
```javascript
/**
 * Remove animation tracks targeting spring bone joints from a clip.
 *
 * Mixamo exports sometimes include keyframes for VRM spring bone joints
 * (hair, clothing). These override Verlet simulation, freezing secondary
 * motion. Strip them before storing so physics runs on those bones freely.
 *
 * @param {THREE.AnimationClip} clip - Mutated in-place.
 * @returns {THREE.AnimationClip} The same clip, filtered.
 */
stripSpringBoneTracks(clip) {
    if (!this.vrm?.springBoneManager?.joints?.length) return clip;
    const springBoneNames = new Set(
        this.vrm.springBoneManager.joints.map(j => j.bone.name)
    );
    const before = clip.tracks.length;
    clip.tracks = clip.tracks.filter(track => {
        const dotIdx = track.name.indexOf('.');
        if (dotIdx === -1) return true;
        return !springBoneNames.has(track.name.substring(0, dotIdx));
    });
    const removed = before - clip.tracks.length;
    if (removed > 0) console.log(`[ClipLayer] Stripped ${removed} spring bone tracks from "${clip.name}"`);
    return clip;
}
```

Wire in `loadClip()` after the retarget loop (line ~2152):
```javascript
for (const anim of animations) {
    this.stripSpringBoneTracks(anim);
}
```

Wire in BVH load path (line ~2284, after clip construction):
```javascript
this.stripSpringBoneTracks(clip);
```

Requires `this.vrm` available in `ClipLayer` — check constructor at line ~2034 and confirm `this.vrm = vrm` is set. If not, add it.

### 3.3 Verification

| Check | Method |
|---|---|
| Tab-switch physics stability | Load any VRM, switch tab for 10+ seconds, return — hair should settle smoothly, not explode |
| Mixamo rigid-hair fix | Load a Mixamo idle clip with `retarget: true`, compare hair motion before/after the strip |
| `stripSpringBoneTracks` console log | Confirm log appears for clips that have spring bone tracks |
| Render loop still 60fps | Check FPS counter after delta change — should be unchanged |

---

## 4. Phase 2 — Jiggle Physics Core

**Goal:** Implement `JigglePhysicsManager` — the class that wraps VRM's `SpringBoneManager` with body-part-specific detection, presets, and a postMessage API. Add a global toggle + preset picker in Settings. This is the biggest "alive" improvement for NSFW-enabled models and noticeable even on SFW models with skirts/clothing spring bones.

**Effort:** 6h AI-assisted (≈72h human-equivalent)

### 4.1 JigglePhysicsManager class in viewer.html

**How:** Add after the spring bone API section (~line 7719, after `toggleColliderDebug` handler closes). Full implementation is specified verbatim in `docs/plans/2026-03-29-jiggle-physics-spec.md` Section 2 and Section 8.

Key integration points:

- `detectBones(vrm)` — uses `JIGGLE_BONE_PATTERNS` regex table (spec Section 8) against `springBoneManager.joints`
- Fallback: `detectBreastByHierarchy(vrm)` when name-based detection finds nothing
- `saveOriginalParams(vrm)` / `restoreOriginalParams(vrm)` — store base spring params before overriding
- `applyParams(vrm)` — applies `calculateJiggleParams()` formula (spec Section 9.4) per body part

Hook into model load (inside the VRM load success handler, ~line 6582 where `saccadeController` is created):
```javascript
jiggleManager = new JigglePhysicsManager();
const detected = jiggleManager.detectBones(currentVrm);
if (detected.breast.length > 0 || detected.butt.length > 0) {
    window.parent.postMessage({ type: 'jiggleDetection', detected }, '*');
    if (jiggleManager.enabled) {
        jiggleManager.saveOriginalParams(currentVrm);
        jiggleManager.applyParams(currentVrm);
    }
}
```

postMessage handlers to add (spec Section 2.3): `setJiggleEnabled`, `setJiggleIntensity`, `setJigglePreset`, `setJiggleProfile`, `getJiggleInfo`, `setJiggleEmotionMultiplier`, `setJiggleMovementMultiplier`.

### 4.2 viewerStore.ts wrappers

File: `frontends/sakura/src/stores/viewerStore.ts`

Add three action methods to the store interface and implementation:
```typescript
/**
 * Enable or disable jiggle physics in the 3D viewer.
 *
 * @param enabled - Whether jiggle physics should be active.
 */
setJiggleEnabled(enabled: boolean): void;

/**
 * Set jiggle intensity, optionally scoped to one body part.
 *
 * @param intensity - 0.0 (off) to 1.0 (maximum).
 * @param bodyPart - 'breast' | 'butt' | 'thigh', or omit for master.
 */
setJiggleIntensity(intensity: number, bodyPart?: 'breast' | 'butt' | 'thigh'): void;

/**
 * Apply a named jiggle preset.
 *
 * @param preset - 'subtle' | 'natural' | 'anime' | 'bouncy' | 'extreme'
 */
setJigglePreset(preset: string): void;
```

Each dispatches `postToViewer({ type: 'setJiggle...', ...payload })`.

### 4.3 JigglePhysicsPanel.tsx (new component)

File: `frontends/sakura/src/components/JigglePhysicsPanel.tsx` (new)

```
┌─── Jiggle Physics ───────────────────────────────────────┐
│                                                           │
│  [ ] Enable Jiggle Physics             [Master Toggle]   │
│                                                           │
│  Preset:  Subtle · Natural · Anime · Bouncy · Max        │
│           (segmented group, Natural recommended)          │
│                                                           │
│  Intensity  ──────●──────────  0.50                      │
│                                                           │
│  Per-Body-Part ▾                                         │
│    Breast  ────────●────────  0.65                       │
│    Butt    ──────●──────────  0.40                       │
│    Thigh   ────●────────────  0.20                       │
│                                                           │
│  ⓘ 2 breast bones detected. Physics ready.              │
│    (or: No breast bones on current model.)               │
│                                                           │
│  [ Reset to Defaults ]                                   │
└───────────────────────────────────────────────────────────┘
```

Behaviors:
- On mount: sends `getJiggleInfo` to viewer, listens for `jiggleInfo` response
- Toggle/slider/preset changes dispatch via `viewerStore`
- Settings persist to `backend/config/app.json` under `"jiggle"` key via existing `/api/config` endpoints
- Content-gate: Physics tab is hidden entirely when `content_gate = 'sfw'` (same gate check used in NSFW Mega-Sprint)

### 4.4 app.json defaults

Add to `backend/config/app.json`:
```json
"jiggle": {
  "enabled": false,
  "preset": "natural",
  "intensity": 0.5,
  "body_parts": { "breast": 0.65, "butt": 0.40, "thigh": 0.20 }
}
```

### 4.5 Wire Physics tab into SettingsView

File: `frontends/sakura/src/components/SettingsView.tsx`

Add `'physics'` to the tab union type and `TABS` array (after `'system'`). Render `<JigglePhysicsPanel />` in the tab body. Gate on content level: if `content_gate === 'sfw'`, exclude from `TABS` filter (same pattern as other gated tabs, already in place).

### 4.6 Verification

| Check | Method |
|---|---|
| Bone detection fires on model load | Check console for `[Viewer] Jiggle bone detection:` |
| Toggle enable/disable | Turn on, hair/clothing physics should visibly change behavior |
| Preset picker | Switch Subtle → Bouncy, spring params should update immediately |
| Intensity slider | Drag from 0 to 1, physics response should scale |
| SFW gate | Set content level to SFW, Physics tab should disappear |
| app.json persistence | Reload app, jiggle settings should restore |

---

## 5. Phase 3 — Micro-Animation Quality + Saccade Spring Upgrade

**Goal:** Replace linear-lerp eye saccade with a proper velocity-preserving spring. Add mood-driven idle variation so a sad character fidgets differently than an excited one. Wire "user is typing" event to trigger a gaze flick. Add per-character spring bone preset persistence (schema v81).

**Effort:** 8h AI-assisted (≈96h human-equivalent)

### 5.1 Critically damped spring math

**Why:** `SaccadeController` uses `currentYaw += (target - current) * 0.15` — frame-rate dependent, no velocity continuity. When a saccade target changes mid-flight the eye snaps direction. A critically damped spring preserves velocity across target changes and settles without oscillation.

**How:** Add after `noise1D()` function (~line 751):

```javascript
/**
 * Critically damped spring — reaches goal ASAP without oscillation.
 * Maintains velocity continuity across target changes (unlike lerp).
 * Algorithm: Daniel Holden's exact formulation.
 *
 * @param {number} x - Current position
 * @param {number} v - Current velocity
 * @param {number} goal - Target position
 * @param {number} halflife - Seconds to halve remaining distance
 * @param {number} dt - Delta time (seconds)
 * @returns {{x: number, v: number}} Updated position and velocity
 */
function springDamperExact(x, v, goal, halflife, dt) {
    const eps = 1e-5;
    const g  = goal;
    const d  = (x - g);
    const f  = Math.log(2) / (halflife + eps);
    const j0 = d;
    const j1 = v + d * f;
    const eydt = Math.exp(-f * dt);
    return {
        x: eydt * (j0 + j1 * dt) + g,
        v: eydt * (j1 - j0 * f * dt - j1 * f * dt),
    };
}
```

### 5.2 Upgrade SaccadeController to spring-based motion

File: `frontends/shared/viewer/viewer.html`, `class SaccadeController` (line 3939)

Replace the constructor and `update()` method:

```javascript
class SaccadeController {
    constructor(vrm) {
        this.vrm = vrm;
        this._isTalking = false;
        this.nextSaccadeTime = 2 + Math.random() * 3;
        // Spring state — position + velocity for each axis
        this._yaw  = { x: 0, v: 0, goal: 0 };
        this._pitch = { x: 0, v: 0, goal: 0 };
        // Halflife: ~60ms for fast saccade snap, ~120ms for slow drift
        this._halflife = 0.06;
    }

    setTalking(talking) { this._isTalking = talking; }

    update(dt) {
        this.nextSaccadeTime -= dt;
        if (this.nextSaccadeTime <= 0) {
            const range = this._isTalking ? 0.05 : 0.15;
            this._yaw.goal  = (Math.random() - 0.5) * range;
            this._pitch.goal = (Math.random() - 0.5) * range * 0.5;
            this.nextSaccadeTime = 2 + Math.random() * 3;
        }

        const yw = springDamperExact(this._yaw.x, this._yaw.v, this._yaw.goal, this._halflife, dt);
        const pt = springDamperExact(this._pitch.x, this._pitch.v, this._pitch.goal, this._halflife, dt);
        this._yaw.x = yw.x; this._yaw.v = yw.v;
        this._pitch.x = pt.x; this._pitch.v = pt.v;

        if (!this.vrm?.humanoid) return;
        const leftEye  = this.vrm.humanoid.getNormalizedBoneNode('leftEye');
        const rightEye = this.vrm.humanoid.getNormalizedBoneNode('rightEye');
        if (leftEye)  { leftEye.rotation.y  += this._yaw.x; leftEye.rotation.x  += this._pitch.x; }
        if (rightEye) { rightEye.rotation.y += this._yaw.x; rightEye.rotation.x += this._pitch.x; }
    }

    /**
     * Trigger an immediate gaze flick (e.g., user starts typing).
     * Bypasses the timer — fires a saccade now.
     */
    triggerGazeFlick() {
        const range = 0.08; // narrower than idle, as if glancing at keyboard
        this._yaw.goal  = (Math.random() - 0.5) * range;
        this._pitch.goal = -0.03 - Math.random() * 0.04; // slight downward (keyboard)
        this.nextSaccadeTime = 1.5 + Math.random() * 2;
    }
}
```

Add postMessage handler for `triggerGazeFlick`:
```javascript
else if (type === 'triggerGazeFlick') {
    if (saccadeController) saccadeController.triggerGazeFlick();
}
```

Wire in viewerStore.ts:
```typescript
/**
 * Trigger an eye gaze flick in the viewer, simulating the character noticing
 * the user is typing. Sends triggerGazeFlick postMessage to the iframe.
 */
triggerGazeFlick(): void;
```

Wire from chatStore or the message input component: on user `keydown` in the chat input (first keypress of a typing burst only — debounce 2s):
```typescript
// In chat input handler, debounced at 2s to fire only at start of typing burst
useViewerStore.getState().triggerGazeFlick();
```

### 5.3 Mood-driven idle variation

**Why:** `AnimationDirector.setPersonality()` already accepts `{ energy, nervousness, warmth, playfulness }` params (line 7601). The backend `mood/engine.py` produces an emotion state. Currently nothing connects them.

**How:**

File: `backend/mood/engine.py` — confirm the emotion output shape. The engine produces a state string (e.g., `'happy'`, `'sad'`, `'excited'`).

File: `frontends/sakura/src/stores/chatStore.ts` — after mood state update from backend response, dispatch to viewerStore:

```typescript
// After parsing mood from LLM response metadata:
const MOOD_PERSONALITY_MAP: Record<string, Partial<PersonalityParams>> = {
    happy:     { energy: 0.75, nervousness: 0.1, playfulness: 0.8 },
    excited:   { energy: 0.9,  nervousness: 0.3, playfulness: 0.9 },
    sad:       { energy: 0.2,  nervousness: 0.2, playfulness: 0.1 },
    angry:     { energy: 0.7,  nervousness: 0.7, playfulness: 0.2 },
    calm:      { energy: 0.4,  nervousness: 0.05, playfulness: 0.4 },
    embarrassed: { energy: 0.4, nervousness: 0.8, playfulness: 0.2 },
    flirty:    { energy: 0.6,  nervousness: 0.2, playfulness: 0.7 },
    neutral:   { energy: 0.5,  nervousness: 0.1, playfulness: 0.5 },
};
const personality = MOOD_PERSONALITY_MAP[moodState] ?? MOOD_PERSONALITY_MAP.neutral;
useViewerStore.getState().setPersonality(personality);
// Also dispatch jiggle emotion multiplier
useViewerStore.getState().postToViewer({ type: 'setJiggleEmotionMultiplier', multiplier: EMOTION_JIGGLE_MAP[moodState] ?? 1.0 });
```

`setPersonality` is already wired in viewerStore (existing — sends `setPersonality` postMessage). Confirm it at `viewerStore.ts`.

### 5.4 Per-character spring bone presets (schema v81)

**Why:** Tuned spring bone params are lost on model reload. Each character with VRM has unique hair/clothing that benefits from different stiffness/drag values.

**How:**

File: `backend/preflight.py` — append `migrate_to_v81()`:

```python
def migrate_to_v81(con: sqlite3.Connection) -> bool:
    """Migrate schema from v80 to v81.

    Adds: ``spring_bone_presets`` TEXT (JSON) column to the ``characters``
    table.  Stores per-character spring bone parameter overrides so tuned
    physics survive app restarts.

    JSON schema: ``{ "joints": [{ "index": int, "boneName": str,
    "stiffness": float, "drag": float, "gravityPower": float }],
    "wind": { "x": float, "y": float, "z": float, "strength": float } }``
    NULL means use model defaults.
    """
    try:
        con.execute(
            "ALTER TABLE characters ADD COLUMN spring_bone_presets TEXT DEFAULT NULL"
        )
        con.execute("UPDATE schema_version SET version = 81")
        return True
    except Exception as e:
        logging.error(f"Migration to v81 failed: {e}")
        return False
```

Backend endpoints in `backend/server.py` (add near existing character endpoints, ~line 6676):

```python
@app.get("/api/characters/{character_id}/spring-bone-preset")
async def get_spring_bone_preset(character_id: int):
    """Get stored spring bone parameter preset for a character.

    Returns the JSON preset or null if no preset has been saved.
    The frontend applies this after VRM model load to restore tuned params.

    Args:
        character_id: Database ID of the character.

    Returns:
        dict with ``preset`` (JSON object or null) and ``character_id``.
    """
    ...

@app.post("/api/characters/{character_id}/spring-bone-preset")
async def save_spring_bone_preset(character_id: int, body: dict):
    """Save a spring bone parameter preset for a character.

    Persists tuned joint parameters so they auto-apply on next model load.
    Overwrites any existing preset for this character.

    Args:
        character_id: Database ID of the character.
        body: The preset JSON object (joints array + optional wind).

    Returns:
        dict with ``saved``: true on success.
    """
    ...
```

Wire in viewerStore.ts — on receiving `vrmSpringBonesReady` postMessage (add handler in viewer.html after model load), fetch preset from backend and apply via `setSpringBoneParams` (already exists, line 7647).

Also add `saveSpringBonePreset()` action to viewerStore: requests current params from viewer via `getSpringBoneInfo`, then POSTs to backend.

### 5.5 Verification

| Check | Method |
|---|---|
| Spring saccade continuity | Watch eye movement — should flow smoothly through direction changes, not snap |
| Gaze flick on typing | Type in chat input — first keypress triggers subtle downward eye flick |
| Mood → idle variation | Send a sad message then an excited message; compare fidget energy (amplitude, tempo) |
| Preset save/load | Tune spring bone params in DevConsole, save, reload app, load same VRM — params restored |
| Schema v81 migration | Run `pytest backend/tests/test_preflight.py -q`, confirm all pass |

---

## 6. Phase 4 — Animation Clip Library + VRMA Support

**Goal:** Add VRMA (VRM Animation) file format support to `ClipLayer`. Source and register 5–8 high-quality idle/emote clips from the Anata animation library or Mixamo. Wire a basic clip-cycling system for idle state diversity.

**Effort:** 8h AI-assisted (≈96h human-equivalent) — 3h VRMA support + 5h sourcing and wiring

### 6.1 VRMA loader integration

**Why:** VRMA is the native VRM animation format — no retargeting needed, perfect bone coverage, no spring bone track bleed. The Humanoid Motion spec recommends it over Mixamo for quality.

**How:**

File: `frontends/shared/viewer/viewer.html`, `class ClipLayer`, `loadClip()` method (line ~2140)

VRMA files store animations in `gltf.userData.vrmAnimations` (not `gltf.animations`). Detect by file extension or explicit flag:

```javascript
/**
 * Load a VRMA (VRM Animation) file. VRMA stores animations in
 * userData.vrmAnimations, not gltf.animations. No retargeting needed —
 * VRMA bone names already match VRM humanoid names.
 *
 * @param {string} url - URL or path to the .vrma file
 * @param {string} name - Key to store in clipLibrary
 * @returns {Promise<{clip: THREE.AnimationClip, duration: number}>}
 */
async loadVRMA(url, name) { ... }
```

VRMA files also need `VRMAnimationLoaderPlugin` from `@pixiv/three-vrm-animation`. Check if it's already in `package.json` / loaded in viewer.html imports. If not, add the import.

### 6.2 Animation library entries

File: `backend/data/animation_library.json`

Add entries for VRMA and curated Mixamo clips. Suggested sourcing:
- **Mixamo:** idle_1 (breathing stand), idle_2 (look around), wave, head_nod, thinking, shy (already some in library — verify what exists)
- **Anata/VRMA:** Download from `https://github.com/vrm-c/vrma-spec` example clips or community VRM animation packs

Each entry shape (existing format):
```json
{
  "name": "idle_breathing",
  "url": "/files/animations/idle_breathing.vrma",
  "format": "vrma",
  "loop": true,
  "tags": ["idle", "subtle"],
  "mood": ["calm", "neutral"]
}
```

New field: `"mood"` array — used by mood-driven idle selector (Phase 3 feeds into this).

### 6.3 Idle clip cycling

File: `frontends/shared/viewer/viewer.html`, `class IdleLayer`

Add a `_clipCycleTimer` that, after 30–90s of pure idle (no gesture, no talk), fires a random clip from the animation library tagged `"idle"` and matching current mood. Uses existing `AnimationSequencer` to blend in/out (convention: use sequencer not setTimeout).

```javascript
/**
 * Attempt to play a mood-matched idle clip from the animation library.
 * Called periodically by IdleLayer when in sustained idle state.
 * No-ops if animation library is empty or no mood-matched clips found.
 *
 * @param {string} currentMood - Current emotion state ('happy', 'sad', etc.)
 */
_maybeCycleIdleClip(currentMood) { ... }
```

### 6.4 Verification

| Check | Method |
|---|---|
| VRMA loads without error | Load a .vrma file via `postToViewer({ type: 'loadClip', ... format: 'vrma' })` |
| VRMA animation plays | Character should animate using VRMA clip — no retarget needed, check bone coverage |
| Idle clip cycling | Leave app idle for 60s, watch for a subtle pose/gesture change |
| Mood clip filtering | Switch to sad mood, idle cycling should prefer calm/subtle clips over energetic ones |

---

## 7. File-Level Change-Set Summary

| File | Status | Phase | Notes |
|---|---|---|---|
| `frontends/shared/viewer/viewer.html` | Modified | 1, 2, 3, 4 | Delta clamp, track stripping, JigglePhysicsManager, saccade spring, spring math, gaze flick handler, VRMA loader, idle cycling |
| `frontends/sakura/src/stores/viewerStore.ts` | Modified | 2, 3 | Jiggle actions, gaze flick action, spring preset save |
| `frontends/sakura/src/stores/chatStore.ts` | Modified | 3 | Mood → personality dispatch, jiggle emotion multiplier dispatch |
| `frontends/sakura/src/components/JigglePhysicsPanel.tsx` | New | 2 | Physics tab UI |
| `frontends/sakura/src/components/SettingsView.tsx` | Modified | 2 | Add Physics tab (content-gated) |
| `backend/preflight.py` | Modified | 3 | v81 migration: `spring_bone_presets` column |
| `backend/server.py` | Modified | 3 | Two endpoints: GET/POST spring-bone-preset |
| `backend/config/app.json` | Modified | 2 | Add `"jiggle"` config section |
| `backend/data/animation_library.json` | Modified | 4 | Add VRMA and curated Mixamo entries with `"mood"` tags |
| `backend/tests/test_preflight.py` | Auto-covered | 3 | Existing test suite validates migration chain |

---

## 8. Verification Matrix

| Phase | Automated | Manual |
|---|---|---|
| Phase 1 | `pytest backend/tests/ -q` (no regressions); `tsc --noEmit` | Tab-switch test: load VRM, switch tab 10s, return — no physics explosion; Mixamo clip: hair moves with body |
| Phase 2 | `tsc --noEmit` (JigglePhysicsPanel types); `pytest` (no regressions) | Toggle jiggle on/off; cycle presets; verify SFW gate hides Physics tab; app.json persists settings |
| Phase 3 | `pytest backend/tests/test_preflight.py -q` (v81 chain); `tsc --noEmit` | Saccade: spring-smooth eye movement; mood: sad vs excited idle posture difference; gaze flick on typing; preset save/load across reload |
| Phase 4 | `tsc --noEmit` | VRMA loads; idle clip cycles after 60s idle; mood-filtered clip selection |

---

## 9. Risks + Mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| `viewer.html` edit introduces regression in unrelated animation path | High (known sensitive area) | Edit in isolation — one concern per edit session. Visual verify after each sub-phase: load model, check idle, check talk, check gesture. Never combine viewer.html edits with viewerStore edits in same session (convention rule). |
| `stripSpringBoneTracks` breaks a clip that legitimately animates a spring-bone-named bone | Low | Log stripped track count. If count > 0 and animation looks wrong, the strip can be disabled per-clip with a `noStrip` flag passed to `loadClip()`. |
| `springDamperExact` introduces frame-rate dependent behavior | Low — formula is dt-exact | Verify at 30fps and 60fps — result should converge identically. |
| VRMA loader requires `@pixiv/three-vrm-animation` not in current bundle | Medium | Check imports in viewer.html header. If missing, add CDN import (same pattern as other @pixiv packages). |
| Jiggle bone detection finds zero bones on current character VRMs | Medium — VRoid models have them, custom models vary | Detection result is reported via postMessage; UI shows "no bones detected" state gracefully. Bone injection (spec Phase 5) deferred — add a "no bones found" warning in UI instead. |
| Mood dispatch from chatStore fires too frequently (every token?) | Medium | Debounce: apply mood personality change only when full message is received, not during streaming. |
| Schema v81 migration runs on already-migrated DB | Never — preflight checks version | `if current_version >= 81: return True` guard. Standard pattern — always in place. |
| Delta clamp change (100→50ms) causes animation stuttering at 30fps | Low — skeletal anims handle it | Test at low FPS. The 50ms cap only affects physics explosion prevention; animation quality at 30fps uses `rAF` throttle path, not the cap. |

---

## 10. Sequencing Notes

**Phase 1 is a hard prerequisite for Phase 2.** Jiggle physics at 100ms delta will still explode on tab switch. Fix the delta first, then enable jiggle.

**Phase 2 and Phase 3 are parallelizable** — they touch different files. Phase 2 is primarily `viewer.html` + new component + settings wiring. Phase 3's saccade upgrade is also `viewer.html` but in a different class (`SaccadeController` vs the jiggle section). However, per the project convention: never modify `viewer.html` and `viewerStore.ts` in parallel. The safe sequencing is:

```
Phase 1 → Phase 2 (viewer.html) → Phase 2 (viewerStore + component) → Phase 3 (viewer.html) → Phase 3 (chatStore + backend)
```

**Phase 4 is independent** of Phases 2–3 and can run in a separate session. It's the lightest Phase 4 in the spec family.

**Commits:** One commit per phase sub-task. Atomic commits per convention — do not batch Phase 1 + Phase 2 into a single commit.

---

## 11. Reuse Hooks — Existing Code to Extend

| Existing code | Location | How to extend |
|---|---|---|
| Spring bone API handlers | `viewer.html:7619–7719` | Append jiggle handlers after `toggleColliderDebug` block |
| Wind system + `_originalGravity` Map | `viewer.html:6009–6035` | Jiggle saves/restores params using same pattern as `_originalGravity` |
| `animationDirector.setPersonality()` postMessage | `viewer.html:7598–7603` | Mood → personality mapping dispatches to this existing handler |
| `BlinkController` initialization order | `viewer.html:3856–3861` | Jiggle/saccade constructors must follow same "init fields before calling methods" discipline |
| `SaccadeController.setTalking()` | `viewer.html:3952` | Gaze flick method added to same class |
| `ClipLayer.retargetClip()` | `viewer.html:~2073` | `stripSpringBoneTracks()` added as sibling method, called in same pipeline |
| `EffectsPanel.tsx` slider pattern | `frontends/sakura/src/components/EffectsPanel.tsx` | JigglePhysicsPanel uses same slider/toggle component style |
| Content gate check for tab visibility | `frontends/sakura/src/components/SettingsView.tsx` | Physics tab gating follows same `contentGateLevel !== 'sfw'` filter |
| `/api/config` GET/PUT | `backend/server.py` | Jiggle settings persist via existing config endpoints, no new endpoint needed |
| Character CRUD endpoints | `backend/server.py:~6676` | Spring bone preset endpoints added adjacent to character endpoints |
| Existing `animation_library.json` entries | `backend/data/animation_library.json` | Add new entries; existing format is the schema |

---

## 12. Research & Documentation References

| Document | Relevance |
|---|---|
| `docs/plans/2026-03-29-spring-bones-spec.md` | Phase 1 implementation source: delta clamp (Phase 1A), track stripping (Phase 1B), per-character presets (Phase 3), emotion modulation table |
| `docs/plans/2026-03-29-jiggle-physics-spec.md` | Phase 2 implementation source: JigglePhysicsManager class, bone detection patterns, parameter presets, postMessage API, UI mockup |
| `docs/plans/2026-03-29-humanoid-motion-spec.md` | Phase 3 spring math: `springDamperExact` function (Phase A1), `PoseSpringManager` pattern (Phase A2) — cherry-picked, not full scope |
| `docs/research/2026-03-29-spring-bones-3d-research.md` | Spring bone physics theory, delta time clamping rationale |
| `docs/research/2026-03-29-jiggle-physics-research.md` | Bone detection patterns, preset parameter values, body type multipliers |
| `docs/research/2026-03-29-humanoid-motion-research.md` | Critically damped spring formulation (Daniel Holden), VRMA format |
| `MEMORY.md: feedback_animation_quality_crisis.md` | User signal: "crisis" language = highest priority in user's lexicon |
| `MEMORY.md: feedback_animation_preferences.md` | Multiple systems, no manual downloads, pre-made anims preferred |
| `docs/conventions/3d-viewer-and-animation.md` | Architecture constraints: extend AnimationDirector, use AnimationSequencer, never setInterval |

---

## 13. Forward-Looking (Deferred + Why)

| Feature | Deferred to | Why |
|---|---|---|
| Spring bone tuning UI for regular users (full `SpringBoneTuner.tsx`) | Post-Phase 3 | DevConsole exposure sufficient for now; adding a full per-joint tuner to Settings is high surface area |
| Bone injection for models without spring bones | Post-Phase 2 | High risk on diverse models; Phase 2 gracefully shows "no bones detected" instead |
| Morph target enhancement (blend-shape-driven jiggle) | Post-Phase 4 | Model-dependent; most VRoid models lack breast blend shapes |
| Full PoseSpringManager (spring-driven all primary bones) | Separate sprint | Humanoid Motion spec Phase A is 10–18h alone — scope exceeds this plan |
| IK solver + foot planting | Separate sprint | Humanoid Motion spec Phase E — 20h+ estimated |
| Per-character body-type profiles in DB (`character_physics_profiles` table) | Post-Phase 2 MVP signal | Jiggle spec Phase 3 — add if per-character intensity variation proves needed after Phase 2 ships |
| Emotion-reactive spring bone modulation (spring-bones-spec Phase 5) | Post-Phase 3 | Jiggle emotion multiplier in Phase 3 covers the same need more simply |
| Lip-sync-reactive jiggle (speak → body vibration) | Post-Phase 2 | Requires audio amplitude feed from TTS into viewer, interesting but not daily pain |
| VRMA sourcing from Anata animation store / community packs | Phase 4 execution time | Requires manual review of clip quality — not automatable |

**When to revisit deferred items:** After Phase 2 ships, observe whether the "stiff/dead" complaint is gone. If jiggle + spring saccade + mood idle variation fix the daily pain, Phases 3–4 optimizations are quality-of-life rather than must-fix. Only escalate bone injection or full PoseSpringManager if users with custom (non-VRoid) models report broken physics.

---

## Locked Decisions — Post-Draft Session 2026-05-08

After the prd-writer agent drafted this plan, the user locked the three open questions surfaced in the agent's summary. Recording here so the execution session has a clear final-decision trail and the agent's assumptions can be reconciled with the user's calls.

| # | Question | Decision | Rationale |
|---|----------|----------|-----------|
| 1 | Jiggle physics default state | **Auto-on at low intensity, dial in Settings** | Compromise between "feels alive immediately" and "no surprise on first load." User can dial up or off via Settings > Physics. Override the agent's default-OFF assumption in Phase 2. |
| 2 | VRMA file sourcing for Phase 4 | **Draft sourcing list as Phase 4 prep sub-task** | User has VRM/GLB models in `backend/storage/avatars/` + `backend/storage/models/vrm/` but ZERO VRMA files. Phase 4 must include a prep step: research Anata animation store, vroidhub.com, community packs; output a curated list with download URLs + license notes; user reviews + downloads before Phase 4 executes. |
| 3 | Eye saccade gaze-flick trigger | **Typing-burst (debounced 2s after first keypress)** | Subtle, integrates with chat input. Character notices you typing. Hotkey-explicit option dropped — feels mechanical. |

### Codebase Verification Notes (2026-05-08)

- **Animation folder structure exists but is empty.** `backend/storage/animations/{vrma,bvh,fbx,glb,vrm-expression-library}/` are all 0-file directories. Phase 4 cannot proceed without populating at least `vrma/`. The sourcing-list prep step from Decision #2 is therefore a hard prerequisite.
- **VRM characters present.** 12 .vrm files in `backend/storage/avatars/` (Glitch, Raine, Seraph, Kitsune, Tsuki, Viper, Nyx, Panicandy, melon variants) — Phase 1 spring-bone work has real models to test against.
- **Worktree clutter.** `.claude/worktrees/agent-a0d87ae7/VRM models/` contains old VRM duplicates (Tsuki, Panicandy variants). Not in tree path; ignore.

### Phase 2 Adjustment (Jiggle Default)

The original plan (per agent) defaulted jiggle to `enabled: false` so the user opts in via Settings. Per Decision #1, change the default Settings shape to:

```typescript
// frontends/sakura/src/stores/settingsStore.ts (or wherever physics settings live)
physics: {
  jiggleEnabled: true,            // was: false
  jiggleIntensity: 'subtle',       // new field; values: 'off' | 'subtle' | 'medium' | 'lively' | 'extreme'
  jiggleAutoEnableOnLoad: true,   // tracks "did we auto-enable for the first time?"
}
```

The Settings panel still has the on/off toggle (mapped to `intensity === 'off'` for clarity), plus the 5-position intensity dial. First-time users experience low-intensity motion immediately; the toggle gives an easy hard-off for shared-PC scenarios.

- 2026-05-08 Phase 1: ✓ delta clamp 100→50ms + stripSpringBoneTracks() in GLB+BVH paths (commit 84036b8). 2843 tests pass, tsc clean.
- 2026-05-08 Phase 2: ✓ JigglePhysicsManager (detect/preset/apply) + 7 postMessage handlers + Physics tab + viewerStore actions (commit 4e2a0d9). Default: subtle auto-on. 2843 tests, tsc clean.
- 2026-05-08 Phase 3: ✓ springDamperExact + SaccadeController spring upgrade + gaze flick (typing burst) + mood→personality dispatch + schema v81 spring_bone_presets + GET/POST endpoints (commit 246478d). 2843 tests, tsc clean.
- 2026-05-08 Phase 4: ✓ idle clip cycling (30–90s mood-matched clips) + VRMA format detection in loadClip. VRMAnimationLoaderPlugin + .vrma files still needed to fully activate (commit 07b35bd). 2843 tests, tsc clean.
