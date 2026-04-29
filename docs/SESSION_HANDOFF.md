# Session Handoff — 2026-04-28 (Session 19, continuation)

## Branch: master · Commits this turn: 6 (all pushed) · Session 19 total: 9 commits

This turn (after restart):
- `5ccf89a` fix(19): make love-letter test date relative to today
- `62923e4` fix(19-T2): HUD Tier 2 — collapse top toolbar 9 → 4 + ⋯ overflow
- `3bb8cce` fix(19-T2): db_ctx migration — all 193 handler sites (closes FD leak)
- `fb77235` test(19-T2): regression test for DB FD leak (200 reqs, delta < 50)
- `cc93e88` fix(19-T3): HUD Tier 3 — collapse bottom toolbar 3 rows → 1
- `c4fadc5` fix(19-T1b): sidebar bottom 5-col → 6-col — fits Help on row 1

Pre-restart (already in handoff):
- `aef220a` docs(19-T0) HUD audit · `3a1c60f` fix(19-T1) HUD Tier 1 deletes · `b6485d8` fix(19) DB autocommit

## Test Status: pytest **2684 ✓** · vitest 203 ✓ · tsc clean

## Completed this turn

### DB connection FD leak — CLOSED (`3bb8cce` + `fb77235`)
Mechanical migration of all 193 raw `db()` callsites in `backend/server.py` to
`with db_ctx() as conn:`. 5 sites correctly flagged for raw `db()` (the
`db_ctx` impl itself + 4 streaming-SSE generators that own the connection
across the handler return). Regression test `test_db_fd_leak.py` opens 200
sequential requests and asserts FD delta < 50; actual measured delta = 0.

The bug doc `docs/bugs/2026-04-28-db-connection-fd-leak.md` remains in the
tree as historical record but the bug status is now **CLOSED**.

### HUD Tier 2 — top toolbar 9 → 4 + ⋯ overflow (`62923e4`)
Right-side cluster of `StatusBar.tsx` cut from 8 icons + version pill down
to 4 controls (Search · Settings · 3D · ⋯) plus the small ContextBudgetPill
text status. Globe (global-search) replaced by a Thread / Global segmented
toggle inline with the slide-down search bar; selecting Global hands the
query to the existing global-search overlay. Chat-threads, export (3 formats
inline), soundscape, model-browser, and the version pill (with dev-mode
5-click unlock binding) all moved into a new `MoreHorizontal` overflow
popover. Browser-verified (overflow has all 7 items, scope toggle confirmed).

### HUD Tier 3 — bottom toolbar 3 rows → 1 (`cc93e88`)
`ChatThread.tsx` composer cut from 3 rows (in RP mode) down to a single
40px-tall input row. Removed: conditional whisper/quickfire row + 8-button
toolbar row + redundant `flex-col` wrapper. Added: ⚙ `SlidersHorizontal`
modes popover (7 menuitemcheckbox entries — scenario library, scenario
picker, VN, gestures, director, then a separator + whisper + quickfire
which appear only when rpStyle != 'none') + a segmented `Brief · Off ·
18+RP` status pill (3 click-to-cycle segments visually unified with one
border + middle-dot separators). Trigger button glows accent when popover
is open OR any mode is active. Voice icons + send unchanged. Browser-
verified composer height = 40px in light + dark themes.

### Sidebar bottom — 5-col grid → 6-col (`c4fadc5`)
The sidebar bottom toolbar grid had 5 columns but rendered 6 always-visible
items (Memory · Lore · Games · Stats · Ctx · Help), so Help wrapped to row
2 alone. Bumped `repeat(5, 1fr)` → `repeat(6, 1fr)`. All 6 icons now render
in row 1 (verified at y=665 alignment, grid height 57px). NotificationBadge
wraps to row 2 only when an unread notification exists (rare).

### Date-dependent test fix (`5ccf89a`)
`test_blocked_by_recent_letter` hardcoded `2026-03-29` as "yesterday" but
the 30-day cooldown elapsed once today rolled past 2026-04-28. Replaced
with `date.today() - timedelta(days=1)` and `days=31` for the relative
companion test. 5/5 in TestLoveLetterFrequency.

