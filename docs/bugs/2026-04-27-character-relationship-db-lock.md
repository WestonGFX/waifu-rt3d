# Bug: `GET /api/characters/{id}/relationship` flooding 500s with `database is locked`

**Reported:** 2026-04-27 (discovered during session 18 backend log scan)
**Reporter:** auto (claude observation, not user)
**Severity:** P1 (silent backend failure — likely affects bond UI / mood indicators)
**Status:** ✅ FIXED (session 18, 2026-04-27) — see "Resolution" below

## Symptom

Repeated tracebacks in backend log within seconds of the user opening
the app:

```
sqlite3.OperationalError: database is locked
INFO:     127.0.0.1:65455 - "GET /api/characters/1/relationship HTTP/1.1" 500 Internal Server Error
```

Recurs continuously while the app is open — the frontend is polling
this endpoint and getting 500s.

## Root cause

`backend/server.py:8836` — `get_relationship` does:

```python
conn = db()
conn.execute("INSERT OR IGNORE INTO character_relationships (char_id) VALUES (?)", (char_id,))
conn.commit()
```

Two problems:

1. **Lazy-write on a GET.** Idempotent fine, but every GET takes a
   write lock. Under polling load + concurrent message-handling writes
   (which also touch `character_relationships`), SQLite's default
   busy-timeout (5s) blows past and we hit `OperationalError`.

2. **Bypasses the connection pool.** Project rule
   (`.claude/rules/backend-and-api.md`):

   > Use `db_pool.get_connection()` context manager. Never open raw
   > `sqlite3.connect()` in handlers.

   `db()` is the legacy raw-connect helper. Multiple raw connections
   contend for the WAL writer.

The same pattern is repeated in `reset_relationship` immediately below
(line 8873).

## Fix (scoped to this endpoint)

1. Switch to `with db_pool.get_connection() as conn:` so connections
   are properly serialized through the pool.
2. Move the `INSERT OR IGNORE` seed out of the GET — either:
   - Seed lazily inside a `with conn:` block (auto-rollback) and only
     when the SELECT returns no row (avoids the unconditional write)
   - Or seed at character-create time (preferred — pushes the write to
     the natural moment).
3. Wrap multi-statement writes in `with conn:` for atomicity per the
   same rule.

## Verification plan

1. Make the fix.
2. Reload the app, verify zero 500s in backend log over 60s of normal
   interaction.
3. Add a regression test: hit the endpoint 50× in quick succession
   from `pytest`, assert all 200.
4. Check whether bond UI / mood indicators that depend on this endpoint
   render correctly (silent 500s may have been masking visual bugs).

## Estimate

~30-60 min. Single function, clear pattern, regression test included.

## Linked

- `.claude/rules/backend-and-api.md` (the rule being violated)
- `backend/server.py:8836-8870` — `get_relationship`
- `backend/server.py:8873-8895` — `reset_relationship` (same fix needed)

## Resolution (2026-04-27, session 18)

Note: the rule cites `db_pool.get_connection()` but no such pool exists
in the codebase — `db()` is a raw `sqlite3.connect()`. So the fix is to
make the raw helper safe + drop the unconditional write.

Three changes landed:

1. **`db()` sets `PRAGMA busy_timeout = 30000`** (`backend/server.py:383`).
   30s wait on lock contention instead of immediate `OperationalError`.
   Fixes the *class* of bug everywhere `db()` is used, not just here.
2. **`get_relationship` is now SELECT-first, INSERT-on-miss.** The hot
   GET path no longer takes a write lock per call. Lazy seed wrapped
   in `with conn:` for atomicity.
3. **`reset_relationship` wraps the UPDATE/INSERT pair in `with conn:`.**
   Atomic + rolled-back on failure.

Verification:
- `backend/tests/test_relationship_endpoint.py` (new, 5 tests) — defaults
  for unseeded char, seed-only-once, 50× rapid-fire all 200, reset
  seeds + resets, `db()` sets busy_timeout=30000.
- Full pytest 2,683 passed (+5 new) in 16.7s.
- Live backend probe 10× sequential GETs all 200; backend log clean of
  any "error", "locked", or "500" since the restart.
