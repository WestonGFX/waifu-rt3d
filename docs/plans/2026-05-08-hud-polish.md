# PRD: HUD/UI Polish — Tiers 6, 7 + Power Features

**Date:** 2026-05-08
**Status:** Draft — ready for /go
**Effort:** ~15–20h AI-assisted (~125–165h human-equivalent, per 12× time-tracking convention)
**Priority:** High (daily-pain driver per session 38/39 context)
**Depends on:** No schema changes. No open PRs in conflict.
**Parent plan:** `docs/plans/2026-04-27-hud-redesign-staged.md`

---

## 1. Context

### HUD Evolution to Date

The original HUD bug (`docs/bugs/2026-04-27-hud-cramped-overcrowded.md`) counted ~45 interactive elements visible simultaneously during normal chat. Six tiers of remediation have shipped across sessions 18–22 and 29:

| Tier | What shipped | When |
|---|---|---|
| Tier 0 | Audit (`docs/research/2026-04-27-hud-element-audit.md`) | Session 18 |
| Tier 1 | 5 free deletes: ContextBudgetPill→StatusBar, `Next:` tooltip, TemperatureMeter, duplicate viewer Close, stale hint label | Session 19 |
| Tier 2 | Top toolbar: 9 icons → 4 visible + `⋯` overflow popover (chat-threads, export, soundscape, model-browser) | Session 19–20 |
| Tier 3 | Chat-area toolbar: 8 elements → `⚙ Modes` popover + segmented status pill (confirmed in `ChatThread.tsx:1218`) | Session 21 |
| Tier 4 | Bond strip: multi-row block → single `BondPill` click-to-expand (confirmed in `StatusBar.tsx:300`) | Session 21 |
| Tier 5 | Sidebar bottom: 6 icons → Memory + Lore always-visible + `⋯ More` popover (Games/Stats/Ctx) | Session 22 |
| Session 38/39 | Removed 9 bloat overlays: universes, relweb, moodboard, portfolio, arena, memorialscene, bondstory, schedule, games | Session 38/39 |

### What Tier 6+ Pain Remains

After all of the above, the 3D viewer panel is the single biggest remaining chrome problem. When `ModelPanel` is open, the user sees: 6 camera preset buttons always visible (Full/Bust/Face/3/4/Side/Low) + custom camera slots + EffectsPanel + AnimationBrowser + close/photo/models controls — easily 15+ interactive elements over the avatar. The avatar is supposed to be the focus. Controls should appear on hover, not all at once.

The density escape hatch (Tier 7) is a quick win that requires almost no viewer work and delivers a `Minimal` mode users can reach via a single keyboard shortcut. It pairs well with Tier 6.

Two power features are also worth shipping in this plan: a **Command Palette** (Cmd+K) that makes deep navigation instant, and a **hotkey cheatsheet** (Cmd+?) that surfaces the keymap on demand. Both are high leverage / low risk because `useKeyboardShortcuts` already exists at `frontends/sakura/src/hooks/useKeyboardShortcuts.ts:46` and all infrastructure is wired.

Session 38/39 removed the bloat overlays, reducing the overall surface area meaningfully — but none of that touched the viewer chrome or the density system.

### Non-Goals

- Tier 8 (full information-architecture redesign) — deferred indefinitely; Tiers 0–6 are sufficient without a structural rethink.
- Moving bond display to the sidebar — Tier 8 territory, out of scope.
- Drag-to-rearrange / layout presets — high engineering cost, low daily pain relief; skip.
- Theme picker in StatusBar — Settings → Appearance is one click away; the picker doesn't need promotion.
- Auto-hide chrome during idle (mouse-still 5s → fade) — cute but conflicts with the no-surprise-UI rule; skip.
- Onboarding hint system — not needed for personal use.
- Mobile / swipe gestures — desktop-only app per `feedback_desktop_only.md`.

---

## 2. Locked Decisions

