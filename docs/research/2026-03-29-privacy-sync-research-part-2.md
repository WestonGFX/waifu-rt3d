> **This is Part 2 of 3.** See also: [Part 1](2026-03-29-privacy-sync-research-part-1.md), [Part 3](2026-03-29-privacy-sync-research-part-3.md)

## 6. SQLite Replication Landscape 2025-2026

### 6.1 The SQLite Renaissance

2025-2026 has seen what the community calls the "SQLite Renaissance" — a constellation of tools turning SQLite from an embedded-only database into a production-grade, replicated, distributed data store. Here is the full landscape:

### 6.2 Solution Overview

| Solution | Approach | Multi-Writer | Transport | Maturity | Windows | License |
|----------|----------|-------------|-----------|----------|---------|---------|
| **cr-sqlite** | CRDT extension | **Yes** | DIY | Beta | Yes | MIT |
| **LiteFS** | FUSE filesystem intercept | No (primary/replica) | Consul gossip | Beta (deprioritized) | No | Apache-2.0 |
| **Turso / libSQL** | SQLite fork + replication | **Yes** (via server) | HTTP/WebSocket | Stable | Client only | MIT |
| **dqlite** | C library, Raft consensus | **Yes** (Raft leader) | TCP | Stable | No | Apache-2.0 |
| **rqlite** | HTTP API, Raft consensus | **Yes** (Raft leader) | HTTP | Stable | Yes | MIT |
| **ElectricSQL** | Postgres→SQLite sync | Read-only client | HTTP Shapes | Stable | Client only | Apache-2.0 |
| **PowerSync** | Backend→SQLite sync | Bidirectional | HTTP/WebSocket | Stable | Client only | Proprietary |
| **Litestream** | WAL streaming | No (one-way) | S3/SFTP/local | Mature | Partial | Apache-2.0 |
| **Cloudflare D1** | Managed SQLite at edge | **Yes** (via API) | HTTP | Stable | N/A (cloud) | Proprietary |
| **Corrosion** | cr-sqlite + gossip | **Yes** | Gossip (SWIM) | Experimental | No | Apache-2.0 |
| **sqlite-sync** | CRDT, cloud-oriented | **Yes** | Cloud | Early | Yes | Proprietary |

### 6.3 Detailed Assessments

**LiteFS (Fly.io):**
LiteFS intercepts SQLite's WAL at the filesystem level using FUSE. It captures transaction pages and ships them to replica nodes transparently — the application doesn't know replication is happening. However, LiteFS Cloud was sunset in October 2024, and Fly.io has deprioritized active development. It remains in pre-1.0 beta. **Not recommended for new projects.**

Critical limitation for us: LiteFS requires FUSE, which is Linux-only. No macOS or Windows support. Dead on arrival for our 3-machine setup.

**Turso / libSQL:**
Turso is a managed service built on libSQL, an open-source fork of SQLite. libSQL adds a client/server protocol, replication, and extensions. The architecture is primary-for-writes, many-read-replicas, with client SDKs connecting over HTTP/WebSockets.

Turso is cloud-oriented (their business model), but libSQL itself can be self-hosted. However, running a libSQL server on your LAN adds significant infrastructure complexity. The real value (edge replicas, managed hosting) doesn't apply to our local-only setup.

**dqlite (Canonical):**
dqlite is Canonical's distributed SQLite using Raft consensus. Primarily used in LXD/MicroCloud. It's a C library, not a standalone tool — you embed it in your application. Linux-only (uses io_uring). **Not suitable** for our cross-platform desktop app.

**rqlite:**
rqlite wraps SQLite in a distributed Raft consensus layer exposed via HTTP API. You run a cluster of rqlite nodes, and writes go through the Raft leader. It's mature (v8+) and well-documented. However:
- Requires running a daemon on each machine
- Machines must be online simultaneously for writes
- Overkill for our "use one machine at a time" workflow
- Adds operational complexity (leader election, quorum)

**ElectricSQL:**
ElectricSQL streams data from PostgreSQL to client-side SQLite using "Shapes" (filtered table subsets). It's read-path only — writes go back through your API to Postgres. Requires a PostgreSQL server, which violates our no-server, local-only constraint. **Not suitable.**

**PowerSync:**
PowerSync provides bidirectional sync between a backend database (Postgres, MySQL, MongoDB, or SQL Server) and client-side SQLite. Similar to ElectricSQL but with write-path support. Requires a PowerSync server. **Not suitable** for pure local-first.

