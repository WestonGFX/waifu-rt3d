# Expanded Feature Roadmap — Phase 16 Research Output

**Date:** 2026-03-25
**Research sources:** 4 agents across NLP/Dialogue, NSFW Platforms, Audio/Voice, UX/Engagement
**Features discovered:** 41 (after filtering music/singing/CV per user direction)
**Research files:** `docs/research/2026-03-25-*.md` (4 files)

---

## Scoring System

Each feature is scored on 5 axes (1-5 scale):

| Axis | 1 | 3 | 5 |
|------|---|---|---|
| **Impact** | Nice-to-have | Noticeable improvement | Game-changing retention |
| **Effort** | XL (20+ hours) | M (8-12 hours) | S (2-4 hours) |
| **Dependencies** | Needs new infra | Extends existing | Drop-in, no deps |
| **Risk** | Breaking changes, complex | Some integration risk | Safe, isolated |
| **Delight** | Functional utility | Users will like it | Users will love/share it |

**Priority tiers derived from total score (5-25):**

| Tier | Score | Meaning |
|------|-------|---------|
| **S** | 21-25 | Do immediately — high impact, low effort, safe |
| **A** | 17-20 | Do soon — strong value, moderate effort |
| **B** | 13-16 | Do when ready — solid but not urgent |
| **C** | 9-12 | Backlog — nice-to-have, do if time permits |
| **D** | 5-8 | Park — low priority or high risk |

---

## Master Feature List (41 Features)

### From Phase 16 Initial Research (7 features — already committed)

| # | Feature | Impact | Effort | Deps | Risk | Delight | **Total** | **Tier** |
|---|---------|--------|--------|------|------|---------|-----------|----------|
| R1 | emotion2vec+ SER (speech emotion) | 4 | 4 | 5 | 4 | 4 | **21** | **S** |
| R2 | MoMask animation (CPU) | 3 | 3 | 3 | 3 | 4 | **16** | **B** |
| R3 | QLoRA personality adapters | 5 | 2 | 2 | 3 | 5 | **17** | **A** |
| R4 | MotionLCM (GPU real-time gesture) | 3 | 2 | 3 | 3 | 4 | **15** | **B** |
| R5 | SpringBone tuning per character | 2 | 5 | 5 | 5 | 2 | **19** | **A** |
| R6 | Wav2Small (always-on arousal) | 2 | 5 | 4 | 5 | 2 | **18** | **A** |
| R7 | RP model catalog update | 1 | 5 | 5 | 5 | 1 | **17** | **A** |

### From NSFW Platform Research (13 features)

| # | Feature | Impact | Effort | Deps | Risk | Delight | **Total** | **Tier** |
|---|---------|--------|--------|------|------|---------|-----------|----------|
| P1 | Bond-gated content unlocking | 5 | 5 | 5 | 4 | 5 | **24** | **S** |
| P2 | Context assembly viewer | 3 | 4 | 5 | 5 | 3 | **20** | **A** |
| P3 | Interaction mode switching (chat/story/adventure) | 3 | 5 | 5 | 5 | 3 | **21** | **S** |
| P4 | Scenario templates (persistent scene context) | 3 | 5 | 4 | 5 | 3 | **20** | **A** |
| P5 | User-editable memory manager | 4 | 3 | 4 | 4 | 5 | **20** | **S** ⬆ |
| P6 | Character journal surfaced to users | 4 | 4 | 5 | 4 | 5 | **22** | **S** |
| P7 | Scene cards (dynamic context anchoring) | 4 | 3 | 3 | 3 | 4 | **17** | **A** |
| P8 | Structured director mode (pacing + involvement) | 3 | 3 | 4 | 4 | 3 | **17** | **A** |
| P9 | Daily engagement hooks (streaks, character moments) | 4 | 3 | 4 | 4 | 4 | **19** | **A** |
| P10 | Character proactive disclosure | 4 | 3 | 4 | 3 | 5 | **19** | **A** |
| P11 | Relationship state prompt injection | 5 | 2 | 3 | 3 | 5 | **18** | **A** |
| P12 | Contextual in-chat image generation | 4 | 1 | 2 | 2 | 5 | **14** | **B** |
| P13 | Conversation branching | 3 | 1 | 2 | 2 | 4 | **12** | **C** |

