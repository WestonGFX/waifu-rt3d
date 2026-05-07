# PRD: Header Overflow & Narrow-Width Reflow

**Effort:** ~6h calibrated AI-assisted (≈3 sessions, 2 phases) · **Priority:** P1 · **Status:** Draft
**Filed against:** `docs/bugs/2026-05-06-header-ui-occlusion-narrow-widths.md`
**Schema:** N/A (frontend-only, no DB changes)
**Depends on:** Nothing — `MoreHorizontal` overflow already shipped session 19 (`62923e4`); this PRD reuses that pattern.
**Discovered via:** Session 29 wave 2 browser QA sweep
**Files of record:** `frontends/sakura/src/components/StatusBar.tsx` (the actual "header" — file is misnamed for historical reasons), `frontends/sakura/src/components/BondPill.tsx`, `frontends/sakura/src/components/ContextBudgetPill.tsx`

> **Naming clarification.** The bug doc calls the affected component `AppHeader.tsx`. That file does not exist. The chat-column header (avatar + name + bond pill + right-cluster icons) is rendered by `StatusBar.tsx`, which mounts as a sticky `<header>` element at the top of the chat column. All path references below use the real filename. A rename is **out of scope** for this PRD — touching the component name without explicit approval would violate "no surprise refactors" in `CLAUDE.md`.

---

## 1. Problem & Goals

### Why (for Chris)

When a user opens the 3D viewer panel — the single most important feature differentiator we have — the chat column shrinks. Today, the moment that column drops below ~1100px, the very controls users need to *manage* their experience start visually overlapping. The bond XP text climbs on top of the settings gear. The context pill clips into the character's name.

Two things break here, and the second is the more painful one:

1. **Functional break.** The settings gear becomes physically un-clickable because the bond pill's text overlay sits on top of it. New users — the people most likely to need settings — can't reach the door. Their workaround today is "close the 3D panel," which means killing the feature they came for.
2. **Emotional break.** The character's name is the user's anchor — it's the visual representation of *who they're talking to*. When the name gets clipped or truncated by a context pill running over it, the connection feels cheap. The header chrome — accumulated organically across HUD Tier 1–5 work — has out-grown the row it lives in. The character's identity is the first casualty.

This is the top recurring complaint from QA sweep notes (sessions 19, 21, 22, 29). It is repeatedly deferred because the layout always *almost* works at the developer's window size (≥1280px). It does not work at the user's.

**Success looks like:** at every chat-column width ≥900px, every header control is reachable with a single click, the character's name is always at least partially legible, and no two pieces of chrome ever visually overlap. Below 900px we degrade gracefully — character name truncates with ellipsis, the right cluster collapses into the existing `⋯` overflow popover, but the user is never *blocked* from reaching settings.

### How (for the implementer)

| Layer | What's wrong today | What we change |
|---|---|---|
| Flex children | `min-width: 0` is missing on the name/bond container, so text refuses to shrink past content width and shoves siblings off-row | Add `min-width: 0` + `truncate` to the `flex-1` wrapper at `StatusBar.tsx:254` |
| Right cluster | 5 icon buttons (Search · ContextBudget · Settings · 3D · ⋯) all `flex-shrink: 0` with no breakpoint awareness | Introduce a single `useResizeObserver` against `<header>` and gate Search + ContextBudget into the existing `⋯` popover when width <1100px |
| BondPill | Renders at full 80px-bar + numeric XP triple even at 900px width | Pass a new `compact` prop, drop the inline progress bar and the "X to next" suffix at <1100px |
| Settings gear | Highest-priority control, currently same priority as everything else | Mark as priority-0 — never moves, never collapses, always visible |

### Goals

| ID | Goal | Acceptance |
|---|---|---|
| G1 | Settings gear reachable at all widths ≥900px | Click on gear bbox at 900/1000/1100/1280/1500px never lands on bond pill or context pill |
| G2 | Character name never visually clipped by a sibling | At 900–1500px the name's right edge is left of every right-cluster element |
| G3 | Bond pill stays visible | Even at 900px the pill shows `♥ Lv N · Tier · streak` (full layout returns ≥1100px) |
| G4 | No new chrome | Zero new visible icons, badges, or dividers — pure layout/overflow rewiring |
| G5 | Theme contract preserved | Visual diff at light + dark default themes shows zero CSS-var changes; spot-check 2 more themes (Cyberpunk, Pastel) |
| G6 | Layout reflow non-regression | `appStore.layoutMode` toggling and `modelPanelOpen` toggling still produce smooth transitions, no jank, no Framer-Motion exit warnings |

