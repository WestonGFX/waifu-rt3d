# Session Handoff — 2026-04-28 (Session 19, Tier 4 turn)

## Branch: master · Commits this turn: 1 (pushed) · Session 19 total: 10 commits

This turn:
- `6120377` fix(19-T4): HUD Tier 4 — bond strip 4-row block → 1-line click-to-expand pill

Earlier this session (already in handoff history):
- `fc3588a` chore(19): post-restart status sync · `c4fadc5` Tier 1b sidebar 5→6 col · `cc93e88` Tier 3 composer 3→1 row · `fb77235` FD-leak regression test · `3bb8cce` db_ctx 193 sites · `62923e4` Tier 2 top toolbar 9→4 · `5ccf89a` love-letter date · `af39c53` mid-session handoff · `b6485d8` db autocommit · `aef220a` Tier 0 audit · `3a1c60f` Tier 1 deletes.

## Test Status: pytest **2684 ✓** · vitest **203 ✓** · tsc clean

## Completed This Turn

### HUD Tier 4 — bond strip simplify (`6120377`)
New `BondPill.tsx` (frontends/sakura/src/components/BondPill.tsx, 469 lines)
collapses the 4-row chat-header bond block into a single 28px pill.

**Always-visible row:** `♥ Lv N · Tier · 60px inline progress bar · XP/XP_to_next · 🔥 streak (if > 0) · ▼ caret`

**Click toggles a floating popover** (`position:absolute; z-index:30`)
anchored under the pill, containing the affinity tier badge, 3 mini bars
(♥ ✦ ◈), affinity sparkline, next-unlock teaser, and idle phrase.

**Critical design decision:** popover floats over chat content (zero
layout reflow on toggle). The first implementation expanded inline via
`height:0 → auto`, which pushed the parent flex column taller and shoved
the composer off-screen at certain DPR/zoom combos — fixed by switching
to overlay before commit.

**StatusBar.tsx cleanup:** removed `TIER_BADGE_COLORS`, `TIER_BADGE_LABELS`,
the `RelationshipBar` function, `scoreColor`, `AFFINITY_TIERS`,
`getAffinityTier`, the `RelationshipData` interface — all dead after
content moved into BondPill. Net `-187` lines. `StreakBadge.tsx` and
`BondProgressBar.tsx` files retained (BondPanel.tsx still uses
BondProgressBar; StreakBadge has no remaining callers — kept for one
cycle, safe to delete next session).

User picked variant **B (pill + inline mini-bar)** from a 3-option
AskUserQuestion fork (variants A bare-pill / B inline-bar / C
underline-bar).

**Browser-verified in Playwright:**
- 998×624 (matches user's effective CSS viewport at 2x DPR): collapsed +
  expanded both render correctly, composer + sidebar bottom toolbar
  visible in both states
- 1400×900 dark (catppuccin-macchiato) + 1440×900 + 1995×1248 in light
  (catppuccin-latte): popover floats over chat, layout stable

## Work In Progress
**None.** Tier 4 committed AND pushed. But see "Open bug" below — there
is an unresolved layout regression that user reports seeing live but I
could not reproduce in any Playwright run.

## Open Bug — HUD layout regression at user's Chrome (UNFIXED)

**Symptom (per user, screenshots provided across the session):** Sakura
renders in the top-left of the Chrome viewport with significant empty
void to the right and bottom. Composer and sidebar-bottom toolbar are
not visible. User describes it as "zoomed into top-left corner so that
the bottom right corner does NOT match the edge of the browser window."

**My reproductions failed.** Ran Playwright at 998×624, 1440×900,
1995×1248 across welcome screen, chat thread, expanded bond pill — app
fills the viewport in every case.

**User's diagnostic (paste from their Chrome console):**
```json
{"innerWH":[1440,900],"dpr":1,"zoom":"95%",
 "rootRect":{"x":0,"y":0,"width":1440,"height":900,...},
 "bodyRect":{"x":0,"y":0,"width":1440,"height":900,...},
 "rootChildRect":{"x":0,"y":0,"width":1440,"height":900,...},
 "composerVisible":false}
```

The diagnostic says viewport is 1440x900 AND root fills it. Yet the
user's screenshot at the same time shows the app rendered into a much
smaller area than the screenshot canvas.

**False alarms I fell into:**
- "composerVisible: false" — selector was wrong; composer is `<textarea>`
  not `<input>`. Composer IS in DOM.
- "Chrome zoom 95%" — user reset to 100% (Cmd+0); didn't change anything.
- I initially explained the void as "macOS desktop showing past the
  Chrome window" — user pushed back, this is wrong, the void IS within
  the Chrome window.

**Things I did NOT try yet:**
- Asking the user for an EXACT screen-recording with dev tools' Elements
  panel hover showing what's at the void area (could reveal an unstyled
  parent eating space).