| # | Decision | Resolution | Rationale |
|---|---|---|---|
| 1 | Tier 6: viewer overlay rethink | **SHIP** | Biggest remaining daily pain. 15+ controls over the avatar. |
| 2 | Tier 7: density toggle | **SHIP (simplified)** | Ship 2 levels (Cozy = current, Minimal = aggressive hide) instead of the 3-level original. The third level ("Standard") is between the two and adds UI complexity without adding value for personal use. |
| 3 | Tier 8: full IA redesign | **DROP** | Tiers 0–6 are sufficient. Re-evaluate only if Tier 6 doesn't relieve viewer frustration. |
| 4 | Command palette (Cmd+K) | **SHIP** | Power-user daily win. `useKeyboardShortcuts` infrastructure already exists. Avoids deep-menu hunting for overlays. |
| 5 | Hotkey cheatsheet (Cmd+?) | **SHIP** | Low effort — render the existing `shortcuts` array as a modal. Zero new state. |
| 6 | Drag-to-rearrange panels | **DROP** | Engineering cost is high (~2–3d), daily benefit is low for a solo user with established muscle memory. |
| 7 | Theme quick-switch in StatusBar | **DROP** | Settings overlay is one click (Settings button in StatusBar). No promotion needed. |
| 8 | Auto-hide chrome on idle | **DROP** | Violates no-surprise-UI rule. Mouse-activated UI creates frustration when controls vanish mid-interaction. |
| 9 | Minimal mode (full-screen avatar, hide all chrome) | **FOLD INTO TIER 7** | The `Minimal` density level IS this feature. No separate implementation. |

---

## 3. UI Layout — Current Viewer Panel (pain state)

```
┌─────────────────────────────────────────────────────────┐
│ [ModelPanel open — right panel]                         │
│                                                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │  [Full][Bust][Face][3/4][Side][Low]   ← 6 btns  │   │
│  │  [View1][View2][View3]  [+ Save] [× del]         │   │
│  │         ← custom cameras                         │   │
│  │                                                  │   │
│  │      ╔══════════════════════════════╗            │   │
│  │      ║                              ║            │   │
│  │      ║         AVATAR               ║            │   │
│  │      ║                              ║            │   │
│  │      ╚══════════════════════════════╝            │   │
│  │                                                  │   │
│  │  [Spring][VFX][Anim]  ← 3 always-open sections  │   │
│  │  [Models][Photo][Close]  ← bottom bar            │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

## 4. UI Layout — After Tier 6

```
┌─────────────────────────────────────────────────────────┐
│ [ModelPanel open — right panel, post Tier 6]            │
│                                                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │                                                  │   │
│  │      ╔══════════════════════════════╗            │   │
│  │      ║                              ║    [📷]←   │   │
│  │      ║         AVATAR               ║    hover   │   │
│  │      ║   (camera HUD fades on       ║    only    │   │
│  │      ║    canvas hover)             ║            │   │
│  │      ╚══════════════════════════════╝            │   │
│  │                                                  │   │
│  │  [⚙] [Models] [Photo] [×]  ← bottom bar (4)    │   │
│  │  Hover [⚙] → Spring/VFX/Anim collapsed popover  │   │
│  │  Hover [📷] → preset bar slides in              │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

## 5. UI Layout — Command Palette (Cmd+K)

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│         ┌──────────────────────────────────┐           │
│         │  > memory_____________________   │           │
│         ├──────────────────────────────────┤           │
│         │  Memory Browser        Ctrl+M    │           │
│         │  Lorebook              Ctrl+L    │           │
│         │  Settings              Ctrl+,    │           │
│         │  Gallery               ...       │           │
│         │  3D Viewer             Ctrl+3    │           │
│         └──────────────────────────────────┘           │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## 6. Phase A — Viewer Panel Tier 6 (highest daily leverage)

**Why.** Every time the user opens the 3D viewer, 15+ controls crowd the avatar. The character is the point of the app — the controls should disappear and let her breathe. This is the same principle that drove Tiers 1–5 but applied to the one remaining zone that never got cleaned up.