### From NLP/Dialogue Research (12 features)

| # | Feature | Impact | Effort | Deps | Risk | Delight | **Total** | **Tier** |
|---|---------|--------|--------|------|------|---------|-----------|----------|
| N1 | GLiNER zero-shot NER (knowledge graph boost) | 3 | 5 | 5 | 5 | 2 | **20** | **A** |
| N2 | Tiny toxicity detector (content boundary) | 3 | 5 | 5 | 5 | 2 | **20** | **A** |
| N3 | Language detection (multilingual routing) | 2 | 5 | 5 | 5 | 2 | **19** | **A** |
| N4 | Sarcasm/irony detection | 3 | 5 | 5 | 4 | 4 | **21** | **S** |
| N5 | Cross-encoder reranker (memory retrieval) | 4 | 4 | 4 | 4 | 2 | **18** | **A** |
| N6 | Dialogue summarization (SAMSum-trained) | 3 | 4 | 4 | 4 | 2 | **17** | **A** |
| N7 | Dialogue act classification | 3 | 3 | 3 | 3 | 3 | **15** | **B** |
| N8 | HyDE memory search | 3 | 4 | 4 | 4 | 2 | **17** | **A** |
| N9 | Topic modeling (BERTopic) | 2 | 4 | 4 | 4 | 2 | **16** | **B** |
| N10 | LLMLingua-2 prompt compression | 4 | 3 | 3 | 3 | 2 | **15** | **B** |
| N11 | Style consistency steering | 3 | 3 | 3 | 3 | 3 | **15** | **B** |
| N12 | ColBERT late-interaction retriever | 3 | 2 | 2 | 3 | 2 | **12** | **C** |

### From Audio/Voice Research (6 features, filtered)

| # | Feature | Impact | Effort | Deps | Risk | Delight | **Total** | **Tier** |
|---|---------|--------|--------|------|------|---------|-----------|----------|
| V1 | Silero VAD v5 (ML-based VAD) | 3 | 5 | 5 | 5 | 2 | **20** | **A** |
| V2 | DeepFilterNet 3 (noise suppression) | 3 | 4 | 5 | 5 | 3 | **20** | **A** |
| V3 | Rhubarb lip sync (phoneme→viseme) | 4 | 4 | 4 | 4 | 5 | **21** | **S** |
| V4 | Chatterbox Turbo (voice cloning TTS) | 5 | 3 | 3 | 3 | 5 | **19** | **A** |
| V5 | OpenVoice V2 (voice timbre conversion) | 3 | 3 | 3 | 3 | 4 | **16** | **B** |
| V6 | Moonshine v2 Tiny (faster ASR) | 3 | 4 | 4 | 4 | 2 | **17** | **A** |

### From UX/Engagement Research (10 features)

| # | Feature | Impact | Effort | Deps | Risk | Delight | **Total** | **Tier** |
|---|---------|--------|--------|------|------|---------|-----------|----------|
| E1 | Nostalgia triggers | 4 | 5 | 5 | 5 | 5 | **24** | **S** |
| E2 | Character dream sequences | 4 | 3 | 4 | 4 | 5 | **20** | **A** |
| E3 | Time capsule messages | 3 | 3 | 4 | 4 | 5 | **19** | **A** |
| E4 | Daily fortune / character oracle | 2 | 5 | 5 | 5 | 3 | **20** | **A** |
| E5 | Wellness check-ins | 2 | 5 | 5 | 5 | 3 | **20** | **A** |
| E6 | Compatibility quiz / soul profile | 2 | 4 | 4 | 4 | 4 | **18** | **A** |
| E7 | Character diary (enhanced journal) | 3 | 4 | 5 | 4 | 4 | **20** | **A** |
| E8 | Memory scrapbook | 3 | 2 | 3 | 3 | 4 | **15** | **B** |
| E9 | Character sketch/art generation | 3 | 2 | 2 | 3 | 4 | **14** | **B** |
| E10 | Shared world-building | 4 | 1 | 2 | 2 | 5 | **14** | **B** |

---

## Priority Summary

### Tier S — Do Immediately (9 features)

