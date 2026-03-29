# Spring Bones Implementation Spec

**Date:** 2026-03-29
**Research:** `docs/research/2026-03-29-spring-bones-3d-research.md`
**Scope:** Fix spring bone physics in `frontends/shared/viewer/viewer.html` for natural secondary motion (hair, clothes, accessories) on VRM models with Mixamo animations.

---

## Problem Statement

Spring bones (hair, clothing, ribbons) on VRM models appear frozen or jittery because:

1. **Mixamo clips include keyframes for spring bone joints** -- these override physics, making hair rigid.
2. **Delta time is capped at 100ms** (line 5984) but spring bone physics explodes at anything above ~50ms. Tab-switch lag spikes cause hair to fly to infinity.
3. **Collider debug only renders spheres** -- VRM 1.0 capsule colliders are invisible, making it impossible to debug body penetration.
4. **No tuning UI** -- adjusting spring bone stiffness/drag/gravity requires code changes. No way for users or devs to dial in per-character physics.
5. **No preset persistence** -- tuned parameters are lost on reload.

---

## Phase Breakdown

### Phase 1: Critical Fixes (1.5h)

Two high-priority one-shot fixes that immediately improve every VRM model.

#### 1A. Delta Time Clamping (15 min)

**File:** `frontends/shared/viewer/viewer.html`
**Line:** 5984

The current cap is 100ms. Spring bone Verlet integration becomes unstable above ~50ms. Research recommends 50ms max.

**Current code (line 5984):**
```javascript
const delta = Math.min(clock.getDelta(), 0.1);
```

**Replace with:**
```javascript
const delta = Math.min(clock.getDelta(), 0.05); // 50ms max — prevents spring bone physics explosion on tab switch
```

That is it. One number change. The 0.1 cap was chosen for animation smoothness but spring bones need the tighter 0.05 bound. Skeletal animations handle large deltas fine (they just jump); spring bones do not (they diverge).

#### 1B. Strip Spring Bone Tracks from Mixamo Clips (1h 15min)

**File:** `frontends/shared/viewer/viewer.html`
**Location:** `ClipLayer.loadClip()` method (line ~2139, after retarget but before storing in clipLibrary) and `ClipLayer._loadBVH()` (same pattern).

**Why:** Mixamo FBX-to-GLB exports sometimes include keyframe tracks for bones that VRM uses as spring bone joints (e.g., hair bones named `J_Sec_Hair1_01`). When the AnimationMixer plays these tracks, they override the Verlet simulation — the hair goes rigid.

**Approach:** After retargeting, filter out any track whose target bone is a spring bone joint. This must happen before the clip is stored in `clipLibrary`.

**Add this method to `ClipLayer`:**
```javascript
/**
 * Remove animation tracks that target spring bone joints.
 *
 * Mixamo clips sometimes include keyframes for bones that VRM uses
 * for spring bone physics (hair, clothing, accessories). These tracks
 * override the Verlet simulation, freezing the spring bones. Stripping
 * them lets the physics run freely.
 *
 * @param {THREE.AnimationClip} clip - The clip to filter (mutated in-place)
 * @returns {THREE.AnimationClip} The same clip with spring bone tracks removed
 */
stripSpringBoneTracks(clip) {
    if (!this.vrm?.springBoneManager?.joints?.length) return clip;

    const springBoneNames = new Set(
        this.vrm.springBoneManager.joints.map(j => j.bone.name)
    );

    const before = clip.tracks.length;
    clip.tracks = clip.tracks.filter(track => {
        // Track names are "nodeName.property" (e.g., "J_Sec_Hair1_01.quaternion")
        const dotIdx = track.name.indexOf('.');
        if (dotIdx === -1) return true;
        const boneName = track.name.substring(0, dotIdx);
        return !springBoneNames.has(boneName);
    });

    const removed = before - clip.tracks.length;
    if (removed > 0) {
        console.log(`[ClipLayer] Stripped ${removed} spring bone tracks from "${clip.name}"`);
    }
    return clip;
}
```

**Wire it in `loadClip()` (line ~2143):** After the retarget loop, add:
```javascript
// Strip spring bone tracks so physics simulation isn't overridden
for (const anim of animations) {
    this.stripSpringBoneTracks(anim);
}
```

