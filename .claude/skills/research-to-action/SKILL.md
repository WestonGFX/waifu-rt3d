---
name: research-to-action
description: "After completing research (competitor analysis, HuggingFace models, similar projects, library exploration), evaluate relevance to project and create actionable implementation specs. Use after any research task, web search, or codebase exploration of external projects."
user_invocable: true
---

# Research → Action Pipeline

After completing any research task, you MUST run this pipeline before reporting results.

## When This Applies

This skill applies whenever you have just:
- Explored competitor apps or similar projects
- Searched HuggingFace for models, datasets, or papers
- Analyzed external codebases or libraries
- Done web research on features, tools, or techniques
- Read documentation for technologies we might integrate
- Browsed repos, demos, or tools related to the project

## Pipeline Steps

### Step 1: Relevance Check

Ask yourself: "Is this research relevant to the current project?"

Criteria for relevance:
- Could any finding be integrated as a feature?
- Does it reveal a pattern/technique we could adopt?
- Does it fill a gap our competitors have but we don't?
- Could it improve an existing feature?
- Does it enable something the user has expressed interest in?

If the research is NOT relevant (rare — the user usually researches things BECAUSE they relate to the project), say so explicitly: "This research doesn't directly apply to our project because [reason]."

If relevant, proceed to Step 2.

### Step 2: Ask the User

Before creating plans, ask:

> "I found [N] actionable items from this research that could be integrated into the project:
> 1. [Brief item] — [one-line value prop]
> 2. [Brief item] — [one-line value prop]
> ...
> Should I create implementation specs for these? I can write detailed plans with files to modify, schema changes, API endpoints, and effort estimates."

Wait for user confirmation before spending time writing detailed specs.

### Step 3: Create Tiered Implementation Specs

Sort all actionable items into priority tiers before writing detailed specs:

| Tier | Criteria | Examples |
|------|----------|---------|
| **T0: Quick Wins** | < 1 day, high impact, minimal risk | Fix a TODO, wire an existing stub, add a config option |
| **T1: High Impact** | 1–3 days, clear value, medium effort | New provider adapter, UI component, API endpoint |
| **T2: Major Features** | 3–7 days, significant new functionality | New subsystem, multi-file feature, schema migration |
| **T3: Major Projects** | 1–2 weeks, large scope, may need design | New frontend, platform integration, community feature |

Present the tier summary FIRST, then write detailed specs for each item:

```markdown
### T[N]-[#]: [Feature Name] (from [Research Source])

**What:** One-sentence description
**Why:** Value proposition / gap it fills
**Effort:** T-shirt size (XS/S/M/L/XL) + day estimate

**Files to Create/Modify:**
| File | Change |
|------|--------|
| `path/to/file.py` | Description of change |

**Schema Changes:** (if any)
```sql
-- Migration vN
ALTER TABLE ... / CREATE TABLE ...
```

**API Endpoints:** (if any)
```
METHOD /api/endpoint → description
```

**Implementation Steps:**
1. Step with specific detail
2. Step with specific detail
...

**Testing:**
- Backend: `.venv/bin/python -m pytest backend/tests/ -q --tb=line`
- Frontend: `cd frontends/sakura && npx tsc --project tsconfig.app.json --noEmit`
- Manual: [specific verification steps]
```

### Step 4b: Test Scaffolding (if user says "implement" or "build it")

If the user authorizes implementation (not just specs):

1. Write test files FIRST for every module in the implementation spec
   - Backend: `backend/tests/test_{feature}.py` with descriptive test names
   - Frontend: Type-check verification via tsc
2. Tests should all FAIL initially (TDD approach)
3. Commit the test scaffolding: `test: scaffold tests for {feature}`

### Step 4c: Autonomous Implementation

After test scaffolding:
1. Implement feature module by module until tests pass
2. Run full test suite between modules
3. Never overwrite the research or plan files — only append updates
4. Commit after each passing module
5. Report final summary with test counts

### Step 4: Save to Plan Doc

Save the specs to `docs/plans/YYYY-MM-DD-[research-topic]-implementation-specs.md`.

Add a reference in the feature menu if one exists (`docs/plans/2026-03-15-feature-menu.md`).

### Step 5: Cross-Reference with Existing Specs

Before finalizing, check if any items overlap with existing specs in:
- `docs/plans/2026-03-15-feature-menu.md` (master feature menu)
- `docs/plans/2026-03-15-actionable-implementation-specs.md` (existing tiered specs)

If overlap found: update/enhance the existing spec rather than creating a duplicate.
If new: add to the appropriate tier in both the new doc and the master feature menu.

## Output Format

After completing the pipeline, your response should include:

1. **Research Summary** — what you found (the normal research output)
2. **Actionable Items Matrix** — table of findings mapped to project features
3. **Implementation Specs** — detailed plans (if user approved in Step 2)

```
=== Research Complete ===

Findings: [N items]
Relevant to project: [Y/N + count]
Actionable specs created: [count]
Saved to: [file path]

Items ready to build:
  T0: [quick wins]
  T1: [medium effort]
  T2: [major features]
```

## Rules

- NEVER produce research-only output without running relevance check
- NEVER skip asking the user about creating plans (unless they pre-authorized in the research request)
- ALWAYS map findings to specific files/patterns in OUR codebase
- ALWAYS include effort estimates based on our architecture
- If the user's research request explicitly says "and create plans" or "for our project", skip the ask in Step 2 and go straight to creating specs
