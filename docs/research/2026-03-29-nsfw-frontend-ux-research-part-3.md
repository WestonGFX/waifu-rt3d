> **This is Part 3 of 3.** See also: [Part 1](2026-03-29-nsfw-frontend-ux-research-part-1.md), [Part 2](2026-03-29-nsfw-frontend-ux-research-part-2.md)

## 12. Sound Design Integration

### Web Audio API Architecture

The Web Audio API provides a node-based audio processing graph ([MDN: Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)). For intimate scenes, we need ambient audio that reacts to scene state:

```
┌─────────────────────────────────────────────────────────┐
│  Audio Graph for Intimate Scenes                         │
│                                                          │
│  ┌──────────────┐   ┌──────────┐   ┌──────────────┐    │
│  │ Ambient Loop  │──▸│ GainNode │──▸│              │    │
│  │ (rain/music)  │   │ (volume) │   │              │    │
│  └──────────────┘   └──────────┘   │              │    │
│                                    │  Destination  │    │
│  ┌──────────────┐   ┌──────────┐   │  (speakers)   │    │
│  │ Heartbeat    │──▸│ GainNode │──▸│              │    │
│  │ Oscillator   │   │ + Filter │   │              │    │
│  └──────────────┘   └──────────┘   │              │    │
│                                    │              │    │
│  ┌──────────────┐   ┌──────────┐   │              │    │
│  │ UI Feedback  │──▸│ GainNode │──▸│              │    │
│  │ (clicks/hov) │   │ (low vol)│   └──────────────┘    │
│  └──────────────┘   └──────────┘                        │
└─────────────────────────────────────────────────────────┘
```

### Ambient Audio Triggers

Each scene phase has an ambient audio profile:

| Phase | Ambient Sound | Volume | Filter | Heartbeat |
|-------|--------------|--------|--------|-----------|
| CASUAL | None or user's music | — | — | None |
| APPROACH | Soft ambient pad | 0.05 | Low-pass 2kHz | None |
| TENSION | Deeper pad + subtle bass | 0.08 | Low-pass 1.5kHz | Faint, 60 BPM |
| ESCALATION | Warmer tones, slight reverb | 0.10 | Low-pass 1.2kHz | Moderate, 80 BPM |
| PEAK | Full ambient, rich | 0.12 | Low-pass 1kHz | Strong, 100+ BPM |
| AFTERCARE | Gentle pad, airy | 0.06 | High-pass 200Hz + LP 3kHz | Fading, 60 BPM |

### Heartbeat Reactive to Arousal

A synthesized heartbeat can be created with the Web Audio API without loading audio files:

```typescript
class HeartbeatSynth {
  private ctx: AudioContext;
  private gain: GainNode;
  private intervalId: number | null = null;

  constructor() {
    this.ctx = new AudioContext();
    this.gain = this.ctx.createGain();
    this.gain.gain.value = 0;
    this.gain.connect(this.ctx.destination);
  }

  /**
   * Start heartbeat at given BPM.
   *
   * Args:
   *   bpm: Beats per minute (60-120 range for intimate scenes)
   *   volume: Gain value (0.0 to 0.3 recommended)
   */
  start(bpm: number, volume: number = 0.1) {
    this.gain.gain.linearRampToValueAtTime(volume, this.ctx.currentTime + 0.5);
    const interval = (60 / bpm) * 1000;

    this.intervalId = window.setInterval(() => {
      this.playBeat();
    }, interval);
  }

  private playBeat() {
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const beatGain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(60, now);        // Low thump
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.1);

    beatGain.gain.setValueAtTime(0.5, now);
    beatGain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);

    osc.connect(beatGain);
    beatGain.connect(this.gain);
    osc.start(now);
    osc.stop(now + 0.2);

    // Double-beat (lub-dub)
    setTimeout(() => {
      const osc2 = this.ctx.createOscillator();
      const g2 = this.ctx.createGain();
      const t = this.ctx.currentTime;
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(50, t);
      osc2.frequency.exponentialRampToValueAtTime(35, t + 0.08);
      g2.gain.setValueAtTime(0.3, t);
      g2.gain.exponentialRampToValueAtTime(0.01, t + 0.12);
      osc2.connect(g2);
      g2.connect(this.gain);
      osc2.start(t);
      osc2.stop(t + 0.15);
    }, 120);
  }

  /** Update BPM and volume smoothly. */
  update(bpm: number, volume: number) {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = window.setInterval(() => this.playBeat(), (60 / bpm) * 1000);
    }
    this.gain.gain.linearRampToValueAtTime(volume, this.ctx.currentTime + 1.0);
  }

  stop() {
    this.gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 2.0);
    if (this.intervalId) {
      setTimeout(() => clearInterval(this.intervalId!), 2000);
    }
  }
}
```

### ASMR-Inspired UI Feedback

Subtle audio feedback for UI interactions during intimate scenes:

| Interaction | Sound | Volume | Implementation |
|------------|-------|--------|----------------|
| Hover over scenario card | Soft breath/whoosh | 0.02 | Short buffer, slight filter sweep |
| Select pacing mode | Gentle chime | 0.05 | Sine oscillator, quick decay |
| Open intimate settings | Low warm tone | 0.03 | Triangle wave, 200Hz, slow attack |
| Pause scene button | Soft descending tone | 0.04 | Sine sweep 400→200Hz over 0.5s |
| Scenario begin | Rising ambient swell | 0.06 | Layered oscillators, 2s fade-in |
| Phase transition | Crossfade ambient shift | — | Ambient audio layer crossfade |