**Wire it in `_loadBVH()` (line ~2274):** After creating the clip, add:
```javascript
this.stripSpringBoneTracks(clip);
```

**Wire it in the inline `applyKeyframes` handler (line ~7571):** After creating the clip, add:
```javascript
if (cl.stripSpringBoneTracks) cl.stripSpringBoneTracks(clip);
```

**Ensure `this.vrm` is available in ClipLayer:** The constructor (line ~2023) receives `vrm` already — verify `this.vrm = vrm` is set. If not, add it.

---

### Phase 2: Capsule Collider Debug Visualization (2h)

**File:** `frontends/shared/viewer/viewer.html`
**Location:** `toggleColliderDebug` handler (lines 7656-7696)

The existing debug viz creates `SphereGeometry` for every collider regardless of shape. VRM 1.0 models use capsule colliders (two endpoints + radius) for arms, legs, and torso. These are invisible in debug mode, making it impossible to verify anti-clipping.

**Approach:** Detect collider shape type and render the appropriate geometry.

**Replace the inner collider loop (lines 7664-7680) with:**
```javascript
for (const collider of (cg.colliders || [])) {
    const shape = collider.shape;
    const radius = shape?.radius || 0.05;
    let mesh;

    // Capsule collider: has a .tail property (VRM 1.0)
    if (shape?.tail && (shape.tail.x !== 0 || shape.tail.y !== 0 || shape.tail.z !== 0)) {
        // CapsuleGeometry(radius, length, capSegments, radialSegments)
        const tailVec = new THREE.Vector3().copy(shape.tail);
        const length = tailVec.length();
        const geo = new THREE.CapsuleGeometry(radius, length, 4, 8);
        const mat = new THREE.MeshBasicMaterial({
            color: 0xff8800, wireframe: true, transparent: true, opacity: 0.5,
        });
        mesh = new THREE.Mesh(geo, mat);

        // CapsuleGeometry is centered at origin along Y axis.
        // We need to orient it from offset (head) toward offset+tail (tail).
        // Position at midpoint between head and tail.
        const offset = shape.offset ? new THREE.Vector3().copy(shape.offset) : new THREE.Vector3();
        const midpoint = offset.clone().add(tailVec.clone().multiplyScalar(0.5));
        mesh.position.copy(midpoint);

        // Orient capsule along the tail vector
        const dir = tailVec.clone().normalize();
        const up = new THREE.Vector3(0, 1, 0);
        const quat = new THREE.Quaternion().setFromUnitVectors(up, dir);
        mesh.quaternion.copy(quat);
    } else {
        // Sphere collider (VRM 0.x and 1.0)
        const geo = new THREE.SphereGeometry(radius, 12, 8);
        const mat = new THREE.MeshBasicMaterial({
            color: 0x00ff88, wireframe: true, transparent: true, opacity: 0.5,
        });
        mesh = new THREE.Mesh(geo, mat);
        if (shape?.offset) {
            mesh.position.copy(shape.offset);
        }
    }

    // Parent to the collider's bone so it follows animation
    if (collider.bone) {
        collider.bone.add(mesh);
    } else {
        scene.add(mesh);
    }
    _colliderDebugMeshes.push({ mesh, parent: collider.bone || scene });
}
```

**Color coding:** Spheres = green (`0x00ff88`), Capsules = orange (`0xff8800`). Makes it immediately obvious which type is which.

---

### Phase 3: Per-Character Spring Bone Presets (4h)

Save tuned spring bone parameters per character and auto-apply on model load.

#### 3A. Backend Storage (1.5h)

**File:** `backend/server.py`

Add two endpoints:

```
GET  /api/characters/{char_id}/spring-bone-preset
POST /api/characters/{char_id}/spring-bone-preset
```

**Payload schema:**
```json
{
    "joints": [
        {
            "index": 0,
            "boneName": "J_Sec_Hair1_01",
            "stiffness": 0.4,
            "dragForce": 0.35,
            "gravityPower": 1.0
        }
    ],
    "wind": {
        "x": 0.5, "y": 0, "z": 0.3,
        "strength": 0.2
    }
}
```

