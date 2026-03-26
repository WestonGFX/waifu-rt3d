# Document Lifecycle — Waifu-RT3D

What gets saved, where it lives, when to create it, and when to archive it.

## Artifact Map

| Artifact | Directory | Naming | When to Create | Lifecycle |
|----------|-----------|--------|----------------|-----------|
| **Research findings** | `docs/research/` | `YYYY-MM-DD-topic.md` | After 2+ explore agents, 3+ web searches, any competitive analysis | NEVER delete. Mark stale after 30 days. |
| **Feature specs / PRDs** | `docs/specs/` | `PRD-feature-name.md` | Before implementing a new feature (optional for small features) | Add `Status: ✅ DONE` when complete. |
| **Plan files** | `~/.claude/plans/` | `YYYY-MM-DD-description.md` | When starting a new multi-phase initiative | Mark `✅ DONE` in header. Archive quarterly. |
| **Session summaries** | `docs/sessions/` | `SESSION_YYYY-MM-DD.md` | End of any session with 3+ completed tasks | NEVER delete. Historical record. |
| **Architecture decisions** | `docs/decisions/` | `ADR-NNN-title.md` | When making a significant architectural choice | NEVER delete. Supersede with new ADR. |
| **Convention guides** | `docs/conventions/` | `domain-name.md` | When documenting patterns for a codebase area | Update in-place as conventions evolve. |
| **Feature masterlist** | `docs/FEATURE_MASTERLIST.md` | (single file) | Already exists | Update via `/checkpoint`. |
| **Completed features** | `docs/COMPLETED_FEATURES.md` | (single file) | Already exists | Append via `/checkpoint`. |
| **Status file** | `CURRENT_STATUS.md` | (single file) | Already exists | Update via `/checkpoint`. Rolling window, <50 lines. |
| **Status history** | `docs/STATUS_HISTORY.md` | (single file) | Already exists | Append-only archive. Completed sessions move here from CURRENT_STATUS.md. |
| **Resume prompt** | `docs/plans/RESUME_PROMPT.md` | (single file) | At session end or handoff | Overwrite each session. |
| **Plan index** | `docs/plans/PLAN_INDEX.md` | (single file) | Already exists | Update when plans are created/completed. |

## Principles

1. **Nothing gets lost.** Every plan, research task, and analysis gets saved to disk as markdown. Conversation context is ephemeral — files are permanent.
2. **Never delete, only archive.** Completed plans get `✅ DONE` headers. Stale research gets `⚠️ STALE` headers. Nothing is deleted.
3. **Date everything.** File names include dates. Headers include dates. This makes staleness obvious.
4. **Link across documents.** Plans reference research files. Research files reference code paths. Session summaries reference commits.

## Directory Structure

```
docs/
├── COMPLETED_FEATURES.md    # Historical archive
├── DOCUMENT_LIFECYCLE.md     # This file
├── FEATURE_MASTERLIST.md     # Active feature tracking
├── conventions/              # Domain convention guides
│   ├── backend-and-api.md
│   ├── frontend-and-ui.md
│   ├── 3d-viewer-and-animation.md
│   └── llm-and-voice.md
├── decisions/                # Architecture Decision Records
├── research/                 # Research findings (dated)
├── sessions/                 # Session summaries (dated)
├── specs/                    # Feature PRDs
├── plans/                    # Project-local plan references
│   ├── README.md             # Plan naming convention
│   ├── PLAN_INDEX.md         # Index of all plans
│   └── RESUME_PROMPT.md      # Session handoff context
├── design/                   # Design docs and research
├── characters/               # Character bible and profiles
└── ...                       # Other existing docs
```