**How.**

### Goal
Camera preset strip: always-visible → hover/click triggered floating bar. Advanced panels (Spring Bones, VFX, Anim Browser): collapsed by default → single `⚙` button. Bottom bar: keep Models, Photo, Close (3 actions) — these are primary, not secondary.

### File changes

**`frontends/sakura/src/components/ModelPanel.tsx`**

1. Camera preset strip (currently lines ~890–930, always rendered when `vrmUrl && vrmLoadState === 'loaded' && controlsVisible`):
   - Replace `controlsVisible` guard with `cameraBarOpen` local state (`useState(false)`).
   - Add a floating `📷` button in the top-right corner of the viewer canvas area (absolute positioned, `zIndex: 20`, `opacity: controlsVisible ? 1 : 0`, fades in on canvas hover via the existing `controlsVisible` pattern).
   - `onClick={() => setCameraBarOpen(o => !o)}`. When `cameraBarOpen`, render the 6-preset strip below the camera button (not at the bottom, which crowds the avatar — top corner keeps it out of the way). The strip uses the same existing button styles (`var(--color-accent-soft)`, `var(--color-accent)`). Close on outside click or Esc.
   - Custom cameras (save/load/delete) move into the same panel, accessible from the `📷` button area.

2. Advanced panels (EffectsPanel + AnimationBrowser, currently at lines ~1144–1149, always rendered inline):
   - Both are currently `isOpen={modelPanelOpen}` always-rendered. Add a local `advancedOpen` state (`useState(false)`).
   - Replace the always-expanded inline rendering with a `⚙ Advanced` button in the bottom bar.
   - Clicking `⚙ Advanced` toggles `advancedOpen`. When open, render both panels in a slide-up sheet (Framer Motion `y: '100%' → 0` on the panel container, using `AnimatePresence`). The sheet sits inside the `ModelPanel` container with `position: absolute; bottom: 48px; left: 0; right: 0`.
   - The slide-up sheet must not cover the bottom action bar (40–48px height).

3. Bottom bar consolidation: currently Models, Photo, Close buttons exist but are interspersed. Move to a fixed bottom bar with exactly 4 buttons: `[📷 Camera] [⚙ Advanced] [Models] [Photo]`. The "Back to Chat" / Close button moves to the existing StatusBar `⋯` overflow (it already has a "Back" entry) — or keep it as a small `×` at top-right of the panel, not in the bottom bar.

4. `controlsVisible` (existing hover fade for the camera-HUD in `viewer.html`) — no change needed; that `#camera-hud` element already fades via CSS transition. The new `📷` button inherits the same `controlsVisible` opacity.

**`frontends/sakura/src/components/EffectsPanel.tsx`** — no structural changes. Its `isOpen` prop now comes from `advancedOpen` rather than `modelPanelOpen`. Existing component is untouched.

**`frontends/sakura/src/components/AnimationBrowser.tsx`** — same as above. `isOpen` prop source changes only.

### Verification

```bash
# TypeScript clean — no new props without type updates
cd /Users/chris/Code/waifu-rt3d/frontends/sakura && npx tsc --project tsconfig.app.json --noEmit

# All existing tests pass — ModelPanel has no dedicated Vitest suite,
# but appStore and chatStore tests must still pass
cd /Users/chris/Code/waifu-rt3d/frontends/sakura && npx vitest run
```

Manual checklist:
- Open viewer → avatar visible immediately, no preset bar visible
- Hover canvas → `📷` button fades in (top-right corner)
- Click `📷` → preset bar appears; click a preset → camera moves; preset bar closes on outside click
- Click `⚙ Advanced` → EffectsPanel + AnimationBrowser slide up; click again → slide down
- Verify bottom bar has exactly 4 buttons
- Verify 1 light theme (sakura-dawn) + 1 dark theme (tokyo-night) — buttons use `var(--color-*)` tokens only

**Effort:** 4–6h AI-assisted

---

