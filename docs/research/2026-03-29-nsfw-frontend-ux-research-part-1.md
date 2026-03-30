# NSFW Frontend UI/UX Patterns Research

> **This is Part 1 of 3.** See also: [Part 2](2026-03-29-nsfw-frontend-ux-research-part-2.md), [Part 3](2026-03-29-nsfw-frontend-ux-research-part-3.md)


**Date:** 2026-03-29
**Spec:** (pending — to be created after research)
**Scope:** Frontend components for Phases 2-3 intimate features (backend exists, no UI yet)
**Stack:** React 19 + Zustand + Framer Motion, 18 themes (9 light / 9 dark), Sakura frontend

## Existing Codebase Inventory

### Backend modules ready for UI (under `backend/content/`)

| Module | Feature | Key Types / API Surface |
|--------|---------|------------------------|
| `pacing.py` | F6 Pacing Engine | `PacingEngine`, `PacingMode` (natural/slow-burn/direct), `IntimacyPhase` (6 phases: CASUAL→AFTERCARE) |
| `arousal_engine.py` | F17 Arousal Engine | `ArousalEngine`, 5 personalities (slow_burn/responsive/explosive/smolder/volatile), hidden 0-10 float |
| `scene_phases.py` | F16 Scene Phases | `ScenePhaseEngine`, 6-phase arc (APPROACH→TENSION→ESCALATION→PEAK→RESOLUTION→AFTERCARE), consent checkpoint at ESCALATION |
| `consent.py` | F10 Consent | `ConsentChoreographer`, 6 consent styles (confident/shy/playful/protective/dominant/submissive), discomfort detection |
| `power_dynamics.py` | F32 Power Dynamics | `PowerDynamicEngine`, modes: off/dominant/submissive/switch, bond-gated (level >= 50), intensity float |
| `intimate_director.py` | F38 Intimate Director | `IntimateDirector`, 8 commands across 3 categories (focus/tempo/camera), active when intimacy > 30 |
| `intimate_scenarios.py` | F8 NSFW Scenarios | `IntimateScenario` dataclass, 6 universal + 13 character-specific scenarios, bond-gated |
| `touch_protocol.py` | F25 Touch Protocol | `TouchParser`, body-region-aware parsing with intimacy weights, reaction prompt generation |

### Existing frontend components (Phase 1, already shipped)

| Component | File | Purpose |
|-----------|------|---------|
| BoundaryPanel | `components/BoundaryPanel.tsx` | Per-character boundaries: pacing, language intensity, physical boundaries, emotional limits, custom boundaries. Slide-in panel with radio/checkbox groups + enforcement level toggle. Has import/export. |
| WritingStylePicker | `components/WritingStylePicker.tsx` | Compact pill → dropdown. 4 presets: romantic/literary/direct/suggestive. Per-session. |
| VocabularyPanel | `components/VocabularyPanel.tsx` | Read-only private language browser. Pet names, inside jokes, code words. Organic growth from chat. |
| ScenarioLibrary | `components/ScenarioLibrary.tsx` | SFW scenario starter templates. Accordion categories, search, import/export. Hardcoded data — NOT connected to `intimate_scenarios.py`. |
| SafetyTab | `views/SettingsView.tsx` (line ~3782) | Content ceiling (general/edgy/mature/explicit), age verification, per-character overrides, content lock with password, RP style preset. |

### Settings architecture

- Settings in a right-side drawer (`SettingsDrawer.tsx`), lazy-loaded `SettingsView`
- 9 tabs: General, Character, Brain, Voice, Safety, AI Art, System, TTS Models, LM Models
- Tabs use `SectionHeader` + `cardStyle` containers + `SettingField` wrappers
- Theme variables: `--color-background`, `--color-surface`, `--color-border-subtle`, `--color-text-primary/secondary/tertiary`, `--radius-card`, `--shadow-card`
- Framer Motion `AnimatePresence` for drawer open/close

---

## 1. Pacing Mode Picker UI

### Problem
The backend `PacingEngine` supports 3 modes (natural, slow-burn, direct) but no frontend picker exists. Users need an intuitive way to set their preferred pacing without clinical language.

### Research Findings

