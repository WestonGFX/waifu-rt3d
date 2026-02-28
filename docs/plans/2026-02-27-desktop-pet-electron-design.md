# Desktop Pet Mode — Electron Overlay Design Document

> **Status:** Design complete. Current desktop pet (browser window) is a dead end for true
> overlay behaviour. This doc specifies the Electron wrapper that unlocks transparent,
> always-on-top, click-through desktop pet mode.
>
> **Core requirement:** The window background must be fully transparent so the character
> appears to exist directly on the user's desktop/screen — no white box, no browser chrome,
> no dedicated screen required.

---

## Why Electron (not browser)

| Requirement | Browser window | Electron |
|-------------|---------------|----------|
| Transparent background | ❌ Cannot do | ✅ `transparent: true` |
| Always on top of other apps | Partial (OS-dependent, unreliable) | ✅ `setAlwaysOnTop(true, 'screen-saver')` |
| Click-through transparent areas | ❌ Impossible | ✅ `setIgnoreMouseEvents(true, {forward: true})` |
| Global keyboard shortcut | ❌ Only when focused | ✅ `globalShortcut.register()` |
| System tray icon | ❌ No | ✅ `Tray` API |
| No title bar / window chrome | Partial | ✅ `frame: false` |
| Position persists across sessions | ❌ No | ✅ `electron-store` |
| Native file picker (VRM/ROMs) | Partial (drag-drop) | ✅ `dialog.showOpenDialog()` |

The existing React frontend, FastAPI backend, and Three.js VRM viewer require **zero changes**
for Electron wrapping — Electron is just a Chromium wrapper that loads the same
`http://localhost:8080` app URL. The entire migration is adding ~5 new Electron-specific files.

---

## Window Modes

The app runs in three window modes, switchable at runtime:

```
Mode 1: FULL APP
  Normal maximised window — all panels, sidebar, chat, everything visible
  Same as the current browser experience, just inside Electron

Mode 2: COMPACT SIDEBAR
  Narrow vertical strip (300px wide) docked to screen edge
  Character face / status bar / latest message / quick-reply input
  Useful when gaming — keep companion visible without blocking the game

Mode 3: DESKTOP PET OVERLAY ← the new thing
  Fullscreen transparent window, always on top
  Only the VRM character is visible — no other UI
  Background is 100% transparent: character appears to stand on the desktop
  Click-through on transparent areas (mouse passes to app below)
  Interactive on the character body (click → speech bubble appears)
```

User toggles between modes from the system tray menu or global hotkey (`Ctrl+Shift+P`).

---

## Transparent Overlay Implementation

### Electron Main Process

```javascript
// electron/main.js

const { app, BrowserWindow, globalShortcut, Tray, Menu, ipcMain } = require('electron');
const path = require('path');
const Store = require('electron-store');

const store = new Store();

let mainWindow = null;     // Full app window
let petWindow = null;      // Transparent overlay window
let tray = null;

function createPetWindow() {
  const savedPos = store.get('petPosition', { x: 100, y: 100 });

  petWindow = new BrowserWindow({
    x: savedPos.x,
    y: savedPos.y,
    width: 300,
    height: 500,

    // The critical settings for transparent desktop pet:
    transparent: true,          // Window background is transparent
    frame: false,               // No title bar, no border, no window chrome
    alwaysOnTop: true,          // Floats above all other applications
    skipTaskbar: true,          // Does not appear in taskbar / dock
    hasShadow: false,           // No OS drop shadow (character has its own)
    resizable: true,            // User can resize to make character bigger/smaller

    // Allow the window to receive mouse events even though it's transparent
    // setIgnoreMouseEvents is toggled dynamically for click-through (see below)
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // Load the pet-specific view (minimal UI — just the VRM viewer)
  petWindow.loadURL('http://localhost:8080/pet');

  // Persist position on move
  petWindow.on('moved', () => {
    const [x, y] = petWindow.getPosition();
    store.set('petPosition', { x, y });
  });

  // Remove from memory when closed
  petWindow.on('closed', () => { petWindow = null; });
}

// IPC: renderer tells main whether to pass clicks through
// (called continuously from the renderer's mousemove hit-test loop)
ipcMain.on('set-click-through', (event, shouldPassThrough) => {
  if (petWindow) {
    petWindow.setIgnoreMouseEvents(shouldPassThrough, { forward: true });
    // forward: true means mouse events are forwarded to the window below
    // even while ignore is active — user can still interact with their apps
  }
});

// Global hotkey — toggle pet mode from anywhere (even mid-game)
app.whenReady().then(() => {
  globalShortcut.register('CommandOrControl+Shift+P', () => {
    if (petWindow) {
      petWindow.isVisible() ? petWindow.hide() : petWindow.show();
    } else {
      createPetWindow();
    }
  });

  createTray();
});
```

### Click-Through Hit Testing (Renderer)

The magic: continuously check if the mouse is over a transparent pixel. If it is,
clicks pass through to the app behind. If it's over the character, clicks are captured.

