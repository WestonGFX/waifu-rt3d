# Privacy-First Sync & Backup Research

**Date:** 2026-03-29
**Topic:** Keeping waifu-rt3d data synced across 3 machines (Mac M2 Pro, Win RTX 5080, Win RTX 3070) with zero cloud dependency
**Why:** The app is local-only, privacy-first. All data lives in SQLite + local files. User needs multi-machine sync and reliable backups without any cloud service.

---

## Data Inventory

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

---

## 1. Syncthing

### Overview

[Syncthing](https://syncthing.net/) is an open-source, decentralized, peer-to-peer file synchronization tool. Version 2.0 (released August 2025) migrated its own internal database from LevelDB to SQLite. It encrypts all data in transit and requires no central server.

### How It Works

- Devices discover each other via local network broadcast or global discovery relays
- Files are synced bidirectionally (or send-only / receive-only per folder)
- Block-level delta sync: only changed portions of files are transferred
- Conflict resolution: creates `.sync-conflict-YYYYMMDD-HHMMSS` copies when both sides change

### SQLite Database Syncing: THE CRITICAL PROBLEM

**This is the single biggest risk with file-level sync tools and SQLite.**

| Risk | Description | Severity |
|------|-------------|----------|
| WAL desync | Syncthing may sync `app.db` and `app.db-wal` at different times. A DB file without its matching WAL = corruption or data loss. | **CRITICAL** |
| Mid-write sync | If Syncthing copies the DB while SQLite is writing, the copy may be inconsistent. | **HIGH** |
| Conflict copies | Two machines editing the same DB creates `.sync-conflict` files that are useless for SQLite (you can't merge two .db files). | **MEDIUM** |
| SHM files | The `-shm` file is ephemeral shared memory; syncing it is meaningless and potentially harmful. | **MEDIUM** |

### Mitigation Strategies

1. **Close the app before syncing.** Run `PRAGMA wal_checkpoint(TRUNCATE)` on shutdown to fold WAL into the main DB, then Syncthing can safely sync the single `.db` file.
2. **Ignore WAL/SHM files.** Add to `.stignore`:
   ```
   *.db-wal
   *.db-shm
   ```
3. **Use send-only / receive-only mode.** One machine is "primary," others are receive-only mirrors.
4. **Pre-sync hook.** Syncthing supports folder hooks — run a script that checkpoints the DB before sync.

### Verdict for This Project

| Aspect | Rating |
|--------|--------|
| Large binary files (VRM, Live2D) | Excellent — block-level delta sync |
| Static assets | Excellent — sync once, done |
| SQLite database | **Dangerous without precautions** |
| Setup complexity | Low (GUI on all platforms) |
| Cross-platform | Mac + Windows + Linux |
| Cost | Free, open source (MPL-2.0) |

**Bottom line:** Excellent for syncing everything EXCEPT the SQLite database. For the DB, we need an export/import layer or pre-sync checkpoint.

---

## 2. Resilio Sync

### Overview

[Resilio Sync](https://www.resilio.com/) (formerly BitTorrent Sync) is a proprietary peer-to-peer sync tool built on BitTorrent protocol. Closed-source but well-tested.

### Comparison to Syncthing

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

### Verdict for This Project

Resilio is faster for large files (the 1.2 GB models directory) but shares all the same SQLite corruption risks. The speed advantage matters for initial sync but not for ongoing use where only small deltas change. The closed-source nature conflicts with the project's privacy-first philosophy.

**Bottom line:** No meaningful advantage over Syncthing for this use case. Syncthing is preferred due to open source and zero cost.

---

## 3. SQLite Replication Solutions

### 3a. cr-sqlite (CRDT-based merge)

[cr-sqlite](https://github.com/vlcn-io/cr-sqlite) by vlcn.io adds Conflict-free Replicated Data Type (CRDT) support to SQLite as a loadable extension.

**How it works:**
- Wraps existing tables with CRDT metadata (triggers + shadow tables)
- Each machine can write independently, even offline
- Databases merge by exchanging changesets — last-write-wins per column
- Arbitrary number of peers, all converge to same state

**Pros:**
- True multi-writer: two machines CAN edit simultaneously and merge
- No schema changes required (metadata is added transparently)
- Loadable extension — works with any SQLite binding (Python, JS, etc.)
- Designed exactly for this use case

**Cons:**
- Project maturity: vlcn.io is a small team; long-term maintenance uncertain
- Adds storage overhead (CRDT metadata per row)
- Merge semantics are "last write wins" — may lose intentional changes if both machines edit the same field
- No built-in transport — you still need a way to exchange changesets (file copy, HTTP, etc.)
- Complex to debug when merges go wrong

**Relevance to waifu-rt3d:**
Our 40-table schema includes messages, memories, user_facts, character relationships, bond_stories, etc. CRDT merge would work well for append-only tables (messages, memories) but could cause confusion for stateful tables (character_relationships, intimacy_states) where both machines might set different values.

### 3b. sqlite-sync (SQLite AI)

[sqlite-sync](https://github.com/sqliteai/sqlite-sync) is a newer CRDT-based sync extension from SQLite AI (2025). Similar approach to cr-sqlite but backed by a company with commercial intent. Designed to sync with SQLite Cloud, PostgreSQL, or Supabase — but those are cloud services, defeating our purpose.

**Verdict:** Interesting tech but cloud-oriented. Not suitable for pure local-first sync between machines.

### 3c. Litestream

[Litestream](https://litestream.io/) streams SQLite WAL changes to a replica destination (S3, SFTP, local directory).

**How it works:**
- Runs as a sidecar process alongside the app
- Hooks into WAL mode, continuously copies WAL pages to a staging area
- Replicates to: S3, Azure Blob, GCS, SFTP, or **local filesystem**
- Restore creates a point-in-time copy of the database

**Pros:**
- Near-zero RPO (recovery point objective) — changes replicate in seconds
- Can replicate to a local NAS or external drive via SFTP
- No code changes needed — works with any SQLite app
- Proven in production (used by Fly.io)

**Cons:**
- One-way replication only (primary → replica). NOT bidirectional.
- Replica is read-only — you can't write on machine B and merge back
- Requires S3-compatible or SFTP target (not direct machine-to-machine)
- macOS + Linux supported; Windows support is less mature

**Relevance to waifu-rt3d:**
Excellent for backup (machine A → NAS). Not suitable for true sync between machines unless one machine is always the "primary." Could work in a "primary machine + read-only mirrors" architecture.

### 3d. rqlite

[rqlite](https://rqlite.io/) is a distributed SQLite database using Raft consensus. Requires running a cluster of nodes.

**Verdict:** Overkill for 3 personal machines. Designed for server clusters, not desktop apps. Skip.

### Summary Table

| Solution | Multi-writer | Transport | Complexity | Windows | Maturity |
|----------|-------------|-----------|------------|---------|----------|
| cr-sqlite | Yes (CRDT) | DIY (file/HTTP) | Medium | Yes | Early |
| sqlite-sync | Yes (CRDT) | Cloud-oriented | Medium | Yes | Early |
| Litestream | No (one-way) | S3/SFTP/local | Low | Partial | Mature |
| rqlite | Yes (Raft) | TCP cluster | High | Yes | Mature |

---

## 4. Git-Based Sync

### Could character data, memories, and settings be versioned in git?

**What could work in git:**
- Character bible markdown files (`docs/characters/`)
- App config (`backend/config/app.json`)
- Prompt templates (text files)

**What would NOT work in git:**
- SQLite database (binary, changes every message — git would store full copies)
- VRM models (175 MB binary files — needs Git LFS)
- Live2D models (204 MB — needs Git LFS)
- TTS model weights (60 MB+ — needs Git LFS)

### Git LFS Assessment

Git LFS replaces large files with text pointers in the repo, storing actual content on a remote server.

| Aspect | Assessment |
|--------|------------|
| VRM/Live2D sync | Works but requires a Git LFS server (GitHub, GitLab, or self-hosted) |
| Self-hosted option | `git-lfs-server` or Gitea — adds infrastructure complexity |
| Cloud dependency | GitHub/GitLab LFS = cloud. Self-hosted Gitea on LAN = no cloud. |
| For non-developers | `git add / commit / push / pull` is NOT user-friendly |
| SQLite in git | Terrible idea — binary diffs, no merge, bloats history |

### Hybrid Approach: Export DB to SQL/JSON for Git

Instead of syncing the raw `.db` file, the app could:
1. Export critical tables to JSON/SQL dump files
2. Commit those to a local git repo
3. Sync the git repo between machines
4. Import on the other side

**Pros:** Full version history, merge-friendly (JSON), works offline
**Cons:** Significant engineering effort, not real-time, data format conversion bugs

### Verdict for This Project

Git is good for character docs and config files. Terrible for the database and large assets without significant infrastructure. The hybrid export approach is interesting but adds substantial complexity.

**Bottom line:** Not recommended as the primary sync mechanism. Could supplement another approach for version-controlling character files.

---

## 5. Encrypted Backup Solutions

### 5a. restic

[restic](https://restic.net/) is a cross-platform backup tool with built-in encryption.

| Feature | Details |
|---------|---------|
| Encryption | AES-256-CTR + Poly1305 authentication |
| Deduplication | Content-defined chunking (per-repo) |
| Platforms | **macOS, Windows, Linux** (native binaries) |
| Targets | Local dir, SFTP, S3, Azure, GCS, REST server |
| Speed | 100-300 MB/s typical |
| Restore | Full or individual files |
| GUI | [NPBackup](https://github.com/netinvent/npbackup) (cross-platform GUI wrapper) |

**Why restic for this project:**
- True cross-platform (Mac + Windows native)
- Back up to external drive, NAS, or another machine via SFTP
- Encrypted at rest — if the drive is stolen, data is safe
- Deduplication means the 1.2 GB models directory only stores once
- Incremental: only changed blocks are backed up after first run

### 5b. Borg Backup

[BorgBackup](https://www.borgbackup.org/) is a deduplicating backup tool with compression and encryption.

| Feature | Details |
|---------|---------|
| Encryption | AES-256 + HMAC-SHA256 |
| Deduplication | Per-repo, excellent compression |
| Platforms | **Linux, macOS, BSD** — Windows is NOT officially supported |
| Targets | Local dir, SSH remote |
| Speed | Very fast (can saturate gigabit) |
| FUSE mount | Browse backups as filesystem (not on Windows) |
| GUI | [Vorta](https://vorta.borgbase.com/) (macOS, Linux) |

**Critical limitation:** No native Windows support. Community builds exist (`borg-windows`) but are unofficial. This is a dealbreaker for a 3-machine setup with 2 Windows boxes.

### 5c. Duplicacy

[Duplicacy](https://duplicacy.com/) offers global cross-device deduplication.

| Feature | Details |
|---------|---------|
| Encryption | AES-256-GCM |
| Deduplication | **Global** — shared chunks across all machines |
| Platforms | macOS, Windows, Linux |
| Targets | Local, SFTP, S3, Azure, GCS, Backblaze B2, etc. |
| Cost | CLI free, GUI $20/year per machine |
| Unique feature | Multiple machines back up to same repo with cross-dedup |

**Why Duplicacy is interesting:** Three machines backing up to the same NAS repo would share chunks globally — the 1.2 GB models directory stored once, accessible from all three.

### Comparison Table

| Feature | restic | Borg | Duplicacy |
|---------|--------|------|-----------|
| Windows native | **Yes** | **No** | **Yes** |
| macOS native | Yes | Yes | Yes |
| Encryption | AES-256 | AES-256 | AES-256 |
| Global dedup | No (per-repo) | No (per-repo) | **Yes** |
| Cloud targets | Many | SSH only | Many |
| GUI available | NPBackup | Vorta | Built-in ($) |
| Cost | Free | Free | CLI free / GUI $60/yr (3 machines) |
| Ease of use | Medium | Medium | Medium-Low |

### Recommendation

**restic** is the best fit:
- Native on all 3 machines (Mac + 2x Windows)
- Free and open source
- Encrypt backups to external drive or NAS
- Excellent incremental performance for the 1.6 GB dataset
- NPBackup provides a GUI for scheduling

---

## 6. Cross-Platform Considerations (Mac <-> Windows)

### File Path Differences

| Issue | macOS | Windows | Impact |
|-------|-------|---------|--------|
| Path separator | `/` | `\` | SQLite stores paths in DB — must use forward slashes or relative paths |
| Case sensitivity | Case-preserving (APFS default) | Case-insensitive (NTFS) | `Dae.md` and `dae.md` are different on Mac, same on Windows |
| Max path length | 1024 chars | 260 chars (legacy) / 32K (long paths) | Deep nested paths may fail on Windows |
| Illegal characters | `:` only | `< > : " / \ \| ? *` | Filenames with these chars will fail on Windows |
| Line endings | LF (`\n`) | CRLF (`\r\n`) | Text files may get mangled; binary files (SQLite, VRM) unaffected |
| File permissions | Unix (rwx) | NTFS ACLs | Syncthing preserves permissions but they are meaningless cross-platform |

### Symlinks

| Platform | Support | Sync Tool Handling |
|----------|---------|-------------------|
| macOS | Full support | Syncthing follows symlinks by default |
| Windows | Requires admin/developer mode | Syncthing can create symlinks but may fail without privileges |

**Recommendation:** Avoid symlinks entirely in the storage directory. Use relative paths everywhere.

### SQLite Cross-Platform

SQLite itself is fully cross-platform — the `.db` file format is identical on Mac and Windows. The byte order, page size, and encoding are all platform-independent. This is one of SQLite's strongest features.

**Potential issue:** If the app stores absolute file paths in the database (e.g., `/Users/chris/Code/waifu-rt3d/backend/storage/avatars/model.vrm`), those paths won't work on Windows. Always store **relative paths** from the storage root.

### What Breaks in Practice

1. **Filename conflicts:** A file named `kitsune_bedroom large.jpeg` (with space) syncs fine but may cause issues in shell scripts
2. **File locking:** Windows locks files more aggressively than macOS — if the app is running, Syncthing may fail to update files
3. **Hidden files:** `.stignore`, `.gitignore`, etc. are hidden on Unix but visible on Windows
4. **Timestamps:** FAT32 has 2-second resolution; NTFS and APFS are fine but may differ in sub-second precision

---

## 7. What Other Desktop Apps Do

### Obsidian

| Aspect | Approach |
|--------|----------|
| Data format | Plain Markdown files in a local "vault" folder |
| Official sync | [Obsidian Sync](https://obsidian.md/sync) — E2E encrypted, paid ($4/month) |
| Free alternatives | Syncthing, iCloud, Dropbox, Git |
| Conflict handling | Creates duplicate files; user resolves manually |
| Why it works | Plain text files are inherently merge-friendly |

**Key insight:** Obsidian deliberately chose plain files over a database, partly to make sync trivial.

### KeePass / KeePassXC

| Aspect | Approach |
|--------|----------|
| Data format | Single `.kdbx` encrypted database file |
| Sync | User's responsibility — Syncthing, Dropbox, or manual copy |
| Conflict handling | KeePassXC has a "Merge Database" feature for `.kdbx` files |
| Why it works | Small file size (<1 MB), infrequent writes |

**Key insight:** KeePass's merge feature is purpose-built for the conflict scenario. The DB format supports merging because entries have UUIDs and modification timestamps.

### Logseq

| Aspect | Approach |
|--------|----------|
| Data format | Markdown files (like Obsidian) |
| Sync | Git-based sync built in; also Syncthing |
| Conflict handling | Git merge for text files |
| Why it works | Text files + Git = version history + merge |

### Standard Notes

| Aspect | Approach |
|--------|----------|
| Data format | Encrypted JSON |
| Sync | Self-hosted sync server (optional) or their cloud |
| Conflict handling | Server-side merge with conflict detection |

### What These Apps Have in Common

1. **Plain text / small files** — apps that sync well use text files, not databases
2. **Conflict resolution is always manual** — no app auto-merges without user review
3. **Syncthing is the most common free recommendation** across all communities
4. **Database apps need special handling** — KeePass built a custom merge; most others avoid the problem by not using databases

---

## 8. Recommended Architecture

### The Problem, Simply Stated

We need to sync:
- A 3.3 MB SQLite database (40 tables, written frequently)
- ~1.5 GB of binary assets (written rarely)
- ~5 MB of text config/character files (written occasionally)

Between 3 machines (1 Mac, 2 Windows), with no cloud, and no data loss.

### Recommended Approach: Layered Strategy

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

### Implementation Plan

#### Phase 1: Safe DB Sync via Checkpoint (Minimal Engineering)

**The simplest approach that works today:**

1. **On app shutdown:** Run `PRAGMA wal_checkpoint(TRUNCATE)` to fold all WAL data into the main `.db` file, then delete `-wal` and `-shm` files.
2. **Syncthing config:** Sync the entire `backend/storage/` directory with these ignore rules:
   ```
   // .stignore
   *.db-wal
   *.db-shm
   *.db-journal
   _backups/
   ```
3. **On app startup:** Check if the `.db` file was modified externally (compare mtime or a version counter stored in the DB). If so, run `PRAGMA integrity_check` before proceeding.
4. **Safety rule:** Never run the app on two machines simultaneously. Display a warning if the DB was modified less than 60 seconds ago (suggests another instance may be running).

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

## Decision Matrix

| Approach | Sync Safety | Engineering Cost | Complexity | Multi-Writer | Recommended? |
|----------|-------------|------------------|------------|-------------|-------------|
| Syncthing + DB checkpoint | High (if app closed) | 4h | Low | No | **YES — Phase 1** |
| JSON export/import | High | 16h | Medium | Partial | YES — Phase 2 |
| restic backup | N/A (backup only) | 2h | Low | N/A | **YES — Phase 3** |
| cr-sqlite CRDT | Medium (complex) | 40h | High | Yes | No (unless needed) |
| Resilio Sync | Same as Syncthing | 4h | Low | No | No (closed source) |
| Git + LFS | Medium | 20h | High | No | No (too complex) |
| Litestream | High (one-way) | 4h | Low | No | Maybe (backup alt) |

---

## Final Recommendation

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

## Sources

- [Syncthing 2.0 — SQLite migration](https://www.neowin.net/news/syncthing-20-released-with-major-changes-switching-from-leveldb-to-sqlite/)
- [Syncthing SQLite conflict issue](https://forum.syncthing.net/t/sync-conflict-with-1-specific-sqlite-file-constantly/20836)
- [Syncthing fcntl lock request for SQLite](https://github.com/syncthing/syncthing/issues/4242)
- [SQLite — How to Corrupt a Database](https://sqlite.org/howtocorrupt.html)
- [SQLite WAL documentation](https://www.sqlite.org/wal.html)
- [SQLite Backup API](https://sqlite.org/backup.html)
- [cr-sqlite (vlcn.io)](https://github.com/vlcn-io/cr-sqlite)
- [sqlite-sync (SQLite AI)](https://github.com/sqliteai/sqlite-sync)
- [Litestream](https://litestream.io/)
- [Litestream — How it works](https://litestream.io/how-it-works/)
- [LiteFS vs Litestream vs rqlite vs dqlite (2025)](https://onidel.com/blog/sqlite-replication-vps-2025)
- [restic](https://restic.net/)
- [restic — Cross-platform encryption](https://www.blog.brightcoding.dev/2025/05/11/why-restic-is-the-ultimate-backup-tool-for-encrypting-and-storing-data-across-platforms/)
- [NPBackup — restic GUI](https://forum.restic.net/t/npbackup-cross-platform-restic-based-backup-solution-batteries-and-gui-included/5903)
- [Borg Backup — Windows limitation](https://github.com/borgbackup/borg/issues/936)
- [Duplicacy vs restic vs Borg (2025)](https://mangohost.net/blog/duplicacy-vs-restic-vs-borg-which-backup-tool-is-right-in-2025/)
- [restic vs Borg vs Kopia (2025)](https://onidel.com/blog/restic-vs-borgbackup-vs-kopia-2025)
- [Resilio Sync vs Syncthing](https://noted.lol/syncthing-or-resilio-sync/)
- [Syncthing vs Resilio — speed comparison](https://axis-intelligence.com/best-data-sync-tools-2025-tested-comparison/)
- [Git LFS](https://git-lfs.com/)
- [Obsidian Sync alternatives](https://www.stephanmiller.com/sync-obsidian-vault-across-devices/)
- [Local-first apps with Syncthing](https://www.howtogeek.com/free-open-source-tool-solves-the-main-problem-with-local-first-apps/)
- [Obsidian Sync](https://obsidian.md/sync)
- [Cross-platform SQLite guide](https://www.slingacademy.com/article/a-guide-to-cross-platform-sqlite-integration/)
- [SQLite WAL checkpoint corruption](https://sqlite.org/forum/info/47107ab818977549?t=h)
- [SQLite backup strategies in production](https://oldmoe.blog/2024/04/30/backup-strategies-for-sqlite-in-production/)
