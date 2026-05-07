# Header UI Occlusion at Narrow Widths

**Date filed:** 2026-05-06 (session 29 wave 2 → formalized session 30)
**Severity:** P1
**Component:** `frontends/sakura/src/components/AppHeader.tsx` (+ adjacent: `BondPill.tsx`, context-pill, settings gear)
**Discovered via:** session 29 wave 2 browser QA sweep

## Summary

When the 3D viewer panel is open and the chat column shrinks past ~1100px, multiple header elements compete for the same horizontal real estate and overlap. Reported elements: context pill, settings gear icon, bond XP text, character name, model badge. Visible chrome stack overruns its own bounding row. Workarounds today: close the 3D panel or widen the window past ~1280px.

## Repro

1. Open Sakura at 1512×791 default window.
2. Select a character with a VRM model (Rin / Aria).
3. Open 3D viewer panel (right side).
4. Drag the divider toward the right or shrink window width to ~1100px.
5. **Expected:** header elements re-flow, truncate gracefully, or collapse into an overflow `⋯` menu.
6. **Actual:** elements stack visually on top of each other; bond XP text intersects settings gear; context pill clips into character name.

## Evidence Needed

- Screenshot at 1100px / 1000px / 900px chat-column widths.
- Computed-style audit of `AppHeader.tsx` row: which children declare `flex-shrink: 0` vs `1`, which have explicit `min-width`, which have no upper width cap.

## Probable Causes

1. **No `min-width: 0` on flex children** — text labels won't shrink past their content width without it.
2. **No overflow handler** — header lacks the Tier-2 `MoreHorizontal` overflow pattern already proven in `StatusBar.tsx` (HUD Tier 2/3 work).
3. **Bond pill collapse gate too generous** — pill keeps full layout (icon + bar + numbers) until it hits zero room rather than degrading earlier.
4. **Context pill not priority-ranked** — every header element treated as equal-priority instead of an explicit priority queue (character name highest, bond pill next, settings gear last to drop).

## Suggested Fix Direction

Two-step plan:

1. **Quick win (<1h):** Add `min-width: 0` + `text-overflow: ellipsis` to character-name and bond-pill text spans. Add `flex-shrink: 0` only to icon-only buttons.
2. **Real fix (~3h):** Apply HUD Tier 2 overflow pattern — at <1100px chat-column width, collapse settings gear + context pill + secondary header chrome into a `⋯` overflow popover. Bond pill stays visible but enters its compact-only mode.

Tier-2 reference: `frontends/sakura/src/components/StatusBar.tsx` lines around `MoreHorizontal` import — same pattern applied to bottom toolbar in commit `62923e4` (session 19).

## Related

- Session 21 next-task #3 (right-cluster `..` claim, since debunked) noted narrow-width header bugs as "layout bugs unrelated to overflow icon" — this is one of those layout bugs.
- HUD Tier 5 (sidebar consolidate) shipped session 22 (`badee27`) — header was deferred. This is the deferred work.
