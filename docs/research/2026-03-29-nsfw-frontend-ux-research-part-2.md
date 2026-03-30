> **This is Part 2 of 3.** See also: [Part 1](2026-03-29-nsfw-frontend-ux-research-part-1.md), [Part 3](2026-03-29-nsfw-frontend-ux-research-part-3.md)

## 7. Visual Novel UI Patterns

### Overview

Visual novels (VNs) are the closest existing genre to our intimate scene UI. They've solved decades of problems around text presentation, emotional pacing, choice architecture, and scene transitions. The two dominant engines — Ren'Py and TyranoScript — offer rich pattern libraries we can adapt to React.

### Text Presentation Modes

**ADV Mode (Adventure)** — The standard VN layout: dialogue appears one line at a time in a window at the bottom of the screen, with a character name label and optional portrait. This is how most VNs present dialogue. ([Ren'Py NVL Mode Tutorial](https://www.renpy.org/doc/html/nvl_mode.html))

```
┌──────────────────────────────────────────────────────────┐
│                                                          │
│                   [Character Art]                         │
│                                                          │
│                                                          │
│                                                          │
│  ┌──────────────────────────────────────────────────┐    │
│  │  Dae                                              │    │
│  │  "The rain's getting heavier... come sit with     │    │
│  │   me by the window?"                              │    │
│  │                                          [▸]      │    │
│  └──────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────┘
```

**NVL Mode (Novel)** — Multiple lines of text accumulate on the full screen, creating a novel-like reading experience. Better for narration-heavy scenes and internal monologue. Ren'Py's NVL mode presents multiple lines on the entire screen with a semi-transparent background.

```
┌──────────────────────────────────────────────────────────┐
│  ┌──────────────────────────────────────────────────┐    │
│  │                                                  │    │
│  │  The room was dim, lit only by the glow of the   │    │
│  │  city through rain-streaked windows.              │    │
│  │                                                  │    │
│  │  Dae: "I've been thinking about what you said    │    │
│  │  earlier..."                                     │    │
│  │                                                  │    │
│  │  She turned to face you, her expression soft     │    │
│  │  but unreadable.                                 │    │
│  │                                                  │    │
│  │  Dae: "Did you mean it?"                         │    │
│  │                                                  │    │
│  │                                          [▸]     │    │
│  └──────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────┘
```

Our existing chat UI is ADV-like (messages one at a time). For intimate scenes, we should offer an optional NVL/immersive mode that accumulates narrative text in a full-screen overlay — essentially a "reading mode" for scene content.

### Typewriter Effects

Ren'Py uses `config.default_text_cps` (characters per second) to control text reveal speed. Key implementation considerations:

- **Speed range:** 0 (instant) to 150 CPS. 20-40 CPS feels intimate and deliberate. 60-80 CPS feels natural conversation. 100+ feels urgent.
- **Click-to-complete:** Clicking/tapping during typewriter should instantly reveal the rest of the line. Essential for re-readers.
- **Pause tags:** Ren'Py supports inline `{w=0.5}` tags for mid-sentence pauses. We can use a similar syntax: `She looked at you...{pause:800}and smiled.`
- **Speed variation:** Slow down for emotional beats, speed up for action. The `PacingEngine` phase could control base CPS.

**React implementation approach:**

```tsx
function TypewriterText({ text, cps = 40, onComplete }: Props) {
  const [visibleChars, setVisibleChars] = useState(0);
  const intervalRef = useRef<number>();

  useEffect(() => {
    setVisibleChars(0);
    intervalRef.current = window.setInterval(() => {
      setVisibleChars(prev => {
        if (prev >= text.length) {
          clearInterval(intervalRef.current);
          onComplete?.();
          return prev;
        }
        return prev + 1;
      });
    }, 1000 / cps);
    return () => clearInterval(intervalRef.current);
  }, [text, cps]);

  // Click to complete
  const handleClick = () => {
    clearInterval(intervalRef.current);
    setVisibleChars(text.length);
    onComplete?.();
  };

  return (
    <p onClick={handleClick} style={{ cursor: 'pointer' }}>
      <span>{text.slice(0, visibleChars)}</span>
      <span style={{ opacity: 0 }}>{text.slice(visibleChars)}</span>
    </p>
  );
}
```

### Choice Menus

VN choice menus are how the player makes narrative decisions. Patterns:

- **Standard:** 2-4 text buttons stacked vertically, centered on screen
- **Timed:** Choice fades or auto-selects after a timer (creates urgency)
- **Personality-colored:** Each choice tinted by its personality archetype (bold, shy, playful)
- **Consequence hints:** Subtle icons or colors hinting at the tone of each choice

```
┌──────────────────────────────────────────────────┐
│                                                  │
│  Dae: "So... what do you want to do tonight?"    │
│                                                  │
│  ┌──────────────────────────────────────────┐    │
│  │  💬 "Let's just talk for a while."       │    │
│  └──────────────────────────────────────────┘    │
│  ┌──────────────────────────────────────────┐    │
│  │  🌹 Move closer to her.                  │    │
│  └──────────────────────────────────────────┘    │
│  ┌──────────────────────────────────────────┐    │
│  │  🔥 "I've been thinking about you..."    │    │
│  └──────────────────────────────────────────┘    │
│                                                  │
└──────────────────────────────────────────────────┘
```

For our app, choice menus map to the "director commands" — user actions that steer the scene. Rather than typed `/commands`, present them as VN-style choice buttons that appear contextually.

### Scene Transitions

VN engines provide a rich vocabulary of transitions ([VNDev Wiki: Transition](https://vndev.wiki/Transition)):

| Transition | Implementation | Use Case |
|-----------|---------------|----------|
| **Dissolve** | Cross-fade opacity between two states | General scene changes |
| **Fade** | Fade to solid color (black/white) then fade in new scene | Major scene breaks, time skips |
| **Iris** | Circular mask that opens/closes from a point | Dramatic reveals, focus on character |
| **Blinds** | Horizontal/vertical slats reveal new scene | Stylistic, retro feel |
| **Pixellate** | Mosaic effect during transition | Dream sequences, memory flashbacks |
| **Curtain** | Vertical wipe from center or edge | Act breaks, theatrical |

**CSS/Framer Motion implementations:**

```css
/* Iris transition — circular reveal */
.iris-transition {
  clip-path: circle(0% at 50% 50%);
  animation: irisOpen 1.2s ease-out forwards;
}
@keyframes irisOpen {
  to { clip-path: circle(75% at 50% 50%); }
}

/* Pixellate — via SVG filter */
.pixellate-transition {
  filter: url(#pixellate);
  animation: depixellate 1.5s ease-out forwards;
}
```

### CG Gallery

Visual novels traditionally include a CG (computer graphics) gallery where players can revisit special artwork from scenes they've unlocked. For our app, this translates to:
- A gallery of AI-generated expression portraits from past scenes
- Scene "snapshots" — the ambient state (colors, particles, mood) frozen as a preview
- Accessed from the Scenes tab in IntimacySettingsHub
- Locked CGs shown as blurred thumbnails with bond/scene requirements

### Backlog UI

VNs allow scrolling back through previous dialogue (the "backlog" or "history"). Our chat already has scroll-back, but during immersive/NVL mode, we need a dedicated backlog:

```
┌──────────────────────────────────────────────────┐
│  History                                    [X]  │
│                                                  │
│  ┌────────────────────────────────────────────┐  │
│  │  Dae: "The rain's getting heavier..."     │  │
│  │  You moved closer to the window.           │  │
│  │  Dae: "I've been thinking..."              │  │
│  │  > You chose: "I've been thinking too."    │  │
│  │  Dae: "Really?" She smiled softly.         │  │
│  │  ▸ [Current line]                          │  │
│  └────────────────────────────────────────────┘  │
│                                                  │
│  [↑ Scroll] or mouse wheel                       │
└──────────────────────────────────────────────────┘
```

User choices shown with `>` prefix and highlighted. Current position marked with `▸`.

### Text Formatting Tags (Custom Markup)

Ren'Py supports inline tags for text styling: `{b}bold{/b}`, `{i}italic{/i}`, `{size=+4}larger{/size}`, `{color=#f00}red{/color}`, `{w=1.0}` (wait 1 second), `{nw}` (no-wait, auto-advance). We should implement a subset for LLM output:

| Tag | Effect | Use Case |
|-----|--------|----------|
| `*text*` | Italic | Character thought, whisper |
| `**text**` | Bold | Emphasis, passion |
| `***text***` | Bold italic | Intense emotion |
| `{pause:N}` | N ms delay in typewriter | Dramatic pause, hesitation |
| `{slow}text{/slow}` | Half CPS speed | Deliberate speech |
| `{fast}text{/fast}` | Double CPS speed | Excited/urgent speech |
| `{whisper}text{/whisper}` | Lighter weight, wider spacing, lower opacity | Hushed speech |
| `{breathless}text{/breathless}` | Tighter spacing, heavier weight | Excited/aroused |

The LLM can be prompted to use these tags via the `IntimateDirector` system prompt. The `TypewriterText` component parses and renders them.

### Scene Transition Implementation Matrix

Mapping VN transitions to our React + Framer Motion stack:

| VN Transition | CSS/Motion Implementation | Duration | When to Use |
|--------------|--------------------------|----------|-------------|
| Dissolve | `AnimatePresence` with opacity crossfade | 0.8-1.5s | Default scene change |
| Fade to black | `motion.div` overlay opacity 0→1→0, content swap during black | 1.5-2.5s | Time skip, major scene break |
| Fade to white | Same as above with white overlay | 1.5-2.5s | Dream sequence, memory |
| Iris in | `clip-path: circle()` animation | 1.0-1.5s | Focus on character, reveal |
| Iris out | Reverse circle clip-path | 0.8-1.2s | Scene end, dramatic close |
| Curtain | `clip-path: inset(0 50% 0 50%)` → `inset(0)` | 1.0-1.5s | Act break |
| Blinds | Multiple `clip-path: inset()` strips with stagger | 1.5-2.0s | Stylistic, dream-like |
| Pixellate | CSS `backdrop-filter` with `url(#pixellate-svg)` animated | 1.0-2.0s | Memory, flashback |
| Shake | `motion.div` with rapid x/y oscillation | 0.3-0.5s | Impact, surprise |
| Zoom | `scale` transform 1→1.5 with origin at character | 0.8-1.2s | Emotional close-up |

### Auto-Advance / Auto-Read Mode

VNs offer an auto-advance mode where text progresses automatically after a delay. For intimate scenes, this creates a more passive, immersive reading experience:

```typescript
interface AutoAdvanceConfig {
  enabled: boolean;
  baseDelay: number;      // ms per line (default: 3000)
  perCharDelay: number;   // additional ms per character (default: 50)
  pauseOnChoice: boolean; // always pause at choice menus (default: true)
  pauseOnPhaseChange: boolean; // pause at phase transitions (default: true)
}

// Calculate delay for a given line
function getAutoAdvanceDelay(text: string, config: AutoAdvanceConfig): number {
  return config.baseDelay + (text.length * config.perCharDelay);
}
```

A small progress bar below the text box shows when auto-advance will trigger, allowing the user to click to advance early or pause auto-mode.

### Save/Load Slots (Scene Bookmarks)

VNs have save/load systems. For our app, this translates to "scene bookmarks" — saving the current scene state so users can return to a specific moment:

```
┌──────────────────────────────────────────────────────────┐
│  Scene Bookmarks                                    [X]  │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │  🔖 Rainy Night In — Escalation                   │  │
│  │  "She moved closer, her hand finding yours..."    │  │
│  │  Mar 29, 2026 · 11:42 PM                          │  │
│  │  [Resume] [Delete]                                │  │
│  └────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────┐  │
│  │  🔖 Artist's Studio — Aftercare                   │  │
│  │  "The paint on her fingers had dried, but..."     │  │
│  │  Mar 28, 2026 · 9:15 PM                           │  │
│  │  [Resume] [Delete]                                │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │  + Save Current Scene                              │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

Each bookmark stores: scenario ID, scene phase, message history position, ambient state, character expression state. Stored in SQLite alongside the session.

---

## 8. Framer Motion Encyclopedia

### Overview

Motion (formerly Framer Motion) is our animation library. This section catalogs every pattern we'll use across intimate UI components, with production-ready code snippets. Motion was rebranded in 2025 as an independent project, now available as `motion` on npm with imports from `motion/react`. ([Motion](https://motion.dev/))

### Spring Physics Configurations

Spring animations create organic, physical-feeling motion. The three parameters:
- **stiffness** — Spring tension. Higher = snappier. Range: 50-1000.
- **damping** — Friction. Higher = less oscillation. Range: 5-100.
- **mass** — Weight of the animated element. Higher = more sluggish. Range: 0.1-5.

**Named presets for our UI:**

```typescript
export const springs = {
  // Gentle — settings panels, ambient reveals
  gentle: { type: 'spring', stiffness: 120, damping: 20, mass: 1 },

  // Snappy — button presses, selection indicators
  snappy: { type: 'spring', stiffness: 400, damping: 25, mass: 0.8 },

  // Bouncy — card entrances, playful interactions
  bouncy: { type: 'spring', stiffness: 300, damping: 15, mass: 1 },

  // Heavy — overlay panels, full-screen transitions
  heavy: { type: 'spring', stiffness: 200, damping: 30, mass: 1.5 },

  // Intimate — slow, deliberate, sensual
  intimate: { type: 'spring', stiffness: 80, damping: 25, mass: 1.2 },

  // Urgent — quick reactions, panic button
  urgent: { type: 'spring', stiffness: 600, damping: 35, mass: 0.5 },
} as const;
```

### AnimatePresence Patterns

`AnimatePresence` enables exit animations. Key modes:

```tsx
// mode="wait" — outgoing completes before incoming starts (settings tabs)
<AnimatePresence mode="wait">
  <motion.div
    key={activeTab}
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -10 }}
    transition={springs.gentle}
  >
    {renderTab(activeTab)}
  </motion.div>
</AnimatePresence>

// mode="popLayout" — items can exit independently (card grid filtering)
<AnimatePresence mode="popLayout">
  {filteredScenarios.map(scenario => (
    <motion.div
      key={scenario.id}
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={springs.bouncy}
    >
      <ScenarioCard {...scenario} />
    </motion.div>
  ))}
</AnimatePresence>
```

### Gesture Handlers

Motion provides gesture props for interactive elements ([Motion Gestures](https://www.framer.com/motion/gestures/)):

```tsx
// Hover + tap for scenario cards
<motion.div
  whileHover={{ scale: 1.02, boxShadow: '0 8px 24px rgba(0,0,0,0.15)' }}
  whileTap={{ scale: 0.98 }}
  transition={springs.snappy}
>
  <ScenarioCard />
</motion.div>

// Drag for intensity slider thumb
<motion.div
  drag="x"
  dragConstraints={{ left: 0, right: 200 }}
  dragElastic={0.1}
  onDrag={(_, info) => setIntensity(info.point.x / 200)}
  whileDrag={{ scale: 1.2, cursor: 'grabbing' }}
>
  <SliderThumb />
</motion.div>

// Pan gesture for swipeable scenario cards
<motion.div
  onPan={(_, info) => {
    if (Math.abs(info.offset.x) > 100) dismissCard();
  }}
  style={{ touchAction: 'pan-y' }}  // Required for touch devices
>
  <ScenarioCard />
</motion.div>
```

### Scroll-Linked Animations

Motion's `useScroll` hook drives animations from scroll position:

```tsx
import { useScroll, useTransform, motion } from 'motion/react';

function SceneBacklog() {
  const { scrollYProgress } = useScroll();

  // Fade ambient overlay based on scroll position in backlog
  const overlayOpacity = useTransform(scrollYProgress, [0, 0.5, 1], [0.1, 0.05, 0]);

  return (
    <>
      <motion.div className="ambient-overlay" style={{ opacity: overlayOpacity }} />
      <div className="backlog-content">
        {messages.map(msg => <BacklogLine key={msg.id} {...msg} />)}
      </div>
    </>
  );
}
```

### SVG Path Animation

For drawing animated icons (heart, shield, consent indicator):

```tsx
// Animated heart icon that draws itself
function HeartIcon({ isActive }: { isActive: boolean }) {
  return (
    <motion.svg viewBox="0 0 24 24" width={24} height={24}>
      <motion.path
        d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        initial={{ pathLength: 0 }}
        animate={{ pathLength: isActive ? 1 : 0 }}
        transition={{ duration: 0.8, ease: 'easeInOut' }}
      />
    </motion.svg>
  );
}
```

### Shared Layout Animations

For smooth transitions between list and detail views ([Motion Layout Animations](https://motion.dev/docs/react-layout-animations)):

```tsx
// Scenario card that expands to full detail view
function ScenarioBrowser() {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className="scenario-grid">
      {scenarios.map(scenario => (
        <motion.div
          key={scenario.id}
          layoutId={`scenario-${scenario.id}`}
          onClick={() => setExpandedId(scenario.id)}
          transition={springs.gentle}
        >
          {expandedId === scenario.id ? (
            <ScenarioDetail scenario={scenario} onClose={() => setExpandedId(null)} />
          ) : (
            <ScenarioCard scenario={scenario} />
          )}
        </motion.div>
      ))}
    </div>
  );
}
```

### Variants for Coordinated Animations

```tsx
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.06,
      delayChildren: 0.1,
    },
  },
};

const cardVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.95 },
  visible: { opacity: 1, y: 0, scale: 1 },
};

// Usage
<motion.div variants={containerVariants} initial="hidden" animate="visible">
  {scenarios.map(s => (
    <motion.div key={s.id} variants={cardVariants} transition={springs.bouncy}>
      <ScenarioCard {...s} />
    </motion.div>
  ))}
</motion.div>
```

### Performance Notes

- Motion's hybrid engine runs animations natively via the Web Animations API for 120fps, falling back to JavaScript for spring physics and gesture tracking ([Motion](https://motion.dev/))
- Use `layout` prop sparingly — it triggers expensive layout measurements. Prefer `animate` for simple transforms.
- `will-change: transform` is automatically applied by Motion; don't add it manually
- For lists of 50+ animated items, use `LazyMotion` to reduce bundle size

---

## 9. Color and Mood Systems

### Color Psychology for Intimate UI

Research from [MockFlow](https://mockflow.com/blog/color-psychology-in-ui-design), [UX Magazine](https://uxmag.com/articles/the-psychology-of-color-in-ui-ux-design), and [Toptal](https://www.toptal.com/designers/ux/color-in-ux) establishes clear emotional associations:

| Color Family | HSL Range | Emotional Association | Scene Phase Mapping |
|-------------|-----------|----------------------|-------------------|
| **Deep Rose** | `hsl(340-355, 50-70%, 40-55%)` | Romance, desire, passion | ESCALATION → PEAK |
| **Warm Amber** | `hsl(25-40, 60-80%, 45-60%)` | Comfort, warmth, candlelight | APPROACH → TENSION |
| **Soft Coral** | `hsl(10-20, 50-65%, 55-65%)` | Tenderness, vulnerability | TENSION |
| **Deep Burgundy** | `hsl(345-355, 40-60%, 25-35%)` | Intensity, depth, heat | PEAK |
| **Cool Lavender** | `hsl(260-280, 30-50%, 60-75%)` | Calm, afterglow, safety | AFTERCARE |
| **Midnight Blue** | `hsl(220-240, 30-50%, 15-25%)` | Intimacy, privacy, nighttime | Background base |
| **Blush Pink** | `hsl(350-10, 40-60%, 75-85%)` | Innocence, shyness, early flirtation | APPROACH |
| **Gold** | `hsl(45-55, 70-90%, 50-60%)` | Luxury, specialness, warmth | Highlights, accents |

**The 60-30-10 Rule Applied to Scene Phases:**

```
CASUAL:      60% neutral bg  / 30% surface  / 10% primary accent
APPROACH:    60% warm-shifted bg / 30% blush surface / 10% gold accent
TENSION:     60% amber-warm bg / 30% coral surface / 10% rose accent
ESCALATION:  60% deep warm bg / 30% rose surface / 10% deep rose accent
PEAK:        60% burgundy bg / 30% deep rose surface / 10% bright accent
AFTERCARE:   60% cool dark bg / 30% lavender surface / 10% soft gold accent
```

### Dynamic Theme Overlays per Scene Phase

Rather than creating 18x6 = 108 theme variants, we use CSS custom property overrides layered on top of the existing theme:

```css
/* Base intimate mode — applied to <body> when isIntimateMode === true */
body.intimate-mode {
  --intimate-wash-hue: 350;
  --intimate-wash-saturation: 60%;
  --intimate-wash-lightness: 50%;
  --intimate-wash-opacity: 0;
  --intimate-bg-shift: 0deg;
  --intimate-surface-warmth: 0;
  transition:
    --intimate-wash-opacity 2s ease,
    --intimate-bg-shift 3s ease,
    --intimate-surface-warmth 2s ease;
}

