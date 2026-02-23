# Layered Procedural Animation System — Design

> **Phase 6F Replacement** — Instead of Mixamo FBX animations, enhance the procedural
> system with a layered architecture and per-character personality profiles.

## Goal

Make VRM characters feel alive with natural, personality-driven idle behavior,
conversational body language, and smooth gesture transitions — all procedural,
no external animation files required.

## Architecture: 6-Layer Pipeline

Every frame, the animation system processes 6 layers in order. Each layer
writes to specific bones using either set (`=`) or additive (`+=`) mode.

```
L0: BasePose         (spine, chest, hips)         =  Breathing, weight distribution, A-pose arms
L1: IdleBehavior     (arms, hands, spine, head)   =  Fidgets, weight shifts, micro-gestures
L2: EmotionModifier  (spine, hips, shoulders)     += Posture bias from current emotion
L3: TalkBehavior     (hands, head, spine)          =  Hand gestures + lean during speech
L4: GestureOverride  (any bones, temporary)        =  Triggered animations (wave, dance, etc.)
L5: LookAt           (eyes, head)                 += Mouse tracking + idle gaze wander
```

**Key rules:**
- L3 (Talk) suppresses L1 (Idle) when active — no fidgeting while speaking
- L4 (Gesture) suppresses L1 and L3 on affected bones during playback
- L5 (LookAt) is always additive — runs on top of everything else
- All layers receive the personality profile and scale their behavior accordingly

## Personality Profiles

5 parameters, each 0–1, stored as JSON in a new `animation_profile` column:

```json
{
  "energy": 0.7,
  "confidence": 0.8,
  "nervousness": 0.2,
  "expressiveness": 0.6,
  "playfulness": 0.5
}
```

**Default** (when null): `{energy:0.5, confidence:0.5, nervousness:0.3, expressiveness:0.5, playfulness:0.5}`

### Parameter Effects

| Parameter | L0 BasePose | L1 IdleBehavior | L2 Emotion | L3 Talk | L4 Gesture |
|-----------|-------------|-----------------|------------|---------|------------|
| energy | Breath speed/depth | Fidget frequency | Emotion intensity | Talk gesture size | — |
| confidence | Chest-out, wider stance | Hand-on-hip, relaxed arms | Less posture change | Expansive gestures | — |
| nervousness | Faster breathing | Self-touch, hand fidgets | Amplify negative | Smaller gestures | — |
| expressiveness | — | Dramatic fidgets | Bigger posture shifts | Larger gestures | Scale all amplitudes |
| playfulness | — | Silly fidgets unlocked | Happy amplified, angry→pouty | Head bobbing, funny poses | Bouncier dance/celebrate |

## L1: Idle Behavior Library (22 Fidgets)

Each fidget is a bone-math micro-animation lasting 1-3 seconds. A random timer
(3-8s, scaled by energy) picks from eligible fidgets based on personality thresholds.

| Fidget | Bones | Duration | Requires |
|--------|-------|----------|----------|
| weight_shift | hips, legs | 2s | — |
| shoulder_roll | shoulders | 1.5s | — |
| head_tilt | head, neck | 1s | — |
| look_around | head, eyes | 2s | — |
| deep_breath | chest, spine | 3s | — |
| arm_adjust | one arm | 1.5s | — |
| subtle_sway | hips, spine | 3s | — |
| ankle_cross | legs, feet | 3s | — |
| hand_to_chest | one arm | 1.5s | — |
| hand_clasp | both hands, arms | 2s | confidence > 0.4 |
| hip_cock | hips, spine | 2s | confidence > 0.6 |
| hand_on_hip | one arm, hand | 3s | confidence > 0.5 |
| touch_face | one arm, hand | 1.5s | nervousness > 0.3 |
| touch_hair | one arm, hand | 2s | nervousness > 0.3 |
| fidget_hands | both hands | 1.5s | nervousness > 0.4 |
| hand_behind_back | both arms | 2.5s | nervousness > 0.3 OR playfulness > 0.4 |
| hair_twirl | one arm, hand | 2s | playfulness > 0.5 |
| peace_sign | one arm, hand | 1s | playfulness > 0.6 |
| curtsy_bob | hips, legs, spine | 2s | playfulness > 0.5 |
| bounce | hips, spine | 1s | energy > 0.6 |
| stretch | arms, spine | 3s | energy > 0.5 |
| foot_tap | one leg, foot | 2s | energy > 0.4 |

## L3: Talk Behavior

Activates when `isTalking` is true. Adds conversational body language:

- **Illustrative hands** — small hand movements synced loosely with audio amplitude
- **Head nods** — periodic small nods for emphasis (2-3 per sentence via timer)
- **Forward lean** — slight spine tilt toward camera (engagement)
- **Weight shift** — periodic shifts during long speech

Personality influence: confidence → wider gestures; nervousness → hands close to body;
playfulness → more head tilts, exaggerated nods; expressiveness → scales all.

## L4: Gesture Improvements

Existing 14 gestures kept, plus two improvements:

1. **Smooth blend curves** — Replace `sin(t * PI)` with ramp-in/hold/ramp-out:
   - 0–15%: ease-in from current pose
   - 15–85%: full gesture amplitude
   - 85–100%: ease-out to idle pose

2. **Personality scaling** — All gesture amplitudes × expressiveness parameter.

## Implementation Scope

### Files Modified
- `frontends/neon/viewer/viewer.html` — Refactor animation controllers (~400 lines)
- `backend/preflight.py` — Schema migration: add `animation_profile` column
- `backend/server.py` — Include `animation_profile` in character CRUD
- `frontends/neon/js/components/WaifuCreator.js` — Add 5 personality sliders
- `backend/tests/conftest.py` — Add column to test schema

### New Classes (in viewer.html)
- `AnimationLayer` — base class with personality-aware update
- `BasePoseLayer` — L0: breathing, weight distribution
- `IdleBehaviorLayer` — L1: fidget library with random timer
- `EmotionLayer` — L2: replaces ProceduralAnimator
- `TalkLayer` — L3: conversational body language (new)
- `GestureLayer` — L4: replaces GestureController with smooth blending
- `LookAtLayer` — L5: absorbs MouseTracking + IdleHeadMovement
- `AnimationDirector` — orchestrator, manages all layers + personality

### Backward Compatible
Existing postMessage API (`playGesture`, `setEmotion`, `playSequence`) routes
through `AnimationDirector` instead of directly calling controllers.
