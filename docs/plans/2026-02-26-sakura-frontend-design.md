# Sakura Frontend — Design Document

**Date:** 2026-02-26
**Status:** Approved
**Replaces:** Nothing — new frontend alongside existing `neon`

---

## Overview

Sakura is a new consumer-grade frontend for the waifu-rt3d companion platform. It replaces the power-user "neon" cyberpunk dashboard with a clean, emotionally inviting chat-first experience inspired by pre-Liquid Glass iOS (iOS 16 era) and visual novel aesthetics.

**Key design principles:**
- Chat-first — the conversation is the primary experience
- Clean shell, kawaii heart — premium layout with warm personality
- Progressive disclosure — simple by default, full power one toggle away
- Desktop-only — no mobile/tablet considerations

**Tech stack:** React 19 + TypeScript + Vite + Tailwind CSS + Shadcn/ui + Framer Motion

---

## 1. Project Structure

```
frontends/sakura/
├── index.html
├── vite.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── package.json
├── public/
│   └── (static assets)
├── src/
│   ├── main.tsx                 ← React entry point
│   ├── App.tsx                  ← Router + tab bar shell
│   ├── hooks/
│   │   ├── useChat.ts           ← SSE streaming, message state, send/receive
│   │   ├── useViewer.ts         ← postMessage bridge to 3D iframe
│   │   ├── useConfig.ts         ← Settings load/save
│   │   ├── useCharacters.ts     ← CRUD + selection state
│   │   ├── useTTS.ts            ← Voice playback, lip-sync trigger
│   │   └── useProactive.ts      ← Idle timer → proactive message system
│   ├── views/
│   │   ├── ChatsView.tsx        ← Character list
│   │   ├── ChatThread.tsx       ← Visual novel dialogue + side model panel
│   │   ├── DiscoverView.tsx     ← Browse/import characters (future, MVP placeholder)
│   │   ├── CreateView.tsx       ← Step-by-step wizard
│   │   └── SettingsView.tsx     ← Progressive disclosure settings
│   ├── components/
│   │   ├── TabBar.tsx           ← Bottom nav (Chats/Discover/Create/Memory/Settings)
│   │   ├── DialogueBubble.tsx   ← Visual novel message box
│   │   ├── MessageMeta.tsx      ← Hover-to-reveal token/latency info
│   │   ├── CharacterCard.tsx    ← List item in ChatsView
│   │   ├── ModelPanel.tsx       ← Slide-out 3D viewer (right side)
│   │   ├── MemoryPanel.tsx      ← Slide-out memory bank (right side)
│   │   ├── WizardStep.tsx       ← Animated wizard step container
│   │   ├── VoicePicker.tsx      ← Voice selection dropdown (React port)
│   │   └── StatusBar.tsx        ← Character status ("daydreaming...", "typing...")
│   ├── styles/
│   │   ├── themes.css           ← Sakura + Crystal CSS variable sets
│   │   └── dialogue.css         ← Visual novel specific styles
│   └── lib/
│       ├── api.ts               ← Typed HTTP client (wraps fetch)
│       └── events.ts            ← Lightweight pub/sub
```

---

## 2. Visual Design System

### Two theme modes, one layout

Both modes share the same structural layout, spacing, and component shapes. The difference is color palette, shadow tint, border radius, and optional ambient effects.

### Sakura Mode (default)
- Background: `#FFF5F7` (warm rose white)
- Surface: `#FFFFFF` (pure white cards)
- Border: `#F3E0E6` (soft pink edge)
- Text primary: `#2D1B24` (dark warm brown)
- Text secondary: `#9B8A92` (muted mauve)
- Accent: `#E8788A` (soft cherry pink)
- Accent hover: `#D4566A` (deeper rose)
- Success: `#7BC9A0` (mint green)
- Warning: `#F0C27A` (warm gold)
- Danger: `#E05A6D` (rose red)
- Card shadows: pink-tinted `0 2px 12px rgba(232,120,138,0.08)`
- Border radius: 16px
- Optional: CSS-only cherry blossom petal particles (~5 drifting slowly, toggleable)

### Crystal Mode
- Background: `#F8FAFB` (cool ice white)
- Surface: `#FFFFFF`
- Border: `#E2E8F0` (cool slate)
- Text primary: `#1A202C` (near-black)
- Text secondary: `#94A3B8` (cool gray)
- Accent: `#6B8AED` (periwinkle blue)
- Accent hover: `#5472D4` (deeper blue)
- Success: `#68D391`
- Warning: `#F6BE5C`
- Danger: `#FC6B6B`
- Card shadows: neutral `0 2px 12px rgba(0,0,0,0.06)`
- Border radius: 12px
- No particle effects — clean and still

### Shared design tokens
- **Fonts:** `'SF Pro Display', 'Inter', -apple-system` (headers) / `'SF Pro Text', 'Inter'` (body)
- **Spacing:** 4/8/12/16/24/32/48px (Tailwind defaults)
- **Transitions:** 200ms ease-out (panels), 150ms ease (hover)
- **No glass/blur effects** — solid backgrounds, clean shadows, pre-Liquid Glass iOS
- **Icons:** Lucide (clean line icons, SF Symbols vibe)

