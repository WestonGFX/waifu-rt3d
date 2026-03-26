# Landing Page — Immersive Animated Waveform Background

## Context

The audioform landing page has a plain black background with a static waveform SVG at 4% opacity. For a tool built for bass music artists and graphic designers, the landing page needs to *feel* like the product — futuristic, immersive, and undeniably audio-visual. We're building a multi-layered CSS animation system that creates depth, atmosphere, and motion without a single dependency.

## Design Vision

**The inside of a bass music event's LED wall, frozen in time and gently breathing.**

Multiple layers of waveform bars at different depths create a parallax-like depth effect. Each layer has different blur, opacity, bar width, and animation speed. A radial ambient glow pulses behind everything like stage lighting. Select bars emit neon glow. A horizontal scan line sweeps across like an oscilloscope. Film grain adds cinema texture. A mirrored reflection below the bars suggests a glossy floor surface. The background isn't pure black — it's a subtle dark gradient with violet undertones suggesting depth.

The scene should feel alive but not distracting — atmospheric, not noisy. A user should be able to stare at it for 30 seconds and notice new details emerging, but the UI (title, drop zone) should always be the clear focal point.

## Files to Modify

1. **`src/app/globals.css`** — Keyframe animations, glow effects, grain overlay, layer styles, vignette, reduced motion
2. **`src/app/page.tsx`** — Multi-layer bar system, ambient effects, entry animations (upload step only, lines 172-190)

---

## Detailed Implementation

### 1. `globals.css` — Complete Animation System

Add after the existing `@layer base` block. This is the full CSS needed:

```css
/* ═══════════════════════════════════════════════════════════
   LANDING PAGE WAVEFORM ANIMATION SYSTEM

   6 visual layers + 4 effect overlays = immersive audio scene

   Layer stack (bottom to top):
   0. Background gradient (dark violet undertones)
   1. Ambient radial glow (breathing stage light)
   2. Background bars (wide, blurred, slow — distant depth)
   3. Midground bars (medium, slight blur — middle depth)
   4. Foreground bars (thin, sharp, some with glow — near depth)
   5. Foreground reflection (mirrored, masked fade)
   6. Accent pulse flashes (random bright hits on select bars)
   7. Scan line sweep (oscilloscope-style horizontal line)
   8. Light rays (subtle radial streaks from center)
   9. Film grain (cinema texture)
   10. Vignette (dark edge framing)
   ═══════════════════════════════════════════════════════════ */

/* ─── Primary Animations ─── */

/* Bar pulse — smooth sine-wave breathing with opacity fade */
@keyframes waveform-pulse {
  0%, 100% {
    transform: scaleY(0.15);
    opacity: var(--bar-opacity-min, 0.4);
  }
  50% {
    transform: scaleY(var(--bar-scale, 1));
    opacity: 1;
  }
}

/* Ambient glow — central radial light that breathes like stage lighting */
@keyframes glow-breathe {
  0%, 100% {
    opacity: 0.12;
    transform: scale(0.85);
  }
  35% {
    opacity: 0.28;
    transform: scale(1.05);
  }
  65% {
    opacity: 0.22;
    transform: scale(1.12);
  }
}

/* Slow hue rotation for accent bars — shifts through violet→purple→magenta */
@keyframes hue-drift {
  0% { filter: hue-rotate(0deg) brightness(1); }
  25% { filter: hue-rotate(15deg) brightness(1.1); }
  50% { filter: hue-rotate(30deg) brightness(1); }
  75% { filter: hue-rotate(10deg) brightness(1.05); }
  100% { filter: hue-rotate(0deg) brightness(1); }
}

/* Horizontal scan line sweeping vertically across the scene */
@keyframes scanline {
  0% {
    transform: translateY(-100vh);
    opacity: 0;
  }
  5% { opacity: 1; }
  95% { opacity: 1; }
  100% {
    transform: translateY(100vh);
    opacity: 0;
  }
}

/* Random accent flash — brief bright pulse on select bars */
@keyframes accent-flash {
  0%, 85%, 100% {
    opacity: 0;
  }
  90% {
    opacity: 0.6;
  }
  95% {
    opacity: 0.2;
  }
}

/* Subtle film grain position shift */
@keyframes grain-shift {
  0%, 100% { transform: translate(0, 0); }
  10% { transform: translate(-2%, -3%); }
  20% { transform: translate(3%, 1%); }
  30% { transform: translate(-1%, 2%); }
  40% { transform: translate(2%, -2%); }
  50% { transform: translate(-3%, 3%); }
  60% { transform: translate(1%, -1%); }
  70% { transform: translate(-2%, 2%); }
  80% { transform: translate(3%, -3%); }
  90% { transform: translate(-1%, 1%); }
}

/* Entry animation — bars fade and scale in on page load */
@keyframes bars-enter {
  0% {
    opacity: 0;
    transform: scaleY(0);
  }
  100% {
    opacity: 1;
    transform: scaleY(1);
  }
}

/* Light ray pulse from center */
@keyframes ray-pulse {
  0%, 100% {
    opacity: 0.02;
  }
  50% {
    opacity: 0.06;
  }
}

/* ─── Layer Styles ─── */

.waveform-bar {
  animation: waveform-pulse var(--bar-duration, 2s) ease-in-out infinite;
  animation-delay: var(--bar-delay, 0s);
  transform-origin: bottom;
}

/* Background layer — deep blur for distance */
.waveform-layer-bg .waveform-bar {
  filter: blur(4px);
}

/* Midground layer — subtle blur */
.waveform-layer-mid .waveform-bar {
  filter: blur(1.5px);
}

/* Foreground layer — crisp and sharp */
.waveform-layer-fg .waveform-bar {
  filter: blur(0);
}

/* ─── Glow & Light Effects ─── */

/* Neon glow emission on select bars */
.waveform-bar-glow {
  box-shadow:
    0 0 6px rgba(139, 92, 246, 0.5),
    0 0 15px rgba(139, 92, 246, 0.2),
    0 0 30px rgba(139, 92, 246, 0.08);
}

/* Hue-drifting bars — color shifts through purple spectrum */
.waveform-bar-hue {
  animation:
    waveform-pulse var(--bar-duration, 2s) ease-in-out infinite,
    hue-drift 12s ease-in-out infinite;
  animation-delay: var(--bar-delay, 0s), 0s;
}

/* Accent flash overlay — brief bright hit like a beat transient */
.waveform-bar-accent {
  position: relative;
}
.waveform-bar-accent::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(to top, rgba(192, 132, 252, 0.8), rgba(255, 255, 255, 0.4));
  border-radius: inherit;
  animation: accent-flash var(--accent-cycle, 6s) ease-out infinite;
  animation-delay: var(--accent-delay, 0s);
}

/* Ambient radial glow — stage lighting effect */
.ambient-glow {
  animation: glow-breathe 7s ease-in-out infinite;
  background: radial-gradient(
    ellipse 60% 45% at 50% 45%,
    rgba(139, 92, 246, 0.2) 0%,
    rgba(124, 58, 237, 0.1) 30%,
    rgba(139, 92, 246, 0.03) 55%,
    transparent 75%
  );
}

/* Secondary glow — offset, warmer, creates asymmetry */
.ambient-glow-secondary {
  animation: glow-breathe 9s ease-in-out infinite;
  animation-delay: -3s;
  background: radial-gradient(
    ellipse 40% 35% at 60% 40%,
    rgba(167, 139, 250, 0.1) 0%,
    rgba(192, 132, 252, 0.04) 40%,
    transparent 65%
  );
}

/* ─── Scan Line ─── */

.scan-line {
  animation: scanline 10s linear infinite;
  animation-delay: 4s;
  background: linear-gradient(
    to bottom,
    transparent,
    transparent 46%,
    rgba(139, 92, 246, 0.04) 48%,
    rgba(192, 132, 252, 0.1) 50%,
    rgba(139, 92, 246, 0.04) 52%,
    transparent 54%,
    transparent
  );
  height: 200%;
  width: 100%;
}

/* ─── Reflection ─── */

.waveform-reflection {
  transform: scaleY(-1);
  mask-image: linear-gradient(to bottom, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0.05) 40%, transparent 65%);
  -webkit-mask-image: linear-gradient(to bottom, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0.05) 40%, transparent 65%);
}

/* ─── Film Grain ─── */

.grain-overlay {
  animation: grain-shift 0.4s steps(8) infinite;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.05'/%3E%3C/svg%3E");
  background-size: 256px 256px;
}

/* ─── Vignette ─── */

.vignette {
  background: radial-gradient(
    ellipse 70% 60% at center,
    transparent 30%,
    rgba(0, 0, 0, 0.4) 100%
  );
}

/* ─── Light Rays ─── */

.light-rays {
  animation: ray-pulse 8s ease-in-out infinite;
  animation-delay: 2s;
  background:
    conic-gradient(
      from 80deg at 50% 45%,
      transparent 0deg,
      rgba(139, 92, 246, 0.03) 5deg,
      transparent 12deg,
      transparent 60deg,
      rgba(167, 139, 250, 0.02) 65deg,
      transparent 72deg,
      transparent 140deg,
      rgba(139, 92, 246, 0.04) 145deg,
      transparent 155deg,
      transparent 220deg,
      rgba(192, 132, 252, 0.02) 225deg,
      transparent 235deg,
      transparent 300deg,
      rgba(139, 92, 246, 0.03) 305deg,
      transparent 315deg
    );
}

/* ─── Background Gradient ─── */

.bg-scene {
  background: radial-gradient(
    ellipse 120% 80% at 50% 60%,
    rgba(30, 15, 45, 1) 0%,
    rgba(15, 8, 25, 1) 50%,
    rgba(8, 4, 15, 1) 100%
  );
}

/* ─── Entry Animation ─── */

.bars-enter-stagger {
  animation: bars-enter 1.2s ease-out both;
  animation-delay: var(--enter-delay, 0s);
}

/* ─── Reduced Motion ─── */

@media (prefers-reduced-motion: reduce) {
  .waveform-bar,
  .ambient-glow,
  .ambient-glow-secondary,
  .scan-line,
  .grain-overlay,
  .light-rays {
    animation: none !important;
  }
  .waveform-bar {
    transform: scaleY(var(--bar-scale, 0.5));
    opacity: 0.5;
  }
  .scan-line {
    display: none;
  }
}
```