## 7. Phase B — Density Toggle Tier 7 (escape hatch)

**Why.** Two levels: Cozy (current post-Tier-6 state) and Minimal (avatar + chat input only). Minimal is the full-screen avatar mode that was always implicit in the design but never shipped. It also doubles as the "HUD mode for desktop pet" noted in memory. Activated by keyboard shortcut.

**How.**

### Goal
Add `'minimal'` to `LayoutMode` in `appStore.ts`. In `Minimal` mode: hide StatusBar toolbar buttons (keep only character name + BondPill), hide the chat-area `⚙ Modes` toolbar row, hide the sidebar bottom toolbar. In `Cozy` mode: current behavior after Tier 6. Store persists via the existing `persist` middleware.

The toggle is Cmd+Shift+M (not already registered — verified by grep of `useKeyboardShortcuts` registrations in `App.tsx`).

### File changes

**`frontends/sakura/src/stores/appStore.ts`**

- Line 19: extend `LayoutMode` type: `'normal' | 'compact' | 'mobile' | 'minimal'`
- Add `toggleMinimalMode: () => void` to the store interface and implementation:
  ```typescript
  toggleMinimalMode: () => {
    const { layoutMode, setLayoutMode } = get();
    setLayoutMode(layoutMode === 'minimal' ? 'normal' : 'minimal');
  },
  ```
- The existing `persist` middleware already serializes `layoutMode` — no migration needed.

**`frontends/sakura/src/components/StatusBar.tsx`**

- Read `layoutMode` from `useAppStore()` alongside existing destructured values.
- Gate the right-cluster buttons (Search, ContextBudgetPill, Settings, 3D, `⋯`) behind `layoutMode !== 'minimal'`. Character name, online dot, BondPill remain always-visible.
- Gate: wrap in `{layoutMode !== 'minimal' && (<>...</>)}` — no layout reflow risk, the `flex-1` on the name column expands to fill the space.

**`frontends/sakura/src/views/ChatThread.tsx`**

- Read `layoutMode` from `useAppStore()`.
- Gate the `⚙ Modes` toolbar row (currently around line 1218) behind `layoutMode !== 'minimal'`.
- The composer text input + send button are never hidden (user needs to type).

**`frontends/sakura/src/components/Sidebar.tsx`**

- Read `layoutMode` from `useAppStore()`.
- Gate the bottom toolbar (`<div style={{ borderTop: '1px solid var(--color-border-subtle)' }}>`, around line 332) behind `layoutMode !== 'minimal'`. The sidebar nav (character list, section switcher) remains visible.

**`frontends/sakura/src/App.tsx`**

- Add `Cmd+Shift+M` to the `shortcuts` array passed to `useKeyboardShortcuts` (line ~308):
  ```typescript
  {
    key: 'ctrl+shift+m',
    action: () => useAppStore.getState().toggleMinimalMode(),
    description: 'Toggle Minimal mode (hide UI chrome)',
  },
  ```
  Note: `useKeyboardShortcuts` normalizes `Meta` → `ctrl` (line 20 of hook), so `Cmd+Shift+M` on Mac maps to `ctrl+shift+m`.

**`frontends/sakura/src/views/SettingsView.tsx`**

- Add a `HUD Density` control in Settings → Appearance (wherever `layoutMode` is currently surfaced). Two options: `Cozy (default)` and `Minimal (hide toolbar chrome)`. Wire to `setLayoutMode`. Keep it simple — a 2-button segmented control, not a dropdown.

### Verification

```bash
cd /Users/chris/Code/waifu-rt3d/frontends/sakura && npx tsc --project tsconfig.app.json --noEmit
cd /Users/chris/Code/waifu-rt3d/frontends/sakura && npx vitest run
```

Manual checklist:
- Press Cmd+Shift+M → StatusBar toolbar buttons vanish; BondPill + character name remain
- Press Cmd+Shift+M again → toolbar buttons reappear
- Verify in sakura-dawn (light) and tokyo-night (dark) — no layout jump when buttons toggle
- Verify composer is always visible in Minimal mode
- Verify Settings → Appearance shows HUD Density selector and persists across app restart

