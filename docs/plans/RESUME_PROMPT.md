# Resume: Waifu-RT3D — Post-Phase 15+18 Session (Mar 21, 2026)

## WHO I AM

I'm Chris. Sole developer of Waifu-RT3D, a commercial AI companion platform with 3D anime avatars + local LLM integration. AI-assisted implementation is ~12x faster than traditional estimates. Desktop-only app.

**3 dev machines:** Mac M2 Pro (24GB unified), Win RTX 5080 (16GB), Win RTX 3070 (8GB). M2 Pro is the GPU floor. 8-9B models run fast, 14B is too slow on M2 Pro.

## WHAT HAPPENED THIS SESSION (6 commits)

| Commit | Phase | What | Verified |
|--------|-------|------|----------|
| `7121ae0` | 15A-B | Embedding provider abstraction (MiniLM + Gemma) + semantic lore matching | Unit tests |
| `fbec7d6` | 15C | Server integration + semantic topic-shift detection in importance scorer | Unit tests |
| `4a93b2d` | 18A | Content gating system (types, ceiling, intimacy, prompts) — ported from AnimeGirly | Unit tests |
| `9ab6605` | 18B | Wire content gating into chat pipeline + intimacy tracking per turn | Unit tests |
| `3b1787d` | docs | Checkpoint — status files updated | — |
| `ff64154` | new | Smart LLM endpoint fallback + stream post-processing hooks | **Browser E2E** |

**Tests: 529 → 701 (+172). Schema: v56 → v58.**

### Browser-Verified E2E Results
- Smart fallback auto-discovered qwen3:8b on Ollama when configured model was missing
- Intimacy tracking: level=5, trend=rising after flirty message exchange
- Physical actions captured from `*action*` markers in both user and AI messages
- Bond XP accumulating (xp=2 after first exchange)
- Emotion tags + gesture tags parsed and displayed correctly

## NEW KEY MODULES

| Module | Purpose |
|--------|---------|
| `backend/embeddings/provider.py` | EmbeddingProvider protocol, MiniLM + Gemma implementations, factory |
| `backend/content/types.py` | ContentRatingLevel, IntimacyState, PhysicalState, ContentGateConfig |
| `backend/content/gating.py` | resolve_effective_ceiling(), cloud provider caps, password utils |
| `backend/content/intimacy.py` | 5 regex pattern groups, evaluate_intimacy_shift(), physical state tracking |
| `backend/content/prompts.py` | 4 graduated prompt builders (directive, physical, sensory, gate) |
| `backend/content/bridge.py` | DB load/save, legacy config mapping, get_content_blocks() |
| `backend/llm/endpoint_fallback.py` | Smart LLM endpoint discovery with 60s cache, model preference |

## WHAT TO DO NOW

### Priority 1: Phase 18C-D — Content Gating Frontend
- Settings UI: "Content & Privacy" panel with ceiling selector, age verification, password lock
- Per-character ceiling overrides
- Map legacy `content_filter_level` integer to new system
- **Backend is done** — just needs frontend components

### Priority 2: Phase 17 — Animation Library
- Expand from 45 procedural animations to 200+
- AnimationSequencer class for emotion-to-animation mapping
- Multi-source: procedural v2, open-source packs (CMU MoCap, 100STYLE)

### Priority 3: Phase 19 — On-device Learning
- Continuous signal collection (per-turn, no LLM call)
- Rolling preference learning (replace batch-50 gate)

## KNOWN ISSUES / CONTEXT

- **LLM config in app.json** still points to non-existent `dirty-muse-writer-v01-uncensored-erotica-nsfw-i1` — the fallback handles this but should update to `qwen3:8b` + `http://localhost:11434/v1`
- **Content gating defaults** — `global_content_ceiling` in DB = `"general"`, but user's `content_filter_level: -1` maps to `"explicit"` via bridge. Both systems coexist.
- **embeddinggemma** — provider built but not tested live. MLX local version doesn't work with sentence_transformers. Use HF model ID `google/embeddinggemma-300m` instead.
- **Qwen3:8b** downloaded on Ollama. User prefers managing model downloads themselves via Ollama GUI.

## KEY RULES

- **Resume = implement immediately.** Use `/go` to execute.
- **Desktop-only app** — no mobile
- **Use `.venv/bin/python`** for ALL Python commands
- **Commit after each task** with phase reference
- **Run `/checkpoint`** after completing phases
- **8-9B models only** on M2 Pro (24GB unified, not 32GB)
- **Content filter**: User wants fully unrestricted 18+ option with age gate

## ARCHITECTURE

| Component | Stack | Key Files |
|-----------|-------|-----------|
| Backend | FastAPI, SQLite v58, Python 3.14 | `backend/server.py` (~13K lines) |
| Frontend | React 19, Zustand, Vite | `frontends/sakura/src/` |
| 3D Viewer | Three.js, VRM (iframe) | `frontends/shared/viewer/viewer.html` (~7.3K lines) |
| Memory | sqlite-vec, EmbeddingProvider (MiniLM default) | `backend/memory/tiered_memory.py` |
| Content | 4-level gating + intimacy tracking + prompt injection | `backend/content/` |
| LLM | Smart fallback across Ollama/LM Studio/vLLM | `backend/llm/endpoint_fallback.py` |
| Tests | 701 pytest, tsc clean | `backend/tests/` |

**13 characters, 18 themes, schema v58, 701 tests.**
