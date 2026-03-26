# Professional Context Window Compaction Upgrade

## Context

The context management system works but has gaps vs. leading-edge methods. The foundation is solid — `context_assembler.py` does token-budget-aware assembly with 5-tier priority, `compress_session` does rolling LLM summarization, `importance_scorer.py` provides heuristic scoring, and `tiered_memory.py` has a full sqlite-vec RAG system. However: the RAG system isn't wired into the assembler, summarization is single-level with a generic prompt, importance scoring has no semantic signals, compression triggers on message count (not tokens), and there's no cross-session recall or provider cache optimization.

**Goal:** Upgrade to professional-grade compaction with 7 targeted changes, prioritized by impact/effort ratio.

---

## Phase 1 — High Impact, Low Effort (parallel)

### Step 1: Wire sqlite-vec RAG into Context Assembler
**Impact: HIGH | Effort: ~2h | Schema: None**

Currently `vector_store.query_memory()` is called in `_build_prompt_sections` (server.py:2007-2013) and injected as a system prompt section. This means it can't be dropped under budget pressure and its tokens count against system prompt budget. Move it into the assembler as its own priority tier.

**Files:**
- `backend/llm/context_assembler.py` — Add `vector_store` param, new tier between high-importance and game memory
- `backend/server.py` ~line 2007-2013 — Remove RAG from `_build_prompt_sections`, pass `vector_store=vector_store` to `assemble_context` at all 3 call sites (~2473, ~3408, ~3034)
- `backend/tests/test_context_assembler.py` — Add 3 tests (included, budget-constrained, None)

**assembler.py changes:**
```python
def assemble_context(
    ...,
    vector_store=None,  # NEW: TieredMemoryManager or None
) -> AssembledContext:
```

New block after high-importance (after line 159), before game memory:
```python
# ── 4a. Semantic memory recall (sqlite-vec RAG) ──────────────
semantic_messages: list[dict] = []
if vector_store and user_text:
    try:
        hits = vector_store.search(user_text, char_id=char_id, top_k=5)
        for hit in hits:
            msg_cost = count_tokens(hit.get("text", "")) + 4
            if msg_cost > available:
                break
            semantic_messages.append({"role": "system", "content": f"[Memory] {hit['text']}"})
            available -= msg_cost
            result.semantic_memories_included += 1
    except Exception:
        pass
```

Add `semantic_memories_included: int = 0` to `AssembledContext` dataclass.

### Step 2: Character-Aware Summarization Prompt
**Impact: MEDIUM | Effort: ~30min | Schema: None**

Replace generic summarizer prompt in `compress_session` (server.py:4962-4968).

**File:** `backend/server.py`

Replace:
```python
summarize_prompt = (
    "You are a conversation summarizer. Provide a concise summary..."
```
With:
```python
char_row = conn.execute(
    "SELECT c.name FROM sessions s JOIN characters c ON c.id = s.character_id "
    "WHERE s.id = ?", (session_id,)
).fetchone()
char_name = char_row[0] if char_row else "the AI"

summarize_prompt = (
    f"Summarize this conversation between the user and {char_name}. "
    "Preserve:\n"
    "- Key topics and decisions\n"
    "- Emotional tone and relationship dynamics\n"
    "- User preferences, facts, and personal details mentioned\n"
    "- Any promises or commitments made by either party\n"
    "- Named entities (people, places, media) that may be referenced later\n\n"
    f"CONVERSATION:\n{messages_text}\n\n"
    "Write a dense, factual summary under 300 words. Use character names, not 'the AI'."
)
```

### Step 3: Token-Based Compression Triggers
**Impact: MEDIUM | Effort: ~1h | Schema: None**

`_maybe_auto_compress` (server.py:1025) triggers on message count only. Add token-budget trigger.

**File:** `backend/server.py`

Update signature:
```python
def _maybe_auto_compress(
    session_id: int, total_active: int, max_history: int,
    assembled_token_count: int = 0, context_limit: int = 0,
) -> None:
```

Add dual trigger (either fires compression):
```python
# Existing: message count trigger
count_triggered = max_history > 0 and total_active >= int(max_history * 0.9)
# New: token budget trigger
token_triggered = context_limit > 0 and assembled_token_count >= int(context_limit * 0.85)

if not count_triggered and not token_triggered:
    return
```

Update 3 call sites (~2490, ~3431, and multi-chat) to pass `assembled.token_count` and `cfg.get("context_limit", 131072)`.

---

## Phase 2 — Medium Impact, Medium Effort (depends on Phase 1)

### Step 4: Enhanced Importance Scoring
**Impact: MEDIUM | Effort: ~2h | Schema: None**

Add two semantic signals + adaptive threshold. No LLM calls — pure heuristics.

**File:** `backend/llm/importance_scorer.py`

New parameters on `score_message`:
```python
def score_message(
    text, role, *, is_first=False, emotion_intensity=0.0,
    has_user_facts=False, has_question=False,
    prev_text: str = "",              # NEW: previous message for topic shift
    budget_pressure: float = 0.0,     # NEW: 0-1 context fullness
) -> float:
```

New scoring factors:
- **Topic shift** (+0.2): `_keyword_overlap(prev_text, text) < 0.15` — Jaccard similarity of non-stopword tokens
- **Callback reference** (+0.15): Regex match for "like I said", "remember when", "you mentioned", "as we discussed", etc.

New helper:
```python
_STOP_WORDS = {"the", "a", "an", "is", "was", "are", "be", ...}  # ~50 words
_CALLBACK_RE = re.compile(r"(like (i|you) (said|mentioned)|remember when|as (we|you) discussed|going back to|earlier)", re.I)

def _keyword_overlap(a: str, b: str) -> float:
    """Jaccard similarity of non-stopword tokens."""
    ...
```

**File:** `backend/llm/context_assembler.py` line ~145

Replace static threshold:
```python
# Before: importance_score > 0.8
# After: adaptive threshold based on budget pressure
usage_ratio = (budget - available) / budget if budget > 0 else 0
importance_threshold = 0.8 + (usage_ratio * 0.15)  # 0.8 → 0.95 as budget fills
```

**File:** `backend/server.py` — Pass `prev_text` to `score_message` at call sites (~2317, ~3204)

### Step 5: Cross-Session High-Importance Recall
**Impact: MEDIUM | Effort: ~1h | Schema: None**

Currently high-importance recall is scoped to `WHERE session_id = ?`. Expand to all sessions for the same character.

**File:** `backend/llm/context_assembler.py` line ~143

Change query from:
```sql
WHERE session_id = ? AND is_active = 0 AND importance_score > 0.8
```
To:
```sql
WHERE char_id = ? AND is_active = 0 AND importance_score > ?
  AND session_id != ?
ORDER BY importance_score DESC, id DESC LIMIT 10
```

This pulls high-importance messages from ANY session with this character (excluding current session to avoid duplication with recent messages). Uses the adaptive threshold from Step 4.

Also add current-session high-importance recall as a separate query (keeps existing behavior):
```sql
WHERE session_id = ? AND is_active = 0 AND importance_score > ?
ORDER BY id ASC LIMIT 5
```

---

## Phase 3 — Higher Effort (independent, lower priority)

### Step 6: Hierarchical Summarization (Summary-of-Summaries)
**Impact: HIGH for long convos | Effort: ~3h | Schema: v54**

When >5 rolling summaries exist, distill them into a meta-summary. Prevents linear summary chain growth.

**Schema v54** (`backend/preflight.py`):
```sql
ALTER TABLE session_summaries ADD COLUMN meta_summary_id INTEGER DEFAULT NULL;
```
When set, the child summary has been "rolled up" and is skipped by the assembler.

**File:** `backend/llm/context_assembler.py`

New function:
```python
def _maybe_create_meta_summary(session_id, cur, cfg, threshold=5) -> None:
```
Logic: Count summaries WHERE `meta_summary_id IS NULL`. If ≥ threshold, take oldest 4-5, send to LLM with focused prompt ("Distill these summaries into a single narrative. Preserve: topics, emotional arcs, user facts, promises."), insert as new meta-summary row, update children with `meta_summary_id`.

Modify summary loading query (line 118):
```sql
WHERE session_id = ? AND meta_summary_id IS NULL ORDER BY msg_range_start ASC
```

Call `_maybe_create_meta_summary` at end of `compress_session` in server.py.

**Also update:** `backend/tests/conftest.py` — add `meta_summary_id` to `session_summaries` CREATE TABLE.

### Step 7: Anthropic Prompt Caching
**Impact: MEDIUM (cost/latency) | Effort: ~3h | Schema: None**

System prompt and rolling summaries are stable between turns — ideal for Anthropic's prompt caching.

**File:** `backend/llm/context_assembler.py`
- Add `cache_hints: bool = False` param
- Add `cache_breakpoints: list[int]` to `AssembledContext`
- Record indices where system prompt ends and summaries end

**File:** `backend/llm/adapters/claude_api.py`
- When cache hints present, restructure system prompt as content block array with `cache_control: {"type": "ephemeral"}` on stable prefix blocks
- Add `anthropic-beta: prompt-caching-2024-07-31` header

**File:** `backend/server.py`
- Pass `cache_hints=True` when provider is "claude" and `cfg.llm.prompt_caching` is enabled

---

## Critical Files

| File | Steps | Change |
|------|-------|--------|
| `backend/llm/context_assembler.py` | 1,4,5,6,7 | Core: RAG tier, adaptive threshold, cross-session, meta-summaries, cache hints |
| `backend/llm/importance_scorer.py` | 4 | Topic shift, callback detection, keyword overlap |
| `backend/server.py` | 1,2,3,6 | Remove RAG from sections, pass vector_store, update prompt, token triggers, meta-summary call |
| `backend/llm/adapters/claude_api.py` | 7 | Prompt caching content blocks |
| `backend/preflight.py` | 6 | v54 migration (meta_summary_id) |
| `backend/tests/test_context_assembler.py` | 1,4,5,6 | New tests for RAG, adaptive threshold, cross-session, meta-summary |
| `backend/tests/test_importance_scorer.py` | 4 | New file: topic shift, callback, overlap tests |
| `backend/tests/conftest.py` | 6 | Add meta_summary_id to test schema |

---

## Verification

```bash
# Backend tests
.venv/bin/python -m pytest backend/tests/ -q --tb=line

# Frontend type check (ContextBudgetPill may need budget_summary field updates)
cd frontends/sakura && npx tsc --project tsconfig.app.json --noEmit

# Manual verification
# 1. Start a long conversation (30+ messages)
# 2. Check /api/context-budget/{session_id} — verify semantic memories section appears
# 3. Trigger compression, verify character-aware summary quality
# 4. Continue conversation — verify cross-session recall pulls relevant context
# 5. Check token-based auto-compression fires (set context_limit low, e.g. 4096)
# 6. For Anthropic users: verify cache_control in API payload via debug logging
```

---
---

# Phase 3: Strategic Advisor Agent + AGENTS.md Overhaul

## Context

The project has 7 custom agents in `.claude/agents/` but no **strategic thinking partner** — someone who proactively suggests features, writes PRDs, challenges assumptions, and plans sprints. The `prd-writer` writes specs but doesn't think strategically. The `orchestrator` dispatches work but doesn't design it. This phase fills that gap and cleans up `AGENTS.md` (currently just InsForge SDK docs) into a real agent governance document.

## Step 1: Create `.claude/agents/advisor.md`

**NEW FILE**

```yaml
---
name: advisor
description: Senior technical advisor and product strategist. Proactively suggests features, identifies risks, writes PRDs, and challenges assumptions. The thinking partner — never writes code directly.
model: opus
tools: [Read, Glob, Grep, Bash, Write, Agent, WebSearch, WebFetch]
---
```

**Persona prompt:**

```
You are a senior staff engineer and product strategist for waifu-rt3d,
a commercial AI companion platform (React 19 + FastAPI + Three.js/VRM + Live2D).

## Your Role
You are Chris's strategic thinking partner. You don't write implementation
code — you design systems, write PRDs, identify risks, suggest features,
and challenge weak assumptions. You think 3 steps ahead.

## Core Behaviors
- **Proactive**: Don't wait to be asked. If you see a gap, flag it.
  If a design has a flaw, say so before implementation starts.
- **Opinionated**: Have strong opinions, loosely held. Recommend ONE
  approach, not three. Explain trade-offs only when asked.
- **Dual-Audience PRDs**: Always use Why (for Chris, plain English) /
  How (for AI implementer, exact files + functions) format.
- **Effort-Aware**: Every suggestion includes rough effort (hours/days)
  and dependencies. Never propose work without sizing it.
- **Pattern-First**: Before designing anything new, find what already
  exists in the codebase that can be reused or extended.
- **Scope Guardian**: Flag scope creep explicitly — "this is getting
  bigger than planned." Keep features shippable.

## What You Produce
- Feature PRDs (dual-audience Why/How format)
- Architecture decisions with trade-off analysis
- Sprint plans with dependency ordering
- Risk assessments for proposed changes
- Proactive feature suggestions based on codebase gaps
- Post-mortems when things go wrong

## Output Format
- Lead with your recommendation, not options
- Size everything: S (<2h), M (2-4h), L (4-8h), XL (1-2d), XXL (2d+)
- Use tables for comparisons, not prose
- Include file paths when referencing code
- ASCII mockups for UI suggestions

## Hard Rules
- Never write implementation code. Delegate to senior-dev/ux-architect.
- Always check existing code before proposing new patterns.
- Size every suggestion (S/M/L/XL/XXL with hour ranges).
- When Chris says "what do you think?" — give YOUR opinion first,
  then alternatives only if asked. Don't hedge.
- Reference the feature menu (docs/plans/2026-03-15-actionable-implementation-specs.md)
  before suggesting new features — it may already be specced.
- Respect user's stated preferences from MEMORY.md:
  - NO native OS notifications (ever)
  - NO multi-character group chats (unless explicitly asked)
  - Game Spectator is the favorite feature idea
  - Seasonal events = bad idea, removed
```

## Step 2: Overhaul `AGENTS.md`

**REPLACE** current content (InsForge SDK docs → real agent governance).

```markdown
# AGENTS.md — waifu-rt3d

> Agent roster and workflow for the waifu-rt3d AI companion platform.
> 8 specialized agents orchestrated via MoE.

## Strategy & Planning
| Agent | Model | Role | Codes? |
|-------|-------|------|--------|
| **advisor** | opus | Strategic partner. PRDs, architecture, risk, feature ideas. | No |
| **prd-writer** | opus | Spec author. Dual-audience Why/How format. | No |

## Implementation
| Agent | Model | Role | Codes? |
|-------|-------|------|--------|
| **orchestrator** | opus | Dispatches up to 8 agents. Independence + conflict checks. | No |
| **senior-dev** | sonnet | Full-stack Python + React. Primary implementation agent. | Yes |
| **ux-architect** | sonnet | UI/UX. CSS variables, Framer Motion, 18 themes. | Yes |
| **schema-architect** | sonnet | SQLite migrations, preflight.py, data modeling. | Yes |

## Quality & Intelligence
| Agent | Model | Role | Codes? |
|-------|-------|------|--------|
| **qa-hunter** | sonnet | Tests, edge cases, regressions. pytest + tsc. | Yes |
| **codebase-analyst** | sonnet | Read-only intelligence. Maps deps, finds reuse. | No |

## Standard Workflow
1. **Chris + advisor** scope the feature (planning window)
2. **advisor** writes PRD → plan file
3. **orchestrator** decomposes → dispatches implementation agents
4. **qa-hunter** validates (pytest + tsc --noEmit)
5. **advisor** reviews output against PRD

## Dispatch Rules
- **Small change** (< 2h): senior-dev alone
- **Medium feature** (2h-1d): senior-dev + ux-architect, sequential
- **Large feature** (1-3d): orchestrator dispatches 3-5 agents in parallel
- **New feature from scratch**: advisor → prd-writer → orchestrator → agents

## Tech Stack Reference
- Backend: Python 3.14, FastAPI, SQLite (schema v52), .venv/ (Homebrew)
- Frontend: React 19, TypeScript, Zustand, Framer Motion, Vite
- 3D: Three.js VRM viewer (iframe + postMessage), Live2D (PIXI)
- Voice: WebSocket duplex, VAD, Kokoro TTS, 16-emotion modulator
- Testing: pytest (backend), tsc --noEmit (frontend), Playwright (e2e)
```

## Step 3: Create `/plan` skill (Optional)

**NEW FILE:** `.claude/skills/plan/SKILL.md`

```yaml
---
name: plan
description: Strategic planning session — advisor analyzes request, checks existing specs, writes structured PRD
user_invocable: true
---
```

When invoked (`/plan voice-to-voice calling`), the skill instructs Claude to:
1. Read `docs/plans/2026-03-15-actionable-implementation-specs.md` for existing specs
2. Read MEMORY.md for user preferences and blockers
3. Explore relevant codebase areas
4. Produce a PRD in dual-audience Why/How format
5. Size the work and identify dependencies

## Files to Create/Modify

| File | Action | Size |
|------|--------|------|
| `.claude/agents/advisor.md` | CREATE | ~60 lines |
| `AGENTS.md` (project root) | REPLACE | ~50 lines |
| `.claude/skills/plan/SKILL.md` | CREATE (optional) | ~30 lines |

## Verification

```bash
# Verify agent file has valid frontmatter
head -20 .claude/agents/advisor.md

# Verify AGENTS.md
head -40 AGENTS.md

# Functional test: spawn advisor in a new Claude Code window
# Ask: "what should we build next?"
# Expected: reads feature menu + MEMORY.md, gives opinionated recommendation with sizing
```

---
---

# Phase 4: /plan Skill + Agent Workflow Polish

## Context
The advisor agent (Phase 3) is a standalone agent. To make planning a one-command workflow, create a `/plan` skill that auto-chains: read existing specs → explore codebase → produce dual-audience PRD. Also add an auto-review hook so the advisor reviews implementation output.

## Step 1: Create `/plan` Skill

**NEW FILE:** `.claude/skills/plan/SKILL.md`

```yaml
---
name: plan
description: Strategic planning session — explores codebase, checks existing specs, produces dual-audience PRD with sizing
user_invocable: true
---
```

**Skill body instructs Claude to:**
1. Read `docs/plans/2026-03-15-actionable-implementation-specs.md` — check if feature already specced
2. Read `.claude/projects/-Users-chris-Code-waifu-rt3d/memory/MEMORY.md` — respect preferences/blockers
3. Explore codebase for existing code that can be reused (launch Explore agent)
4. Produce PRD in dual-audience Why/How format (from prd-writer conventions)
5. Size work: S/M/L/XL/XXL with file plan table
6. Append PRD to current plan file (never overwrite)

## Step 2: Add Post-Implementation Review Hook

**File:** `.claude/settings.json` — add to hooks

After any `/go` execution completes, the advisor should auto-review:
- Did implementation match the PRD?
- Any files modified that weren't in the plan?
- Tests passing?