```javascript
// In the pet window's renderer (injected into /pet route via useEffect)

const canvas = document.getElementById('vrm-canvas'); // Three.js canvas
const ctx2d = document.createElement('canvas');       // offscreen for pixel reading
// Three.js renders to petCanvas; we read pixels from it

let lastWasTransparent = true;

document.addEventListener('mousemove', (e) => {
  // Read the alpha value of the pixel under the cursor from the WebGL canvas
  const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
  const pixel = new Uint8Array(4);
  gl.readPixels(
    e.clientX,
    canvas.height - e.clientY,   // WebGL y-axis is flipped
    1, 1,
    gl.RGBA, gl.UNSIGNED_BYTE,
    pixel
  );

  const alpha = pixel[3]; // 0 = fully transparent, 255 = fully opaque
  const isTransparent = alpha < 15; // small threshold for antialiasing edges

  // Only send IPC if state changed (avoid flooding main process)
  if (isTransparent !== lastWasTransparent) {
    lastWasTransparent = isTransparent;
    window.electronAPI.setClickThrough(isTransparent);
  }
});
```

### Three.js Renderer — Transparent Background

The VRM viewer already supports this — just needs the flag confirmed:

```javascript
// In viewer.html / Three.js setup
const renderer = new THREE.WebGLRenderer({
  canvas: document.getElementById('vrm-canvas'),
  alpha: true,              // Transparent background ← already set
  antialias: true,
  premultipliedAlpha: false // Important for correct transparency compositing
});
renderer.setClearColor(0x000000, 0); // Clear to fully transparent black
```

The character renders on a transparent canvas. Electron composites that transparent
window on top of the desktop. Result: character appears to stand directly on the screen.

### Character Drop Shadow

Without a window chrome, the character needs a subtle shadow to be visible against
light-coloured backgrounds (white desktop, bright apps):

```javascript
// In viewer.html — add a directional drop shadow to the character
// This is a post-process effect, not a window shadow
const shadowPass = new PCSS_ShadowPass(); // soft shadow beneath character feet
// Or simpler: a subtle CSS drop-filter on the canvas element itself
canvas.style.filter = 'drop-shadow(0px 8px 16px rgba(0,0,0,0.35))';
// drop-shadow respects transparency — only the character pixels get the shadow
```

---

## System Tray

```javascript
// electron/main.js — tray setup
function createTray() {
  tray = new Tray(path.join(__dirname, 'assets/tray-icon.png')); // 16×16 or 22×22

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show App',          click: () => mainWindow.show() },
    { label: 'Desktop Pet Mode',  click: createPetWindow,  type: 'radio' },
    { label: 'Compact Sidebar',   click: createSidebarWindow, type: 'radio' },
    { type: 'separator' },
    { label: 'Mute Character',    type: 'checkbox', checked: false,
      click: (item) => ipcMain.emit('set-muted', item.checked) },
    { type: 'separator' },
    { label: 'Quit',              click: () => app.quit() },
  ]);

  tray.setToolTip('Waifu RT3D');
  tray.setContextMenu(contextMenu);
  tray.on('double-click', () => mainWindow.show());
}
```

---

## Pet Window — Interaction Model

When the user **clicks** on the character (non-transparent pixel), a small interaction
panel appears near the character:

```
        ┌─────────────────────┐
        │  "Hey, what's up?"  │  ← Latest message or greeting
        ├─────────────────────┤
        │  💬  Chat           │  → Opens full app window to chat thread
        │  🎮  Play a game    │  → Opens game picker
        │  🎤  Voice mode     │  → Opens voice conversation
        │  ✕   Dismiss        │
        └─────────────────────┘
              ▲
         [Character]
```

This panel is also transparent-background, always-on-top. It auto-dismisses after
5 seconds of inactivity or when the user clicks away.

**Right-click** on character → context menu:
- "Move me here" (character follows cursor until next click)
- "Resize" (resize handle appears)
- "Change expression" (quick emotion picker)
- "Settings"

**Drag** on character body → moves the pet window

---

## /pet Route in React

A new minimal route in the React app, loaded only in the pet window:

```tsx
// frontends/sakura/src/views/PetView.tsx
// Minimal overlay view — just the VRM character, no sidebar, no chat

export function PetView() {
  const { activeCharacter } = useAppStore();

  // Hit-test loop — sends click-through status to Electron main process
  useEffect(() => {
    const canvas = document.getElementById('vrm-canvas') as HTMLCanvasElement;
    if (!canvas || !window.electronAPI) return;

    const handleMouseMove = (e: MouseEvent) => {
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      if (!gl) return;
      const pixel = new Uint8Array(4);
      gl.readPixels(e.clientX, canvas.height - e.clientY, 1, 1,
                    gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      window.electronAPI.setClickThrough(pixel[3] < 15);
    };

    document.addEventListener('mousemove', handleMouseMove);
    return () => document.removeEventListener('mousemove', handleMouseMove);
  }, []);

  return (
    <div style={{ width: '100vw', height: '100vh', background: 'transparent' }}>
      {/* VRM viewer iframe — alpha:true already set */}
      <iframe
        src={`/frontends/shared/viewer/viewer.html?char=${activeCharacter?.id}&petMode=true`}
        style={{ width: '100%', height: '100%', border: 'none', background: 'transparent' }}
      />
      {/* Speech bubble — appears on click, positioned relative to character */}
      <PetSpeechBubble />
    </div>
  );
}
```