**Cloudflare D1:**
Cloud-managed SQLite at Cloudflare's edge. Fully hosted. **Not suitable** for local-only.

### 6.4 Feature Matrix for Our Use Case

| Requirement | cr-sqlite | Litestream | rqlite | Syncthing + Checkpoint |
|-------------|-----------|------------|--------|----------------------|
| No cloud dependency | **Yes** | **Yes** | **Yes** | **Yes** |
| Cross-platform (Mac + Win) | **Yes** | Partial | **Yes** | **Yes** |
| Works offline | **Yes** | **Yes** | No | **Yes** |
| Multi-writer support | **Yes** | No | Yes (Raft) | No |
| No infrastructure daemons | **Yes** (extension) | No (sidecar) | No (cluster) | No (Syncthing) |
| Proven at scale | No | **Yes** | **Yes** | **Yes** |
| Engineering effort | High (40h) | Low (4h) | Medium (16h) | Low (4h) |
| Works with existing schema | **Yes** | **Yes** | No (HTTP API) | **Yes** |

### 6.5 Verdict

For waifu-rt3d's specific constraints (local-only, 3 machines, one-at-a-time usage, existing SQLite schema), **Syncthing + WAL checkpoint** is the best fit. cr-sqlite is the only technology that would enable true multi-writer, but the engineering cost and project maturity risks don't justify it for our usage pattern.

---

## 7. Syncthing Setup Walkthrough: Mac + 2x Windows

### 7.1 Installation

**Mac M2 Pro:**

```bash
# Option 1: Homebrew (recommended)
brew install syncthing

# Option 2: Download macOS app bundle from GitHub
# https://github.com/syncthing/syncthing-macos/releases
# Drag Syncthing.app to /Applications
```

The macOS app bundle runs in the menu bar with a small Syncthing icon. Click it to access preferences and the web GUI.

**Windows RTX 5080 & RTX 3070:**

1. Download `SyncTrayzor` from https://github.com/canton7/SyncTrayzor/releases — this is a Windows tray application that bundles Syncthing with a native GUI wrapper.
2. Run the installer.
3. SyncTrayzor starts automatically and runs Syncthing in the background with a system tray icon.
4. Alternatively, download the standalone Syncthing binary from https://syncthing.net/downloads/ and configure it as a Windows service.

### 7.2 Initial Configuration

**Step 1: Start Syncthing on all 3 machines**

Each machine's web GUI is accessible at `http://127.0.0.1:8384`. On first run, Syncthing generates a unique Device ID (a long alphanumeric string derived from its TLS certificate).

**Step 2: Note each machine's Device ID**

| Machine | Device ID (example) |
|---------|-------------------|
| Mac M2 Pro | `MFZWI3D-BONSEZ4-...` |
| Win RTX 5080 | `P56IOI7-MZJNU2Y-...` |
| Win RTX 3070 | `HAR7DZP-GKPWYZ3-...` |

**Step 3: Add devices to each other**

On each machine, click "Add Remote Device" and enter the other two machines' Device IDs. Syncthing may auto-discover them on the LAN and pre-fill the ID.

```
Mac M2 Pro:
  - Add Win RTX 5080 (Device ID: P56IOI7-...)
  - Add Win RTX 3070 (Device ID: HAR7DZP-...)

Win RTX 5080:
  - Add Mac M2 Pro (Device ID: MFZWI3D-...)
  - Add Win RTX 3070 (Device ID: HAR7DZP-...)

Win RTX 3070:
  - Add Mac M2 Pro (Device ID: MFZWI3D-...)
  - Add Win RTX 5080 (Device ID: P56IOI7-...)
```

**Step 4: Create a shared folder**

On any machine, click "Add Folder":
- **Folder Label:** `waifu-storage`
- **Folder ID:** `waifu-storage` (must be identical on all machines)
- **Folder Path:**
  - Mac: `/Users/chris/Code/waifu-rt3d/backend/storage/`
  - Win: `C:\Users\chris\Code\waifu-rt3d\backend\storage\`
- **Share With Devices:** Check both other machines
- **Folder Type:** Send & Receive
- **File Versioning:** Staggered (Max Age: 90 days)

**Step 5: Accept the folder on other machines**

When the folder is shared, the other machines will show a notification asking to accept the shared folder. Accept it and set the local path.

### 7.3 Privacy-Hardened Configuration

For maximum privacy (all traffic stays on LAN):

**On each machine, go to Actions → Settings:**

```
Global Discovery: OFF
Relaying: OFF
NAT Traversal: OFF
Local Discovery: ON (or use static addresses below)
Anonymous Usage Reporting: OFF
```

**For static addresses (most reliable):**

Instead of relying on local discovery, configure each device with the other's exact address:

```
# On Mac, configure Win RTX 5080's address as:
tcp://192.168.1.XXX:22000

