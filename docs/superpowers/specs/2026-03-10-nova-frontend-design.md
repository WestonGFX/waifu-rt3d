# Nova Frontend — Design Specification

*Date: 2026-03-10*
*Status: Approved (brainstorm session)*

---

## 1. Overview

Nova is a new frontend for Waifu-RT3D that replaces the iteratively-built Sakura frontend with a cohesive, purpose-designed experience. Sakura remains as "Classic" / v1.

### Core Identity
- **"UI as atmosphere, not furniture."** — Panels exist in the character's world, not bolted on top of it.
- The 3D character is the hero. Everything else floats around her.
- Glass, warmth, depth, motion. Not a chatbot — a companion space.

### Design References (User-Provided)
- **OS/Platform:** macOS Tahoe Liquid Glass, iOS 26
- **Apps:** Discord, Zen browser, Warp terminal, Notion, Obsidian, Anytype, open-webui, ChatGPT, LM Studio, VRoidStudio
- **3D/Motion:** Studio Ghibli ThreeJS (codepen), Spline.design, interactive particle text (codepen), 3D Room ThreeJS (codepen)
- **Dribbble:** Minimal Agent Desktop UI, Premium Furniture E-commerce, Mental Health Clinic "Bloom", Property Management Dashboard
- **Key qualities:** depth, atmosphere, distinctive typography, spring physics, frosted glass, warm colors

---

## 2. Layout Architecture

### Dual Mode System

Nova has two primary modes with a fluid animated transition between them:

#### Companion Mode (Immersive)
- 3D viewer fills the **entire viewport** — edge to edge
- All UI floats as frosted glass panels **over** the 3D scene
- Chat bubbles on the right side, glass-backed
- Minimal chrome — no bars, no rails, no permanent UI
- Navigation via floating glass dots (top-left) + ⌘K command palette
- Quick actions (gestures, games, lorebook) as floating glass pills (bottom-left)
- Character info pill (top-center) with name + emotional state
- Mode toggle pill (top-right)
- Emotion indicator (bottom-center)

#### Focused Mode (Productivity)
- Chat-centric layout with full message history
- Collapsible icon rail on left edge (~48px, expands to panel on click)
  - Character switcher, chat history, settings, games, lorebook, memory
- 3D character in a smaller panel or as an avatar beside messages
- Optimized for reading long responses, browsing history, configuring settings
- Full feature access without leaving the view

#### Mobile Layout
- Thin top bar with character avatar + name + hamburger menu
- Pull-up drawer for chat (swipe up = full chat, down = character view)
- Hamburger opens slide-over drawer with all navigation
- Character is the default state; chatting is an action you enter

#### Mode Transition
- Fluid animation between Companion ↔ Focused
- Elements morph position (chat panel slides, viewer resizes, rail appears/disappears)
- Spring physics on the transition — overshoot, settle
- Keyboard shortcut for instant toggle

---

## 3. Visual Design

### Aesthetic: Frosted Glass + Warm Atmosphere

All surfaces use `backdrop-filter: blur()` over the 3D scene, creating genuine depth. The character's colors bleed through the UI panels. Panels have:
- Subtle glass tint (warm, not cold/blue)
- Thin 1px borders with low-opacity color
- Soft inner/outer glow on hover/focus
- Rounded corners (16-20px for panels, 24px+ for pills)

### Background Layers (Companion Mode, back to front)
1. **3D scene** — Three.js/VRM character + environment
2. **Ambient orbs** — large, blurred, slowly drifting colored gradients (pink, lavender, peach)
3. **Film grain overlay** — SVG noise texture at 2-3% opacity
4. **Glass UI panels** — frosted, floating, interactive

### Color System

Colors are a **swappable layer**, not hardcoded. Four tiers:

| Tier | Description | Examples |
|------|-------------|----------|
| **Base theme** | System-matched default | Light: Warm Cream / Dark: Lavender+Peach |
| **Character tint** | Subtle hue overlay per character | Yuki=pink, Sable=green/gold, Kaede=amber |
| **Theme presets** | User-selectable full palettes | Catppuccin Frappé, Dracula, Tokyo Night, Nord, etc. |
| **Custom overrides** | Per-variable CSS tweaking | Any color adjustable |

