# AI Model Ecosystem Analysis — Phase 16

**Date:** 2026-03-25
**Author:** Claude Opus 4.6 (research agents) + Chris (review)
**Purpose:** Catalog available AI models across 5 categories for integration into Waifu-RT3D
**Hardware targets:** Mac M2 Pro (24GB), Win RTX 5080 (16GB VRAM), Win RTX 3070 (8GB VRAM)

---

## Executive Summary

| Category | Top Pick | Params | Why | Effort |
|----------|----------|--------|-----|--------|
| Animation Generation | **MoMask** (CPU) / **MotionLCM** (GPU) | 45M / 50M | CPU-capable idle gestures / real-time GPU motion | 8-12h / 12-16h |
| Speech Emotion Recognition | **emotion2vec+ base** | 90M | 9 emotions, SOTA, MIT, fits voice pipeline | 4-6h |
| Conversation / Roleplay | **Fimbulvetr 11B v2** | 11B | Gold standard RP, fits all 3 machines | Already supported |
| Physics / Cloth | **@pixiv/three-vrm-springbone** | N/A | Native VRM, production-ready, zero integration cost | 2-4h tuning |
| On-Device Personalization | **QLoRA via Unsloth** | N/A | 8B fine-tune on RTX 3070, <50MB adapters | 12-20h |

**Total new implementation effort:** ~40-60 hours across all categories.

---

## Category 1: Animation Generation

Models that convert text/emotion descriptions into human motion sequences (SMPL joints).

### Top Picks

| Model | Params | Speed | HW Reqs | Quality | License | Best For |
|-------|--------|-------|---------|---------|---------|----------|
| **MotionLCM** | ~50M | **30ms**/seq | ~4GB VRAM | SOTA (ECCV 2024) | MIT | Real-time gesture during conversation |
| **MoMask** | 45M | 180ms/seq | **CPU only** | High (CVPR 2024) | MIT | Idle animation on any machine |
| **EMDM** | ~20M | 20-50ms/seq | ~4GB VRAM | MDM-quality | MIT | Fast alternative to MotionLCM |

### Also Evaluated

| Model | Verdict |
|-------|---------|
| MDM (20M) | Foundational but slow (2-12s). Use as reference only. |
| T2M-GPT (40M) | Solid quality, slower than MoMask. |
| MotionGPT (200M) | Interesting NLP integration, too heavy for real-time. |
| EDGE (30M) | Dance-only (music-conditioned). Niche use for music-reactive idle. |
| MotionDiffuse (30M) | Unique body-part control but slow inference. |

### Critical Note: SMPL-to-VRM Pipeline Required

All animation models output SMPL joint data. Conversion to VRM:
```
Model → SMPL joints → smpl2bvh → BVH → Three.js BVHLoader
  → SkeletonUtils.retargetClip(MIXAMO_BONE_MAP) → VRM avatar
```
Existing `viewer.html` already has `MIXAMO_BONE_MAP` and `AnimationDirector` — retargeting slots into current architecture.

For Live2D: extract upper-body angles → map to Live2D params (ParamAngleX/Y/Z, ParamBodyAngleX/Y/Z).

**Training data caveat:** HumanML3D/KIT-ML datasets are biased toward walking/sports. Anime gestures (head tilt, peace sign, shy fidget) would need custom fine-tuning or procedural generation.

---

## Category 2: Speech Emotion Recognition

Models that detect emotion from user audio, feeding into MoodEngine and VRM expressions.

### Top Picks

| Model | Params | Emotions | Accuracy | Speed | VRAM | License | HF ID |
|-------|--------|----------|----------|-------|------|---------|-------|
| **emotion2vec+ base** | 90M | 9 classes | SOTA (10+ langs) | 50Hz frame-level | ~1GB | MIT | `emotion2vec/emotion2vec_plus_base` |
| **SpeechBrain wav2vec2** | 95M | 4 classes | 78.7% IEMOCAP | ~100ms | ~1GB | Apache-2.0 | `speechbrain/emotion-recognition-wav2vec2-IEMOCAP` |
| **Wav2Small** | **72K** | 3 dimensional | CCC 0.66 | Ultra-fast | **CPU** | MIT | GitHub only |