**Storage:** Add a `spring_bone_presets` column (JSON text) to the `characters` table. This avoids a new table and keeps it simple. Add migration in `backend/preflight.py` (next schema version).

**File:** `backend/preflight.py`

Add migration:
```python
if current_version < NEW_VERSION:
    cursor.execute("ALTER TABLE characters ADD COLUMN spring_bone_presets TEXT DEFAULT NULL")
    cursor.execute(f"PRAGMA user_version = {NEW_VERSION}")
```

#### 3B. Frontend Auto-Apply (1h)

**File:** `frontends/shared/viewer/viewer.html`

After VRM model loads (in the VRM load success handler, around line 6550), add a postMessage request:
```javascript
window.parent.postMessage({ type: 'vrmSpringBonesReady', jointCount: vrm.springBoneManager?.joints?.length || 0 }, '*');
```

**File:** `frontends/sakura/src/stores/viewerStore.ts`

On receiving `vrmSpringBonesReady`, fetch the character's preset from the backend API and send it to the viewer via `setSpringBoneParams` messages (one per joint).

#### 3C. Save Preset from Current State (1.5h)

**File:** `frontends/shared/viewer/viewer.html`

Add a `getSpringBonePreset` handler that returns the full joint parameter dump in the preset format (reuse `getSpringBoneInfo` logic but shaped for persistence).

**File:** `frontends/sakura/src/stores/viewerStore.ts`

Add a `saveSpringBonePreset()` action that:
1. Requests current params from viewer via postMessage
2. POSTs to `/api/characters/{id}/spring-bone-preset`

---

### Phase 4: Spring Bone Tuning UI (6h)

Optional dev/power-user panel for real-time spring bone adjustment.

#### 4A. Tuning Panel Component (4h)

**File:** `frontends/sakura/src/components/SpringBoneTuner.tsx` (new)

A collapsible panel (similar to EffectsPanel.tsx pattern) accessible from Settings or the Dev Console. Features:

| Control | Type | Maps To |
|---------|------|---------|
| Bone chain selector | Dropdown grouped by prefix (Hair, Skirt, etc.) | Filters visible joints |
| Stiffness | Slider 0.0 - 4.0 | `joint.settings.stiffness` |
| Drag | Slider 0.0 - 1.0 | `joint.settings.dragForce` |
| Gravity Power | Slider 0.0 - 2.0 | `joint.settings.gravityPower` |
| Hit Radius | Slider 0.0 - 0.1 | `joint.settings.hitRadius` |
| Wind Strength | Slider 0.0 - 1.0 | `setWind` strength |
| Wind Direction | X/Y/Z sliders | `setWind` direction |
| Collider Debug | Toggle | `toggleColliderDebug` |
| Apply Preset | Button (dropdown: long hair, short hair, skirt, ribbon, ear) | Bulk-set recommended values from research |
| Save Preset | Button | POST to backend |
| Reset to Model Defaults | Button | Reload VRM spring bone params from file |

**Bone chain grouping logic:** Group joints by common prefixes. VRoid names follow `J_Sec_<Group>N_NN` pattern (e.g., `J_Sec_Hair1_01`, `J_Sec_Hair1_02`). Parse the group name and present as "Hair1", "Hair2", "Skirt", etc.

**Recommended presets (from research):**

| Preset | Stiffness | Drag | Gravity | Use Case |
|--------|-----------|------|---------|----------|
| Long Flowing Hair | 0.4 | 0.4 | 1.0 | Default for long hair |
| Short Bouncy Hair | 1.0 | 0.5 | 0.4 | Bobs, short styles |
| Skirt / Clothing | 0.3 | 0.5 | 1.2 | Long skirts, capes |
| Ribbon / Accessory | 0.2 | 0.25 | 0.6 | Thin dangling items |
| Animal Ears | 1.5 | 0.6 | 0.2 | Cat/fox/bunny ears |

#### 4B. Wire into Settings / Dev Console (2h)

**File:** `frontends/sakura/src/components/SettingsView.tsx`

Add a "Spring Bones" section under the 3D Viewer settings category. Render `<SpringBoneTuner />` when the current model is VRM and has spring bones.

**File:** `frontends/sakura/src/components/DevConsole.tsx`

Add a "Spring Bones" tab that shows the full tuner plus raw JSON view of all joint parameters (for debugging).

