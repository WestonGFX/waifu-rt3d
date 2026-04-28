# Session Handoff — 2026-04-27 (Session 18)

## Branch: master · Commits this session: 4 (all unpushed)
## Test Status: pytest 2,683 passed · vitest 203 passed · tsc clean

## Completed This Session

### Memory Browser closeout
- **`refactor(18): MemoryBrowser raw-fetch → api.* unification`** (`7b7bce1`)
  - Added `MemoryItem` interface + 4 typed methods to `api.ts`:
    `listMemories` / `searchMemories` / `deleteMemory` / `promoteMemory`
  - Refactored `MemoryBrowser.tsx` Memories tab — 4 raw `fetch()` calls
    replaced with `api.*` helpers. Local `Memory` interface deleted.
  - Test suite collapsed: removed `makeFetchStub` URL+method router
    (~50 lines). 7 Memories cases now use Pattern 2
    (`vi.mocked(api.*).mockResolvedValue`).

### Backend stability — 3D viewer + greeting endpoint chain unblocked
- **`fix(backend): db-lock 500s on /api/characters/{id}/relationship`** (`8a1f3f5`)
  - `db()` helper now sets `PRAGMA busy_timeout = 30000` per connection.
    Fixes the *class* of WAL-writer-contention bug across all `db()` users.
  - `get_relationship` switched to SELECT-first / INSERT-on-miss. Hot
    GET path no longer takes a write lock per call.
  - `reset_relationship` wrapped in `with conn:` for atomic UPDATE/INSERT.
  - New regression test `backend/tests/test_relationship_endpoint.py`
    (5 tests): defaults, lazy-seed-once invariant, 50× rapid-fire all
    200, reset seeds + resets, `db()` busy_timeout=30000.

- **`fix(viewer+backend): unblock 3D viewer + greeting endpoint chain`** (`643bd24`)
  - **THE viewer crash** — `BlinkController` constructor in
    `viewer.html` called `this._poissonDelay()` BEFORE initializing
    `this._emotionMod`. `_poissonDelay()` reads `_emotionMod.rateMul`,
    so it crashed *inside the GLTFLoader success callback* with
    `TypeError: Cannot read properties of undefined (reading
    'rateMul')`. The crash happened AFTER the VRM file fully
    downloaded — the viewer never sent `modelLoaded` and the parent
    React app stayed stuck on "Loading 3D model..." forever, appearing
    as a blank viewer panel. Fixed by reordering the constructor.
  - Bumped iframe `?v=7` → `?v=8` in `ModelPanel.tsx` so clients dodge
    cached old viewer.html.
  - Three phantom-column SQL bugs in `get_character_greeting` fixed:
    `greeting_message` → `greeting_text`, `sessions.updated_at` →
    `MAX(messages.ts) WHERE char_id`, `sessions.character_id` →
    `messages.session_id WHERE char_id` (sessions has no character
    link). Same `sessions.character_id` bug in diary endpoint (line
    9476) fixed in passing.
  - New regression test
    `frontends/sakura/src/test/viewer.blinkController.test.ts` (3
    tests). Reads `viewer.html` as text, asserts `_emotionMod` is
    assigned BEFORE `_poissonDelay()` in the BlinkController
    constructor.
  - **Verification:** Playwright drove sakura → opened 3D viewer → VRM
    character (Panicandy / Rin Akane) renders at 118 FPS with
    `motion_neutral` animation playing. Console clean of TypeErrors.

### HUD redesign plan written (deferred to session 19+)
- **`docs(plan): staged HUD redesign — 8-tier intensity ladder`** (`6255578`)
  - `docs/plans/2026-04-27-hud-redesign-staged.md` — 262 lines.
  - 8-tier escalation ladder, escalate only when previous tier is
    judged insufficient. Recommended order: 0 → 1 → 2 → pause → 4 →
    pause → 3 → 6 → 5 → 7 → 8. Most users stop after tier 2-4.
  - Hard constraints baked in: no new chrome, theme test per tier,
    one commit per tier, 10-min real-use evaluation gates between
    tiers.

### Bug docs filed (4 new in `docs/bugs/`)
- `2026-04-27-character-relationship-db-lock.md` — ✅ FIXED
- `2026-04-27-viewer-or-model-assignment-broken.md` — ✅ FIXED
- `2026-04-27-model-picker-no-preview-images.md` — open, P2 UX
- `2026-04-27-hud-cramped-overcrowded.md` — open, P1 UX debt
  (now has implementation plan above)

## Work In Progress
- Nothing in progress. All session 18 work committed.

## Known Issues / Bugs Discovered (NOT yet fixed)

