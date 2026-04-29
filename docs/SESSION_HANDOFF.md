# Session Handoff — 2026-04-28 (Session 19)

## Branch: master · Commits this session: 3 (all unpushed)

- `aef220a` docs(19-T0): HUD element audit complete
- `3a1c60f` fix(19-T1): HUD Tier 1 — 5 layout deletes/moves
- `b6485d8` fix(19): db autocommit + db_ctx — kill `database is locked` 500s

## Test Status: pytest 2682 ✓ (1 unrelated date-test failure) · vitest 203 ✓ · tsc clean

## Completed this session

### HUD Redesign — Tier 0 audit (commit `aef220a`)
- 4 parallel codebase-analyst agents mapped every HUD element across
  9 zones with first-introduced commit, importance, proposed visibility
  tier. Output: `docs/research/2026-04-27-hud-element-audit.md` (358
  lines).
- Major findings beyond inventory: top toolbar has 17 elements not 8
  (8-element composer secondary row was missed); 3D viewer has 30+
  controls not 12+; "floating Next: tooltip" bug was misdescribed —
  actual cause is BondProgressBar stacking 3 rows in the sticky header,
  not z-index conflict. 5 free deletes surfaced for Tier 1.
- Decided: `frontend-design` skill (browser-preview A/B/C variants)
  fits at Tiers 4, 6, 7 (visual-decision tiers), NOT as a separate
  ladder option.

### HUD Redesign — Tier 1 deletes/moves (commit `3a1c60f`)
Pure bug fixes + dead-UI deletes from the audit. -48 +20 across 5 files.

1. ContextBudgetPill moved from absolute-positioned overlay
   (`ChatThread.tsx`) into StatusBar right-side icon group between
   model-browser and settings — kills overlap with conversation
   starters in empty chat.
2. Inline "Next:" unlock teaser line removed from BondProgressBar;
   moved to native title-tooltip on the bond pill + appended to
   aria-label. Sticky header drops 1 row.
3. Dead `TemperatureMeter temperature={0}` import + use removed from
   chat-area mid toolbar (F21 not yet wired).
4. Duplicate viewer Close button at bottom-left of 3D panel deleted;
   "Back to Chat" pill in top bar remains as the single close
   affordance (more discoverable, always visible).
5. Stale `Ctrl+0 Reset` HUD hint in viewer.html corrected to
   `Dbl-click Reset`. Iframe cache-bust bumped `?v=8` → `?v=9`.

Browser-verified via Playwright on a populated session (Rin/Akane):
ContextBudgetPill renders in StatusBar top-right
(`1.7k / 262.1k 0.6%`), bond card shows level/tier/XP only, viewer
bottom-left has only "Models" remaining (no duplicate Close),
Dbl-click hint confirmed via curl on `?v=9` served HTML.

### DB connection lock 500s (commit `b6485d8`)
`POST /api/sessions` was 500ing intermittently with
`OperationalError: database is locked` even though session 18 had set
WAL mode + `busy_timeout = 30000`.

Root cause was NOT lock contention. Python sqlite3's default
`isolation_level=""` holds an implicit BEGIN from the first INSERT
until `commit()` is called; ~200 `db()` callers in server.py never
call `commit()` (or even `close()`). Forgotten commits leave the
writer lock dangling past `busy_timeout` until the conn is GC'd.

Fix: `db()` now uses `isolation_level=None` (autocommit). Each
statement is atomic — no dangling write locks possible. Multi-
statement atomicity remains opt-in via `with conn:` (only 4 such
callers; existing usages still work in autocommit mode).

Verification: 50× sequential POST /api/sessions = 50× HTTP 200, zero
500s. Previously would 500 after ~10 min polling load.

Also added: `db_ctx()` context-manager helper, `_AutoCloseConnection`
subclass (defense-in-depth, see open issue below). Migrated
`create_session` and `get_relationship` as templates.

## Work In Progress
**None.** All session 19 work is committed.

## Known Issues / Bugs Discovered NOT yet fixed

### Connection FD leak (P2, slow-burn) — `docs/bugs/2026-04-28-db-connection-fd-leak.md`
Separate bug from the lock 500s above (which IS fixed).

Symptom: `lsof backend/storage/app.db | wc -l` climbs ~1 FD per GET
request to handlers using raw `db()` without explicit close. After
600 mixed GETs: 401 FDs to the `.db` file alone. Eventually starves
OS soft FD limit.