### Non-goals

- **Full header redesign.** No reordering, no new visual hierarchy, no "while we're here let's also…". This is a fix, not a refactor.
- **Renaming `StatusBar.tsx`.** It's misnamed (it's the chat header, not a status bar) but rename is a separate ticket.
- **Mobile/tablet breakpoints.** Desktop-only app per `CLAUDE.md`; do not add `<768px` rules.
- **Theme contract changes.** No new CSS vars, no hardcoded colors. Use what exists.
- **BondPill internal redesign.** We add a `compact` prop; we do *not* redesign the pill's layout, copy, or affordances.
- **`StatusBar` decomposition into smaller components.** Tempting given the file is 542 lines, but out of scope.
- **Width-aware behavior below 900px.** At <900px the existing `min-width: 0` + `truncate` should keep things from breaking, but we are not optimizing that case. Users running at <900px chat-column widths are an edge case.
- **Persisting overflow-popover open state.** It's transient UI; don't store in `appStore`.

---

## 2. User Stories

### US-1 — "I want to change voices while my character is on screen" (core flow)

Mei has the 3D viewer open because she likes seeing Aria's expressions. She wants to swap to a different TTS voice. She moves her cursor to the gear icon on the right side of the header — and her click lands on the bond XP text instead, which dismisses the bond detail popover but does *nothing* to open settings. She tries again. Same result. She closes the 3D panel, opens settings, makes the change, then reopens the 3D panel.

**With this PRD:** at her window's chat-column width (~1080px with viewer open), the bond pill is now in compact mode and the gear sits in its own un-overlapped slot. Click lands. Settings opens. The viewer stays up.

### US-2 — "Just let me see who I'm talking to" (quick-action variant)

Tomas has a narrow secondary monitor (1280×1024) and likes to dock the viewer panel taking ~40% of width. The chat column is 770px today and the character's name "Seraphina Velourie" gets clipped to "Seraphi…" — but the clipping happens because the time-of-day badge ("evening") and the AN badge sit *next to* the name without `min-width: 0`, so the name is pushed under the bond pill rather than truncating cleanly.

**With this PRD:** the name container is `min-width: 0` + `truncate`, so `Seraphi…` renders cleanly with an ellipsis, the AN/evening badges stay visible to the right of the truncated name, and nothing overlaps.

### US-3 — "I'm exporting a chat" (browse/manage variant)

Riku wants to export the conversation as Markdown. He can find Export today only because his window is at 1512px and everything fits. On his work laptop (1366×768), the `⋯` overflow icon is technically there but he never clicks it because Search + ContextBudget + Settings + 3D + `⋯` are all squashed against the right edge with the bond pill bleeding into them.

**With this PRD:** at 1366×768 with the viewer open, Search and ContextBudget have moved *into* the `⋯` popover (their secondary status). Settings and 3D-toggle stay visible. The right cluster is now Settings · 3D · `⋯`, and `⋯` contains: Search, ContextBudget, Chat threads, Export ×3, Soundscape, Models, version. Riku finds Export.

---

## 3. Feature Breakdown

### 3.1 Add `min-width: 0` to the flex-1 left container

**Why:** Without `min-width: 0`, a flex child's *content* (text, badges) refuses to shrink past their intrinsic width — they overflow the parent and shove siblings off-row. This is the single root cause of visible overlap. Quick win, ~5 minutes of edits, ~80% of the visible damage.

**How:**
- File: `frontends/sakura/src/components/StatusBar.tsx`
- Line 254: `<div className="flex-1 min-w-0">` — already has `min-w-0`. Verify it's actually applied (Tailwind class) — but this project does not use Tailwind (per `frontend-and-ui.md` rule), so `min-w-0` is currently a dead class. Replace with `style={{ flex: 1, minWidth: 0 }}`.
- Line 256: the `<span className="char-name-display truncate">` — `truncate` is also Tailwind. Replace with `style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}`.
- Line 255: the inner `<div className="flex items-center gap-2">` wrapping the name + badges — also needs `style={{ minWidth: 0 }}` so the name span actually receives the truncation signal.