### 2. `page.tsx` — Multi-Layer Waveform System

#### Bar Data Constants (defined outside the component, above `export default function Home()`)

**Design rationale for bar distribution:**
- Bar heights follow a rough bell curve — tallest in center, shortest at edges — mimicking a natural audio waveform
- No two adjacent bars share the same duration AND delay combination
- Background bars are fewer and wider (suggesting distance)
- Foreground bars are more numerous and thinner (suggesting proximity)
- Select foreground bars have `glow: true` for neon emission
- Select bars have `hue: true` for color-shifting through the purple spectrum
- Select bars have `accent: true` + `accentCycle`/`accentDelay` for beat-like bright flashes

```tsx
/** Bar configuration for a single waveform bar. */
interface BarConfig {
  /** Max height in pixels (32-300). */
  height: number;
  /** Peak scale factor during pulse (0.4-1.0). */
  scale: number;
  /** Animation cycle duration in seconds. */
  duration: number;
  /** Animation start delay in seconds. */
  delay: number;
  /** Whether this bar emits a purple neon glow. */
  glow?: boolean;
  /** Whether this bar color-shifts through the purple spectrum. */
  hue?: boolean;
  /** Whether this bar gets occasional bright flash accents. */
  accent?: boolean;
  /** Accent flash cycle duration (only if accent=true). */
  accentCycle?: number;
  /** Accent flash delay offset (only if accent=true). */
  accentDelay?: number;
}

/**
 * Background layer — wide bars, heavily blurred, slow movement.
 * Creates depth: these feel "far away" behind everything.
 * Wider gaps between bars suggest empty space at distance.
 */
const BG_BARS: BarConfig[] = [
  { height: 80, scale: 0.5, duration: 4.2, delay: 0.0 },
  { height: 140, scale: 0.6, duration: 4.8, delay: 0.4 },
  { height: 200, scale: 0.7, duration: 5.1, delay: 0.8 },
  { height: 260, scale: 0.8, duration: 4.5, delay: 0.2 },
  { height: 300, scale: 0.9, duration: 5.4, delay: 0.6 },
  { height: 280, scale: 1.0, duration: 4.9, delay: 1.0 },
  { height: 300, scale: 1.0, duration: 5.2, delay: 0.3 },
  { height: 260, scale: 0.9, duration: 4.6, delay: 0.7 },
  { height: 200, scale: 0.8, duration: 5.0, delay: 1.1 },
  { height: 140, scale: 0.6, duration: 4.3, delay: 0.5 },
  { height: 100, scale: 0.5, duration: 4.7, delay: 0.9 },
  { height: 60, scale: 0.4, duration: 5.3, delay: 0.1 },
];

/**
 * Midground layer — medium width, subtle blur, moderate timing.
 * The "workhorse" layer that gives the most visible waveform shape.
 * More bars than BG, tighter gaps, faster animation.
 */
const MID_BARS: BarConfig[] = [
  { height: 40, scale: 0.5, duration: 2.8, delay: 0.0 },
  { height: 56, scale: 0.6, duration: 3.1, delay: 0.2 },
  { height: 48, scale: 0.5, duration: 2.6, delay: 0.4 },
  { height: 72, scale: 0.7, duration: 3.4, delay: 0.15 },
  { height: 64, scale: 0.6, duration: 2.9, delay: 0.5 },
  { height: 96, scale: 0.8, duration: 3.2, delay: 0.3 },
  { height: 88, scale: 0.7, duration: 2.7, delay: 0.6 },
  { height: 112, scale: 0.9, duration: 3.5, delay: 0.1 },
  { height: 104, scale: 0.8, duration: 3.0, delay: 0.45 },
  { height: 128, scale: 0.9, duration: 3.3, delay: 0.65 },
  { height: 144, scale: 1.0, duration: 2.8, delay: 0.25 },
  { height: 160, scale: 1.0, duration: 3.6, delay: 0.55 },
  { height: 168, scale: 1.0, duration: 3.1, delay: 0.7 },
  { height: 160, scale: 0.9, duration: 2.9, delay: 0.35 },
  { height: 144, scale: 0.8, duration: 3.4, delay: 0.15 },
  { height: 120, scale: 0.9, duration: 3.0, delay: 0.55 },
  { height: 100, scale: 0.7, duration: 3.2, delay: 0.4 },
  { height: 84, scale: 0.6, duration: 2.8, delay: 0.7 },
  { height: 68, scale: 0.7, duration: 3.5, delay: 0.2 },
  { height: 52, scale: 0.5, duration: 3.1, delay: 0.5 },
];

/**
 * Foreground layer — thin sharp bars, fast and punchy, richest detail.
 * Select bars have glow (neon emission), hue (color shift), and
 * accent (occasional bright flash like a beat transient).
 * This layer has the most bars and the most visual information.
 */
const FG_BARS: BarConfig[] = [
  { height: 32, scale: 0.6, duration: 2.2, delay: 0.0 },
  { height: 48, scale: 0.7, duration: 2.5, delay: 0.15 },
  { height: 40, scale: 0.5, duration: 2.0, delay: 0.3 },
  { height: 64, scale: 0.8, duration: 2.8, delay: 0.1, glow: true },
  { height: 56, scale: 0.6, duration: 2.3, delay: 0.25 },
  { height: 80, scale: 0.9, duration: 2.6, delay: 0.4, accent: true, accentCycle: 7, accentDelay: 1.5 },
  { height: 96, scale: 0.7, duration: 2.1, delay: 0.2, glow: true, hue: true },
  { height: 72, scale: 0.8, duration: 2.9, delay: 0.35 },
  { height: 112, scale: 0.9, duration: 2.4, delay: 0.5 },
  { height: 104, scale: 0.7, duration: 2.7, delay: 0.15, glow: true },
  { height: 128, scale: 1.0, duration: 2.5, delay: 0.45, accent: true, accentCycle: 5.5, accentDelay: 3.0 },
  { height: 144, scale: 0.8, duration: 2.2, delay: 0.6 },
  { height: 136, scale: 0.9, duration: 3.0, delay: 0.3, glow: true, hue: true },
  { height: 160, scale: 1.0, duration: 2.6, delay: 0.55 },
  { height: 180, scale: 1.0, duration: 2.8, delay: 0.7, glow: true, accent: true, accentCycle: 8, accentDelay: 0.5 },
  { height: 200, scale: 1.0, duration: 2.3, delay: 0.4, hue: true },
  { height: 192, scale: 0.9, duration: 3.1, delay: 0.65, glow: true },
  { height: 176, scale: 1.0, duration: 2.5, delay: 0.5 },
  { height: 152, scale: 0.9, duration: 2.7, delay: 0.35, accent: true, accentCycle: 6, accentDelay: 4.0 },
  { height: 140, scale: 0.8, duration: 2.4, delay: 0.75, glow: true, hue: true },
  { height: 120, scale: 0.9, duration: 2.9, delay: 0.2 },
  { height: 108, scale: 0.7, duration: 2.1, delay: 0.6 },
  { height: 88, scale: 0.8, duration: 2.6, delay: 0.45, glow: true },
  { height: 96, scale: 0.6, duration: 2.3, delay: 0.1, accent: true, accentCycle: 9, accentDelay: 2.0 },
  { height: 72, scale: 0.7, duration: 2.8, delay: 0.55 },
  { height: 64, scale: 0.9, duration: 2.0, delay: 0.3, glow: true },
  { height: 56, scale: 0.5, duration: 2.5, delay: 0.7 },
  { height: 48, scale: 0.6, duration: 2.2, delay: 0.4 },
  { height: 40, scale: 0.7, duration: 2.7, delay: 0.15 },
  { height: 32, scale: 0.5, duration: 2.4, delay: 0.5 },
];
```

