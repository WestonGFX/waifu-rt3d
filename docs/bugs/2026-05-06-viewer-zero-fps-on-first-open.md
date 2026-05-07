# 3D Viewer Shows 0 FPS / Black Canvas on First Open

**Date filed:** 2026-05-06 (session 29 wave 2 → formalized session 30)
**Severity:** P3
**Component:** `frontends/shared/viewer/viewer.html`, `frontends/sakura/src/components/AvatarPanel.tsx`, postMessage bridge in `viewerStore.ts`
**Discovered via:** session 29 wave 2 browser QA sweep

## Summary

When the 3D viewer panel is opened for the first time after page load, the canvas renders black and the FPS counter shows 0. The viewer only starts rendering frames after the user clicks any camera preset button (Full / Bust / Face / 3/4 / Side). New users see a black panel and reasonably assume the viewer is broken.

This is unrelated to session 18's BlinkController crash (commit `643bd24`) — that crash hung the viewer permanently; this bug self-resolves on first interaction.

## Repro

1. Reload Sakura page (F5).
2. Select character with VRM model (e.g. Rin).
3. Click 3D viewer panel toggle.
4. **Expected:** model renders immediately at 60+ FPS with default camera framing.
5. **Actual:** black canvas, FPS counter reads 0. Click any camera preset → model snaps in, FPS jumps to 119.

## Probable Causes

1. **First-frame request stall** — `requestAnimationFrame` loop is started but the camera matrix is `Identity` until a preset applies. Renderer runs but draws nothing visible because the camera is at origin looking at origin. Confirmed: presets call `camera.position.set(...)` which kicks the matrix into a useful state.
2. **`modelLoaded` event fires before camera default applies** — the postMessage handler for `modelLoaded` may not chain into a `applyDefaultCamera()` call. The presets work because they each call that path.
3. **AnimationDirector idle state not started** — without the idle clip running, even a correctly-positioned camera renders a static T-pose. Possible compound effect.

## Suggested Fix Direction

Two layers:

1. **Quick win (<30min):** in `viewer.html` `modelLoaded` handler, auto-call the equivalent of "Full" preset (`setCameraToFullBody()`). Same code path as user click, just triggered on load. Caveat: need to verify this doesn't conflict with the "remember last camera preset" feature if that exists. If it does, fall back to whichever preset was last active.
2. **Defensive (<1h):** if for any reason the camera fails to initialize, render a "Loading 3D model..." spinner overlay until the first non-zero FPS is reported. Removes the user perception of brokenness even if the underlying issue persists.

## Related

- Session 18 commit `643bd24` fixed the *permanent* black-canvas case (BlinkController crash before `modelLoaded` fired). That fix verified VRM renders at 118 FPS with `motion_neutral` playing — but only after Playwright drove the test, which itself clicked a camera preset implicitly through layout-debug interaction.
- Known sensitive area in `CLAUDE.md`: "Avatar aspect ratio & grounding — Changes to viewer.html camera, VRM model positioning, or canvas sizing MUST be visually verified."
