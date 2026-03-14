/**
 * Backend Launcher — Manages the Python FastAPI backend as a child process.
 *
 * Handles spawning, health-checking, crash recovery with exponential backoff,
 * orphan PID detection, and graceful shutdown. Emits status updates to listeners
 * so the splash screen (or any UI) can display progress.
 *
 * @module backend-launcher
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');

// ── Constants ────────────────────────────────────────────────────────────────

/** @type {number} Port the FastAPI backend listens on. */
const PORT = 8080;

/** @type {string} Health check endpoint URL. */
const HEALTH_URL = `http://localhost:${PORT}/api/health`;

/** @type {number} Milliseconds between health check polls. */
const HEALTH_POLL_MS = 500;

/** @type {number} Maximum time to wait for the backend to become healthy. */
const HEALTH_TIMEOUT_MS = 30000;

/** @type {number} Maximum automatic restart attempts before giving up. */
const MAX_RESTARTS = 3;

/** @type {number[]} Backoff delays in ms for each restart attempt. */
const BACKOFF = [2000, 5000, 10000];

/** @type {number} Time to wait for graceful shutdown before force-killing. */
const GRACEFUL_SHUTDOWN_MS = 5000;

// ── State ────────────────────────────────────────────────────────────────────

/** @type {import('child_process').ChildProcess | null} */
let backendProcess = null;

/** @type {fs.WriteStream | null} */
let logStream = null;

/** @type {Array<(status: object) => void>} */
const listeners = [];

/** Current backend status. */
const status = {
  status: 'checking',
  pid: null,
  port: PORT,
  url: `http://localhost:${PORT}`,
  error: null,
  restartCount: 0,
};

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Merge partial fields into the status object and notify all listeners.
 *
 * @param {Partial<typeof status>} partial - Fields to update
 */
function setStatus(partial) {
  Object.assign(status, partial);
  for (const cb of listeners) {
    try {
      cb({ ...status });
    } catch {
      // Listener threw — ignore to avoid breaking the status pipeline
    }
  }
}

/**
 * Find the project root directory.
 *
 * In dev mode, `__dirname` is `electron/`, so the project root is one level up.
 * Validates that `backend/server.py` exists at the resolved root.
 * For future packaged mode, checks `process.resourcesPath` as a fallback.
 *
 * @returns {string | null} Absolute path to project root, or null if not found
 */
function findProjectRoot() {
  // Dev mode: electron/ is inside project root
  const devRoot = path.resolve(__dirname, '..');
  if (fs.existsSync(path.join(devRoot, 'backend', 'server.py'))) {
    return devRoot;
  }

  // Packaged mode: check resourcesPath
  if (process.resourcesPath) {
    const packRoot = process.resourcesPath;
    if (fs.existsSync(path.join(packRoot, 'backend', 'server.py'))) {
      return packRoot;
    }
  }

  return null;
}

/**
 * Find the Python executable inside the project's virtual environment.
 *
 * Checks for `.venv/Scripts/python.exe` on Windows and `.venv/bin/python`
 * on macOS/Linux. Returns null if the venv doesn't exist.
 *
 * @param {string} projectRoot - Absolute path to project root
 * @returns {string | null} Absolute path to the Python binary, or null
 */
function findPython(projectRoot) {
  const pythonPath = process.platform === 'win32'
    ? path.join(projectRoot, '.venv', 'Scripts', 'python.exe')
    : path.join(projectRoot, '.venv', 'bin', 'python');

  return fs.existsSync(pythonPath) ? pythonPath : null;
}

/**
 * Get the path to the PID file used for orphan detection.
 *
 * @param {string} projectRoot - Absolute path to project root
 * @returns {string} Absolute path to the PID file
 */
function pidFilePath(projectRoot) {
  return path.join(projectRoot, 'backend', 'storage', 'backend.pid');
}

/**
 * Check if the backend is healthy by hitting the health endpoint.
 *
 * Uses Node's built-in `http` module (not fetch) for maximum compatibility
 * with Electron's Node runtime. Times out after 2 seconds.
 *
 * @returns {Promise<boolean>} True if the backend responds with "ok"
 */