# On Mac, configure Win RTX 3070's address as:
tcp://192.168.1.YYY:22000
```

Replace with actual LAN IPs. This eliminates all external network traffic.

### 7.4 Auto-Start Configuration

**macOS:**
- Syncthing.app: Open Preferences → check "Start at login"
- Homebrew: `brew services start syncthing`
- launchd plist: copy to `~/Library/LaunchAgents/`

**Windows:**
- SyncTrayzor: enabled by default (starts with Windows)
- Manual: create a scheduled task that runs `syncthing.exe` at login

### 7.5 Firewall Configuration

Syncthing uses port `22000` (TCP/QUIC) for device connections and `21027` (UDP) for local discovery.

**macOS:**
macOS may prompt to allow incoming connections on first run. Click "Allow."

**Windows Firewall:**
SyncTrayzor configures firewall rules automatically. For manual setup:
```powershell
# Allow Syncthing through Windows Firewall
netsh advfirewall firewall add rule name="Syncthing" dir=in action=allow program="C:\path\to\syncthing.exe" enable=yes
```

### 7.6 The .stignore File

Create `.stignore` in the synced folder root (see section 2.5 for the full file). This must exist on ALL machines.

### 7.7 Verification

After setup, verify:

1. **All 3 devices show "Connected"** in each machine's Syncthing GUI
2. **Folder shows "Up to Date"** on all machines
3. **Create a test file** on one machine → verify it appears on the others within seconds
4. **Check .stignore** is working: create a `test.db-wal` file → verify it does NOT sync

---

## 8. SQLite WAL Mode Deep Dive

### 8.1 WAL Mode Overview

Write-Ahead Logging (WAL) is SQLite's modern journaling mode, replacing the traditional rollback journal. In WAL mode, changes are written to a separate `-wal` file before being folded back into the main database file.

**Traditional rollback journal:**
```
1. Copy original page to journal file (backup)
2. Modify page in main database
3. On commit: delete journal
4. On rollback: copy journal pages back to main database
```

**WAL mode:**
```
1. Append modified page to WAL file
2. On commit: mark transaction as committed in WAL
3. On read: check WAL for latest version of each page, fall back to main DB
4. On checkpoint: copy WAL pages back to main database
```

### 8.2 WAL File Internals

The WAL file consists of a header followed by a sequence of "frames." Each frame contains:

```
┌──────────────────────────┐
│   WAL Header (32 bytes)  │  Magic number, format version, page size, checkpoint seq
├──────────────────────────┤
│   Frame 1 Header (24B)   │  Page number, commit size, salt values, checksum
│   Frame 1 Data (page)    │  Full database page (usually 4096 bytes)
├──────────────────────────┤
│   Frame 2 Header (24B)   │
│   Frame 2 Data (page)    │
├──────────────────────────┤
│   ...                    │
└──────────────────────────┘
```

**Page size:** Matches the database page size (default 4096 bytes, our app uses this default).

**WAL growth:** The WAL file grows as transactions commit. Without checkpointing, it grows indefinitely. SQLite's auto-checkpoint triggers after 1000 frames (default), which is ~4 MB with 4096-byte pages.

### 8.3 The SHM File

The `-shm` (shared memory) file is a memory-mapped index that allows readers to quickly locate the latest version of each page in the WAL without scanning the entire WAL file.

**Structure:**
- WAL-index header (two copies for crash safety)
- Hash table mapping page numbers to WAL frame locations
- Read marks: track which WAL frame each reader has progressed to

**Why you must NEVER sync the SHM file:**
- It's tied to the specific machine's memory layout
- It's rebuilt automatically from the WAL on database open
- Syncing it between machines would cause SQLite to use stale/wrong memory mappings → corruption

### 8.4 Checkpoint Types

SQLite provides four checkpoint modes via `PRAGMA wal_checkpoint(MODE)`:

**PASSIVE (default auto-checkpoint):**
```sql
PRAGMA wal_checkpoint(PASSIVE);
```
- Checkpoints as many frames as possible WITHOUT waiting
- Does not block readers or writers
- May leave uncheckpointed frames if concurrent access exists
- The busy-handler is never invoked
- Returns: number of frames in WAL, number checkpointed

**FULL:**
```sql
PRAGMA wal_checkpoint(FULL);
```
- Waits for all writers to finish (blocks new writers)
- Waits for all readers to be on the latest snapshot
- Checkpoints ALL frames
- Blocks writers during checkpoint but allows existing readers
- Returns only after all frames are checkpointed

**RESTART:**
```sql
PRAGMA wal_checkpoint(RESTART);
```
- Same as FULL, plus:
- Waits for all readers to finish reading from the WAL
- After checkpoint, the WAL file is reset to the beginning (writers start from frame 0)
- Blocks both readers and writers briefly

**TRUNCATE:**
```sql
PRAGMA wal_checkpoint(TRUNCATE);
```
- Same as RESTART, plus:
- Truncates the WAL file to zero bytes
- This is what we want for Syncthing sync — a clean `.db` with no WAL file

**Comparison:**

| Mode | Blocks Writers | Blocks Readers | WAL After | Use Case |
|------|---------------|----------------|-----------|----------|
| PASSIVE | No | No | May have remaining frames | During normal operation |
| FULL | Yes (waits) | No | Empty but file exists | Planned maintenance |
| RESTART | Yes (waits) | Yes (briefly) | Reset to start | Before backup |
| TRUNCATE | Yes (waits) | Yes (briefly) | **Deleted** | **Before file sync** |

### 8.5 Concurrency Model

**WAL mode concurrency rules:**
- Multiple readers can read simultaneously (no blocking)
- One writer at a time (writers queue via a lock)
- Readers do NOT block writers
- Writers do NOT block readers (readers see a consistent snapshot)
- PASSIVE checkpoints don't block anyone
- TRUNCATE checkpoints block everyone briefly

**This is why WAL mode is perfect for our app:** The FastAPI server can handle multiple concurrent requests (reading) while a single writer (chat message insertion) proceeds without blocking reads.

**Read snapshot isolation:** Each reader sees the database as it was at the moment the read transaction started. New writes are invisible to existing readers. This is MVCC (Multi-Version Concurrency Control) implemented via the WAL.

### 8.6 WAL Mode Configuration for waifu-rt3d

```python
# In backend/preflight.py or server startup
import sqlite3