#### Rendering Helper Function (outside component)

```tsx
/**
 * Render a single waveform bar with optional glow, hue-shift, and accent effects.
 *
 * Builds the appropriate CSS classes and inline style custom properties
 * based on the bar's configuration.
 */
function renderBar(bar: BarConfig, index: number, barWidth: string, gradient: string) {
  const classes = [
    "waveform-bar",
    barWidth,
    "rounded-t-sm",
    `bg-gradient-to-t ${gradient}`,
    bar.glow ? "waveform-bar-glow" : "",
    bar.hue ? "waveform-bar-hue" : "",
    bar.accent ? "waveform-bar-accent" : "",
    "bars-enter-stagger",
  ].filter(Boolean).join(" ");

  const style: Record<string, string | number> = {
    height: `${bar.height}px`,
    "--bar-scale": bar.scale,
    "--bar-duration": `${bar.duration}s`,
    "--bar-delay": `${bar.delay}s`,
    "--bar-opacity-min": 0.3,
    "--enter-delay": `${index * 0.03}s`,
  };

  if (bar.accent && bar.accentCycle) {
    style["--accent-cycle"] = `${bar.accentCycle}s`;
    style["--accent-delay"] = `${bar.accentDelay || 0}s`;
  }

  return (
    <div
      key={index}
      className={classes}
      style={style as React.CSSProperties}
    />
  );
}
```

