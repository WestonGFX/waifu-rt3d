@echo off
setlocal EnableDelayedExpansion

:: ============================================================================
::  WAIFU MOTION SERVER — Windows Installer
::  Just double-click this file. That's it.
::  It will install everything and start the server automatically.
:: ============================================================================

title Waifu Motion Server — Installer

:: ── Step 1: Request Administrator access for firewall rules ─────────────────
:: This triggers the familiar "Do you want to allow this app to make changes?"
:: Windows dialog. Click YES to continue.
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo.
    echo  Requesting Administrator access to set up firewall rules...
    echo  A Windows security dialog will appear — please click YES.
    echo.
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

cls
echo.
echo  ╔══════════════════════════════════════════════════╗
echo  ║      WAIFU MOTION SERVER — Easy Installer       ║
echo  ╚══════════════════════════════════════════════════╝
echo.
echo  This window will guide you through the setup.
echo  You don't need to type anything — just wait!
echo.
echo  ──────────────────────────────────────────────────
echo  STEP 1/5  Checking for Python...
echo  ──────────────────────────────────────────────────

:: ── Step 2: Check Python ─────────────────────────────────────────────────────
python --version >nul 2>&1
if %errorLevel% neq 0 (
    py --version >nul 2>&1
    if %errorLevel% neq 0 (
        echo.
        echo  [!] Python was not found on this PC.
        echo.
        echo  Please install Python from:
        echo     https://www.python.org/downloads/
        echo.
        echo  IMPORTANT: During install, check the box that says
        echo    "Add Python to PATH"  then re-run this installer.
        echo.
        echo  Opening the Python download page now...
        start https://www.python.org/downloads/
        echo.
        pause
        exit /b 1
    )
    set PYTHON=py
) else (
    set PYTHON=python
)

for /f "tokens=*" %%V in ('!PYTHON! --version 2^>^&1') do set PY_VER=%%V
echo  [OK] Found: %PY_VER%
echo.

:: ── Step 3: Navigate to project root ─────────────────────────────────────────
:: The bat file lives in backend/motion/ — go up two levels to project root
cd /d "%~dp0"
cd ..\..

echo  ──────────────────────────────────────────────────
echo  STEP 2/5  Installing required packages...
echo  ──────────────────────────────────────────────────
echo  (This takes about 30–60 seconds the first time)
echo.

:: Create a virtual environment if one doesn't exist
if not exist ".venv" (
    echo  Creating virtual environment...
    !PYTHON! -m venv .venv
    if !errorLevel! neq 0 (
        echo  [!] Could not create a virtual environment.
        echo      Try running: %PYTHON% -m pip install --upgrade pip
        pause
        exit /b 1
    )
)

set VENV_PYTHON=.venv\Scripts\python.exe
set VENV_PIP=.venv\Scripts\pip.exe

echo  Installing FastAPI and Uvicorn (the server framework)...
!VENV_PIP! install fastapi uvicorn httpx --quiet
if !errorLevel! neq 0 (
    echo  [!] Package install failed. Check your internet connection.
    pause
    exit /b 1
)
echo  [OK] Packages installed
echo.

:: ── Step 4: Firewall rules ────────────────────────────────────────────────────
echo  ──────────────────────────────────────────────────
echo  STEP 3/5  Setting up firewall rules...
echo  ──────────────────────────────────────────────────
echo  (Allows your Mac to find this PC automatically)
echo.

:: Remove old rules first to avoid duplicates
netsh advfirewall firewall delete rule name="Waifu Motion Server TCP" >nul 2>&1
netsh advfirewall firewall delete rule name="Waifu Motion Server UDP" >nul 2>&1

:: Add new rules — TCP for motion API, UDP for auto-discovery beacon
netsh advfirewall firewall add rule name="Waifu Motion Server TCP" dir=in action=allow protocol=TCP localport=8081 >nul
netsh advfirewall firewall add rule name="Waifu Motion Server UDP" dir=in action=allow protocol=UDP localport=8082 >nul

echo  [OK] Firewall rules added (TCP 8081 + UDP 8082)
echo.

:: ── Step 5: Create a shortcut on Desktop ─────────────────────────────────────
echo  ──────────────────────────────────────────────────
echo  STEP 4/5  Creating a desktop shortcut...
echo  ──────────────────────────────────────────────────

set SHORTCUT_PATH=%USERPROFILE%\Desktop\Waifu Motion Server.bat
set PROJECT_PATH=%CD%

(
  echo @echo off
  echo title Waifu Motion Server
  echo cd /d "%PROJECT_PATH%"
  echo echo Starting Waifu Motion Server...
  echo .venv\Scripts\python.exe -m backend.motion.motion_server
  echo pause
) > "%SHORTCUT_PATH%"

echo  [OK] Shortcut created: Desktop\Waifu Motion Server.bat
echo       Double-click it any time to start the motion server.
echo.

:: ── Step 6: Start the server ──────────────────────────────────────────────────
echo  ──────────────────────────────────────────────────
echo  STEP 5/5  Starting the Waifu Motion Server!
echo  ──────────────────────────────────────────────────
echo.
echo  The server is starting. Your Mac app will find it
echo  automatically — no configuration needed.
echo.
echo  Keep this window open while you use the app.
echo  To stop the server, just close this window.
echo.

.venv\Scripts\python.exe -m backend.motion.motion_server

:: If server exits, pause so the user can read any error messages
echo.
echo  The motion server stopped.
pause
