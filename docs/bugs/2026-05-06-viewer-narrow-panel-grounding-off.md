# Avatar Grounding/Centering Off When Viewer Panel Is Narrow

**Date filed:** 2026-05-06 (session 29 wave 2 → formalized session 30)
**Severity:** P3
**Component:** `frontends/shared/viewer/viewer.html` (camera positioning), `frontends/sakura/src/components/AvatarPanel.tsx` (panel sizing)
**Discovered via:** session 29 wave 2 browser QA sweep (P4 in `docs/testing/qa-sweep-2026-05-06-wave1.md`)

## Summary

When the 3D viewer panel coexists with the chat panel and the viewer column is narrow (~400-500px), the VRM character clips toward the right edge of the canvas instead of remaining centered. The "Face" camera preset becomes especially broken — it points at empty space to the right of the model's head.

Root cause is almost certainly that the camera positioning math assumes a square or near-square canvas aspect ratio. When the canvas is narrow-portrait (taller than it is wide), the model anchor point and the camera's lookAt drift apart.

This is in the **Known Sensitive Areas** list in `CLAUDE.md` — has regressed multiple times across sessions.

## Repro

1. Open Sakura, select Rin (or any character with VRM).
2. Open 3D viewer panel.
3. Drag the chat/viewer divider so the viewer is ~450px wide.
4. **Expected:** character stays centered horizontally, framed correctly for whatever camera preset is active.
5. **Actual:** character clips toward right edge of canvas; Face preset stares past the model.

## Probable Causes

1. **Camera offset hardcoded for landscape aspect.** The presets likely calculate `camera.position.x = boneHeadWorld.x + offset` with a fixed offset designed for a wider canvas. When canvas narrows, the same world-space offset translates to a larger UV offset.
2. **`renderer.setSize` + camera aspect ratio update not chained** — if the renderer resize triggers without a corresponding `camera.aspect = canvas.width / canvas.height; camera.updateProjectionMatrix()`, the camera frustum stays at its initial aspect even after the canvas reshapes.
3. **Model root offset, not camera offset** — alternative: the model's root transform might be set to a horizontal offset for canvas-relative composition, breaking when canvas geometry shifts.

## Suggested Fix Direction

Three-step diagnosis pass:

1. **Add a "current canvas / camera" debug HUD** to `viewer.html` (already partially exists). Print: `canvas.width × canvas.height`, `camera.aspect`, `camera.position`, `camera.fov`, model root world position. Reproduces this bug with concrete numbers in <2min.
2. **Trace the resize chain.** Find every code path that listens to canvas resize / parent-iframe size changes. Confirm each updates `camera.aspect` + calls `updateProjectionMatrix()`.
3. **Fix or work around.** Likely fix: each preset calculator should derive camera offset from the canvas aspect ratio, not from a fixed value. Workaround: hard-clamp viewer panel min-width to 600px, never letting the viewer get into the narrow regime.

Effort estimate: 2-4h diagnosis + fix, depending on which probable cause is actual root.

## Related

- `CLAUDE.md` Known Sensitive Areas: "Avatar aspect ratio & grounding" + "Column resize / layout reflow" — both call out this exact regression class.
- Session 18 commit `643bd24` was a different camera bug (BlinkController crash) but lived in the same file. Be careful not to revert that fix.
- Session 22 (Tier 5 sidebar work) had a similar "narrow-width layout bug" call-out — this bug is the 3D-viewer counterpart.