- Computed-style dump of `<div class="flex h-screen">` and its descendants
  to see what's actually setting the layout.
- Drag-resize the window mid-session to see if `100vh` re-evaluates.
- Disable browser extensions that may inject content.
- Check for a service worker stale CSS bundle (the earlier 500s could
  have left cached CSS without `h-screen` resolved). Vite hard-reload may
  not bypass SW.

**Hypothesis to investigate first next session:** Stale service worker
serving old build. The `index.html` in this repo registers `/sw.js`. If
the SW cached the bundle pre-Tier-4 with a different CSS hash, hard
reload may not bypass it. Try:
1. Chrome DevTools → Application tab → Service Workers → Unregister
2. Application → Clear storage → Clear site data
3. Reload

If that doesn't fix it, capture computed style of root + main with
`window.getComputedStyle(document.querySelector('#root')).cssText` and
compare against my Playwright values.

## Pre-existing bugs surfaced (not Tier 4 fault)

### App boot has no retry on `loadCharacters()` failure
If backend returns 500 during initial load, `appStore.characters` stays
empty forever — user stuck on `WelcomeScreen` until manual reload. Hit
this twice during this turn while I was bouncing servers between tests.
Easy fix: 1-2 retries with backoff in `loadCharacters()` at
`frontends/sakura/src/stores/appStore.ts:265-268`. ~30 min.

### Pre-existing portrait 404s (cosmetic, fall back works)
8× `/files/images/{nana,mikazuki,suzuha,tsukimi,shirayuki,alana}_portrait.png`
+ `icon.png` 404s in console. Default avatar fallback handles it.

## Files Modified (this turn)

```
CURRENT_STATUS.md                             |  12 +-
docs/SESSION_HANDOFF.md                       | 273 +++++++--------
frontends/sakura/src/components/BondPill.tsx  | 469 ++++++++++++++++++++++++++  (new)
frontends/sakura/src/components/Sidebar.tsx   |   7 +-
frontends/sakura/src/components/StatusBar.tsx | 187 +---------                  (-180 dead)
```

## Next Session Priorities

1. **Fix the HUD layout regression** described in "Open bug" above. Start
   with the service-worker hypothesis. If that's not it, dump computed
   styles. ~1-2h. **This is the only blocker for declaring Tier 4
   shipped per the plan's escalation rule** — current state is "user
   reports it's broken in their browser, I can't reproduce."

2. **App boot retry on transient backend 500.** ~30 min, autonomous.
   Eliminates the entire class of "user reloads during backend hiccup
   and gets stuck on Welcome screen" support requests.

3. **Pause + evaluate Tier 4** per plan once the regression is fixed.
   User has not yet been able to use the cleaned-up Tier 4 layout in
   anger because of #1. After 10-min real-use window, decide:
   - Stop here (the simpler chat header is enough)
   - Tier 6 (3D viewer overlay rethink)
   - Tier 5 (sidebar bottom consolidate)
   - Bond pill size bump (user said "it's now too small" — three options
     pre-drafted: slight bump 12→14 font + 60→90 mini-bar / bigger bump
     with accent underline / default-expanded mode that mimics the old
     3-row feel)

4. **Right-cluster horizontal overflow.** Tier 2 toolbar shows `..`
   instead of `⋯` at narrow widths. Separate from Tier 4. Easy
   1-character fix or `min-width:0` on the right cluster's flex parent.

## Context for Next Session

- **Active plan:** `docs/plans/2026-04-27-hud-redesign-staged.md`. Tiers
  0, 1, 1b, 2, 3, 4 done. Current pause-and-evaluate gate is at Tier 4
  per plan order — but blocked on the open bug above.
- **Servers:** All killed at end of turn. Next session: `./run.sh` (or
  `.venv/bin/python -m uvicorn backend.server:app --host 0.0.0.0 --port
  8080` for backend; `cd frontends/sakura && npx vite --port 5175` for
  Sakura).
- **The screenshots from this turn** (`tier4-*.png`,
  `snap-collapsed.md`) are in the repo root, untracked. Useful for
  comparing my Playwright results against the user's reported view.
  Delete or move to `docs/testing/screenshots/` next session.
- **Workflow change requested by user:** when Playwright is running, drive
  my own browser instance to gather diagnostic data instead of asking
  the user to copy-paste console output. Apply via memory file update
  next session if not done now (this handoff is the cap of this session).
- **CLAUDE.md global was edited mid-turn** by user (linter or manual).
  Take into account next session.
