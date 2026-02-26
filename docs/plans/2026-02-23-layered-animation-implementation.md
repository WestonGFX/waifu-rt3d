# Layered Procedural Animation System — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the flat animation controller architecture in viewer.html with a 6-layer personality-driven pipeline that makes VRM characters feel alive.

**Architecture:** 6 ordered layers (BasePose → IdleBehavior → EmotionModifier → TalkBehavior → GestureOverride → LookAt) processed per frame. Each layer writes to specific bones using set (`=`) or additive (`+=`) mode. A per-character personality profile (5 floats: energy, confidence, nervousness, expressiveness, playfulness) scales all layers' behavior. The AnimationDirector orchestrates layers and handles suppression rules (Talk suppresses Idle, Gesture suppresses both on affected bones).

**Tech Stack:** Three.js VRM humanoid bones, JavaScript classes in viewer.html (iframe), FastAPI + SQLite backend, vanilla JS frontend.

**Design Doc:** `docs/plans/2026-02-23-layered-animation-design.md`

---

## Task 1: Backend — Schema Migration v16 (animation_profile column)

**Files:**
- Modify: `backend/preflight.py` (after line 848, and in `ensure_db()` after v15 block ~line 960)
- Modify: `backend/tests/conftest.py` (line 109, add column to CREATE TABLE)

**Step 1: Write the migration function**

Add after `migrate_to_v15()` (line 848) in `backend/preflight.py`:

```python
def migrate_to_v16(con: sqlite3.Connection) -> bool:
    """Apply schema v16 migration (Phase 6F: Layered Animation Personality).

    Adds:
        - ``animation_profile`` (TEXT) — JSON blob storing per-character animation
          personality parameters: energy, confidence, nervousness, expressiveness,
          playfulness (each 0–1). NULL = use defaults (backward-compatible).

    Args:
        con: Active SQLite connection.

    Returns:
        bool: True if migration was applied, False if already at v16.

    Example:
        >>> if migrate_to_v16(con):
        ...     print("Added animation_profile column")
    """
    cur = con.cursor()
    columns = {
        row[1] for row in cur.execute("PRAGMA table_info(characters)").fetchall()
    }
    if 'animation_profile' in columns:
        logger.info("Schema v16 logic: animation_profile column exists. Ensuring version is 16.")
        cur.execute("INSERT OR REPLACE INTO schema_version (version) VALUES (16)")
        con.commit()
        return False

    try:
        logger.info("Applying schema v16 migration (Phase 6F: animation personality profiles)...")
        cur.execute("ALTER TABLE characters ADD COLUMN animation_profile TEXT")
        cur.execute("INSERT OR REPLACE INTO schema_version (version) VALUES (16)")
        con.commit()
        logger.info("✅ Schema v16 migration complete (animation_profile column added)")
        return True
    except sqlite3.Error as e:
        logger.error(f"Schema v16 migration failed: {e}")
        con.rollback()
        raise
```

**Step 2: Wire migration into ensure_db()**

Add after the v15 block in `ensure_db()`:

```python
        # Upgrade from v15 to v16 (Phase 6F: animation personality profiles)
        if version < 16:
            logger.info("Upgrading database schema from v15 to v16...")
            logger.info("  - Adding animation_profile to characters (layered animation personality)")
            if migrate_to_v16(con):
                version = 16
```

**Step 3: Update module docstring**

Change line 7 of `backend/preflight.py` from:
```
- Database schema migrations (v3 → v4 → … → v14)
```
to:
```
- Database schema migrations (v3 → v4 → … → v16)
```

And add after line 21:
```
    - v15 → v16: Animation personality profiles (Phase 6F)
```

**Step 4: Update test schema in conftest.py**

In `backend/tests/conftest.py`, add `animation_profile TEXT` after `capability_profile TEXT` (line 109) in the `_create_schema` function's CREATE TABLE characters statement.

**Step 5: Run tests**

Run: `cd /Users/chris/Code/waifu-rt3d && python -m pytest backend/tests/ -x -v --tb=short`
Expected: All tests pass (no regressions).

**Step 6: Commit**

```bash
git add backend/preflight.py backend/tests/conftest.py
git commit -m "feat: add schema v16 migration for animation_profile column"
```

---

## Task 2: Backend — Include animation_profile in Character CRUD

**Files:**
- Modify: `backend/server.py` — GET /api/characters (~line 3543), GET /api/characters/:id, PUT /api/characters/:id (~line 3693), POST /api/characters (~line 3195)

**Step 1: Add animation_profile to GET /api/characters**

In the SELECT query for `GET /api/characters`, add `animation_profile` to the column list. In the response dict builder, add:
```python
"animation_profile": json.loads(row[N]) if row[N] else None,
```
where N is the new column index.

**Step 2: Add animation_profile to PUT /api/characters/:id**

In the PUT handler's `_json_fields` set (or equivalent), add `"animation_profile"` so it gets JSON-encoded before writing. Add `animation_profile` to the UPDATE SET clause.

**Step 3: Add animation_profile to POST /api/characters**

In the POST handler's `fields` dict, add:
```python
"animation_profile": json.dumps(body.get("animation_profile")) if body.get("animation_profile") else None,
```

**Step 4: Run tests**

Run: `cd /Users/chris/Code/waifu-rt3d && python -m pytest backend/tests/ -x -v --tb=short`
Expected: All tests pass.

**Step 5: Commit**

```bash
git add backend/server.py
git commit -m "feat: include animation_profile in character CRUD endpoints"
```

---

## Task 3: AnimationLayer Base Class + AnimationDirector

**Files:**
- Modify: `frontends/neon/viewer/viewer.html` — Insert new classes before `ProceduralAnimator` (line 310)

**Step 1: Write AnimationLayer base class**

Insert before line 310 (`class ProceduralAnimator`):

```javascript
        // ══════════════════════════════════════════════════════════
        // Layered Animation System — Phase 6F
        // ══════════════════════════════════════════════════════════

        /**
         * Default animation personality profile.
         * All values 0–1. Used when character has no custom profile.
         */
        const DEFAULT_PERSONALITY = {
            energy: 0.5, confidence: 0.5, nervousness: 0.3,
            expressiveness: 0.5, playfulness: 0.5,
        };

        /**
         * Base class for all animation layers.
         * Each layer writes to specific bones using set (=) or additive (+=) mode.
         * @abstract
         */
        class AnimationLayer {
            /**
             * @param {Object} vrm - The loaded VRM model instance
             * @param {string} name - Layer name for debugging
             */
            constructor(vrm, name) {
                this.vrm = vrm;
                this.name = name;
                this.personality = { ...DEFAULT_PERSONALITY };
                this.enabled = true;
                this.weight = 1.0;
                this.time = 0;
            }

            /**
             * Resolve a VRM humanoid bone by name.
             * @param {string} boneName - Humanoid bone name (e.g. 'spine', 'hips')
             * @returns {Object|null} The bone node or null
             */
            getBone(boneName) {
                return this.vrm.humanoid.getNormalizedBoneNode?.(boneName)
                    || this.vrm.humanoid.getBoneNode?.(boneName)
                    || null;
            }

            /**
             * Update personality parameters from profile object.
             * @param {Object} profile - {energy, confidence, nervousness, expressiveness, playfulness}
             */
            setPersonality(profile) {
                this.personality = { ...DEFAULT_PERSONALITY, ...profile };
            }

            /**
             * Per-frame update. Subclasses override this.
             * @param {number} dt - Delta time in seconds
             */
            update(dt) { this.time += dt; }
        }
```

