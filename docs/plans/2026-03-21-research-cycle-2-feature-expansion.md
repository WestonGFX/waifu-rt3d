# Research Cycle 2 + AI Model Ecosystem + Deep Feature Expansion

## Context

All 14 MVP phases are complete (12-P5, 11A, 3B just shipped). The app is ~90% feature-complete. But the user correctly identifies that the **19-day plan was done in ~1.25 days** — meaning we have massive capacity for a new research-driven expansion cycle.

The user wants:
1. Deep competitive research focused on **mature/18+ content** (Steam games, Reddit, AI companion apps)
2. **embeddinggemma-300m** integration for semantic search everywhere
3. AI model ecosystem exploration (animation generation, emotion, physics)
4. Massive animation library + smart sequencing
5. On-device privacy-first user learning
6. Unrestricted content filter rework (18+ with age gate)
7. Port AnimeGirly's battle-tested content gating system + 44-model database

**Existing research**: Cycle 1 covered 18/34 sources. 24 features extracted. Cycle 2 has 16 sources identified but not researched.

**Key asset**: AnimeGirly project (`/Users/chris/code/AnimeGirly/`) has production-ready content gating types/services, 44 LLM models across 6 tiers, and 19 TTS/STT models.

---

## Phase 14A: Pre-Research Source Collection (24 Ranked Sources)

**Goal**: Web-search to collect and rank 24 best competitive sources with a diverse category mix.

### Source Category Targets (24 ALL mature/18+)
- 8x Steam adult/18+ games (AI Shoujo, Honey Select 2, COM3D2, Koikatsu Party mods, HS2 AI, Custom Maid 3D2, + 2 discovered)
- 6x NSFW AI companion apps (Janitor AI, DreamGen, Crushon.ai, NovelAI, Chai, + 1 discovered)
- 4x NSFW community/marketplace (Booth.pm, Chub.ai NSFW, r/CharacterAI_NSFW, r/SillyTavern NSFW)
- 3x Adult VN/dating sims (top-reviewed on Steam)
- 3x NEW mature sources discovered during web search

### Cycle 3 Queue (8-12 additional sources, deferred to future session)
- Broader sources (VTuber tools, general AI companions, non-adult games)
- Discovered during Cycle 2 research but not prioritized for immediate deep-dive
- Researched AFTER Cycle 2 is fully: researched, planned, and implemented

### Tracking Format (per source)
```
| # | Source | Category | Killer Feature | Pros | Cons | Why Selected | Score /60 |
```

### Scoring Rubric (6 criteria, max 60)
| Criterion | Weight | Measures |
|-----------|--------|----------|
| Relevance | 10 | Direct similarity to waifu-rt3d |
| Popularity | 10 | User base, community size |
| Actionable Insights | 10 | Concrete extractable features |
| Innovation | 10 | Novel approaches we haven't considered |
| Ecosystem Health | 10 | Active dev, modding, community |
| Content Maturity | 10 | How well they handle 18+ gating, privacy, safety |

### Output
- `docs/design/competitive-research-cycle-2-sources-2026-03-21.md` — permanent ranked source file

### Effort: ~3-4h (web search + scoring + formatting)

---

## Phase 14B: Research Cycle 2A (Top 12 Deep-Dives)

**Goal**: Deep research on the top 12 sources (by score). Extract actionable features.

### Per-Source Protocol
1. Feature extraction — every feature relevant to waifu-rt3d
2. Content handling analysis — how do they handle NSFW? Age gates? Provider ceilings?
3. Retention mechanics — what keeps users returning?
4. Technical architecture (where discoverable)
5. Community sentiment — Steam reviews, Reddit, Discord
6. One concrete actionable takeaway with effort estimate

### Research Questions
1. What's the single best feature we haven't considered?
2. What retention mechanic are we missing?
3. What's their biggest UX innovation?
4. What failure mode should we avoid?
5. What could we build in <1 day that mimics their best feature?
6. How do they handle content escalation/de-escalation?
7. What's their approach to local/private AI processing?

### Output
- Feature extraction appendix added to the source file
- New actionable features merged into master feature list
- Note: **Cycle 2B (remaining 12 sources) deferred to next session** — research doc includes "Cycle 2B: Queued Sources" section

