# Resume: Waifu-RT3D — Cycle 2 Research + Expansion Session (Mar 21, 2026)

## WHO I AM

I'm Chris. Sole developer of Waifu-RT3D, a commercial AI companion platform with 3D anime avatars + local LLM integration. I run 3 flagship AI subscriptions (Anthropic Opus, OpenAI, Google) in parallel. AI-assisted implementation is ~12x faster than traditional estimates. Desktop-only app.

**3 dev machines:** Mac M2 Pro (32GB), Win RTX 5080 (16GB), Win RTX 3070 (8GB). M2 Pro is the GPU floor.

## WHAT HAPPENED THIS SESSION

### Implementation (3 features, ~45min)
| Commit | Phase | What | Time |
|--------|-------|------|------|
| `466f0e9` | 12-P5 | Procedural character audio engine (breathing, vocalizations, touch sounds) | ~15min |
| `ac316e6` | 11A | Time-of-day lighting + procedural poses + scene context injection | ~20min |
| `ed6a7f0` + `4b932c7` | 3B | Hair anisotropic + eye sparkle specialty shaders + time uniform fix | ~10min |

### Research (Phase 14A done, 14B agents done)
| Commit | Phase | What |
|--------|-------|------|
| `4d5409c` | 14A | 24 mature/18+ sources ranked → `docs/design/competitive-research-cycle-2-sources-2026-03-21.md` |

3 research agents completed deep-dives on top 12 sources. **Outputs may be in /tmp — if not, re-run agents.**

### Also Fixed
- SessionEnd hook error (prompt → command type)
- embeddinggemma benchmark (MLX format issue discovered)

## WHAT TO DO NOW — Multi-Session Workflow

### SESSION 2 (HIGH effort — Research Enrichment)
Set effort to HIGH before starting. Read `project_session_brief_research_enrichment.md` for full details.

1. **Enrich the research doc** — expand `competitive-research-cycle-2-deep-dives-2026-03-21.md` to 3-4x length with community quotes, technical architecture, deeper analysis
2. **Create interactive HTML dashboard** — `docs/design/research-dashboard.html` with dark theme, radar charts, filterable cards, expandable sections
3. **Create "Science World" learning experience** — `docs/design/research-learning-experience.html` with interactive modules (Content Gating Lab, Memory Architecture, Retention Workshop, etc.)
4. **User persona deep-dive** — search Reddit r/waifuism, r/VirtualYouTubers, anime Discord for what target users actually want
5. **UX friction audit** — list every confusion point in the app
6. **Gap analysis** — what competitors have that we don't, what we have that they don't

### SESSION 3 (EXTRA HIGH effort — Planning Enrichment)
Set effort to EXTRA HIGH.

1. **Revise plan** — enrich `/Users/chris/.claude/plans/cached-imagining-cocke.md` with code sketches, dependency maps, risk analysis
2. **User flow diagrams** — content gating, memory inspector, bond progression
3. **Effort recalibration** — use actual 1/12-1/42x ratios
4. **Milestone definitions** — acceptance criteria for each feature
5. **Testing strategy** — what proves each feature works?

### SESSION 4+ (MEDIUM/HIGH effort — Implementation)
Execute the enriched plan using `/go`.

### THEN (Phase 15 — Embedding)
- **ISSUE**: embeddinggemma-300m is MLX format, won't load with standard transformers
- **Fix**: Download standard PyTorch version from HuggingFace (`google/embeddinggemma-300m`) OR install `mlx` packages
- **Dimension**: 768 (not 256 as initially estimated). sqlite-vec needs FLOAT[768]
- **Task-specific prompts**: Use `"task: search result | query: "` prefix for retrieval queries
- Benchmark AFTER fixing format, then decide: replace MiniLM everywhere vs dual-provider

### THEN (Phase 18 — Content Gating)
Port from AnimeGirly:
- `frontends/girly/src/types/content.ts` → `backend/content/types.py`
- `frontends/girly/src/services/contentGatingService.ts` → `backend/content/gating.py`
- `frontends/girly/src/services/intimacyTrackingService.ts` → `backend/content/intimacy.py`

## KEY RESEARCH FINDINGS

1. **Auto-summarization at context boundaries** — #1 missing feature across ALL platforms
2. **Janitor AI 70% female users** — narrative depth > cosmetics for retention
3. **SpicyChat mode switching** (flirty→romantic→explicit) — content escalation UX to adopt
4. **Chub recursive lorebook scanning** — missing from our lore matcher, breaks imported cards
5. **NovelAI generation presets** — shareable LLM sampling configs = free engagement loop
6. **In-chat model hot-swap** (Crushon) — fits our link_manager multi-machine architecture

## PLAN FILE

`/Users/chris/.claude/plans/cached-imagining-cocke.md` — Phases 14A through 20:
- 14A/B: Research (14A done, 14B assembling)
- 15: embeddinggemma integration
- 16: AI model ecosystem analysis
- 17: Animation library + smart sequencing
- 18: Content gating port
- 19: On-device learning
- 20: Model database + README

## KEY RULES

- **Resume = implement immediately.** Use `/go` to execute.
- **Desktop-only app** — no mobile
- **Use `.venv/bin/python`** for ALL Python commands
- **Commit after each task** with phase reference
- **Run `/checkpoint`** after completing phases
- **NEVER add "Co-Authored-By: Claude"** to commits
- **Animation preference**: Build MULTIPLE systems and compare, no manual downloads
- **Content filter**: User wants fully unrestricted 18+ option with age gate

## ARCHITECTURE

| Component | Stack | Key Files |
|-----------|-------|-----------|
| Backend | FastAPI, SQLite v56, Python 3.14 | `backend/server.py` (~13K lines) |
| Frontend | React 19, Zustand, Vite | `frontends/sakura/src/` |
| 3D Viewer | Three.js, VRM (iframe) | `frontends/shared/viewer/viewer.html` (~7.3K lines) |
| Memory | sqlite-vec, all-MiniLM-L6-v2 (384-dim) | `backend/memory/tiered_memory.py` |
| Adaptive | Reflector + Tuner + Journal | `backend/adaptive/` |
| Content | 5-level prompt injection (needs upgrade) | `server.py:1487` |
| Tests | 529 pytest, tsc clean | `backend/tests/` |

**13 characters, 18 themes, schema v56, 529 tests.**