**Step 2: Write AnimationDirector class**

Insert directly after `AnimationLayer`:

```javascript
        /**
         * Orchestrates all 6 animation layers per frame.
         * Manages suppression rules:
         *   - L3 (Talk) suppresses L1 (Idle) when active
         *   - L4 (Gesture) suppresses L1 and L3 on affected bones during playback
         *   - L5 (LookAt) is always additive
         */
        class AnimationDirector {
            /**
             * @param {Object} vrm - The loaded VRM model
             */
            constructor(vrm) {
                this.vrm = vrm;
                /** @type {AnimationLayer[]} Layers processed in order each frame */
                this.layers = [];
                this.personality = { ...DEFAULT_PERSONALITY };
            }

            /**
             * Register a layer. Layers are processed in array order (index = priority).
             * @param {AnimationLayer} layer
             */
            addLayer(layer) {
                layer.setPersonality(this.personality);
                this.layers.push(layer);
            }

            /**
             * Retrieve a layer by name.
             * @param {string} name - Layer name
             * @returns {AnimationLayer|undefined}
             */
            getLayer(name) {
                return this.layers.find(l => l.name === name);
            }

            /**
             * Apply a personality profile to all layers.
             * @param {Object|null} profile - Personality JSON or null for defaults
             */
            setPersonality(profile) {
                this.personality = { ...DEFAULT_PERSONALITY, ...(profile || {}) };
                for (const layer of this.layers) {
                    layer.setPersonality(this.personality);
                }
            }

            /**
             * Per-frame update — runs all layers in order with suppression logic.
             * @param {number} dt - Delta time in seconds
             */
            update(dt) {
                const gesture = this.getLayer('gesture');
                const talk = this.getLayer('talk');
                const idle = this.getLayer('idle');

                // Suppression: Talk active → suppress Idle
                if (idle) {
                    idle.enabled = !(talk && talk.active);
                }

                // Suppression: Gesture playing → suppress Idle and Talk
                if (gesture && gesture.isPlaying) {
                    if (idle) idle.enabled = false;
                    if (talk) talk.enabled = false;
                }

                for (const layer of this.layers) {
                    if (layer.enabled) layer.update(dt);
                }

                // Re-enable for next frame evaluation
                if (idle) idle.enabled = true;
                if (talk) talk.enabled = true;
            }
        }
```

**Step 3: Verify no syntax errors**

Open the app and check browser console for JS syntax errors. The new classes aren't wired in yet — just sitting in the file.

**Step 4: Commit**

```bash
git add frontends/neon/viewer/viewer.html
git commit -m "feat: add AnimationLayer base class and AnimationDirector orchestrator"
```

---

## Task 4: BasePoseLayer (L0) — Breathing + Weight Distribution

**Files:**
- Modify: `frontends/neon/viewer/viewer.html` — Insert after AnimationDirector class

This layer replaces the inline breathing code at lines 1314–1328 of the render loop.

**Step 1: Write BasePoseLayer class**

```javascript
        /**
         * L0: Base pose — breathing rhythm and weight distribution.
         * Write mode: SET (=) on chest/spine.
         * Personality influence:
         *   energy → breath speed/depth
         *   confidence → chest-out posture, wider stance
         *   nervousness → faster breathing
         */
        class BasePoseLayer extends AnimationLayer {
            constructor(vrm) {
                super(vrm, 'basePose');
            }

            update(dt) {
                super.update(dt);
                const t = this.time;
                const p = this.personality;

                // Breath rate: base 2Hz, faster with energy/nervousness
                const rateScale = 1 + (p.energy - 0.5) * 0.6 + p.nervousness * 0.4;
                const rateModulator = 2 * rateScale + Math.sin(t * 0.13) * 0.3;
                const noiseLayer = Math.sin(t * 0.7) * 0.0008;

                // Deep breath cycle (~every 20s), bigger with energy
                const deepCycle = Math.sin(t * 0.16);
                const deepAmp = 0.003 + p.energy * 0.006;
                const shallowAmp = 0.002 + p.energy * 0.002;
                const breathAmp = deepCycle > 0.95 ? deepAmp : shallowAmp;
                const breathStrength = Math.sin(t * rateModulator) * breathAmp + noiseLayer;

                const chest = this.getBone('chest') || this.getBone('spine');
                if (chest) {
                    chest.rotation.x = breathStrength;
                    chest.rotation.z = breathStrength * 0.5;
                }

                // Confidence: subtle chest-out posture (spine extension)
                const spine = this.getBone('spine');
                if (spine && p.confidence > 0.5) {
                    spine.rotation.x -= (p.confidence - 0.5) * 0.03;
                }
            }
        }
```

**Step 2: Verify no syntax errors in browser console**

**Step 3: Commit**

```bash
git add frontends/neon/viewer/viewer.html
git commit -m "feat: add BasePoseLayer (L0) — breathing and posture"
```

---

## Task 5: IdleBehaviorLayer (L1) — 22-Fidget Library

**Files:**
- Modify: `frontends/neon/viewer/viewer.html` — Insert after BasePoseLayer

**Step 1: Write the fidget definitions and IdleBehaviorLayer**