---

### Phase 5: Emotion-Reactive Spring Bone Modulation (3h)

**File:** `frontends/shared/viewer/viewer.html`

Add a `setSpringBoneEmotion` postMessage handler that adjusts spring bone parameters based on current emotion state. This creates subtle personality in the physics.

**Emotion modulation table:**

| Emotion | Stiffness Mult | Drag Mult | Gravity Mult | Effect |
|---------|---------------|-----------|-------------|--------|
| happy | 0.8 | 0.8 | 0.9 | Bouncier, lighter |
| excited | 0.6 | 0.6 | 0.7 | Very bouncy, floaty |
| sad | 1.3 | 1.2 | 1.3 | Heavy, droopy |
| angry | 1.5 | 0.7 | 1.0 | Stiff but reactive |
| calm | 1.1 | 1.1 | 1.0 | Slightly dampened |
| neutral | 1.0 | 1.0 | 1.0 | No modification |

**Implementation:** Store base (model-default) joint params on load. When emotion changes, multiply base values by the emotion modifiers and apply. Lerp over ~0.5s to avoid sudden physics jumps.

**File:** `frontends/sakura/src/stores/chatStore.ts`

After emotion is detected from LLM response, send `setSpringBoneEmotion` to the viewer iframe alongside the existing expression/animation triggers.

---

## Files Modified Summary

| File | Phases | Changes |
|------|--------|---------|
| `frontends/shared/viewer/viewer.html` | 1, 2, 3, 5 | Delta clamp, track stripping, capsule viz, presets, emotion modulation |
| `backend/server.py` | 3 | Two REST endpoints for spring bone presets |
| `backend/preflight.py` | 3 | Schema migration (add column) |
| `frontends/sakura/src/stores/viewerStore.ts` | 3, 4 | Preset fetch/save, tuner actions |
| `frontends/sakura/src/stores/chatStore.ts` | 5 | Emotion-to-spring-bone dispatch |
| `frontends/sakura/src/components/SpringBoneTuner.tsx` | 4 | New component |
| `frontends/sakura/src/components/SettingsView.tsx` | 4 | Wire tuner into settings |
| `frontends/sakura/src/components/DevConsole.tsx` | 4 | Wire tuner into dev console |

---

## Effort Estimates

| Phase | Description | Hours | Cumulative |
|-------|-------------|-------|------------|
| 1A | Delta time clamping | 0.25 | 0.25 |
| 1B | Strip spring bone tracks from Mixamo clips | 1.25 | 1.5 |
| 2 | Capsule collider debug visualization | 2.0 | 3.5 |
| 3 | Per-character spring bone presets (backend + frontend) | 4.0 | 7.5 |
| 4 | Spring bone tuning UI panel | 6.0 | 13.5 |
| 5 | Emotion-reactive spring bone modulation | 3.0 | 16.5 |
| **Total** | | **16.5h** | |

**AI-assisted estimate (12x factor):** ~1.5h wall clock for Phases 1-2, ~4h total for all 5 phases.

---

## Execution Order Recommendation

Phases 1-2 are standalone fixes with immediate visual payoff. Ship them first.

Phase 3 is infrastructure for Phase 4 (the tuner needs save/load). Do them together.

Phase 5 is independent and can be done any time after Phase 1.

**Minimum viable improvement:** Phases 1A + 1B only (1.5h). This fixes frozen hair and physics explosions -- the two biggest complaints from the animation quality crisis.

---

## Testing

| Phase | Test |
|-------|------|
| 1A | Switch browser tab for 5+ seconds, return. Hair should settle smoothly, not explode. |
| 1B | Load a Mixamo idle animation with `retarget: true`. Hair should sway with head movement, not be rigid. Compare before/after by toggling the stripping. |
| 2 | Load a VRM 1.0 model, toggle collider debug. Capsules should appear as orange wireframes on limbs/torso. Spheres remain green on head. |
| 3 | Tune spring bone params, save preset, reload page. Params should auto-apply on model load. |
| 4 | Open tuner, drag stiffness slider. Hair should visibly change behavior in real-time. |
| 5 | Send a "sad" message. Over ~0.5s, hair should become heavier/droopier. Send "happy" -- hair should become bouncier. |
