# AIE 12-Module Consolidation Analysis

**Date:** 2026-05-31
**Why:** User's open question (session 46): "is there a better way to use/implement the 12 AIE
background modules?" Read-only analysis by `codebase-analyst` to decide consolidate vs keep.
**Verdict:** The problem is NOT architecture — it's **three missing wires**. Do NOT consolidate.

## Orientation

- Master flag `_aie_enabled(cfg)` defaults **OFF**. `_aie_lite_mode(cfg)` defaults ON when AIE
  is re-enabled, partitioning the set further.
- Sakura calls `/api/chat/stream` exclusively (chatStore.ts:235/350/747). The **streaming path
  has different post-turn behavior** from non-streaming — this asymmetry is load-bearing.

## The root structural problem

`user_profiles` is **empty in all normal use** because `run_reflection` has **no caller**
(`server.py:4937` — `# TODO: queue async reflection task`). That empties the output of `tuner`,
most of `memory_behavior`, and all `self_critique`. `preference_history` is likewise empty
(`save_preference_snapshot` has no server caller), emptying `trend_analyzer` + `behavior`.
And `engagement_signals` is near-empty for streaming users because `save_signals` only runs in
the **non-streaming** path — which Sakura never uses.

## Module tiers (full inventory in the dispatch transcript)

**Tier 1 — healthy, runs today (both paths, ~0 tokens):**
- `context_classifier` → `param_tuner`: classifies 7 contexts (regex, no LLM/DB) → sets
  `temperature`/`repetition_penalty` for every LLM call. Highest value-per-token (zero tokens).
- `personalization_gate`: memory-safety filter (relevance/repetition/appropriateness) in
  `context_assembler.py:299`. Works.
- `memory_behavior` (emotional-coloring channel only): `context_assembler.py:335`. The
  behavioral-priming channel is dead (needs empty `user_profiles`).
- `signals.compute_sentiment` / `get_recent_signals`: feed param tuning (but trend ≈ 0.0 because
  `engagement_signals` is near-empty in streaming).

**Tier 2 — complete but UNWIRED (the "one missing wire" set):**
- `topic_graph.build_topic_context_block`: fully implemented, only called from the REST endpoint
  `/api/adaptive/topics` (server.py:2395) — never from `context_assembler`. **This is the
  natural-callback capability the user hypothesized; it's just not plugged into the prompt.**
- `signals.save_signals`: works, called only in the non-streaming done-handler — never in stream.

**Tier 3 — dead weight (depend on un-invoked `run_reflection`):**
- `tuner`, `behavior`, `trend_analyzer`, `user_model`, `self_critique`, `reflector.run_reflection`
  — all read/write data that is never produced in production.
- `adaptive/milestones.py` — **deprecated**, superseded by `backend/bond/milestones.py`.

### `topic_graph` hypothesis — refuted on wiring, directionally right

`build_topic_context_block` is never called per-turn; the capability is complete but unwired.
Wiring it into `context_assembler` is the cheapest high-value move — but it costs prompt tokens,
so per *value-per-token* it ranks below the zero-token `param_tuner`.

## Consolidation options assessed

- **A — collapse 12 → one "context shaper":** breaks REST endpoints + test isolation; modules are
  separated by genuine data-dependency, not accident. 2–3 days, high risk. **Not recommended.**
- **B — keep only param_tuner+classifier:** loses working features (personalization_gate,
  memory_behavior emotional coloring) at near-zero cost; kills all future recall. Too aggressive.
- **C — keep all + cache aggressively:** caches already exist (`_AIE_PROFILE_CACHE`,
  `_AIE_BEHAVIOR_CACHE`, 5-min TTL). Saves ~nothing in the streaming path (heavy cluster never
  runs there). Correct maintenance, but doesn't fix the dead-weight cause.

## Recommendation — three wiring fixes (NOT consolidation)

| Pri | Fix | File | Effort | Risk |
|---|---|---|---|---|
| P1 | Add `collect_turn_signals`/`save_signals` to the **streaming** done-handler (mirror lines 5019–5031) | `server.py` ~6280 | 2h | Low (idempotent DB write) |
| P2 | Wire `topic_graph.build_topic_context_block` into `context_assembler` after the memory_behavior block (budget-checked) | `context_assembler.py` ~382 | 2h | Low-med (prompt budget) |
| P3 | Replace the `run_reflection` TODO with `asyncio.create_task(run_reflection(...))` (mirror `_extract_user_facts_bg`) | `server.py` ~4937 | 4h | Med (LLM load every ~50 msgs) |

**Delete:** `adaptive/milestones.py` (deprecated → bond.milestones; reroute/remove the REST
endpoint); `adaptive/dspy_modules/` (DSPy flag OFF by default, not a dependency, dead experimental).

P1 alone activates the engagement-trend signal, behavior confidence, topic tracking, and
reflection-score accumulation for streaming users — the single highest-leverage change.

## ⚠ Decision gate (NOT auto-implemented)

These fixes touch the **per-turn streaming path + context_assembler** (sensitive) and the AIE is
**OFF by default** — and session 47 added `aie_enabled` as a master kill-flag under the v1-Lite
"strip everything that isn't core chat" direction. Wiring the AIE up is a **product decision** that
runs counter to v1-Lite unless the user wants AIE re-activated. Left as a spec; not implemented.

## Files referenced
- `backend/adaptive/*` (12 modules) · `backend/server.py` (gates ~291, stream done-handler ~6280,
  reflection TODO 4937) · `backend/llm/context_assembler.py:299/335/382` ·
  `frontends/sakura/src/stores/chatStore.ts:235/350/747`
