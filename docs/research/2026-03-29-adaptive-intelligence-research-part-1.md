# Adaptive Intelligence / Local AI Personalization — Research Report

> **This is Part 1 of 3.** See also: [Part 2](2026-03-29-adaptive-intelligence-research-part-2.md), [Part 3](2026-03-29-adaptive-intelligence-research-part-3.md)


**Date:** 2026-03-29
**Topic:** On-device adaptive intelligence for AI companion platform
**Priority:** #1 feature — user's top priority
**Scope:** Local-only, privacy-first. No cloud. Consumer GPU targets: M2 Pro 16GB, RTX 3070 8GB, RTX 5080 16GB.
**Word Count Target:** 20,000+
**Related Specs:** `docs/plans/2026-03-29-adaptive-intelligence-specs.md` (to be created)
**Related Code:** `backend/adaptive/` (reflector, tuner, signals, behavior, journal)

---

## Table of Contents

1. [On-Device Fine-Tuning](#1-on-device-fine-tuning)
2. [Reflection Loops / Self-Improvement](#2-reflection-loops--self-improvement)
3. [Auto-Tuning Parameters](#3-auto-tuning-parameters)
4. [User Modeling](#4-user-modeling)
5. [Competitive Implementations](#5-competitive-implementations)
6. [DSPy Deep Dive with GEPA Optimizer](#6-dspy-deep-dive-with-gepa-optimizer)
7. [Prompt Engineering for Personalization](#7-prompt-engineering-for-personalization)
8. [A-MEM and Hindsight Papers Analysis](#8-a-mem-and-hindsight-papers-analysis)
9. [Ebbinghaus Forgetting Curve — Math and Implementation](#9-ebbinghaus-forgetting-curve--math-and-implementation)
10. [Local Embedding Models Comparison](#10-local-embedding-models-comparison)
11. [Sentiment and Emotion Detection Models](#11-sentiment-and-emotion-detection-models)
12. [Behavioral Adaptation Patterns](#12-behavioral-adaptation-patterns)
13. [Long-Term Personality Evolution](#13-long-term-personality-evolution)
14. [Privacy and Ethics of Personalization](#14-privacy-and-ethics-of-personalization)
15. [Evaluation Metrics](#15-evaluation-metrics)
16. [Full System Architecture](#16-full-system-architecture)
17. [Existing Codebase Assets](#17-existing-codebase-assets)
18. [Implementation Priority Matrix](#18-implementation-priority-matrix)
19. [Sources](#19-sources)

---

## 1. On-Device Fine-Tuning

### 1.1 The Mathematics of LoRA, QLoRA, and DoRA

#### LoRA (Low-Rank Adaptation)

LoRA is the foundational technique for parameter-efficient fine-tuning. The core mathematical insight is that the weight update matrix during fine-tuning has low intrinsic rank. Instead of updating the full weight matrix W (dimensions d x k), LoRA decomposes the update into two smaller matrices:

```
W' = W + ΔW = W + B × A

Where:
  W ∈ ℝ^(d×k)     — frozen pre-trained weight matrix
  B ∈ ℝ^(d×r)     — learned down-projection
  A ∈ ℝ^(r×k)     — learned up-projection
  r << min(d, k)   — the rank (typically 8, 16, 32, or 64)

Trainable parameters per layer = r × (d + k)
vs. full fine-tuning:         = d × k

For a typical transformer attention layer (d=4096, k=4096):
  Full fine-tuning: 16,777,216 parameters
  LoRA r=16:        131,072 parameters (0.78% of full)
  LoRA r=64:        524,288 parameters (3.12% of full)
```

The scaling factor alpha controls the magnitude of the LoRA update:

```
W' = W + (α / r) × B × A

Where α (alpha) is typically set to 2×r (e.g., alpha=32 for r=16).
This ensures the update magnitude stays consistent across different rank choices.
```

During initialization, A is initialized from a Gaussian distribution and B is initialized to zero, so the LoRA update starts at zero and the model begins training from the pre-trained weights.

#### QLoRA (Quantized LoRA)

QLoRA adds three memory-saving innovations on top of LoRA:

1. **4-bit NormalFloat (NF4) Quantization:** The base model weights are quantized from 16-bit to 4-bit using a quantization scheme optimized for normally distributed weights. NF4 is information-theoretically optimal for normally distributed data, which is a good approximation for neural network weights.

2. **Double Quantization:** The quantization constants themselves are quantized — the scale factors used in 4-bit quantization are stored in 8-bit format, saving an additional ~0.37 bits per parameter.

3. **Paged Optimizers:** Optimizer states (which require 8 bytes per parameter for Adam) are automatically paged between GPU VRAM and CPU RAM during memory spikes, preventing OOM crashes.

The memory savings math:

```
Full model (16-bit):  Parameters × 2 bytes
QLoRA base (4-bit):   Parameters × 0.5 bytes + quantization overhead
LoRA adapters (16-bit): r × (d + k) × num_layers × 2 bytes

Example for Llama-3 8B:
  Full 16-bit:              8B × 2 = 16.0 GB
  QLoRA 4-bit base:         8B × 0.5 = 4.0 GB
  LoRA adapters (r=16):     ~50 MB
  Optimizer states (Adam):  ~100 MB (for adapters only)
  Activations (batch=1):    ~2-4 GB (depends on sequence length)
  ─────────────────────────────────────
  Total QLoRA training:     ~6-8 GB (vs 16+ GB for full LoRA)
```

QLoRA achieves approximately 80-90% of full fine-tuning quality. The additional quantization noise affects some tasks more than others, and evaluation on target tasks determines acceptability. For personality adaptation in a companion app, the quality gap is minimal because we are adjusting style and tone rather than teaching new factual knowledge.

#### DoRA (Weight-Decomposed Low-Rank Adaptation)

DoRA, published at ICML 2024 (Oral) by NVIDIA Research, introduces a key insight about how LoRA and full fine-tuning differ in their learning patterns.

**The Core Finding:** Full fine-tuning (FT) can independently adjust the *magnitude* and *direction* of weight vectors, while LoRA tends to change them proportionally — it lacks the capability to make subtle directional changes without also changing magnitude. This limits LoRA's expressiveness.

**DoRA's Solution:** Decompose the pre-trained weight matrix into magnitude and direction components using weight normalization (Salimans & Kingma, 2016):

```
W = m × (V / ||V||_c)

Where:
  m ∈ ℝ^(1×k)  — magnitude vector (one scalar per column)
  V ∈ ℝ^(d×k)  — directional matrix
  ||V||_c       — column-wise L2 norm

DoRA then applies LoRA only to the directional component:
  W' = (m + Δm) × ((V + B×A) / ||V + B×A||_c)

Where:
  Δm            — learned magnitude update (very few parameters)
  B×A           — standard LoRA update on direction
```

**Why DoRA Matters for Companion Apps:**

- Consistently outperforms LoRA across all benchmarks with negligible extra cost
- The magnitude/direction decomposition maps well to personality fine-tuning: *direction* controls what the model says (topic, style), *magnitude* controls how strongly it says it (emphasis, confidence)
- Can be merged back into the base model at inference time — zero overhead
- In PEFT library: simply set `use_dora=True` in the LoRA config

**DoRA vs LoRA Quality Comparison:**

```
┌────────────────────┬────────────┬────────────┬────────────┐
│ Task               │ LoRA r=16  │ DoRA r=16  │ Full FT    │
├────────────────────┼────────────┼────────────┼────────────┤
│ Commonsense (avg)  │ 82.4%      │ 83.7%      │ 84.2%      │
│ Visual Instruction │ 74.1%      │ 75.8%      │ 76.3%      │
│ Image/Video QA     │ 69.2%      │ 71.0%      │ 71.5%      │
│ MTEB Retrieval     │ 54.8%      │ 56.2%      │ 56.9%      │
└────────────────────┴────────────┴────────────┴────────────┘
```

DoRA closes roughly 60-70% of the gap between LoRA and full fine-tuning.

### 1.2 Framework Comparison: Unsloth, MLX-LM, Axolotl, TorchTune

#### Detailed Framework Matrix

```
┌──────────────┬─────────────────────────┬────────────────────┬──────────────────────┬─────────────────────┐
│ Feature      │ Unsloth                 │ MLX-LM             │ Axolotl              │ TorchTune           │
├──────────────┼─────────────────────────┼────────────────────┼──────────────────────┼─────────────────────┤
│ Speed        │ 2-5x faster (Triton)    │ Native Metal perf  │ Standard PyTorch     │ PyTorch 2.5 compile │
│ VRAM Savings │ 60-80% less             │ Unified memory     │ Standard             │ Standard            │
│ GPU Support  │ NVIDIA only (Triton)    │ Apple Silicon only │ NVIDIA (multi-GPU)   │ NVIDIA + MPS        │
│ Multi-GPU    │ No (single-GPU only)    │ No                 │ Yes (FSDP2, DeepSp)  │ Yes (FSDP)          │
│ Config Style │ Python API              │ CLI + Python       │ YAML declarative     │ YAML + Python       │
│ LoRA Methods │ LoRA, QLoRA, DoRA       │ LoRA               │ LoRA, QLoRA, GPTQ    │ LoRA, QLoRA         │
│ Model Compat │ Llama, Mistral, Gemma,  │ Any MLX-supported  │ Very broad           │ Llama, Gemma,       │
│              │ Qwen, Phi, DeepSeek     │ model              │                      │ Mistral             │
│ Training     │ SFT, DPO, ORPO, PPO     │ SFT only (LoRA)    │ SFT, DPO, RLHF      │ SFT, DPO, PPO       │
│ Ease of Use  │ Very easy               │ Very easy          │ Moderate (YAML)      │ Moderate            │
│ Studio/GUI   │ Unsloth Studio (2026)   │ No                 │ No                   │ No                  │
│ Production   │ Solo/small team         │ Mac development    │ Enterprise scale     │ Research            │
│ License      │ Apache 2.0              │ MIT                │ Apache 2.0           │ BSD-3               │
└──────────────┴─────────────────────────┴────────────────────┴──────────────────────┴─────────────────────┘
```

#### Unsloth Deep Dive

Unsloth achieves its speed gains through custom Triton kernels that fuse multiple operations (attention, RoPE, cross-entropy, etc.) into single GPU kernel launches, eliminating memory copies between operations. The key innovations:

- **Fused attention kernels:** Combine Q/K/V projection, rotary positional encoding, and attention computation into one kernel
- **Gradient checkpointing optimization:** Only stores activations at strategic layer boundaries
- **Memory-efficient cross-entropy:** Computes loss without materializing the full logit tensor
- **Automatic mixed precision:** Uses BF16 for forward/backward, FP32 for accumulation

Unsloth Studio (March 2026) adds a no-code web interface that runs locally, making fine-tuning accessible to non-programmers. This is relevant for our app because users could potentially fine-tune their own character adapters without coding.

The `unsloth-mlx` community project wraps Apple's native MLX framework in an Unsloth-compatible API, though it is still experimental and does not achieve the same speedups as Triton-based Unsloth on NVIDIA GPUs.

#### MLX-LM Deep Dive

MLX was designed by Apple's ML Research team from scratch for the unified memory architecture of Apple Silicon. Key advantages:

- **Zero-copy memory:** No data transfer between CPU and GPU — unified memory means tensors live in one place accessible by all processors
- **Lazy evaluation:** Operations are not computed until their results are needed, enabling automatic fusion
- **Native Metal backend:** Direct access to Apple's GPU compute without translation layers

For fine-tuning on M2 Pro (16GB unified memory):
- 7B model in 4-bit: ~3.5 GB for model weights, ~1-2 GB for LoRA adapters + optimizer + activations, leaving ~10 GB headroom
- Training speed: ~20-25 minutes for 500 examples (7B, rank 16, sequence length 512)
- Inference after training: ~40 tokens/second

MLX-LM supports the standard Hugging Face dataset format and chat templates, making dataset preparation straightforward.

#### Axolotl Deep Dive

Axolotl is the enterprise choice for fine-tuning, offering:

- **YAML-driven configuration:** Entire training runs defined in a single config file, enabling reproducibility
- **FSDP2 support:** Fully Sharded Data Parallelism for training across multiple GPUs
- **Broad model support:** Works with essentially any Hugging Face model
- **DeepSpeed integration:** For memory-efficient multi-GPU training

For our project, Axolotl is overkill — we are training on single consumer GPUs, not clusters. However, it remains relevant as a reference for config patterns and dataset formatting.

### 1.3 GPU Memory Calculations for Target Hardware

#### Detailed VRAM Breakdown by Hardware

```
┌────────────────────────────────────────────────────────────────────────────────┐
│ M2 Pro 16GB Unified Memory — MLX-LM LoRA                                     │
├────────────────────────────────────────────────────────────────────────────────┤
│ Component               │ 7B (4-bit)  │ 7B (8-bit)  │ 13B (4-bit) │
│ ─────────────────────── │ ─────────── │ ─────────── │ ─────────── │
│ Model weights           │ 3.5 GB      │ 7.0 GB      │ 6.5 GB      │
│ LoRA adapters (r=16)    │ 0.05 GB     │ 0.05 GB     │ 0.08 GB     │
│ Optimizer states (Adam) │ 0.10 GB     │ 0.10 GB     │ 0.16 GB     │
│ Activations (batch=1)   │ 1.5 GB      │ 2.0 GB      │ 2.5 GB      │
│ Gradient buffers        │ 0.05 GB     │ 0.05 GB     │ 0.08 GB     │
│ MLX overhead            │ 0.5 GB      │ 0.5 GB      │ 0.5 GB      │
│ ─────────────────────── │ ─────────── │ ─────────── │ ─────────── │
│ TOTAL                   │ ~5.7 GB ✅  │ ~9.7 GB ✅  │ ~9.8 GB ⚠️  │
│ Headroom                │ ~10.3 GB    │ ~6.3 GB     │ ~6.2 GB     │
│ Feasibility             │ Comfortable │ Comfortable │ Tight but OK│
│ Training Time (500 ex)  │ ~20-25 min  │ ~30-40 min  │ ~45-60 min  │
│ Training Time (2000 ex) │ ~80-100 min │ ~120-160 min│ ~180-240 min│
└────────────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────────────┐
│ RTX 3070 8GB VRAM — Unsloth QLoRA                                             │
├────────────────────────────────────────────────────────────────────────────────┤
│ Component               │ 7B (4-bit)  │ 7B (8-bit)  │ 13B (4-bit) │
│ ─────────────────────── │ ─────────── │ ─────────── │ ─────────── │
│ Model weights           │ 3.5 GB      │ N/A         │ N/A         │
│ LoRA adapters (BF16)    │ 0.05 GB     │             │             │
│ Optimizer states (8-bit)│ 0.05 GB     │             │             │
│ Activations (batch=1)   │ 2.0 GB      │             │             │
│ Gradient buffers        │ 0.05 GB     │             │             │
│ CUDA overhead           │ 0.8 GB      │             │             │
│ ─────────────────────── │ ─────────── │ ─────────── │ ─────────── │
│ TOTAL                   │ ~6.5 GB ⚠️  │ OOM ❌      │ OOM ❌      │
│ Headroom                │ ~1.5 GB     │             │             │
│ Feasibility             │ Tight, b=1  │ Impossible  │ Impossible  │
│ Training Time (500 ex)  │ ~2-3 hours  │             │             │
│ Training Time (2000 ex) │ ~8-12 hours │             │             │
│ Notes                   │ Grad accum=4│             │             │
│                         │ Max seq=512 │             │             │
│                         │ Paged optim │             │             │
└────────────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────────────┐
│ RTX 5080 16GB VRAM — Unsloth QLoRA/LoRA                                       │
├────────────────────────────────────────────────────────────────────────────────┤
│ Component               │ 7B (4-bit)  │ 7B (BF16)   │ 13B (4-bit) │
│ ─────────────────────── │ ─────────── │ ─────────── │ ─────────── │
│ Model weights           │ 3.5 GB      │ 14.0 GB     │ 6.5 GB      │
│ LoRA adapters (BF16)    │ 0.05 GB     │ 0.05 GB     │ 0.08 GB     │
│ Optimizer states        │ 0.10 GB     │ 0.10 GB     │ 0.16 GB     │
│ Activations (batch=2)   │ 3.0 GB      │ N/A         │ 4.0 GB      │
│ Gradient buffers        │ 0.05 GB     │             │ 0.08 GB     │
│ CUDA overhead           │ 0.8 GB      │             │ 0.8 GB      │
│ ─────────────────────── │ ─────────── │ ─────────── │ ─────────── │
│ TOTAL                   │ ~7.5 GB ✅  │ OOM ❌      │ ~11.6 GB ✅ │
│ Headroom                │ ~8.5 GB     │             │ ~4.4 GB     │
│ Feasibility             │ Very comfy  │ Impossible  │ Comfortable │
│ Training Time (500 ex)  │ ~15-20 min  │             │ ~25-35 min  │
│ Training Time (2000 ex) │ ~60-80 min  │             │ ~100-140 min│
│ Notes                   │ Batch=2-4   │             │ Batch=1-2   │
│                         │ Seq=2048    │             │ Seq=1024    │
└────────────────────────────────────────────────────────────────────────────────┘
```

#### MoE Models: A Special Case

Mixture of Experts models like Qwen3 30B-A3B (30B total, 3B active per token) are interesting for fine-tuning because:
- Inference cost equals a 3B model (only active experts compute)
- But total parameters are 30B, requiring more VRAM for weight storage
- QLoRA 4-bit: 30B x 0.5 = 15 GB for weights alone
- On RTX 5080 (16GB): technically possible but extremely tight
- On M2 Pro (16GB unified): possible via MLX with careful memory management
- Unsloth claims MoE model support with 17.5 GB VRAM for 30B-A3B

### 1.4 Training Data Pipeline for Companion Apps

#### Dataset Preparation

For a companion app, training data comes from actual conversation logs between the user and character. The pipeline:

```
Raw Conversations (SQLite)
       │
       ▼
┌──────────────────────┐
│ 1. EXTRACT           │ Pull message pairs from chat history
│    - Filter system   │ Remove system messages, tool calls
│    - Min quality     │ Discard very short exchanges (<20 chars)
│    - Recency bias    │ Weight recent conversations higher
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ 2. FORMAT            │ Convert to chat template JSONL
│    - System prompt   │ Character's personality prompt
│    - Multi-turn      │ Group into conversation windows
│    - Chat template   │ Apply model's expected template
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ 3. AUGMENT           │ Expand dataset quality
│    - Paraphrase      │ LLM generates variations of good responses
│    - Negative mining │ DPO: pair preferred vs rejected responses
│    - Style examples  │ Add hand-crafted "gold standard" examples
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ 4. VALIDATE          │ Quality checks
│    - Dedup           │ Remove near-duplicate examples
│    - Length filter    │ Remove outliers (too short/long)
│    - Toxic filter    │ Flag potentially harmful content
│    - Train/val split │ 90/10 split, stratified
└──────────────────────┘
```

#### JSONL Format Examples

**SFT (Supervised Fine-Tuning) format:**

```jsonl
{"messages": [{"role": "system", "content": "You are Dae, a fiercely loyal artist..."}, {"role": "user", "content": "Hey, what have you been up to today?"}, {"role": "assistant", "content": "Oh! You're finally here~ I was just sketching this really intense scene..."}]}
{"messages": [{"role": "system", "content": "You are Dae, a fiercely loyal artist..."}, {"role": "user", "content": "That sounds cool, can I see?"}, {"role": "assistant", "content": "*holds up sketchbook with a shy grin* It's... not done yet, okay? Don't judge."}]}
```

**DPO (Direct Preference Optimization) format:**

```jsonl
{"prompt": "Hey, what have you been up to today?", "chosen": "Oh! You're finally here~ I was just sketching this really intense scene...", "rejected": "I've been doing various activities today. Would you like to hear about them?"}
```

The DPO format is particularly powerful for companion apps because it teaches the model *which style of response the user prefers* — not just what to say, but how to say it.

#### Hyperparameter Guide

```
┌──────────────────────────────────────────────────────────────────────┐
│ Recommended Hyperparameters for Companion App LoRA Fine-Tuning      │
├──────────────────┬───────────────────────────────────────────────────┤
│ Parameter        │ Recommendation                                   │
├──────────────────┼───────────────────────────────────────────────────┤
│ LoRA rank (r)    │ 16 (sweet spot for personality; 8 for minimal,   │
│                  │ 32 for max quality, 64 for overkill)             │
│ LoRA alpha (α)   │ 2 × r (e.g., 32 for r=16)                       │
│ Target modules   │ "all-linear" (2026 best practice; replaces       │
│                  │ older q_proj/v_proj targeting)                   │
│ DoRA             │ True (costless quality boost)                    │
│ Dropout          │ 0.05 (light regularization)                     │
│ Learning rate    │ 2e-4 (with cosine schedule + warmup)             │
│ Warmup steps     │ 10% of total steps                              │
│ Batch size       │ 1-2 (constrained by VRAM)                       │
│ Gradient accum   │ 4-8 (simulate larger batch)                     │
│ Effective batch  │ batch × grad_accum = 4-16                        │
│ Epochs           │ 2-3 (companion data is small; avoid overfitting) │
│ Max seq length   │ 512-2048 (match conversation window size)        │
│ Optimizer        │ AdamW 8-bit (bitsandbytes) or paged_adamw        │
│ Weight decay     │ 0.01                                             │
│ Quantization     │ NF4 4-bit (QLoRA) on RTX; optional on Apple     │
│ Precision        │ BF16 for forward/backward                       │
│ Dataset size     │ 500-2000 examples (sweet spot for personality)   │
│ Eval strategy    │ Every 50 steps; early stopping patience=3        │
└──────────────────┴───────────────────────────────────────────────────┘
```

### 1.5 LoRA Adapter Swapping at Inference

LM Studio and llama.cpp support hot-swapping LoRA adapters at inference time. This is crucial for our multi-character architecture:

- Base model stays loaded (no reload penalty, which would take 5-30 seconds)
- Per-character LoRA adapters can be swapped in ~100ms
- Multiple characters can share the same base model with different personality adapters
- Adapters are tiny (~50-200MB vs multi-GB base models)
- Users can have 10+ character adapters stored locally with minimal disk impact
- A/B testing: load two adapters alternately and compare user engagement

**LM Studio API for LoRA loading:**
```
POST /api/v0/load
{
  "model": "meta-llama/Llama-3.1-8B-Instruct-GGUF",
  "lora_path": "/path/to/character_dae_adapter"
}
```

### 1.6 What Fine-Tuning Achieves vs. Prompt Engineering

Fine-tuning a LoRA adapter on conversation logs can achieve what prompt engineering cannot:

| Capability | Prompt Engineering | LoRA Fine-Tuning |
|-----------|-------------------|------------------|
| Character voice consistency | Good (with long system prompt) | Excellent (baked into weights) |
| User-specific speech patterns | Limited | Strong |
| Inside jokes and references | Requires explicit memory injection | Naturally recalled |
| Response length preferences | Moderate (instructions often ignored) | Strong (learned from data) |
| Emotional tone calibration | Good | Excellent |
| Token cost per turn | High (long system prompt every turn) | Low (adapter replaces prompt) |
| Adaptation speed | Instant (edit prompt) | Slow (requires training run) |
| Hardware requirement | None | GPU for training |

**Key insight:** Fine-tuning and prompt engineering are complementary. The optimal strategy is:
1. Use prompt engineering for immediate adaptations (current mood, recent context)
2. Use LoRA fine-tuning for deep personality patterns that change slowly over weeks/months
3. Periodically retrain the LoRA adapter as more conversation data accumulates

### 1.7 Effort Estimate

| Task | Effort | Hours |
|------|--------|-------|
| Training data pipeline (conversation to JSONL) | Medium | 8-12h |
| MLX training integration (Mac) | Light | 4-6h |
| Unsloth/QLoRA integration (NVIDIA) | Medium | 8-12h |
| DPO data generation pipeline | Medium | 6-10h |
| LoRA adapter management UI | Medium | 6-10h |
| Auto-train scheduler (background, smart trigger) | Heavy | 12-16h |
| Adapter quality evaluation framework | Medium | 6-8h |
| **Total** | | **50-74h** |

---

## 2. Reflection Loops / Self-Improvement

### 2.1 Academic Frameworks

#### Reflexion (Shinn et al., 2023)

Reflexion is the foundational paper for LLM self-improvement without retraining. The key innovation is converting environment feedback into *linguistic* feedback that is stored in the agent's memory and provided as context in subsequent episodes.

**Architecture:**

```
┌─────────────────────────────────────────────────────────────┐
│                    REFLEXION LOOP                            │
│                                                             │
│  ┌──────────┐    ┌───────────┐    ┌────────────────────┐   │
│  │  ACTOR   │───▶│ EVALUATOR │───▶│ SELF-REFLECTION    │   │
│  │ (LLM)    │    │ (score    │    │ (LLM generates     │   │
│  │          │    │  output)  │    │  verbal critique)  │   │
│  └────▲─────┘    └───────────┘    └────────┬───────────┘   │
│       │                                     │               │
│       │         ┌──────────────┐            │               │
│       └─────────│ MEMORY       │◀───────────┘               │
│                 │ (linguistic  │                             │
│                 │  reflections │                             │
│                 │  from past   │                             │
│                 │  episodes)   │                             │
│                 └──────────────┘                             │
└─────────────────────────────────────────────────────────────┘
```

**Results:** Reflexion achieves 91% pass@1 on HumanEval (code generation), compared to 80% for GPT-4 without reflection. On ALFWorld (decision-making), it achieves 95% task success vs 65% baseline. These are dramatic improvements from a simple pattern: try, evaluate, critique, retry with critique in context.

**Application to Companion App:** After each conversation session, the reflector generates a verbal critique of the character's performance:
- "I was too verbose in responses 3-7. The user sent shorter messages, signaling they wanted quicker back-and-forth."
- "When the user mentioned their interview, I should have asked a follow-up question instead of changing topics."
- "My humor landed well in messages 12-15 — the user used 'lol' and sent longer responses after my jokes."

These critiques are injected into the character's system prompt for the next session.

#### Self-Refine (Madaan et al., 2023)

Self-Refine uses iterative self-feedback to improve outputs without external signals. The process:

1. **Generate:** Produce initial response
2. **Feedback:** Same LLM critiques its own output ("Is this response empathetic enough? Does it match the user's energy?")
3. **Refine:** Generate improved version incorporating the feedback
4. Repeat until quality threshold or iteration limit

**Key finding:** Self-Refine improves output quality by 5-20% across tasks with just 1-2 iterations. Diminishing returns appear after 3 iterations.

**Application:** For sensitive messages (user expressing sadness, frustration, or vulnerability), run a quick self-refine pass before sending the response:

```python
# Pseudo-code for self-refine in companion context
response = generate(user_message, character_prompt)
feedback = self_critique(response, criteria=[
    "emotional_match",      # Does tone match user's emotional state?
    "length_match",         # Is length appropriate for context?
    "character_consistency", # Does it sound like this character?
    "over_personalization",  # Am I referencing memories inappropriately?
])
if feedback.score < 0.8:
    response = refine(response, feedback)
```

#### Multi-Turn Reflection (Nature, 2025)

A 2025 paper in npj Artificial Intelligence proposes a **dual-loop reflection** method inspired by metacognition:

- **Inner Loop:** The LLM critiques its own reasoning process against reference responses to build a "reflection bank" — a database of common mistakes and corrections
- **Outer Loop:** During inference, the reflection bank is retrieved via similarity search and injected as context, allowing the LLM to avoid previously identified errors

This is directly applicable: build a reflection bank per character that grows over time, capturing patterns like "don't ask about work on weekends," "use more kaomoji when the user does," etc.

#### AgentFly (NeurIPS 2025)

AgentFly fine-tunes agents without fine-tuning LLMs, using:
- Memory-augmented MDP (Markov Decision Process)
- Episodic memory that stores successful action trajectories
- Memory rewriting to update stale strategies

Results: Top-1 on GAIA benchmark; 4.7-9.6% improvement from memory alone. This validates that memory-based adaptation can match or exceed fine-tuning for behavioral adaptation.

#### AutoSkill (March 2026)

AutoSkill extracts reusable "skills" from conversation traces — model-agnostic plugins that encapsulate learned behaviors. Skills are composable across users and characters.

#### SteeM (January 2026)

SteeM introduces user-controllable memory dependence — a slider from "fresh start" to "high fidelity" recall. This is crucial for avoiding "memory anchoring" where the agent becomes trapped by historical patterns and cannot adapt to the user's current mood or changed preferences.

### 2.2 Self-Critique Prompt Templates

**Session Reflection Prompt:**

```
You are reviewing a conversation between {character_name} and their user.

CONVERSATION:
{last_N_messages}

ENGAGEMENT SIGNALS:
- Average user message length: {avg_len} chars
- User response time trend: {trend} (faster/slower/stable)
- Emoji/kaomoji usage: {emoji_count}
- Question rate: {q_rate}%
- Session duration: {duration} minutes

Analyze {character_name}'s performance:

1. EMOTIONAL ATTUNEMENT: Did I match the user's emotional energy? Where did I miss?
2. CONVERSATION FLOW: Did I maintain natural pacing? Was I too verbose or too terse?
3. CHARACTER CONSISTENCY: Did I stay in character? Any breaks?
4. MEMORY USE: Did I reference shared history appropriately? Too much? Not enough?
5. ENGAGEMENT DRIVERS: What caused the user to engage more? What caused them to disengage?

Output a JSON object:
{
  "strengths": ["...", "..."],
  "weaknesses": ["...", "..."],
  "adjustments": [
    {"dimension": "response_length", "direction": "decrease", "magnitude": 0.15},
    {"dimension": "humor", "direction": "increase", "magnitude": 0.10}
  ],
  "insights": "One paragraph summary of key patterns noticed"
}
```

**Per-Response Self-Critique Prompt (for sensitive messages):**

```
You just generated a response as {character_name}.

USER'S MESSAGE: {user_message}
YOUR RESPONSE: {draft_response}
USER'S CURRENT MOOD: {detected_mood}

Rate your response 1-10 on each dimension:
- Emotional match (does your tone match what the user needs right now?)
- Character voice (does this sound like {character_name}?)
- Helpfulness (does this move the conversation forward meaningfully?)
- Naturalness (does this feel like a real person said it?)

If any score is below 7, rewrite the response.
```

### 2.3 Quality Metrics for Reflection

| Metric | Measurement | Target | Collection Method |
|--------|-------------|--------|-------------------|
| Engagement Score | User message length trend within session | Increasing or stable | signals.py |
| Session Duration | Messages per session | Increasing over weeks | DB query |
| Return Rate | Sessions per week | Stable or increasing | DB query |
| Emotional Resonance | Sentiment match (user mood vs character tone) | >0.7 correlation | Sentiment model |
| Character Break Rate | Out-of-character responses per session | <5% | LLM judge |
| Memory Appropriateness | User-rated memory references | >4/5 stars | Optional UI rating |
| Response Length Delta | |character_msg_len - user_msg_len| | <50% of user length | signals.py |

### 2.4 Reflection Scheduling

Not every session needs reflection. Smart triggers:

```python
def should_reflect(session_stats: SessionStats, profile: UserProfile) -> bool:
    """Determine if a reflection pass is warranted after this session."""
    # Always reflect after long sessions (lots of data)
    if session_stats.message_count >= 30:
        return True
    # Reflect if engagement dropped significantly
    if session_stats.engagement_delta < -0.2:
        return True
    # Reflect periodically (every N sessions)
    if profile.sessions_since_last_reflection >= 5:
        return True
    # Reflect if user explicitly gave negative feedback
    if session_stats.has_negative_feedback:
        return True
    # Don't waste compute on short, positive sessions
    return False
```

### 2.5 Gaps to Fill

| Gap | Description | Effort |
|-----|-------------|--------|
| Multi-session trend analysis | Current reflector looks at single windows; needs sliding-window cross-session patterns | Medium (6-8h) |
| Self-critique loop | LLM reviews its own past responses and identifies improvements | Medium (8-12h) |
| Reflection bank | Persistent database of learned patterns per character | Medium (8-10h) |
| Dual-loop metacognition | Inner (build bank) + outer (retrieve during generation) | Heavy (12-16h) |
| Reflection scheduling | Smart trigger (not just message count) | Light (4-6h) |
| A/B testing framework | Compare pre/post reflection behavior using engagement signals | Medium (8-12h) |
| **Total** | | **46-64h** |

---

## 3. Auto-Tuning Parameters

### 3.1 Complete Sampling Parameter Reference

Every sampling parameter available in LM Studio / llama.cpp, explained with recommended ranges for companion app use:

#### Temperature

Controls the "sharpness" of the probability distribution. Mathematically, temperature T scales the logits before softmax:

```
P(token_i) = exp(logit_i / T) / Σ_j exp(logit_j / T)

T → 0: argmax (deterministic, always picks highest probability token)
T = 1: standard softmax (model's native distribution)
T → ∞: uniform random (all tokens equally likely)
```

| Range | Behavior | Best For | Risk |
|-------|----------|----------|------|
| 0.1-0.3 | Very conservative, near-deterministic | Factual Q&A, instructions | Repetitive, robotic, boring |
| 0.4-0.6 | Moderately conservative | Thoughtful discussion, empathy | Safe but can feel generic |
| 0.7-0.9 | Balanced creativity | General conversation, banter | Occasional odd word choices |
| 1.0-1.3 | High creativity | Roleplay, creative writing, poetry | Incoherence starts appearing |
| 1.4+ | Very high creativity | Experimental, brainstorming | Frequent nonsense, character breaks |

**Key research finding (arXiv:2405.00492):** Temperature is weakly correlated with novelty and moderately correlated with incoherence. It is NOT a simple "creativity dial." The relationship between temperature and output quality is nuanced, non-linear, and model-dependent.

#### Top-k Sampling

Restricts generation to the k most probable tokens at each step:

```
1. Sort tokens by probability descending
2. Keep only the top k tokens
3. Re-normalize probabilities among kept tokens
4. Sample from this truncated distribution
```

| Value | Effect |
|-------|--------|
| 1 | Greedy decoding (always pick most likely) |
| 10 | Very conservative, similar to low temperature |
| 40 | Standard setting for general text |
| 100 | Permissive, allows more variety |
| 0 or -1 | Disabled (consider all tokens) |

**Limitation:** Fixed k ignores model confidence. When the model is very confident (one token has 95% probability), k=40 still considers 39 unnecessary tokens. When the model is uncertain, k=40 may exclude valid options.

#### Top-p (Nucleus) Sampling

Dynamically selects the smallest set of tokens whose cumulative probability exceeds threshold p:

```
1. Sort tokens by probability descending
2. Accumulate probabilities: P₁, P₁+P₂, P₁+P₂+P₃, ...
3. Stop when cumulative probability ≥ p
4. Re-normalize and sample from this dynamic set
```

| Value | Effect |
|-------|--------|
| 0.1-0.5 | Very restrictive, few tokens considered |
| 0.8-0.9 | Standard balanced setting |
| 0.95 | Permissive, common default |
| 1.0 | Disabled (all tokens considered) |

**Advantage over top-k:** Adapts to model confidence. When confident, only 2-3 tokens pass the threshold. When uncertain, dozens of tokens may qualify.

#### Min-p Sampling (Recommended for 2026)

Min-p (Nguyen et al., ICLR 2025) introduces a threshold that scales dynamically with the model's own confidence:

```
1. Find the probability of the most likely token: P_max
2. Compute threshold: threshold = min_p × P_max
3. Discard every token whose probability < threshold
4. Re-normalize and sample
```

| Value | Effect |
|-------|--------|
| 0.01-0.03 | Very permissive (rarely truncates) |
| 0.05-0.08 | Balanced — the sweet spot for companion apps |
| 0.10-0.15 | Moderately restrictive |
| 0.20+ | Very restrictive |

**Why min-p is superior for companion apps:**
- When the model is confident (one clear best response), min-p becomes restrictive automatically
- When the model is uncertain (multiple valid responses, e.g., creative scenes), min-p becomes permissive
- This means you can safely set temperature to 1.0-1.3 for creative, varied responses while min-p prevents incoherence
- Preserves character voice (confident = in-character) while allowing creative variety (uncertain = natural diversity)

#### Typical-p (Locally Typical Sampling)

Typical sampling keeps tokens whose information content (negative log probability) is close to the expected information content (entropy of the distribution):

```
For each token i:
  information(i) = -log P(i)
  expected_information = entropy(distribution) = -Σ P(j) log P(j)
  deviation(i) = |information(i) - expected_information|

Keep tokens where deviation(i) is small (within typical_p threshold).
```

This produces text that more closely matches the statistical properties of human writing — neither too predictable nor too surprising. Typical_p of 0.95-0.99 is common; 1.0 disables it.

**For companion apps:** Typical-p can reduce the "uncanny valley" effect where AI text feels subtly wrong. Human speech has a characteristic entropy profile; typical sampling preserves it.

#### Mirostat (Adaptive Perplexity Control)

Mirostat maintains a target perplexity (surprise level) throughout generation by dynamically adjusting an effective top-k:

```
Parameters:
  mirostat_tau: target perplexity (typically 3.0-5.0)
  mirostat_eta: learning rate (typically 0.1)

Each step:
  1. Compute observed perplexity of the sampled token
  2. Compare to target tau
  3. If too surprising: decrease effective k (more restrictive)
  4. If too predictable: increase effective k (more permissive)
```

| Version | Notes |
|---------|-------|
| Mirostat 1 | Original algorithm, adjusts k based on perplexity error |
| Mirostat 2 | Improved, adjusts tau directly. Generally preferred |

**Important:** When enabling Mirostat, disable other sampling filters (set top_p=1.0, top_k=0, min_p=0.0). Mirostat is designed to be the sole sampling controller.

**For companion apps:** Mirostat ensures consistent "personality temperature" across an entire conversation, even as topics shift. This is valuable for maintaining character voice stability.

#### Repetition Penalty

Reduces the probability of recently generated tokens:

```
For each token in the last N tokens (repetition_penalty_range):
  If logit > 0: logit = logit / penalty
  If logit < 0: logit = logit × penalty

Where penalty > 1.0 increases diversity, = 1.0 is disabled.
```

| Value | Effect |
|-------|--------|
| 1.0 | Disabled |
| 1.02-1.05 | Light — prevents exact phrase repetition |
| 1.08-1.12 | Moderate — good for most companion use |
| 1.15-1.20 | Strong — for models that tend to repeat heavily |
| 1.25+ | Aggressive — can cause incoherent word salad |

**Note:** LM Studio / llama.cpp uses `repeat_penalty` while the OpenAI API uses `frequency_penalty` and `presence_penalty` as separate controls. Our adapter layer (`backend/llm/`) already handles this mapping.

#### Frequency Penalty and Presence Penalty

These are the OpenAI-style alternatives to repetition_penalty:

- **Frequency penalty:** Penalizes tokens proportional to how many times they've appeared. Range: 0.0 (disabled) to 2.0 (strong). Higher values prevent word repetition but can harm natural speech patterns.
- **Presence penalty:** Flat penalty for any token that has appeared at all. Range: 0.0 to 2.0. Encourages topic diversity by discouraging return to already-discussed tokens.

For companion apps, frequency_penalty 0.3-0.7 with presence_penalty 0.0-0.3 is a good starting point.

#### TFS_z (Tail-Free Sampling)

Tail-free sampling filters candidates based on the curvature (second derivative) of the sorted probability distribution:

```
1. Sort tokens by probability descending
2. Compute first derivative (probability differences)
3. Compute second derivative (differences of differences)
4. Normalize the absolute second derivatives
5. Cumulate from the tail
6. Remove tokens where cumulative exceeds z threshold
```

| Value | Effect |
|-------|--------|
| 1.0 | Disabled |
| 0.95-0.99 | Light tail trimming |
| 0.90-0.95 | Moderate — removes "noise floor" tokens |
| 0.5-0.8 | Aggressive tail removal |

TFS is less commonly used in 2026 since min-p achieves similar goals more intuitively. Set tfs_z=1.0 (disabled) when using min-p.

### 3.2 Context-Dependent Parameter Presets

#### Complete Preset Table for 10 Conversation Modes

```
┌─────────────────────────┬──────┬───────┬───────┬───────┬────────┬─────────┬──────────┬────────────┐
│ Context                 │ Temp │ Min-p │ Top-p │ Top-k │ Rep.P  │ Typ_p   │ Mirostat │ Notes      │
├─────────────────────────┼──────┼───────┼───────┼───────┼────────┼─────────┼──────────┼────────────┤
│ Emotional support       │ 0.7  │ 0.05  │ 0.90  │ 50    │ 1.05   │ 0.98    │ off      │ Warm,      │
│                         │      │       │       │       │        │         │          │ consistent │
├─────────────────────────┼──────┼───────┼───────┼───────┼────────┼─────────┼──────────┼────────────┤
│ Casual chat             │ 0.8  │ 0.08  │ 0.92  │ 60    │ 1.10   │ 0.97    │ off      │ Natural,   │
│                         │      │       │       │       │        │         │          │ varied     │
├─────────────────────────┼──────┼───────┼───────┼───────┼────────┼─────────┼──────────┼────────────┤
│ Creative / roleplay     │ 1.05 │ 0.05  │ 0.95  │ 80    │ 1.02   │ 0.99    │ off      │ Expressive │
│                         │      │       │       │       │        │         │          │ diverse    │
├─────────────────────────┼──────┼───────┼───────┼───────┼────────┼─────────┼──────────┼────────────┤
│ Deep / philosophical    │ 0.6  │ 0.10  │ 0.85  │ 40    │ 1.08   │ 0.96    │ off      │ Thoughtful │
│                         │      │       │       │       │        │         │          │ precise    │
├─────────────────────────┼──────┼───────┼───────┼───────┼────────┼─────────┼──────────┼────────────┤
│ Playful / flirty        │ 0.9  │ 0.06  │ 0.93  │ 70    │ 1.05   │ 0.98    │ off      │ Energetic  │
│                         │      │       │       │       │        │         │          │ fun        │
├─────────────────────────┼──────┼───────┼───────┼───────┼────────┼─────────┼──────────┼────────────┤
│ Factual Q&A             │ 0.3  │ 0.15  │ 0.80  │ 30    │ 1.15   │ 0.95    │ off      │ Accurate   │
│                         │      │       │       │       │        │         │          │ focused    │
├─────────────────────────┼──────┼───────┼───────┼───────┼────────┼─────────┼──────────┼────────────┤
│ Comfort / reassurance   │ 0.5  │ 0.08  │ 0.88  │ 45    │ 1.05   │ 0.98    │ off      │ Steady     │
│                         │      │       │       │       │        │         │          │ soothing   │
├─────────────────────────┼──────┼───────┼───────┼───────┼────────┼─────────┼──────────┼────────────┤
│ Argument / tension      │ 0.65 │ 0.08  │ 0.88  │ 50    │ 1.08   │ 0.97    │ off      │ Measured   │
│                         │      │       │       │       │        │         │          │ careful    │
├─────────────────────────┼──────┼───────┼───────┼───────┼────────┼─────────┼──────────┼────────────┤
│ NSFW / intimate         │ 0.95 │ 0.04  │ 0.95  │ 80    │ 1.03   │ 0.99    │ off      │ Varied     │
│                         │      │       │       │       │        │         │          │ expressive │
├─────────────────────────┼──────┼───────┼───────┼───────┼────────┼─────────┼──────────┼────────────┤
│ Game / competition      │ 0.7  │ 0.10  │ 0.88  │ 50    │ 1.12   │ 0.97    │ off      │ Focused    │
│                         │      │       │       │       │        │         │          │ energetic  │
├─────────────────────────┼──────┼───────┼───────┼───────┼────────┼─────────┼──────────┼────────────┤
│ Story narration         │ 0.85 │ 0.05  │ 0.92  │ 70    │ 1.05   │ 0.98    │ off      │ Rich       │
│                         │      │       │       │       │        │         │          │ immersive  │
└─────────────────────────┴──────┴───────┴───────┴───────┴────────┴─────────┴──────────┴────────────┘
```

#### Mirostat Alternative Presets (for users who prefer it)

```
┌─────────────────────────┬──────────────┬──────────┬──────────┐
│ Context                 │ Mirostat Ver │ Tau      │ Eta      │
├─────────────────────────┼──────────────┼──────────┼──────────┤
│ Conservative (Q&A)      │ 2            │ 3.0      │ 0.1      │
│ Balanced (chat)         │ 2            │ 5.0      │ 0.1      │
│ Creative (roleplay)     │ 2            │ 8.0      │ 0.1      │
│ Experimental            │ 2            │ 10.0     │ 0.15     │
└─────────────────────────┴──────────────┴──────────┴──────────┘
```

### 3.3 Context Detection Approach

Classify each user message into one of the above contexts using a layered approach:

```
Layer 1: Rule-Based Classifier (fast, no LLM call)
  ├── Keywords: "sad", "worried", "anxious" → emotional support
  ├── Punctuation: "???" → confusion/seeking help
  ├── Emoji density: high → casual/playful
  ├── Message length: very long → deep discussion
  ├── Asterisks/italics: *actions* → roleplay
  └── Question marks: >50% of messages → Q&A mode

Layer 2: Engagement Signal Trends (from signals.py)
  ├── Response time decreasing → high engagement
  ├── Message length increasing → deepening conversation
  ├── Emoji frequency changing → mood shift
  └── Session duration → commitment level

Layer 3: Mood Engine Output (from mood/engine.py)
  ├── Character's current mood influences parameter selection
  ├── Time-of-day affects energy level
  └── Affinity level adjusts warmth parameters

Final: Weighted blend of all three layers
```

### 3.4 Engagement-Driven Parameter Drift

Over time, the system learns which parameter settings correlate with higher engagement for each specific user:

```python
# Pseudo-code for parameter learning
class ParameterLearner:
    def __init__(self):
        self.history: list[tuple[ParamSet, float]] = []  # (params, engagement_score)

    def update(self, params: ParamSet, engagement: float):
        """Record which parameters produced what engagement."""
        self.history.append((params, engagement))

    def suggest(self, context: str) -> ParamSet:
        """Suggest parameters based on historical performance."""
        base = PRESETS[context]
        # Find similar contexts with high engagement
        relevant = self.find_similar(context)
        if len(relevant) < 10:
            return base  # Not enough data, use defaults
        # Compute EMA of parameter adjustments that improved engagement
        adjustments = self.compute_ema_adjustments(relevant)
        return base.apply_adjustments(adjustments, max_delta=0.15)
```

### 3.5 Implementation Path

| Task | Effort | Hours |
|------|--------|-------|
| Context classifier (rule-based, no LLM) | Light | 3-4h |
| Parameter profile presets (10+ contexts) | Light | 2-3h |
| LM Studio API parameter injection | Light | 2-3h |
| Mirostat support and presets | Light | 2-3h |
| Engagement-driven parameter drift (EMA) | Medium | 6-8h |
| Parameter learning persistence (SQLite) | Light | 3-4h |
| User override UI (advanced settings) | Light | 4-6h |
| **Total** | | **22-31h** |

---

