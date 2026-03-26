# Plan Files

## Naming Convention

All plan files MUST follow this format:

```
YYYY-MM-DD-description.md
```

Examples:
- `2026-03-20-phase-12-p4-anime-shaders.md`
- `2026-03-25-workflow-overhaul.md`

## Rules

1. **NEVER delete plan files.** Mark completed plans with `✅ DONE` in the header.
2. **NEVER overwrite plan files.** Append new sections at the bottom.
3. **Always read before writing.** Check existing content before adding.
4. **Use conventional prefixes** in plan titles: Phase N, Sprint, Fix, Research, etc.
5. **Link to research.** If a plan was informed by research, reference the `docs/research/` file.

## Lifecycle

| Stage | Action |
|-------|--------|
| Created | New plan file with Context + Execution sections |
| In Progress | Update status, mark completed sub-tasks |
| Completed | Add `✅ DONE` to header, update CURRENT_STATUS.md |
| Archived | Move to `.claude/plans/archive/` quarterly |

## Index

See `PLAN_INDEX.md` for a full listing of all plans with status and descriptions.