---

## Pet Mode — Character Positioning

The character is positioned at the **bottom edge** of the window by default
(appears to stand on the taskbar or screen bottom). User can drag anywhere.

The VRM viewer in pet mode uses a **fixed camera** looking straight at the character
at waist/chest height — no orbit controls, no background. Just the character,
idle animation running, occasionally doing a random expression or look-around gesture
every 30–60 seconds to feel alive.

Idle behaviours (no input from user):
- Random glance left/right (VRM neck rotation)
- Occasional blink (already in viewer)
- Subtle breathing animation (already in viewer)
- Random expression flicker (slight smile, curious eyebrow raise) every ~45s
- Reacts to system time: different idle animations morning/evening/night (ties into A4 mood system)

---

## Files to Create / Modify

| File | Change |
|------|--------|
| `electron/main.js` | New: Electron main process — window creation, tray, IPC, global shortcuts |
| `electron/preload.js` | New: `contextBridge` exposing `electronAPI.setClickThrough()` to renderer |
| `electron/assets/tray-icon.png` | New: 22×22 tray icon |
| `package.json` (root) | Add `electron`, `electron-store`, `electron-builder` devDependencies |
| `electron-builder.json` | New: build config (Windows NSIS installer, macOS DMG) |
| `frontends/sakura/src/views/PetView.tsx` | New: minimal transparent overlay view |
| `frontends/sakura/src/components/PetSpeechBubble.tsx` | New: floating interaction panel |
| `frontends/sakura/src/App.tsx` | Add `/pet` route |
| `frontends/shared/viewer/viewer.html` | Add `petMode` URL param → disable background, fix camera |
| `backend/server.py` | No changes needed — backend stays identical |

---

## macOS vs Windows Notes

| Feature | Windows | macOS |
|---------|---------|-------|
| Transparent window | ✅ Full support | ✅ Full support |
| Always on top above fullscreen games | ✅ `screen-saver` level | ⚠️ Only above desktop, not fullscreen apps (macOS Security Policy) |
| Click-through | ✅ | ✅ |
| Global shortcuts | ✅ | ✅ (may need Accessibility permission) |
| System tray | ✅ Taskbar | ✅ Menu bar |
| Vibrancy / blur background | N/A | Optional: `setVibrancy('ultra-dark')` for frosted-glass chat bubbles |

On macOS, the pet cannot float above a fullscreen game (Vigilante 8, etc.) due to
macOS window level restrictions. Workaround: use windowed mode for games,
or use the compact sidebar mode instead of full pet overlay while gaming.

---

## Desktop Pet + Gaming — Recommended Layout

When playing an emulated or Three.js game:

```
┌──────────────────────────────────────────────────────────┐
│                     GAME WINDOW                          │
│                (Vigilante 8 / Three.js)                  │
│                                                          │
│                                                          │
│                                            ┌──────────┐  │
│                                            │ [VRM pet]│  │
│                                            │  "Take   │  │
│                                            │  the     │  │
│                                            │  ramp!"  │  │
│                                            └──────────┘  │
│                                            ↑             │
│                            Compact pet, bottom-right     │
│                            Speech bubble from game agent │
└──────────────────────────────────────────────────────────┘
```

The pet is small (~200×300px) in gaming mode, pinned to the corner, speech bubbles
appear from the game agent (Vigilante 8 agent, Monster Rancher coach, etc.).
The user can hide her entirely with `Ctrl+Shift+P` without stopping the game.

---

## Implementation Phases

### Phase 1 — Basic Electron Wrapper (1–2 days)
1. Add Electron + electron-store to project
2. `electron/main.js` — create full-app window loading `http://localhost:8080`
3. System tray with Show/Quit
4. `electron-builder.json` — build config for Windows + Mac
5. Verify: existing app works identically inside Electron

### Phase 2 — Transparent Pet Window (2–3 days)
6. `createPetWindow()` — transparent, frameless, always-on-top
7. `/pet` route + `PetView.tsx` — minimal transparent layout
8. Hit-test click-through loop (mousemove → pixel alpha → setIgnoreMouseEvents)
9. Drag-to-move: drag on character body repositions window
10. Position persistence via electron-store
11. `PetSpeechBubble.tsx` — click-to-open interaction panel

### Phase 3 — Pet Idle Behaviours + Game Integration (1–2 days)
12. Random idle look/expression behaviours in viewer pet mode
13. Mood-based idle animation set (ties into A4 mood system)
14. Compact sidebar mode
15. `Ctrl+Shift+P` global hotkey toggle
16. Pet speech bubbles connected to game agents (V8, MR2 coach)

---

> **Note on current desktop pet:** The existing implementation that opens a browser window
> should be replaced entirely by Electron pet window. Keep the browser-window code until
> Electron is confirmed working, then remove it.
