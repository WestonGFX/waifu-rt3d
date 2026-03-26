# Execution Plan: Phase 15 — embeddinggemma Integration

## Context

Phase 14B research is committed (`ffe4a20`). All 529 tests pass, tsc clean. Next actionable work per CURRENT_STATUS.md is **Phase 15: embeddinggemma-300m integration** — replacing/augmenting all-MiniLM-L6-v2 with a better embedding model.

The plan file at `cached-imagining-cocke.md` has detailed specs for Phases 15A-15D + schema v57.

## Execution Order

### Wave 1: Foundation (parallel agents)
1. **senior-dev** → `backend/embeddings/provider.py` — EmbeddingProvider protocol + MiniLM + Gemma implementations
2. **qa-hunter** → `backend/tests/test_embedding_provider.py` — tests for provider abstraction
3. **codebase-analyst** → Map all current embedding usage (tiered_memory.py, importance_scorer.py, lore/matcher.py)

### Wave 2: Integration (sequential, touches shared files)
4. Modify `backend/memory/tiered_memory.py` — inject EmbeddingProvider, remove hardcoded MiniLM
5. Modify `backend/lore/matcher.py` — add semantic matching (hybrid keyword + cosine)
6. Modify `backend/llm/importance_scorer.py` — replace Jaccard with cosine similarity
7. Schema v57 in `backend/preflight.py` — lore_embeddings table, embedding_model column

### Wave 3: Content filter + tests
8. **senior-dev** → `backend/content/semantic_filter.py` — boundary vector comparison
9. **qa-hunter** → Integration tests for all modified modules

### Verification
- `.venv/bin/python -m pytest backend/tests/ -q --tb=line`
- `cd frontends/sakura && npx tsc --project tsconfig.app.json --noEmit`
- Manual: benchmark embeddinggemma vs MiniLM on M2 Pro

## Critical Files
- `backend/memory/tiered_memory.py` — current embedding consumer (line 39: EMBEDDING_DIM=384, line 563: SentenceTransformer)
- `backend/lore/matcher.py` — keyword matching (line ~85)
- `backend/llm/importance_scorer.py` — Jaccard overlap (line 58)
- `backend/preflight.py` — migrations (currently v56)
- `backend/embeddings/` — NEW directory for provider abstraction
