# DB Connection FD Leak (separate from the lock-500 issue)

**Filed:** 2026-04-28 (session 19)
**Severity:** P2 (slow degradation, eventually starves OS FDs)
**Status:** ✅ FIXED in session 19 commit `3bb8cce` — full `db_ctx()` migration of all 193 raw `db()` callsites in `backend/server.py`. Regression test in `fb77235`. Closes the partial fix that landed earlier in this same session.
**Related:** session 18 handoff "POST /api/sessions intermittent 500s",
which was actually two distinct bugs conflated.

## Two distinct bugs, two distinct fixes

### Bug A: `database is locked` 500 errors — ✅ FIXED in commit (this session)

**Symptom:** POST /api/sessions returned 500 with
`sqlite3.OperationalError: database is locked` despite WAL mode and
`PRAGMA busy_timeout = 30000` (added in session 18).

**Root cause:** Python sqlite3's default `isolation_level=""` opens an
implicit `BEGIN` on the first INSERT. If the caller never calls
`commit()` (common across this file's ~200 `db()` callers), the writer
lock dangles past `busy_timeout` until the connection is GC'd. Other
writers see "locked" and 500 out.

**Fix:** `isolation_level=None` (autocommit mode) on `db()`. Each
statement is its own atomic txn — no dangling write locks possible.
Multi-statement atomicity remains opt-in via `with conn:` (only ~4
callers need this; existing `with conn:` usages still work in
autocommit mode).

**Verification:** 50 sequential POST /api/sessions = 50× HTTP 200, zero
500s. Previously would 500 intermittently after ~10 min of polling.

### Bug B: FD accumulation — ❌ STILL OPEN

**Symptom:** `lsof backend/storage/app.db | wc -l` climbs ~1 FD per
GET request to handlers that use raw `db()` and don't explicitly
`.close()`. After 600 mixed GETs against running backend: 401 FDs to
the .db file alone (plus another ~400 each for .db-wal and .db-shm).
Over many hours of polling this would hit OS soft FD limits
(default 256–1024 on macOS) and the server would stop accepting work.

**Why this didn't bite us yet:** modern macOS `ulimit -n` is typically
256 or higher and the connection FDs do eventually GC if the process
sits idle long enough (kernel pressure forces collection). But it's a
ticking timer.

**What we tried this session:**

1. ✅ **Added `db_ctx()` context-manager helper.** Migrating handlers
   to `with db_ctx() as conn: ...` releases FDs deterministically on
   block exit. Verified: 200 GETs to `/relationship` (migrated to
   `db_ctx`) = 0 FDs leaked. 200 GETs to `/bond` (still raw `db()`) =
   201 FDs leaked.

2. ❌ **Tried `_AutoCloseConnection` subclass with `__del__`.** Kept
   in `backend/server.py` as defense-in-depth — works in non-FastAPI
   contexts (in-process scripts, background tasks). Does NOT fire
   reliably under uvicorn. Suspected cause: FastAPI/Starlette's
   request scope, exception context, or response serializer retains
   references to handler locals past return, so refcount never drops
   to 0 while the request is live, and the cycle collector defers
   finalization indefinitely.

3. ❌ **Tried `gc.collect()` in HTTP middleware** (between handler
   return and response). Did not change the leak count — confirmed
   the FastAPI frame retention isn't reachable via cycle collection.
   Reverted.

**Migrated this session (these handlers no longer leak):**
- `POST /api/sessions` — `create_session`
- `GET /api/characters/{char_id}/relationship` — `get_relationship`

**Not yet migrated (~197 `db()` callers still in server.py):**
all GET/POST/PUT handlers in `backend/server.py` that use the pattern
`con = db(); con.execute(...); return ...` without an explicit
`con.close()`.

## Recommended next-session fix

Dispatch ONE `senior-dev` agent (sequential, single-file work) to
migrate every `db()` call site in `backend/server.py` to use
`db_ctx()` or explicit try/finally close. Mechanical refactor:

```python
# BEFORE
conn = db()
row = conn.execute("SELECT ...").fetchone()
return {"row": row}

# AFTER
with db_ctx() as conn:
    row = conn.execute("SELECT ...").fetchone()
return {"row": row}
```

Special cases:
- Existing `with conn:` (multi-statement atomic) → wrap with
  `db_ctx()` outside, keep `with conn:` inside for txn boundary
- Streaming endpoints that pass conn into a generator → migrate
  carefully, conn lifetime must outlive the generator
- WebSocket handlers (`/ws/voice`) — connection is intentionally long-
  lived per WS session; explicit close on disconnect is correct

Estimated effort: 2–4h with one agent + careful pytest validation
after each chunk. Add a regression test that opens N=200 connections
and asserts FD count stays bounded.

## Why this can wait until next session

- Lock 500s (the burning bug) are fixed via autocommit
- FD leak is slow-burn, not user-blocking yet
- Migration is large and benefits from fresh session context
- Two handlers already migrated as templates for the rest

## Files touched this session

- `backend/server.py` — `db()` autocommit + `_AutoCloseConnection` +
  `db_ctx()`, `create_session` + `get_relationship` migrated
