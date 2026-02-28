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
  globalShortcut,
  Tray,
  Menu,
  ipcMain,
  nativeImage,
  shell,
} = require('electron');
const path = require('path');
const Store = require('electron-store');

// ── Configuration ─────────────────────────────────────────────────────────────

const store = new Store({
  defaults: {
    mainWindow: { width: 1280, height: 900, x: undefined, y: undefined },
    petWindow: { x: 100, y: 100, width: 300, height: 500 },
    petMode: false,
    muted: false,
  },
});

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

/**
 * Move the pet window by a delta (for drag-to-move on the character).
 */
ipcMain.on('move-pet-window', (_event, deltaX, deltaY) => {
  if (petWindow && !petWindow.isDestroyed()) {
    const [x, y] = petWindow.getPosition();
    petWindow.setPosition(x + deltaX, y + deltaY);
  }
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
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);

  // Refresh character list in background for next menu open
  refreshCharacterList();
}

// ── App Lifecycle ─────────────────────────────────────────────────────────────

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
  app.on('second-instance', () => {
    // Focus existing window if someone tries to open a second instance
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}
