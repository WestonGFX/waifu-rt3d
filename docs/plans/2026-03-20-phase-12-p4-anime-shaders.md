# Phase 12-P4: Anime Shaders + Gradient Backgrounds + Emotion Particles

**Status:** READY TO EXECUTE
**Estimated:** Proto 8-12h across 3 waves of parallel agents
**Performance budget:** <3ms total for all new effects (RTX 5080)
**NOTE:** This file should be renamed to `2026-03-20-phase-12-p4-anime-shaders.md` on execution.

## Context

Phase 12-P3 (touch raycasting + camera presets) is done. Phase 12-P4 is next on the MVP priority list. The viewer already has EffectComposer (bloom + color grading), a 500-particle GPU system, and a 5-subsystem emotion dispatch chain. This phase extends those systems and adds new GLSL shaders for anime-style rendering.

---

## Wave 0: Process Improvements (Self — before any feature work)

### 0A: Add Plan Hygiene Rules to CLAUDE.md
**File:** `CLAUDE.md`
Add rules section:
- Plan files MUST be named `YYYY-MM-DD-<description>.md`
- After completing a plan phase: update `CURRENT_STATUS.md` + mark phase done in master plan
- Commit messages MUST include plan phase reference: `feat(12-P4): description`
- Before claiming work done: verify status files are current

### 0B: Rename Existing Plan Files
- Rename `structured-strolling-journal.md` → `2026-03-20-phase-12-p4-anime-shaders.md`
- Note: The master plan `replicated-foraging-nebula.md` is 3400 lines and heavily referenced in MEMORY.md — renaming requires updating all references. Recommend adding an alias/symlink or a header note pointing to the new name.

### 0C: Create `/checkpoint` Skill
**File:** `.claude/skills/checkpoint/SKILL.md`
**Convention:** SKILL.md (uppercase, matching existing skills), `user_invocable: true`

A skill for milestone status updates. Steps:
1. Read `CURRENT_STATUS.md` + most recent plan file in `.claude/plans/`
2. Diff against current git state (`git log --oneline -5`, `git diff --stat HEAD~1`)
3. Identify what phases/tasks were completed since last checkpoint
4. Update `CURRENT_STATUS.md`: move completed phases to done, update test count, update "Next 3 Tasks"
5. Update master plan file: mark completed phases `✅ DONE`
6. Output a formatted commit message template with phase reference
7. Save any session insights to a structured note if noteworthy

**Auto-triggering:** CLAUDE.md rule — "After completing a feature/phase, proactively run `/checkpoint` before the commit. Do not wait for the user to ask."

This means:
- User never has to remember — I just do it
- `/checkpoint` is also manually invocable for ad-hoc status checks
- The skill itself is short (~40 lines) following the pattern of `/smoke-test` and `/dashboard`

### 0D: Update Master Plan Phase Tracking (one-time catchup)
**File:** `.claude/plans/replicated-foraging-nebula.md`
- Mark phases 1, 2, 3, 6, 9A-E, 12-P1, 12-P2, 12-P3, 13A, 13B as `✅ DONE`
- Update CURRENT_STATUS.md to reflect schema v56 and 525 tests
- This is a one-time sync; future updates happen via `/checkpoint`

---

## Architecture Decision: Gradient Background

