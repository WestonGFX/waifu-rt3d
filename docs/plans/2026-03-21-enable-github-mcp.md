# Plan: Enable GitHub MCP Plugin

## Context
The GitHub MCP server fails to connect because the plugin is explicitly disabled in Claude Code settings. The `/mcp` command reports "Failed to reconnect to github." The `GITHUB_PERSONAL_ACCESS_TOKEN` env var is already set and `gh auth` works fine.

## Root Cause
In `/Users/chris/.claude/settings.json` line 146:
```json
"github@claude-plugins-official": false
```

## Fix
Change `false` → `true` for the `github@claude-plugins-official` entry in the `enabledPlugins` map.

## File to Modify
- `/Users/chris/.claude/settings.json` — flip `"github@claude-plugins-official": false` to `true`

## Verification
1. Edit the setting
2. Run `/mcp` to confirm GitHub server connects successfully
