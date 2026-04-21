# Session Handoff — 2026-04-20 (Session 15)

## Branch: master
## Test Status: 2,678 backend passed · 160 frontend (4 pre-existing failures unchanged) · TSC clean
## Session Commit: `a0e7869` pushed to origin/master

## Completed This Session (meta-work only, no product code or tests)

### Harness hygiene — waifu-rt3d
- **Permission mode**: `.claude/settings.local.json` `bypassPermissions` → `auto`; dropped `skipDangerousModePermissionPrompt` from `~/.claude/settings.json`
- **Env**: Added `CLAUDE_CODE_NO_FLICKER=1` (restart CC to activate)
- **Skills consolidated**: Deleted `/dashboard` (subset of `/pre-session`), `/sprint` (→ `/go --preset=sprint`); renamed `/review` → `/ui-review`; rewrote `/handoff` as thin wrapper around `/checkpoint`
- **Agents**: Deleted `orchestrator.md` (phantom — main Claude coordinates during `/go`); demoted `production-readiness-auditor.md` from `~/.claude/agents/` → `.claude/agents/`; clarified `advisor`/`prd-writer` + `qa-hunter`/`frontend-tester` boundaries
- **CLAUDE.md**: New "Suggestion Triggers" section — risk-signal mode for `/qa-sweep` + `/verify-servers` with 4 alternative modes inline for easy swap
- **Global `~/.claude/CLAUDE.md`**: New "Preference Forks — Offer Options" rule; extends existing AskUserQuestion rule with aesthetic/layout fork coverage
- **`~/.claude/docs/new-repo-setup.md`**: Manual decision-tree ritual for future repos (NOT auto-applied)
- **Statusline**: Fixed cumulative-token bug ([CC #13783](https://github.com/anthropics/claude-code/issues/13783)) — now pulls from `current_usage.{input+cache_creation+cache_read}` so bar matches `/context` output. Also: `SEP_PAD` tunable, dynamic `(1M context)` → `(1m)` shortening, round-half-up bar math
- **AGENTS.md**: Full rewrite — 12 agents, orchestrator removed, boundaries spelled out
- **`docs/ROADMAP.md` (NEW)**: Full project arc Dec 2025 → now → v1.0, 4 remaining tracks, 3–6 session path to release. **Not yet committed** — review and commit when ready

### AnimeGirly mirror
Same cleanup pattern applied (5 tracked modifications staged in AG working tree, NOT committed). AG also has months of untracked product work (helper services, src-tauri/, scripts, PRDs, research docs) that needs group-by-group review before commit — **do not bulk-commit AG in a waifu session**.

## Work In Progress
- None. Session 15 work is fully committed + pushed for waifu.
- `docs/ROADMAP.md` is uncommitted but intentionally — review first.

## Known Issues / Bugs
- **4 pre-existing frontend test failures** (unchanged from prior handoff): OnboardingWizard × 1, SettingsView.exportImport × 3. Pre-exist session 15; targets for Track A of v1.0 path.
- **Sakura UI bugs** — user expressed frustration but is NOT rebuilding. File specific bugs as `docs/bugs/YYYY-MM-DD-<symptom>.md` as they surface.

## Files Modified This Session (committed)
```
.claude/settings.json                         |  3 +
.claude/settings.local.json                   |  2 +-
.claude/skills/dashboard/SKILL.md             | deleted
.claude/skills/sprint/SKILL.md                | deleted
.claude/skills/{review => ui-review}/SKILL.md | renamed
.claude/skills/go/SKILL.md                    | 12 +++
.claude/skills/handoff/SKILL.md               | 85 +++---
AGENTS.md                                     | 37 +++----
CLAUDE.md                                     | 34 +++-
CURRENT_STATUS.md                             | 30 +++-
docs/plans/RESUME_PROMPT.md                   |  2 +-
```
Plus (global, outside this repo's git): `~/.claude/CLAUDE.md`, `~/.claude/statusline.sh`, `~/.claude/docs/new-repo-setup.md`, 4 new memory files, MEMORY.md index updated, `~/.claude/settings.json`.

Plus (untracked in this repo): `docs/ROADMAP.md` (NEW, not committed).

## Next Session Priorities (from `docs/ROADMAP.md` Track A)

**⚠ CORRECTION (session 16 audit):** Memory Browser UI was already shipped in commit `9592dcf` — `MemoryBrowser.tsx` 1197 lines, 4 tabs (Overview/Facts/Memories/Journal), wired to Ctrl+M + Sidebar + appStore overlay. Prior handoff's "backend ready, needs React UI" claim was stale — actual gap is **zero test coverage**.

1. **Memory Browser test coverage** — Vitest suite for all 4 tabs. Session 16: Overview+Facts. Session 17: Memories+Journal+top-level. 3–5h total.
2. **Memory Browser browser QA** (Session 17) — launch Sakura, exercise each tab, file `docs/bugs/*.md`. 1–2h.
3. **Memory Browser polish pass** (Session 18) — apply QA findings, unify raw-fetch vs `api.*` client usage. 2–4h.
4. **Visual Content in Chat** — "Character sends you a picture" UX flow. Image-gen pipeline exists. 4–8h.
5. **Fix 4 pre-existing frontend test failures** — OnboardingWizard × 1, SettingsView.exportImport × 3. 2–4h.
6. Then Track B (release verification), Track C (release polish), tag v1.0.0.

## Context for Next Session
- **Restart CC before next session** — `CLAUDE_CODE_NO_FLICKER=1` activates at session start, not hot-reload.
- **Suggestion Triggers are now active** — Claude will suggest `/qa-sweep` at commit/handoff boundaries when risk signals fire (migration, sensitive area, cross-subsystem, preflight.py touch). Suggestions only, never auto-runs.
- **Preference Forks rule is global** — expect me to use `AskUserQuestion` with preview-field options for visual/layout/aesthetic decisions.
- **Claude Design**: User leans toward using free runs on GHF board portal (separate project) rather than Sakura rebuild. If they bring it up for Memory Browser UI, that's fine — different scope, net-new surface.
- **`/ultrareview`**: Real premium CC feature — 3 free runs on Max, don't burn on meta sessions. Save for Memory Browser UI merge, schema migrations, or 500+ line PRs.
- **ClipFlow-AI = Codex-only project** (saved to memory `feedback_tool_per_repo_no_mixing.md`). Do NOT suggest adding Claude Code to ClipFlow unless user explicitly asks.
- **AnimeGirly = separate session's problem** — don't mix repos. AG has session-15 meta edits pending commit + months of untracked product work to review group-by-group.

## Quick resume
```
/pre-session       # cold-start health check
# Then pick one from Next Session Priorities above
# When done: /handoff again
```