Use a **Three.js fullscreen shader quad** (not CSS gradient). The current CSS gradient approach makes the scene transparent, which breaks bloom/god-ray sampling (they'd sample black). A shader quad at `renderOrder: -9999` ensures particles and post-processing composite correctly against the gradient.

## Architecture Decision: Toon Shaders

Use `material.onBeforeCompile` injection on `MeshStandardMaterial` meshes. This preserves VRM blend shapes and animation targets. MToon materials (already toon-shaded by VRM spec) are **skipped**. Rim lighting uses a separate additive `RimGlowMaterial` overlay mesh for MToon compatibility.

---

## Wave 1: Independent Effects (3 agents in parallel)

### Task 1A: Emotion Color Grading Presets
**Agent:** senior-dev
**Files:** `frontends/shared/viewer/viewer.html` (lines 3640-3726), `frontends/sakura/src/components/EffectsPanel.tsx`
**Scope:** Extend existing `colorGradePass` with emotion-aware auto-presets

- Add `EMOTION_COLOR_GRADES` lookup table (8 emotions → brightness/contrast/saturation presets)
- Add `_emotionColorGradeEnabled` flag + `applyEmotionColorGrade(emotion)` with 0.5s lerp transition
- Add `updateEmotionColorGrade(dt)` called from `animate()` loop (near line 4252)
- Add `emotionColorGrade: { enabled }` to `_effectsConfig`, wire into `updateEffects()`
- Call `applyEmotionColorGrade()` from `setExpression` handler (line 5405 area)
- EffectsPanel: Add "Auto Color Grade" checkbox in Color Grade section

**Pattern:** Follow existing `colorGradePass` uniform update pattern at lines 3716-3721

### Task 1B: Gradient Background Shader Plane
**Agent:** senior-dev
**Files:** `frontends/shared/viewer/viewer.html` (lines 3923-3960)
**Scope:** Replace CSS gradient with Three.js shader quad + emotion-driven presets

- Create `gradientBgMesh` — `PlaneGeometry(2,2)` with custom `ShaderMaterial`:
  - Uniforms: `uTopColor`, `uBottomColor`, `uMidColor`, `uMidPoint`, `uTime`, `uAnimSpeed`
  - Fragment: 3-stop gradient with optional animated wave (`sin(x * PI + time * speed) * 0.03`)
  - `depthWrite: false`, `depthTest: false`, `renderOrder: -9999`, `frustumCulled: false`
- Add `EMOTION_GRADIENTS` table (6 emotions → top/mid/bottom color presets)
- Add `_emotionGradientEnabled` flag + `applyEmotionGradient(emotion)` with 0.8s color lerp
- Modify `setBackground('gradient', ...)` to activate shader quad, set `scene.background = null`
- Tick `uTime += dt` in `animate()` when gradient visible
- PostMessage: extend `setEffects` with `emotionGradient: { enabled }` key
- EffectsPanel: Add "Emotion Gradient" toggle

**Key colors from plan:**
| Emotion | Top | Mid | Bottom |
|---------|-----|-----|--------|
| happy | #FFE4B5 | #FFCA85 | #FFB6D9 |
| sad | #4A7BA7 | #3A5A7A | #7D8B9E |
| angry | #FF6347 | #CC2200 | #8B0000 |
| calm | #87CEEB | #A0D8EF | #E0F6FF |
| love | #FFB6D9 | #FF89B5 | #FFC0CB |
| night | #1C1C3C | #252545 | #2F4F4F |

### Task 1C: Enhanced Particle Types + Emotion Ambient Spawning
**Agent:** senior-dev
**Files:** `frontends/shared/viewer/viewer.html` (lines 3735-3920)
**Scope:** Extend existing particle system with 4 new types and emotion-driven ambient mode

- Add 4 new `typeConfigs` entries: `rain`, `embers`, `firefly`, `confetti`
  - rain: `{ color: 0x88bbee, scale: 0.008, lifetime: 2.0, speed: 1.2, gravity: -2.0 }` — elongated mesh (scaleY × 4)
  - embers: `{ color: 0xff6622, scale: 0.02, lifetime: 3.0, speed: 0.2, gravity: 0.15 }` — additive blending
  - firefly: `{ color: 0xccff44, scale: 0.015, lifetime: 4.0, speed: 0.08, gravity: 0.0 }` — pulsing opacity via `sin(time * 3)`
  - confetti: `{ color: 0xff44ff, scale: 0.035, lifetime: 3.5, speed: 0.4, gravity: -0.3 }`
- Add `EMOTION_AMBIENT_MAP`: happy→sparkle, sad→rain, angry→embers, love→heart, calm→firefly, excited→confetti
- Add `setEmotionAmbientParticles(emotion)` — switches ambient type when emotion changes
- Call from `setExpression` handler after `triggerEmotionParticles()`
- PostMessage: `setEmotionAmbientParticles` with `{ enabled }` payload
- EffectsPanel: Add "Emotion Ambient Particles" toggle + add rain/embers/firefly/confetti to `AMBIENT_TYPES`

**Pattern:** Follow existing `typeConfigs` at line 3783 and `triggerEmotionParticles` at line 3897

---

## Wave 2: Post-Processing Passes (3 agents in parallel)

### Task 2A: Anime Outline Pass
**Agent:** senior-dev
**Files:** `frontends/shared/lib/shaders/OutlineShader.js` (NEW), `viewer.html`
**Scope:** Backface-extrusion outline rendering

- Create `OutlineShader.js` exporting an `OutlinePass` class extending `Pass`
  - Vertex shader: extrude vertices along normals by `uThickness` in NDC space (screen-consistent width)
  - Fragment shader: solid `uColor` at `uOpacity`
  - `render()`: traverse scene, swap materials to outline material with `side: BackSide`, render, restore
  - Material cache via `WeakMap` to avoid per-frame allocations
- In viewer.html: import, insert into composer at index 1 (after RenderPass, before BloomPass)
- Wire `animeOutline` config key (already declared at line 3645) into `updateEffects()`
- Update `_effectsEnabled` check at line 3724 to include `outlinePass.enabled`
- EffectsPanel: Add "Anime Outline" section — enable toggle, thickness slider (0.5-3.0)

### Task 2B: Emotion-Responsive Rim Lighting
**Agent:** senior-dev
**Files:** `viewer.html`
**Scope:** Fresnel rim glow on character mesh, color changes with emotion

- Add `EMOTION_RIM_COLORS` table (6 emotions → THREE.Color)
- Add `_rimLightEnabled`, `_rimLightColor`, `_rimLightIntensity`, `_rimLightPower` state vars
- **MToon-safe approach:** Create `RimGlowMaterial` (ShaderMaterial, additive blending, Fresnel-only)
  - For each VRM mesh: clone geometry → add child mesh with RimGlowMaterial, `depthWrite: false`
  - Store refs in `_rimMeshes[]` for runtime color/intensity updates
  - ~5-8 extra draw calls (acceptable at <0.1ms)
- Add `applyEmotionRimLight(emotion)` — lerps color over 0.3s
- Call from `setExpression` handler when `_rimLightEnabled && autoEmotion`
- Wire into `setEffects` handler: `rimLight: { enabled, color, intensity, power }`
- EffectsPanel: "Rim Glow" section — enable toggle, intensity slider, "Auto by Emotion" checkbox

**Rim color presets:**
| Emotion | Color | Intensity | Power |
|---------|-------|-----------|-------|
| happy | #FFD700 (gold) | 0.8 | 3.0 |
| sad | #4169E1 (blue) | 0.5 | 4.0 |
| angry | #FF4500 (red-orange) | 1.0 | 2.5 |
| love | #FFB6C1 (pink) | 0.7 | 3.5 |
| calm | #87CEEB (sky) | 0.6 | 3.5 |

### Task 2C: God Rays Pass
**Agent:** senior-dev
**Files:** `frontends/shared/lib/shaders/GodRaysShader.js` (NEW), `viewer.html`
**Scope:** Screen-space radial blur from character head position

- Create `GodRaysShader.js` — shader definition with uniforms: `uLightPos`, `uIntensity`, `uDecay`, `uDensity`, `uSamples (32)`, `uTint`
- Fragment: radial blur sampling outward from `uLightPos` with exponential decay
- In viewer.html: create `godRaysPass = new ShaderPass(GodRaysShader)`, insert after bloom before colorGrade
- In `animate()`: project character head bone world position to screen NDC → update `uLightPos`
- Add `EMOTION_GODRAY_TINTS` — match emotion gradient top colors
- Wire `godRays: { enabled, intensity, decay, density }` into `updateEffects()`
- Update `_effectsEnabled` check
- EffectsPanel: "God Rays" section — enable toggle, intensity slider

---

## Wave 3: Material Shaders (Do yourself — shared file conflicts)

### Task 3A: Toon/Cel-Shading (Self)
**Files:** `frontends/shared/lib/shaders/ToonShader.js` (NEW), `viewer.html`
**Scope:** Quantized lighting on MeshStandardMaterial meshes

- Create `ToonShader.js` exporting GLSL chunks for `onBeforeCompile` injection:
  - Replace `#include <lights_fragment_begin>` with quantized NdotL (2-3 discrete bands)
  - Add `uToonLevels`, `uToonSoftness`, `uShadowBias` uniforms
- In viewer.html: `enableToonShading(enabled)` traverses VRM meshes
  - Skip MToon materials (`material.isMToonMaterial || material.type === 'MToonMaterial'`)
  - Store original `onBeforeCompile` in WeakMap for disable path
  - Chain with rim light injection if both active
- Wire `toonShading: { enabled, levels, softness, shadowBias }` into `updateEffects()`
- EffectsPanel: "Cel-Shading" section — enable toggle, levels dropdown (2/3)

### Task 3B: Specialty Shaders — Hair/Eye/Skin (Stretch Goal)
**Files:** `frontends/shared/lib/shaders/AnimeSpecialtyShaders.js` (NEW), `viewer.html`

**Only implement after 3A verified working.** These are stretch goals:

- **Hair Anisotropic:** Kajiya-Kay model injected via `onBeforeCompile` on hair-named meshes
- **Eye Sparkle:** Additive mesh overlay on eye meshes with rotating star SDF
- **Skin SSS:** Wraparound diffuse (`NdotL` remapped to 0.3-1.0) — no extra pass needed

---

## Integration (Self — sequential, after all waves)

1. Ensure all new config keys in `_effectsConfig` are complete
2. Update `_effectsEnabled` check to cover all passes: `bloomPass.enabled || colorGradePass.enabled || outlinePass?.enabled || godRaysPass?.enabled`
3. Verify EffectsPanel dispatches correctly for all new toggles
4. Update viewerStore types if any new dispatch methods needed
5. Test emotion flow: send `setExpression` → verify gradient + color grade + rim + particles all react

---

## New Files Summary

| File | Purpose |
|------|---------|
| `frontends/shared/lib/shaders/OutlineShader.js` | Backface-extrusion outline Pass |
| `frontends/shared/lib/shaders/GodRaysShader.js` | Radial blur god rays shader |
| `frontends/shared/lib/shaders/ToonShader.js` | GLSL chunks for toon lighting |
| `frontends/shared/lib/shaders/AnimeSpecialtyShaders.js` | Hair/eye/skin (stretch) |

## Modified Files Summary

| File | Changes |
|------|---------|
| `frontends/shared/viewer/viewer.html` | Gradient bg mesh, emotion color grade, enhanced particles, rim glow meshes, pass wiring, postMessage handlers |
| `frontends/sakura/src/components/EffectsPanel.tsx` | 6 new sections: Emotion Color Grade, Emotion Gradient, Emotion Ambient, Outline, Rim Glow, God Rays |
| `frontends/sakura/src/stores/viewerStore.ts` | Possibly new dispatch helpers (or reuse existing `dispatchSetEffects`) |

## Performance Budget

| Effect | GPU Cost | Notes |
|--------|----------|-------|
| Emotion color grade | ~0.05ms | Existing pass, uniform updates only |
| Gradient background | ~0.02ms | Single fullscreen quad |
| Enhanced particles | ~0.1ms | Same system, more types |
| Anime outline | ~0.5ms | Second scene render (backface) |
| Rim lighting | ~0.1ms | 5-8 additive Fresnel meshes |
| God rays | ~0.8ms | 32 radial blur samples |
| Toon shading | ~0.15ms | Modified lighting calc |
| **Total** | **~1.7ms** | **Under 3ms budget** |

## Verification

1. `cd frontends/sakura && npx tsc --project tsconfig.app.json --noEmit` — must be clean
2. `.venv/bin/python -m pytest backend/tests/ -q --tb=line` — must pass (no backend changes)
3. Manual: Load app → open EffectsPanel → toggle each effect → verify visual output
4. Manual: Send chat message → verify emotion triggers gradient + color grade + rim + particles
5. Check console for `[Viewer] Effects updated:` logs showing new config keys
