# `character_relationships` table accumulates massive row duplication

**Filed:** 2026-05-06 (session 27 browser QA, surfaced while investigating a
BondPill display bug)
**Severity:** **P1** — DB bloat, potential bond-progression read inconsistency,
silent data corruption
**Surface:** `backend/preflight.py` schema design + `backend/server.py` and
`backend/bond/progression.py` insertion sites

## Symptom

The `character_relationships` table contains **24,508 rows** for **11
characters**. Per-character row counts:

| char_id | rows | character |
|---|---|---|
| 1 | **23,291** | Rin (Akane) |
| 13 | 832 | Dae (Neciridae) |
| 15 | 311 | Brittney |
| 2 | 48 | Tsundere (Raine) |
| 3 | 8 | Ayane (Yuki) |
| 4 | 7 | Genki (Kitsune) |
| 6 | 4 | Sable (Kuroha) |
| 5 | 3 | Hana (Momoka) |
| 8 | 2 | Shiori (Nana) |
| 14 | 1 | Alana Calloway |
| 12 | 1 | Yuki (Shirayuki) |

Expected: exactly **one row per char_id** (this table is a per-character
relationship snapshot — affinity, mood, trust, bond_level, bond_xp,
relationship_mode, etc.).

## Root cause

Schema definition in `preflight.py`:

```sql
CREATE TABLE character_relationships (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    char_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    affinity REAL DEFAULT 0.5,
    mood REAL DEFAULT 0.5,
    trust REAL DEFAULT 0.5,
    interactions INTEGER DEFAULT 0,
    last_updated REAL DEFAULT (strftime('%s','now')),
    bond_level INTEGER DEFAULT 0,
    bond_xp INTEGER DEFAULT 0,
    relationship_mode TEXT DEFAULT 'friend',
    covenant_date TEXT,
    last_daily_bonus_date TEXT,
    current_session_msgs INTEGER DEFAULT 0,
    session_bonus_awarded INTEGER DEFAULT 0
);
```

The `PRIMARY KEY` is the autoincrement `id` — there is **no UNIQUE constraint
on `char_id`**.

Multiple call sites use `INSERT OR IGNORE INTO character_relationships
(char_id) VALUES (?)` (e.g. `server.py:2430, 8893, 10787` and
`bond/progression.py:127`) under the (incorrect) assumption that
`OR IGNORE` will suppress a re-insert when a row for that `char_id`
already exists. **It does not** — `INSERT OR IGNORE` only suppresses
PRIMARY KEY / UNIQUE-constraint conflicts, and the only PK here is the
autoincrement `id`, which never conflicts. So every "make sure a row
exists for this char" call append-inserts another row.

Additionally, `server.py:8940` performs a raw `INSERT INTO
character_relationships (char_id) VALUES (?)` (no `OR IGNORE` at all)
inside `reset_relationship` — but this is downstream of the same root
cause and would behave identically with `OR IGNORE` in this schema.

The 23,291 rows for char_id=1 (Rin) reflect 23k+ runs through the
"ensure-row-exists" code path. Each new chat session, each app restart,
each relationship-check API call effectively re-inserts.

## Symptoms beyond DB bloat

1. **DB size growth.** Working-tree `app.db` grew from 1.9 MB → 4.4 MB
   (per session-27 `git status` diff). Likely most of the +2.5 MB is dupe
   rows in this table.
2. **Bond progression read non-determinism.** Code that reads
   `character_relationships WHERE char_id = ?` may get **any** row when
   multiple match (SQLite returns rows in unspecified order without an
   ORDER BY). The bond progression code in `progression.py:442-449` does
   `UPDATE … WHERE char_id = ?` which updates ALL matching rows
   (slowing every level-up by 23k+ writes for Rin) but it does that
   atomically so they stay in sync — until the next code path reads them
   in different order.
3. **`reset_relationship` is silently wrong.** It does `UPDATE … WHERE
   char_id = ?` followed by `INSERT INTO …` if `changes() == 0`. With
   23k existing rows the UPDATE will always affect >0 rows and the
   INSERT is skipped — fine. But the UPDATE rewrites all 23k rows on
   every reset. Significant write amplification.

## Suggested fix (v72 preflight migration)

```python
def migrate_to_v72(con: sqlite3.Connection) -> bool:
    """Migrate schema from v71 to v72.

    Dedupes ``character_relationships`` and adds a UNIQUE constraint on
    ``char_id``.  SQLite cannot ALTER an existing column to add UNIQUE,
    so we follow the standard table-rename pattern: create new table
    with the constraint, copy the latest row per char_id, drop old,
    rename new.
    """
    cur_ver = get_schema_version(con)
    if cur_ver >= 72:
        return True
    try:
        with con:
            con.executescript("""
                CREATE TABLE character_relationships_new (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    char_id INTEGER NOT NULL UNIQUE
                        REFERENCES characters(id) ON DELETE CASCADE,
                    affinity REAL DEFAULT 0.5,
                    mood REAL DEFAULT 0.5,
                    trust REAL DEFAULT 0.5,
                    interactions INTEGER DEFAULT 0,
                    last_updated REAL DEFAULT (strftime('%s','now')),
                    bond_level INTEGER DEFAULT 0,
                    bond_xp INTEGER DEFAULT 0,
                    relationship_mode TEXT DEFAULT 'friend',
                    covenant_date TEXT,
                    last_daily_bonus_date TEXT,
                    current_session_msgs INTEGER DEFAULT 0,
                    session_bonus_awarded INTEGER DEFAULT 0
                );

                -- Keep the row with the highest id per char_id (most recently
                -- written; preserves the latest bond_level/bond_xp).
                INSERT INTO character_relationships_new
                SELECT cr.* FROM character_relationships cr
                JOIN (
                    SELECT char_id, MAX(id) AS max_id
                    FROM character_relationships
                    GROUP BY char_id
                ) latest ON cr.id = latest.max_id;

                DROP TABLE character_relationships;
                ALTER TABLE character_relationships_new
                    RENAME TO character_relationships;

                CREATE INDEX idx_relationships_char ON character_relationships(char_id);
            """)
            con.execute("UPDATE schema_version SET version = 72")
        logger.info("Schema v72: deduped character_relationships, added UNIQUE(char_id)")
        return True
    except Exception as exc:
        logger.error("Migration v72 failed: %s", exc)
        con.rollback()
        raise
```

After the migration is in, the existing `INSERT OR IGNORE INTO
character_relationships (char_id) …` calls become correct (the new UNIQUE
constraint gives `OR IGNORE` something to ignore). The raw INSERT at
`server.py:8940` will need an `OR IGNORE` (or a guard) to avoid
constraint violations.

## Recommended next step

**Spike before the full migration:** dump-and-recreate the table on a
copy of `app.db` with the migration above, run pytest, confirm
nothing else (the `bond/` modules in particular) regresses. If clean,
land as the next preflight migration.

This is **not** a bug in any session-26/27 commit — it's pre-existing
schema design. Surfaced today by browser QA + DB probe.

## Investigation

```bash
# Confirm the 23k row count
sqlite3 backend/storage/app.db "SELECT char_id, COUNT(*) FROM character_relationships GROUP BY char_id ORDER BY 2 DESC;"

# Find every site that may insert a row
grep -nE "INSERT.*character_relationships" backend/server.py backend/bond/*.py

# After backup, try the migration on a copy
cp backend/storage/app.db /tmp/app.db.bak
.venv/bin/python -c "import sqlite3; ..."  # spike script
```
