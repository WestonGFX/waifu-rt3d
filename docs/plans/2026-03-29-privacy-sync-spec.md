# Privacy-First Sync & Backup — Implementation Spec

**Date:** 2026-03-29
**Research:** `docs/research/2026-03-29-privacy-sync-research.md`
**Total Effort:** ~6h (Phase 1: 3.5h, Phase 2: 2.5h)
**Dependencies:** None — uses existing infrastructure

---

## Architecture Summary

```
┌──────────────────────────────────────────────────────────────┐
│  LAYER 1: Syncthing (user-managed)                           │
│  Syncs: avatars, live2d, models, images, audio, config, docs │
│  Ignores: *.db-wal, *.db-shm, _backups/, __pycache__        │
│  The .db file syncs ONLY after WAL checkpoint on shutdown     │
├──────────────────────────────────────────────────────────────┤
│  LAYER 2: WAL Checkpoint (app-managed)                       │
│  On shutdown: PRAGMA wal_checkpoint(TRUNCATE)                 │
│  On startup: integrity check + stale-lock warning             │
├──────────────────────────────────────────────────────────────┤
│  LAYER 3: restic Backup (user-managed, scripted)             │
│  Nightly encrypted backup to external drive / NAS             │
│  7 daily + 4 weekly + 3 monthly retention                     │
└──────────────────────────────────────────────────────────────┘
```

**Critical rule:** The app must NOT run on two machines simultaneously. Close on machine A before opening on machine B.

---

## Phase 1: Safe DB Sync via WAL Checkpoint + Syncthing Config

**Effort:** 3.5 hours
**Goal:** Make `backend/storage/` safe to sync with Syncthing by checkpointing the WAL on shutdown, verifying integrity on startup, and providing a ready-to-use `.stignore`.

### Task 1.1 — WAL Checkpoint on Shutdown (1h)

**File:** `backend/server.py`
**Location:** Inside `lifespan()`, after `yield` (lines 260-265)

Add a WAL checkpoint right before the final shutdown log message. This folds all WAL data into the main `.db` file so Syncthing never sees a split `app.db` + `app.db-wal` pair.

```python
# --- Add to lifespan() after yield, before "Application shutdown complete" ---

# Sync safety: fold WAL into main DB so file-sync tools (Syncthing)
# see a single consistent app.db file.
try:
    con = sqlite3.connect(DB_PATH)
    try:
        con.execute("PRAGMA wal_checkpoint(TRUNCATE)")
        logger.info("WAL checkpoint (TRUNCATE) completed for sync safety")
    finally:
        con.close()
    # Remove ephemeral WAL/SHM files — they are meaningless to other machines
    wal_path = DB_PATH.parent / (DB_PATH.name + "-wal")
    shm_path = DB_PATH.parent / (DB_PATH.name + "-shm")
    for ephemeral in (wal_path, shm_path):
        if ephemeral.exists():
            ephemeral.unlink()
            logger.debug(f"Removed ephemeral file: {ephemeral.name}")
except Exception as e:
    logger.warning(f"WAL checkpoint on shutdown failed: {e}")
```

**What changes in `lifespan()`:**

```python
# BEFORE (current):
    yield
    if _scheduler_task and not _scheduler_task.done():
        _scheduler_task.cancel()
    logger.info("Application shutdown complete")

# AFTER:
    yield
    if _scheduler_task and not _scheduler_task.done():
        _scheduler_task.cancel()

    # Sync safety: checkpoint WAL so Syncthing sees one consistent file
    try:
        con = sqlite3.connect(DB_PATH)
        try:
            con.execute("PRAGMA wal_checkpoint(TRUNCATE)")
            logger.info("WAL checkpoint (TRUNCATE) completed for sync safety")
        finally:
            con.close()
        wal_path = DB_PATH.parent / (DB_PATH.name + "-wal")
        shm_path = DB_PATH.parent / (DB_PATH.name + "-shm")
        for ephemeral in (wal_path, shm_path):
            if ephemeral.exists():
                ephemeral.unlink()
                logger.debug(f"Removed ephemeral file: {ephemeral.name}")
    except Exception as e:
        logger.warning(f"WAL checkpoint on shutdown failed: {e}")

    logger.info("Application shutdown complete")
```

