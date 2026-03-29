# Animation Overhaul & Avatar Interaction — Mega Plan

**Date:** 2026-03-28
**Status:** PLANNING
**Research:** `docs/research/2026-03-28-animation-overhaul-research.md`
**Estimated:** ~80-120 hours across 8-15 sessions
**Priority:** HIGH — this is the #1 visual quality gap in the app

---

## Context: Why This Plan Exists

The app has a 7,825-line viewer with 6 animation layers, 28+ gestures, 12 fidgets, and an 8-state machine — but characters look like "stiff dolls, 10 times worse than Muppets." The RIKO project (an AI waifu companion on GitHub/Patreon) achieves realistic, believable avatar movement with ~500 lines of animation code. The difference is **paradigmatic, not feature-count.**

### Root Causes
1. **Sine-wave oscillation** produces perfectly periodic, robotic motion. RIKO uses exponential easing toward random targets — organic, alive movement.
2. **500+ hardcoded bone rotation values** are impossible to tune to look natural.
3. **Zero pre-made animation files.** Everything is procedural. No motion-captured data.
4. **Older @pixiv/three-vrm** — missing latest spring bone physics and VRMA improvements.
5. **No touch/physical interaction** — users can't poke, touch, or interact with the avatar.

### Gold Standard Reference
RIKO project at `/Users/chris/Code/riko-project/RayenAI-Riko-Project-2025-11-06-Update (Windows v1.1)/riko_project_patreon/riko_project_patreon-main/`

---

## Phase 1: Motion Paradigm Shift (The Big Fix)
**Goal:** Replace robotic sine-wave motion with organic easing-based animation
**Est:** ~12-16 hours | **Impact:** MASSIVE — single biggest visual improvement
**Files:** `frontends/shared/viewer/viewer.html`

### 1A. Easing Engine
Replace all sine-wave bone oscillations with an exponential easing system inspired by RIKO:

```
// NEW PATTERN: EasingTarget class
class EasingTarget {
  constructor(min, max, easeSpeed, changeInterval) { ... }
  update(dt) {
    // Pick new random target every changeInterval seconds
    // current += (target - current) * easeSpeed * dt * 60;
    return this.current;
  }
}
```

**TODOs:**
- [ ] Create `EasingTarget` utility class (random target + smooth approach)
- [ ] Create `NoiseGenerator` utility (Perlin/simplex noise for organic variation)
- [ ] Add configurable easing profiles: `{ idle: 0.02, talk: 0.04, gesture: 0.06 }`
- [ ] Support min/max clamping, frequency variation, and phase offsets

### 1B. BasePoseLayer Overhaul
Replace hardcoded arm drape and breathing with easing targets:

**Current (lines 831-834):**
```javascript
leftUpperArm.rotation.z = -1.4;  // HARDCODED
```

**New:**
```javascript
// Arm drape uses gentle easing around rest position
this.armDrapeLeft = new EasingTarget(-1.45, -1.35, 0.01, 4.0);
leftUpperArm.rotation.z = this.armDrapeLeft.update(dt);
```

**TODOs:**
- [ ] Replace arm drape hardcodes with easing targets (subtle drift around rest pose)
- [ ] Replace breathing sine with noise-modulated easing (variable breath depth/rate)
- [ ] Replace head micro-drift with easing targets (like RIKO: 0.2 nod, 0.13 turn range)
- [ ] Add subtle spine micro-sway via easing (not sine)
- [ ] Make all rest-pose values configurable via personality, not hardcoded

### 1C. IdleBehaviorLayer Overhaul
Replace 12 fidget animations from sine-wave to easing-based:

**TODOs:**
- [ ] Rewrite each fidget to use EasingTarget chains instead of `sin(t*freq)*amp`
- [ ] Add timing variation: fidget duration ± 30% randomization
- [ ] Add amplitude variation: each fidget instance slightly different intensity
- [ ] Add "fidget combos" — subtle overlapping fidgets (e.g., weight shift + head tilt)
- [ ] Personality-scale easing speeds (high energy = faster easing, low = languorous)
- [ ] Never repeat the same fidget twice consecutively (already partly implemented)