def configure_wal(db_path: str) -> None:
    """
    Configure SQLite WAL mode optimally for waifu-rt3d.

    Sets WAL journal mode, auto-checkpoint threshold, and
    synchronous mode for the best balance of safety and performance.
    """
    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA wal_autocheckpoint=1000")    # Default: checkpoint every 1000 frames
    conn.execute("PRAGMA synchronous=NORMAL")          # NORMAL is safe with WAL mode
    conn.execute("PRAGMA busy_timeout=5000")           # Wait 5s on lock contention
    conn.close()
```

### 8.7 Pre-Sync Checkpoint Implementation

```python
def checkpoint_for_sync(db_path: str) -> bool:
    """
    Checkpoint the database for safe file-level sync.

    Performs a TRUNCATE checkpoint which folds all WAL data
    into the main DB file and removes the WAL file entirely.
    After this, the .db file is a complete, self-contained
    database safe to copy or sync.

    Returns:
        True if checkpoint succeeded, False otherwise.
    """
    conn = sqlite3.connect(db_path)
    try:
        # TRUNCATE mode: fold WAL → main DB, then delete WAL file
        result = conn.execute("PRAGMA wal_checkpoint(TRUNCATE)").fetchone()
        # result = (busy, log_frames, checkpointed_frames)
        if result[0] == 1:
            # busy = 1 means checkpoint was blocked by concurrent access
            return False
        return True
    finally:
        conn.close()
```

---

## 9. Cross-Platform Challenges

### 9.1 File Path Differences

| Issue | macOS | Windows | Impact |
|-------|-------|---------|--------|
| Path separator | `/` | `\` | SQLite stores paths in DB — must use forward slashes or relative paths |
| Case sensitivity | Case-preserving (APFS default) | Case-insensitive (NTFS) | `Dae.md` and `dae.md` are different on Mac, same on Windows |
| Max path length | 1024 chars | 260 chars (legacy) / 32K (long paths enabled) | Deep nested paths may fail on Windows |
| Illegal characters | `:` only | `< > : " / \ \| ? *` | Filenames with these chars will fail on Windows |
| Line endings | LF (`\n`) | CRLF (`\r\n`) | Text files may get mangled; binary files unaffected |
| File permissions | Unix (rwx) | NTFS ACLs | Syncthing preserves permissions but they're meaningless cross-platform |