### Task 1.2 — Startup Integrity Check + Stale Lock Warning (1h)

**File:** `backend/preflight.py`
**Location:** Inside `run()` function, after DB connection is established but before migrations run.

Two checks:
1. **Integrity check** — if the DB file was modified externally (Syncthing sync), verify it is not corrupt.
2. **Stale lock warning** — if `app.db-wal` exists at startup, it means the previous shutdown was unclean OR another machine is running. Log a warning.

```python
def _sync_safety_checks(db_path: Path) -> None:
    """Run pre-migration safety checks for multi-machine sync scenarios.

    Checks:
        1. If a WAL file exists at startup, warn that the previous shutdown
           may have been unclean or another machine instance may be running.
        2. Run PRAGMA integrity_check on the database to catch corruption
           from interrupted file syncs.

    Args:
        db_path: Path to the SQLite database file.
    """
    wal_path = db_path.parent / (db_path.name + "-wal")
    if wal_path.exists():
        wal_size = wal_path.stat().st_size
        if wal_size > 0:
            logger.warning(
                f"WAL file exists at startup ({wal_size} bytes). "
                "Previous shutdown may have been unclean, or another "
                "machine instance wrote to this database. "
                "Running integrity check..."
            )

    con = sqlite3.connect(db_path)
    try:
        result = con.execute("PRAGMA integrity_check").fetchone()
        if result and result[0] != "ok":
            logger.error(f"Database integrity check FAILED: {result[0]}")
            # Create emergency backup before proceeding
            backup_name = f"app_corrupt_{datetime.now().strftime('%Y%m%d_%H%M%S')}.db"
            backup_path = db_path.parent / "_backups" / backup_name
            backup_path.parent.mkdir(exist_ok=True)
            shutil.copy2(db_path, backup_path)
            logger.error(f"Emergency backup saved: {backup_path}")
        else:
            logger.info("Database integrity check passed")
    finally:
        con.close()
```

**Call site in `run()`:** Add `_sync_safety_checks(DB_PATH)` after `migrate_legacy_db()` and before `get_schema_version()`.

### Task 1.3 — Syncthing `.stignore` File (0.5h)

**File to create:** `backend/storage/.stignore`

This file tells Syncthing which files to skip when syncing the `backend/storage/` folder.

```
// Syncthing ignore file for waifu-rt3d storage directory
// See: https://docs.syncthing.net/users/ignoring.html

// SQLite ephemeral files — NEVER sync these.
// The app checkpoints WAL into app.db on shutdown.
*.db-wal
*.db-shm
*.db-journal

// Local backups — each machine manages its own
_backups/

// Python bytecode
__pycache__
*.pyc

// OS metadata
.DS_Store
Thumbs.db
desktop.ini

// Temporary files from image generation
*.tmp
*.partial
```

### Task 1.4 — Cross-Platform Path Handling Audit (0.5h)

**Files to check/modify:**
- `backend/server.py` — verify no absolute paths stored in DB
- `backend/preflight.py` — already uses `Path` objects (good)

**The rule:** All paths stored in the SQLite database MUST be relative to `backend/storage/`. Never store `/Users/chris/Code/waifu-rt3d/backend/storage/avatars/model.vrm` — store `avatars/model.vrm`.

**Audit checklist:**

| Table/Column | Current Format | Action |
|---|---|---|
| `characters.avatar_url` | Relative (`avatars/foo.vrm`) | OK — no change |
| `characters.avatar_2d_url` | Relative (`live2d/foo/`) | OK — no change |
| `characters.expression_portraits` | JSON with relative paths | OK — no change |
| `messages.image_url` | Relative (`images/foo.png`) | OK — verify |
| Any new columns | — | Enforce relative paths in code review |

