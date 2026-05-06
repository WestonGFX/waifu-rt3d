# Memory Browser — Tab Strip Overflow + Close-on-Click

**Date filed:** 2026-05-06 (session 28)
**Severity:** P2
**Component:** `frontends/sakura/src/components/MemoryBrowser.tsx`
**Discovered via:** session 28 hands-on browser QA against Sakura @ localhost:5175

## Summary

The Memory Browser slide-in panel renders 4 tabs (Overview, About You, Memories, Journal) in a horizontal strip that overflows the panel's 480px width at typical viewports (1512×791 tested). At 1512w, "About You" right edge sits at x=1551, "Memories" at 1644, "Journal" at 1723 — all past the 1512px viewport right edge.

Clicking a partially-or-fully off-panel tab (in this run, "About You") collapses the panel rather than switching tab. Most plausible cause: the click lands on the backdrop `motion.div` (zIndex 40, `onClick={closeOverlay}`) because the tab button has overflowed past the panel container's clipping or zIndex region.

## Repro

1. Sakura @ localhost:5175, Rin (Akane) selected.
2. Click sidebar Brain "Memory" icon → panel opens, Overview tab content visible.
3. Click "About You" tab.
4. **Expected:** tab content switches to About You.
5. **Actual:** entire panel closes (backdrop fade + panel slide-out).

## Evidence

`elementFromPoint` at each tab's center returned `null` for ALL four tabs (Overview/About You/Memories/Journal) — meaning the points either fall past viewport (Memories x=1597, Journal x=1683 — both > 1512 viewport width) OR the tab button is not the topmost interactive element at its center coordinate.

```js
// Run inside Sakura DevTools console with Memory Browser open
[...document.querySelectorAll('button')]
  .filter(b => ['Overview','About You','Memories','Journal'].includes(b.textContent.trim()))
  .map(t => { const r = t.getBoundingClientRect();
              const el = document.elementFromPoint(r.left + r.width/2, r.top + r.height/2);
              return { label: t.textContent.trim(), rect: [r.left, r.top, r.right, r.bottom], topElTag: el?.tagName }; })
// → all tabs have topEl === undefined
```

Returned rects (1512×791 viewport):
| Tab | left | right | center x |
|---|---|---|---|
| Overview | 1363 | 1455 | 1409 |
| About You | 1455 | 1551 | 1503 |
| Memories | 1551 | 1644 | 1597 |
| Journal | 1644 | 1723 | 1683 |

Viewport width = 1512. Memories + Journal centers are off-screen.

## Probable Causes

1. **Tab strip lacks `overflow-x: auto` or `flex-wrap`** — fixed-width tabs flow past panel.
2. **Panel width math** — `width: 'min(480px, 92vw)'` gives 480px at 1512w, but actual rendered tab strip needs more like 360-400px AFTER padding/borders. Strip should fit, suggesting tab `min-width` or padding is wider than expected.
3. **Backdrop catches clicks** — backdrop is `position: fixed; inset: 0; zIndex: 40` and has `onClick={closeOverlay}`. Panel is `zIndex: 50`. When a tab overflows past panel right edge, it visually crosses the panel-defined zIndex region; clicks on the overflow region land on backdrop.

## Suggested Fix

Apply ONE of:
1. `overflow-x: auto` on tab strip container so off-panel tabs scroll, not overflow.
2. Reduce per-tab padding so 4 tabs fit cleanly in <440px (panel width minus chrome).
3. Change tab strip to a vertical accordion or dropdown when 4+ tabs present.
4. Stack the backdrop's onClick handler so it does NOT trigger when the click target is `.closest('[data-memory-browser-panel]')` — defensive guard.

Recommend (1) + (4) together: scrollable tab strip + click-target guard prevents both visual cutoff and accidental close.

## Related

- Pre-existing P3 BondPill bug filed session 27: `docs/bugs/2026-05-06-bondpill-xp-overshoots-level-threshold.md`
- Pre-existing P1: `docs/bugs/2026-05-06-character-relationships-duplicate-rows.md`
- MemoryBrowser test file (`frontends/sakura/src/test/MemoryBrowser.test.tsx`) currently passes 37/37 — Vitest does not catch this because it does not measure viewport-overflow geometry.