```javascript
        /**
         * L1: Idle behavior — personality-driven fidget library.
         * Write mode: SET (=) on affected bones.
         * Suppressed when Talk (L3) or Gesture (L4) is active.
         *
         * A random timer (3–8s, scaled by energy) selects from eligible fidgets
         * based on personality thresholds. Each fidget is a micro-animation
         * lasting 1–3 seconds that modifies specific bones.
         */
        class IdleBehaviorLayer extends AnimationLayer {
            constructor(vrm) {
                super(vrm, 'idle');
                this._fidgetTimer = 3 + Math.random() * 5;
                this._activeFidget = null;
                this._fidgetTime = 0;
                this._fidgetDuration = 0;
            }

            /** @type {Array<{name:string, duration:number, requires?:(p:Object)=>boolean, apply:(t:number,p:Object,getBone:(s:string)=>any)=>void}>} */
            static get FIDGETS() {
                return [
                    {
                        name: 'weight_shift', duration: 2,
                        apply(t, p, B) {
                            const hips = B('hips');
                            if (hips) hips.rotation.y = Math.sin(t * Math.PI) * 0.04;
                        }
                    },
                    {
                        name: 'shoulder_roll', duration: 1.5,
                        apply(t, p, B) {
                            const ls = B('leftShoulder'), rs = B('rightShoulder');
                            const v = Math.sin(t * Math.PI * 2) * 0.05;
                            if (ls) ls.rotation.z = v;
                            if (rs) rs.rotation.z = -v * 0.7; // slight asymmetry
                        }
                    },
                    {
                        name: 'head_tilt', duration: 1,
                        apply(t, p, B) {
                            const head = B('head');
                            if (head) head.rotation.z = Math.sin(t * Math.PI) * 0.08;
                        }
                    },
                    {
                        name: 'look_around', duration: 2,
                        apply(t, p, B) {
                            const head = B('head');
                            if (head) {
                                head.rotation.y = Math.sin(t * Math.PI) * 0.15;
                                head.rotation.x = Math.sin(t * Math.PI * 0.7) * 0.05;
                            }
                        }
                    },
                    {
                        name: 'deep_breath', duration: 3,
                        apply(t, p, B) {
                            const chest = B('chest') || B('spine');
                            if (chest) {
                                const inhale = Math.sin(t * Math.PI * 0.667) * 0.015;
                                chest.rotation.x = inhale;
                            }
                        }
                    },
                    {
                        name: 'arm_adjust', duration: 1.5,
                        apply(t, p, B) {
                            const arm = B('leftUpperArm');
                            if (arm) arm.rotation.z = -0.7 + Math.sin(t * Math.PI) * 0.1;
                        }
                    },
                    {
                        name: 'subtle_sway', duration: 3,
                        apply(t, p, B) {
                            const hips = B('hips'), spine = B('spine');
                            const s = Math.sin(t * Math.PI * 0.667) * 0.02;
                            if (hips) hips.rotation.z = s;
                            if (spine) spine.rotation.z = s * -0.5;
                        }
                    },
                    {
                        name: 'ankle_cross', duration: 3,
                        apply(t, p, B) {
                            const lLeg = B('leftUpperLeg');
                            if (lLeg) lLeg.rotation.z = Math.sin(t * Math.PI * 0.5) * 0.04;
                        }
                    },
                    {
                        name: 'hand_to_chest', duration: 1.5,
                        apply(t, p, B) {
                            const arm = B('rightUpperArm');
                            if (arm) {
                                const blend = Math.sin(t * Math.PI);
                                arm.rotation.z = 0.7 * (1 - blend * 0.5);
                                arm.rotation.x = blend * 0.3;
                            }
                        }
                    },
                    {
                        name: 'hand_clasp', duration: 2,
                        requires: (p) => p.confidence > 0.4,
                        apply(t, p, B) {
                            const la = B('leftUpperArm'), ra = B('rightUpperArm');
                            const blend = Math.sin(t * Math.PI * 0.5);
                            if (la) { la.rotation.z = -0.7 + blend * 0.3; la.rotation.x = blend * 0.2; }
                            if (ra) { ra.rotation.z = 0.7 - blend * 0.3; ra.rotation.x = blend * 0.2; }
                        }
                    },
                    {
                        name: 'hip_cock', duration: 2,
                        requires: (p) => p.confidence > 0.6,
                        apply(t, p, B) {
                            const hips = B('hips'), spine = B('spine');
                            const blend = Math.sin(t * Math.PI * 0.5);
                            if (hips) { hips.rotation.z = blend * 0.06; hips.rotation.y = blend * 0.03; }
                            if (spine) spine.rotation.z = blend * -0.03;
                        }
                    },
                    {
                        name: 'hand_on_hip', duration: 3,
                        requires: (p) => p.confidence > 0.5,
                        apply(t, p, B) {
                            const arm = B('rightUpperArm');
                            if (arm) {
                                const blend = Math.sin(t * Math.PI / 3);
                                arm.rotation.z = 0.7 - blend * 0.5;
                                arm.rotation.y = blend * 0.3;
                            }
                        }
                    },
                    {
                        name: 'touch_face', duration: 1.5,
                        requires: (p) => p.nervousness > 0.3,
                        apply(t, p, B) {
                            const arm = B('leftUpperArm');
                            if (arm) {
                                const blend = Math.sin(t * Math.PI);
                                arm.rotation.z = -0.7 + blend * 0.6;
                                arm.rotation.x = blend * 0.4;
                            }
                        }
                    },
                    {
                        name: 'touch_hair', duration: 2,
                        requires: (p) => p.nervousness > 0.3,
                        apply(t, p, B) {
                            const arm = B('rightUpperArm');
                            if (arm) {
                                const blend = Math.sin(t * Math.PI * 0.5);
                                arm.rotation.z = 0.7 - blend * 0.8;
                                arm.rotation.x = -blend * 0.3;
                            }
                        }
                    },
                    {
                        name: 'fidget_hands', duration: 1.5,
                        requires: (p) => p.nervousness > 0.4,
                        apply(t, p, B) {
                            const la = B('leftUpperArm'), ra = B('rightUpperArm');
                            const v = Math.sin(t * Math.PI * 4) * 0.03;
                            if (la) la.rotation.x = v;
                            if (ra) ra.rotation.x = -v;
                        }
                    },
                    {
                        name: 'hand_behind_back', duration: 2.5,
                        requires: (p) => p.nervousness > 0.3 || p.playfulness > 0.4,
                        apply(t, p, B) {
                            const la = B('leftUpperArm'), ra = B('rightUpperArm');
                            const blend = Math.sin(t * Math.PI * 0.4);
                            if (la) { la.rotation.z = -0.7 - blend * 0.3; la.rotation.y = -blend * 0.4; }
                            if (ra) { ra.rotation.z = 0.7 + blend * 0.3; ra.rotation.y = blend * 0.4; }
                        }
                    },
                    {
                        name: 'hair_twirl', duration: 2,
                        requires: (p) => p.playfulness > 0.5,
                        apply(t, p, B) {
                            const arm = B('rightUpperArm');
                            if (arm) {
                                const blend = Math.sin(t * Math.PI * 0.5);
                                arm.rotation.z = 0.7 - blend * 0.8;
                                arm.rotation.y = Math.sin(t * Math.PI * 2) * 0.1;
                            }
                        }
                    },
                    {
                        name: 'peace_sign', duration: 1,
                        requires: (p) => p.playfulness > 0.6,
                        apply(t, p, B) {
                            const arm = B('rightUpperArm');
                            if (arm) {
                                const blend = Math.sin(t * Math.PI);
                                arm.rotation.z = 0.7 - blend * 0.9;
                                arm.rotation.x = -blend * 0.2;
                            }
                        }
                    },
                    {
                        name: 'curtsy_bob', duration: 2,
                        requires: (p) => p.playfulness > 0.5,
                        apply(t, p, B) {
                            const hips = B('hips'), spine = B('spine');
                            const dip = Math.sin(t * Math.PI * 0.5);
                            if (hips) hips.position.y = -dip * 0.02;
                            if (spine) spine.rotation.x = dip * 0.04;
                        }
                    },
                    {
                        name: 'bounce', duration: 1,
                        requires: (p) => p.energy > 0.6,
                        apply(t, p, B) {
                            const hips = B('hips');
                            if (hips) hips.position.y = Math.abs(Math.sin(t * Math.PI * 2)) * 0.015;
                        }
                    },
                    {
                        name: 'stretch', duration: 3,
                        requires: (p) => p.energy > 0.5,
                        apply(t, p, B) {
                            const la = B('leftUpperArm'), ra = B('rightUpperArm');
                            const spine = B('spine');
                            const blend = Math.sin(t * Math.PI / 3);
                            if (la) la.rotation.z = -0.7 - blend * 0.5;
                            if (ra) ra.rotation.z = 0.7 + blend * 0.5;
                            if (spine) spine.rotation.x = -blend * 0.04;
                        }
                    },
                    {
                        name: 'foot_tap', duration: 2,
                        requires: (p) => p.energy > 0.4,
                        apply(t, p, B) {
                            const leg = B('rightUpperLeg');
                            if (leg) leg.rotation.x = Math.abs(Math.sin(t * Math.PI * 3)) * 0.03;
                        }
                    },
                ];
            }

            /**
             * Per-frame update — manage fidget timer and apply active fidget.
             * @param {number} dt - Delta time in seconds
             */
            update(dt) {
                super.update(dt);
                const p = this.personality;

                // If a fidget is playing, advance it
                if (this._activeFidget) {
                    this._fidgetTime += dt;
                    const progress = this._fidgetTime / this._fidgetDuration;
                    if (progress >= 1) {
                        this._activeFidget = null;
                        this._fidgetTime = 0;
                        // Next fidget timer: 3–8s, faster with energy
                        const baseWait = 3 + Math.random() * 5;
                        this._fidgetTimer = baseWait * (1.3 - p.energy * 0.6);
                    } else {
                        // Smooth envelope: ramp-in 15%, sustain, ramp-out 15%
                        let envelope = 1;
                        if (progress < 0.15) envelope = progress / 0.15;
                        else if (progress > 0.85) envelope = (1 - progress) / 0.15;

                        this._activeFidget.apply(
                            this._fidgetTime * envelope,
                            p,
                            (name) => this.getBone(name)
                        );
                    }
                    return;
                }

                // Count down to next fidget
                this._fidgetTimer -= dt;
                if (this._fidgetTimer <= 0) {
                    // Pick a random eligible fidget
                    const eligible = IdleBehaviorLayer.FIDGETS.filter(
                        f => !f.requires || f.requires(p)
                    );
                    if (eligible.length > 0) {
                        const pick = eligible[Math.floor(Math.random() * eligible.length)];
                        this._activeFidget = pick;
                        this._fidgetTime = 0;
                        // Scale duration slightly by expressiveness
                        this._fidgetDuration = pick.duration * (0.8 + p.expressiveness * 0.4);
                    }
                    // Reset timer even if nothing was picked
                    const baseWait = 3 + Math.random() * 5;
                    this._fidgetTimer = baseWait * (1.3 - p.energy * 0.6);
                }
            }
        }
```