**Path resolution pattern** (already used throughout `server.py`):

```python
# Reading: resolve relative path at runtime
full_path = STORAGE / relative_db_path

# Writing: store relative to STORAGE root
relative_path = full_path.relative_to(STORAGE)
```

No code changes needed if paths are already relative. If the audit finds absolute paths stored in the DB, add a one-time migration to strip the prefix.

**Config file (`backend/config/app.json`):** Uses endpoint URLs (not file paths), so no cross-platform issue. The config syncs as-is.

### Task 1.5 — "Recently Modified" Frontend Warning (0.5h)

**File:** `backend/server.py` — add to the `/api/health` or `/api/status` endpoint
**File:** `frontends/sakura/src/stores/appStore.ts` — display warning banner

On startup, check if `app.db` was modified less than 120 seconds ago. If so, return a warning in the health check response. The frontend shows a dismissable banner: "Database was recently modified by another machine. Make sure the app is closed on other devices."

```python
# In /api/health or /api/status response:
db_mtime = os.path.getmtime(DB_PATH)
seconds_since_modified = time.time() - db_mtime
if seconds_since_modified < 120:
    response["sync_warning"] = (
        "Database was modified less than 2 minutes ago. "
        "Ensure the app is closed on other machines."
    )
```

---

## Phase 2: Encrypted Backup with restic

**Effort:** 2.5 hours
**Goal:** Provide ready-to-run backup scripts for all 3 machines, with documentation.

### Task 2.1 — restic Backup Script (1h)

**File to create:** `scripts/backup.sh` (Mac/Linux)

```bash
#!/usr/bin/env bash
#
# waifu-rt3d encrypted backup via restic
#
# Usage:
#   ./scripts/backup.sh                    # Run backup
#   ./scripts/backup.sh restore latest     # Restore latest snapshot
#   ./scripts/backup.sh snapshots          # List snapshots
#
# Environment variables (set in .env or export before running):
#   RESTIC_REPOSITORY  — path to restic repo (e.g., /Volumes/BackupDrive/waifu-backup)
#   RESTIC_PASSWORD    — encryption password (or use RESTIC_PASSWORD_FILE)
#
# First-time setup:
#   export RESTIC_REPOSITORY=/Volumes/BackupDrive/waifu-backup
#   export RESTIC_PASSWORD="your-strong-password"
#   restic init
#   ./scripts/backup.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
STORAGE_DIR="$PROJECT_ROOT/backend/storage"
DB_PATH="$STORAGE_DIR/app.db"

# --- Validate environment ---
if [ -z "${RESTIC_REPOSITORY:-}" ]; then
    echo "ERROR: RESTIC_REPOSITORY not set."
    echo "  export RESTIC_REPOSITORY=/Volumes/BackupDrive/waifu-backup"
    exit 1
fi

if [ -z "${RESTIC_PASSWORD:-}" ] && [ -z "${RESTIC_PASSWORD_FILE:-}" ]; then
    echo "ERROR: RESTIC_PASSWORD or RESTIC_PASSWORD_FILE not set."
    exit 1
fi

# --- Subcommands ---
CMD="${1:-backup}"

case "$CMD" in
    backup)
        echo "=== waifu-rt3d backup ==="

        # Step 1: Checkpoint WAL into main DB (safe for file copy)
        if [ -f "$DB_PATH" ]; then
            echo "Checkpointing SQLite WAL..."
            sqlite3 "$DB_PATH" "PRAGMA wal_checkpoint(TRUNCATE);" 2>/dev/null || true
            rm -f "$DB_PATH-wal" "$DB_PATH-shm" 2>/dev/null || true
            echo "WAL checkpoint done."
        fi

        # Step 2: Run restic backup
        echo "Running restic backup..."
        restic backup \
            "$STORAGE_DIR" \
            "$PROJECT_ROOT/backend/config" \
            "$PROJECT_ROOT/docs/characters" \
            --exclude="_backups" \
            --exclude="__pycache__" \
            --exclude="*.pyc" \
            --exclude="*.db-wal" \
            --exclude="*.db-shm" \
            --exclude="*.db-journal" \
            --tag "waifu-rt3d" \
            --verbose

        # Step 3: Apply retention policy (7 daily, 4 weekly, 3 monthly)
        echo "Pruning old snapshots..."
        restic forget \
            --keep-daily 7 \
            --keep-weekly 4 \
            --keep-monthly 3 \
            --prune \
            --tag "waifu-rt3d"

        echo "=== Backup complete ==="
        restic snapshots --tag "waifu-rt3d" --latest 3
        ;;

    restore)
        SNAPSHOT="${2:-latest}"
        RESTORE_DIR="$PROJECT_ROOT/backend/storage_restored"
        echo "=== Restoring snapshot: $SNAPSHOT ==="
        echo "Restore target: $RESTORE_DIR"
        restic restore "$SNAPSHOT" --target "$RESTORE_DIR" --tag "waifu-rt3d"
        echo "=== Restore complete ==="
        echo "Files restored to: $RESTORE_DIR"
        echo "Manually copy what you need to backend/storage/"
        ;;

    snapshots)
        restic snapshots --tag "waifu-rt3d"
        ;;

    *)
        echo "Usage: $0 [backup|restore [snapshot-id]|snapshots]"
        exit 1
        ;;
esac
```