This is a `Stop` event hook that checks if the last action was a `/go` skill run.

## Files

| File | Action |
|------|--------|
| `.claude/skills/plan/SKILL.md` | CREATE |
| `.claude/settings.json` | MODIFY (add review hook) |

---
---

# Phase 5: Outfit / Costume System (Expanded)

## Context

12 characters already have wardrobe docs (`docs/characters/*/07_wardrobe.md`) with 5-7 outfits each. The question is: how do you actually swap outfits across VRM, Live2D, and GLB model types?

## Technical Reality by Model Type

| Model Type | Feasibility | How | Effort |
|-----------|-------------|-----|--------|
| **GLB + Morph Targets** | ✅ Best | Artist embeds outfit variants as morph targets. Swap = one `setGlbMorphTarget()` call. Instant, blendable. | **S** (code) + artist work |
| **GLB + Mesh Toggle** | ✅ Good | Artist models outfits as separate meshes (e.g. `outfit_casual`, `outfit_formal`). Swap = toggle `child.visible`. No blending. | **S** (code) + artist work |
| **VRM** | ⚠️ Harder | VRM 1.0 has no outfit spec. Two options: (A) separate `.vrm` file per outfit (slow reload), or (B) embed outfit meshes in single VRM with visibility toggle (non-standard but works). | **M-L** per character |
| **Live2D** | ⚠️ Harder | Requires separate `.model3.json` per outfit OR Cubism parameter-driven clothing layer switching. | **L** per character |

**Existing infrastructure already built:**
- `viewerStore.ts:690-698` — `dispatchSetGlbMorphTarget()` exists
- `viewer.html:5002-5020` — `setGlbMorphTarget()` implementation ready
- `viewer.html:4981-5000` — `getGlbMorphTargets()` query API ready

**Recommended approach:**
- **GLB models**: morph targets for outfit variants (best path) or mesh visibility toggle (fallback)
- **VRM models**: store alternate model URLs per outfit, reload with crossfade transition
- **Live2D models**: store alternate model3.json URLs per outfit, reload with opacity crossfade

### Blender Workflow for Creating Outfit-Ready Models

**For GLB Mesh Toggle approach (recommended for custom models):**
1. Create base character mesh (body, head, hair)
2. Create each outfit as a **separate mesh object** named with prefix: `outfit_casual`, `outfit_formal`, etc.
3. All outfit meshes share the same armature (parent to same skeleton)
4. Weight paint each outfit mesh to the skeleton bones
5. Export as GLB — all meshes included, app toggles visibility at runtime

**For GLB Morph Target approach (advanced):**
1. Create base mesh with all outfit geometry in default state
2. Use Blender Shape Keys: add a key per outfit variant
3. Each shape key deforms the mesh to show/hide outfit parts
4. Export as GLB with morph targets embedded
5. App sets morph target value 0.0→1.0 to blend between outfits

**For VRM outfit variants:**
1. Create base character in VRoid Studio or Blender
2. For each outfit, duplicate the project and modify clothing
3. Export each as a separate .vrm file (e.g., `alana_casual.vrm`, `alana_formal.vrm`)
4. Ensure all variants share identical bone structure + blend shapes
5. App reloads model on outfit swap (1-3 second transition)

## Step 1: Schema v54 — Outfit System

**File:** `backend/preflight.py`

```sql
CREATE TABLE IF NOT EXISTS character_outfits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    char_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    swap_method TEXT DEFAULT 'model_swap',  -- 'model_swap', 'morph_target', 'mesh_toggle'
    model_override_url TEXT,        -- alternate VRM/Live2D/GLB for 'model_swap'
    morph_target_name TEXT,         -- GLB morph target name for 'morph_target'
    mesh_names TEXT,                -- JSON array of mesh names for 'mesh_toggle'
    thumbnail_url TEXT,
    unlock_condition TEXT,          -- 'default', 'affinity_50', 'streak_7', 'streak_30'
    unlocked INTEGER DEFAULT 0,
    equipped INTEGER DEFAULT 0,
    scene_description TEXT,         -- injected into system prompt
    created_at TEXT DEFAULT (datetime('now'))
);

ALTER TABLE characters ADD COLUMN active_outfit_id INTEGER REFERENCES character_outfits(id);
```

## Step 2: Backend — Outfit API

**File:** `backend/server.py`

- `GET /api/characters/{id}/outfits` — list all outfits + unlock status
- `POST /api/characters/{id}/outfits/{outfit_id}/equip` — set active, dispatch viewer command
- `POST /api/characters/{id}/outfits/{outfit_id}/unlock` — check condition against rewards tracker
- `GET /api/characters/{id}/outfits/current` — get equipped outfit details

Equipping dispatches based on `swap_method`:
1. `model_swap` → send load-model command to viewer (VRM/Live2D/GLB reload)
2. `morph_target` → send `setGlbMorphTarget` command (instant)
3. `mesh_toggle` → send mesh visibility commands (instant)
4. Always: inject `scene_description` into next chat context

## Step 3: Frontend — Outfit Picker UI

**NEW FILE:** `frontends/sakura/src/components/OutfitPanel.tsx`

Overlay panel (follows EffectsPanel.tsx pattern — sidebar, z-index 200-300):
- Grid of outfit thumbnails (locked = greyed + lock icon + unlock hint)
- Current outfit highlighted with accent border
- Click to equip → viewerStore dispatch → viewer postMessage
- Unlock progress: "Reach affinity 50 to unlock" / "Chat streak of 7 days"
- Animation: Framer Motion slide-in, spring transition

## Step 4: Seed Outfits from Wardrobe Docs

**Script or migration:** Parse `docs/characters/*/07_wardrobe.md` → INSERT into `character_outfits`.
- Default outfit per character: `unlocked=1, equipped=1`
- 2-3 outfits locked behind affinity/streak milestones
- `scene_description` from wardrobe doc narrative

## Step 5: Context Integration

**File:** `backend/llm/context_assembler.py`

Inject active outfit's `scene_description` as low-priority context:
```
[Current appearance: wearing a casual hoodie and shorts, relaxing at home]
```

## Files

| File | Action | Effort |
|------|--------|--------|
| `backend/preflight.py` | v54 migration | S |
| `backend/server.py` | 4 outfit endpoints | M |
| `frontends/sakura/src/components/OutfitPanel.tsx` | NEW — outfit picker | M |
| `frontends/sakura/src/stores/viewerStore.ts` | outfit swap dispatch by method | S |
| `backend/llm/context_assembler.py` | scene_description injection | S |
| `backend/tests/test_outfits.py` | NEW — outfit tests | S |
| `backend/tests/conftest.py` | add character_outfits table | S |

**Total effort: XL (~2-3 days)**

---
---

# Phase 6: Critical Edge Case Fixes (Robustness Sweep)

## Context
Codebase scan found 20 edge cases. These 5 are high-severity and should be fixed before new features.

## Fix 1: Wire rewards tracker into chat (HIGH)

**File:** `backend/server.py` — `/api/chat` endpoint (~line 2300)

`backend/rewards/tracker.py` has `record_interaction()` but it's **never called**. Streaks don't increment. Add call after successful LLM response:

```python
from backend.rewards.tracker import record_interaction
# After LLM reply saved to DB:
record_interaction(char_id, cur)
```

**Effort: S (<1h)**

## Fix 2: TTS chunk error handling (HIGH)

**File:** `backend/server.py:3122`

Currently returns `None` on TTS failure. Change to proper error dict:

```python
return {"ok": False, "error": "TTS chunk generation failed", "details": str(e)}
```

**Effort: S (<30 min)**

## Fix 3: Bare except in whisper_local.py (HIGH)

**File:** `backend/asr/adapters/whisper_local.py:80`

Replace bare `except:` with `except Exception as e:` + logging.

**Effort: S (<15 min)**

## Fix 4: Silent GPU detection failure (MEDIUM)

**File:** `backend/llm/link_manager.py:533`

Add `logger.debug()` to the bare `except Exception: pass` so GPU detection failures are visible in debug mode.

**Effort: S (<15 min)**

## Fix 5: Hardcoded affinity defaults (MEDIUM)

**File:** `backend/server.py:6647`

Relationship defaults to 0.5 (mid-tier) instead of 0.0 (stranger). Fix to use 0.0 default when no relationship data exists.

**Effort: S (<15 min)**

**Total effort: M (~2h for all 5 fixes)**

---
---

# Phase 7: 3D Immersion — Full Research + Roadmap

## Context
User asked: should we use Unity or another technology for more realistic animations, physics, and environment interaction? Research found: **stay on Three.js + Rapier**, but there's a massive menu of interaction features we can add incrementally.

## Engine Decision: Stay on Three.js + Add Rapier

| Technology | Physics | Animation | Bundle Size | Integration Effort |
|-----------|---------|-----------|-------------|-------------------|
| **Three.js + Rapier** ✅ | Good (cloth via Verlet, soft-body) | Excellent | +500KB WASM | **Low — extend current** |
| Babylon.js | Built-in (Cannon/Ammo) | Excellent | +1.5MB | Medium (rewrite viewer) |
| Unity WebGL | Excellent (PhysX) | Excellent | +15-50MB base | **High (rebuild everything)** |
| Godot WebExport | Good (Jolt) | Good | +10-30MB | High (port architecture) |

**Why Three.js + Rapier wins:**
- Current setup already optimized (509KB main chunk)
- Rapier WASM adds only ~500KB
- Works with existing VRM pipeline — no model conversion
- WebGPU compute shaders now available in Chrome/Firefox for advanced cloth sim
- Competitors (Replika, Otherhalf.ai) use similar web-based stacks

**Don't do:** Unity WebGL (15-50MB overhead), Babylon.js (full viewer rewrite), Godot (port everything).

## Complete "What's Possible" Interaction Menu

### Tier 1: Quick Wins (1-3 days each, HIGH impact)

| Feature | How | Effort | Impact |
|---------|-----|--------|--------|
| **Natural blinking** | Timer + random double-blink + variance | S (1d) | HIGH — essential lifelike feel |
| **Breathing animation** | Subtle chest/shoulder bone scale loop | S (1d) | HIGH — characters feel alive |
| **Idle fidgeting** | Randomized anim clips (hair twirl, stretch, weight shift) | M (2-3d) | HIGH — personality expression |
| **Eye saccades** | Procedural eye bone micro-rotations + flick patterns | S (1-2d) | HIGH — attention/presence |
| **Emotion→animation mapping** | State machine: happy→bounce, sad→droop, confused→head tilt | M (3d) | VERY HIGH — core companion feel |
| **Pupil dilation** | Shader-based iris size modulation on emotion state | S (1d) | MEDIUM — subtle but noticed |

### Tier 2: Medium Effort (3-7 days each, HIGH impact)

| Feature | How | Effort | Impact |
|---------|-----|--------|--------|
| **Hair spring bone physics** | VRM Spring Bone or custom Verlet chain on hair bones | M (3-5d) | VERY HIGH — most visible |
| **Lip-sync from TTS audio** | Phoneme lookup table + blend shape timeline from transcript | M (3-5d) | VERY HIGH — voice immersion |
| **Touch/poke interaction** | Raycast + vertex displacement shader on click | M (3-5d) | HIGH — engagement/fun |
| **Blushing/skin color** | Vertex color overlay + bloom shader on compliment detection | S (2d) | HIGH — emotional feedback |
| **Soft-body jiggle** | Spring chain physics on secondary bones (lightweight) | M (5-7d) | HIGH — anime authenticity |
| **Wind effect on hair/clothes** | WebGL particle system + physics modifier | S (2-3d) | MEDIUM — atmosphere |

### Tier 3: Substantial Effort (1-3 weeks each, VERY HIGH impact)

| Feature | How | Effort | Impact |
|---------|-----|--------|--------|
| **Cloth/skirt physics** | WebGPU compute shader + PBD solver on dress/skirt meshes | L (2w) | VERY HIGH — visual wow |
| **IK hand reaching** | FABRIK solver + hand target placement for gestures | L (1w) | HIGH — interactivity |
| **Webcam facial tracking** | MediaPipe facemesh → VRM blend shape mapping | L (1w) | VERY HIGH — VTuber-like |
| **Sitting/lying on furniture** | IK constraint chains + pose blending + seat raycast | L (2-3w) | HIGH — contextual |
| **Weather effects on character** | Particle collision + shader overlay (rain, wind) | M (1w) | MEDIUM — atmosphere |

### Tier 4: Experimental / Long-term

| Feature | How | Effort | Impact |
|---------|-----|--------|--------|
| Neural motion diffusion (MDM) | ONNX model inference for pose generation | XL (3-4w) | VERY HIGH (if works) |
| Speech-to-gesture synthesis | Lightweight RNN from audio → skeletal keyframes | XL (2-3w) | HIGH |
| Ragdoll reactions | Physics body switch + animation blend | L (1-2w) | MEDIUM — fun factor |
| Full mocap pipeline | VSeeFace/VMC protocol receiver | L (1w setup) | HIGH — VTuber mode |

## Recommended Implementation Roadmap

| Phase | Features | Effort | Cumulative Impact |
|-------|----------|--------|-------------------|
| **Immersion P1** | Blinking, breathing, eye saccades, emotion mapping | S-M (1w) | Characters feel alive |
| **Immersion P2** | Hair physics, idle fidgeting, lip-sync | M (2w) | Characters feel real |
| **Immersion P3** | Touch interaction, blushing, soft-body | M-L (2w) | Characters feel responsive |
| **Immersion P4** | Cloth physics, wind, IK reaching | L (3w) | Characters inhabit world |
| **Immersion P5** | Webcam tracking, furniture IK, weather | L-XL (4w) | Full immersion |

**Start with Immersion P1 after edge fixes + outfits.** Each phase is independently shippable.

## Competitor Comparison

| App | 3D Physics | Interaction | Our Advantage |
|-----|-----------|-------------|---------------|
| Replika | Basic skeletal | AR mode, voice | We have Live2D + VRM hybrid, 18 themes |
| Character.AI | None (text only) | Text + voice | We have full 3D + expressions + physics |
| Otherhalf.ai | "Lifelike" (proprietary) | Multimodal | We're open/local-first, run on user hardware |
| VTube Studio | Spring bones, Live2D physics | Webcam tracking | We have chat AI + mood engine + memories |
| Gatebox | Holographic (hardware) | Ambient | We're software-only, accessible |

---
---

# Phase 8: User Retention + Immersion Improvements

## Retention Gaps (from codebase scan)

| Gap | Status | Fix Effort |
|-----|--------|-----------|
| Rewards tracker not wired | **Phase 6 Fix 1** | S |
| Proactive messages partial | **Phase 1 (this sprint)** | XL |
| Memory Book UI (read-only) | No PATCH/DELETE endpoints | M |
| Outfit unlock progression | **Phase 5** | XL |

## Immersion Gaps

| Feature | Status | Priority |
|---------|--------|----------|
| Post-processing (bloom, color) | ✅ Working | — |
| Particles (sakura, dust, snow) | ✅ Working | — |
| Cinematic mode | ✅ Working | — |
| Visual novel layout | ✅ Working | — |
| Ambient soundscape (8 tracks) | ✅ Working | — |
| Dynamic scene backgrounds | Deferred by user ("meh") | Low |
| AI motion generation (MotionLCM) | Stub at `motion_server.py:237` | Low |
| Hair/cloth physics | Not started | **Phase 7 P1-P2** |

## Retention Strategy: Unlock Loop

The outfit system (Phase 5) creates a natural retention loop:
1. Chat with character → affinity increases (rewards tracker)
2. Hit milestone → unlock new outfit (proactive message announces it)
3. Equip outfit → scene_description changes character's behavior in chat
4. New outfit creates novelty → user chats more → loop repeats

This requires Phases 1 (proactive) + 5 (outfits) + 6 Fix 1 (rewards wiring) to work together.

---
---

# Phase 9: Adaptive Intelligence Engine (LOCAL AI PERSONALIZATION)

## Context — The Big Idea

The codebase has 7 personalization systems (facts, memory, mood, affinity, context assembly, proactive, rewards) but they all run in **open loop** — they produce output but never measure whether the user liked it. The killer feature is closing these loops: use the user's **local LLM** to analyze conversations, learn preferences, and auto-customize the experience. All data stays on-device. This is the privacy moat competitors can't match.

### What Exists (Strong Foundation)
- `user_facts` table — extracts identity/preference/history facts from conversations
- `memories` table + sqlite-vec — 3-tier episodic memory with vector search
- `interaction_rewards` — daily XP, streaks, relationship tiers
- `character_relationships` — affinity, mood, trust columns (mood/trust **NEVER UPDATED**)
- `MoodEngine` — time-of-day mood prefix injection
- `context_assembler` — token-budget-aware context with importance scoring
- `proactive/` — scheduler + trigger + generator pipeline

### What's Missing (The Feedback Loops)
1. **No user satisfaction signal** — app can't tell if user liked a response
2. **No response style learning** — doesn't detect preferred length, formality, humor level
3. **No topic preference tracking** — doesn't learn what user wants to discuss
4. **No conversation reflection** — LLM never analyzes "what worked?"
5. **No A/B testing** — can't try variations and measure engagement
6. **Trust/mood columns unused** — exist in schema but never written to
7. **No auto-tuning** — all settings are manual or hardcoded

## Architecture: The Reflection Loop

```
User chats → Messages saved → [EVERY 50 MESSAGES OR WEEKLY]
    → Local LLM "Reflection Prompt" analyzes recent history
    → Produces: preference updates, trait adjustments, topic affinities
    → Stored in user_profile table
    → Injected into system prompts for future conversations
    → Character behavior subtly shifts
    → User engages more → Loop repeats
```

## Step 1: Schema v55 — User Profile + Engagement Signals

**File:** `backend/preflight.py`

```sql
CREATE TABLE IF NOT EXISTS user_profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    char_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    -- Learned preferences (0.0-1.0 scales)
    pref_response_length REAL DEFAULT 0.5,    -- 0=brief, 1=detailed
    pref_formality REAL DEFAULT 0.5,          -- 0=casual, 1=formal
    pref_humor REAL DEFAULT 0.5,              -- 0=serious, 1=playful
    pref_empathy REAL DEFAULT 0.5,            -- 0=matter-of-fact, 1=emotional
    pref_depth REAL DEFAULT 0.5,              -- 0=surface, 1=philosophical
    -- Learned topic affinities (JSON: {"anime": 0.9, "gaming": 0.8, ...})
    topic_affinities TEXT DEFAULT '{}',
    -- Personality trait weights the user responds to
    trait_weights TEXT DEFAULT '{}',
    -- Learned timing preferences
    preferred_active_hours TEXT,               -- learned from interaction patterns
    preferred_greeting_style TEXT,             -- "energetic", "calm", "playful"
    -- Reflection memos
    last_reflection_at TEXT,
    reflection_memo TEXT,                      -- latest LLM reflection summary
    total_reflections INTEGER DEFAULT 0,
    -- Metadata
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

-- Engagement signals on every message
ALTER TABLE messages ADD COLUMN engagement_score REAL;
ALTER TABLE messages ADD COLUMN detected_mood TEXT;
ALTER TABLE messages ADD COLUMN response_time_ms INTEGER;
```