**Step 2: Verify no syntax errors**

**Step 3: Commit**

```bash
git add frontends/neon/viewer/viewer.html
git commit -m "feat: add IdleBehaviorLayer (L1) — 22 personality-driven fidgets"
```

---

## Task 6: EmotionLayer (L2) — Replaces ProceduralAnimator

**Files:**
- Modify: `frontends/neon/viewer/viewer.html` — Insert after IdleBehaviorLayer

**Step 1: Write EmotionLayer**

```javascript
        /**
         * L2: Emotion modifier — posture bias from current emotion.
         * Write mode: ADDITIVE (+=) on spine, hips, shoulders.
         * Replaces the old ProceduralAnimator class.
         *
         * Personality influence:
         *   energy → emotion intensity multiplier
         *   expressiveness → bigger posture shifts
         *   nervousness → amplifies negative emotions
         *   playfulness → happy amplified, angry becomes pouty
         */
        class EmotionLayer extends AnimationLayer {
            constructor(vrm) {
                super(vrm, 'emotion');
                this.currentEmotion = 'neutral';
                this.intensity = 0.7;
            }

            /**
             * Set the current emotion and intensity.
             * @param {string} emotion - Emotion name
             * @param {number} [intensity=0.7] - Base intensity (0–1)
             */
            setEmotion(emotion, intensity = 0.7) {
                this.currentEmotion = emotion || 'neutral';
                this.intensity = Math.max(0, Math.min(1, intensity));
            }

            update(dt) {
                super.update(dt);
                const t = this.time;
                const p = this.personality;
                const hips = this.getBone('hips');
                const spine = this.getBone('spine');
                const expressScale = 0.5 + p.expressiveness * 1.0;
                const intensity = this.intensity * expressScale;

                // Hip sway — slow weight shift, always active
                if (hips) {
                    const swayNoise = 1 + Math.sin(t * 0.09) * 0.2;
                    hips.rotation.y += Math.sin(t * 0.3) * 0.02 * swayNoise * intensity;
                }

                const emo = this.currentEmotion;
                // Playfulness transforms: angry → pouty (less intense)
                const effectiveEmo = (p.playfulness > 0.6 && emo === 'angry') ? 'pouty' : emo;

                switch (effectiveEmo) {
                    case 'happy':
                    case 'excited': {
                        const scale = emo === 'excited' ? 1.3 : 1.0;
                        const happyBoost = 1 + p.playfulness * 0.5;
                        if (hips) hips.position.y += Math.sin(t * 3) * 0.008 * intensity * scale * happyBoost;
                        if (spine) spine.rotation.z += Math.sin(t * 1.5) * 0.02 * intensity * happyBoost;
                        break;
                    }
                    case 'sad': {
                        const nervBoost = 1 + p.nervousness * 0.5;
                        if (spine) {
                            spine.rotation.x += 0.03 * intensity * nervBoost;
                            spine.rotation.z += Math.sin(t * 0.5) * 0.005 * intensity;
                        }
                        break;
                    }
                    case 'angry': {
                        const nervBoost = 1 + p.nervousness * 0.4;
                        if (spine) spine.rotation.z += Math.sin(t * 8) * 0.003 * intensity * nervBoost;
                        break;
                    }
                    case 'pouty': {
                        // Playful version of angry — puffed cheeks, slight sway
                        if (spine) spine.rotation.z += Math.sin(t * 1.2) * 0.015 * intensity;
                        if (hips) hips.rotation.y += Math.sin(t * 0.8) * 0.015 * intensity;
                        break;
                    }
                    case 'embarrassed':
                    case 'shy': {
                        if (spine) spine.rotation.x += 0.04 * intensity;
                        const ls = this.getBone('leftShoulder'), rs = this.getBone('rightShoulder');
                        if (ls) ls.rotation.z += 0.03 * intensity;
                        if (rs) rs.rotation.z -= 0.03 * intensity;
                        break;
                    }
                    // neutral: no additive modifier
                }
            }
        }
```

**Step 2: Commit**

```bash
git add frontends/neon/viewer/viewer.html
git commit -m "feat: add EmotionLayer (L2) — additive posture from emotion"
```

---

## Task 7: TalkLayer (L3) — Conversational Body Language

**Files:**
- Modify: `frontends/neon/viewer/viewer.html` — Insert after EmotionLayer

**Step 1: Write TalkLayer**