**File to create:** `scripts/backup.ps1` (Windows)

```powershell
#
# waifu-rt3d encrypted backup via restic (Windows)
#
# Usage:
#   .\scripts\backup.ps1                     # Run backup
#   .\scripts\backup.ps1 -Command restore    # Restore latest snapshot
#   .\scripts\backup.ps1 -Command snapshots  # List snapshots
#
# Environment variables (set before running):
#   $env:RESTIC_REPOSITORY = "E:\Backups\waifu-backup"
#   $env:RESTIC_PASSWORD = "your-strong-password"
#
# First-time setup:
#   restic init

param(
    [string]$Command = "backup",
    [string]$Snapshot = "latest"
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir
$StorageDir = Join-Path $ProjectRoot "backend\storage"
$DbPath = Join-Path $StorageDir "app.db"

# --- Validate environment ---
if (-not $env:RESTIC_REPOSITORY) {
    Write-Error "RESTIC_REPOSITORY not set. Example: `$env:RESTIC_REPOSITORY = 'E:\Backups\waifu-backup'"
    exit 1
}
if (-not $env:RESTIC_PASSWORD -and -not $env:RESTIC_PASSWORD_FILE) {
    Write-Error "RESTIC_PASSWORD or RESTIC_PASSWORD_FILE not set."
    exit 1
}