/* Phase-specific overrides */
body.intimate-mode[data-scene-phase="approach"] {
  --intimate-wash-opacity: 0.03;
  --intimate-bg-shift: 5deg;       /* Subtle warm shift */
  --intimate-surface-warmth: 0.02;
}

body.intimate-mode[data-scene-phase="tension"] {
  --intimate-wash-opacity: 0.06;
  --intimate-bg-shift: 10deg;
  --intimate-surface-warmth: 0.05;
}

body.intimate-mode[data-scene-phase="escalation"] {
  --intimate-wash-opacity: 0.10;
  --intimate-bg-shift: 15deg;
  --intimate-surface-warmth: 0.08;
}

body.intimate-mode[data-scene-phase="peak"] {
  --intimate-wash-opacity: 0.15;
  --intimate-bg-shift: 20deg;
  --intimate-surface-warmth: 0.12;
}

body.intimate-mode[data-scene-phase="aftercare"] {
  --intimate-wash-hue: 270;        /* Shift to lavender */
  --intimate-wash-opacity: 0.08;
  --intimate-bg-shift: -5deg;      /* Cool shift */
  --intimate-surface-warmth: -0.03;
}
```

**Theme-Aware Color Math:**

The overlay system reads the theme's base values and adjusts them:

```css
/* Apply warm shift to existing theme colors */
body.intimate-mode {
  --color-background: color-mix(
    in oklch,
    var(--theme-background),
    oklch(0.3 0.1 var(--intimate-wash-hue)) var(--intimate-wash-opacity)
  );
  --color-surface: color-mix(
    in oklch,
    var(--theme-surface),
    oklch(0.4 0.08 var(--intimate-wash-hue)) calc(var(--intimate-wash-opacity) * 0.7)
  );
}
```

This approach:
1. Works across all 18 themes automatically
2. Respects the theme's existing character (dark themes get darker, light themes get warmer)
3. Transitions smoothly over 2-3 seconds
4. Requires zero per-theme configuration
5. Uses modern `color-mix()` and `oklch` for perceptually uniform blending

### Mood-Reactive CSS Custom Properties

For components that need to react to mood in real-time (not just phase transitions):

```typescript
// In useIntimateStore — update CSS variables on mood change
function syncMoodToCSS(intimacyLevel: number, phase: ScenePhase) {
  const root = document.documentElement;
  root.style.setProperty('--mood-intensity', String(intimacyLevel / 10));
  root.style.setProperty('--mood-warmth', String(Math.min(intimacyLevel * 0.015, 0.15)));
  root.dataset.scenePhase = phase.toLowerCase();
}
```

Components can then use these variables:

```css
.chat-bubble {
  border-radius: calc(12px + var(--mood-intensity) * 4px);
  padding: calc(12px + var(--mood-intensity) * 2px);
}

