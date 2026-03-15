# Launcher Guide

How to start Waifu RT3D without touching the terminal. Two options: a macOS app you double-click, or an Electron desktop app with a pet overlay.

---

## Quick Start

1. **Run setup once.** Open Terminal, paste this, and press Enter:
   ```
   cd /path/to/waifu-rt3d && ./setup.sh
   ```
   (Replace `/path/to/waifu-rt3d` with wherever you downloaded the project.)

2. **Pick your launcher:**
   - **macOS app** — Double-click `launchers/Waifu RT3D.app` in Finder.
   - **Electron app** — Open Terminal, type `cd /path/to/waifu-rt3d/electron && npm start`, press Enter.

3. **Chat.** The app opens in your browser (macOS launcher) or its own window (Electron). Pick a character and start talking.

---

## macOS .app Launcher

### Where to find it

Inside the project folder, open the `launchers` folder. You will see **Waifu RT3D.app** with a pink icon. You can drag it to your Dock for easy access.

### How to use it

Double-click the app. Here is what happens behind the scenes:

1. A macOS notification appears: **"Starting backend server..."**
2. The backend server starts up (takes 5-15 seconds on first launch).
3. Your default web browser opens to the Sakura frontend at `http://localhost:8080/sakura/`.
4. The app icon stays in your Dock while the server is running.

If the server is already running from a previous session, it skips startup and opens the browser immediately.

### How to quit

Right-click the **Waifu RT3D** icon in the Dock and select **Quit**. This stops the backend server and closes everything cleanly. You can also press Cmd+Q while the app is focused.

### Troubleshooting

#### "Python virtual environment not found" dialog

This means you have not run the setup script yet. Open Terminal and run:

```
cd /path/to/waifu-rt3d
./setup.sh
```

Follow the prompts. Once setup finishes, try double-clicking the app again.

#### "Backend server failed to start within 30 seconds" dialog

Something went wrong during startup. Check the log file for details:

```
backend/storage/launcher.log
```

Open that file in any text editor (TextEdit works). Common causes:
- **Port 8080 is already in use** by another application. Close the other app or restart your computer.
- **Missing Python packages.** Run `./setup.sh --repair` to reinstall dependencies.
- **Database corruption.** Delete `backend/storage/app.db` and restart. The app will create a fresh database (you will lose chat history).

#### Nothing happens when I double-click

Make sure the launcher script is executable. Open Terminal and run:

```
chmod +x launchers/Waifu\ RT3D.app/Contents/MacOS/launcher
```

#### The browser opens but shows a blank page

The server might still be starting up. Wait 10 seconds and refresh the page. If it stays blank, check that your browser is not blocking `localhost` connections (some VPNs or firewalls do this).

---

## Electron Desktop App

The Electron app gives you a native desktop window instead of a browser tab, plus a transparent desktop pet overlay.

### Prerequisites

