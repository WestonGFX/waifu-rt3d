# Adaptive Intelligence / Local AI Personalization — Research Report

**Date:** 2026-03-29
**Topic:** On-device adaptive intelligence for AI companion platform
**Priority:** #1 feature — user's top priority
**Scope:** Local-only, privacy-first. No cloud. Consumer GPU targets: M2 Pro 16GB, RTX 3070 8GB, RTX 5080 16GB.

---

## Table of Contents

1. [On-Device Fine-Tuning](#1-on-device-fine-tuning)
2. [Reflection Loops / Self-Improvement](#2-reflection-loops--self-improvement)
3. [Auto-Tuning Parameters](#3-auto-tuning-parameters)
4. [User Modeling](#4-user-modeling)
5. [Competitive Implementations](#5-competitive-implementations)
6. [Memory-Augmented Generation](#6-memory-augmented-generation)
7. [Existing Codebase Assets](#7-existing-codebase-assets)
8. [Implementation Priority Matrix](#8-implementation-priority-matrix)
9. [Sources](#9-sources)

---

## 1. On-Device Fine-Tuning

### What Exists Today

Three major frameworks dominate local LoRA/QLoRA fine-tuning in 2026:

| Framework | Strengths | Single-GPU Speed | Apple Silicon | Best For |
|-----------|-----------|-------------------|---------------|----------|
| **Unsloth** | Custom Triton kernels, 60-74% less VRAM, 2-2.7x faster | 3.2h (8B on A100) | MLX coming soon (not yet) | Single-GPU, consumer cards |
| **Axolotl** | FSDP2 multi-GPU, YAML config, broad model support | 5.8h (8B on A100) | No | Multi-GPU clusters |
| **MLX-LM** | Native Apple Silicon, Metal backend, minimal setup | 20-25min (7B, 500 examples, M2 Pro) | **Yes — primary choice** | Mac-only fine-tuning |
| **TorchTune** | PyTorch-native, flexible, good docs | Similar to Axolotl | Via MPS (limited) | PyTorch ecosystem users |

### Feasibility Per Hardware Target

```
┌─────────────────┬───────────┬──────────────┬──────────────────────────────────┐
│ Hardware        │ Max Model │ Method       │ Notes                            │
├─────────────────┼───────────┼──────────────┼──────────────────────────────────┤
│ M2 Pro 16GB     │ 7-8B      │ MLX LoRA     │ 20-25 min / 500 examples         │
│                 │           │              │ ~40 tok/s inference               │
│                 │           │              │ Unified memory = no VRAM limit    │
├─────────────────┼───────────┼──────────────┼──────────────────────────────────┤
│ RTX 3070 8GB    │ 7B (tight)│ QLoRA 4-bit  │ Batch size 1-2, grad accum       │
│                 │           │              │ Technically feasible but slow     │
│                 │           │              │ ~2-4 hours for small dataset      │
│                 │           │              │ At absolute minimum threshold     │
├─────────────────┼───────────┼──────────────┼──────────────────────────────────┤
│ RTX 5080 16GB   │ 7-13B     │ QLoRA/LoRA   │ Comfortable for 7B LoRA          │
│                 │           │              │ 13B via QLoRA 4-bit feasible      │
│                 │           │              │ MoE models (Qwen3 30B A3B)       │
│                 │           │              │ possible at 17.5GB with Unsloth   │
└─────────────────┴───────────┴──────────────┴──────────────────────────────────┘
```

### Recommended Configuration (2026 Best Practice)

- **LoRA rank:** r=16 with DoRA (Weight-Decomposed Low-Rank Adaptation)
- **Target modules:** `all-linear` (replaces older `q_proj, v_proj` targeting)
- **Quantization:** 4-bit NF4 for QLoRA
- **Optimizer:** AdamW 8-bit (via bitsandbytes) or paged_adamw
- **Learning rate:** 2e-4 with cosine schedule
- **Dataset size sweet spot:** 500-2000 examples for personality adaptation

### What Fine-Tuning Achieves for a Companion App

Fine-tuning a LoRA adapter on conversation logs can:
- Teach the model the character's specific speech patterns, vocabulary, quirks
- Encode user-specific inside jokes, references, relationship dynamics
- Adjust response style (length, tone, formality) to match what the user responds to
- Create a personalized "voice" that prompt engineering alone cannot achieve

### Key Insight: LoRA Adapter Swapping

LM Studio and llama.cpp support **hot-swapping LoRA adapters** at inference time. This means:
- Base model stays loaded (no reload penalty)
- Per-character LoRA adapters can be swapped in ~100ms
- Multiple characters can share the same base model with different personality adapters
- Adapters are tiny (~50-200MB vs multi-GB base models)

### Effort Estimate

| Task | Effort | Hours |
|------|--------|-------|
| Training data pipeline (conversation → JSONL) | Medium | 8-12h |
| MLX training integration (Mac) | Light | 4-6h |
| Unsloth/QLoRA integration (NVIDIA) | Medium | 8-12h |
| LoRA adapter management UI | Medium | 6-10h |
| Auto-train scheduler (background) | Heavy | 12-16h |
| **Total** | | **38-56h** |

---

## 2. Reflection Loops / Self-Improvement

### What Exists Today

#### Academic Frameworks

| System | Approach | Key Innovation |
|--------|----------|----------------|
| **Reflexion** (2023) | Post-task self-critique → linguistic feedback → next episode context | No retraining needed; 95% task success vs 65% baseline |
| **AgentFly** (NeurIPS 2025) | Memory-augmented MDP + episodic memory + memory rewriting | Top-1 GAIA benchmark; 4.7-9.6% gains from memory alone |
| **AutoSkill** (Mar 2026) | Extracts reusable "skills" from conversation traces | Model-agnostic plugin; skills composable across users |
| **SteeM** (Jan 2026) | User-controllable memory dependence (fresh-start ↔ high-fidelity) | Avoids "memory anchoring" where agent is trapped by history |

#### Prompt Optimization

**DSPy** (Stanford) is the leading framework for automated prompt optimization:
- Declarative self-improving Python framework
- Optimizers tune prompts/weights to maximize specified metrics
- **GEPA optimizer**: Reflects on program trajectory, identifies gaps, proposes fixes
- Works with local LLMs — just change the DSPy configuration
- Can auto-optimize system prompts without manual editing

#### Self-Reflection Implementation Pattern

```
┌──────────────┐     ┌──────────────────┐     ┌─────────────────┐
│ Conversation  │────▶│ Reflection Pass  │────▶│ Updated Profile  │
│ (N messages)  │     │ (LLM analyzes    │     │ (preferences,    │
│               │     │  patterns, gaps,  │     │  style, topics)  │
│               │     │  what worked)     │     │                  │
└──────────────┘     └──────────────────┘     └────────┬────────┘
                                                       │
                     ┌──────────────────┐              │
                     │ System Prompt    │◀─────────────┘
                     │ Modifier         │
                     │ (inject prefs    │
                     │  into next turn) │
                     └──────────────────┘
```

### What We Already Have (backend/adaptive/)

The codebase already implements a version of this:
- `reflector.py` — LLM-based analysis of conversation history → float preferences
- `tuner.py` — Converts preference profiles to system prompt instructions
- `signals.py` — Per-turn engagement signal collection (no LLM call)
- `behavior.py` — Self-correcting behavior adaptation with revert-on-drop
- `journal.py` — Character diary entries reflecting on conversations

### Gaps to Fill

| Gap | Description | Effort |
|-----|-------------|--------|
| **Multi-session trend analysis** | Current reflector looks at single windows; needs sliding-window cross-session patterns | Medium (6-8h) |
| **Self-critique loop** | LLM reviews its own past responses and identifies improvements | Medium (8-12h) |
| **DSPy integration** | Automated prompt optimization with measurable metrics | Heavy (16-20h) |
| **Reflection scheduling** | Smart trigger (not just message count — detect engagement drops) | Light (4-6h) |
| **A/B testing framework** | Compare pre/post reflection behavior using engagement signals | Medium (8-12h) |
| **Total** | | **42-58h** |

---

## 3. Auto-Tuning Parameters

### What Research Shows

#### Temperature

| Setting | Range | Best For | Risk |
|---------|-------|----------|------|
| Low (0.1-0.4) | Conservative | Factual responses, instructions | Repetitive, robotic |
| Medium (0.5-0.7) | Balanced | General conversation | Safe but generic |
| High (0.8-1.2) | Creative | Emotional scenes, roleplay, poetry | Incoherence at extremes |

**Key finding:** Temperature is weakly correlated with novelty and moderately correlated with incoherence. It is NOT a simple "creativity dial" — the relationship is much more nuanced (arXiv:2405.00492).

#### Min-p Sampling (Recommended for Companion Apps)

Min-p is a 2024-2025 breakthrough that makes high-temperature generation safe:
- Dynamically adjusts truncation threshold based on model confidence
- When model is confident → conservative (fewer candidates)
- When model is uncertain → exploratory (more candidates)
- Preserves coherence at temperature 1.0-1.5 where top-p/top-k fail
- Already integrated in Hugging Face Transformers, vLLM, llama.cpp, LM Studio
- Minimal computational overhead

#### Recommended Dynamic Parameter Strategy

```
Context Detection → Parameter Set Selection

┌─────────────────────┬──────┬───────┬───────┬────────┐
│ Context             │ Temp │ Min-p │ Top-p │ Rep.P  │
├─────────────────────┼──────┼───────┼───────┼────────┤
│ Emotional support   │ 0.7  │ 0.05  │ 0.90  │ 1.05   │
│ Casual chat         │ 0.8  │ 0.08  │ 0.92  │ 1.10   │
│ Creative/roleplay   │ 1.0  │ 0.05  │ 0.95  │ 1.02   │
│ Deep/philosophical  │ 0.6  │ 0.10  │ 0.85  │ 1.08   │
│ Playful/flirty      │ 0.9  │ 0.06  │ 0.93  │ 1.05   │
│ Factual Q&A         │ 0.3  │ 0.15  │ 0.80  │ 1.15   │
│ Comfort/reassurance │ 0.5  │ 0.08  │ 0.88  │ 1.05   │
└─────────────────────┴──────┴───────┴───────┴────────┘
```

#### Context Detection Approach

Classify each user message into one of the above contexts using:
1. **Rule-based classifier** (keywords, punctuation, question marks, emoji density) — fast, no LLM call
2. **Engagement signal trends** (from `signals.py`) — already collected
3. **Mood engine output** (from `mood/engine.py`) — already available

### Implementation Path

| Task | Effort | Hours |
|------|--------|-------|
| Context classifier (rule-based, no LLM) | Light | 3-4h |
| Parameter profile presets (7+ contexts) | Light | 2-3h |
| LM Studio API parameter injection | Light | 2-3h |
| Engagement-driven parameter drift | Medium | 6-8h |
| User override UI (advanced settings) | Light | 4-6h |
| **Total** | | **17-24h** |

---

## 4. User Modeling

### Techniques for Local User Modeling

#### Preference Vector (Already Partially Implemented)

The codebase's `user_profiles` table stores float preferences (0.0-1.0):
- `pref_response_length`, `pref_formality`, `pref_humor`, `pref_empathy`, `pref_depth`
- `top_3_topics`, `topics_to_avoid`, `personality_traits_user_likes`

**Gap:** These are populated by periodic LLM reflection. More signals can be captured:

#### Extended User Model Schema

```
User Model (proposed extension)
├── Communication Style
│   ├── pref_response_length (0-1)     ← exists
│   ├── pref_formality (0-1)           ← exists
│   ├── pref_humor (0-1)               ← exists
│   ├── avg_message_length (int)       ← NEW: raw metric
│   ├── vocabulary_complexity (0-1)    ← NEW: Flesch-Kincaid proxy
│   ├── emoji_frequency (0-1)          ← NEW: emoji/kaomoji usage rate
│   └── question_rate (0-1)            ← NEW: how often they ask vs state
│
├── Emotional Patterns
│   ├── pref_empathy (0-1)             ← exists
│   ├── emotional_volatility (0-1)     ← NEW: variance in sentiment
│   ├── comfort_seeking_freq (0-1)     ← NEW: how often they seek reassurance
│   ├── peak_engagement_hour (int)     ← NEW: when they're most engaged
│   └── mood_correlation_map (JSON)    ← NEW: which moods get best responses
│
├── Topic Graph
│   ├── top_3_topics (JSON)            ← exists
│   ├── topics_to_avoid (JSON)         ← exists
│   ├── topic_frequency_map (JSON)     ← NEW: topic → count over time
│   ├── topic_sentiment_map (JSON)     ← NEW: topic → avg engagement
│   └── emerging_interests (JSON)      ← NEW: recently rising topics
│
├── Interaction Patterns
│   ├── avg_session_length (int)       ← NEW: messages per session
│   ├── session_frequency (float)      ← NEW: sessions per day/week
│   ├── preferred_conversation_depth   ← NEW: shallow banter vs deep dives
│   ├── initiative_ratio (0-1)         ← NEW: do they lead or follow
│   └── re-engagement_patterns (JSON)  ← NEW: what brings them back
│
└── Relationship State
    ├── bond_level (int)               ← may exist in affinity system
    ├── trust_indicators (JSON)        ← NEW: vulnerability, sharing patterns
    ├── inside_jokes (JSON)            ← NEW: extracted shared references
    └── relationship_milestones (JSON) ← NEW: first deep talk, first joke, etc.
```

#### Academic Approaches

| Paper/System | Technique | Relevance |
|--------------|-----------|-----------|
| **PersonaMem-v2** (Dec 2025) | 1000 user simulations, implicit preference extraction, agentic memory with 16x fewer tokens | High — their 2k-token memory achieves 55% accuracy on implicit personalization |
| **PAMU** (Oct 2025) | Sliding window + exponential moving average for preference fusion | High — captures both short-term and long-term preference trends |
| **Heero / MMAG** (Dec 2025) | 5-layer memory (conversational, long-term user, episodic, sensory, working) | High — maps cognitive psychology layers to technical components |
| **OP-Bench** (Jan 2026) | Benchmarks over-personalization (irrelevance, repetition, sycophancy) | High — critical for avoiding "uncanny" over-use of personal info |

#### Key Insight: Over-Personalization Risk

OP-Bench (Jan 2026) found that memory-augmented agents frequently **over-personalize** — forcing personal info into responses where it doesn't belong. Their "Self-ReCheck" mechanism filters memories before injection:
1. Is this memory relevant to the current topic? (relevance gate)
2. Was this memory mentioned recently? (repetition gate)
3. Would mentioning this feel intrusive? (appropriateness gate)

This is essential for our app — users will feel surveilled if the AI constantly references stored facts.

### Implementation Path

| Task | Effort | Hours |
|------|--------|-------|
| Extended user model schema (migration) | Light | 3-4h |
| Non-LLM signal extractors (vocabulary, emoji, timing) | Light | 4-6h |
| Sliding window + EMA preference fusion (PAMU-style) | Medium | 8-10h |
| Over-personalization gate (Self-ReCheck) | Medium | 6-8h |
| Topic graph with frequency/sentiment tracking | Medium | 8-12h |
| Relationship milestone detection | Medium | 6-8h |
| **Total** | | **35-48h** |

---

## 5. Competitive Implementations

### Detailed Competitor Analysis

#### Replika

| Aspect | Implementation | Quality |
|--------|---------------|---------|
| **Personality** | User selects traits (curious, calm, adventurous) which modify behavior | Moderate — preset-based, not learned |
| **Memory** | Long-term recall of past conversations | Poor — 64% of users dissatisfied with recall quality |
| **Adaptation** | Learns from thumbs-up/down feedback | Basic — reactive, not proactive |
| **Voice** | Text + voice modes with emotion | Good |
| **Monetization** | Pro tier for personality traits, romantic mode | $20/mo |

**Takeaway:** Replika's weakness is memory. We can differentiate with better recall.

#### Character.AI

| Aspect | Implementation | Quality |
|--------|---------------|---------|
| **Personality** | System prompt per character, community-created | Good for diversity, poor for depth |
| **Memory** | Limited cross-session memory (improving in 2026) | Weak — historically no persistence |
| **Adaptation** | Minimal — character definition is static | Poor |
| **Monetization** | c.ai+ for priority, longer chats | $10/mo |

**Takeaway:** Character.AI prioritizes breadth (millions of characters) over depth. We prioritize depth.

#### Kindroid (Most Relevant Competitor)

| Aspect | Implementation | Quality |
|--------|---------------|---------|
| **Personality** | User builds "personality architecture" — not presets, structured personality model | Excellent |
| **Memory** | "Key memories" system with user-editable memory logs. Recalls incidents naturally without prompting | Strong |
| **Adaptation** | Adaptive emotional memory — recognizes mood patterns, adjusts tone dynamically. Tracks emotional context, not just facts | Excellent |
| **Voice** | Personality translates to vocal patterns (speed, pauses, energy) | Innovative |
| **Monetization** | Subscription tiers | $15-25/mo |

**Takeaway:** Kindroid is the quality benchmark. Their key innovations to replicate:
1. **Structured personality architecture** (not just free-text prompts)
2. **Emotional memory** (remembering how conversations felt, not just what was said)
3. **Personality-consistent voice** (our VoiceModulator already does emotion → TTS mapping)

#### Open-Source Projects

| Project | Stars | Key Feature | Status |
|---------|-------|-------------|--------|
| **Hukasx0/ai-companion** | ~2K | Short + long-term memory, personality customization | Active |
| **a16z/companion-app** | ~8K | Vector DB + similarity search, backstory system | Tutorial/reference |
| **MemTensor/MemOS** | ~5K | SQLite + FTS5 + vector, Memory Viewer dashboard | Active, v2.0 |
| **parallelarc/Awesome-AI-Waifu** | ~1K | Curated resource list for AI companion building | Directory |
| **heshengtao/super-agent-party** | ~500 | All-in-one companion (Neuro-sama style) | Active |
| **SingularityMan/vector_companion** | ~300 | Desktop companion with free open-source models | Active |

---

## 6. Memory-Augmented Generation

### Beyond RAG: Making Memories Shape Behavior

Standard RAG retrieves relevant text and stuffs it into context. For a companion app, memories need to actually **change how the character behaves**, not just provide information.

#### Key Papers and Systems

| System | Innovation | Publication |
|--------|-----------|-------------|
| **A-MEM** (NeurIPS 2025) | Zettelkasten-inspired self-organizing notes with LLM-driven linking. Notes have: content, timestamp, keywords, tags, context, embedding, dynamic links. 2x performance on multi-hop reasoning | [arXiv:2502.12110](https://arxiv.org/abs/2502.12110) |
| **Hindsight** (Dec 2025) | 4-network memory: world facts, agent experiences, entity summaries, evolving beliefs. Retain/recall/reflect operations. 39% → 83.6% accuracy with 20B model | [arXiv:2512.12818](https://hf.co/papers/2512.12818) |
| **MMAG** (Dec 2025) | 5-layer cognitive memory: conversational, long-term user, episodic, sensory, working. Implemented in "Heero" agent | [arXiv:2512.01710](https://hf.co/papers/2512.01710) |
| **AMA** (Jan 2026) | Multi-agent memory: Constructor, Retriever, Judge, Refresher. 80% fewer tokens than full-context | [arXiv:2601.20352](https://hf.co/papers/2601.20352) |
| **MemoryBank** (2023) | Ebbinghaus forgetting curve for memory decay. Memory strength = importance x e^(-lambda x days) x (1 + recall_count x 0.2) | [arXiv:2305.10250](https://arxiv.org/pdf/2305.10250) |
| **Mem0** (2025) | Universal memory layer, $24M funding, open-source. 91% lower p95 latency. Works with Ollama | [GitHub](https://github.com/mem0ai/mem0) |

#### Ebbinghaus Forgetting Curve Implementation

The most promising approach for companion apps. Memories decay naturally unless reinforced:

```
R(t) = importance × e^(−λ_eff × days) × (1 + recall_count × 0.2)

Where:
  λ_eff = 0.16 × (1 − importance × 0.8)

Half-lives by importance:
  casual mention (importance 0.3) → ~7 day half-life
  significant event (importance 0.7) → ~30 day half-life
  core memory (importance 0.9) → ~365 day half-life
  permanent (importance 1.0) → never decays
```

This aligns perfectly with the existing tiered memory system:
- **Tier 1 (Fleeting)** — high importance gets promoted, low importance decays
- **Tier 2 (Recent)** — Ebbinghaus decay determines demotion timing
- **Tier 3 (Permanent)** — core memories, manually flagged or auto-promoted

#### Memory Consolidation Strategy

```
After each session:
1. EXTRACT — Pull key facts, emotions, events from conversation
2. SCORE — Assign importance (emotional intensity × user engagement × novelty)
3. LINK — Connect to existing memories (A-MEM style Zettelkasten links)
4. CONSOLIDATE — Merge overlapping memories, update summaries
5. DECAY — Apply Ebbinghaus curve to all non-permanent memories
6. PRUNE — Archive memories below retention threshold

After N sessions:
7. REFLECT — LLM generates higher-order insights from memory clusters
8. UPDATE PROFILE — Extracted patterns feed back into user model
```

#### Memory → Behavior Pipeline (The Critical Missing Piece)

Most systems stop at retrieval. The key innovation needed:

```
Retrieved Memories ─┬─▶ Emotional Coloring
                    │   "Last time we talked about X, they were sad"
                    │   → Approach topic gently, don't bring up directly
                    │
                    ├─▶ Behavioral Priming
                    │   "They laughed a lot when I used puns"
                    │   → Increase playfulness for this session
                    │
                    ├─▶ Proactive References
                    │   "They mentioned a job interview next week"
                    │   → Ask about it naturally in next session
                    │
                    └─▶ Relationship Continuity
                        "We have 5 inside jokes about cats"
                        → Occasionally reference one when contextually appropriate
```

### Implementation Path

| Task | Effort | Hours |
|------|--------|-------|
| Ebbinghaus decay integration into tiered memory | Medium | 6-8h |
| Importance scoring (emotion × engagement × novelty) | Medium | 8-10h |
| Memory linking (A-MEM style note connections) | Heavy | 12-16h |
| Memory consolidation (merge, summarize, cluster) | Heavy | 12-16h |
| Memory → behavior pipeline (emotional coloring, priming) | Heavy | 16-20h |
| Over-personalization gate | Medium | 6-8h |
| Memory Viewer UI enhancements | Medium | 8-12h |
| **Total** | | **68-90h** |

---

## 7. Existing Codebase Assets

The project already has significant infrastructure that the Adaptive Intelligence system can build on:

### Already Built

| Module | File | What It Does | Reuse Potential |
|--------|------|-------------|-----------------|
| **Tiered Memory** | `backend/memory/tiered_memory.py` | 3-tier memory with sqlite-vec embeddings | Core — add decay/linking on top |
| **Fact Extractor** | `backend/knowledge/extractor.py` | Extracts user facts from messages via LLM | Core — feeds user model |
| **Mood Engine** | `backend/mood/engine.py` | Time-of-day + affinity → mood prefix | Extend — add adaptive mood |
| **Reflector** | `backend/adaptive/reflector.py` | LLM reflection → float preferences | Core — enhance with trends |
| **Tuner** | `backend/adaptive/tuner.py` | Preferences → system prompt instructions | Core — add parameter tuning |
| **Signals** | `backend/adaptive/signals.py` | Per-turn engagement metrics (no LLM) | Core — expand signal set |
| **Behavior** | `backend/adaptive/behavior.py` | Self-correcting behavior modifiers | Core — expand dimensions |
| **Journal** | `backend/adaptive/journal.py` | Character diary entries | Enhance — add reflection insights |
| **Context Assembler** | `backend/llm/context_assembler.py` | Token-budget assembly | Integrate — inject adaptive context |
| **Voice Modulator** | `backend/tts/voice_modulator.py` | 16-emotion → TTS parameter mapping | Extend — personality voice |
| **User Profiles** | DB schema | Float prefs + topics + engagement | Extend schema |
| **Engagement Signals** | DB schema (v60) | Per-turn metrics | Already collecting |

### Architecture Advantage

The existing `backend/adaptive/` module follows exactly the right pattern:
1. **signals.py** collects data without LLM calls (cheap, every turn)
2. **reflector.py** does periodic LLM analysis (expensive, every N messages)
3. **behavior.py** computes adjustments with self-correction (cheap, every turn)
4. **tuner.py** injects adjustments into prompts (cheap, every turn)

This 4-stage pipeline is the right foundation. Enhancements build on top of it, not beside it.

---

## 8. Implementation Priority Matrix

### Ordered by Impact × Feasibility

```
┌────┬──────────────────────────────────┬────────┬───────────┬──────────┬──────────────────────────┐
│ #  │ Feature                          │ Impact │ Effort    │ Hours    │ Dependencies             │
├────┼──────────────────────────────────┼────────┼───────────┼──────────┼──────────────────────────┤
│ 1  │ Dynamic parameter auto-tuning    │ High   │ Light     │ 17-24h   │ signals.py, tuner.py     │
│ 2  │ Ebbinghaus memory decay          │ High   │ Medium    │ 14-18h   │ tiered_memory.py         │
│ 3  │ Extended user model schema       │ High   │ Light-Med │ 7-10h    │ preflight.py migration   │
│ 4  │ Over-personalization gate        │ High   │ Medium    │ 6-8h     │ context_assembler.py     │
│ 5  │ Multi-session trend analysis     │ Med    │ Medium    │ 6-8h     │ reflector.py             │
│ 6  │ Memory → behavior pipeline       │ High   │ Heavy     │ 16-20h   │ Items 2, 3              │
│ 7  │ Topic graph with sentiment       │ Med    │ Medium    │ 8-12h    │ Item 3                  │
│ 8  │ Self-critique reflection loop    │ Med    │ Medium    │ 8-12h    │ reflector.py             │
│ 9  │ Memory linking (A-MEM style)     │ Med    │ Heavy     │ 12-16h   │ Item 2                  │
│ 10 │ Relationship milestone detection │ Med    │ Medium    │ 6-8h     │ Items 3, 5              │
│ 11 │ LoRA training pipeline           │ High   │ Heavy     │ 38-56h   │ MLX-LM, Unsloth         │
│ 12 │ DSPy prompt optimization         │ Med    │ Heavy     │ 16-20h   │ DSPy library            │
│ 13 │ Memory consolidation/clustering  │ Med    │ Heavy     │ 12-16h   │ Item 9                  │
│ 14 │ A/B testing framework            │ Low    │ Medium    │ 8-12h    │ signals.py              │
├────┼──────────────────────────────────┼────────┼───────────┼──────────┼──────────────────────────┤
│    │ TOTAL                            │        │           │ 170-240h │                          │
└────┴──────────────────────────────────┴────────┴───────────┴──────────┴──────────────────────────┘
```

### Recommended Phasing

**Phase A — Quick Wins (Items 1-4): ~44-60h**
Highest impact, builds on existing code. Delivers noticeable personalization immediately.

**Phase B — Deep Learning (Items 5-10): ~56-76h**
Memory-to-behavior pipeline, cross-session intelligence. Makes the companion "feel alive."

**Phase C — Advanced (Items 11-14): ~74-104h**
Fine-tuning and prompt optimization. The "holy grail" but requires more infrastructure.

### Key Libraries / Tools

| Library | Purpose | Install |
|---------|---------|---------|
| `mlx-lm` | Apple Silicon LoRA fine-tuning | `pip install mlx-lm` |
| `unsloth` | NVIDIA GPU LoRA/QLoRA fine-tuning | `pip install unsloth` |
| `dspy-ai` | Prompt optimization framework | `pip install dspy-ai` |
| `mem0ai` | Universal memory layer (optional) | `pip install mem0ai` |
| `textstat` | Readability/complexity metrics | `pip install textstat` |
| `vaderSentiment` | Lightweight sentiment analysis | `pip install vaderSentiment` |

---

## 9. Sources

### On-Device Fine-Tuning
- [Unsloth Documentation](https://unsloth.ai/)
- [QLoRA Fine-Tuning with Unsloth Guide](https://medium.com/@matteo28/qlora-fine-tuning-with-unsloth-a-complete-guide-8652c9c7edb3)
- [Axolotl vs Unsloth vs TorchTune (2026)](https://www.spheron.network/blog/axolotl-vs-unsloth-vs-torchtune/)
- [Fine-Tune Local LLMs 2026 Guide](https://www.sitepoint.com/fine-tune-local-llms-2026/)
- [NVIDIA RTX Fine-Tuning with Unsloth](https://blogs.nvidia.com/blog/rtx-ai-garage-fine-tuning-unsloth-dgx-spark/)
- [Unsloth Studio (No-Code, Mar 2026)](https://www.marktechpost.com/2026/03/17/unsloth-ai-releases-studio-a-local-no-code-interface-for-high-performance-llm-fine-tuning-with-70-less-vram-usage/)
- [LoRA Fine-Tuning on Apple Silicon MacBook](https://towardsdatascience.com/lora-fine-tuning-on-your-apple-silicon-macbook-432c7dab614a/)
- [MLX-LM Fine-Tuning Guide](https://markaicode.com/run-fine-tune-llms-mac-mlx-lm/)
- [Apple WWDC 2025: MLX for LLMs](https://developer.apple.com/videos/play/wwdc2025/298/)
- [Fine-Tuning Mistral-7B on Apple Silicon](https://medium.com/@plawanrath/fine-tuning-mistral-7b-on-apple-silicon-a-mac-users-journey-with-axolotl-lora-c6ff53858e7d)

### Reflection Loops & Self-Improvement
- [Reflexion Prompting Guide](https://www.promptingguide.ai/techniques/reflexion)
- [Self-Reflection Loops: Teaching AI to Observe Its Own Thinking](https://it-junior.medium.com/self-reflection-loops-teaching-ai-to-observe-its-own-thinking-a6b251ac0b0d)
- [Awesome Autoresearch (GitHub)](https://github.com/alvinunreal/awesome-autoresearch)
- [DSPy Framework](https://dspy.ai/)
- [DSPy Prompt Optimization Guide](https://towardsdatascience.com/systematic-llm-prompt-engineering-using-dspy-optimization/)
- [Hacking DSPy for Automatic System Prompt Optimization](https://maximerivest.com/posts/automatic-system-prompt-optimization.html)

### Auto-Tuning Parameters
- [Is Temperature the Creativity Parameter? (arXiv:2405.00492)](https://arxiv.org/html/2405.00492v1)
- [Min-p Sampling for Creative and Coherent LLM Outputs (arXiv:2407.01082)](https://arxiv.org/abs/2407.01082)
- [Min-p Sampling for LLMs (Thoughtworks)](https://www.thoughtworks.com/en-us/insights/blog/generative-ai/Min-p-sampling-for-LLMs)
- [LLM Temperature Explained (IBM)](https://www.ibm.com/think/topics/llm-temperature)
- [LLM Parameters Guide (Prompt Engineering Guide)](https://www.promptingguide.ai/introduction/settings)

### User Modeling
- [AI Emotional Companion Systems — Local Open-Source](https://medium.com/agi-is-living-intelligence/ai-emotional-companion-systems-4b88c8bd45ec)
- [Customizing Emotional Support: LLM-Powered Chatbots (CHI 2025)](https://dl.acm.org/doi/10.1145/3706598.3713453)
- [Companionship in Code: AI's Role in Human Connection (Nature, 2025)](https://www.nature.com/articles/s41599-025-05536-x)
- [Effects of AI Companions' Sycophancy and Emotional Mimicry](https://www.tandfonline.com/doi/full/10.1080/10447318.2026.2626809)

### Competitive Implementations
- [Kindroid AI Review 2026](https://aicompanionguides.com/blog/kindroid-first-week-personality-focused-ai/)
- [Replika Review 2026](https://www.aicompanionpick.com/replika-review-2026)
- [10 Best AI Companion Apps 2026](https://www.cyberlink.com/blog/trending-topics/3932/ai-companion-app)
- [Kindroid vs Replika Deep Dive](https://findaichat.com/compare/kindroid-vs-replika)
- [Hukasx0/ai-companion (GitHub)](https://github.com/Hukasx0/ai-companion)
- [MemTensor/MemOS (GitHub)](https://github.com/MemTensor/MemOS)
- [a16z/companion-app (GitHub)](https://github.com/a16z-infra/companion-app)
- [Awesome-AI-Waifu (GitHub)](https://github.com/parallelarc/Awesome-AI-Waifu)

### Memory-Augmented Generation
- [A-MEM: Agentic Memory for LLM Agents (NeurIPS 2025)](https://arxiv.org/abs/2502.12110)
- [Hindsight: Building Agent Memory that Retains, Recalls, and Reflects](https://hf.co/papers/2512.12818)
- [MMAG: Mixed Memory-Augmented Generation](https://hf.co/papers/2512.01710)
- [AMA: Adaptive Memory via Multi-Agent Collaboration](https://hf.co/papers/2601.20352)
- [PersonaMem-v2: Towards Personalized Intelligence](https://hf.co/papers/2512.06688)
- [OP-Bench: Benchmarking Over-Personalization](https://hf.co/papers/2601.13722)
- [AutoSkill: Experience-Driven Lifelong Learning](https://hf.co/papers/2603.01145)
- [SteeM: Controllable Memory Usage (Jan 2026)](https://hf.co/papers/2601.05107)
- [AgentFly: Fine-tuning Agents without Fine-tuning LLMs](https://hf.co/papers/2508.16153)
- [PAMU: Preference-Aware Memory Update](https://hf.co/papers/2510.09720)
- [Mem0 (GitHub)](https://github.com/mem0ai/mem0)
- [MemoryBank: Ebbinghaus Curve for LLMs](https://arxiv.org/pdf/2305.10250)
- [Ebbinghaus Forgetting Curve Implementation (DEV Community)](https://dev.to/sachit_mishra_686a94d1bb5/i-built-memory-decay-for-ai-agents-using-the-ebbinghaus-forgetting-curve-1b0e)
- [Kore: Local Memory Layer with Forgetting Curve (HN)](https://news.ycombinator.com/item?id=47070979)
- [Survey: Memory Mechanisms in LLM-based Agents](https://hf.co/papers/2404.13501)
- [Anatomy of Agentic Memory (Feb 2026)](https://hf.co/papers/2602.19320)