.character-name {
  color: color-mix(
    in oklch,
    var(--color-text-primary),
    oklch(0.7 0.15 350) calc(var(--mood-warmth) * 100%)
  );
}
```

---

## 10. Particle and Ambient Effects

### Technology Comparison

| Technology | Max Particles @ 60fps | GPU Usage | Bundle Size | Interactivity |
|-----------|----------------------|-----------|-------------|---------------|
| **CSS-only** (radial gradients + animation) | 10-15 | Minimal | 0 KB | None |
| **tsParticles** (Canvas 2D) | 200-300 desktop | Low-Medium | ~40 KB | Full (hover, click, connect) |
| **tsParticles** (WebGL) | 600-900 desktop | Medium | ~55 KB | Full |
| **Three.js Points** (our viewer) | 10,000+ | Medium-High | Already loaded | Custom |
| **CSS Houdini** (paint worklets) | 50-100 | Low | ~5 KB | Limited |
| **Raw Canvas 2D** | 300-500 | Low-Medium | ~2 KB custom | Custom |

**Recommendation:** CSS-only for bokeh (always < 10 elements), tsParticles Canvas 2D for floating particles (cap at 30 elements), raw Canvas for performance-critical custom effects.

### Effect Catalog

**Floating Petals (cherry blossom / rose)**
- 15-25 petal shapes, slow drift + gentle rotation
- Colors: soft pink `hsl(350, 60%, 80%)` with slight hue variation per petal
- Motion: sinusoidal horizontal drift + linear downward fall + rotation
- Use case: APPROACH phase, romantic scenarios

```typescript
// tsParticles petal config
const petalConfig: ISourceOptions = {
  particles: {
    number: { value: 20 },
    shape: { type: 'image', image: { src: '/assets/petal.svg', width: 16, height: 16 } },
    size: { value: { min: 8, max: 16 } },
    opacity: { value: { min: 0.4, max: 0.8 }, animation: { enable: true, speed: 0.3 } },
    move: {
      enable: true,
      speed: { min: 0.5, max: 1.5 },
      direction: 'bottom',
      drift: { min: -1, max: 1 },
      spin: { enable: true, speed: 2 },
    },
    rotate: { value: { min: 0, max: 360 }, animation: { enable: true, speed: 3 } },
  },
  detectRetina: true,
};
```

**Embers (warm floating particles)**
- 10-20 small circles, slow upward drift
- Colors: warm orange-red gradient `hsl(15-35, 80%, 60%)`, glow effect via box-shadow
- Motion: upward drift with slight horizontal wobble, fade out at top
- Use case: ESCALATION and PEAK phases

**Sparkles (subtle glitter)**
- 20-30 tiny dots, random position, random twinkle
- Colors: white/gold with varying opacity (0.2-0.8)
- Motion: static position, opacity oscillation (twinkle)
- Use case: APPROACH phase, gentle ambiance

**Floating Hearts**
- 5-10 heart shapes, slow upward float from bottom
- Colors: theme accent with pink bias
- Motion: gentle S-curve upward, scale 0→1→0 over lifetime
- Use case: PEAK phase only (avoid overuse)

**Afterglow Motes**
- 8-12 soft circles, very slow random drift
- Colors: lavender/cool blue, large blur radius
- Motion: Brownian motion (random walk), very slow
- Use case: AFTERCARE phase

### Bokeh Effect (CSS-only)

```css
.bokeh-layer {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 50;
  overflow: hidden;
}

