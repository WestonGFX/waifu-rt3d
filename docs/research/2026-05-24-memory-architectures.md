# Agentic Memory Architectures (2024–2025) — Landscape Scan

**Date:** 2026-05-24
**Why:** Kokoro Engine v1 just shipped (tiered dial state A–F + per-turn structured `memoryWrite` decisions into `tiered_memory.py`). Before designing v2, survey what the rest of the field has converged on so we steal the right ideas and skip the dead ends. We already have: sqlite-vec 3-tier memory (Fleeting/Recent/Permanent), recency decay + recall reinforcement, AIE user model, FactExtractor knowledge graph. Goal here is to identify *augmentations*, not replacements.

---

## The Contenders

### 1. MemGPT → Letta — "Core Memory Blocks"
- **Core idea:** Treat the context window like an OS — small always-in-context "core blocks" (Human, Persona) that the agent self-edits via tool calls, plus paged archival memory.
- **What it adds for us:** A clean abstraction for the *always-visible* persona/user blocks. Right now Kokoro's tiered dial state is implicit in the system prompt; making it an explicit, agent-editable "core block" would let the character refine its own self-model and the user-model block during the turn. Sonnet 4.5's native memory tools now make this nearly free.
- **Cost:** Low. We already issue structured per-turn JSON — adding `coreMemoryEdit: {block: "user"|"persona", patch: "..."}` to the schema is one field plus a writer.
- **Kokoro fit:** Excellent. Maps directly onto our per-turn structured response model.
- Source: [Letta — Memory Blocks](https://www.letta.com/blog/memory-blocks), [MemGPT → Letta](https://www.letta.com/blog/memgpt-and-letta)

### 2. A-MEM — Zettelkasten Notes
- **Core idea:** Each memory becomes an atomic "note" with keywords/tags/context. On write, the agent looks at related historical notes and (a) links them and (b) *retroactively updates* the older notes' tags. The graph evolves.
- **What it adds for us:** Right now our Permanent tier is a flat-ish list of facts. A-MEM would give us emergent linking ("user mentioned cat anxiety → links to earlier note about losing previous cat → tag both `pet_grief`"). This is exactly what makes a companion feel like it *understands* rather than *recalls*.
- **Cost:** Medium. Needs a `memory_links` table + an extra LLM pass on write to detect/update links. Latency hit unless we async it.
- **Kokoro fit:** Good — link generation can run on the background reflection pass, not the hot turn.
- Source: [A-MEM (NeurIPS 2025)](https://arxiv.org/abs/2502.12110), [GitHub](https://github.com/agiresearch/a-mem)

### 3. Stanford Generative Agents (Smallville) — Memory Stream + Reflection
- **Core idea:** Every observation gets an `importance` score (1–10 from LLM); periodically when accumulated importance crosses a threshold, run a *reflection pass* that synthesizes high-level insights ("the user uses humor to deflect when stressed") and writes those back as new memories.
- **What it adds for us:** This is the biggest missing piece. We decay and reinforce but we never *synthesize*. Reflection is what turns 200 chat turns into "she knows me." Importance scoring also lets us prune Fleeting → Recent intelligently instead of FIFO.
- **Cost:** Low-medium. One scheduled job + one extra LLM call per reflection. Could ride on existing idle-tick infra.
- **Kokoro fit:** Perfect. Reflection output is itself a tiered dial signal — the character *grows* between sessions.
- Source: [Generative Agents paper](https://arxiv.org/abs/2304.03442)

### 4. Mem0 — Production Fact-Extraction Layer
- **Core idea:** LLM extracts atomic facts on each turn, then for each fact LLM picks an op (ADD/UPDATE/DELETE/NOOP) by comparing against top-k similar existing memories. Hybrid vector+graph+KV store.
- **What it adds for us:** A *conflict-resolution* policy. Today our FactExtractor adds facts but never reconciles ("user is 25" + "user just turned 26"). Mem0's op-selection pattern would fix the slow drift toward contradictions.
- **Cost:** Low — we already have the extractor; just add the "compare-and-merge" step.
- **Kokoro fit:** Good. The op-selection is a natural extension of `memoryWrite`.
- Source: [Mem0 paper](https://arxiv.org/pdf/2504.19413), [State of Agent Memory 2026](https://mem0.ai/blog/state-of-ai-agent-memory-2026)

### 5. Zep / Graphiti — Bi-Temporal Knowledge Graph
- **Core idea:** Episodic + semantic + community subgraphs. Every edge has *two* timestamps: when the event happened AND when we learned about it. Tracks fact validity intervals.
- **What it adds for us:** Bi-temporal is the right answer for "user mentioned in March they hate their job → in May they got promoted → don't bring up old fact as current." We currently have no way to express "fact was true then, isn't now."
- **Cost:** High if adopted wholesale (needs graph DB or heavy schema work). Low if we steal *only* the bi-temporal edge pattern — two extra columns on a facts table.
- **Kokoro fit:** Steal the idea, skip the framework. Outperforms MemGPT on DMR (94.8 vs 93.4).
- Source: [Zep paper](https://arxiv.org/abs/2501.13956), [Graphiti](https://github.com/getzep/graphiti)

### 6. Microsoft GraphRAG — Community Summaries
- **Core idea:** Build entity graph from corpus, run Leiden community detection, generate hierarchical summaries per community. Answers "global" questions vector RAG can't.
- **What it adds for us:** Honestly, not much for a 1-on-1 companion. GraphRAG shines on multi-doc corpora where multi-hop traversal matters ("which team owns the dashboard that…"). Our memory is a single user's chat history — single-hop dominates.
- **Cost:** High. Not worth it.
- **Kokoro fit:** Skip. Vector + light graph linking (A-MEM style) is enough.
- Source: [GraphRAG implementation guide](https://blog.premai.io/graphrag-implementation-guide-entity-extraction-query-routing-when-it-beats-vector-rag-2026/)

### 7. Long-Context vs Active Memory (the meta-question)
- **Finding:** Even at 1M-token windows, memory retrieval still wins on cost AND accuracy. "Lost in the middle" degrades long-context recall; memory systems stay <7K tokens per query and match or beat full-context approaches on LongMemEval/LoCoMo. Break-even favors memory the moment a user has >1 session.
- **Implication for us:** Don't even consider "just stuff everything in context." Confirmed direction.
- Source: [Beyond the Context Window](https://arxiv.org/html/2603.04814v1)

### 8. Emotional RAG — Your "Mind-State Snapshot" Idea
- **Status of the idea:** **Already published.** Oct 2024, [Emotional RAG paper](https://arxiv.org/html/2410.23041v1). They tag each memory with the emotional state at encoding and retrieve using BOTH semantic AND emotional similarity. Inspired by mood-dependent memory from cognitive psych (PubMed confirms mood-congruent ERP effects at 200ms during encoding).
- **What's novel for us:** Kokoro has something the paper doesn't — a *structured* tiered dial state (A–F across multiple axes), not just valence/arousal. Tagging memories with the full dial snapshot at write-time and weighting retrieval by dial similarity is a *richer* version of Emotional RAG. The paper shows it improves role-playing persona consistency — directly our use case.
- **Cost:** Trivial. Add a `mind_state_snapshot` JSON column to the memory table; weight retrieval by dial-vector distance alongside semantic distance.
- **Kokoro fit:** This is the strongest single move on this list. Your intuition was right and the literature backs it.

---

## What To Actually Do For Kokoro v2 (Ranked by ROI)

1. **Mind-state-tagged memory (Emotional RAG++)** — Add `mind_state` JSON to every memory row. Hybrid retrieval = `α·semantic + β·dial_similarity + γ·recency`. Tunable knobs, ~1 day of work, biggest qualitative win. Cite the Emotional RAG paper in commit message.
2. **Reflection pass** — Background job that, when accumulated turn-importance crosses a threshold, runs an LLM synthesis over recent memories and writes higher-order insights back as Permanent-tier facts. This is what makes the character *seem to grow*.
3. **Importance scoring on `memoryWrite`** — One extra field in the per-turn JSON: `importance: 1–10`. Use it to drive Fleeting→Recent→Permanent promotion instead of pure age/recall counts. Cheap, immediate.
4. **Bi-temporal facts (steal from Zep)** — Add `event_time` and `recorded_time` columns to facts. Stop the slow drift into contradictions when user states change. Two columns, no graph DB needed.
5. **A-MEM-style link generation** — On the same reflection pass, ask the LLM to propose links between new memories and existing ones; store in `memory_links`. Defer until 1–3 ship.

Skip: GraphRAG (overkill for single-user), full Letta migration (we already have our own substrate), Mem0 as a vendor (steal the conflict-resolution pattern, keep our own store).

---

## Files Referenced (in this codebase)
- `backend/memory/tiered_memory.py` — current 3-tier store; target for mind-state column + bi-temporal columns
- `backend/knowledge/extractor.py` — extend with Mem0-style ADD/UPDATE/NOOP op-selection
- `backend/adaptive/reflector.py` — likely host for the reflection pass
- Kokoro v1 per-turn JSON schema — add `importance` and `coreMemoryEdit` fields

## Sources
- [Letta — Memory Blocks](https://www.letta.com/blog/memory-blocks)
- [A-MEM (NeurIPS 2025)](https://arxiv.org/abs/2502.12110)
- [Generative Agents — Stanford/Google](https://arxiv.org/abs/2304.03442)
- [Mem0 paper](https://arxiv.org/pdf/2504.19413) · [State of Agent Memory 2026](https://mem0.ai/blog/state-of-ai-agent-memory-2026)
- [Zep / Graphiti paper](https://arxiv.org/abs/2501.13956)
- [Emotional RAG](https://arxiv.org/html/2410.23041v1)
- [Beyond the Context Window — cost/perf analysis](https://arxiv.org/html/2603.04814v1)
- [GraphRAG implementation guide (2026)](https://blog.premai.io/graphrag-implementation-guide-entity-extraction-query-routing-when-it-beats-vector-rag-2026/)