This alone unblocks ~80% of the overlap. Ship it as Phase 1 even if Phase 2 slips.

### 3.2 BondPill `compact` prop

**Why:** The bond pill is the second-largest consumer of horizontal real estate (~280px at full layout). It contains six elements: heart icon, Lv N, separator, tier label, 80px progress bar, "X/Y XP · Z to next" string, optional streak chip, expand caret. At <1100px chat-column width, the progress bar and the "to next" suffix should fall away — the pill's *job* in the header is "remind the user the system is alive," not "communicate every numeric detail." Detailed XP lives in the expanded panel.

**How:**
- File: `frontends/sakura/src/components/BondPill.tsx:72-85` — add `compact?: boolean` to `BondPillProps`.
- Line 230-261: progress bar `<div role="progressbar">` — wrap in `{!compact && (...)}`.
- Line 263-274: the `{fmtXp(bondXp)}/{fmtXp(levelThreshold)} XP · {fmtXp(xpToNext)} to next` span — when `compact === true`, render only `Lv N` (already separate, line 224). Drop this span entirely in compact mode.
- Aria label (line 183): unchanged — full data still announced for screen readers regardless of visual compactness.
- Default `compact = false` so existing call site behavior is preserved.

**Compact-mode visual:** `♥ Lv 12 · Friend  🔥 5  ⌄`  (no bar, no XP numerics)
**Default (≥1100px):** `♥ Lv 12 · Friend ▰▰▰▱▱ 138/150 XP · 12 to next  🔥 5  ⌄`

### 3.3 Header width observer + breakpoint state

**Why:** We need to know when the *header element itself* drops below 1100px (or 900px) — not the window, not the viewport, the header. Window-based media queries fail because the chat column shrinks independent of window width when the 3D panel opens.

**How:**
- File: `frontends/sakura/src/components/StatusBar.tsx`
- Add a new `useRef<HTMLElement>` on the `<header>` element (line 213).
- Add a new `useResizeObserver` hook (or inline `ResizeObserver`) that updates a `headerWidth: number` state on size change.
- Throttle to `requestAnimationFrame` to avoid update storms during column drag.
- Derive two booleans: `isNarrow = headerWidth < 1100`, `isVeryNarrow = headerWidth < 900`.
- Pass `isNarrow` to BondPill as `compact={isNarrow}`.
- Use `isNarrow` to gate the Search button + `ContextBudgetPill` into the `⋯` overflow (see 3.4).

**Hook location:** Inline in `StatusBar.tsx` for now — do NOT extract to `hooks/useResizeObserver.ts` unless we need it in a second component. Premature abstraction.

```typescript
// In StatusBar component body:
const headerRef = useRef<HTMLElement>(null);
const [headerWidth, setHeaderWidth] = useState<number>(1500);

useEffect(() => {
  if (!headerRef.current) return;
  const ro = new ResizeObserver(entries => {
    const w = entries[0]?.contentRect.width;
    if (w !== undefined) {
      requestAnimationFrame(() => setHeaderWidth(w));
    }
  });
  ro.observe(headerRef.current);
  return () => ro.disconnect();
}, []);

const isNarrow = headerWidth < 1100;
```

### 3.4 Conditional collapse: Search + ContextBudget into `⋯` at narrow widths