### Effort: ~6-8h

---

## Phase 15: embeddinggemma-300m Integration

**Goal**: Replace/augment all-MiniLM-L6-v2 with embeddinggemma for better semantic capabilities.

### Model Status
- **Downloaded**: `~/.cache/lm-studio/models/mlx-community/embeddinggemma-300m-qat-q8_0-unquantized-bf16/`
- **Files**: model.safetensors (587MB), tokenizer, sentence_transformers config
- **Current model**: all-MiniLM-L6-v2 (22M params, 384-dim, ~5ms/embed)
- **embeddinggemma**: 300M params, needs dimension check from config.json

### 15A: Embedding Provider Abstraction (~2h)
**Create**: `backend/embeddings/provider.py`
```python
class EmbeddingProvider(Protocol):
    def embed(self, text: str) -> list[float]: ...
    def embed_batch(self, texts: list[str]) -> list[list[float]]: ...
    @property
    def dimension(self) -> int: ...

class MiniLMProvider:    # 384-dim, fast, current default
class GemmaProvider:     # embeddinggemma-300m, better quality
```
- Benchmark both on M2 Pro — if embeddinggemma < 50ms, use it everywhere; otherwise use MiniLM for real-time, Gemma for batch

**Modify**: `backend/memory/tiered_memory.py`
- Replace hardcoded `EMBEDDING_DIM = 384` (line 39) and `SentenceTransformer("all-MiniLM-L6-v2")` (line 563)
- Accept `EmbeddingProvider` via constructor injection

### 15B: Semantic Lore Matching (~3h)
**Modify**: `backend/lore/matcher.py`
- Current: `keyword.lower() in text.lower()` (substring matching, line ~85)
- Add: `match_lore_semantic()` — embed user text, compare against pre-embedded lore entries
- Hybrid: keyword match OR cosine similarity > 0.7
- New table: `lore_embeddings` (lore_entry_id FK, embedding BLOB, model TEXT)
- Pre-embed all lore content on migration (schema v57)

### 15C: Importance Scorer Enhancement (~1.5h)
**Modify**: `backend/llm/importance_scorer.py`
- Replace `_keyword_overlap()` Jaccard overlap (line 58) with cosine similarity
- Cache embeddings from memory system to avoid re-computing

### 15D: Content Filter Semantic Validation (~2h)
**Create**: `backend/content/semantic_filter.py`
- Embed LLM response, compare against "boundary" reference vectors per content level
- Only active when content_filter_level >= 1 (skip in NSFW mode)

### Schema v57
- `lore_embeddings` table
- `embedding_model` column on `memories` table
- Dual vector table approach if dimension differs (search both, merge results)

### Effort: ~8-10h total

---

## Phase 16: AI Model Ecosystem Analysis

**Goal**: Research document cataloging available AI models for animation, emotion, physics, and conversation.

### Categories
| Category | Key Models to Research | Use Case |
|----------|----------------------|----------|
| Animation Generation | MDM, MotionLCM (already stubbed), MoMask, MotionGPT, T2M-GPT | Text-to-motion for VRM |
| Speech Emotion Recognition | Wav2Vec2-Emotion, HuBERT-based | Detect user mood from voice |
| Conversation Quality | DreamGen OPUS, Psyfighter, Fimbulvetr, abliterated models | Better RP capabilities |
| Physics/Cloth | Verlet integration, spring bone extensions | Real-time cloth sim |
| Personalization | LoRA fine-tuning feasibility, prompt tuning | On-device adaptation |

### Output
- `docs/design/ai-model-ecosystem-analysis-2026-03-21.md`
- Includes: model name, params, hardware reqs, quality assessment, recommendation

### Effort: ~4-6h

---

## Phase 17: Animation Library + Smart Sequencing

**Goal**: Expand from 45 animations to 200+ with intelligent chaining.

### 17A: Multi-Source Animation Library (~6h)
Build MULTIPLE animation generation/sourcing systems, then evaluate via automated + manual testing:

