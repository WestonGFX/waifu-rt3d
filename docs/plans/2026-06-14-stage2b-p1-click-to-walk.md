# Stage 2b — Character Navigation, Phase 1: Click-to-Walk with Real Collision

**Date:** 2026-06-14
**Status:** APPROVED — execution started
**Parent plan:** `docs/plans/2026-05-31-avatar-motion-staged.md` (Stage 2b "separate plan" pointer)

## Context

**Why now.** Stage 2a (shipped 2026-06-14) put the VRM avatar *standing* in a loaded 3D
room (`characters.environment_url`, `loadEnvironment` viewer handler, lofi_room.glb). The
natural next beat is making her *move around* that room. The original staged plan
(`docs/plans/2026-05-31-avatar-motion-staged.md:89-95`) splits this off as **Stage 2b** and
explicitly flags the *full* version — navmesh pathfinding + collision + dynamic camera +
AI-driven destination selection — as **multi-month and "the easiest to over-commit."** It
demands its own dated plan.

**This is that plan, scoped to a deliberate Phase 1.** Goal: prove the core locomotion
mechanic end-to-end — *click a spot on the floor, she turns, walks there along a straight
line, stops short of walls/furniture using real room geometry, and settles back to idle* —
while leaving pathfinding-around-obstacles, AI-driven movement, and run/turn-in-place
blending for later phases.

**User decisions (this session):**
- **Trigger:** Click-to-walk, **dev-mode-gated** (does not change normal-user click behavior).
- **Walkable area:** **Real collision geometry** — raycast against the actual room mesh, not a
  hardcoded rectangle. (Interpreted as raycast-based collision; full navmesh/physics deferred.)

## Starting point (verified during exploration)

| Capability | State | Ref |
|---|---|---|
| Walk clip | **Exists, retargeted** — `walking.normalized.glb` | `backend/storage/animations/vrm-baked/` |
| Avatar position | Set via `currentVrm.scene.position` (world origin today) | `viewer.html:8186` |
| Animations | **In-place, rotation-only** (no root motion) — legs cycle, root doesn't translate | `viewer.html:2970-3018` (ClipLayer retarget) |
| Environment | Loaded + grounded at y=0; 20×20 invisible ShadowMaterial floor | `viewer.html:8048-8098`, `7998-8012` |
| Camera | Orbits avatar; target ≈ (0,1.2,0); follows only if `controls.target` updated | `viewer.html:6334`, `169-320` |
| Play-clip path | `dispatchLoadAnimation(url,name,retarget)` → `dispatchPlayAnimation(name,opts)` | `viewerStore.ts:1114,1140` |
| `setVrmTransform` | Supports offsetX/offsetY — **no Z axis** | `viewer.html:9106` |

**Gaps Phase 1 must close:** no walk-to-point command, no Z movement, no floor raycast pick,
no collision check, no camera-follow-on-move, no arrival feedback.

**Consequence of in-place clips:** translating the root while the walk clip cycles will
foot-slide if translation speed ≠ the clip's implied stride speed. Phase 1 mitigates with a
**tuned constant ground speed** (~1.1 m/s, calibrated by eye against the walk clip). True
root-motion extraction from the raw (non-normalized) Mixamo clip is a later refinement, not
Phase 1.

## Scope boundaries (read before coding)

**IN (Phase 1):**
- A `walkTo({x, z})` capability inside `viewer.html` (turn → walk loop → translate → arrive → idle).
- Click-to-walk: raycast floor pick, **dev-mode-gated**, opt-in toggle.
- Real raycast collision: floor detection on click + forward ray/capsule sweep that stops her
  short of walls/props. Uses `THREE.Raycaster` against `currentEnvironment` meshes — **no new
  physics dependency** (no Cannon/Rapier).
- Camera target tracks the avatar during/after the walk.
- Arrival callback (`avatarMoved`) so the parent knows her final position.

**OUT (later phases — do not build now):**
- Pathfinding *around* obstacles (navmesh / A*). She walks straight; if blocked, she stops.
- AI/Kokoro-driven destination selection (the embodiment seam).
- Run clip, turn-in-place clips, accel/decel blending, waypoint wandering.
- Per-prop collision authoring, multi-room walkable metadata.

**Sensitive-area guardrails (CLAUDE.md):**
- **Grounding is the #1 regression hotspot.** Every change must be *visually verified* — feet
  on floor, no float, no penetration — at start, mid-walk, and arrival. Use the existing
  `tools/verify/render_environment.mjs` harness pattern + a motion-burst variant.
- **No surprise UI.** The walk-mode toggle is **dev-mode-gated only** (invisible to normal
  users), placed beside the existing environment picker in the Model-panel toolbar (same spot
  Stage 2a P6 used, already user-approved for that toolbar).