**Effort:** 2–3h AI-assisted

---

## 8. Phase C — Command Palette (Cmd+K)

**Why.** The app now has 20+ overlays and features buried at varying depths. A command palette lets the user navigate to any feature in 2 keystrokes instead of 3–5 clicks. This is the highest-leverage navigation improvement possible without touching any existing layout.

**How.**

### Goal
Cmd+K opens a floating search palette. The user types to filter a list of named actions (open overlay, toggle feature, change character). Selecting an action fires it. Close on Esc or outside click.

### File changes

**`frontends/sakura/src/components/CommandPalette.tsx`** — NEW

```typescript
interface CommandEntry {
  /** Display label shown in the palette. */
  label: string;
  /** Optional keyboard shortcut shown on the right. */
  shortcut?: string;
  /** The action to execute when selected. */
  action: () => void;
  /** Optional group for visual separation (e.g. "Navigation", "Character"). */
  group?: string;
}

interface CommandPaletteProps {
  /** Controlled: whether the palette is visible. */
  open: boolean;
  /** Called when the palette should close. */
  onClose: () => void;
}

/**
 * Fuzzy-search command palette activated by Cmd+K.
 * Renders as a centered modal over all content (zIndex 300).
 * Framer Motion spring entry (y: -12 → 0, opacity 0 → 1).
 * Keyboard: ArrowUp/Down navigate selection, Enter fires action, Esc closes.
 *
 * @example
 * <AnimatePresence>
 *   {paletteOpen && <CommandPalette open onClose={() => setPaletteOpen(false)} />}
 * </AnimatePresence>
 */
export function CommandPalette({ open, onClose }: CommandPaletteProps): JSX.Element
```

Implementation notes:
- Palette builds its command list by calling `useAppStore` for `openOverlay`, `toggleModelPanel`, character list, etc. All actions are closures.
- Command list is defined as a static array inside the component (no separate registry needed at this scale — 20–30 entries).
- Filter: `label.toLowerCase().includes(query.toLowerCase())` — no fuzzy library needed.
- Groups: `Navigation` (Memory, Lore, Settings, Gallery, etc.), `Viewer` (Open 3D, presets), `Character` (switch to character N), `Mode` (toggle Minimal, toggle Director, etc.).
- Visual: 560px max-width, centered horizontally, positioned at `top: 20vh`. Input at top, results list below (max 8 visible, scrollable). Each row: label left + shortcut right (`var(--color-text-tertiary)`). Selected row background: `var(--color-accent-soft)`.
- zIndex: 300 (above all overlays at 260, below nothing that matters for a palette).
- Uses `var(--color-surface)`, `var(--color-border)`, `var(--color-text-primary)` — no hardcoded colors.

**`frontends/sakura/src/App.tsx`**

- Add `const [paletteOpen, setPaletteOpen] = useState(false)`.
- Add `Cmd+K` shortcut to `shortcuts` array: `{ key: 'ctrl+k', action: () => setPaletteOpen(true), description: 'Open command palette' }`.
- Render `<AnimatePresence>{paletteOpen && <CommandPalette open onClose={() => setPaletteOpen(false)} />}</AnimatePresence>` in the `App` return, after all other overlays.

**`frontends/sakura/src/test/CommandPalette.test.tsx`** — NEW

Pattern 4 (Framer Motion stub). Tests:
- Renders input field when `open`
- Filters results when user types (mock `useAppStore`)
- Arrow keys navigate selection
- Enter fires the selected action and calls `onClose`
- Esc calls `onClose`
- Does not render when `open` is false

### Verification

```bash
cd /Users/chris/Code/waifu-rt3d/frontends/sakura && npx tsc --project tsconfig.app.json --noEmit
cd /Users/chris/Code/waifu-rt3d/frontends/sakura && npx vitest run src/test/CommandPalette.test.tsx
```