**System 1: AI-Generated (MotionLCM/MDM)** — generate unique animations on the GPU machine
**System 2: Procedural v2** — expand the existing procedural bone-rotation system from 45 to 200+ variants
**System 3: Open-Source Packs** — research free animation packs (CMU MoCap, 100STYLE, Bandai Namco, Ubisoft La Forge — no account needed, programmatic download)
**System 4: Mixamo API** — if user's Adobe subscription allows API access, batch-download via script (NOT manual)

Research: search for free/open VRM animation libraries, BVH databases, and VRMA collections.
Each system produces GLB/BVH clips → existing retargeting pipeline.
`animation_library.json` manifest with metadata per clip.
Evaluate: code tests (clip loads, duration valid, bones mapped) + agent automation + manual visual review.

### 17B: AnimationSequencer Class (~4h)
- New class in viewer.html
- Emotion-to-animation mapping (joy -> [celebrate, dance], sadness -> [droop, sigh])
- Transition graph (which animations can follow which)
- Context-aware selection (time-of-day, conversation mood, pose state)

### 17C: Animation State Machine v2 (~2h)
- Expand from 5 states to 8: add `sequence`, `transition`, `emote`
- Sequence state: plays animation chains
- Transition: dedicated cross-fade state

### 17D: MotionLCM Wire-Up (~4h)
- Already stubbed at `backend/motion/motion_server.py` lines 237-241
- Wire the runner, add WebSocket endpoint `/ws/motion`
- Cache generated clips, fallback to procedural

### Effort: ~14h total

---

## Phase 18: Content Gating Port from AnimeGirly

**Goal**: Replace the 5-level prompt injection with a real enforcement system.

### Source Files (AnimeGirly)
- `frontends/girly/src/types/content.ts` — ContentRatingLevel, IntimacyState, PhysicalState, ContentGateConfig
- `frontends/girly/src/services/contentGatingService.ts` — resolveEffectiveContentCeiling(), provider-aware caps
- `frontends/girly/src/services/intimacyTrackingService.ts` — 0-100 intimacy with regex signal detection
- `frontends/girly/src/services/contentPromptService.ts` — granular per-level prompt directives

### 18A: Backend Types + Schema (~3h)
- **Create**: `backend/content/` module
  - `types.py` — Python dataclasses for ContentRatingLevel (general/edgy/mature/explicit), IntimacyState, PhysicalState, ContentGateConfig
  - `gating.py` — resolveEffectiveContentCeiling(), isContentAllowed()
  - `intimacy.py` — evaluateIntimacyShift() with regex patterns
  - `prompts.py` — buildContentDirectiveBlock() (granular, not the current 5 strings)
- Schema v58: `content_settings` table, `intimacy_states` table

### 18B: Wire into Chat Pipeline (~3h)
- Replace `_get_content_filter_injection()` (server.py line 1487) with new system
- Add intimacy evaluation per chat turn
- Provider-aware ceiling: cloud APIs auto-cap at 'mature'

### 18C: Frontend Settings UI (~4h)
- "Content & Privacy" settings section
- Age verification gate (one-time checkbox + confirmation)
- Content ceiling selector (general/edgy/mature/explicit)
- Per-character overrides
- Password lock for ceiling changes

### 18D: Migration (~1h)
- Map existing levels: -1→explicit, 0→mature, 1→edgy, 2→general, 3→general+locked

### Effort: ~12h total

---

## Phase 19: On-Device Learning (Privacy-First)

**Goal**: Continuous user personalization without batch-50 reflection gates.

### 19A: Continuous Signal Collection (~3h)
- **Create**: `backend/adaptive/signals.py`
- Per-turn lightweight signals (no LLM call):
  - Message length trend, response time, emoji frequency
  - Topic embedding drift (via embeddinggemma)
  - Sentiment from intimacy regex patterns
- Store in `engagement_signals` table

### 19B: Rolling Preference Learning (~3h)
- Replace batch-50 gate with rolling window + exponential decay
- New preferences: pacing, time-of-day patterns, escalation comfort, vocabulary complexity
- `preference_history` table for trend analysis

### 19C: Behavior Adaptation (~3h)
- **Create**: `backend/adaptive/behavior.py`
- Generates "behavior modifier" dict from all signals
- Self-correcting: reverts changes that drop engagement

### 19D: Privacy Controls (~1.5h)
- `/api/privacy/export` — download all personalization data
- `/api/privacy/purge` — delete all learning data
- Per-feature opt-out toggles

