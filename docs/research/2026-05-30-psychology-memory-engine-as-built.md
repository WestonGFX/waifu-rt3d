# Persistent Psychology & Memory Engine — As-Built Map + Gap Analysis

**Date:** 2026-05-30
**Author:** Claude Code (Opus 4.8)
**Why:** A set of PRDs asked to "design a persistent psychology and memory engine" for
the embodied AI-girlfriend re-anchor of waifu-rt3d. Codebase exploration (3 read-only
agents) found the engine is **~80% already built**. This doc maps the PRD vocabulary
onto the real systems so future agents extend rather than re-design, then names the
real gaps and the build order to close them.

**For the next agent:** when a PRD says "add a Mood Engine / Memory System / Relationship
State / Avatar Performance Director," check this table first — it almost certainly
exists under a different name. Building a parallel system is the failure mode here.

---

## 1. PRD layer → As-built system (evidence)

| PRD layer | As-built system | Location (file:line) |
|---|---|---|
| Identity Core | CHARA v2 cards + system prompt | `backend/characters/chara_card.py`; `characters` table |
| Personality Traits | Kokoro **Tier C** (`character_traits`: openness/warmth/dominance/mischief/melancholy), bible-seeded | `backend/kokoro/traits_seeder.py:177`; `mind_state.py:97` |
| Current Mood | Kokoro **Tier A** — 13 fast dials, per-turn | `mind_state.py:57`; `character_mind_state` (v83) |
| Emotional Momentum / decay | Kokoro **Tier B** — slow drift (loneliness/restedness/boredom/anticipation/nostalgia), lazy per-hour | `backend/kokoro/drift.py:84` |
| Mood director's note | Time-of-day + affinity + session-gap prefix | `backend/mood/engine.py:82` |
| Relationship State | Bond XP (quadratic, 5 tiers) + NL state block | `backend/bond/progression.py`; `backend/relationship/state_injector.py:429` |
| Needs/Homeostasis | Tier B drift dials behave as needs | `drift.py` |
| Trust / Familiarity | `character_relationships.bond_level/affinity`; `intimacy_states` | preflight v56/v58 |
| Episodic Memory | 3-tier sqlite-vec (fleeting/recent/permanent) | `backend/memory/tiered_memory.py` |
| Semantic Memory | Knowledge-graph facts (confidence) | `backend/knowledge/extractor.py`; `user_facts` (v27) |
| Emotional Memory | `intimate_memories` (sensory-anchored) | `backend/memory/intimate_memories.py` (v62) |
| Reflection/Consolidation | AIE reflector (every 50 msgs, local) + summaries | `backend/adaptive/reflector.py`; `session_summaries` (v35) |
| Retrieval ranking | sqlite-vec KNN + Ebbinghaus rerank + cross-encoder | `tiered_memory.py:622`; `backend/memory/reranker.py` |
| Decay / Forgetting | Ebbinghaus retention + prune + recall reinforcement | `backend/memory/decay.py:61` |
| Behavior loop | prepare_turn → LLM → finalize_turn | `backend/kokoro/service.py:82,252` |
| Structured per-turn output | `CompanionResponse` (emotion/face/gesture/gaze/voiceStyle/stateDelta/memoryWrite/NSFW) | `backend/kokoro/response_parser.py:45` |
| Avatar performance cues | `dispatchKokoroEmbodiment` → 6-layer AnimationDirector | `frontends/sakura/src/stores/viewerStore.ts:459`; `viewer.html:610` |
| Avatar/TTS mapping | face→blendshape, gaze→lookAt, voiceStyle→TTS; lipsync | `frontends/sakura/src/lib/kokoro.ts:86,132`; `backend/tts/voice_modulator.py:45` |
| Safety / boundaries | NSFW gate (kokoro+nsfw+bond≥20); `relationship_boundaries`; `kokoro_safety_events` | `service.py:150`; preflight v61/v86 |
| Proactive initiation | Time/idle/milestone triggers + generator (LLM+template) | `backend/proactive/triggers.py`, `generator.py` |
| Debug/Explainability | KokoroDebugPanel (parse_ok + dials) — partial | `frontends/sakura/src/components/KokoroDebugPanel.tsx` |

