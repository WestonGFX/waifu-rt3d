# AIE Architecture Analysis — 2026-05-25

**Why:** User asked "is there a better way to use/implement AIE 12 bg modules?" in session 46.
**Session 47:** `aie_enabled` master kill-flag shipped (default OFF).
**This analysis:** Maps all 12 modules' actual contribution per token so we can decide architecture direction.

## Module Table

| # | Module (file) | What it does | Call pattern | Cost per turn | Tests | v1-Lite Value |
|---|---------------|-------------|--------------|--------------|-------|----------------|
| 1 | `signals.py` | Extracts emoji/sentiment/question count, writes to `engagement_signals` | Per-turn always | 1 DB write + regex (~<1ms) | 37 | HIGH — data feed for everything |
| 2 | `context_classifier.py` | Rule-based → 7 context types (casual_chat, emotional_support, etc.) | Per-turn always (inside signals) | Pure Python, 0 DB | 56 | HIGH — drives param_tuner |
| 3 | `param_tuner.py` | Maps context type → temperature/top_p/repetition_penalty preset | Per-turn, dynamic params | Pure Python, 1 DB read (10 signals) | subset | HIGH — only module with direct LLM quality impact |
| 4 | `behavior.py` | Engagement signals → response-length bias, energy bias, pacing | Pre-turn system prompt injection | 2-3 DB reads | 36 | MED — bias floats, not precise instructions |
| 5 | `tuner.py` | `user_profiles` pref_* → natural-language instructions ("be playful") | Pre-turn system prompt injection | 1 DB SELECT | subset | MED — only useful after reflector runs (≥50 msgs) |
| 6 | `reflector.py` | Scores engagement; every 50 msgs → LLM extracts preferences | Post-turn check; LLM every 50 msgs | Per-turn: 1 DB SELECT. LLM: ~500-800→200 tokens | 56 | HIGH — the only actual learning loop |
| 7 | `topic_graph.py` | Keyword/bigram extraction → `topic_tracking` table | Per-turn inside signals | 1 DB read + 1 UPSERT | 19 | MED — feeds trend_analyzer |
| 8 | `trend_analyzer.py` | Reads `preference_history` → EMA velocity → trend summary | On-demand REST endpoint ONLY | 0 per-turn | 20 | MED — already lazy, no rethink needed |
| 9 | `milestones.py` (AIE) | Detects 10 relationship milestones from DB counts | On-demand REST endpoint ONLY | 0 per-turn | subset | LOW — duplicates `backend/bond/milestones.py` |
| 10 | `memory_behavior.py` | RAG memory hits → 4 behavioral channels → system prompt block | Pre-turn, inside context_assembler | Pure Python (0 extra DB) | 15 | HIGH — turns RAG into emotionally intelligent instructions |
| 11 | `personalization_gate.py` | Filters RAG hits: relevance, recency, sensitivity (blocks trauma unless user raises it) | Pre-turn, inside context_assembler | Pure Python, 0 DB | 38 | HIGH — safety-critical; blocks trauma surfacing |
| 12 | `self_critique.py` | When engagement drops, LLM suggests pref_* nudges | On-demand REST ONLY | 0 per-turn | ~15 | MED — already lazy |

### Extra modules in `backend/adaptive/` (not in the "12"):
- `post_scene.py` — Post-intimate check-in, conditional on arousal threshold. MED.
- `journal.py` — LLM diary entries between sessions, lazy. HIGH emotional intimacy.
- `user_model.py` — Communication style metrics, not wired per-turn. LOW as-is.

## Per-Turn Hot Path (aie_enabled=True)

```
Pre-LLM call (server.py:4443-4469):
  tuner.load_user_profile()            → 1 DB SELECT
  behavior.compute_behavior_modifiers() → 2-3 DB reads
  [system_prompt +50-200 tokens]

context_assembler.py:
  personalization_gate.filter_memories_for_context() → 0 DB (pure Python)
  memory_behavior.derive_behavior_from_memories()    → 0 DB (pure Python)
  [system_prompt +50-150 tokens]

Dynamic params (server.py:4637-4668):
  signals.compute_sentiment()           → 0 DB
  context_classifier.classify_context() → 0 DB
  signals.get_recent_signals()          → 1 DB SELECT (limit=10)
  param_tuner.get_tuned_params()        → 0 DB

Post-LLM (server.py:4753-4861):
  reflector.compute_engagement_score()  → 0 DB
  reflector.should_reflect()            → 1 DB SELECT
  signals.collect_turn_signals()        → 0 DB
  signals.save_signals()                → 1-2 DB writes

TOTAL: ~8-10 DB ops, ~100-350 tokens added to system prompt per turn
```

## Architecture Options

### Option A — Collapse into ONE context shaper
Merge signals + classifier + param_tuner + behavior + tuner into one function.
- **Pros:** Batch 8-10 fragmented DB reads into 2 queries.
- **Cons:** Expensive surgery on 17K-line server.py. reflector/self_critique don't fit. personalization_gate + memory_behavior live in context_assembler at a different call site.
- **Verdict:** Do only if rewriting the whole context pipeline.

### Option B — AIE Lite Mode (RECOMMENDED)
Two-tier flag system:
1. `aie_enabled: true` — everything as today
2. `aie_lite_mode: true` (new) — only: classifier + param_tuner + personalization_gate + memory_behavior

Lite tier costs: 0 extra DB reads, 50-150 token overhead, 0 LLM calls.

| Priority | Module | Lite? | Reason |
|----------|--------|-------|--------|
| 1 | context_classifier + param_tuner | YES | Zero token cost, direct LLM quality |
| 2 | personalization_gate | YES | Safety (trauma gating), pure Python |
| 3 | memory_behavior | YES | Converts RAG into character instructions |
| 4 | reflector | NO (Lite) | Expensive LLM call; full AIE only |
| 5 | tuner + behavior | NO (Lite) | Only useful after 50 msgs of history |
| 6 | signals + topic_graph | YES (infra) | Cheap; needed for reflector to work |
| 7-9 | trend/critique/milestones | Already lazy, no change |
| 10 | AIE milestones.py | DROP | Duplicates bond/milestones.py |

### Option C — Cache tuner + behavior results
Cache `tuner.load_user_profile()` and `behavior.compute_behavior_modifiers()` with 5-minute TTL keyed by `char_id`. Reduces full-AIE DB ops from ~10 to ~3 with no behavioral change.

## Recommendation

1. **Implement `aie_lite_mode` flag** (Option B) — enable it by default when user turns AIE back on. Lite mode costs ~0 extra vs. not having AIE, but gains classifier + param_tuner (LLM quality) + safety gating.
2. **Cache behavior/tuner** (Option C) — add TTL cache keyed by `char_id`. 5-minute TTL is semantically correct (preferences don't change turn-by-turn).
3. **Deprecate `backend/adaptive/milestones.py`** — it's a dead-end; `backend/bond/milestones.py` owns this domain.

## Key File References

| | File:Line |
|---|---|
| `_aie_enabled()` master gate | `backend/server.py:339-363` |
| Pre-turn prompt injection | `backend/server.py:4443-4469` |
| Dynamic params hot path | `backend/server.py:4637-4668` |
| Post-turn signals save | `backend/server.py:4849-4861` |
| Reflector check | `backend/server.py:4755-4769` |
| personalization_gate in assembler | `backend/llm/context_assembler.py:237-254` |
| memory_behavior in assembler | `backend/llm/context_assembler.py:273-320` |
| AIE milestones endpoint | `backend/server.py:2315` |
| Bond milestones endpoint (parallel/dupe) | `backend/server.py:9992` |
