# Bug: 3D viewer appears broken — viewer rendering OR model picker OR model assignment

**Reported:** 2026-04-27 (session 18 hand-on QA)
**Reporter:** chris
**Severity:** P0 (blocks core experience)
**Status:** Surface confirmed = viewer iframe blank/crashed (user 2026-04-27)

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