Also update `character_relationships` to actually be written:
- Wire `trust` and `mood` columns to update based on conversation quality signals

## Step 2: Create `backend/adaptive/reflector.py` — The Reflection Engine

**NEW FILE** — Core of the system

```python
async def run_reflection(char_id: int, db_path: str, llm_config: dict) -> dict:
    """
    Analyze recent conversations and update user profile.

    Triggered every 50 messages or weekly (whichever first).
    Uses the user's local LLM to analyze patterns — no cloud calls.
    """
```

**Reflection prompt template:**
```
You are analyzing the last {N} messages between yourself and the user.

Recent conversation excerpts:
{last_50_messages}

User facts on file:
{user_facts}

Current user profile:
{current_profile}

Analyze and answer:
1. What response LENGTH does this user prefer? (brief/medium/detailed)
2. What FORMALITY level? (casual/balanced/formal)
3. What HUMOR level? (serious/moderate/playful)
4. What TOPICS excited them most? (list top 3)
5. What topics bored them? (list any)
6. What personality traits did they respond to best?
7. What should you do differently next time? (2-3 actionable notes)

Output as JSON: {pref_response_length, pref_formality, pref_humor, ...}
```

**Engagement heuristics (no LLM needed):**
- Message length ratio (user/assistant) → preferred response length
- Response time → engagement level (fast = engaged, slow = losing interest)
- Conversation continuation → satisfaction signal (kept talking = good)
- Question frequency → depth preference (many questions = wants detail)
- Emoji/kaomoji usage → humor/casualness preference

## Step 3: Create `backend/adaptive/tuner.py` — Auto-Tuning Engine

**NEW FILE**

```python
def apply_profile_to_prompt(profile: dict, base_prompt: str) -> str:
    """
    Inject learned preferences into system prompt.

    Adds adaptive instructions like:
    - "Keep responses under 3 sentences (user prefers brief)"
    - "Use casual language with occasional humor"
    - "This user loves discussing anime and philosophy"
    """
```

**Auto-tunable parameters:**
| Parameter | Source | How It's Tuned |
|-----------|--------|---------------|
| Response length | pref_response_length | System prompt instruction |
| Formality | pref_formality | System prompt tone guidance |
| Humor level | pref_humor | System prompt personality weight |
| Topic steering | topic_affinities | Context assembler priority boost |
| Proactive timing | preferred_active_hours | Scheduler active hours override |
| Greeting style | preferred_greeting_style | Greeting generator template |
| Mood intensity | engagement signals | Auto-adjust mood_intensity |
| TTS speed/pitch | (future: playback engagement) | TTS parameter override |

## Step 4: Wire into Chat Pipeline

**File:** `backend/server.py` — `/api/chat` endpoint

