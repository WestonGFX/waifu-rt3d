# Nova Frontend — Implementation Plan

*Created: 2026-03-10*
*Design Spec: `docs/superpowers/specs/2026-03-10-nova-frontend-design.md`*

---

## Context

The Sakura frontend was built iteratively over months — functional but lacking visual cohesion, depth, and "wow factor." A brainstorm session (2026-03-10) produced a full design spec for **Nova**, a clean-room rebuild with:
- Dual-mode layout (Companion immersive + Focused dashboard)
- Frosted glass aesthetic over 3D viewer
- Spring physics animations (Framer Motion)
- 4-tier swappable color system with character tinting
- Rich live data infographics (mood orb, context budget, memory stream)

Sakura stays as v1/classic. Nova is a pure frontend — no backend changes needed.

---

## Phase 1: Project Scaffold + Glass Foundation

**Goal:** Bootable Nova app with glass aesthetic, ambient layer, and viewer iframe — no features yet, just the visual foundation.

### Tasks

- [ ] **1.1** Create `frontends/nova/` with Vite + React 19 + TypeScript
  - `package.json` — same deps as Sakura (react 19, zustand 5, framer-motion 12, lucide-react, clsx)
  - Add Outfit + Fraunces fonts (Google Fonts)
  - `vite.config.ts` — `base: '/nova/'`, port 5176, proxy all 8 targets from Sakura (`/api`, `/files`, `/shared`, `/images`, `/live2d`, `/frontends`, `/assets`, `/ws`)
  - `tsconfig.json` + `tsconfig.app.json` + `tsconfig.node.json` — strict mode, `@/*` path alias, same structure as Sakura
  - NOTE: No Tailwind — Nova uses CSS Modules + CSS Variables for the glass aesthetic

- [ ] **1.2** Create CSS foundation (`src/styles/`)
  - `variables.css` — Full CSS variable system: glass backgrounds, borders, text colors, accent colors, spacing, radii
  - Light mode (Warm Cream) + Dark mode (Lavender+Peach) via `prefers-color-scheme` + manual override
  - `reset.css` — Minimal reset + base typography (Outfit body, Fraunces display)
  - `glass.module.css` — Reusable glass panel styles (backdrop-filter, tint, border)
  - `animations.css` — Spring-like keyframes for entrance animations

- [ ] **1.3** Build `AmbientLayer` component
  - 3 drifting gradient orbs (pink, lavender, peach) with 8-18s animation cycles
  - SVG film grain overlay at 2-3% opacity
  - Mouse parallax on orbs (1-2% movement)
  - All CSS — no JS animation library needed for ambient

- [ ] **1.4** Build `GlassPanel` primitive component
  - Props: `tint`, `blur`, `borderStrength`, `rounded`, `className`
  - `backdrop-filter: blur()` + tinted background + thin border
  - Framer Motion `motion.div` wrapper for spring entrance animations