#### JSX Structure (replaces lines 172-190 in the upload step)

The static SVG gets replaced with this complete layered composition. The outer container div's className changes from `bg-background` to include `bg-scene`:

```tsx
{/* Change the outer div className to use the scene background: */}
{/* className="relative flex min-h-screen ... bg-scene ... overflow-hidden" */}

{/* ═══ IMMERSIVE WAVEFORM BACKGROUND ═══ */}

{/* Layer 0: Ambient radial glow — primary (centered, violet) */}
<div className="ambient-glow absolute inset-0 pointer-events-none" aria-hidden="true" />

{/* Layer 0b: Ambient glow — secondary (offset right, warmer purple) */}
<div className="ambient-glow-secondary absolute inset-0 pointer-events-none" aria-hidden="true" />

{/* Layer 1: Background bars — 12 wide bars, blurred, slow */}
<div
  className="waveform-layer-bg absolute inset-0 flex items-end justify-center gap-[16px] pb-[38vh] pointer-events-none opacity-[0.04]"
  aria-hidden="true"
>
  {BG_BARS.map((bar, i) => renderBar(bar, i, "w-[8px]", "from-[#7c3aed] to-[#a78bfa]"))}
</div>

{/* Layer 2: Midground bars — 20 medium bars, slight blur */}
<div
  className="waveform-layer-mid absolute inset-0 flex items-end justify-center gap-[8px] pb-[38vh] pointer-events-none opacity-[0.06]"
  aria-hidden="true"
>
  {MID_BARS.map((bar, i) => renderBar(bar, i, "w-[5px]", "from-[#8b5cf6] to-[#c084fc]"))}
</div>

{/* Layer 3: Foreground bars — 30 thin bars, sharp, glow+accents */}
<div
  className="waveform-layer-fg absolute inset-0 flex items-end justify-center gap-[5px] pb-[38vh] pointer-events-none opacity-[0.12]"
  aria-hidden="true"
>
  {FG_BARS.map((bar, i) => renderBar(bar, i, "w-[3px]", "from-[#8b5cf6] to-[#c084fc]"))}
</div>

{/* Layer 4: Reflection — mirrored foreground, faded */}
<div
  className="waveform-layer-fg waveform-reflection absolute inset-0 flex items-end justify-center gap-[5px] pb-[38vh] pointer-events-none opacity-[0.025]"
  aria-hidden="true"
>
  {FG_BARS.map((bar, i) => renderBar(
    { ...bar, glow: false, accent: false, hue: false },
    i, "w-[3px]", "from-[#8b5cf6] to-[#c084fc]"
  ))}
</div>

{/* Layer 5: Light rays — subtle radial streaks from center */}
<div className="light-rays absolute inset-0 pointer-events-none" aria-hidden="true" />

{/* Layer 6: Scan line sweep */}
<div className="scan-line absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true" />

{/* Layer 7: Film grain texture */}
<div className="grain-overlay absolute inset-0 pointer-events-none opacity-[0.025]" aria-hidden="true" />

{/* Layer 8: Vignette — dark edges framing the scene */}
<div className="vignette absolute inset-0 pointer-events-none" aria-hidden="true" />
```