- **Node.js 18 or newer.** Check by opening Terminal and typing `node --version`. If you do not have it, download it from [nodejs.org](https://nodejs.org/).
- **Python environment already set up.** Run `./setup.sh` from the project root if you have not done this yet.
- **Install Electron dependencies.** Run this once:
  ```
  cd /path/to/waifu-rt3d/electron
  npm install
  ```

### How to start

Open Terminal and run:

```
cd /path/to/waifu-rt3d/electron
npm start
```

For development mode (opens DevTools automatically):

```
npm run dev
```

### What happens at startup

1. A **splash screen** appears with a progress bar and the text "Starting backend server..."
2. The Electron app automatically starts the Python backend server for you (you do not need to start it separately).
3. Once the server is healthy, the splash screen closes and the main application window opens.
4. A **system tray icon** appears in your menu bar (macOS) or system tray (Windows/Linux).

### Desktop pet mode

Press **Ctrl+Shift+P** (or Cmd+Shift+P on macOS) to toggle the desktop pet overlay. This creates a transparent, always-on-top window showing just your character floating on your desktop.

Pet features:
- **Drag to move** — click and drag the character to reposition the pet anywhere on screen.
- **Click-through** — transparent areas pass clicks to the apps behind it, so it does not block your work.
- **Screen edge snapping** — the pet snaps to screen edges when dragged near them.
- **Speech bubbles** — the character shows short messages in floating bubbles.
- **Right-click menu** — right-click the character for quick options: Open Chat, Voice Mode, Mute Voice, Show Full App, Hide Pet, and Quit.
- **Idle animations** — the character dozes off after 20 minutes of inactivity and waves when your cursor comes near.

### System tray

Right-click the tray icon to access:

| Menu Item | What it does |
|-----------|-------------|
| **Show App** | Opens the full application window (Ctrl+Shift+F) |
| **Show/Hide Desktop Pet** | Toggles the pet overlay (Ctrl+Shift+P) |
| **Characters** | Switch between characters without opening the full app |
| **Mute Voice** | Toggle TTS audio on/off |
| **Discord Rich Presence** | Show your current character in your Discord status |
| **Quit** | Stops the backend server and closes everything |

Double-clicking the tray icon also opens the full app window.

### Troubleshooting

#### Splash screen is stuck on "Starting backend server..."

The backend is taking longer than usual. Wait up to 30 seconds. If it does not progress:

1. Check if port 8080 is already in use by another app.
2. Look at the log file for errors: `backend/storage/electron-backend.log`
3. Try starting the backend manually first (`./run.sh` from the project root), then launch Electron.

#### Splash screen says "Python environment not found"

You need to set up the Python virtual environment. Close Electron, then run:

```
cd /path/to/waifu-rt3d
./setup.sh
```

After setup completes, try `npm start` again from the `electron` folder.

#### Backend crashes and restarts repeatedly

The Electron app automatically restarts the backend up to 3 times with increasing delays (2s, 5s, 10s). If it fails all 3 times, you will see "Failed to start server" on the splash screen.

Check `backend/storage/electron-backend.log` for the error. Common fixes:
- Run `./setup.sh --repair` to fix missing dependencies.
- Delete `backend/storage/app.db` if the database is corrupted (you will lose chat history).
- Make sure no other app is using port 8080.

#### The pet window is invisible or flickering

GPU rendering issues. Try:
- Update your graphics drivers.
- On macOS, make sure "Reduce transparency" is turned off in System Settings > Accessibility > Display.
- Close other GPU-heavy apps (games, video editors) and restart Electron.

#### Discord Rich Presence is not connecting

1. Make sure Discord is running on your computer.
2. You need a Discord Application ID. Create one at [discord.com/developers/applications](https://discord.com/developers/applications).
3. Enter the Application ID in the app settings (Settings > Desktop Pet > Discord Rich Presence).
4. Toggle the Discord RPC checkbox in the tray menu or settings.

---

## Choosing Between Launchers

| Feature | macOS .app | Electron |
|---------|-----------|----------|
| One-click start | Yes | No (requires Terminal) |
| Desktop pet overlay | No | Yes |
| System tray controls | No | Yes |
| Character switching from tray | No | Yes |
| Auto-starts backend | Yes | Yes |
| Opens in | Default browser | Native Electron window |
| Discord Rich Presence | No | Yes |
| Platform | macOS only | macOS, Windows, Linux |

**Use the macOS .app** if you just want the simplest way to start the app and are happy using it in your browser.

**Use Electron** if you want the desktop pet, system tray controls, Discord integration, or you are on Windows/Linux.

---

## First-Time Setup Checklist

Before using either launcher for the first time:

- [ ] **Python 3.11 or newer** is installed. Check with `python3 --version` in Terminal.
- [ ] **Run `./setup.sh`** from the project root. Follow the interactive prompts.
- [ ] **Node.js 18+** is installed (only needed for Electron). Check with `node --version`.
- [ ] **Run `npm install`** inside the `electron/` folder (only needed for Electron).
- [ ] **LM Studio** (or another LLM provider) is running, if you want AI chat to work.

After setup, you only need to double-click the app or run `npm start`. The setup steps do not need to be repeated.