### Integration Path

emotion2vec+'s 9 emotion classes map directly to the existing 16-emotion VoiceModulator:

| emotion2vec+ class | VoiceModulator mapping |
|--------------------|----------------------|
| angry | anger |
| disgusted | disgust |
| fearful | fear |
| happy | joy, excitement |
| neutral | neutral |
| sad | sadness |
| surprised | surprise |
| other/unknown | neutral (fallback) |

Pipeline:
```
User audio (duplex voice) → 16kHz resample → emotion2vec+ base (90M, ~20ms)
  → 9-class emotion → MoodEngine.update_from_speech() → VRM expression + voice modulation
```

**Wav2Small** (72K params, 120KB ONNX) is a fascinating always-on arousal monitor — runs continuously on CPU to detect engagement shifts without GPU cost.

---

## Category 3: Conversation / Roleplay Models

Local LLMs optimized for character roleplay, evaluated for quality and hardware fit.

### Per-Machine Recommendations

| Machine | Best Model | Size | Quant | VRAM | RP Quality | License |
|---------|-----------|------|-------|------|------------|---------|
| RTX 3070 (8GB) | DreamGen Opus v1.2 8B | 8B | Q4_K_M | ~5GB | A | Apache-2.0 |
| RTX 3070 (8GB) | Lumimaid/Stheno 8B | 8B | Q4_K_M | ~5GB | A- | Llama 3.1 |
| RTX 5080 (16GB) | **Fimbulvetr 11B v2** | 11B | Q6_K | ~10.5GB | **A+** | CC-BY-NC-4.0 |
| RTX 5080 (16GB) | MN Violet Lotus 12B | 12B | Q5_K_M | ~9GB | A | Apache-2.0 |
| M2 Pro (24GB) | Fimbulvetr 11B v2 | 11B | Q5_K_M | ~9GB | A+ | CC-BY-NC-4.0 |
| M2 Pro (24GB) | DreamGen Opus 34B | 34B | Q4_K_M | ~20GB | A+ | Apache-2.0 |

### Key Findings

1. **Fimbulvetr 11B v2** (`Sao10K/Fimbulvetr-11B-v2-GGUF`) — consensus gold standard for RP under 14B
2. **DreamGen Opus** — unique steerability via scene direction tokens, excellent for companion apps
3. **MN Violet Lotus 12B** — Mistral Nemo base, 128K native context, rising star
4. **Legacy models aging out** — MythoMax, Psyfighter, WizardLM Uncensored still work but outclassed by Llama 3 / Mistral Nemo bases
5. **70B quality ceiling** — Midnight Miqu 70B v1.5, Euryale L3 70B v2.1 (need 40GB+ VRAM)

### Action Item

Update `backend/config/app.json` model catalog to include Fimbulvetr 11B v2, MN Violet Lotus 12B, and DreamGen Opus 8B with content ratings and quality scores.

---

## Category 4: Physics / Cloth Simulation

### Recommendation: Use What's Already There

**`@pixiv/three-vrm-springbone` (v3.4.4)** is production-ready and native to the Three.js/VRM stack:
- Verlet integration with stiffness, gravity, drag, collision
- Hair, tails, ribbons, earrings work out of the box
- Negligible performance overhead at 60fps
- Configurable per-bone: `stiffness` (0-1), `gravityPower`, `dragForce`, `hitRadius`

### What To Skip

| Approach | Verdict |
|----------|---------|
| Neural cloth (HOOD, LayersNet, ContourCraft) | Python/CUDA only, no web runtime, months to port |
| PICA (3DGS + GNN) | Offline rendering, not applicable |

### Future Path

| Phase | Technology | When |
|-------|-----------|------|
| Now | VRM SpringBone tuning per character | 2-4h |
| Later | CPU Verlet cloth for skirts/capes (<500 verts) | 8-12h |
| Future | WebGPU compute shader cloth (Feb 2026 article) | When WebGPU adoption stabilizes |