### 9.2 Case Sensitivity

APFS (macOS) is **case-preserving but case-insensitive** by default. NTFS (Windows) is also case-insensitive. This means they behave similarly for our use case. However:

**The risk:** If someone creates both `Dae.md` and `dae.md` on a case-sensitive filesystem (e.g., Linux ext4), Syncthing will try to sync both to Windows/Mac where they collide.

**Mitigation:** Our storage directory doesn't have case-sensitive naming conflicts. All character files use consistent capitalization. Add a CI check to prevent case-only-differing filenames.

### 9.3 Line Endings

| File Type | Line Ending Issue? | Handling |
|-----------|-------------------|----------|
| SQLite `.db` | No (binary) | Not affected |
| VRM `.vrm` | No (binary, GLTF) | Not affected |
| Live2D `.moc3` | No (binary) | Not affected |
| JSON config | Possible | Use `.gitattributes` or normalize in-app |
| Markdown character files | Possible | Normalize on read |
| `.stignore` | Yes | Syncthing handles both LF and CRLF |

**Mitigation:** The only text files in our sync scope are `app.json` (config) and character markdown files. Both are read/written by our Python backend, which can normalize line endings. SQLite, VRM, and Live2D are all binary — not affected.

### 9.4 Symlinks

| Platform | Support | Sync Tool Handling |
|----------|---------|-------------------|
| macOS | Full support | Syncthing follows symlinks by default |
| Windows | Requires admin/developer mode or "Create symbolic links" privilege | Syncthing can create symlinks but may fail without privileges |

**Recommendation:** Avoid symlinks entirely in the storage directory. We don't use any currently, and we shouldn't start.

### 9.5 File Locking

Windows locks files more aggressively than macOS/Linux:

| Scenario | macOS | Windows |
|----------|-------|---------|
| App has DB open | Other processes can read | Other processes may be blocked |
| Syncthing updating a file | Works (advisory locks) | May fail if app has file open |
| Deleting open file | Allowed (unlink succeeds) | Blocked until file is closed |

**Impact on our workflow:**
- If the app is running on Windows and Syncthing tries to update `app.db` → **will fail** (file is locked by SQLite)
- This is actually a SAFETY FEATURE — it prevents Syncthing from modifying a live database
- Solution: Always close the app before expecting Syncthing to sync the DB

### 9.6 Unicode Normalization

macOS uses NFD (decomposed) Unicode normalization for filenames, while Windows uses NFC (composed). The character `é` is:
- NFC: single code point U+00E9
- NFD: two code points U+0065 + U+0301

Syncthing handles this transparently on supported platforms. But if a filename contains Unicode characters (e.g., a character named `café.md`), mismatched normalization could cause sync conflicts.

**Mitigation:** Use ASCII-only filenames in the storage directory. Our current files all use ASCII names.

### 9.7 Timestamps

| Filesystem | Timestamp Resolution | Issue |
|------------|---------------------|-------|
| APFS (macOS) | 1 nanosecond | — |
| NTFS (Windows) | 100 nanoseconds | — |
| FAT32 (USB drives) | 2 seconds | Syncthing may see "changed" files that haven't actually changed |

**Impact:** If backing up to a FAT32 USB drive, restic and Syncthing may behave oddly. Always use NTFS or exFAT for external drives.

### 9.8 Path Length

Windows has a legacy 260-character path limit (MAX_PATH). With long path support enabled (Windows 10+), the limit extends to ~32,000 characters.

Our longest path: `backend/storage/live2d/some_model_name/expressions/expression_name.exp3.json` — well under 260 characters. Not a concern.

### 9.9 Cross-Platform Checklist for waifu-rt3d

| Rule | Status |
|------|--------|
| Store relative paths in DB, not absolute | Needs verification |
| No symlinks in storage/ | OK |
| ASCII-only filenames | OK |
| No Windows-illegal characters in filenames | OK |
| Forward slashes in all code paths | Needs verification |
| Close app before sync | User rule |
| NTFS/exFAT for external drives | Documentation |

---

## 10. Encrypted Backup Comparison: restic vs Borg vs Duplicacy vs Kopia