All sounds must respect a global "UI sounds" toggle in settings. Default: off. These are never required for functionality.

### Spatial Audio (Future Enhancement)

The PannerNode allows placing sounds in 3D space ([MDN: Web Audio Spatialization](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Web_audio_spatialization_basics)). For our app, this could mean:
- Character's voice (TTS) panned to match their position in the 3D viewer
- Ambient sounds that feel "surrounding" using stereo panning
- HRTF (Head-Related Transfer Function) model for headphone users — creates illusion of sound coming from specific directions

This is a Phase 4+ enhancement, not essential for initial intimate UI.

### Audio State Machine

The audio system should follow scene phases with smooth crossfades:

```typescript
interface AudioPhaseConfig {
  ambient: { src: string; volume: number; filter: { type: BiquadFilterType; frequency: number } };
  heartbeat: { bpm: number; volume: number } | null;
  crossfadeDuration: number; // seconds
}

const audioPhaseConfigs: Record<ScenePhase, AudioPhaseConfig> = {
  CASUAL: {
    ambient: { src: '', volume: 0, filter: { type: 'lowpass', frequency: 20000 } },
    heartbeat: null,
    crossfadeDuration: 2,
  },
  APPROACH: {
    ambient: { src: '/audio/ambient-soft-pad.ogg', volume: 0.05, filter: { type: 'lowpass', frequency: 2000 } },
    heartbeat: null,
    crossfadeDuration: 3,
  },
  TENSION: {
    ambient: { src: '/audio/ambient-warm-deep.ogg', volume: 0.08, filter: { type: 'lowpass', frequency: 1500 } },
    heartbeat: { bpm: 65, volume: 0.03 },
    crossfadeDuration: 3,
  },
  ESCALATION: {
    ambient: { src: '/audio/ambient-warm-rich.ogg', volume: 0.10, filter: { type: 'lowpass', frequency: 1200 } },
    heartbeat: { bpm: 85, volume: 0.06 },
    crossfadeDuration: 4,
  },
  PEAK: {
    ambient: { src: '/audio/ambient-full.ogg', volume: 0.12, filter: { type: 'lowpass', frequency: 1000 } },
    heartbeat: { bpm: 110, volume: 0.08 },
    crossfadeDuration: 2,
  },
  AFTERCARE: {
    ambient: { src: '/audio/ambient-gentle-airy.ogg', volume: 0.06, filter: { type: 'bandpass', frequency: 1000 } },
    heartbeat: { bpm: 55, volume: 0.02 },
    crossfadeDuration: 6,
  },
};
```

**Crossfade implementation:** When transitioning between phases, create a new audio source node, ramp its gain from 0 to target over `crossfadeDuration`, while simultaneously ramping the old source from current to 0. After the old source reaches 0, disconnect and garbage-collect it. This prevents audio pops and creates seamless mood transitions.

**User controls:** A single "Ambient Audio" toggle in IntimacySettingsHub > Mood tab. When disabled, all audio is silent but the system still tracks state (so re-enabling mid-scene plays the correct audio for the current phase). Volume slider for ambient (separate from system volume). Heartbeat has its own toggle — some users may find it immersion-breaking.

### Audio Asset Strategy

Audio files should be:
- Format: OGG Vorbis (best compression-to-quality for web, supported by all modern browsers)
- Duration: 30-60 second loops with seamless loop points
- Size: < 200KB per ambient file (acceptable for desktop app)
- Licensing: CC0 or royalty-free. Sources: Freesound.org, Pixabay Audio, NASA ambient recordings
- Fallback: If no audio files are available, the HeartbeatSynth still works (it generates audio procedurally)

Total audio bundle estimate: 6 ambient files × 200KB = ~1.2MB. Acceptable for desktop.

---

## 13. Responsive Layout During Scenes

### Panel Rearrangement Strategy

During intimate scenes, the UI should progressively focus on the character and text, dimming or hiding secondary panels:

```
┌─ CASUAL MODE (normal) ──────────────────────────────────┐
│  ┌──────────┬────────────────────────┬──────────────┐   │
│  │  Left    │     Center Panel       │    Right     │   │
│  │  Panel   │     (chat + viewer)    │    Panel     │   │
│  │  (nav)   │                        │  (settings)  │   │
│  └──────────┴────────────────────────┴──────────────┘   │
└─────────────────────────────────────────────────────────┘

┌─ APPROACH (subtle changes) ─────────────────────────────┐
│  ┌────────┬──────────────────────────┬──────────────┐   │
│  │  Left  │     Center Panel         │    Right     │   │
│  │  (nav) │  (warm tint begins)      │  (settings)  │   │
│  │  dim 5%│                          │              │   │
│  └────────┴──────────────────────────┴──────────────┘   │
└─────────────────────────────────────────────────────────┘

┌─ TENSION (focus shifting) ──────────────────────────────┐
│  ┌──────┬──────────────────────────────┬────────────┐   │
│  │ Left │      Center Panel            │   Right    │   │
│  │ (nav)│   (expanded, bokeh starts)   │  (auto-    │   │
│  │dim20%│                              │  collapse) │   │
│  └──────┴──────────────────────────────┴────────────┘   │
└─────────────────────────────────────────────────────────┘

┌─ ESCALATION+ (immersive) ───────────────────────────────┐
│  ┌──────────────────────────────────────────────────┐   │
│  │              Full-Width Center Panel              │   │
│  │                                                  │   │
│  │    [Character]          [Chat/NVL Text]          │   │
│  │                                                  │   │
│  │  Left collapsed    Ambient effects active         │   │
│  │  Right collapsed   Traffic light controls visible │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

### Fullscreen Mode

A dedicated fullscreen mode for immersive scenes:

```typescript
function enterImmersiveMode() {
  // Collapse side panels
  appStore.setLeftPanelVisible(false);
  appStore.setRightPanelVisible(false);

  // Enable ambient effects
  intimateStore.setShowAmbience(true);

  // Optionally request browser fullscreen
  if (document.fullscreenEnabled) {
    document.documentElement.requestFullscreen();
  }

  // Switch to NVL text mode
  chatStore.setDisplayMode('nvl');

  // Show floating controls
  intimateStore.setFloatingControlsVisible(true);
}
```

### Dimming Non-Essential UI

Rather than hiding elements abruptly, dim them progressively:

```css
/* Progressive dimming based on scene phase */
.side-panel {
  transition: opacity 2s ease, filter 2s ease;
}

