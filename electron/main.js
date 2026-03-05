/**
 * Waifu RT3D — Electron Main Process
 *
 * Manages three window modes:
 *   1. FULL APP — Normal maximized window with all panels
 *   2. COMPACT SIDEBAR — Narrow vertical strip (Phase 3, deferred)
 *   3. DESKTOP PET — Transparent, always-on-top overlay with click-through
 *
 * The backend (FastAPI on port 8080) must be running separately.
 * Electron is a thin Chromium wrapper — no bundling changes needed.
 */

const {
  app,
  BrowserWindow,
  dialog,
  globalShortcut,
  Tray,
  Menu,
  ipcMain,
  nativeImage,
  screen,
  shell,
} = require('electron');
const path = require('path');
const Store = require('electron-store');

// ── GPU & Renderer Flags ─────────────────────────────────────────────────────
//
// These must be set before app.whenReady(). The transparent pet overlay with
// WebGL is GPU-intensive — these flags ensure hardware acceleration is used
// and the pet window isn't throttled when unfocused.

app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('disable-renderer-backgrounding');

// ── Configuration ─────────────────────────────────────────────────────────────

const store = new Store({
  defaults: {
    mainWindow: { width: 1280, height: 900, x: undefined, y: undefined },
    petWindow: { x: 100, y: 100, width: 300, height: 500 },
    petMode: false,
    muted: false,
    discordRPC: false,
    discordAppId: '',
  },
});

// Discord RPC — opt-in, gracefully handles missing dependency
const discord = require('./discord-rpc');

/** Base URL of the running FastAPI server. */
const BASE_URL = 'http://localhost:8080';

/** Whether we're in dev mode (passed via --dev flag). */
const isDev = process.argv.includes('--dev');

// ── Window References ─────────────────────────────────────────────────────────

/** @type {BrowserWindow | null} */
let mainWindow = null;

/** @type {BrowserWindow | null} */
let petWindow = null;

/** @type {Tray | null} */
let tray = null;

// ── Main App Window ───────────────────────────────────────────────────────────

/**
 * Create the full application window.
 * Loads the same URL the browser would — all React/Vite UI works identically.
 */