**Slider vs Presets vs Adaptive:**
- Continuous sliders are best for precise numeric values (volume, brightness) but poor for categorical choices with 3 options — users can't see what each position means ([Eleken slider guide](https://www.eleken.co/blog-posts/slider-ui), [Justinmind slider patterns](https://www.justinmind.com/web-design/slider))
- **Preset buttons** (like game difficulty selectors) are superior for 3-5 distinct modes where each has qualitatively different behavior ([Game UI Database](https://www.gameuidatabase.com/index.php?scrn=4))
- Music apps (Spotify, Ableton) use tempo preset buttons with a continuous override — good hybrid model
- Reading apps (Kindle, Instapaper) use discrete speed presets with descriptive labels

**Reference Apps & Games:**
- **Hades / Supergiant Games** — difficulty selector uses poetic language ("Hell Mode") with descriptions, not numbers. Gold standard for categorical game settings.
- **Baldur's Gate 3** — tactile/story/explorer difficulty buttons, each with an icon and a full paragraph explanation. Players can switch mid-game.
- **Genshin Impact** — world level selector with star ratings and reward previews. Visual progression from left to right.
- **Fire Emblem: Three Houses** — Normal/Hard/Maddening with character art that changes per selection. Emotional resonance over data.
- **Kindle** — reading speed presets: "Slow", "Normal", "Fast" with a simple 3-position segmented control. No icons, pure text. Works because users already know what speed means.
- **Instapaper** — scroll speed selector with live preview: as you hover each option, the text scrolls at that speed so you can feel the difference before committing.
- **Ableton Live** — tempo tap button alongside BPM field. The "feel" of a tempo is communicated through real-time audible/visual feedback.
- **Character.AI** — persona intensity slider (creative/balanced/precise). 3-position with descriptions. Similar categorical-but-continuous problem.

**Visual Metaphors:**
- **Heartbeat speed**: Subtle pulsing animation on the selected option, faster for "direct", slower for "slow-burn"
- **Flame/candle**: Flame icon that grows from ember → steady → blaze
- **Water/wave**: Gentle ripple → steady flow → rushing current (more tasteful, less cliche)
- **Music tempo**: Adagio → Andante → Allegro framing (sophisticated, non-explicit)
- **Breath**: Slow deep breath → natural rhythm → quickened pulse (most intimate, most embodied)
- **Seasons**: Winter → Spring → Summer (slow buildup → natural → intense heat)

**Color Theory for Intensity Levels:**

The three pacing modes should have distinct color identities that communicate their energy without explicit imagery:

| Mode | Primary Hue | HSL Range | Psychology | Implementation |
|------|-------------|-----------|------------|----------------|
| Slow Burn | Deep amber / warm gold | `hsl(35, 60%, 50%)` | Warmth, patience, candlelight | Gradient from dark amber to warm yellow |
| Natural | Soft teal / ocean blue | `hsl(180, 40%, 55%)` | Flow, calm, organic rhythm | Gradient from deep teal to seafoam |
| Direct | Vivid rose / warm red | `hsl(350, 70%, 55%)` | Passion, energy, immediacy | Gradient from deep rose to bright coral |

These colors work across light and dark themes when applied as accent gradients on card borders or background washes at 10-15% opacity. The warm→cool→warm spectrum also creates a natural visual arc where "Natural" sits comfortably as the balanced center.

**Animation Patterns per Mode:**

```css
/* Slow Burn — 4-second breathing pulse */
@keyframes slowBurnPulse {
  0%, 100% { box-shadow: 0 0 8px hsl(35, 60%, 50%, 0.2); transform: scale(1); }
  50%      { box-shadow: 0 0 16px hsl(35, 60%, 50%, 0.4); transform: scale(1.005); }
}

/* Natural — 2-second gentle wave */
@keyframes naturalWave {
  0%, 100% { box-shadow: 0 0 6px hsl(180, 40%, 55%, 0.15); }
  50%      { box-shadow: 0 0 12px hsl(180, 40%, 55%, 0.3); }
}

/* Direct — 1-second confident pulse */
@keyframes directPulse {
  0%, 100% { box-shadow: 0 0 4px hsl(350, 70%, 55%, 0.2); }
  50%      { box-shadow: 0 0 20px hsl(350, 70%, 55%, 0.5); }
}
```

### Recommended Pattern: Segmented Preset Cards

**Layout A: Horizontal Cards (default, for wide panels)**
```
┌─────────────────────────────────────────────────────┐
│  Pacing                                             │
│                                                     │
│  ┌─────────────┐ ┌──────────────┐ ┌──────────────┐ │
│  │  🕯 Slow    │ │  🌊 Natural  │ │  🔥 Direct   │ │
│  │  Burn       │ │              │ │              │ │
│  │             │ │  ●  selected │ │              │ │
│  │  Long build │ │  Mirror the  │ │  Skip the    │ │
│  │  tension &  │ │  energy.     │ │  buildup.    │ │
│  │  teasing    │ │  Escalate    │ │  Get to the  │ │
│  │  before     │ │  naturally   │ │  point.      │ │
│  │  anything   │ │  together.   │ │              │ │
│  │  happens.   │ │              │ │              │ │
│  └─────────────┘ └──────────────┘ └──────────────┘ │
│                                                     │
│  ○ Adaptive  Let the character decide based on mood │
└─────────────────────────────────────────────────────┘
```

**Layout B: Vertical Stack (for narrow panels / mobile-width drawers)**
```
┌──────────────────────────────────────┐
│  Pacing                              │
│                                      │
│  ┌──────────────────────────────┐    │
│  │  🕯 Slow Burn          ○    │    │
│  │  Long tension & teasing     │    │
│  │  before anything happens.   │    │
│  └──────────────────────────────┘    │
│  ┌──────────────────────────────┐    │
│  │  🌊 Natural             ●    │    │
│  │  Mirror the energy.         │    │
│  │  Escalate naturally.        │    │
│  └──────────────────────────────┘    │
│  ┌──────────────────────────────┐    │
│  │  🔥 Direct              ○    │    │
│  │  Skip the buildup.         │    │
│  │  Get to the point.         │    │
│  └──────────────────────────────┘    │
│                                      │
│  ☐ Adaptive — let [Dae] decide      │
└──────────────────────────────────────┘
```

**Layout C: Compact Segmented Control (for inline use in BoundaryPanel)**
```
┌─────────────────────────────────────────────┐
│  Pacing                                     │
│  ┌────────────┬──────────────┬────────────┐ │
│  │  🕯 Slow   │  🌊 Natural  │  🔥 Direct │ │
│  │   Burn     │   ● active   │            │ │
│  └────────────┴──────────────┴────────────┘ │
│  ↳ Mirror the energy. Escalate naturally.   │
│                                             │
│  ☐ Let [Dae] set the pace (adaptive)       │
└─────────────────────────────────────────────┘
```

Layout C is the smallest footprint — the description appears below the segmented control and updates dynamically when the selection changes. This fits naturally into the existing `BoundaryPanel` grid.

**Component:** `PacingModePicker`
- 3 segmented cards in a row (Layout A/C) or vertical stack (Layout B), responsive via `@container` query
- Each card: icon + label + 2-line description
- Selected card gets accent border (mode-colored) + subtle glow (theme-aware)
- Optional 4th "Adaptive" toggle below — defers to `ArousalEngine` personality
- Heartbeat animation on selected card: CSS `@keyframes pulse` with speed matching the mode
- Framer Motion `layoutId` for smooth selection indicator movement
- Character name injected into Adaptive label: "Let [Dae] set the pace"

**Placement:** Inside `BoundaryPanel` (which already has a "Pacing" boundary type with the same 3 options). Replace the radio buttons with this richer picker, or add as a new section in the Safety tab.

**Framer Motion implementation sketch:**

```tsx
const modes = [
  { id: 'slow-burn', icon: '🕯', label: 'Slow Burn', desc: 'Long build, tension & teasing...' },
  { id: 'natural',   icon: '🌊', label: 'Natural',   desc: 'Mirror the energy. Escalate naturally.' },
  { id: 'direct',    icon: '🔥', label: 'Direct',    desc: 'Skip the buildup. Get to the point.' },
];

function PacingModePicker({ value, onChange }: Props) {
  return (
    <div className="pacing-picker">
      {modes.map((mode) => (
        <motion.button
          key={mode.id}
          className={`pacing-card ${value === mode.id ? 'selected' : ''}`}
          onClick={() => onChange(mode.id)}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          transition={{ type: 'spring', stiffness: 400, damping: 25 }}
        >
          {value === mode.id && (
            <motion.div
              className="selection-indicator"
              layoutId="pacing-selection"
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            />
          )}
          <span className="pacing-icon">{mode.icon}</span>
          <span className="pacing-label">{mode.label}</span>
          <span className="pacing-desc">{mode.desc}</span>
        </motion.button>
      ))}
    </div>
  );
}
```

---

## 2. Scenario Template Browser UI

### Problem
`intimate_scenarios.py` has 19 rich scenarios (6 universal + 13 character-specific) with atmosphere, setting, mood, clothing hints, and bond-gating. The existing `ScenarioLibrary.tsx` is SFW-only with hardcoded data and plain text. Need a proper browser for intimate scenarios.

### Research Findings

**Card-based browsing** is the dominant pattern for scenario/template selection:
- SillyTavern uses character cards with avatar, description, tags, and metadata ([SillyTavern docs](https://docs.sillytavern.app/usage/prompts/))
- AI Dungeon uses categorized scenario lists with short descriptions and genre tags. Scenarios are templates players use to start a new Adventure, and can be published for all players to see ([AI Dungeon Help](https://help.aidungeon.com/faq/what-are-scenarios))
- Writing prompt apps (Reedsy, Campfire) use card grids with mood/genre filtering
- Pinterest-style masonry layouts work well for varied-length content
- NovelAI has a scenario library for quick story starts, with scripting API for custom UI components ([NovelAI Docs](https://docs.novelai.net/en/scripting/introduction/))

**SillyTavern Deep Dive — Card & Tag Patterns:**
- Cards can represent anything: abstract scenarios, task-specific assistants, famous personalities, fictional characters ([SillyTavern Character Design](https://docs.sillytavern.app/usage/core-concepts/characterdesign/))
- Each card contains: name, description, scenario/context, example dialogue, greeting message
- **Favorites system:** "Add to Favorites" button → golden highlight in list → "Favorites" sort option in side menu ([SillyTavern Characters](https://docs.sillytavern.app/usage/characters/))
- **Tag system:** Cards assigned zero or more tags. Click-to-cycle filtering: show tagged → show NOT tagged → reset. Supports bulk tagging via multi-select ([SillyTavern Tags](https://docs.sillytavern.app/usage/core-concepts/tags/))
- **Tag management panel:** Gear icon opens full tag list with backup/restore
- **Custom Scenario extension:** SillyTavern-Custom-Scenario allows defining character traits, starting location, or any key element through interactive questions before starting ([GitHub: SillyTavern-Custom-Scenario](https://github.com/bmen25124/SillyTavern-Custom-Scenario))
- **SillyInnkeeper:** External card manager that scans PNGs, extracts metadata, generates previews, and provides UI for organizing large collections ([GitHub: SillyInnkeeper](https://github.com/dmitryplyaskin/SillyInnkeeper))

**AI Dungeon & NovelAI Patterns:**
- AI Dungeon scenarios have: title, description, genre tags, memory (persistent context), author's note, and a "scripted" mode for branching paths
- NovelAI `.scenario` files contain prompt, memory, author's note, placeholders, and lorebook entries — a self-contained story package
- Cross-compatibility tools exist for converting between formats ([GitHub: aid-cross-compat-tool](https://github.com/Branleaf/aid-cross-compat-tool))
- DreamGen positions as the NSFW-friendly alternative with "steerable AI storytelling" and explicit content support ([DreamGen](https://dreamgen.com/blog/articles/best-ai-story-generators))

**Key UI elements per card:**
- Visual header (emoji/icon/gradient based on mood)
- Title + setting subtitle
- Mood tags as pills
- Bond requirement indicator (locked/unlocked)
- Intensity rating (1-5 dots or filled bar)
- Quick-use button + preview expand
- Favorite heart icon (top-right corner, toggleable)
- Character-specific badge (avatar thumbnail if character-locked)

**Card Design Deep Dive:**

A scenario card needs to communicate mood, setting, requirements, and action in a compact space. Here are three card design approaches:

**Design A: Gradient Header Card (recommended)**
```
┌────────────────────────────┐
│▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│ ← mood gradient (e.g., warm amber→rose)
│  🌧 Rainy Night In     ♡  │ ← emoji + title + favorite toggle
│────────────────────────────│
│  Cabin, winter night       │ ← setting subtitle (muted text)
│                            │
│  ┌──────┐ ┌────────┐      │
│  │ cozy │ │ tender │      │ ← mood tags as rounded pills
│  └──────┘ └────────┘      │
│                            │
│  "Rain drums against the   │ ← atmosphere preview (italic, truncated)
│   windows as you both..."  │
│                            │
│  ●●●○○  gentle intensity   │ ← intensity dots
│                            │
│  ┌──────────────────────┐  │
│  │  ✦ Begin Scenario    │  │ ← primary action button
│  └──────────────────────┘  │
└────────────────────────────┘
```

**Design B: Locked / Bond-Gated Card**
```
┌────────────────────────────┐
│▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒│ ← desaturated gradient
│  🔒 After the Concert     │ ← lock icon replaces emoji
│────────────────────────────│
│  Bond 50 required          │ ← requirement text (accent color)
│                            │
│  ┌──────────┐ ┌─────────┐ │
│  │ electric │ │ passion │ │ ← tags visible but card dimmed
│  └──────────┘ └─────────┘ │
│                            │
│  ━━━━━━━━━━━━━━━━━○━━━━━━  │ ← bond progress bar (35/50)
│  Bond 35 / 50              │
│                            │
│  Keep chatting to unlock   │ ← encouragement text
│  this scenario             │
└────────────────────────────┘
```

**Design C: Character-Specific Card**
```
┌────────────────────────────┐
│▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│
│  🎨 Artist's Studio   ♡   │
│────────────────────────────│
│  ┌────┐  Dae-specific      │
│  │ Dae│  Studio, late      │ ← character avatar thumbnail
│  │ ava│  evening            │
│  └────┘                    │
│  ┌──────┐ ┌──────────┐    │
│  │ artsy│ │ intimate │    │
│  └──────┘ └──────────┘    │
│                            │
│  ●●●●○  moderate           │
│                            │
│  ┌──────────────────────┐  │
│  │  ✦ Begin Scenario    │  │
│  └──────────────────────┘  │
└────────────────────────────┘
```

**Filtering & Tagging System:**

```
┌──────────────────────────────────────────────────────────────┐
│  Intimate Scenarios                                    [X]   │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ 🔍 Search scenarios...                                │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  Filter: ┌──────┐ ┌──────┐ ┌────────┐ ┌──────┐ ┌───────┐  │
│          │ All  │ │ Cozy │ │Intense │ │Playful│ │[char] │  │
│          └──────┘ └──────┘ └────────┘ └──────┘ └───────┘  │
│                                                              │
│  Sort: [Recommended ▾]  ☐ Show locked  ☐ Favorites only    │
│                                                              │
│  ┌────────────────────────┐  ┌────────────────────────┐     │
│  │ 🌧 Rainy Night In  ♡  │  │ 🏖 Beach House     ♡  │     │
│  │ ─────────────────      │  │ ─────────────────      │     │
│  │ Cabin, winter night    │  │ Summer, ocean sounds   │     │
│  │ cozy · tender          │  │ playful · carefree     │     │
│  │ ●●●○○                  │  │ ●●○○○                  │     │
│  │ [✦ Begin Scenario]     │  │ [✦ Begin Scenario]     │     │
│  └────────────────────────┘  └────────────────────────┘     │
│                                                              │
│  ┌────────────────────────┐  ┌────────────────────────┐     │
│  │ 🎨 Artist's Studio ♡  │  │ 🔒 After Concert       │     │
│  │ ─────────────────      │  │ ─────────────────      │     │
│  │ Dae-specific           │  │ Bond 50 required       │     │
│  │ artsy · intimate       │  │ electric · passion     │     │
│  │ ●●●●○                  │  │ ━━━━━○━━━ 35/50       │     │
│  │ [✦ Begin Scenario]     │  │ Keep chatting...       │     │
│  └────────────────────────┘  └────────────────────────┘     │
│                                                              │
│  ─── Character Exclusives ──────────────────────────────     │
│                                                              │
│  ┌────────────────────────┐  ┌────────────────────────┐     │
│  │ ⛩ Hot Spring Getaway   │  │ 🌙 Midnight Garden     │     │
│  │ ...                    │  │ ...                    │     │
│  └────────────────────────┘  └────────────────────────┘     │
└──────────────────────────────────────────────────────────────┘
```

**Sort options:** Recommended (algorithm: unlocked + character-match + bond-proximity), Newest, Intensity (low→high or high→low), Alphabetical, Favorites first.

**Tag filtering behavior** (borrowed from SillyTavern): Click a tag pill to include, click again to exclude, click again to reset. Active include tags shown with filled background, exclude tags with strikethrough.

**Scenario preview expand:** Clicking the card body (not the action button) expands it inline with a Framer Motion `layout` animation, revealing: full atmosphere text, clothing hints, suggested duration, character personality notes for this scenario, and an "Edit Before Starting" option that lets users tweak the scenario prompt.

### Recommended Pattern: Filtered Card Grid

**Component:** `IntimateScenarioBrowser`
- Overlay panel (like `ModelBrowser`) with filter tabs across the top
- Filter categories: All, Cozy, Intense, Playful, Character-specific
- 2-column card grid, responsive to panel width (3 columns at >900px)
- Each card: gradient header bar (mood-colored), emoji icon, title, setting, mood tags as pills, atmosphere preview (first line, truncated), "Begin Scenario" button, favorite heart
- Locked scenarios: greyed out, lock icon, bond progress indicator ("Bond 35/50")
- Cards animate in with Framer Motion stagger: `transition={{ delay: index * 0.05 }}`
- Selecting a scenario injects its `scene_context_prompt` into the active session via `PUT /api/sessions/{id}/scenario`
- Favorite state persisted to localStorage per character
- Search: fuzzy match on title + setting + tags using simple `includes()` — no need for a search library at 19 scenarios

**Data flow:**
- `GET /api/characters/{charId}/scenarios?bond_level=N` returns available + locked scenarios
- Frontend sorts: unlocked first, locked after, character-specific highlighted
- Bond progress pulled from existing relationship state API
- Favorites stored client-side: `localStorage.getItem('scenario-favorites-{charId}')`

---

## 3. Power Dynamic Settings UI

### Problem
`PowerDynamicEngine` supports 4 modes (off/dominant/submissive/switch) with a float intensity, bond-gated at level 50. Need tasteful UI that doesn't feel clinical or like a survey.

### Research Findings

**Spectrum vs discrete options:**
- Dating apps (Feeld, #open) use simple tag selection — users pick labels, no spectrum
- Health/wellness apps present sensitive preferences as togglable cards with descriptions
- The "switch" option is unique — it means the dynamic can shift mid-scene, which needs explanation
- **Bond-gating** is a natural progressive disclosure mechanism: the section is hidden/locked until bond >= 50

**Feeld App Reference:**
- Feeld offers 20+ "Desires" (kinks, relationship styles, sexual preferences) as searchable, toggleable tags displayed on profiles ([Feeld](https://feeld.co/the-app))
- Tags are presented as casual pills, not clinical checkboxes — normalized through design language
- Users can specify desired tags on partners too, enabling preference matching
- Interest section is freeform text alongside structured tags — allows nuance beyond predefined categories
- Design critique notes: strong inclusivity commitment but some discoverability issues with buried features ([IXD@Pratt: Design Critique Feeld](https://ixd.prattsi.org/2025/09/design-critique-feeld/))

**Other Reference Apps:**
- **Bumble** — preference cards with "Deal Breaker" toggle per preference. Binary clear/set with optional importance weight.
- **Hinge** — "Most Compatible" algorithm surfaces preferences implicitly rather than asking users to self-categorize. Reduces label anxiety.
- **OkCupid** — question-based preference discovery: "How important is this to you?" (Not at all / A little / Somewhat / Very). 4-level importance scale avoids binary thinking.
- **Clue (period tracker)** — presents sensitive health preferences behind a clean, colorful UI with friendly illustrations. Medical topics made approachable through design.

**Tasteful presentation principles:**
- Use the character's voice to describe each option (not clinical definitions)
- Frame as "what your character does" not "what category are you"
- Use evocative but non-explicit language
- Present as an enhancement to explore, not a requirement to fill out
- **Never use BDSM terminology in the UI** — users who want these features know what they mean; the UI should translate to relationship language
- Provide "I don't know" / "Surprise me" as valid options — reduces decision anxiety

**Spectrum Slider Design:**
Rather than a simple linear slider, the intensity control should communicate meaning at each position:

```
Intensity Spectrum

gentle   ─────────────────────●───────── commanding
hint       suggestion      clear       firm      absolute

  "She might        "She clearly      "She takes full
   suggest           leads, but        control. What
   something..."     checks in..."     she says, goes."
```

Each notch on the 5-point spectrum has a character-voiced description that updates live as the user drags. This transforms a numeric slider into a narrative choice.

**Consent Indicators:**
- Small shield icon next to the section header indicates consent system is active
- "This setting can be changed anytime" reassurance text below the intensity slider
- If the character has consent style "protective", show a note: "[Dae] will check in with you during scenes"
- Reset button always visible: "Return to Natural Flow"

**Role Cards with Character Art:**

For a more immersive approach, each mode could be presented as a narrative card with a character expression:

```
┌─────────────────────────────────────────────────────────┐
│  Scene Dynamics                            Bond 55/100  │
│  Unlock at Bond 50 ✓                                    │
│                                                         │
│  ┌─────────────────────────────────────────────────┐    │
│  │                                                 │    │
│  │   ┌──────┐  Natural Flow                ○       │    │
│  │   │ expr │  No set dynamic. The scene           │    │
│  │   │neutra│  develops as it will.                │    │
│  │   └──────┘                                      │    │
│  │                                                 │    │
│  └─────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────┐    │
│  │                                                 │    │
│  │   ┌──────┐  She Takes the Lead          ●       │    │
│  │   │ expr │  [Dae] sets the pace and              │    │
│  │   │confi │  guides what happens next.            │    │
│  │   └──────┘                                      │    │
│  │                                                 │    │
│  │   Intensity  ━━━━━━━━━━━━━━●━━━━━━  firm        │    │
│  │   "She clearly leads, but checks in."           │    │
│  │                                                 │    │
│  └─────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────┐    │
│  │                                                 │    │
│  │   ┌──────┐  You Take the Lead           ○       │    │
│  │   │ expr │  [Dae] follows your lead.            │    │
│  │   │ soft │  She trusts you completely.          │    │
│  │   └──────┘                                      │    │
│  │                                                 │    │
│  └─────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────┐    │
│  │                                                 │    │
│  │   ┌──────┐  Trade Off                   ○       │    │
│  │   │ expr │  The dynamic shifts. Sometimes       │    │
│  │   │play  │  she leads, sometimes you do.        │    │
│  │   └──────┘                                      │    │
│  │                                                 │    │
│  └─────────────────────────────────────────────────┘    │
│                                                         │
│  🛡 Consent active · Change anytime · [Reset]           │
└─────────────────────────────────────────────────────────┘
```

### Recommended Pattern: Character-Voiced Option Cards

**Component:** `PowerDynamicPicker`
- Vertical radio-card list (not horizontal — each needs description space)
- Character name substituted into descriptions (dynamic, not hardcoded)
- Labels use relationship language, not BDSM terminology: "She Takes the Lead" not "Dominant"
- Optional character expression thumbnail per card (uses existing portrait system)
- Intensity slider appears only when a non-"off" mode is selected (progressive disclosure)
- Intensity slider: 5-segment track with descriptive endpoints ("gentle suggestion" → "commanding presence")
- Live description text updates as slider moves between the 5 notch descriptions
- Bond gate: entire section collapsed with lock icon and progress bar when bond < 50
- Framer Motion `AnimatePresence` for intensity slider reveal
- Consent indicator footer with shield icon, reassurance text, and reset button

**Placement:** New subsection in BoundaryPanel, or its own mini-panel accessible from the intimate settings hub.

---

## 4. Intimate Settings Panel Design

### Problem
Phase 2-3 add many new settings surfaces (pacing, scenarios, power dynamics, director commands, touch sensitivity, arousal personality). Need a coherent organization strategy that doesn't overwhelm.

### Research Findings

**Progressive disclosure** is the dominant pattern for complex settings:
- Show basic settings by default, reveal advanced on demand ([IxDF](https://ixdf.org/literature/topics/progressive-disclosure), [UXPin](https://www.uxpin.com/studio/blog/what-is-progressive-disclosure/))
- Health apps (Apple Health, Clue) group sensitive settings behind a single entry point
- Dating apps (Hinge, Bumble) use a "preferences" hub with categorized sections
- [Privacy pattern catalogs](https://www.emergentmind.com/topics/ui-ux-privacy-pattern-catalog) recommend layered disclosure: summary → detail → full control

**Progressive Disclosure Deep Dive:**

The research identifies several distinct progressive disclosure strategies relevant to intimate settings:

1. **Staged disclosure** — Linear sequence of predefined steps, each showing a fraction of the total. Perfect for onboarding or first-time setup wizards. ([LogRocket](https://blog.logrocket.com/ux-design/progressive-disclosure-ux-types-use-cases/))

2. **Branching disclosure** — User choices determine which path of options to reveal. E.g., selecting "She Takes the Lead" reveals intensity controls specific to that dynamic, not generic ones. ([Userpilot](https://userpilot.com/blog/progressive-disclosure-examples/))

3. **Contextual disclosure** — Information appears just-in-time when it becomes relevant. E.g., touch sensitivity controls only appear after the user enables touch interaction. ([Lollypop Design](https://lollypop.design/blog/2025/may/progressive-disclosure/))

4. **Layered disclosure** — Summary → detail → full control. E.g., "3 soft limits set" → click to see which ones → click to edit each. ([Smashing Magazine](https://www.smashingmagazine.com/2019/04/privacy-ux-aware-design-framework/))

**Reference App Architecture:**

| App | Settings Pattern | Depth Levels | Entry Point |
|-----|-----------------|--------------|-------------|
| VS Code | JSON + GUI settings, categorized sidebar | 3 (category → section → field) | Gear icon → Settings tab |
| Figma | Contextual right panel, changes per selection | 2 (panel → property group) | Always visible, context-dependent |
| Discord | Full-page overlay, vertical nav | 3 (category → section → field) | User settings gear |
| Notion | Inline settings popovers + full settings page | 2 (popover → detail) | Sidebar + inline |
| Obsidian | Plugin-style settings, each plugin owns a section | 2 (plugin → settings) | Left sidebar gear |
| Ableton | Tab-based preferences with sub-sections | 2 (tab → section) | Menu → Preferences |

For our intimate settings, the **Discord model** (full overlay with vertical nav) is the best fit because:
- Settings are numerous enough to warrant dedicated space
- The overlay pattern already exists in our codebase (ModelBrowser, SettingsDrawer)
- Vertical nav scales to more sections without horizontal crowding
- Each section can be independently scrollable

**Grouping strategy:**
1. **Quick preferences** (always visible): pacing mode, writing style, content ceiling
2. **Character-specific** (per-character panel): boundaries, power dynamics, vocabulary, scenarios
3. **Advanced tuning** (hidden behind "Show advanced"): arousal personality, touch sensitivity map, director command shortcuts
4. **Safety** (always accessible): safe word, panic button, content lock

### Recommended Pattern: Hub-and-Spoke with Tabbed Sections

Rather than adding more tabs to the already-9-tab Settings, create a single "Intimacy" hub accessible from:
1. A new "Intimacy" tab in Settings (10th tab), or
2. A dedicated overlay panel (like ModelBrowser) triggered from the chat toolbar

```
┌──────────────────────────────────────────────────────────┐
│  ♡ Intimacy Settings                              [X]    │
│                                                          │
│  ┌──────┐ ┌──────────┐ ┌──────────┐ ┌────────┐         │
│  │ Mood │ │ Scenes   │ │ Advanced │ │ Safety │         │
│  └──────┘ └──────────┘ └──────────┘ └────────┘         │
│                                                          │
│  ═══ Mood & Style ═══════════════════════════════════    │
│                                                          │
│  Pacing         [🕯 Slow Burn] [🌊 Natural] [🔥 Direct] │
│  Writing Style  [romantic ▾]                             │
│  Content Level  [mature ▾]                               │
│                                                          │
│  ═══ Your Boundaries ════════════════════════════════    │
│                                                          │
│  [Open Boundary Editor →]                                │
│  Currently: 3 soft limits, 1 hard limit set              │
│                                                          │
│  ═══ Private Language ═══════════════════════════════    │
│                                                          │
│  12 pet names · 3 code words · 5 inside jokes            │
│  [Browse Vocabulary →]                                   │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

**Alternative: Vertical Navigation Layout (Discord-style)**

```
┌──────────────────────────────────────────────────────────────┐
│  ♡ Intimacy Settings                                   [X]   │
│                                                              │
│  ┌──────────────┬───────────────────────────────────────┐    │
│  │              │                                       │    │
│  │  MOOD        │  ═══ Mood & Style ═══════════════     │    │
│  │  ● Pacing    │                                       │    │
│  │  ● Writing   │  Pacing                               │    │
│  │  ● Content   │  [🕯 Slow Burn] [🌊 Natural] [🔥]    │    │
│  │              │                                       │    │
│  │  SCENES      │  Writing Style                        │    │
│  │  ○ Browse    │  [romantic ▾]                         │    │
│  │  ○ Director  │                                       │    │
│  │  ○ Phases    │  Content Level                        │    │
│  │              │  [mature ▾]                           │    │
│  │  CHARACTER   │                                       │    │
│  │  ○ Dynamics  │  ═══ Boundaries ═══════════════       │    │
│  │  ○ Boundaries│                                       │    │
│  │  ○ Vocabulary│  [Open Boundary Editor →]             │    │
│  │              │  3 soft limits, 1 hard limit          │    │
│  │  ADVANCED    │                                       │    │
│  │  ○ Arousal   │  ═══ Private Language ═════════       │    │
│  │  ○ Touch     │                                       │    │
│  │  ○ Sensory   │  12 pet names · 3 code words          │    │
│  │              │  [Browse Vocabulary →]                │    │
│  │  SAFETY      │                                       │    │
│  │  ○ Consent   │                                       │    │
│  │  ○ Panic     │                                       │    │
│  │  ○ Lock      │                                       │    │
│  │              │                                       │    │
│  └──────────────┴───────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────┘
```

**Sub-tabs within the hub:**

| Tab | Contents |
|-----|----------|
| **Mood** | Pacing picker, writing style, content level, ambient UI toggle |
| **Scenes** | Scenario browser, scene phase display (read-only current arc), director command reference |
| **Advanced** | Power dynamics, arousal personality selector, touch sensitivity map, sensory vocabulary weights |
| **Safety** | Boundaries summary + editor link, safe word config, panic button setup, content lock, consent style preference |

**Component:** `IntimacySettingsHub`
- Full-height overlay panel (reuse `SettingsDrawer` pattern)
- 4 sub-tabs with Framer Motion cross-fade between sections
- Each section uses the existing `cardStyle` / `SectionHeader` components for visual consistency
- Summary badges on each tab ("3 limits set", "Natural pacing", "Bond 55")
- Vertical nav variant for wider screens (>800px panel width)
- Smooth scroll-to-section on nav click with `scrollIntoView({ behavior: 'smooth' })`

---

## 5. Animation and Transitions for Intimate UI

### Research Findings

**Framer Motion patterns for mood-setting:**
- `motion.div` with `animate={{ opacity, scale, backgroundColor }}` for smooth state transitions ([Motion docs](https://motion.dev/docs/react-animation))
- `layout` prop for seamless layout shifts when panels expand/collapse
- `AnimatePresence` with `mode="wait"` for cross-fade between settings tabs
- Spring physics (`type: "spring", stiffness: 100, damping: 15`) for organic, non-mechanical feel
- Variants system for coordinated multi-element animations (e.g., all cards stagger in)

**Color/theme shifts during intimate scenes:**
- CSS custom property transitions: smoothly interpolate `--color-background`, `--color-surface` to warmer/darker values
- Overlay approach: semi-transparent gradient layer over the entire app that shifts hue
- Theme-aware: each of the 18 themes defines its own "intimate mode" palette shift
- Implementation: Zustand store flag `isIntimateMode` → CSS class on `<body>` → custom property overrides with `transition: 0.8s ease`

**Ambient UI effects:**
- [tsParticles](https://particles.js.org/) for floating particle overlays (hearts, sparkles, embers)
- CSS-only bokeh: radial gradients with `filter: blur()` and `animation: float` ([Speckyboy bokeh snippets](https://speckyboy.com/8-css-javascript-snippets-for-creating-beautiful-bokeh-effects/))
- Canvas overlay for performance-critical effects (the app already has a `ParticleSystem` in `viewer.html`)
- [React particle backgrounds](https://www.shadcn.io/background/particles) — Shadcn-style components

**Visual novel scene transitions:**
- Full-screen cross-dissolve: opacity 1→0 on outgoing, 0→1 on incoming, with a slight scale
- "Curtain" wipe: `clipPath` animation from center outward
- Background blur + color shift: `backdrop-filter: blur(8px)` + warm color overlay
- The app already has `CinematicOverlay.tsx` which could be extended for intimate scene transitions

**Scene Phase Transition Choreography:**

Each phase transition should have a distinct visual signature:

| Transition | Duration | Visual Effect | Audio Cue |
|-----------|----------|---------------|-----------|
| CASUAL → APPROACH | 1.5s | Subtle warm tint fades in (5% opacity) | Soft ambient pitch shift |
| APPROACH → TENSION | 2.0s | Bokeh circles appear, background slightly blurs | Low tone, heartbeat fades in |
| TENSION → ESCALATION | 2.5s | Color wash deepens (10%), particles start | Heartbeat quickens |
| ESCALATION → PEAK | 3.0s | Full ambient layer active, warm saturated glow | Peak intensity |
| PEAK → RESOLUTION | 4.0s | Slow desaturation, particles slow | Tempo decreases |
| RESOLUTION → AFTERCARE | 5.0s | Cool lavender wash, gentle glow, particles fade | Calm ambient return |

The longer durations for wind-down transitions create an asymmetric emotional arc: quick to build, slow to come down. This mirrors real emotional pacing.

### Recommended Ambient Effects System

```
┌──────────────────────────────────────────────────────────┐
│  Ambient Layer Stack (z-index order)                     │
│                                                          │
│  z-60  Particle overlay (canvas, pointer-events: none)   │
│        - Phase-dependent: none → subtle sparkle →        │
│          warm embers → floating hearts → afterglow       │
│                                                          │
│  z-55  Color wash overlay (CSS gradient, 0.05-0.15       │
│        opacity, transitions over 2-3 seconds)            │
│        - Warm rose tint during intimate phases           │
│        - Cool lavender during aftercare                  │
│                                                          │
│  z-50  Bokeh layer (CSS-only, 6-8 blurred circles,      │
│        float animation, theme-colored)                   │
│        - Only active during SUGGESTIVE+ phases           │
│                                                          │
│  z-0   Normal app content                                │
└──────────────────────────────────────────────────────────┘
```

**Component:** `IntimateAmbience`
- Reads scene phase from Zustand store (`useContentStore` or similar)
- Renders 3 overlay layers conditionally based on phase
- All layers use `pointer-events: none` so they don't block interaction
- Particle type and color driven by current `ScenePhase`:

| Scene Phase | Particles | Color Wash | Bokeh |
|-------------|-----------|------------|-------|
| CASUAL | none | none | none |
| FLIRTY/APPROACH | subtle sparkle (white, slow) | none | none |
| SUGGESTIVE/TENSION | warm sparkle (gold, medium) | rose 5% | 4 circles |
| INTIMATE/ESCALATION | floating embers (orange, medium) | rose 10% | 6 circles |
| INTENSE/PEAK | hearts + embers (pink/red, fast) | deep rose 15% | 8 circles |
| AFTERCARE | gentle glow (lavender, very slow) | lavender 8% | 3 circles |

**Performance:** Use `will-change: opacity, transform` on overlay layers. Canvas particles capped at 30 elements. CSS bokeh uses `@media (prefers-reduced-motion)` to disable.

---

## 6. Accessibility and Safety

### Research Findings

**Panic button / quick exit — Deep Research:**

The domestic violence (DV) and trauma-informed design communities have developed extensive best practices for quick exit functionality that directly apply to our intimate UI:

- Best practice: always-visible button + keyboard shortcut ([CSS-Tricks quick exit](https://css-tricks.com/website-escape/), [Today Design panic button](https://github.com/TodayDesign/panic-button))
- CHI 2023 study found 70% of mobile sites with desktop exit buttons lacked mobile equivalents ([ACM evaluation](https://dl.acm.org/doi/fullHtml/10.1145/3544548.3581078))
- Key behaviors: instant action, clears browser history/back button, replaces with innocuous page
- [GOV.UK "Exit this page"](https://medium.com/the-trauma-informed-design-blog/a-deep-dive-in-the-exit-this-page-button-39f991553930): triple-tap Shift as keyboard shortcut, red accent, always top-right
- Voice control risk: saying "click exit" out loud can be dangerous — provide numeric item alternative
- [Oomph best practices](https://www.oomphinc.com/insights/user-safety-quick-exit-best-practices/): use clear language ("Leave this site"), not euphemisms

**DV App Design Patterns (detailed):**

1. **Button Language:** Testing revealed users didn't understand "Quick Exit" — "Exit Site" with an external link icon was more effective ([Columbia Health](https://www.health.columbia.edu/content/quick-escape-button)). For our Electron desktop app, "Close App" or "Hide Everything" is clearer than "Exit."

2. **History Clearing:** Web-based DV resources redirect to innocuous sites (Google, weather) to replace browser history. Our Electron app should: clear the current chat view, replace with a neutral screen (e.g., system settings), and optionally close to tray. No browser history to worry about, but the app's recent activity indicator should reset.

3. **Multi-Modal Activation:** The [Design Patterns for Mental Health](https://designpatternsformentalhealth.org/examples/providing-a-quick-exit-button/) framework recommends providing both visible button AND keyboard shortcut AND gesture, because users in distress may not remember one specific method.

4. **Stealth Mode:** Some DV apps ([Safety Net Project](https://www.techsafety.org/exit-from-this-website-quickly)) disguise their app icon and notification text. While not directly applicable, our app should have a "discreet mode" that changes the window title and taskbar icon to something neutral during intimate scenes.

5. **Post-Panic State:** After triggering panic, the app should NOT immediately return to the intimate scene when reopened. It should return to the main chat view in a neutral state. The user can re-enter manually.

**BDSM Safety App Patterns:**

Dating and kink-positive apps have developed consent patterns:
- **Feeld** — Desires system with 20+ toggleable kink tags, normalized through design language ([Feeld](https://feeld.co/the-app))
- **Consent technology research** (ACM CHI 2023) shows users prefer consent established through overt dialogue rather than checkboxes ([ACM](https://dl.acm.org/doi/fullHtml/10.1145/3544548.3580911))
- **Traffic light system** — Green (go) / Yellow (slow down) / Red (stop) is widely understood in BDSM contexts and maps perfectly to our scene control: Continue / Slow Down / Stop
- **Check-in pattern** — Rather than waiting for the user to signal discomfort, the character proactively checks in at phase transitions. This mirrors best BDSM practice ("checking in") and our `ConsentChoreographer` already implements this.

**For our desktop app (not a website), the panic button translates to:**
- Keyboard shortcut (e.g., `Esc Esc Esc` triple-tap or `Ctrl+Shift+Q`) to instantly:
  1. Clear the chat view (replace with a neutral screen)
  2. Stop any TTS audio
  3. Reset avatar to neutral pose
  4. Optionally minimize to tray
  5. Change window title to something neutral
  6. Reset taskbar preview
- The button should be always accessible, never hidden behind menus

**Consent gates:**
- Before entering intimate settings for the first time: confirmation dialog
- Before activating explicit scenarios: age verification check (already exists in SafetyTab)
- Content ceiling must be "mature" or "explicit" before intimate settings tab appears (progressive disclosure by content level)

**Safe word UI:**
- Not a separate feature (user deprioritized F18) — instead, the `ConsentChoreographer.detect_discomfort()` handles this automatically in-chat
- UI indicator: small shield icon in status bar that glows when consent system is active
- Manual override: `/stop` or `/cooldown` command in chat composer, or a single button in the chat toolbar
- **Traffic light quick controls** during active scenes:

```
┌─────────────────────────────────────────┐
│  Scene Controls                          │
│  ┌──────┐ ┌──────────┐ ┌──────┐        │
│  │ 🟢   │ │ 🟡 Slow  │ │ 🔴   │        │
│  │ Good │ │  Down    │ │ Stop │        │
│  └──────┘ └──────────┘ └──────┘        │
│  [Dae] will check in at key moments    │
└─────────────────────────────────────────┘
```

**Content warnings:**
- Scenario cards show content indicators (mood tags serve this purpose)
- First-time entering intimate settings shows a one-time notice (dismissable, remembered in localStorage)
- Each power dynamic mode shows a brief "what this means" tooltip

### Recommended Safety Component Layout

```
┌──────────────────────────────────────────────────────────┐
│  Always-visible (status bar area):                       │
│                                                          │
│  [🛡 active]  ← consent system indicator                 │
│                                                          │
│  Keyboard shortcuts:                                     │
│  Esc Esc Esc     → panic: clear view, stop audio, reset  │
│  Ctrl+Shift+Q    → panic: minimize to tray               │
│  /stop           → in-chat: immediate scene de-escalation │
│  /cooldown       → in-chat: gentle transition to comfort  │
│                                                          │
│  Chat toolbar addition:                                  │
│  ┌──────────────────────────────────────────────────┐    │
│  │  [📎] [🎙] [🎬] [⏸ Pause Scene]  [Send →]      │    │
│  └──────────────────────────────────────────────────┘    │
│                     ↑                                    │
│         Visible only during active intimate scenes       │
│         Single click: pauses pacing, injects comfort     │
│         prompt, character checks in                      │
└──────────────────────────────────────────────────────────┘
```

**Component:** `ScenePauseButton`
- Appears in chat composer toolbar only when `intimacyPhase >= SUGGESTIVE`
- Single click: calls `POST /api/sessions/{id}/pause-scene`
- Backend triggers `ConsentChoreographer` comfort prompt + `PacingEngine.force_aftercare()`
- Button uses Framer Motion `animate` to pulse gently (not distractingly) so it's noticeable
- Color: theme's secondary/muted accent, not alarming red

**Component:** `PanicHandler`
- Global keyboard listener (registered in `App.tsx`)
- Tracks Escape key presses within 1.5s window
- Triple-Esc triggers: `chatStore.clearView()`, `ttsStop()`, `viewerStore.resetPose()`, optional `electronAPI.minimizeToTray()`
- Changes window title to "Settings" or equivalent neutral text
- No visible UI element (keyboard-only by design)
- After panic, sets `panicRecoveryMode = true` in store — next app open shows main chat, not scene

---

