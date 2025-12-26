# Claude Code Session Logs

This directory contains comprehensive logs of all Claude Code sessions.

## Directory Structure

```
.claude-logs/
├── config.json              # Main configuration file
├── search-index.db          # Searchable log database
├── README.md                # This file
├── YYYY-MM-DD/              # Logs organized by date
│   └── session-HHMMSS/      # Individual session logs
│       ├── conversation.md  # Main session log (human-readable)
│       ├── diffs/           # Code changes
│       ├── terminal/        # Command outputs
│       └── snapshots/       # Terminal state backups
├── summaries/               # Daily and session summaries
│   ├── daily-YYYY-MM-DD.md
│   └── session-*.md
└── session-backups/         # Emergency session snapshots
```

## Features Enabled

✅ **Comprehensive Mode** - Logs everything  
✅ **Search Indexing** - Find anything quickly  
✅ **Git Integration** - Links logs to commits  
✅ **Daily Summaries** - Automatic end-of-day reports  
✅ **Session Summaries** - Before closing or hitting limits  
✅ **Terminal Protection** - Saves before wipes  
✅ **Usage Tracking** - Warns before hitting Claude Pro limits  
✅ **Auto-Documentation** - Adds docstrings to code  

## Quick Commands

### View today's logs
```zsh
ls -lt .claude-logs/$(date +%Y-%m-%d)/
```

### Read current session
```zsh
cat .claude-logs/$(date +%Y-%m-%d)/session-*/conversation.md
```

### Search all logs
```zsh
grep -r "database migration" .claude-logs/
```

### View daily summary
```zsh
cat .claude-logs/summaries/daily-$(date +%Y-%m-%d).md
```

## Retention Policy

- **Active logs:** Keep all logs from past 365 days
- **Archive:** Compress logs older than 1 year to .gz format
- **Never delete:** Archived logs kept forever unless manually removed

## Configuration

Edit `config.json` to customize:
- Logging mode (comprehensive, verbose, minimal, etc.)
- Retention period
- Feature toggles
- Notification preferences

## Current Mode

**COMPREHENSIVE** - Logs all messages, code changes, commands, and output.

---

Last updated: 2025-12-09