switch ($Command) {
    "backup" {
        Write-Host "=== waifu-rt3d backup ===" -ForegroundColor Cyan

        # Step 1: Checkpoint WAL
        if (Test-Path $DbPath) {
            Write-Host "Checkpointing SQLite WAL..."
            & sqlite3.exe $DbPath "PRAGMA wal_checkpoint(TRUNCATE);" 2>$null
            Remove-Item "$DbPath-wal" -ErrorAction SilentlyContinue
            Remove-Item "$DbPath-shm" -ErrorAction SilentlyContinue
            Write-Host "WAL checkpoint done."
        }

        # Step 2: Run restic backup
        Write-Host "Running restic backup..."
        & restic backup `
            $StorageDir `
            (Join-Path $ProjectRoot "backend\config") `
            (Join-Path $ProjectRoot "docs\characters") `
            --exclude="_backups" `
            --exclude="__pycache__" `
            --exclude="*.pyc" `
            --exclude="*.db-wal" `
            --exclude="*.db-shm" `
            --exclude="*.db-journal" `
            --tag "waifu-rt3d" `
            --verbose

        # Step 3: Retention policy
        Write-Host "Pruning old snapshots..."
        & restic forget `
            --keep-daily 7 `
            --keep-weekly 4 `
            --keep-monthly 3 `
            --prune `
            --tag "waifu-rt3d"

        Write-Host "=== Backup complete ===" -ForegroundColor Green
        & restic snapshots --tag "waifu-rt3d" --latest 3
    }
    "restore" {
        $RestoreDir = Join-Path $ProjectRoot "backend\storage_restored"
        Write-Host "=== Restoring snapshot: $Snapshot ===" -ForegroundColor Cyan
        & restic restore $Snapshot --target $RestoreDir --tag "waifu-rt3d"
        Write-Host "Files restored to: $RestoreDir" -ForegroundColor Green
    }
    "snapshots" {
        & restic snapshots --tag "waifu-rt3d"
    }
    default {
        Write-Host "Usage: .\backup.ps1 -Command [backup|restore|snapshots]"
    }
}
```

### Task 2.2 — Syncthing Setup Documentation (1h)

**File to create:** `docs/guides/syncthing-setup.md`

Document the exact steps for setting up Syncthing across the 3 machines:

1. Install Syncthing on all machines
2. Add `backend/storage/` as a shared folder
3. Place `.stignore` (already created in Task 1.3)
4. Set folder type: "Send & Receive" on primary machine, "Receive Only" on others (recommended) or "Send & Receive" on all (if editing on any machine)
5. Verify sync by checking Syncthing web UI
6. The one rule: close the app on machine A before opening on machine B

### Task 2.3 — Tests (0.5h)

**File:** `backend/tests/test_sync_safety.py`

```python
"""Tests for sync safety features (WAL checkpoint, integrity check)."""

import sqlite3
import tempfile
from pathlib import Path

def test_wal_checkpoint_truncate():
    """Verify PRAGMA wal_checkpoint(TRUNCATE) folds WAL into main DB."""
    with tempfile.TemporaryDirectory() as tmp:
        db_path = Path(tmp) / "test.db"
        con = sqlite3.connect(str(db_path))
        con.execute("PRAGMA journal_mode=WAL")
        con.execute("CREATE TABLE t (id INTEGER PRIMARY KEY, val TEXT)")
        con.execute("INSERT INTO t VALUES (1, 'hello')")
        con.commit()

        # WAL file should exist
        wal_path = Path(str(db_path) + "-wal")
        assert wal_path.exists()

        # Checkpoint should fold WAL into main DB
        con.execute("PRAGMA wal_checkpoint(TRUNCATE)")
        con.close()

        # After checkpoint + close, WAL should be empty or gone
        if wal_path.exists():
            assert wal_path.stat().st_size == 0

def test_integrity_check_passes_clean_db():
    """Verify integrity check returns 'ok' for a healthy database."""
    with tempfile.TemporaryDirectory() as tmp:
        db_path = Path(tmp) / "test.db"
        con = sqlite3.connect(str(db_path))
        con.execute("CREATE TABLE t (id INTEGER PRIMARY KEY)")
        con.commit()
        result = con.execute("PRAGMA integrity_check").fetchone()
        con.close()
        assert result[0] == "ok"
```

---

## Files Summary

### Files to Modify

| File | Change | Task |
|---|---|---|
| `backend/server.py` | Add WAL checkpoint + ephemeral file cleanup in `lifespan()` shutdown block | 1.1 |
| `backend/server.py` | Add `sync_warning` field to health/status endpoint | 1.5 |
| `backend/preflight.py` | Add `_sync_safety_checks()` function + call in `run()` | 1.2 |
| `frontends/sakura/src/stores/appStore.ts` | Display sync warning banner if present in health response | 1.5 |

### Files to Create

| File | Purpose | Task |
|---|---|---|
| `backend/storage/.stignore` | Syncthing ignore rules for storage directory | 1.3 |
| `scripts/backup.sh` | restic backup script (Mac/Linux) | 2.1 |
| `scripts/backup.ps1` | restic backup script (Windows) | 2.1 |
| `docs/guides/syncthing-setup.md` | User-facing Syncthing setup guide | 2.2 |
| `backend/tests/test_sync_safety.py` | Tests for WAL checkpoint + integrity check | 2.3 |

---

## Syncthing Recommended Folder Setup

```
Syncthing Folder Configuration
──────────────────────────────
Folder Label:    waifu-storage
Folder Path:     <project-root>/backend/storage/
Folder Type:     Send & Receive (all machines)
                 — OR —
                 Send & Receive (primary) + Receive Only (others)