**Why:** The right cluster has 5 icons. At narrow widths, only Settings (priority-0) and 3D-toggle (priority-1, contextual to the user's *current* viewing intent) need to stay visible. Search and ContextBudget are useful but recoverable from the `⋯` menu.

**How:**
- File: `frontends/sakura/src/components/StatusBar.tsx:300-318`
- Wrap Search button (300-304) and `<ContextBudgetPill>` (305-309) in `{!isNarrow && (...)}`.
- In the `⋯` popover JSX (354-456), prepend two new `<button role="menuitem">` entries when `isNarrow === true`:
  1. `Search size={14}` + label "Search messages" — onClick: close popover, open search bar (set `searchOpen = true`).
  2. A `Box size={14}` or similar + label showing the live context budget summary (e.g., "Context: 12.3k / 64k tokens · 19%"). Tap to open the existing context-budget detail flyout (today triggered by clicking the pill itself).
- ContextBudget-in-overflow needs the pill's existing fetch logic. Two options:
  - **(a)** Render the full `<ContextBudgetPill>` *inside* the popover. It still works as a click target; the visual nesting is fine because the popover is large.
  - **(b)** Extract a `useContextBudget(sessionId, messageCount)` hook from the pill and render a custom popover row. More work, cleaner.
  - **Pick (a)** for Phase 2. (b) is a Phase-3 cleanup if needed.

### 3.5 Pass `headerRef` to `<header>` element

**Why:** Trivial wiring, but call it out explicitly so it doesn't get missed.

**How:** `frontends/sakura/src/components/StatusBar.tsx:213` — change `<header className="sticky top-0 z-40"` to `<header ref={headerRef} className="sticky top-0 z-40"`. Note: `<header>` is an HTMLElement, not HTMLDivElement — confirm `useRef<HTMLElement>(null)` not `useRef<HTMLDivElement>(null)`.

---

## 4. UI Layout

### Width: 1500px (default desktop, viewer closed) — TODAY = TARGET (no visual change)

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ [🌸] Aria  ●  evening  AN     ♥ Lv 12 · Friend ▰▰▰▱▱ 138/150 XP · 12 to next  🔥 5  ⌄    [🔍][⚖][⚙][👁 3D][⋯] │
└────────────────────────────────────────────────────────────────────────────────────────────────────────┘
   ▲ avatar  ▲ name  ▲ time  ▲ AN     ▲────────── BondPill (full) ──────────▲          ▲ right cluster (full)
```

### Width: 1100px (viewer open, default window) — TARGET

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│ [🌸] Aria  ●  evening   ♥ Lv 12 · Friend  🔥 5  ⌄          [⚙][👁 3D][⋯]         │
└──────────────────────────────────────────────────────────────────────────────────┘
   ▲ avatar  ▲ name truncates if needed
                          ▲ BondPill compact (no bar, no XP numerics)
                                                              ▲ Search + ContextBudget moved into ⋯
```

### Width: 900px (viewer open, narrow window) — TARGET

```
┌─────────────────────────────────────────────────────────────────────┐
│ [🌸] Aria…  ●     ♥ Lv 12 · Friend  ⌄              [⚙][👁 3D][⋯]    │
└─────────────────────────────────────────────────────────────────────┘
   ▲ name truncated  ▲ time/AN badges may also collapse if needed
                       ▲ BondPill compact, streak chip dropped if no room
                                                       ▲ right cluster minimal
```

### `⋯` overflow popover (when narrow) — NEW ENTRIES at top

```
┌──────────────────────────────────┐
│  🔍 Search messages              │  ← NEW (only when isNarrow)
│  ⚖ Context: 12.3k / 64k · 19%    │  ← NEW (only when isNarrow)
│  ─────────────────               │
│  💬 Chat threads                 │
│  ⬇ Export as Text (.txt)         │
│  ⬇ Export as Markdown (.md)      │
│  ⬇ Export as JSON (.json)        │
│  🎵 Ambient sounds               │
│  📦 Models                       │
│  ─────────────────               │
│  v0.32.0                         │
└──────────────────────────────────┘
```

---

## 5. File Plan

### New Files

None. This PRD is intentionally surgical — all edits live in two existing components.

### Modified Files

| File | Change | Effort |
|---|---|---|
| `frontends/sakura/src/components/StatusBar.tsx` | Add `headerRef` + `ResizeObserver` + `isNarrow` derived state. Wrap Search button & ContextBudgetPill in `!isNarrow`. Inject Search + ContextBudget rows at top of `⋯` popover when `isNarrow`. Replace Tailwind `min-w-0` / `truncate` classes with inline styles. Pass `compact={isNarrow}` to `<BondPill>`. | ~2.5h |
| `frontends/sakura/src/components/BondPill.tsx` | Add `compact?: boolean` prop. Conditionally render progress bar + XP-numerics span. Default `false`. | ~0.5h |
| `frontends/sakura/src/test/StatusBar.headerOverflow.test.tsx` | **NEW** test file — see §8. | ~1.5h |
| `frontends/sakura/src/test/BondPill.compact.test.tsx` | **NEW** test file — see §8. | ~0.5h |

### Existing Code to Reuse

| Source | What | Why |
|---|---|---|
| `StatusBar.tsx:130-178` | Existing `⋯` overflow popover infrastructure: `overflowOpen` state, `overflowBtnRef`, `overflowDropRef`, outside-click handler | Same popover, just two more menu items prepended when `isNarrow` |
| `StatusBar.tsx:206-210` | `btnStyle(active)` helper for icon button styling | Reuse for new menu-item rows in popover |
| `BondPill.tsx:104-298` | Pill render structure | Don't redesign — just gate two child spans on `!compact` |
| `ContextBudgetPill.tsx` (whole component) | Self-contained budget pill with click-to-expand flyout | Render inside `⋯` popover row when `isNarrow` (option (a) in §3.4) |
| `frontends/sakura/src/components/StatusBar.tsx:62923e4` (HUD Tier 2 commit) | Pattern: 9 icons → 4 + `⋯`, with click-outside dismiss | This PRD is HUD Tier 2's *width-responsive* extension |
| `frontends/sakura/src/components/discovery/MoreToolsDropdown.tsx` (HUD Tier 5, `badee27`) | Sidebar overflow popover pattern | Reference only — sidebar uses a sibling component; we keep StatusBar's inline popover (less indirection) |

### Pattern Decisions

- **Why not extract a shared `<OverflowPopover>` component?** Tempting, but `StatusBar.tsx`'s popover and `MoreToolsDropdown.tsx`'s popover have diverged enough (different animations, different click-outside semantics) that a shared abstraction would have to be a feature-complete superset of both. Defer to a Phase-3 follow-up if the pattern emerges in a third place.
- **Why inline `ResizeObserver` instead of a `useResizeObserver` hook?** YAGNI. Single consumer. Two-line setup. If `BondPill` or any future component needs the same observer, *then* extract.
- **Why drop `compact` BondPill rather than auto-detecting inside BondPill?** Keep the component dumb — header decides what to show, pill renders. BondPill is also used in other contexts (StatusBar today, possibly elsewhere future); making it width-aware would couple it to a parent it shouldn't know about.

---

## 6. Implementation Order

### Phase 1: Quick Win — `min-width: 0` + ellipsis (≤45min calibrated)

Goal: kill 80% of the overlap before any Phase-2 work lands. This is the minimum-viable fix.

| Step | File | Action | Effort |
|---|---|---|---|
| 1.1 | `StatusBar.tsx:254` | Replace `className="flex-1 min-w-0"` with `style={{ flex: 1, minWidth: 0 }}` (Tailwind classes are dead in this project) | 5min |
| 1.2 | `StatusBar.tsx:255` | Add `style={{ minWidth: 0 }}` to inner `<div className="flex items-center gap-2">` so the name span receives shrink signal | 5min |
| 1.3 | `StatusBar.tsx:256` | Replace `className="char-name-display truncate"` with explicit ellipsis style: `overflow: hidden; textOverflow: ellipsis; whiteSpace: nowrap` (keep `char-name-display` if it's referenced in CSS — verify with grep) | 10min |
| 1.4 | Manual smoke | Resize Chrome window from 1500 → 900px with viewer open. Verify name truncates, no other element overlaps. | 10min |
| 1.5 | Commit | `fix(header): min-width:0 + ellipsis on chat header name container` | 5min |

**Phase 1 acceptance:** at 1100px width, name truncates cleanly. At 900px, name truncates further. **No element renders on top of another at any width ≥900px** — even if the right cluster still feels cramped, it's no longer broken.

If Phase 2 has to slip a session, Phase 1 alone is shippable.

### Phase 2: Real Fix — width-aware overflow + BondPill compact (~3.5h calibrated)

| Step | File | Action | Effort |
|---|---|---|---|
| 2.1 | `BondPill.tsx` | Add `compact?: boolean` to props, gate progress-bar + XP-numerics span on `!compact`. Default false. | 30min |
| 2.2 | `frontends/sakura/src/test/BondPill.compact.test.tsx` | NEW — Vitest: render with `compact={true}` and assert progress-bar / XP-numerics absent; render default and assert present. Pattern 4 (Framer Motion stub) required. | 30min |
| 2.3 | `StatusBar.tsx` | Add `headerRef`, `headerWidth` state, `ResizeObserver` effect with `requestAnimationFrame` throttle. Wire `headerRef` to `<header>` element. Derive `isNarrow`. | 45min |
| 2.4 | `StatusBar.tsx` | Pass `compact={isNarrow}` to `<BondPill>`. | 5min |
| 2.5 | `StatusBar.tsx` | Wrap Search button + `<ContextBudgetPill>` in `{!isNarrow && (...)}`. | 15min |
| 2.6 | `StatusBar.tsx` | Inject conditional menu items at top of `⋯` popover when `isNarrow`: Search row + ContextBudgetPill row. Add a `<div>` separator between them and the existing items. | 45min |
| 2.7 | `frontends/sakura/src/test/StatusBar.headerOverflow.test.tsx` | NEW — Vitest: mock `ResizeObserver`, assert at simulated 900/1100/1500 widths the right elements render or hide. Pattern 4 required. | 1h |
| 2.8 | TSC + Vitest gate | `npx tsc --project tsconfig.app.json --noEmit` and `npx vitest run` | 10min |
| 2.9 | Manual: 4 themes × 3 widths | Default-light, Default-dark, Cyberpunk, Pastel × 900/1100/1500. Screenshot evidence. | 30min |
| 2.10 | Commit | `fix(header): width-responsive overflow — collapse Search/ContextBudget into ⋯ at <1100px` | 5min |

### Phase 3: Optional polish (deferred, ~1.5h calibrated, only if Phase 2 reveals gaps)

- **3a** Extract `useResizeObserver` hook if a third call site emerges
- **3b** Animate compact-mode transition with Framer Motion (currently a hard cut at the threshold) — only if the visual pop is jarring
- **3c** Make the `<header>` width breakpoints configurable via `appStore` (probably YAGNI)

**Do not implement Phase 3 in the same PR as Phase 1+2.** Ship Phase 1+2, then evaluate.

### Total calibrated: ~4.5h for Phases 1+2. The "≤6h" budget at the top of this doc includes a 1h buffer for theme spot-checking + browser QA + commit hygiene.

---

## 7. Edge Cases & Risks

| Risk | Severity | Mitigation |
|---|---|---|
| **Column resize / layout reflow regression** (Known Sensitive Area — 10+ regressions) | High | (a) Phase 1 is no-op for `flex-1` children that already fit, (b) test BOTH viewer-open and viewer-closed states at 4+ widths, (c) only one `ResizeObserver` consumer added, throttled with `rAF`, no synchronous layout writes inside the callback |
| `ResizeObserver` infinite loop ("ResizeObserver loop limit exceeded" warning) | Medium | Wrap setState in `requestAnimationFrame` (3.3 spec); state update is gated by a `<` comparison so identical widths don't re-render. Confirmed safe in `frontend-and-ui.md` testing patterns |
| Theme regression — text-color / background-mix at narrow widths exposes hardcoded colors | Medium | All edits use `var(--color-*)` only; no new CSS-vars introduced. Spot-check 4 themes (1 default light, 1 default dark, Cyberpunk dark, Pastel light) at each breakpoint |
| BondPill `compact` mode breaks existing aria-label or screen-reader behavior | Medium | `collapsedAriaLabel` (BondPill.tsx:183) is unchanged — full data still announced. Visual compaction does not affect SR experience |
| User has bond pill expanded when width drops to narrow → expanded panel wider than collapsed pill | Low | Expanded panel is `position: absolute` (BondPill.tsx:341) — already detached from layout flow. No change needed |
| `StatusBar.tsx` is 542 lines and adding more risks tipping it past where it's still readable | Low | We add ~30 LOC net. Does not push past the project's implicit "decompose past 800-1000 lines" trigger |
| Tailwind class removals (`min-w-0`, `truncate`) reveal *other* dead Tailwind classes used elsewhere | Low | Out of scope for this PRD. File a separate cleanup issue if grep finds > 5 dead Tailwind classes in `StatusBar.tsx` |
| Search bar opens correctly when triggered from inside `⋯` popover (race between popover-close and input-focus) | Low | `setOverflowOpen(false)` then `toggleSearch()` — the existing `setTimeout(..., 50)` for `searchInputRef.current?.focus()` already handles this delay (StatusBar.tsx:197) |
| `ContextBudgetPill` rendered inside popover doesn't receive layout space its flyout expects | Low | Popover has `position: absolute` + plenty of width (`minWidth: 220`). If pill flyout looks broken, fall back to option (b) in §3.4 (extract hook) |
| Time-of-day badge + AN badge become the new overflowing element at very narrow widths | Low | Both have `flex-shrink: 0` already — they'll push *outside* the name container's `min-width: 0` boundary cleanly. If they overflow the row, they wrap to a second row, which is acceptable per `min-h-14` allowing growth |
| User has multiple monitors with different DPIs and `ResizeObserver` fires during window-drag-between-screens | Low | `rAF`-throttled callback handles this naturally. Confirmed by the existing pattern in `BondPill.tsx` `useEffect` |

---

## 8. Verification

### Automated

**New tests:**

1. `frontends/sakura/src/test/BondPill.compact.test.tsx` — Pattern 4 (Framer Motion stub).
   - `it('renders progress bar and XP numerics by default')` — assert `role="progressbar"` present, "XP" text present.
   - `it('hides progress bar and XP numerics when compact={true}')` — same selectors, assert absent.
   - `it('preserves aria-label in compact mode')` — assert `collapsedAriaLabel` text contains "Bond level" and "to next level".

2. `frontends/sakura/src/test/StatusBar.headerOverflow.test.tsx` — Pattern 4 + custom ResizeObserver mock.
   - Mock `ResizeObserver` at top of file: `globalThis.ResizeObserver = class { observe(){} unobserve(){} disconnect(){} };`
   - `it('renders Search and ContextBudgetPill in right cluster at default width')` — render with `headerWidth=1500`, assert both visible.
   - `it('hides Search and ContextBudgetPill when isNarrow')` — render with simulated narrow width, assert not in document.
   - `it('shows Search row inside overflow popover when narrow')` — open `⋯`, assert "Search messages" text inside menu.
   - `it('passes compact prop to BondPill at narrow width')` — spy on `BondPill` mock, assert called with `compact={true}`.

**Trigger-width simulation:** Mock the `ResizeObserver` such that the effect runs synchronously with a configurable width. The simplest way: stub the global `ResizeObserver` with a class that captures the callback, then call it directly in the test via `act()` with a fake `entries` array.

**Smoke gates:**
```bash
cd /Users/chris/Code/waifu-rt3d/frontends/sakura && npx tsc --project tsconfig.app.json --noEmit
cd /Users/chris/Code/waifu-rt3d/frontends/sakura && npx vitest run
```

Both must pass before claiming done. Per `CLAUDE.md` Smoke Test rule, also run backend pytest before final commit:
```bash
.venv/bin/python -m pytest backend/tests/ -q --tb=line
```

### Manual checklist (Browser at Chrome 121+, Sakura `npx vite --port 5175`)

| # | Step | Pass criterion |
|---|---|---|
| 1 | Open Sakura at 1500×900. Default theme. Aria character. | Header looks identical to today (no regression at default width) |
| 2 | Open 3D viewer panel. | Chat column shrinks. Bond pill enters compact mode. Search + ContextBudget icons disappear from right cluster. |
| 3 | Click `⋯`. | Popover shows Search + ContextBudget rows at top, separator, then existing rows. |
| 4 | Click "Search messages" inside popover. | Popover closes, search bar slides down, input focused. |
| 5 | Click `⋯` again. Click ContextBudget row. | ContextBudget flyout opens (or pill behaves as it does at default width). |
| 6 | Resize Chrome window from 1500 → 900px in continuous drag. | No flicker, no jank, no console errors. Bond pill smoothly transitions to compact (acceptable to be a hard cut for v1). |
| 7 | Switch to dark default theme (Slate Dark). Repeat #1-6. | Visual identical contract — no hardcoded colors visible. |
| 8 | Switch to Cyberpunk theme. At 1100px width with viewer open, screenshot. | Compare to a 1500px screenshot — only layout differs, no theme color regressions. |
| 9 | Switch to Pastel theme (light). Same. | Same. |
| 10 | At 900px, click Settings gear directly. | Settings overlay opens. Click does not land on bond pill. |
| 11 | At 900px, click 3D toggle. | Viewer closes. Click does not land on bond pill. |
| 12 | At 900px, expand bond pill (click on it). | Detail panel appears below pill, does not visually collide with right-cluster icons. |
| 13 | At 900px, change `appStore.layoutMode` (toggle in app, e.g. via keyboard shortcut if exists). | Header reflows; `ResizeObserver` fires; no error. |
| 14 | TypeScript: `npx tsc --noEmit` | Clean |
| 15 | Vitest: `npx vitest run` | All tests pass including 2 new files |

### Theme matrix (minimum)

| Theme | 1500px | 1100px | 900px |
|---|---|---|---|
| Default Light | ✓ | ✓ | ✓ |
| Default Dark (Slate) | ✓ | ✓ | ✓ |
| Cyberpunk Dark | ✓ | ✓ | ✓ |
| Pastel Light | ✓ | ✓ | ✓ |

12 screenshots minimum; attach to PR.

---

## 9. Out of Scope (Explicit)

This PRD does **not** cover:

- **Renaming `StatusBar.tsx` to `ChatHeader.tsx`** — separate ticket, requires App.tsx import audit. Worth doing but not here.
- **Decomposing `StatusBar.tsx` into smaller files** — file is 542 lines, manageable.
- **Full header redesign** — no new visual hierarchy, no new color treatments, no new affordances.
- **Mobile/tablet breakpoints** — desktop-only app per `CLAUDE.md`.
- **Theme contract changes / new CSS vars** — uses only existing vars.
- **BondPill internal redesign** — only adds a `compact` prop; visual content unchanged.
- **`appStore` schema changes** — header overflow state is transient, lives in component.
- **Persistence of overflow popover state** — opens/closes per-session.
- **Width-aware behavior below 900px** — gracefully degrades but is not the design target.
- **Animation polish on compact-mode transition** — Phase 3 if desired.
- **Extracting a shared `<OverflowPopover>` abstraction** — premature.
- **Search-scope toggle UI changes** — the inline scope toggle (StatusBar.tsx:482-536) is unaffected.
- **Deletion of dead Tailwind classes elsewhere in the codebase** — separate audit.

---

## 10. Research & Documentation References

- Bug doc: `/Users/chris/Code/waifu-rt3d/docs/bugs/2026-05-06-header-ui-occlusion-narrow-widths.md`
- HUD Tier 2 baseline (overflow pattern): commit `62923e4`, file `frontends/sakura/src/components/StatusBar.tsx`
- HUD Tier 5 sibling pattern: commit `badee27`, file `frontends/sakura/src/components/discovery/MoreToolsDropdown.tsx`
- BondPill spec: `frontends/sakura/src/components/BondPill.tsx:91-103` (component docstring)
- Frontend rules: `/Users/chris/Code/waifu-rt3d/.claude/rules/frontend-and-ui.md`
- Testing conventions: `/Users/chris/Code/waifu-rt3d/.claude/rules/testing-conventions.md` (Patterns 1–7, especially Pattern 4 for Framer Motion stub)
- Sensitive Area policy: `CLAUDE.md` § Known Sensitive Areas — "Column resize / layout reflow"
- Estimation framework: user feedback `feedback_estimation_framework.md` (calibrated AI-assisted hours, 3-tier ranges)

## 11. Commit Plan

Two atomic commits, one per phase. Use conventional-commit prefix.

```
fix(header): min-width:0 + ellipsis on chat header name container

- Replace dead Tailwind utility classes (min-w-0, truncate) with
  inline styles in StatusBar.tsx left container so the character
  name actually shrinks at narrow widths instead of overflowing
  and pushing the right cluster off-row.
- Quick win for the P1 occlusion bug filed 2026-05-06; Phase 2
  (width-aware overflow popover) is a separate commit.
```

```
fix(header): width-responsive overflow — collapse Search/ContextBudget into ⋯ at <1100px

- Add ResizeObserver to <header> + isNarrow derived state.
- BondPill gains compact prop; drops progress bar + XP numerics
  at narrow widths, keeps ♥ Lv N · Tier · streak.
- Search button and ContextBudgetPill move into the ⋯ overflow
  popover when isNarrow; Settings gear and 3D toggle stay
  visible at all widths ≥900px.
- Adds 2 Vitest files: BondPill.compact, StatusBar.headerOverflow.
- Settings gear is now reachable at all chat-column widths
  ≥900px even with the 3D viewer open. Resolves P1 occlusion
  bug filed 2026-05-06.
```

(NEVER add `Co-Authored-By: Claude` per user preference.)