### Visual novel dialogue boxes
- **Her messages:** Full-width card with character portrait on the left, name header, dialogue text. Small `[🔊]` (TTS play/replay, pulses when playing) and `[ℹ️]` (hover reveals tokens, tok/s, latency, model) icons.
- **Your messages:** Right-aligned, simpler bubble with accent-colored background and white text.

---

## 3. Navigation & Layout

### Bottom Tab Bar (48px, persistent)
```
│  💬 Chats  │  🔍 Discover  │  ✨ Create  │  🧠 Memory  │  ⚙️ Settings  │
```
- Active tab: accent color + filled icon
- Inactive: muted gray + outline icon
- Keyboard shortcuts: Ctrl+1 through Ctrl+5

### Tab descriptions
- **Chats** — Character list sorted by most recent. Each card: avatar, name, last message preview, timestamp, unread dot (if proactive messages enabled). Tap → opens ChatThread.
- **Discover** — MVP placeholder ("Coming soon") with a few bundled character presets to import. Future: community character browsing.
- **Create** — 5-step character creation wizard (see Section 4).
- **Memory** — Opens a right slide-out panel showing: active context, RAG archive, relationship score, emotion timeline, token budget, system telemetry (advanced mode only).
- **Settings** — Progressive disclosure settings (see Section 4).

### Chat Thread Layout
Default: chat-first (full width). Model panel toggle in chat header.

**Model panel closed (default):**
```
┌──────────────────────────────────────────────────┐
│  [←]  Sakura  ● Online    "daydreaming..."  [👁️] │
│──────────────────────────────────────────────────│
│                                                  │
│  [Visual novel dialogue bubbles]                 │
│  ...                                             │
│                                                  │
│  [input field............................] [⏎]   │
├──────────────────────────────────────────────────┤
│  💬 Chats  🔍 Discover  ✨ Create  🧠  ⚙️         │
└──────────────────────────────────────────────────┘
```

**Model panel open (toggled via [👁️]):**
```
┌─────────────────────────────────┬────────────────┐
│  [←]  Sakura  ● Online     [👁️] │                │
│  "daydreaming..."               │   3D MODEL     │
│─────────────────────────────────│   (bust shot)  │
│                                 │                │
│  [Visual novel dialogue]        │                │
│  ...                            │                │
│                                 │                │
│  [input field..............] [⏎]│   [◀ Hide]     │
├─────────────────────────────────┴────────────────┤
│  💬 Chats  🔍 Discover  ✨ Create  🧠  ⚙️         │
└──────────────────────────────────────────────────┘
```

- Chat: 60% width, Model: 40% width
- Framer Motion slide animation (200ms ease-out)
- Model panel shows viewer iframe (bust shot camera preset)
- iframe stays loaded even when panel is hidden (height/width collapse, not unmount)

### Layout modes (configurable in Settings)
- **Chat-first** (default): as described above
- **Model-first**: 3D model takes ~70% height, chat is a floating strip at bottom
- **Split**: 50/50 side-by-side, model always visible

---

## 4. Key Interactions

### Character Creation Wizard (5 steps)
Framer Motion slide-left transitions between steps. Progress bar at top, Back/Next at bottom.

1. **Identity** — Name, role, greeting message, avatar upload
2. **Appearance** — VRM model picker (scans server), background image
3. **Voice** — VoicePicker, TTS provider, rate/pitch sliders, test button
4. **Personality** — System prompt, personality sliders (energy/confidence/etc), temperature
5. **Review** — Summary card preview, [Create] button

### Settings (Progressive Disclosure)
Two modes controlled by a master toggle:

- **Standard (default):** Essential settings visible — theme, voice, AI model, chat layout, proactive messages, idle greeting
- **Advanced (toggle on):** All settings expand at once — temperature, history limit, context limit, VAD threshold, webhooks, JSON logging, developer section, etc.

Every setting has:
- A short description below the control (visible by default)
- A `[?]` icon for longer explanations (hover popover)
- **Compact Mode** toggle (Settings > Appearance): hides inline descriptions, keeps only `[?]` hover tooltips. Experienced users toggle this on for tighter layout.

### TTS Audio Feedback
- Subtle: small `[🔊]` icon pulses on her message bubble during playback
- 3D model lip-syncs if model panel is open
- No over-the-top visual effects

### Ambient Idle Behavior (default: on)
- Status text in chat header cycles: "daydreaming...", "humming a song~", "reading something..."
- 3D model plays procedural animations if model panel is open
- Zero LLM calls — purely cosmetic
- Can be toggled off in settings

### Proactive Messages (default: off, opt-in)
- Idle timer fires after configurable minutes (5/15/30/60)
- Lightweight LLM call generates an in-character check-in message
- Appears in chat with subtle "unprompted" indicator
- Max frequency cap (configurable)
- Toggled on in settings

### Silent Mode
Both ambient idle and proactive messages toggled off. Character simply waits with no status text, no idle messages, no LLM calls.

---

## 5. Shared Assets & Frontend Switching