Manual checklist:
- Press Cmd+K → palette opens with empty search, all commands listed
- Type "mem" → "Memory Browser" appears; Enter → Memory Browser overlay opens; palette closes
- Type "char" → character-switch commands appear; select Rin → character changes
- Esc → palette closes
- Verify in sakura-dawn + tokyo-night — backdrop + palette surface render correctly

**Effort:** 4–5h AI-assisted

---

## 9. Phase D — Hotkey Cheatsheet (Cmd+?)

**Why.** The app has 30+ registered shortcuts and no in-app way to discover them. Cmd+? is a universal "show me the keys" convention. Implementation cost is near zero because `useKeyboardShortcuts` already receives a `shortcuts` array with `description` fields.

**How.**

### Goal
Cmd+? opens a read-only overlay listing all registered shortcuts, grouped by zone. The overlay is a simple modal, not a new Zustand overlay type — it lives as local state in `App.tsx`.

### File changes

**`frontends/sakura/src/components/HotkeySheet.tsx`** — NEW

```typescript
interface HotkeySheetProps {
  /** All registered shortcuts from the App-level useKeyboardShortcuts call. */
  shortcuts: Array<{ key: string; description: string }>;
  onClose: () => void;
}

/**
 * Read-only cheatsheet of all registered keyboard shortcuts.
 * Groups are inferred from description prefix (e.g., "Open ...", "Toggle ...", "Focus ...").
 * Framer Motion: fade + slight scale (0.97 → 1).
 * zIndex: 310 (above CommandPalette at 300).
 */
export function HotkeySheet({ shortcuts, onClose }: HotkeySheetProps): JSX.Element
```

Implementation notes:
- Two-column grid: `key` (rendered as styled `<kbd>` elements using `var(--color-border)` background) + `description`.
- Close on Esc or click-outside. No click-inside action.
- Pass the `shortcuts` array from `App.tsx` directly — no separate registry.

**`frontends/sakura/src/App.tsx`**

- `const [hotkeySheetOpen, setHotkeySheetOpen] = useState(false)`.
- Add `Cmd+?` shortcut: `{ key: 'ctrl+shift+/', action: () => setHotkeySheetOpen(true), description: 'Show keyboard shortcuts' }`. Note: `?` on US keyboards is `Shift+/`; the hook normalizes this to `ctrl+shift+/`.
- Render `<AnimatePresence>{hotkeySheetOpen && <HotkeySheet shortcuts={shortcuts} onClose={() => setHotkeySheetOpen(false)} />}</AnimatePresence>`.

### Verification

```bash
cd /Users/chris/Code/waifu-rt3d/frontends/sakura && npx tsc --project tsconfig.app.json --noEmit
```

Manual checklist:
- Press Cmd+? → overlay appears with two-column shortcut list
- All 30+ shortcuts from `App.tsx` shortcuts array are present
- Esc → closes
- Verify in sakura-dawn + tokyo-night — `<kbd>` elements use `var(--color-border)`

**Effort:** 1–2h AI-assisted

---

## 10. File-Level Change-Set Summary

| Path | Status | Phase |
|---|---|---|
| `frontends/sakura/src/components/ModelPanel.tsx` | MODIFIED | A |
| `frontends/sakura/src/components/EffectsPanel.tsx` | MODIFIED (prop source only) | A |
| `frontends/sakura/src/components/AnimationBrowser.tsx` | MODIFIED (prop source only) | A |
| `frontends/sakura/src/stores/appStore.ts` | MODIFIED | B |
| `frontends/sakura/src/components/StatusBar.tsx` | MODIFIED | B |
| `frontends/sakura/src/views/ChatThread.tsx` | MODIFIED | B |
| `frontends/sakura/src/components/Sidebar.tsx` | MODIFIED | B |
| `frontends/sakura/src/views/SettingsView.tsx` | MODIFIED | B |
| `frontends/sakura/src/App.tsx` | MODIFIED | B, C, D |
| `frontends/sakura/src/components/CommandPalette.tsx` | NEW | C |
| `frontends/sakura/src/test/CommandPalette.test.tsx` | NEW | C |
| `frontends/sakura/src/components/HotkeySheet.tsx` | NEW | D |