```javascript
        /**
         * L3: Talk behavior — conversational body language when isTalking is true.
         * Write mode: SET (=) on hands, head, spine.
         * Suppresses L1 (Idle) when active.
         *
         * Personality influence:
         *   confidence → wider gestures, expansive hands
         *   nervousness → hands close to body, smaller gestures
         *   playfulness → more head tilts, exaggerated nods
         *   expressiveness → scales all talk gestures
         */
        class TalkLayer extends AnimationLayer {
            constructor(vrm) {
                super(vrm, 'talk');
                /** @type {boolean} Whether this layer is actively animating */
                this.active = false;
                this._nodTimer = 0;
                this._nodCooldown = 1.5 + Math.random() * 2;
                this._shiftTimer = 0;
            }

            /**
             * Set active state based on global isTalking flag.
             * @param {boolean} talking
             */
            setTalking(talking) {
                this.active = !!talking;
                if (!talking) {
                    this._nodTimer = 0;
                    this._shiftTimer = 0;
                }
            }

            update(dt) {
                if (!this.active) return;
                super.update(dt);
                const t = this.time;
                const p = this.personality;
                const expressScale = 0.5 + p.expressiveness;

                // Gesture spread: confidence = wide, nervousness = close
                const spread = 0.5 + p.confidence * 0.5 - p.nervousness * 0.3;

                // Illustrative hand movements (sine-based, loose sync)
                const lArm = this.getBone('leftUpperArm');
                const rArm = this.getBone('rightUpperArm');
                const handAmp = 0.08 * spread * expressScale;
                if (lArm) {
                    lArm.rotation.z = -0.7 + Math.sin(t * 1.8) * handAmp;
                    lArm.rotation.x = Math.sin(t * 1.3) * handAmp * 0.5;
                }
                if (rArm) {
                    rArm.rotation.z = 0.7 - Math.sin(t * 2.1 + 1) * handAmp;
                    rArm.rotation.x = Math.sin(t * 1.5 + 0.5) * handAmp * 0.5;
                }

                // Periodic head nods (emphasis)
                this._nodTimer += dt;
                const head = this.getBone('head');
                if (this._nodTimer >= this._nodCooldown && head) {
                    // Quick nod: 0.3s down-up
                    const nodProgress = (this._nodTimer - this._nodCooldown) / 0.3;
                    if (nodProgress < 1) {
                        head.rotation.x = Math.sin(nodProgress * Math.PI) * 0.08;
                    } else {
                        this._nodTimer = 0;
                        const playBoost = 1 + p.playfulness * 0.5;
                        this._nodCooldown = (1.2 + Math.random() * 1.5) / playBoost;
                    }
                }

                // Playful head tilts
                if (head && p.playfulness > 0.4) {
                    head.rotation.z = Math.sin(t * 0.7) * 0.04 * p.playfulness;
                }

                // Forward lean (engagement)
                const spine = this.getBone('spine');
                if (spine) {
                    spine.rotation.x = -0.015 * expressScale;
                }

                // Periodic weight shift during long speech
                this._shiftTimer += dt;
                if (this._shiftTimer > 4) {
                    const hips = this.getBone('hips');
                    const shiftProgress = (this._shiftTimer - 4) / 2;
                    if (shiftProgress < 1 && hips) {
                        hips.rotation.y = Math.sin(shiftProgress * Math.PI) * 0.03;
                    } else {
                        this._shiftTimer = 0;
                    }
                }
            }
        }
```

**Step 2: Commit**

```bash
git add frontends/neon/viewer/viewer.html
git commit -m "feat: add TalkLayer (L3) — conversational body language"
```

---

## Task 8: GestureLayer (L4) — Replaces GestureController with Smooth Blending

**Files:**
- Modify: `frontends/neon/viewer/viewer.html` — Insert after TalkLayer

The existing `GestureController` (line 808) has 14 gestures. We preserve all of them but wrap in the layer system with improved blend curves.

**Step 1: Write GestureLayer**