.bokeh-circle {
  position: absolute;
  border-radius: 50%;
  filter: blur(40px);
  opacity: 0;
  animation: bokehFloat 8s ease-in-out infinite, bokehFade 4s ease-in-out infinite;
}

.bokeh-circle:nth-child(1) { width: 120px; height: 120px; left: 10%; top: 20%; animation-delay: 0s; }
.bokeh-circle:nth-child(2) { width: 80px; height: 80px; right: 15%; top: 40%; animation-delay: 1.5s; }
.bokeh-circle:nth-child(3) { width: 150px; height: 150px; left: 50%; bottom: 20%; animation-delay: 3s; }
.bokeh-circle:nth-child(4) { width: 100px; height: 100px; right: 30%; top: 15%; animation-delay: 4.5s; }

@keyframes bokehFloat {
  0%, 100% { transform: translate(0, 0) scale(1); }
  25% { transform: translate(20px, -15px) scale(1.05); }
  50% { transform: translate(-10px, 10px) scale(0.95); }
  75% { transform: translate(15px, 5px) scale(1.02); }
}

@keyframes bokehFade {
  0%, 100% { opacity: 0.05; }
  50% { opacity: 0.15; }
}

/* Phase-dependent color */
body[data-scene-phase="tension"] .bokeh-circle { background: hsl(350, 60%, 60%); }
body[data-scene-phase="escalation"] .bokeh-circle { background: hsl(340, 70%, 50%); }
body[data-scene-phase="peak"] .bokeh-circle { background: hsl(330, 80%, 45%); }
body[data-scene-phase="aftercare"] .bokeh-circle { background: hsl(270, 40%, 65%); }
```

### Gradient Mesh / Aurora Effects

For deeper ambient backgrounds, we can use CSS or WebGL gradient mesh effects:

**CSS Aurora (pure CSS, no JS):**
```css
.aurora-bg {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: -1;
  background:
    radial-gradient(ellipse at 20% 50%, hsl(350, 60%, 30%, 0.15) 0%, transparent 50%),
    radial-gradient(ellipse at 80% 20%, hsl(280, 50%, 35%, 0.1) 0%, transparent 50%),
    radial-gradient(ellipse at 50% 80%, hsl(30, 70%, 40%, 0.1) 0%, transparent 50%);
  animation: auroraShift 20s ease-in-out infinite alternate;
  filter: blur(60px);
}

