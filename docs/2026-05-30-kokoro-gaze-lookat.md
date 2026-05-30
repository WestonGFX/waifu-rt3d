# Dev Note — Kokoro Gaze → VRM LookAt

**Date:** 2026-05-30
**Branch:** `feat/kokoro-gaze-lookat`
**Type:** Feature (avatar embodiment)
**Schema impact:** none · **Backend impact:** none · **New deps:** none

## What this is

The Kokoro engine already returns a per-turn `gaze` token (`user | away |
thinking | object | camera`) describing where the character should be looking.
The backend parsed it (`backend/kokoro/response_parser.py`), emitted it
(`backend/kokoro/service.py:421`), and the frontend mirrored its type
(`frontends/sakura/src/lib/kokoro.ts: KokoroGaze`) — **but the frontend dropped
it on the floor.** `viewerStore.dispatchKokoroEmbodiment` mapped
`facialExpression` and `gesture` only; the `gaze` field was never applied to the
avatar.

This change wires `gaze` into the viewer's **already-mature, always-on LookAt
layer**, so the character actually looks where the model intends: at you when
engaged, off to the side when shy, up when thinking, down at an object, or
straight into the camera for deliberate eye contact.

It matches the project's stated #1 avatar candidate: *"proper VRM lookAt
integration while preserving procedural head/neck motion."* The procedural
motion is preserved because `gaze: 'user'` returns the layer to **cursor-follow
mode**, which keeps the idle gaze-wander + eye-leads-head spring smoothing
running rather than freezing the head forward.

## How it works (data flow)

```
LLM turn
  → backend/kokoro/response_parser.py  (parse gaze, default 'user')
  → backend/kokoro/service.py          (emit "gaze" in payload)        [unchanged]
  → chatStore.finalizeKokoroTurn       (dispatchKokoroEmbodiment)      [unchanged]
  → viewerStore.dispatchKokoroEmbodiment
        Step 3 → dispatchGaze(payload.gaze)                            [NEW]
  → kokoroGazeToLookAt(gaze)  ──►  { mode:'cursor' } | { target:{x,y,z} }   [NEW pure fn]
  → postMessage { type:'lookAt', payload }  ──►  viewer.html LookAtLayer.setWorldTarget()
```

No new viewer.html surface area — it reuses the existing `lookAt` postMessage
API (`frontends/shared/viewer/viewer.html:8682`), which already accepts
`{ target:{x,y,z} }`, `{ mode:'cursor' }`, and `{ enabled:false }`.

## Files changed

| File | Change |
|---|---|
| `frontends/sakura/src/lib/kokoro.ts` | **+** `GazeLookAt` type, `KOKORO_GAZE_TO_LOOKAT` map, `kokoroGazeToLookAt()` pure fn |
| `frontends/sakura/src/stores/viewerStore.ts` | **+** `'gaze'` command kind, `dispatchGaze()` method, Step 3 in `dispatchKokoroEmbodiment` |
| `frontends/sakura/src/test/viewerStore.kokoroGaze.test.ts` | **+** new test file (mapping + dispatch + forwarding) |
| `frontends/sakura/src/test/viewerStore.test.ts` | **~** updated 2 call-count assertions (gaze now always dispatches) |

## Config flags

- Gated by the existing `kokoro_enabled` diagnostic — when off,
  `dispatchKokoroEmbodiment` (and therefore gaze) is a no-op. No new flag.
- The five gaze vectors live in `KOKORO_GAZE_TO_LOOKAT` (kokoro.ts). They are
  **pure feel** — edit one line to retune any glance. Nothing else depends on
  the exact numbers.

## Gaze vector reference (tunable)

Coordinate frame: character at origin facing +Z; `y≈1.3` = eye height,
`z≈2.0` = comfortable forward distance.

| gaze | instruction | intent |
|---|---|---|
| `user` | `{ mode: 'cursor' }` | follow the person, keep idle motion |
| `camera` | `target {0, 1.3, 2.0}` | level, deliberate eye contact |
| `away` | `target {0.6, 1.15, 2.0}` | glance aside + slightly down (shy/evasive) |
| `thinking` | `target {-0.5, 1.7, 2.0}` | up and to the side (recall) |
| `object` | `target {0, 0.7, 1.2}` | down and nearer (regarding something) |

## Testing

```bash
cd frontends/sakura
npx tsc --project tsconfig.app.json --noEmit                       # type-check (clean)
npx vitest run src/test/viewerStore.kokoroGaze.test.ts             # new tests
npx vitest run                                                     # full frontend suite
```

- New tests: pure-mapping coverage (all 5 gazes, unknown-default, geometry
  sanity), `dispatchGaze` command emission, and `dispatchKokoroEmbodiment`
  forwarding + gate behavior.
- Verified: 455/455 frontend tests pass. The 3 "unhandled errors" vitest
  reports are pre-existing (chatStore `api.kokoroFinalize` mock gap +
  SettingsView jsdom `scrollIntoView` stub) and unrelated to this change.

### Manual / visual QA (requires a running VRM avatar — NOT done this session)

Browser smoke-test was not run because this session had no live avatar. To
verify visually: load a VRM, send messages that elicit each gaze, and confirm
the eyes/head steer correctly without snapping. Checklist:

- [ ] neutral idle — head still wanders gently (cursor mode), not locked forward
- [ ] `away`/shy reply — glances aside, returns smoothly
- [ ] `thinking` reply — looks up, returns
- [ ] speaking + listening — gaze coexists with visemes/talk layer (LookAt is L5, always additive)
- [ ] tab hidden → restored — no stuck target
- [ ] model load failure — `state.mode !== 'vrm'` path is a no-op (no throw)
- [ ] long chat session — repeated dispatches don't accumulate state (each is a fresh `setWorldTarget`)

## Known limitations

- Gaze vectors are tuned by reasoning about the coordinate frame, **not yet
  eyeballed against a live model.** They may want a small retune after visual QA.
- `gaze: 'user'` intentionally hands control back to cursor-follow; if the mouse
  is far off-screen the idle wander takes over. That's by design (preserve
  procedural motion) but means "look at user" ≠ "stare at camera" — use
  `camera` for fixed eye contact.
- Live2D / Unity renderers ignore gaze (VRM-only), same as the other Kokoro
  embodiment steps.

## For the next agent

- The wiring gap is **closed**: `gaze` now reaches the avatar. If you extend the
  `KokoroGaze` enum, add a vector to `KOKORO_GAZE_TO_LOOKAT` — unknown values
  safely default to cursor-follow, so a missing entry degrades gracefully but
  silently. Add the entry.
- If you want gaze to *also* nudge the head harder, the LookAt layer already
  derives head yaw/pitch from the world target (`viewer.html` ~L3933). No
  frontend change needed — just move the target further off-axis.
- Natural next step: **gaze saccades / blink-on-gaze-shift** for extra life, and
  **emotion→gaze coupling** (e.g. `shy` emotion biases toward `away`). Both are
  viewer.html-side and independently verifiable once a VRM is loadable in CI.
- Do NOT pick VRMA clip loading as a "shippable" feature until sample `.vrma`
  assets exist and `@pixiv/three-vrm-animation` is vendored — see
  `docs/research/2026-05-30-repo-surgeon-pass.md` §2 for why it's currently dead
  code.
