# Resume Prompt — Session 48+

**Last updated:** 2026-05-25 (session 47 — v1-Lite execution sprint + bond burn-down)
**Branch:** master · 11 commits this session, all pushed (HEAD = `6ebbed0`)
**Schema:** v85 (unchanged this session)
**Tests:** 2,977 backend pytest + 326 vitest passing (1 pre-existing pin flake), tsc clean

## What Was Done (Session 47)

Started with user's "try new things" directive — shipped one creative angle (LLM probe wired as character-voiced inline aside instead of speced banner). Then ran 4 `/go` cycles burning through session-46's v1-Lite declutter queue: 9 of 14 items shipped, including a full bond-UI burn-down (10 components, ~−4,750 LOC).

**Commits (11, all pushed):**
- `906a9f6` — `feat(47-q8)` LLM probe as character-voiced inline aside (creative angle)
- `9a6991c` — `feat(47-q1)` `aie_enabled` master flag, OFF by default
- `7042dd9` — `feat(47-q2)` `bond_xp_enabled` master flag, OFF by default
- `e536c3e` — `cut(47-q3)` Footer chrome strip — chips + 4 icons gone
- `6dffef7` — `test(47-q6)` Overlay mutex regression test
- `78796ee` — `cut(47-q7)` Theme picker 27 → 4 + expander
- `e7f4786` — `cut(47-q12)` Girly + Neon archive (light-touch backend dropoff)
- `9732f44` — `feat(47-q4)` Settings 3 layouts user-selectable (Anchor / Collapsibles / Sidebar)
- `f121280` — `cut(47-q10)` BondPill deleted (bond burn-down starter)
- `7a38ce8` — `cut(47-q10)` 3 celebration popups deleted
- `6ebbed0` — `cut(47-q10)` 6 bond panels deleted

**Key mental models to carry forward:**

- **Master kill-flags shipped this session:** ``aie_enabled`` + ``bond_xp_enabled`` both default OFF. AIE per-turn invocations + bond XP grants are silent now. Endpoints + Kokoro Tier F (bond≥20 gate) still work.
- **Bond UI is dead, bond data is alive.** All 10 frontend bond components deleted (pill, 3 popups, 6 panels). But `bondLevel` / `bondXp` / `bondTier` etc. + `useBondProgress` hook STAY — Kokoro reads `bondLevel` for NSFW Tier F admission.
- **Settings ships 3 user-selectable layouts now.** Default `anchor` (sticky pill nav + collapsible sections). Switcher: General → "Settings Layout". Reversible via `settings_layout` config key.
- **Footer is bare:** composer + push-to-talk Mic + Send. Ctrl+I (italic wrap) + Ctrl+Shift+V (voice mode) still work as keyboard-only.
- **CLAUDE.md "never delete endpoints" rule still holds.** Session-46 NSFW audit found 7 deletable endpoints; needs explicit override to act.

## Next 3 Tasks

1. **#11 AIE 12 modules architecture rethink** (half-day exploratory).
   User question from session 46: *"is there a better way we can use or
   implement… AIE 12 bg modules?"* Options:
   - Collapse 12 separate adaptive modules into ONE "context shaper"
     that runs once per turn.
   - Pick the single most valuable module (`topic_graph` for natural
     callbacks) and surface only that.
   - Keep them but lazy-load + cache aggressively.
   Approach: dispatch `codebase-analyst` to map each module's actual
   contribution per token spent, then produce a concrete spec. Don't
   start coding without the analysis.

2. **Bond burn-down finishing pass** (~30 min, optional cleanup).
   Pre-touched files in the burn-down already deleted the consumers.
   Remaining writes that have no readers:
   - `chatStore.ts:660` — `setPendingAchievement(res.achievement)`
   - `components/DialogueBubble.tsx:640-641` — `setPendingAchievement(res.achievement)`
   - `hooks/useFullDuplexVoice.ts:383` — `setPendingAchievement(res.achievement)`
   - `hooks/useBondProgress.ts:48` — `store.setPendingLevelUp({...})`
   - `hooks/useBondProgress.ts:59` — `store.setPendingAchievement(res.achievement)`
   After producers are removed, drop the `pendingLevelUp` /
   `pendingAchievement` store fields + actions from `appStore.ts`.
   Keep `bondLevel` / `bondXp` / `bondTier` / `setBondState`.

3. **#5 Settings drawer clipping fix when 3D viewer open** (~30 min,
   needs Chrome). User-side reproduction needed; the layout reflow bug
   was flagged in the session-46 persona report but Claude can't see it.

## Held / Blocked

- **#9 Rin-chan post-process regex** — conditional on observing the
  small-model identity confusion. Spec: backend regex that catches
  `<character_name>-chan/-kun/-san` in assistant output and rewrites
  to "you". Only do if it actually fires.
- **#13 NSFW backend endpoint cleanup** — blocked by CLAUDE.md
  "never delete existing endpoints" rule. The 7 endpoints
  (`/api/characters/{id}/gallery`, `/api/characters/{id}/shared-fantasies`,
  `/api/characters/{id}/fantasy-journal`, `/api/characters/{id}/post-scene-moods`,
  `/api/characters/{id}/intimate-quiz/progress`,
  `/api/intimate-director/commands`, `/api/scenarios/intimate`) have
  no remaining callers per the session-46 audit, but rule-conformant
  action requires user "override" intent.
- **#14 server.py 17K-line refactor** — multi-session, listed in
  CLAUDE.md sensitive areas. Plan-mode first.

## Key Files to Read First (next session cold start)

1. `docs/SESSION_HANDOFF.md` — full session-47 handoff with file
   counts, diff stats, decision notes.
2. `CURRENT_STATUS.md` — top block now reflects session 47 final state.
3. `docs/sessions/SESSION_2026-05-25.md` — session-47 deep-dive
   summary.
4. `frontends/sakura/src/views/SettingsView.tsx` — the 3-layout
   switcher implementation (anchorLayout / collapsiblesLayout /
   sidebarLayout blocks + `renderSectionContent`).
5. `backend/server.py` — `_aie_enabled` + `_bond_xp_enabled` helpers
   live near `load_config` (line ~291). Search those names to find
   the gate sites.

## In-Flight Decisions / Context

- **User's "v1-Lite" philosophy:** strip everything that isn't core
  chat. Session-46 declutter mood ("junk. unusable. never enjoyed it
  past 5 chat turns") + the bond burn-down cement that direction.
- **`/go` worked well this session:** 4 cycles, mostly sequential
  (no MoE dispatches — single-file or sensitive-area work the entire
  session). Token-efficient.
- **No browser verification done.** All UI changes (Settings layouts,
  footer strip, theme picker, bond cuts) validated via tsc + vitest
  only. Worth a `/run` or manual Chrome sweep before any externally-
  visible release.
- **Runtime drift in working tree** (user routinely reverts these,
  pre-dates session 47): `backend/config/app.json` (LLM endpoint),
  `backend/storage/app.db`, frontend `e2e/smoke-test.spec.ts`,
  `hooks/useTheme.ts`, `styles/themes.css`. Not part of session 47.

## Time Spent (for estimate calibration)

- Single session, 4 `/go` cycles + initial creative-angle work.
- ~11 commits across ~4-6 hours of session time (AI-eq), per the
  user's noted ~12× AI-vs-human ratio that translates to ~50-70 human-
  hours of work shipped.
- Largest single delta: bond burn-down (3 commits, ~−4,750 LOC, ~1.5
  hours AI-eq for 10-component deletion with cascading cleanup).
- Smallest deliverable: overlay-mutex regression test (5 cases, +65
  LOC, ~10 min AI-eq).