- [ ] **1.5** Wire viewer iframe
  - Embed `viewer.html` from `frontends/shared/viewer/` as full-viewport iframe
  - Copy `viewerStore.ts` from Sakura (reuse as-is — it's a pure dispatcher)
  - Verify postMessage communication works

- [ ] **1.6** Wire backend routing in `server.py`
  - Add `FRONTEND_NOVA_DIST` path constant
  - Add `/nova` and `/nova/{path}` route handlers (same pattern as Sakura)
  - Add `app.mount("/nova/assets", ...)` static mount
  - Add Nova to frontend switcher list

- [ ] **1.7** Commit checkpoint: `feat(nova): phase 1 — project scaffold + glass foundation`

**Verification:** `npm run dev` in `frontends/nova/` shows full-viewport 3D viewer with ambient orbs floating behind glass panels. No features — just the visual stage.

---

## Phase 2: Companion Mode — Chat + Core UI

**Goal:** Working chat in Companion mode — glass bubbles over 3D viewer, floating nav, input bar.

### Tasks

- [ ] **2.1** Create `NovaShell` root component
  - Mode state (companion/focused) in new `novaStore.ts`
  - Theme provider (reads system preference, applies CSS class)
  - CharacterTint system (CSS variable overrides per active character)

- [ ] **2.2** Build Companion mode layout
  - `CompanionView` — full-viewport wrapper, z-layer ordering
  - Floating nav dots (top-left) — 3 glass circles: character switcher, settings, command palette
  - Character info pill (top-center) — avatar + name + status dot
  - Mode toggle pill (top-right) — Companion/Focused switcher
  - Quick action pills (bottom-left) — gestures, games, lorebook

- [ ] **2.3** Build `GlassBubble` chat component
  - Character bubbles (left-aligned, glass background)
  - User bubbles (right-aligned, accent-tinted glass)
  - Framer Motion spring entrance: `{ stiffness: 200, damping: 18 }` with staggered delays
  - Typing indicator with bouncing dots
  - Markdown rendering for message content

- [ ] **2.4** Build `InputBar` component
  - Glass-backed rounded input with send button
  - Voice toggle button (mic icon)
  - Gradient send button (pink→peach)
  - Focus glow animation
  - Wire to chat API (fork `chatStore.ts` from Sakura, adapt for Nova)

- [ ] **2.5** Fork and adapt core stores
  - `chatStore.ts` — Fork from Sakura, keep SSE streaming + message state
  - `appStore.ts` — Fork, strip Sakura-specific UI state, add Nova mode preferences
  - Copy `api.ts` + `types.ts` from Sakura (reuse as-is)

- [ ] **2.6** Wire chat end-to-end
  - Send message → SSE stream → render bubbles → trigger viewer expression
  - Character switching (load character list from `/api/characters`)
  - Session management (create/load sessions)

- [ ] **2.7** Commit checkpoint: `feat(nova): phase 2 — companion mode chat`

**Verification:** Can chat with a character in Companion mode. Glass bubbles appear over 3D viewer with spring animations. Character expressions sync.

---

## Phase 3: Focused Mode + Mode Transition

**Goal:** Second layout mode with icon rail, chat history, and fluid animated transition between modes.

### Tasks

- [ ] **3.1** Build `FocusedView` layout
  - Icon rail on left (~48px collapsed, ~280px expanded)
  - Rail items: character switcher, chat history, memory, games, lorebook, settings
  - Main content area (chat thread — full-width messages, not glass bubbles)
  - Small 3D viewer panel (right side or avatar-beside-messages)

- [ ] **3.2** Build `IconRail` component
  - Collapsed: icon-only with tooltips
  - Expanded: icon + label + content panel slides out
  - Framer Motion `AnimatePresence` for panel expand/collapse
  - Active item highlight

- [ ] **3.3** Build `ModeTransition` animation
  - Framer Motion `layoutId` shared elements between Companion ↔ Focused
  - Viewer resizes (full → panel), chat panel morphs, rail appears/disappears
  - Spring physics: `{ stiffness: 150, damping: 20 }` — slower, deliberate
  - Keyboard shortcut toggle (e.g., `⌘/Ctrl + \`)

- [ ] **3.4** Build `CommandPalette` (⌘K)
  - Glass overlay with search input
  - Actions: switch character, toggle mode, open settings, start game, etc.
  - Fuzzy search on action labels
  - Spring entrance/exit animation

- [ ] **3.5** Commit checkpoint: `feat(nova): phase 3 — focused mode + mode transition`

**Verification:** Can toggle between Companion and Focused modes with fluid animation. Icon rail expands to show panels. ⌘K opens command palette.

---

## Phase 4: Live Data Infographics

**Goal:** Surface system data visually — mood, context budget, memory, relationship.

### Tasks

- [ ] **4.1** Build `MoodOrb` widget (Companion mode)
  - Large glass circle with animated gradient that shifts with character emotion
  - Emotion name + intensity arc
  - Pulsing glow matching mood color
  - Data from `/api/characters/{id}` mood state

- [ ] **4.2** Build `ContextBudgetArc` widget
  - Circular/arc progress indicator for token usage
  - Animated fill, color shifts green→amber→red
  - Shows active context sources (lorebook, memory, knowledge graph)
  - Data from chat response metadata

- [ ] **4.3** Build Focused mode data panels
  - `ChatHistoryPanel` — searchable thread list, grouped by character + date
  - `MemoryBrowserPanel` — tiered memory cards (short/episodic/long-term)
  - `SystemStatusPanel` — model name, tok/s, context fill, TTS status, link devices

- [ ] **4.4** Build `EmotionIndicator` (bottom-center, Companion mode)
  - Glass pill with emotion emoji + name + intensity bar
  - Animated transitions between emotion states

- [ ] **4.5** Commit checkpoint: `feat(nova): phase 4 — live data infographics`

**Verification:** Mood orb animates in Companion mode. Context budget arc shows real token usage. Focused mode data panels populate with real data.

---

## Phase 5: Voice, Theme System, Polish

**Goal:** Voice I/O, full theme system, and first-load orchestration.

### Tasks

- [ ] **5.1** Wire voice input/output
  - Copy `useFullDuplexVoice.ts` + `useVoiceMode.ts` from Sakura (reuse as-is)
  - Voice orb animation on InputBar during recording
  - Audio-reactive glow on input bar during TTS playback

- [ ] **5.2** Build theme system
  - System preference detection (`prefers-color-scheme`)
  - Manual light/dark override in settings
  - Character tint layer (3 CSS vars per character: hue, accent, ambient)
  - Theme preset selector (start with 5-6 from the 72-pack: Catppuccin Frappé, Dracula, Tokyo Night, Nord, Rosé Pine, One Light)

- [ ] **5.3** First-load orchestration
  - Staggered spring-in of all elements on initial mount
  - Ambient orbs fade up → character entrance animation → nav dots cascade in → chat panel slides in
  - 2-second choreographed reveal

- [ ] **5.4** Mobile layout
  - Thin top bar with character avatar + name + hamburger
  - Pull-up drawer for chat (gesture-based)
  - Hamburger → slide-over navigation drawer

- [ ] **5.5** Settings panel (minimal MVP version)
  - Theme picker (light/dark/system + presets)
  - Voice settings (on/off, provider)
  - LLM model selector
  - Chat layout preference
  - Built as a glass overlay, not a full page

- [ ] **5.6** Final polish pass
  - Verify all spring animations feel right
  - Test glass rendering on different backgrounds
  - Check parallax depth on hover
  - Run `tsc --noEmit` + visual regression check

- [ ] **5.7** Commit checkpoint: `feat(nova): phase 5 — voice, themes, polish`

**Verification:** Full end-to-end: open Nova → first-load animation → chat with character → switch modes → change theme → voice conversation. All glass panels render correctly over 3D viewer.

---

## Critical Files

### New (to create)
```
frontends/nova/
├── package.json
├── vite.config.ts
├── tsconfig.json, tsconfig.app.json
├── index.html
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── stores/novaStore.ts, chatStore.ts, appStore.ts
│   ├── hooks/ (copies from Sakura: useFullDuplexVoice, useVoiceMode, useKeyboardShortcuts, useProactive)
│   ├── lib/api.ts, types.ts (copies from Sakura)
│   ├── styles/variables.css, reset.css, glass.module.css, animations.css
│   ├── components/
│   │   ├── AmbientLayer.tsx
│   │   ├── GlassPanel.tsx, GlassBubble.tsx
│   │   ├── CompanionView.tsx, FocusedView.tsx
│   │   ├── FloatingNav.tsx, IconRail.tsx
│   │   ├── InputBar.tsx, CommandPalette.tsx
│   │   ├── ModeToggle.tsx, ModeTransition.tsx
│   │   ├── CharacterTint.tsx, EmotionIndicator.tsx
│   │   ├── MoodOrb.tsx, ContextBudgetArc.tsx
│   │   └── ChatHistoryPanel.tsx, MemoryBrowserPanel.tsx, SystemStatusPanel.tsx
│   └── views/ (if needed beyond shell components)
```

### Existing (to modify)
```
backend/server.py — Add Nova route handlers + static mount (~20 lines)
run.sh — Add Nova build/dev commands (~5 lines)
.gitignore — Add frontends/nova/dist/
```

### Existing (to reuse unchanged)
```
frontends/shared/viewer/viewer.html — 3D viewer iframe
frontends/shared/lib/* — Three.js, PIXI, postprocessing
frontends/sakura/src/stores/viewerStore.ts — Copy as-is
frontends/sakura/src/hooks/useFullDuplexVoice.ts — Copy as-is
frontends/sakura/src/hooks/useVoiceMode.ts — Copy as-is
frontends/sakura/src/hooks/useKeyboardShortcuts.ts — Copy as-is
frontends/sakura/src/lib/api.ts — Copy as-is
frontends/sakura/src/lib/types.ts — Copy as-is
```

---

## Execution Strategy

- Use **parallel subagents** where possible (e.g., CSS foundation + component scaffolding)
- **Commit after each phase** — atomic, reversible checkpoints
- Start in a **git worktree** to keep master clean during multi-phase build
- Run `tsc --noEmit` after every phase to catch type errors early
- No backend changes until Phase 1.6 (routing) — Nova dev server proxies to existing backend

---

## Verification (End-to-End)

1. `cd frontends/nova && npm run dev` — Dev server starts, proxies to backend
2. Open `http://localhost:5174/nova/` — See 3D viewer + ambient orbs + glass panels
3. Chat with a character — messages stream in with spring animations
4. Toggle Companion ↔ Focused — fluid morph animation
5. ⌘K command palette — search and execute actions
6. Check mood orb + context budget — real data, animated
7. Switch themes — colors transition smoothly
8. Voice conversation — record → process → TTS plays
9. `npx tsc --noEmit` — 0 errors
10. `.venv/bin/python -m pytest backend/tests/ -q` — all pass (no backend changes should break)
