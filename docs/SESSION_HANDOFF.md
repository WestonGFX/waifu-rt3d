# Session Handoff — 2026-04-07

## Branch: master
## Test Status: 2556 passed, 0 failed | TSC: clean

## Completed This Session (session 10 — QA Fixes + Bond Progression Phases 1-2)

### QA Bug Fixes (4 issues from browser testing sweep)
- **I3 (MAJOR)**: Added copy/edit/delete action buttons to DialogueBubble on hover
  - User messages: copy, inline edit (textarea), delete
  - Assistant messages: copy, delete alongside existing branch/regenerate controls
  - Backend: new `DELETE /api/messages/{id}` endpoint
  - Frontend: `api.editMessage()` and `api.deleteMessage()` wired through ChatThread
- **I8 (MODERATE)**: GlobalSearchPanel now closes on Escape key (document keydown listener)
- **I9 (MINOR)**: Fixed "Animation Requests: undefined / undefined ok" in Settings System tab
  - Root cause: frontend type mismatched API response fields (`connected` vs `remote_connected`, etc.)
- **I10 (MINOR)**: Added title tooltip to truncated character name in StatusBar header

### Bond Progression Phase 1: Enhanced XP Engine (backend)
- **XP Engine** (`backend/bond/xp_engine.py`): depth multiplier (1.0-2.5x based on message length, emotional keywords, disclosure patterns), interest match detection (1.5x), session bonus (50 XP after 10+ msgs), daily first bonus (25 XP)
- **Progression** (`backend/bond/progression.py`): quadratic XP curve (`150 + level^2 * 0.3 + level * 50`), ~361k total XP 0→100 (~6-8 weeks). 5-tier model: stranger(0-4)/acquaintance(5-14)/friend(15-34)/close_friend(35-64)/soulmate(65-100)
- **Unlocks** (`backend/bond/unlocks.py`): 46-entry UNLOCK_TABLE spanning levels 0-100 with 9 unlock types (base, dialogue, voiceline, expression, story, ceremony, scene, feature, cosmetic)
- **Milestones** (`backend/bond/milestones.py`): record/query milestones, XP event logging, check_and_record_unlocks integrates with UNLOCK_TABLE
- **Schema v67**: `bond_xp_events` table, `bond_milestones` table, daily/session tracking columns on `character_relationships`
- **3 API endpoints**: GET milestones, GET unlocks, GET xp-history
- **82 new tests** (`backend/tests/test_bond_phase1.py`)

### Bond Progression Phase 2: UI Components (frontend)
- **BondProgressBar** (`BondProgressBar.tsx`): animated XP bar with tier-colored fill, level badge, next-unlock preview, "+N XP" delta popup (Framer Motion spring)
- **LevelUpCelebration** (`LevelUpCelebration.tsx`): full-screen overlay with level glow, tier transition arrow, staggered unlock reveals, sparkle canvas, auto-dismiss 10s
- **useBondProgress hook** (`useBondProgress.ts`): polls bond API after message exchanges, detects level-ups, queues celebrations via appStore
- **Store integration**: `appStore` bond state slice (bondLevel, bondXp, bondTier, pendingLevelUp)
- **StatusBar wiring**: tier badge (Lv{N}) colored by tier + BondProgressBar below relationship bars
- **App.tsx wiring**: LevelUpCelebration renders when pendingLevelUp is set
- **api.ts**: getBondLevel, getBondUnlocks, getBondMilestones, getBondXpHistory

### XP Curve Balance Fix
- QA agent found growth=1.0 produced ~591k total (6-8 months to max), not spec target
- Changed to growth=0.3 → ~361k total (6-8 weeks daily use as spec intended)

## Work In Progress
- None — all items committed

## Known Issues / Bugs
- Pre-existing: Live2D runtime broken, embedding model issue
- Pre-existing: QA issues I6 (content-gate 404 — needs server restart), I7 (console errors)
- QA agent noted: `_DEPTH_MULT_MAX = 2.5` is unreachable (max achievable is 2.3) — cosmetic, non-blocking

## Files Modified
```
Session commits: 0c64708, 95ebfdd, 604a478, 4b08ff0, cdae599

New files (7):
  backend/bond/xp_engine.py
  backend/bond/unlocks.py
  backend/bond/milestones.py
  backend/tests/test_bond_phase1.py
  frontends/sakura/src/components/BondProgressBar.tsx
  frontends/sakura/src/components/LevelUpCelebration.tsx
  frontends/sakura/src/hooks/useBondProgress.ts

Modified (backend):
  backend/bond/progression.py (quadratic curve + 5-tier boundaries)
  backend/preflight.py (v67 migration)
  backend/server.py (DELETE message endpoint, enhanced XP wiring, 3 bond endpoints)
  backend/tests/test_bond.py (updated for new tier boundaries + XP values)

Modified (frontend):
  frontends/sakura/src/components/DialogueBubble.tsx (copy/edit/delete actions)
  frontends/sakura/src/components/GlobalSearchPanel.tsx (Escape handler)
  frontends/sakura/src/components/StatusBar.tsx (tier badge + BondProgressBar)
  frontends/sakura/src/views/ChatThread.tsx (message actions + useBondProgress hook)
  frontends/sakura/src/views/SettingsView.tsx (motion stats field fix)
  frontends/sakura/src/stores/appStore.ts (bond state slice)
  frontends/sakura/src/lib/api.ts (bond API methods + message edit/delete)
  frontends/sakura/src/App.tsx (LevelUpCelebration overlay)
```

## Next Session Priorities
1. **Bond Phase 3: Dialogue Style Shifts** — Bond-gated system prompt injection per tier. Create `backend/bond/dialogue_gates.py` + per-character template files. Wire into `context_assembler.py`. Spec: `docs/plans/2026-03-29-bond-progression-spec.md` Phase 3 section.
2. **Bond Phase 4: Milestone Timeline + Story Viewer** — Frontend components: BondTimeline, BondStoryViewer, BondPanel. Spec: same file Phase 4.
3. **QA Phases 8-16** — Continue browser testing remaining feature areas
4. **Try `/release-test --quick`** — Verify release testing skill works with Chrome MCP

## Context for Next Session
- Server IS running (confirmed healthy at session start — 3 services connected)
- Schema is now v67 — bond_xp_events + bond_milestones tables added
- Bond progression fully wired into both streaming and non-streaming chat paths
- Bond UI components exist but haven't been browser-tested yet — suggest visual verification
- The existing MilestoneCelebration (affinity-based) still exists alongside new LevelUpCelebration (bond-based) — Phase 2 spec says to rewrite it, but that's deferred
- Bond spec file: `docs/plans/2026-03-29-bond-progression-spec.md` — Phase 3 starts at line 432