The systems are **orthogonal, not duplicative**: Tier dials ≠ mood prefix ≠ relationship
block ≠ memory-behavior instructions ≠ retrieved memories. Each contributes a distinct
prompt section assembled under a token budget by `backend/llm/context_assembler.py`.

### Kokoro tier timescales
- **A** fast (per-turn, LLM `stateDelta` clamped ±0.05) · **B** slow drift (hours/days,
  lazy-computed in `prepare_turn`) · **C** traits (seeded once from bible) · **E** thread/
  scene (per-conversation) · **F** NSFW (gated: `kokoro_enabled AND nsfw_enabled AND
  bond_level≥20`). Tables: `character_mind_state`, `character_traits`, `thread_state`.

### Memory layers
- `memories` + `memories_vec` (3-tier, Ebbinghaus decay, recall reinforcement, cross-
  encoder rerank) · `session_summaries` (hierarchical) · `user_facts` (knowledge graph,
  confidence, **no decay**) · `intimate_memories` (sensory anchors) · `nostalgia.py`
  (probabilistic resurfacing). Assembly priority + budget in `context_assembler.py`.

---

## 2. Real gaps (true gaps, not re-implementations)

1. **Relationship & ritual memory is dead-stored.** `private_vocabulary` (v61: pet
   names, inside jokes) is stored but has **no reader/injection**. Relationship facts are
   squashed into `user_facts.category='relationship'`. No ritual/habit layer ("our
   thing", recurring greetings, callbacks). → She doesn't visibly know *us*.
2. **No forgetting/correction/privacy.** `tiered_memory.delete_memory()` is hard-delete
   only; deleted content can resurrect from summaries. No per-memory `privacy_level` /
   `local_only`; boundaries gate *output*, not *retrieval*. No "forget that / that's
   wrong" turn handling. → Trust spine missing.
3. **Facts & preferences never decay or resolve conflicts.** `user_facts.confidence`
   static; `preference_history` never deprecates on "I don't like X anymore." → stale
   memory → contradictions.
4. **Avatar doesn't react when the user speaks.** Voice-duplex state
   (LISTENING/PROCESSING/SPEAKING, `backend/voice/duplex.py`) is server-side only; the
   avatar's `isTalking` flag tracks TTS playback only. No listening body language.
   Greeting-on-return exists in `proactive/` but isn't wired to app startup.
5. **No psychology/memory explainability surface.** KokoroDebugPanel shows parse_ok +
   dials, not retrieved-memories-and-why, prompt sections, mood Δ-reason, cue source,
   safety flags, last reflection. "Why did she say/feel/retrieve that?" unanswerable.
6. **Tier C traits don't drive animation.** Seeded but never routed to the viewer;
   idle/fidget uses only the mood→personality map.

---

## 3. Build order (waves)

- **A — Relationship & Ritual Memory** (schema v87): recall private vocab + relationship
  facts + new `relationship_rituals`; inject a "Shared History" block. Backend, low risk.
- **B — Forget/Correct/Privacy** (schema v88): soft-delete + suppression (no
  resurrection), per-memory `privacy_level`/`status`, "forget that" turn handling,
  MemoryBrowser controls. Trust spine.
- **D — Debug Dashboard**: `/api/kokoro/debug/state` + tabbed KokoroDebugPanel
  (Mood/Memory/Prompt/Cues/Safety). Explainability. Low risk.
- **C — Embodied Presence** (risk-last): duplex state → avatar listening cue (additive
  on LookAt/Blink); greeting-on-return wired to startup. Touches `viewer.html`.
- **Backlog**: fact/preference decay + contradiction resolution (extend `decay.py` to
  `user_facts`); Tier C trait→animation (route to `dispatchSetPersonality`).

Sequencing constraints: `preflight.py` migrations are serial/append-only (A=v87 then
B=v88, never parallel); `viewer.html`+`viewerStore.ts` are single-owner; D∥C parallel
(disjoint files); pytest+tsc gate between waves.

Plan of record: `~/.claude/plans/you-are-claude-opus-hidden-feather.md`.
