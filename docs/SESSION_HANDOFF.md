# Session Handoff — 2026-04-29 (Session 20, Tier 4 layout debug)

## Branch: master · Commits this session: 2 (NOT pushed)

This session:
- `f8e4ef0` fix(sakura): SW cache name now includes build id
- `a2ac04a` feat(sakura): boot retry + backend-unreachable banner

## Test Status: pytest **2684 ✓** · vitest **207 ✓** (was 203, +4 new) · tsc clean

## Resolved This Session

### ~~OPEN BUG — HUD layout regression~~ ✅ FIXED via SW cache fix
The previous session's `OPEN BUG — UNFIXED` is closed. User confirmed the
app no longer renders top-left-anchored with void at right/bottom. Root
cause was the proximate hypothesis from the Session 19 handoff: stale
service-worker cache. `frontends/sakura/public/sw.js` had hardcoded
`CACHE_NAME = 'sakura-v1'` that never bumped, so old CSS lived in the
user's cache forever. Fix injects a per-build cache name via Vite plugin;
the existing activate-handler purge evicts the stale `sakura-v1` cache
on first activation of the new SW.

### Bonus fix — empty-sidebar-looks-like-data-loss
After the SW fix landed and the user reloaded, their backend wasn't
running on `:8080`. `loadCharacters` failed silently (or with retries
exhausted) → empty character list → empty sidebar. User read this as
"all my data was deleted" — DB was actually intact (14 chars / 302
sessions / 188 messages confirmed via `sqlite3 backend/storage/app.db`).

Two-part fix:
1. `loadCharacters` retries 3× with 200ms / 600ms exponential backoff
2. After retries exhaust, `bootError` is set on the appStore and
   `BackendErrorBanner` renders a fixed-position pill at the top of
   the app with a Retry button (Lucide WifiOff + RefreshCw icons).

Verified end-to-end in own Chrome:
- Kill backend → reload → banner appears
- Restart backend → click Retry → banner dismisses, characters populate

## Files Modified

```
frontends/sakura/public/sw.js                                  +14 -3   (cache token)
frontends/sakura/vite.config.ts                                +69 +1   (inject-sw-build-id plugin)
frontends/sakura/dev-tools/layout-debug.js                     +268     (NEW: paste-into-console diagnostic)
frontends/sakura/src/stores/appStore.ts                        +51 -2   (retry + bootError + retryBoot)
frontends/sakura/src/App.tsx                                   +3       (mount BackendErrorBanner)
frontends/sakura/src/components/BackendErrorBanner.tsx         +94      (NEW: pill + retry)
frontends/sakura/src/test/appStore.loadCharactersRetry.test.ts +97      (NEW: 4 Pattern-2 tests)
```

`backend/storage/app.db` and `backend/config/app.json` carry runtime
state across sessions — left modified, NOT committed (sensitive paths
per CLAUDE.md).

`frontends/sakura/dist/*` artifact churn from `npx vite build` run
during Step 1 verification — left uncommitted; will regenerate on next
build.

Pre-existing untracked screenshots (`tier4-*.png`, `snap-collapsed.md`)
from Session 19 still in repo root, untouched — user's call whether to
move to `docs/testing/screenshots/` or delete.

## Work In Progress

**None.** All four planned steps from the session plan
(`/Users/chris/.claude/plans/okay-what-should-we-warm-moler.md`) shipped
and verified. Plus the bonus banner fix.

## Push/PR Status

**Local-only — no push.** Two commits ahead of `origin/master`. The
previous handoff's OPEN BUG marker is now resolved (struck through
above), so the push gate has lifted per CLAUDE.md Push & PR Discipline.
Did not push because the user did not explicitly request it. Ask before
pushing next session.

## Next Session Priorities

1. **Push the two commits** (`f8e4ef0`, `a2ac04a`) to `origin/master`
   once the user confirms they want to ship. Push gate is clear.
2. **Move/delete Session 19 screenshots** in repo root — `tier4-*.png`,
   `snap-collapsed.md`. Either to `docs/testing/screenshots/` or trash.
3. **Right-cluster horizontal overflow.** Tier 2 top toolbar shows `..`
   instead of `⋯` at narrow widths. ~10 min — single-character
   replacement, likely in StatusBar/HUD top toolbar.
4. **Pause + evaluate Tier 4** per the staged plan
   (`docs/plans/2026-04-27-hud-redesign-staged.md`). User has now had
   a real-use window with the cleaned-up HUD (no longer blocked by
   the layout regression). Decide: stop here, Tier 6 (3D viewer
   overlay rethink), Tier 5 (sidebar bottom consolidate), bond pill
   size bump.
5. **Visual Content in Chat** — backlog, ~4-8h, multi-session.

## Context for Next Session

- **The `inject-sw-build-id` plugin** lives in `vite.config.ts` and
  uses `package.json`'s `version` + `Date.now()` for the cache key.
  Bumping `package.json` version is no longer required to invalidate
  caches — every build gets a unique key automatically. In dev mode,
  every browser load gets a fresh cache (Date.now() per request).
- **`bootError` + `retryBoot`** on `useAppStore`. Other failure modes
  (e.g. `loadConfig` 500) could be wired into the same banner if
  desired — currently only `loadCharacters` populates it.
- **`dev-tools/layout-debug.js`** is the playbook for next time a
  layout bug can't be reproduced: paste into user's broken Chrome
  console, get back one JSON blob with everything we'd ask for.
- **Servers status at end of session:**
  - Backend uvicorn `:8080` — running (background task `bk0w28f4x`)
  - Sakura vite `:5175` — running (background task `bz5en2i4r`)
  - Both will stop when the bash session ends. Restart with
    `./run.sh` and `cd frontends/sakura && npx vite --port 5175`.
- **Active plan:** `docs/plans/2026-04-27-hud-redesign-staged.md`
  (HUD redesign). Tier 0/1/1b/2/3/4 done. Pause-and-evaluate gate at
  Tier 4 — no longer blocked by anything.
- **Per-CLAUDE.md push rule:** the OPEN BUG marker that was carried
  forward from Session 19 is now struck above. Future sessions can
  push freely unless a new OPEN BUG/UNFIXED/BLOCKER appears.
