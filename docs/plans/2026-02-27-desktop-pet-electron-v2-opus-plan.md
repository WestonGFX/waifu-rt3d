I now have a thorough understanding of the codebase. Let me compile the comprehensive design document.

---

# Waifu-RT3D v2.0 -- Native Desktop Application with Desktop Pet Mode

# Electron Wrapper + Transparent Pet Overlay -- Comprehensive Design Document

---

> **STATUS: DEFERRED -- NOT FOR IMMEDIATE IMPLEMENTATION**
>
> This document is a long-term vision plan for the eventual v2.0 native desktop release of waifu-rt3d. It supersedes the preliminary design at `docs/plans/2026-02-27-desktop-pet-electron-design.md` with significantly expanded coverage of every subsystem. No code should be written for this feature until the existing browser-based feature roadmap (Phases 1-3, Features A-L) is fully stabilised and the app has been validated by real users in its current form.
>
> **Estimated timeline:** 2-4 months after current roadmap completion.
> **Prerequisite milestones:** C1 (Live2D runtime), A1 (full-duplex voice), A7 (Kokoro TTS) must be complete first, as the pet overlay needs voice and animation to feel alive.

> **USER DECISIONS CONFIRMED:**
> - **Electron** chosen over Tauri (TypeScript-throughout, more overlay documentation)
> - **OBS chroma-key** desktop transparency is a valid OPTIONAL workflow for users who want
>   it NOW (before Electron is built). Not too much friction for dedicated users. The app
>   should document this as an optional alternative, not dismiss it.
> - **This design is deferred** — do not build until A1 (Voice), C1 (Live2D), A7 (Kokoro)
>   are complete and the app has real users. Estimated: 2–4 months after current roadmap.
> - A second pass with **Opus 4.6 + extended thinking** (medium/high) should be done after
>   Claude Code is restarted (new version 2.1.63 + new plugin skills available).


---

## Table of Contents