```javascript
        /**
         * L4: Gesture override — triggered animations (wave, dance, etc.).
         * Write mode: SET (=) on affected bones during playback.
         * Suppresses L1 and L3 on affected bones when playing.
         *
         * Improvements over old GestureController:
         *   1. Smooth 3-phase blend: 15% ease-in, 70% hold, 15% ease-out
         *   2. Personality scaling: all amplitudes × expressiveness
         *   3. Integrates with AnimationDirector suppression rules
         */
        class GestureLayer extends AnimationLayer {
            constructor(vrm) {
                super(vrm, 'gesture');
                /** @type {boolean} Whether a gesture is currently playing */
                this.isPlaying = false;
                this.currentGesture = null;
                this._gestureTime = 0;
                this._gestureDuration = 0;
                this._gestureSequence = [];
                this._sequenceIndex = 0;
            }

            /**
             * Compute smooth 3-phase blend envelope.
             * 0–15%: ease-in, 15–85%: full, 85–100%: ease-out
             * @param {number} progress - 0 to 1
             * @returns {number} Envelope value 0 to 1
             */
            _envelope(progress) {
                if (progress < 0.15) return progress / 0.15;
                if (progress > 0.85) return (1 - progress) / 0.15;
                return 1;
            }

            /**
             * Play a named gesture.
             * @param {string} gestureName - One of the 14 gesture names
             */
            playGesture(gestureName) {
                const gestureDef = GestureLayer.GESTURES[gestureName];
                if (!gestureDef) return;
                this.currentGesture = gestureName;
                this.isPlaying = true;
                this._gestureTime = 0;
                this._gestureDuration = gestureDef.duration;
            }

            /**
             * Play a sequence of gestures.
             * @param {Array<{gesture:string, delay?:number}>} sequence
             */
            playSequence(sequence) {
                if (!Array.isArray(sequence) || sequence.length === 0) return;
                this._gestureSequence = sequence;
                this._sequenceIndex = 0;
                this.playGesture(sequence[0].gesture || sequence[0]);
            }

            /**
             * Reset all arm/hand bones to neutral after gesture ends.
             */
            _resetBones() {
                const bones = ['leftUpperArm', 'rightUpperArm', 'leftLowerArm', 'rightLowerArm',
                               'leftHand', 'rightHand', 'head', 'neck', 'spine', 'chest', 'hips'];
                // Only zero out rotation, not position — positions are managed by other layers
                // Actually, let the A-pose logic in the render loop handle arm reset.
                // We just clear our isPlaying flag so other layers resume.
            }

            update(dt) {
                if (!this.isPlaying || !this.currentGesture) return;
                super.update(dt);

                this._gestureTime += dt;
                const progress = this._gestureTime / this._gestureDuration;

                if (progress >= 1) {
                    // Gesture complete
                    this.isPlaying = false;
                    this.currentGesture = null;
                    this._gestureTime = 0;

                    // Advance sequence if available
                    if (this._gestureSequence.length > 0) {
                        this._sequenceIndex++;
                        if (this._sequenceIndex < this._gestureSequence.length) {
                            const next = this._gestureSequence[this._sequenceIndex];
                            const delay = next.delay || 0.3;
                            setTimeout(() => {
                                this.playGesture(next.gesture || next);
                            }, delay * 1000);
                        } else {
                            this._gestureSequence = [];
                            this._sequenceIndex = 0;
                        }
                    }
                    return;
                }

                const envelope = this._envelope(progress);
                const expressScale = 0.5 + this.personality.expressiveness;
                const amp = envelope * expressScale;
                const t = this._gestureTime;
                const gestureDef = GestureLayer.GESTURES[this.currentGesture];
                if (gestureDef) {
                    gestureDef.apply(t, amp, (name) => this.getBone(name));
                }
            }

            /**
             * Static gesture library. All 14 original gestures preserved.
             * Each gesture defines: duration, apply(time, amplitude, getBone).
             */
            static get GESTURES() {
                return {
                    nod: {
                        duration: 0.8,
                        apply(t, amp, B) {
                            const head = B('head');
                            if (head) head.rotation.x = Math.sin(t * Math.PI * 2.5) * 0.15 * amp;
                        }
                    },
                    tilt: {
                        duration: 1.0,
                        apply(t, amp, B) {
                            const head = B('head');
                            if (head) head.rotation.z = Math.sin(t * Math.PI) * 0.2 * amp;
                        }
                    },
                    wave: {
                        duration: 1.5,
                        apply(t, amp, B) {
                            const arm = B('rightUpperArm');
                            if (arm) {
                                arm.rotation.z = (0.7 - 1.2 * amp);
                                arm.rotation.x = Math.sin(t * Math.PI * 3) * 0.3 * amp;
                            }
                        }
                    },
                    shrug: {
                        duration: 1.2,
                        apply(t, amp, B) {
                            const ls = B('leftShoulder'), rs = B('rightShoulder');
                            const la = B('leftUpperArm'), ra = B('rightUpperArm');
                            const v = Math.sin(t * Math.PI / 1.2) * amp;
                            if (ls) ls.rotation.y = -0.15 * v;
                            if (rs) rs.rotation.y = 0.15 * v;
                            if (la) la.rotation.z = -0.7 + 0.2 * v;
                            if (ra) ra.rotation.z = 0.7 - 0.2 * v;
                        }
                    },
                    bow: {
                        duration: 2.0,
                        apply(t, amp, B) {
                            const spine = B('spine'), head = B('head');
                            const v = Math.sin(t * Math.PI / 2) * amp;
                            if (spine) spine.rotation.x = 0.3 * v;
                            if (head) head.rotation.x = 0.15 * v;
                        }
                    },
                    clap: {
                        duration: 1.5,
                        apply(t, amp, B) {
                            const la = B('leftUpperArm'), ra = B('rightUpperArm');
                            const cycle = Math.sin(t * Math.PI * 4) * amp;
                            if (la) { la.rotation.z = -0.7 + 0.5 * amp; la.rotation.x = 0.3 * amp + cycle * 0.1; }
                            if (ra) { ra.rotation.z = 0.7 - 0.5 * amp; ra.rotation.x = 0.3 * amp - cycle * 0.1; }
                        }
                    },
                    think: {
                        duration: 2.0,
                        apply(t, amp, B) {
                            const ra = B('rightUpperArm'), head = B('head');
                            if (ra) { ra.rotation.z = 0.7 - 0.6 * amp; ra.rotation.x = 0.3 * amp; }
                            if (head) head.rotation.z = Math.sin(t * 0.5) * 0.1 * amp;
                        }
                    },
                    point: {
                        duration: 1.2,
                        apply(t, amp, B) {
                            const ra = B('rightUpperArm');
                            if (ra) {
                                ra.rotation.z = 0.7 - 0.9 * amp;
                                ra.rotation.x = -0.2 * amp;
                            }
                        }
                    },
                    celebrate: {
                        duration: 2.0,
                        apply(t, amp, B) {
                            const la = B('leftUpperArm'), ra = B('rightUpperArm');
                            const hips = B('hips');
                            if (la) la.rotation.z = -0.7 - 0.8 * amp;
                            if (ra) ra.rotation.z = 0.7 + 0.8 * amp;
                            if (hips) hips.position.y = Math.sin(t * Math.PI * 3) * 0.01 * amp;
                        }
                    },
                    shy: {
                        duration: 1.5,
                        apply(t, amp, B) {
                            const head = B('head'), spine = B('spine');
                            if (head) { head.rotation.x = 0.15 * amp; head.rotation.z = 0.1 * amp; }
                            if (spine) spine.rotation.x = 0.05 * amp;
                        }
                    },
                    dance: {
                        duration: 3.0,
                        apply(t, amp, B) {
                            const hips = B('hips'), la = B('leftUpperArm'), ra = B('rightUpperArm');
                            if (hips) {
                                hips.rotation.y = Math.sin(t * Math.PI * 2) * 0.1 * amp;
                                hips.position.y = Math.abs(Math.sin(t * Math.PI * 3)) * 0.015 * amp;
                            }
                            if (la) la.rotation.z = -0.7 + Math.sin(t * Math.PI * 2.5) * 0.4 * amp;
                            if (ra) ra.rotation.z = 0.7 - Math.sin(t * Math.PI * 2.5 + 1) * 0.4 * amp;
                        }
                    },
                    foot_tap: {
                        duration: 2.0,
                        apply(t, amp, B) {
                            const leg = B('rightUpperLeg');
                            if (leg) leg.rotation.x = Math.abs(Math.sin(t * Math.PI * 3)) * 0.06 * amp;
                        }
                    },
                    crossed_arms: {
                        duration: 2.5,
                        apply(t, amp, B) {
                            const la = B('leftUpperArm'), ra = B('rightUpperArm');
                            if (la) { la.rotation.z = -0.7 + 0.4 * amp; la.rotation.x = 0.5 * amp; }
                            if (ra) { ra.rotation.z = 0.7 - 0.4 * amp; ra.rotation.x = 0.5 * amp; }
                        }
                    },
                    shake: {
                        duration: 0.8,
                        apply(t, amp, B) {
                            const head = B('head');
                            if (head) head.rotation.y = Math.sin(t * Math.PI * 5) * 0.12 * amp;
                        }
                    },
                };
            }
        }
```

**Step 2: Commit**

```bash
git add frontends/neon/viewer/viewer.html
git commit -m "feat: add GestureLayer (L4) — 14 gestures with smooth blend curves"
```

---

## Task 9: LookAtLayer (L5) — Absorbs MouseTracking + IdleHeadMovement

**Files:**
- Modify: `frontends/neon/viewer/viewer.html` — Insert after GestureLayer

**Step 1: Write LookAtLayer**