---

## 11. Verification Matrix

| Phase | Automated | Manual |
|---|---|---|
| A — Viewer Tier 6 | `npx tsc --noEmit` clean; `npx vitest run` all pass | Viewer opens → no preset bar visible; hover canvas → `📷` fades in; click → presets appear; `⚙ Advanced` slide-up works; bottom bar has exactly 4 buttons; 1 light + 1 dark theme verified |
| B — Density Tier 7 | `npx tsc --noEmit` clean; `npx vitest run` all pass; `appStore.layoutMode.test.ts` updated if needed | Cmd+Shift+M toggles Minimal; toolbar chrome hides without layout jump; composer always visible; Settings → Appearance density selector persists |
| C — Command Palette | `npx tsc --noEmit` clean; `CommandPalette.test.tsx` 6+ cases pass | Cmd+K opens palette; typing filters results; Enter fires action + closes; Esc closes; light + dark theme correct |
| D — Hotkey Sheet | `npx tsc --noEmit` clean | Cmd+? shows cheatsheet with all registered shortcuts; Esc closes |

---

## 12. Risks + Mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| `ModelPanel.tsx` camera strip change breaks existing custom-camera save/load | Medium | Custom cameras use `localStorage` directly; save/load buttons move into the `📷` panel, not removed. Read `handleSaveCamera` / `handleDeleteCamera` / `handleLoadCamera` callbacks carefully (lines 593–634) before touching anything. |
| `EffectsPanel` / `AnimationBrowser` stop rendering when `isOpen` prop changes source | Low | Both components already accept `isOpen: boolean`. Change is `isOpen={modelPanelOpen}` → `isOpen={advancedOpen}`. If either component uses `isOpen` to trigger initialization, verify it still mounts correctly. |
| New `'minimal'` LayoutMode breaks existing `layoutMode === 'compact'` guards | Low | `appStore.ts:393` has `layoutMode === 'compact' ? 'normal' : 'compact'` toggle logic. Adding `'minimal'` does not touch this. The new `toggleMinimalMode` is a separate action that sets/unsets `'minimal'` independently. Existing compact toggle is unaffected. |
| `CommandPalette` calling `openOverlay(...)` while another overlay is already open | Low | `openOverlay` in `appStore.ts` already handles this (closes old, opens new). Palette closes itself via `onClose` before or after firing — both orderings are safe. |
| `Cmd+K` conflicts with browser / Electron default bindings | Low | Electron intercepts `Cmd+K` for developer tools on some configs. Test in the Electron build. Fallback: map to `Ctrl+Space` (less conventional but unambiguous). |
| Phase A viewer changes affect the `controlsVisible` hover fade that the existing `#camera-hud` relies on | Low | `#camera-hud` in `viewer.html` uses its own CSS `transition: color 0.3s` and `pointer-events: none` — it is unaffected by React state changes in `ModelPanel.tsx`. The `📷` button lives in React; the HUD lives in the iframe. |
| Theme regression on 18 themes | Medium | All new elements must use `var(--color-*)` tokens. Run the `theme-auditor` agent on `ModelPanel.tsx`, `CommandPalette.tsx`, and `HotkeySheet.tsx` after Phase C completes. |

---

## 13. Sequencing Notes

**Phase A first.** The viewer is the highest daily-pain zone and the most self-contained change. No other phase depends on A; A has no dependencies on B, C, or D.

**Phase B second.** `LayoutMode` extension in `appStore.ts` is a prerequisite for nothing else in this plan, but shipping it before C makes sense because it is small and the density system benefits from the viewer being already cleaned up.

**Phase C and D can ship in the same session.** The Command Palette and Hotkey Sheet share an `App.tsx` touch and both require only local state additions. Ship them together for a single clean commit.

