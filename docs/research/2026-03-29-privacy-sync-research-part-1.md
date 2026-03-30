# Privacy-First Sync & Backup Research

> **This is Part 1 of 3.** See also: [Part 2](2026-03-29-privacy-sync-research-part-2.md), [Part 3](2026-03-29-privacy-sync-research-part-3.md)


**Date:** 2026-03-29
**Topic:** Keeping waifu-rt3d data synced across 3 machines (Mac M2 Pro, Win RTX 5080, Win RTX 3070) with zero cloud dependency
**Why:** The app is local-only, privacy-first. All data lives in SQLite + local files. User needs multi-machine sync and reliable backups without any cloud service.
**Related specs:** `docs/plans/` (future implementation plan TBD)

---

## Table of Contents

1. [Data Inventory](#1-data-inventory)
2. [Syncthing Deep Dive](#2-syncthing-deep-dive)
3. [cr-sqlite & CRDTs Deep Dive](#3-cr-sqlite--crdts-deep-dive)
4. [Litestream Deep Dive](#4-litestream-deep-dive)
5. [Encrypted Backup: restic Deep Dive](#5-encrypted-backup-restic-deep-dive)
6. [SQLite Replication Landscape 2025-2026](#6-sqlite-replication-landscape-2025-2026)
7. [Syncthing Setup Walkthrough: Mac + 2x Windows](#7-syncthing-setup-walkthrough-mac--2x-windows)
8. [SQLite WAL Mode Deep Dive](#8-sqlite-wal-mode-deep-dive)
9. [Cross-Platform Challenges](#9-cross-platform-challenges)
10. [Encrypted Backup Comparison: restic vs Borg vs Duplicacy vs Kopia](#10-encrypted-backup-comparison-restic-vs-borg-vs-duplicacy-vs-kopia)
11. [NAS Integration](#11-nas-integration)
12. [Disaster Recovery Scenarios](#12-disaster-recovery-scenarios)
13. [What Other Privacy-First Apps Do](#13-what-other-privacy-first-apps-do)
14. [Network Topologies](#14-network-topologies)
15. [Monitoring & Alerting](#15-monitoring--alerting)
16. [Migration Strategy](#16-migration-strategy)
17. [Security Threat Model](#17-security-threat-model)
18. [Cost Analysis](#18-cost-analysis)
19. [Future: WebRTC P2P Sync](#19-future-webrtc-p2p-sync)
20. [Resilio Sync](#20-resilio-sync)
21. [Git-Based Sync](#21-git-based-sync)
22. [Recommended Architecture](#22-recommended-architecture)
23. [Decision Matrix](#23-decision-matrix)
24. [Final Recommendation](#24-final-recommendation)
25. [Sources](#25-sources)

---

## 1. Data Inventory

Before evaluating tools, here is what actually needs syncing:

| Path | Size | Type | Write Frequency |
|------|------|------|-----------------|
| `backend/storage/app.db` | 3.3 MB | SQLite (WAL mode) | Every chat message, memory, setting change |
| `backend/storage/app.db-wal` | Variable | WAL journal | Continuous during use |
| `backend/storage/app.db-shm` | Variable | Shared memory index | Continuous during use |
| `backend/storage/images/` | 27 MB | JPEG/PNG portraits | Occasional (expression gen) |
| `backend/storage/avatars/` | 175 MB | VRM 3D models | Rare (user imports) |
| `backend/storage/live2d/` | 204 MB | Live2D model files | Rare (user imports) |
| `backend/storage/models/` | 1.2 GB | TTS/other ML models | Very rare (initial setup) |
| `backend/storage/tts_models/` | 60 MB | Kokoro TTS weights | Very rare |
| `backend/storage/memory/` | 1 MB | Tiered memory files | Per conversation |
| `docs/characters/` | ~5 MB | Character bible MD files | Occasional edits |
| `backend/config/app.json` | <1 KB | App settings | Rare |

**Total storage footprint:** ~1.6 GB
**Critical data:** `app.db` (40 tables including messages, memories, user_facts, character relationships, bond progression), character docs, config
**Large but static:** VRM avatars, Live2D models, TTS weights (rarely change after setup)

**Key constraint:** The app should NOT be running on two machines simultaneously editing the same database. This is a "use on one machine, sync to others" workflow, not real-time collaboration.

### Data Classification by Sync Strategy

| Category | Examples | Strategy | Rationale |
|----------|----------|----------|-----------|
| **Hot data** | `app.db`, `memory/` | Checkpoint + file sync | Changes every session, needs careful handling |
| **Warm data** | `images/`, `characters/` | Direct file sync | Changes occasionally, file-level sync is safe |
| **Cold data** | `avatars/`, `live2d/`, `models/`, `tts_models/` | Direct file sync (one-time) | Changes very rarely, large binary blobs |
| **Config** | `app.json`, `.stignore` | Direct file sync | Tiny, rarely changes |

### Growth Projections

| Timeline | DB Size | Images | Total |
|----------|---------|--------|-------|
| 6 months | ~15 MB | ~100 MB | ~1.9 GB |
| 1 year | ~40 MB | ~250 MB | ~2.1 GB |
| 2 years | ~100 MB | ~500 MB | ~2.5 GB |
| 5 years (heavy use) | ~500 MB | ~2 GB | ~4.5 GB |

The dataset remains modest even under heavy use. Syncthing and restic both handle these sizes trivially.

---

## 2. Syncthing Deep Dive

### 2.1 Overview

[Syncthing](https://syncthing.net/) is an open-source, decentralized, peer-to-peer file synchronization tool. Version 2.0 (released August 2025) migrated its own internal database from LevelDB to SQLite. It encrypts all data in transit and requires no central server. Licensed under MPL-2.0.

### 2.2 Block Exchange Protocol (BEP)

The Block Exchange Protocol is Syncthing's core wire protocol, operating as the highest layer in the protocol stack with TLS 1.3 providing encryption and authentication beneath it.

**Protocol Architecture:**

```
┌─────────────────────────────┐
│   Block Exchange Protocol   │  ← Application layer: file metadata + blocks
├─────────────────────────────┤
│         TLS 1.3             │  ← Encryption + mutual authentication
├─────────────────────────────┤
│       TCP / QUIC            │  ← Transport layer
└─────────────────────────────┘
```

**How BEP Works:**

1. **Cluster Formation:** Each device has a unique Device ID derived from its TLS certificate (SHA-256 hash of the certificate). Two devices form a cluster when each is configured with the other's Device ID.

2. **Index Exchange:** Upon connection, devices exchange an "index" — a list of all files in each shared folder, including metadata (file name, size, modification time, block hashes, permissions, etc.).

3. **Block-Level Sync:** Files are split into blocks ranging from 128 KiB to 16 MiB (powers of two). Only blocks that differ between devices are transferred. This is critical for our VRM files: a 50 MB VRM with a minor metadata edit only transfers the changed blocks.

4. **Request/Response:** When a device identifies missing or outdated blocks, it sends Request messages specifying the file, offset, and size. The remote device responds with the block data.

5. **Completion Tracking:** Devices track synchronization completion per-folder and announce when all files match the global model.

**Block Size Selection:**

| File Size | Block Size | Blocks per File |
|-----------|------------|-----------------|
| < 250 MiB | 128 KiB | Up to 2,000 |
| 250 MiB - 500 MiB | 256 KiB | Up to 2,000 |
| 500 MiB - 1 GiB | 512 KiB | Up to 2,000 |
| 1 GiB - 2 GiB | 1 MiB | Up to 2,000 |
| > 2 GiB | 2 MiB+ | Up to 2,000 |

Syncthing targets approximately 2,000 blocks per file by scaling block size with file size.

**Message Types:**

| Message | Direction | Purpose |
|---------|-----------|---------|
| `ClusterConfig` | Bidirectional | Exchange folder and device info at connection start |
| `Index` | Sender → Receiver | Full file listing for a folder |
| `IndexUpdate` | Sender → Receiver | Incremental changes since last Index |
| `Request` | Requester → Provider | Ask for a specific block |
| `Response` | Provider → Requester | Return block data |
| `Ping` | Either | Keep-alive |
| `Close` | Either | Graceful disconnect |

### 2.3 Device Discovery

Syncthing uses multiple discovery mechanisms, tried in order:

**1. Local Discovery (LAN)**
- Broadcasts UDP packets to `224.21.179.83:21027` (IPv4 multicast) and `[ff12::8384]:21027` (IPv6)
- Announces device ID and local IP:port
- Works instantly on the same LAN segment — **this is our primary use case** (all 3 machines on the same home network)
- No internet required

**2. Global Discovery Servers**
- Devices announce their external IP to Syncthing's global discovery servers via HTTPS
- Other devices query these servers to find peers when LAN discovery fails
- Discovery servers see device IDs and IP addresses but never file data
- Default servers: `discovery-v4.syncthing.net`, `discovery-v6.syncthing.net`
- Can be disabled entirely for maximum privacy (recommended for our setup)

**3. Static Addresses**
- Manually configure `tcp://192.168.1.100:22000` for each device
- Most reliable for a fixed home network — bypass all discovery entirely
- Recommended for waifu-rt3d: hardcode all 3 machine IPs

### 2.4 NAT Traversal & Relaying

When direct connections fail (not applicable for LAN but relevant for remote access):

**NAT Traversal Techniques:**
1. **UPnP/NAT-PMP:** Syncthing can request port forwarding from the router automatically
2. **STUN-like probing:** Determines NAT type and attempts hole-punching
3. **Relay Servers:** Last resort — traffic routes through Syncthing relay servers. Data remains TLS-encrypted end-to-end; relays see only encrypted blobs. Default relays are community-run.

**For our use case:** All 3 machines are on the same LAN. NAT traversal is irrelevant. We should:
- Disable global discovery (`globalAnnounceEnabled: false`)
- Disable relaying (`relaysEnabled: false`)
- Use static addresses or rely on local discovery only

### 2.5 .stignore Full Syntax Reference

The `.stignore` file lives at the root of each synced folder. Patterns are relative to the folder root. File must be UTF-8 encoded.

**Pattern Matching Rules:**

| Pattern | Matches | Does NOT Match |
|---------|---------|----------------|
| `foo` | `foo`, `subdir/foo`, any dir named `foo` | `foobar` |
| `*` | Any single path component | Directory separators |
| `**` | Any path including separators | — |
| `?` | Single non-separator character | `/` |
| `[a-z]` | Character range | Characters outside range |
| `/foo` | `foo` in root only | `subdir/foo` |
| `foo/` | Directory `foo` only | File named `foo` |

**Prefixes:**

| Prefix | Effect |
|--------|--------|
| `!` | Negate — include matching files (override previous ignore) |
| `(?i)` | Case-insensitive matching |
| `(?d)` | Allow deletion of matching files when they block directory removal |
| `#include filename` | Include patterns from another file |
| `//` | Comment line |

**Escape Characters:**
- Windows: pipe `|` escapes metacharacters
- Custom: `#escape=X` at file top defines `X` as escape character

**Our .stignore for waifu-rt3d:**

```
// Syncthing ignore file for waifu-rt3d backend/storage/
// SQLite WAL and SHM files — NEVER sync these
*.db-wal
*.db-shm
*.db-journal

// Temporary files
*.tmp
*.temp
*~
.DS_Store
Thumbs.db

// Backup staging area (managed by restic, not Syncthing)
_backups/

// Python bytecode (if any leaks into storage)
__pycache__/
*.pyc

// OS metadata
.Spotlight-V100
.Trashes
ehthumbs.db
desktop.ini

// Large model files — sync separately or on first setup only
// Uncomment these if you want to exclude ML models from continuous sync:
// models/
// tts_models/
```

### 2.6 Folder Types

Syncthing supports four folder types, crucial for our multi-machine setup:

| Type | Local Changes | Remote Changes | Use Case |
|------|---------------|----------------|----------|
| **Send & Receive** | Sent to cluster | Applied locally | Default bidirectional sync |
| **Send Only** | Sent to cluster | Ignored (shown as "out of sync") | Primary machine pushes to others |
| **Receive Only** | Ignored locally | Applied locally | Mirror/backup machine |
| **Receive Encrypted** | N/A | Stored encrypted | Untrusted storage node |

**Recommended configuration for waifu-rt3d:**

- **Active machine (whichever you're using):** Send & Receive
- **Idle machines:** Send & Receive (but app is closed, so no local changes happen)

Alternatively, for extra safety:
- **Mac M2 Pro:** Send & Receive (primary dev machine)
- **Win RTX 5080:** Send & Receive
- **Win RTX 3070:** Send & Receive

All machines are trusted and equivalent. The "one machine at a time" rule prevents conflicts.

### 2.7 File Versioning

Syncthing can keep old versions of files when they are replaced or deleted by a remote device. Five versioning strategies:

**Trashcan Versioning:**
- Moves replaced/deleted files to `.stversions/`
- Files in `.stversions/` are not synced
- Optional `cleanoutDays` parameter (default 0 = keep forever)
- Simplest option — good for "oops I deleted something" recovery

**Simple Versioning:**
- Like Trashcan but keeps N timestamped versions
- Files named `filename~YYYYMMDD-HHMMSS.ext`
- `keep` parameter: number of versions to retain (default 5)
- Good balance of safety and disk usage

**Staggered Versioning:**
- Intelligent time-based retention:
  - First hour: one version per 30 seconds
  - First day: one version per hour
  - First 30 days: one version per day
  - After 30 days: one version per week
  - Beyond `maxAge`: deleted entirely
- Default `maxAge`: 365 days
- Best for long-term versioning with automatic cleanup

**External Versioning:**
- Delegates to a custom command/script
- Command receives `%FOLDER_PATH%`, `%FILE_PATH%` as parameters
- Could call `restic backup` or custom logic
- Most flexible but requires scripting

**Recommended for waifu-rt3d:** Staggered versioning with `maxAge: 90` days. Provides safety net without unbounded disk growth.

### 2.8 Syncthing REST API

Syncthing exposes a comprehensive REST API on its GUI port (default `127.0.0.1:8384`). Authentication is via API key (stored in config) or session cookie.

**Key Endpoints for Automation:**

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/rest/system/status` | GET | System status (uptime, device ID, etc.) |
| `/rest/system/connections` | GET | Connected devices and transfer rates |
| `/rest/system/config` | GET/PUT | Full configuration |
| `/rest/config/folders` | GET/POST/PUT | Folder management |
| `/rest/config/devices` | GET/POST/PUT | Device management |
| `/rest/db/status?folder=X` | GET | Folder sync status (in-sync, need items, etc.) |
| `/rest/db/completion?device=X&folder=Y` | GET | Completion percentage per device/folder |
| `/rest/db/scan?folder=X` | POST | Trigger immediate scan |
| `/rest/db/revert?folder=X` | POST | Revert local changes to match cluster |
| `/rest/events` | GET | Long-polling event stream |
| `/rest/folder/versions?folder=X` | GET | Archived file versions |
| `/rest/stats/folder` | GET | Folder statistics |
| `/rest/stats/device` | GET | Device statistics |

**Event API:**
The `/rest/events` endpoint supports long-polling. Key event types:

| Event | Fired When |
|-------|-----------|
| `StateChanged` | Folder transitions (idle → syncing → idle) |
| `ItemFinished` | File sync completed |
| `FolderCompletion` | Sync progress update |
| `DeviceConnected` | Peer comes online |
| `DeviceDisconnected` | Peer goes offline |
| `FolderErrors` | Sync errors occurred |
| `ConfigSaved` | Configuration changed |

**Example: Check sync completion before allowing app startup:**

```python
import requests

SYNCTHING_API = "http://127.0.0.1:8384"
API_KEY = "your-api-key-here"
HEADERS = {"X-API-Key": API_KEY}

def is_folder_synced(folder_id: str) -> bool:
    """Check if a Syncthing folder is fully synchronized."""
    resp = requests.get(
        f"{SYNCTHING_API}/rest/db/status",
        params={"folder": folder_id},
        headers=HEADERS,
    )
    data = resp.json()
    return data["needFiles"] == 0 and data["needBytes"] == 0

def get_connected_devices() -> list[dict]:
    """Get list of currently connected Syncthing devices."""
    resp = requests.get(
        f"{SYNCTHING_API}/rest/system/connections",
        headers=HEADERS,
    )
    connections = resp.json()["connections"]
    return [
        {"id": dev_id, "address": info["address"], "connected": info["connected"]}
        for dev_id, info in connections.items()
    ]

def trigger_scan(folder_id: str) -> None:
    """Force an immediate folder scan."""
    requests.post(
        f"{SYNCTHING_API}/rest/db/scan",
        params={"folder": folder_id},
        headers=HEADERS,
    )
```

**Example: Wait for sync completion with event polling:**

```python
def wait_for_sync(folder_id: str, timeout: int = 60) -> bool:
    """
    Block until folder is synced or timeout.

    Args:
        folder_id: Syncthing folder identifier
        timeout: Max seconds to wait

    Returns:
        True if synced, False if timed out
    """
    import time
    start = time.time()
    last_id = 0

    while time.time() - start < timeout:
        resp = requests.get(
            f"{SYNCTHING_API}/rest/events",
            params={"since": last_id, "timeout": 5, "events": "StateChanged"},
            headers=HEADERS,
        )
        events = resp.json()
        for event in events:
            last_id = event["id"]
            if (event["data"].get("folder") == folder_id
                    and event["data"].get("to") == "idle"):
                return True
    return False
```

### 2.9 Performance & Benchmarks

**Transfer Speed (LAN, Gigabit Ethernet):**

| Scenario | Speed | Notes |
|----------|-------|-------|
| Initial sync, 1.6 GB | ~100 MB/s | Limited by disk I/O, not network |
| Incremental, 3.3 MB DB change | <1 second | Single block transfer |
| Incremental, 50 MB VRM edit | 2-5 seconds | Only changed blocks |
| Large model file, 1.2 GB | 12-15 seconds | Full file, first sync only |

**CPU Usage:**
- Idle (watching for changes): <1% CPU
- Active scanning: 5-15% CPU (brief spikes)
- File transfer: 10-30% CPU (hashing + encryption)
- Memory: ~50-100 MB resident

**Overhead on our dataset:**
- Syncthing metadata: ~5 MB for 1.6 GB dataset
- `.stversions/`: depends on versioning config (typically 1-2x dataset for staggered)

### 2.10 Encryption

**In Transit:** All BEP connections use TLS 1.3 with mutual certificate authentication. Each device's identity IS its TLS certificate fingerprint.

**At Rest (Receive Encrypted):** Syncthing can encrypt data before storing it on an untrusted device. The receiving device stores encrypted blobs and cannot read file contents. Useful for syncing to an untrusted NAS. Uses XChaCha20-Poly1305 per file, with keys derived from a folder-specific password.

**For our use case:** In-transit encryption is automatic. At-rest encryption is unnecessary since all 3 machines are trusted. However, if syncing to a NAS for backup, Receive Encrypted mode adds a layer of protection.

### 2.11 SQLite Database Syncing: THE CRITICAL PROBLEM

**This is the single biggest risk with file-level sync tools and SQLite.**

| Risk | Description | Severity |
|------|-------------|----------|
| WAL desync | Syncthing may sync `app.db` and `app.db-wal` at different times. A DB file without its matching WAL = corruption or data loss. | **CRITICAL** |
| Mid-write sync | If Syncthing copies the DB while SQLite is writing, the copy may be inconsistent. | **HIGH** |
| Conflict copies | Two machines editing the same DB creates `.sync-conflict` files that are useless for SQLite (you can't merge two .db files). | **MEDIUM** |
| SHM files | The `-shm` file is ephemeral shared memory; syncing it is meaningless and potentially harmful. | **MEDIUM** |

**Mitigation Strategies:**

1. **Close the app before syncing.** Run `PRAGMA wal_checkpoint(TRUNCATE)` on shutdown to fold WAL into the main DB, then Syncthing can safely sync the single `.db` file.
2. **Ignore WAL/SHM files** in `.stignore` (see section 2.5).
3. **Use send-only / receive-only mode** for extra safety.
4. **Pre-sync hook.** Syncthing supports folder hooks — run a script that checkpoints the DB before sync.
5. **Integrity check on startup.** Run `PRAGMA integrity_check` when the app detects the DB was modified externally.

### 2.12 Verdict for This Project

| Aspect | Rating |
|--------|--------|
| Large binary files (VRM, Live2D) | Excellent — block-level delta sync |
| Static assets | Excellent — sync once, done |
| SQLite database | **Dangerous without precautions** |
| Setup complexity | Low (GUI on all platforms) |
| Cross-platform | Mac + Windows + Linux |
| Cost | Free, open source (MPL-2.0) |
| REST API for automation | Excellent |

**Bottom line:** Excellent for syncing everything EXCEPT the SQLite database. For the DB, we need an export/import layer or pre-sync checkpoint.

---

## 3. cr-sqlite & CRDTs Deep Dive

### 3.1 What Are CRDTs?

Conflict-free Replicated Data Types (CRDTs) are data structures that can be replicated across multiple nodes, where each node can independently update its own replica, and all replicas are guaranteed to converge to the same state without coordination. This is a mathematical guarantee, not a best-effort approach.

**Two families of CRDTs:**

| Type | Name | How It Works |
|------|------|--------------|
| **CvRDT** | Convergent (State-based) | Merge full state snapshots; merge function must be commutative, associative, and idempotent |
| **CmRDT** | Commutative (Operation-based) | Ship operations (inserts, deletes); operations must be commutative |

**Common CRDT data structures:**

| CRDT | Type | Use Case |
|------|------|----------|
| G-Counter | Counter | Grow-only counter (e.g., message count) |
| PN-Counter | Counter | Increment and decrement |
| G-Set | Set | Grow-only set (add-only, no remove) |
| OR-Set | Set | Observed-Remove set (add + remove) |
| LWW-Register | Register | Last-Writer-Wins single value |
| LWW-Map | Map | LWW per key |
| RGA | Sequence | Replicated Growable Array (text editing) |

### 3.2 cr-sqlite Architecture

[cr-sqlite](https://github.com/vlcn-io/cr-sqlite) by vlcn.io is a loadable SQLite extension that adds CRDT support to existing tables.

**How it works internally:**

1. **CRR Declaration:** You call `SELECT crsql_as_crr('table_name')` to mark a table as a Conflict-free Replicated Relation. This:
   - Creates shadow tables (`table_name__crsql_clock`) that track per-column version metadata
   - Installs triggers on INSERT/UPDATE/DELETE to capture changes
   - Does NOT alter your existing schema

2. **Shadow Table Structure:** For each CRR table, a clock table is created:
   ```sql
   -- Shadow table tracks version per column per row
   CREATE TABLE table_name__crsql_clock (
       key TEXT,          -- Primary key of the row
       col_name TEXT,     -- Column that changed
       col_version INT,   -- Lamport timestamp for this column
       db_version INT,    -- Global DB version when change was made
       site_id BLOB,      -- UUID of the machine that made the change
       seq INT            -- Sequence within a transaction
   );
   ```

3. **Change Extraction:** To get changes since a version:
   ```sql
   SELECT * FROM crsql_changes WHERE db_version > ?
   ```
   Returns a table of `(table, pk, cid, val, col_version, db_version, site_id, cl, seq)`.

4. **Change Application:** To merge remote changes:
   ```sql
   INSERT INTO crsql_changes (table, pk, cid, val, col_version, db_version, site_id, cl, seq)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
   ```

### 3.3 Hybrid Logical Clocks (HLC)

cr-sqlite uses a Lamport timestamp scheme (a simplified Hybrid Logical Clock) to establish causal ordering without synchronized real-time clocks.

**How it works:**

1. Each database maintains a monotonically increasing counter (`db_version`)
2. Every write increments `db_version` by 1
3. Every column change records its `col_version` (Lamport timestamp)
4. When merging, the receiving site compares `col_version` values:
   - Higher version wins
   - On tie, `site_id` breaks the tie deterministically (lexicographic comparison)
5. After merging, the local `db_version` is set to `max(local_db_version, remote_db_version) + 1`

**Why not wall-clock time?**

Wall clocks drift, can be set backwards, and differ between machines. Lamport timestamps only require that:
- Each event on a single node has a higher timestamp than the previous event
- When a node receives a message, it updates its clock to be higher than both its own clock and the message timestamp

This guarantees causal ordering: if event A caused event B, then A's timestamp < B's timestamp.

**Practical implication for waifu-rt3d:**
If you chat on Mac, then move to Windows, the Windows machine will see all Mac changes as "older" and correctly apply them before any new Windows changes. No clock sync needed.

### 3.4 Merge Semantics

cr-sqlite implements **Last-Writer-Wins (LWW) per column** merge semantics.

**Example scenario:**

```
Machine A: UPDATE characters SET mood = 'happy' WHERE id = 1  (version 5)
Machine B: UPDATE characters SET mood = 'sad' WHERE id = 1    (version 7)

After merge: mood = 'sad' (version 7 wins)
```

**Column-level merge means:**
```
Machine A: UPDATE characters SET mood = 'happy', bond_level = 50 WHERE id = 1
Machine B: UPDATE characters SET mood = 'sad', intimacy = 3 WHERE id = 1

After merge:
  mood = 'sad' (B wins, higher version)
  bond_level = 50 (only A touched this column)
  intimacy = 3 (only B touched this column)
```

This is significantly better than row-level LWW (which would lose A's `bond_level` change entirely).

**Transaction semantics caveat:** Each column version is incremented independently. If you want all values set in a single transaction to "win together" as a unit, you need to set column versions to the current `db_version`. However, this isn't guaranteed to work across all merge scenarios because the peer being merged into could have a higher `db_version` overall but have some individual records with lower versions.

**Delete handling:**

Deletes are tombstoned — the row is marked as deleted with a version. If a delete conflicts with an update:
- If delete has higher version → row is deleted
- If update has higher version → row is restored with updated value

### 3.5 Relevance to waifu-rt3d Tables

| Table | Merge Strategy | Risk | Notes |
|-------|---------------|------|-------|
| `messages` | Append-only, UUID PK | **LOW** | Messages are never edited, only inserted. CRDT works perfectly. |
| `memories` | Append-only, UUID PK | **LOW** | Same as messages — insert-only. |
| `user_facts` | LWW by `updated_at` | **MEDIUM** | If both machines extract different facts about the same topic, last write wins. |
| `characters` | LWW per column | **LOW** | Rarely edited on two machines. |
| `character_relationships` | LWW per column | **MEDIUM** | Bond level, intimacy — if both machines advance these, one's progress could be lost. |
| `bond_stories` | Append-only, UUID PK | **LOW** | Story unlocks are inserts. |
| `sessions` | Append-only, UUID PK | **LOW** | Session records are inserts. |
| `prompt_templates` | LWW per column | **LOW** | User-edited templates — unlikely to edit on two machines simultaneously. |
| `settings` | LWW per column | **MEDIUM** | Theme, model selection — last save wins. |

### 3.6 Performance Impact

| Operation | Regular SQLite | cr-sqlite CRR | Overhead |
|-----------|---------------|----------------|----------|
| INSERT | 1x | ~2.5x | Shadow table writes + trigger execution |
| UPDATE | 1x | ~2x | Clock table update per column |
| SELECT | 1x | 1x | No overhead on reads |
| Storage | 1x | ~1.3-1.5x | Shadow table per CRR table |

For our 3.3 MB database, the storage overhead is negligible (~1 MB of shadow tables). The write overhead is acceptable given that our write frequency is "per chat message" (not thousands per second).

### 3.7 Limitations

1. **No built-in transport:** cr-sqlite provides the CRDT merge engine but NOT the network layer. You must build your own changeset exchange (file copy, HTTP API, WebSocket, etc.).

2. **Foreign key complications:** CRDTs don't naturally handle referential integrity. If Machine A creates a message referencing a session that Machine B deleted, the merge could create an orphaned foreign key.

3. **Auto-increment PKs:** Auto-increment primary keys will collide across machines. Must use UUIDs or composite keys (site_id + local_id).

4. **Schema migrations:** All machines must have identical schema. A migration on one machine without the others will break merging.

5. **Project maturity:** vlcn.io is a small team. The project is functional but not battle-tested at scale. Last significant commit activity was in 2024.

6. **Debugging complexity:** When merges produce unexpected results, debugging requires understanding the clock table state across all machines — not trivial.

### 3.8 Alternatives to cr-sqlite

**Corrosion (by Fly.io):**
- Built on cr-sqlite, adds gossip-based transport
- Designed for Fly.io's edge deployment
- Not suitable for desktop apps

**sqlite-sync (SQLite AI):**
- Newer CRDT-based sync extension from SQLite AI (2025)
- Cloud-oriented: syncs with SQLite Cloud, PostgreSQL, Supabase
- Not suitable for pure local-first use

**Synql:**
- Academic CRDT approach for replicated relational databases (2025 paper from INRIA)
- Research-stage, not production-ready

**RxDB with SQLite backend:**
- JavaScript-native reactive database with optional SQLite storage
- Has built-in WebRTC P2P replication
- Would require rewriting our Python backend's data layer

---

## 4. Litestream Deep Dive

### 4.1 Overview

[Litestream](https://litestream.io/) is a standalone streaming replication tool for SQLite databases. Created by Ben Johnson (author of BoltDB), it runs as a sidecar process alongside your application and continuously replicates WAL changes to one or more backends.

### 4.2 WAL Tailing Internals

Litestream's core innovation is its WAL-tailing mechanism:

1. **Read Transaction Lock:** Litestream opens a long-running read transaction against the SQLite database. This prevents SQLite's automatic checkpointing (which would fold WAL pages into the main DB and delete them). This is critical — it means WAL pages accumulate and Litestream can process them continuously.

2. **Shadow WAL:** Litestream creates a "shadow WAL" directory next to the database (e.g., `.litestream/wal/`). As new WAL pages appear, Litestream copies them to the shadow WAL. The shadow WAL is a sequential series of files:
   ```
   .litestream/wal/
   ├── 00000000.wal    # First WAL segment
   ├── 00000001.wal    # After first checkpoint
   ├── 00000002.wal    # After second checkpoint
   └── ...
   ```

3. **Checkpoint Control:** Litestream takes over checkpointing. When the WAL reaches a configurable threshold (default: every 1 second or 1 MB), Litestream:
   - Copies new WAL pages to the shadow WAL
   - Replicates the pages to the configured backend(s)
   - Performs a PASSIVE checkpoint to fold pages into the main DB
   - Starts a new shadow WAL segment

4. **Snapshot Creation:** Periodically (default: every 24 hours), Litestream creates a full snapshot of the database. This limits restore time since you only need to replay WAL segments since the last snapshot.

**Data flow:**
```
SQLite writes → WAL file → Litestream tails → Shadow WAL → Replicate to backend
                                                    ↓
                                            Periodic checkpoint → Main DB
```

### 4.3 Supported Backends

| Backend | Protocol | Local-First? | Notes |
|---------|----------|--------------|-------|
| **File system** | Local path | **Yes** | Replicate to mounted NAS, external drive |
| **S3** | HTTPS | No | AWS, MinIO (self-hosted), Backblaze B2 |
| **Azure Blob** | HTTPS | No | Azure Storage |
| **Google Cloud Storage** | HTTPS | No | GCS |
| **SFTP** | SSH | **Yes** | Replicate to another machine or NAS via SSH |
| **Litestream Cloud** | HTTPS | No | Managed service (deprecated) |

**For waifu-rt3d:** File system backend (replicate to NAS or external drive) or SFTP (replicate to another machine) are the relevant options.

### 4.4 Configuration

Litestream uses a YAML configuration file:

```yaml
# litestream.yml for waifu-rt3d
dbs:
  - path: /path/to/waifu-rt3d/backend/storage/app.db
    replicas:
      # Replicate to local NAS mount
      - type: file
        path: /Volumes/NAS/waifu-backup/litestream
        retention: 168h          # Keep 7 days of WAL segments
        retention-check-interval: 1h
        snapshot-interval: 24h   # Full snapshot daily
        sync-interval: 1s        # Replicate every second

      # Replicate to another machine via SFTP
      - type: sftp
        host: 192.168.1.101:22
        user: chris
        key-path: ~/.ssh/id_ed25519
        path: /home/chris/waifu-backup/litestream
        retention: 72h           # Keep 3 days
        snapshot-interval: 24h
```

### 4.5 Restore Process

Restoring from Litestream:

```bash
# Restore latest state
litestream restore -o /path/to/restored.db /path/to/original.db

# Restore to a specific point in time
litestream restore -o /path/to/restored.db \
  -timestamp "2026-03-29T10:30:00Z" \
  /path/to/original.db

# Restore from a specific replica
litestream restore -o /path/to/restored.db \
  -replica "nas" \
  /path/to/original.db
```

The restore process:
1. Finds the latest snapshot before the target timestamp
2. Applies WAL segments in order from snapshot to target time
3. Writes the result to the output path
4. Runs integrity check on the restored database

### 4.6 Retention Policy

| Parameter | Default | Description |
|-----------|---------|-------------|
| `retention` | `24h` | How long to keep WAL segments and snapshots |
| `retention-check-interval` | `1h` | How often to check for expired data |
| `snapshot-interval` | `24h` | How often to create full snapshots |
| `sync-interval` | `1s` | How often to replicate new WAL pages |

**Retention mechanics:** After a new snapshot is created, WAL segments older than the `retention` period that predate the oldest snapshot are deleted. This means you always have at least one complete snapshot + WAL segments covering the retention window.

**Recommended for waifu-rt3d:**
```yaml
retention: 168h          # 7 days — covers a week of "oops" scenarios
snapshot-interval: 12h   # Every 12 hours — faster restore, more storage
sync-interval: 5s        # Every 5 seconds — acceptable RPO for a companion app
```

### 4.7 Limitations

1. **One-way replication only.** Litestream streams from primary → replica. You cannot write on the replica and merge back. This is by design — it's a backup/replication tool, not a sync tool.

2. **Single writer.** Only one Litestream instance can replicate a given database. If you need failover, you must stop the primary Litestream and start a new one pointing to the restored copy.

3. **Windows support:** Litestream has Linux and macOS binaries. Windows support exists but is less mature and less tested. This is a concern for our 2x Windows setup.

4. **WAL mode required.** The database must be in WAL mode (`PRAGMA journal_mode=WAL`). Our app already uses WAL mode, so this is fine.

5. **Not a sync tool.** Litestream creates point-in-time backups. If you want the same DB on 3 machines, you'd need to restore on each machine — which overwrites any local changes.

### 4.8 Verdict for waifu-rt3d

Litestream is excellent for **backup** (one machine → NAS/external drive) but not suitable as our primary **sync** mechanism between machines. It could serve as Layer 3 (backup) alongside Syncthing (Layer 1, file sync) and app-level DB checkpoint (Layer 2, safe DB sync).

**Best fit:** Run Litestream on the primary machine to continuously back up `app.db` to a NAS. If disaster strikes, restore from any point in the last 7 days.

---

## 5. Encrypted Backup: restic Deep Dive

### 5.1 Overview

[restic](https://restic.net/) is a fast, secure, cross-platform backup program. Written in Go, it produces encrypted, deduplicated backups that can be stored on local disks, SFTP servers, or cloud storage.

### 5.2 Repository Format

A restic repository has this structure:

```
repo/
├── config          # Encrypted repo configuration (chunker polynomial, version)
├── keys/           # Encrypted master keys (one per password)
├── snapshots/      # Encrypted snapshot metadata (file tree, timestamp, hostname)
├── index/          # Encrypted pack file indexes (maps blob IDs to pack files)
├── data/           # Encrypted pack files containing actual data blobs
│   ├── 00/
│   ├── 01/
│   │   ├── 01ab3c...pack
│   │   └── 01de7f...pack
│   ├── ...
│   └── ff/
└── locks/          # Lock files to prevent concurrent operations
```

**Pack Files:** Data is stored in pack files, each containing multiple blobs (data chunks or tree metadata). Pack files are structured as:

```
┌─────────┬─────────┬─────────┬──────────────────────┐
│ Blob 1  │ Blob 2  │  ...    │  Encrypted Header    │
│ (data)  │ (data)  │         │ (blob types, sizes,  │
│         │         │         │  offsets, hashes)     │
└─────────┴─────────┴─────────┴──────────────────────┘
```

The header is placed at the END of the pack file, allowing blobs to be written as a continuous stream during backup without rewriting the file.

### 5.3 Encryption Architecture

**Key Derivation:**
1. User provides a password
2. restic uses scrypt (N=2^15, r=8, p=1) to derive 64 bytes from the password
3. First 32 bytes → AES-256 encryption key
4. Last 32 bytes → Poly1305-AES authentication key
5. These keys decrypt a "master key" stored in `keys/`
6. The master key encrypts all repository data

**Encryption per blob:**
```
IV (16 bytes) || AES-256-CTR(plaintext) || Poly1305-AES(MAC, 16 bytes)
```

- IV is generated from a cryptographically secure RNG
- AES-256-CTR provides confidentiality
- Poly1305-AES provides authentication (detect tampering)
- Every blob, index, snapshot, and key file is encrypted this way

**Multiple passwords:** You can add multiple passwords (each stored as a separately encrypted copy of the master key). Useful for shared access without sharing a single password.

**Security hardening in restic 0.18.0+:** Pack files now randomly assign chunks to prevent attackers from determining chunk sizes (which could leak information about file contents through fingerprinting).

### 5.4 Content-Defined Chunking (CDC)

restic uses Rabin fingerprint-based CDC to split files into variable-length chunks:

**How CDC works:**
1. A sliding window of 64 bytes moves through the file data
2. At each position, a Rabin fingerprint hash is computed
3. When the hash meets a boundary condition (low N bits are zero), a chunk boundary is placed
4. This produces chunks of variable length that are content-determined

**Chunk size parameters:**

| Parameter | Value |
|-----------|-------|
| Minimum chunk | 512 KiB |
| Maximum chunk | 8 MiB |
| Average chunk | ~1 MiB |
| Window size | 64 bytes |

**Why CDC matters:** Unlike fixed-size chunking, CDC is stable under insertions and deletions. If you insert 1 byte at the start of a file:
- Fixed-size chunking: EVERY chunk shifts by 1 byte → all chunks are different → full re-upload
- CDC: Only the chunk containing the insertion changes → 1 chunk re-uploaded

**Deduplication:** Each chunk is identified by its SHA-256 hash. If two files (or two versions of a file) share identical chunks, the chunk is stored only once. This gives restic both inter-file and inter-snapshot deduplication.

**Relevance for waifu-rt3d:**
- Our 1.2 GB `models/` directory: stored once in the first backup. Subsequent backups add zero new data (unchanged files = same chunks).
- The 3.3 MB `app.db` after checkpoint: most pages are unchanged between backups, so only modified pages produce new chunks.
- VRM avatars (175 MB): if a user imports a new model, only that model's chunks are added.

### 5.5 Supported Backends

| Backend | Protocol | Local-First? | Speed | Notes |
|---------|----------|--------------|-------|-------|
| **Local directory** | Filesystem | **Yes** | Fastest | External drive, NAS mount |
| **SFTP** | SSH | **Yes** | Good | Another machine via SSH |
| **REST server** | HTTP/HTTPS | **Yes** | Good | `restic rest-server` on NAS |
| **Amazon S3** | HTTPS | No | Variable | Also Backblaze B2, MinIO |
| **Azure Blob** | HTTPS | No | Variable | — |
| **Google Cloud Storage** | HTTPS | No | Variable | — |
| **rclone** | Various | Depends | Variable | Proxies to 40+ cloud providers |

**For waifu-rt3d:** Local directory (external drive) or SFTP (NAS) are the relevant options.

### 5.6 Prune & Retention

restic uses a flexible retention policy with `restic forget`:

```bash
restic forget \
  --keep-last 5 \       # Keep 5 most recent snapshots
  --keep-daily 7 \      # Keep 1 snapshot per day for 7 days
  --keep-weekly 4 \     # Keep 1 snapshot per week for 4 weeks
  --keep-monthly 6 \    # Keep 1 snapshot per month for 6 months
  --keep-yearly 2 \     # Keep 1 snapshot per year for 2 years
  --prune                # Actually remove unreferenced data
```

**How prune works:**
1. `forget` marks snapshots for deletion based on retention policy
2. `prune` rewrites pack files to remove unreferenced chunks
3. Prune is the expensive operation — reads and rewrites pack files

**Recommended retention for waifu-rt3d:**
```bash
restic forget \
  --keep-daily 7 \
  --keep-weekly 4 \
  --keep-monthly 3 \
  --prune
```

This keeps: 7 daily, 4 weekly, 3 monthly = ~14 snapshots covering 3 months.

### 5.7 Performance Benchmarks

**Backup speed (local SSD → external SSD):**

| Scenario | Time | Data Transferred |
|----------|------|-----------------|
| Initial backup, 1.6 GB | ~8 seconds | 1.6 GB |
| Incremental, DB only changed | <1 second | ~1 MB |
| Incremental, new VRM imported | ~2 seconds | ~50 MB |
| Full restore, 1.6 GB | ~6 seconds | 1.6 GB |
| Prune (14 snapshots) | ~10 seconds | Rewrites changed packs |

**Backup speed (local SSD → NAS via Gigabit):**

| Scenario | Time | Notes |
|----------|------|-------|
| Initial backup | ~20 seconds | Network-limited |
| Incremental | ~2 seconds | Minimal data |
| Full restore | ~18 seconds | Network-limited |

**Repository size after deduplication:**

| Snapshots | Raw Data | Repo Size | Dedup Ratio |
|-----------|----------|-----------|-------------|
| 1 | 1.6 GB | ~1.7 GB | 1.06x (encryption overhead) |
| 7 (daily, DB changes only) | 11.2 GB | ~1.72 GB | 6.5x |
| 30 (daily, some VRM imports) | 48 GB | ~2.0 GB | 24x |

The large static files (models, avatars) are deduplicated across all snapshots, keeping repository size remarkably small.

---

