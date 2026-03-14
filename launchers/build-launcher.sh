#!/usr/bin/env bash
set -euo pipefail

# build-launcher.sh — Assembles the macOS .app bundle for Waifu RT3D.
#
# Creates the standard macOS bundle directory structure, writes Info.plist
# and the launcher executable, and copies the app icon into Resources/.
#
# Usage:
#     bash launchers/build-launcher.sh
#
# The resulting bundle lives at:
#     launchers/Waifu RT3D.app/
#
# After building, users can double-click the .app in Finder or drag it
# to their Dock for one-click launching.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

APP_NAME="Waifu RT3D"
APP_DIR="$SCRIPT_DIR/$APP_NAME.app"
CONTENTS_DIR="$APP_DIR/Contents"
MACOS_DIR="$CONTENTS_DIR/MacOS"
RESOURCES_DIR="$CONTENTS_DIR/Resources"

# --- Create directory structure ---
echo "Creating .app bundle structure..."
mkdir -p "$MACOS_DIR"
mkdir -p "$RESOURCES_DIR"

# --- Write Info.plist ---
echo "Writing Info.plist..."
cat > "$CONTENTS_DIR/Info.plist" << 'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <!-- Bundle display name shown in Finder and Dock -->
    <key>CFBundleName</key>
    <string>Waifu RT3D</string>

    <!-- Reverse-DNS identifier for macOS bundle system -->
    <key>CFBundleIdentifier</key>
    <string>com.waifu-rt3d.launcher</string>

    <!-- Name of the executable inside Contents/MacOS/ -->
    <key>CFBundleExecutable</key>
    <string>launcher</string>

    <!-- Icon file reference (without extension) in Contents/Resources/ -->
    <key>CFBundleIconFile</key>
    <string>applet</string>

    <key>CFBundleVersion</key>
    <string>1.0</string>

    <key>CFBundleShortVersionString</key>
    <string>1.0</string>

    <key>CFBundlePackageType</key>
    <string>APPL</string>

    <!-- Enable Retina / HiDPI rendering -->
    <key>NSHighResolutionCapable</key>
    <true/>

    <!-- false = show in Dock (not a background-only agent) -->
    <key>LSUIElement</key>
    <false/>
</dict>
</plist>
PLIST

# --- Write launcher script ---
echo "Writing launcher executable..."
cat > "$MACOS_DIR/launcher" << 'LAUNCHER'
#!/usr/bin/env bash
set -euo pipefail

# launcher — One-click macOS launcher for Waifu RT3D.
#
# This script is the CFBundleExecutable inside the .app bundle. When a user
# double-clicks "Waifu RT3D.app" in Finder, macOS runs this script.
#
# Flow:
#   1. Resolve the project root from the bundle's location.
#   2. Verify the Python venv exists (prompt user to run setup.sh if not).
#   3. If the backend is already running on port 8080, just open the browser.
#   4. Otherwise, start uvicorn, wait for it to become healthy, then open
#      the Sakura frontend in the default browser.
#   5. Keep the .app process alive (so it stays in the Dock) by waiting on
#      the backend PID. Clean up on INT/TERM signals.

# --- Resolve project root ---
# Bundle layout: PROJECT_ROOT/launchers/Waifu RT3D.app/Contents/MacOS/launcher
# From this script, project root is 4 directories up.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"

VENV_PYTHON="$PROJECT_ROOT/.venv/bin/python"
BACKEND_URL="http://localhost:8080"
HEALTH_URL="$BACKEND_URL/api/health"
FRONTEND_URL="$BACKEND_URL/sakura/"
LOG_FILE="$PROJECT_ROOT/backend/storage/launcher.log"

# --- Check for Python venv ---
if [[ ! -x "$VENV_PYTHON" ]]; then
    osascript -e 'display dialog "Python virtual environment not found.\n\nPlease run ./setup.sh from the project root first." with title "Waifu RT3D" with icon stop buttons {"OK"} default button "OK"'
    exit 1
fi

# --- Check if backend is already running ---
# If the health endpoint responds with "ok", skip startup and just open the browser.
if curl -s --max-time 2 "$HEALTH_URL" 2>/dev/null | grep -q "ok"; then
    open "$FRONTEND_URL"
    exit 0
fi

# --- Notify user that startup is in progress ---
osascript -e 'display notification "Starting backend server..." with title "Waifu RT3D"'

# --- Start the backend server ---
# cd to project root so Python module resolution works (backend.server, etc.)
cd "$PROJECT_ROOT"

"$VENV_PYTHON" -m uvicorn backend.server:app \
    --host 127.0.0.1 \
    --port 8080 \
    > "$LOG_FILE" 2>&1 &
BACKEND_PID=$!

# --- Register cleanup trap before wait ---
# Ensures the backend process is killed when the .app is quit (Cmd+Q, Dock quit, etc.)
trap "kill $BACKEND_PID 2>/dev/null; exit 0" INT TERM

# --- Health check loop ---
# Poll the health endpoint every second, up to 30 attempts (30 seconds total).
MAX_ATTEMPTS=30
ATTEMPT=0

while (( ATTEMPT < MAX_ATTEMPTS )); do
    ATTEMPT=$((ATTEMPT + 1))
    sleep 1

    if curl -s --max-time 1 "$HEALTH_URL" 2>/dev/null | grep -q "ok"; then
        # Backend is ready — open the frontend in the default browser
        open "$FRONTEND_URL"

        # Keep the .app alive in the Dock by waiting on the backend process.
        # When the user quits the .app, the trap above kills the backend.
        wait $BACKEND_PID
        exit 0
    fi
done

# --- Timeout: backend failed to start ---
kill $BACKEND_PID 2>/dev/null
osascript -e 'display dialog "Backend server failed to start within 30 seconds.\n\nCheck the log at:\nbackend/storage/launcher.log" with title "Waifu RT3D" with icon stop buttons {"OK"} default button "OK"'
exit 1
LAUNCHER

# --- Make launcher executable ---
chmod +x "$MACOS_DIR/launcher"

# --- Copy icon into Resources ---
ICON_SRC="$PROJECT_ROOT/electron/assets/icon.png"
if [[ -f "$ICON_SRC" ]]; then
    cp "$ICON_SRC" "$RESOURCES_DIR/applet.png"
    echo "Copied icon to Resources/applet.png"
else
    echo "Warning: icon not found at electron/assets/icon.png — skipping icon copy"
fi

echo ""
echo "=== Build complete ==="
echo "Bundle: $APP_DIR"
echo ""
echo "You can now double-click '$APP_NAME.app' in Finder, or run:"
echo "  open \"$APP_DIR\""