**Commit cadence:** one commit per phase. `feat(hud-tier6): viewer panel chrome collapsed`, `feat(hud-tier7): minimal density mode + Cmd+Shift+M`, `feat(hud-power): command palette + hotkey sheet`.

---

## 14. Reuse Hooks

| Existing component / utility | File:line | How this plan reuses it |
|---|---|---|
| `controlsVisible` hover fade | `ModelPanel.tsx` (local state, viewer hover detection) | Phase A — `📷` button inherits the same `opacity: controlsVisible ? 1 : 0` pattern |
| `useKeyboardShortcuts` hook | `frontends/sakura/src/hooks/useKeyboardShortcuts.ts:46` | Phases B, C, D — all new shortcuts appended to the existing `shortcuts` array in `App.tsx:308` |
| `setLayoutMode` action | `frontends/sakura/src/stores/appStore.ts:385` | Phase B — `toggleMinimalMode` calls this |
| `openOverlay` action | `frontends/sakura/src/stores/appStore.ts` | Phase C — CommandPalette entries call `openOverlay(...)` for navigation actions |
| Pattern 4 (Framer Motion stub) | `frontends/sakura/src/test/*.test.tsx` | Phase C — `CommandPalette.test.tsx` must stub `framer-motion` or tests throw in jsdom |
| `overflowOpen` + click-outside pattern | `StatusBar.tsx:133–190` | Phase A — `cameraBarOpen` popover in ModelPanel uses the same `ref` + `mousedown` listener pattern |
| `EffectsPanel.isOpen` prop | `frontends/sakura/src/components/EffectsPanel.tsx:34` | Phase A — prop source changes from `modelPanelOpen` to `advancedOpen` |
| `AnimationBrowser.isOpen` prop | `frontends/sakura/src/components/AnimationBrowser.tsx` | Phase A — same as EffectsPanel |

---

## 15. Research & Documentation References

- `docs/plans/2026-04-27-hud-redesign-staged.md` — parent plan; Tiers 0–5 status log (Status section). Tiers 6 and 7 are directly continued by this plan. **Do not overwrite the parent plan** — this document is the child/continuation.
- `docs/research/2026-04-27-hud-element-audit.md` — Zone-by-zone element audit from Tier 0. Zone 7 (viewer) is the primary input for Phase A.
- `docs/bugs/2026-04-27-hud-cramped-overcrowded.md` — original bug report; user quote: "the HUD is so cramped now i hate it lik why have we added sooooo much clutter bro". Phase A is the direct fix for the last remaining zone.
- `CLAUDE.md` — "Known Sensitive Areas": avatar aspect ratio, no-surprise-UI rule, theme color inheritance. All three apply to Phase A.
- `MEMORY.md` — "HUD mode for desktop pet" noted as already shipped via Electron + chroma key; Phase B Minimal mode complements this by hiding the UI chrome programmatically.

---

## 16. Forward-Looking (Explicitly Deferred)

| Item | Why deferred |
|---|---|
| Tier 8 — full IA redesign | No remaining pain signal justifies it after Tiers 0–7. Re-open if Tier 6 viewer changes don't feel like enough after daily use. |
| Drag-to-rearrange panel layout | High engineering cost, low solo-user value. |
| Auto-hide chrome on idle (5s mouse-still) | Violates no-surprise-UI rule. |
| Per-character UI color theming (accent per char) | Interesting but out of scope for this plan; belongs in a character-customization plan. |
| CommandPalette AI-driven fuzzy search (semantic matching) | Current substring filter is sufficient. Only revisit if the command list grows past ~60 entries. |

---

## Status Log

- 2026-05-08: Plan created. Tiers 0–5 + session 38/39 bloat removal confirmed via code inspection. Tiers 6 (Phase A), 7 (Phase B), command palette (Phase C), hotkey sheet (Phase D) scoped and locked. Tier 8 dropped. Effort: ~15–20h AI-assisted.