function createMainWindow() {
  if (mainWindow) {
    mainWindow.focus();
    return;
  }

  const saved = store.get('mainWindow');

  mainWindow = new BrowserWindow({
    width: saved.width,
    height: saved.height,
    x: saved.x,
    y: saved.y,
    minWidth: 900,
    minHeight: 600,
    title: 'Waifu RT3D',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    // Frameless looks sleeker but loses native window controls.
    // Keep frame for now — users expect standard title bar on desktop.
    frame: true,
    backgroundColor: '#0f0f0f',
  });

  mainWindow.loadURL(BASE_URL);

  // Persist window geometry on close
  mainWindow.on('close', () => {
    if (mainWindow) {
      const bounds = mainWindow.getBounds();
      store.set('mainWindow', bounds);
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Open external links in the default browser (not in Electron)
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

// ── Desktop Pet Window ────────────────────────────────────────────────────────

/**
 * Create the transparent, always-on-top pet overlay window.
 *
 * The pet window is frameless and transparent — only the character model
 * is visible. Transparent areas pass clicks through to apps below.
 * The hit-test loop runs in the renderer (preload.js + PetView.tsx)
 * and sends IPC messages to toggle click-through per pixel.
 */
function createPetWindow() {
  if (petWindow) {
    petWindow.focus();
    return;
  }

  const saved = store.get('petWindow');

  petWindow = new BrowserWindow({
    x: saved.x,
    y: saved.y,
    width: saved.width,
    height: saved.height,

    // ── Critical settings for transparent desktop pet ──
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    resizable: true,

    // Minimum size to keep the character visible
    minWidth: 150,
    minHeight: 200,

    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // Load Sakura frontend in pet mode (?pet=1 triggers PetView.tsx)
  petWindow.loadURL(`${BASE_URL}/sakura/?pet=1`);

  // Keep window on top at the highest level (above most apps)
  // 'screen-saver' level floats above nearly everything on Windows
  petWindow.setAlwaysOnTop(true, 'screen-saver');

  // Persist position on move
  petWindow.on('moved', () => {
    if (petWindow) {
      const [x, y] = petWindow.getPosition();
      store.set('petWindow.x', x);
      store.set('petWindow.y', y);
    }
  });

  // Persist size on resize
  petWindow.on('resized', () => {
    if (petWindow) {
      const [w, h] = petWindow.getSize();
      store.set('petWindow.width', w);
      store.set('petWindow.height', h);
    }
  });

  petWindow.on('closed', () => {
    petWindow = null;
    store.set('petMode', false);
    updateTrayMenu();
  });

  store.set('petMode', true);
  updateTrayMenu();

  if (isDev) {
    petWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

/**
 * Toggle pet window visibility.
 */
function togglePet() {
  if (petWindow) {
    if (petWindow.isVisible()) {
      petWindow.hide();
    } else {
      petWindow.show();
    }
  } else {
    createPetWindow();
  }
}

// ── IPC Handlers ──────────────────────────────────────────────────────────────

/**
 * Click-through hit testing.
 * The renderer continuously checks if the cursor is over a transparent pixel.
 * When it is, we tell Electron to pass mouse events through to the app below.
 * When it's over the character, we capture the click.
 *
 * `forward: true` ensures mouse events are still forwarded to the window
 * for hit-testing, even while ignore is active.
 */
ipcMain.on('set-click-through', (_event, shouldPassThrough) => {
  if (petWindow && !petWindow.isDestroyed()) {
    petWindow.setIgnoreMouseEvents(shouldPassThrough, { forward: true });
  }
});

/** Snap threshold in pixels — snap when window edge is within this distance. */
const SNAP_DISTANCE = 20;

/**
 * Move the pet window by a delta (for drag-to-move on the character).
 * Includes screen-edge snapping when the window is dragged near display borders.
 */
ipcMain.on('move-pet-window', (_event, deltaX, deltaY) => {
  if (!petWindow || petWindow.isDestroyed()) return;

  const [x, y] = petWindow.getPosition();
  const [w, h] = petWindow.getSize();
  let newX = x + deltaX;
  let newY = y + deltaY;

  // Get the work area of the display the window is currently on
  const display = screen.getDisplayNearestPoint({ x: newX, y: newY });
  const { x: areaX, y: areaY, width: areaW, height: areaH } = display.workArea;

  // Snap to left edge
  if (Math.abs(newX - areaX) < SNAP_DISTANCE) newX = areaX;
  // Snap to right edge
  if (Math.abs((newX + w) - (areaX + areaW)) < SNAP_DISTANCE) newX = areaX + areaW - w;
  // Snap to top edge
  if (Math.abs(newY - areaY) < SNAP_DISTANCE) newY = areaY;
  // Snap to bottom edge
  if (Math.abs((newY + h) - (areaY + areaH)) < SNAP_DISTANCE) newY = areaY + areaH - h;

  petWindow.setPosition(newX, newY);
});

/**
 * Get the work area bounds of the display nearest to the pet window.
 * Used by the renderer for layout calculations.
 *
 * @returns {{ x: number, y: number, width: number, height: number }}
 */
ipcMain.handle('get-screen-bounds', () => {
  if (!petWindow || petWindow.isDestroyed()) {
    const primary = screen.getPrimaryDisplay();
    return primary.workArea;
  }
  const [x, y] = petWindow.getPosition();
  const display = screen.getDisplayNearestPoint({ x, y });
  return display.workArea;
});

/**
 * Open a native file dialog for model import (VRM or Live2D archives).
 * Returns the file contents as a base64-encoded string along with the filename,
 * or null if the user cancelled.
 *
 * @param {'vrm' | 'live2d'} type - Which model type to filter for
 * @returns {Promise<{ name: string, data: string } | null>} Base64 file data or null
 */
ipcMain.handle('open-file-dialog', async (_event, type) => {
  const filters = type === 'vrm'
    ? [{ name: 'VRM Models', extensions: ['vrm'] }]
    : [{ name: 'Live2D Archives', extensions: ['zip'] }];

  const parentWindow = mainWindow || petWindow;
  const result = await dialog.showOpenDialog(parentWindow, {
    title: `Import ${type === 'vrm' ? 'VRM Model' : 'Live2D Model'}`,
    filters,
    properties: ['openFile'],
  });

  if (result.canceled || result.filePaths.length === 0) return null;

  const fs = require('fs');
  const filePath = result.filePaths[0];
  const fileName = path.basename(filePath);
  const fileData = fs.readFileSync(filePath).toString('base64');

  return { name: fileName, data: fileData };
});

/**
 * Open the full app window from the pet (e.g., "Chat" button in speech bubble).
 */
ipcMain.on('open-main-window', () => {
  createMainWindow();
});

/**
 * Toggle mute state.
 */
ipcMain.on('set-muted', (_event, muted) => {
  store.set('muted', muted);
  // Notify all windows of mute state change
  if (mainWindow) mainWindow.webContents.send('mute-changed', muted);
  if (petWindow) petWindow.webContents.send('mute-changed', muted);
  updateTrayMenu();
});

/**
 * Get current app state (for renderer initialization).
 */
ipcMain.handle('get-app-state', () => {
  return {
    petMode: !!petWindow,
    muted: store.get('muted', false),
  };
});

/**
 * Get current Discord RPC state.
 * Returns the stored enabled flag, live connection status, and saved App ID.
 *
 * @returns {{ enabled: boolean, connected: boolean, appId: string }}
 */
ipcMain.handle('get-discord-state', () => ({
  enabled: store.get('discordRPC', false),
  connected: discord.isDiscordConnected(),
  appId: store.get('discordAppId', ''),
}));

/**
 * Save a Discord Application ID to persistent store.
 * Does not start/stop RPC — caller must toggle via set-discord-rpc-enabled.
 *
 * @param {string} appId - Discord Application ID (18-digit numeric string)
 * @returns {{ ok: boolean }}
 */
ipcMain.handle('set-discord-app-id', (_e, appId) => {
  store.set('discordAppId', appId);
  return { ok: true };
});

/**
 * Enable or disable Discord Rich Presence.
 * When enabling: reads App ID from store, connects to Discord, updates tray.
 * When disabling: destroys the RPC client, updates tray.
 *
 * @param {boolean} enabled
 * @returns {{ connected: boolean, error?: string }}
 */
ipcMain.handle('set-discord-rpc-enabled', async (_e, enabled) => {
  if (enabled) {
    const appId = store.get('discordAppId', '');
    if (!appId) return { connected: false, error: 'no_app_id' };
    const connected = await discord.initDiscordRPC(appId);
    store.set('discordRPC', connected);
    if (connected) {
      discord.updatePresence({
        characterName: cachedCharacters?.find((c) => c.id === store.get('activeCharId'))?.name || 'Character',
        activity: 'idle',
      });
    }
    updateTrayMenu();
    return { connected };
  } else {
    discord.destroyDiscordRPC();
    store.set('discordRPC', false);
    updateTrayMenu();
    return { connected: false };
  }
});

/**
 * Show native right-click context menu on the pet window.
 *
 * The renderer sends character info + menu position. The main process
 * builds a native OS menu (feels native on macOS/Windows) and shows it.
 * Menu actions are sent back to the renderer or handled in main.
 */
ipcMain.on('show-pet-context-menu', (_event, { characterName, isMuted }) => {
  if (!petWindow || petWindow.isDestroyed()) return;

  const template = [
    {
      label: characterName || 'Character',
      enabled: false,  // Header — shows character name, not clickable
    },
    { type: 'separator' },
    {
      label: 'Open Chat',
      click: () => {
        createMainWindow();
      },
    },
    {
      label: 'Voice Mode',
      click: () => {
        createMainWindow();
        // Small delay to let the window load before sending navigation
        setTimeout(() => {
          if (mainWindow) mainWindow.webContents.send('start-voice-mode');
        }, 500);
      },
    },
    { type: 'separator' },
    {
      label: 'Mute Voice',
      type: 'checkbox',
      checked: isMuted,
      click: (item) => {
        store.set('muted', item.checked);
        if (mainWindow) mainWindow.webContents.send('mute-changed', item.checked);
        if (petWindow) petWindow.webContents.send('mute-changed', item.checked);
        updateTrayMenu();
      },
    },
    { type: 'separator' },
    {
      label: 'Show Full App',
      click: () => createMainWindow(),
    },
    {
      label: 'Hide Pet',
      click: () => {
        if (petWindow && !petWindow.isDestroyed()) petWindow.hide();
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => app.quit(),
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  menu.popup({ window: petWindow });
});

// ── System Tray ───────────────────────────────────────────────────────────────

/**
 * Create the system tray icon with context menu.
 */
function createTray() {
  // Create a simple 22x22 tray icon (placeholder — replace with real icon)
  const iconPath = path.join(__dirname, 'assets', 'tray-icon.png');
  let trayIcon;

  try {
    trayIcon = nativeImage.createFromPath(iconPath);
    // Resize to appropriate tray size
    trayIcon = trayIcon.resize({ width: 22, height: 22 });
  } catch {
    // Fallback: create an empty image if icon file doesn't exist yet
    trayIcon = nativeImage.createEmpty();
  }

  tray = new Tray(trayIcon);
  tray.setToolTip('Waifu RT3D');

  updateTrayMenu();

  // Double-click tray icon → show main window
  tray.on('double-click', () => {
    createMainWindow();
  });
}

/** Cached character list for the tray menu. */
let cachedCharacters = [];

/**
 * Fetch the character list from the backend API.
 * Cached to avoid blocking the tray menu build — refreshed async.
 */
async function refreshCharacterList() {
  try {
    const http = require('http');
    const data = await new Promise((resolve, reject) => {
      http.get(`${BASE_URL}/api/characters`, (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          try { resolve(JSON.parse(body)); } catch { resolve([]); }
        });
        res.on('error', reject);
      }).on('error', reject);
    });
    if (Array.isArray(data)) {
      cachedCharacters = data;
    }
  } catch {
    // Backend not running — keep cached list
  }
}

/**
 * Rebuild the tray context menu (called when state changes).
 *
 * Includes: Show App, Desktop Pet toggle, character switcher submenu,
 * mute toggle, and quit. Character list is fetched async on first build
 * and refreshed periodically.
 */
function updateTrayMenu() {
  if (!tray) return;

  const isPetActive = !!petWindow;
  const isMuted = store.get('muted', false);
  const activeCharId = store.get('activeCharId', null);

  // Build character submenu from cached list
  const charSubmenu = cachedCharacters.length > 0
    ? cachedCharacters.slice(0, 10).map((char) => ({
        label: char.name || `Character ${char.id}`,
        type: 'radio',
        checked: char.id === activeCharId,
        click: () => {
          store.set('activeCharId', char.id);
          // Notify renderer to switch character
          if (mainWindow) mainWindow.webContents.send('switch-character', char.id);
          if (petWindow) petWindow.webContents.send('switch-character', char.id);
          updateTrayMenu();
        },
      }))
    : [{ label: 'No characters found', enabled: false }];

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Waifu RT3D',
      enabled: false,
    },
    { type: 'separator' },
    {
      label: 'Show App',
      click: createMainWindow,
      accelerator: 'CommandOrControl+Shift+F',
    },
    {
      label: isPetActive ? 'Hide Desktop Pet' : 'Show Desktop Pet',
      click: togglePet,
      accelerator: 'CommandOrControl+Shift+P',
    },
    { type: 'separator' },
    {
      label: 'Characters',
      submenu: charSubmenu,
    },
    { type: 'separator' },
    {
      label: 'Mute Voice',
      type: 'checkbox',
      checked: isMuted,
      click: (item) => {
        store.set('muted', item.checked);
        if (mainWindow) mainWindow.webContents.send('mute-changed', item.checked);
        if (petWindow) petWindow.webContents.send('mute-changed', item.checked);
      },
    },
    {
      label: 'Discord Rich Presence',
      type: 'checkbox',
      checked: store.get('discordRPC', false),
      click: async (item) => {
        if (item.checked) {
          const appId = store.get('discordAppId', '');
          if (!appId) {
            // No Application ID configured — prompt user
            const { response, checkboxChecked } = await dialog.showMessageBox({
              type: 'info',
              title: 'Discord Rich Presence',
              message: 'A Discord Application ID is required.\n\nCreate one at discord.com/developers/applications,\nthen set it in the app settings.',
              buttons: ['OK'],
            });
            item.checked = false;
            return;
          }
          const connected = await discord.initDiscordRPC(appId);
          store.set('discordRPC', connected);
          if (connected) {
            discord.updatePresence({
              characterName: cachedCharacters.find((c) => c.id === store.get('activeCharId'))?.name || 'Character',
              activity: 'idle',
            });
          }
        } else {
          discord.destroyDiscordRPC();
          store.set('discordRPC', false);
        }
        updateTrayMenu();
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        discord.destroyDiscordRPC();
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);

  // Refresh character list in background for next menu open
  refreshCharacterList();
}

// ── App Lifecycle ─────────────────────────────────────────────────────────────

// ── Deep Link Protocol (waifu://) ────────────────────────────────────────────
//
// Register the waifu:// URL protocol so external apps and browser links
// can open the app and navigate to specific screens.
//
// Supported routes:
//   waifu://character/{id}  → open main window, navigate to character
//   waifu://pet             → show/create pet window
//   waifu://voice           → open main window + start voice mode

if (process.defaultApp) {
  // Dev mode: register with the full path to the executable
  app.setAsDefaultProtocolClient('waifu', process.execPath, [__dirname]);
} else {
  app.setAsDefaultProtocolClient('waifu');
}

/**
 * Handle a waifu:// deep link URL.
 * Parses the URL and routes to the appropriate action.
 *
 * @param {string} url - The full deep link URL (e.g. "waifu://character/3")
 */
function handleDeepLink(url) {
  if (!url || typeof url !== 'string') return;

  try {
    // Parse the URL — waifu://route/param
    const parsed = new URL(url);
    const route = parsed.hostname;
    const pathParts = parsed.pathname.split('/').filter(Boolean);

    switch (route) {
      case 'character': {
        const charId = parseInt(pathParts[0], 10);
        if (!isNaN(charId)) {
          createMainWindow();
          // Small delay to let the window load before sending navigation
          setTimeout(() => {
            if (mainWindow) mainWindow.webContents.send('navigate-to-character', charId);
          }, 500);
        }
        break;
      }

      case 'pet':
        createPetWindow();
        break;

      case 'voice':
        createMainWindow();
        setTimeout(() => {
          if (mainWindow) mainWindow.webContents.send('start-voice-mode');
        }, 500);
        break;

      default:
        // Unknown route — just open the main window
        createMainWindow();
        break;
    }
  } catch {
    // Invalid URL — ignore
  }
}

app.whenReady().then(() => {
  // Register global shortcut: Ctrl+Shift+P → toggle desktop pet
  globalShortcut.register('CommandOrControl+Shift+P', togglePet);

  // Create system tray
  createTray();

  // Start with main window
  createMainWindow();

  // Restore pet window if it was active last session
  if (store.get('petMode', false)) {
    createPetWindow();
  }

  // macOS: re-create window when dock icon is clicked with no windows
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

// macOS: handle deep link when app is already running
app.on('open-url', (_event, url) => {
  handleDeepLink(url);
});

// Quit when all windows are closed (except on macOS)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Clean up global shortcuts on quit
app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

// Prevent multiple instances
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, commandLine) => {
    // Focus existing window
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }

    // Windows/Linux: deep link URL is passed as a command-line argument
    const deepLinkUrl = commandLine.find((arg) => arg.startsWith('waifu://'));
    if (deepLinkUrl) handleDeepLink(deepLinkUrl);
  });
}