@keyframes auroraShift {
  0% { background-position: 0% 0%, 100% 0%, 50% 100%; }
  100% { background-position: 100% 100%, 0% 100%, 50% 0%; }
}
```

This creates a soft, shifting color wash with zero JS and minimal GPU impact. The `filter: blur(60px)` makes it feel dreamy and ambient. Phase-specific versions adjust the gradient colors.

**WebGL Gradient Mesh (for premium feel):**
For users with capable hardware, a WebGL shader creates much smoother gradient animations. Libraries like [Stripe's mesh gradient package](https://medium.com/design-bootcamp/moving-mesh-gradient-background-with-stripe-mesh-gradient-webgl-package-6dc1c69c4fa2) or [shader-gradient](https://tools.theblanck.co/) provide ready-made solutions. However, given our app already loads Three.js for the viewer, adding another WebGL context is risky for memory. Prefer the CSS aurora approach and reserve WebGL for a future "premium effects" toggle.

### Performance Budgets

| Effect Layer | Target FPS | Max CPU | Max GPU Memory | Kill Switch |
|-------------|-----------|---------|----------------|-------------|
| Bokeh (CSS) | 60 | < 1% | Negligible | `prefers-reduced-motion` |
| Particles (Canvas) | 60 | < 3% | < 5 MB | Settings toggle + reduced motion |
| Color wash (CSS) | 60 | < 0.5% | Negligible | Always on (too subtle to notice) |
| Aurora (CSS) | 60 | < 1% | Negligible | Settings toggle |
| Gradient mesh (WebGL) | 60 | < 5% | < 20 MB | Premium toggle only |

**Reduced motion:** All particle and animation effects check `window.matchMedia('(prefers-reduced-motion: reduce)')` and disable themselves. The color wash remains (it's static enough to not trigger motion sensitivity).

---

## 11. Typography for Intimate UI

### Font Pairing Strategy

Our app uses the theme's font stack, but intimate scenes deserve typographic differentiation:

| Context | Font Style | Weight | Size | Purpose |
|---------|-----------|--------|------|---------|
| **Character dialogue** | Theme default (sans-serif) | 400 | 15-16px | Regular chat |
| **Character whisper** | Same font, italic | 300 | 14px | Hushed/quiet moments |
| **Narration** | Serif or themed secondary font | 400 | 14px | Scene descriptions in NVL mode |
| **Internal thought** | Italic, slightly desaturated color | 300 | 14px | Character's inner monologue |
| **Emphasis/passion** | Same font | 600-700 | 15-16px | Emotionally charged dialogue |
| **Action text** | Monospace or small-caps | 400 | 13px | `/commands`, system actions |

### Variable Fonts for Emotional Emphasis

Variable fonts allow smooth interpolation between weights, enabling expressive text that reflects emotional intensity:

```css
/* Base intimate text */
.intimate-text {
  font-variation-settings: 'wght' 400;
  transition: font-variation-settings 0.5s ease;
}

