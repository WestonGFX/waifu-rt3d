---
globs: backend/preflight.py
---

# Migration Chain Rules for preflight.py

This file contains 62+ sequential database migrations (v3 → v65). A broken migration chain corrupts every user's local database. Follow these rules exactly.

## Append-Only

- NEVER modify an existing `migrate_to_vN()` function — append only.
- If a previous migration has a bug, create a NEW migration that fixes it. Never edit the old one.
- Old migrations are a historical record. Users who already ran them won't re-run them.

## Sequential Ordering

- Migrations MUST be sequential — no gaps in version numbers.
- Each new migration increments by exactly 1: v65 → v66, never v65 → v67.
- Update `LATEST_SCHEMA_VERSION` constant at the top of the file.

## Function Signature

Every migration follows this exact pattern:
```python
def migrate_to_vNN(con: sqlite3.Connection) -> bool:
    """Migrate schema from vN-1 to vNN.

    Adds: [description of what this migration adds].
    """
    try:
        con.execute("...")  # Use IF NOT EXISTS / IF EXISTS guards
        con.execute("UPDATE schema_version SET version = NN")
        return True
    except Exception as e:
        logging.error(f"Migration to vNN failed: {e}")
        return False
```

## Idempotency

- Use `IF NOT EXISTS` for CREATE TABLE/INDEX.
- Use `IF EXISTS` for ALTER TABLE ... DROP COLUMN.
- Use `INSERT OR IGNORE` for seed data.
- A migration that runs twice must produce the same result.

## After Any Change

1. Run: `.venv/bin/python -m pytest backend/tests/test_preflight.py -q`
2. Verify the full chain imports cleanly: `.venv/bin/python -c "import backend.preflight"`
3. Update `CURRENT_STATUS.md` schema badge (e.g., `v65` → `v66`).
4. Update memory files if schema version changed.