---

## Category 5: On-Device Personalization

### Method Comparison

| Method | VRAM | Training Time | Dataset | Quality | RTX 3070? |
|--------|------|---------------|---------|---------|-----------|
| **QLoRA** | 4-8GB | 30min-2hr | 100-1000 examples | High | **Yes** |
| LoRA (16-bit) | 10-20GB | 20min-1hr | 100-1000 examples | Higher | No (>8B) |
| Prompt Tuning | ~1GB extra | 10-30min | 50-500 examples | Moderate | Yes |
| RAG (no training) | 0 extra | Instant | Any | Facts only | Yes |
| Full Fine-tuning | 28+GB | Hours | 1000+ | Highest | No |

### Recommended Strategy: Hybrid RAG + QLoRA

```
Tier 1 — RAG (Already Built):
  User Knowledge Graph + Tiered Episodic Memory
  Add: conversation style extraction, preference vectors
  Cost: 0 VRAM, instant

Tier 2 — QLoRA Personality Adapters:
  Train per-character LoRA on 200-500 curated exchanges
  Base: 8B model + QLoRA r=16, alpha=32, DoRA=true
  VRAM: 7-8GB training (RTX 3070), 5GB inference
  Adapter size: 20-100MB each, hot-swap in <1s via llama.cpp
  Schedule: Retrain weekly in background

Tier 3 — Multi-Adapter (Future):
  One adapter per personality facet (humor, empathy, formality)
  Dynamic merge/swap based on mood engine state
```

### 2026 Best Practices

| Setting | Value |
|---------|-------|
| Starting config | r=16, alpha=32, DoRA=true |
| Target modules | "all-linear" |
| Dataset quality | 200-500 curated > 5000 noisy |
| Max trainable params | <0.5% of base model |
| Key tool | **Unsloth** (2x faster, 70% less VRAM) |
| Inference adapter loading | llama.cpp `--lora` flag, <1s load time |

### QLoRA Hardware Profiles

| Config | Model | Rank | VRAM | Throughput |
|--------|-------|------|------|-----------|
| RTX 3070 minimal | Qwen2.5-1.5B | r=8 | ~4GB | ~150 tok/s |
| RTX 3070 balanced | Qwen2.5-1.5B | r=16 | ~6GB | ~120 tok/s |
| RTX 3070 max quality | Llama 3.1 8B | r=16 | ~7.5GB | ~40 tok/s |
| RTX 5080 comfortable | Llama 3.1 8B | r=32 | ~10GB | ~80 tok/s |

---

## Implementation Priority Matrix

| Priority | Category | Model/Tool | Effort | Impact | Dependencies |
|----------|----------|-----------|--------|--------|-------------|
| **P1** | SER | emotion2vec+ base | 4-6h | High — emotion-reactive avatar | Voice duplex pipeline exists |
| **P2** | Animation | MoMask (CPU) | 8-12h | High — varied idle gestures | SMPL→VRM pipeline needed |
| **P3** | Personalization | QLoRA adapters | 12-20h | High — character adapts to user | Unsloth + training data pipeline |
| **P4** | Animation | MotionLCM (GPU) | 12-16h | Medium — real-time conversation gesture | SMPL→VRM pipeline (shared with P2) |
| **P5** | Physics | SpringBone tuning | 2-4h | Medium — per-character physics feel | Already available in three-vrm |
| **P6** | SER | Wav2Small (always-on) | 2-3h | Low — background engagement monitor | emotion2vec+ integration first |
| **P7** | RP Models | Model catalog update | 1-2h | Low — informational, not code | None |

**Total: ~42-63 hours** across all priorities.

---

## Detailed Research

Full model tables, papers, community sentiment, and source links:
- [`docs/research/2026-03-25-animation-and-ser-models.md`](../research/2026-03-25-animation-and-ser-models.md) — Categories 1-2
- [`docs/research/2026-03-25-models-physics-personalization.md`](../research/2026-03-25-models-physics-personalization.md) — Categories 3-5