/* Intensity-reactive weight */
.intimate-text[data-intensity="high"] {
  font-variation-settings: 'wght' 600;
}

/* Whispered text — lighter, wider spacing */
.whisper {
  font-variation-settings: 'wght' 300;
  letter-spacing: 0.08em;
  opacity: 0.85;
  font-style: italic;
}

/* Breathless/urgent — tighter, heavier */
.breathless {
  font-variation-settings: 'wght' 600;
  letter-spacing: -0.01em;
  line-height: 1.3;
}
```

### Letter-Spacing for Mood

Letter-spacing (tracking) profoundly affects reading feel ([Web Designer Depot](https://webdesignerdepot.com/the-designers-guide-to-letter-spacing/)):

| Mood | Letter-Spacing | Effect |
|------|---------------|--------|
| Whispered | `0.06-0.1em` | Airy, breathy, each letter feels deliberate |
| Normal dialogue | `0em` (default) | Natural reading speed |
| Tense | `-0.01em` | Slightly compressed, urgency |
| Passionate | `-0.02em` + bold | Words pushing together, intensity |
| Aftercare | `0.03em` | Gentle, spacious, relaxed |

### Line-Height for Pacing

Optimal line-height ranges from 1.3 to 1.7 ([Imperavi: UI Typography](https://imperavi.com/books/ui-typography/basis/line-spacing/)). For intimate text:

| Phase | Line-Height | Effect |
|-------|------------|--------|
| CASUAL | 1.5 | Normal comfortable reading |
| APPROACH | 1.6 | Slightly more breathing room, anticipation |
| TENSION | 1.4 | Tighter, building pressure |
| ESCALATION | 1.3 | Dense, urgent, close |
| PEAK | 1.2-1.3 | Minimal space, intensity |
| AFTERCARE | 1.7-1.8 | Maximum breathing room, relaxation |

### Text Shadow for Depth

Subtle text shadows can add depth and warmth to dialogue:

```css
/* Warm text glow during intimate phases */
.intimate-dialogue {
  text-shadow: 0 0 calc(var(--mood-intensity) * 20px) hsl(350, 60%, 50%, calc(var(--mood-intensity) * 0.1));
}

/* Soft candlelight flicker effect */
.candlelight-text {
  animation: candleFlicker 3s ease-in-out infinite;
}

@keyframes candleFlicker {
  0%, 100% { text-shadow: 0 0 10px hsl(35, 80%, 50%, 0.05); }
  33% { text-shadow: 0 0 12px hsl(30, 85%, 55%, 0.08); }
  66% { text-shadow: 0 0 8px hsl(40, 75%, 45%, 0.04); }
}
```

### Typewriter Speed Tied to Typography

The typewriter CPS should correlate with typographic mood:

| Mood | CPS | Letter-Spacing | Line-Height | Combined Effect |
|------|-----|---------------|------------|-----------------|
| Whispered | 15-25 | 0.08em | 1.6 | Slow, breathy, spacious |
| Conversational | 40-60 | 0em | 1.5 | Natural |
| Passionate | 60-80 | -0.01em | 1.3 | Fast, dense, urgent |
| Breathless | 80-100 | -0.02em | 1.2 | Very fast, compressed |
| Aftercare | 20-30 | 0.03em | 1.8 | Slow, gentle, spacious |

---