What was tried this session and didn't work:
- `_AutoCloseConnection` subclass with `__del__`: works in
  scripts/in-process tests, does NOT fire reliably under uvicorn —
  FastAPI/Starlette retains frame refs past handler return.
- `gc.collect()` in HTTP middleware: no effect, reverted.

What works: `db_ctx()` context manager (verified — 200 GETs to
`/relationship` migrated to db_ctx = 0 leak; 200 GETs to `/bond`
still raw db() = 201 leak).

**Recommended next-session fix:** Dispatch ONE `senior-dev` agent
for a sequential single-file mechanical migration of all ~197
remaining `db()` call sites in `backend/server.py` to
`with db_ctx() as conn:`. Mechanical pattern, pytest validates each
chunk. Estimated 2–4h. Add a regression test that asserts FD count
stays bounded over N sequential requests.

### Pre-existing test failure (date-dependent, NOT my regression)
`backend/tests/test_phase6_voice_audio.py::TestLoveLetterFrequency::test_blocked_by_recent_letter`

Test hardcodes `2026-03-29` as "yesterday's date — too recent" but
today is `2026-04-28`. 30-day cooldown has elapsed → assertion
inverts. Should be fixed by making the date relative to `today() -
timedelta(days=1)` instead of hardcoded.

### Pre-existing portrait 404s (cosmetic, fall back works)
8× `/files/images/{nana,mikazuki,suzuha,tsukimi,shirayuki,alana}_portrait.png + icon.png` 404s in console. UX falls back to default avatar (initial letter bubble), non-blocking. Either ship the missing PNGs or null out the stale `avatar_url` rows.

## Files Modified (this session)

```
backend/server.py                                 |  76 +++++++++++++++++--
backend/tests/                                    | (no changes)
docs/bugs/2026-04-28-db-connection-fd-leak.md     | 117 ++++++++++++++++++++++++
docs/plans/2026-04-27-hud-redesign-staged.md      |  +6 status log + linked
docs/research/2026-04-27-hud-element-audit.md     | 358 ++++++ NEW
frontends/sakura/src/components/BondProgressBar.tsx | -15 +6
frontends/sakura/src/components/ModelPanel.tsx    | -16 +5
frontends/sakura/src/components/StatusBar.tsx     |  +6
frontends/sakura/src/views/ChatThread.tsx         | -16 +0
frontends/shared/viewer/viewer.html               | -1 +1
```

## Next Session Priorities

1. **HUD Tier 2** — collapse top toolbar 9 → 4 (3 visible + `⋯`
   overflow). Tier 0 audit recommends keeping {chat-threads,
   settings, 3D-toggle} OR {global-search, settings, 3D-toggle},
   merging thread-search + global-search into single search with
   scope toggle, moving {export, soundscape, model-browser} to
   `⋯` overflow popover, version pill → Settings/About. ~1h. Use
   `theme-auditor` agent to verify against 1 light + 1 dark theme.
   Single biggest visual peak-screen relief possible. Per plan,
   pause + evaluate after this — likely good-enough stopping point.

2. **DB FD leak migration** — see open bug doc. Dispatch
   `senior-dev` agent for mechanical sweep of `db()` →
   `db_ctx()` across server.py. Add a regression test
   (`test_db_fd_leak.py`) that opens 200 connections via the test
   client and asserts `lsof` handle count stays bounded.

3. **Date-dependent test fix** — make the hardcoded `2026-03-29`
   in `test_phase6_voice_audio.py:397` relative to today.

4. **(deferred)** HUD Tier 4 (bond strip simplify) — first tier
   that benefits from `frontend-design` skill A/B/C variants. Bond
   pill format, bar style, streak placement have aesthetic
   tradeoffs.

## Context for Next Session

- Servers torn down at handoff. Run `/verify-servers` after restart.
- Browser state: Playwright closed.
- Active plan file: `docs/plans/2026-04-27-hud-redesign-staged.md`
  with Tier 0 + Tier 1 status logs appended (no rewrites).
- `aef220a` + `3a1c60f` + `b6485d8` are unpushed. Push when ready.
- DB schema unchanged at v70 (no migrations this session).
- `_AutoCloseConnection` subclass kept in tree as defense-in-depth
  even though it doesn't help in uvicorn context — it's free in
  non-server contexts and the docstring documents the limitation.
- The user's directive at end of session: "context getting too high,
  exit and try again from a different angle." The DB leak migration
  was the spinning point — fresh session will be more efficient
  for the 197-site sweep.
