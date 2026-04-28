# Bug: Model picker has no preview images — looks bad / hard to choose

**Reported:** 2026-04-27 (session 18 hand-on QA)
**Reporter:** chris
**Severity:** P2 (UX polish — affects discoverability + first impression)
**Status:** Confirmed by user, needs design pass

## Symptom

User: "it looks bad or weird to have no preview images of the models
so we have to rethink that".

The avatar / model picker overlay lists VRM (and Live2D?) models as
text/filename rows only — no thumbnail, no preview render, no avatar
silhouette. For a 3D anime companion app where the avatar IS the
product, a text-only picker is the wrong shape.

## What's missing

- Per-model thumbnail (PNG/JPEG cached per VRM)
- Hover/focus → larger preview (could be the same thumb scaled, or a
  rotating preview if we ever generate one)
- Maybe: a "first impression" preview rendered on first download (one
  off-screen camera shot of the loaded VRM, T-pose or idle)

## Design directions to weigh

1. **Cheapest:** require uploaded models to ship with a thumbnail file
   (`*.png` next to the `*.vrm`). Backend exposes via static route.
   Falls back to placeholder if missing.
2. **Medium:** auto-generate thumbnail on first load — render the VRM
   off-screen at low res, capture canvas to PNG, cache to disk indexed
   by file hash. Only runs once per model.
3. **Premium:** rotating 3-frame preview (front + 3/4 + side) generated
   the same way. Larger storage cost.

Recommend (1) for built-in / curated models (we control those) +
(2) as fallback for user-imported VRMs.

## Where this lives

- Frontend: avatar/model browser overlay component (likely in
  `frontends/sakura/src/components/` — search "ModelBrowser" or
  similar).
- Backend: needs static thumbnail route under `/api/models/...` or
  similar; storage path next to the VRM files.
- Schema: maybe a `thumbnail_path` column on the relevant model table,
  or pure convention (sibling file with same stem).

## Next steps

- Audit the current picker component to confirm what it shows today.
- Decide on direction (1) vs (2) vs hybrid via AskUserQuestion before
  writing code.
- Estimate: ~4–8h for hybrid + thumbnail generator + UI integration.