### 1D. EmotionLayer Overhaul
Replace hardcoded emotion rotations with easing profiles per emotion:

**TODOs:**
- [ ] Create emotion easing profiles: happy (bouncy, fast), sad (slow, droopy), etc.
- [ ] Replace direct bone assignments with easing targets per emotion
- [ ] Add emotion transitions: blend between emotion profiles over 0.5-1.0s
- [ ] Add micro-expression variation (same emotion, slightly different each time)

### 1E. TalkLayer Overhaul
Replace sine-wave talk animation with audio-responsive easing:

**TODOs:**
- [ ] Link hand/arm movement to audio amplitude (bigger gestures for louder speech)
- [ ] Use easing for head nods synced to speech pauses (not fixed sine)
- [ ] Add talk "styles" — calm speaker vs animated speaker vs shy speaker
- [ ] Personality modulates talk animation intensity naturally

### 1F. GestureLayer: Easing Migration
Convert 28+ gestures from sine to easing with envelopes:

**TODOs:**
- [ ] Rewrite gesture envelope to use easing curves (ease-in/hold/ease-out)
- [ ] Add organic variation to each gesture play (±15% timing, ±20% amplitude)
- [ ] Add "intensity" parameter (subtle wave vs enthusiastic wave)
- [ ] Keep gesture API identical (postMessage `playGesture` unchanged)

---

## Phase 2: Pre-Made Animation Library
**Goal:** Ship 50-100+ motion-captured animations instead of relying on procedural-only
**Est:** ~10-14 hours | **Impact:** HIGH — real human motion data
**Files:** viewer.html (ClipLayer), new `animations/` directory, backend manifest endpoint

### 2A. Mixamo Animation Download & Conversion
**TODOs:**
- [ ] Select 50-100 best Mixamo animations for waifu companion use case:
  - **Idle variants (15+):** breathing, weight shift, looking around, stretching, yawning, hair tuck, phone check, arm cross, hip sway, lean, etc.
  - **Reactions (15+):** nod, shake head, laugh, cry, surprised, angry stomp, shy hide, clap, jump, wave, blow kiss, peace sign, thumbs up, facepalm, shrug
  - **Gestures (10+):** point, beckon, thinking, salute, bow, curtsy, dance idle, excited jump, nervous fidget, dismissive wave
  - **Transitions (10+):** idle-to-sit, sit-to-stand, turn around, step forward, step back
- [ ] Download as FBX (in-place, no root motion)
- [ ] Test retarget to VRM via existing MIXAMO_BONE_MAP
- [ ] Create manifest JSON: `{ id, name, category, emotion, duration, loop, tags }`
- [ ] Store in `frontends/shared/animations/` directory

### 2B. Animation Pack System
**TODOs:**
- [ ] Backend: `GET /api/animations/manifest` — returns available animation metadata
- [ ] Backend: Serve animation files from `shared/animations/` via static mount
- [ ] Frontend: `AnimationPackManager` class in viewer.html
  - Lazy-loads animations on first use
  - Caches loaded clips in memory
  - Provides `getRandomIdle()`, `getReaction(emotion)`, `getGesture(name)` APIs
- [ ] Frontend: Extend `AnimationRegistry` to merge built-in + user-added packs
- [ ] Settings UI: "Animation Style" selector (procedural-only / clip-based / hybrid)

### 2C. Hybrid Animation System
Blend procedural idle with clip-based animations for best results:

**TODOs:**
- [ ] Procedural idle runs constantly as base layer (breathing, micro-drift, blink)
- [ ] Clip-based animations overlay procedural base (like RIKO's approach)
- [ ] Auto-select idle variant clips every 15-30s (prevent repetition)
- [ ] Emotion triggers pick from clip library first, fall back to procedural
- [ ] Configurable blend weights: `{ proceduralWeight: 0.3, clipWeight: 0.7 }`
- [ ] Smooth crossfade between clips (0.3-0.5s)

### 2D. VRMA Animation Support
**TODOs:**
- [ ] Test VRMA loading with upgraded @pixiv/three-vrm-animation
- [ ] Create/find 10-20 VRMA idle animations (growing ecosystem)
- [ ] VRMA files don't need retargeting — native VRM humanoid bones
- [ ] Add VRMA to manifest alongside FBX/GLB

---

## Phase 3: Library Upgrade & Physics
**Goal:** Upgrade @pixiv/three-vrm to latest, improve spring bone physics
**Est:** ~8-10 hours | **Impact:** MEDIUM-HIGH — better hair/clothing movement, spring bones
**Files:** `frontends/shared/lib/`, `viewer.html`, package.json

### 3A. @pixiv/three-vrm Upgrade
**TODOs:**
- [ ] Upgrade from bundled unknown version to @pixiv/three-vrm 3.4.1+
- [ ] Install full ecosystem:
  - `@pixiv/three-vrm` (core)
  - `@pixiv/three-vrm-animation` (VRMA)
  - `@pixiv/three-vrm-springbone` (physics)
  - `@pixiv/three-vrm-materials-mtoon` (anime shaders)
  - `@pixiv/three-vrm-node-constraint` (bone constraints)
- [ ] Upgrade Three.js to 0.177+ (RIKO's version, compatible)
- [ ] Add VRMUtils optimizations from RIKO:
  - `VRMUtils.removeUnnecessaryVertices()`
  - `VRMUtils.combineSkeletons()`
  - `VRMUtils.combineMorphs()`
- [ ] Regression test: all existing animations, gestures, lip sync still work
- [ ] Test spring bone physics improvement with upgraded library

### 3B. Spring Bone Tuning
**TODOs:**
- [ ] Create spring bone presets: `soft` (flowy hair), `medium` (skirt), `stiff` (accessories)
- [ ] Auto-detect spring bone groups from VRM metadata and apply presets
- [ ] Add gravity response to character leaning/turning (natural hair drape)
- [ ] Improve wind simulation: multi-octave noise instead of simple sine
- [ ] Add "breeze" mode: constant gentle ambient wind for life-like hair movement
- [ ] Spring bone settings in the Settings panel (stiffness, drag, gravity sliders)

### 3C. Performance Optimization
**TODOs:**
- [ ] Apply RIKO's VRMUtils optimizations (vertex/skeleton/morph combining)
- [ ] Frustum culling tuning
- [ ] LOD (Level of Detail) for spring bones at distance
- [ ] Profile frame time budget: animation system should use <2ms per frame

---

## Phase 4: Touch & Physical Interaction
**Goal:** Users can click/touch avatar and get reactions
**Est:** ~12-16 hours | **Impact:** HIGH — core companion interaction
**Files:** `viewer.html`, `viewerStore.ts`, `backend/server.py`

### 4A. Raycasting & Hit Zones
**TODOs:**
- [ ] Add Three.js Raycaster to viewer
- [ ] Define hit zones on VRM model:
  - **Head** (head bone bounding sphere) — pat, poke
  - **Face** (head front hemisphere) — boop, cup cheeks
  - **Shoulders** (shoulder bones) — tap, lean
  - **Hands** (hand bones) — hold, high-five
  - **Torso** (spine/chest) — hug, poke
  - **Hair** (spring bone groups) — ruffle, stroke
- [ ] Mouse events: click, mousedown+drag (stroke), hover (proximity awareness)
- [ ] Map hit zone + gesture type → reaction ID
- [ ] postMessage API: `touchEvent({ zone, gesture, position, duration })`

### 4B. Touch Reactions (Animation)
**TODOs:**
- [ ] Create 20+ touch reaction animations:
  - **Head pat:** happy smile, close eyes, lean into hand
  - **Face boop:** surprised blink, playful pout, shy blush
  - **Shoulder tap:** turn to look, curious tilt
  - **Hand hold:** look down at hand, gentle squeeze, blush
  - **Hair ruffle:** scrunch eyes, playful annoyance, fix hair after
  - **Torso poke:** ticklish reaction, step back, playful swat
- [ ] Each reaction varies by relationship level (new = shy, close = affectionate)
- [ ] Per-character reaction preferences (character personality affects response)
- [ ] Reactions trigger both animation AND dialogue (LLM gets touch event context)

### 4C. Touch → Dialogue Integration
**TODOs:**
- [ ] New message type: `touch_event` sent to backend
- [ ] Backend injects touch context into LLM prompt: "The user just [patted your head / held your hand / etc.]"
- [ ] Character responds naturally in dialogue + expression change
- [ ] Touch events affect mood/affinity (positive touch → affinity boost)
- [ ] Cool-down system: prevent touch spam from overwhelming the character

### 4D. Spring Bone Touch Response
**TODOs:**
- [ ] Hair reacts to touch via spring bone force injection
- [ ] Apply impulse force at touch point → spring bones simulate ripple
- [ ] Clothing spring bones react to nearby touch (skirt, ribbons, etc.)
- [ ] Force magnitude proportional to gesture speed (fast poke vs gentle stroke)

### 4E. Visual Touch Feedback
**TODOs:**
- [ ] Subtle cursor change on hover over interactive zones
- [ ] Soft particle effect on touch point (optional, toggle-able)
- [ ] Heart/star particles for affectionate touches (relationship-gated)
- [ ] Blush effect (face redness morph target) for shy/romantic touches

---

## Phase 5: Multiple Animation Styles
**Goal:** User-selectable animation profiles instead of one-size-fits-all
**Est:** ~8-10 hours | **Impact:** MEDIUM — personalization
**Files:** `viewer.html`, settings UI, animation configs

### 5A. Animation Profile System
**TODOs:**
- [ ] Define 5 animation profiles:
  - **Natural** — RIKO-style subtle easing, calm, realistic (default)
  - **Expressive** — larger gestures, more frequent fidgets, anime-style
  - **Minimal** — very subtle, almost still, focus on expressions only
  - **Energetic** — bouncy, frequent movement, high-energy idle
  - **Custom** — user-adjustable sliders for each parameter
- [ ] Each profile defines: easing speeds, amplitude ranges, fidget frequency, gesture probability, talk animation intensity
- [ ] Profile stored in character config (different characters can have different defaults)
- [ ] Profile also selectable globally in Settings

### 5B. Animation Settings UI
**TODOs:**
- [ ] New section in Settings → Character tab: "Animation Style"
- [ ] Profile picker (5 presets + custom)
- [ ] Custom mode sliders:
  - Idle movement intensity (0-100%)
  - Gesture frequency (rare → frequent)
  - Head tracking responsiveness (lazy → snappy)
  - Spring bone bounciness (stiff → flowy)
  - Talk animation intensity (still → animated)
- [ ] Live preview: changes apply immediately to the avatar
- [ ] Per-character override support

---

## Phase 6: Animation Cue System
**Goal:** Smooth, queue-based animation transitions instead of abrupt switches
**Est:** ~6-8 hours | **Impact:** MEDIUM — eliminates jerkiness
**Files:** `viewer.html` (AnimationDirector, layers)

### 6A. Animation Queue
**TODOs:**
- [ ] Create `AnimationQueue` class:
  - Queue of pending animations with priority levels
  - Current animation completes before next starts (unless priority override)
  - Configurable gap between queued items (0-2s)
  - Emergency interrupt for high-priority events (touch, emotion burst)
- [ ] Replace direct `playGesture` with `queueAnimation(gesture, priority, delay)`
- [ ] Auto-queue idle variants on a timer (every 15-30s)

### 6B. Transition Smoothing
**TODOs:**
- [ ] Implement pose blending (lerp between current bone state and target)
- [ ] Variable crossfade duration based on pose distance (big change = longer fade)
- [ ] "Anticipation" frames: slight prep motion before big gestures
- [ ] "Follow-through" frames: momentum carry after gesture completion
- [ ] Ease-in-out curve for all transitions (not linear)

---

## Phase 7: Advanced Animation Sources (Future)
**Goal:** AI-generated and motion-captured animations
**Est:** ~20-30 hours | **Impact:** LONG-TERM
**Files:** TBD

### 7A. Webcam Motion Capture
- [ ] Implement MediaPipe face/body tracking (stub exists at lines 7033-7076)
- [ ] Kalidokit integration for landmark → VRM bone mapping
- [ ] Real-time facial expression + head pose tracking
- [ ] Optional body pose tracking (upper body)

### 7B. AI Motion Generation
- [ ] Evaluate MDM / A-MDM for text→motion generation
- [ ] Create pipeline: emotion → text prompt → MDM → bone keyframes → viewer
- [ ] Pre-generate animation library using AI (batch, not real-time)
- [ ] Store as VRMA or custom keyframe format

### 7C. Community Animation Packs
- [ ] Animation pack format specification (.zip with manifest.json + .glb/.vrma files)
- [ ] Import/export animation packs
- [ ] Animation browser UI for managing installed packs
- [ ] Optional: share packs between users (future marketplace)

---

## Implementation Order

### Recommended sequence:
```
Phase 1 (Motion Paradigm)  → Do FIRST, biggest visual impact
Phase 3A (Library Upgrade) → Do with Phase 1, enables better physics
Phase 2 (Animation Library)→ Do SECOND, adds real motion data
Phase 3B-C (Physics Tuning)→ Do with Phase 2
Phase 5 (Animation Styles) → Do THIRD, user personalization
Phase 6 (Cue System)       → Do with Phase 5
Phase 4 (Touch Interaction)→ Do FOURTH, requires working animations first
Phase 7 (Advanced)         → Future, not urgent
```

### Can interleave with NSFW Phase 1:
The animation overhaul is independent of the NSFW feature work (different files entirely). Could alternate sessions:
- Session A: NSFW Phase 1 (F40 Boundaries, F13 Writing Styles)
- Session B: Animation Phase 1 (Easing Engine, BasePose/Idle overhaul)
- Session C: NSFW Phase 1 cont. (F15 Sensory, F30 Pet Names)
- Session D: Animation Phase 2 (Mixamo download, pack system)

---

## Critical Files

| File | Role | Changes |
|------|------|---------|
| `frontends/shared/viewer/viewer.html` | Entire animation system | Phase 1, 2, 3, 4, 5, 6 |
| `frontends/shared/lib/three-vrm.module.min.js` | VRM library | Phase 3 (upgrade) |
| `frontends/shared/lib/three.module.js` | Three.js | Phase 3 (upgrade) |
| `frontends/sakura/src/stores/viewerStore.ts` | React↔viewer bridge | Phase 4, 5 |
| `frontends/sakura/src/views/SettingsView.tsx` | Settings UI | Phase 5 |
| `backend/server.py` | Touch event handling | Phase 4 |
| New: `frontends/shared/animations/` | Pre-made animation files | Phase 2 |
| New: `frontends/shared/viewer/easing.js` | Easing engine module | Phase 1 |

## Verification

### Phase 1 verification:
- Load any VRM model in the viewer
- Character should exhibit subtle, natural-looking idle motion
- Head drifts slowly, body sways gently, breathing is organic
- No visible periodic repetition (the "metronome" effect is gone)
- Fidgets feel varied and natural, not mechanical
- Compare visually against RIKO running side-by-side

### Phase 2 verification:
- `GET /api/animations/manifest` returns 50+ animation metadata entries
- Each animation plays correctly on a VRM model
- Idle variants auto-cycle every 15-30s
- Emotion triggers select appropriate clips
- No visible retargeting artifacts (bones in wrong position)

### Phase 4 verification:
- Click on avatar head → pat reaction animation + dialogue response
- Click on different body zones → zone-appropriate reactions
- Spring bones respond to touch impulse
- Touch affects mood/affinity in backend
- Cool-down prevents spam

### General:
- `npx tsc --noEmit` clean
- `pytest backend/tests/ -q` all pass
- FPS stays above 30 with all animations active
- No visible jank, pop, or snap during any animation transition