---

## Layer Architecture Reference

| # | Layer | Elements | Width | Blur | Opacity | Speed | Purpose |
|---|-------|----------|-------|------|---------|-------|---------|
| 0 | Ambient glow (primary) | 1 radial gradient | Full | None | 12-28% | 7s | Stage lighting warmth |
| 0b | Ambient glow (secondary) | 1 radial gradient | Full | None | ~half of primary | 9s (offset -3s) | Asymmetric light, visual interest |
| 1 | BG bars | 12 bars | 8px, gap 16px | 4px | 4% | 4.2-5.4s | Distant depth layer |
| 2 | Mid bars | 20 bars | 5px, gap 8px | 1.5px | 6% | 2.7-3.6s | Middle depth, workhorse |
| 3 | FG bars | 30 bars | 3px, gap 5px | 0 | 12% | 2.0-3.1s | Sharp near detail |
| 4 | Reflection | 30 bars (mirrored) | 3px, gap 5px | 0 | 2.5% | Same as FG | Glossy floor effect |
| 5 | Light rays | Conic gradient | Full | None | 2-6% | 8s | Radial light streaks |
| 6 | Scan line | Horizontal gradient | Full | None | 4-10% | 10s (4s initial delay) | Oscilloscope sweep |
| 7 | Film grain | SVG noise (inlined) | Full (tiled) | None | 2.5% | 0.4s (stepped) | Cinema texture |
| 8 | Vignette | Radial gradient | Full | None | Static 40% edge | None | Dark edge framing |

## Color Palette

| Element | Color | Hex/RGBA | Notes |
|---------|-------|----------|-------|
| Background gradient center | Deep violet-black | `rgba(30,15,45,1)` | Not pure black — has violet undertone |
| Background gradient mid | Dark violet | `rgba(15,8,25,1)` | Transitions to near-black |
| Background gradient edge | Near-black | `rgba(8,4,15,1)` | Almost black but with depth |
| BG bar bottom | Violet-700 | `#7c3aed` | Deeper, more distant |
| BG bar top | Violet-400 | `#a78bfa` | Lighter at top |
| Mid/FG bar bottom | Violet-500 | `#8b5cf6` | Brand primary |
| Mid/FG bar top | Violet-300 | `#c084fc` | Brand secondary |
| Glow emission (inner) | Violet-500 | `rgba(139,92,246,0.5)` | Tight neon core |
| Glow emission (mid) | Violet-500 | `rgba(139,92,246,0.2)` | Medium spread |
| Glow emission (outer) | Violet-500 | `rgba(139,92,246,0.08)` | Wide soft halo |
| Ambient glow center | Violet-500 | `rgba(139,92,246,0.2)` | Stage light core |
| Accent flash peak | Violet-300 + white | Gradient | Beat transient bright hit |
| Scan line center | Violet-300 | `rgba(192,132,252,0.1)` | Brightest point of sweep |
| Vignette | Pure black | `rgba(0,0,0,0.4)` at edges | Frames the scene |