- **viewer.html has regressed 10+ times** — keep changes additive and isolated; dispatch the
  `embodiment-director` agent for the viewer-side work.

## Implementation

### Task 1 — Viewer: `walkTo` core mechanic (`frontends/shared/viewer/viewer.html`)
Add a `WalkController` (or extend the AnimationDirector clip path) that, given a target XZ:
1. **Face the target** — compute heading from `currentVrm.scene.position` → target, tween
   `currentVrm.scene.rotation.y` (yaw) to it over ~0.25s.
2. **Start walk loop** — load (if needed) + play `walking` clip via existing ClipLayer path
   (`clipLayer.loadClip` / `playClip`, loop, fadeIn 0.3).
3. **Translate the root** — each frame, advance `currentVrm.scene.position` toward target at
   the tuned ground speed (~1.1 m/s). Keep `position.y` glued to 0 (grounding invariant).
4. **Arrive** — within ε of target, stop walk clip (fade 0.3), let AnimationDirector return to
   `idle`, face a default forward heading. Post `avatarMoved {x,z}` to parent.
5. **Interruptible** — a new `walkTo` while walking retargets cleanly; expose `stopWalk`.

### Task 2 — Viewer: real raycast collision (`viewer.html`)
- **Floor pick (on click):** `THREE.Raycaster` from camera through the click NDC; intersect
  `currentEnvironment` meshes + the shadow floor. If the first hit is floor-like (normal ≈ up,
  y ≈ 0), that XZ is the destination. If it hits a wall/prop, reject (no-op) for Phase 1.
- **Path blocking (during walk):** before committing each step, cast a short forward ray (or
  2-3 rays at ankle/hip/head height ≈ a capsule) from the avatar along the heading against
  `currentEnvironment`. If a hit is closer than a stop-margin (~0.3m), halt at the safe point
  and settle to idle. No re-routing (deferred).
- Cache a flat list of collidable environment meshes when `loadEnvironment` runs (avoid
  re-traversing the graph every frame).

### Task 3 — Viewer: click-to-walk input + dev gating (`viewer.html`)
- New postMessage handlers: `setWalkMode {enabled}`, `walkTo {x,z}`, `stopWalk`.
- When walk mode is **on**, a canvas click runs Task 2's floor pick → Task 1's `walkTo`.
  When **off** (default), click behaves exactly as today (orbit/no-op) — zero behavior change
  for normal users.
- Emit `avatarMoved {x,z}` and a `walkBlocked` event back to the parent.

### Task 4 — Bridge: `viewerStore.ts` dispatch methods (`frontends/sakura/src/stores/viewerStore.ts`)
Mirror the Stage 2a pattern (`dispatchLoadEnvironment`, `viewer.html:1125`):
- `dispatchSetWalkMode(enabled: boolean)`
- `dispatchWalkTo(x: number, z: number)`
- `dispatchStopWalk()`
- Handle inbound `avatarMoved` / `walkBlocked` messages (store last-known avatar XZ for the
  camera-follow + future AI use).

### Task 5 — Camera follow (`viewer.html`)
- During/after a walk, update `controls.target` to `(avatarX, ~1.2, avatarZ)` so framing
  stays on her. Reuse the existing `controls.update()` / tween path (`viewer.html:276-282`).
  Keep it gentle (lerp the target) to avoid jarring orbit snaps.

### Task 6 — Dev toggle UI (Model panel, dev-mode-gated only)
- Add a "🚶 Walk mode" toggle beside the environment picker in the Model-panel toolbar
  (same component Stage 2a P6 touched). **Render only when dev mode is active.** Flips
  `dispatchSetWalkMode`. No new visible chrome for normal users.

## Verification (end-to-end, mandatory before "done")

1. **Render-gate (grounding):** extend `tools/verify/render_environment.mjs` with a
   motion-burst that issues `setWalkMode(true)` + `walkTo` to a floor point and captures
   frames at start / mid-walk / arrival. Assert: feet on floor (no float/penetration), root
   y == 0 throughout, walk clip tracks animate, arrival settles to idle. Save to
   `docs/testing/screenshots/<date>-stage2b-p1/`.
2. **Collision:** `walkTo` a point *behind a wall* → she stops short, no clipping. `walkTo`
   a clear floor point → she reaches it.
3. **Camera:** confirm framing follows her and doesn't snap/jar.
4. **Dev gating:** with dev mode OFF, clicks do nothing new (orbit only). With it ON, the
   toggle appears and click-to-walk works.
5. **Backend smoke:** `.venv/bin/python -m pytest backend/tests/ -q` (no backend change
   expected, but confirm green).