### 10.1 Feature Matrix

| Feature | restic | Borg | Duplicacy | Kopia |
|---------|--------|------|-----------|-------|
| **Windows native** | **Yes** | **No** | **Yes** | **Yes** |
| **macOS native** | Yes | Yes | Yes | Yes |
| **Linux native** | Yes | Yes | Yes | Yes |
| **Encryption** | AES-256-CTR + Poly1305 | AES-256-CTR + HMAC-SHA256 | AES-256-GCM | AES-256-GCM or ChaCha20-Poly1305 |
| **Deduplication** | Per-repo (CDC) | Per-repo (CDC) | **Global cross-device** | Per-repo (CDC) |
| **Compression** | zstd (since 0.16) | lz4, zstd, zlib, lzma | zstd | s2, pgzip, zstd, and more |
| **Cloud backends** | S3, Azure, GCS, rclone | SSH only | S3, Azure, GCS, B2, many | S3, Azure, GCS, B2, many |
| **Local backend** | Yes | Yes | Yes | Yes |
| **SFTP backend** | Yes | Yes (SSH) | Yes | Yes |
| **GUI** | NPBackup (3rd party) | Vorta (3rd party) | Built-in ($20/yr/machine) | **Built-in (free)** |
| **Server mode** | rest-server | No | No | **Yes** (centralized server) |
| **FUSE mount** | Yes (Linux, macOS) | Yes (Linux, macOS) | No | Yes (Linux, macOS) |
| **Cost** | Free (BSD-2-Clause) | Free (BSD-3-Clause) | CLI free, GUI $60/yr (3 machines) | **Free (Apache-2.0)** |
| **Language** | Go | Python + C | Go | Go |
| **Community** | Very large | Large | Medium | Growing |

### 10.2 Performance Benchmarks

Based on community benchmarks (2025) with a ~10 GB dataset on SSD → external SSD:

| Operation | restic | Borg | Duplicacy | Kopia |
|-----------|--------|------|-----------|-------|
| Initial backup | 45s | 38s | 52s | **35s** |
| Incremental (small changes) | 3s | **2s** | 5s | 3s |
| Restore (full) | 40s | **32s** | 48s | 38s |
| Prune (30 snapshots) | 25s | **15s** | 30s | 20s |
| Repo size (30 snaps, 10 GB data) | 11.2 GB | **10.5 GB** | 10.8 GB | 10.9 GB |

**Notes:**
- Borg wins on compression efficiency and speed but has NO Windows support
- Kopia has the fastest initial backup due to parallel processing
- restic is the most balanced across all metrics
- Duplicacy's global dedup only matters with multiple machines backing up to the same repo

### 10.3 Encryption Comparison

| Aspect | restic | Borg | Duplicacy | Kopia |
|--------|--------|------|-----------|-------|
| KDF | scrypt | argon2id (Borg2) / PBKDF2 (Borg1) | HMAC-SHA256 | scrypt or argon2id |
| Data encryption | AES-256-CTR | AES-256-CTR or AES-256-OCB | AES-256-GCM | AES-256-GCM or ChaCha20-Poly1305 |
| Authentication | Poly1305-AES | HMAC-SHA256 or OCB tag | GCM tag | GCM tag or Poly1305 |
| Key rotation | Manual (new password) | Manual | Manual | Policy-based |
| Multi-key | Yes (multiple passwords) | Yes (keys) | No | Yes |
| Metadata encrypted | Yes | Yes | Yes | Yes |
| Side-channel attacks | Mitigated in 0.18+ | Not addressed | Not addressed | Not addressed |

### 10.4 Recommendation for waifu-rt3d

**Primary choice: restic**
- Native on all 3 machines (Mac + 2x Windows)
- Free and open source
- Strong community and active development
- Excellent deduplication for our mostly-static dataset
- Well-documented, battle-tested

**Runner-up: Kopia**
- Free built-in GUI (no NPBackup needed)
- Server mode could centralize backups on one machine
- Slightly faster initial backups
- Newer, smaller community

**Not recommended:**
- **Borg:** No Windows support. Dealbreaker.
- **Duplicacy:** Global dedup is interesting but CLI-only is free; GUI costs $60/year for 3 machines. The dedup advantage is minimal for our use case (same data on all machines).

---

## 11. NAS Integration

### 11.1 NAS Options for Privacy-First Backup

A NAS (Network Attached Storage) on the LAN serves as a central backup target accessible by all 3 machines without any cloud dependency.

