# Workflow System Comparison: waifu-rt3d vs AnimeGirly

**Date:** 2026-03-25
**Why:** User requested analysis of both projects' documentation, planning, and workflow systems to design a hybrid approach.
**Agents Used:** 2 Explore agents (AnimeGirly audit + waifu-rt3d audit)

---

## Side-by-Side Matrix

| Dimension | **waifu-rt3d** | **AnimeGirly** | Winner |
|-----------|----------------|----------------|--------|
| CLAUDE.md | 117 lines, action-oriented | 100 lines, soul-oriented + domain vocab | Tie (different strengths) |
| AGENTS.md | 80-line tabular roster + dispatch rules | Does not exist | RT3D |
| Rules | 1 file (context7.md) | 4 domain-scoped files (avatar, chat, providers, UI) | AG |
| Agents | 8 (69-94 lines each) | 9 (51-116 lines each) | Tie |
| Skills | 15 (general-purpose) | 10 (domain-specific scaffolds) | RT3D (quantity), AG (domain focus) |
| Memory | 22 files + MEMORY.md index | None | RT3D |
| Status tracking | CURRENT_STATUS.md + RESUME_PROMPT.md | FEATURE_MASTERLIST + COMPLETED_FEATURES + ROADMAP | RT3D (single source), AG (richer detail) |
| Plan files | 25 files (17 random-named!) | 3 files (all properly dated + README) | AG |
| PRD system | None formal | 15 dedicated PRD files (~25KB each) | AG |
| Feature tracking | Phase table in CURRENT_STATUS.md | 40-feature masterlist with S/A/B/C tiers | AG |
| Session handoffs | Status file updates | Dedicated SESSION_*.md files | AG |
| Research preservation | 3 competitive research files | 700+ line handoff doc + model database | AG |
| Settings permissions | 142 lines (sprawling) | 27 lines (clean) | AG |

## RT3D Unique Strengths
- Persistent memory system (22 files, cross-session)
- CURRENT_STATUS.md as single source of truth
- advisor agent (strategic partner, no code)
- Research-to-action rule and skill
- Estimation framework + time tracking
- Bug fixing rules ("minimum necessary changes")

## AG Unique Strengths
- Domain-scoped rules (path-filtered)
- 15 structured PRDs (Problem/Goals/Stories/Implementation/Testing)
- Feature masterlist with tiers + effort + dependencies
- Comprehensive checkpoint skill (pre-flight data, screenshots, feature sync)
- Domain-specific scaffold skills (add-provider, add-expression, add-room)
- Clean permissions file
- "Soul of the app" section in CLAUDE.md

## Recommended Hybrid
- KEEP RT3D infrastructure (memory, CURRENT_STATUS, AGENTS.md, advisor, general skills)
- ADOPT AG documentation patterns (domain rules, PRDs, feature masterlist, plan hygiene, enhanced checkpoint)
- CREATE NEW: docs/research/ (save all research), docs/specs/ (PRDs), docs/sessions/ (handoffs), plan naming README

## Key Policy: "Save Everything"
Every plan, research task, analysis, and exploration gets saved to disk as markdown.
The conversation context is ephemeral — files are permanent.