```javascript
        /**
         * L5: LookAt — always additive (+=) on eyes + head.
         * Absorbs MouseTrackingController + IdleHeadMovement into one layer.
         * When mouse is active: track cursor. When idle: gentle gaze wander.
         *
         * This layer ALWAYS runs (never suppressed) because eye/head tracking
         * looks natural on top of any other animation.
         */
        class LookAtLayer extends AnimationLayer {
            constructor(vrm, canvas) {
                super(vrm, 'lookAt');
                this._mouseX = 0;
                this._mouseY = 0;
                this._mouseActive = false;
                this._mouseTimeout = null;

                // Mouse tracking setup
                if (canvas) {
                    canvas.addEventListener('mousemove', (e) => {
                        const rect = canvas.getBoundingClientRect();
                        this._mouseX = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
                        this._mouseY = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
                        this._mouseActive = true;
                        clearTimeout(this._mouseTimeout);
                        this._mouseTimeout = setTimeout(() => { this._mouseActive = false; }, 3000);
                    });
                    canvas.addEventListener('mouseleave', () => { this._mouseActive = false; });
                }

                // Idle gaze wander state
                this._gazeTarget = { x: 0, y: 0 };
                this._gazeCurrent = { x: 0, y: 0 };
                this._gazeTimer = 2 + Math.random() * 3;

                // Idle head motion (from old IdleHeadMovement)
                this._headTarget = { x: 0, y: 0, z: 0 };
                this._headCurrent = { x: 0, y: 0, z: 0 };
                this._headTimer = 1 + Math.random() * 3;
            }

            update(dt) {
                super.update(dt);
                const t = this.time;
                const head = this.getBone('head');
                const neck = this.getBone('neck');

                // === Eye tracking via VRM lookAt ===
                if (this._mouseActive) {
                    // Track mouse position
                    if (this.vrm.lookAt) {
                        this.vrm.lookAt.target = null; // Disable auto target
                        // Apply via head + eye bones for natural look
                    }
                    // Additive head turn toward mouse
                    if (head) {
                        head.rotation.y += this._mouseX * 0.15;
                        head.rotation.x += this._mouseY * -0.08;
                    }
                } else {
                    // === Idle gaze wander ===
                    this._gazeTimer -= dt;
                    if (this._gazeTimer <= 0) {
                        this._gazeTarget.x = (Math.random() - 0.5) * 0.2;
                        this._gazeTarget.y = (Math.random() - 0.5) * 0.1;
                        this._gazeTimer = 2 + Math.random() * 4;
                    }
                    // Smooth interpolation
                    this._gazeCurrent.x += (this._gazeTarget.x - this._gazeCurrent.x) * dt * 2;
                    this._gazeCurrent.y += (this._gazeTarget.y - this._gazeCurrent.y) * dt * 2;

                    if (head) {
                        head.rotation.y += this._gazeCurrent.x;
                        head.rotation.x += this._gazeCurrent.y;
                    }
                }

                // === Idle head movement (Perlin-like random motion) ===
                this._headTimer -= dt;
                if (this._headTimer <= 0) {
                    const isTalkingNow = typeof isTalking !== 'undefined' && isTalking;
                    const range = isTalkingNow ? 0.06 : 0.04;
                    this._headTarget.x = (Math.random() - 0.5) * range;
                    this._headTarget.y = (Math.random() - 0.5) * range;
                    this._headTarget.z = (Math.random() - 0.5) * range * 0.5;
                    const speed = isTalkingNow ? 0.8 : 2;
                    this._headTimer = speed + Math.random() * speed;
                }
                const lerpSpeed = dt * 1.5;
                this._headCurrent.x += (this._headTarget.x - this._headCurrent.x) * lerpSpeed;
                this._headCurrent.y += (this._headTarget.y - this._headCurrent.y) * lerpSpeed;
                this._headCurrent.z += (this._headTarget.z - this._headCurrent.z) * lerpSpeed;

                if (neck) {
                    neck.rotation.x += this._headCurrent.x;
                    neck.rotation.y += this._headCurrent.y;
                    neck.rotation.z += this._headCurrent.z;
                }
            }
        }
```

**Step 2: Commit**

```bash
git add frontends/neon/viewer/viewer.html
git commit -m "feat: add LookAtLayer (L5) — combined eye tracking and idle gaze"
```

---

## Task 10: Wire AnimationDirector into Render Loop + PostMessage Handlers

**Files:**
- Modify: `frontends/neon/viewer/viewer.html` — render loop (~lines 1310–1350), model load (~line 1546), postMessage handler (~lines 1712–1740)

**Step 1: Replace controller initialization at model load**

At line ~1546 (controller initialization block), replace:
```javascript
                        lipSync = new AudioLipSync(vrm);
                        blinkController = new BlinkController(vrm);
                        headMovement = new IdleHeadMovement(vrm);
                        expressionController = new ExpressionController(vrm);
                        gestureController = new GestureController(vrm);
                        proceduralAnimator = new ProceduralAnimator(vrm);
                        mouseTracker = new MouseTrackingController(vrm, document.getElementById('c'));
```

With:
```javascript
                        lipSync = new AudioLipSync(vrm);
                        blinkController = new BlinkController(vrm);
                        expressionController = new ExpressionController(vrm);

                        // Legacy controllers kept for backward compat but disabled
                        // when AnimationDirector is active
                        headMovement = null;
                        gestureController = null;
                        proceduralAnimator = null;
                        mouseTracker = null;

                        // Initialize layered animation system
                        const canvas = document.getElementById('c');
                        animationDirector = new AnimationDirector(vrm);
                        animationDirector.addLayer(new BasePoseLayer(vrm));
                        animationDirector.addLayer(new IdleBehaviorLayer(vrm));
                        animationDirector.addLayer(new EmotionLayer(vrm));
                        animationDirector.addLayer(new TalkLayer(vrm));
                        animationDirector.addLayer(new GestureLayer(vrm));
                        animationDirector.addLayer(new LookAtLayer(vrm, canvas));
```

Add `let animationDirector = null;` near the other global controller variables (around line 540).

**Step 2: Replace render loop animation calls**

Replace lines ~1314–1349 (breathing code + controller updates + A-pose) with:

```javascript
                    // Layered animation system (Phase 6F)
                    if (animationDirector) {
                        // Sync talk state
                        const talkLayer = animationDirector.getLayer('talk');
                        if (talkLayer) talkLayer.setTalking(isTalking);

                        animationDirector.update(delta);

                        // A-pose arm restoration when no gesture or talk is playing
                        const gestureLayer = animationDirector.getLayer('gesture');
                        const talkActive = talkLayer && talkLayer.active;
                        if (!gestureLayer?.isPlaying && !talkActive) {
                            const getBone = (name) => currentVrm.humanoid.getNormalizedBoneNode?.(name)
                                || currentVrm.humanoid.getBoneNode?.(name);
                            const lArm = getBone('leftUpperArm');
                            const rArm = getBone('rightUpperArm');
                            if (lArm) lArm.rotation.z = -0.7;
                            if (rArm) rArm.rotation.z = 0.7;
                        }
                    }

                    if (blinkController) blinkController.update(delta);
                    if (expressionController) expressionController.update(delta);
```

**Step 3: Update postMessage handlers**

Replace `setExpression` handler to route through AnimationDirector:
```javascript
                else if (type === 'setExpression') {
                    if (expressionController) {
                        expressionController.setExpression(e.data.emotion, e.data.intensity || 1.0, e.data.duration || 0.3);
                    }
                    if (animationDirector) {
                        const emotionLayer = animationDirector.getLayer('emotion');
                        if (emotionLayer) emotionLayer.setEmotion(e.data.emotion, e.data.intensity || 0.7);
                    }
                    _triggerAutoGesture(e.data.emotion);
                }
```

Replace `setEmotion` handler similarly.

Replace `playGesture` handler:
```javascript
                else if (type === 'playGesture') {
                    const gesture = payload?.gesture || e.data.gesture;
                    if (animationDirector) {
                        const gestureLayer = animationDirector.getLayer('gesture');
                        if (gestureLayer) gestureLayer.playGesture(gesture);
                    }
                }
```

Replace `playGestureSequence` handler:
```javascript
                else if (type === 'playGestureSequence') {
                    if (animationDirector && payload) {
                        const gestureLayer = animationDirector.getLayer('gesture');
                        if (gestureLayer) gestureLayer.playSequence(payload);
                    }
                }
```

Add new `setPersonality` message handler:
```javascript
                else if (type === 'setPersonality') {
                    if (animationDirector && payload) {
                        animationDirector.setPersonality(payload);
                    }
                }
```

**Step 4: Update `_triggerAutoGesture` to use GestureLayer**

Replace references to `gestureController.playGesture(...)` in `_triggerAutoGesture` with:
```javascript
                    const gl = animationDirector?.getLayer('gesture');
                    if (gl) gl.playGesture(gesture);
```