### Shared directory (new)
```
frontends/shared/
├── viewer/              ← 3D viewer iframe (moved from neon/viewer/)
│   ├── viewer.html
│   ├── overlay.html
│   └── lipsync.js
└── lib/                 ← Third-party libraries (moved from neon/lib/)
    ├── three.module.js
    ├── three-vrm.module.min.js
    ├── GLTFLoader.js
    ├── pixi.min.js
    ├── live2d.min.js
    └── live2dcubismcore.min.js
```

### Code sharing rules
- **Share assets:** viewer iframe, Three.js libs (in `frontends/shared/`)
- **Never share application code:** Each frontend owns its own logic
- **Backend untouched:** Both frontends talk to the same FastAPI server at `/api/*`

### Neon updates
- `neon/viewer/` and `neon/lib/` become symlinks or path references to `../shared/`
- All existing functionality preserved

### Server routing
```python
app.mount("/shared", StaticFiles(directory="frontends/shared"), name="shared")
app.mount("/neon", StaticFiles(directory="frontends/neon"), name="neon")
app.mount("/", StaticFiles(directory="frontends/sakura/dist"), name="sakura")
```
- `/` → Sakura (new default)
- `/neon` → Legacy neon frontend
- Config option: `default_frontend: "sakura" | "neon"`

---

## 6. Alternative Architectures (B & C)

If React proves unsuitable (developer experience, performance, or preference), two pre-vetted alternatives exist. Both share the same design (sections 1-5 above) — only the framework layer changes.

### Option B: Vue 3 + Vite

**What changes:**
- `.tsx` components → `.vue` single-file components (template + script + style)
- React hooks → Vue composables (`ref()`, `computed()`, `onMounted()`)
- Framer Motion → Vue's built-in `<Transition>` / `<TransitionGroup>` (no extra dependency)
- Shadcn/ui → Radix Vue, PrimeVue, or Naive UI
- Vite plugin: `@vitejs/plugin-react` → `@vitejs/plugin-vue`

**What stays the same:**
- Project structure, directory layout, file organization
- All CSS/Tailwind — themes, dialogue styles, layout
- `lib/api.ts` and `lib/events.ts` (pure TypeScript, framework-agnostic)
- Viewer iframe + postMessage protocol
- Backend

**Key library equivalents:**

| React | Vue 3 |
|-------|-------|
| useState / useEffect | ref / onMounted |
| Framer Motion | Built-in `<Transition>` |
| React Router | Vue Router |
| Shadcn/ui (Radix) | Radix Vue / Naive UI |
| Zustand (if needed) | Pinia |
| Context | provide / inject |

**Migration effort:** ~2-3 days. Mostly mechanical JSX → template conversion.

### Option C: Svelte 5 + Vite

**What changes:**
- `.tsx` / `.vue` → `.svelte` files
- Hooks/composables → Svelte runes (`$state`, `$derived`, `$effect`)
- Framer Motion → Svelte's built-in `transition:` and `animate:` directives
- Shadcn/ui → Shadcn-Svelte (actively maintained port)
- Vite plugin: `@sveltejs/vite-plugin-svelte`

**What stays the same:**
- Everything in the Vue section above

**Key library equivalents:**

| React | Svelte 5 |
|-------|----------|
| useState | $state |
| useEffect | $effect |
| Framer Motion | transition: directive |
| React Router | SvelteKit routing / svelte-routing |
| Shadcn/ui | Shadcn-Svelte |
| Context | Svelte stores |

**Svelte advantage:** Zero-runtime compiler means smallest possible bundle. Best option if performance on low-end machines matters.

**Migration effort:** ~2-3 days. Components get shorter, not longer.

---

## Decision Log

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Visual identity | Clean + Kawaii combined | Premium shell for first impression, warm personality for engagement |
| Theme modes | Sakura (pink) + Crystal (white) | Two moods, one layout |
| Primary layout | Chat-first | Conversation is the core product |
| 3D model | Side panel toggle (right) | Opt-in, doesn't waste space when hidden, proper iframe rectangle |
| Navigation | Bottom tab bar (5 tabs) | Desktop iMessage/Discord pattern, familiar |
| Tab 4 | Memory Bank | Quick access to context/relationship/telemetry data |
| Chat style | Visual novel dialogue | Emphasizes "talking to a character" vs "texting a contact" |
| TTS feedback | Subtle (icon pulse + lip-sync) | Non-distracting |
| Character creation | Step-by-step wizard | Guided, hard to mess up |
| Settings | Progressive disclosure + Advanced toggle | One master flip expands everything |
| Compact Mode | Toggle hides inline descriptions | Experienced users get tighter layout, tooltips still available |
| Idle behavior | Ambient (default) + Proactive (opt-in) | Ambient is free (no LLM), proactive is configurable |
| Framework | React 19 + TypeScript + Vite | Largest ecosystem, Shadcn/ui, Framer Motion |
| Alternatives | Vue 3, Svelte 5 documented | Pre-vetted migration paths if React doesn't work out |
| Code sharing | Shared assets only, never app code | Clean separation, either frontend can be deleted safely |
| Female voices only | All TTS catalogs female-only | Product identity: waifu/girlfriend companion app |