## Work In Progress
**None.** All work this turn is committed AND pushed to origin/master.

## Known Issues / Bugs Discovered NOT yet fixed

### Pre-existing portrait 404s (cosmetic, fall back works)
8× `/files/images/{nana,mikazuki,suzuha,tsukimi,shirayuki,alana}_portrait.png`
+ icon.png 404s in console. UX falls back to default avatar. Either ship the
missing PNGs or null out the stale `avatar_url` rows. (Carried over from
previous handoff.)

## Files Modified (this turn, 6 commits)

```
backend/server.py                                  | 4254 +++++++-----------  (db_ctx sweep)
backend/tests/test_db_fd_leak.py                   |   98 +                  (regression test)
backend/tests/test_phase6_voice_audio.py           |   10 +-                  (date fix)
frontends/sakura/src/views/ChatThread.tsx          |  214 +/-147              (Tier 3)
frontends/sakura/src/components/StatusBar.tsx      |  197 +/-137              (Tier 2)
frontends/sakura/src/components/Sidebar.tsx        |    5 +/-2                (sidebar 6-col)
docs/bugs/2026-04-28-db-connection-fd-leak.md      |  117 +                  (carry-over)
```

## Next Session Priorities

1. **HUD Tier 4 — bond strip simplify** — collapse the 4-row sticky bond
   header (avatar + name + green-dot + badges + 3 colored bars + 48× streak +
   Lv 0 line + XP bar) into a single line: `[avatar] Rin (Akane) ● night ·
   ♥Lv 0 Stranger 6/144 XP · 48🔥`. 3 colored bars + idle phrase move into
   click-to-expand panel. Saves ~80px above every conversation. Per
   `docs/plans/2026-04-27-hud-redesign-staged.md` Tier 4. ~2h. First tier
   that benefits from `frontend-design` skill A/B/C variants.

2. **Memory Browser browser QA** — hand-on Chrome, exercise Ctrl+M overlay
   all 4 tabs against real backend, file bugs as
   `docs/bugs/2026-04-*-memory-browser-*.md`. ~1–2h. (Carry-over from
   previous handoff.)

3. **Memory Browser raw-fetch → `api.*` unification** — Memories tab still
   uses raw `fetch()` against `/api/v2/memory/*`. Add `listMemories` /
   `searchMemories` / `deleteMemory` / `promoteMemory` to `api.ts`, refactor
   component, collapse the 7 Memories Vitest cases onto Pattern 2. ~2–4h,
   autonomous. (Carry-over.)

4. **Visual Content in Chat** — "Character sends you a picture" UX. Image-gen
   pipeline exists in backend. ~4–8h. (Carry-over.)

5. **(deferred)** HUD Tier 5 — sidebar bottom consolidation. Already half-
   addressed by Tier 1b (6-col grid). Skip unless user asks.

6. **(deferred)** HUD Tier 6 — 3D viewer overlay rethink (12+ controls).
   ~3–4h.

## Context for Next Session

- Servers torn down at handoff. Backend is on the migrated `db_ctx`, all FD
  leak risk closed. Run `/verify-servers` after restart if uncertain.
- Browser state: Playwright closed. No screenshots left in repo root.
- Active plan file: `docs/plans/2026-04-27-hud-redesign-staged.md`.
  Status logs for Tier 0, Tier 1, Tier 2, Tier 3 all appended (no rewrites).
- DB schema unchanged at v70 (no migrations this turn).
- Existing `layoutMode` triplet (`normal | compact | mobile`) in
  `appStore.ts:19` is a half-finished feature — only consumed by
  `CreateView.tsx:603` (hides one description block) and SessionDrawer
  swipe gestures. NOT a real HUD density mode. User decided not to add a
  new density toggle; Tier 3 ships as default-for-everyone instead. If a
  future tier wants to repurpose `layoutMode='compact'` to actually mean
  HUD-compact, it's free real estate.
- Tier 3 promised "1 row" delivered as 1 row — no voice-overflow chevron
  needed (the 4 voice icons already lived in the input row, removing the
  toolbar row above was sufficient).
- The `layoutMode` repurpose option from the AskUserQuestion choice was
  explicitly **declined** by the user — leave it untouched.
