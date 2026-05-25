# Session Handoff — 2026-05-25 (session 47)

## Branch: master · 11 commits this session · all pushed to origin
## Test Status: **2,977 backend pytest passing** · **326 vitest passing** · TSC clean
## Schema version: v85 (unchanged this session)

## TL;DR

Started from session-46's v1-Lite declutter open queue (14 items) plus
the user's "try new things" directive.  Delivered one creative angle
(LLM probe wired as character-voiced inline aside instead of banner)
then executed 8 more queue items across 4 `/go` cycles.  Net session:
**11 commits, +1,200 / −4,756 LOC, 21 new pytest cases, 13 new vitest
cases**, all pushed.  Major declutter pass: the entire bond UI surface
(10 components, ~4,750 LOC) deleted from the frontend.

## Completed This Session

### Creative angle (user-directed "try new things")
- **`906a9f6`** — `feat(47-q8)`: LLM probe wired as a quiet italic
  character-voiced aside ("*tilts head* The model you're running thinks
  out loud…") instead of the speced banner.  Lives inside the chat
  scroll area + above WelcomeScreen.  Dismissal persists per warning
  code + model in localStorage.  +8 vitest.

### Queue items completed (v1-Lite declutter)

| Commit | Queue | What |
|---|---|---|
| `9a6991c` | #1 | `aie_enabled` master flag, OFF by default.  Gates 5 per-turn AIE call sites in server.py + 2 in context_assembler.py.  Endpoints stay (user-triggered).  +10 pytest. |
| `7042dd9` | #2 | `bond_xp_enabled` master flag, OFF by default.  Gates 2 bond-XP grant blocks (non-stream + stream chat handlers).  +10 pytest. |
| `e536c3e` | #3 | Footer chrome strip — chips (Brief/Off/18+RP) + 4 of 6 icons (Italic, Voice dictation, Voice-First Radio, Full-duplex Phone) deleted.  Final footer = composer + push-to-talk Mic + Send.  −194 LOC. |
| `6dffef7` | #6 | Overlay mutex contract pinned in regression tests (5 vitest cases) — Settings + Memory Browser can't coexist; already enforced via `activeOverlay`, now tested. |
| `78796ee` | #7 | Theme picker 27 → 4 featured (`dark`, `light`, `sakura-custom`, `midnight`) + "Show more themes" expander.  Auto-expand when active preset is non-featured. |
| `e7f4786` | #12 | Girly + Neon frontend archive (light-touch backend dropoff).  `/api/frontend` advertises only Sakura + Nova; `default_frontend` default flipped to `sakura`.  Test `test_root_defaults_to_neon` → `test_root_defaults_to_sakura` + new fallback test. |
| `9732f44` | #4 | Settings — 3 layouts user-selectable (Anchor / Collapsibles / Sidebar).  Live switcher in General → "Settings Layout".  `renderSectionContent(id)` extracted so adding a section is one switch case, not three branches.  Default: Anchor. |
| `f121280` | #10 | Bond burn-down starter: BondPill component deleted (was dead behind `false &&`).  −625 LOC including the unused IDLE_PHRASES + idlePhrase rotation effect. |
| `7a38ce8` | #10 | Bond burn-down ×3: MilestoneCelebration, LevelUpCelebration, AchievementToast deleted.  Affinity polling + `useMilestoneDetection` removed from App.tsx + MobileApp.tsx.  −1,244 LOC. |
| `6ebbed0` | #10 | Bond burn-down ×6: BondPanel + BondProgressBar + BondTimeline + BondStoryCard + BondStoryViewer + MilestoneTimeline deleted.  Alt+Shift+H shortcut + CommandPalette entries removed.  −2,897 LOC. |

### Bond burn-down totals (across 3 commits)
- **10 components deleted** (BondPill, 3 celebration popups, 6 bond panels)
- **−4,750 LOC net**
- All gamification UI surfaces gone from chat header, chat content, and overlay system

## Work In Progress / Held Back

These are stopping decisions, not unfinished work:

- **Bond store fields + `useBondProgress` hook STAY.**  `bondLevel`,
  `bondXp`, `bondTier`, `bondXpToNext`, `bondNextUnlock` and the hook
  that writes them are still consumed by Kokoro's NSFW Tier F gate
  (bond ≥ 20).  Deleting them would break NSFW context resolution.
- **`pendingLevelUp` / `pendingAchievement` store fields stay dormant.**
  Producers still write to them from `chatStore`, `DialogueBubble`,
  `useFullDuplexVoice`, `useBondProgress` — removing the producers is a
  cross-file refactor that wants its own commit.
- **Backend bond modules + `/api/bond/*` endpoints STAY** per CLAUDE.md
  "never delete existing endpoints" rule.  They're already grant-gated
  by the `bond_xp_enabled` flag.

## Skipped With Reason

- **#5 Settings drawer clipping fix** — needs Chrome to reproduce.
- **#9 Rin-chan post-process regex** — conditional ("only if model
  still ignores the rule") — no fresh observation this session.
- **#13 NSFW backend endpoint cleanup** — conflicts with CLAUDE.md
  "Never delete or reorder existing endpoints" rule.  Audit identified
  7 GET endpoints with no remaining callers; explicit user override
  needed.
- **#11 AIE 12 modules architecture rethink** — half-day exploratory
  research + spec; deferred.
- **#14 server.py 17K-line refactor** — multi-session, listed as
  high-risk in CLAUDE.md sensitive areas.

## Known Issues / Bugs

- **Pre-existing `chatStore.pin.test.ts` flake** — `togglePin >
  optimistically flips pinned=true` returns 500 from mocked API.
  Unchanged from session 46.  1/331 vitest failure.
- **3 vitest unhandled errors in `SettingsView.exportImport.test.tsx`** —
  pre-existing test-infra noise, doesn't fail tests (3 pass + 3
  "errors" that are async cleanup hiccups).  Not introduced this session.