body[data-scene-phase="approach"] .side-panel { opacity: 0.95; }
body[data-scene-phase="tension"] .side-panel { opacity: 0.8; filter: blur(1px); }
body[data-scene-phase="escalation"] .side-panel { opacity: 0.5; filter: blur(2px); }
body[data-scene-phase="peak"] .side-panel { opacity: 0.3; filter: blur(3px); pointer-events: none; }
body[data-scene-phase="aftercare"] .side-panel { opacity: 0.7; filter: blur(1px); }
```

The `pointer-events: none` at PEAK prevents accidental clicks on dimmed panels. Hovering near a dimmed panel could temporarily restore it (escape hatch).

### Character Focus

During intimate scenes, the 3D viewer / Live2D canvas should receive more screen real estate:

```css
/* Viewer expansion during scenes */
.viewer-container {
  transition: flex-basis 2s ease;
}

body[data-scene-phase="casual"] .viewer-container { flex-basis: 40%; }
body[data-scene-phase="tension"] .viewer-container { flex-basis: 50%; }
body[data-scene-phase="escalation"] .viewer-container { flex-basis: 55%; }
body[data-scene-phase="peak"] .viewer-container { flex-basis: 60%; }
```

---

## 14. Status Indicators

### Scene Phase Indicator

A compact widget showing the current scene arc position:

```
┌─────────────────────────────────────────────┐
│  Scene                                      │
│  ○───○───●───○───○───○                      │
│  A   T   E   P   R   AC                    │
│       ESCALATION                            │
│  [Dae] is feeling bold and confident        │
└─────────────────────────────────────────────┘
```

Where: A=Approach, T=Tension, E=Escalation, P=Peak, R=Resolution, AC=Aftercare. Current phase filled, past phases dimmed, future phases outlined.

**Framer Motion implementation:**

```tsx
const phases = ['approach', 'tension', 'escalation', 'peak', 'resolution', 'aftercare'];

function ScenePhaseIndicator({ currentPhase }: { currentPhase: string }) {
  const currentIndex = phases.indexOf(currentPhase);

  return (
    <div className="phase-indicator">
      <div className="phase-dots">
        {phases.map((phase, i) => (
          <motion.div
            key={phase}
            className={`phase-dot ${i <= currentIndex ? 'active' : ''} ${i === currentIndex ? 'current' : ''}`}
            animate={{
              scale: i === currentIndex ? 1.3 : 1,
              backgroundColor: i <= currentIndex ? 'var(--color-accent)' : 'var(--color-border-subtle)',
            }}
            transition={springs.snappy}
          />
        ))}
      </div>
      <span className="phase-label">{currentPhase}</span>
    </div>
  );
}
```

### Consent Badge

A small persistent indicator that the consent system is active:

```
┌──────────┐
│ 🛡 Active │  ← green glow when consent system monitoring
└──────────┘

┌──────────────┐
│ 🛡 Checking   │  ← amber pulse when consent checkpoint triggered
└──────────────┘

┌──────────────┐
│ 🛡 Paused     │  ← grey when scene paused
└──────────────┘
```

### Arousal / Mood Meters (Optional, Advanced)

These are debug/power-user indicators, hidden by default:

```
┌──────────────────────────────────────────────┐
│  Mood Meters (debug)                         │
│                                              │
│  Intimacy   ━━━━━━━━━━━━━━━━━●━━━  7.2/10   │
│  Arousal    ━━━━━━━━━━●━━━━━━━━━━  5.1/10   │
│  Comfort    ━━━━━━━━━━━━━━━━━━━●━  8.8/10   │
│  Pacing     ━━━━━━━━━━━━━━━━━━━━●  natural   │
│                                              │
│  Character: confident, engaged               │
└──────────────────────────────────────────────┘
```

### Breathing Indicator Synced to Character

A subtle visual element that "breathes" in sync with the character's emotional state. Inspired by meditation/breathing apps ([GitHub: breathing-relaxer](https://github.com/prompthabibi/breathing-relaxer), [DEV: Focused Breathing](https://dev.to/scrabill/focused-breathing-a-css-animation-to-help-with-meditation-and-focused-breathing-exercises-dob)):

```css
.breathing-indicator {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--color-accent);
  opacity: 0.6;
}