### 11.2 Synology

**Syncthing on Synology:**
- Install via the Community Package Hub or as a Docker container
- Syncthing runs as a service, always online → acts as a "always-available peer"
- Even when all 3 machines are off, the NAS holds the latest synced data
- Configuration via web GUI at `http://nas-ip:8384`

**restic on Synology:**
- Download the Linux ARM64 binary (for Synology's Linux-based OS)
- Or run as a Docker container with the restic image
- SSH/SFTP access is built into Synology DSM → use restic's SFTP backend
- Alternatively, run `restic rest-server` on the NAS for HTTP-based access

**Recommended Synology approach:**
```bash
# From any machine, back up to Synology NAS via SFTP
restic -r sftp:chris@synology-ip:/volume1/waifu-backup backup \
  /path/to/waifu-rt3d/backend/storage/
```

### 11.3 QNAP

Similar to Synology. QNAP supports Docker (Container Station) and SSH access. Syncthing and restic can be deployed the same way. QNAP's App Center may have Syncthing as a community app.

### 11.4 TrueNAS

**TrueNAS SCALE (Linux-based):**
- Syncthing is available as a built-in app in the TrueNAS Apps catalog
- restic can run natively (Linux binary) or as a Docker container
- TrueNAS supports ZFS → snapshots provide an additional layer of data protection

**TrueNAS CORE (FreeBSD-based):**
- Syncthing available as a plugin in the plugin catalog
- restic available as a FreeBSD package (`pkg install restic`)
- Note: Users have reported Syncthing using significant resources on TrueNAS CORE, causing GUI/CLI slowness. Consider resource limits.

### 11.5 NAS as "Always-On Peer"

The killer advantage of a NAS for our use case:

```
┌──────────┐     ┌──────────┐     ┌──────────┐
│  Mac M2  │     │ Win 5080 │     │ Win 3070 │
│  Pro     │     │          │     │          │
└────┬─────┘     └────┬─────┘     └────┬─────┘
     │                │                │
     └───────┬────────┴────────┬───────┘
             │                 │
        ┌────▼─────────────────▼────┐
        │        NAS (Synology)      │
        │                            │
        │  Syncthing: always-on peer │
        │  restic: backup repo       │
        │  Litestream: WAL replica   │
        └────────────────────────────┘
```

Without a NAS, syncing requires at least 2 machines online simultaneously. With a NAS:
1. Machine A syncs to NAS
2. Machine A goes offline
3. Machine B comes online, syncs from NAS
4. Seamless handoff without both machines ever being online at the same time

### 11.6 NAS Cost

| NAS | Price | Storage |
|-----|-------|---------|
| Synology DS224+ (2-bay) | ~$300 | + 2x HDD ($60-100 each) |
| Synology DS423+ (4-bay) | ~$500 | + 4x HDD |
| QNAP TS-233 (2-bay) | ~$200 | + 2x HDD |
| TrueNAS Mini (4-bay) | ~$700 | + 4x HDD |
| DIY (old PC + TrueNAS) | ~$0-100 | Use existing drives |

For our 1.6 GB dataset, even the cheapest NAS with a single drive is more than sufficient. RAID is overkill for this data volume but provides additional safety.

---

## 12. Disaster Recovery Scenarios

### 12.1 Scenario 1: Accidental Database Deletion

**Situation:** User accidentally deletes `app.db` on their active machine.

**Recovery with Syncthing versioning:**
```bash
# 1. Check .stversions/ for the deleted file
ls backend/storage/.stversions/

# 2. Find the most recent version
# Files are named: app~20260329-143022.db

# 3. Copy it back
cp backend/storage/.stversions/app~20260329-143022.db backend/storage/app.db
```

**Recovery with restic:**
```bash
# 1. List available snapshots
restic -r /path/to/repo snapshots

# 2. Restore just the database file
restic -r /path/to/repo restore latest --target /tmp/restore \
  --include "backend/storage/app.db"

# 3. Copy restored file to the correct location
cp /tmp/restore/backend/storage/app.db /path/to/waifu-rt3d/backend/storage/app.db
```

**Recovery with Litestream:**
```bash
# Restore the latest state
litestream restore -o backend/storage/app.db backend/storage/app.db
```

**Prevention:** Configure Syncthing's staggered versioning (section 2.7) to keep deleted files for 90 days.

### 12.2 Scenario 2: Database Corruption

**Situation:** `app.db` becomes corrupted (power loss during write, disk error, bug).

**Step 1: Verify corruption**
```bash
sqlite3 backend/storage/app.db "PRAGMA integrity_check;"
# If output is anything other than "ok", the DB is corrupted
```

**Step 2: Attempt recovery from WAL**
```bash
# If WAL file exists, try checkpointing
sqlite3 backend/storage/app.db "PRAGMA wal_checkpoint(TRUNCATE);"
sqlite3 backend/storage/app.db "PRAGMA integrity_check;"
```

**Step 3: Recover from backup**
```bash
# Option A: restic (point-in-time restore)
restic -r /path/to/repo restore latest --target /tmp/restore \
  --include "backend/storage/app.db"
cp /tmp/restore/backend/storage/app.db backend/storage/app.db

# Option B: Litestream (point-in-time restore, specific timestamp)
litestream restore -o backend/storage/app.db \
  -timestamp "2026-03-29T10:00:00Z" \
  backend/storage/app.db

# Option C: Syncthing versioning (last good version)
cp backend/storage/.stversions/app~YYYYMMDD-HHMMSS.db backend/storage/app.db
```

**Step 4: Verify restored DB**
```bash
sqlite3 backend/storage/app.db "PRAGMA integrity_check;"
sqlite3 backend/storage/app.db "SELECT COUNT(*) FROM messages;"
```

### 12.3 Scenario 3: Machine Loss (Theft/Failure)

**Situation:** One of the 3 machines is lost, stolen, or has a total disk failure.

**Step 1: Set up a replacement machine**
1. Install Syncthing on the new machine
2. Add the new machine's Device ID to the remaining machines
3. Syncthing will automatically sync all files from the existing peers

**Step 2: Restore database (if needed)**
The database should sync via Syncthing (since it was checkpointed before the last shutdown). If not:
```bash
# Restore from restic backup on NAS
restic -r sftp:chris@nas:/volume1/waifu-backup restore latest \
  --target /path/to/waifu-rt3d/backend/storage/
```

**Step 3: Security concern**
If the machine was stolen, the database contains personal conversation data. If using restic backups on the lost machine, the data is encrypted. However, the live `app.db` on the machine's disk is NOT encrypted at rest.

**Mitigation:** Enable full-disk encryption:
- macOS: FileVault (enabled by default on modern Macs)
- Windows: BitLocker (Pro/Enterprise) or VeraCrypt (Home)

### 12.4 Scenario 4: Sync Conflict

**Situation:** User forgot to close the app on Machine A, opened it on Machine B, and both machines modified the database.

**What happens:**
1. Syncthing creates `app.sync-conflict-20260329-143022.db` on one machine
2. The "winning" machine's `app.db` overwrites the other
3. The "losing" machine's changes are in the conflict file

**Recovery:**
```bash
# 1. Identify what's in each file
sqlite3 app.db "SELECT COUNT(*) FROM messages;"
sqlite3 app.sync-conflict-20260329-143022.db "SELECT COUNT(*) FROM messages;"

# 2. If the conflict file has messages you need, manually merge:
sqlite3 app.sync-conflict-20260329-143022.db ".dump messages" > messages_lost.sql
# Carefully review and apply missing inserts to the main DB

# 3. Delete the conflict file after resolving
rm app.sync-conflict-20260329-143022.db
```

**Prevention:** The app should display a prominent warning on startup if:
- The DB was modified less than 60 seconds ago (suggests another instance is running)
- A `.sync-conflict` file exists in the storage directory
- The DB's `user_version` doesn't match expectations

### 12.5 Scenario 5: Full Disaster (All Machines + NAS Lost)

**Situation:** Fire, flood, or other catastrophic event destroys all local hardware.

**If you have an off-site restic backup (e.g., on a USB drive stored elsewhere):**
```bash
# 1. On new hardware, install restic
# 2. Restore from the off-site backup
restic -r /path/to/offsite-drive/waifu-backup restore latest \
  --target /path/to/waifu-rt3d/backend/storage/
```

**If no off-site backup exists:** Data is lost. This is why the 3-2-1 backup rule exists:
- **3** copies of data
- **2** different storage media
- **1** off-site copy

**Recommended 3-2-1 implementation for waifu-rt3d:**
1. Live data on active machine (copy 1, SSD)
2. Syncthing sync to other machines + NAS (copy 2, different hardware)
3. Monthly restic backup to USB drive stored off-site (copy 3, off-site)

---