1. [Electron vs Tauri Decision](#1-electron-vs-tauri-decision)
2. [Window Modes](#2-window-modes)
3. [Transparent Pet Window -- Complete Technical Spec](#3-transparent-pet-window--complete-technical-spec)
4. [Idle Behaviour System](#4-idle-behaviour-system)
5. [Pet Interaction Model](#5-pet-interaction-model)
6. [Gaming Integration](#6-gaming-integration)
7. [System Tray](#7-system-tray)
8. [Native OS Integration](#8-native-os-integration)
9. [Auto-Updater](#9-auto-updater)
10. [Build and Distribution](#10-build-and-distribution)
11. [Migration from Browser to Electron](#11-migration-from-browser-to-electron)
12. [What Electron Unlocks Beyond Pet Mode](#12-what-electron-unlocks-beyond-pet-mode)

---

## 1. Electron vs Tauri Decision

### The architectural constraint

The single most important fact about this project's architecture: **the Python FastAPI backend runs as a separate process on port 8080**, and the frontend connects to it over HTTP. Neither Electron nor Tauri replaces the backend -- they are purely a Chromium/WebView wrapper around the same `http://localhost:8080` URL. This means the backend bundling problem (packaging Python + .venv + SQLite DB) is identical regardless of which wrapper we choose.

### Detailed comparison

| Criterion | Electron | Tauri |
|-----------|----------|-------|
| **Renderer engine** | Bundled Chromium (identical on all platforms) | System WebView2 (Windows) / WKWebView (macOS) |
| **Three.js/WebGL compatibility** | Guaranteed -- same Chromium everywhere, can tune GPU flags | WebView2 is Chromium-based (fine on Windows); WKWebView uses Safari's WebGL (different shader quirks, occasional VRM rendering differences on macOS) |
| **Transparent window** | `BrowserWindow({ transparent: true })` -- battle-tested, widely used by apps like Loom overlay, OBS overlays | `WindowBuilder::transparent(true)` -- supported, but fewer production references; WKWebView transparency has documented macOS compositing issues |
| **Click-through (setIgnoreMouseEvents)** | `setIgnoreMouseEvents(true, { forward: true })` -- first-class API, the `forward` option is critical for our hit-test loop | Tauri has `set_ignore_cursor_events(true)` but lacks the `forward` equivalent in stable -- mouse events stop entirely, breaking our pixel-alpha hit-test loop |
| **Always-on-top level control** | `setAlwaysOnTop(true, 'screen-saver')` -- granular level control (normal, floating, torn-off-menu, modal-panel, main-menu, status, pop-up-menu, screen-saver) | `set_always_on_top(true)` -- binary, no level granularity; cannot set `screen-saver` level to float above fullscreen games on Windows |
| **IPC (main <-> renderer)** | `ipcMain` / `ipcRenderer` + `contextBridge` -- mature, well-documented, async/sync variants | Tauri commands (Rust functions exposed to JS) -- type-safe, but requires writing Rust for every IPC call |
| **Language for native code** | JavaScript/TypeScript (Node.js) | Rust (mandatory for all backend logic, plugins, IPC handlers) |
| **Bundle size (app only, no Python)** | ~150-180 MB (Chromium) | ~8-15 MB (uses system WebView) |
| **Bundle size (with Python backend)** | ~350-450 MB total (Chromium + PyInstaller bundle) | ~200-280 MB total (smaller shell + PyInstaller bundle) |
| **Memory usage** | ~120-200 MB baseline (Chromium) | ~40-80 MB baseline |
| **Auto-updater** | `electron-updater` (electron-builder) -- mature, supports differential updates, S3/GitHub Releases backends | Tauri updater plugin -- works but less battle-tested |
| **Code signing** | Well-documented for both Windows (SignTool + EV cert) and macOS (codesign + notarization) | Also well-documented, but fewer community guides |
| **Community / ecosystem** | Massive -- VS Code, Discord, Slack, Spotify desktop all use Electron; countless tutorials, StackOverflow answers, and production references for transparent overlays specifically | Growing but smaller; fewer production apps with transparent overlays; fewer examples of WebGL-heavy apps |
| **Developer familiarity** | This project is 100% Python + TypeScript/React -- Electron is JS/TS, zero new language | Tauri requires Rust -- the team has no Rust experience; adds a significant learning curve |

### The decision: Electron

**Electron is the correct choice for this project.** The rationale:

1. **Click-through with forwarding is non-negotiable.** The `forward: true` option in `setIgnoreMouseEvents` is what makes the hit-test loop work -- mouse events continue flowing to the renderer even when the window is "ignored", so we can continuously check pixel alpha and toggle. Tauri's `set_ignore_cursor_events` lacks this, meaning we would need to implement a polling workaround or use platform-specific native code (Rust FFI to Windows/macOS APIs). This alone is a showstopper.

2. **WebGL consistency matters.** The VRM viewer uses Three.js with specific shader features (ACES filmic tone mapping, PCFSoft shadows, premultiplied alpha compositing). Electron guarantees the same Chromium renderer on both Windows and macOS. Tauri on macOS uses WKWebView (Safari), which has known differences in WebGL `premultipliedAlpha` handling -- exactly the setting our transparent overlay depends on.

3. **No Rust in the codebase.** This is a Python + TypeScript project. Adding Rust as a third language for the wrapper layer is unnecessary overhead when Electron gives us everything we need in JS/TS.

4. **Bundle size is acceptable.** The 150 MB Chromium tax is real, but the Python backend + .venv is already ~100-200 MB. The total installer will be 350-450 MB regardless -- for a desktop companion app with 3D rendering, voice synthesis, and local LLM support, this is expected. Users with RTX 5080 GPUs and multi-GB LLM models will not blink at a 400 MB installer.

5. **Always-on-top level granularity.** The `screen-saver` level on Windows lets the pet float above fullscreen DirectX/Vulkan games. Tauri's binary always-on-top cannot achieve this.

### Electron version target

Target **Electron 33+** (Chromium 130+). This gives us:
- WebGPU support (future Three.js migration path)
- `BrowserWindow.setIgnoreMouseEvents` with `forward` option (stable since Electron 7)
- ESM support in the main process
- V8 12.x with excellent performance

---

## 2. Window Modes

The application supports three distinct window modes, each with its own `BrowserWindow` configuration, layout, and purpose. Mode transitions are triggered by the system tray menu, global hotkeys, or in-app UI buttons.

### Mode 1: Full App Window

The primary experience -- identical to the current browser-based app, but running inside Electron.

**BrowserWindow configuration:**
```javascript
{
  width: 1400,
  height: 900,
  minWidth: 800,
  minHeight: 600,
  frame: false,            // Custom title bar (Electron-native, draggable)
  titleBarStyle: 'hidden', // macOS: native traffic lights, custom drag region
  titleBarOverlay: {       // Windows: native min/max/close buttons
    color: '#0a0b14',
    symbolColor: '#8b8da0',
    height: 32,
  },
  transparent: false,      // Opaque -- better performance than transparent
  backgroundColor: '#0a0b14',
  webPreferences: {
    contextIsolation: true,
    nodeIntegration: false,
    preload: path.join(__dirname, 'preload.js'),
    // Hardware acceleration flags for Three.js
    webgl: true,
  },
}
```

**URL loaded:** `http://localhost:8080/sakura/` (the existing Sakura frontend)

**Behaviour:**
- Standard resizable window with custom frameless title bar
- On macOS: native traffic light buttons (close/minimize/maximize) positioned in a custom drag region
- On Windows: uses `titleBarOverlay` for native caption buttons drawn over the app's custom header
- All existing React app features work identically
- Sidebar, overlays, ModelPanel, ChatThread -- all unchanged
- Zustand state persistence (`localStorage`) works because the origin is the same (`localhost:8080`)

**Window position persistence:**
- `electron-store` saves `{ x, y, width, height, isMaximized }` on every `move`/`resize` event
- On app launch, restores to saved position (with bounds check to ensure the window is still on a visible monitor)

### Mode 2: Compact Sidebar

A narrow docked strip designed to keep the companion visible while the user works or games.

**BrowserWindow configuration:**
```javascript
{
  width: 320,
  height: screenHeight,       // Full height of the primary display
  x: screenWidth - 320,       // Docked to right edge
  y: 0,
  minWidth: 280,
  maxWidth: 400,
  frame: false,
  transparent: false,
  backgroundColor: '#0a0b14',
  alwaysOnTop: true,
  skipTaskbar: false,          // Visible in taskbar (user might want to Alt-Tab to it)
  resizable: true,             // Only horizontal resize (width only)
  webPreferences: {
    contextIsolation: true,
    nodeIntegration: false,
    preload: path.join(__dirname, 'preload.js'),
  },
}
```

**URL loaded:** `http://localhost:8080/sakura/?mode=compact`

**What this route renders (new React view):**
```
  ┌─────────────────────────┐
  │  [Avatar] Character Name │  ← StatusBar (compact)
  │  "neutral" | 75% aff     │
  ├─────────────────────────┤
  │                           │
  │    VRM Character          │  ← Bust-crop viewer (no orbit controls)
  │    (200px tall)           │
  │                           │
  ├─────────────────────────┤
  │  Latest AI message        │  ← Last 1-2 messages, scrollable
  │  "Hey, how's the game     │
  │   going?"                 │
  ├─────────────────────────┤
  │  [Type a message...]      │  ← Quick reply input (auto-resize)
  │  [Send]                   │
  ├─────────────────────────┤
  │  [Full App] [Pet Mode]    │  ← Mode switch buttons
  └─────────────────────────┘
```

**Edge docking behaviour:**
- Snaps to left or right screen edge
- Can be dragged between edges
- Edge preference persisted in `electron-store`
- On Windows: reserves desktop space using `setBounds` but does NOT use the AppBar API (would be too intrusive)
- Auto-hides option: slides off-screen when mouse leaves, slides back on mouse hover at screen edge (configurable)

**State preservation during mode switch:**
- The `appStore` and `chatStore` are shared across all modes via Zustand's `persist` middleware (backed by `localStorage` on the same `localhost:8080` origin)
- Switching from Full App to Compact preserves: active character, session ID, message history, overlay state
- The Compact view reads the same `useChatStore` and `useAppStore` as the full app

### Mode 3: Desktop Pet Overlay

The headline feature. A transparent, frameless, always-on-top window where the VRM character appears to stand directly on the desktop with no visible UI chrome.

**BrowserWindow configuration:**
```javascript
{
  width: 350,
  height: 550,
  x: savedPos.x ?? (screenWidth - 400),
  y: savedPos.y ?? (screenHeight - 600),
  transparent: true,
  frame: false,
  alwaysOnTop: true,
  skipTaskbar: true,
  hasShadow: false,
  resizable: true,
  minimizable: false,
  maximizable: false,
  closable: false,           // Close via system tray only
  focusable: true,           // Must be focusable to receive keyboard events for chat input
  // Critical: window level for floating above games on Windows
  // 'screen-saver' is the highest level, floats above fullscreen DirectX
  // On macOS this only works above desktop, NOT above native fullscreen apps
  webPreferences: {
    contextIsolation: true,
    nodeIntegration: false,
    preload: path.join(__dirname, 'preload.js'),
  },
}
```

After creation:
```javascript
petWindow.setAlwaysOnTop(true, 'screen-saver');
petWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false });
```

**URL loaded:** `http://localhost:8080/sakura/?mode=pet`

Full specification in section 3 below.

### Mode Switching -- Transition Design

Mode transitions must feel instantaneous and smooth. The design:

1. **Full App -> Compact Sidebar:**
   - Full App window animates `width` from current to 320px and slides to screen edge (300ms ease-out)
   - Simultaneously, the URL changes to `?mode=compact` via `loadURL` or React conditional rendering based on a URL query param
   - If the ModelPanel was open, the VRM viewer iframe is preserved (same Three.js context)

2. **Full App -> Desktop Pet:**
   - Full App window hides (`mainWindow.hide()`)
   - Pet window creates (if not already existing) or shows (`petWindow.show()`)
   - Fade-in animation on the pet window (CSS `opacity: 0 -> 1` over 200ms)
   - The VRM character appears at the saved pet position

3. **Desktop Pet -> Full App:**
   - Pet window hides (`petWindow.hide()`)
   - Full App window shows and focuses (`mainWindow.show(); mainWindow.focus()`)

4. **Any mode -> Any mode:**
   - State is NEVER lost -- `appStore` and `chatStore` persist in `localStorage` on the shared origin
   - The active character, current session, unsent draft message, and scroll position are all preserved
   - The VRM model may need to reload in a new iframe (different route), but model URL is cached so load is near-instant from disk

**Global hotkey for mode cycling:**
- `Ctrl+Shift+P` (configurable): cycles Full App -> Desktop Pet -> Full App
- `Ctrl+Shift+S` (configurable): toggles Compact Sidebar
- These work even when the app is not focused (Electron `globalShortcut`)

---

## 3. Transparent Pet Window -- Complete Technical Spec

### 3.1 Window Transparency Stack

For a truly transparent pet window, EVERY layer in the rendering stack must support transparency:

```
Layer 1: OS compositor (Desktop Compositing Window Manager / Quartz Compositor)
  └─ Layer 2: Electron BrowserWindow (transparent: true, frame: false)
       └─ Layer 3: HTML body (background: transparent)
            └─ Layer 4: React root div (background: transparent)
                 └─ Layer 5: iframe (background: transparent)
                      └─ Layer 6: Three.js WebGLRenderer (alpha: true)
                           └─ Layer 7: scene.background = null + setClearAlpha(0)
```

Failure at any single layer makes the window opaque. Current status of each layer:

| Layer | Current State | Change Needed |
|-------|---------------|---------------|
| Electron BrowserWindow | N/A (not yet created) | `transparent: true` |
| HTML `<body>` | `background: transparent` in viewer.html | Already correct |
| `body.pet-mode` CSS class | Exists at line 31 of `viewer.html`: `body.pet-mode { background: transparent; }` | Already correct |
| React root `<div>` | `backgroundColor: 'var(--color-background)'` which is `#0a0b14` (opaque dark) | PetView must override to `transparent` |
| iframe | No explicit background | Must set `style.background = 'transparent'` |
| Three.js `WebGLRenderer` | `alpha: true` (line 2390 of `viewer.html`) -- correct | Already correct |
| `scene.background` | `new THREE.Color(0x0a0b14)` (line 2405 of `viewer.html`) -- opaque dark | Must be `null` in pet mode |
| `renderer.setClearAlpha` | Not explicitly set (defaults to 1 = opaque) | Must be `setClearAlpha(0)` in pet mode |

### 3.2 Viewer Pet Mode Changes

The existing `viewer.html` already has a `?pet=1` URL parameter that adds the `pet-mode` body class and builds a chat overlay. However, it does NOT currently clear the scene background to transparent. The `setBackground` function (line 2482) has a `'transparent'` mode path, but it actually falls back to opaque dark:

```javascript
// Line 2509-2512 (current code)
// "transparent" mode -- use dark fallback to match UI theme
scene.background = new THREE.Color(0x0a0b14);
renderer.setClearAlpha(1);
document.body.style.background = '#0a0b14';
```

This must be changed for Electron pet mode to:
```javascript
// When running inside Electron pet window:
scene.background = null;
renderer.setClearAlpha(0);
document.body.style.background = 'transparent';
```

Detection of Electron: the preload script exposes `window.electronAPI.isPetMode` (boolean), which the viewer reads via `?electron=pet` URL param or by checking `window.electronAPI?.isPetMode`.

Additionally, pet mode in the viewer should:
- Disable orbit controls (`controls.enabled = false`) -- camera is fixed
- Set camera to a fixed bust/fullbody preset (configurable)
- Disable the background video element (`#bg-video`)
- Disable the FPS overlay (or make it optional via a setting)
- Add `premultipliedAlpha: false` to the WebGLRenderer config (already present at line 2391 as `preserveDrawingBuffer: true`, but `premultipliedAlpha` needs explicit attention for compositing correctness)

### 3.3 Hit-Test Click-Through Loop

This is the most technically critical part of the pet overlay. The goal: clicks on transparent pixels pass through to the application underneath, while clicks on opaque pixels (the character) are captured by the Electron window.

**Architecture:**

```
┌─ Electron Main Process ─────────────────────────────────┐
│                                                          │
│   petWindow.setIgnoreMouseEvents(transparent, {          │
│     forward: true  // CRITICAL: keeps mouse events       │
│                     // flowing to renderer even while     │
│                     // "ignoring"                         │
│   })                                                     │
│                                                          │
│   ◄── IPC 'set-click-through' ─── Renderer Process ──►  │
│                                                          │
└──────────────────────────────────────────────────────────┘

┌─ Electron Renderer Process (Pet Window) ────────────────┐
│                                                          │
│   mousemove listener on document                         │
│     │                                                    │
│     ├─ Get mouse coordinates (e.clientX, e.clientY)      │
│     ├─ Scale by devicePixelRatio                         │
│     ├─ Read pixel alpha from WebGL canvas:               │
│     │    gl.readPixels(x, h-y, 1, 1, RGBA, UBYTE, buf) │
│     ├─ Determine: isTransparent = (alpha < threshold)    │
│     ├─ If state changed from last check:                 │
│     │    send IPC 'set-click-through' to main process    │
│     └─ Update cursor style (pointer vs none)             │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

**Preload script (contextBridge):**
```javascript
// electron/preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isPetMode: true, // Set dynamically based on which window loaded this preload
  setClickThrough: (transparent) => {
    ipcRenderer.send('set-click-through', transparent);
  },
  setWindowPosition: (x, y) => {
    ipcRenderer.send('set-window-position', x, y);
  },
  getWindowPosition: () => ipcRenderer.invoke('get-window-position'),
  switchMode: (mode) => ipcRenderer.send('switch-mode', mode),
  onModeSwitch: (callback) => {
    ipcRenderer.on('mode-switch', (event, mode) => callback(mode));
  },
});
```

**Performance considerations for the hit-test loop:**

1. **`gl.readPixels` is expensive.** It forces a GPU pipeline flush (stalls the GPU, reads back to CPU). On the RTX 5080 this is fast (~0.1ms per call), but on integrated GPUs it can take 1-3ms.

2. **Rate limiting:** Do NOT call `readPixels` on every `mousemove` event. Instead:
   - Throttle to maximum 30 checks per second (33ms interval)
   - Use `requestAnimationFrame` gating: only check once per frame
   - Skip the check if the mouse has not moved more than 2px since last check (hysteresis)

3. **Offscreen buffer optimization:** Instead of reading from the live WebGL canvas, render the character's alpha mask to a smaller offscreen canvas (e.g. 1/4 resolution) and read from that. This avoids stalling the main render pipeline.

4. **Alpha threshold:** Use `alpha < 20` (not 0) to account for antialiased edges. The character's silhouette has semi-transparent edge pixels from MSAA/FXAA. A threshold of 20 out of 255 ensures these edge pixels are treated as "character" (clickable), preventing frustrating near-miss clicks.

5. **State change deduplication:** Only send IPC when the transparent/opaque state actually changes. The current mouse position is checked continuously, but IPC is sent only on transitions (opaque-to-transparent or transparent-to-opaque). This reduces IPC calls from 30/s to typically 0-2/s.

6. **DPI scaling:** The `mousemove` event gives CSS pixels, but `readPixels` needs physical pixels. Multiply `e.clientX` and `e.clientY` by `window.devicePixelRatio` before calling `readPixels`. On a 4K display with 200% scaling (common on the RTX 5080 setup), this is critical.

### 3.4 Character Drop Shadow

Without window chrome, the character needs a visual anchor -- especially on light backgrounds (a white browser page, a bright game).

**Implementation approach (CSS `drop-shadow` filter):**
```css
/* Applied to the <canvas> element or the <iframe> in the pet view */
#vrm-canvas {
  filter: drop-shadow(0px 8px 20px rgba(0, 0, 0, 0.35))
          drop-shadow(0px 2px 6px rgba(0, 0, 0, 0.20));
}
```

Why CSS `drop-shadow` and not a Three.js shadow:
- `drop-shadow` respects the alpha channel -- only opaque pixels (the character) cast a shadow
- It is composited by the OS window manager, which means the shadow appears on the desktop behind the transparent window
- A Three.js shadow would require a ground plane, which would be visible as a non-transparent rectangle
- Performance: CSS drop-shadow is GPU-accelerated and adds negligible overhead

**Configurable shadow parameters** (stored in `electron-store`):
- `shadowEnabled: true` (boolean)
- `shadowBlur: 20` (px, range 0-40)
- `shadowOffsetY: 8` (px, range 0-20)
- `shadowOpacity: 0.35` (float 0-1)
- Exposed as sliders in the Settings view under a "Desktop Pet" tab

### 3.5 Character Positioning and Persistence

**Default position:** Bottom-right of the screen, with the character's feet at the bottom edge of the pet window. The window's Y coordinate is set so the bottom edge aligns with the taskbar top (Windows) or dock top (macOS).

**Drag to reposition:**
- When the hit-test loop determines the mouse is over the character (opaque pixel) AND the user clicks + drags:
  - The renderer sends IPC `start-drag` to main process
  - Main process calls `petWindow.startMoving()` (Electron built-in window drag)
  - OR: manual drag via tracking mouse delta and calling `petWindow.setPosition(x, y)` each frame
- On drag end: new position saved to `electron-store`

**Multi-monitor support:**
- Position is stored as `{ x, y, displayId }` where `displayId` is from `electron.screen.getDisplayNearestPoint`
- On startup: if the saved display is no longer connected, fall back to the primary display's bottom-right corner
- The pet can be dragged to any connected monitor

**Resize:**
- Resize handles appear on right-click context menu -> "Resize"
- Resize is proportional (aspect ratio locked) -- dragging any corner scales the entire pet window
- Size range: 150x225 (minimum, tiny pet) to 600x900 (maximum, large pet)
- Size persisted in `electron-store`
- VRM viewer automatically adjusts camera distance when the window resizes (via `resize` event -> `camera.updateProjectionMatrix()`)

---

## 4. Idle Behaviour System

The existing `viewer.html` already has a sophisticated idle animation system:

- **`IdleBehaviorLayer`** (line 568): 14 fidget animations including `weight_shift`, `shoulder_roll`, `head_tilt`, `look_around`, `deep_breath`, `subtle_sway`, `ankle_cross`, `hip_cock`, `curtsy_bob`, `bounce`, `foot_tap`, `neck_stretch`, `settle`, and `head_nod_slow`
- **Personality-gated fidgets:** Some fidgets have a `requires` predicate (e.g. `hip_cock` requires `confidence > 0.6`, `bounce` requires `energy > 0.6`)
- **Timer:** Random interval of 3-8 seconds between fidgets, scaled by the character's `energy` personality trait

For the desktop pet overlay, this system needs extensions:

### 4.1 Enhanced Idle Behaviour for Desktop Pet

When the pet is on the desktop (not in the full app), idle behaviour should be more frequent and more varied to compensate for the lack of other UI elements. The character IS the UI.

**New pet-specific idle behaviours to add to `IdleBehaviorLayer.FIDGETS`:**
- `desktop_scan`: Character looks at different parts of the screen (head + eye tracking to random screen coordinates), as if watching what the user is doing
- `yawn`: Extended deep breath with jaw open expression blend shape + eye squint, triggered after 10+ minutes of user inactivity
- `doze`: Gradual head droop + eyes closing, triggered after 20+ minutes of user inactivity -- character "falls asleep" with slow breathing
- `wake_up`: Triggered when the user moves the mouse after the character was dozing -- startled expression + head snap up
- `screen_tap`: Character "touches" the inside of the transparent window, as if trying to get the user's attention -- used when a scheduled message arrives
- `wave_at_cursor`: When the mouse passes near the pet (within 100px), character waves and tracks the cursor briefly

**Frequency adjustment for pet mode:**
- In the full app, idle fidgets fire every 3-8 seconds (current)
- In pet mode, reduce the interval to 2-5 seconds -- the character should ALWAYS be doing something
- Add a "fidget chain" system: 30% chance of immediately starting a second fidget after the first ends, creating longer naturalistic sequences

### 4.2 Time-of-Day Behaviour

The existing A4 Mood Engine (Feature A4, implemented in backend `server.py`) calculates character mood based on time of day. The desktop pet should reflect this visually:

| Time Period | Mood | Idle Behaviour Set | Expression Default |
|-------------|------|-------------------|--------------------|
| 6am - 10am | Morning | Slow stretches, yawns, gradual energy increase | Sleepy -> neutral |
| 10am - 2pm | Active | High-energy fidgets (bounce, foot_tap), frequent look-around | Happy/engaged |
| 2pm - 6pm | Afternoon | Moderate energy, occasional deep breaths | Neutral/relaxed |
| 6pm - 10pm | Evening | Calm sway, gentle arm movements | Content/warm |
| 10pm - 12am | Night | Slow movements, frequent yawns, doze-ready | Tired/dreamy |
| 12am - 6am | Late night | Minimal movement, dozing, sleepy expressions | Asleep/drowsy |

**Implementation:** The pet window periodically queries `GET /api/characters/{id}/relationship` (which includes mood data). The viewer receives mood updates via postMessage:
```javascript
{ type: 'setMoodContext', timeOfDay: 'evening', energy: 0.4, mood: 'content' }
```

The `IdleBehaviorLayer` uses this to:
- Filter eligible fidgets by energy threshold
- Adjust fidget timer interval (slower at night, faster in the morning)
- Set the default expression when no other expression is active

### 4.3 Pausing Idle During Active Interaction

The `AnimationDirector` layer priority system already handles this (documented at line 306 of `viewer.html`):

```
L0 BasePose, L1 IdleBehavior, L2 EmotionModifier, L3 TalkLayer, L4 GestureLayer
```

When Talk (L3) is active, Idle (L1) is suppressed. When Gesture (L4) is playing, both Idle and Talk are suppressed. This means:
- When the user sends a message and the AI responds (TTS + lip sync), idle fidgets pause automatically
- When an emotion-driven gesture plays (wave, nod, etc.), idle pauses
- Idle resumes seamlessly when higher layers finish

**For gaming specifically:** When the game agent is active and sending frequent updates, the character stays in an engaged "watching" pose (leaning forward, eyes tracking) rather than doing random fidgets. This is controlled by a new postMessage:
```javascript
{ type: 'setIdleMode', mode: 'gaming' }  // Restricts fidgets to subtle ones only
{ type: 'setIdleMode', mode: 'normal' }  // Full fidget library
```

---

## 5. Pet Interaction Model

### 5.1 Left-Click on Character

When the user left-clicks on the character (hit-test confirms opaque pixel):

**Step 1:** A speech bubble / interaction panel appears near the character, anchored to the top or side depending on screen position:

```
        ┌────────────────────────────┐
        │  "Good evening! Want to    │  ← Latest AI message OR contextual greeting
        │   chat for a bit?"         │     (time-aware, mood-aware)
        ├────────────────────────────┤
        │  [Message input...]   [->] │  ← Quick chat (send goes to active session)
        ├────────────────────────────┤
        │  Open App          Ctrl+F  │  ← Mode switch to Full App
        │  Voice Mode        Ctrl+V  │  ← Toggle A1 voice conversation
        │  Change Outfit       ...   │  ← Quick VRM swap if multiple models
        │  Mood Board          ...   │  ← Open mood board overlay
        ├────────────────────────────┤
        │  Hide Pet         Ctrl+P   │  ← Hide until re-triggered
        └────────────────────────────┘
                   ▼
              [Character]
```

**Panel positioning logic:**
- Default: above the character, centered horizontally
- If character is near the top of the screen: below the character
- If character is near the left edge: offset panel to the right
- Panel is a child DOM element of the pet window, not a separate `BrowserWindow` -- this avoids focus issues

**Auto-dismiss:** Panel fades out after 8 seconds of no interaction (mouse not over panel).

**Quick chat flow:**
- User types in the message input and presses Enter
- Message is sent to `POST /api/chat` (same API the full app uses) with the active character's session
- AI response appears in the speech bubble with the character's expression/gesture playing
- If TTS is enabled (A7 Kokoro), audio plays through the pet window
- Speech bubble shows the AI response text for 8 seconds, then fades

### 5.2 Right-Click Context Menu

Right-clicking the character (or long-pressing on touch-enabled screens) opens a native Electron context menu:

```
┌─────────────────────────────┐
│  Move                       │  → Character follows cursor until next click
│  Resize                     │  → Show resize handles on pet window corners
│  ─────────────────────────  │
│  Expression                 ▸│ → Submenu: happy, sad, angry, surprised, neutral
│  Gesture                    ▸│ → Submenu: wave, nod, point, shrug, bow
│  ─────────────────────────  │
│  Switch to Full App         │
│  Switch to Compact Sidebar  │
│  ─────────────────────────  │
│  Mute TTS                   │  ☐ (checkbox)
│  Stay on Top                │  ☑ (checkbox, default on)
│  Show on All Desktops       │  ☑ (checkbox, macOS only)
│  ─────────────────────────  │
│  Settings                   │  → Opens Full App to Settings tab
│  Quit App                   │
└─────────────────────────────┘
```

This menu is built with Electron's `Menu.buildFromTemplate` and shown via `menu.popup()`.

### 5.3 Drag to Reposition

When the user clicks on the character and holds for 200ms without releasing (distinguishing drag from click):

1. The cursor changes to a grabbing hand
2. The character's idle animation pauses, replaced by a "carried" expression (surprised/happy blend)
3. The pet window follows the cursor via `petWindow.setPosition(cursorX - offsetX, cursorY - offsetY)`
4. On mouse release: position is saved, idle animation resumes

**Implementation:** This uses Electron's built-in `BrowserWindow` dragging. The renderer sends IPC `start-drag`, and the main process handles the native window move. The 200ms hold delay prevents accidental repositioning on quick clicks.

### 5.4 Resize

After selecting "Resize" from the context menu:

1. Four corner handles appear on the pet window (small squares rendered in the React overlay)
2. Dragging any handle resizes the window proportionally (aspect ratio locked at 7:10)
3. The VRM camera automatically adjusts to the new window size via the `resize` event in `viewer.html`
4. Clicking anywhere else dismisses the resize handles

### 5.5 Double-Click

Double-clicking the character is the fastest way to open the full app:
1. Pet window hides
2. Full app window shows and focuses
3. Active character's ChatThread is visible

### 5.6 Controller Support (Xbox One)

Since the user has an Xbox One controller:

| Button | Pet Mode Action |
|--------|----------------|
| A | Open interaction panel (same as left-click) |
| B | Dismiss panel / hide pet |
| X | Quick voice message (hold to speak, release to send) |
| Y | Open full app |
| D-pad | Move pet position (10px per press, hold for continuous) |
| LB/RB | Cycle through characters |
| Start | Open settings |
| Xbox button | Global show/hide pet (replaces Ctrl+Shift+P) |

Controller input is handled via the Gamepad API in the renderer process. Electron supports the Gamepad API natively through Chromium. The pet window's renderer polls `navigator.getGamepads()` at 60Hz via `requestAnimationFrame`.

---

## 6. Gaming Integration

### 6.1 Architecture

When the user is playing a game (emulated via a game agent, or a Three.js in-browser game), the pet should behave differently:

**Detection of gaming state:**
- The game agent system already exists (Vigilante 8 agent, Monster Rancher coach, etc.)
- When a game session is active, the backend sets a flag in the character's session metadata
- The pet window polls `GET /api/sessions/{id}/metadata` and detects `gaming: true`
- Alternatively, the full app sends a postMessage to the pet window via IPC when entering game mode

**Pet behaviour during gaming:**
- Shrink to compact size: 150x225px, pinned to a screen corner (configurable)
- Reduce idle animation frequency to minimum (only subtle breathing + blinking)
- Speech bubbles appear for game agent commentary only -- no random greetings
- Speech bubbles auto-dismiss after 4 seconds (shorter than normal 8s) to minimize visual obstruction
- Pet opacity drops to 80% to be less distracting
- If TTS is playing game commentary, keep the pet visible; otherwise allow it to go semi-transparent

### 6.2 Gaming Layout

```
┌──────────────────────────────────────────────────────────┐
│                                                          │
│                    GAME WINDOW                           │
│               (Fullscreen or windowed)                   │
│                                                          │
│                                                          │
│                                           ┌────────────┐ │
│                                           │            │ │
│                                           │ [VRM pet]  │ │
│                                           │  150x225   │ │
│                                           │            │ │
│                                           │ ┌────────┐ │ │
│                                           │ │"Take   │ │ │
│                                           │ │the ramp│ │ │
│                                           │ └────────┘ │ │
│                                           └────────────┘ │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

### 6.3 Platform-Specific Gaming Overlay

**Windows (RTX 5080, primary platform):**
- `setAlwaysOnTop(true, 'screen-saver')` floats above most fullscreen DirectX 11/12 and Vulkan games
- Some anti-cheat systems (EasyAntiCheat, BattlEye) may flag always-on-top transparent windows -- this is only relevant for online competitive games, not for the emulated retro games this project targets
- For exclusive fullscreen mode: the pet is automatically hidden (Electron cannot overlay exclusive fullscreen); the pet reappears when the user Alt-Tabs out
- For borderless windowed mode: full overlay support, no issues

**macOS (M2 Pro, secondary platform):**
- macOS does NOT allow any window to float above a native fullscreen app (macOS fullscreen is a separate Space)
- Workaround 1: Use windowed mode for games instead of fullscreen
- Workaround 2: Use the compact sidebar mode (which is a regular window) docked to the side
- Workaround 3: Mission Control shows the pet on the desktop Space; user can use Split View to see both game and pet
- `setVisibleOnAllWorkspaces(true)` makes the pet appear on all non-fullscreen Spaces

### 6.4 Global Hotkey During Gaming

`Ctrl+Shift+P` (Windows) / `Cmd+Shift+P` (macOS) toggles pet visibility without leaving the game:

1. User presses hotkey
2. Electron's `globalShortcut` catches it (works even when not focused)
3. If pet is visible: `petWindow.hide()` -- instant, no animation
4. If pet is hidden: `petWindow.show()` -- instant, no animation
5. No focus change -- the game remains in the foreground

---

## 7. System Tray

### 7.1 Tray Icon Design

The tray icon should reflect the active character's emotional state:

**Icon set (16x16 PNG for Windows, 22x22 for macOS template images):**

| State | Icon | Description |
|-------|------|-------------|
| Idle (no character active) | Monochrome heart outline | App is running, no active conversation |
| Active (character selected) | Character's avatar face crop (micro) | Small circular crop of the character's avatar |
| Happy mood | Avatar with small smile indicator | Green dot badge overlay |
| Sad mood | Avatar with blue dot | Blue dot badge overlay |
| Notification pending | Avatar with red dot | Unread scheduled message |
| Voice active (A1) | Waveform indicator | Pulsing microphone icon |

**Implementation:** Dynamic tray icon generation using `nativeImage.createFromBuffer()`. The avatar is loaded from `backend/storage/avatars/{char_id}.png`, resized to 16x16 with sharp edges, and a colored dot is composited based on mood.

### 7.2 Tray Context Menu

```
┌──────────────────────────────────┐
│  Waifu RT3D                      │  ← App name header (disabled label)
│  ──────────────────────────────  │
│  Show Full App          Ctrl+F   │
│  Desktop Pet Mode       Ctrl+P   │  ● (radio, active if pet is showing)
│  Compact Sidebar        Ctrl+S   │  ○ (radio)
│  ──────────────────────────────  │
│  Active: Rin              ▸      │  → Submenu: list of all characters
│  ──────────────────────────────  │
│  Mute Voice (TTS)        ☐      │  Checkbox toggle
│  Incognito Mode          ☐      │  Checkbox (messages not saved)
│  ──────────────────────────────  │
│  1 unread message         ▸     │  → Submenu: preview of pending messages
│  ──────────────────────────────  │
│  Start on Login          ☑      │  Checkbox (auto-launch on boot)
│  Check for Updates               │
│  ──────────────────────────────  │
│  Quit                    Ctrl+Q  │
└──────────────────────────────────┘
```

**Notification badge:**
- On Windows: the tray icon itself gets a red dot overlay when `unreadNotificationCount > 0`
- On macOS: use `tray.setTitle('1')` to show a number badge next to the menu bar icon

**Tray click behaviour:**
- Single click (Windows): show tray menu
- Double click (Windows): open full app
- Single click (macOS): show tray menu (standard macOS menu bar behaviour)

### 7.3 Notification Popups

When a scheduled message arrives (from the existing Feature C scheduler):

1. The backend inserts a row into `scheduled_messages` table
2. The frontend polls `GET /api/scheduler/pending` (already implemented)
3. In Electron: instead of (or in addition to) the in-app notification, fire a native OS notification:

```javascript
const { Notification } = require('electron');

new Notification({
  title: characterName,
  body: messagePreview.slice(0, 100),
  icon: characterAvatarPath,  // Native image, not a URL
  silent: false,              // Play system notification sound
  urgency: 'normal',
}).show();
```

Clicking the notification:
- If pet mode: show the pet and display the full message in a speech bubble
- If full app: focus the app and scroll to the message

---

## 8. Native OS Integration

### 8.1 Global Keyboard Shortcuts

All shortcuts registered via `globalShortcut.register()` in the main process. These work even when the app is not focused.

| Shortcut | Action | Configurable |
|----------|--------|--------------|
| `Ctrl+Shift+P` / `Cmd+Shift+P` | Toggle desktop pet visibility | Yes |
| `Ctrl+Shift+S` / `Cmd+Shift+S` | Toggle compact sidebar | Yes |
| `Ctrl+Shift+F` / `Cmd+Shift+F` | Show/focus full app | Yes |
| `Ctrl+Shift+V` / `Cmd+Shift+V` | Toggle voice mode (A1 full-duplex) | Yes |
| `Ctrl+Shift+M` / `Cmd+Shift+M` | Mute/unmute TTS | Yes |
| `Ctrl+Shift+C` / `Cmd+Shift+C` | Quick chat (focus pet input or open pet + focus) | Yes |

**Custom shortcut configuration:**
- Stored in `electron-store` under `globalShortcuts: { [action]: string }`
- Exposed in Settings -> Keyboard -> Global Shortcuts (separate section from in-app shortcuts)
- Validation: check for conflicts with OS-reserved shortcuts (Ctrl+Alt+Del, etc.) and existing in-app shortcuts (`customKeyBindings` in appStore)

### 8.2 Native File Dialogs

Replace the browser's `<input type="file">` with Electron's `dialog.showOpenDialog()`:

| Use Case | Current (Browser) | Electron |
|----------|-------------------|----------|
| Import VRM model | `<input type="file" accept=".vrm">` | `dialog.showOpenDialog({ filters: [{ name: 'VRM Models', extensions: ['vrm'] }], properties: ['openFile'] })` |
| Import Live2D model | Drag-and-drop onto a drop zone | `dialog.showOpenDialog({ filters: [{ name: 'Live2D', extensions: ['moc3', 'model3.json'] }] })` |
| Import ROM file | File picker | `dialog.showOpenDialog({ filters: [{ name: 'ROM Files', extensions: ['z64', 'bin', 'iso', 'gba'] }] })` |
| Export data ZIP | Download via `<a href>` | `dialog.showSaveDialog({ defaultPath: 'waifu-export.zip', filters: [{ name: 'ZIP', extensions: ['zip'] }] })` |
| Import character card | File picker | `dialog.showOpenDialog({ filters: [{ name: 'Character Cards', extensions: ['json', 'png'] }] })` |

**IPC pattern:**
```javascript
// preload.js
contextBridge.exposeInMainWorld('electronAPI', {
  showOpenDialog: (options) => ipcRenderer.invoke('show-open-dialog', options),
  showSaveDialog: (options) => ipcRenderer.invoke('show-save-dialog', options),
});

// main.js
ipcMain.handle('show-open-dialog', async (event, options) => {
  const result = await dialog.showOpenDialog(mainWindow, options);
  return result; // { canceled, filePaths }
});
```

**Frontend integration:** The React API layer (`api.ts`) checks for `window.electronAPI?.showOpenDialog` and uses it when available, falling back to `<input type="file">` for browser mode. This keeps the browser version working.

### 8.3 Native Notifications

Integrated with the existing scheduler system:

```javascript
// When scheduledNotifications changes in appStore:
const { Notification } = require('electron');

function showNativeNotification(notification) {
  const n = new Notification({
    title: notification.charName,
    body: notification.preview,
    icon: nativeImage.createFromPath(
      path.join(storagePath, 'avatars', `${notification.charId}.png`)
    ),
    silent: false,
    timeoutType: 'default',
  });

  n.on('click', () => {
    // Focus the app and navigate to the character
    mainWindow.show();
    mainWindow.focus();
    mainWindow.webContents.send('navigate-to-character', notification.charId);
  });

  n.show();
}
```

### 8.4 macOS Dock Integration

- Custom dock icon (character avatar or app icon)
- Dock menu (right-click on dock icon):
  - Show Full App
  - Desktop Pet Mode
  - Recent Characters (last 3)
  - Quit
- Badge count for unread messages: `app.setBadgeCount(unreadCount)`

### 8.5 Windows Taskbar Integration

- Thumbnail toolbar buttons (the mini-buttons that appear in the taskbar preview):
  - Pet Mode toggle
  - Mute toggle
  - Voice Mode toggle
- Jump list (right-click on taskbar icon):
  - Recent Characters
  - Quick Chat
  - Settings
- Progress bar on the taskbar icon during model loading: `mainWindow.setProgressBar(0.5)`

### 8.6 Launch on Startup

```javascript
// electron/main.js
const { app } = require('electron');

// Check/set login item
function setAutoLaunch(enabled) {
  app.setLoginItemSettings({
    openAtLogin: enabled,
    openAsHidden: true,  // Start minimized to tray
    path: app.getPath('exe'),
  });
}
```

When starting on login:
1. App launches minimized (no visible window)
2. System tray icon appears
3. If the user had pet mode enabled before quitting, the pet window auto-shows
4. The backend (`run.sh`-equivalent) starts automatically as a child process

---

## 9. Auto-Updater

### 9.1 Technology Choice

Use **`electron-updater`** from `electron-builder`. Reasons:
- Integrated with `electron-builder` (which we use for packaging)
- Supports differential updates (only downloads changed files, not the entire app)
- Supports both GitHub Releases and S3 as update servers
- Works on both Windows (Squirrel/NSIS) and macOS

### 9.2 Update Channels

| Channel | Purpose | Update Frequency |
|---------|---------|------------------|
| `stable` | Production releases | Monthly or on critical fix |
| `beta` | Pre-release testing | Weekly during active development |

Users can switch channels in Settings -> General -> Update Channel. Switching to beta prompts a confirmation dialog.

### 9.3 Update Flow

```
User opens app
  │
  ├─ autoUpdater.checkForUpdates() (on app ready, then every 6 hours)
  │
  ├─ If update available:
  │    │
  │    ├─ Show tray notification: "Update available: v2.1.0"
  │    ├─ Show in-app banner (non-intrusive, at the top of the full app)
  │    │
  │    └─ User clicks "Install Update":
  │         ├─ Download in background (progress shown in tray icon)
  │         ├─ On download complete: "Restart to update?"
  │         └─ autoUpdater.quitAndInstall()
  │
  └─ If no update: silent (no notification)
```

### 9.4 Python Backend Updates

This is the hard problem. The Electron shell and the Python backend are separate codebases with separate versioning.

**Strategy: bundled backend**

The Python backend is bundled INTO the Electron installer using PyInstaller (see section 10). This means:
- The entire app (Electron + Python + .venv + SQLite DB) is a single installer
- When `electron-updater` downloads a new version, it replaces BOTH the Electron shell AND the Python backend
- The SQLite database is NOT in the app bundle -- it lives in `app.getPath('userData')` (per-user data directory), so it survives updates
- Database migrations (`preflight.py`) run on first launch after update, upgrading the schema as needed

**Alternative strategy: separate backend updater**

If the backend changes frequently and independently from the frontend:
- Backend is a separate binary (PyInstaller one-file or one-folder)
- Backend has its own version number
- On app launch: Electron checks `GET /api/version` against the expected backend version
- If mismatch: download the new backend binary from the update server and replace it
- More complex, but allows updating the backend without re-downloading Chromium

**Recommendation:** Start with bundled (simpler), move to separate if release cadence demands it.

---

## 10. Build and Distribution

### 10.1 electron-builder Configuration

```json
{
  "appId": "com.waifu-rt3d.desktop",
  "productName": "Waifu RT3D",
  "directories": {
    "output": "dist-electron"
  },
  "files": [
    "electron/**/*",
    "!node_modules",
    "!frontends",
    "!backend",
    "!.venv"
  ],
  "extraResources": [
    {
      "from": "backend-dist/",
      "to": "backend",
      "filter": ["**/*"]
    }
  ],
  "win": {
    "target": [
      {
        "target": "nsis",
        "arch": ["x64"]
      }
    ],
    "icon": "electron/assets/icon.ico",
    "publisherName": "Waifu RT3D",
    "signAndEditExecutable": true
  },
  "nsis": {
    "oneClick": false,
    "allowToChangeInstallationDirectory": true,
    "installerIcon": "electron/assets/installer-icon.ico",
    "uninstallerIcon": "electron/assets/uninstaller-icon.ico",
    "installerHeaderIcon": "electron/assets/installer-header.ico",
    "createDesktopShortcut": true,
    "createStartMenuShortcut": true,
    "perMachine": false
  },
  "mac": {
    "target": [
      {
        "target": "dmg",
        "arch": ["arm64", "x64"]
      }
    ],
    "icon": "electron/assets/icon.icns",
    "category": "public.app-category.entertainment",
    "hardenedRuntime": true,
    "entitlements": "electron/entitlements.mac.plist",
    "entitlementsInherit": "electron/entitlements.mac.plist"
  },
  "dmg": {
    "background": "electron/assets/dmg-background.png",
    "iconSize": 128,
    "window": {
      "width": 540,
      "height": 380
    },
    "contents": [
      { "x": 130, "y": 220 },
      { "x": 410, "y": 220, "type": "link", "path": "/Applications" }
    ]
  },
  "publish": {
    "provider": "github",
    "owner": "owner",
    "repo": "waifu-rt3d",
    "releaseType": "release"
  }
}
```

### 10.2 Python Backend Bundling Strategy

The Python backend must be packaged into a standalone executable that ships inside the Electron app. Options:

**Option A: PyInstaller (recommended)**

PyInstaller compiles the Python backend + all dependencies into a single directory or single file.

```bash
# Build command (from project root)
.venv/bin/pyinstaller \
  --name waifu-backend \
  --distpath backend-dist/ \
  --add-data "backend/config:backend/config" \
  --add-data "frontends/sakura/dist:frontends/sakura/dist" \
  --add-data "frontends/shared:frontends/shared" \
  --add-data "frontends/neon:frontends/neon" \
  --hidden-import uvicorn.lifespan.on \
  --hidden-import uvicorn.logging \
  --hidden-import sqlite3 \
  --hidden-import backend.agent.runner \
  --hidden-import backend.llm.adapters.claude_api \
  --hidden-import backend.llm.adapters.openai_compat \
  --hidden-import backend.tts.model_manager \
  --hidden-import backend.motion \
  backend/server.py
```

**One-folder vs one-file:**
- One-folder: faster startup (no temp extraction), recommended for production
- One-file: simpler distribution but 5-10s startup delay while extracting to temp
- Recommendation: one-folder, placed in `extraResources/backend/`

**Size estimate:**
- Python interpreter: ~30 MB
- FastAPI + Starlette + Uvicorn + Pydantic: ~15 MB
- SQLite (bundled with Python): ~1 MB
- Other deps (psutil, httpx, etc.): ~10 MB
- Frontend dist (Sakura + shared + neon): ~5 MB
- **Total PyInstaller bundle: ~60-80 MB**

**Option B: Ship the .venv directly**

Instead of PyInstaller, copy the entire `.venv/` directory into the installer and run Python directly. Simpler but:
- Much larger (~200-400 MB for the full venv)
- Platform-specific (Python binaries compiled for the host OS)
- Not suitable for distribution -- use only as a development shortcut

**Option C: uv + pip freeze lockfile**

Ship a `requirements.lock` and have the installer run `uv pip install` on first launch. Requires internet access at install time and a compatible Python on the user's system. Not recommended for a consumer app.

**Recommendation: Option A (PyInstaller one-folder).**

### 10.3 Electron Launch of Python Backend

On app startup, the Electron main process spawns the Python backend as a child process:

```javascript
const { spawn } = require('child_process');
const backendPath = path.join(process.resourcesPath, 'backend', 'waifu-backend');

let backendProcess = null;

function startBackend() {
  const dbPath = path.join(app.getPath('userData'), 'app.db');
  const storagePath = path.join(app.getPath('userData'), 'storage');

  backendProcess = spawn(backendPath, [], {
    env: {
      ...process.env,
      WAIFU_DB_PATH: dbPath,
      WAIFU_STORAGE_PATH: storagePath,
      WAIFU_PORT: '8080',
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  // Wait for the backend to be ready
  return new Promise((resolve) => {
    backendProcess.stdout.on('data', (data) => {
      const msg = data.toString();
      if (msg.includes('Uvicorn running on') || msg.includes('Application startup complete')) {
        resolve();
      }
    });
    // Timeout: if backend doesn't start in 15s, show error dialog
    setTimeout(() => resolve(), 15000);
  });
}

// On app quit: gracefully terminate the backend
app.on('before-quit', () => {
  if (backendProcess) {
    backendProcess.kill('SIGTERM');
  }
});
```

### 10.4 Total File Size Estimates

| Component | Windows (x64) | macOS (arm64) |
|-----------|---------------|---------------|
| Electron shell (Chromium + Node) | ~165 MB | ~170 MB |
| Python backend (PyInstaller) | ~75 MB | ~80 MB |
| Frontend assets (React + CSS + JS) | ~3 MB | ~3 MB |
| Shared assets (Three.js, VRM loader) | ~4 MB | ~4 MB |
| Electron app code (main.js, preload.js) | ~50 KB | ~50 KB |
| Tray/dock icons + assets | ~500 KB | ~500 KB |
| **Total installer (compressed NSIS/DMG)** | **~180-220 MB** | **~190-230 MB** |
| **Installed size** | **~350-400 MB** | **~360-410 MB** |

Note: This does NOT include VRM models (~10-50 MB each), LLM models (4-14 GB each), or TTS models (~100 MB each). Those are downloaded separately by the user.

### 10.5 Code Signing

**Windows:**
- Requires a code signing certificate (OV or EV)
- OV (Organization Validation): ~$200-400/year, immediate issuance, but Windows SmartScreen shows warnings for the first few installs
- EV (Extended Validation): ~$300-500/year, requires hardware token (USB), immediate SmartScreen reputation
- Recommendation: start with OV, upgrade to EV if SmartScreen warnings become a user complaint
- Signing is done by `electron-builder` using SignTool during the build process

**macOS:**
- Requires an Apple Developer ID certificate ($99/year Apple Developer Program)
- Must also notarize the app with Apple's notarization service (automated by `electron-builder` via `@electron/notarize`)
- Without notarization: macOS Gatekeeper blocks the app with "unidentified developer" warning
- Hardened runtime must be enabled (`hardenedRuntime: true` in config)
- Entitlements needed: `com.apple.security.cs.allow-jit` (for V8), `com.apple.security.cs.allow-unsigned-executable-memory` (for Chromium)

---

## 11. Migration from Browser to Electron

### 11.1 Coexistence Strategy

The browser version and Electron version MUST coexist. The browser version is the development workflow (Vite dev server, hot reload) and also the fallback for users who do not want to install a native app.

**Principle: zero frontend code changes for Electron.**

The React frontend, Zustand stores, CSS, and API layer (`api.ts`) work identically in both environments. The only differences:

| Feature | Browser | Electron |
|---------|---------|----------|
| Window transparency | Not possible | `BrowserWindow({ transparent: true })` |
| Global hotkeys | Only when focused | `globalShortcut.register()` |
| System tray | Not possible | `Tray` API |
| File dialogs | `<input type="file">` | `dialog.showOpenDialog()` |
| Native notifications | `Notification` API (limited) | Full native notifications |
| Click-through | Not possible | `setIgnoreMouseEvents` |
| Always-on-top | Not reliable | `setAlwaysOnTop` with level control |
| Pet mode route | Shows in browser tab (useless) | Shows in transparent overlay |

**Detection of Electron:**
```typescript
// In the React app
const isElectron = typeof window !== 'undefined' && window.electronAPI !== undefined;
```

This is checked in:
- `api.ts`: use `electronAPI.showOpenDialog` instead of `<input type="file">`
- `main.tsx`: add `/pet` and `/compact` routes (only useful in Electron, but harmless in browser)
- `deviceDetect.ts`: extend with `isElectronPet()` and `isElectronCompact()` checks

### 11.2 User Migration Path

1. User downloads the Electron installer from GitHub Releases
2. User runs the installer (NSIS on Windows, DMG on macOS)
3. The installer creates the app in Program Files / Applications
4. On first launch:
   - The app detects if a `backend/storage/app.db` exists in the old project directory
   - If yes: offers to import the database (characters, sessions, messages, memories) into the new `userData` location
   - If no: starts fresh with the onboarding wizard
5. The browser version continues to work independently (separate database, separate process)

### 11.3 Data Migration Details

```javascript
// electron/migration.js
const oldDbPath = path.join(process.cwd(), 'backend', 'storage', 'app.db');
const newDbPath = path.join(app.getPath('userData'), 'app.db');

async function migrateFromBrowser() {
  if (fs.existsSync(oldDbPath) && !fs.existsSync(newDbPath)) {
    const { response } = await dialog.showMessageBox(mainWindow, {
      type: 'question',
      title: 'Import existing data?',
      message: 'Found an existing Waifu RT3D database. Import your characters, conversations, and settings?',
      buttons: ['Import', 'Start Fresh'],
      defaultId: 0,
    });

    if (response === 0) {
      fs.copyFileSync(oldDbPath, newDbPath);
      // Also copy avatar images, VRM models, audio samples
      copyDirectorySync(
        path.join(process.cwd(), 'backend', 'storage'),
        path.join(app.getPath('userData'), 'storage')
      );
    }
  }
}
```

---

## 12. What Electron Unlocks Beyond Pet Mode

### 12.1 Full Filesystem Access

Currently, the browser has limited filesystem access. File paths for VRM models, Live2D models, and ROM files are served through the FastAPI backend's `StaticFiles` mounts. In Electron:

- **Direct file:// access** to local files (with proper security: only within approved directories)
- **Drag-and-drop from Explorer/Finder** directly into the app window, with the full file path exposed (not just the file contents)
- **Watch directories** for new files using `fs.watch` -- automatically detect when the user adds a new VRM model to a designated folder

### 12.2 Hardware Acceleration Flags

Electron can pass Chromium command-line flags to optimize WebGL performance:

```javascript
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('enable-features', 'Vulkan,CanvasOopRasterization');
app.commandLine.appendSwitch('enable-webgl2-compute-context');
// For the RTX 5080 specifically:
app.commandLine.appendSwitch('enable-unsafe-webgpu');  // Enable WebGPU (experimental)
app.commandLine.appendSwitch('use-angle', 'd3d11on12');  // Better DirectX 12 support
```

These flags can significantly improve Three.js rendering performance, especially for complex VRM models with multiple meshes, blend shapes, and shadows.

### 12.3 WebGPU Future Path

Electron 33+ (Chromium 130+) has WebGPU support behind a flag. Three.js r158+ has a `WebGPURenderer`. This is the future migration path:
- Phase 1 (current): WebGL2 via `WebGLRenderer` -- works everywhere
- Phase 2 (future): WebGPU via `WebGPURenderer` -- 2-4x performance improvement on modern GPUs
- Electron makes this migration easier because we control the Chromium version (no need to wait for browser adoption)

### 12.4 Discord Rich Presence

Show the active character and current activity in the user's Discord status:

```javascript
const DiscordRPC = require('discord-rpc');
const rpc = new DiscordRPC.Client({ transport: 'ipc' });

async function updatePresence(characterName, activity) {
  await rpc.setActivity({
    details: `Chatting with ${characterName}`,
    state: activity,  // 'playing Vigilante 8', 'relaxing', 'voice call'
    largeImageKey: 'app-icon',
    largeImageText: 'Waifu RT3D',
    smallImageKey: characterName.toLowerCase(),  // Character-specific icon
    smallImageText: characterName,
    startTimestamp: sessionStartTime,
  });
}
```

### 12.5 Native Title Bar Customization

With `frame: false` and `titleBarStyle: 'hidden'`, we can build a fully custom title bar:

```
┌─[●][●][●]──────── Waifu RT3D ─── [Rin] ❤ 82% ──────────[─][□][×]┐
│                                                                      │
```

- Left: macOS traffic lights (native, positioned with CSS `-webkit-app-region: drag`)
- Center: app name + active character name + affinity badge
- Right: Windows caption buttons (native via `titleBarOverlay`)
- The entire title bar is a drag region for window movement
- On macOS: respects system appearance (light/dark mode traffic lights)

### 12.6 Protocol Handler (Deep Links)

Register `waifu://` as a custom protocol:

```javascript
app.setAsDefaultProtocolClient('waifu');

// Handle waifu:// URLs
app.on('open-url', (event, url) => {
  // waifu://character/123 -> open character with ID 123
  // waifu://import?card=https://... -> import a character card
  // waifu://voice -> start voice mode
  const parsed = new URL(url);
  handleDeepLink(parsed);
});
```

This enables:
- Sharing character cards via clickable links
- Opening specific characters from external tools
- Browser-to-app handoff (clicking a link on a website opens the desktop app)

---

## File Structure for Electron Integration

```
waifu-rt3d/
├── electron/
│   ├── main.js                  # Main process (windows, tray, IPC, global shortcuts)
│   ├── preload.js               # contextBridge for renderer access to native APIs
│   ├── preload-pet.js           # Pet-specific preload (adds hit-test IPC)
│   ├── updater.js               # Auto-update logic
│   ├── migration.js             # Browser -> Electron data migration
│   ├── tray.js                  # System tray setup and dynamic icon
│   ├── shortcuts.js             # Global shortcut registration
│   ├── backend-launcher.js      # Spawn and manage Python backend process
│   ├── window-manager.js        # Create/switch between Full/Compact/Pet windows
│   ├── store.js                 # electron-store config (positions, preferences)
│   ├── entitlements.mac.plist   # macOS code signing entitlements
│   └── assets/
│       ├── icon.ico             # Windows app icon (256x256)
│       ├── icon.icns            # macOS app icon
│       ├── tray-icon.png        # 22x22 tray icon (monochrome)
│       ├── tray-icon@2x.png     # Retina tray icon
│       ├── dmg-background.png   # macOS DMG installer background
│       ├── installer-icon.ico   # NSIS installer icon
│       └── installer-header.ico # NSIS header icon
├── electron-builder.json        # Build configuration
├── package.json                 # Root: add electron, electron-builder, electron-store deps
├── frontends/sakura/src/
│   ├── views/PetView.tsx        # NEW: transparent pet overlay view
│   ├── views/CompactView.tsx    # NEW: compact sidebar view
│   ├── components/
│   │   ├── PetSpeechBubble.tsx  # NEW: floating interaction panel for pet mode
│   │   └── PetContextMenu.tsx   # NEW: right-click menu items (renders nothing, sends IPC)
│   ├── hooks/
│   │   └── useHitTest.ts        # NEW: WebGL pixel alpha reading + IPC for click-through
│   └── lib/
│       └── electron.ts          # NEW: type-safe wrapper around window.electronAPI
└── backend/                     # UNCHANGED
```

---

## Implementation Phases (Estimated)

> These phases are for planning purposes only. They represent the order in which work would be done IF this feature is greenlit.

### Phase 0: Foundation (2-3 days)
- Add Electron to the project (`electron`, `electron-store`, `electron-builder` as devDependencies)
- Write `electron/main.js` with basic Full App window loading `http://localhost:8080/sakura/`
- Write `electron/preload.js` with minimal `contextBridge`
- Write `electron/backend-launcher.js` to spawn the Python backend
- Verify: the entire app works identically inside Electron
- Write `electron-builder.json` for Windows + macOS builds
- Test build on both platforms

### Phase 1: System Tray + Global Shortcuts (1-2 days)
- Implement `electron/tray.js` with full context menu
- Implement `electron/shortcuts.js` with `Ctrl+Shift+P/S/F`
- System tray icon with character avatar + mood dot
- Native notifications for scheduled messages
- Start-on-login toggle

### Phase 2: Transparent Pet Window (3-4 days)
- Create pet window with full transparency stack
- New `/pet` route in React + `PetView.tsx`
- Modify `viewer.html` to properly clear background in Electron pet mode
- Implement hit-test click-through loop (`useHitTest.ts`)
- Implement `PetSpeechBubble.tsx` interaction panel
- Position persistence via `electron-store`
- Drag-to-move on character
- Drop shadow via CSS filter
- Mode switching (Full App <-> Pet)

### Phase 3: Pet Interactions + Compact Mode (2-3 days)
- Right-click context menu (Electron `Menu.popup`)
- Resize handles
- Double-click to open full app
- `CompactView.tsx` + compact sidebar window
- Edge docking behaviour
- Controller support (Gamepad API)

### Phase 4: Enhanced Idle + Gaming Integration (2-3 days)
- Pet-specific idle behaviours (desktop_scan, yawn, doze, wake_up, screen_tap, wave_at_cursor)
- Time-of-day behaviour integration with A4 mood system
- Gaming mode detection + compact pet behaviour
- `setIdleMode` postMessage protocol

### Phase 5: Native File Dialogs + Polish (1-2 days)
- Replace `<input type="file">` with `dialog.showOpenDialog` throughout
- Custom title bar with character info
- Hardware acceleration flags
- Discord Rich Presence (optional)
- Deep link protocol handler

### Phase 6: Build + Distribution (2-3 days)
- PyInstaller bundling of the Python backend
- Code signing (Windows OV cert + macOS Developer ID)
- NSIS installer configuration
- DMG installer configuration
- Auto-updater with GitHub Releases
- Data migration from browser to Electron
- Test on clean Windows + macOS installations

**Total estimated effort: 13-20 days of focused implementation.**

---

## Open Questions and Risks

1. **Anti-cheat compatibility:** Some games' anti-cheat systems may flag the transparent overlay window. This only matters for online competitive games (not the retro emulated games this project targets), but should be documented.

2. **macOS fullscreen limitation:** The pet cannot overlay native fullscreen apps on macOS. This is a hard OS limitation. Must be clearly communicated to users.

3. **WebGL readPixels performance on integrated GPUs:** The hit-test loop depends on `readPixels`, which is fast on discrete GPUs (RTX 5080) but may be slow on integrated (Intel UHD). Need a fallback: if readPixels takes >5ms, reduce hit-test frequency to 10Hz.

4. **Electron security:** The preload script must be carefully scoped. `nodeIntegration: false` and `contextIsolation: true` are mandatory. The `contextBridge` should expose the minimum necessary API surface.

5. **Python backend crash recovery:** If the Python process crashes, the Electron main process must detect this (via `child_process.on('exit')`) and offer to restart it. A crash counter prevents infinite restart loops.

6. **Multiple monitors with different DPI:** The hit-test pixel coordinates must account for per-monitor DPI scaling on Windows. `window.devicePixelRatio` may change when the pet is dragged between monitors.

7. **Installer size:** 180-220 MB is acceptable for a desktop app, but is large compared to typical utilities. The size is dominated by Chromium (165 MB) -- this is inherent to Electron and cannot be reduced significantly.

---

### Critical Files for Implementation
- `/Users/chris/Code/waifu-rt3d/frontends/shared/viewer/viewer.html` - "Core 3D viewer: needs pet-mode transparency changes (scene.background=null, setClearAlpha(0)), already has pet-mode CSS and idle animation layers"
- `/Users/chris/Code/waifu-rt3d/frontends/sakura/src/App.tsx` - "Must add /pet and /compact route detection, mode-aware rendering, new PetView and CompactView entry points"
- `/Users/chris/Code/waifu-rt3d/frontends/sakura/src/stores/appStore.ts` - "Needs windowMode state (full/compact/pet), Electron detection flag, and IPC bridge for mode switching"
- `/Users/chris/Code/waifu-rt3d/frontends/sakura/src/main.tsx` - "Entry point that routes between App/MobileApp -- must add Electron pet/compact modes as additional rendering paths"
- `/Users/chris/Code/waifu-rt3d/backend/server.py` - "Backend stays unchanged, but must validate that StaticFiles mounts and CORS work correctly when served to Electron's BrowserWindow (origin changes from localhost to file:// or custom protocol)"