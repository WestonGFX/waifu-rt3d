# Animation Overhaul Research — Mar 28, 2026

**Topic:** How to make VRM avatars move realistically — analysis of RIKO, our current system, and industry approaches
**Why:** Characters look like "stiff dolls" despite having a 7,825-line viewer with 6-layer animation. The approach of hardcoding bone rotation values has been tried many times and doesn't produce natural movement.

---

## 1. RIKO Project Analysis (Gold Standard)

**Location:** `/Users/chris/Code/riko-project/RayenAI-Riko-Project-2025-11-06-Update (Windows v1.1)/riko_project_patreon/riko_project_patreon-main/`

### Animation Stack
| Component | Library | Version |
|-----------|---------|---------|
| VRM Core | @pixiv/three-vrm | 3.4.1 |
| Animations | @pixiv/three-vrm-animation | 3.4.1 |
| Spring Bones | @pixiv/three-vrm-springbone | 3.4.1 |
| Shaders | @pixiv/three-vrm-materials-mtoon | 3.4.1 |
| Three.js | three | 0.177.0 |

### What Makes RIKO Look Realistic

1. **Exponential easing instead of sine waves:**
   ```javascript
   // RIKO: smooth, natural approach to random targets
   current += (target - current) * easeValue;  // 0.02 idle, 0.04 talking

   // OUR CODE: rigid sine oscillation
   head.rotation.x = sin(t*π*2.5) * 0.15 * amp;
   ```
   This is the #1 difference. Sine waves produce robotic motion. Exponential easing produces organic, living movement.

2. **Very subtle idle parameters:**
   - Head nod: 0.2 rad range, 1.8s frequency
   - Head turn: 0.13 rad range
   - Body sway: 0.1 amplitude, 2.8s frequency
   - All applied through easing, never direct assignment

3. **Context-aware speed:** Faster head movements when talking (0.8s vs 1.8s), more body sway

4. **Clean architecture:** AnimationManager (procedural idle), AudioManager (lip sync), app.js (orchestration) — 3 files, clear separation

5. **Audio-driven lip sync:** FFT spectral analysis → 5 phoneme shapes (aa, ee, ih, oh, ou) with smoothing

6. **Pre-made animation support:** Loads both VRMA and Mixamo FBX with proper retargeting via 60+ bone map

7. **Spring bones just work:** @pixiv/three-vrm-springbone handles hair/clothing physics automatically from VRM metadata

### What RIKO Does NOT Have (That We Do)
- No personality system
- No emotion-driven gesture sequencing
- No 28+ gesture library
- No 12 fidget animations
- No animation state machine (8 states)
- No wind force simulation
- No ambient audio synthesis
- No touch/interaction

---

## 2. Our Current System Analysis

**File:** `frontends/shared/viewer/viewer.html` (7,825 lines)

### Architecture
- 6-layer animation system (BasePose → Idle → Emotion → Talk/Gesture → LookAt → Clip)
- AnimationDirector state machine with 8 states
- AnimationSequencer for emotion→gesture mapping
- AnimationRegistry for clip-based fallback
- Full Mixamo + BVH + VRMA retargeting
- Spring bone support with wind, colliders, debug vis
- AudioLipSync (FFT-based)

### Why It Looks Bad Despite Being Feature-Rich

1. **Sine-wave motion is inherently robotic.** Every bone oscillation uses `sin(t * frequency) * amplitude`. This creates perfectly periodic, predictable motion that the human eye instantly recognizes as mechanical.

2. **Hardcoded rotation values are impossible to tune.** With 28+ gestures × ~6 bones each × 3 rotation axes = 500+ magic numbers. No human can tune all of these to look natural.

3. **No pre-made animation files in production.** The ClipLayer can load .glb/.bvh/.vrma but there's no animation library shipped with the app. Users see only procedural gestures.

4. **Transitions may be abrupt.** The crossfade durations (0.15-0.3s) are reasonable but the source/target poses may have large deltas, creating visible pops.

5. **Older three-vrm library.** Bundled minified JS with no version number. Missing latest spring bone improvements and VRMA features.

### Hardcoded Bone Values (Partial List)
- BasePoseLayer lines 831-834: arm drape (-1.4, 0.08, etc.)
- EmotionLayer lines 1308-1390: 9 emotions with direct rotation assignments
- TalkLayer lines 1426-1442: arm oscillation with sine
- GestureLayer lines 1604-1695: 28+ gestures all with hardcoded angles
- LookAtLayer lines 2654-2655: mouse-driven head rotation scales

---

## 3. Industry Approaches

### VTuber Apps (VSeeFace, Warudo, VNyan)
- **Input:** VR controllers, webcam tracking (MediaPipe), iPhone ARKit face tracking
- **Animation:** Motion capture + physics, NOT procedural
- **Key insight:** M.A.S.S. (Movement Animation Synthesis) system in VNyan blends imported animations with motion tracking automatically based on context

### Mixamo
- 2,500+ free animations available (idle, gesture, locomotion, dance, etc.)
- FBX format, retargetable to VRM via bone mapping
- Can be batch-downloaded: https://gist.github.com/krazyjakee/1e3592856dd636b8043cc359ad9d66fc
- **75+ VTuber-specific gestures** documented by anniemuse on DeviantArt

### VRMA (VRM Animation Format)
- Official standard: https://vrm.dev/en/vrma/
- Cross-app, cross-model animation sharing
- @pixiv/three-vrm-animation loads natively
- Growing ecosystem of VRMA files

### AI Motion Generation
- **MDM (Motion Diffusion Model):** Text→motion generation, not real-time yet
- **A-MDM:** Auto-regressive variant, closer to real-time
- **DeepMotion:** Browser-based AI motion capture from video
- **Avatar Forcing (2025):** Real-time diffusion-based avatar generation, single GPU
- **Assessment:** Not production-ready for browser deployment. Good future direction.

### Gaussian VRM (2025)
- Gaussian splats + VRM for photorealistic avatars
- three.js compatible
- Very early stage

---

## 4. Key Recommendations

### Immediate Impact (Phase 1)
1. **Replace sine oscillations with exponential easing** — single biggest visual improvement
2. **Download 50-100 Mixamo animations** — idle variants, gestures, reactions
3. **Upgrade @pixiv/three-vrm to 3.4.1+** — better spring bones, VRMA support
4. **Tune idle parameters to match RIKO** — very subtle, slow, natural

### Medium Term (Phase 2)
5. **Build animation pack system** — load/manage pre-made animation files
6. **Multiple idle styles** — relaxed, energetic, shy, confident (selectable)
7. **Touch/interaction raycasting** — click on avatar → reaction
8. **Improve spring bone configuration** — per-model tuning

### Long Term (Phase 3)
9. **AI-assisted animation generation** — use MDM/similar for custom animations
10. **Webcam motion capture** — MediaPipe integration (stub exists)
11. **Animation marketplace** — user-created/shared animations

---

## 5. Files Referenced

| File | Lines | What |
|------|-------|------|
| `frontends/shared/viewer/viewer.html` | 7,825 | Entire animation system |
| RIKO `client/animationManager.js` | ~200 | Gold standard idle system |
| RIKO `client/audioManager.js` | ~150 | Gold standard lip sync |
| RIKO `client/vrmLoader.js` | ~100 | VRM loading with optimizations |
| RIKO `client/loadMixamoAnimation.js` | ~80 | Mixamo retargeting |
| RIKO `client/mixamoVRMRigMap.js` | ~70 | 60+ bone mapping |
