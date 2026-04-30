# Session Handoff — 2026-04-29 (Session 21, audit + cleanup + bond pill bump)

## Branch: master · Commits this session: 4 (all pushed)

This session pushed 6 commits total to `origin/master` —
the 2 commits carried over from Session 20 plus 4 new ones:

- `1534155` feat(sakura): bond pill size bump (~15%)
- `6bb69f4` build(sakura): rebuild dist (session 20 SW cache + boot retry)
- `39dbdae` chore(21): relocate Session 19 Tier 4 screenshots
- `18224cb` chore(21): sync stale paperwork
- `a2ac04a` feat(sakura): boot retry + backend-unreachable banner (Session 20)
- `f8e4ef0` fix(sakura): SW cache name now includes build id (Session 20)

## Test Status: pytest **2684 ✓** · vitest **207 ✓** · tsc clean · push gate clear

## Completed This Session

### 1. /pre-session priority audit (no commit, conversation only)
User asked to verify the 5 priorities surfaced by `/pre-session` against
ground truth. Audit findings written to `~/.claude/plans/drifting-plotting-garden.md`:

| Original priority | Verdict |
|---|---|
| Push 2 commits | ✅ valid — pushed |
| Move Session 19 screenshots | ✅ valid — moved |
| Right-cluster `..` → `⋯` | ⚠ misdiagnosed — `MoreHorizontal` Lucide icon already renders `⋯`. Actual narrow-width issues are header-title CSS truncation + bond-bar/right-cluster overlap at <1024px, both unrelated to the overflow icon |
| Tier 4 evaluate | ✅ valid — user later confirmed "looks normal again" |
| Visual Content in Chat | ✅ valid — still on queue |

Missing items added: stale `RESUME_PROMPT.md`, stale FD-leak bug doc,
stale `CURRENT_STATUS.md` Next Tasks list, untriaged model picker bug,
bond pill size bump.

### 2. Group A — Cleanup & paperwork (commits 18224cb + 39dbdae + 6bb69f4)

- Pruned `CURRENT_STATUS.md` Next Tasks list — sessions 16-20 work
  consolidated into a "completed since" header, queue rewritten around
  6 active items (push, Tier 4 evaluate, `..` verify, model picker bug,
  Visual Content, narrow-width bugs)
- Replaced stale `docs/plans/RESUME_PROMPT.md` (Session 14 contents)
  with a pointer stub directing readers to `CURRENT_STATUS.md` +
  `SESSION_HANDOFF.md`. The file drifts whenever sessions only run
  `/handoff` (which doesn't refresh it) and skip `/checkpoint` (which
  used to). Stub avoids confusing future cold starts
- Marked `docs/bugs/2026-04-28-db-connection-fd-leak.md` ✅ FIXED with
  reference to commit `3bb8cce` (193-site `db_ctx` migration in
  Session 19) and regression test commit `fb77235`
- Captured Session 20's `docs/SESSION_HANDOFF.md` (was modified but
  uncommitted at session start)
- Relocated 9 `tier4-*.png` + `snap-collapsed.md` from repo root to
  `docs/testing/screenshots/2026-04-28-tier4/` — pure file move
- Committed `frontends/sakura/dist/*` rebuild artifacts (28 files
  changed) from Session 20's verification `vite build`. Sakura `dist/`
  is intentionally tracked (`.gitignore` has `!frontends/sakura/dist/`)

### 3. Group B — Browser-verified the `..` claim (no code changes)

Started backend + sakura, drove Playwright at 1280/1024/800 widths,
screenshotted top-right cluster:
- `MoreHorizontal` icon renders correctly as `⋯` at every width
- Real narrow-width issues are: header title truncates `Rin (Akane)` →
  `Rin (...` at 800px; bond bar XP text overlaps the right-cluster
  pills at 800px; composer placeholder line-wraps inside input
- These are layout bugs unrelated to the `..` claim. Folded into
  `CURRENT_STATUS.md` next-task list

Screenshots committed at `docs/testing/screenshots/2026-04-29-bond-pill-bump/verify-narrow-{800,1024,1280}.png`

### 4. Bond pill size bump (commit 1534155)

Closes the HUD Tier 4 evaluate gate. User confirmed Tier 4 layout
(SW-cache fix held), so the natural follow-up was a modest size bump
for legibility — the new one-line bond display was readable but easy
to overlook.

`frontends/sakura/src/components/BondPill.tsx` changes (collapsed row only):
- `fontSize`: main row 12→13 · XP text 11→12 · streak badge 10→11
- icons: `Heart` 12→14 · `Caret` 14→16
- progress bar: `60×5 → 80×6`
- `padding`: 6/10 → 7/12 · `gap`: 6→7 · streak `padding` 1/5 → 2/6

