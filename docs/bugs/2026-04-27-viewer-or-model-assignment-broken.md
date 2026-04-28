# Bug: 3D viewer appears broken — viewer rendering OR model picker OR model assignment

**Reported:** 2026-04-27 (session 18 hand-on QA)
**Reporter:** chris
**Severity:** P0 (blocks core experience)
**Status:** ✅ FIXED (session 18, 2026-04-27) — see "Resolution" below

## Symptom

User reports: "the 3d viewer appears to be broken or its the model picker
or how we assign the models im not sure".

Three possible failure surfaces — needs disambiguation:

1. **Viewer iframe itself** — `frontends/shared/viewer/viewer.html` not
   rendering at all (blank canvas, no avatar).
2. **Model picker UI** — overlay browses but selection doesn't persist
   or doesn't actually swap the loaded model.
3. **Character → model mapping** — picker works but the assigned model
   isn't what the character is actually loading (wrong VRM file path,
   stale DB column, etc.).

## What we know

- Schema is at v70.
- Live2D runtime is known broken (`project_live2d_broken.md` memory) —
  characters with `live2d_model` set crash the viewer on load. If the
  active character has Live2D assigned, that's almost certainly the
  trigger.
- `viewerStore.ts` is the postMessage bridge; `viewer.html` runs the
  AnimationDirector and VRM loader.

## Confirmed surface

Viewer iframe is blank/crashed — no avatar renders. Picker UI + DB
mapping are NOT the problem (or at least, not the visible symptom).

## Repro hypothesis (to verify)

Most-likely cause given recent context: a character whose stored
`live2d_model` field is non-null is being auto-loaded on app start,
crashing the viewer before any VRM can mount. Check:

- DevTools console for "Live2D" / "Cubism" stack traces
- `await api.getCharacters()` in console — look at `live2d_model` and
  `model_url` for the active character
- Try switching to a known-VRM-only character and see if viewer recovers

## Next steps

1. Get a screenshot + DevTools console paste from user.
2. Confirm which of the 3 surfaces is actually broken.
3. If Live2D crash → file follow-up to disable Live2D code path until
   Cubism SDK loader is fixed.
4. If picker doesn't persist → trace `viewerStore.setActiveModel` →
   API call → DB write → reload roundtrip.
5. If model assignment is wrong → audit character row vs picker UI
   field bindings.

## Linked

- Related: `project_live2d_broken.md` (memory)
- Related: `project_aspect_grounding.md` if aspect-ratio is part of the
  reported issue (Known Sensitive Area #1)

## Resolution (2026-04-27, session 18)

Diagnosis: Live2D was *not* the cause (active char `live2d_model` was
empty). The crash chain (innermost to outermost):

1. **Backend column phantoms** — three SQL queries in `get_character_greeting`
   referenced columns that don't exist:
   - `greeting_message` (real column name is `greeting_text`)
   - `sessions.updated_at` (sessions has `created_ts` only)
   - `sessions.character_id` (sessions has no character link — char→session
     is implicit via `messages.char_id`)

   These produced cascading 500s on app open, but didn't directly crash the
   viewer.

2. **DB lock contention** — `db()` opened raw `sqlite3.connect()` with no
   `busy_timeout`. Hot-polled `/api/characters/{id}/relationship` issued an
   unconditional `INSERT OR IGNORE` per GET, hitting WAL writer contention.
   Fixed in commit `8a1f3f5` (filed separately as
   `2026-04-27-character-relationship-db-lock.md`).

3. **THE viewer crash** — `BlinkController` constructor in
   `frontends/shared/viewer/viewer.html` called `this._poissonDelay()`
   *before* initialising `this._emotionMod`. `_poissonDelay()` reads
   `this._emotionMod.rateMul`, so it crashed with:

   ```
   TypeError: Cannot read properties of undefined (reading 'rateMul')
       at BlinkController._poissonDelay
       at new BlinkController
       at loader.load callback (loadModel success path)
   ```

   The crash happened *inside the GLTFLoader success callback*, after the
   VRM file fully downloaded. The viewer never reached the postMessage
   `modelLoaded` reply, so the parent React app stayed stuck on
   "Loading 3D model..." forever — appearing as a blank viewer panel.

   Fixed by reordering the constructor: `_emotionMod` initialised
   *before* `_poissonDelay()` is called.

Also bumped `?v=7` → `?v=8` on the iframe src in `ModelPanel.tsx` so
clients dodge any cached old viewer.html.

## Verification

- Playwright drove the app: opened sakura → clicked 3D viewer button →
  iframe rendered VRM model (Panicandy, Rin Akane) at 118 FPS with
  `motion_neutral` animation playing. Console clean of TypeErrors.
- Regression test:
  `frontends/sakura/src/test/viewer.blinkController.test.ts` — 3 cases.
  Reads viewer.html as text; asserts that within the BlinkController
  constructor, `_emotionMod` is assigned BEFORE the `_poissonDelay()`
  call. Locks in the structural ordering so a future reordering breaks
  CI loudly.