## Animation Timing Architecture

The system avoids synchronization through intentional timing variety:

**Bar layers — speeds decrease with distance (like real depth perception):**
- FG bars: 2.0–3.1s (fast, punchy — close objects move quickly)
- Mid bars: 2.7–3.6s (moderate — middle distance)
- BG bars: 4.2–5.4s (slow, atmospheric — distant objects drift)

**Effect layers — all on different prime-ish cycles to avoid alignment:**
- Ambient glow primary: 7s
- Ambient glow secondary: 9s (offset -3s — out of phase with primary)
- Scan line: 10s (4s initial delay — doesn't start immediately)
- Light rays: 8s (2s initial delay)
- Film grain: 0.4s stepped (perceptual noise, not smooth)
- Hue drift: 12s (very slow, barely noticeable color shift)
- Accent flashes: 5.5–9s per bar (rare, unpredictable feeling)

**Entry animation:**
- Each bar fades/scales in from 0 on page load
- Staggered by 0.03s per bar index (30 bars × 0.03s = 0.9s total cascade)
- Creates a "waveform building itself" effect on first visit

**Why these specific cycle lengths:**
- No two effect layers share a common factor (7, 9, 10, 8, 12 are all relatively prime-ish)
- This means they won't align for ~2520 seconds (42 minutes) — the scene never feels like it "loops"
- The accent flashes use different cycles per bar (5.5s, 6s, 7s, 8s, 9s) — random-feeling but deterministic

## Reduced Motion Support

For users with `prefers-reduced-motion: reduce`:
- All animations are disabled
- Bars are shown at a static 50% scale — still visible as a design element
- Scan line is hidden entirely
- Grain texture is static
- The scene still looks designed, just not animated

## Performance Budget

- All animations use `transform` and `opacity` — GPU-composited, zero layout thrashing
- `filter: blur()` on BG/Mid layers is CSS class-based, not animated — computed once on paint
- The grain SVG is an inlined data URI (no network request), tiled at 256×256px
- Total new DOM elements: ~80 divs (62 bar divs across 3 layers + 12 reflection + 6 effect divs)
- `will-change` is intentionally NOT set — setting it on 80+ elements wastes GPU memory. The browser's compositor handles this automatically for `transform`/`opacity` animations.
- Estimated additional paint cost: minimal — all layers are simple colored rectangles with alpha compositing

## Verification Checklist

1. **Screenshot** — layered purple bars visible behind title with ambient glow
2. **Depth effect** — BG bars blurry, mid bars slightly blurry, FG bars sharp
3. **Glow emission** — select FG bars have visible purple neon halos
4. **Hue shift** — select bars slowly drift through violet→purple→magenta
5. **Accent flashes** — occasional brief bright hits on select bars (watch for 10-15s)
6. **Scan line** — horizontal purple line sweeps top-to-bottom every ~10s (first appears after 4s)
7. **Light rays** — very subtle radial streaks from center (barely visible, adds depth)
8. **Grain** — very subtle noise texture on close inspection
9. **Reflection** — faint mirror of foreground bars below the waveform
10. **Vignette** — edges of screen are slightly darker, framing the scene
11. **Background color** — not pure black, has subtle violet undertone
12. **Readability** — "audioform" title, subtitle, and drop zone clearly readable
13. **Entry animation** — on page load, bars cascade in from left to right
14. **Other steps** — bars do NOT appear on artist info or prompt steps
15. **Reduced motion** — toggle `prefers-reduced-motion` in DevTools, verify static but designed
16. **Performance** — DevTools Performance tab shows 60fps, no jank
17. **Mobile** — bars compress/clip gracefully on narrow viewports