**Step 5: Test manually**

- Load VRM model — character should breathe, fidget, track mouse
- Send emotion change — posture should shift additively
- Trigger gesture (wave) — arms should animate with smooth envelope
- Check browser console for errors

**Step 6: Commit**

```bash
git add frontends/neon/viewer/viewer.html
git commit -m "feat: wire AnimationDirector into render loop and postMessage API"
```

---

## Task 11: WaifuCreator — Personality Sliders UI

**Files:**
- Modify: `frontends/neon/js/components/WaifuCreator.js` — Identity or Appearance tab
- Modify: `frontends/neon/js/components/ViewerBridge.js` — Add `setPersonality()` method

**Step 1: Add personality sliders to WaifuCreator**

In the Identity tab renderer (`_renderIdentityTab`), add after the traits section:

```javascript
// Animation Personality Profile
html += `<div class="wc-field">
    <label class="wc-label">ANIMATION PERSONALITY</label>
    <p class="wc-hint">Controls how the character moves and fidgets in 3D</p>
    ${['energy', 'confidence', 'nervousness', 'expressiveness', 'playfulness'].map(param => `
        <div style="display:flex;align-items:center;gap:8px;margin:6px 0;">
            <span style="width:120px;font-size:12px;text-transform:uppercase;opacity:0.7;">${param}</span>
            <input type="range" min="0" max="100" value="${(this.formData.animation_profile?.[param] ?? 50) * 100}"
                   data-personality="${param}" class="wc-personality-slider"
                   style="flex:1;" />
            <span class="wc-personality-value" style="width:30px;text-align:right;font-size:12px;">
                ${Math.round((this.formData.animation_profile?.[param] ?? 0.5) * 100)}%
            </span>
        </div>
    `).join('')}
</div>`;
```

Add event listeners after rendering:
```javascript
document.querySelectorAll('.wc-personality-slider').forEach(slider => {
    slider.addEventListener('input', (e) => {
        const param = e.target.dataset.personality;
        const value = parseInt(e.target.value) / 100;
        if (!this.formData.animation_profile) {
            this.formData.animation_profile = { energy: 0.5, confidence: 0.5, nervousness: 0.3, expressiveness: 0.5, playfulness: 0.5 };
        }
        this.formData.animation_profile[param] = value;
        e.target.nextElementSibling.textContent = `${Math.round(value * 100)}%`;
        // Live preview
        this._updatePersonalityPreview();
    });
});
```

**Step 2: Add `_updatePersonalityPreview()` to WaifuCreator**

```javascript
_updatePersonalityPreview() {
    const iframe = document.getElementById('wc-vrm-iframe');
    if (iframe?.contentWindow && this.formData.animation_profile) {
        iframe.contentWindow.postMessage({
            type: 'setPersonality',
            payload: this.formData.animation_profile
        }, '*');
    }
}
```

**Step 3: Add animation_profile to formData and _collectFormData**

In the constructor's formData initialization, add:
```javascript
animation_profile: null,
```

In `_collectFormData`, collect slider values.

In `_save`, include `animation_profile` in the POST/PUT body.

**Step 4: Add `setPersonality()` to ViewerBridge.js**

```javascript
setPersonality(profile) {
    this._postMessage({ type: 'setPersonality', payload: profile });
}
```

**Step 5: Load personality on character switch**

In the main app's character loading flow, when a character is selected, send personality to the viewer:
```javascript
if (char.animation_profile) {
    window.app.viewerBridge.setPersonality(JSON.parse(char.animation_profile));
}
```

**Step 6: Run backend tests**

Run: `cd /Users/chris/Code/waifu-rt3d && python -m pytest backend/tests/ -x -v --tb=short`
Expected: All pass.

**Step 7: Test manually**

- Open WaifuCreator → Identity tab → see 5 personality sliders
- Move sliders → preview iframe character changes behavior
- Save character → reload → sliders retain values
- Select character in main view → personality applies

**Step 8: Commit**

```bash
git add frontends/neon/js/components/WaifuCreator.js frontends/neon/js/components/ViewerBridge.js
git commit -m "feat: add personality slider UI to WaifuCreator with live preview"
```

---

## Task 12: Remove Legacy Controllers + Final Integration

**Files:**
- Modify: `frontends/neon/viewer/viewer.html` — Remove or mark deprecated: ProceduralAnimator, IdleHeadMovement, MouseTrackingController, GestureController

**Step 1: Mark legacy classes as deprecated (don't delete yet)**

Add a comment above each legacy class:
```javascript
        // @deprecated — Replaced by AnimationDirector layers (Phase 6F).
        // Kept temporarily for reference. Will be removed in cleanup phase.
```

Remove the legacy variable declarations that are now set to null in model load.

**Step 2: Clean up render loop**

Remove the old breathing code block (now handled by BasePoseLayer).
Remove the old `if (headMovement)`, `if (mouseTracker)`, `if (gestureController)`, `if (proceduralAnimator)` calls from the render loop — they're now null.

**Step 3: Update `ensure_db()` docstring**

Update the migration path docs to include v16.

**Step 4: Run full test suite**

Run: `cd /Users/chris/Code/waifu-rt3d && python -m pytest backend/tests/ -x -v --tb=short`
Expected: All pass.

**Step 5: Manual verification checklist**

1. Load app → character breathes naturally (BasePoseLayer)
2. Wait 5-10s → character fidgets (IdleBehaviorLayer picks random fidgets)
3. Move mouse over viewport → character tracks cursor (LookAtLayer)
4. Leave mouse still → character does idle gaze wander (LookAtLayer)
5. Send chat → during TTS speech, character uses talk gestures (TalkLayer)
6. Trigger gesture (wave from LLM [gesture:wave]) → smooth blend-in/out (GestureLayer)
7. Set emotion → posture shifts additively (EmotionLayer)
8. Open WaifuCreator → adjust personality sliders → 3D preview changes behavior
9. High energy + high playfulness → bouncy, silly fidgets
10. High nervousness → self-touch fidgets, faster breathing
11. High confidence → hand-on-hip fidgets, chest-out posture
12. All 14 legacy gestures still work (nod, wave, shrug, bow, etc.)

**Step 6: Commit**

```bash
git add frontends/neon/viewer/viewer.html backend/preflight.py
git commit -m "feat: complete Phase 6F layered animation system — clean up legacy controllers"
```

---

## Summary

| Task | What | Est. Lines |
|------|------|-----------|
| 1 | Schema v16 migration | ~40 |
| 2 | Character CRUD update | ~20 |
| 3 | AnimationLayer + AnimationDirector | ~100 |
| 4 | BasePoseLayer (L0) | ~40 |
| 5 | IdleBehaviorLayer (L1) — 22 fidgets | ~250 |
| 6 | EmotionLayer (L2) | ~70 |
| 7 | TalkLayer (L3) | ~80 |
| 8 | GestureLayer (L4) — 14 gestures | ~200 |
| 9 | LookAtLayer (L5) | ~90 |
| 10 | Wire into render loop + postMessage | ~60 |
| 11 | WaifuCreator personality sliders | ~80 |
| 12 | Legacy cleanup + final integration | ~30 |
| **Total** | | **~1060** |
