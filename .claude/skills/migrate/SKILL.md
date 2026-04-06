---
name: migrate
description: >
  Scaffold a new database schema migration in backend/preflight.py.
  Reads current version, generates the migration function with correct
  pattern, updates the dispatch chain, and runs validation.
user_invocable: true
---

# Database Migration Scaffolding

Automates adding a new sequential migration to `backend/preflight.py`.

## Usage

`/migrate <description of what the migration does>`

Examples:
- `/migrate add column user_profiles.interaction_streak INTEGER DEFAULT 0`
- `/migrate create table character_outfits with character_id, outfit_name, outfit_data`
- `/migrate add index idx_messages_session on messages(session_id)`

## Step 1: Read Current State

Read `backend/preflight.py` and extract:
1. `LATEST_SCHEMA_VERSION` constant value (e.g., `65`)
2. The last `migrate_to_vN()` function (for pattern reference)
3. The migration dispatch table (where migrations are called in sequence)

Report:
```
Current schema: v{N}
New migration: v{N+1}
Description: {from user input}
```

## Step 2: Generate Migration Function

Create the migration function following the EXACT established pattern:

```python
def migrate_to_v{N+1}(con: sqlite3.Connection) -> bool:
    """Migrate schema from v{N} to v{N+1}.

    Adds: {description from user input}.
    """
    try:
        # SQL operations here — use IF NOT EXISTS / IF EXISTS guards
        con.execute("...")
        con.execute("UPDATE schema_version SET version = {N+1}")
        return True
    except Exception as e:
        logging.error(f"Migration to v{N+1} failed: {e}")
        return False
```

### SQL Guidelines:
- `ALTER TABLE ... ADD COLUMN` — use with `IF NOT EXISTS` guard (or try/except since SQLite doesn't support IF NOT EXISTS for ADD COLUMN)
- `CREATE TABLE` — always `IF NOT EXISTS`
- `CREATE INDEX` — always `IF NOT EXISTS`
- `INSERT` seed data — use `INSERT OR IGNORE`
- For columns with defaults: `ALTER TABLE x ADD COLUMN y TYPE DEFAULT value`
- For NOT NULL columns: add with DEFAULT first, then update existing rows

## Step 3: Wire Into Migration Chain

Find the migration dispatch section in preflight.py and add the new migration call.
The chain looks like:
```python
if current_version < N+1:
    if migrate_to_v{N+1}(con):
        current_version = N+1
    else:
        return False
```

Also update `LATEST_SCHEMA_VERSION = {N+1}`.

## Step 4: Generate Test Scaffold (optional)

If `backend/tests/test_preflight.py` exists, add a test for the new migration:

```python
class TestMigrateToV{N+1}:
    def test_migration_succeeds(self, tmp_path):
        """Test that v{N} -> v{N+1} migration runs cleanly."""
        # Create in-memory DB at version N
        # Run migrate_to_v{N+1}
        # Verify new table/column/index exists

    def test_migration_is_idempotent(self, tmp_path):
        """Test that running migration twice doesn't error."""
        # Run migrate_to_v{N+1} twice
        # Second run should succeed without error
```

## Step 5: Validate

Run these commands:
1. `.venv/bin/python -c "import backend.preflight; print('Import OK')"` — chain integrity
2. `.venv/bin/python -m pytest backend/tests/test_preflight.py -q --tb=short` — tests pass
3. Verify `LATEST_SCHEMA_VERSION` matches the new version

## Step 6: Update Status

Remind to update:
- `CURRENT_STATUS.md` — schema badge (e.g., `v65` → `v66`)
- Memory files — if the schema version in MEMORY.md is referenced

## Rules

- NEVER modify an existing migration function — append only.
- NEVER skip version numbers — migrations must be sequential.
- ALWAYS use idempotency guards (IF NOT EXISTS, try/except).
- ALWAYS run the validation step before reporting done.
- If the migration involves multiple tables, use a single transaction.