After each successful LLM response:
1. Record engagement signals (response_time_ms, message length ratio)
2. Run lightweight mood detection on user message (keyword-based, no LLM)
3. Check if reflection threshold reached (50 messages since last reflection)
4. If yes, queue async reflection task (don't block chat)

Before each LLM call:
1. Load user profile for active character
2. Call `apply_profile_to_prompt()` to inject preferences
3. Boost topic affinities in context assembler priority

## Step 5: Wire Trust + Mood Updates

**File:** `backend/server.py` or new `backend/adaptive/relationship.py`

Actually update `character_relationships.trust` and `.mood`:
- Trust increases on: long conversations, self-disclosure, returning after absence
- Trust decreases on: long gaps, very short dismissive messages
- Mood reflects recent conversation tone (weighted average of detected moods)

## Step 6: Frontend — Personalization Insights UI

**File:** `frontends/sakura/src/views/SettingsView.tsx` (expand character section)

Show what the AI has learned (transparency builds trust):
```
[What I've Learned About You]
  Response style: Brief & casual (learned from 247 messages)
  Favorite topics: Anime, Philosophy, Game Design
  Active hours: 8pm-1am (night owl detected)
  Humor: Playful (you laugh at puns 73% of the time)
  Last reflection: 2 days ago
  [Reset Preferences]  [View Reflection Memo]
```

## Step 7: Tests

**NEW FILE:** `backend/tests/test_adaptive.py`

- `test_engagement_score_calculation`
- `test_reflection_prompt_assembly`
- `test_profile_to_prompt_injection`
- `test_topic_affinity_extraction`
- `test_trust_increase_on_long_conversation`
- `test_trust_decrease_on_gap`
- `test_reflection_threshold_50_messages`
- `test_auto_tune_response_length`

## Files

| File | Action | Effort |
|------|--------|--------|
| `backend/preflight.py` | v55 migration | S |
| `backend/adaptive/__init__.py` | NEW module | S |
| `backend/adaptive/reflector.py` | NEW — reflection engine | L |
| `backend/adaptive/tuner.py` | NEW — auto-tuning | M |
| `backend/adaptive/relationship.py` | NEW — trust/mood updates | M |
| `backend/server.py` | Wire into chat pipeline | M |
| `backend/llm/context_assembler.py` | Topic affinity boost | S |
| `backend/tests/test_adaptive.py` | NEW tests | M |
| `frontends/sakura/src/views/SettingsView.tsx` | Insights UI | M |

**Total effort: XXL (~4-5 days)** — but each step is independently shippable.

## Phased Rollout

| Phase | What Ships | Effort | User Sees |
|-------|-----------|--------|-----------|
| **9A** | Engagement signals + basic preference heuristics | M (1d) | Nothing visible yet (data collection) |
| **9B** | Reflection engine + profile storage | L (1.5d) | "What I've Learned" in settings |
| **9C** | Auto-tuning pipeline (prompt injection) | M (1d) | Character subtly adapts over time |
| **9D** | Trust/mood relationship updates | S (0.5d) | Deeper character progression |
| **9E** | Topic affinity steering + greeting adaptation | S (0.5d) | Conversations feel more personal |

---
---

# Phase 10: Model Asset Specification Document

## Context
Chris creates models in VRoid Studio and buys from Booth.pm. Has Blender but hasn't used it for character creation. Needs a spec document defining what waifu-rt3d expects from model files, plus a Blender tutorial for custom characters.

## Deliverable: `docs/design/model-asset-spec.md`

**NEW FILE** — Technical spec + tutorial. Sections:

### 1. VRM Model Requirements
- **Bones:** Full VRM humanoid mapping (head, spine, chest, shoulders, arms, legs, feet)
- **Blend shapes (minimum 10):** Neutral, Happy, Angry, Sad, Surprised, Blink, LookLeft, LookRight, A, O
- **Polygon count:** 30K-70K triangles (sweet spot for web)
- **Textures:** Max 2048×2048 per material, ≤2 materials total, PNG or KTX2
- **File size:** <20MB uncompressed (target <5MB with Draco compression)
- **T-Pose:** Required for skeleton mapping

### 2. Outfit Variant Spec (for GLB)
- **Mesh toggle method:** Each outfit = separate mesh object named `outfit_<name>`
- **All outfits share same armature** (parent to same skeleton)
- **Weight painting:** Each outfit mesh must be weight-painted to skeleton
- **Default outfit:** Always visible, others start hidden
- **Naming convention:** `outfit_casual`, `outfit_formal`, `outfit_athletic`, etc.

### 3. Booth.pm Buying Checklist
- ✅ VRM format (not just FBX)
- ✅ Humanoid bones mapped
- ✅ ≥6 standard blend shapes
- ✅ <100K triangles
- ✅ Commercial license
- ✅ T-pose included
- ❌ Red flags: no blend shapes, game-specific rigging, realistic (not anime) style

### 4. Blender Tutorial: Creating an Anime Character for waifu-rt3d

**Prerequisites:** Blender 4.x, VRM Add-on for Blender, CATS Plugin

**Step-by-step (Quick Start — VRoid → Blender → VRM):**
1. Create base character in VRoid Studio (body, face, hair) — 1-2h
2. Export as .vrm
3. Import into Blender via VRM Add-on
4. Add custom clothing as separate mesh objects
5. Parent clothing to existing armature (Ctrl+P → Armature Deform With Automatic Weights)
6. Name outfit meshes with `outfit_` prefix
7. Test blend shapes still work (Shape Key panel)
8. Export as VRM (File → Export → VRM)
9. Test in waifu-rt3d viewer

**Step-by-step (Advanced — Full Blender Character):**
1. Model head/body (box modeling or sculpt → retopology) — 8-12h
2. UV unwrap + anime cel-shade materials (Shader to RGB + ColorRamp) — 4h
3. Rig with Rigify (or vrm-rigify plugin for VRM bone mapping) — 2h
4. Weight paint — 2-4h
5. Add blend shapes for expressions (10 minimum) — 3-4h
6. Create outfit variants as separate meshes — 4-8h per outfit
7. Export as VRM — 30min
8. Optimize: Draco compression via gltf-transform — 15min

### 5. Web Performance Optimization Guide
- Use `gltf-transform` CLI to apply Draco compression (90-95% size reduction)
- KTX2 + Basis Universal textures for GPU-compressed storage (~10x VRAM savings)
- Lazy-load outfit variants (only load when user opens wardrobe)
- Manually dispose Three.js GPU resources on outfit swap (`geometry.dispose()`, `material.dispose()`, `texture.dispose()`)
- Keep <50 active blend shapes per mesh for smooth real-time control

## Effort: M (half day to write the doc)

---
---

# Execution Priority (Revised — Intelligence > Cosmetics)

**Core thesis:** Retention comes from depth of personalization, not cosmetic features. The character learning about you over time, adapting its behavior, and running it all locally (privacy moat) is the killer feature.

| Order | Phase | What | Effort | Why This Order |
|-------|-------|------|--------|---------------|
| 1 | Phase 1 | Proactive AI Messages | XL (2.5d) | **Already running in executor window** |
| 2 | Phase 3 | Advisor agent + AGENTS.md | S (1h) | Quick win, improves all future planning |
| 3 | Phase 6 | Edge case fixes (5 bugs) | M (2h) | **User's #1 pick.** Rewards wiring critical — enables engagement tracking |
| 4 | **Phase 9A** | Engagement signals + preference heuristics | M (1d) | **Start collecting data immediately** — every conversation trains the system |
| 5 | **Phase 9B** | Reflection engine + user profiles | L (1.5d) | The brain — LLM analyzes conversations, learns what works |
| 6 | **Phase 9C** | Auto-tuning pipeline (prompt injection) | M (1d) | Characters start adapting — user feels "this AI knows me" |
| 7 | **Phase 9D-E** | Trust/mood updates + topic steering | M (1d) | Deep character progression, personalized conversations |
| 8 | Phase 7 | Immersion P1: blinking, breathing, emotion map | M (1w) | Visual quality of reality — characters feel alive |
| 9 | Phase 4 | /plan skill + workflow polish | M (2h) | QoL for future planning |
| 10 | Phase 7 | Immersion P2: hair physics, lip-sync | L (2w) | Characters feel physically real |
| 11 | Phase 10 | Model Asset Spec document | M (half day) | When user is ready to create custom models |

**Deprioritized (do if user asks):**
- Phase 5: Outfit picker UI (users upload their own models — keep schema but drop UI priority)
- Phase 8: Memory Book UI
- T1-5 Groq ASR, T1-10 Local STT, T2-13 TTS expansion
- VTuber mode, Super Off-Road Racing

**The Retention Loop (revised):**
```
User chats → engagement signals recorded
    → every 50 msgs: local LLM reflects on what worked
    → user profile updated (preferred style, topics, humor level)
    → next conversation: character speaks differently
    → user notices "this AI gets me" → chats more → loop accelerates
    → trust deepens → user shares more → AI learns more → unbreakable bond
```

---
---

# Phase 11: Environment Interaction + Unity WebGL Premium Renderer

## Context

Full environment interaction (character sitting, picking up objects, walking to spots) is important for immersion. Research found: **zero shipped web apps** do this end-to-end. Every shipped solution (VRChat, Koikatsu, gacha games) uses pre-baked animations, not runtime IK. Unity WebGL is 1.5-2.5x faster to build these features than Three.js due to built-in NavMesh, Animator, PhysX.

**Architecture decision:** Keep Three.js as the fast/lightweight default. Add Unity WebGL as an optional "Premium" renderer for users who want physics, environment interaction, and higher fidelity. Lazy-loaded — only downloads when user switches modes.

## Two-Track Approach

### Track A: Three.js MVP Environment (ships first, 3 weeks)

Pre-baked room poses + time-of-day lighting — no Unity needed.

**What ships:**
- 4 room poses: standing, sitting on couch, sitting at desk, lying on bed
- Smooth animation blending between poses (0.3-0.5s crossfade)
- Pose-specific idle fidgets (different hand gestures per pose)
- Time-of-day lighting (directional light color/intensity shifts)
- Camera angle shifts per pose (sitting = lower angle, closer)
- Background parallax (subtle depth effect)
- Click-to-pose button system (no pathfinding needed)

**Implementation:**

1. **Bake 4 pose animations in Blender** (2d artist work + 1d import/test)
   - Each pose: 2-second settle animation + looping idle
   - Export as GLB animation clips

2. **Add pose system to viewer.html** (3d)
   - New animation layer: `PoseLayer` in AnimationDirector
   - `setPose(poseName)` postMessage command
   - Crossfade between current idle and target pose
   - Camera position/rotation per pose (stored in pose config)

3. **Add lighting system to viewer.html** (2d)
   - `setTimeOfDay(hour)` postMessage command
   - Directional light: warm at morning/evening, cool at night, bright at noon
   - Ambient intensity shifts
   - Optional: bloom intensity tied to time (soft at night, sharp at day)

4. **Frontend: Pose selector** (2d)
   - Small button group or radial menu near character
   - Icons: chair, couch, bed, standing
   - Triggers `viewerStore.dispatchSetPose()`

5. **Backend: Scene context injection** (1d)
   - When character is in "sitting on couch" pose, inject into system prompt:
     `[Scene: You're sitting on the couch together, relaxing]`
   - Character's dialogue adapts to physical context

**Files:**

| File | Action | Effort |
|------|--------|--------|
| `frontends/shared/viewer/viewer.html` | PoseLayer + lighting system | L |
| `frontends/sakura/src/stores/viewerStore.ts` | dispatchSetPose + dispatchSetTimeOfDay | S |
| `frontends/sakura/src/components/PoseSelector.tsx` | NEW — pose picker UI | M |
| `backend/llm/context_assembler.py` | Scene context injection | S |
| Animation assets (Blender) | 4 pose clips + lighting config | M (artist work) |

**Total: L (~3 weeks including animation creation)**

---

### Track B: Unity WebGL Premium Renderer (ships later, 5-6 weeks)

Full physics, environment interaction, cloth simulation. Optional upgrade.

**Architecture:**

```
┌─────────────────────────────────────────┐
│  Sakura React App                       │
│                                         │
│  renderModeStore: "lite" | "premium"    │
│                                         │
│  ┌──────────────┐  ┌────────────────┐  │
│  │ Three.js     │  │ Unity WebGL    │  │
│  │ (Lite Mode)  │  │ (Premium Mode) │  │
│  │ Always loaded │  │ Lazy-loaded    │  │
│  │ ~1-3MB       │  │ ~3.5MB Brotli  │  │
│  │              │  │                │  │
│  │ VRM viewer   │  │ UniVRM viewer  │  │
│  │ + PoseLayer  │  │ + PhysX        │  │
│  │ + particles  │  │ + Cloth sim    │  │
│  │              │  │ + NavMesh      │  │
│  │              │  │ + Room scene   │  │
│  └──────────────┘  └────────────────┘  │
│         ▲                    ▲          │
│         └────── viewerStore ─┘          │
│         (shared state, dispatches       │
│          to whichever renderer          │
│          is active)                     │
└─────────────────────────────────────────┘
```

**Key: `viewerStore.ts` becomes a renderer-agnostic mediator.** It already dispatches to VRM (iframe) or Live2D (PIXI). Adding Unity is a third dispatch target.

**Phase B1: Foundation (2 weeks)**
1. Set up Unity project with UniVRM + one test character
2. Build WaifuBridge.cs: `SetExpression()`, `PlayAnimation()`, `SetPose()`, `SetTimeOfDay()`
3. Export WebGL build (Brotli compression)
4. Create `UnityViewer.tsx` using react-unity-webgl
5. Add `renderMode: "lite" | "premium"` to viewerStore
6. UI toggle in Settings: "Renderer: Lite (fast) | Premium (physics)"
7. Lazy-load Unity build only on first switch to Premium

**Phase B2: Character Parity (1.5 weeks)**
1. Import actual VRM character via UniVRM
2. Wire expression blendshapes (same API as Three.js path)
3. Wire animation state machine (Animator controller)
4. Sync character state on mode switch (expression + pose + animation)
5. Test: switch between Lite and Premium mid-conversation

**Phase B3: Environment Scene (1.5 weeks)**
1. Create room environment in Unity (couch, desk, bed, window)
2. Add colliders to furniture
3. Implement click-to-sit: raycast furniture → blend to sitting animation
4. Add cloth simulation to character hair/outfit
5. Day/night cycle with dynamic lighting + window color
6. Character walks to furniture (NavMesh — Unity makes this easy)

**Phase B4: Polish (1 week)**
1. Loading screen during Unity startup
2. Auto-detect: disable Premium on mobile/low-RAM
3. Error fallback: if Unity fails, auto-revert to Lite
4. Camera system: different angles per pose, smooth transitions
5. Performance metrics display (FPS counter option)

**Files:**

| File | Action | Effort |
|------|--------|--------|
| `unity/waifurt3d-avatar/` | Full Unity project build | XL |
| `unity/.../WaifuBridge.cs` | REWRITE — full postMessage API | L |
| `unity/.../AvatarController.cs` | REWRITE — UniVRM + Animator | L |
| `frontends/sakura/src/components/UnityViewer.tsx` | NEW — react-unity-webgl wrapper | M |
| `frontends/sakura/src/stores/viewerStore.ts` | Add Unity dispatch path + renderMode | M |
| `frontends/sakura/src/views/SettingsView.tsx` | Renderer toggle UI | S |
| `frontends/sakura/public/unity-builds/` | Unity WebGL output directory | — |

**Total: XL-XXL (~5-6 weeks)**

---

## Effort Comparison: Environment Features

| Feature | Three.js (Track A) | Unity (Track B) | Quality Difference |
|---------|-------------------|-----------------|-------------------|
| 4 room poses + blending | 1 week | 4 days | Same (pre-baked) |
| Click-to-walk | 2-3 weeks | 1 week | Unity slightly smoother |
| Cloth/hair physics | 2 weeks (Rapier) | 3 days (built-in) | Unity much better |
| Object pickup | 3+ weeks | 1-2 weeks | Unity much easier |
| Day/night lighting | 2-3 days | 1-2 days | Same |
| Sitting IK corrections | 1-2 weeks | 3-5 days | Unity easier |
| NavMesh pathfinding | 2-3 weeks | 1 week | Unity automatic |

**Summary:** Three.js is ~1.5-2.5x slower for environment features. But Track A (pre-baked poses) ships in 3 weeks without Unity. Track B adds the "wow factor" later.

## Recommended Sequence

1. **Ship Track A first** — pre-baked poses in Three.js (3 weeks). Immediate visual impact, no new technology.
2. **Then build Track B** — Unity Premium renderer (5-6 weeks). Higher fidelity for users who want it.
3. Track A stays as "Lite mode" — fast loading, mobile-friendly, always available.
4. Track B is "Premium mode" — opt-in, lazy-loaded, desktop-only.

---
---

# Execution Priority (Final — All Phases)

**Core thesis:** Intelligence + reality quality + environment interaction. All running locally.

| Order | Phase | What | Effort | Timeline |
|-------|-------|------|--------|----------|
| 1 | Phase 1 | Proactive AI Messages | XL (2.5d) | **Running now** |
| 2 | Phase 3 | Advisor agent + AGENTS.md | S (1h) | Day 1 |
| 3 | Phase 6 | Edge case fixes (5 bugs) | M (2h) | Day 1 |
| 4 | **Phase 9A-C** | Adaptive Intelligence (engagement + reflection + tuning) | L (3.5d) | Week 1-2 |
| 5 | **Phase 9D-E** | Trust/mood + topic steering | M (1d) | Week 2 |
| 6 | Phase 7 P1 | Immersion: blinking, breathing, emotion mapping | M (1w) | Week 2-3 |
| 7 | **Phase 11A** | Environment: pre-baked poses + lighting (Three.js) | L (3w) | Week 3-6 |
| 8 | Phase 7 P2 | Immersion: hair physics, lip-sync, fidgeting | L (2w) | Week 6-8 |
| 9 | **Phase 11B** | Unity Premium renderer (optional, lazy-loaded) | XL (5-6w) | Week 8-14 |
| 10 | Phase 4 | /plan skill + workflow polish | M (2h) | Anytime |
| 11 | Phase 10 | Model Asset Spec document | M (half day) | When ready |

**~16 weeks total for the full vision.** But each phase ships independently — value delivered at every step.

---
---

# Phase 12: Character-Only Mode — Maximum Animation Quality & Physics

## Context

A rendering mode where **no environment exists** — ALL GPU/CPU budget goes to making the character as lifelike as possible. This is the opposite of Phase 11 (environment interaction). Here we maximize: procedural animation, secondary physics (hair/clothing), facial depth, touch interaction, camera cinematics, shaders, and sound design. The character stands alone on screen and feels like it has a soul.

**Key insight from research:** Perceived aliveness comes from **1000 small details** (breathing, eye saccades, weight shifts, micro-expressions, hair physics, asymmetric timing) rather than any single grand feature. Each detail is cheap (0.1-2ms), and without an environment the performance budget is enormous.

**Performance budget (character-only, no environment):**
- Character mesh + shaders: 5-8ms
- Post-processing (bloom, color grading): 2-3ms
- Particles (sparkles, petals): 1-2ms
- Physics (spring bones, soft body): 2-3ms
- Procedural animation: <1ms
- **Total: ~12-16ms of 16.67ms budget (60 FPS)** — plenty of headroom

---

## 12A: Procedural Body Animation System

### The Foundation: Characters That Breathe

Every living thing moves, even when "still." Without continuous micro-movement, 3D characters look like statues. This system adds 6 layers of procedural animation that run constantly.

### Implementation: `ProceduralAnimationLayer` in viewer.html

Add a new animation layer to AnimationDirector (alongside existing IdleBehaviorLayer, EmotionLayer, etc.):

```javascript
class ProceduralAnimationLayer {
  // Layer 1: Breathing (sinusoidal chest/shoulder)
  // Layer 2: Weight shifting (pelvis sway, 3-5 sec cycle)
  // Layer 3: Eye saccades (random fixation shifts every 2-5 sec)
  // Layer 4: Natural blinking (Poisson process, ~4.5 blinks/min)
  // Layer 5: Head idle movement (Perlin noise gentle oscillation)
  // Layer 6: Micro-tremor (2-5 pixel high-frequency jitter)
}
```

### Layer Details

**Layer 1: Breathing**
```
Bone targets: chest, upperSpine
Motion: sinusoidal scale on Z axis (depth)
Amplitude: ±2% scale (0.98-1.02)
Frequency: 0.25 Hz (one breath every 4 seconds at rest)
Emotional modulation:
  - Excited: 0.4 Hz, ±3%
  - Calm: 0.2 Hz, ±1.5%
  - Tired: 0.15 Hz, ±2.5% (deeper, slower)
  - Scared: 0.5 Hz, ±4% (rapid shallow)
Shoulder slight rise on inhale: ±0.5cm Y offset
```

**Layer 2: Weight Shifting**
```
Bone targets: pelvis, spine
Motion: sine wave on pelvis X position
Amplitude: ±1.5cm
Cycle: 3-5 seconds (random per cycle)
Upper spine counter-lean: opposite direction, 50% amplitude
Hip slight rotation: ±2° on Y axis
Emotional modulation:
  - Nervous: faster (2 sec), larger amplitude (±3cm)
  - Confident: slower (5 sec), smaller, more deliberate
  - Sad: barely perceptible (±0.5cm), very slow (8 sec)
```

**Layer 3: Eye Saccades**
```
Bone targets: leftEye, rightEye (rotation)
Behavior: Poisson-distributed fixation shifts
Mean interval: 3 seconds (range 1.5-5)
Saccade speed: 300°/sec (complete in ~50ms)
Range: ±15° yaw, ±8° pitch (constrained to natural range)
Special behaviors:
  - During speech: eyes stay more fixed on "camera" (user)
  - During thinking: eyes drift upward-left
  - During embarrassment: eyes drift downward-right
  - Micro-saccades: 0.5° jitter between major fixations
```

**Layer 4: Natural Blinking**
```
Morph target: Blink (0→1→0 over 150ms)
Distribution: Poisson process
Mean interval: 13 seconds (~4.5 blinks/min)
Emotional modulation:
  - Nervous: 7 sec mean (more blinking)
  - Calm: 15 sec mean
  - Excited: 5 sec mean + occasional double-blink
  - Sad: 20 sec mean + slower close (200ms)
Asymmetry: right eye leads by 10-20ms (deliberate imperfection)
Double-blink: 15% chance of immediate second blink
```

**Layer 5: Head Idle Movement**
```
Bone target: head, neck
Motion: Perlin noise on X/Y rotation
Amplitude: ±3° yaw, ±2° pitch
Noise frequency: 0.2 Hz (slow, gentle drift)
Emotional modulation:
  - Curious: more pitch variation, head tilts
  - Tired: slower, head droops (negative pitch bias)
  - Alert: minimal movement, fixed forward
Special: Nod on keywords ("yes", "mmhm") — 15° pitch × 2 cycles
```

**Layer 6: Micro-Tremor**
```
Bone target: all bones (global)
Motion: high-frequency noise (8-12 Hz)
Amplitude: 0.1-0.3° rotation per bone
Purpose: prevents the "perfectly still = dead" effect
Invisible consciously, but absence is noticed subconsciously
Disable during strong animations (gesture, reaction) — only active in idle
```

### Files to Modify

| File | Change | Effort |
|------|--------|--------|
| `frontends/shared/viewer/viewer.html` | Add ProceduralAnimationLayer to AnimationDirector | L |
| `frontends/sakura/src/stores/viewerStore.ts` | dispatchSetProceduralParams (emotion → layer modulation) | S |

**Effort: L (~1 week)**

---

## 12B: Secondary Motion Physics (Hair, Clothing, Accessories)

### Spring Bone Enhancement

The VRM spec includes spring bones, but they need tuning. Most marketplace models have default (boring) spring bone settings.

### Spring Bone Parameter Profiles

Create per-emotion spring bone profiles that change dynamically:

**Calm Profile:**
```
Hair: Pull=0.4, Spring=1.2, Stiffness=0.3, Gravity=0.3, Damping=0.7
Earrings: Pull=0.8, Spring=0.5, Stiffness=0.8, Gravity=0.1, Damping=0.5
Clothing: Pull=0.3, Spring=0.8, Stiffness=0.4, Gravity=0.4, Damping=0.6
```

**Excited Profile (more bouncy):**
```
Hair: Pull=0.3, Spring=1.8, Stiffness=0.2, Gravity=0.3, Damping=0.5
Earrings: Pull=0.6, Spring=1.0, Stiffness=0.5, Gravity=0.1, Damping=0.3
Clothing: Pull=0.2, Spring=1.2, Stiffness=0.3, Gravity=0.4, Damping=0.4
```

**Wind Effect:**
- Periodic random gust (every 5-15 seconds)
- Apply force vector to all spring bones for 0.5-1 second
- Direction: slight upward + random horizontal
- Intensity: varies by "location" (outdoor vs indoor mood)

### Soft Body Physics (Jiggle)

For anime character authenticity, add spring-based secondary motion on specific body regions:

```
Implementation: Spring chain physics on secondary bones
Bones: breast bones, belly bone, thigh bones (if present in model)
Spring constant: 80-120 (responsive but not chaotic)
Damping: 0.7-0.9 (settles quickly)
Trigger: Movement of parent bone (chest movement → breast follow-through)
```

**Performance:** Spring bone simulation for 20-30 chains = ~1-2ms CPU. Negligible.

### Accessory Physics

- Earrings: short spring chains (2-3 bones), high stiffness
- Necklaces/pendants: longer chains (4-6 bones), medium stiffness
- Ribbons/bows: medium chains with cloth-like low stiffness
- Hair ornaments: tied to nearest hair chain + independent spring

### Files

| File | Change | Effort |
|------|--------|--------|
| `frontends/shared/viewer/viewer.html` | Spring bone profile system + wind effect | M |
| `frontends/sakura/src/stores/viewerStore.ts` | dispatchSetSpringBoneProfile(emotion) | S |

**Effort: M (~3-5 days)**

---

## 12C: Facial Animation Depth

### Beyond Basic Blend Shapes

Standard VRM has ~10 blend shapes. Professional VTuber rigs have 50+. This system adds procedural facial animation layers that run on TOP of the existing expression system.

### Micro-Expression System

```javascript
class MicroExpressionController {
  // Scheduled micro-expressions that fire randomly
  expressions = [
    { name: 'eyebrow_twitch', target: 'browInnerUp', amplitude: 0.3, duration: 200, probability: 0.02 },
    { name: 'lip_quiver', target: 'mouthFrown', amplitude: 0.15, duration: 300, probability: 0.01 },
    { name: 'nose_scrunch', target: 'noseSneer', amplitude: 0.2, duration: 250, probability: 0.005 },
    { name: 'cheek_puff', target: 'cheekPuff', amplitude: 0.4, duration: 400, probability: 0.008 },
  ];

  // Per frame: roll dice for each, trigger if probability hits
  // Emotional modulation: nervous = 3× probability, calm = 0.5×
}
```

### Pupil Dilation Shader

```glsl
// Driven by emotion state
// Pupil radius modulated:
//   Normal: 1.0
//   Excited/attracted: 1.3 (dilated)
//   Scared: 1.4 (very dilated)
//   Angry: 0.8 (constricted)
//   Bright light: 0.7
// Transition: 0.5 second ease
```

### Blushing System

```
Implementation: Vertex color overlay on face mesh
Trigger: Compliment detection in LLM response / high affinity moment / embarrassment
Appearance: Gradual pink/red tint on cheeks, nose bridge, ears
Ramp: 0→full over 2 seconds (not instant — that looks unnatural)
Fade: 5-10 seconds to fade back
Intensity: Scales with affinity level (strangers barely blush, soulmates blush easily)
```

### Tearing / Emotional Wetness

```
Trigger: Sad emotion above threshold (intensity > 0.7)
Implementation:
  - Specular intensity increase on eye mesh (makes eyes look "wet")
  - Small particle emitter near eye corner (tear drops)
  - Tear drop: 2-3 particles, gravity-driven path down cheek
  - Sniffling sound effect triggered
Duration: Persists while emotion active, fades 3 seconds after
```

### Files

| File | Change | Effort |
|------|--------|--------|
| `frontends/shared/viewer/viewer.html` | MicroExpressionController + pupil/blush shaders | L |
| `frontends/sakura/src/stores/viewerStore.ts` | dispatchSetFacialDetail(params) | S |

**Effort: L (~1 week)**

---

## 12D: Touch & Poke Interaction System

### Touch Zone Detection

Raycast from camera through mouse/touch position → character mesh. Map hit position to body zone using Y-coordinate thresholds on the model's bounding box:

```
Zone mapping (normalized Y, 0=feet, 1=head):
  Head (0.85-1.0):  Headpat → happy reaction
  Cheeks (0.75-0.85, X extremes): Poke → blush/flinch
  Shoulders (0.65-0.75): Tap → wave/nod
  Arms (0.45-0.65): Grab → pull-back reaction
  Torso (0.3-0.45): Push → stumble/balance
  Hair (raycast specific mesh): Drag → physics response
```

### Reaction Response Table

| Zone | Touch 1 | Touch 2-3 | Touch 4+ | Cooldown |
|------|---------|-----------|----------|----------|
| **Head** | Smile, "hmm" sound | Eyes close, purr | Love hearts, affinity++ | 30s |
| **Cheeks** | Flinch, blush shader | "Hey!" vocalization | Annoyed face, pull away | 20s |
| **Shoulders** | Nod, acknowledge | Wave back | Shrug, neutral | 15s |
| **Torso** | Push-back animation | "What are you doing?" | Angry cross arms | 45s |
| **Hair** | Physics response only | Hair adjust animation | "Stop messing with my hair!" | 10s |

### Touch → Physics Response

When touching hair or clothing, apply force at touch point:
```
Force = touchDirection × 0.5 (normalized)
Apply to nearest spring bone chain
Duration: while touch is held + 1 second settle
```

### Drag-to-Rotate (Turntable)

- Drag on empty space (not on character) → rotate character Y-axis
- Sensitivity: 0.01 rad/pixel
- Momentum: continue rotation on release, decelerate 0.95×/frame
- Pinch-to-zoom on mobile

### Files

| File | Change | Effort |
|------|--------|--------|
| `frontends/shared/viewer/viewer.html` | Raycaster + touch zones + force application | L |
| `frontends/sakura/src/stores/viewerStore.ts` | touch event dispatch | S |
| `frontends/sakura/src/components/CharacterInteraction.tsx` | NEW — touch UI + gesture detection | M |
| `backend/server.py` | POST /api/characters/{id}/touch — record interaction for affinity | S |

**Effort: L (~1 week)**

---

## 12E: Cinematic Camera System

### Camera Modes

**Mode 1: Auto-Orbit (Idle Spectator)**
- Slow rotation: 360° per 20 seconds
- Elevation: 15° above horizon
- Triggers after 5 seconds of no input
- Feels like a "living portrait"

**Mode 2: Conversation Camera**
- Default during chat
- Slight push-in (0.85× distance) when character speaks
- Pull-out (1.15×) during pauses
- Subtle elevation increase when character makes eye contact
- Transition: 300-500ms cubic ease

**Mode 3: Emotion-Driven Dynamic**

| Emotion | Camera Action |
|---------|--------------|
| Happy | Zoom in 10%, raise elevation +5° |
| Sad | Zoom out 15%, lower elevation -10° |
| Angry | Slight shake (2px, 200ms), tighten framing |
| Shy | Tilt slightly off-center |
| Romantic | Soft push-in, warm color grade |
| Thinking | Face closeup, static |

**Mode 4: Photo Mode**
- Full 360° orbit with drag
- FOV adjustment: 35°-90° (telephoto → wide angle)
- Depth of field preview
- 4K screenshot export (canvas.toDataURL at 4× resolution)
- Ken Burns effect: slow zoom + pan for cinematic captures

**Mode 5: Focus Presets**
- Face closeup (0.3× distance)
- Upper body (0.7× distance)
- Full body (1.0× default)
- 3/4 angle (45° rotation)
- Low angle (dramatic, looking up)

### Camera Shake

```
Triggers: surprise reaction, impact, loud exclamation
Implementation: Perlin noise offset on camera position
Intensity levels:
  Subtle: 1-2px, 10-15 Hz, 100ms
  Impact: 3-5px, 8 Hz, 200ms
  Intense: 5-10px, 6 Hz, 400ms
Decay: exponential falloff
```

### Files

| File | Change | Effort |
|------|--------|--------|
| `frontends/shared/viewer/viewer.html` | CameraDirector class (5 modes + shake) | L |
| `frontends/sakura/src/stores/viewerStore.ts` | dispatchSetCameraMode + emotion-driven auto | S |
| `frontends/sakura/src/components/CameraControls.tsx` | NEW — camera UI (mode selector, photo mode) | M |

**Effort: L (~1 week)**

---

## 12F: Background & Stage Effects (No Environment)

### Emotion-Driven Gradient Backgrounds

Instead of static color or image, animated gradients that respond to character emotion:

| Emotion | Top Color | Bottom Color | Speed |
|---------|-----------|--------------|-------|
| Happy | #FFE4B5 (warm peach) | #FFB6D9 (pink) | 2s transition |
| Sad | #4A7BA7 (steel blue) | #7D8B9E (grey) | 4s transition |
| Angry | #FF6347 (tomato) | #8B0000 (dark red) | 1s transition |
| Calm | #87CEEB (sky) | #E0F6FF (ice blue) | 3s transition |
| Romantic | #FFB6D9 (pink) | #FFC0CB (blush) | 3s transition |
| Night | #1C1C3C (midnight) | #2F4F4F (dark slate) | 5s transition |

Subtle animated wave pattern overlaid (fragment shader, <0.1ms cost).

### Particle Layers (Behind Character)

Emotion-specific particles rendered behind the character mesh:

| Emotion | Particles | Spawn Rate | Behavior |
|---------|-----------|-----------|----------|
| Happy | Sparkles, stars | 20-30/sec | Float upward, fade |
| Romantic | Heart particles, petals | 10-15/sec | Drift gently |
| Sad | Rain drops | 30-40/sec | Fall straight down |
| Calm | Sakura petals | 5-8/sec | Drift with wind |
| Angry | Red sparks, embers | 15-20/sec | Rise aggressively |
| Night | Fireflies | 3-5/sec | Random float, glow |

All particles GPU-instanced — single draw call for thousands of particles.

### Volumetric Lighting (God Rays)

- Screen-space radial blur from behind character's head
- Creates "angelic" backlight effect
- Intensity: 0.3-0.6, modulated by emotion
- Color tint matches emotion gradient
- Performance: 32 ray samples, ~1-2ms at half resolution

### Post-Processing Stack

All applied simultaneously (character-only mode has the budget):
1. **Bloom** — soft glow on bright areas (skin highlights, eye sparkle, particles)
2. **Color grading** — LUT-based, switches per emotion (0.5-2s transition)
3. **Depth of field** — background blur, character sharp (adjustable in photo mode)
4. **Vignette** — subtle darkening at edges (draws focus to center)

### Files

| File | Change | Effort |
|------|--------|--------|
| `frontends/shared/viewer/viewer.html` | GradientBackground + particle layers + god rays | L |
| `frontends/sakura/src/stores/viewerStore.ts` | background + particle dispatch tied to emotion | S |

**Effort: M (~3-5 days)** — most effects already have infrastructure in EffectComposer

---

## 12G: Anime Shader System

### Toon/Cel-Shading

Replace default VRM materials with custom anime-style shaders:

```
Components:
1. Posterized diffuse (2-3 discrete light levels, not smooth gradient)
2. Hard shadow edge (not soft shadow — anime-style sharp cutoff)
3. Rim light (Fresnel) — emotion-colored edge glow
4. Outline rendering (backface method: scale mesh 102%, render black)
```

### Hair Anisotropic Specular

Anime hair has distinctive specular bands that shift with viewing angle:

```
Implementation: Kajiya-Kay hair lighting model
- Primary highlight: tight, bright band across hair
- Secondary highlight: wider, softer, shifted 0.1 radians
- Anisotropy direction: along hair strand axis (tangent)
- Cost: ~0.5ms (fragment shader, hair mesh only)
```

### Eye Sparkle Shader

Those distinctive anime eye highlights:

```
Implementation:
- Multiple specular lobes on eye mesh (2-3 distinct highlights)
- "Star" sparkle geometry rendered in front of eyes
- Sparkle rotates slowly (360° per 6 seconds)
- Scales with affinity (bigger sparkles at high affinity = "star eyes")
- Emissive component for glow effect
```

### Skin Subsurface Scattering (Simplified)

```
Implementation: Screen-space SSS approximation
- Back-lighting transmission: light passes through thin areas (ears, cheeks)
- Warm red tint on translucent edges
- Intensity: 0.3-0.5 (subtle, not uncanny)
- Only on face and hands (performance optimization)
- Cost: ~0.3ms
```

### Emotion-Responsive Rim Lighting

| Emotion | Rim Color | Intensity | Falloff |
|---------|-----------|-----------|---------|
| Happy | Gold (#FFD700) | 0.8 | 3.0 |
| Sad | Blue (#4169E1) | 0.5 | 4.0 |
| Angry | Red-orange (#FF4500) | 1.0 | 2.5 |
| Romantic | Pink (#FFB6C1) | 0.7 | 3.5 |
| Calm | Sky (#87CEEB) | 0.6 | 3.5 |

Transitions: 1-2 second ease between emotion states.

### Files

| File | Change | Effort |
|------|--------|--------|
| `frontends/shared/viewer/viewer.html` | Custom shader library (toon, hair, eye, SSS) | XL |
| `frontends/shared/lib/shaders/` | NEW shader files (anime_toon.glsl, hair_aniso.glsl, etc.) | L |

**Effort: XL (~2 weeks)** — shader development requires iteration and visual tuning

---

## 12H: Character Sound Design

### Ambient Character Audio

Even in silence, the character produces subtle sounds:

```
Continuous layers:
1. Breathing: soft inhale/exhale, 2.3s cycle, -25dB
   - Modulated by emotion (faster when excited, deeper when tired)
2. Clothing rustle: triggered by animation events (movement), -20dB
   - Different textures: fabric swish, leather creak, chain jingle
3. Room tone: ultra-subtle ambient hum, -30dB
   - Changes with "implied location" from chat context
```

### Interaction Sound Effects

| Event | Sound | Volume |
|-------|-------|--------|
| Headpat | Soft "hmm", content sigh | -8dB |
| Poke | Surprised "ah!", fabric tap | -5dB |
| Blushing trigger | Shy "ehe" giggle | -10dB |
| Tear/crying | Sniffle, wet breath | -8dB |
| Surprise | Gasp, sharp inhale | -3dB |
| Laugh | Multi-stage laugh with breathing | -5dB |
| Yawn | Stretched yawn + exhale | -8dB |
| Stretch | Joint pop + fabric stretch | -15dB |

### Vocalization System

Small non-speech vocalizations that play during conversation pauses:

```
Types:
- Thinking: "hmm..." (0.5s, neutral pitch)
- Agreement: "mm-hmm" (0.3s, rising pitch)
- Confusion: "huh?" (0.3s, rising pitch)
- Realization: "oh!" (0.2s, surprised)
- Contentment: soft sigh (0.8s)
- Effort (during gesture): small grunt (0.1s)

Trigger:
- Randomly during idle (every 15-30 seconds)
- Emotion-matched (content sighs when happy, "hmm" when thinking)
- Keyword-driven from LLM output metadata
```

### Audio Implementation

Use Web Audio API with spatial panning:
- Character position → stereo pan (subtle: ±10% if character turns)
- Distance attenuation based on camera zoom
- Reverb: slight room reverb (convolver node, short impulse response)

### Files

| File | Change | Effort |
|------|--------|--------|
| `frontends/sakura/src/hooks/useCharacterAudio.ts` | NEW — audio layer manager | M |
| `frontends/shared/viewer/viewer.html` | Animation event → audio trigger bridge | S |
| Audio assets | Breathing, foley, vocalization samples | M (can generate procedurally) |

**Effort: M (~3-5 days)**

---

## 12I: Webcam Face Tracking Integration (Optional VTuber Mode)

### MediaPipe → VRM Pipeline

```
Webcam → MediaPipe Face Landmarker (browser, WASM)
    → 52 ARKit blend shapes + head pose (6DOF)
    → Kalidokit solver → VRM bone rotations + blend shape values
    → Apply to character in real-time
    → ~100ms latency, 30+ FPS on commodity hardware
```

### What Gets Tracked

| Feature | MediaPipe Output | VRM Target |
|---------|-----------------|-----------|
| Eyes (blink, wide, squint) | Blend shapes | VRM eye morph targets |
| Eyebrows (raise, furrow) | Blend shapes | VRM brow morph targets |
| Mouth (all vowels, smile, frown) | Blend shapes | VRM mouth morph targets |
| Jaw (open/close) | Blend shape + rotation | VRM jaw bone |
| Head rotation | 6DOF pose | VRM head/neck bones |
| Eye gaze direction | Iris landmarks | VRM eye bone rotation |
| Tongue (8 positions) | Blend shapes | VRM tongue morph target (if model has it) |
| Cheeks (puff, sneer) | Blend shapes | VRM cheek morph targets |

### Hand Tracking Add-on

MediaPipe Hands (21 landmarks per hand) → VRM finger bones:

```
Mapping: 5 fingers × 3 bones = 15 bone rotations per hand
Gestures auto-detected: wave, thumbs up, peace sign, heart, fist
Performance: Face + both hands = ~80ms on RTX 3080, ~120ms on integrated GPU
```

### Toggle UI

Settings → "Mirror Mode" toggle:
- OFF: Character animated by AI (default)
- ON: Character mirrors your face/hands via webcam
- Blend: 50/50 mix of AI animation + webcam tracking

### Files

| File | Change | Effort |
|------|--------|--------|
| `frontends/sakura/src/hooks/useFaceTracking.ts` | NEW — MediaPipe + Kalidokit pipeline | L |
| `frontends/shared/viewer/viewer.html` | Tracking data → VRM bone application | M |
| `frontends/sakura/src/views/SettingsView.tsx` | Mirror Mode toggle | S |
| Package deps: `@mediapipe/tasks-vision`, `kalidokit` | Install | S |

**Effort: L (~1-2 weeks)**

---

## 12J: Audio-Reactive Animation

### Lip Sync from TTS

When TTS audio plays, character's mouth morphs to match:

```
Pipeline:
TTS text → phoneme timeline (from TTS engine metadata)
    → phoneme-to-viseme mapping
    → blend shape animation keyframes
    → apply to VRM mouth morph targets in sync with audio playback

Viseme mapping (standard):
  A (cat) → viseme_aa (jaw drop, open)
  E (met) → viseme_eh (spread, corners back)
  I (bit) → viseme_ih (similar to eh)
  O (go) → viseme_oh (rounded open)
  U (boot) → viseme_uh (narrow round)
  M/P/B → viseme_pp (lips pressed)
  F/V → viseme_ff (lip-teeth)
  S/T/D → viseme_dd (tongue-teeth)
  Silence → viseme_sil (neutral)
```

### Voice-Driven Body Animation

```
Audio analysis:
  Energy (RMS) → breathing intensity + gesture amplitude
  Pitch peaks → hand emphasis gestures
  Speaking rate → head nod frequency

Mapping:
  audioEnergy > 0.7 → more animated gestures, leaning forward
  audioEnergy < 0.3 → still, listening pose
  pitchPeak detected → raise hand slightly, emphasis nod
```

### Files

| File | Change | Effort |
|------|--------|--------|
| `frontends/shared/viewer/viewer.html` | LipSyncController (viseme application) | M |
| `frontends/sakura/src/hooks/useLipSync.ts` | NEW — phoneme detection + timing | M |
| Integration with existing TTS pipeline | Wire audio events | S |

**Effort: M (~3-5 days)**

---

## 12K: Emotion-Driven Full-Body Behavior

### Body Language State Machine

Map LLM emotion output → full-body behavior profile:

| Emotion | Posture | Gesture Rate | Speed | Special Behavior |
|---------|---------|-------------|-------|-----------------|
| **Happy** | Upright, shoulders back | High (every 3-5s) | 1.5× | Occasional bounce, wide arms |
| **Sad** | Slumped, shoulders hunched | Low (every 15-20s) | 0.6× | Arms close, head down, longer blinks |
| **Angry** | Chest puffed, shoulders raised | Medium-High | 1.3× | Sharp gestures, clenched fists, direct stare |
| **Embarrassed** | Slightly hunched, one hand on face | Low | 0.8× | Fidgeting, looking away, touching hair |
| **Tired** | Droopy, head tilts | Very low | 0.5× | Yawning, stretching, slow blinks |
| **Excited** | Leaning forward, bouncy | Very high | 1.8× | Clapping, jumping, wide eyes |
| **Nervous** | Stiff, weight shifting | Medium | 1.0× | Hand wringing, lip biting, rapid blinks |
| **Thinking** | Slight lean, hand to chin | Low | 0.7× | Eyes up-left, finger tapping |
| **Romantic** | Slightly leaned toward camera | Low-medium | 0.9× | Hair playing, shy glances, blushing |

### Transition System

```
Emotions don't snap — they blend:
  Current: Happy (1.0), Sad (0.0)
  Target: Happy (0.0), Sad (1.0)
  Blend rate: 0.05 per frame (20 frames = 0.33 seconds)

  Posture blend: interpolate bone rotations
  Gesture rate blend: weighted random selection
  Speed blend: linear interpolation
  Special behaviors: cross-fade animation clips
```

### Intensity Scaling

Each emotion has intensity 0.0-1.0:
- 0.0-0.3: Subtle (micro-expressions only, barely perceptible posture shift)
- 0.3-0.6: Moderate (clear posture change, occasional gestures)
- 0.6-0.8: Strong (obvious body language, frequent gestures)
- 0.8-1.0: Intense (full expression, special behaviors trigger, particles activate)

### Files

| File | Change | Effort |
|------|--------|--------|
| `frontends/shared/viewer/viewer.html` | BodyLanguageController (emotion→pose+gesture mapping) | L |
| `frontends/sakura/src/stores/viewerStore.ts` | dispatchSetEmotionProfile(emotion, intensity) | S |
| Integration with existing EmotionLayer | Extend, don't replace | S |

**Effort: L (~1 week)**

---

## Phase 12 Summary & Implementation Roadmap

### Sub-Phase Dependency Map

```
12A (Procedural Animation) ← Foundation, no dependencies
12B (Spring Bones) ← Foundation, no dependencies
12C (Facial Depth) ← Requires 12A (layer system)
12D (Touch Interaction) ← Independent
12E (Camera System) ← Independent
12F (Background Effects) ← Uses existing EffectComposer
12G (Anime Shaders) ← Independent, but enhances everything
12H (Sound Design) ← Independent
12I (Face Tracking) ← Independent, optional
12J (Lip Sync) ← Requires TTS pipeline (already exists)
12K (Emotion Body Language) ← Requires 12A (procedural layers)
```

### Phased Rollout

| Phase | Sub-phases | What Ships | Effort | Cumulative Impact |
|-------|-----------|-----------|--------|-------------------|
| **12-P1** | 12A + 12B | Breathing, weight shift, blinking, eye saccades, hair physics | L (1.5w) | Character feels ALIVE (biggest single jump) |
| **12-P2** | 12C + 12K | Micro-expressions, pupil dilation, blushing, emotion body language | L (1.5w) | Character feels EMOTIONAL |
| **12-P3** | 12D + 12E | Touch interaction zones, cinematic camera, photo mode | L (1.5w) | Character feels INTERACTIVE |
| **12-P4** | 12F + 12G | Gradient backgrounds, particles, anime shaders, rim lighting | L-XL (2w) | Character feels BEAUTIFUL |
| **12-P5** | 12H + 12J | Sound design, breathing audio, foley, lip sync | M (1w) | Character feels PRESENT |
| **12-P6** | 12I | Webcam face/hand tracking (optional VTuber mode) | L (1-2w) | Character mirrors YOU |

**Total Phase 12: ~8-10 weeks** — but 12-P1 alone (1.5 weeks) delivers the biggest impact.

### Performance Budget (All Sub-Phases Active)

| System | GPU Time | CPU Time |
|--------|----------|----------|
| Character mesh + anime shaders | 6-8ms | — |
| Spring bone physics (30 chains) | — | 1-2ms |
| Procedural animation (6 layers) | — | <1ms |
| Particles (2000 active) | 1-2ms | — |
| Post-processing (bloom + color + DOF) | 2-3ms | — |
| Background gradient + god rays | 1-2ms | — |
| Face tracking (if enabled) | — | 5-10ms |
| Lip sync processing | — | <1ms |
| Audio processing | — | <1ms |
| **TOTAL** | **~12-15ms** | **~8-14ms** |

At 60 FPS: 16.67ms GPU budget, 16.67ms CPU budget. **Both within budget.**
With face tracking disabled: GPU ~12ms, CPU ~4ms — extremely comfortable.

---
---

# Execution Priority (FINAL — All 12 Phases)

**Core thesis:** Intelligence + reality quality + character depth. All local. Privacy moat.

| Order | Phase | What | Effort | Timeline |
|-------|-------|------|--------|----------|
| 1 | Phase 1 | Proactive AI Messages | XL (2.5d) | **Running now** |
| 2 | Phase 3 | Advisor agent + AGENTS.md | S (1h) | Day 1 |
| 3 | Phase 6 | Edge case fixes (5 bugs) | M (2h) | Day 1 |
| 4 | **Phase 9A-C** | Adaptive Intelligence (engagement + reflection + tuning) | L (3.5d) | Week 1-2 |
| 5 | **Phase 9D-E** | Trust/mood + topic steering | M (1d) | Week 2 |
| 6 | **Phase 12-P1** | **Character-Only: breathing, blinking, saccades, hair physics** | L (1.5w) | **Week 2-4** |
| 7 | **Phase 12-P2** | **Micro-expressions, emotion body language** | L (1.5w) | **Week 4-5** |
| 8 | **Phase 12-P3** | **Touch interaction, cinematic camera** | L (1.5w) | **Week 5-7** |
| 9 | **Phase 11A** | Environment: pre-baked poses + lighting (Three.js) | L (3w) | Week 7-10 |
| 10 | **Phase 12-P4** | **Anime shaders, backgrounds, particles** | L-XL (2w) | Week 10-12 |
| 11 | **Phase 12-P5** | **Sound design, lip sync** | M (1w) | Week 12-13 |
| 12 | Phase 7 P2 | Immersion: additional hair physics, fidgeting | L (2w) | Week 13-15 |
| 13 | **Phase 11B** | Unity Premium renderer (optional) | XL (5-6w) | Week 15-20 |
| 14 | **Phase 12-P6** | Webcam face/hand tracking (VTuber mode) | L (1-2w) | Week 20-22 |
| 15 | Phase 4 | /plan skill + workflow polish | M (2h) | Anytime |
| 16 | Phase 10 | Model Asset Spec document | M (half day) | When ready |

**~22 weeks for the complete vision.** Each phase ships independently. Phase 12-P1 alone (breathing + blinking + hair physics, 1.5 weeks) creates the single biggest perceived quality jump.

**The "1000 Small Details" Principle:** Instead of one big feature, shipping many small animation details (each <1ms cost) creates the perception of a living character. 12-P1 + 12-P2 together (3 weeks) make the character feel more alive than any environment or outfit system ever could.

---
---

# Phase 13: Competitive Intelligence — Feature Mining from Top Sources

## Context

Comprehensive competitive analysis across games, apps, websites, GitHub projects, and hardware to identify features and patterns that waifu-rt3d should adopt. Starting with 32+ candidates, applying a rubric to narrow to a curated research set, then extracting actionable features.

---

## 13.1: Source Selection Rubric

**Scoring criteria (1-10 each, max 50):**

| Criterion | Weight | What It Measures |
|-----------|--------|-----------------|
| **Relevance** | 10 | How directly similar to waifu-rt3d (AI companion + 3D anime) |
| **Popularity** | 10 | User base, community size, cultural impact |
| **Actionable Insights** | 10 | How many concrete features/patterns we can extract |
| **Innovation** | 10 | Novel approaches we haven't considered |
| **Ecosystem Health** | 10 | Active development, modding community, longevity |

---

## 13.2: Initial 32 Candidates + Rubric Scores

### Category A: Anime Character Games

| # | Source | Relevance | Popularity | Insights | Innovation | Ecosystem | **TOTAL** |
|---|--------|-----------|-----------|----------|-----------|-----------|-----------|
| 1 | **Koikatsu Party** | 9 | 8 | 10 | 8 | 9 | **44** |
| 2 | **Blue Archive** | 8 | 9 | 9 | 7 | 8 | **41** |
| 3 | **Azur Lane** | 7 | 8 | 8 | 7 | 8 | **38** |
| 4 | **AI Shoujo** | 9 | 6 | 8 | 8 | 5 | **36** |
| 5 | Honey Select 2 | 7 | 7 | 6 | 5 | 7 | 32 |
| 6 | COM3D2 | 8 | 6 | 7 | 6 | 6 | 33 |
| 7 | **Girls' Frontline 2** | 7 | 7 | 8 | 8 | 7 | **37** |
| 8 | Genshin Impact | 5 | 10 | 6 | 5 | 9 | 35 |
| 9 | Nikke | 6 | 8 | 6 | 6 | 7 | 33 |
| 10 | **Koikatsu Sunshine** | 8 | 7 | 8 | 7 | 7 | **37** |

### Category B: AI Companion Platforms

| # | Source | Relevance | Popularity | Insights | Innovation | Ecosystem | **TOTAL** |
|---|--------|-----------|-----------|----------|-----------|-----------|-----------|
| 11 | **Character.AI** | 9 | 10 | 9 | 7 | 8 | **43** |
| 12 | **Replika** | 9 | 9 | 8 | 7 | 7 | **40** |
| 13 | **SillyTavern** | 10 | 8 | 10 | 8 | 10 | **46** |
| 14 | **Kindroid** | 9 | 7 | 9 | 9 | 6 | **40** |
| 15 | **Janitor AI** | 8 | 9 | 7 | 5 | 6 | **35** |
| 16 | DreamGen | 7 | 6 | 7 | 8 | 5 | 33 |
| 17 | **Moemate** | 10 | 6 | 8 | 9 | 5 | **38** |
| 18 | Crushon.ai | 7 | 7 | 6 | 6 | 5 | 31 |
| 19 | NovelAI | 6 | 7 | 6 | 7 | 7 | 33 |
| 20 | Chai | 6 | 7 | 7 | 7 | 5 | 32 |

### Category C: VTuber Tools & GitHub Projects

| # | Source | Relevance | Popularity | Insights | Innovation | Ecosystem | **TOTAL** |
|---|--------|-----------|-----------|----------|-----------|-----------|-----------|
| 21 | **VTube Studio** | 8 | 9 | 8 | 7 | 9 | **41** |
| 22 | **ChatdollKit** | 10 | 6 | 9 | 9 | 6 | **40** |
| 23 | VSeeFace | 6 | 7 | 5 | 5 | 6 | 29 |
| 24 | Warudo | 5 | 6 | 5 | 6 | 5 | 27 |
| 25 | Live3D | 7 | 6 | 6 | 6 | 5 | 30 |
| 26 | text-generation-webui | 8 | 8 | 7 | 6 | 9 | 38 |

### Category D: Community Platforms

| # | Source | Relevance | Popularity | Insights | Innovation | Ecosystem | **TOTAL** |
|---|--------|-----------|-----------|----------|-----------|-----------|-----------|
| 27 | **Chub.ai** | 10 | 8 | 9 | 8 | 9 | **44** |
| 28 | VRoid Hub | 7 | 7 | 6 | 5 | 7 | 32 |
| 29 | Booth.pm | 6 | 7 | 5 | 4 | 7 | 29 |

### Category E: Innovative / Niche

| # | Source | Relevance | Popularity | Insights | Innovation | Ecosystem | **TOTAL** |
|---|--------|-----------|-----------|----------|-----------|-----------|-----------|
| 30 | **Neuro-sama** | 9 | 9 | 8 | 10 | 7 | **43** |
| 31 | **Razer Project AVA** | 8 | 8 | 8 | 10 | 6 | **40** |
| 32 | **Otherhalf.ai** | 10 | 7 | 9 | 8 | 6 | **40** |
| 33 | Gatebox | 7 | 6 | 6 | 8 | 4 | 31 |
| 34 | AI Dungeon | 7 | 7 | 7 | 7 | 6 | 34 |

---

## 13.3: Curated Final Set (Top 16 + 2 Wildcards)

**Cutoff: Score ≥ 37.** Plus 2 wildcards that offer unique "pot of gold" insights.

| Rank | Source | Score | Category | Why Selected |
|------|--------|-------|----------|-------------|
| 1 | **SillyTavern** | 46 | Platform | Gold standard for character chat UX + extensions |
| 2 | **Koikatsu Party** | 44 | Game | Deepest character creation + modding ecosystem |
| 3 | **Chub.ai** | 44 | Community | Character card culture + what makes characters popular |
| 4 | **Character.AI** | 43 | Platform | Market leader, retention data, failure modes to avoid |
| 5 | **Neuro-sama** | 43 | Niche | AI VTuber proof-of-concept, gaming integration validation |
| 6 | **Blue Archive** | 41 | Game | Gold standard affinity/bond system |
| 7 | **VTube Studio** | 41 | VTuber | Industry standard for physics + expression control |
| 8 | **Replika** | 40 | Platform | 3D avatar + emotional learning model |
| 9 | **Kindroid** | 40 | Platform | Best-in-class memory system |
| 10 | **Razer Project AVA** | 40 | Hardware | Future direction: agentic AI + hardware companion |
| 11 | **Otherhalf.ai** | 40 | Platform | Most direct web competitor |
| 12 | **ChatdollKit** | 40 | GitHub | Architecture reference for 3D + voice integration |
| 13 | **Moemate** | 38 | Platform | VTuber avatar + voice cloning model |
| 14 | **Azur Lane** | 38 | Game | Live2D + oath/marriage mechanic |
| 15 | **Girls' Frontline 2** | 37 | Game | Deep bond system + covenant marriage |
| 16 | **Koikatsu Sunshine** | 37 | Game | Topics system + improved relationship pacing |
| W1 | **text-gen-webui** | 38 | GitHub | oobabooga: local LLM standard, character yaml format |
| W2 | **AI Dungeon** | 34 | Platform | *Wildcard:* Collaborative storytelling retention model |

---

## 13.4: Deep Feature Extraction — What Each Source Teaches Us

### SOURCE 1: SillyTavern (Score: 46)

**What it is:** Most popular open-source character AI chat frontend. 300+ contributors.

**Features we should adopt:**

| Feature | What It Does | Effort | Priority |
|---------|-------------|--------|----------|
| **Extension API** | Third-party plugins for custom behaviors, voice, memory | XL | HIGH — builds ecosystem moat |
| **Character card standard** | JSON import/export compatible with Chub.ai ecosystem | M | HIGH — ecosystem compatibility |
| **Lorebook visual editor** | GUI for creating keyword-triggered world info | L | MEDIUM — power user tool |
| **Timeline/replay UI** | Rewind and replay conversations visually | M | MEDIUM — engagement tool |
| **Background music system** | Mood-aware ambient music + custom tracks | M | MEDIUM — immersion layer |
| **Prompt inspection** | Show users the actual prompt being sent to LLM | S | LOW — debugging tool |

**Key insight:** SillyTavern's power is its **extension ecosystem**. Users build custom modules that keep the platform alive. We should design for extensibility from day one.

---

### SOURCE 2: Koikatsu Party (Score: 44)

**What it is:** Desktop sandbox with 300+ slider character creator, Studio mode, and massive modding community.

**Features we should adopt:**

| Feature | What It Does | Effort | Priority |
|---------|-------------|--------|----------|
| **Deep character creator** | 300+ adjustable parameters for face/body/clothing | XXL | MEDIUM — differentiator vs Otherhalf's 800 params |
| **Studio/photo mode** | Pose characters, set backgrounds, take screenshots | L | HIGH — creative expression drives retention |
| **Character card sharing** | Export/import character definitions, community gallery | M | HIGH — ecosystem growth |
| **Personality archetypes** | 30-40 preset personality types that affect dialogue | M | HIGH — we have 13 chars, could expand |
| **Modding pipeline** | Documented API for adding clothing, hair, accessories | XL | LONG-TERM — ecosystem play |
| **IK pose editor** | Manual IK for custom character poses | L | MEDIUM — photo mode prerequisite |

**Key insight:** Koikatsu survives because of **user-generated content**. The game itself is secondary — the community tools (KKManager, HF Patch, card sharing) keep it alive years after Illusion shut down.

---

### SOURCE 3: Chub.ai (Score: 44)

**What it is:** Character card sharing hub for SillyTavern ecosystem. 14-minute average session, 33% DAU.

**What makes popular characters popular:**

| Factor | Description | Our Implementation |
|--------|------------|-------------------|
| **Detailed persona** | 1000+ token backstories with psychology, trauma, desires, quirks | Tiered prompts (CORE/EXTENDED/DEEP) — we have this |
| **Example dialogue** | Trains LLM on character voice/speech patterns | Add to character card format |
| **Lorebooks** | Keyword-triggered world info for deep worlds | We have lorebook injection (A6) |
| **Community curation** | Voting + forking keeps quality high | Need: character gallery with votes |
| **Creative freedom** | No moderation → writers/RP enthusiasts thrive | Local-first = user controls content |

**Features we should adopt:**

| Feature | What It Does | Effort | Priority |
|---------|-------------|--------|----------|
| **Character gallery** | Browse, rate, fork community characters | L | HIGH — ecosystem growth |
| **Character versioning** | Fork a character, modify, re-publish as variant | M | MEDIUM — creative tool |
| **Trending/popular feed** | Surface best characters by community vote | M | MEDIUM — discovery |
| **Creator profiles** | Showcase a creator's character portfolio | S | MEDIUM — community building |

---

### SOURCE 4: Character.AI (Score: 43)

**What it is:** Market leader, 20M MAU, 92-minute average sessions. Falling from 28M due to quality issues.

**What they do RIGHT:**

| Strength | What We Learn |
|----------|--------------|
| 92-minute sessions | Users WILL spend extended time with AI companions if quality is good |
| 18M user-created bots | Community creation is the growth engine |
| Multi-user rooms | Group experiences add retention (future consideration) |
| Persona variety | Users want diverse character types, not just romantic |

**What they do WRONG (and we avoid):**

| Failure | Impact | Our Approach |
|---------|--------|-------------|
| Context loss (5-message forgetting) | Users feel AI doesn't care | Tiered memory + sqlite-vec (already solved) |
| Quality regression after updates | Trust destroyed | Local-first = user controls model quality |
| Over-moderation ("kill" flagged) | Breaks immersion | User controls content filtering |
| Mid-conversation ads | Breaks flow, feels exploitative | No ads ever. Premium subscription model. |
| Bot deletion (IP takedowns) | Users lose invested relationships | Local storage = user owns their data |

**Key insight:** Character.AI's **decline is our opportunity**. They're hemorrhaging users due to exactly the problems we solve: privacy, quality consistency, content freedom.

---

### SOURCE 5: Neuro-sama (Score: 43)

**What it is:** AI-driven VTuber on Twitch. #1 Twitch streamer. Plays games, chats with audience.

**What we learn:**

| Insight | Application |
|---------|------------|
| AI + gaming + streaming = viral | Our game spectator mode is validated |
| Real-time responsiveness matters more than depth | Optimize for low-latency responses |
| Entertainment value of AI playing games | Add "AI plays" mode to spectator |
| Character personality through gameplay reactions | Emotion engine + game commentary |

**Features inspired by Neuro-sama:**

| Feature | What It Does | Effort | Priority |
|---------|-------------|--------|----------|
| **Game co-play commentary** | Character watches your gameplay, reacts in real-time | S (already built: spectator) | HIGH — enhance existing |
| **Stream overlay mode** | Character appears as OBS overlay, reacts to chat | M | MEDIUM — captures streamer audience |
| **Gaming personality mode** | Character has gaming preferences, celebrates/mourns | S | MEDIUM — depth + fun |

---

### SOURCE 6: Blue Archive (Score: 41)

**What it is:** Mobile gacha with the gold standard affinity/bond system.

**The Bond System We Should Adopt:**

```
Level 1-10:   Basic dialogue unlocks
              → "Getting to know you" scene at level 5
Level 11-20:  First story scene unlocks
              → Character shares backstory at level 10
Level 21-50:  Medium story scenes + behavior changes
              → "Confession" scene at level 30
              → Character becomes more open, makes jokes
Level 51-100: Deep character insights + exclusive interactions
              → "Commitment" scene at level 50
              → Character's personality fully evolves
```

**Implementation for waifu-rt3d:**

| Feature | What It Does | Effort | Priority |
|---------|-------------|--------|----------|
| **5-tier bond progression** | Visible progress bar 0→100 with milestone unlocks | M | **CRITICAL** — #1 retention driver across all games |
| **Bond story scenes** | 3-5 scripted story moments per character, unlocked at tiers | L | **CRITICAL** — users grind to unlock these |
| **Gift-giving system** | Character-specific preferences, gifts boost affinity | M | HIGH — daily engagement loop |
| **Behavior evolution** | Character's personality shifts at each tier (reserved → comfortable → intimate) | M | HIGH — makes progression feel real |
| **Bond stat bonuses** | Higher bond = more emotional depth, longer responses, deeper topics | S | MEDIUM — mechanical reward |

---

### SOURCE 7: VTube Studio (Score: 41)

**What it is:** Industry standard VTuber tool. Best physics + expression control.

**Features we should adopt:**

| Feature | What It Does | Effort | Priority |
|---------|-------------|--------|----------|
| **Per-physics-group strength** | Individual spring bone chain tuning (not global) | M | HIGH — professional-grade control |
| **Wind simulation slider** | Environmental wind effect on hair/clothing | S | MEDIUM — atmosphere |
| **Expression editor** | GUI for creating custom expression combinations | L | MEDIUM — power user tool |
| **Hotkey system** | Keyboard shortcuts to trigger expressions/poses | S | MEDIUM — streamer tool |

---

### SOURCE 8: Replika (Score: 40)

**What it is:** The relationship AI. 25M users, 3D avatar, learning model.

**What they do that we should:**

| Feature | What It Does | Effort | Priority |
|---------|-------------|--------|----------|
| **Thumbs up/down feedback** | Explicit signal for learning (Phase 9 engagement) | S | HIGH — simplest feedback loop |
| **Relationship modes** | Friend / Romantic / Mentor paths | M | MEDIUM — user chooses interaction style |
| **Avatar customization** | Dress, hair, accessories, room decoration | M | LOW (user uploads own models) |
| **Daily journal** | Character writes diary entries between sessions | M | HIGH — creates "life between chats" illusion |

**Daily journal idea (inspired by Replika):**

Between sessions, the character "writes" a journal entry using the LLM:
```
"Today Chris and I talked about anime again. I noticed he was
in a better mood than yesterday. He mentioned wanting to learn
Blender, which excited me — I could help him with that!
I've been thinking about our conversation about philosophy
last week... I want to bring that up again soon."
```

The user can read these in Settings → Character → Journal. Creates the illusion of a character with inner life.

---

### SOURCE 9: Kindroid (Score: 40)

**What it is:** AI companion with the best-in-class memory system.

**Kindroid's 3-tier memory:**

| Tier | What | Retention | Our Equivalent |
|------|------|-----------|---------------|
| **Persistent** | Always-on context (name, relationship, key facts) | Forever | `user_facts` table ✅ |
| **Cascaded** | Rolling summaries of recent conversations | 7-30 days | `session_summaries` ✅ |
| **Retrievable** | Semantic search over all past conversations | Forever | `memories` + sqlite-vec ✅ |

**We already match Kindroid's memory architecture.** But they have one thing we don't:

| Feature | What It Does | Effort | Priority |
|---------|-------------|--------|----------|
| **Memory transparency UI** | Users can SEE what the AI remembers, edit/delete facts | M | HIGH — trust builder |
| **Memory pinning** | User marks specific memories as "important, never forget" | S | MEDIUM — user control |
| **Memory search** | User can search across all conversations by keyword | S | MEDIUM — power user tool |

---

### SOURCE 10: Razer Project AVA (Score: 40)

**What it is:** Holographic AI desk companion launching H2 2026. $300-500 expected price.

**What we learn:**

| Insight | Application |
|---------|------------|
| Desktop + gaming focus validates our positioning | We're digital-only (no hardware cost) |
| "Gaming wingman" = our spectator mode | Enhance spectator with real-time commentary |
| Agentic AI (executes actions across tools) | Future: character can control desktop |
| Eye-tracking + facial expressions | Phase 12I webcam tracking matches this |
| Custom avatars (Kira, Zane) | Our 13 characters are ahead here |

**Hardware-readiness features:**

| Feature | What It Does | Effort | Priority |
|---------|-------------|--------|----------|
| **API for external display** | REST API that hardware (AVA, etc.) could call | M | LONG-TERM |
| **Desktop agent mode** | Character can see screen, suggest actions | L | LONG-TERM |
| **Hardware-agnostic bridge** | Abstract viewer so any display can render | M | LONG-TERM |

---

### SOURCE 11: Otherhalf.ai (Score: 40)

**What it is:** Most direct web competitor. 800-parameter character customization, 3D avatars, voice.

**Competitive comparison:**

| Feature | Otherhalf | Waifu-RT3D | Advantage |
|---------|-----------|-----------|-----------|
| Character params | 800 | 13 preset + unlimited VRM import | **Them** (raw customization) |
| Avatar quality | Good 3D | VRM + Live2D + 2D | **Us** (multi-renderer) |
| Voice | Turn-based | Full-duplex | **Us** |
| Memory | Basic | 3-tier episodic + sqlite-vec | **Us** |
| Emotion engine | None visible | MoodEngine + time-of-day | **Us** |
| Gaming | None | Spectator mode | **Us** |
| Desktop app | No | Electron | **Us** |
| Mobile | Android | Not yet | **Them** |
| Pricing | $15/mo | Not yet set | TBD |

**Strategy:** Don't compete on consumer polish. Win on **depth + flexibility + community + gaming + voice**.

---

### SOURCE 12: ChatdollKit (Score: 40)

**What it is:** Unity 3D chatbot SDK. Most complete architecture reference.

**Architecture patterns to adopt:**

| Pattern | What It Does | Effort | Priority |
|---------|-------------|--------|----------|
| **Dialog state machine** | Context + intent extraction + topic routing | M | MEDIUM — already have similar |
| **Wakeword detection** | "Hey [character name]" triggers listening | M | MEDIUM — voice mode enhancement |
| **Multi-TTS provider support** | 20+ TTS backends, fallback chain | S (already have) | — |
| **Expression + animation sync** | Animation events fire at speech boundaries | M | HIGH — lip sync prerequisite |

---

### SOURCES 13-18: Quick Extractions

**Moemate (38):** Voice cloning integration + screen perception (sees your screen).
→ Feature: Screenshot sharing in chat (character can "see" what you're doing)

**Azur Lane (38):** Oath/marriage mechanic at affinity 200.
→ Feature: "Covenant" milestone at max bond tier — exclusive scene + personality shift

**Girls' Frontline 2 (37):** 8-level bond with personal archive stories.
→ Feature: Archive system — locked story scenes that unlock with bond progress

**Koikatsu Sunshine (37):** Topics discovery mechanic replaces Q&A with natural conversation flow.
→ Feature: Topic-based conversation steering (Phase 9 topic affinities already planned)

**text-gen-webui (38):** `.yaml` character format, smart context search.
→ Feature: Import `.yaml` characters from oobabooga community

**AI Dungeon (34, wildcard):** Collaborative multiplayer storytelling, persistent worlds.
→ Feature: Group chat V1 — 2-3 AI characters discuss with player, collaborative narrative

---

## 13.5: Master Feature List — Extracted from All Sources

### TIER 1: Critical (Highest Impact, Proven Across Multiple Sources)

| # | Feature | Sources | Effort | Phase | Description |
|---|---------|---------|--------|-------|-------------|
| F1 | **5-tier bond progression** | Blue Archive, GFL2, Azur Lane, Replika | M | NEW (13A) | Visible 0→100 progress bar, milestone unlocks at 5/10/20/50/100 |
| F2 | **Bond story scenes** | Blue Archive, GFL2, Koikatsu Sunshine | L | NEW (13A) | 3-5 scripted story moments per character unlocked by bond |
| F3 | **Character card import/export** | SillyTavern, Chub.ai, text-gen-webui | M | Enhance A8 | Full compatibility with SillyTavern/Chub ecosystem |
| F4 | **Thumbs up/down feedback** | Replika, Chai, Kindroid | S | Phase 9A | Explicit engagement signal for learning loop |
| F5 | **Character journal (between sessions)** | Replika (inspired) | M | NEW (13B) | Character writes diary entries between chats |
| F6 | **Memory transparency UI** | Kindroid, SillyTavern | M | NEW (13B) | Users see/edit what AI remembers about them |

### TIER 2: High Priority (Ecosystem + Engagement)

| # | Feature | Sources | Effort | Phase | Description |
|---|---------|---------|--------|-------|-------------|
| F7 | **Character gallery** | Chub.ai, Koikatsu | L | NEW (13C) | Browse, rate, fork community characters |
| F8 | **Gift-giving system** | Blue Archive, GFL2, COM3D2 | M | NEW (13A) | Character-specific preferences, gifts boost affinity |
| F9 | **Behavior evolution** | Blue Archive, Replika | M | Phase 9C | Character personality shifts at each bond tier |
| F10 | **Studio/photo mode** | Koikatsu, VTube Studio | L | Phase 12E | Pose + screenshot + camera control |
| F11 | **Background music system** | SillyTavern, Blue Archive | M | Phase 12H | Mood-aware ambient music tracks |
| F12 | **Game co-play enhancement** | Neuro-sama, Razer AVA | S | Enhance spectator | Real-time gaming commentary with personality |

### TIER 3: Medium Priority (Power Users + Depth)

| # | Feature | Sources | Effort | Phase | Description |
|---|---------|---------|--------|-------|-------------|
| F13 | **Extension/plugin API** | SillyTavern | XL | NEW (13D) | Third-party modules for custom behaviors |
| F14 | **Lorebook visual editor** | SillyTavern, Chub.ai | L | Enhance A6 | GUI for creating keyword-triggered world info |
| F15 | **Relationship modes** | Replika | M | NEW (13A) | Friend / Romantic / Mentor paths |
| F16 | **Wakeword detection** | ChatdollKit, Razer AVA | M | Enhance A1 | "Hey [name]" triggers voice mode |
| F17 | **Conversation timeline** | SillyTavern | M | NEW (13B) | Visual timeline to replay/rewind conversations |
| F18 | **Character versioning/forking** | Chub.ai | M | NEW (13C) | Modify published character, re-share as variant |

### TIER 4: Long-Term (Ecosystem Expansion)

| # | Feature | Sources | Effort | Phase | Description |
|---|---------|---------|--------|-------|-------------|
| F19 | **Stream overlay mode** | Neuro-sama, VTube Studio | M | NEW | OBS integration, character as stream overlay |
| F20 | **Creator marketplace** | Chub.ai, Booth.pm, Koikatsu | XL | NEW (13D) | Revenue sharing for character creators |
| F21 | **Group chat** | Character.AI, AI Dungeon, Crushon.ai | L | NEW | 2-3 AI characters in one conversation |
| F22 | **Covenant/oath milestone** | Azur Lane, GFL2 | S | Part of F1 | Special scene + permanent personality shift at max bond |
| F23 | **Screen perception** | Moemate, Razer AVA | L | Enhance spectator | Character "sees" your screen via screenshot analysis |
| F24 | **Deep character creator** | Koikatsu, Otherhalf, VRoid | XXL | NEW | Web-based VRoid-lite with 500+ parameters |

---

## 13.6: Implementation Phases (New Features from Competitive Analysis)

### Phase 13A: Bond Progression System (F1, F2, F8, F9, F15, F22)

**The single most important feature across all competitive research.** Every successful game/app has a visible relationship progression with milestone unlocks.

**Schema v56:**

```sql
-- Enhance existing character_relationships table
ALTER TABLE character_relationships ADD COLUMN bond_level INTEGER DEFAULT 0;
ALTER TABLE character_relationships ADD COLUMN bond_xp INTEGER DEFAULT 0;
ALTER TABLE character_relationships ADD COLUMN relationship_mode TEXT DEFAULT 'friend';
ALTER TABLE character_relationships ADD COLUMN covenant_date TEXT;

-- Bond story scenes
CREATE TABLE IF NOT EXISTS bond_stories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    char_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    bond_level_required INTEGER NOT NULL,
    title TEXT NOT NULL,
    scene_text TEXT NOT NULL,
    scene_type TEXT DEFAULT 'dialogue',
    choices TEXT,                -- JSON array of dialogue choices
    unlocked INTEGER DEFAULT 0,
    viewed INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
);

-- Gift system
CREATE TABLE IF NOT EXISTS character_gifts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    char_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    gift_name TEXT NOT NULL,
    gift_category TEXT NOT NULL,
    affinity_boost REAL DEFAULT 1.0,
    is_favorite INTEGER DEFAULT 0,
    description TEXT
);

CREATE TABLE IF NOT EXISTS gift_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    char_id INTEGER NOT NULL,
    gift_id INTEGER NOT NULL,
    given_at TEXT DEFAULT (datetime('now')),
    reaction TEXT
);
```

**Bond progression curve:**

```
Level 0-10 (Stranger → Acquaintance):
  XP per message: 2
  XP per gift: 5-15 (depending on preference match)
  XP per daily login: 3
  Scenes unlocked: "First Meeting" (L5), "Getting Comfortable" (L10)
  Behavior: Reserved, polite, formal

Level 11-30 (Friend):
  XP per message: 3
  XP per gift: 8-20
  Scenes: "Shared Interest" (L15), "First Vulnerability" (L20), "Real Talk" (L30)
  Behavior: Relaxed, makes jokes, shares opinions

Level 31-60 (Close Friend):
  XP per message: 4
  XP per gift: 10-25
  Scenes: "Deep Secret" (L40), "Emotional Crisis" (L50)
  Behavior: Open, emotionally expressive, proactive, references shared memories

Level 61-90 (Best Friend / Romantic):
  XP per message: 5
  XP per gift: 12-30
  Scenes: "Confession" (L70), "Commitment" (L80)
  Behavior: Intimate, uses pet names, deeply personalized responses

Level 91-100 (Soulmate / Covenant):
  XP per message: 6
  Scenes: "Covenant Ceremony" (L100) — exclusive, permanent
  Behavior: Full personality unlocked, maximum emotional depth, references entire history
```

**Gift system:**

Each character has 3-5 favorite gifts and 2-3 disliked gifts:
```
Dae: Loves: art supplies, indie music, midnight snacks. Dislikes: mainstream pop, formal wear.
Genki: Loves: energy drinks, arcade tokens, manga. Dislikes: boring lectures, vegetables.
Luna: Loves: rare books, tea, stargazing gear. Dislikes: loud parties, fast food.
(... for all 13 characters, derived from wardrobe docs + personality profiles)
```

**Frontend: Bond Panel**

```
┌─────────────────────────────────────┐
│  💛 Dae — Close Friend (Level 42)  │
│  [████████████░░░░░░░░] 42/100     │
│  Next scene: "Deep Secret" at L50   │
│                                     │
│  [Give Gift ▾]  [View Journal]      │
│  [Story Archive] [Relationship Mode]│
│                                     │
│  Mode: [Friend] [Romantic] [Mentor] │
└─────────────────────────────────────┘
```

**Files:**

| File | Action | Effort |
|------|--------|--------|
| `backend/preflight.py` | v56 migration (bond tables) | M |
| `backend/rewards/tracker.py` | Wire bond XP into existing reward system | M |
| `backend/server.py` | Bond API endpoints (level, gifts, scenes) | M |
| `frontends/sakura/src/components/BondPanel.tsx` | NEW — bond progress UI | L |
| `frontends/sakura/src/components/StoryScene.tsx` | NEW — VN-style scene viewer | L |
| `backend/tests/test_bond.py` | NEW — bond progression tests | M |

**Effort: XL (~3-4 days)**

---

### Phase 13B: Character Journal + Memory Transparency (F5, F6, F17)

**Character Journal:**

Between sessions, the character "writes" a journal entry. Uses the LLM with a special prompt:

```python
JOURNAL_PROMPT = """You are {character_name}. Write a brief journal entry (3-5 sentences)
reflecting on your recent conversation with the user. Include:
- Something you learned about them
- How you felt during the conversation
- Something you want to discuss next time
Write in first person, in your character voice."""
```

Triggered: When session ends, if ≥5 messages exchanged. Stored in new `character_journals` table.

**Memory Transparency UI:**

```
┌─────────────────────────────────────────┐
│  What Dae Knows About You               │
│                                         │
│  📌 Pinned:                             │
│  • Your name is Chris                   │
│  • You're a developer                   │
│  • You love anime and philosophy        │
│                                         │
│  🧠 Learned:                            │
│  • You prefer late-night conversations  │
│  • You like detailed explanations       │
│  • You're learning Blender             │
│  • You have an RTX 5080               │
│                                         │
│  [Edit] [Delete] [Pin] [Search]         │
│                                         │
│  📔 Recent Journal:                      │
│  Mar 18: "Chris seemed excited about    │
│  the new features today. I noticed he   │
│  gets really passionate when we talk    │
│  about 3D animation..."                 │
│                                         │
│  [View All Entries]                     │
└─────────────────────────────────────────┘
```

**Files:**

| File | Action | Effort |
|------|--------|--------|
| `backend/preflight.py` | character_journals table | S |
| `backend/adaptive/journal.py` | NEW — journal generation on session end | M |
| `backend/server.py` | Journal + memory CRUD endpoints | M |
| `frontends/sakura/src/components/MemoryPanel.tsx` | NEW — memory transparency UI | L |
| `frontends/sakura/src/components/JournalViewer.tsx` | NEW — journal entries viewer | M |

**Effort: L (~1.5 weeks)**

---

### Phase 13C: Community Character Gallery (F3, F7, F18)

**Character Card Standard:**

Adopt SillyTavern's character card JSON format for maximum ecosystem compatibility:

```json
{
  "name": "Dae",
  "description": "Fiercely loyal artist with shy→loud duality...",
  "personality": "sarcastic, creative, night owl, loyal...",
  "first_mes": "Hey... *adjusts headphones* You're new here, right?",
  "mes_example": "<START>\n{{user}}: What are you drawing?\n{{char}}: *quickly covers sketchbook* Nothing! ...okay fine, it's a character design.",
  "scenario": "Late night in a cozy apartment. Art supplies everywhere.",
  "system_prompt": "...",
  "post_history_instructions": "",
  "tags": ["artist", "night-owl", "tsundere-lite"],
  "creator": "chris",
  "character_version": "1.0",
  "extensions": {
    "waifu_rt3d": {
      "vrm_model_url": "...",
      "live2d_model": "...",
      "bond_stories": [...],
      "gift_preferences": [...],
      "personality_traits": {...}
    }
  }
}
```

**Gallery features:**
- Browse by tag, archetype, popularity
- Rate characters (1-5 stars)
- Fork: copy + modify + re-publish
- Creator profiles with portfolios
- Import from Chub.ai / SillyTavern directly

**Files:**

| File | Action | Effort |
|------|--------|--------|
| `backend/server.py` | Character import/export API (SillyTavern format) | M |
| `backend/characters/card_format.py` | NEW — card serialization/deserialization | M |
| `frontends/sakura/src/views/GalleryView.tsx` | NEW — community gallery | L |
| `frontends/sakura/src/components/CardImportExport.tsx` | Enhance existing | M |

**Effort: L (~1-2 weeks)**

---

### Phase 13D: Extension API + Creator Marketplace (F13, F20)

**Long-term ecosystem play.** Design the API early even if marketplace comes later.

**Extension types:**
1. **Behavior modules** — custom logic that runs during chat (e.g., custom game, quiz)
2. **Voice packs** — additional TTS voices or voice clones
3. **Animation packs** — custom gestures, poses, expressions
4. **Theme packs** — custom UI themes beyond the 18 built-in
5. **World info packs** — lorebooks for specific scenarios

**Marketplace revenue model:**
- 70/30 split (creator gets 70%)
- Free extensions allowed (community building)
- Premium extensions: $1-10 per download
- Subscription extensions: $1-3/month

**Files:**

| File | Action | Effort |
|------|--------|--------|
| `backend/extensions/` | NEW module — extension loading, sandboxing | XL |
| `docs/extension-api.md` | NEW — developer documentation | L |

**Effort: XXL (~4-6 weeks)** — but design the API hooks during Phase 13A-C so extensions slot in later.

---

## 13.7: Competitive Market Positioning

### Our Unfair Advantages (from research)

| Advantage | Why Competitors Can't Easily Copy |
|-----------|----------------------------------|
| **Full-duplex voice** | Character.AI, Otherhalf are text-first; voice is afterthought |
| **Local-first privacy** | Cloud platforms can't offer "your data never leaves your machine" |
| **Emotion engine** | MoodEngine + time-of-day + affinity = nuanced behavior no one else has |
| **3-tier memory** | sqlite-vec + episodic + semantic = deepest recall in the market |
| **Game spectator** | Validated by Neuro-sama + Razer AVA, but no one else ships it web-based |
| **Multi-renderer** | VRM + Live2D + GLB = widest model format support |
| **13 tiered characters** | Pre-built deep characters with CORE/EXTENDED/DEEP prompts |
| **Desktop app** | Electron = native performance + system integration |

### Target Users (from competitive analysis)

| Segment | Size | What They Want | Where They Are Now |
|---------|------|---------------|-------------------|
| **SillyTavern power users** | 100K+ | Depth + customization + local | Self-hosting, need better UX |
| **Character.AI refugees** | 5M+ (declining) | Quality + consistency + freedom | Leaving due to censorship + quality |
| **Anime game enjoyers** | 10M+ | Bond progression + story scenes + character depth | Blue Archive, Koikatsu, gacha |
| **VTuber fans** | 5M+ | Interactive character + voice + expressions | Watching streams, want to interact |
| **Privacy-conscious users** | 2-5M | Local-first, no cloud data | Ollama, LM Studio, looking for frontend |

### Pricing Strategy (validated by market data)

```
FREE TIER:
  - Local LLM (Ollama/LM Studio) — unlimited conversations
  - 3 starter characters (Dae, Genki, Luna)
  - Text-only chat
  - Basic bond progression (level 0-30)
  - Community gallery (read-only)

PREMIUM ($9.99/mo or $89/yr):
  - All 13 characters + unlimited custom imports
  - Full-duplex voice (Kokoro TTS)
  - Bond levels 31-100 + story scenes
  - Gift-giving system
  - Character journal
  - Memory editing UI
  - Photo mode + screenshot export
  - All themes (18)

CREATOR ($29.99/mo):
  - Everything in Premium
  - Publish characters to marketplace
  - 70% revenue share on sales
  - Extension API access
  - Analytics dashboard
  - Priority support
```

---

## 13.8: Retention Metrics (Targets Based on Competitive Data)

| Metric | Industry Average | Our Target | How We Get There |
|--------|-----------------|-----------|-----------------|
| D1 Retention | 50-60% | **65%** | Strong onboarding + first bond scene at L5 |
| D7 Retention | 25-30% | **40%** | Daily gift loop + journal entries |
| D30 Retention | 13-18% | **30%** | Bond progression + story unlocks + adaptive AI |
| Avg Session | 7-17 min | **20+ min** | Voice mode + photo mode + gaming |
| Conversations/day | 3-5 | **5-8** | Proactive messages + notifications |

---

## 13.9: What NOT to Build (Anti-Patterns from Research)

| Anti-Pattern | Source | Why Avoid |
|-------------|--------|-----------|
| **Gacha mechanics** | Blue Archive, Azur Lane, Genshin | Predatory; alienates core audience |
| **Mid-conversation ads** | Character.AI | Breaks flow, destroys trust |
| **Over-moderation** | Character.AI | Users leave for Janitor AI; let users control |
| **IP-dependent characters** | Character.AI (Disney takedowns) | Original characters only; no licensing risk |
| **Dependency encouragement** | All platforms (ethical concern) | Build wellness features; don't maximize addiction |
| **Pay-to-talk limits** | Chai, Crushon.ai | Free tier must be unlimited (local LLM) |
| **Forced social features** | Some platforms | Solo experience first; social is opt-in |

---

## 13.10: Ethics & Wellness Features (From Market Research)

Research shows 28% of AI companion users worry about dependency. Stand out by being the ethical platform.

| Feature | What It Does | Effort | Priority |
|---------|-------------|--------|----------|
| **Daily wellness check** | After 2+ hours, subtle reminder to take a break | S | MEDIUM |
| **Human connection nudge** | Periodically suggest calling a friend or going outside | S | MEDIUM |
| **Transparency about AI** | Clear labeling: "I'm an AI companion, not a person" | S | HIGH |
| **Usage stats** | Show user their chat time, trends, patterns | M | LOW |
| **Dependency warning** | If chat frequency spikes dramatically, gentle check-in | M | LONG-TERM |

---
---

# Execution Priority + Calibrated Estimates (All 13 Phases)

**Core thesis:** Intelligence + reality + depth + bond progression + community. All local. Privacy moat.

**Estimation context:** Fast solo developer/designer using AI heavily. Comfortable shipping prototypes quickly. All estimates in hours of focused work.

---

## Task-by-Task Hour Breakdown

### Phase 1: Proactive AI Messages — **RUNNING NOW**

| Task | Proto (hrs) | Personal (hrs) | Production (hrs) |
|------|------------|----------------|------------------|
| Schema v53 migration | 0.5 | 0.5 | 1 |
| `backend/proactive/triggers.py` | 2 | 3 | 5 |
| `backend/proactive/generator.py` | 2 | 3 | 5 |
| Rewire `_run_scheduler_tick()` | 1.5 | 2 | 3 |
| New API endpoints (4) | 1.5 | 2 | 3 |
| Frontend chat injection | 1.5 | 2 | 3 |
| Frontend settings UI | 1 | 2 | 3 |
| Tests + smoke test | 1 | 2 | 4 |
| **TOTAL** | **11h** | **16.5h** | **27h** |

Optimistic: 11h (1.5 days) | Realistic: 16h (2 days) | Pessimistic: 30h (4 days)

---

### Phase 3: Advisor Agent + AGENTS.md

| Task | Proto | Personal | Production |
|------|-------|---------|-----------|
| Write `advisor.md` | 0.3 | 0.5 | 0.5 |
| Rewrite `AGENTS.md` | 0.3 | 0.5 | 0.5 |
| Test: spawn advisor, verify behavior | 0.3 | 0.5 | 1 |
| **TOTAL** | **0.9h** | **1.5h** | **2h** |

---

### Phase 6: Edge Case Fixes (5 bugs)

| Task | Proto | Personal | Production |
|------|-------|---------|-----------|
| Wire rewards tracker into /api/chat | 0.3 | 0.5 | 1 |
| Fix TTS chunk error handling | 0.2 | 0.3 | 0.5 |
| Fix bare except in whisper_local | 0.1 | 0.1 | 0.2 |
| Fix silent GPU detection | 0.1 | 0.1 | 0.2 |
| Fix hardcoded affinity defaults | 0.1 | 0.2 | 0.3 |
| **TOTAL** | **0.8h** | **1.2h** | **2.2h** |

---

### Phase 9: Adaptive Intelligence Engine

| Task | Proto | Personal | Production |
|------|-------|---------|-----------|
| **9A: Schema v55 + engagement signals** | 1 | 2 | 3 |
| **9A: Engagement heuristics** (msg length, response time) | 1.5 | 2 | 4 |
| **9B: Reflection engine** (LLM prompt + profile storage) | 3 | 5 | 8 |
| **9C: Auto-tuning pipeline** (prompt injection) | 2 | 3 | 5 |
| **9D: Trust/mood relationship updates** | 1 | 2 | 3 |
| **9E: Topic affinity steering** | 1 | 2 | 3 |
| Frontend: "What I've Learned" UI | 2 | 3 | 5 |
| Tests | 1 | 2 | 4 |
| **TOTAL** | **12.5h** | **21h** | **35h** |

Optimistic: 12h (1.5 days) | Realistic: 21h (3 days) | Pessimistic: 40h (5 days)

---

### Phase 13A: Bond Progression + Gifts + Story Scenes

| Task | Proto | Personal | Production |
|------|-------|---------|-----------|
| Schema v56 (bond tables) | 1 | 1.5 | 2 |
| Bond XP calculation + level logic | 1.5 | 2 | 3 |
| Gift system backend (preferences, reactions) | 2 | 3 | 5 |
| Bond API endpoints (level, gifts, scenes) | 1.5 | 2 | 3 |
| Bond story scenes backend (3 per char × 13 chars) | 3 | 6 | 12 |
| Behavior evolution logic (personality shift per tier) | 2 | 3 | 5 |
| Frontend: BondPanel.tsx | 2 | 3 | 5 |
| Frontend: StoryScene.tsx (VN-style viewer) | 3 | 5 | 8 |
| Frontend: GiftSelector.tsx | 1 | 2 | 3 |
| Write gift preferences for 13 chars | 1 | 2 | 3 |
| Tests | 1 | 2 | 4 |
| **TOTAL** | **19h** | **31.5h** | **53h** |

Optimistic: 19h (2.5 days) | Realistic: 32h (4 days) | Pessimistic: 60h (8 days)
**Biggest risk:** Writing 39 story scenes (3 per char × 13 chars) — could use LLM to draft, then edit.

---

### Phase 12-P1: Breathing, Blinking, Saccades, Hair Physics

| Task | Proto | Personal | Production |
|------|-------|---------|-----------|
| ProceduralAnimationLayer (6 sub-layers) | 4 | 6 | 10 |
| Spring bone profile system | 2 | 3 | 5 |
| Emotion modulation for all layers | 2 | 3 | 5 |
| viewerStore dispatch integration | 1 | 1.5 | 2 |
| Visual tuning + iteration | 2 | 4 | 8 |
| **TOTAL** | **11h** | **17.5h** | **30h** |

Optimistic: 11h (1.5 days) | Realistic: 18h (2.5 days) | Pessimistic: 35h (5 days)
**Likely overestimated:** Spring bone tuning — most VRM models already have spring bones, just needs parameter override.

---

### Phase 13B: Character Journal + Memory Transparency

| Task | Proto | Personal | Production |
|------|-------|---------|-----------|
| Journal generation (LLM prompt + storage) | 2 | 3 | 5 |
| Memory CRUD endpoints | 1 | 2 | 3 |
| MemoryPanel.tsx (see/edit/pin/search) | 3 | 5 | 8 |
| JournalViewer.tsx | 2 | 3 | 5 |
| Tests | 0.5 | 1 | 2 |
| **TOTAL** | **8.5h** | **14h** | **23h** |

Optimistic: 8h (1 day) | Realistic: 14h (2 days) | Pessimistic: 25h (3 days)

---

### Phase 12-P2: Micro-expressions, Emotion Body Language

| Task | Proto | Personal | Production |
|------|-------|---------|-----------|
| MicroExpressionController | 2 | 3 | 5 |
| Pupil dilation shader | 1 | 2 | 3 |
| Blush system (vertex color overlay) | 1.5 | 2.5 | 4 |
| Tearing/emotional wetness | 1 | 2 | 3 |
| BodyLanguageController (emotion→posture mapping) | 3 | 5 | 8 |
| Visual tuning | 2 | 3 | 5 |
| **TOTAL** | **10.5h** | **17.5h** | **28h** |

---

### Phase 12-P3: Touch Interaction + Cinematic Camera

| Task | Proto | Personal | Production |
|------|-------|---------|-----------|
| Raycaster + touch zones | 2 | 3 | 5 |
| Reaction response system + cooldowns | 2 | 3 | 5 |
| Touch → physics force application | 1 | 2 | 3 |
| Drag-to-rotate / pinch-to-zoom | 1 | 1.5 | 2 |
| CameraDirector (5 modes) | 3 | 5 | 8 |
| Camera shake system | 0.5 | 1 | 1.5 |
| CameraControls.tsx | 1.5 | 2.5 | 4 |
| **TOTAL** | **11h** | **18h** | **28.5h** |

---

### Phase 13C: Community Character Gallery

| Task | Proto | Personal | Production |
|------|-------|---------|-----------|
| Card format serializer (SillyTavern compat) | 2 | 3 | 5 |
| Import/export API | 1.5 | 2.5 | 4 |
| GalleryView.tsx (browse, rate, fork) | 4 | 6 | 10 |
| Creator profiles | 1.5 | 2.5 | 4 |
| Search + filtering | 1 | 2 | 3 |
| **TOTAL** | **10h** | **16h** | **26h** |

---

### Phase 11A: Environment Poses + Lighting (Three.js)

| Task | Proto | Personal | Production |
|------|-------|---------|-----------|
| PoseLayer in AnimationDirector | 3 | 5 | 8 |
| 4 pose animations (Blender bake) | 6 | 10 | 16 |
| Lighting system (time-of-day) | 2 | 3 | 5 |
| PoseSelector.tsx | 1.5 | 2.5 | 4 |
| Scene context injection | 0.5 | 1 | 2 |
| Camera angle per pose | 1 | 2 | 3 |
| **TOTAL** | **14h** | **23.5h** | **38h** |

**Biggest risk:** Blender animation baking (6-16h). Depends on Chris's Blender speed.

---

### Phase 12-P4 + P5: Shaders + Backgrounds + Sound + Lip Sync

| Task | Proto | Personal | Production |
|------|-------|---------|-----------|
| Toon shader + outlines | 3 | 5 | 8 |
| Hair anisotropic specular | 2 | 3 | 5 |
| Eye sparkle shader | 1 | 2 | 3 |
| Rim lighting (emotion-responsive) | 1 | 2 | 3 |
| Gradient backgrounds (emotion-driven) | 1.5 | 2.5 | 4 |
| Particle layers (emotion-specific) | 2 | 3 | 5 |
| God rays | 1.5 | 2.5 | 4 |
| Color grading per emotion | 1 | 2 | 3 |
| Sound design (breathing, foley, vocalizations) | 3 | 5 | 8 |
| Lip sync controller (phoneme→viseme) | 3 | 5 | 8 |
| useCharacterAudio.ts | 2 | 3 | 5 |
| **TOTAL** | **21h** | **35h** | **56h** |

**Likely overestimated:** EffectComposer already handles bloom, color grading, particles. Shaders need new code but build on existing infrastructure.

---

### Phase 11B: Unity Premium Renderer

| Task | Proto | Personal | Production |
|------|-------|---------|-----------|
| Unity project setup + UniVRM | 4 | 6 | 10 |
| WaifuBridge.cs (postMessage API) | 4 | 6 | 10 |
| AvatarController.cs | 4 | 6 | 10 |
| UnityViewer.tsx (react-unity-webgl) | 3 | 5 | 8 |
| Room environment (furniture, colliders) | 6 | 10 | 16 |
| Click-to-sit IK | 3 | 5 | 8 |
| Cloth simulation | 2 | 4 | 6 |
| viewerStore Unity dispatch path | 2 | 3 | 5 |
| Renderer toggle UI | 1 | 2 | 3 |
| Lazy loading + fallback | 2 | 3 | 5 |
| Testing + polish | 3 | 6 | 10 |
| **TOTAL** | **34h** | **56h** | **91h** |

**Biggest risk:** Unity WebGL learning curve if Chris hasn't used Unity recently. Could add 10-20h.

---

### Phase 12-P6: Webcam Face/Hand Tracking

| Task | Proto | Personal | Production |
|------|-------|---------|-----------|
| MediaPipe Face Landmarker setup | 2 | 3 | 5 |
| Kalidokit integration | 2 | 3 | 5 |
| useFaceTracking.ts | 3 | 5 | 8 |
| Hand tracking (MediaPipe Hands) | 2 | 4 | 6 |
| Mirror Mode toggle + blend | 1 | 2 | 3 |
| Performance optimization | 1 | 2 | 4 |
| **TOTAL** | **11h** | **19h** | **31h** |

---

### Phase 13D: Extension API + Marketplace

| Task | Proto | Personal | Production |
|------|-------|---------|-----------|
| Extension loading framework | 6 | 10 | 18 |
| Sandboxing + security | 3 | 6 | 12 |
| Extension type definitions | 2 | 4 | 6 |
| Marketplace backend (upload, list, purchase) | 4 | 8 | 14 |
| Marketplace frontend | 4 | 8 | 14 |
| Revenue sharing logic | 1 | 3 | 6 |
| Developer documentation | 2 | 4 | 8 |
| **TOTAL** | **22h** | **43h** | **78h** |

---

## Grand Total Estimates

### Prototype (everything works, rough edges OK)

| Phase | Hours | Days (6h/day) |
|-------|-------|--------------|
| Phase 1 (Proactive) | 11 | 1.8 |
| Phase 3 (Advisor) | 0.9 | 0.2 |
| Phase 6 (Edge fixes) | 0.8 | 0.1 |
| Phase 9 (Adaptive) | 12.5 | 2.1 |
| Phase 13A (Bond) | 19 | 3.2 |
| Phase 12-P1 (Alive) | 11 | 1.8 |
| Phase 13B (Journal) | 8.5 | 1.4 |
| Phase 12-P2 (Emotion) | 10.5 | 1.8 |
| Phase 12-P3 (Touch+Camera) | 11 | 1.8 |
| Phase 13C (Gallery) | 10 | 1.7 |
| Phase 11A (Environment) | 14 | 2.3 |
| Phase 12-P4+P5 (Shaders+Sound) | 21 | 3.5 |
| Phase 11B (Unity) | 34 | 5.7 |
| Phase 12-P6 (Webcam) | 11 | 1.8 |
| Phase 13D (Extensions) | 22 | 3.7 |
| **GRAND TOTAL** | **197h** | **33 days** |

### Personal-Use (solid daily driver)

| Same phases | **329h** | **55 days (~11 weeks)** |

### Production-Ready (edge cases, tested, documented)

| Same phases | **549h** | **92 days (~18 weeks)** |

### Summary Table

| Tier | Optimistic | Realistic | Pessimistic |
|------|-----------|-----------|-------------|
| **Prototype** | 170h (28d) | 197h (33d) | 250h (42d) |
| **Personal-use** | 280h (47d) | 329h (55d) | 420h (70d) |
| **Production-ready** | 460h (77d) | 549h (92d) | 700h (117d) |

---

## Assumptions

1. AI code generation handles 40-60% of boilerplate (backend endpoints, React components, tests)
2. Chris is proficient with the codebase (no ramp-up time)
3. Blender animation work is done by Chris (not outsourced)
4. No major architectural refactors needed (builds on existing infrastructure)
5. LLM-generated story scenes need only light editing (not full creative writing from scratch)
6. Unity experience exists at basic level (if not, add 15-20h learning curve)

## Biggest Time Risks

1. **Story scenes for 13 characters** (Phase 13A): Writing 39 unique story scenes could take 2× if done manually. Mitigation: LLM drafts, Chris edits.
2. **Shader development** (Phase 12-P4): GLSL iteration cycles are slow (change → refresh → evaluate). Visual tuning is unpredictable.
3. **Unity WebGL** (Phase 11B): If unfamiliar with Unity, the learning curve adds 50-100% overhead.
4. **Blender animation baking** (Phase 11A): If Chris hasn't rigged/animated in Blender, this could 3× the estimate.
5. **Extension API sandboxing** (Phase 13D): Security concerns could spiral. Prototype without sandboxing first.

## Cut These to Reduce Time by 50%

| Cut | Saves | Impact |
|-----|-------|--------|
| Phase 11B (Unity renderer) | 34-91h | Lose premium mode; Three.js is sufficient for now |
| Phase 13D (Extension API) | 22-78h | Defer ecosystem play; build later |
| Phase 12-P6 (Webcam tracking) | 11-31h | Defer VTuber mode; nice-to-have |
| Phase 12-P4 shaders (keep P5 sound) | 12-35h | Use default VRM materials; add shaders later |
| Phase 11A Blender animations | 6-16h | Use existing animation clips; skip custom poses |
| **Total saved** | **85-251h** | Reduces to **~112-298h (19-50 days)** |

**Minimum viable path (prototype in ~19 days):**
Phase 1 (running) + 3 + 6 + 9 + 13A + 12-P1 + 13B + 12-P2 + 12-P3 + 12-P5 = **112h (~19 days)**

## Likely Over vs Under-estimated

| Phase | Likely Over/Under | Why |
|-------|------------------|-----|
| Phase 6 (Edge fixes) | OVER | These are 5-line fixes; will take <1h total |
| Phase 9 (Adaptive) | ACCURATE | Reflection engine is novel; debugging LLM prompts takes time |
| Phase 13A (Bond) | UNDER for story scenes | Writing 39 good story scenes is creative work; hard to rush |
| Phase 12-P1 (Alive) | OVER | Procedural animation is straightforward math; most time is tuning |
| Phase 12-P4 (Shaders) | UNDER | Shader debugging is notoriously unpredictable |
| Phase 11B (Unity) | UNDER if no Unity experience | Learning curve is real; WebGL quirks add friction |
| Phase 13C (Gallery) | OVER | Basic gallery is simple CRUD; polish takes longer |

**The Complete Retention Loop:**
```
User chats → engagement signals + bond XP
  → bond level increases → unlock story scene (dopamine hit)
  → adaptive AI learns preferences (responses improve)
  → character writes journal (life between sessions)
  → proactive message brings user back next day
  → give gift (daily loop) → character reacts with personality
  → bond level increases → cycle accelerates
  → at level 100: covenant scene → permanent emotional investment
  → user has unique, personalized companion no other platform can replicate
```

---
---

# Phase 14: Research Cycle 2 — Deep-Dive Remaining 16 Sources

## Context

Cycle 1 deeply researched 18 of 34 identified sources (top 16 + 2 wildcards). User reviewed results and decided ALL 34 sources are valuable. This phase deep-dives the remaining 16 sources that weren't covered in Cycle 1.

**Research file:** `docs/design/competitive-research-2026-03-18.md` (full source list, rubric, scores, Cycle 1 findings)

## When to Execute

After implementing Phases 1-13 (or after the minimum viable path is shipped). This is a **research → plan → implement** cycle:

1. **Research:** Deep-dive 16 remaining sources using same methodology
2. **Plan:** Extract new features, compare to what we built, identify gaps
3. **Implement:** Add new features from Cycle 2 findings to the roadmap

## Sources to Research in Cycle 2

| # | Source | Score | Focus Area |
|---|--------|-------|-----------|
| 4 | **AI Shoujo** | 36 | How sandbox AI autonomous behavior works (build, cook, explore) |
| 5 | **Honey Select 2** | 32 | IK/FK posing system, Studio mode photo workflow |
| 6 | **COM3D2** | 33 | Maid management game loop, daily schedule system |
| 8 | **Genshin Impact** | 35 | Character showcase UI, how to present characters beautifully |
| 9 | **Nikke** | 33 | Live2D/Spine animation quality, character detail cards |
| 15 | **Janitor AI** | 35 | Content freedom as growth driver, community moderation model |
| 16 | **DreamGen** | 33 | Scenario Codex (plot/character/lore management) |
| 18 | **Crushon.ai** | 31 | Target Play gamification, chat-as-game mechanics |
| 19 | **NovelAI** | 33 | Specialized story models, lorebook implementation depth |
| 20 | **Chai** | 32 | RLHF optimization technique (30% D30 improvement) |
| 23 | **VSeeFace** | 29 | Free tier positioning, open-source VTuber economics |
| 24 | **Warudo** | 27 | Premium 3D features, what justifies premium pricing |
| 25 | **Live3D** | 30 | Mid-market positioning, accessibility vs power user balance |
| 28 | **VRoid Hub** | 32 | Model sharing platform dynamics, community curation |
| 29 | **Booth.pm** | 29 | Asset marketplace economics, creator earnings |
| 33 | **Gatebox** | 31 | Physical device interaction patterns, emotional dependency research |

## Research Questions per Source

For each source, answer:
1. What's the single best feature we haven't considered yet?
2. What retention mechanic do they use that we're missing?
3. What's their biggest UX innovation?
4. What failure mode should we avoid?
5. What could we build in <1 day that mimics their best feature?

## Expected Output

- New features added to master feature list (F25-F40+)
- Updated rubric with any new criteria discovered
- Revised effort estimates based on implementation experience from Cycle 1
- Updated competitive positioning based on market changes

## Effort Estimate

| Tier | Hours |
|------|-------|
| Research (web search + analysis) | 8-12h |
| Feature extraction + planning | 4-6h |
| Plan update | 2-3h |
| **Total** | **14-21h (2-3 days)** |

---

## Research Process Template (Reuse for Future Cycles)

```
CYCLE N RESEARCH PROTOCOL:
1. Identify sources (web search across categories)
2. Score with rubric (Relevance × Popularity × Insights × Innovation × Ecosystem)
3. Select top set (cutoff at score ≥ threshold)
4. Deep-research each (user reviews, feature lists, architecture, community feedback)
5. Extract features (what they do that we don't)
6. Prioritize features (impact × effort matrix)
7. Add to plan (append, never overwrite)
8. Implement highest-priority features
9. Repeat with remaining sources
```

This cycle can repeat indefinitely as new competitors emerge or existing ones evolve.