Verified via Playwright at 1280×800 (collapsed + expanded panel) and
800×600 (no narrow-width regression — pre-existing overlap unchanged).

Visual artifacts at `docs/testing/screenshots/2026-04-29-bond-pill-bump/bond-pill-after-{1280,800}.png` + `bond-pill-expanded-after-1280.png`.

## Work In Progress

**None.** All 4 commits pushed. Audit plan saved at
`~/.claude/plans/drifting-plotting-garden.md` (durable but private to
~/.claude, not in repo).

## Known Issues / Bugs

### Open — needs work
- **Narrow-width header/bond-bar overlap** (<1024px viewports). Bond
  bar `XP` text gets covered by the search/budget cluster; chat header
  title CSS-truncates to `Rin (...`; composer placeholder line-wraps
  inside the input. Filed as next-task #3 in `CURRENT_STATUS.md`.
  Repro screenshots at `docs/testing/screenshots/2026-04-29-bond-pill-bump/verify-narrow-800.png` and `bond-pill-after-800.png`.
- **Model picker preview images** (P2, OPEN). Existing bug doc:
  `docs/bugs/2026-04-27-model-picker-no-preview-images.md`. Untriaged.

### Not bugs (resolved this session)
- ~~`..` overflow icon claim~~ — misdiagnosis, see Group B
- ~~`docs/bugs/2026-04-28-db-connection-fd-leak.md` OPEN status~~ —
  was actually closed in Session 19, doc updated

## Files Modified This Session

```
CURRENT_STATUS.md                                              +21 -16
docs/SESSION_HANDOFF.md                                        +118-180  (Session 20 content captured)
docs/bugs/2026-04-28-db-connection-fd-leak.md                  +1  -1
docs/plans/RESUME_PROMPT.md                                    +20 -59
docs/testing/screenshots/2026-04-28-tier4/*                    +10 (NEW: Session 19 screenshot relocate)
docs/testing/screenshots/2026-04-29-bond-pill-bump/*           +6  (NEW: this-session verify + after)
frontends/sakura/src/components/BondPill.tsx                   +11 -11
frontends/sakura/dist/*                                        +28 files (rebuild churn)
```

`backend/storage/app.db` and `backend/config/app.json` carry runtime
state — left modified, NOT committed (sensitive paths per CLAUDE.md).

## Next Session Priorities

1. **HUD Tier 5 (sidebar consolidate) or Tier 6 (3D viewer overlay rethink)** —
   only if user wants more pruning. Tier 4 chapter is functionally
   closed; user has a real-use window to decide. Plan:
   `docs/plans/2026-04-27-hud-redesign-staged.md`. Each tier ~1.5–4h.
2. **Visual Content in Chat** — "Character sends you a picture" UX.
   Image-gen pipeline already in backend. ~4–8h, multi-session.
3. **Narrow-width header/bond overlap fix** — ~1–2h, single-commit.
   StatusBar.tsx top header layout at <1024px.
4. **Model picker preview image bug** (P2 OPEN, untriaged). Effort
   unknown until first read of the bug doc.
5. **Push and PR Discipline rule documentation** — already added to
   CLAUDE.md (commit `06bc348`); no follow-up needed unless user
   wants the rule extended.

## Context for Next Session

- **Active plan:** `docs/plans/2026-04-27-hud-redesign-staged.md`.
  Tier 0/1/1b/2/3/4 done + bond pill bump (which was the Tier 4
  follow-up alternative listed at line 19 of `CURRENT_STATUS.md`).
  Tier 5 / Tier 6 / Tier 7 / Tier 8 unstarted; user choice whether
  to continue ratcheting or call HUD work done.
- **Push gate:** clear. No active `OPEN BUG` / `UNFIXED` / `BLOCKER`
  markers in `CURRENT_STATUS.md` or this file. Future sessions can
  push freely until a new marker appears.
- **`docs/plans/RESUME_PROMPT.md` is now a stub.** Treat
  `CURRENT_STATUS.md` + this file as the canonical handoff. If you
  want per-session resume instructions back, run `/checkpoint` (the
  full ritual) and the file will be rewritten.
- **Audit-mode plan file:** `~/.claude/plans/drifting-plotting-garden.md`
  (private, not in repo). Records the priority audit reasoning if you
  need to revisit.
- **Servers stopped** at end of session. Restart with `./run.sh` and
  `cd frontends/sakura && npx vite --port 5175`.
- **Sensitive area touched (mild):** `BondPill.tsx` is part of the
  chat header layout (Known Sensitive Area: column resize / layout
  reflow). Bump is pure size/font/padding — no `var()` change, no
  logic change, no theme contract change. Verified across collapsed
  + expanded states + narrow widths. Per Suggestion Triggers rule a
  `/qa-sweep` could be run, but the change scope is single-file UI
  cosmetics; user can skip unless they want the extra reassurance.