Devices:
  ├── Mac M2 Pro (chris-mac)       — primary
  ├── Win RTX 5080 (chris-win1)    — secondary
  └── Win RTX 3070 (chris-win2)    — secondary

File Versioning:  Simple (keep 5 versions, 30 days)
                  This is Syncthing's built-in conflict safety net.

Rescan Interval:  60 seconds (default)
Watch for Changes: Enabled (uses inotify/FSEvents)
```

**Folder structure on each machine:**

```
Mac:     /Users/chris/Code/waifu-rt3d/backend/storage/
Win1:    C:\Code\waifu-rt3d\backend\storage\
Win2:    C:\Code\waifu-rt3d\backend\storage\
```

The `.stignore` file syncs with the folder and is respected by all machines automatically.

---

## Cross-Platform Path Handling

### Rule: All DB Paths Are Relative

Paths stored in SQLite must be relative to `backend/storage/`. The app resolves them at runtime:

```python
# Python (server.py) — reading a path from DB
STORAGE = Path(ROOT_DIR) / "backend" / "storage"
avatar_full_path = STORAGE / row["avatar_url"]   # "avatars/model.vrm"

# Python (server.py) — writing a path to DB
relative = full_path.relative_to(STORAGE)
cur.execute("UPDATE characters SET avatar_url = ?", (str(relative),))
```

```typescript
// TypeScript (frontend) — constructing API URLs
// Frontend never deals with filesystem paths.
// It uses /api/avatars/<filename> endpoints which the backend resolves.
```

### Config File (`backend/config/app.json`)

Contains URLs (endpoints), not filesystem paths. Syncs identically across platforms. No changes needed.

### Line Endings

SQLite `.db` files are binary — not affected by line ending conversion. Text files (character MDs, config JSON) should use LF universally. Add to `.gitattributes` if not already present:

```
*.md text eol=lf
*.json text eol=lf
*.py text eol=lf
*.ts text eol=lf
*.tsx text eol=lf
```

---

## Effort Breakdown

| Task | Description | Hours |
|---|---|---|
| 1.1 | WAL checkpoint on shutdown (`server.py`) | 1.0 |
| 1.2 | Integrity check on startup (`preflight.py`) | 1.0 |
| 1.3 | `.stignore` file | 0.5 |
| 1.4 | Cross-platform path audit | 0.5 |
| 1.5 | "Recently modified" warning (backend + frontend) | 0.5 |
| **Phase 1 Total** | | **3.5** |
| 2.1 | restic backup scripts (bash + PowerShell) | 1.0 |
| 2.2 | Syncthing setup guide | 1.0 |
| 2.3 | Tests | 0.5 |
| **Phase 2 Total** | | **2.5** |
| **Grand Total** | | **6.0** |

---

## Future Phase (Not Scheduled)

### Phase 3: JSON Export/Import for Multi-Machine Merge (~16h)

If the "close app on A before opening on B" rule proves too restrictive, implement table-level JSON export/import with per-table merge strategies (append-only for messages/memories, last-write-wins for settings). This is substantial engineering and should only be built if Phase 1 proves insufficient.

### Phase 4: cr-sqlite CRDT Integration (~40h)

True multi-writer sync. Only pursue if simultaneous editing becomes a real need. High complexity, uncertain library maturity.
