# Documentation & Workflow System Overhaul + Phase 20 Completion

## Context

Three phases (18C-D, 17, 19) were completed this session (+186 tests, schema v58→v60). Phase 20A (model catalog) was also built by an agent but not yet committed. Now the user wants to:

1. **Commit Phase 20** and finish the remaining roadmap
2. **Compare waifu-rt3d vs AnimeGirly** workflow/settings/rules/documentation systems
3. **Design the ideal hybrid** — what to keep, adopt, or create fresh
4. **Save research & planning artifacts** better (stop losing agent research)

Also noted: Claude Code 2.1.84 is available (currently on 2.1.81).

---

## Part A: Workflow System Comparison

### Side-by-Side Matrix

| Dimension | **waifu-rt3d** (this project) | **AnimeGirly** |
|-----------|-------------------------------|----------------|
| **CLAUDE.md** | 117 lines. Action-oriented: "Resume = implement immediately," venv paths, plan safety rules, smoke tests, bug fixing rules, commit hygiene | 100 lines. Soul-oriented: "embodied AI girlfriend experience," domain vocabulary (dere types, BlendShape), architecture overview, provider system, state management |
| **AGENTS.md** | 80 lines. Tabular roster (8 agents), workflow steps, dispatch rules, tech stack summary, key references | **Does not exist** (agents are defined only in individual .md files) |
| **Rules (`.claude/rules/`)** | 1 file: `context7.md` (library docs) | 4 domain-scoped files: avatar-and-3d.md, chat-and-companions.md, providers-and-models.md, ui-and-design.md |
| **Agents (`.claude/agents/`)** | 8 agents (69-94 lines each): advisor, codebase-analyst, orchestrator, prd-writer, qa-hunter, schema-architect, senior-dev, ux-architect | 9 agents (51-116 lines each): Same core 6 + helper-tester, perf-reviewer (no advisor) |
| **Skills (`.claude/skills/`)** | **15 skills** (1,414 total lines): go, checkpoint, dashboard, smoke-test, deploy-check, audit, investigate, tdd, sprint, parallel-fix, refactor-sweep, research-to-action, review, insforge, insforge-cli | **10 skills** (954 total lines): go, checkpoint, implement-feature, add-provider, add-catalog-model, add-expression, add-room, add-settings-panel, debug-provider, helper-check |
| **Memory system** | 22 files in `.claude/projects/*/memory/` + MEMORY.md index. Persistent across sessions. Organized: feedback_*, project_*, user_* | **None** (.serena/memories/ exists but empty) |
| **Status tracking** | CURRENT_STATUS.md (single source of truth) + RESUME_PROMPT.md (handoff) | No equivalent. Status scattered across FEATURE_MASTERLIST.md + COMPLETED_FEATURES.md + DEVELOPMENT_ROADMAP.md |
| **Plan files** | 25 files in .claude/plans/ (17 random-named, 8 properly dated). Active: cached-imagining-cocke.md + master replicated-foraging-nebula.md | 3 files in docs/plans/ (all properly dated). Plus README.md with strict naming/revision rules |
| **PRD system** | None formal. Feature specs live in plan files and MEMORY.md | **15 dedicated PRD files** (PRD-*.md, ~25KB each). Structured: Problem → Goals → User Stories → Breakdown → Implementation → Testing |
| **Feature tracking** | Phase completion table in CURRENT_STATUS.md | FEATURE_MASTERLIST.md (40 features, S/A/B/C tiers, effort estimates, dependencies) + COMPLETED_FEATURES.md (archive) |
| **Session handoffs** | CURRENT_STATUS.md update + RESUME_PROMPT.md | Dedicated SESSION_YYYY-MM-DD.md files with pre-flight data collection |
| **Research preservation** | docs/design/competitive-research-*.md (3 files). Some research lost when agents complete and context is cleared | CLAUDE_CODE_HANDOFF.md (700+ lines of research synthesis) + docs/research/model-database-2026.md + competitor-analysis.md |
| **Settings permissions** | 142-line settings.local.json (sprawling, accumulated) | 27-line settings.local.json (clean, minimal) |
| **Commit conventions** | ✅ Excellent: `feat(phase): description` + schema refs | ✅ Excellent: same pattern |
| **Global CLAUDE.md** | Yes — documentation standards (Google-style docstrings, JSDoc) | Not visible |

