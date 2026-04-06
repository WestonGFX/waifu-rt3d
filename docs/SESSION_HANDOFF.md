# Session Handoff — 2026-04-06

## Branch: master
## Test Status: 2474 passed, 0 failed | TSC: clean

## Completed This Session (session 9 — AIE Phase B)

### AIE Phase B: Deep Learning Pipeline — ALL 6 MODULES
- **B1 Trend Analyzer** — `backend/adaptive/trend_analyzer.py`: EMA + linear regression over preference_history, engagement pattern detection, regression detection
- **B2 Memory Decay** — `backend/memory/decay.py`: Ebbinghaus forgetting curve (R = importance × e^(-λt) × recall_bonus), batch decay passes, recall reinforcement
- **B3 Memory→Behavior** — `backend/adaptive/memory_behavior.py`: 4-channel behavioral derivation (emotional coloring, style priming, proactive references, relationship continuity)
- **B4 Self-Critique** — `backend/adaptive/self_critique.py`: LLM self-review triggered on >15% engagement regression, auto-nudges pref_* values
- **B5 Topic Graph** — `backend/adaptive/topic_graph.py`: TF-IDF topic extraction per message, sentiment tracking, emerging topic detection
- **B6 Milestones** — `backend/adaptive/milestones.py`: 10-type relationship milestone detection (first_conversation, loyalty_50, emotional_trust, etc.)

### Schema v66 Migration
- Memory decay columns on `memories` table: importance, recall_count, last_recalled_at, decay_score
- New `topic_tracking` table (char_id, topic, mention_count, avg_sentiment, is_emerging)
- New `relationship_milestones` table (char_id, milestone, description, detected_at)

### Integration Wiring
- B1+B6 → `reflector.py` (post-reflection trend analysis + milestone check)
- B2 → `tiered_memory.py` (decay-aware re-ranking + recall reinforcement on retrieval)
- B3 → `context_assembler.py` (memory-behavior block injected after RAG memories)
- B4 → `reflector.py` (self-critique after trends, gated by engagement regression)
- B5 → `signals.py` (per-turn topic extraction via _user_msg_text passthrough)

### 5 New API Endpoints
- `GET /api/adaptive/trends/{char_id}` — preference trends + engagement patterns
- `POST /api/memory/decay-pass` — trigger Ebbinghaus decay pass
- `GET /api/adaptive/topics/{char_id}` — tracked topics + emerging + affinities
- `GET /api/adaptive/milestones/{char_id}` — relationship milestones
- `POST /api/adaptive/self-critique/{char_id}` — manual self-critique trigger

### Tests: +114 new (2474 total)
- 20 trend_analyzer, 20 decay, 19 topic_graph, 17 milestones, 15 memory_behavior, 23 self_critique

## Work In Progress
- None — all Phase B items committed

## Known Issues / Bugs
- Pre-existing: Live2D runtime broken, embedding model issue (see MEMORY.md)
- Pre-existing: QA issues I3, I7, I8, I9, I10 unfixed (from session 6 QA sweep)

## Files Modified
```
Session commits: 02529cd, d3ec6eb
19 files changed, 5633 insertions (feat commit)
1 file changed, 47 insertions (docs commit)

New files (6 modules):
  backend/adaptive/trend_analyzer.py
  backend/adaptive/topic_graph.py
  backend/adaptive/milestones.py
  backend/adaptive/memory_behavior.py
  backend/adaptive/self_critique.py
  backend/memory/decay.py

New files (6 test files):
  backend/tests/test_trend_analyzer.py
  backend/tests/test_decay.py
  backend/tests/test_topic_graph.py
  backend/tests/test_milestones.py
  backend/tests/test_memory_behavior.py
  backend/tests/test_self_critique.py

Modified (integration):
  backend/adaptive/reflector.py (+B1 trends, +B4 self-critique, +B6 milestones)
  backend/adaptive/signals.py (+B5 topic extraction, +_user_msg_text key)
  backend/llm/context_assembler.py (+B3 memory-behavior block)
  backend/memory/tiered_memory.py (+B2 decay re-ranking + reinforcement)
  backend/preflight.py (+v66 migration)
  backend/server.py (+5 API endpoints)
  backend/tests/test_signals.py (updated expected keys)
```

## Next Session Priorities
1. **QA Phases 8-16** — Continue browser testing: keyboard shortcuts, themes, layout modes, mini-games, 3D viewer, voice, character management, window resize, console audit
2. **Bond Progression System** — #1 retention driver. Spec: `docs/plans/2026-03-29-bond-progression-spec.md` (42-58h, 6 phases)
3. **Try `/release-test --quick`** — Verify the new release testing skill works with Chrome MCP
4. **P5: Memory Browser UI** — React component for viewing/editing character memories

## Context for Next Session
- Server IS running (confirmed healthy at session start — 3 services connected)
- Frontend dev server status unknown — may need: `cd frontends/sakura && npx vite --port 5175`
- AIE Phase B is fully integrated — all 6 modules wired into the hot paths (signals, reflection, memory search, context assembly)
- Phase C (LoRA training, DSPy optimization) is future work — requires external deps and Phase B validation first
- AIE spec file: `docs/plans/2026-03-29-adaptive-intelligence-spec.md` — Phase B section starts at line 510