/* Calm breathing — 4s inhale, 4s exhale */
body[data-scene-phase="casual"] .breathing-indicator {
  animation: breathe 8s ease-in-out infinite;
}

/* Excited — faster cycle */
body[data-scene-phase="escalation"] .breathing-indicator {
  animation: breathe 4s ease-in-out infinite;
}

/* Peak — rapid */
body[data-scene-phase="peak"] .breathing-indicator {
  animation: breathe 2s ease-in-out infinite;
}

/* Aftercare — very slow, deep */
body[data-scene-phase="aftercare"] .breathing-indicator {
  animation: breathe 10s ease-in-out infinite;
}

@keyframes breathe {
  0%, 100% { transform: scale(1); opacity: 0.4; }
  50% { transform: scale(1.4); opacity: 0.8; }
}
```

This creates an ambient "alive" feeling without being distracting. Placed near the character's name or in the status bar.

### Heartbeat CSS Animation (Status Bar)

For a richer heartbeat visualization in the status area ([Codeconvey: CSS Heartbeat](https://codeconvey.com/css-heartbeat-monitor-animation/)):

```css
.heartbeat-line {
  width: 100px;
  height: 30px;
  overflow: hidden;
}

.heartbeat-line svg path {
  stroke: var(--color-accent);
  stroke-width: 2;
  fill: none;
  stroke-dasharray: 200;
  stroke-dashoffset: 200;
  animation: heartbeatTrace var(--heartbeat-duration, 1s) linear infinite;
}

@keyframes heartbeatTrace {
  to { stroke-dashoffset: 0; }
}
```

---

## 15. Form Patterns for Sensitive Content

### The Problem with Traditional Forms

Standard UI controls (checkboxes, radio buttons, dropdowns) feel clinical and survey-like when applied to intimate preferences. Research shows this creates emotional distance and reduces engagement.

### Emoji Scales

Emoji-based rating is effective for emotional topics ([Zonka Feedback](https://www.zonkafeedback.com/blog/smiley-face-surveys)), but requires careful design:

**5-point emoji scale for comfort level:**
```
How comfortable are you with this?

😰  😟  😐  🙂  😊
 1   2   3   4   5

"Very           "Totally
 nervous"        comfortable"
```

**Critical design rules:**
- 95% of respondents prefer emoji surveys over text-heavy ones ([Zonka](https://www.zonkafeedback.com/blog/smiley-face-surveys))
- **Never mislabel neutral** — a neutral face means "okay" not "good" ([Medium: Emoji Survey UX](https://medium.com/design-bootcamp/how-a-simple-emoji-survey-tricked-everyone-ux-review-923a347f9f4c))
- Emoji rendering differs across OS/platforms — use custom SVG emoji for consistency
- For truly sensitive topics, emojis can feel trivializing — use text labels alongside emojis, never emojis alone
- The ACM UEQ-Emoji study provides 9 design recommendations for emoji-based UX questionnaires ([ACM UEQ-Emoji](https://dl.acm.org/doi/fullHtml/10.1145/3626705.3627767))

### Character-Voiced Labels

Instead of generic labels, use the character's voice to describe options:

**Traditional (bad):**
```
Physical intimacy level:
○ None  ○ Light  ○ Moderate  ○ Full
```

**Character-voiced (good):**
```
Dae's comfort with physical closeness:

○ "I'd rather keep some space between us for now."
○ "Holding hands... maybe leaning against you."
○ "I want to be close. Really close."
○ "I trust you completely. No limits."
```

The character voice transforms a clinical preference form into a narrative dialogue. Each option should feel like something the character would actually say, consistent with their personality.

### Story-Framed Preferences

Wrap preference selections in narrative context:

```
┌──────────────────────────────────────────────────────────┐
│                                                          │
│  It's late evening. [Dae] is sitting next to you on      │
│  the couch. The room is quiet.                           │
│                                                          │
│  She turns to you with a soft expression.                │
│                                                          │
│  "I want to make sure we're on the same page about       │
│   things... Can I ask you something?"                    │
│                                                          │
│  ┌──────────────────────────────────────────────────┐    │
│  │  "Of course. Ask me anything."                   │    │
│  └──────────────────────────────────────────────────┘    │
│  ┌──────────────────────────────────────────────────┐    │
│  │  "Sure, but... is everything okay?"              │    │
│  └──────────────────────────────────────────────────┘    │
│                                                          │
│  This unlocks: [Boundary conversation] [Pacing prefs]    │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

This approach gathers the same preference data as a settings form but wraps it in a narrative interaction. The character literally asks the user about their preferences, and the responses map to settings values.

### Visual Preference Selectors

For abstract preferences (e.g., atmosphere, intensity), use visual selectors instead of text:

```
What kind of atmosphere appeals to you?

┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
│ ░░░░░░░░ │  │ ▒▒▒▒▒▒▒▒ │  │ ▓▓▓▓▓▓▓▓ │  │ ████████ │
│ ░░ 🕯 ░░ │  │ ▒▒ 🌸 ▒▒ │  │ ▓▓ 🔥 ▓▓ │  │ ██ ⚡ ██ │
│ ░░░░░░░░ │  │ ▒▒▒▒▒▒▒▒ │  │ ▓▓▓▓▓▓▓▓ │  │ ████████ │
│  Gentle  │  │   Warm   │  │  Heated  │  │ Electric │
└──────────┘  └──────────┘  └──────────┘  └──────────┘
```