function checkHealth() {
  return new Promise((resolve) => {
    const req = http.get(HEALTH_URL, { timeout: 2000 }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve(body.includes('"ok"') || body.includes("'ok'")));
      res.on('error', () => resolve(false));
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

/**
 * Check for an orphaned backend process from a previous session.
 *
 * Reads the PID file, checks if the process is still running, and verifies
 * it's actually our backend by hitting the health endpoint. Cleans up stale
 * PID files for dead processes.
 *
 * @param {string} projectRoot - Absolute path to project root
 * @returns {Promise<boolean>} True if a healthy orphan was found (already_running)
 */
async function checkOrphan(projectRoot) {
  const pidFile = pidFilePath(projectRoot);
  if (!fs.existsSync(pidFile)) return false;

  try {
    const pid = parseInt(fs.readFileSync(pidFile, 'utf-8').trim(), 10);
    if (isNaN(pid)) {
      fs.unlinkSync(pidFile);
      return false;
    }

    // Check if process is alive (signal 0 doesn't kill, just checks)
    try {
      process.kill(pid, 0);
    } catch {
      // Process is dead — clean up stale PID file
      fs.unlinkSync(pidFile);
      return false;
    }

    // Process is alive — verify it's our backend via health check
    const healthy = await checkHealth();
    if (healthy) {
      return true;
    }

    // Process exists but isn't healthy — stale PID, clean up
    fs.unlinkSync(pidFile);
    return false;
  } catch {
    // Any read/parse error — remove stale file
    try { fs.unlinkSync(pidFile); } catch { /* ignore */ }
    return false;
  }
}

/**
 * Poll the health endpoint until the backend is ready or timeout is exceeded.
 *
 * @returns {Promise<void>} Resolves when healthy, rejects on timeout
 */
function waitForHealth() {
  return new Promise((resolve, reject) => {
    const start = Date.now();

    const poll = async () => {
      const healthy = await checkHealth();
      if (healthy) {
        setStatus({ status: 'ready' });
        resolve();
        return;
      }

      const elapsed = Date.now() - start;
      if (elapsed >= HEALTH_TIMEOUT_MS) {
        setStatus({ status: 'crash', error: `Backend did not respond within ${HEALTH_TIMEOUT_MS / 1000}s` });
        reject(new Error('Health check timeout'));
        return;
      }

      setTimeout(poll, HEALTH_POLL_MS);
    };

    poll();
  });
}

/**
 * Handle a backend crash with exponential backoff restarts.
 *
 * If MAX_RESTARTS have been exceeded, sets status to 'failed' and gives up.
 * Otherwise increments the restart counter, waits the appropriate backoff
 * duration, and respawns the backend.
 *
 * @param {string} projectRoot - Absolute path to project root
 * @param {string} pythonPath - Absolute path to the Python binary
 */
async function handleCrash(projectRoot, pythonPath) {
  if (status.restartCount >= MAX_RESTARTS) {
    setStatus({ status: 'failed', error: `Backend crashed ${MAX_RESTARTS} times. Giving up.` });
    return;
  }

  const attempt = status.restartCount + 1;
  setStatus({ status: 'restarting', restartCount: attempt, error: `Restarting (attempt ${attempt}/${MAX_RESTARTS})...` });

  const delay = BACKOFF[attempt - 1] || BACKOFF[BACKOFF.length - 1];
  await new Promise((r) => setTimeout(r, delay));

  spawnBackend(projectRoot, pythonPath);
}

/**
 * Spawn the Python backend as a child process.
 *
 * Launches uvicorn with the FastAPI app, pipes stdout/stderr to a log file,
 * writes a PID file for orphan detection, and begins health polling.
 * Handles process errors and unexpected exits with automatic restart.
 *
 * @param {string} projectRoot - Absolute path to project root
 * @param {string} pythonPath - Absolute path to the Python binary
 */
function spawnBackend(projectRoot, pythonPath) {
  setStatus({ status: 'spawning', error: null });

  const logPath = path.join(projectRoot, 'backend', 'storage', 'electron-backend.log');

  // Ensure storage directory exists
  const storageDir = path.dirname(logPath);
  if (!fs.existsSync(storageDir)) {
    fs.mkdirSync(storageDir, { recursive: true });
  }

  logStream = fs.createWriteStream(logPath, { flags: 'a' });
  logStream.write(`\n--- Backend starting at ${new Date().toISOString()} ---\n`);

  backendProcess = spawn(pythonPath, [
    '-m', 'uvicorn', 'backend.server:app',
    '--host', '127.0.0.1',
    '--port', String(PORT),
  ], {
    cwd: projectRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    env: { ...process.env, PYTHONUNBUFFERED: '1' },
  });

  // Pipe output to log file
  if (backendProcess.stdout) backendProcess.stdout.pipe(logStream);
  if (backendProcess.stderr) backendProcess.stderr.pipe(logStream);

  // Write PID file for orphan detection
  const pidFile = pidFilePath(projectRoot);
  fs.writeFileSync(pidFile, String(backendProcess.pid));
  setStatus({ pid: backendProcess.pid });

  backendProcess.on('error', (err) => {
    setStatus({ status: 'crash', error: `Spawn error: ${err.message}` });
    handleCrash(projectRoot, pythonPath);
  });

  backendProcess.on('exit', (code, signal) => {
    if (status.status === 'stopping') return; // Expected shutdown
    const reason = signal ? `signal ${signal}` : `code ${code}`;
    setStatus({ status: 'crash', error: `Backend exited unexpectedly (${reason})` });
    handleCrash(projectRoot, pythonPath);
  });

  setStatus({ status: 'waiting_health' });
  waitForHealth().catch(() => {
    // Timeout — handleCrash will be triggered by the status change
    if (backendProcess && status.status !== 'stopping') {
      try { backendProcess.kill(); } catch { /* ignore */ }
      handleCrash(projectRoot, pythonPath);
    }
  });
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Start the backend server.
 *
 * Checks for an already-running instance (orphan detection), validates the
 * Python venv exists, and spawns the backend process. Returns a promise that
 * resolves when the backend is healthy or rejects on failure.
 *
 * @returns {Promise<void>} Resolves when backend is ready
 * @throws {Error} If the venv is missing or the backend fails to start
 */
async function startBackend() {
  setStatus({ status: 'checking', error: null, restartCount: 0, pid: null });

  const projectRoot = findProjectRoot();
  if (!projectRoot) {
    setStatus({ status: 'failed', error: 'Could not find project root (backend/server.py not found)' });
    throw new Error(status.error);
  }

  // Check for orphaned backend from a previous session
  const orphanRunning = await checkOrphan(projectRoot);
  if (orphanRunning) {
    setStatus({ status: 'already_running' });
    return;
  }

  // Check if backend is already running (started externally)
  const alreadyHealthy = await checkHealth();
  if (alreadyHealthy) {
    setStatus({ status: 'already_running' });
    return;
  }

  const pythonPath = findPython(projectRoot);
  if (!pythonPath) {
    setStatus({ status: 'no_venv', error: 'Python venv not found. Run: python -m venv .venv && .venv/bin/pip install -r requirements.txt' });
    throw new Error(status.error);
  }

  spawnBackend(projectRoot, pythonPath);

  // Wait for the backend to become healthy (or fail)
  return new Promise((resolve, reject) => {
    const unsub = onStatusChange((s) => {
      if (s.status === 'ready' || s.status === 'already_running') {
        unsub();
        resolve();
      } else if (s.status === 'failed') {
        unsub();
        reject(new Error(s.error || 'Backend failed to start'));
      }
    });
  });
}

/**
 * Stop the backend server gracefully.
 *
 * Sends SIGTERM (or taskkill on Windows), waits up to GRACEFUL_SHUTDOWN_MS
 * for the process to exit, then force-kills with SIGKILL if needed.
 * Cleans up the PID file and log stream.
 *
 * @returns {Promise<void>} Resolves when the backend has stopped
 */
async function stopBackend() {
  if (!backendProcess) return;

  setStatus({ status: 'stopping' });
  const proc = backendProcess;
  const pid = proc.pid;

  return new Promise((resolve) => {
    let forceTimer = null;

    const cleanup = () => {
      if (forceTimer) clearTimeout(forceTimer);
      backendProcess = null;

      // Close log stream
      if (logStream) {
        logStream.end();
        logStream = null;
      }

      // Clean up PID file
      const projectRoot = findProjectRoot();
      if (projectRoot) {
        const pidFile = pidFilePath(projectRoot);
        try { fs.unlinkSync(pidFile); } catch { /* ignore */ }
      }

      setStatus({ status: 'checking', pid: null, error: null, restartCount: 0 });
      resolve();
    };

    proc.once('exit', cleanup);

    // Send graceful shutdown signal
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(pid), '/f', '/t']);
    } else {
      try { proc.kill('SIGTERM'); } catch { /* already dead */ }
    }

    // Force kill after timeout
    forceTimer = setTimeout(() => {
      try {
        if (process.platform === 'win32') {
          spawn('taskkill', ['/pid', String(pid), '/f', '/t']);
        } else {
          proc.kill('SIGKILL');
        }
      } catch { /* already dead */ }
    }, GRACEFUL_SHUTDOWN_MS);
  });
}

/**
 * Register a callback for backend status changes.
 *
 * The callback is invoked immediately with the current status, then again
 * whenever the status changes. Returns an unlisten function.
 *
 * @param {(status: object) => void} callback - Called with the full status object
 * @returns {() => void} Function to remove the listener
 *
 * @example
 * const unsub = onStatusChange((s) => {
 *   console.log(`Backend: ${s.status}`);
 * });
 * // Later: unsub();
 */
function onStatusChange(callback) {
  listeners.push(callback);
  // Immediately emit current status
  try { callback({ ...status }); } catch { /* ignore */ }

  return () => {
    const idx = listeners.indexOf(callback);
    if (idx !== -1) listeners.splice(idx, 1);
  };
}

/**
 * Get a snapshot of the current backend status.
 *
 * @returns {object} Copy of the current status object
 */
function getBackendStatus() {
  return { ...status };
}

module.exports = { startBackend, stopBackend, getBackendStatus, onStatusChange };