### POST /api/sessions intermittent 500s (DB connection leak)
- Symptom: After ~10 min of normal browser polling, `db()` accumulates
  130+ open connections. Eventually one of them holds the write lock
  indefinitely; subsequent `INSERT INTO sessions` hits `database is
  locked` even with the new 30s busy_timeout.
- Verified during session 18 via `lsof backend/storage/app.db | wc -l`
  → 138 handles on PID 52591.
- Restart clears it. Underlying fix needs `db()` callers to use a
  context manager (`with db() as conn:` requires `db()` to return a
  contextmanager wrapper) OR a real connection pool.
- Out of scope for this session. Filed mentally; needs its own bug doc
  next session.

### Stale character portrait 404s
- Console shows 8× 404 on `/files/images/{nana,mikazuki,suzuha,
  tsukimi,shirayuki,alana}_portrait.png` + `icon.png`.
- These are character data references to portrait files that don't
  exist on disk. UX falls back to default avatar (initial letter
  bubble), so non-blocking.
- Lower priority. Either ship the missing PNGs or null out the stale
  `avatar_url` rows.

## Files Modified (this session)

```
backend/server.py                                  |  96 +++++---
backend/tests/test_relationship_endpoint.py        | 114 +++++++++
docs/bugs/2026-04-27-character-relationship-...    | 105 +++++++++
docs/bugs/2026-04-27-hud-cramped-overcrowded.md    |  68 ++++++
docs/bugs/2026-04-27-model-picker-no-preview-...   |  55 +++++
docs/bugs/2026-04-27-viewer-or-model-assign...     | 120 ++++++++++
docs/plans/2026-04-27-hud-redesign-staged.md       | 262 +++++++++++++
frontends/sakura/src/components/MemoryBrowser.tsx  |  41 +---
frontends/sakura/src/components/ModelPanel.tsx     |   2 +-
frontends/sakura/src/lib/api.ts                    |  81 +++++++
frontends/sakura/src/test/MemoryBrowser.test.tsx   | 179 +++++---------
frontends/sakura/src/test/viewer.blinkController.test.ts |  67 ++++++
frontends/shared/viewer/viewer.html                |   8 +-
13 files changed, 1017 insertions(+), 181 deletions(-)
```

## Next Session Priorities

1. **HUD redesign Tier 0 (audit)** — `docs/plans/2026-04-27-hud-redesign-staged.md`.
   Build the spreadsheet: every HUD element across all 7 zones, with
   feature, session added, importance ranking, proposed visibility
   tier. Output: `docs/research/2026-04-XX-hud-element-audit.md`.
   ~1h. Prereq for everything else in the ladder.

2. **HUD Tier 1 (layout bug fixes)** — fix the floating "Next:
   Character uses your name (Lv 1)" tooltip overlapping chat content,
   and the "1.7k / 262.1k" context-budget pill overlapping conversation
   starters. Pure bug fixes, no UX changes. ~30 min.

3. **HUD Tier 2 (top toolbar overflow)** — collapse the 8-icon top
   strip to 3 visible + `⋯` overflow popover. ~1h. Single biggest
   visible relief possible without behavior change. **Pause and
   evaluate after this** — likely good-enough stopping point for many
   users.

4. **(Out-of-band)** Investigate the `db()` connection leak for
   `/api/sessions` 500s. Needs a context manager refactor or a real
   pool. Filed in this handoff under Known Issues.

## Context for Next Session

- **Servers WERE running at handoff** — backend on 8080 (PID 52591),
  sakura vite on 5175. Whether they're still up by next session
  depends on machine state. Run `/verify-servers` to check before
  claiming anything.
- **Browser state:** Playwright session was open at
  `http://localhost:5175/sakura/` with the 3D viewer panel toggled
  open. Will need fresh navigate next time.
- **Active plan file:** `docs/plans/2026-04-27-hud-redesign-staged.md`.
  Tiers 0–8 — start with Tier 0.
- **Key decision logged in plan:** The 8-tier ladder is *deliberately*
  overengineered as a discipline mechanism. The user explicitly asked
  for staged escalation so we don't big-bang a redesign in sensitive
  areas. Read the plan's "Why staged?" section before deviating.
- **Working tree dirty** — pre-existing modifications to
  `CURRENT_STATUS.md` (will be updated by /handoff itself),
  `backend/config/app.json`, `backend/storage/app.db` (DB writes from
  the running backend). Plus 10 untracked `viewer-*.png` debug
  screenshots from session 18 Playwright runs and one
  `.claude/scheduled_tasks.lock`. Safe to delete the PNGs; the lock
  file is harmless.
- **DB schema is at v70** (per CURRENT_STATUS, unchanged this
  session — no migrations).
- **Ollama, not LM Studio** — user mentioned mid-session that they
  switched LLM provider. Doesn't affect backend logic but the greeting
  endpoint LLM call may behave differently when the user reloads the
  app.