6. **Frontend:** `cd frontends/sakura && npx tsc --project tsconfig.app.json --noEmit` clean;
   add Vitest for the new `viewerStore` dispatch methods (mirror existing dispatch tests).
7. **Browser golden path:** drive Chrome — load lofi_room, enable walk mode, click 3 floor
   points, confirm believable walk + grounding + collision. Screenshots committed.

## Notes / follow-ups
- Foot-slide is accepted-minor in Phase 1 (tuned constant speed). **Phase 2 candidates:**
  root-motion-extracted speed calibration, pathfinding around obstacles (navmesh/A*),
  run/turn clips, then Kokoro-driven destinations (Phase 3 / embodiment seam).

---

## Execution status — 2026-06-14 (DONE, with one flagged limitation)

All 6 build tasks implemented + verified. Files changed:
- `frontends/shared/viewer/viewer.html` — WalkController (turn → walk loop → translate →
  arrive/idle), raycast floor-pick + forward capsule wall collision, `setWalkMode`/`walkTo`/
  `stopWalk`/`getAvatarPose` postMessage handlers, camera-target follow, drag-vs-click guard.
- `frontends/sakura/src/stores/viewerStore.ts` — `dispatchSetWalkMode`/`dispatchWalkTo`/
  `dispatchStopWalk` + `setWalkMode`/`walkTo`/`stopWalk` command kinds.
- `frontends/sakura/src/components/ModelPanel.tsx` — dev-mode-gated 🚶 Walk toggle beside
  the environment picker (`devMode && vrmLoadState==='loaded' && !isLive2D`).
- `frontends/sakura/src/test/viewerStore.walk.test.ts` — 11 dispatch tests.
- `tools/verify/render_walk.mjs` — headless walk render-gate (grounding + arrival + collision).

**postMessage contract (implemented):** inbound `{type:'setWalkMode',payload:{enabled:boolean}}`,
`{type:'walkTo',payload:{x:number,z:number}}`, `{type:'stopWalk'}`, `{type:'getAvatarPose'}`;
outbound `{type:'avatarMoved',x,z}`, `{type:'walkBlocked',x,z}`, `{type:'avatarPose',x,y,z}`.

**Bug caught by the render-gate:** `_walk` config object was declared inside `init()` *after*
the animate loop starts → TDZ `Cannot access '_walk' before initialization` every frame. Fixed
by hoisting `_walk` to module scope (initializes at parse time, before the first tick).

**Verification:** render_walk.mjs PASS — grounding invariant held (avatar root y == 0 at
start/mid/arrival), avatar translated and arrived on-target (avatarMoved), and a walk into a
prop stopped short (walkBlocked). 3121 backend pytest + 498 vitest pass, tsc clean. Screenshots:
`docs/testing/screenshots/2026-06-14-stage2b-p1/`.

### Posture investigation (2026-06-14) — RESOLVED: headless artifact

The headless render-gate showed a pronounced forward torso hunch + hair-whip during the walk
(`2-mid-walk.png` / `3-arrival.png`). Investigated under the hypothesis limit:

| Hypothesis | Test | Verdict |
|---|---|---|
| Walk clip is bad | Play `walking` in-place at origin (`render_clip`) → `…/inplace/clip-walking.png` | clip is **upright/good** |
| BalanceLayer world-space CoG | mid-frame is at origin (CoG≈0) yet still hunched | **falsified** as the hunch cause |
| FollowThrough reacts to root | reads bone-*local* rotations; root transform doesn't feed it | explains hair-whip (spring bones), not torso |
| Headless low-framerate spring instability | re-ran HEADED on real GPU (`render_walk_headed.mjs`) | **confirmed** — upright at 60fps (`…/headed/h2-t240ms.png`) |

**Conclusion:** the hunch is a **headless swiftshader artifact** (capped Δt + low framerate
destabilises the spring/follow-through integration). At native 60fps the walk posture is
**upright and natural**. No clip-quality work needed for Phase 1.

**Kept fix (separate latent bug):** `BalanceLayer.calculateCoG()` now measures CoG **relative
to the avatar root** instead of absolute world space. Previously, walking the root to (x,z)
fed that translation into the CoG and triggered a bogus hip shift (up to ~9cm) — a whole-body
position error once translated. Zero regression at origin (root=0). `viewer.html` BalanceLayer.

**Known minor (Phase 2 tuning, not a bug):** camera-follow keeps the orbit target on the
avatar, so walking *toward* the camera brings her very close / near-plane clips. Acceptable for
the dev tool; revisit with a follow-distance clamp when navigation graduates from dev-gated.

**Verification scripts added:** `tools/verify/render_walk_headed.mjs` (real-GPU posture check),
plus in-place + headed screenshots under `docs/testing/screenshots/2026-06-14-stage2b-p1/`.