### Strengths Per Project

**waifu-rt3d wins at:**
- ✅ Persistent memory system (22 files, cross-session context)
- ✅ CURRENT_STATUS.md as single source of truth
- ✅ More skills (15 vs 10) — includes general-purpose ones (tdd, investigate, sprint, audit)
- ✅ AGENTS.md as a discoverable roster with workflow + dispatch rules
- ✅ advisor agent (strategic partner, doesn't code)
- ✅ Research-to-action rule and skill
- ✅ Estimation framework and time tracking in memory
- ✅ Bug fixing rules ("minimum necessary changes")

**AnimeGirly wins at:**
- ✅ Domain-scoped rules (4 files vs 1) — agents get relevant rules per file path
- ✅ PRD system (15 structured specs with Problem/Goals/Stories/Implementation/Testing)
- ✅ Feature masterlist with tiers + dependencies (40 features ranked)
- ✅ Plan file hygiene (naming convention + revision tracking + README)
- ✅ Checkpoint skill (comprehensive — pre-flight data, screenshots, feature masterlist sync)
- ✅ Domain-specific skills (add-provider, add-expression, add-room — scaffolding patterns)
- ✅ Session handoff docs (dedicated SESSION_*.md files)
- ✅ Clean permissions file (27 lines vs 142)
- ✅ perf-reviewer agent (bundle size, performance analysis)
- ✅ CLAUDE.md "soul of the app" section (emotional design language)
- ✅ Completed features archive (historical record)

---

## Part B: Recommended Hybrid System

### Principle: Keep RT3D's infrastructure + adopt AG's documentation patterns

The waifu-rt3d project has stronger *infrastructure* (memory system, status tracking, more skills, AGENTS.md). AnimeGirly has stronger *documentation patterns* (PRDs, feature masterlist, domain rules, session handoffs, plan hygiene). The ideal hybrid keeps both.

### What to KEEP from waifu-rt3d (already working well)
1. Memory system (22 files, MEMORY.md index) — AG doesn't have this
2. CURRENT_STATUS.md as primary status file
3. AGENTS.md roster file
4. advisor agent (strategic partner)
5. General-purpose skills (tdd, investigate, sprint, audit, smoke-test, deploy-check)
6. Research-to-action workflow
7. Bug fixing rules in CLAUDE.md
8. Commit conventions

### What to ADOPT from AnimeGirly

| Adopt | What | Priority | Files to Create/Modify |
|-------|------|----------|----------------------|
| 1 | **Domain-scoped rules** — Split rules into 4 files: `backend-and-api.md`, `frontend-and-ui.md`, `3d-viewer-and-animation.md`, `llm-and-voice.md` | HIGH | `.claude/rules/*.md` (4 new files) |
| 2 | **Feature masterlist** — docs/FEATURE_MASTERLIST.md with tiered features, effort estimates, dependencies | HIGH | `docs/FEATURE_MASTERLIST.md` (new) |
| 3 | **Completed features archive** — docs/COMPLETED_FEATURES.md | HIGH | `docs/COMPLETED_FEATURES.md` (new) |
| 4 | **Plan naming convention enforcement** — README in .claude/plans/ with naming rules, archive random-named plans | HIGH | `.claude/plans/README.md` (new), rename 17 files |
| 5 | **Enhanced checkpoint skill** — Add pre-flight data, FEATURE_MASTERLIST sync, SESSION_*.md creation | MEDIUM | `.claude/skills/checkpoint/SKILL.md` (rewrite) |
| 6 | **Domain-specific scaffold skills** — add-character, add-endpoint, add-theme | MEDIUM | `.claude/skills/add-*/SKILL.md` (3 new) |
| 7 | **"Soul of the app" section in CLAUDE.md** — emotional design language | LOW | `CLAUDE.md` header edit |
| 8 | **perf-reviewer agent** — Bundle size + performance analysis | LOW | `.claude/agents/perf-reviewer.md` (new) |
| 9 | **Clean up settings.local.json** — Reduce from 142 to ~30 lines | LOW | `.claude/settings.local.json` (rewrite) |

### What to CREATE NEW (neither project has)

| Create | What | Why |
|--------|------|-----|
| **Research archive** | `docs/research/` directory with dated research files | Preserve agent research that currently gets lost |
| **Plan index** | `.claude/plans/PLAN_INDEX.md` — active, completed, archived plans | Discoverability for 25+ plan files |
| **PRD template** | `docs/templates/PRD_TEMPLATE.md` — standard PRD structure | Consistent feature specs |
| **Document lifecycle spec** | `docs/DOCUMENT_LIFECYCLE.md` — what gets saved, where, when to archive | Answer the user's core question about saving research |

---

## Part C: "Save Everything" Policy (THE CORE CHANGE)

### Principle: Nothing Gets Lost

**Every plan, every research task, every analysis, every exploration gets saved to disk as a markdown file.** The conversation context is ephemeral — files are permanent. If an agent does 30 minutes of research, the output MUST be written to `docs/` before the session ends.

### What Gets Saved and Where

| Artifact | Directory | Naming | Lifecycle |
|----------|-----------|--------|-----------|
| **Research findings** (competitive analysis, model comparisons, tech evaluations, agent explorations) | `docs/research/` | `YYYY-MM-DD-topic.md` | NEVER delete. Mark stale header after 30 days. |
| **Feature PRDs / specs** | `docs/specs/` | `PRD-feature-name.md` | NEVER delete. Add `Status: ✅ DONE` header when complete. |
| **Plan files** | `.claude/plans/` | `YYYY-MM-DD-description.md` | NEVER delete. Mark `✅ DONE` in header. Move to `.claude/plans/archive/` quarterly. |
| **Session summaries** | `docs/sessions/` | `SESSION_YYYY-MM-DD[a-z].md` | NEVER delete. These are the historical record. |
| **Agent exploration results** | `docs/research/` | `YYYY-MM-DD-exploration-topic.md` | ALWAYS save. Even if obvious — the next session might need it. |
| **Architecture decisions** | `docs/decisions/` | `ADR-NNN-title.md` | NEVER delete. Architecture Decision Records. |
| **Competitive deep-dives** | `docs/research/` | `competitive-YYYY-MM-DD-topic.md` | Update in-place, keep version history in git. |

### NEW CLAUDE.md Rules (to be added)

```markdown
## Research & Planning Persistence

### Rule: Save ALL Research to Disk

When Claude performs research (agent exploration, web searches, competitive analysis,
architecture analysis, codebase deep-dives), the results MUST be saved to
`docs/research/YYYY-MM-DD-topic.md` before the session ends.

**Format:**
- Header: Date, topic, why this research was done
- Findings: Key insights, organized by subtopic
- Files Referenced: Paths to code/docs that were analyzed
- Recommendations: Actionable next steps
- Raw Data: If agents returned large tables/inventories, include them

**Trigger:** After ANY of these occur:
1. 2+ Explore agents dispatched on the same topic
2. Web search with 3+ queries
3. Competitive analysis of any kind
4. Architecture or codebase deep-dive
5. User asks "research X" or "analyze X" or "compare X"

### Rule: Save ALL Plans to Disk

Plan files are NEVER deleted, NEVER overwritten (only appended to).
Completed plans get a `✅ DONE` header but remain in place.
Plan files MUST be named `YYYY-MM-DD-description.md`.

### Rule: Save Session Summaries

At the end of any session with 3+ completed tasks, write a session summary:
`docs/sessions/SESSION_YYYY-MM-DD.md`

Contents: What was done, what was decided, what's next, files changed, test counts.
```

### The Key Change: Auto-Save Research

Currently, when I dispatch 3 Explore agents to research something, their findings exist only in the conversation context and get cleared when the context compresses. **This must stop.**

**New workflow:**
1. Agent research completes → I summarize findings in the chat
2. **IMMEDIATELY** write findings to `docs/research/YYYY-MM-DD-topic.md`
3. Reference the file path in the chat so you can find it later
4. If the research leads to a plan, the plan file links to the research file

**Example from THIS session:**
The two Explore agents that analyzed AnimeGirly's docs and waifu-rt3d's docs produced ~15,000 words of research. That research should be saved to:
- `docs/research/2026-03-25-animegirly-docs-audit.md`
- `docs/research/2026-03-25-waifu-rt3d-docs-audit.md`
- `docs/research/2026-03-25-workflow-comparison.md`

This way, next session (or 3 months from now), anyone can read those files and understand what was learned.

---

## Part D: Phase 20 Completion

### Already Done (by agent, not yet committed)
- `backend/data/model_catalog.json` — 24 LLMs, 10 TTS, 6 STT models
- `backend/llm/link_manager.py` — `get_model_recommendation()` function added

### Remaining (Phase 20B)
- Update README.md: schema badge v52→v60, new features, new endpoints
- Create `docs/FEATURES.md` tracking all 24+ features
- Update CURRENT_STATUS.md to reflect Phase 20

---

## Part E: Claude Code Update

Claude Code 2.1.84 is available (currently on 2.1.81). The user may want to update before or after this work. This is a separate action — `brew upgrade claude-code` or the installer method.

---

## Execution Plan

### Wave 0: Save THIS Session's Research (FIRST)
1. Save AnimeGirly docs audit → `docs/research/2026-03-25-animegirly-docs-audit.md`
2. Save waifu-rt3d docs audit → `docs/research/2026-03-25-waifu-rt3d-docs-audit.md`
3. Save workflow comparison → `docs/research/2026-03-25-workflow-comparison-and-recommendations.md`

### Wave 1: Commit Phase 20A + Create Doc Infrastructure
1. Commit model catalog (Phase 20A)
2. Create `docs/research/` directory (with the 3 research files from Wave 0)
3. Create `docs/specs/` directory
4. Create `docs/sessions/` directory
5. Create `docs/decisions/` directory
6. Create `.claude/plans/README.md` (naming convention from AnimeGirly)
7. Create `.claude/plans/PLAN_INDEX.md`

### Wave 2: Domain Rules + Feature Tracking (parallel agents)
1. Create 4 domain-scoped rule files in `.claude/rules/`
2. Create `docs/FEATURE_MASTERLIST.md` (all 16+20 features with status)
3. Create `docs/COMPLETED_FEATURES.md`

### Wave 3: Enhanced Skills + CLAUDE.md Updates
1. Rewrite checkpoint skill (adopt AG's comprehensive approach)
2. Add "soul of the app" section to CLAUDE.md
3. Add research auto-save rule to CLAUDE.md
4. Create `docs/DOCUMENT_LIFECYCLE.md`

### Wave 4: Cleanup
1. Rename 17 random-named plan files with dates
2. Clean up settings.local.json (142 → ~30 lines)
3. Archive stale memory files
4. Sync RESUME_PROMPT.md to v60

### Wave 5: Phase 20B
1. Update README.md (schema, features, endpoints)
2. Final commit + checkpoint

---

## Pre-Exit Tasks (THIS SESSION)

1. ✅ Commit Phase 20A (model catalog + link_manager)
2. ✅ Save session research to `docs/research/`
3. ✅ Update CURRENT_STATUS.md (v60, 887 tests, phases 17-20A done)
4. ✅ Disable superpowers SessionStart hook (settings change)
5. ✅ Save workflow feedback to memory

## Next Session (after Claude Code update to 2.1.84)

Execute Waves 1-5 from the execution plan above. Read this plan file + CURRENT_STATUS.md to start.

## Verification

1. All .claude/rules/ files have valid `paths:` frontmatter
2. FEATURE_MASTERLIST.md covers all implemented features
3. `.claude/plans/README.md` exists with naming convention
4. `docs/research/` directory exists
5. 887+ tests still pass, tsc clean
6. CURRENT_STATUS.md accurately reflects v60 + all phases done