| # | Feature | Source | Hours | Key Insight |
|---|---------|--------|-------|-------------|
| P1 | **Bond-gated content unlocking** | NSFW platforms | 2-4h | Ties content levels to relationship — earned intimacy > toggle switch |
| E1 | **Nostalgia triggers** | UX research | 4-6h | +20-25% retention, zero new schema, uses existing memory system |
| P6 | **Character journal → user-visible** | Replika diary | 4-6h | Already have journal.py — just needs UI + surfacing |
| P5 | **Memory browser (view + delete)** | SpicyChat | 4-6h | ⬆ Bumped from A. Scoped to view+delete (50% time savings). Pin/edit deferred to Sprint 2. |
| P3 | **Interaction mode switching** | KoboldAI | 3-5h | Prompt template variants only — chat/story/adventure |
| N4 | **Sarcasm/irony detection** | NLP research | 3-4h | 125M model, prevents character taking sarcasm literally |
| V3 | **Rhubarb lip sync** | Audio research | 4-6h | Phoneme→viseme for VRM, CPU-only, replaces open/close toggle |
| R1 | **emotion2vec+ SER** | Phase 16 initial | 4-6h | 9 emotions from user voice, feeds MoodEngine |
| R7 | **RP model catalog update** | Phase 16 initial | 1-2h | Add Fimbulvetr, Violet Lotus, DreamGen to catalog |

**Total Tier S: ~30-47 hours**

### Tier A — Do Soon (20 features)

| # | Feature | Source | Hours |
|---|---------|--------|-------|
| P2 | Context assembly viewer | NovelAI | 6-8h |
| P4 | Scenario templates | Janitor AI | 3-5h |
| P7 | Scene cards | CrushOn.ai | 8-12h |
| P8 | Structured director mode | DreamGen | 6-8h |
| P9 | Daily engagement hooks | Chai/Replika | 6-8h |
| P10 | Character proactive disclosure | Replika | 6-8h |
| P11 | Relationship state prompt injection | SillyTavern | 14-20h |
| N1 | GLiNER zero-shot NER | NLP | 3-4h |
| N2 | Tiny toxicity detector | NLP | 2-3h |
| N3 | Language detection | NLP | 2-3h |
| N5 | Cross-encoder reranker | NLP | 4-6h |
| N6 | Dialogue summarization | NLP | 4-6h |
| N8 | HyDE memory search | NLP | 3-4h |
| V1 | Silero VAD v5 | Audio | 3-4h |
| V2 | DeepFilterNet 3 | Audio | 4-6h |
| V4 | Chatterbox Turbo voice cloning | Audio | 8-12h |
| V6 | Moonshine v2 ASR | Audio | 4-6h |
| E2 | Character dream sequences | UX | 8-12h |
| E3 | Time capsule messages | UX | 8-10h |
| E4 | Daily fortune / oracle | UX | 3-5h |
| E5 | Wellness check-ins | UX | 3-5h |
| E6 | Compatibility quiz | UX | 6-8h |
| E7 | Character diary (enhanced) | UX | 4-6h |
| R3 | QLoRA personality adapters | Phase 16 | 12-20h |
| R5 | SpringBone tuning | Phase 16 | 2-4h |
| R6 | Wav2Small arousal | Phase 16 | 2-3h |

**Total Tier A: ~121-176 hours**

### Tier B — Promising, Do When Time Permits (2 features)

| # | Feature | Source | Hours |
|---|---------|--------|-------|
| N10 | LLMLingua-2 prompt compression | NLP | 8-12h |
| N11 | Style consistency steering | NLP | 8-12h |

**Total Tier B: ~16-24 hours**

### Tier C — Backlog (11 features)

*Former Tier B demoted per user preference + original Tier C.*

| # | Feature | Source | Hours |
|---|---------|--------|-------|
| R2 | MoMask animation (CPU) | Phase 16 | 8-12h |
| R4 | MotionLCM (GPU gesture) | Phase 16 | 12-16h |
| P12 | Contextual in-chat image gen | NSFW platforms | 16-24h |
| N7 | Dialogue act classification | NLP | 8-12h |
| N9 | Topic modeling (BERTopic) | NLP | 6-8h |
| N12 | ColBERT retriever | NLP | 12-16h |
| V5 | OpenVoice V2 conversion | Audio | 8-12h |
| E8 | Memory scrapbook | UX | 10-14h |
| E9 | Character sketch/art gen | UX | 10-14h |
| E10 | Shared world-building | UX | 16-24h |
| P13 | Conversation branching | KoboldAI | 16-24h |