**Default behavior:** Match system `prefers-color-scheme`. User can override to force light/dark in settings.

**Light mode (Warm Cream):**
- Background: cream/warm white (#fef6f0 → #fff0ea)
- Surfaces: frosted white glass (rgba(255,255,255,0.65) + blur)
- Accents: coral/peach (#ff9a76), soft rose
- Text: warm dark (#3c3228)
- Shadows: warm, low-opacity

**Dark mode (Lavender+Peach):**
- Background: deep plum (#16111f → #1e1630)
- Surfaces: tinted glass (rgba(200,180,255,0.05) + blur)
- Accents: lavender (#b49bf0) + peach (#ffb9aa)
- Text: warm white (rgba(255,245,248,0.92))
- Ambient orbs: pink, lavender, peach

**Character tint system:**
- Each character defines 3 values: `tint-hue`, `tint-accent`, `tint-ambient`
- Applied as CSS variable overrides when that character is active
- Affects: ambient orb colors, glass border tint, accent color, send button gradient
- Subtle shift — not a full repaint. The room "warms" or "cools" based on who you're talking to.

**72-theme reference pack:** Saved at `docs/design/themes/palette-pack/`. Contains JSON + CSS for 72 editor themes. Available for:
- Extracting palettes for preset themes
- Providing users with a theme gallery
- Deriving glass tint colors from existing palettes

### Typography

| Role | Font | Weight | Size |
|------|------|--------|------|
| Display/branding | Fraunces | 600 | 24-32px |
| Body/UI | Outfit | 300-600 | 12-15px |
| Monospace (code, stats) | System mono | 400 | 12px |

- Letter-spacing: -0.01em to -0.02em on headings
- Line-height: 1.5-1.6 for chat bubbles

---

## 4. Motion Design

### Philosophy
Spring physics for UI interactions + ambient breathing for atmosphere. The space feels alive without being distracting. **Particles are reactive-only and off by default.**

### Motion Hierarchy

| Layer | Type | Speed | Always-on? |
|-------|------|-------|------------|
| Ambient orbs | Slow drift, breathing scale | 8-18s cycles | Yes |
| Film grain | Static texture | — | Yes |
| Character | VRM idle animation | ~4s breathe cycle | Yes |
| UI entrances | Spring-in with overshoot | 0.4-0.8s | On mount |
| Chat bubbles | Spring bounce-in, staggered | 0.5s + 0.15s stagger | On new message |
| Hover/focus | Spring scale + glow | 0.2-0.3s | On interaction |
| Mode transition | Morph + spring settle | 0.6-0.8s | On toggle |
| Reactive particles | Burst from event source | 0.5-1s | On event (opt-in) |

### Spring Physics Parameters
```
UI elements:  { stiffness: 300, damping: 24 }   // snappy with slight overshoot
Chat bubbles: { stiffness: 200, damping: 18 }   // bouncier, more playful
Mode switch:  { stiffness: 150, damping: 20 }   // slower, more deliberate
Hover:        { stiffness: 400, damping: 28 }   // quick, responsive
```

### Staggered Entrances
All list-like elements (chat messages, nav items, quick actions) animate in with staggered delays (0.1-0.15s between items). Creates a "cascading reveal" effect.

### Reactive Events (User-Toggleable)
- **New message:** bubble springs in from bottom
- **Mood change:** ambient orbs shift color over 2s
- **Milestone:** particle burst + celebration overlay
- **Voice active:** subtle audio-reactive glow around input bar
- **Character gesture:** UI subtly reacts (e.g., slight wobble on nearby elements)

### Parallax Depth (Companion Mode)
Mouse position subtly shifts layers at different rates:
- Background: 0% (fixed)
- Ambient orbs: 1-2% movement
- Character: 0% (fixed in 3D space)
- UI panels: 0.5% counter-movement

Creates sense of depth without being nauseating. Disabled on mobile (uses gyroscope hint instead, if available).

---

## 5. Component Architecture

### Shared with Sakura
- `viewer.html` iframe (VRM/GLB renderer) — unchanged
- `viewerStore.ts` mediator pattern — reused or forked
- Backend API layer (`/api/*`, `/ws/*`) — unchanged
- `useLive2D.ts`, `useFullDuplexVoice.ts` — reused

### New Nova Components (Core)

| Component | Responsibility |
|-----------|---------------|
| `NovaShell` | Root layout — mode state, ambient layer, theme provider |
| `CompanionView` | Full-viewport 3D + glass overlay layout |
| `FocusedView` | Chat-centric + icon rail layout |
| `ModeTransition` | Animated morph between views |
| `GlassPanel` | Reusable frosted panel primitive (blur, tint, border) |
| `GlassBubble` | Chat message with glass background + spring entrance |
| `FloatingNav` | Companion mode nav dots |
| `IconRail` | Focused mode collapsible sidebar |
| `CommandPalette` | ⌘K search/action overlay |
| `InputBar` | Glass chat input with voice/attach/send |
| `AmbientLayer` | Orbs + grain + optional particles |
| `CharacterTint` | CSS variable injection per active character |
| `EmotionIndicator` | Mood display pill |
| `ModeToggle` | Companion/Focused switch pill |

### Stores

| Store | State |
|-------|-------|
| `novaStore` | Mode (companion/focused), panel visibility, UI preferences |
| `chatStore` | Messages, active conversation (port from Sakura) |
| `appStore` | Characters, config, theme (port from Sakura) |
| `viewerStore` | 3D viewer commands (reuse from Sakura) |

---

## 6. Tech Stack

| Layer | Choice | Reason |
|-------|--------|--------|
| Framework | React 19 | Same as Sakura, team knowledge |
| State | Zustand | Same as Sakura, lightweight |
| Motion | Framer Motion 11+ | Spring physics, layout animations, AnimatePresence |
| Styling | CSS Modules + CSS Variables | Scoped styles, theme system via variables |
| Bundler | Vite | Same as Sakura, fast HMR |
| Icons | Lucide React | Same as Sakura, consistent |
| 3D | Existing viewer.html iframe | No change to rendering pipeline |
| Fonts | Outfit + Fraunces (Google Fonts) | Warm, distinctive, good weight range |

---

## 7. Feature Parity Plan

Nova ships with core features first, then adds the rest incrementally. Features grouped by priority:

### MVP (Ship First)
- Chat (send/receive, streaming, markdown)
- 3D viewer (VRM/Live2D via iframe)
- Character switching
- Dual mode (companion + focused)
- Theme system (light/dark + presets)
- Voice input/output
- Command palette (⌘K)

### Phase 2
- Settings (rebuilt, not ported — Sakura's is 4200 lines)
- Emotion display + mood-driven tinting
- Greeting system
- Onboarding wizard

### Phase 3
- Games (trivia, 20Q, hangman, etc.)
- Lorebook browser
- Memory panel
- Knowledge graph viewer

### Phase 4
- Expression portraits
- Game spectator
- Card import/export
- Visual Novel mode (if applicable to new layout)
- Desktop pet integration

---

## 8. Live Data & Infographics

The UI should surface rich, real-time system data — not just chat. The app is a companion *system*, and the UI should feel like it. Bland text summaries are not enough; data should be visual, animated, and integrated into the glass aesthetic.

### Companion Mode — Ambient Data
These float as glass widgets in Companion mode, visible but not intrusive:

| Widget | Data | Visual Treatment |
|--------|------|-----------------|
| **Mood Orb** | Character's current emotional state + affinity | Large glass circle (not a tiny pill). Gradient shifts with mood. Animated transitions between states. Shows emotion name + intensity arc. Pulsing glow that matches mood color. |
| **Context Budget** | Token usage (prompt/response/total), active context slots | Circular or arc progress indicator. Animated fill. Color shifts as budget fills (green→amber→red). Shows which context sources are active (lorebook, memory, knowledge graph). |
| **Memory Stream** | Recent memories formed from conversation | Scrollable glass card stack. Each memory is a small card with timestamp + summary. New memories slide in with spring animation. |
| **Relationship Arc** | Affinity score, trust phase, milestone progress | Curved progress bar or orbital ring around the character. Phase name displayed. Milestone markers glow when approaching. |

### Focused Mode — Data Sidebar
In Focused mode, the icon rail expands to show richer data panels:

| Panel | Contents |
|-------|----------|
| **Chat History** | All past conversation threads, searchable, with date/character grouping. Thread previews show last message + character avatar. |
| **Memory Browser** | Tiered memory view (short-term / episodic / long-term). Each memory card shows source, timestamp, relevance score. Filterable by character. |
| **Knowledge Graph** | Visual node graph of extracted user facts. Interactive — click a node to see which conversations mentioned it. |
| **System Status** | Model name, token/s, context window fill, active LM Studio link devices, TTS provider status. Mini dashboard feel. |

### The Dual-Mode Data Philosophy

The same data exists in both modes — the *presentation* changes:

- **Companion mode = ambient data.** Mood orb, subtle affinity arc, maybe a floating context gauge. Beautiful, minimal, atmospheric. You *feel* the system state rather than reading it. This is the "simple mode" — the vibe.
- **Focused mode = informed data.** Full context budget visualization, memory stream, model status, session history, relationship web, analytics dashboard. Beautiful data visualization in glass panels. This is the "power mode" — the dashboard.

This reframes dual-mode from "chat vs. character" to **"ambient vs. informed."** The user chooses how much system awareness they want.

### Existing Sakura Data Components to Port & Elevate

Sakura already has 13+ data display components that are buried in settings tabs or tiny pills. Nova surfaces them properly:

| Sakura Component | Nova Treatment |
|-----------------|---------------|
| `ContextBudgetPill` | Animated arc/ring in Focused sidebar + subtle gauge in Companion |
| `StatusBar` (model name) | Glass pill in Focused header + ambient indicator in Companion |
| `StatsPanel` / `AnalyticsPanel` | Rich data panel in Focused rail |
| `TimelinePanel` | Conversation timeline in Focused history panel |
| `SessionDrawer` | Full chat history browser in Focused rail |
| `MemoryPanel` | Memory stream cards in both modes |
| `CharacterRelationshipWeb` | Interactive graph in Focused + affinity arc in Companion |
| `PromptInspector` | Dev overlay (⌘K → "inspect prompt") |
| `LinkStatusPanel` | Device mesh in Focused system status |
| `WaveformVisualizer` | Audio-reactive glow on input bar in both modes |
| `MessageMeta` | Token count on hover in Focused, hidden in Companion |

### Design Principles for Data
- **Animated transitions** between states (mood changes, budget filling, memories forming)
- **Glass-backed** like everything else — data widgets are frosted panels
- **Not hidden** — data is surfaced prominently, especially in Focused mode. Companion mode shows only ambient hints.
- **Reactive** — data updates animate in real-time (streaming token count, mood shifting mid-conversation)
- **Layered disclosure** — Companion shows the feeling, Focused shows the numbers. Same data, different fidelity.

---

## 9. What "Wow" Means

The user's design references (Ghibli ThreeJS, Spline.design, Dribbble shots) share qualities that HTML mockups can't capture. The "wow" in Nova comes from:

1. **Real glass over real 3D** — backdrop-filter blurring an actual Three.js scene with a breathing, gesturing anime character. Not a gradient — a living scene.
2. **Spring physics everywhere** — every panel, bubble, button, toggle responds with physical spring motion. Nothing snaps. Everything settles.
3. **The mode transition** — a fluid 0.8s morph where the viewer resizes, panels slide, the rail materializes. One animation that sells the whole app.
4. **Character tinting** — switching characters and watching the room's color temperature shift over 2 seconds. The ambient orbs, the glass tint, the accent color — all breathe into the new character's palette.
5. **Parallax depth** — subtle mouse-tracked layer shifting that makes the glass panels feel like they float in 3D space above the character.
6. **The first load** — staggered spring-in of every element, ambient orbs fading up, character appearing with a gentle entrance animation. A 2-second orchestrated reveal that says "this is not a web app."

These are engineering tasks, not design decisions. The spec describes them; the build delivers them.

---

## 10. Non-Goals

- No server-side rendering (SPA only, same as Sakura)
- No mobile-native app (PWA continues to work)
- No changes to backend API (Nova is a pure frontend)
- No changes to 3D rendering pipeline (viewer.html stays)
- No removal of Sakura (it remains as `/frontends/sakura/`)
- No new features invented for Nova — feature parity first, then innovation
