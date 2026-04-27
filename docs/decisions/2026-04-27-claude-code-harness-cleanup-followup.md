# 2026-04-27 — Claude Code harness cleanup, followup

**Status:** Active (supersedes the "How to undo" path in
`2026-04-24-claude-code-harness-cleanup.md`).
**Reversibility:** Fully reversible via `git revert` on the four commits
listed below. The original `*.bak-20260424` recovery files have been
trashed; this ADR replaces that undo path.
**Trigger:** A parallel cleanup pass landed in `AnimeGirly` (3 commits) on
the same day. This ADR mirrors that pattern in `waifu-rt3d`.

## Context

The 04-24 cleanup left several loose ends:

1. `pre-commit-check.sh` script was retained as "load-bearing" but the
   `.claude/settings.local.json` hook that invoked it was already absent in
   the working dir by 04-26. An audit on 04-26 confirmed the script was
   orphan and deleted it.
2. `.claude/settings.json` still carried hook entries (SessionStart,
   PreToolUse \_BACKUP\_ROOT block, Stop notification, SessionEnd timestamp)
   that were unstaged removals in the working dir but never committed.
3. `.gitignore` had a bare `.claude` line at the bottom (under "InsForge &
   AI agent skills") that silently blocked all new agents/skills/rules from
   being versioned. 9 agents and 1 new skill were sitting untracked.
4. `.mcp.json` was Trashed on 04-27 because the MCP servers caused launch
   hangs and none were in active use. Companion notes were already in
   `.mcp.md` (untracked).
5. `.bak-20260424` recovery files (3 of them) were dead weight given the
   ADR's undo path was the only thing that needed them.

## Changes made on 2026-04-27

### Commit 1 — `chore: refine .gitignore — track .claude/, ignore ephemeral docs`

- Drop bare `.claude` ignore line.
- Add targeted ignores: `.claude/.DS_Store`, `.claude/*.bak-*`,
  `.claude/**/*.bak-*`, `.claude/worktrees/`, `.claude/plans/`.
- Add ephemeral session-doc ignores: `docs/SESSION_*.md` (with allow-list
  for `SESSION_LOGGING_SETUP.md` if/when it lands), `docs/session-logs/`,
  `docs/CODEX_*.md`, `docs/CLAUDE_CODE_HANDOFF.md`,
  `docs/claude-code-handoff/`.
- Add `.codex/` (project uses Claude Code, not Codex).

### Commit 2 — `chore: finalize Claude Code harness cleanup (post-04-24 ADR followup)`

- `settings.json`: drop residual SessionStart, PreToolUse(\_BACKUP\_ROOT),
  Stop, SessionEnd hooks. The \_BACKUP\_ROOT block became redundant —
  CLAUDE.md already declares the path sacred, and the threat model is local
  Bash misuse, which is mitigated by `permissions.deny` globs and explicit
  user confirmation before destructive ops.
- `settings.local.json`: drop the `pre-commit-check.sh` PreToolUse hook
  (script deleted in 04-26 audit). Add `permissions.deny` globs for `.env`,
  `.env.*`, `credentials*`, `app.db`, `*.db`. Move all 3 MCP servers to
  `disabledMcpjsonServers`.
- `.claude/hooks/pre-commit-check.sh`: deleted (orphan).
- `.mcp.json`: deleted (Trashed; caused launch hangs).
- `.mcp.md`: tracked as durable doc.
- `.mcp.json.bak-20260424`, `.claude/settings.json.bak-20260424`,
  `.claude/settings.local.json.bak-20260424`: moved to `~/.Trash`.

### Commit 3 — `chore: track Claude Code agents + verify-servers skill, drop tdd skill`

- Track 9 agents: `advisor`, `codebase-analyst`, `prd-writer`,
  `production-readiness-auditor`, `qa-hunter`, `regression-guard`,
  `schema-architect`, `senior-dev`, `ux-architect`.
- Track 1 new skill: `verify-servers` (probes dev services + scans logs for
  ABI errors).
- Delete unused skill: `tdd` (project does not follow TDD).
- Existing 3 agents and 18 skills already tracked are unchanged.

### Commit 4 — `chore: track durable docs + ADR followup` (this commit)

- Track `docs/ROADMAP.md` (project-level milestone map).
- Track `docs/decisions/2026-04-24-claude-code-harness-cleanup.md` (the ADR
  this followup supersedes — it had been written but never committed).
- Track this ADR.

## What is intentionally NOT changed

- `backend/config/app.json` runtime config tweaks (LLM endpoint, model,
  log\_limit, interrupt\_mode, context\_limit) are user-local runtime state.
  Leaving uncommitted on purpose — these reflect Chris's current LM Studio
  setup, not a project default.
- `backend/storage/app.db` is tracked but gitignored after the fact;
  modifications are runtime state.
- `CURRENT_STATUS.md` timestamp bump from 04-26 audit — left for next
  session's `/handoff` to refresh.
- Hook automation is fully removed by choice. The pre-commit pytest+tsc
  gate that used to run via `pre-commit-check.sh` is now a manual `/qa-sweep`
  or `/smoke-test` skill invocation. The CLAUDE.md "Suggestion Triggers"
  section already documents when to run these.

## Open questions for a future session

1. Should `permissions.deny` expand to lockfiles (`package-lock.json`),
   CI configs (`.github/workflows/*.yml`), git config (`.git/config`)?
2. Should `backend/storage/app.db` be untracked (currently tracked but
   gitignored — pre-existing inconsistency, not introduced by this cleanup)?
3. Is there a lighter QA pattern than fully manual? E.g. a single `Stop`
   event hook that runs once per turn instead of the old per-edit
   PostToolUse trio.

## How to undo this entire cleanup

```bash
cd /Users/chris/code/waifu-rt3d
# List the 4 commits from this cleanup
git log --oneline -5
# Revert in reverse order (newest first) so trees apply cleanly
git revert <commit4-sha> <commit3-sha> <commit2-sha> <commit1-sha>
```

If you also need the `.bak-20260424` files back, restore from `~/.Trash`
before they are permanently emptied.

## Related

- `docs/decisions/2026-04-24-claude-code-harness-cleanup.md` — original
  cleanup ADR. Its "How to undo" instructions (using `cp` from `*.bak-*`
  files) are now stale; use `git revert` instead.
- `.mcp.md` — companion doc explaining MCP server disable state.
- AnimeGirly repo had the same followup pattern committed on 2026-04-27.