**Total Tier C: ~123-176 hours**

---

## Recommended Implementation Order

### Sprint 1: Tier S Blitz (~30-47h)
*All Tier S features. Each is independent — can parallelize with agents.*

1. **R7** — RP model catalog update (1-2h) — warmup task
2. **P1** — Bond-gated content unlocking (2-4h) — highest impact/effort ratio
3. **P3** — Interaction mode switching (3-5h) — prompt templates only
4. **N4** — Sarcasm/irony detection (3-4h) — drop-in pipeline model
5. **E1** — Nostalgia triggers (4-6h) — uses existing memory infra
6. **P6** — Character journal → visible (4-6h) — surface existing journal.py
7. **P5** — Memory browser (view + delete) (4-6h) — scoped v1, pin/edit later
8. **V3** — Rhubarb lip sync (4-6h) — CPU-only, high delight
9. **R1** — emotion2vec+ SER (4-6h) — wire into voice pipeline

### Sprint 2: Retention Mechanics (~50h)
*The features that make users come back every day.*

9. **P9** — Daily engagement hooks + streaks (6-8h)
10. **P10** — Character proactive disclosure (6-8h)
11. **P11** — Relationship state prompt injection (14-20h) — THE retention feature
12. **P5** — User-editable memory manager (10-14h) — #1 user complaint

### Sprint 3: Intelligence Pipeline (~30h)
*Small ML models that make the character smarter.*

13. **N1** — GLiNER NER for knowledge graph (3-4h)
14. **N2** — Tiny toxicity detector (2-3h)
15. **V1** — Silero VAD v5 (3-4h)
16. **V2** — DeepFilterNet noise suppression (4-6h)
17. **N5** — Cross-encoder reranker (4-6h)
18. **N6** — Dialogue summarization model (4-6h)
19. **N8** — HyDE memory search (3-4h)

### Sprint 4: Voice & Immersion (~25h)
*Character-specific voices and deeper narrative tools.*

20. **V4** — Chatterbox Turbo voice cloning (8-12h)
21. **V6** — Moonshine v2 faster ASR (4-6h)
22. **P4** — Scenario templates (3-5h)
23. **P8** — Structured director mode (6-8h)

### Sprint 5: Emotional Depth (~35h)
*Features that create genuine emotional connection.*

24. **E2** — Character dream sequences (8-12h)
25. **E3** — Time capsule messages (8-10h)
26. **E6** — Compatibility quiz (6-8h)
27. **R3** — QLoRA personality adapters (12-20h)

### Sprint 6: World Building (~30h)
*Scene management and narrative structure.*

28. **P7** — Scene cards (8-12h)
29. **P2** — Context assembly viewer (6-8h)
30. **E4** — Daily fortune / oracle (3-5h)
31. **E5** — Wellness check-ins (3-5h)
32. **E7** — Character diary enhanced (4-6h)

### Remaining (Tier B+C): ~140-200h
*Do when all above complete, or as user requests.*

---

## Research Files Reference

| File | Domain | Features |
|------|--------|----------|
| `docs/research/2026-03-25-animation-and-ser-models.md` | Animation + SER | R1-R7 |
| `docs/research/2026-03-25-models-physics-personalization.md` | RP models + Physics + LoRA | R3, R5 |
| `docs/research/2026-03-25-nlp-dialogue-text-techniques.md` | NLP pipeline | N1-N12 |
| `docs/research/2026-03-25-nsfw-roleplay-platforms.md` | Platform competitive intel | P1-P13 |
| `docs/research/2026-03-25-audio-voice-music-techniques.md` | Voice pipeline | V1-V6 |
| `docs/research/2026-03-25-emotional-connection-features.md` | UX/engagement | E1-E10 |
| `docs/design/ai-model-ecosystem-analysis-2026-03-25.md` | Phase 16 summary | All |