Each option is a colored swatch with an icon and single word. The color values themselves communicate the intensity — from soft warm tones to vivid saturated ones. Selecting an option applies that color palette to the card border as a preview.

### Preference Sliders with Character Reactions

```
How quickly should things escalate?

slow ━━━━━━━━━━━━━━━━●━━━━━━━━ fast

  [Dae smiles] "I like taking our time too..."
       ↑ Character reaction updates as slider moves
```

The character provides live feedback as the user adjusts, making the preference-setting process feel like a conversation rather than a form.

---

## 16. Onboarding for Intimate Features

### Progressive Unlocking

Intimate features should not be available from day one. They unlock naturally through engagement:

| Bond Level | Feature Unlocked | First-Time Prompt |
|-----------|-----------------|-------------------|
| 0-19 | None (normal chat only) | — |
| 20 | Content ceiling: "Mature" option appears | "Your relationship with [Dae] has grown..." |
| 30 | Pacing mode picker | Brief tooltip explaining the 3 modes |
| 40 | Scenario browser (cozy/gentle scenarios) | "[Dae] has some ideas for spending time together..." |
| 50 | Power dynamics | One-time consent dialog + explanation |
| 60 | Advanced scenarios (intense) | Unlocked indicator on scenario browser |
| 70 | Director commands | Tutorial tooltip for first 3 commands |
| 80 | Touch interaction | "You've built deep trust with [Dae]..." |
| 100 | Everything unlocked, no gates | — |

