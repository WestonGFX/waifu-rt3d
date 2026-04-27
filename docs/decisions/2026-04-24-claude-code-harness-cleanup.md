# 2026-04-24 — Claude Code harness cleanup

**Status:** Active
**Reviewers welcome:** Any future Claude Code session — please re-evaluate the open questions at the bottom.
**Reversibility:** Fully reversible — see "How to undo" section. Backups saved as `*.bak-20260424`.

## Context

Chris was debugging Claude Code issues in both `AnimeGirly` and `waifu-rt3d` repos. Original root cause in `AnimeGirly` turned out to be `CLAUDE_CODE_EXPERIMENTAL_REMOTE_TRIGGER=1` in `~/.claude/settings.json` (now removed). Audit of `waifu-rt3d` found several issues worth fixing at the same time.

## Changes made in this repo on 2026-04-24

### 1. Rotated leaked API key

- `insforge` API key `ik_df4dbe92616f5a35ead193bd03173cd1` was hardcoded in `.mcp.json`, committed to git, pushed to `github.com/WestonGFX/waifu-rt3d` (public).
- Chris rotated the key at insforge.app — old key is now invalid.
- Old key remains visible in git history of `.mcp.json` commits `a0d310f` and `20725f1`. Not scrubbed — rotation makes this cosmetic, not critical.

### 2. Disabled all MCP servers

Changed `.claude/settings.local.json`:
- Was: `enabledMcpjsonServers: ["insforge", "sqlite", "waifu-rt3d-api"]`
- Now: `enabledMcpjsonServers: []` + `disabledMcpjsonServers: ["insforge", "sqlite", "waifu-rt3d-api"]`

`.mcp.json` itself is kept intact (servers defined but inert). See `.mcp.md` at repo root for per-server notes.

**Replacement for sqlite MCP:** Use `sqlite3 backend/storage/app.db '...'` via Bash on demand. Zero startup cost, already covered by `Bash(*)` permission.

### 3. Removed 3 PostToolUse hooks

Deleted from `.claude/settings.json`:
- Ruff autofix + py_compile on every `.py` edit
- `tsc --noEmit` on every `.ts`/`.tsx` edit
- Biome format/lint on every `.ts`/`.tsx` edit

**Rationale:** Empirical data from `AnimeGirly` (same pattern, same project scale): hook fired 71 times, caught 0 errors in historical sessions. The `pre-commit-check.sh` PreToolUse hook (runs `tsc` + `pytest` before `git commit`) is the actual load-bearing safety net and is **kept unchanged**.

**Manual replacement:** Run `npx @biomejs/biome check --write .` or `ruff check --fix .` on demand. Consider a `/lint-sweep` skill if you find yourself doing this often.

### 4. Replaced PreToolUse regex-based sensitive-file blocker

**Was:** A PreToolUse hook that grep'd `$CLAUDE_TOOL_INPUT` for `.env"`, `app.db"`, `credentials`, `.local.json"`. Fragile — matched file content, not just paths; would false-block edits to any file containing these strings.

**Now:** `permissions.deny` globs in `.claude/settings.local.json`:
```
Edit(**/.env), Edit(**/.env.*), Edit(**/*.local.json),
Edit(**/credentials*), Edit(**/app.db), Edit(**/*.db)
+ same for Write
```

**Rationale:** Path-glob matching is the intended Claude Code mechanism for this. It catches the actual problem (writing to .env) without false-positives on documentation or code that mentions those filenames.

### 5. Kept these hooks unchanged

- `SessionStart` / `head -20 CURRENT_STATUS.md ...` — runs in ~12ms, very useful for context injection.
- `PreToolUse` / `_BACKUP_ROOT` content-match block — content-match is the RIGHT approach here because the threat is Bash commands like `rm -rf /path/to/_BACKUP_ROOT`. Path-glob won't catch that.
- `PreToolUse` / `pre-commit-check.sh` — load-bearing, runs `tsc` + `pytest` before commit.
- `Stop` / macOS desktop notification — harmless, useful.
- `SessionEnd` / timestamp CURRENT_STATUS.md — self-contained.

## Files touched

| File | Change |
|---|---|
| `.claude/settings.json` | Removed 3 PostToolUse hooks + 1 PreToolUse hook (sensitive-file regex). Kept _BACKUP_ROOT hook and other hooks. |
| `.claude/settings.local.json` | Added `permissions.deny` globs. Disabled all 3 MCP servers. |
| `.mcp.json` | UNCHANGED (will be deleted in future session after MCP review — see open questions). |
| `.mcp.md` | **NEW** — companion doc explaining MCP disable state + open questions for next session. |
| `.claude/settings.json.bak-20260424` | Backup of original settings.json |
| `.claude/settings.local.json.bak-20260424` | Backup of original settings.local.json |
| `.claude/.mcp.json.bak-20260424` | Backup of original .mcp.json (contains OLD leaked key — do not restore without re-rotating) |

## Open questions for a future Claude Code session

Please evaluate and either resolve or update this doc:

1. **Should we delete `.mcp.json` entirely?** If all three servers stay unused, the file is just noise + a historical liability (leaked-key artifact). Check `.mcp.md` for per-server reasoning.
2. **Is `backend/mcp_bridge.py` still used?** If yes for what — is there a non-MCP way to invoke it? If no, delete the module.
3. **Should the `permissions.deny` list expand?** Consider: lockfiles (`package-lock.json`), CI configs (`.github/workflows/*.yml`), git config (`.git/config`). Tradeoff: more safety vs more "can't do the thing I wanted" friction.
4. **Does `CLAUDE_CODE_NO_FLICKER=1` still matter?** It was added when `tui: fullscreen` flickered in the terminal. If Claude Code terminal rendering has improved, this may be vestigial.
5. **Is there a lighter QA pattern than removing all PostToolUse hooks?** Possible middle grounds: (a) move all three into a single `Stop` event hook (runs once per turn, not per edit); (b) keep only Ruff (fast, autofixes) and drop tsc + biome; (c) add a `/qa-sweep` project skill that runs them on demand.

## How to undo this entire cleanup

```bash
cd /Users/chris/code/waifu-rt3d
cp .claude/settings.json.bak-20260424 .claude/settings.json
cp .claude/settings.local.json.bak-20260424 .claude/settings.local.json
cp .claude/.mcp.json.bak-20260424 .mcp.json  # WARNING: contains old leaked key
rm .mcp.md docs/decisions/2026-04-24-claude-code-harness-cleanup.md
```

Only do this if you actually want the old behavior back. The leaked-key file will still be a problem.

## Related

- `AnimeGirly` repo had the same PostToolUse pattern removed in the same session; see `~/.claude/projects/-Users-chris-Code-AnimeGirly/memory/project_claude_harness_optimization_2026-04-24.md` for that repo's version.
- Global Claude Code harness (`~/.claude/settings.json`) also cleaned up on 2026-04-24 — removed vestigial `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1` band-aid flag.