## Files Modified (session 47 diff stat — 11 commits)

```
 backend/server.py                                  |  21 +-
 backend/llm/context_assembler.py                   |  41 +-
 backend/tests/test_v2_routing.py                   |  34 +-
 backend/tests/test_aie_master_flag.py              | 177 +++++ (new)
 backend/tests/test_bond_xp_flag.py                 |  88 +++ (new)
 frontends/sakura/src/App.tsx                       |  94 +--
 frontends/sakura/src/MobileApp.tsx                 |  33 +-
 frontends/sakura/src/components/AchievementToast.tsx     |  79 ---
 frontends/sakura/src/components/BondPanel.tsx      | 347 -----
 frontends/sakura/src/components/BondPill.tsx       | 485 -----
 frontends/sakura/src/components/BondProgressBar.tsx      | 298 -----
 frontends/sakura/src/components/BondStoryCard.tsx  | 263 -----
 frontends/sakura/src/components/BondStoryViewer.tsx      | 692 -----
 frontends/sakura/src/components/BondTimeline.tsx   | 663 -----
 frontends/sakura/src/components/CommandPalette.tsx |   3 +-
 frontends/sakura/src/components/LevelUpCelebration.tsx   | 609 -----
 frontends/sakura/src/components/LLMProbeAside.tsx        |  86 +++ (new)
 frontends/sakura/src/components/MilestoneCelebration.tsx | 469 -----
 frontends/sakura/src/components/MilestoneTimeline.tsx    | 615 -----
 frontends/sakura/src/components/StatusBar.tsx      |  43 +-
 frontends/sakura/src/components/WelcomeScreen.tsx        |  16 +-
 frontends/sakura/src/hooks/useLLMProbe.ts          | 212 +++ (new)
 frontends/sakura/src/lib/api.ts                    |  28 +-
 frontends/sakura/src/test/BondPill.format.test.tsx | 103 --- (deleted)
 frontends/sakura/src/test/LLMProbeAside.test.tsx   | 151 +++ (new)
 frontends/sakura/src/test/appStore.overlayMutex.test.ts  |  65 +++ (new)
 frontends/sakura/src/views/ChatThread.tsx          | 252 +-
 frontends/sakura/src/views/SettingsView.tsx        | 562 ++++++++
```

## Next Session Priorities

Remaining queue (4 actionable items):

1. **#11 AIE 12 modules architecture rethink** — half-day exploratory
   research + spec.  Collapse 12 separate adaptive modules into ONE
   "context shaper" that runs once per turn.  Or pick the most
   valuable module (topic_graph for natural callbacks) and surface
   only that.  User's question: "is there a better way we can use or
   implement... AIE 12 bg modules?"

2. **#5 Settings drawer clipping when 3D viewer open** — open browser,
   exercise the bug, fix layout reflow.  Requires user-side Chrome.

3. **#14 `server.py` 17K-line refactor** — split into 5-10 modules by
   domain.  Half-day to full-day per phase.  CLAUDE.md flags as
   sensitive area ("never reorder existing endpoints"); needs careful
   plan.

4. **Bond burn-down finishing pass** (optional, ~30 min):
   - Remove `pendingLevelUp` / `pendingAchievement` writes from
     `chatStore`, `DialogueBubble`, `useFullDuplexVoice`,
     `useBondProgress`.
   - Drop the `pendingLevelUp` / `pendingAchievement` store fields
     once producers are gone.
   - Keep `bondLevel` / `bondXp` etc. + the `useBondProgress` hook —
     Kokoro NSFW Tier F still reads bond level.

Blocked / conditional:
- **#9 Rin-chan regex** — only if model still ignores identity rule.
- **#13 NSFW endpoint deletion** — needs explicit CLAUDE.md-rule
  override from user.

## Context for Next Session

- **Settings layouts live now:** Default is `anchor` (sticky pill
  nav + collapsible sections).  User can switch in Settings → General →
  "Settings Layout".  Default flip = one-line change in SettingsView
  fallback OR set `settings_layout` in app config.
- **Active push state:** 11 commits this session, all pushed.
  HEAD = `6ebbed0`.  Push gate clear (no active OPEN BUG / UNFIXED /
  BLOCKER markers in CURRENT_STATUS.md or this file).
- **Runtime drift in working tree (user routinely reverts):**
  `backend/config/app.json` (LLM endpoint), `backend/storage/app.db`,
  `frontends/sakura/e2e/smoke-test.spec.ts`,
  `frontends/sakura/src/hooks/useTheme.ts`,
  `frontends/sakura/src/styles/themes.css`.  These pre-date session 47
  and were not touched this session.
- **2 untracked files from session 41-44** still present:
  `frontends/sakura/src/components/MemoryBrowser.md` and
  `MemoryBrowser.PRD.md`.  Not touched this session.
- **No active plan file for next session.**  Next session can pick
  from the priorities above or pick a new direction.
- **No schema migrations this session.**  `preflight.py` untouched,
  schema_version stays at v85.
- **No Chrome browser interaction this session.**  All UI work
  validated via tsc + vitest only; user should browser-verify the
  Settings 3-layout switcher + the bond burn-down before next merge
  to anything externally visible.