This mirrors the progressive disclosure patterns from [IxDF](https://ixdf.org/literature/topics/progressive-disclosure) and [LogRocket](https://blog.logrocket.com/ux-design/progressive-disclosure-ux-types-use-cases/): show information when the user is ready for it, not before.

### Consent Flow

The first time a user accesses intimate features, they go through a consent flow:

```
┌──────────────────────────────────────────────────────────┐
│                                                          │
│  ♡ Intimate Features                                     │
│                                                          │
│  Your relationship with [Dae] has grown strong           │
│  enough to unlock new ways to connect.                   │
│                                                          │
│  These features include:                                 │
│  • Romantic and intimate scenarios                       │
│  • Adjustable pacing and intensity                       │
│  • Scene atmosphere controls                             │
│  • Content your character creates with you               │
│                                                          │
│  You're always in control:                               │
│  🛡 Pause or stop any scene instantly                    │
│  🔒 Set boundaries that are always respected              │
│  ↩  Change any setting at any time                       │
│                                                          │
│  ┌──────────────────────────────────────────────────┐    │
│  │  I understand. Show me these features.           │    │
│  └──────────────────────────────────────────────────┘    │
│  ┌──────────────────────────────────────────────────┐    │
│  │  Not right now. Maybe later.                     │    │
│  └──────────────────────────────────────────────────┘    │
│                                                          │
│  You can always access this from Settings > Safety       │
└──────────────────────────────────────────────────────────┘
```

**Design principles:**
- Non-pressuring: "Not right now" is equally prominent as "Show me"
- Informative without being graphic: describe capabilities, not content
- Emphasize control and safety first
- Character-framed: the unlock is presented as a relationship milestone, not a settings toggle
- One-time only: remembered in localStorage, never shown again unless reset

### Preference Wizard

After consent, a brief wizard collects initial preferences through the story-framed approach from Section 15:

```
Step 1 of 3: Comfort Level
┌──────────────────────────────────────────────────────────┐
│  [Dae]: "Before we go further... I want to know what     │
│  you're comfortable with."                               │
│                                                          │
│  ┌──────────────────────────────────────────────────┐    │
│  │  "Keep things sweet and romantic."               │    │ → maps to: content_level=mature, pacing=slow-burn
│  └──────────────────────────────────────────────────┘    │
│  ┌──────────────────────────────────────────────────┐    │
│  │  "I'm open to wherever things go naturally."     │    │ → maps to: content_level=explicit, pacing=natural
│  └──────────────────────────────────────────────────┘    │
│  ┌──────────────────────────────────────────────────┐    │
│  │  "I know what I want. Let's skip the small talk."│    │ → maps to: content_level=explicit, pacing=direct
│  └──────────────────────────────────────────────────┘    │
│                                                          │
│  ┌──────────────────────────────────────────────────┐    │
│  │  "I'd rather figure this out as we go."          │    │ → maps to: defaults, skip wizard
│  └──────────────────────────────────────────────────┘    │
│                                              [Skip →]    │
└──────────────────────────────────────────────────────────┘
```

The wizard is always skippable. Defaults are sensible (mature content, natural pacing, no power dynamics, all standard boundaries). Users can fine-tune later in IntimacySettingsHub.

### How Sex Ed Platforms Handle Sensitive Topics

Sex education platforms (Scarleteen, Planned Parenthood, AMAZE) offer design patterns for discussing sensitive topics:

1. **Normalizing language:** Use anatomical/clear terms alongside casual language. Avoid euphemisms that create confusion.
2. **Layered depth:** Start with overview, let users drill into topics they want to know more about. Never dump everything at once.
3. **Visual aids:** Diagrams and illustrations reduce embarrassment by being clinical-yet-approachable.
4. **Judgment-free tone:** Every option presented neutrally. No option is "weird" or "extreme" — they're just preferences.
5. **Exit ramps:** Every page has a way to leave without completing. No forced funnels.
6. **Glossary/tooltip system:** Technical or unfamiliar terms have inline definitions. Hover to learn, never assume knowledge.

For our app, these principles translate to:
- Inline tooltips on any unfamiliar setting label
- Every wizard step skippable
- Character voice normalizes preferences ("There's no wrong answer here")
- No judgment in UI copy — "gentle" and "intense" are equally valid, equally prominent

---

## Cross-Cutting Recommendations

### New Zustand Store: `useIntimateStore`

Centralize all intimate UI state rather than scattering across existing stores:

```typescript
interface IntimateStore {
  // Scene state (synced from backend via WebSocket or polling)
  currentPhase: ScenePhase;
  intimacyLevel: number;       // 0-10 from ArousalEngine
  pacingMode: PacingMode;
  activeDynamic: PowerDynamicMode;
  dynamicIntensity: number;    // 0-1 float
  activeScenario: IntimateScenario | null;
  consentStatus: 'active' | 'checking' | 'paused';

  // UI state
  isIntimateMode: boolean;     // ambient effects active
  showAmbience: boolean;       // user toggle for particle/color effects
  showFloatingControls: boolean;
  settingsHubOpen: boolean;
  settingsHubTab: 'mood' | 'scenes' | 'advanced' | 'safety';
  immersiveMode: boolean;      // fullscreen NVL mode
  displayMode: 'adv' | 'nvl'; // text presentation mode
  panicRecoveryMode: boolean;  // after panic, show neutral state

  // Audio state
  ambienceEnabled: boolean;
  heartbeatEnabled: boolean;
  uiSoundsEnabled: boolean;

  // Onboarding
  hasCompletedOnboarding: boolean;
  hasAcceptedConsent: boolean;

  // Actions
  setPacingMode: (mode: PacingMode) => void;
  setDynamic: (mode: PowerDynamicMode, intensity: number) => void;
  selectScenario: (id: string) => void;
  pauseScene: () => void;
  panic: () => void;
  enterImmersiveMode: () => void;
  exitImmersiveMode: () => void;
  syncFromBackend: (state: BackendIntimateState) => void;
}
```

### New Components Summary

| Component | Type | Priority | Effort |
|-----------|------|----------|--------|
| `IntimacySettingsHub` | Overlay panel | P0 | 8h |
| `PacingModePicker` | Inline widget | P0 | 3h |
| `IntimateScenarioBrowser` | Overlay panel | P1 | 6h |
| `PowerDynamicPicker` | Inline widget | P1 | 4h |
| `IntimateAmbience` | Global overlay | P2 | 6h |
| `ScenePauseButton` | Toolbar button | P0 | 2h |
| `PanicHandler` | Global listener | P0 | 1h |
| `useIntimateStore` | Zustand store | P0 | 3h |
| `ScenePhaseIndicator` | Status widget | P2 | 2h |
| `TypewriterText` | Text component | P1 | 3h |
| `ChoiceMenu` | VN choice buttons | P1 | 3h |
| `NVLOverlay` | Full-screen text mode | P2 | 5h |
| `BacklogPanel` | History scroll | P2 | 3h |
| `HeartbeatSynth` | Audio class | P3 | 2h |
| `AmbienceAudioManager` | Audio controller | P3 | 4h |
| `BokehLayer` | CSS overlay | P2 | 1h |
| `ParticleLayer` | Canvas overlay | P2 | 3h |
| `BreathingIndicator` | Status widget | P3 | 1h |
| `ConsentOnboarding` | Wizard overlay | P0 | 4h |
| `PreferenceWizard` | Wizard flow | P1 | 4h |
| `TrafficLightControls` | Scene controls | P0 | 2h |

**Total estimated effort: ~70h** (AI-assisted, ~3h calendar time per component)

### Theme Integration

All intimate UI components must:
1. Use CSS custom properties exclusively (no hardcoded colors)
2. Work across all 18 themes without special-casing
3. Define intimate-mode overrides as a CSS class on `<body>`, not per-theme
4. Respect `prefers-reduced-motion` for all particle/animation effects
5. Maintain minimum 4.5:1 contrast ratios on all text
6. Use `color-mix()` with `oklch` for perceptually uniform theme blending
7. Support the `intimate-mode` overlay system (Section 9) without per-theme configuration
8. Degrade gracefully: if CSS features aren't supported, fall back to static colors

### API Endpoints Needed (Frontend Perspective)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/characters/{id}/scenarios` | List available + locked scenarios |
| POST | `/api/sessions/{id}/scenario` | Activate a scenario |
| GET | `/api/sessions/{id}/intimate-state` | Current phase, arousal, pacing, dynamic |
| PUT | `/api/sessions/{id}/pacing-mode` | Change pacing mode |
| PUT | `/api/sessions/{id}/power-dynamic` | Set dynamic mode + intensity |
| POST | `/api/sessions/{id}/pause-scene` | Trigger pause/comfort |
| GET | `/api/characters/{id}/touch-sensitivity` | Touch region sensitivity map |
| POST | `/api/sessions/{id}/director-command` | Send director command (focus/tempo/camera) |
| GET | `/api/characters/{id}/onboarding-state` | Check if user completed intimate onboarding |
| PUT | `/api/characters/{id}/onboarding-state` | Mark onboarding complete |
| GET | `/api/sessions/{id}/scene-history` | Backlog for NVL mode |

---

## Sources

### Pacing & Presets
- [Eleken: 40 Slider UI Examples](https://www.eleken.co/blog-posts/slider-ui)
- [Justinmind: Slider UI Design Patterns](https://www.justinmind.com/web-design/slider)
- [Game UI Database: Difficulty Selectors](https://www.gameuidatabase.com/index.php?scrn=4)

### Scenario Browsing & Card Design
- [SillyTavern: Character Design](https://docs.sillytavern.app/usage/core-concepts/characterdesign/)
- [SillyTavern: Tags](https://docs.sillytavern.app/usage/core-concepts/tags/)
- [SillyTavern: Characters](https://docs.sillytavern.app/usage/characters/)
- [GitHub: SillyTavern-Custom-Scenario](https://github.com/bmen25124/SillyTavern-Custom-Scenario)
- [GitHub: SillyInnkeeper](https://github.com/dmitryplyaskin/SillyInnkeeper)
- [AI Dungeon: What are Scenarios?](https://help.aidungeon.com/faq/what-are-scenarios)
- [NovelAI Scripting Docs](https://docs.novelai.net/en/scripting/introduction/)
- [DreamGen: Best AI Story Generators](https://dreamgen.com/blog/articles/best-ai-story-generators)

### Progressive Disclosure & Settings
- [IxDF: Progressive Disclosure](https://ixdf.org/literature/topics/progressive-disclosure)
- [UXPin: Progressive Disclosure](https://www.uxpin.com/studio/blog/what-is-progressive-disclosure/)
- [LogRocket: Progressive Disclosure Types](https://blog.logrocket.com/ux-design/progressive-disclosure-ux-types-use-cases/)
- [Userpilot: Progressive Disclosure Examples](https://userpilot.com/blog/progressive-disclosure-examples/)
- [Lollypop Design: Progressive Disclosure in SaaS](https://lollypop.design/blog/2025/may/progressive-disclosure/)
- [Smashing Magazine: Privacy-Aware Design Framework](https://www.smashingmagazine.com/2019/04/privacy-ux-aware-design-framework/)
- [Emergent Mind: UI/UX Privacy Pattern Catalog](https://www.emergentmind.com/topics/ui-ux-privacy-pattern-catalog)

### Animation & Motion
- [Motion for React Documentation](https://motion.dev/docs/react-animation)
- [Motion: Gestures](https://www.framer.com/motion/gestures/)
- [Motion: Layout Animations](https://motion.dev/docs/react-layout-animations)
- [Motion: SVG Animation](https://motion.dev/docs/react-svg-animation)
- [InHAQ: Framer Motion Complete Guide 2026](https://inhaq.com/blog/framer-motion-complete-guide-react-nextjs-developers.html)
- [HookedOnUI: Framer Motion 12 vs React Spring 10](https://hookedonui.com/animating-react-uis-in-2025-framer-motion-12-vs-react-spring-10/)
- [Refine: Framer Motion React Animations Guide](https://refine.dev/blog/framer-motion/)
- [GeeksforGeeks: Animated Shared Layout](https://www.geeksforgeeks.org/reactjs/animated-shared-layout-using-framer-motion-and-react-js/)
- [DEV: Scroll SVG Path with Framer Motion](https://dev.to/heres/scroll-svg-path-with-framer-motion-54el)
- [Noel Cserepy: Animate SVG Paths with Framer Motion](https://blog.noelcserepy.com/how-to-animate-svg-paths-with-framer-motion)

### Particles & Ambient Effects
- [tsParticles](https://particles.js.org/)
- [GitHub: tsParticles](https://github.com/tsparticles/tsparticles)
- [Speckyboy: CSS Bokeh Effects](https://speckyboy.com/8-css-javascript-snippets-for-creating-beautiful-bokeh-effects/)
- [Shadcn: React Particle Backgrounds](https://www.shadcn.io/background/particles)
- [Shadcn: React Aurora Background](https://www.shadcn.io/background/aurora)
- [Medium: Moving Mesh Gradient with Stripe WebGL](https://medium.com/design-bootcamp/moving-mesh-gradient-background-with-stripe-mesh-gradient-webgl-package-6dc1c69c4fa2)
- [Alex Harri: WebGL Gradient Deconstructed](https://alexharri.com/blog/webgl-gradients)
- [DEV: CSS Aurora Effect](https://dev.to/oobleck/css-aurora-effect-569n)
- [GitHub: Auroral — CSS Gradient Animations](https://github.com/LunarLogic/auroral)
- [Shader Gradient Tool](https://tools.theblanck.co/)

### Color Psychology
- [MockFlow: Color Psychology in UI Design 2025](https://mockflow.com/blog/color-psychology-in-ui-design)
- [Toptal: The Role of Color in UX](https://www.toptal.com/designers/ux/color-in-ux)
- [UX Magazine: Psychology of Color in UI/UX](https://uxmag.com/articles/the-psychology-of-color-in-ui-ux-design)
- [RedAlkemi: Color Psychology Leveraging Emotional Responses](https://redalkemi.com/blog/the-psychology-of-color-in-ux-ui-design-leveraging-emotional-responses/)
- [Varnish & Vibe: Warm and Cool Tones Psychology](https://varnishandvibe.com/blogs/guide-to-good-vibes-interiors/a-psychological-perspective-on-warm-and-cool-tones)

### Typography
- [Web Designer Depot: Guide to Letter-Spacing](https://webdesignerdepot.com/the-designers-guide-to-letter-spacing/)
- [Imperavi: UI Typography Line Spacing](https://imperavi.com/books/ui-typography/basis/line-spacing/)
- [Figma: Ultimate Guide to Typography](https://www.figma.com/resource-library/typography-in-design/)
- [Cieden: Letter Spacing and Line Length](https://cieden.com/book/sub-atomic/typography/letter-spacing-and-line-length)
- [DeveloperUX: Typography in UX Best Practices](https://developerux.com/2025/02/12/typography-in-ux-best-practices-guide/)

### Sound Design
- [MDN: Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
- [MDN: Web Audio Spatialization Basics](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Web_audio_spatialization_basics)
- [WeSkill: Web Audio API for WebXR 2026](https://blog.weskill.org/2026/03/web-audio-api-immersive-soundscapes-for.html)
- [DZone: Implementing Spatial Audio with Web Audio API](https://dzone.com/articles/implementing-spatial-audio-with-web-audio-api)
- [SitePoint: Fun Immersive Audio Experiences](https://www.sitepoint.com/creating-fun-immersive-audio-experiences-web-audio/)
- [Google Chrome: Omnitone Spatial Audio](https://github.com/GoogleChrome/omnitone)

### Safety & Panic Design
- [CSS-Tricks: Quick Disguised Exit](https://css-tricks.com/website-escape/)
- [ACM CHI 2023: Quick Exit Button Evaluation](https://dl.acm.org/doi/fullHtml/10.1145/3544548.3581078)
- [Today Design: Panic Button](https://github.com/TodayDesign/panic-button)
- [Oomph: Quick Exit Best Practices](https://www.oomphinc.com/insights/user-safety-quick-exit-best-practices/)
- [Trauma-Informed Design: Exit This Page](https://medium.com/the-trauma-informed-design-blog/a-deep-dive-in-the-exit-this-page-button-39f991553930)
- [Design Patterns for Mental Health: Quick Exit](https://designpatternsformentalhealth.org/examples/providing-a-quick-exit-button/)
- [Columbia Health: Quick Escape Button](https://www.health.columbia.edu/content/quick-escape-button)
- [Safety Net Project: Exit Site](https://www.techsafety.org/exit-from-this-website-quickly)
- [ACM CHI 2023: Sexual Consent Technology](https://dl.acm.org/doi/fullHtml/10.1145/3544548.3580911)

### Dating App UI Patterns
- [Feeld: The Dating App](https://feeld.co/the-app)
- [IXD@Pratt: Design Critique Feeld](https://ixd.prattsi.org/2025/09/design-critique-feeld/)
- [Toptal: Safe Dating App UX](https://www.toptal.com/designers/ux/safe-dating-app-ux)
- [MindBodyGreen: Feeld Review](https://www.mindbodygreen.com/articles/feeld-app-review)

### Visual Novel Patterns
- [Ren'Py: GUI Customization Guide](https://www.renpy.org/doc/html/gui.html)
- [Ren'Py: NVL Mode Tutorial](https://www.renpy.org/doc/html/nvl_mode.html)
- [VNDev Wiki: Transition](https://vndev.wiki/Transition)
- [Iris Engine: Working with Visuals](https://iris-engine.readthedocs.io/en/latest/visuals.html)
- [NomnomNami: How to Design VN UI](https://nomnomnami.itch.io/how-can-i-design-a-good-ui-for-my-vn)
- [Make Visual Novels: Text Effects Pack](https://makevisualnovels.itch.io/text-pack)
- [Crystal Game Works: Scene Transitions](https://crystalgameworks.com/cwes-animating-chapter-and-scene-transitions/)

### Emoji & Form Design
- [Zonka: Smiley Face Surveys](https://www.zonkafeedback.com/blog/smiley-face-surveys)
- [Medium: Emoji Survey UX Review](https://medium.com/design-bootcamp/how-a-simple-emoji-survey-tricked-everyone-ux-review-923a347f9f4c)
- [ACM: UEQ-Emoji](https://dl.acm.org/doi/fullHtml/10.1145/3626705.3627767)
- [MeasuringU: Face Emoji vs Numbered Scales](https://measuringu.com/numbers-versus-face-emojis/)
- [Springer: Visual Cues in Survey Design](https://link.springer.com/chapter/10.1007/978-3-031-93835-1_2)

### Breathing & Biometric Visualization
- [GitHub: Breathing Relaxer](https://github.com/prompthabibi/breathing-relaxer)
- [DEV: Focused Breathing CSS Animation](https://dev.to/scrabill/focused-breathing-a-css-animation-to-help-with-meditation-and-focused-breathing-exercises-dob)
- [Medium: CSS Breathing Techniques](https://vmar76.medium.com/using-css-animations-to-visualize-breathing-techniques-7a20ee0aed5a)
- [Codeconvey: CSS Heartbeat Monitor Animation](https://codeconvey.com/css-heartbeat-monitor-animation/)

### Onboarding
- [LogRocket: Designing Mobile App Onboarding](https://blog.logrocket.com/ux-design/designing-mobile-app-onboarding-flow/)
- [Icons8: How to Design Onboarding](https://icons8.com/blog/articles/ux-design-onboarding-mobile-app/)
- [LinkedIn: User Consent in Mobile UI](https://www.linkedin.com/advice/0/how-can-you-prioritize-user-consent-mobile-ui-design)
- [Okthanks: Clean Consent UX](https://okthanks.com/blog/2021/5/14/clean-consent-ux)
