# Phase 6F — Layered Procedural Animation System

## Context

The VRM viewer currently has 5 independent animation controllers (ProceduralAnimator, IdleHeadMovement, MouseTrackingController, GestureController, ExpressionController) that run in isolation with no personality awareness and no coordination between them. This phase replaces them with a unified 6-layer pipeline driven by per-character personality profiles (5 floats: energy, confidence, nervousness, expressiveness, playfulness). The result: characters that feel alive, move differently based on personality, and blend animations cleanly.

**Design doc:** `docs/plans/2026-02-23-layered-animation-design.md`
**Implementation plan:** `docs/plans/2026-02-23-layered-animation-implementation.md`

---

## Architecture

```
L0 BasePose      — breathing, weight, posture (SET)
L1 IdleBehavior  — 22 personality-gated fidgets (SET, suppressed by L3/L4)
L2 Emotion       — additive posture bias from emotion (+=)
L3 Talk          — hand/head gestures during speech (SET, suppresses L1)
L4 Gesture       — triggered animations like wave/bow (SET, suppresses L1+L3)
L5 LookAt        — mouse tracking + idle gaze wander (+= always)
```

AnimationDirector orchestrates all 6 layers per frame with suppression rules.

---

## Tasks

### Task 1: Backend — Schema v16 migration
- **Files:** `backend/preflight.py`, `backend/tests/conftest.py`
- Add `animation_profile TEXT` column to characters table
- Wire `migrate_to_v16()` into `ensure_db()`
- Update test schema in conftest.py
- **Verify:** `python -m pytest backend/tests/ -x -v --tb=short`

### Task 2: Backend — Character CRUD update
- **File:** `backend/server.py`
- Add `animation_profile` to GET/PUT/POST character endpoints
- JSON-encode on write, JSON-decode on read
- **Verify:** pytest passes

### Task 3: AnimationLayer base + AnimationDirector
- **File:** `frontends/neon/viewer/viewer.html` (insert before line ~310)
- `DEFAULT_PERSONALITY` constant, `AnimationLayer` abstract base, `AnimationDirector` orchestrator
- Suppression logic: Talk suppresses Idle, Gesture suppresses Idle+Talk

### Task 4: BasePoseLayer (L0)
- **File:** `frontends/neon/viewer/viewer.html`
- Breathing rhythm (personality-scaled rate/depth), confidence posture
- Replaces inline breathing code in render loop

### Task 5: IdleBehaviorLayer (L1)
- **File:** `frontends/neon/viewer/viewer.html`
- 22 fidgets with personality gates (e.g. hair_twirl requires playfulness > 0.5)
- Random timer (3-8s scaled by energy), smooth envelope blending

### Task 6: EmotionLayer (L2)
- **File:** `frontends/neon/viewer/viewer.html`
- Additive posture modifiers per emotion (happy bounce, sad slouch, etc.)
- Replaces ProceduralAnimator class
- Playfulness transforms: angry → pouty

### Task 7: TalkLayer (L3)
- **File:** `frontends/neon/viewer/viewer.html`
- Illustrative hand movements during speech, periodic head nods, forward lean
- Confidence = wider gestures, nervousness = hands close

### Task 8: GestureLayer (L4)
- **File:** `frontends/neon/viewer/viewer.html`
- All 14 existing gestures preserved with improved 3-phase blend envelope
- Expressiveness scales amplitude

### Task 9: LookAtLayer (L5)
- **File:** `frontends/neon/viewer/viewer.html`
- Absorbs MouseTrackingController + IdleHeadMovement
- Mouse active → track cursor. Mouse idle → gaze wander. Always additive.

### Task 10: Wire into render loop + postMessage
- **File:** `frontends/neon/viewer/viewer.html`
- Replace controller init at model load with AnimationDirector setup
- Replace render loop animation calls
- Update postMessage handlers (setExpression, playGesture, playGestureSequence, new setPersonality)
- Update `_triggerAutoGesture` to use GestureLayer

### Task 11: WaifuCreator personality sliders
- **Files:** `frontends/neon/js/components/WaifuCreator.js`, `frontends/neon/js/components/ViewerBridge.js`
- 5 range sliders in Identity tab with live preview
- `setPersonality()` in ViewerBridge
- Load personality on character switch

### Task 12: Legacy cleanup + final integration
- **File:** `frontends/neon/viewer/viewer.html`, `backend/preflight.py`
- Mark legacy classes deprecated, remove dead controller calls from render loop
- Manual verification (12-point checklist in implementation plan)
- **Verify:** pytest + browser testing

---

## Key Files
| File | Role |
|------|------|
| `backend/preflight.py` | Schema v16 migration |
| `backend/server.py` | Character CRUD (add animation_profile) |
| `backend/tests/conftest.py` | Test schema update |
| `frontends/neon/viewer/viewer.html` | All 6 layers + director + render loop rewire |
| `frontends/neon/js/components/WaifuCreator.js` | Personality slider UI |
| `frontends/neon/js/components/ViewerBridge.js` | setPersonality() bridge method |

## Existing Code to Reuse
- `ExpressionController` (viewer.html:745) — kept as-is, handles blend shapes
- `BlinkController` (viewer.html:580) — kept as-is
- `AudioLipSync` (viewer.html:405) — kept as-is
- `getBone()` pattern (normalized → raw fallback) — replicated in AnimationLayer base
- `_triggerAutoGesture()` (viewer.html:1090) — updated to use GestureLayer
- `EMOTION_GESTURE_MAP` (viewer.html:1090) — preserved

## Verification
1. `python -m pytest backend/tests/ -x -v --tb=short` — after Tasks 1, 2, 11, 12
2. Browser console check — no JS errors after each viewer.html task
3. 12-point manual checklist (Task 12) — breathing, fidgets, mouse tracking, talk gestures, emotion posture, personality sliders, all 14 legacy gestures