### Effort: ~10h total

---

## Phase 20: Model Database + README Updates

### 20A: Port Model Catalog (~2h)
- `backend/data/model_catalog.json` — 44 LLMs + 19 TTS/STT from AnimeGirly research
- Extend `backend/llm/link_manager.py` for hardware-aware recommendations
- Model recommendation widget in LLM setup wizard

### 20B: Documentation Updates (~2h)
- README.md: update schema badge (v52→v58), add Content Gating section, update Features list, add AI Model section
- Create master feature checklist: `docs/FEATURES.md` tracking all 24+ extracted features
- CURRENT_STATUS.md: reflect new phases

### Effort: ~4h total

---

## Execution Sequence

```
WEEK 1 (Research):
  Phase 14A: Pre-research source collection (24 ranked)
  Phase 14B: Cycle 2A deep-dives (top 12)
  Phase 16:  AI model ecosystem analysis (parallel with 14B)

WEEK 2 (Foundation):
  Phase 15:  embeddinggemma integration (provider abstraction → lore → scorer → filter)
  Phase 20:  Model database port + README updates (parallel, quick)

WEEK 3 (Content + Animation):
  Phase 18:  Content gating port (types → pipeline → UI → migration)
  Phase 17:  Animation library expansion (parallel: batch download + sequencer)

WEEK 4 (Intelligence):
  Phase 19:  On-device learning (signals → preferences → behavior → privacy)

FUTURE SESSION:
  Phase 14C: Research Cycle 2B (remaining 12 sources)
  Phase 14D: Self-assessment ("what needs work?") + 12-24 more improvements
```

---

## Verification

| Phase | How to Verify |
|-------|--------------|
| 14A/B | Research doc on disk, 24 sources scored, 12 deeply analyzed |
| 15 | `pytest` passes, semantic lore matches work, embedding benchmark < 100ms |
| 16 | Analysis doc on disk with model recommendations per hardware tier |
| 17 | 50+ animations load in viewer, sequencer plays emotion-appropriate chains |
| 18 | Content ceiling enforced E2E, age gate works, intimacy tracks per-turn |
| 19 | Signals collected per-turn, preferences decay over time, privacy export works |
| 20 | Model catalog loads, README reflects current state, FEATURES.md exists |

**Per-phase smoke tests:**
```bash
.venv/bin/python -m pytest backend/tests/ -q --tb=line
cd frontends/sakura && npx tsc --project tsconfig.app.json --noEmit
```

---

## Critical Files

| File | Phase | Change |
|------|-------|--------|
| `backend/memory/tiered_memory.py` (line 39, 551-563) | 15A | Replace hardcoded MiniLM with provider |
| `backend/lore/matcher.py` (line ~85) | 15B | Add semantic matching alongside keyword |
| `backend/llm/importance_scorer.py` (line 58) | 15C | Replace Jaccard with cosine similarity |
| `backend/server.py` (line 1487) | 18B | Replace `_get_content_filter_injection()` |
| `backend/adaptive/reflector.py` | 19A/B | Wire continuous signals into reflection |
| `frontends/shared/viewer/viewer.html` | 17B/C | AnimationSequencer + state machine v2 |
| `frontends/girly/src/services/contentGatingService.ts` | 18A | Source for Python port |
| `frontends/girly/src/types/content.ts` | 18A | Source for Python type definitions |

---

## Reusable Existing Code

| Source | Reuse In | What |
|--------|----------|------|
| AnimeGirly `contentGatingService.ts` | Phase 18 | resolveEffectiveContentCeiling(), provider caps |
| AnimeGirly `content.ts` types | Phase 18 | ContentRatingLevel, IntimacyState, PhysicalState |
| AnimeGirly `model-database.md` | Phase 20 | 44 LLMs + 19 TTS/STT catalogs |
| AnimeGirly intimacy regex patterns | Phase 18/19 | Signal detection for content + learning |
| Existing `MIXAMO_BONE_MAP` in viewer.html | Phase 17 | Retarget downloaded animations |
| Existing `motion_server.py` stub (line 237) | Phase 17D | MotionLCM integration point |
| Existing `adaptive/reflector.py` | Phase 19 | Extend, don't replace |
