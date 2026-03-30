> **This is Part 3 of 3.** See also: [Part 1](2026-03-29-privacy-sync-research-part-1.md), [Part 2](2026-03-29-privacy-sync-research-part-2.md)

## 13. What Other Privacy-First Apps Do

### 13.1 Obsidian

| Aspect | Approach |
|--------|----------|
| Data format | Plain Markdown files in a local "vault" folder |
| Official sync | [Obsidian Sync](https://obsidian.md/sync) — E2E encrypted, $4/month |
| Free alternatives | Syncthing, iCloud, Dropbox, Git |
| Conflict handling | Creates duplicate files; user resolves manually |
| Plugin ecosystem | Community plugins for Git sync, S3 backup, etc. |
| Mobile sync | Obsidian Sync or iCloud (iOS) / Syncthing (Android) |
| Why it works | Plain text files are inherently merge-friendly; no database |

**Key insight:** Obsidian deliberately chose plain files over a database, partly to make sync trivial. They could have used SQLite for better query performance, but the sync tradeoff wasn't worth it.

**Obsidian Sync internals:**
- End-to-end encrypted with user's password (server cannot read data)
- Syncs file-level diffs (not block-level like Syncthing)
- Conflict resolution: keeps both versions, user picks
- Version history: 12 months on paid plan
- $4/month per user

### 13.2 KeePass / KeePassXC

| Aspect | Approach |
|--------|----------|
| Data format | Single `.kdbx` encrypted database file |
| Sync | User's responsibility — Syncthing, Dropbox, or manual copy |
| Conflict handling | KeePassXC has a **"Merge Database"** feature for `.kdbx` files |
| Encryption | AES-256 or ChaCha20, Argon2 KDF |
| Why it works | Small file size (<1 MB), infrequent writes |

**Key insight:** KeePass's merge feature is purpose-built for the conflict scenario. The DB format supports merging because entries have UUIDs and modification timestamps. This is essentially a manual CRDT — exactly what cr-sqlite automates.

**KeePass merge algorithm:**
1. Compare entries by UUID
2. If both modified: keep the one with the newer modification timestamp
3. If only one modified: keep the modified version
4. If entry exists in one but not the other: add it
5. Deleted entries are tracked via a "deleted objects" list with timestamps

This is remarkably similar to cr-sqlite's LWW-per-column approach.

### 13.3 Logseq

| Aspect | Approach |
|--------|----------|
| Data format | Markdown / EDN files in a local folder |
| Sync | Git-based sync built in; also Syncthing, iCloud |
| Conflict handling | Git merge for text files |
| Commercial sync | Logseq Sync (in beta, E2E encrypted) |
| Why it works | Text files + Git = version history + merge |

**Key insight:** Logseq went even further than Obsidian by building Git integration directly into the app. This gives automatic version history and merge capabilities. However, Git is not user-friendly for non-developers.

### 13.4 Standard Notes

| Aspect | Approach |
|--------|----------|
| Data format | Encrypted JSON in a local database |
| Sync | Self-hosted sync server (optional) or their cloud |
| Conflict handling | Server-side merge with conflict detection |
| Encryption | E2E encryption on ALL plans including free |
| Self-host | [standardnotes/server](https://github.com/standardnotes/server) — Docker-based |
| Why it works | Small data, infrequent writes, server handles conflicts |

**Key insight:** Standard Notes encrypts EVERYTHING client-side before sync. The server stores opaque encrypted blobs. This is the gold standard for privacy. However, it requires a server (self-hosted or cloud).

### 13.5 Joplin

| Aspect | Approach |
|--------|----------|
| Data format | Markdown notes stored locally |
| Sync | Dropbox, WebDAV, Nextcloud, OneDrive, Joplin Cloud, or local filesystem |
| Conflict handling | Detects conflicts, creates conflict notebooks |
| Encryption | Optional E2E encryption for sync targets |
| Self-host | Joplin Server (Docker) for team sync |
| Why it works | Multiple sync backends, user choice |

**Key insight:** Joplin provides the most sync backend options of any privacy-first app. The architecture is "sync to any dumb storage" (WebDAV, Dropbox, etc.) with encryption handled client-side.

### 13.6 Anytype

| Aspect | Approach |
|--------|----------|
| Data format | IPFS-based content-addressable storage |
| Sync | **Peer-to-peer** (no server required) |
| Conflict handling | CRDT-based automatic merge |
| Encryption | E2E encrypted |
| Why it works | True P2P sync via libp2p; CRDTs handle conflicts |

**Key insight:** Anytype is the closest to what waifu-rt3d could aspire to — true P2P sync with CRDT conflict resolution and E2E encryption. However, it uses a completely custom data layer, not SQLite.

### 13.7 Lessons for waifu-rt3d

| Lesson | From | Applicable? |
|--------|------|-------------|
| Use plain text files for sync-friendly data | Obsidian, Logseq | Partially — character docs are already markdown |
| UUID + timestamp merge | KeePass | **Yes** — our tables already have UUIDs and timestamps |
| E2E encrypt before sync | Standard Notes | Future — encrypt DB before Syncthing sync |
| Provide multiple sync backends | Joplin | Future — let users choose Syncthing, NAS, USB |
| Build merge into the app | KeePass | **Yes** — our Phase 2 JSON export/import approach |
| P2P sync with CRDTs | Anytype | Future — cr-sqlite could enable this |

---

## 14. Network Topologies

### 14.1 Full Mesh (Recommended)

```
┌──────────┐
│  Mac M2  │
│  Pro     │◄────────────────────────┐
└──┬───────┘                         │
   │                                 │
   │  Syncthing                      │  Syncthing
   │  (bidirectional)                │  (bidirectional)
   │                                 │
┌──▼───────┐     Syncthing      ┌────▼─────┐
│ Win 5080 │◄──────────────────►│ Win 3070 │
└──────────┘   (bidirectional)  └──────────┘
```

- Every machine connects directly to every other machine
- 3 connections total (N*(N-1)/2 where N=3)
- Any machine can sync with any other
- No single point of failure
- If one machine is offline, the other two still sync

### 14.2 Star (Hub-and-Spoke)

```
                ┌──────────┐
                │   NAS    │
                │ (hub)    │
                └──┬───┬───┘
                   │   │
          ┌────────┘   └────────┐
          │                     │
     ┌────▼─────┐         ┌────▼─────┐
     │  Mac M2  │         │ Win 5080 │
     │  Pro     │         │          │
     └──────────┘         └──────────┘
          │
     ┌────▼─────┐
     │ Win 3070 │
     └──────────┘
```

- All machines sync through the NAS
- NAS is always on — acts as central relay
- Machines don't need to be online simultaneously
- Single point of failure: if NAS goes down, no sync between machines

### 14.3 Hybrid (Recommended with NAS)

```
┌──────────┐         ┌──────────┐
│  Mac M2  │◄───────►│ Win 5080 │
│  Pro     │         │          │
└──┬───┬───┘         └──┬───┬───┘
   │   │                │   │
   │   └────────┬───────┘   │
   │            │            │
   │       ┌────▼─────┐     │
   │       │ Win 3070 │     │
   │       └──────────┘     │
   │                        │
   │    ┌──────────┐        │
   └───►│   NAS    │◄───────┘
        │ (backup) │
        └──────────┘
```

- Full mesh between machines (direct P2P sync)
- NAS as additional backup target (restic + optional Syncthing peer)
- Best reliability: NAS loss doesn't affect machine-to-machine sync
- NAS provides always-on peer for asynchronous handoffs

### 14.4 Recommendation

**Without NAS:** Full mesh (topology 14.1). Simple, no infrastructure, works with just Syncthing.

**With NAS:** Hybrid (topology 14.3). Full mesh between machines + NAS for backup and always-on peer.

---

## 15. Monitoring & Alerting

### 15.1 What to Monitor

| Metric | Source | Alert Threshold |
|--------|--------|----------------|
| Sync completion % | Syncthing REST API | < 100% for > 5 minutes |
| Connected devices | Syncthing REST API | < 2 (out of 3) for > 1 hour |
| Last sync time | Syncthing REST API | > 24 hours ago |
| DB integrity | `PRAGMA integrity_check` | Anything other than "ok" |
| Backup age | restic snapshot list | Latest snapshot > 48 hours old |
| Disk space | OS | < 10 GB free |
| Sync errors | Syncthing event API | Any `FolderErrors` event |
| Conflict files | File system | Any `.sync-conflict-*` files exist |

### 15.2 Monitoring Implementation

**Lightweight approach — Python script run by cron/Task Scheduler:**

```python
import json
import os
import subprocess
import sqlite3
from datetime import datetime, timedelta
from pathlib import Path

import requests

SYNCTHING_API = "http://127.0.0.1:8384"
API_KEY = "your-api-key"
DB_PATH = "/path/to/waifu-rt3d/backend/storage/app.db"
STORAGE_DIR = "/path/to/waifu-rt3d/backend/storage/"
HEADERS = {"X-API-Key": API_KEY}

def check_sync_status() -> list[str]:
    """
    Check Syncthing sync status and return list of warnings.

    Returns:
        List of warning strings, empty if all OK.
    """
    warnings = []
    try:
        resp = requests.get(f"{SYNCTHING_API}/rest/system/connections", headers=HEADERS)
        connections = resp.json()["connections"]
        connected = sum(1 for c in connections.values() if c["connected"])
        if connected < 2:
            warnings.append(f"Only {connected}/2 peers connected")

        resp = requests.get(f"{SYNCTHING_API}/rest/db/status",
                          params={"folder": "waifu-storage"}, headers=HEADERS)
        status = resp.json()
        if status["needFiles"] > 0:
            warnings.append(f"{status['needFiles']} files need syncing")
    except requests.ConnectionError:
        warnings.append("Syncthing is not running")
    return warnings

def check_db_integrity() -> list[str]:
    """Check SQLite database integrity."""
    warnings = []
    try:
        conn = sqlite3.connect(DB_PATH)
        result = conn.execute("PRAGMA integrity_check").fetchone()[0]
        if result != "ok":
            warnings.append(f"DB integrity check failed: {result}")
        conn.close()
    except Exception as e:
        warnings.append(f"DB check error: {e}")
    return warnings

def check_conflicts() -> list[str]:
    """Check for Syncthing conflict files."""
    warnings = []
    for f in Path(STORAGE_DIR).rglob("*.sync-conflict-*"):
        warnings.append(f"Sync conflict file: {f.name}")
    return warnings
```

### 15.3 Alerting Options

For a desktop-only, local-first app, alerting should be in-app:

1. **Status bar indicator:** Green/yellow/red dot in the app's UI showing sync status
2. **Startup warnings:** Check for issues on app launch, display modal if problems found
3. **System notifications:** Use OS notifications (macOS Notification Center, Windows Toast) for critical alerts
4. **Log file:** Write monitoring results to `backend/storage/sync_monitor.log`

---

## 16. Migration Strategy

### 16.1 Current State

Currently, waifu-rt3d has no sync or backup infrastructure. All data lives on a single machine.

### 16.2 Migration Phases

**Phase 0: Preparation (30 minutes)**
1. Verify DB uses WAL mode: `PRAGMA journal_mode;` → should return `wal`
2. Audit DB for absolute paths: `SELECT * FROM avatars WHERE path LIKE '/%' OR path LIKE 'C:%';`
3. Fix any absolute paths to relative paths
4. Create initial restic backup of current state as a safety net

**Phase 1: Syncthing + DB Checkpoint (4 hours)**
1. Install Syncthing on all 3 machines
2. Configure shared folder with `.stignore`
3. Add WAL checkpoint to app shutdown handler
4. Add integrity check to app startup
5. Add "recently modified" warning to frontend
6. Test: modify data on Mac → verify it appears on Windows

**Phase 2: Encrypted Backup with restic (2 hours)**
1. Install restic on all 3 machines
2. Initialize repo on external drive or NAS
3. Create backup script that checkpoints DB first
4. Schedule nightly backups (cron on Mac, Task Scheduler on Windows)
5. Test: delete a file → restore from backup

**Phase 3: Monitoring (4 hours)**
1. Implement sync status check in app startup
2. Add conflict file detection
3. Add backup age warning
4. Status indicator in app UI

**Phase 4: JSON Export/Import — Optional (16 hours)**
1. Implement `/api/sync/export` endpoint
2. Implement `/api/sync/import` endpoint with merge logic
3. Per-table merge strategies (see section 22)
4. Test merge scenarios extensively

**Phase 5: NAS Integration — Optional (4 hours)**
1. Set up Syncthing on NAS
2. Configure NAS as always-on peer
3. Configure restic SFTP backend to NAS
4. Optional: Set up Litestream → NAS

### 16.3 Rollback Plan

Each phase is independent and reversible:

| Phase | Rollback |
|-------|----------|
| Phase 1 | Uninstall Syncthing, remove `.stignore`, revert code changes |
| Phase 2 | Uninstall restic, delete backup repo |
| Phase 3 | Revert monitoring code |
| Phase 4 | Remove export/import endpoints |
| Phase 5 | Remove NAS from Syncthing, stop NAS services |

---

## 17. Security Threat Model

### 17.1 Assets to Protect

| Asset | Sensitivity | Description |
|-------|-------------|-------------|
| Chat messages | **HIGH** | Personal, intimate conversations with AI characters |
| User facts/memories | **HIGH** | Extracted personal information about the user |
| Character relationships | **MEDIUM** | Bond levels, intimacy states |
| Avatar models | **LOW** | VRM/Live2D files (often from public sources) |
| App config | **LOW** | Settings, preferences |
| TTS model weights | **LOW** | Public ML models |

### 17.2 Threat Actors

| Actor | Motivation | Capability |
|-------|-----------|------------|
| Household member | Curiosity | Physical access to machine |
| Thief | Financial | Stolen device, physical access |
| Network attacker | Surveillance | LAN packet sniffing |
| Malware | Data theft | Software on the machine |
| ISP / Network operator | Surveillance | Traffic analysis |

### 17.3 Attack Vectors & Mitigations

**1. Physical Access to Machine**

| Threat | Impact | Mitigation |
|--------|--------|------------|
| Read `app.db` directly | Chat history exposed | Full-disk encryption (FileVault / BitLocker) |
| Copy `app.db` to USB | Data exfiltration | Full-disk encryption + screen lock |
| Read Syncthing data on NAS | Backup data exposed | Syncthing Receive Encrypted mode or restic encryption |

**2. Network Attacks**

| Threat | Impact | Mitigation |
|--------|--------|------------|
| Sniff Syncthing traffic | Data exposure | TLS 1.3 encryption (built-in, always on) |
| MITM Syncthing connection | Data manipulation | Mutual TLS certificate authentication (device IDs) |
| Sniff restic backup traffic | Backup exposure | AES-256 encryption (built-in, always on) |
| Attack Syncthing REST API | Config manipulation | API bound to 127.0.0.1 (default), API key required |

**3. Software Attacks**

| Threat | Impact | Mitigation |
|--------|--------|------------|
| Malware reads `app.db` | Full data exposure | Application-level DB encryption (future) |
| Ransomware encrypts files | Data loss | restic backups (encrypted, versioned, separate storage) |
| Compromised Syncthing | All synced data | Pin to known-good version, verify checksums |

### 17.4 Encryption Coverage

| State | Current | Recommended |
|-------|---------|-------------|
| Data at rest (live DB) | **Unencrypted** | Full-disk encryption (OS-level) |
| Data at rest (backup) | N/A | **restic AES-256** |
| Data in transit (sync) | N/A | **Syncthing TLS 1.3** |
| Data at rest (NAS) | **Unencrypted** | Syncthing Receive Encrypted or restic |

### 17.5 Future: Application-Level Encryption

For maximum privacy, the app could encrypt the SQLite database itself:

1. **SQLCipher:** Drop-in replacement for SQLite with AES-256 encryption. The entire DB file is encrypted at rest. Requires user to provide a passphrase on app startup.

2. **Encrypted JSON export:** Encrypt the JSON export files (Phase 2) with a user-provided key before syncing.

3. **Selective encryption:** Encrypt only the `messages` and `user_facts` tables (the most sensitive data) while leaving metadata tables unencrypted for performance.

**Trade-offs:**
- SQLCipher adds ~5-15% performance overhead
- User must remember a passphrase (or we derive one from their OS keychain)
- Prevents casual database browsing with `sqlite3` CLI (debugging harder)

---

## 18. Cost Analysis

### 18.1 Software Costs

| Component | Cost | License |
|-----------|------|---------|
| Syncthing | **$0** | MPL-2.0 (open source) |
| restic | **$0** | BSD-2-Clause (open source) |
| Litestream | **$0** | Apache-2.0 (open source) |
| cr-sqlite | **$0** | MIT (open source) |
| NPBackup (restic GUI) | **$0** | Open source |
| Kopia (alternative to restic) | **$0** | Apache-2.0 |
| **Total software** | **$0** | — |

### 18.2 Hardware Costs

| Component | Cost | Required? |
|-----------|------|-----------|
| External USB SSD (1 TB) | $60-100 | Recommended for off-site backup |
| NAS (Synology DS224+) | $300 + drives | Optional but recommended |
| NAS drives (2x 4TB) | $120-200 | — |
| **Total hardware (minimal)** | **$60** | USB SSD only |
| **Total hardware (recommended)** | **$480-600** | NAS + USB SSD |

### 18.3 Ongoing Costs

| Item | Monthly Cost |
|------|-------------|
| Electricity (NAS, 24/7) | ~$3-5 |
| Internet (already have) | $0 incremental |
| Software updates | $0 (manual) |
| Cloud storage | **$0** (local-only!) |
| **Total monthly** | **$3-5** (with NAS) or **$0** (without) |

### 18.4 Comparison to Cloud Alternatives

| Solution | Monthly Cost (3 machines) | Privacy |
|----------|--------------------------|---------|
| **Our approach (Syncthing + restic)** | **$0-5** | **Full local control** |
| Obsidian Sync | $4/month | E2E encrypted, Obsidian servers |
| Dropbox (2 TB) | $12/month | Cloud-stored, readable by Dropbox |
| iCloud (2 TB) | $10/month | Apple servers, law enforcement access |
| Google Drive (2 TB) | $10/month | Google servers, scanned for ads |
| Backblaze B2 (restic backend) | $0.005/GB/month | Cloud-stored, encrypted by restic |

Our approach is both the cheapest AND the most private.

### 18.5 Engineering Cost

| Phase | Hours | Cost at $0 (self-dev) | Cost at $150/hr (contractor) |
|-------|-------|----------------------|------------------------------|
| Phase 1: Syncthing + Checkpoint | 4h | $0 | $600 |
| Phase 2: restic Backup | 2h | $0 | $300 |
| Phase 3: Monitoring | 4h | $0 | $600 |
| Phase 4: JSON Export/Import | 16h | $0 | $2,400 |
| Phase 5: NAS Integration | 4h | $0 | $600 |
| **Total** | **30h** | **$0** | **$4,500** |

---

## 19. Future: WebRTC P2P Sync

### 19.1 Overview

WebRTC (Web Real-Time Communication) enables peer-to-peer data channels between browsers and applications. While primarily designed for audio/video, the `RTCDataChannel` API allows arbitrary binary data exchange.

### 19.2 How WebRTC P2P Sync Would Work

```
┌──────────────────┐        ┌──────────────────┐
│   Machine A      │        │   Machine B      │
│                  │        │                  │
│  waifu-rt3d      │        │  waifu-rt3d      │
│  ┌────────────┐  │        │  ┌────────────┐  │
│  │  SQLite DB │  │  WebRTC│  │  SQLite DB │  │
│  │  + cr-sqlite│◄─┼────────┼─►│  + cr-sqlite│  │
│  └────────────┘  │  Data  │  └────────────┘  │
│                  │ Channel│                  │
└──────────────────┘        └──────────────────┘
         ▲                           ▲
         │    ┌──────────────────┐   │
         └────┤  Signaling Server├───┘
              │  (discovery only)│
              └──────────────────┘
```

1. **Signaling:** Machines discover each other via a simple signaling mechanism (could be mDNS on LAN, or a lightweight WebSocket server)
2. **Connection:** WebRTC establishes a direct P2P connection with NAT traversal (ICE/STUN/TURN)
3. **Data Channel:** CRDT changesets from cr-sqlite are exchanged over the data channel
4. **Merge:** Each machine applies received changesets to its local database

### 19.3 RxDB as Inspiration

[RxDB](https://rxdb.info/) already implements WebRTC P2P replication for JavaScript databases:
- Uses `simple-peer` library for WebRTC connections
- Signaling via a lightweight server (or custom signaling)
- Replication protocol handles push/pull of document changes
- Fully decentralized — no server stores data

### 19.4 Advantages Over Syncthing

| Advantage | Details |
|-----------|---------|
| Real-time sync | Changes propagate instantly (milliseconds, not seconds) |
| Database-aware | Syncs changesets, not files — no WAL corruption risk |
| Multi-writer safe | cr-sqlite CRDTs handle concurrent writes |
| No file system dependency | Works even if OS file locking interferes |
| Firewall-friendly | WebRTC punches through NATs (with STUN) |

### 19.5 Disadvantages

| Disadvantage | Details |
|-------------|---------|
| Requires both machines online | No async sync (unlike Syncthing with NAS) |
| Signaling infrastructure | Need at least mDNS or a simple server |
| Engineering complexity | ~60-80 hours to build |
| cr-sqlite maturity | CRDT extension is still beta |
| Only syncs DB | Still need Syncthing for binary assets |

### 19.6 Feasibility Assessment

WebRTC P2P sync with cr-sqlite is technically feasible but represents a significant engineering investment. It solves the "sync DB safely" problem elegantly but doesn't replace Syncthing for binary assets.

**When to consider this:**
- If the user wants real-time multi-machine collaboration (not current requirement)
- If cr-sqlite matures significantly
- If Syncthing's file-level sync proves too fragile for the database

**Recommendation:** File this under "future architecture" and revisit when cr-sqlite reaches 1.0.

---

## 20. Resilio Sync

### 20.1 Overview

[Resilio Sync](https://www.resilio.com/) (formerly BitTorrent Sync) is a proprietary peer-to-peer sync tool built on BitTorrent protocol. Closed-source but well-tested.

### 20.2 Comparison to Syncthing

| Feature | Syncthing | Resilio Sync |
|---------|-----------|--------------|
| License | Open source (MPL-2.0) | Proprietary |
| Cost | Free | Free (limited) / $7+ Pro / Business per-user |
| Large file speed | Good | **2.8x faster** (BitTorrent chunking) |
| Protocol | TLS + block exchange | BitTorrent protocol |
| Conflict resolution | `.sync-conflict` copies | `.conflict` copies (same approach) |
| SQLite safety | Same risks as Syncthing | Same risks as Syncthing |
| Mobile support | Android only | iOS + Android |
| Selective sync | Yes | Pro only |
| Trust model | You audit the code | Trust the company |
| REST API | Comprehensive | Limited |

### 20.3 Verdict for This Project

Resilio is faster for large files (the 1.2 GB models directory) but shares all the same SQLite corruption risks. The speed advantage matters for initial sync but not for ongoing use where only small deltas change. The closed-source nature conflicts with the project's privacy-first philosophy.

**Bottom line:** No meaningful advantage over Syncthing for this use case. Syncthing is preferred due to open source and zero cost.

---

## 21. Git-Based Sync

### 21.1 Could character data, memories, and settings be versioned in git?

**What could work in git:**
- Character bible markdown files (`docs/characters/`)
- App config (`backend/config/app.json`)
- Prompt templates (text files)

**What would NOT work in git:**
- SQLite database (binary, changes every message — git would store full copies)
- VRM models (175 MB binary files — needs Git LFS)
- Live2D models (204 MB — needs Git LFS)
- TTS model weights (60 MB+ — needs Git LFS)

### 21.2 Git LFS Assessment

Git LFS replaces large files with text pointers in the repo, storing actual content on a remote server.

| Aspect | Assessment |
|--------|------------|
| VRM/Live2D sync | Works but requires a Git LFS server (GitHub, GitLab, or self-hosted) |
| Self-hosted option | `git-lfs-server` or Gitea — adds infrastructure complexity |
| Cloud dependency | GitHub/GitLab LFS = cloud. Self-hosted Gitea on LAN = no cloud. |
| For non-developers | `git add / commit / push / pull` is NOT user-friendly |
| SQLite in git | Terrible idea — binary diffs, no merge, bloats history |

### 21.3 Hybrid Approach: Export DB to SQL/JSON for Git

Instead of syncing the raw `.db` file, the app could:
1. Export critical tables to JSON/SQL dump files
2. Commit those to a local git repo
3. Sync the git repo between machines
4. Import on the other side

**Pros:** Full version history, merge-friendly (JSON), works offline
**Cons:** Significant engineering effort, not real-time, data format conversion bugs

### 21.4 Verdict for This Project

Git is good for character docs and config files. Terrible for the database and large assets without significant infrastructure. The hybrid export approach is interesting but adds substantial complexity.

**Bottom line:** Not recommended as the primary sync mechanism. Could supplement another approach for version-controlling character files.

---

## 22. Recommended Architecture

### 22.1 The Problem, Simply Stated

We need to sync:
- A 3.3 MB SQLite database (40 tables, written frequently)
- ~1.5 GB of binary assets (written rarely)
- ~5 MB of text config/character files (written occasionally)

Between 3 machines (1 Mac, 2 Windows), with no cloud, and no data loss.

### 22.2 Recommended Approach: Layered Strategy

```
┌─────────────────────────────────────────────────────────┐
│                    LAYER 1: Syncthing                    │
│         Sync everything EXCEPT the SQLite DB             │
│    (avatars, live2d, models, images, config, docs)       │
│                                                         │
│  • Peer-to-peer, encrypted, cross-platform              │
│  • Block-level delta sync for large VRM files            │
│  • .stignore: *.db, *.db-wal, *.db-shm                 │
└─────────────────────────────────────────────────────────┘
                          +
┌─────────────────────────────────────────────────────────┐
│               LAYER 2: App-Level DB Sync                │
│       Export/import SQLite data as portable format       │
│                                                         │
│  Option A: SQLite Backup API (.backup command)           │
│    - App shuts down cleanly → checkpoint WAL → copy .db  │
│    - Syncthing syncs the checkpointed .db file           │
│    - Other machine imports on startup if newer           │
│                                                         │
│  Option B: JSON export/import (future, more robust)      │
│    - Export critical tables to timestamped JSON           │
│    - Syncthing syncs the JSON files                      │
│    - Importing machine merges by timestamp               │
│    - Append-only tables (messages, memories) merge well  │
└─────────────────────────────────────────────────────────┘
                          +
┌─────────────────────────────────────────────────────────┐
│               LAYER 3: Encrypted Backup                  │
│          restic → external drive / NAS                   │
│                                                         │
│  • Nightly scheduled backup of entire storage/           │
│  • Encrypted at rest (AES-256)                          │
│  • Deduplicated (1.6 GB → much less after first backup) │
│  • Version history: roll back to any point in time       │
│  • Cross-platform: same repo from Mac and Windows        │
└─────────────────────────────────────────────────────────┘
```

### 22.3 Implementation Plan

#### Phase 1: Safe DB Sync via Checkpoint (Minimal Engineering)

**The simplest approach that works today:**

1. **On app shutdown:** Run `PRAGMA wal_checkpoint(TRUNCATE)` to fold all WAL data into the main `.db` file, then delete `-wal` and `-shm` files.
2. **Syncthing config:** Sync the entire `backend/storage/` directory with `.stignore` rules (section 2.5).
3. **On app startup:** Check if the `.db` file was modified externally (compare mtime or a version counter stored in the DB). If so, run `PRAGMA integrity_check` before proceeding.
4. **Safety rule:** Never run the app on two machines simultaneously. Display a warning if the DB was modified less than 60 seconds ago.

**Engineering effort:** ~4 hours
- Add WAL checkpoint to shutdown handler in `backend/server.py`
- Add integrity check to startup in `backend/preflight.py`
- Add "recently modified" warning to frontend
- Write `.stignore` file
- Document Syncthing setup for user

#### Phase 2: JSON Export/Import (Better Merge Support)

For users who accidentally edit on two machines:

1. **Export command:** `POST /api/sync/export` dumps critical tables to `backend/storage/sync/export-{machine-id}-{timestamp}.json`
2. **Import command:** `POST /api/sync/import` reads all export files, merges by UUID + timestamp
3. **Merge rules per table:**

| Table | Merge Strategy |
|-------|---------------|
| `messages` | Append-only, deduplicate by UUID |
| `memories` | Append-only, deduplicate by UUID |
| `user_facts` | Last-write-wins by `updated_at` |
| `characters` | Last-write-wins by `updated_at` |
| `character_relationships` | Last-write-wins by `updated_at` |
| `sessions` | Append-only, deduplicate by UUID |
| `bond_stories` | Append-only, deduplicate by UUID |
| `prompt_templates` | Last-write-wins by `updated_at` |

**Engineering effort:** ~16 hours

#### Phase 3: Encrypted Backup with restic (Disaster Recovery)

1. Install restic on all 3 machines
2. Initialize a shared repo on an external drive or NAS:
   ```bash
   restic init --repo /Volumes/BackupDrive/waifu-backup
   ```
3. Schedule nightly backups:
   ```bash
   restic backup --repo /Volumes/BackupDrive/waifu-backup \
     /path/to/waifu-rt3d/backend/storage/
   ```
4. Retention policy: keep 7 daily, 4 weekly, 3 monthly snapshots
5. Wrap in a script that first checkpoints the DB, then runs restic

**Engineering effort:** ~2 hours (scripting + docs)

#### Optional Phase 4: cr-sqlite Integration (True Multi-Writer)

If the user truly wants simultaneous editing on multiple machines:

1. Add cr-sqlite as a loadable extension
2. Mark tables as CRR (conflict-free replicated relations)
3. Build a changeset exchange mechanism (export changesets → Syncthing → import)
4. Test extensively — CRDT merge semantics need careful validation

**Engineering effort:** ~40 hours (high complexity, high risk)
**Recommendation:** Skip unless simultaneous editing becomes a real need.

---

## 23. Decision Matrix

| Approach | Sync Safety | Engineering Cost | Complexity | Multi-Writer | Recommended? |
|----------|-------------|------------------|------------|-------------|-------------|
| Syncthing + DB checkpoint | High (if app closed) | 4h | Low | No | **YES — Phase 1** |
| JSON export/import | High | 16h | Medium | Partial | YES — Phase 2 |
| restic backup | N/A (backup only) | 2h | Low | N/A | **YES — Phase 3** |
| cr-sqlite CRDT | Medium (complex) | 40h | High | Yes | No (unless needed) |
| Resilio Sync | Same as Syncthing | 4h | Low | No | No (closed source) |
| Git + LFS | Medium | 20h | High | No | No (too complex) |
| Litestream | High (one-way) | 4h | Low | No | Maybe (backup alt) |
| WebRTC + cr-sqlite | High (if mature) | 80h | Very High | Yes | Future |
| rqlite | High | 16h | High | Yes (Raft) | No (overkill) |

---

## 24. Final Recommendation

```
┌──────────────────────────────────────────────────────────┐
│                                                          │
│   1. Syncthing for file sync (free, open, cross-plat)    │
│   2. WAL checkpoint on app close (safe DB sync)          │
│   3. restic for encrypted backup (disaster recovery)     │
│                                                          │
│   Total engineering: ~6 hours for Phase 1 + 3            │
│   Total cost: $0                                         │
│   Cloud dependency: None                                 │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

This gives you:
- **Real-time sync** of all assets and files between machines via Syncthing
- **Safe database sync** by checkpointing WAL on shutdown
- **Encrypted, deduplicated backups** to external drive or NAS via restic
- **Zero cloud dependency** — everything stays on your local network
- **Cross-platform** — works identically on Mac and Windows

The one rule users must follow: **close the app on machine A before opening it on machine B.** This is the same rule KeePass users follow, and it works reliably in practice.

---

## 25. Sources

### Syncthing
- [Syncthing 2.0 — SQLite migration](https://www.neowin.net/news/syncthing-20-released-with-major-changes-switching-from-leveldb-to-sqlite/)
- [Block Exchange Protocol v1 specification](https://docs.syncthing.net/specs/bep-v1.html)
- [Syncthing: The P2P file sync tool written in Go](https://www.bytesizego.com/blog/syncthing-the-p2p-file-sync-tool-written-in-go)
- [Ignoring Files (.stignore) documentation](https://docs.syncthing.net/users/ignoring.html)
- [.stignore examples](https://developerinsider.co/syncthing-stignore-examples-ignore-files-by-extension-folder-pattern-type/)
- [Useful .stignore patterns — Syncthing Forum](https://forum.syncthing.net/t/useful-stignore-patterns/1175)
- [Syncthing REST API documentation](https://docs.syncthing.net/dev/rest.html)
- [Config Endpoints](https://docs.syncthing.net/rest/config.html)
- [Event API documentation](https://docs.syncthing.net/dev/events.html)
- [Folder Types documentation](https://docs.syncthing.net/users/foldertypes.html)
- [File Versioning documentation](https://docs.syncthing.net/users/versioning.html)
- [GET /rest/folder/versions](https://docs.syncthing.net/rest/folder-versions-get.html)
- [Getting Started guide](https://docs.syncthing.net/intro/getting-started.html)
- [Starting Syncthing Automatically](https://docs.syncthing.net/users/autostart.html)
- [Syncthing Configuration](https://docs.syncthing.net/users/config.html)
- [HOWTO: Use Syncthing to sync between devices](https://skyrim.annathepiper.org/2025/05/21/howto-use-syncthing-to-sync-between-devices/)
- [Syncthing SQLite conflict issue](https://forum.syncthing.net/t/sync-conflict-with-1-specific-sqlite-file-constantly/20836)
- [Syncthing fcntl lock request for SQLite](https://github.com/syncthing/syncthing/issues/4242)
- [Syncthing version compatibility (1.30 vs 2.0) forum](https://forum.syncthing.net/t/1-30-or-2-0-3-1-for-new-mac-syncing-with-win-machines/25962)
- [Syncthing stignore patterns — Codeberg](https://codeberg.org/iNeedADoctor/Syncthing-Ignore-Patterns)
- [Local-first apps with Syncthing](https://www.howtogeek.com/free-open-source-tool-solves-the-main-problem-with-local-first-apps/)

### SQLite & WAL
- [SQLite WAL documentation](https://www.sqlite.org/wal.html)
- [SQLite WAL checkpoint API](https://www.sqlite.org/c3ref/wal_checkpoint_v2.html)
- [Checkpoint Mode Values](https://sqlite.org/c3ref/c_checkpoint_full.html)
- [SQLite — How to Corrupt a Database](https://sqlite.org/howtocorrupt.html)
- [SQLite Backup API](https://sqlite.org/backup.html)
- [How to VACUUM SQLite in WAL Mode — PhotoStructure](https://photostructure.com/coding/how-to-vacuum-sqlite/)
- [How to Set Up SQLite with WAL Mode on Ubuntu](https://oneuptime.com/blog/post/2026-03-02-how-to-set-up-sqlite-with-wal-mode-on-ubuntu/view)
- [SQLite WAL checkpoint corruption forum](https://sqlite.org/forum/info/47107ab818977549?t=h)
- [SQLite backup strategies in production](https://oldmoe.blog/2024/04/30/backup-strategies-for-sqlite-in-production/)
- [Cross-platform SQLite guide](https://www.slingacademy.com/article/a-guide-to-cross-platform-sqlite-integration/)

### SQLite Replication Landscape
- [The SQLite Renaissance 2026 — DEV Community](https://dev.to/pockit_tools/the-sqlite-renaissance-why-the-worlds-most-deployed-database-is-taking-over-production-in-2026-3jcc)
- [Distributed SQLite: LibSQL and Turso 2026 — DEV Community](https://dev.to/dataformathub/distributed-sqlite-why-libsql-and-turso-are-the-new-standard-in-2026-58fk)
- [LiteFS vs Litestream vs rqlite vs dqlite on VPS 2025](https://onidel.com/blog/sqlite-replication-vps-2025)
- [SQLite Is Eating the Cloud 2025](https://debugg.ai/resources/sqlite-eating-the-cloud-2025-edge-databases-replication-patterns-ditch-server)
- [Post-PostgreSQL: Is SQLite on the Edge Production Ready? 2026](https://www.sitepoint.com/sqlite-edge-production-readiness-2026/)
- [Litestream Alternatives](https://litestream.io/alternatives/)
- [rqlite FAQ](https://rqlite.io/docs/faq/)
- [Turso GitHub](https://github.com/tursodatabase/turso)

### cr-sqlite & CRDTs
- [cr-sqlite GitHub](https://github.com/vlcn-io/cr-sqlite)
- [cr-sqlite notes.md (internals)](https://github.com/vlcn-io/cr-sqlite/blob/main/notes.md)
- [Synql: A CRDT-Based Approach for Replicated Relational Databases (INRIA)](https://inria.hal.science/hal-04969158v3/document)
- [The Secret Life of a Local-First Value — Marco Bambini](https://marcobambini.substack.com/p/the-secret-life-of-a-local-first)
- [CRDTs — Corrosion documentation](https://superfly.github.io/corrosion/crdts.html)
- [The CRDT Dictionary — Ian Duncan](https://www.iankduncan.com/engineering/2025-11-27-crdt-dictionary/)
- [CRDT and SQLite: Local-First Value Synchronization — HN](https://news.ycombinator.com/item?id=45527840)
- [Trying out cr-sqlite on macOS — Simon Willison](https://til.simonwillison.net/sqlite/cr-sqlite-macos)
- [sqlite-sync (SQLite AI)](https://github.com/sqliteai/sqlite-sync)

### Litestream
- [Litestream — How it works](https://litestream.io/how-it-works/)
- [Litestream Configuration File](https://litestream.io/v0.3/reference/config/)
- [Litestream Restore command](https://litestream.io/reference/restore/)
- [Litestream Tips & Caveats](https://litestream.io/tips/)
- [Litestream WAL Truncate Threshold](https://litestream.io/guides/wal-truncate-threshold/)
- [Litestream Getting Started](https://litestream.io/getting-started/)
- [Litestream backup bucket lifecycle — GitHub Discussion](https://github.com/benbjohnson/litestream/discussions/493)

### Backup Tools
- [restic — Official site](https://restic.net/)
- [restic Foundation: Content Defined Chunking](https://restic.net/blog/2015-09-12/restic-foundation1-cdc/)
- [restic Design Document](https://restic.readthedocs.io/en/v0.3.3/Design/)
- [restic Repository documentation](https://restic.readthedocs.io/en/stable/045_working_with_repos.html)
- [restic References (encryption details)](https://restic.readthedocs.io/en/stable/100_references.html)
- [restic Terminology](https://restic.readthedocs.io/en/stable/design.html)
- [Backups with restic: understanding repository structure — Daniel Wells](https://www.danielwells.me/posts/restic-deduplication-vs-git/)
- [restic cross-platform encryption — Bright Coding](https://www.blog.brightcoding.dev/2025/05/11/why-restic-is-the-ultimate-backup-tool-for-encrypting-and-storing-data-across-platforms/)
- [NPBackup — restic GUI](https://forum.restic.net/t/npbackup-cross-platform-restic-based-backup-solution-batteries-and-gui-included/5903)
- [restic dedup safety — forum](https://forum.restic.net/t/how-safe-is-deduplication-content-defined-chunking/5867)
- [Borg Backup — Windows limitation](https://github.com/borgbackup/borg/issues/936)
- [BorgBackup official site](https://www.borgbackup.org/)
- [Vorta — Borg GUI](https://vorta.borgbase.com/)
- [Duplicacy official site](https://duplicacy.com/)
- [Duplicacy comparison thread](https://forum.duplicacy.com/t/comparison-duplicacy-borg-restic-arq-duplicati/4210)
- [Kopia features](https://kopia.io/docs/features/)
- [Kopia — What is Kopia?](https://kopia.io/docs/)
- [Kopia — open-source encrypted backup tool — Help Net Security](https://www.helpnetsecurity.com/2025/08/25/kopia-open-source-encrypted-backup-tool-windows-macos-linux/)
- [Kopia Backup Tool Guide — Neova Solutions](https://www.neovasolutions.com/2026/03/24/kopia-backup-tool-modern-encrypted-backup-and-restore-solution/)
- [Kopia compression](https://kopia.io/docs/advanced/compression/)
- [Kopia GitHub](https://github.com/kopia/kopia)
- [Restic vs BorgBackup vs Kopia on VPS 2025](https://onidel.com/blog/restic-vs-borgbackup-vs-kopia-2025)
- [Restic vs Borg vs Kopia comparison](https://faisalrafique.com/restic-vs-borg-vs-kopia/)
- [Duplicacy vs Restic vs Borg 2025](https://mangohost.net/blog/duplicacy-vs-restic-vs-borg-which-backup-tool-is-right-in-2025/)
- [Borg, Kopia, Restic comparison — Cognitive Overhead](https://www.patpro.net/blog/index.php/2024/03/07/3590-borg-kopia-restic-a-comparison/)
- [Vykar — new backup tool faster than Borg/restic/Kopia](https://itsfoss.com/vykar-open-source-backup-tool/)
- [Backup speed benchmark: rsync vs borg vs restic vs kopia](https://grigio.org/backup-speed-benchmark/)
- [Restic vs Kopia vs Borgbackup — DEV Community](https://dev.to/selfhostingsh/restic-vs-kopia-vs-borgbackup-2lmn)
- [Duplicati big comparison thread](https://forum.duplicati.com/t/big-comparison-borg-vs-restic-vs-arq-5-vs-duplicacy-vs-duplicati/9952)

### NAS Integration
- [Backing up Linux home server using restic — Damir's Corner](https://www.damirscorner.com/blog/posts/20250711-BackingUpLinuxHomeServerUsingRestic.html)
- [restic in container (TrueNAS → Synology) — Lawrence Systems](https://forums.lawrencesystems.com/t/restic-in-container-truenas-synology-backup/24735)
- [Run restic on Synology NAS — restic forum](https://forum.restic.net/t/run-restic-on-synology-nas/6806)
- [Synology NAS Backups with Minimal Bus Factor](https://willbush.dev/blog/synology-nas-backup/)
- [Syncthing — John's Tech Blog](https://hagensieker.com/2025/11/19/syncthing/)
- [File Sync & Backup Tools (NAS) — DMML](https://dmml.nu/nas/)

### ElectricSQL & PowerSync
- [PowerSync official site](https://www.powersync.com)
- [ElectricSQL vs PowerSync — PowerSync blog](https://www.powersync.com/blog/electricsql-electric-next-vs-powersync)
- [ElectricSQL vs PowerSync vs Replicache — QueryPlane](https://queryplane.com/docs/blog/electricsql-vs-powersync-vs-replicache)
- [The Spectrum of Local First Libraries](https://tolin.ski/posts/local-first-options)
- [Local First News — 2025.12.11](https://www.localfirstnews.com/2025-12-11/)

### Privacy-First Apps
- [4 Free, Open-Source Obsidian Alternatives With Sync](https://www.anydb.com/blog/obsidian-alternatives/)
- [Obsidian Sync](https://obsidian.md/sync)
- [Obsidian Sync alternatives](https://www.stephanmiller.com/sync-obsidian-vault-across-devices/)
- [Local Knowledgebase Tools — Privacy Guides Community](https://discuss.privacyguides.net/t/local-knowledgebase-tools-obsidian-logseq-trilium/11543)
- [Joplin Vs Obsidian 2026](https://clickup.com/blog/joplin-vs-obsidian/)
- [5 Logseq Alternatives 2026](https://medium.com/@theo-james/5-best-logseq-alternatives-for-2025-dc8f741b492b)

### WebRTC & P2P
- [RxDB WebRTC P2P Replication](https://rxdb.info/replication-webrtc.html)
- [RxDB P2P Data Synchronization](https://rxdb.info/replication-p2p.html)
- [WebRTC API — MDN](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API)
- [P2P connection with WebRTC — Medium](https://medium.com/@avocadi/p2p-connection-with-webrtc-8557461cae2d)
- [Resilient Sync for Local First — Dirk Holtwick](https://holtwick.de/en/blog/localfirst-resilient-sync)

### Security
- [Nextcloud Threat Model](https://nextcloud.com/security/threat-model/)
- [Cryptee Threat Model](https://crypt.ee/threat-model)
- [Application-Level Encryption — Security Boulevard](https://securityboulevard.com/2026/03/application-level-encryption-enable-applications-to-interact-with-encrypted-files/)
- [Resilio Sync vs Syncthing](https://noted.lol/syncthing-or-resilio-sync/)
- [Syncthing vs Resilio — speed comparison](https://axis-intelligence.com/best-data-sync-tools-2025-tested-comparison/)
- [Git LFS](https://git-lfs.com/)
